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
