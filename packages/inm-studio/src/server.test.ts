import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { evaluateBlueprintBenchmark, hashValue, lockBlueprintBenchmark, openFactoryObservationBrief, openProjectWorkbenchSnapshot, simulateProjectOperation, stableStringify, type Blueprint } from "@inm/core";
import { isTerminalOperationExecution, type OperationExecutionSnapshot, type OperationExecutionStartResponse } from "@inm/core";

const repository = resolve(import.meta.dir, "../../..");
const ironworks = join(repository, "examples/ironworks");

async function terminalStudioOperation<TResult>(
  port: number,
  projectId: string,
  response: Response,
): Promise<OperationExecutionSnapshot<TResult>> {
  expect([200, 202]).toContain(response.status);
  const started = await response.json() as OperationExecutionStartResponse<TResult>;
  expect(started.operation.id).toMatch(/^[0-9a-z-]{12,80}$/);
  for (let attempt = 0; attempt < 2_000; attempt++) {
    const current = await fetch(
      `http://localhost:${port}/api/projects/${encodeURIComponent(projectId)}/operations/${encodeURIComponent(started.operation.id)}`,
    );
    expect(current.status).toBe(200);
    const snapshot = (await current.json() as { operation: OperationExecutionSnapshot<TResult> }).operation;
    if (isTerminalOperationExecution(snapshot.status)) return snapshot;
    await Bun.sleep(10);
  }
  throw new Error(`Studio operation '${started.operation.id}' did not complete`);
}

async function completedStudioOperation<TResult>(
  port: number,
  projectId: string,
  response: Response,
): Promise<OperationExecutionSnapshot<TResult>> {
  const snapshot = await terminalStudioOperation<TResult>(port, projectId, response);
  if (snapshot.status !== "completed") throw new Error(`${snapshot.error?.code}: ${snapshot.error?.message}`);
  return snapshot;
}

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
    const defaultData = await defaultResponse.json() as { selectedRun: string | null; selection: Record<string, string>; runs: Array<{ name: string }> };
    expect(defaultData).toEqual(expect.objectContaining({
      environment: null,
      selectedRun: current.data.run.id,
      selection: { world: "main", blueprint: "main", scenario: "baseline", objective: "default" },
    }));
    expect(defaultData.runs.map((run) => run.name)).toEqual([current.data.run.id]);

    const explicitResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/data?run=${unrelated.data.run.id}`);
    expect(explicitResponse.status).toBe(200);
    const explicitData = await explicitResponse.json() as { selectedRun: string | null; selection: Record<string, string>; runs: Array<{ name: string }> };
    expect(explicitData).toEqual(expect.objectContaining({
      selectedRun: unrelated.data.run.id,
      selection: { world: "main", blueprint: "main", scenario: "machine-failure", objective: "default" },
    }));
    expect(explicitData.runs.map((run) => run.name)).toEqual([unrelated.data.run.id]);
  } finally {
    child.kill();
    await child.exited;
  }
}, 30_000);

test("Studio reopens the recorded memory-fab revision handoff without evaluation", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-revision-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const port = 47_500 + process.pid % 500;
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
    const response = await fetch(
      `http://localhost:${port}/api/projects/memory-fab/experiments/greenfield-dram-design/candidates/back-end-wip-conwip-5-4/review`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      state: "reviewed-discard",
      review: expect.objectContaining({
        revisionBrief: expect.objectContaining({
          disposition: "revise-or-retire",
          decisionOwner: "human-or-agent",
          guardrailRegressions: [
            expect.objectContaining({ caseId: "steady-production", metric: "onTimeLots" }),
            expect.objectContaining({ caseId: "lithography-interruption", metric: "onTimeLots" }),
            expect.objectContaining({ caseId: "facility-interruption", metric: "onTimeLots" }),
          ],
          caseRegressions: [expect.objectContaining({ caseId: "lithography-interruption" })],
          patchPaths: ["/policies/lotRelease/maximumWip", "/policies/lotRelease/reopenAtWip"],
        }),
      }),
    }));
  } finally {
    child.kill();
    await child.exited;
  }
});

