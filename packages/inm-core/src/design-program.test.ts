import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, expect, test } from "bun:test";
import { buildDesignProgramBrief, listDesignPrograms, loadDesignProgram, prepareDesignProgram } from "./design-program";
import { continueDesignRun, listDesignRuns, loadDesignRun, promoteDesignRun, runDesignProgram, type DesignRunProgress } from "./design-run";
import { applyResearchPatch } from "./research";
import { loadCandidateChangeSet } from "./candidate-change-set";
import { applyCandidateOperation, previewCandidateOperation } from "./operation";
import { hashValue } from "./utils";
import { compileFactoryProject } from "./compiler";
import { runUntil } from "./simulator";

const projectDir = resolve("examples/memory-fab");
const temporaryDirectories: string[] = [];
afterAll(async () => { await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))); });

function migrateArchivedMaintenanceForTest<T>(value: T): T {
  const blueprint = structuredClone(value) as {
    devices: Array<{ policy?: { preventiveMaintenance?: Record<string, unknown> } }>;
  };
  for (const device of blueprint.devices) {
    const policy = device.policy?.preventiveMaintenance;
    if (typeof policy?.minimumJobs === "number") {
      device.policy!.preventiveMaintenance = { opportunistic: { afterJobs: policy.minimumJobs } };
    }
  }
  return blueprint as T;
}

test("memory-fab exposes authored and synthesis-seeded Design Programs with read-only briefs", async () => {
  const programs = await listDesignPrograms(projectDir);
  expect(programs).toEqual([
    expect.objectContaining({
      id: "commissioned-dram-fab",
      benchmark: "greenfield-dram-design",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      driverCase: "mixed-quality",
      currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 },
      frontier: { maximumAlternativeBranches: 1 },
      locked: true,
      budget: { maxCandidates: 7 },
    }),
    expect.objectContaining({
      id: "greenfield-dram-fab",
      benchmark: "greenfield-dram-design",
      seed: { kind: "synthesis", inputBlueprint: "greenfield" },
      driverCase: "mixed-quality",
      currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 },
      frontier: { maximumAlternativeBranches: 1 },
      locked: true,
      budget: { maxCandidates: 7 },
    }),
    expect.objectContaining({
      id: "integrated-dram-fab",
      benchmark: "dispatch-research",
      seed: { kind: "blueprint", blueprint: "experiment" },
      driverCase: "mixed-quality",
      currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 },
      frontier: { maximumAlternativeBranches: 1 },
      locked: true,
      budget: { maxCandidates: 7 },
    }),
  ]);
  const before = await readFile(join(projectDir, "design-programs", "integrated-dram-fab.design.json"), "utf8");
  const brief = await buildDesignProgramBrief(projectDir, "integrated-dram-fab");
  const after = await readFile(join(projectDir, "design-programs", "integrated-dram-fab.design.json"), "utf8");
  expect(after).toBe(before);
  expect(brief).toMatchObject({
    version: 1,
    project: { id: "memory-fab" },
    program: { id: "integrated-dram-fab", locked: true, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } },
    benchmark: { id: "dispatch-research", cases: 5 },
    driver: { case: { id: "mixed-quality", seed: 42 }, selection: { blueprint: "experiment", scenario: "production-window" } },
    staticEvidence: { capacity: { state: "ready", gapCount: 0 }, devices: { total: 61 }, topology: { trackedRoutes: 1 } },
  });
  expect(brief.program.programHash).toHaveLength(64);
  expect(brief.driver.hashes.blueprintHash).toHaveLength(64);

  const commissioned = await buildDesignProgramBrief(projectDir, "commissioned-dram-fab");
  expect(commissioned.seed.sourceBlueprintHash).toBe(commissioned.promotionBase.hash);
  expect(commissioned).toMatchObject({
    program: {
      id: "commissioned-dram-fab",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 },
    },
    benchmark: { id: "greenfield-dram-design", cases: 5 },
    seed: {
      source: { kind: "blueprint", blueprint: "generated-dram-fab" },
      sourceBlueprintHash: expect.any(String),
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: expect.any(String) },
    driver: { selection: { blueprint: "generated-dram-fab", scenario: "production-window" } },
  });

  const greenfield = await buildDesignProgramBrief(projectDir, "greenfield-dram-fab");
  expect(greenfield).toMatchObject({
    program: { id: "greenfield-dram-fab", seed: { kind: "synthesis", inputBlueprint: "greenfield" }, currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } },
    benchmark: { id: "greenfield-dram-design", cases: 5 },
    seed: {
      source: { kind: "synthesis", inputBlueprint: "greenfield" },
      sourceBlueprintHash: expect.any(String),
      blueprintHash: expect.any(String),
      synthesis: {
        method: "project-strategy",
        entry: "strategies/reentrant-dram-fab.ts",
        contentHash: expect.any(String),
        summary: { trackedRoute: "dram-front-end" },
      },
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: expect.any(String) },
    driver: { selection: { blueprint: "generated-dram-fab" } },
    staticEvidence: { capacity: { state: "ready", gapCount: 0 }, devices: { total: 56 }, topology: { connections: 16, trackedRoutes: 1 } },
  });
});

