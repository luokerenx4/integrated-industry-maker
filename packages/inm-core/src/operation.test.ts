import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, test } from "bun:test";
import {
  applyCandidateOperation,
  analyzeProjectOperation,
  evaluateBenchmarkOperation,
  planProjectOperation,
  previewCandidateOperation,
  simulateCandidateOperation,
  simulateProjectOperation,
  validateProjectOperation,
} from "./operation";
import {
  evaluateBlueprintBenchmark,
  evaluatePreparedBlueprintBenchmark,
  prepareBlueprintBenchmark,
  type BlueprintBenchmarkProgress,
} from "./benchmark";
import { createBenchmarkCaseExecutor, resolveBenchmarkCaseExecution } from "./benchmark-case-execution";
import { inspectCandidateDecision } from "./candidate-review";
import { previewCandidateChangeSet } from "./candidate-change-set";
import type { SimulationResult } from "./types";
import { hashValue, stableStringify } from "./utils";

const repository = resolve(import.meta.dir, "../../..");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryProject(example: "ironworks" | "memory-fab"): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), `inm-operation-${example}-`));
  temporaryDirectories.push(parent);
  const projectDir = join(parent, example);
  const source = join(repository, "examples", example);
  const excluded = [join(source, "runs"), join(source, ".inm")];
  await cp(source, projectDir, {
    recursive: true,
    filter: (path) => excluded.every((directory) => path !== directory && !path.startsWith(`${directory}/`)),
  });
  return projectDir;
}

test("named read-only operations share one serializable result contract", async () => {
  const projectDir = await temporaryProject("ironworks");
  const [validation, analysis, plan] = await Promise.all([
    validateProjectOperation(projectDir),
    analyzeProjectOperation(projectDir),
    planProjectOperation(projectDir),
  ]);

  for (const result of [validation, analysis, plan]) {
    expect(result).toEqual(expect.objectContaining({
      version: 1,
      status: "completed",
      effect: "read-only",
      durationMs: expect.any(Number),
      context: expect.objectContaining({ project: expect.objectContaining({ id: "ironworks", rootDir: projectDir }), hashes: expect.any(Object) }),
      artifacts: [],
      writeSet: [],
      verification: expect.any(Array),
    }));
  }
  expect(validation.data.valid).toBeTrue();
  expect(analysis.data.productionGraph.targetResource).toBe("gear");
  expect(plan.data.targetResource).toBe("gear");
});

test("simulation declares and reuses one immutable run artifact", async () => {
  const projectDir = await temporaryProject("ironworks");
  const first = await simulateProjectOperation(projectDir, {}, { seed: 17, untilTick: 5_000 });
  const second = await simulateProjectOperation(projectDir, {}, { seed: 17, untilTick: 5_000 });

  expect(first).toEqual(expect.objectContaining({
    operation: "simulate",
    effect: "creates-artifact",
    artifacts: [expect.objectContaining({ kind: "run", immutable: true })],
    writeSet: [`runs/${first.data.run.id}/`],
  }));
  expect(first.data.cached).toBeFalse();
  expect(second.data.cached).toBeTrue();
  expect(second.data.resultHash).toBe(first.data.resultHash);
  expect(second.data.run).toEqual(first.data.run);
  expect(second.writeSet).toEqual([]);
});