test("Studio projects authored adaptive cadence control and measured mode use from one run", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-cadence-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const sourcePath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
  const blueprint = JSON.parse(await readFile(sourcePath, "utf8"));
  const deposition = blueprint.devices.find((device: { id: string }) => device.id === "deposition-1");
  const normal = structuredClone(deposition.recipe
    ?? deposition.recipes?.find((recipe: { process: string; mode: string }) =>
      recipe.process === "deposit-dielectric-stack" && recipe.mode === "qualified"));
  if (!normal) throw new Error("Missing qualified deposition recipe");
  delete deposition.recipe;
  deposition.recipes = [normal, { ...structuredClone(normal), mode: "agile-pulse" }];
  deposition.policy.cadenceControl = {
    kind: "downstream-coverage-recovery",
    process: "deposit-dielectric-stack",
    normalMode: "qualified",
    recoveryMode: "agile-pulse",
    downstreamConnection: "deposition-to-batch-furnace",
    recoverBelowItems: 1,
    minimumCoverageDeficitTicks: 1,
  };
  await writeFile(join(projectDir, "blueprints/cadence.blueprint.json"), `${JSON.stringify(blueprint, null, 2)}\n`);
  await writeFile(sourcePath, `${JSON.stringify(blueprint, null, 2)}\n`);
  await writeFile(join(projectDir, "blueprints/experiment.blueprint.json"), `${JSON.stringify(blueprint, null, 2)}\n`);
  const run = await simulateProjectOperation(projectDir, { blueprint: "cadence" }, { seed: 42 });
  const port = 46_000 + process.pid % 1_000;
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
    const response = await fetch(`http://localhost:${port}/api/projects/memory-fab/data?run=${run.data.run.id}`);
    expect(response.status).toBe(200);
    const data = await response.json() as {
      devices: Array<{ id: string; cadenceControl?: Record<string, unknown> }>;
      metrics: { cadenceControl: { devices: Record<string, { normalJobs: number; recoveryJobs: number }> } };
    };
    expect(data.devices.find((device) => device.id === "deposition-1")?.cadenceControl).toEqual({
      kind: "downstream-coverage-recovery",
      process: "deposit-dielectric-stack",
      normalMode: "qualified",
      recoveryMode: "agile-pulse",
      downstreamConnection: "deposition-to-batch-furnace",
      recoverBelowItems: 1,
      minimumCoverageDeficitTicks: 1,
    });
    expect(data.metrics.cadenceControl.devices["deposition-1"]!.normalJobs).toBeGreaterThan(0);
    expect(data.metrics.cadenceControl.devices["deposition-1"]!.recoveryJobs).toBeGreaterThan(0);
    const benchmarkResponse = await fetch(
      `http://localhost:${port}/api/projects/memory-fab/experiments/dispatch-research/run`,
      { method: "POST" },
    );
    const benchmark = (await completedStudioOperation<{
      cases: Array<{
        baselineMetrics: { cadenceControl: { devices: Record<string, unknown> } };
        candidateMetrics: { cadenceControl: { devices: Record<string, { normalJobs: number; recoveryJobs: number }> } };
      }>;
    }>(port, "memory-fab", benchmarkResponse)).result!;
    expect(benchmark.cases.every((item) => Object.keys(item.baselineMetrics.cadenceControl.devices).length === 0)).toBeTrue();
    expect(benchmark.cases.every((item) => item.candidateMetrics.cadenceControl.devices["deposition-1"] !== undefined)).toBeTrue();
    expect(benchmark.cases.some((item) => item.candidateMetrics.cadenceControl.devices["deposition-1"]!.recoveryJobs > 0)).toBeTrue();
  } finally {
    child.kill();
    await child.exited;
  }
}, 60_000);

