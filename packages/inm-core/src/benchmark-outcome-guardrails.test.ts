import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  blueprintBenchmarkSchema,
  evaluateBlueprintBenchmark,
  loadBlueprintBenchmark,
  lockBlueprintBenchmark,
} from "./benchmark";
import { loadFactoryProject } from "./loader";
import { subtractScoreBreakdown, sumScoreBreakdown } from "./blueprint-comparison";
import { atomicWriteJson, readJson } from "./utils";

const repository = resolve(import.meta.dir, "../../..");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function copiedMemoryFab(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "inm-outcome-guardrails-"));
  temporaryRoots.push(root);
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true });
  return projectDir;
}

test("outcome guardrail schema rejects unknown metrics, wrong directions, and non-integral count thresholds", () => {
  const benchmark = {
    version: 1,
    id: "strict-outcomes",
    name: "Strict outcomes",
    baselineBlueprint: "baseline",
    candidateBlueprint: "candidate",
    cases: [{ id: "normal", name: "Normal", world: "world", scenario: "scenario", objective: "objective", seed: 42, weight: 1 }],
    acceptance: {
      minimumAggregateScoreDelta: 0.001,
      maximumCaseScoreRegression: 0,
      requireCandidateCapacityReady: true,
    },
  };
  expect(blueprintBenchmarkSchema.safeParse({
    ...benchmark,
    acceptance: {
      ...benchmark.acceptance,
      outcomeGuardrails: [{ id: "unknown", metric: "arbitrary.path", operator: "minimum", thresholds: { normal: 1 } }],
    },
  }).success).toBeFalse();
  expect(blueprintBenchmarkSchema.safeParse({
    ...benchmark,
    acceptance: {
      ...benchmark.acceptance,
      outcomeGuardrails: [{ id: "wrong-direction", metric: "scrappedLots", operator: "minimum", thresholds: { normal: 1 } }],
    },
  }).success).toBeFalse();
  expect(blueprintBenchmarkSchema.safeParse({
    ...benchmark,
    acceptance: {
      ...benchmark.acceptance,
      outcomeGuardrails: [{ id: "fractional-count", metric: "completedLots", operator: "minimum", thresholds: { normal: 1.5 } }],
    },
  }).success).toBeFalse();
});

test("locked outcome guardrails reject a score winner with exact per-case physical evidence", async () => {
  const projectDir = await copiedMemoryFab();
  const benchmarkPath = join(projectDir, "benchmarks/product-mix-research.benchmark.json");
  const source = await readJson(benchmarkPath) as Record<string, unknown>;
  const acceptance = source.acceptance as Record<string, unknown>;
  source.acceptance = {
    ...acceptance,
    outcomeGuardrails: [{
      id: "preserve-contract-fulfillment",
      metric: "contractFulfillment",
      operator: "minimum",
      thresholds: {
        "steady-production": 0.48,
        "mixed-quality": 0.48,
      },
    }],
  };
  delete source.lock;
  await atomicWriteJson(benchmarkPath, source);
  const locked = await lockBlueprintBenchmark(projectDir, "product-mix-research");
  expect(locked.acceptance.outcomeGuardrails).toHaveLength(1);

  const result = await evaluateBlueprintBenchmark(projectDir, "product-mix-research");
  expect(result.scoreDelta).toBeGreaterThan(0);
  expect(result.accepted).toBeFalse();
  expect(result.verdict).toBe("DISCARD");
  expect(result.outcomeGuardrails).toEqual([{
    id: "preserve-contract-fulfillment",
    metric: "contractFulfillment",
    label: "Contract fulfillment",
    operator: "minimum",
    passed: false,
    cases: [
      {
        id: "steady-production",
        name: "Excursion-free production",
        baselineValue: 0.48,
        candidateValue: 0.42,
        threshold: 0.48,
        baselinePassed: true,
        candidatePassed: false,
      },
      {
        id: "mixed-quality",
        name: "Mixed-quality production",
        baselineValue: 0.48,
        candidateValue: 0.42,
        threshold: 0.48,
        baselinePassed: true,
        candidatePassed: false,
      },
    ],
  }]);
  expect(result.reasons).toEqual([
    "outcome guardrail 'preserve-contract-fulfillment' failed in case 'steady-production': contractFulfillment 0.420000 must be >= 0.480000",
    "outcome guardrail 'preserve-contract-fulfillment' failed in case 'mixed-quality': contractFulfillment 0.420000 must be >= 0.480000",
  ]);
  expect((await loadBlueprintBenchmark(projectDir, "product-mix-research")).lock?.contractHash)
    .toBe(locked.lock?.contractHash);
}, 15_000);

test("memory-fab on-time service rejects score-positive inspection maintenance", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const loaded = await loadFactoryProject(projectDir, { blueprint: "generated-dram-fab" });
  const candidateBlueprint = structuredClone(loaded.blueprint);
  const inspection = candidateBlueprint.devices.find((device) => device.id === "inspection-1")!;
  inspection.policy = {
    ...inspection.policy,
    preventiveMaintenance: { planned: { afterJobs: 4 } },
  };

  const result = await evaluateBlueprintBenchmark(projectDir, "greenfield-dram-design", { candidateBlueprint });
  expect(result.scoreDelta).toBeGreaterThan(0);
  expect(result.verdict).toBe("DISCARD");
  expect(result.outcomeGuardrails?.filter((guardrail) => !guardrail.passed)).toEqual([
    expect.objectContaining({
      id: "preserve-on-time-service",
      metric: "onTimeLots",
      cases: [
        expect.objectContaining({ id: "steady-production", candidateValue: 12, threshold: 12, candidatePassed: true }),
        expect.objectContaining({ id: "mixed-quality", candidateValue: 9, threshold: 10, candidatePassed: false }),
        expect.objectContaining({ id: "quality-excursion", candidateValue: 8, threshold: 8, candidatePassed: true }),
        expect.objectContaining({ id: "lithography-interruption", candidateValue: 7, threshold: 7, candidatePassed: true }),
        expect.objectContaining({ id: "facility-interruption", candidateValue: 8, threshold: 9, candidatePassed: false }),
      ],
    }),
  ]);
  expect(result.reasons).toEqual([
    "outcome guardrail 'preserve-on-time-service' failed in case 'mixed-quality': onTimeLots 9.000000 must be >= 10.000000",
    "outcome guardrail 'preserve-on-time-service' failed in case 'facility-interruption': onTimeLots 8.000000 must be >= 9.000000",
  ]);
}, 30_000);

