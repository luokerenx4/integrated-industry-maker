import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, expect, test } from "bun:test";
import { buildDesignProgramBrief, listDesignPrograms, loadDesignProgram } from "./design-program";
import { listDesignRuns, loadDesignRun, promoteDesignRun, runDesignProgram, type DesignRunManifest } from "./design-run";
import { applyResearchPatch } from "./research";
import { loadCandidateChangeSet } from "./candidate-change-set";
import { atomicWriteJson, hashValue } from "./utils";

const projectDir = resolve("examples/memory-fab");
const temporaryDirectories: string[] = [];
afterAll(async () => { await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))); });

test("memory-fab exposes one strict project-local Design Program and a read-only brief", async () => {
  const programs = await listDesignPrograms(projectDir);
  expect(programs).toEqual([expect.objectContaining({
    id: "integrated-dram-fab",
    benchmark: "dispatch-research",
    seedBlueprint: "experiment",
    driverCase: "mixed-quality",
    locked: true,
    budget: { maxCandidates: 6 },
  })]);
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
});

test("Design Program validation rejects unknown fields and cross-contract drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-program-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const path = join(copy, "design-programs", "integrated-dram-fab.design.json");
  const program = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify({ ...program, surprise: true }, null, 2)}\n`);
  await expect(loadDesignProgram(copy, "integrated-dram-fab")).rejects.toThrow("Unrecognized key");
  delete program.surprise;
  program.seedBlueprint = "baseline";
  await writeFile(path, `${JSON.stringify(program, null, 2)}\n`);
  await expect(buildDesignProgramBrief(copy, "integrated-dram-fab")).rejects.toThrow("must equal Benchmark candidate Blueprint");
});

test("a bounded Design Program run is deterministic, immutable, and leaves the seed Blueprint untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-run-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const blueprintPath = join(copy, "blueprints", "experiment.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  const first = await runDesignProgram(copy, "integrated-dram-fab", { maxCandidates: 1 });
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
  expect(first.artifact).toMatchObject({ created: true });
  expect(first.artifact.path.startsWith(join(copy, "design-runs", "integrated-dram-fab"))).toBeTrue();
  expect(first.manifest).toMatchObject({
    status: "completed",
    project: "memory-fab",
    program: { id: "integrated-dram-fab" },
    benchmark: { id: "dispatch-research" },
    budget: { maximum: 1, evaluated: 1 },
  });
  expect(first.manifest.iterations[0]).toMatchObject({
    iteration: 1,
    decisionFamily: expect.any(String),
    proposalHash: expect.any(String),
    decision: expect.stringMatching(/KEEP|REJECT/),
  });
  expect(first.manifest.resultHash).toHaveLength(64);
  expect(first.manifest.best.blueprintHash).toHaveLength(64);
  const second = await runDesignProgram(copy, "integrated-dram-fab", { maxCandidates: 1 });
  expect(second.manifest.resultHash).toBe(first.manifest.resultHash);
  expect(second.artifact).toEqual({ ...first.artifact, created: false });
  expect(await loadDesignRun(copy, "integrated-dram-fab", first.manifest.resultHash)).toEqual({
    manifest: first.manifest,
    bestBlueprint: first.bestBlueprint,
    artifact: { ...first.artifact, created: false },
  });
  expect(await listDesignRuns(copy, "integrated-dram-fab")).toEqual([
    expect.objectContaining({ id: first.manifest.resultHash, program: "integrated-dram-fab", benchmark: "dispatch-research" }),
  ]);
  if (first.manifest.best.iteration === 0) {
    await expect(promoteDesignRun(copy, "integrated-dram-fab", first.manifest.resultHash, "no-leading-design"))
      .rejects.toMatchObject({ code: "design.no-leading-candidate" });
  }
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
}, 120_000);

test("a leading Design Run is promoted as one exact hash-pinned Candidate without applying it", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-design-promote-"));
  temporaryDirectories.push(root);
  const copy = join(root, "memory-fab");
  await cp(projectDir, copy, { recursive: true, filter: (source) => !source.split("/").includes("design-runs") });
  const seedPath = join(copy, "blueprints", "experiment.blueprint.json");
  const seedBefore = await readFile(seedPath, "utf8");
  const original = await runDesignProgram(copy, "integrated-dram-fab", { maxCandidates: 1 });
  const bestBlueprint = structuredClone(original.bestBlueprint);
  bestBlueprint.revision = original.manifest.seed.hash;
  bestBlueprint.devices[0]!.config = { ...bestBlueprint.devices[0]!.config, promotionFixture: true };
  const blueprintHash = hashValue(bestBlueprint);
  const keptIteration = {
    ...original.manifest.iterations[0]!,
    decision: "KEEP" as const,
    hypothesis: "Exercise exact Design Run promotion with a harmless project-valid Device configuration change.",
    candidateBlueprintHash: blueprintHash,
    candidateScore: original.manifest.best.candidateScore + 1,
    scoreDeltaFromBest: 1,
  };
  const { resultHash: _originalResultHash, ...originalWithoutHash } = original.manifest;
  const withoutHash: Omit<DesignRunManifest, "resultHash"> = {
    ...originalWithoutHash,
    iterations: [keptIteration],
    best: {
      ...original.manifest.best,
      iteration: 1,
      blueprintHash,
      candidateScore: original.manifest.best.candidateScore + 1,
      scoreDelta: original.manifest.best.scoreDelta + 1,
    },
  };
  const resultHash = hashValue(withoutHash);
  const manifest: DesignRunManifest = { ...withoutHash, resultHash };
  const artifactPath = join(copy, "design-runs", "integrated-dram-fab", resultHash);
  await atomicWriteJson(join(artifactPath, "best.blueprint.json"), bestBlueprint);
  await atomicWriteJson(join(artifactPath, "manifest.json"), manifest);

  const promoted = await promoteDesignRun(copy, "integrated-dram-fab", resultHash, "promoted-leading-design");
  const candidate = await loadCandidateChangeSet(copy, "promoted-leading-design");
  expect(promoted.candidate).toEqual(candidate);
  expect(candidate).toMatchObject({
    benchmark: "dispatch-research",
    baseCandidateHash: original.manifest.seed.hash,
    source: { kind: "design-run", program: "integrated-dram-fab", resultHash, blueprintHash },
  });
  const replayed = applyResearchPatch(original.bestBlueprint, candidate.patch);
  replayed.revision = original.manifest.seed.hash;
  expect(hashValue(replayed)).toBe(blueprintHash);
  expect(await readFile(seedPath, "utf8")).toBe(seedBefore);
}, 90_000);