test("Studio file watching uses WebSockets without occupying project API connections", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-studio-websocket-watch-"));
  const projectDir = join(root, "ironworks");
  await cp(ironworks, projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const port = 49_000 + process.pid % 1_000;
  const child = Bun.spawn([
    process.execPath, join(repository, "packages/inm-studio/src/server.ts"), projectDir,
    "--port", String(port), "--no-open",
  ], { cwd: repository, stdout: "pipe", stderr: "pipe" });
  const sockets: WebSocket[] = [];

  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (!output.includes("INM Studio:")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`Studio stopped before startup: ${output}`);
      output += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();

    for (let index = 0; index < 8; index++) sockets.push(new WebSocket(`ws://localhost:${port}/api/watch`));
    await Promise.race([
      Promise.all(sockets.map((socket) => new Promise<void>((resolveOpen, rejectOpen) => {
        socket.addEventListener("open", () => resolveOpen(), { once: true });
        socket.addEventListener("error", () => rejectOpen(new Error("Studio watch WebSocket failed to open")), { once: true });
      }))),
      Bun.sleep(5_000).then(() => { throw new Error("Studio watch WebSockets did not open"); }),
    ]);

    const response = await Promise.race([
      fetch(`http://localhost:${port}/api/projects/ironworks/data`),
      Bun.sleep(5_000).then(() => { throw new Error("Studio project API was blocked by watch connections"); }),
    ]);
    expect(response.status).toBe(200);

    const refreshes = sockets.map((socket) => new Promise<string>((resolveMessage) => {
      socket.addEventListener("message", (event) => resolveMessage(String(event.data)), { once: true });
    }));
    await writeFile(join(projectDir, "watch-probe.txt"), "refresh\n");
    expect(await Promise.race([
      Promise.all(refreshes),
      Bun.sleep(5_000).then(() => { throw new Error("Studio watch refresh was not published"); }),
    ])).toEqual(Array.from({ length: 8 }, () => "refresh"));
  } finally {
    for (const socket of sockets) socket.close();
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

    const observationResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/observation?world=main&blueprint=main&scenario=baseline&objective=default`);
    expect(observationResponse.status).toBe(200);
    expect(await observationResponse.json()).toEqual(await openFactoryObservationBrief(projectDir, {
      world: "main", blueprint: "main", scenario: "baseline", objective: "default",
    }));
    const observationMethod = await fetch(`http://localhost:${port}/api/projects/ironworks/observation`, { method: "POST" });
    expect(observationMethod.status).toBe(405);

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
    const runOperation = await completedStudioOperation<{
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
    }>(port, "ironworks", runResponse);
    const result = runOperation.result!;
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
    const streamedRunResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/run`, {
      method: "POST",
    });
    const streamedRunOperation = await completedStudioOperation<typeof result>(port, "ironworks", streamedRunResponse);
    expect(streamedRunOperation.progressLog).toHaveLength(4);
    expect(streamedRunOperation.progressLog[0]).toEqual(expect.objectContaining({
      version: 3, sequence: 1, work: { completed: 0, total: 2 },
      execution: { mode: "isolated", concurrency: 1 },
    }));
    expect(streamedRunOperation.progressLog.every((item) =>
      "execution" in item && item.execution.mode === "isolated" && item.execution.concurrency === 1)).toBeTrue();
    expect(streamedRunOperation.result).toEqual(expect.objectContaining({
      command: "benchmark", benchmark: "power-priority", verdict: expected.verdict,
    }));
    const retainedOperations = await fetch(`http://localhost:${port}/api/projects/ironworks/operations`);
    const retainedOperationList = (await retainedOperations.json() as {
      operations: Array<Record<string, unknown> & { id: string; progressEvents: number; resultAvailable: boolean }>;
    }).operations;
    expect(retainedOperationList[0]).toEqual(expect.objectContaining({
      id: streamedRunOperation.id,
      progressEvents: 4,
      resultAvailable: true,
    }));
    expect(retainedOperationList[0]).not.toHaveProperty("result");
    expect(retainedOperationList[0]).not.toHaveProperty("progressLog");

    const beforePreview = await readFile(candidateBlueprintPath, "utf8");
    const streamedPreviewResponse = await fetch(
      `http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`,
      { method: "POST" },
    );
    const streamedPreviewOperation = await completedStudioOperation<{
      command: "candidate"; action: "preview"; result: { verdict: string };
    }>(port, "ironworks", streamedPreviewResponse);
    expect(streamedPreviewOperation.progressLog).toHaveLength(6);
    expect(streamedPreviewOperation.progressLog.map((item) => item.phase)).toEqual([
      "baseline-case-started",
      "baseline-case-completed",
      "current-case-started",
      "current-case-completed",
      "candidate-case-started",
      "candidate-case-completed",
    ]);
    expect(streamedPreviewOperation.progressLog.at(-1)).toEqual(expect.objectContaining({
      sequence: 6,
      work: { completed: 3, total: 3 },
    }));
    expect(streamedPreviewOperation.progressLog.every((item) =>
      "execution" in item && item.execution.mode === "isolated" && item.execution.concurrency === 1)).toBeTrue();
    expect(streamedPreviewOperation.result).toEqual(expect.objectContaining({
      command: "candidate", action: "preview", result: expect.objectContaining({ verdict: "KEEP" }),
    }));
    expect(await readFile(candidateBlueprintPath, "utf8")).toBe(beforePreview);
    const previewResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`, { method: "POST" });
    const preview = (await completedStudioOperation<{
      currentCandidateHash: string; proposedCandidateHash: string;
      currentFactory: { verdict: string; currentBlueprintHash: string; proposedBlueprintHash: string };
      result: { verdict: string };
      operation: { operation: string; effect: string; artifacts: Array<{ kind: string }> };
    }>(port, "ironworks", previewResponse)).result!;
    expect(preview.result.verdict).toBe("KEEP");
    expect(preview.currentFactory).toEqual(expect.objectContaining({
      verdict: "IMPROVED",
      currentBlueprintHash: preview.currentCandidateHash,
      proposedBlueprintHash: preview.proposedCandidateHash,
    }));
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
    const applyOperation = await completedStudioOperation<{
      applied: boolean;
      operation: { operation: string; effect: string };
    }>(port, "ironworks", applyResponse);
    expect(applyOperation).toEqual(expect.objectContaining({
      kind: "candidate-apply",
      artifacts: [expect.objectContaining({ kind: "blueprint", immutable: false })],
      result: expect.objectContaining({
        applied: true,
        operation: expect.objectContaining({ operation: "candidate.apply", effect: "mutates-blueprint" }),
      }),
    }));
    expect(await readFile(candidateBlueprintPath, "utf8")).not.toBe(beforePreview);
    const verifiedReview = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/review`);
    expect(await verifiedReview.json()).toEqual(expect.objectContaining({ state: "verified" }));
    const staleResponse = await fetch(`http://localhost:${port}/api/projects/ironworks/experiments/power-priority/candidates/protect-critical-line/preview`, { method: "POST" });
    const staleOperation = await terminalStudioOperation(port, "ironworks", staleResponse);
    expect(staleOperation).toEqual(expect.objectContaining({
      status: "failed",
      error: expect.objectContaining({ code: "candidate.stale-base" }),
    }));

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
        expect.objectContaining({ id: "back-end-die-handoff", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["transport-blocking"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 1 } }),
        expect.objectContaining({ id: "burn-in-changeover-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["setup-campaign"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 1 } }),
        expect.objectContaining({ id: "commissioned-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, budget: { maxCandidates: 7 } }),
        expect.objectContaining({ id: "front-end-queue-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["queue-congestion"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 5 } }),
        expect.objectContaining({ id: "greenfield-dram-fab", locked: true, seed: { kind: "synthesis", inputBlueprint: "greenfield" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, budget: { maxCandidates: 7 } }),
        expect.objectContaining({ id: "inspection-supply-path", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 7 } }),
        expect.objectContaining({ id: "integrated-dram-fab", locked: true, seed: { kind: "blueprint", blueprint: "experiment" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, budget: { maxCandidates: 7 } }),
        expect.objectContaining({ id: "layer-two-particle-control", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["yield-quality"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 2 } }),
        expect.objectContaining({ id: "lithography-maintenance-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["maintenance-qualification"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 2 } }),
        expect.objectContaining({ id: "release-admission-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["release-admission"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 2 } }),
        expect.objectContaining({ id: "shipping-power-convergence", locked: true, seed: { kind: "blueprint", blueprint: "generated-dram-fab" }, focus: { kind: "losses", losses: ["power-interruption"] }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 0 }, budget: { maxCandidates: 2 } }),
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
      evidence: expect.objectContaining({
        state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0,
      }),
      action: { kind: "run", effect: "creates-artifact", runId: null },
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
      evidence: expect.objectContaining({
        state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 1,
      }),
      action: { kind: "run", effect: "creates-artifact", runId: null },
    }));
    const invalidRunResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${invalidRunId}`);
    expect(invalidRunResponse.status).toBe(400);
    expect(await invalidRunResponse.json()).toEqual({
      code: "design.invalid-run",
      error: `Design run '${invalidRunId}' manifest identity or completion state is invalid`,
      hashes: {},
    });
    const campaignRunResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/run`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxCandidates: 7 }),
    });
    const campaignOperation = await completedStudioOperation<any>(port, "memory-fab", campaignRunResponse);
    const campaignProgress = campaignOperation.progressLog as any[];
    expect(campaignProgress.filter((progress) => progress.phase === "node-exhausted")).toHaveLength(0);
    expect(campaignProgress).toContainEqual(expect.objectContaining({
      phase: "proposal-completed", iteration: 7, strategy: "facility:utility-n-plus-one",
    }));
    expect(campaignProgress).toContainEqual(expect.objectContaining({
      phase: "candidate-completed", iteration: 7, strategy: "facility:utility-n-plus-one", decision: "BRANCH",
    }));
    const campaignResult = campaignOperation.result!;
    const campaignRepairRunId = campaignResult.manifest.resultHash as string;
    expect(campaignResult.manifest).toMatchObject({
      budget: { maximum: 7, evaluated: 7 },
      best: { iteration: 4, candidateScore: -53.33470651587303, verdict: "KEEP" },
      frontier: {
        leader: "candidate-4",
        alternatives: ["candidate-7"],
        scheduler: { searchOrder: ["candidate-7", "candidate-4"], exhausted: [] },
        nodes: expect.any(Array),
      },
    });
    const currentCampaignProgramResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab`);
    expect(currentCampaignProgramResponse.status).toBe(200);
    expect(await currentCampaignProgramResponse.json()).toEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        state: "promotable",
        authorityRunId: campaignRepairRunId,
        currentRuns: 1,
        historicalRuns: 0,
        invalidRuns: 1,
        runs: expect.arrayContaining([
          expect.objectContaining({
            id: campaignRepairRunId,
            currentness: { state: "current", reasons: [] },
            outcome: "promotable",
          }),
        ]),
      }),
      action: { kind: "promote", effect: "creates-artifact", runId: campaignRepairRunId },
    }));
    const campaignRepairResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${campaignRepairRunId}`);
    expect(campaignRepairResponse.status).toBe(200);
    expect(await campaignRepairResponse.json()).toEqual(expect.objectContaining({ manifest: expect.objectContaining({
      resultHash: campaignRepairRunId,
      iterations: expect.arrayContaining([expect.objectContaining({
        iteration: 7,
        strategy: "facility:utility-n-plus-one",
        promotionBoundary: expect.objectContaining({ guardrail: expect.objectContaining({ passed: false, violations: expect.any(Array) }) }),
        decision: "BRANCH",
        decisionEvidence: expect.objectContaining({ basis: "current-best-case-guardrail", guardrail: expect.objectContaining({ passed: false, violations: expect.any(Array) }) }),
        frontierEvidence: expect.objectContaining({ parent: { nodeId: "candidate-6", role: "alternative", depth: 3 }, leaderAfter: "candidate-4" }),
      })]),
    }) }));
    const continuationResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/greenfield-dram-fab/runs/${campaignRepairRunId}/continue`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxCandidates: 1 }),
    });
    const continuationOperation = await completedStudioOperation<any>(port, "memory-fab", continuationResponse);
    const continuationProgress = continuationOperation.progressLog as any[];
    expect(continuationProgress[0]).toEqual(expect.objectContaining({
      version: 4,
      phase: "run-started",
      continuation: { sourceResultHash: campaignRepairRunId, reusedIterations: 7 },
      budget: { maximum: 8, previousEvaluated: 7, additional: 1 },
    }));
    expect(continuationProgress.filter((progress) => progress.phase === "case-completed" && progress.evaluation.kind === "baseline")).toHaveLength(5);
    expect(continuationProgress.filter((progress) => progress.phase === "case-completed" && progress.evaluation.kind === "seed")).toHaveLength(0);
    expect(continuationProgress.filter((progress) => progress.phase === "case-completed" && progress.evaluation.kind === "candidate")).toHaveLength(5);
    expect(continuationProgress.filter((progress) => progress.phase === "node-exhausted")).toEqual([]);
    const continuationResult = continuationOperation.result!;
    expect(continuationResult.manifest).toMatchObject({
      continuation: { sourceResultHash: campaignRepairRunId, reusedIterations: 7, reusedExhaustions: 0, additionalCandidateBudget: 1 },
      budget: { maximum: 8, evaluated: 8 },
      best: { iteration: 4, verdict: "KEEP" },
      frontier: {
        leader: "candidate-4",
        alternatives: expect.any(Array),
        scheduler: { searchOrder: expect.any(Array), exhausted: [] },
      },
      exhaustions: [],
      stopReason: "budget-exhausted",
    });
    expect(continuationResult.manifest.iterations).toHaveLength(8);
    expect(continuationResult.manifest.iterations.slice(0, 7)).toEqual(campaignResult.manifest.iterations);
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
    const commissioningPreview = (await completedStudioOperation<{
      proposalHash: string;
      currentCandidateHash: string;
      proposedCandidateHash: string;
      result: { verdict: string };
      operation: { operation: string; effect: string; context: { hashes: { blueprintHash: string } } };
    }>(port, "memory-fab", commissioningPreviewResponse)).result!;
    expect(commissioningPreview).toEqual(expect.objectContaining({
      result: expect.objectContaining({ verdict: "KEEP" }),
      operation: expect.objectContaining({ operation: "candidate.preview", effect: "creates-artifact" }),
    }));
    expect(commissioningPreview.operation.context.hashes.blueprintHash).toBe(commissioningPreview.proposedCandidateHash);
    expect(await readFile(generatedPath, "utf8")).toBe(generatedBefore);

    const commissioningApplyResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/experiments/greenfield-dram-design/candidates/${commissionedCandidate}/apply`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(commissioningPreview),
    });
    const commissioningApply = await completedStudioOperation<{
      applied: boolean;
      proposedCandidateHash: string;
      operation: { operation: string; effect: string };
    }>(port, "memory-fab", commissioningApplyResponse);
    expect(commissioningApply.result).toEqual(expect.objectContaining({
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

    const missingProgram = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/missing-program/run`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxCandidates: 1 }),
    });
    expect(missingProgram.status).toBe(400);
    expect(await missingProgram.json()).toEqual(expect.objectContaining({ code: "studio.request-failed" }));

    const runResponse = await fetch(`http://localhost:${port}/api/projects/memory-fab/designs/integrated-dram-fab/run`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxCandidates: 1 }),
    });
    const runOperation = await completedStudioOperation<any>(port, "memory-fab", runResponse);
    const progress = runOperation.progressLog as any[];
    expect(progress[0]).toEqual(expect.objectContaining({ phase: "run-started", sequence: 1 }));
    expect(progress.filter((item) => item.phase === "case-completed" && item.evaluation.kind === "baseline")).toHaveLength(5);
    expect(progress.filter((item) => item.phase === "case-completed" && item.evaluation.kind === "candidate")).toHaveLength(5);
    expect(progress.filter((item) => item.phase === "case-completed").every((item) =>
      typeof item.timing.durationMs === "number")).toBeTrue();
    expect(progress.filter((item) => item.phase === "case-completed").every((item) =>
      item.execution.mode === "parallel" && item.execution.concurrency > 1)).toBeTrue();
    expect(progress.filter((item) => item.phase.startsWith("driver-replay"))).toEqual([]);
    expect(progress).toContainEqual(expect.objectContaining({
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
    }));
    expect(progress).toContainEqual(expect.objectContaining({ phase: "proposal-completed", addressedLoss: "yield-quality" }));
    expect(progress).toContainEqual(expect.objectContaining({
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
    }));
    expect(progress.at(-1)).toEqual(expect.objectContaining({ phase: "run-completed", work: { completedCases: 15, plannedCases: 15 } }));
    const run = runOperation.result as { manifest: { resultHash: string; best: { iteration: number; verdict: string; promotionPatchOperations: number }; budget: { maximum: number; evaluated: number }; exhaustions: unknown[]; iterations: Array<{ addressedLoss?: string; promotionBoundary: { promotable: boolean }; driverEvidence: { metricsHash: string; fabLoss: { chain: string[] } | null }; decisionEvidence: { limitingCase: string } }> }; artifact: { id: string; created: boolean } };
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