test("Benchmark evaluation uses the same operation result model without writes", async () => {
  const projectDir = await temporaryProject("ironworks");
  const candidatePath = join(projectDir, "blueprints", "power-priority-candidate.blueprint.json");
  const before = await readFile(candidatePath, "utf8");
  const firstProgress: BlueprintBenchmarkProgress[] = [];
  const repeatedProgress: BlueprintBenchmarkProgress[] = [];
  const benchmark = await evaluateBenchmarkOperation(projectDir, "power-priority", { onProgress: (progress) => firstProgress.push(progress) });
  const repeated = await evaluateBenchmarkOperation(projectDir, "power-priority", { onProgress: (progress) => repeatedProgress.push(progress) });

  expect(benchmark).toEqual(expect.objectContaining({ operation: "benchmark.evaluate", effect: "read-only", writeSet: [], artifacts: [] }));
  expect(benchmark.data.benchmark).toBe("power-priority");
  expect(benchmark.data.baselineCache).toEqual({ hits: 0, misses: benchmark.data.cases.length });
  expect(repeated.data.baselineCache).toEqual({ hits: repeated.data.cases.length, misses: 0 });
  expect({ ...repeated.data, baselineCache: benchmark.data.baselineCache }).toEqual(benchmark.data);
  expect(await readFile(candidatePath, "utf8")).toBe(before);
  expect(firstProgress.map((progress) => progress.sequence)).toEqual([1, 2, 3, 4]);
  expect(firstProgress.map((progress) => progress.work.completed)).toEqual([0, 1, 1, 2]);
  expect(firstProgress.every((progress) => progress.version === 3 && progress.work.total === 2)).toBeTrue();
  expect(firstProgress[1]).toEqual(expect.objectContaining({
    phase: "baseline-case-completed",
    cached: false,
    timing: expect.objectContaining({ durationMs: expect.any(Number), compileMs: expect.any(Number), cacheReadMs: expect.any(Number), evaluationMs: expect.any(Number) }),
  }));
  expect(firstProgress[3]).toEqual(expect.objectContaining({
    phase: "candidate-case-completed",
    timing: expect.objectContaining({ durationMs: expect.any(Number), compileMs: expect.any(Number), evaluationMs: expect.any(Number), comparisonMs: expect.any(Number) }),
  }));
  expect(repeatedProgress[1]).toEqual(expect.objectContaining({ phase: "baseline-case-completed", cached: true }));
});

test("aborting observable Benchmark work never emits a Candidate verdict or mutates its Blueprint", async () => {
  const projectDir = await temporaryProject("ironworks");
  const candidatePath = join(projectDir, "blueprints", "power-priority-candidate.blueprint.json");
  const before = await readFile(candidatePath, "utf8");
  const abort = new AbortController();
  const progress: BlueprintBenchmarkProgress[] = [];

  await expect(evaluateBenchmarkOperation(projectDir, "power-priority", {
    signal: abort.signal,
    onProgress: (event) => {
      progress.push(event);
      if (event.phase === "baseline-case-completed") abort.abort();
    },
  })).rejects.toMatchObject({ name: "AbortError" });

  expect(progress.some((event) => event.phase.startsWith("candidate"))).toBeFalse();
  expect(await readFile(candidatePath, "utf8")).toBe(before);
}, 15_000);

