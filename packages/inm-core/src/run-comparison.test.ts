import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { simulateProjectOperation } from "./operation";
import {
  compareFactoryRuns,
  factoryRunComparisonEvidenceHash,
  inspectFactoryRunComparison,
} from "./run-comparison";

const memoryFab = resolve("examples/memory-fab");

test("immutable Run comparison explains the commissioned compact inspection-rework cell", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-run-comparison-"));
  const projectDir = join(root, "memory-fab");
  const beforeBlueprint = await readFile(join(memoryFab, "runs/100-simulate/blueprint.json"), "utf8");
  const afterBlueprint = await readFile(join(memoryFab, "runs/101-simulate/blueprint.json"), "utf8");
  await cp(memoryFab, projectDir, { recursive: true });
  try {
    await rm(join(projectDir, "runs"), { recursive: true, force: true });
    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    await writeFile(blueprintPath, beforeBlueprint);
    const fromOperation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    await writeFile(blueprintPath, afterBlueprint);
    const toOperation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    const fromRunId = fromOperation.data.run.id;
    const toRunId = toOperation.data.run.id;
    const inspected = await inspectFactoryRunComparison(projectDir, fromRunId, toRunId);
    const comparison = inspected.comparison;
    expect(inspected.toDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^fab-loss\./),
        evidence: expect.objectContaining({ runId: toRunId }),
      }),
    ]));

  expect(comparison).toMatchObject({
    version: 2,
    project: { id: "memory-fab" },
    context: {
      engineVersion: "inm-sim/0.93.1",
      seed: 42,
      durationTicks: 240_000,
    },
    intervention: {
      kind: "blueprint",
      from: { hash: "6b8b0ce24a75de511162b1d090c4c15fedd0e976dd1764d173e918d76a5832fe" },
      to: { hash: "16ca367007ed24ae37678e214d37b1559525d83bf7035667d585b205123f1bb7" },
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

test("immutable Run comparison isolates one Production Plan intervention and exposes removed production", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-plan-run-comparison-"));
  const projectDir = join(root, "memory-fab");
  await cp(memoryFab, projectDir, { recursive: true });
  try {
    const control = await simulateProjectOperation(
      projectDir,
      { productionPlan: "production-window" },
      { seed: 42 },
    );
    const source = JSON.parse(await readFile(
      join(projectDir, "production-plans/production-window.production-plan.json"),
      "utf8",
    )) as {
      id: string;
      name: string;
      lotReleases: Array<{ id: string }>;
      materialDeliveries: Array<{ id: string }>;
    };
    const intervention = {
      ...source,
      id: "eleven-lot-burn-in-horizon",
      name: "Eleven-lot burn-in horizon alignment",
      lotReleases: source.lotReleases.filter((item) => item.id !== "dram-lot-12"),
      materialDeliveries: source.materialDeliveries.filter((item) => item.id !== "substrate-delivery-12"),
    };
    await writeFile(
      join(projectDir, "production-plans/eleven-lot-burn-in-horizon.production-plan.json"),
      `${JSON.stringify(intervention, null, 2)}\n`,
    );
    const proposed = await simulateProjectOperation(
      projectDir,
      { productionPlan: intervention.id },
      { seed: 42 },
    );
    const comparison = await compareFactoryRuns(
      projectDir,
      control.data.run.id,
      proposed.data.run.id,
    );

    expect(comparison.intervention).toEqual({
      kind: "production-plan",
      from: {
        id: "production-window",
        hash: control.context.hashes.productionPlanHash,
      },
      to: {
        id: intervention.id,
        hash: proposed.context.hashes.productionPlanHash,
      },
    });
    expect(comparison.context.blueprintHash).toBe(control.context.hashes.blueprintHash);
    expect(comparison.context.productionPlanHash).toBeNull();
    expect(comparison.changes.map((change) => [change.kind, change.id, change.action])).toEqual([
      ["lot-release", "dram-lot-12", "removed"],
      ["material-delivery", "substrate-delivery-12", "removed"],
      ["production-plan", intervention.id, "changed"],
    ]);
    expect(comparison.patch.map((operation) => [operation.op, operation.path])).toEqual([
      ["replace", "/id"],
      ["remove", "/lotReleases/11"],
      ["remove", "/materialDeliveries/11"],
      ["replace", "/name"],
    ]);
    expect(comparison.from.metrics.scheduledLots).toBe(12);
    expect(comparison.to.metrics.scheduledLots).toBe(11);
    expect(comparison.delta.scheduledLots).toBe(-1);
    expect(comparison.navigation.changedSubjects).toEqual([]);

    const duplicateId = "999-identical-evidence";
    await cp(control.data.run.path, join(projectDir, "runs", duplicateId), { recursive: true });
    await expect(compareFactoryRuns(projectDir, control.data.run.id, duplicateId))
      .rejects.toMatchObject({ code: "run-comparison.incompatible" });

    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8")) as Record<string, unknown>;
    await writeFile(blueprintPath, `${JSON.stringify({ ...blueprint, revision: "multiple-controlled-variables" }, null, 2)}\n`);
    const multiple = await simulateProjectOperation(
      projectDir,
      { productionPlan: intervention.id },
      { seed: 42 },
    );
    await expect(compareFactoryRuns(projectDir, control.data.run.id, multiple.data.run.id))
      .rejects.toMatchObject({ code: "run-comparison.incompatible" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);

test("immutable Run comparison rejects missing and identical evidence identities", async () => {
  await expect(compareFactoryRuns(memoryFab, "100-simulate", "100-simulate"))
    .rejects.toMatchObject({ code: "run-comparison.same-run" });
  await expect(compareFactoryRuns(memoryFab, "missing-run", "101-simulate"))
    .rejects.toMatchObject({ code: "run-comparison.unknown-run" });
});
