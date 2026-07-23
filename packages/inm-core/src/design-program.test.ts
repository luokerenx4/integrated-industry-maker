import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, expect, test } from "bun:test";
import { buildDesignProgramBrief, listDesignPrograms, loadDesignProgram, prepareDesignProgram } from "./design-program";
import { listDesignRuns, loadDesignRun, promoteDesignRun, runDesignProgram, type DesignRunProgress } from "./design-run";
import { applyResearchPatch } from "./research";
import { applyCandidateChangeSet, loadCandidateChangeSet, previewCandidateChangeSet } from "./candidate-change-set";
import { hashValue } from "./utils";
import { compileFactoryProject } from "./compiler";
import { runUntil } from "./simulator";

const projectDir = resolve("examples/memory-fab");
const temporaryDirectories: string[] = [];
afterAll(async () => { await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))); });

test("memory-fab exposes authored and synthesis-seeded Design Programs with read-only briefs", async () => {
  const programs = await listDesignPrograms(projectDir);
  expect(programs).toEqual([
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
}, 30_000);

test("a synthesis-seeded Design Program is deterministic, immutable, and applies only through an exact Candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-run-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const sourcePath = join(copy, "blueprints", "greenfield.blueprint.json");
  const targetPath = join(copy, "blueprints", "generated-dram-fab.blueprint.json");
  const tunedPath = join(copy, "blueprints", "experiment.blueprint.json");
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
    status: "completed",
    project: "memory-fab",
    program: { id: "greenfield-dram-fab", currentBestGuardrail: { kind: "uniform", maximumCaseScoreRegression: 0 }, frontier: { maximumAlternativeBranches: 1 } },
    benchmark: { id: "greenfield-dram-design" },
    seed: {
      source: { kind: "synthesis", inputBlueprint: "greenfield" },
      sourceBlueprintHash: expect.any(String),
      blueprintHash: expect.any(String),
      synthesis: { method: "project-strategy", contentHash: expect.any(String) },
      evaluation: { verdict: "UNCHANGED" },
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: hashValue(JSON.parse(targetBefore)) },
    budget: { maximum: 7, evaluated: 7 },
    frontier: {
      leader: "candidate-7",
      alternatives: ["candidate-6"],
      scheduler: { searchOrder: ["candidate-6", "candidate-7"], exhausted: [] },
      nodes: [
        expect.objectContaining({ nodeId: "candidate-7", role: "leader", searchStatus: "searchable" }),
        expect.objectContaining({ nodeId: "candidate-6", role: "alternative", searchStatus: "searchable" }),
      ],
    },
    best: { iteration: 7, verdict: "KEEP" },
    stopReason: "budget-exhausted",
  });
  const promotionPatchOperations = first.manifest.best.promotionPatchOperations;
  expect(promotionPatchOperations).toBeGreaterThan(0);
  expect(first.manifest.iterations[0]).toMatchObject({
    iteration: 1,
    decisionFamily: expect.any(String),
    addressedLoss: "q-time",
    driverEvidence: {
      metricsHash: hashValue(driverMetrics),
      fabLoss: { version: 1, family: "dram-wafer", primary: { id: "q-time" }, chain: expect.arrayContaining(["q-time", "yield-quality", "queue-starvation"]) },
    },
    proposalHash: expect.any(String),
    promotionBoundary: { leaderNodeId: "seed", selectedNodeId: "seed", promotable: true, limitingCase: null, guardrail: { passed: true, violations: [] } },
    decision: expect.stringMatching(/KEEP|BRANCH|REJECT/),
    frontierEvidence: { parent: { nodeId: "seed", role: "leader", depth: 0 }, outcome: "leader-promoted" },
  });
  expect(Object.hasOwn(first.manifest.iterations[0]!.driverEvidence.fabLoss!, "run")).toBeFalse();
  expect(first.manifest.iterations[1]).toMatchObject({
    iteration: 2,
    strategy: "maintenance:lithography-jobs-6",
    decisionFamily: "maintenance",
    addressedLoss: "yield-quality",
    decision: "KEEP",
  });
  expect(first.manifest.iterations[2]).toMatchObject({
    iteration: 3,
    strategy: "dispatch:conwip-8-5-edd",
    decisionFamily: "dispatch",
    addressedLoss: "queue-starvation",
    decision: "BRANCH",
    decisionEvidence: {
      basis: "current-best-case-guardrail",
      limitingCase: "facility-interruption",
      guardrail: { kind: "uniform", passed: false, violations: ["facility-interruption"] },
    },
    frontierEvidence: {
      parent: { nodeId: "candidate-2", role: "leader", depth: 2 },
      candidateNodeId: "candidate-3",
      outcome: "branch-retained",
      reason: "pareto-frontier",
      leaderAfter: "candidate-2",
      alternativesAfter: ["candidate-3"],
      searchOrderAfter: ["candidate-3", "candidate-2"],
      exhaustedAfter: [],
    },
  });
  expect(first.manifest.iterations[3]).toMatchObject({
    iteration: 4,
    strategy: "facility:utility-n-plus-one",
    decisionFamily: "facility",
    addressedCase: "facility-interruption",
    promotionBoundary: {
      leaderNodeId: "candidate-2",
      selectedNodeId: "candidate-3",
      promotable: false,
      aggregate: { scoreDelta: 7.8278361805555505 },
      limitingCase: "facility-interruption",
      guardrail: { kind: "uniform", passed: false, violations: ["facility-interruption"] },
    },
    decision: "KEEP",
    decisionEvidence: {
      basis: "current-best-improvement",
      limitingCase: "steady-production",
      guardrail: { kind: "uniform", passed: true, violations: [] },
    },
    frontierEvidence: {
      parent: { nodeId: "candidate-3", role: "alternative", depth: 3 },
      candidateNodeId: "candidate-4",
      outcome: "leader-promoted",
      reason: "leader-policy",
      pruned: [{ nodeId: "candidate-2", reason: "dominated", byNodeId: "candidate-4" }],
      leaderAfter: "candidate-4",
      alternativesAfter: ["candidate-3"],
      searchOrderAfter: ["candidate-3", "candidate-4"],
      exhaustedAfter: [],
    },
  });
  expect(first.manifest.exhaustions).toEqual([
    {
      sequence: 1,
      beforeIteration: 5,
      node: { nodeId: "candidate-3", role: "alternative", depth: 3 },
      reason: "proposal-exhausted",
      searchOrderBefore: ["candidate-3", "candidate-4"],
      searchOrderAfter: ["candidate-4"],
      exhaustedAfter: ["candidate-3"],
      nextNodeId: "candidate-4",
    },
  ]);
  expect(first.manifest.iterations.slice(4).map((item) => ({
    iteration: item.iteration,
    parent: item.frontierEvidence.parent.nodeId,
    strategy: item.strategy,
    decision: item.decision,
  }))).toEqual([
    { iteration: 5, parent: "candidate-4", strategy: "batch-formation:furnace-flex-30000", decision: "REJECT" },
    { iteration: 6, parent: "candidate-4", strategy: "setup-campaign:lithography-3-12000", decision: "BRANCH" },
    { iteration: 7, parent: "candidate-6", strategy: "setup-campaign:lithography-3-0-interruption-escape", decision: "KEEP" },
  ]);
  expect(first.manifest.iterations[6]).toMatchObject({
    addressedCase: "lithography-interruption",
    promotionBoundary: {
      leaderNodeId: "candidate-4",
      selectedNodeId: "candidate-6",
      promotable: false,
      limitingCase: "lithography-interruption",
      guardrail: { kind: "uniform", passed: false, violations: ["lithography-interruption"] },
    },
    decisionEvidence: {
      basis: "current-best-improvement",
      guardrail: { kind: "uniform", passed: true, violations: [] },
    },
    frontierEvidence: {
      parent: { nodeId: "candidate-6", role: "alternative", depth: 5 },
      candidateNodeId: "candidate-7",
      outcome: "leader-promoted",
      leaderAfter: "candidate-7",
      alternativesAfter: ["candidate-6"],
      searchOrderAfter: ["candidate-6", "candidate-7"],
      exhaustedAfter: [],
    },
  });
  expect(first.manifest.iterations[6]!.promotionBoundary.aggregate.scoreDelta).toBeCloseTo(0.45578375, 8);
  expect(first.manifest.iterations[6]!.promotionBoundary.cases.find((item) => item.id === "lithography-interruption")!.scoreDelta).toBeCloseTo(-0.0546675, 8);
  expect(first.manifest.iterations[6]!.decisionEvidence!.aggregate.scoreDelta).toBeCloseTo(0.24389893, 8);
  expect(first.manifest.best.candidateScore).toBeCloseTo(-242.19922104, 8);
  const guardedEvidence = first.manifest.iterations[2]!.decisionEvidence!;
  expect(guardedEvidence.aggregate.scoreDelta > 7).toBeTrue();
  expect(guardedEvidence.cases.map((item) => item.id)).toEqual(["steady-production", "mixed-quality", "quality-excursion", "lithography-interruption", "facility-interruption"]);
  const guardedFacility = guardedEvidence.cases.find((item) => item.id === "facility-interruption")!;
  expect(guardedFacility.maximumScoreRegression).toBe(0);
  expect(guardedFacility.guardrailPassed).toBeFalse();
  expect(guardedFacility.scoreDelta < -3.9).toBeTrue();
  expect(first.manifest.iterations[3]!.decisionEvidence!.aggregate.scoreDelta > 9.9).toBeTrue();
  expect(first.manifest.iterations[3]!.decisionEvidence!.cases.every((item) => item.guardrailPassed)).toBeTrue();
  expect(first.manifest.resultHash).toHaveLength(64);
  expect(first.manifest.best.blueprintHash).toHaveLength(64);
  expect(progress.map((event) => event.sequence)).toEqual(Array.from({ length: progress.length }, (_, index) => index + 1));
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "baseline")).toHaveLength(5);
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "seed")).toHaveLength(5);
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "candidate")).toHaveLength(35);
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-started", iteration: 1,
    driverEvidence: expect.objectContaining({ metricsHash: hashValue(driverMetrics), fabLoss: expect.objectContaining({ primary: expect.objectContaining({ id: "q-time" }) }) }),
  }));
  expect(progress.filter((event) => event.phase === "node-exhausted")).toEqual([
    expect.objectContaining({ phase: "node-exhausted", exhaustion: expect.objectContaining({ sequence: 1, node: expect.objectContaining({ nodeId: "candidate-3" }), nextNodeId: "candidate-4" }) }),
  ]);
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-started",
    iteration: 4,
    branch: expect.objectContaining({ nodeId: "candidate-3", role: "alternative", leaderNodeId: "candidate-2" }),
    promotionBoundary: expect.objectContaining({ selectedNodeId: "candidate-3", limitingCase: "facility-interruption", guardrail: expect.objectContaining({ violations: ["facility-interruption"] }) }),
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-completed",
    iteration: 4,
    strategy: "facility:utility-n-plus-one",
    addressedCase: "facility-interruption",
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "candidate-completed",
    iteration: 4,
    strategy: "facility:utility-n-plus-one",
    addressedCase: "facility-interruption",
    decision: "KEEP",
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-completed",
    iteration: 7,
    strategy: "setup-campaign:lithography-3-0-interruption-escape",
    addressedCase: "lithography-interruption",
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "candidate-completed",
    iteration: 7,
    strategy: "setup-campaign:lithography-3-0-interruption-escape",
    addressedCase: "lithography-interruption",
    decision: "KEEP",
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-completed", iteration: 1, strategy: "dispatch:conwip-9-6-edd", decisionFamily: "dispatch", addressedLoss: "q-time",
    driverEvidence: expect.objectContaining({ metricsHash: hashValue(driverMetrics) }),
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "candidate-completed",
    iteration: 3,
    decision: "BRANCH",
    decisionEvidence: expect.objectContaining({
      basis: "current-best-case-guardrail",
      limitingCase: "facility-interruption",
      guardrail: { kind: "uniform", passed: false, violations: ["facility-interruption"] },
    }),
    frontierEvidence: expect.objectContaining({ outcome: "branch-retained", leaderAfter: "candidate-2", searchOrderAfter: ["candidate-3", "candidate-2"], exhaustedAfter: [] }),
  }));
  expect(progress.at(-1)).toEqual(expect.objectContaining({
    phase: "run-completed",
    resultHash: first.manifest.resultHash,
    work: { completedSimulations: 45, plannedSimulations: 45 },
  }));
  const repeatedProgress: DesignRunProgress[] = [];
  const second = await runDesignProgram(copy, "greenfield-dram-fab", { maxCandidates: 7, onProgress: (event) => repeatedProgress.push(event) });
  expect(second.manifest.resultHash).toBe(first.manifest.resultHash);
  expect(repeatedProgress).toEqual(progress);
  expect(second.artifact).toEqual({ ...first.artifact, created: false });
  expect(await loadDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash)).toEqual({
    manifest: first.manifest,
    bestBlueprint: first.bestBlueprint,
    artifact: { ...first.artifact, created: false },
  });
  const rejectTampered = async (mutate: (manifest: typeof first.manifest) => void, rejectListing = false) => {
    const tampered = JSON.parse(JSON.stringify(first.manifest)) as typeof first.manifest;
    mutate(tampered);
    const { resultHash: _recordedResultHash, ...tamperedHashInput } = tampered;
    tampered.resultHash = hashValue(tamperedHashInput);
    const tamperedPath = join(copy, "design-runs", "greenfield-dram-fab", tampered.resultHash);
    await mkdir(tamperedPath, { recursive: true });
    await writeFile(join(tamperedPath, "best.blueprint.json"), `${JSON.stringify(first.bestBlueprint, null, 2)}\n`);
    await writeFile(join(tamperedPath, "manifest.json"), `${JSON.stringify(tampered, null, 2)}\n`);
    await expect(loadDesignRun(copy, "greenfield-dram-fab", tampered.resultHash))
      .rejects.toMatchObject({ code: "design.invalid-run" });
    if (rejectListing) await expect(listDesignRuns(copy, "greenfield-dram-fab"))
      .rejects.toMatchObject({ code: "design.invalid-run" });
    await rm(tamperedPath, { recursive: true });
  };
  await rejectTampered((manifest) => {
    manifest.iterations[3]!.promotionBoundary.cases.find((item) => item.id === "facility-interruption")!.scoreDelta += 1;
  }, true);
  await rejectTampered((manifest) => { manifest.exhaustions.reverse(); });
  await rejectTampered((manifest) => { manifest.exhaustions[0]!.nextNodeId = "candidate-3"; });
  await rejectTampered((manifest) => { manifest.frontier.nodes[1]!.searchStatus = "exhausted"; });
  await rejectTampered((manifest) => { manifest.stopReason = "frontier-exhausted"; });
  expect(await listDesignRuns(copy, "greenfield-dram-fab")).toEqual([
    expect.objectContaining({
      id: first.manifest.resultHash,
      program: "greenfield-dram-fab",
      benchmark: "greenfield-dram-design",
      seed: { kind: "synthesis", inputBlueprint: "greenfield" },
      promotionBase: first.manifest.promotionBase,
    }),
  ]);
  const synthesisStrategyPath = join(copy, "strategies", "reentrant-dram-fab.ts");
  const synthesisStrategyBefore = await readFile(synthesisStrategyPath, "utf8");
  await writeFile(synthesisStrategyPath, `${synthesisStrategyBefore}\n// changed after the immutable run\n`);
  await expect(promoteDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash, "stale-strategy-design"))
    .rejects.toMatchObject({ code: "design.run-stale" });
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

  const preview = await previewCandidateChangeSet(copy, candidate.id);
  expect(preview).toMatchObject({ proposedCandidateHash: first.manifest.best.blueprintHash, result: { verdict: "KEEP" } });
  await applyCandidateChangeSet(copy, candidate.id, {
    proposalHash: preview.proposalHash,
    currentCandidateHash: preview.currentCandidateHash,
    proposedCandidateHash: preview.proposedCandidateHash,
  });
  expect(await readFile(targetPath, "utf8")).not.toBe(targetBefore);
  expect(hashValue(JSON.parse(await readFile(targetPath, "utf8")))).toBe(first.manifest.best.blueprintHash);
  expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
  expect(await readFile(tunedPath, "utf8")).toBe(tunedBefore);
  await expect(promoteDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash, "stale-generated-design"))
    .rejects.toMatchObject({ code: "design.promotion-base-stale" });
}, 180_000);