test("parallel Benchmark cases preserve exact ordered evidence and terminate cooperatively", async () => {
  const projectDir = await temporaryProject("memory-fab");
  const prepared = await prepareBlueprintBenchmark(projectDir, "greenfield-dram-design");
  const sequentialProgress: BlueprintBenchmarkProgress[] = [];
  const parallelProgress: BlueprintBenchmarkProgress[] = [];
  let sequentialTrace: SimulationResult | undefined;
  let parallelTrace: SimulationResult | undefined;
  const executor = createBenchmarkCaseExecutor(resolveBenchmarkCaseExecution(prepared.cases.length, "parallel"));
  const sequential = await evaluatePreparedBlueprintBenchmark(prepared, {
    caseExecution: "sequential",
    traceCaseId: "mixed-quality",
    onTraceCaseEvaluated: ({ simulation }) => { sequentialTrace = simulation; },
    onProgress: (progress) => sequentialProgress.push(progress),
  });
  const parallel = await evaluatePreparedBlueprintBenchmark(prepared, {
    caseExecution: "parallel",
    caseExecutor: executor,
    traceCaseId: "mixed-quality",
    onTraceCaseEvaluated: ({ simulation }) => { parallelTrace = simulation; },
    onProgress: (progress) => parallelProgress.push(progress),
  });
  const repeatedProgress: BlueprintBenchmarkProgress[] = [];
  const repeated = await evaluatePreparedBlueprintBenchmark(prepared, {
    caseExecution: "parallel",
    caseExecutor: executor,
    onProgress: (progress) => repeatedProgress.push(progress),
  });

  expect(stableStringify(parallel)).toBe(stableStringify(sequential));
  expect(stableStringify(repeated)).toBe(stableStringify(sequential));
  expect(sequentialTrace).toBeDefined();
  expect(parallelTrace).toBeDefined();
  expect(hashValue(parallelTrace)).toBe(hashValue(sequentialTrace));
  const caseOrder = prepared.cases.map((item) => item.manifest.id);
  expect(parallelProgress.filter((item) => item.phase === "candidate-case-started").map((item) => item.case.id)).toEqual(caseOrder);
  expect(parallelProgress.filter((item) => item.phase === "candidate-case-completed").map((item) => item.case.id)).toEqual(caseOrder);
  expect(parallelProgress.map((item) => item.sequence)).toEqual(Array.from({ length: 10 }, (_, index) => index + 11));
  expect(parallelProgress.every((item) => item.execution.mode === "parallel" && item.execution.concurrency === 5)).toBeTrue();
  expect(parallelProgress.filter((item) => item.phase === "candidate-case-completed")
    .every((item) => item.timing.workerReused === false && (item.timing.workerStartupMs ?? 0) > 0)).toBeTrue();
  expect(repeatedProgress.filter((item) => item.phase === "candidate-case-completed")
    .every((item) => item.timing.workerReused === true && item.timing.workerStartupMs === 0)).toBeTrue();
  expect(executor.stats()).toEqual({ workerStarts: 5, completedJobs: 10, completedWaves: 2 });
  executor.dispose();

  const abort = new AbortController();
  let starts = 0;
  await expect(evaluatePreparedBlueprintBenchmark(prepared, {
    caseExecution: "parallel",
    signal: abort.signal,
    onProgress: (progress) => {
      if (progress.phase === "candidate-case-started" && ++starts === prepared.cases.length) abort.abort();
    },
  })).rejects.toMatchObject({ name: "AbortError" });
  expect(starts).toBe(prepared.cases.length);
}, 45_000);