test("Design Program validation rejects unknown fields and the removed legacy seed contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-program-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const path = join(copy, "design-programs", "integrated-dram-fab.design.json");
  const program = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify({ ...program, surprise: true }, null, 2)}\n`);
  await expect(loadDesignProgram(copy, "integrated-dram-fab")).rejects.toThrow("Unrecognized key");
  delete program.surprise;
  program.seedBlueprint = "experiment";
  delete program.seed;
  await writeFile(path, `${JSON.stringify(program, null, 2)}\n`);
  await expect(loadDesignProgram(copy, "integrated-dram-fab")).rejects.toThrow("seed");

  const valid = JSON.parse(await readFile(join(projectDir, "design-programs", "integrated-dram-fab.design.json"), "utf8"));
  delete valid.currentBestGuardrail;
  await writeFile(path, `${JSON.stringify(valid, null, 2)}\n`);
  await expect(loadDesignProgram(copy, "integrated-dram-fab")).rejects.toThrow("currentBestGuardrail");

  const withoutFrontier = JSON.parse(await readFile(join(projectDir, "design-programs", "integrated-dram-fab.design.json"), "utf8"));
  delete withoutFrontier.frontier;
  await writeFile(path, `${JSON.stringify(withoutFrontier, null, 2)}\n`);
  await expect(loadDesignProgram(copy, "integrated-dram-fab")).rejects.toThrow("frontier");

  valid.currentBestGuardrail = { kind: "unrestricted" };
  await writeFile(path, `${JSON.stringify(valid, null, 2)}\n`);
  expect((await loadDesignProgram(copy, "integrated-dram-fab")).currentBestGuardrail).toEqual({ kind: "unrestricted" });

  valid.currentBestGuardrail = {
    kind: "case-specific",
    maximumCaseScoreRegression: {
      "steady-production": 0,
      "mixed-quality": 0.5,
      "quality-excursion": 0,
      "lithography-interruption": 1,
      "facility-interruption": 0,
    },
  };
  await writeFile(path, `${JSON.stringify(valid, null, 2)}\n`);
  expect((await prepareDesignProgram(copy, "integrated-dram-fab")).manifest.currentBestGuardrail).toEqual(valid.currentBestGuardrail);

  valid.currentBestGuardrail = { kind: "case-specific", maximumCaseScoreRegression: { "steady-production": 0, "not-a-benchmark-case": 1 } };
  await writeFile(path, `${JSON.stringify(valid, null, 2)}\n`);
  await expect(prepareDesignProgram(copy, "integrated-dram-fab")).rejects.toThrow("must match Benchmark 'dispatch-research' cases exactly");
});

test("commissioned Design pins its live promotion base and applies only a reviewed product-mix policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-commissioned-design-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const targetPath = join(copy, "blueprints", "generated-dram-fab.blueprint.json");
  const authored = migrateArchivedMaintenanceForTest(
    JSON.parse(await readFile(join(projectDir, "runs/053-simulate/blueprint.json"), "utf8")),
  );
  const burnIn = authored.devices.find((device: { id: string }) => device.id === "burn-in-1");
  burnIn.policy.recipeDispatch = "authored-order";
  authored.revision = "commissioned-pre-portfolio-test";
  await writeFile(targetPath, `${JSON.stringify(authored, null, 2)}\n`);

  const brief = await buildDesignProgramBrief(copy, "commissioned-dram-fab");
  expect(brief.seed.sourceBlueprintHash).toBe(hashValue(authored));
  expect(brief.promotionBase).toEqual({ blueprint: "generated-dram-fab", hash: hashValue(authored) });

  const result = await runDesignProgram(copy, "commissioned-dram-fab", { maxCandidates: 1 });
  expect(result.manifest).toMatchObject({
    program: { id: "commissioned-dram-fab", currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 } },
    seed: {
      source: { kind: "blueprint", blueprint: "generated-dram-fab" },
      sourceBlueprintHash: hashValue(authored),
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: hashValue(authored) },
    budget: { maximum: 1, evaluated: 1 },
    iterations: [{
      iteration: 1,
      strategy: "dispatch:burn-in-contract-value",
      addressedLoss: "delivery-portfolio",
      driverEvidence: {
        fabLoss: {
          version: 4,
          primary: { id: "delivery-portfolio" },
          outcome: { deliveryShortfall: 18, deliveryOverflow: 16, portfolioNetValue: -48 },
        },
      },
      decision: "KEEP",
      decisionEvidence: {
        guardrail: { kind: "uniform", passed: true, violations: [] },
      },
    }],
    best: { iteration: 1, verdict: "KEEP", promotionPatchOperations: 1 },
  });
  const evidence = result.manifest.iterations[0]!.decisionEvidence!;
  expect(evidence.aggregate.scoreDelta).toBeCloseTo(23.281223, 6);
  expect(evidence.cases.every((item) =>
    item.maximumScoreRegression === 0 && item.guardrailPassed && item.scoreDelta >= 0)).toBeTrue();

  const promoted = await promoteDesignRun(copy, "commissioned-dram-fab", result.manifest.resultHash, "tested-portfolio-dispatch");
  expect(promoted.candidate.patch).toEqual([{
    op: "replace",
    path: `/devices/${authored.devices.indexOf(burnIn)}/policy/recipeDispatch`,
    value: "contract-value",
  }]);
  const preview = await previewCandidateOperation(copy, promoted.candidate.id);
  expect(preview.data).toMatchObject({
    proposedCandidateHash: result.manifest.best.blueprintHash,
    result: { verdict: "KEEP" },
  });
  await applyCandidateOperation(copy, promoted.candidate.id, {
    proposalHash: preview.data.proposalHash,
    currentCandidateHash: preview.data.currentCandidateHash,
    proposedCandidateHash: preview.data.proposedCandidateHash,
  });
  const applied = JSON.parse(await readFile(targetPath, "utf8"));
  expect(applied.devices.find((device: { id: string }) => device.id === "burn-in-1").policy.recipeDispatch).toBe("contract-value");
  expect(hashValue(applied)).toBe(result.manifest.best.blueprintHash);
}, 60_000);

test("Design stops only after every retained frontier node is search-exhausted", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-exhausted-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  await writeFile(join(copy, "strategies", "integrated-dram-proposals.ts"), `export default {
  apiVersion: 5,
  propose() { return null; },
};
`);
  const progress: DesignRunProgress[] = [];
  const result = await runDesignProgram(copy, "integrated-dram-fab", { maxCandidates: 1, onProgress: (event) => progress.push(event) });
  expect(result.manifest).toMatchObject({
    budget: { maximum: 1, evaluated: 0 },
    iterations: [],
    exhaustions: [{
      sequence: 1,
      beforeIteration: 1,
      node: { nodeId: "seed", role: "leader", depth: 0 },
      reason: "proposal-exhausted",
      searchOrderBefore: ["seed"],
      searchOrderAfter: [],
      exhaustedAfter: ["seed"],
      nextNodeId: null,
    }],
    frontier: {
      leader: "seed",
      alternatives: [],
      scheduler: { searchOrder: [], exhausted: ["seed"] },
      nodes: [expect.objectContaining({ nodeId: "seed", role: "leader", searchStatus: "exhausted" })],
    },
    best: { iteration: 0 },
    stopReason: "frontier-exhausted",
  });
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "candidate")).toEqual([]);
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "node-exhausted",
    exhaustion: expect.objectContaining({ node: expect.objectContaining({ nodeId: "seed" }), nextNodeId: null }),
    work: { completedSimulations: 10, plannedSimulations: 15 },
  }));
  expect(progress.at(-1)).toEqual(expect.objectContaining({
    phase: "run-completed",
    work: { completedSimulations: 10, plannedSimulations: 10 },
  }));
  expect(await loadDesignRun(copy, "integrated-dram-fab", result.manifest.resultHash)).toEqual({
    ...result,
    artifact: { ...result.artifact, created: false },
  });
  await expect(continueDesignRun(copy, "integrated-dram-fab", result.manifest.resultHash, { maxCandidates: 1 }))
    .rejects.toMatchObject({ code: "design.continuation-unavailable" });
}, 30_000);

test("Design continuation rejects a replay-divergent source before writing new evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-divergent-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const source = await runDesignProgram(copy, "greenfield-dram-fab", { maxCandidates: 1 });
  const divergentSource = {
    ...source.manifest,
    iterations: [
      {
        ...source.manifest.iterations[0]!,
        patch: source.manifest.iterations[0]!.patch.map((operation, index) => index === 0
          ? { ...operation, path: "/devices/999999" }
          : operation),
      },
    ],
  };
  const { resultHash: _divergentHash, ...divergentHashInput } = divergentSource;
  divergentSource.resultHash = hashValue(divergentHashInput);
  const divergentSourcePath = join(copy, "design-runs", "greenfield-dram-fab", divergentSource.resultHash);
  await mkdir(divergentSourcePath, { recursive: true });
  await writeFile(join(divergentSourcePath, "best.blueprint.json"), `${JSON.stringify(source.bestBlueprint, null, 2)}\n`);
  await writeFile(join(divergentSourcePath, "manifest.json"), `${JSON.stringify(divergentSource, null, 2)}\n`);
  expect((await loadDesignRun(copy, "greenfield-dram-fab", divergentSource.resultHash)).manifest.resultHash).toBe(divergentSource.resultHash);
  const artifactsBeforeDivergence = await readdir(join(copy, "design-runs", "greenfield-dram-fab"));
  await expect(continueDesignRun(copy, "greenfield-dram-fab", divergentSource.resultHash, { maxCandidates: 1 }))
    .rejects.toMatchObject({ code: "design.continuation-diverged" });
  expect(await readdir(join(copy, "design-runs", "greenfield-dram-fab"))).toEqual(artifactsBeforeDivergence);
}, 60_000);

test("a synthesis-seeded Design Program is deterministic, immutable, and applies only through an exact Candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-run-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const sourcePath = join(copy, "blueprints", "greenfield.blueprint.json");
  const targetPath = join(copy, "blueprints", "generated-dram-fab.blueprint.json");
  const tunedPath = join(copy, "blueprints", "experiment.blueprint.json");
  const commissioningTarget = JSON.parse(await readFile(sourcePath, "utf8"));
  commissioningTarget.revision = "memory-fab-generated-target-v1";
  await writeFile(targetPath, `${JSON.stringify(commissioningTarget, null, 2)}\n`);
  const sourceBefore = await readFile(sourcePath, "utf8");
  const targetBefore = await readFile(targetPath, "utf8");
  const tunedBefore = await readFile(tunedPath, "utf8");
  const progress: DesignRunProgress[] = [];
  const prepared = await prepareDesignProgram(copy, "greenfield-dram-fab");
  const driverProject = compileFactoryProject({ ...prepared.loaded, blueprint: prepared.seedBlueprint });
  const driverMetrics = runUntil(driverProject, undefined, { seed: prepared.benchmark.cases.find((item) => item.id === prepared.manifest.driverCase)!.seed }).metrics;
  const first = await runDesignProgram(copy, "greenfield-dram-fab", { maxCandidates: 7, onProgress: (event) => progress.push(event) });
  expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
  expect(await readFile(targetPath, "utf8")).toBe(targetBefore);
  expect(await readFile(tunedPath, "utf8")).toBe(tunedBefore);
  expect(first.artifact).toMatchObject({ created: true });
  expect(first.artifact.path.startsWith(join(copy, "design-runs", "greenfield-dram-fab"))).toBeTrue();
  expect(first.manifest).toMatchObject({
    version: 2,
    status: "completed",
    project: "memory-fab",
    program: {
      id: "greenfield-dram-fab",
      currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 },
      frontier: { maximumAlternativeBranches: 1 },
    },
    benchmark: { id: "greenfield-dram-design" },
    seed: {
      source: { kind: "synthesis", inputBlueprint: "greenfield" },
      sourceBlueprintHash: expect.any(String),
      blueprintHash: expect.any(String),
      synthesis: { method: "project-strategy", contentHash: expect.any(String) },
      evaluation: { verdict: "UNCHANGED" },
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: hashValue(JSON.parse(targetBefore)) },
    continuation: null,
    budget: { maximum: 7, evaluated: 7 },
    frontier: {
      leader: "candidate-7",
      alternatives: [],
      scheduler: { searchOrder: ["candidate-7"], exhausted: [] },
      nodes: [
        expect.objectContaining({ nodeId: "candidate-7", role: "leader", searchStatus: "searchable" }),
      ],
    },
    best: { iteration: 7, verdict: "KEEP" },
    exhaustions: [],
    stopReason: "budget-exhausted",
  });
  const promotionPatchOperations = first.manifest.best.promotionPatchOperations;
  expect(promotionPatchOperations).toBeGreaterThan(0);
  expect(first.manifest.iterations.map((item) => ({
    iteration: item.iteration,
    strategy: item.strategy,
    decision: item.decision,
    parent: item.frontierEvidence.parent.nodeId,
    outcome: item.frontierEvidence.outcome,
  }))).toEqual([
    { iteration: 1, strategy: "dispatch:conwip-9-6-edd", decision: "KEEP", parent: "seed", outcome: "leader-promoted" },
    { iteration: 2, strategy: "dispatch:probe-highest-priority", decision: "REJECT", parent: "candidate-1", outcome: "rejected" },
    { iteration: 3, strategy: "maintenance:lithography-jobs-6", decision: "REJECT", parent: "candidate-1", outcome: "rejected" },
    { iteration: 4, strategy: "dispatch:conwip-8-5-edd", decision: "KEEP", parent: "candidate-1", outcome: "leader-promoted" },
    { iteration: 5, strategy: "dispatch:conwip-10-7-edd", decision: "REJECT", parent: "candidate-4", outcome: "rejected" },
    { iteration: 6, strategy: "batch-formation:furnace-flex-30000", decision: "REJECT", parent: "candidate-4", outcome: "rejected" },
    { iteration: 7, strategy: "dispatch:inspection-earliest-due-date", decision: "KEEP", parent: "candidate-4", outcome: "leader-promoted" },
  ]);
  expect(first.manifest.iterations[0]).toMatchObject({
    addressedLoss: "q-time",
    driverEvidence: {
      metricsHash: hashValue(driverMetrics),
      fabLoss: { version: 4, family: "dram-wafer", primary: { id: "q-time" } },
    },
    promotionBoundary: { leaderNodeId: "seed", selectedNodeId: "seed", promotable: true },
    decisionEvidence: { guardrail: { kind: "uniform", passed: true, violations: [] } },
  });
  expect(Object.hasOwn(first.manifest.iterations[0]!.driverEvidence.fabLoss!, "run")).toBeFalse();
  expect(first.manifest.iterations.filter((item) => item.decision === "KEEP")
    .every((item) => item.decisionEvidence?.guardrail.passed)).toBeTrue();
  expect(first.manifest.resultHash).toHaveLength(64);
  expect(first.manifest.best.blueprintHash).toHaveLength(64);
  expect(progress.map((event) => event.sequence)).toEqual(
    Array.from({ length: progress.length }, (_, index) => index + 1),
  );
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "baseline")).toHaveLength(5);
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "seed")).toHaveLength(5);
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "candidate")).toHaveLength(35);
  expect(progress.filter((event) => event.phase === "node-exhausted")).toHaveLength(0);
  expect(progress.at(-1)).toEqual(expect.objectContaining({
    phase: "run-completed",
    resultHash: first.manifest.resultHash,
    work: { completedSimulations: 45, plannedSimulations: 45 },
  }));
  const repeatedProgress: DesignRunProgress[] = [];
  const second = await runDesignProgram(copy, "greenfield-dram-fab", {
    maxCandidates: 7,
    onProgress: (event) => repeatedProgress.push(event),
  });
  expect(second.manifest.resultHash).toBe(first.manifest.resultHash);
  expect(repeatedProgress).toEqual(progress);
  expect(second.artifact).toEqual({ ...first.artifact, created: false });
  expect(await loadDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash)).toEqual({
    manifest: first.manifest,
    bestBlueprint: first.bestBlueprint,
    artifact: { ...first.artifact, created: false },
  });
  const synthesisStrategyPath = join(copy, "strategies", "reentrant-dram-fab.ts");
  const synthesisStrategyBefore = await readFile(synthesisStrategyPath, "utf8");
  await writeFile(synthesisStrategyPath, `${synthesisStrategyBefore}\n// changed after the immutable run\n`);
  await expect(promoteDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash, "stale-strategy-design"))
    .rejects.toMatchObject({ code: "design.run-stale" });
  await expect(continueDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash, { maxCandidates: 1 }))
    .rejects.toMatchObject({ code: "design.continuation-stale" });
  await writeFile(synthesisStrategyPath, synthesisStrategyBefore);
  const promoted = await promoteDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash, "generated-leading-design");
  const candidate = await loadCandidateChangeSet(copy, "generated-leading-design");
  expect(promoted.candidate).toEqual(candidate);
  expect(candidate).toMatchObject({
    benchmark: "greenfield-dram-design",
    baseCandidateHash: first.manifest.promotionBase.hash,
    source: { kind: "design-run", program: "greenfield-dram-fab", resultHash: first.manifest.resultHash, blueprintHash: first.manifest.best.blueprintHash },
  });
  expect(candidate.patch).toHaveLength(promotionPatchOperations);
  const replayed = applyResearchPatch(JSON.parse(targetBefore), candidate.patch);
  replayed.revision = first.manifest.promotionBase.hash;
  expect(hashValue(replayed)).toBe(first.manifest.best.blueprintHash);

  const previewOperation = await previewCandidateOperation(copy, candidate.id);
  const preview = previewOperation.data;
  expect(preview).toMatchObject({ proposedCandidateHash: first.manifest.best.blueprintHash, result: { verdict: "KEEP" } });
  expect(previewOperation).toMatchObject({
    effect: "creates-artifact",
    context: { selection: { blueprint: "generated-dram-fab" }, hashes: { blueprintHash: first.manifest.best.blueprintHash } },
    artifacts: [expect.objectContaining({ kind: "candidate-review", immutable: true })],
    writeSet: [expect.stringContaining("candidate-reviews/generated-leading-design/")],
  });
  const appliedOperation = await applyCandidateOperation(copy, candidate.id, {
    proposalHash: preview.proposalHash,
    currentCandidateHash: preview.currentCandidateHash,
    proposedCandidateHash: preview.proposedCandidateHash,
  });
  expect(appliedOperation).toMatchObject({
    effect: "mutates-blueprint",
    context: { selection: { blueprint: "generated-dram-fab" }, hashes: { blueprintHash: first.manifest.best.blueprintHash } },
    data: { applied: true, proposedCandidateHash: first.manifest.best.blueprintHash },
  });
  expect(await readFile(targetPath, "utf8")).not.toBe(targetBefore);
  expect(hashValue(JSON.parse(await readFile(targetPath, "utf8")))).toBe(first.manifest.best.blueprintHash);
  expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
  expect(await readFile(tunedPath, "utf8")).toBe(tunedBefore);
  await expect(promoteDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash, "stale-generated-design"))
    .rejects.toMatchObject({ code: "design.promotion-base-stale" });
}, 240_000);
