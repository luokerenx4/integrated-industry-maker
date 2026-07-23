import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { evaluateBlueprintBenchmark, hashValue, lockBlueprintBenchmark, openProjectWorkbenchSnapshot, simulateProjectOperation, stableStringify, type Blueprint } from "@inm/core";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");

test("Studio defaults to current compatible evidence instead of the newest unrelated run", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-compatible-run-"));
  const projectDir = join(root, "ironworks");
  await cp(ironworks, projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const current = await simulateProjectOperation(projectDir, {}, { seed: 42 });
  const unrelated = await simulateProjectOperation(projectDir, {
    world: "main", blueprint: "main", scenario: "machine-failure", objective: "default",
  }, { seed: 42 });
  const port = 47_000 + process.pid % 1_000;
  const child = Bun.spawn([
    process.execPath, join(repository, "packages/inm-studio/src/server.ts"), projectDir,
    "--port", String(port), "--no-open",
  ], { cwd: repository, stdout: "pipe", stderr: "pipe" });

  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (!output.includes("INM Studio:")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Studio stopped before startup: ${output}`);
      output += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();

    const defaultResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/data`);
    expect(defaultResponse.status).toBe(200);
    expect(await defaultResponse.json()).toEqual(expect.objectContaining({
      environment: null,
      selectedRun: current.data.run.id,
      selection: { world: "main", blueprint: "main", scenario: "baseline", objective: "default" },
    }));

    const explicitResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/data?run=${unrelated.data.run.id}`);
    expect(explicitResponse.status).toBe(200);
    expect(await explicitResponse.json()).toEqual(expect.objectContaining({
      selectedRun: unrelated.data.run.id,
      selection: { world: "main", blueprint: "main", scenario: "machine-failure", objective: "default" },
    }));
  } finally {
    child.kill();
    await child.exited;
  }
}, 30_000);

test("opening a project without runs does not write a Studio baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-readonly-"));
  const projectDir = join(root, "ironworks");
  await cp(ironworks, projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const outsideFile = join(root, "outside-project.txt");
  await writeFile(outsideFile, "outside");
  await symlink(outsideFile, join(projectDir, "linked-outside.txt"));
  const candidateBlueprintPath = join(projectDir, "blueprints/power-priority-candidate.blueprint.json");
  const candidateBlueprint = JSON.parse(await readFile(candidateBlueprintPath, "utf8")) as Blueprint;
  const protectedIds = new Set(["z-critical-assembler", "z-critical-link-loader", "z-critical-link-unloader"]);
  const candidatePatch = candidateBlueprint.devices.flatMap((device, index) => !protectedIds.has(device.id) ? [] : [device.policy ? {
    op: "add" as const, path: `/devices/${index}/policy/powerPriority`, value: 10,
  } : {
    op: "add" as const, path: `/devices/${index}/policy`, value: { powerPriority: 10 },
  }]);
  await mkdir(join(projectDir, "candidates"));
  await writeFile(join(projectDir, "candidates/protect-critical-line.candidate.json"), `${stableStringify({
    version: 1, id: "protect-critical-line", name: "Protect critical sorter line", benchmark: "power-priority",
    hypothesis: "Critical production and transport should preempt discretionary loads.",
    baseCandidateHash: hashValue(candidateBlueprint), patch: candidatePatch,
  }, 2)}\n`);
  const port = 48_000 + process.pid % 1_000;
  const child = Bun.spawn([
    process.execPath, join(repository, "packages/inm-studio/src/server.ts"), projectDir,
    "--port", String(port), "--no-open",
  ], { cwd: repository, stdout: "pipe", stderr: "pipe" });

  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (!output.includes("INM Studio:")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Studio stopped before startup: ${output}`);
      output += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();
    const response = await fetch(`http://localhost:${port}/api/projects/ironworks/data`);
    expect(response.status).toBe(200);
    const data = await response.json() as { selectedRun: string | null; runs: unknown[] };
    expect(data.selectedRun).toBeNull();
    expect(data.runs).toEqual([]);
    const escapedFile = await fetch(`http://localhost:${port}/api/projects/ironworks/files/linked-outside.txt`);
    expect(escapedFile.status).toBe(403);

    const overviewResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/overview?world=main&blueprint=main&scenario=baseline&objective=default`);
    expect(overviewResponse.status).toBe(200);
    expect(await overviewResponse.json()).toEqual(await openProjectWorkbenchSnapshot(projectDir, {
      world: "main", blueprint: "main", scenario: "baseline", objective: "default",
    }));
    const invalidOverview = await fetch(`http://localhost:${port}/api/projects/ironworks/overview?blueprint=missing-blueprint`);
    expect(invalidOverview.status).toBe(400);
    expect(await invalidOverview.json()).toEqual(expect.objectContaining({
      code: "studio.request-failed", error: expect.stringContaining("missing-blueprint.blueprint.json"),
    }));
    const overviewMethod = await fetch(`http://localhost:${port}/api/projects/ironworks/overview`, { method: "POST" });
    expect(overviewMethod.status).toBe(405);

    for (const operation of ["validate", "analyze", "plan"]) {
      const operationResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/operations/${operation}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selection: { world: "main", blueprint: "main", scenario: "baseline", objective: "default" } }),
      });
      expect(operationResponse.status).toBe(200);
      expect(await operationResponse.json()).toEqual(expect.objectContaining({
        version: 1, operation, effect: "read-only", status: "completed",
        context: expect.objectContaining({ selection: { world: "main", blueprint: "main", scenario: "baseline", objective: "default" } }),
        artifacts: [], writeSet: [], verification: expect.any(Array),
      }));
    }
    const operationMethod = await fetch(`http://localhost:${port}/api/projects/ironworks/operations/validate`);
    expect(operationMethod.status).toBe(405);

    const catalogResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments`);
    expect(catalogResponse.status).toBe(200);
    const catalog = await catalogResponse.json() as { experiments: Array<{ id: string; locked: boolean; cases: unknown[] }> };
    expect(catalog.experiments.map((experiment) => experiment.id)).toEqual([
      "autoresearch", "high-speed-transport", "power-priority", "power-satisfaction", "station-energy",
    ]);
    expect(catalog.experiments.every((experiment) => experiment.locked && experiment.cases.length > 0)).toBeTrue();

    const deepLink = await fetch(`http://localhost:${port}/ironworks/experiments/power-priority`);
    expect(deepLink.status).toBe(200);
    expect(deepLink.headers.get("content-type")).toContain("text/html");
    const candidateDeepLink = await fetch(`http://localhost:${port}/ironworks/experiments/power-priority/candidates/protect-critical-line`);
    expect(candidateDeepLink.status).toBe(200);
    for (const route of [
      "ironworks", "ironworks/factory", "ironworks/factory/devices/assembler-1", "ironworks/factory/connections/ore-line",
      "ironworks/runs", "ironworks/catalog", "ironworks/catalog/devices/smelter", "ironworks/analysis",
      "ironworks/designs",
      "ironworks/analysis/diagnostics/capacity.process%3Aprocess%3Asmelter",
    ]) {
      const routeResponse = await fetch(`http://localhost:${port}/${route}`);
      expect({ route, status: routeResponse.status, contentType: routeResponse.headers.get("content-type") }).toEqual({
        route, status: 200, contentType: expect.stringContaining("text/html"),
      });
    }

    const candidatesResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates`);
    expect(candidatesResponse.status).toBe(200);
    expect((await candidatesResponse.json() as { candidates: Array<{ id: string }> }).candidates.map((item) => item.id)).toEqual(["protect-critical-line"]);
    const proposedReview = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/review`);
    expect(await proposedReview.json()).toEqual({ state: "proposed", review: null });

    const expected = await evaluateBlueprintBenchmark(projectDir, "power-priority");
    const runResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`, { method: "POST" });
    expect(runResponse.status).toBe(200);
    const result = await runResponse.json() as {
      command: string;
      benchmark: string;
      verdict: string;
      scoreDelta: number;
      patch: unknown[];
      operation: { operation: string };
      cases: Array<{
        scoreDelta: number;
        scoreBreakdownDelta: Record<string, number>;
        baselineMetrics: { scoreBreakdown: Record<string, number> };
        candidateMetrics: { scoreBreakdown: Record<string, number> };
      }>;
    };
    expect(result).toEqual(expect.objectContaining({
      command: "benchmark", benchmark: expected.benchmark, verdict: expected.verdict,
      scoreDelta: expected.scoreDelta, patch: expected.patch,
    }));
    expect(result.operation.operation).toBe("benchmark.evaluate");
    expect(result.cases[0]).toEqual(expect.objectContaining({
      scoreBreakdownDelta: expect.objectContaining({ deliveryValue: expect.any(Number), wip: expect.any(Number) }),
      baselineMetrics: expect.objectContaining({ scoreBreakdown: expect.objectContaining({ deliveryValue: expect.any(Number) }) }),
      candidateMetrics: expect.objectContaining({ scoreBreakdown: expect.objectContaining({ deliveryValue: expect.any(Number) }) }),
    }));

    const beforePreview = await readFile(candidateBlueprintPath, "utf8");
    const previewResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`, { method: "POST" });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json() as { currentCandidateHash: string; proposedCandidateHash: string; result: { verdict: string }; operation: { operation: string; effect: string; artifacts: Array<{ kind: string }> } };
    expect(preview.result.verdict).toBe("KEEP");
    expect(preview.operation.operation).toBe("candidate.preview");
    expect(preview.operation.effect).toBe("creates-artifact");
    expect(preview.operation.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review" })]);
    expect(await readFile(candidateBlueprintPath, "utf8")).toBe(beforePreview);
    const recordedReview = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/review`);
    expect(await recordedReview.json()).toEqual(expect.objectContaining({
      state: "reviewed-keep", review: expect.objectContaining({ proposalHash: expect.any(String), result: expect.objectContaining({ verdict: "KEEP" }) }),
    }));

    const applyResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/apply`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preview),
    });
    expect(applyResponse.status).toBe(200);
    expect(await readFile(candidateBlueprintPath, "utf8")).not.toBe(beforePreview);
    const verifiedReview = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/review`);
    expect(await verifiedReview.json()).toEqual(expect.objectContaining({ state: "verified" }));
    const staleResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`, { method: "POST" });
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toEqual(expect.objectContaining({ code: "candidate.stale-base" }));

    const methodResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`);
    expect(methodResponse.status).toBe(405);
    expect(await methodResponse.json()).toEqual({ code: "studio.method-not-allowed", error: "Method not allowed" });
    expect(await Bun.file(join(projectDir, "runs")).exists()).toBeFalse();
  } finally {
    child.kill();
    await child.exited;
  }
}, 30_000);

test("Studio exposes the same memory-fab Design Program, immutable run, and guarded promotion contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-design-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes("design-runs") && !source.split("/").includes(".inm"),
  });
  const benchmarkPath = join(projectDir, "benchmarks/greenfield-dram-design.benchmark.json");
  const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
  delete benchmark.acceptance.outcomeGuardrails;
  await writeFile(benchmarkPath, `${JSON.stringify(benchmark, null, 2)}\n`);
  await lockBlueprintBenchmark(projectDir, "greenfield-dram-design");
  const invalidRunId = "a".repeat(64);
  const invalidRunPath = join(projectDir, "design-runs", "greenfield-dram-fab", invalidRunId);
  await mkdir(invalidRunPath, { recursive: true });
  await writeFile(join(invalidRunPath, "manifest.json"), "{}\n");
  await writeFile(join(invalidRunPath, "best.blueprint.json"), "{}\n");
  const seedPath = join(projectDir, "blueprints/experiment.blueprint.json");
  const generatedPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
  const commissioningTarget = JSON.parse(await readFile(join(projectDir, "blueprints/greenfield.blueprint.json"), "utf8"));
  commissioningTarget.revision = "memory-fab-generated-target-v1";
  await writeFile(generatedPath, `${JSON.stringify(commissioningTarget, null, 2)}\n`);
  const seedBefore = await readFile(seedPath, "utf8");
  const generatedBefore = await readFile(generatedPath, "utf8");
  const port = 49_000 + process.pid % 1_000;
  const child = Bun.spawn([
    process.execPath, join(repository, "packages/inm-studio/src/server.ts"), projectDir,
    "--port", String(port), "--no-open",
  ], { cwd: repository, stdout: "pipe", stderr: "pipe" });

  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (!output.includes("INM Studio:")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Studio stopped before startup: ${output}`);
      output += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();

    const listResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs`);
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      programs: [
        expect.objectContaining({ id: "commissioned-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, budget: { maxCandidates: 7 } }),
        expect.objectContaining({ id: "greenfield-dram-fab", locked: true, seed: { kind: "synthesis", inputBlueprint: "greenfield" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, budget: { maxCandidates: 7 } }),
        expect.objectContaining({ id: "integrated-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "experiment" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, budget: { maxCandidates: 7 } }),
      ],
      runs: [],
      invalidRuns: [{
        id: invalidRunId,
        path: invalidRunPath,
        program: "greenfield-dram-fab",
        code: "design.invalid-run",
        message: `Design run '${invalidRunId}' manifest identity or completion state is invalid`,
      }],
    });
    const programResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/integrated-dram-fab`);
    expect(programResponse.status).toBe(200);
    expect(await programResponse.json()).toEqual(expect.objectContaining({
      brief: expect.objectContaining({ program: expect.objectContaining({ id: "integrated-dram-fab", currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 } }), benchmark: expect.objectContaining({ cases: 5 }) }),
      runs: [],
      invalidRuns: [],
    }));
    const generatedProgramResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab`);
    expect(generatedProgramResponse.status).toBe(200);
    expect(await generatedProgramResponse.json()).toEqual(expect.objectContaining({
      brief: expect.objectContaining({
        program: expect.objectContaining({ seed: { kind: "synthesis", inputBlueprint: "greenfield" }, frontier: { maximumAlternativeBranches: 1 } }),
        seed: expect.objectContaining({ synthesis: expect.objectContaining({ method: "project-strategy", entry: "strategies/reentrant-dram-fab.ts" }) }),
        promotionBase: expect.objectContaining({ blueprint: "generated-dram-fab" }),
      }),
      runs: [],
      invalidRuns: [expect.objectContaining({ id: invalidRunId, code: "design.invalid-run" })],
    }));
    const campaignRunResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/run`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ maxCandidates: 7 }),
    });
    expect(campaignRunResponse.status).toBe(200);
    const campaignRecords = (await campaignRunResponse.text()).trim().split("\n").map((line) => JSON.parse(line));
    const campaignProgress = campaignRecords.filter((record) => record.type === "progress");
    expect(campaignProgress.filter((record) => record.progress.phase === "node-exhausted")).toHaveLength(0);
    expect(campaignProgress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
      phase: "proposal-completed", iteration: 7, strategy: "dispatch:inspection-earliest-due-date", addressedLoss: "queue-congestion",
    }) }));
    expect(campaignProgress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
      phase: "candidate-completed", iteration: 7, strategy: "dispatch:inspection-earliest-due-date", decision: "KEEP",
    }) }));
    const campaignResult = campaignRecords.find((record) => record.type === "result").result;
    const campaignRepairRunId = campaignResult.manifest.resultHash as string;
    expect(campaignResult.manifest).toMatchObject({
      budget: { maximum: 7, evaluated: 7 },
      best: { iteration: 7, candidateScore: -246.2328839484127, verdict: "KEEP" },
      frontier: {
        leader: "candidate-7",
        alternatives: [],
        scheduler: { searchOrder: ["candidate-7"], exhausted: [] },
        nodes: expect.any(Array),
      },
    });
    const campaignRepairResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${campaignRepairRunId}`);
    expect(campaignRepairResponse.status).toBe(200);
    expect(await campaignRepairResponse.json()).toEqual(expect.objectContaining({ manifest: expect.objectContaining({
      resultHash: campaignRepairRunId,
      iterations: expect.arrayContaining([expect.objectContaining({
        iteration: 7,
        strategy: "dispatch:inspection-earliest-due-date",
        addressedLoss: "queue-congestion",
        promotionBoundary: expect.objectContaining({ limitingCase: null, guardrail: expect.objectContaining({ passed: true, violations: [] }) }),
        decision: "KEEP",
        decisionEvidence: expect.objectContaining({ basis: "current-best-improvement", guardrail: expect.objectContaining({ passed: true, violations: [] }) }),
        frontierEvidence: expect.objectContaining({ parent: { nodeId: "candidate-4", role: "leader", depth: 2 }, leaderAfter: "candidate-7" }),
      })]),
    }) }));
    const continuationResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${campaignRepairRunId}/continue`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ maxCandidates: 1 }),
    });
    expect(continuationResponse.status).toBe(200);
    const continuationRecords = (await continuationResponse.text()).trim().split("\n").map((line) => JSON.parse(line));
    const continuationProgress = continuationRecords.filter((record) => record.type === "progress");
    expect(continuationProgress[0]).toEqual(expect.objectContaining({ progress: expect.objectContaining({
      version: 2,
      phase: "run-started",
      continuation: { sourceResultHash: campaignRepairRunId, reusedIterations: 7 },
      budget: { maximum: 8, previousEvaluated: 7, additional: 1 },
    }) }));
    expect(continuationProgress.filter((record) => record.progress.phase === "case-completed" && record.progress.evaluation.kind === "baseline")).toHaveLength(5);
    expect(continuationProgress.filter((record) => record.progress.phase === "case-completed" && record.progress.evaluation.kind === "seed")).toHaveLength(0);
    expect(continuationProgress.filter((record) => record.progress.phase === "case-completed" && record.progress.evaluation.kind === "candidate")).toHaveLength(0);
    expect(continuationProgress.filter((record) => record.progress.phase === "node-exhausted")).toEqual([
      expect.objectContaining({ progress: expect.objectContaining({
        exhaustion: expect.objectContaining({ sequence: 1, node: expect.objectContaining({ nodeId: "candidate-7" }), beforeIteration: 8, nextNodeId: null }),
      }) }),
    ]);
    const continuationResult = continuationRecords.find((record) => record.type === "result").result;
    expect(continuationResult.manifest).toMatchObject({
      continuation: { sourceResultHash: campaignRepairRunId, reusedIterations: 7, reusedExhaustions: 0, additionalCandidateBudget: 1 },
      budget: { maximum: 8, evaluated: 7 },
      best: { iteration: 7, verdict: "KEEP" },
      iterations: campaignResult.manifest.iterations,
      frontier: {
        leader: "candidate-7",
        alternatives: [],
        scheduler: { searchOrder: [], exhausted: ["candidate-7"] },
      },
      exhaustions: [expect.objectContaining({ sequence: 1, beforeIteration: 8, nextNodeId: null })],
      stopReason: "frontier-exhausted",
    });
    const continuedRunId = continuationResult.manifest.resultHash as string;
    expect(continuedRunId).not.toBe(campaignRepairRunId);
    const unchangedSourceResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${campaignRepairRunId}`);
    expect((await unchangedSourceResponse.json()).manifest).toEqual(campaignResult.manifest);

    const commissionedCandidate = "studio-commissioned-greenfield-fab";
    const commissioningResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${continuedRunId}/promote`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateId: commissionedCandidate }),
    });
    expect(commissioningResponse.status).toBe(200);
    expect(await commissioningResponse.json()).toEqual(expect.objectContaining({
      candidate: expect.objectContaining({
        id: commissionedCandidate,
        benchmark: "greenfield-dram-design",
        source: { kind: "design-run", program: "greenfield-dram-fab", resultHash: continuedRunId, blueprintHash: continuationResult.manifest.best.blueprintHash },
      }),
    }));
    expect(await readFile(generatedPath, "utf8")).toBe(generatedBefore);

    const commissioningPreviewResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/experiments/greenfield-dram-design/candidates/${commissionedCandidate}/preview`, { method: "POST" });
    expect(commissioningPreviewResponse.status).toBe(200);
    const commissioningPreview = await commissioningPreviewResponse.json() as {
      proposalHash: string;
      currentCandidateHash: string;
      proposedCandidateHash: string;
      result: { verdict: string };
      operation: { operation: string; effect: string; context: { hashes: { blueprintHash: string } } };
    };
    expect(commissioningPreview).toEqual(expect.objectContaining({
      result: expect.objectContaining({ verdict: "KEEP" }),
      operation: expect.objectContaining({ operation: "candidate.preview", effect: "creates-artifact" }),
    }));
    expect(commissioningPreview.operation.context.hashes.blueprintHash).toBe(commissioningPreview.proposedCandidateHash);
    expect(await readFile(generatedPath, "utf8")).toBe(generatedBefore);

    const commissioningApplyResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/experiments/greenfield-dram-design/candidates/${commissionedCandidate}/apply`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(commissioningPreview),
    });
    expect(commissioningApplyResponse.status).toBe(200);
    expect(await commissioningApplyResponse.json()).toEqual(expect.objectContaining({
      applied: true,
      proposedCandidateHash: commissioningPreview.proposedCandidateHash,
      operation: expect.objectContaining({ operation: "candidate.apply", effect: "mutates-blueprint" }),
    }));
    expect(hashValue(JSON.parse(await readFile(generatedPath, "utf8")))).toBe(commissioningPreview.proposedCandidateHash);
    const commissionedReview = await fetch(`http://localhost:${port}/api/projects/memory-fab/experiments/greenfield-dram-design/candidates/${commissionedCandidate}/review`);
    expect(await commissionedReview.json()).toEqual(expect.objectContaining({ state: "verified" }));

    const commissionedValidation = await fetch(`http://localhost:${port}/api/projects/memory-fab/operations/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selection: { world: "cleanroom", blueprint: "generated-dram-fab", scenario: "production-window", objective: "dram-output" } }),
    });
    expect(commissionedValidation.status).toBe(200);
    expect(await commissionedValidation.json()).toEqual(expect.objectContaining({
      operation: "validate",
      context: expect.objectContaining({ hashes: expect.objectContaining({ blueprintHash: commissioningPreview.proposedCandidateHash }) }),
      data: expect.objectContaining({ valid: true, devices: 56, connections: 16 }),
    }));
    const deepLink = await fetch(`http://localhost:${port}/memory-fab/designs/integrated-dram-fab`);
    expect({ status: deepLink.status, contentType: deepLink.headers.get("content-type") }).toEqual({ status: 200, contentType: expect.stringContaining("text/html") });

    const invalidRun = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/integrated-dram-fab/run`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxCandidates: 0 }),
    });
    expect(invalidRun.status).toBe(400);

    const streamingFailure = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/missing-program/run`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ maxCandidates: 1 }),
    });
    expect(streamingFailure.status).toBe(200);
    expect((await streamingFailure.text()).trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ version: 1, type: "error", error: expect.objectContaining({ code: "studio.request-failed" }) }),
    ]);

    const runResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/integrated-dram-fab/run`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ maxCandidates: 1 }),
    });
    expect(runResponse.status).toBe(200);
    expect(runResponse.headers.get("content-type")).toContain("application/x-ndjson");
    const records = (await runResponse.text()).trim().split("\n").map((line) => JSON.parse(line));
    const progress = records.filter((record) => record.type === "progress");
    expect(progress[0]).toEqual(expect.objectContaining({ version: 1, progress: expect.objectContaining({ phase: "run-started", sequence: 1 }) }));
    expect(progress.filter((record) => record.progress.phase === "case-completed" && record.progress.evaluation.kind === "baseline")).toHaveLength(5);
    expect(progress.filter((record) => record.progress.phase === "case-completed" && record.progress.evaluation.kind === "candidate")).toHaveLength(5);
    expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
      phase: "proposal-started",
      branch: { nodeId: "seed", role: "leader", depth: 0, leaderNodeId: "seed" },
      promotionBoundary: expect.objectContaining({
        leaderNodeId: "seed",
        selectedNodeId: "seed",
        promotable: true,
        limitingCase: null,
        guardrail: expect.objectContaining({ passed: true, violations: [] }),
        cases: expect.arrayContaining([expect.objectContaining({
          leaderScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
          selectedScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
          scoreBreakdownDelta: expect.objectContaining({ wip: expect.any(Number) }),
        })]),
      }),
      driverEvidence: expect.objectContaining({ metricsHash: expect.any(String), fabLoss: expect.objectContaining({ primary: expect.objectContaining({ id: "yield-quality" }) }) }),
    }) }));
    expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({ phase: "proposal-completed", addressedLoss: "yield-quality" }) }));
    expect(progress).toContainEqual(expect.objectContaining({ progress: expect.objectContaining({
      phase: "candidate-completed",
      frontierEvidence: expect.objectContaining({ parent: { nodeId: "seed", role: "leader", depth: 0 }, candidateNodeId: "candidate-1", leaderAfter: expect.any(String), searchOrderAfter: expect.any(Array), exhaustedAfter: expect.any(Array) }),
      decisionEvidence: expect.objectContaining({
        basis: expect.stringMatching(/current-best-improvement|benchmark-gate|no-current-best-improvement|current-best-case-guardrail/),
        aggregate: expect.objectContaining({ scoreDelta: expect.any(Number) }),
        cases: expect.arrayContaining([expect.objectContaining({
          id: "mixed-quality",
          scoreDelta: expect.any(Number),
          previousBestScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
          candidateScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
          scoreBreakdownDelta: expect.objectContaining({ wip: expect.any(Number) }),
          maximumScoreRegression: 0,
          guardrailPassed: expect.any(Boolean),
        })]),
        guardrail: expect.objectContaining({ kind: "uniform", passed: expect.any(Boolean), violations: expect.any(Array) }),
        limitingCase: expect.any(String),
      }),
    }) }));
    expect(progress.at(-1)).toEqual(expect.objectContaining({ progress: expect.objectContaining({ phase: "run-completed", work: { completedSimulations: 15, plannedSimulations: 15 } }) }));
    const resultRecord = records.find((record) => record.type === "result");
    expect(resultRecord).toBeDefined();
    const run = resultRecord.result as { manifest: { resultHash: string; best: { iteration: number; verdict: string; promotionPatchOperations: number }; budget: { maximum: number; evaluated: number }; exhaustions: unknown[]; iterations: Array<{ addressedLoss?: string; promotionBoundary: { promotable: boolean }; driverEvidence: { metricsHash: string; fabLoss: { chain: string[] } | null }; decisionEvidence: { limitingCase: string } }> }; artifact: { id: string; created: boolean } };
    expect(run).toEqual(expect.objectContaining({
      manifest: expect.objectContaining({
        budget: { maximum: 1, evaluated: 1 },
        frontier: expect.objectContaining({ leader: expect.any(String), alternatives: expect.any(Array), scheduler: { searchOrder: expect.any(Array), exhausted: [] }, nodes: expect.any(Array) }),
        exhaustions: [],
        iterations: [expect.objectContaining({
          addressedLoss: "yield-quality",
          promotionBoundary: expect.objectContaining({ leaderNodeId: "seed", selectedNodeId: "seed", promotable: true, limitingCase: null }),
          driverEvidence: expect.objectContaining({ fabLoss: expect.objectContaining({ chain: expect.arrayContaining(["yield-quality"]) }) }),
          decisionEvidence: expect.objectContaining({ limitingCase: expect.any(String), guardrail: expect.objectContaining({ kind: "uniform", passed: expect.any(Boolean) }), cases: expect.arrayContaining([expect.objectContaining({
            id: "mixed-quality",
            scoreDelta: expect.any(Number),
            previousBestScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
            candidateScoreBreakdown: expect.objectContaining({ wip: expect.any(Number) }),
            scoreBreakdownDelta: expect.objectContaining({ wip: expect.any(Number) }),
            maximumScoreRegression: 0,
            guardrailPassed: expect.any(Boolean),
          })]) }),
          frontierEvidence: expect.objectContaining({ parent: { nodeId: "seed", role: "leader", depth: 0 }, candidateNodeId: "candidate-1" }),
        })],
      }),
      artifact: expect.objectContaining({ id: run.manifest.resultHash, created: true }),
    }));
    const reopened = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/integrated-dram-fab/runs/${run.manifest.resultHash}`);
    expect(reopened.status).toBe(200);
    expect(await reopened.json()).toEqual(expect.objectContaining({ manifest: expect.objectContaining({
      resultHash: run.manifest.resultHash,
      iterations: [expect.objectContaining({ addressedLoss: "yield-quality", promotionBoundary: expect.objectContaining({ promotable: true, limitingCase: null }), driverEvidence: expect.objectContaining({ metricsHash: expect.any(String) }), decisionEvidence: expect.objectContaining({ limitingCase: expect.any(String) }) })],
    }) }));
    const promotion = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/integrated-dram-fab/runs/${run.manifest.resultHash}/promote`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateId: "studio-leading-design" }),
    });
    const promotable = run.manifest.best.verdict === "KEEP" && run.manifest.best.promotionPatchOperations > 0;
    expect(promotion.status).toBe(promotable ? 200 : 400);
    if (!promotable) expect(await promotion.json()).toEqual(expect.objectContaining({ code: expect.stringMatching(/design\.(no-leading-candidate|no-accepted-design)/) }));
    expect(await readFile(seedPath, "utf8")).toBe(seedBefore);
  } finally {
    child.kill();
    await child.exited;
  }
}, 240_000);