test("memory-fab advanced recovery exposes exact Objective score causality", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const loaded = await loadFactoryProject(projectDir, { blueprint: "generated-dram-fab" });
  const incumbentBlueprint = structuredClone(loaded.blueprint);
  const incumbentEtch = incumbentBlueprint.devices.find((device) => device.id === "etch-l2")!;
  incumbentEtch.asset = "plasma-etch-bay";
  incumbentEtch.recipes![0]!.mode = "qualified";
  const incumbentRecovery = incumbentBlueprint.devices.find((device) => device.id === "rework-1")!;
  incumbentRecovery.asset = "pattern-rework-bay";
  incumbentRecovery.recipe!.process = "rework-final-pattern";
  incumbentBlueprint.policies.lotRelease = {
    kind: "conwip",
    maximumWip: 7,
    reopenAtWip: 4,
    maximumReleaseDelayTicks: 30_000,
    dispatch: "earliest-due-date",
  };
  for (const recipe of incumbentBlueprint.devices.find((device) => device.id === "burn-in-1")!.recipes!) {
    recipe.mode = "qualified";
  }
  const candidateBlueprint = structuredClone(incumbentBlueprint);
  const recovery = candidateBlueprint.devices.find((device) => device.id === "rework-1")!;
  recovery.asset = "advanced-pattern-recovery-cell";
  recovery.recipe!.process = "recover-final-pattern-advanced";
  candidateBlueprint.policies.lotRelease = {
    kind: "conwip",
    maximumWip: 6,
    reopenAtWip: 3,
    maximumReleaseDelayTicks: 18_000,
    dispatch: "earliest-due-date",
  };

  const [incumbent, branch] = await Promise.all([
    evaluateBlueprintBenchmark(projectDir, "greenfield-dram-design", { candidateBlueprint: incumbentBlueprint }),
    evaluateBlueprintBenchmark(projectDir, "greenfield-dram-design", { candidateBlueprint }),
  ]);
  const incumbentInterruption = incumbent.cases.find((item) => item.id === "lithography-interruption")!;
  const branchInterruption = branch.cases.find((item) => item.id === "lithography-interruption")!;
  const scoreDelta = branchInterruption.candidateScore - incumbentInterruption.candidateScore;
  const breakdownDelta = subtractScoreBreakdown(
    incumbentInterruption.candidateMetrics.scoreBreakdown,
    branchInterruption.candidateMetrics.scoreBreakdown,
  );
  expect(scoreDelta).toBeCloseTo(-1.10020878787879, 12);
  expect(breakdownDelta.wip).toBeCloseTo(-1.2027500000000018, 12);
  expect(breakdownDelta.energy).toBeCloseTo(-0.00604, 12);
  expect(breakdownDelta.buildCost).toBeCloseTo(-0.005, 12);
  expect(breakdownDelta.cycleTime).toBeCloseTo(0.0725460606060607, 12);
  expect(breakdownDelta.tardiness).toBeCloseTo(0.04103515151515154, 12);
  expect(sumScoreBreakdown(incumbentInterruption.candidateMetrics.scoreBreakdown)).toBeCloseTo(incumbentInterruption.candidateScore, 12);
  expect(sumScoreBreakdown(branchInterruption.candidateMetrics.scoreBreakdown)).toBeCloseTo(branchInterruption.candidateScore, 12);
  expect(sumScoreBreakdown(breakdownDelta)).toBeCloseTo(scoreDelta, 12);
}, 60_000);

test("benchmark loading rejects unknown cases and duplicate metric-case ownership", async () => {
  const projectDir = await copiedMemoryFab();
  const benchmarkPath = join(projectDir, "benchmarks/product-mix-research.benchmark.json");
  const source = await readJson(benchmarkPath) as Record<string, unknown>;
  const acceptance = source.acceptance as Record<string, unknown>;
  source.acceptance = {
    ...acceptance,
    outcomeGuardrails: [{
      id: "unknown-case",
      metric: "firstPassYield",
      operator: "minimum",
      thresholds: { "not-a-case": 0.5 },
    }],
  };
  await atomicWriteJson(benchmarkPath, source);
  await expect(loadBlueprintBenchmark(projectDir, "product-mix-research"))
    .rejects.toThrow("names unknown case 'not-a-case'");

  source.acceptance = {
    ...acceptance,
    outcomeGuardrails: [
      { id: "first", metric: "firstPassYield", operator: "minimum", thresholds: { "mixed-quality": 0.5 } },
      { id: "second", metric: "firstPassYield", operator: "minimum", thresholds: { "mixed-quality": 0.6 } },
    ],
  };
  await atomicWriteJson(benchmarkPath, source);
  await expect(loadBlueprintBenchmark(projectDir, "product-mix-research"))
    .rejects.toThrow("guards outcome metric 'firstPassYield' more than once for case 'mixed-quality'");
});
