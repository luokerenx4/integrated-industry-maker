import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  compareFactoryRuns,
  factoryRunComparisonEvidenceHash,
} from "./run-comparison";

const memoryFab = resolve("examples/memory-fab");

test("immutable Run comparison explains the commissioned compact inspection-rework cell", async () => {
  const comparison = await compareFactoryRuns(memoryFab, "100-simulate", "101-simulate");

  expect(comparison).toMatchObject({
    version: 1,
    project: { id: "memory-fab" },
    context: {
      engineVersion: "inm-sim/0.90.0",
      seed: 42,
      durationTicks: 240_000,
    },
    from: {
      run: { id: "100-simulate", resultHash: "5302c842062cb8f5785dff1387f89a26439f3b510ca86126b621ac3fca013a06" },
      hashes: { blueprintHash: "6b8b0ce24a75de511162b1d090c4c15fedd0e976dd1764d173e918d76a5832fe" },
    },
    to: {
      run: { id: "101-simulate", resultHash: "d0a140643718af750433d62a12f0fb1ba668408daa16142c1cfb13d552b33b3e" },
      hashes: { blueprintHash: "16ca367007ed24ae37678e214d37b1559525d83bf7035667d585b205123f1bb7" },
    },
    verdict: "IMPROVED",
  });
  expect(comparison.delta).toEqual(expect.objectContaining({
    score: 0.5049999999999955,
    totalBuildCost: -100,
    occupiedArea: -10,
    meanTransportTimeTicks: -166.66666666666788,
    completedLots: 0,
    onTimeLots: 0,
    goodYield: 0,
    firstPassYield: 0,
    qualityEscapes: 0,
    reworkCycles: 0,
    scrappedLots: 0,
  }));
  expect(comparison.from.metrics).toEqual(expect.objectContaining({
    score: -0.306590271944454,
    totalBuildCost: 229_940,
    occupiedArea: 269,
    completedLots: 12,
    onTimeLots: 12,
    goodYield: 1,
    firstPassYield: 10 / 12,
    qualityEscapes: 0,
    reworkCycles: 2,
    scrappedLots: 0,
  }));
  expect(comparison.to.metrics).toEqual(expect.objectContaining({
    score: 0.19840972805554147,
    totalBuildCost: 229_840,
    occupiedArea: 259,
    completedLots: 12,
    onTimeLots: 12,
    goodYield: 1,
    firstPassYield: 10 / 12,
    qualityEscapes: 0,
    reworkCycles: 2,
    scrappedLots: 0,
  }));
  expect(comparison.from.capacityPlan.ready).toBeTrue();
  expect(comparison.to.capacityPlan.ready).toBeTrue();
  expect(comparison.from.metrics.objectiveConstraints.every((constraint) => constraint.passed)).toBeTrue();
  expect(comparison.to.metrics.objectiveConstraints.every((constraint) => constraint.passed)).toBeTrue();

  expect(comparison.changes.map((change) => [change.kind, change.id, change.fields])).toEqual([
    ["device", "inspection-to-rework-unloader", ["position.x"]],
    ["device", "rework-1", ["position.x"]],
    ["device", "rework-to-inspection-loader", ["position.x"]],
    ["connection", "inspection-to-rework", ["path"]],
    ["connection", "rework-to-inspection", ["path"]],
    ["metadata", "revision", ["revision"]],
  ]);
  expect(comparison.patch).toHaveLength(32);

  const starvation = comparison.losses.buckets.find((bucket) => bucket.id === "input-starvation")!;
  expect(starvation.from?.evidence.starvationTicks).toBe(245_026);
  expect(starvation.to?.evidence.starvationTicks).toBe(244_026);
  expect(starvation.from?.leadingContributor?.evidence.starvationTicks).toBe(57_984);
  expect(starvation.to?.leadingContributor?.evidence.starvationTicks).toBe(56_984);

  const queue = comparison.losses.buckets.find((bucket) => bucket.id === "queue-congestion")!;
  expect(queue.leadingContributorChanged).toBeTrue();
  expect(queue.from?.leadingContributor?.label).toBe("etch-1");
  expect(queue.to?.leadingContributor?.label).toBe("probe-1");
  expect(comparison.navigation).toEqual(expect.objectContaining({
    studioRoute: "/memory-fab/runs?from=100-simulate&to=101-simulate",
    fromFactoryRoute: "/memory-fab/factory?run=100-simulate",
    toFactoryRoute: "/memory-fab/factory?run=101-simulate",
  }));
  expect(comparison.navigation.changedSubjects).toHaveLength(5);
  const evidenceHash = factoryRunComparisonEvidenceHash(comparison);
  expect(evidenceHash).toMatch(/^[0-9a-f]{64}$/);
  expect(factoryRunComparisonEvidenceHash({
    ...comparison,
    project: { ...comparison.project, name: "Copied project", rootDir: "/copied/project" },
    navigation: { ...comparison.navigation, studioRoute: "/presentation-only-route" },
  })).toBe(evidenceHash);
  expect(factoryRunComparisonEvidenceHash({
    ...comparison,
    delta: { ...comparison.delta, score: comparison.delta.score + 1 },
  })).not.toBe(evidenceHash);
});

test("immutable Run comparison rejects missing and identical evidence identities", async () => {
  await expect(compareFactoryRuns(memoryFab, "100-simulate", "100-simulate"))
    .rejects.toMatchObject({ code: "run-comparison.same-run" });
  await expect(compareFactoryRuns(memoryFab, "missing-run", "101-simulate"))
    .rejects.toMatchObject({ code: "run-comparison.unknown-run" });
});
