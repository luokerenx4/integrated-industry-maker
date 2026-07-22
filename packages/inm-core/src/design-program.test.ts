import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      locked: true,
      budget: { maxCandidates: 6 },
    }),
    expect.objectContaining({
      id: "integrated-dram-fab",
      benchmark: "dispatch-research",
      seed: { kind: "blueprint", blueprint: "experiment" },
      driverCase: "mixed-quality",
      locked: true,
      budget: { maxCandidates: 6 },
    }),
  ]);
  const before = await readFile(join(projectDir, "design-programs", "integrated-dram-fab.design.json"), "utf8");
  const brief = await buildDesignProgramBrief(projectDir, "integrated-dram-fab");
  const after = await readFile(join(projectDir, "design-programs", "integrated-dram-fab.design.json"), "utf8");
  expect(after).toBe(before);
  expect(brief).toMatchObject({
    version: 1,
    project: { id: "memory-fab" },
    program: { id: "integrated-dram-fab", locked: true },
    benchmark: { id: "dispatch-research", cases: 5 },
    driver: { case: { id: "mixed-quality", seed: 42 }, selection: { blueprint: "experiment", scenario: "production-window" } },
    staticEvidence: { capacity: { state: "ready", gapCount: 0 }, devices: { total: 61 }, topology: { trackedRoutes: 1 } },
  });
  expect(brief.program.programHash).toHaveLength(64);
  expect(brief.driver.hashes.blueprintHash).toHaveLength(64);

  const greenfield = await buildDesignProgramBrief(projectDir, "greenfield-dram-fab");
  expect(greenfield).toMatchObject({
    program: { id: "greenfield-dram-fab", seed: { kind: "synthesis", inputBlueprint: "greenfield" } },
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
});

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
  const first = await runDesignProgram(copy, "greenfield-dram-fab", { maxCandidates: 5, onProgress: (event) => progress.push(event) });
  expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
  expect(await readFile(targetPath, "utf8")).toBe(targetBefore);
  expect(await readFile(tunedPath, "utf8")).toBe(tunedBefore);
  expect(first.artifact).toMatchObject({ created: true });
  expect(first.artifact.path.startsWith(join(copy, "design-runs", "greenfield-dram-fab"))).toBeTrue();
  expect(first.manifest).toMatchObject({
    status: "completed",
    project: "memory-fab",
    program: { id: "greenfield-dram-fab" },
    benchmark: { id: "greenfield-dram-design" },
    seed: {
      source: { kind: "synthesis", inputBlueprint: "greenfield" },
      sourceBlueprintHash: expect.any(String),
      blueprintHash: expect.any(String),
      synthesis: { method: "project-strategy", contentHash: expect.any(String) },
      evaluation: { verdict: "UNCHANGED" },
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: hashValue(JSON.parse(targetBefore)) },
    budget: { maximum: 5, evaluated: 5 },
    best: { iteration: 5, verdict: "KEEP" },
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
    decision: expect.stringMatching(/KEEP|REJECT/),
  });
  expect(Object.hasOwn(first.manifest.iterations[0]!.driverEvidence.fabLoss!, "run")).toBeFalse();
  expect(first.manifest.iterations[1]).toMatchObject({
    iteration: 2,
    strategy: "maintenance:lithography-jobs-6",
    decisionFamily: "maintenance",
    addressedLoss: "yield-quality",
    decision: "KEEP",
  });
  expect(first.manifest.iterations[3]).toMatchObject({
    iteration: 4,
    strategy: "batch-formation:furnace-flex-30000",
    decisionFamily: "batch-formation",
    addressedLoss: "batch-formation",
    decision: "REJECT",
    decisionEvidence: {
      basis: "no-current-best-improvement",
      limitingCase: "lithography-interruption",
    },
  });
  expect(first.manifest.iterations[4]).toMatchObject({
    iteration: 5,
    strategy: "setup-campaign:lithography-3-12000",
    decisionFamily: "setup-campaign",
    addressedLoss: "setup-campaign",
    decision: "KEEP",
    decisionEvidence: {
      basis: "current-best-improvement",
      limitingCase: "lithography-interruption",
    },
  });
  const batchEvidence = first.manifest.iterations[3]!.decisionEvidence!;
  expect(batchEvidence.aggregate.scoreDelta < 0).toBeTrue();
  expect(batchEvidence.cases.map((item) => item.id)).toEqual(["steady-production", "mixed-quality", "quality-excursion", "lithography-interruption", "facility-interruption"]);
  expect(batchEvidence.cases.find((item) => item.id === batchEvidence.limitingCase)!.scoreDelta < -12).toBeTrue();
  expect(first.manifest.iterations[4]!.decisionEvidence!.aggregate.scoreDelta > 0).toBeTrue();
  expect(first.manifest.resultHash).toHaveLength(64);
  expect(first.manifest.best.blueprintHash).toHaveLength(64);
  expect(progress.map((event) => event.sequence)).toEqual(Array.from({ length: progress.length }, (_, index) => index + 1));
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "baseline")).toHaveLength(5);
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "seed")).toHaveLength(5);
  expect(progress.filter((event) => event.phase === "case-completed" && event.evaluation.kind === "candidate")).toHaveLength(25);
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-started", iteration: 1,
    driverEvidence: expect.objectContaining({ metricsHash: hashValue(driverMetrics), fabLoss: expect.objectContaining({ primary: expect.objectContaining({ id: "q-time" }) }) }),
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "proposal-completed", iteration: 1, strategy: "dispatch:conwip-9-6-edd", decisionFamily: "dispatch", addressedLoss: "q-time",
    driverEvidence: expect.objectContaining({ metricsHash: hashValue(driverMetrics) }),
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    phase: "candidate-completed",
    iteration: 4,
    decision: "REJECT",
    decisionEvidence: expect.objectContaining({ basis: "no-current-best-improvement", limitingCase: "lithography-interruption" }),
  }));
  expect(progress.at(-1)).toEqual(expect.objectContaining({
    phase: "run-completed",
    resultHash: first.manifest.resultHash,
    work: { completedSimulations: 35, plannedSimulations: 35 },
  }));
  const repeatedProgress: DesignRunProgress[] = [];
  const second = await runDesignProgram(copy, "greenfield-dram-fab", { maxCandidates: 5, onProgress: (event) => repeatedProgress.push(event) });
  expect(second.manifest.resultHash).toBe(first.manifest.resultHash);
  expect(repeatedProgress).toEqual(progress);
  expect(second.artifact).toEqual({ ...first.artifact, created: false });
  expect(await loadDesignRun(copy, "greenfield-dram-fab", first.manifest.resultHash)).toEqual({
    manifest: first.manifest,
    bestBlueprint: first.bestBlueprint,
    artifact: { ...first.artifact, created: false },
  });
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