test("background Benchmark execution shares one isolated Worker across cold baseline and candidate evidence", async () => {
  const projectDir = await temporaryProject("memory-fab");
  const executor = createBenchmarkCaseExecutor(resolveBenchmarkCaseExecution(1, "background"));
  const progress: BlueprintBenchmarkProgress[] = [];
  let isolatedTrace: SimulationResult | undefined;
  const isolated = await evaluateBlueprintBenchmark(projectDir, "equipment-energy-research", {
    caseExecution: "background",
    caseExecutor: executor,
    traceCaseId: "equipment-energy-window",
    onTraceCaseEvaluated: ({ simulation }) => { isolatedTrace = simulation; },
    onProgress: (event) => progress.push(event),
  });
  let sequentialTrace: SimulationResult | undefined;
  const sequential = await evaluateBlueprintBenchmark(projectDir, "equipment-energy-research", {
    caseExecution: "sequential",
    traceCaseId: "equipment-energy-window",
    onTraceCaseEvaluated: ({ simulation }) => { sequentialTrace = simulation; },
  });

  expect(stableStringify(isolated)).toBe(stableStringify(sequential));
  expect(hashValue(isolatedTrace)).toBe(hashValue(sequentialTrace));
  expect(progress.map((event) => event.phase)).toEqual([
    "baseline-case-started",
    "baseline-case-completed",
    "candidate-case-started",
    "candidate-case-completed",
  ]);
  expect(progress.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
  expect(progress.every((event) => event.execution.mode === "isolated"
    && event.execution.concurrency === 1)).toBeTrue();
  expect(progress[1]!.cached).toBeFalse();
  expect(progress[1]!.timing).toEqual(expect.objectContaining({
    workerReused: false,
    workerSlot: 0,
  }));
  expect(progress[3]!.timing).toEqual(expect.objectContaining({
    workerReused: true,
    workerSlot: 0,
  }));
  expect(executor.stats()).toEqual({ workerStarts: 1, completedJobs: 2, completedWaves: 2 });
  executor.dispose();
}, 20_000);

test("aborting after Candidate simulation cannot record a partial review receipt", async () => {
  const projectDir = await temporaryProject("memory-fab");
  const abort = new AbortController();
  const beforeDecision = await inspectCandidateDecision(projectDir, "stable-furnace-sleep");

  await expect(previewCandidateOperation(projectDir, "stable-furnace-sleep", {
    signal: abort.signal,
    onProgress: (event) => {
      if (event.phase === "candidate-case-completed") abort.abort();
    },
  })).rejects.toMatchObject({ name: "AbortError" });

  expect(await inspectCandidateDecision(projectDir, "stable-furnace-sleep")).toEqual(beforeDecision);
}, 15_000);

test("Candidate apply requires project-local immutable review evidence", async () => {
  const projectDir = await temporaryProject("memory-fab");
  const blueprintPath = join(projectDir, "blueprints/equipment-energy-sleep.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  const unrecorded = await previewCandidateChangeSet(projectDir, "stable-furnace-sleep");
  await expect(applyCandidateOperation(projectDir, "stable-furnace-sleep", unrecorded)).rejects.toMatchObject({ code: "candidate.review-required" });
  expect(await readFile(blueprintPath, "utf8")).toBe(before);
}, 15_000);

test("a reviewed Candidate freezes one reusable TRIAL Run without applying its Blueprint", async () => {
  const projectDir = await temporaryProject("memory-fab");
  const blueprintPath = join(projectDir, "blueprints/equipment-energy-sleep.blueprint.json");
  const before = await readFile(blueprintPath, "utf8");
  const operation = await simulateCandidateOperation(projectDir, "stable-furnace-sleep", {}, { seed: 42 });

  expect(operation).toEqual(expect.objectContaining({
    operation: "candidate.simulate",
    effect: "creates-artifact",
    writeSet: [expect.stringContaining("runs/")],
    artifacts: [expect.objectContaining({ kind: "run", immutable: true })],
    data: expect.objectContaining({
      cached: false,
      candidate: expect.objectContaining({
        id: "stable-furnace-sleep",
        reviewVerdict: "DISCARD",
        proposalHash: expect.any(String),
        reviewResultHash: expect.any(String),
        parentRun: null,
      }),
    }),
  }));
  const manifest = JSON.parse(await readFile(join(operation.data.run.path, "manifest.json"), "utf8"));
  expect(manifest).toEqual(expect.objectContaining({
    decision: "TRIAL",
    candidate: {
      id: "stable-furnace-sleep",
      proposalHash: operation.data.candidate.proposalHash,
      reviewResultHash: operation.data.candidate.reviewResultHash,
      reviewVerdict: "DISCARD",
    },
  }));
  expect(await readFile(join(operation.data.run.path, "hypothesis.md"), "utf8")).toContain("sleep threshold");
  expect(JSON.parse(await readFile(join(operation.data.run.path, "patch.json"), "utf8"))).toBeArray();
  expect(await readFile(blueprintPath, "utf8")).toBe(before);

  const replay = await simulateCandidateOperation(projectDir, "stable-furnace-sleep", {}, { seed: 42 });
  expect(replay.data.cached).toBeTrue();
  expect(replay.data.run.id).toBe(operation.data.run.id);
  expect(replay.writeSet).toEqual([]);
}, 15_000);
