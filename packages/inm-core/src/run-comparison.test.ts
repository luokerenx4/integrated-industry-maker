import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { simulateProjectOperation } from "./operation";
import {
  compareFactoryRuns,
  factoryRunComparisonEvidenceHash,
} from "./run-comparison";

const memoryFab = resolve("examples/memory-fab");

test("immutable Run comparison explains the commissioned compact inspection-rework cell", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-run-comparison-"));
  const projectDir = join(root, "memory-fab");
  await cp(memoryFab, projectDir, { recursive: true });
  try {
    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    await writeFile(blueprintPath, await readFile(join(projectDir, "runs/100-simulate/blueprint.json"), "utf8"));
    const fromOperation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    await writeFile(blueprintPath, await readFile(join(projectDir, "runs/101-simulate/blueprint.json"), "utf8"));
    const toOperation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    const fromRunId = fromOperation.data.run.id;
    const toRunId = toOperation.data.run.id;
    const comparison = await compareFactoryRuns(projectDir, fromRunId, toRunId);

    expect(comparison).toMatchObject({
    version: 1,
    project: { id: "memory-fab" },
    context: {
      engineVersion: "inm-sim/0.91.0",
      seed: 42,
      durationTicks: 240_000,
    },
    from: {
      run: { id: fromRunId },
      hashes: { blueprintHash: "6b8b0ce24a75de511162b1d090c4c15fedd0e976dd1764d173e918d76a5832fe" },
    },
    to: {
      run: { id: toRunId },
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
      studioRoute: `/memory-fab/runs?from=${fromRunId}&to=${toRunId}`,
      fromFactoryRoute: `/memory-fab/factory?run=${fromRunId}`,
      toFactoryRoute: `/memory-fab/factory?run=${toRunId}`,
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("immutable Run comparison rejects missing and identical evidence identities", async () => {
  await expect(compareFactoryRuns(memoryFab, "100-simulate", "100-simulate"))
    .rejects.toMatchObject({ code: "run-comparison.same-run" });
  await expect(compareFactoryRuns(memoryFab, "missing-run", "101-simulate"))
    .rejects.toMatchObject({ code: "run-comparison.unknown-run" });
});
