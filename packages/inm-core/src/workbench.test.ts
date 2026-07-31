import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { loadDesignRun, type DesignRunManifest, type DesignRunSummary } from "./design-run";
import { previewCandidateOperation } from "./operation";
import {
  buildWorkbenchNextAction,
  classifyDesignProgramEvidence,
  deriveWorkbenchLossDisposition,
  openProjectWorkbenchSnapshot,
  recommendedDesignProgramEvidenceAction,
  type ProjectWorkbenchSnapshot,
  type WorkbenchDesignEvidenceIdentity,
} from "./workbench";
import { pathExists, stableStringify } from "./utils";

const repository = resolve(import.meta.dir, "../../..");

async function restorePreCompactMemoryFabBlueprint(projectDir: string) {
  await writeFile(
    join(projectDir, "blueprints/generated-dram-fab.blueprint.json"),
    await readFile(join(projectDir, "runs/098-simulate/blueprint.json"), "utf8"),
  );
  await rm(join(projectDir, "candidates/compact-finished-goods-shipping.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/compact-inspection-rework-cell.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/compact-inspection-rework-cell-east-port.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/vacuum-lithography-etch-handoff.candidate.json"), { force: true });
  await rm(join(projectDir, "candidate-reviews/compact-finished-goods-shipping"), { recursive: true, force: true });
  await rm(join(projectDir, "candidate-reviews/compact-inspection-rework-cell-east-port"), { recursive: true, force: true });
  await rm(join(projectDir, "candidate-reviews/vacuum-lithography-etch-handoff"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/099-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/100-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/101-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/102-simulate"), { recursive: true, force: true });
  for (const entry of [
    "0016-compact-inspection-rework-cell.entry.json",
    "0017-revise-compact-cell-east-port.entry.json",
    "0018-compact-inspection-rework-cell-east-port.entry.json",
    "0019-keep-compact-inspection-rework-cell-east-port.entry.json",
    "0020-compact-inspection-rework-cell-current-factory.entry.json",
  ]) {
    await rm(join(projectDir, "investigations/inspection-starvation-next-step/entries", entry), { force: true });
  }
}

test("shared workbench snapshot orients an operator with stable diagnostics and operations", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/ironworks"));
  expect(snapshot.version).toBe(18);
  expect(snapshot.project.id).toBe("ironworks");
  expect(snapshot.selection).toEqual(expect.objectContaining({
    world: expect.objectContaining({ id: "main" }),
    blueprint: expect.objectContaining({ id: "main" }),
    scenario: expect.objectContaining({ id: "baseline" }),
    objective: expect.objectContaining({ id: "default" }),
  }));
  expect(snapshot.hashes.blueprintHash).toHaveLength(64);
  expect(snapshot.status.capacity).toEqual(expect.objectContaining({ state: "blocked", gapCount: 3 }));
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    tone: "blocking", effect: "read-only", studioRoute: expect.stringContaining("/analysis/diagnostics/"),
    target: expect.objectContaining({ kind: "diagnostic" }),
  }));
  expect(snapshot.counts).toEqual(expect.objectContaining({
    regions: 2, deviceInstances: 29, connections: 8, experiments: 5, designPrograms: 0,
  }));
  expect(snapshot.catalog.resources.map((asset) => asset.id)).toContain("iron-ore");
  expect(snapshot.experiments.map((experiment) => experiment.id)).toEqual([
    "autoresearch", "high-speed-transport", "power-priority", "power-satisfaction", "station-energy",
  ]);

  const operationIds = new Set(snapshot.operations.map((operation) => operation.id));
  expect(operationIds).toEqual(new Set([
    "validate", "inspect", "analyze", "plan", "simulate", "synthesize", "design.run", "benchmark.evaluate", "candidate.preview", "candidate.apply",
  ]));
  expect(snapshot.operations.find((operation) => operation.id === "design.run")).toEqual(expect.objectContaining({
    effect: "creates-artifact",
    availability: { state: "unavailable", reasons: ["No locked project-local Design Program is available."] },
  }));
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")).toEqual(expect.objectContaining({
    effect: "mutates-blueprint", requiresConfirmation: true,
    availability: { state: "unavailable", reasons: ["No Candidate has a current recorded KEEP review."] },
  }));
  expect(snapshot.diagnostics[0]).toEqual(expect.objectContaining({ severity: "blocking", priority: 100 }));
  expect(new Set(snapshot.diagnostics.map((diagnostic) => diagnostic.id)).size).toBe(snapshot.diagnostics.length);
  expect(snapshot.diagnostics.every((diagnostic) => diagnostic.subjects.length > 0
    && diagnostic.actionIds.every((action) => operationIds.has(action)))).toBeTrue();
  expect(JSON.parse(stableStringify(snapshot))).toEqual(snapshot);
});

test("memory-fab workbench discovers project-local routes, experiments, and candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-memory-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("design-runs") && !source.split("/").includes(".inm"),
  });
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  expect(snapshot.project.id).toBe("memory-fab");
  expect(snapshot.status).toEqual(expect.objectContaining({
    capacity: { state: "ready", gapCount: 0, gapsByKind: {} },
    flow: { state: "at-risk", warningCount: 8, infoCount: 9 },
    evidence: { state: "current", runId: "105-simulate" },
    review: { state: "stale", pendingCount: 0, disposedCount: 4, staleCount: 24, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.objective.wipAccounting).toEqual(expect.objectContaining({
    unit: "dram-device-equivalent",
    resources: expect.arrayContaining([
      { resource: "qualified-dram-wafer-lot", equivalentUnitsPerItem: 8 },
      { resource: "packaged-dram-device", equivalentUnitsPerItem: 1 },
    ]),
  }));
  expect(snapshot.objective.wipAccounting.resources.map((entry) => entry.resource))
    .not.toContain("dram-package-substrate");
  expect(snapshot.inventoryAccounting).toEqual(expect.objectContaining({
    runId: "105-simulate",
    wipEquivalentUnit: "dram-device-equivalent",
    averageRawWipInventory: 28.039358333333332,
    averageWipEquivalentUnits: 49.1905,
    averageTotalInventory: 124.88185,
    peakRawWipInventory: 59,
    peakWipEquivalentUnits: 88,
  }));
  expect(snapshot.inventoryAccounting!.averageExcludedInventory).toBeCloseTo(96.84249166666666, 12);
  expect(snapshot.inventoryAccounting?.resources["dram-package-substrate"]).toEqual(expect.objectContaining({
    includedInWip: false,
    averageInventory: 39.74274166666667,
  }));
  expect(snapshot.inventoryAccounting?.locations["buffer:burn-in-1:package-input:packaged-dram-device"]).toEqual(expect.objectContaining({
    kind: "buffer",
    device: "burn-in-1",
    buffer: "package-input",
    averageInventory: 9.465691666666666,
  }));
  expect(snapshot.sourceLotLineage).toEqual(expect.objectContaining({
    runId: "105-simulate",
    createdUnits: 96,
    deliveredUnits: 88,
    discardedUnits: 0,
    commingledJobs: 0,
    finalWipUnits: 8,
  }));
  expect(snapshot.sourceLotLineage?.sourceSets.find((sourceSet) =>
    sourceSet.sourceLotIds.length === 1 && sourceSet.sourceLotIds[0] === "dram-lot-08"))
    .toEqual(expect.objectContaining({
      delivered: {},
      finalWip: [{
        kind: "buffer",
        device: "burn-in-1",
        buffer: "package-input",
        resource: "packaged-dram-device",
        count: 8,
        sourceLotIds: ["dram-lot-08"],
      }],
    }));
  expect(snapshot.sourceLotServices).toHaveLength(2);
  expect(snapshot.sourceLotServices.find((analysis) => analysis.query.device === "burn-in-1"))
    .toEqual(expect.objectContaining({
      version: 1,
      kind: "source-lot-service",
      analysisHash: "93b87b1949dea24903070c3576bcce8b6fe4fc8fa44d9da3f7377738a47ff01f",
      run: expect.objectContaining({ id: "105-simulate", endTick: 240000 }),
      query: {
        device: "burn-in-1",
        inputBuffer: "package-input",
        inputResource: "packaged-dram-device",
        batchUnits: 8,
      },
      workCenter: expect.objectContaining({
        jobs: 11,
        changeovers: 3,
        setupTicks: 14000,
        lastFinishTick: 235623,
        remainingHorizonTicks: 4377,
      }),
      sourceSets: expect.arrayContaining([
        expect.objectContaining({
          sourceLotIds: ["dram-lot-08"],
          inputArrival: expect.objectContaining({ fullBatchReadyAtTick: 205173 }),
          service: null,
          delivery: { units: 0, firstAtTick: null, lastAtTick: null },
          unservedAgeTicks: 34827,
        }),
      ]),
    }));
  expect(snapshot.objectiveEvidence).toEqual(expect.objectContaining({
    runId: "105-simulate",
    finalScore: 0.19840972805554147,
    dominantPenalty: { id: "wip", contribution: -73.78575000000001, role: "penalty" },
    wip: expect.objectContaining({
      equivalentUnit: "dram-device-equivalent",
      weight: 1.5,
      scoreContribution: -73.78575000000001,
      averageRawWipInventory: 28.039358333333332,
      averageWipEquivalentUnits: 49.1905,
      peakRawWipInventory: 59,
      peakWipEquivalentUnits: 88,
      resources: [
        expect.objectContaining({
          resource: "packaged-dram-device",
          averageInventory: 14.852358333333333,
          scoreContribution: -22.2785375,
        }),
        expect.objectContaining({
          resource: "known-good-dram-die",
          averageInventory: 10.165408333333334,
          scoreContribution: -15.248112500000001,
        }),
        ...snapshot.objectiveEvidence!.wip.resources.slice(2),
      ],
      locations: [
        expect.objectContaining({
          physicalLocation: "burn-in-1.package-input",
          subject: { kind: "device", id: "burn-in-1" },
          averageInventory: 9.465691666666666,
        }),
        expect.objectContaining({
          physicalLocation: "packaging-1.die-input",
          subject: { kind: "device", id: "packaging-1" },
          averageInventory: 6.874125,
        }),
        ...snapshot.objectiveEvidence!.wip.locations.slice(2),
      ],
    }),
  }));
  expect(snapshot.objectiveEvidence!.components.reduce((sum, component) => sum + component.contribution, 0))
    .toBeCloseTo(snapshot.objectiveEvidence!.finalScore, 12);
  expect(snapshot.lossAttribution).toEqual(expect.objectContaining({
    version: 8,
    chain: [
      "input-starvation",
      "yield-quality",
      "queue-congestion",
      "maintenance-qualification",
      "release-admission",
      "transport-blocking",
      "power-interruption",
      "setup-campaign",
    ],
  }));
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "power-interruption")).toMatchObject({
    evidence: {
      unpoweredTicks: 624_193,
      attributedTicks: 624_193,
      unattributedTicks: 0,
      contributors: 8,
      affectedGrids: 1,
    },
    subjects: [
      { kind: "device", id: "substrate-receiving-to-packaging-loader" },
      { kind: "connection", id: "substrate-receiving-to-packaging" },
      { kind: "device", id: "shipping-power" },
    ],
    contributors: expect.arrayContaining([
      expect.objectContaining({
        id: "device:substrate-receiving-to-packaging-loader:power-interruption",
        mechanism: "power-supply-interruption",
        grid: "grid-cleanroom-shipping-power",
        endpointStage: "loader",
        evidence: expect.objectContaining({
          unpoweredTicks: 165_377,
          gridUnservedMilliJoules: 254_851,
          gridPeakDeficitMilliWatts: 10_000,
          gridRequiredStorageCapacityMilliJoules: 113_825,
        }),
      }),
      expect.objectContaining({
        id: "device:substrate-receiving-to-packaging-unloader:power-interruption",
        endpointStage: "unloader",
        evidence: expect.objectContaining({ unpoweredTicks: 165_377 }),
      }),
    ]),
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "transport-blocking")).toMatchObject({
    label: "Local transport blocking by cause",
    evidence: {
      blockedConnections: 3,
      blockedItemTicks: 209_301,
      connections: 17,
      lineContentionTicks: 134_201,
      endpointCapacityTicks: 37_800,
      endpointPowerTicks: 37_300,
      endpointFailureTicks: 0,
    },
    subjects: [{ kind: "connection", id: "probe-to-packaging" }],
    contributors: expect.arrayContaining([expect.objectContaining({
      id: "connection:probe-to-packaging:transport-line-contention",
      mechanism: "transport-line-contention",
      evidence: expect.objectContaining({
        blockedItemTicks: 108_900,
        lineContentionTicks: 69_100,
        endpointCapacityTicks: 31_300,
        endpointPowerTicks: 8_500,
        endpointFailureTicks: 0,
      }),
    })]),
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "maintenance-qualification")).toMatchObject({
    evidence: {
      maintenanceTicks: 94_000,
      qualificationTicks: 30_000,
      inputWaitTicks: 0,
      crewWaitTicks: 0,
      totalTicks: 124_000,
      attributedTicks: 124_000,
      unattributedTicks: 0,
      contributors: 4,
    },
    subjects: [
      { kind: "device", id: "lithography-1" },
      { kind: "device", id: "maintenance-service-1" },
    ],
    contributors: [
      expect.objectContaining({
        id: "device:lithography-1:maintenance-qualification",
        label: "lithography-1",
        resources: ["chamber-clean-kit", "tool-qualification-wafer"],
        subjects: [
          { kind: "device", id: "lithography-1" },
          { kind: "device", id: "maintenance-service-1" },
        ],
        evidence: expect.objectContaining({
          totalTicks: 34_000,
          maintenanceTicks: 26_000,
          qualificationTicks: 8_000,
          inputWaitTicks: 0,
          crewWaitTicks: 0,
          usageTriggered: 2,
          calendarTriggered: 0,
          plannedBoundary: 2,
          opportunistic: 0,
        }),
        consumables: {
          service: { "chamber-clean-kit": 2 },
          qualification: { "tool-qualification-wafer": 2 },
        },
      }),
      expect.objectContaining({
        id: "device:lithography-l2:maintenance-qualification",
        evidence: expect.objectContaining({ totalTicks: 34_000, opportunistic: 2 }),
      }),
      expect.objectContaining({
        id: "device:etch-1:maintenance-qualification",
        evidence: expect.objectContaining({ totalTicks: 28_000, opportunistic: 2 }),
      }),
      expect.objectContaining({
        id: "device:etch-l2:maintenance-qualification",
        evidence: expect.objectContaining({ totalTicks: 28_000, opportunistic: 2 }),
      }),
    ],
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "release-admission")).toMatchObject({
    evidence: {
      pendingLots: 0,
      capacityBlockedLots: 0,
      capacityBlockedTicks: 0,
      controlBlockedLots: 6,
      controlBlockedTicks: 162_138,
      blockedTicks: 162_138,
      attributedTicks: 162_138,
      unattributedTicks: 0,
      contributors: 6,
      maximumWip: 6,
      reopenAtWip: 5,
    },
    subjects: [
      { kind: "device", id: "lot-release" },
      { kind: "route", id: "dram-front-end" },
    ],
    contributors: [
      expect.objectContaining({
        id: "lot:dram-lot-07:release-admission",
        mechanism: "release-admission-wait",
        route: "dram-front-end",
        resources: ["blank-dram-wafer-lot"],
        lots: ["dram-lot-07"],
        evidence: expect.objectContaining({
          totalTicks: 62_023,
          controlBlockedTicks: 62_023,
          plannedReleaseTick: 36_000,
          actualReleaseTick: 98_023,
          dueTick: 180_000,
          priority: 5,
          releaseOrdinal: 12,
          activeWipBeforeRelease: 5,
          maximumWip: 6,
          reopenAtWip: 5,
        }),
      }),
      expect.objectContaining({ id: "lot:dram-lot-08:release-admission", evidence: expect.objectContaining({ totalTicks: 48_023 }) }),
      expect.objectContaining({ id: "lot:dram-lot-09:release-admission", evidence: expect.objectContaining({ totalTicks: 34_023 }) }),
      expect.objectContaining({ id: "lot:dram-lot-11:release-admission", evidence: expect.objectContaining({ totalTicks: 14_023 }) }),
      expect.objectContaining({ id: "lot:dram-lot-10:release-admission", evidence: expect.objectContaining({ totalTicks: 4_023 }) }),
      expect.objectContaining({ id: "lot:dram-lot-12:release-admission", evidence: expect.objectContaining({ totalTicks: 23 }) }),
    ],
  });
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "fab-loss.transport-blocking")).toBeTrue();
  expect(snapshot.catalog.routes.map((route) => route.id)).toEqual(["dram-front-end"]);
  expect(snapshot.experiments.map((experiment) => experiment.id)).toContain("equipment-energy-research");
  expect(snapshot.counts.designPrograms).toBe(12);
  expect(snapshot.designPrograms).toEqual([
    expect.objectContaining({
      id: "back-end-die-handoff",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["transport-blocking"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "back-end-wip-convergence",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: {
        kind: "objective",
        component: "wip",
        locations: [
          "buffer:burn-in-1:package-input:packaged-dram-device",
          "buffer:packaging-1:die-input:known-good-dram-die",
        ],
      },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "burn-in-changeover-convergence",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["setup-campaign"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "commissioned-dram-fab",
      benchmark: "greenfield-dram-design",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "front-end-queue-convergence",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["queue-congestion"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "greenfield-dram-fab",
      seed: { kind: "synthesis", inputBlueprint: "greenfield" },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "not-aligned", reasons: ["synthesis-seed"] },
      evidence: expect.objectContaining({ state: "not-applicable", authorityRunId: null }),
    }),
    expect.objectContaining({
      id: "inspection-supply-path",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["input-starvation"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "integrated-dram-fab",
      seed: { kind: "blueprint", blueprint: "experiment" },
      promotionTarget: "experiment",
      alignment: { state: "not-aligned", reasons: ["seed-blueprint-mismatch", "promotion-target-mismatch"] },
      evidence: expect.objectContaining({ state: "not-applicable", authorityRunId: null }),
    }),
    expect.objectContaining({
      id: "layer-two-particle-control",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["yield-quality"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "lithography-maintenance-convergence",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["maintenance-qualification"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "release-admission-convergence",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["release-admission"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
    expect.objectContaining({
      id: "shipping-power-convergence",
      seed: { kind: "blueprint", blueprint: "generated-dram-fab" },
      focus: { kind: "losses", losses: ["power-interruption"] },
      promotionTarget: "generated-dram-fab",
      alignment: { state: "aligned", reasons: [] },
      evidence: expect.objectContaining({ state: "missing", authorityRunId: null, currentRuns: 0, historicalRuns: 0, invalidRuns: 0 }),
    }),
  ]);
  expect(snapshot.candidates.map((candidate) => ({
    id: candidate.id,
    benchmark: candidate.benchmark,
    patchOperations: candidate.patchOperations,
    state: candidate.decision.state,
    verdict: candidate.decision.verdict,
  }))).toEqual([
    { id: "back-end-wip-conwip-5-4", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: "DISCARD" },
    { id: "batch-coherent-burn-in-overflow", benchmark: "greenfield-dram-design", patchOperations: 19, state: "reviewed-discard", verdict: "DISCARD" },
    { id: "candidate-3", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: undefined },
    { id: "closed-loop-layer-two-etch", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: undefined },
    { id: "commissioned-furnace-supply-recovery", benchmark: "greenfield-dram-design", patchOperations: 3, state: "stale", verdict: undefined },
    { id: "commissioned-greenfield-dram-fab", benchmark: "greenfield-dram-design", patchOperations: 74, state: "stale", verdict: undefined },
    { id: "commissioned-release-control", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: undefined },
    { id: "commissioned-sustained-starvation-cadence", benchmark: "greenfield-dram-design", patchOperations: 3, state: "stale", verdict: undefined },
    { id: "compact-finished-goods-shipping", benchmark: "greenfield-dram-design", patchOperations: 13, state: "stale", verdict: "KEEP" },
    { id: "compact-inspection-rework-cell", benchmark: "greenfield-dram-design", patchOperations: 5, state: "stale", verdict: undefined },
    { id: "compact-inspection-rework-cell-east-port", benchmark: "greenfield-dram-design", patchOperations: 5, state: "verified", verdict: "KEEP" },
    { id: "compact-shipping-metrology-standby", benchmark: "greenfield-dram-design", patchOperations: 15, state: "stale", verdict: "DISCARD" },
    { id: "continuous-deep-metrology", benchmark: "greenfield-dram-design", patchOperations: 4, state: "stale", verdict: undefined },
    { id: "dedicated-etch-quality-cell", benchmark: "greenfield-dram-design", patchOperations: 27, state: "stale", verdict: undefined },
    { id: "furnace-flex-dual-service", benchmark: "greenfield-dram-design", patchOperations: 4, state: "stale", verdict: undefined },
    { id: "identity-safe-release-control", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: undefined },
    { id: "incumbent-five-performance-seven-commercial", benchmark: "greenfield-dram-design", patchOperations: 1, state: "reviewed-keep", verdict: "KEEP" },
    { id: "inspection-edd-resilience", benchmark: "greenfield-dram-design", patchOperations: 1, state: "stale", verdict: undefined },
    { id: "inspection-supply-path-966127dd", benchmark: "greenfield-dram-design", patchOperations: 3, state: "stale", verdict: "KEEP" },
    { id: "layer-two-lithography-capacity", benchmark: "greenfield-dram-design", patchOperations: 30, state: "stale", verdict: undefined },
    { id: "lithography-l2-edd", benchmark: "greenfield-dram-design", patchOperations: 1, state: "stale", verdict: undefined },
    { id: "metrology-low-power-standby", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: "DISCARD" },
    { id: "metrology-low-power-standby-sourced", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: "DISCARD" },
    { id: "parallel-burn-in-overflow", benchmark: "greenfield-dram-design", patchOperations: 19, state: "reviewed-discard", verdict: "DISCARD" },
    { id: "planned-lithography-maintenance", benchmark: "greenfield-dram-design", patchOperations: 2, state: "stale", verdict: undefined },
    { id: "portfolio-aware-dram-dispatch", benchmark: "greenfield-dram-design", patchOperations: 1, state: "stale", verdict: undefined },
    { id: "preserve-failure-target-utility-funded-overflow", benchmark: "greenfield-dram-design", patchOperations: 22, state: "reviewed-discard", verdict: "DISCARD" },
    { id: "recovered-output-high-throughput", benchmark: "greenfield-dram-design", patchOperations: 7, state: "stale", verdict: undefined },
    { id: "stable-furnace-sleep", benchmark: "equipment-energy-research", patchOperations: 1, state: "reviewed-discard", verdict: "DISCARD" },
    { id: "vacuum-lithography-etch-handoff", benchmark: "greenfield-dram-design", patchOperations: 3, state: "stale", verdict: "KEEP" },
  ]);
  expect(snapshot.candidates.find((candidate) =>
    candidate.id === "incumbent-five-performance-seven-commercial")?.investigationDisposition)
    .toEqual(expect.objectContaining({
      investigationId: "source-lot-back-end-service",
      entryId: "discard-incumbent-five-seven-campaign",
      entryHash: "799158ef35baa3d0df71c20b042e983cb743cf778001ae93bf0a950b37b39000",
      sequence: 18,
      author: "agent",
      disposition: "discard",
      reviewAnchorId: "incumbent-five-seven-review",
      reviewResultHash: "320ad510ada4d407c453cc689c48ef592048e1080a939aae8349d84a0f89a1fd",
    }));
  expect(snapshot.nextAction.id).not.toBe("candidate.apply:incumbent-five-performance-seven-commercial");
  expect(snapshot.investigationDiagnosticDispositions).toEqual([
    expect.objectContaining({
      disposition: "defer",
      queueEffect: "suppressed",
      target: expect.objectContaining({
        anchorId: "diagnostic",
        code: "fab-loss.input-starvation",
        diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
      }),
      source: expect.objectContaining({
        investigationId: "current-inspection-starvation-boundary",
        entryId: "defer-run-105-inspection-local-branch",
      }),
      observed: {
        runId: "105-simulate",
        resultHash: "353061d1b81789346483a196dd373568d2cacd67ea12b05e9374cec675fe2f8e",
      },
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^design\.inspect:layer-two-particle-control:fab-loss\.yield-quality:/),
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "design", snapshot.project.rootDir, "--program", "layer-two-particle-control", "--json"],
    studioRoute: "/memory-fab/designs/layer-two-particle-control",
    target: expect.objectContaining({
      kind: "design-program",
      programId: "layer-two-particle-control",
      diagnosticId: expect.stringMatching(/^fab-loss\.yield-quality:/),
    }),
  }));
  const leadingDiagnostic = snapshot.diagnostics.find((diagnostic) =>
    diagnostic.code === "fab-loss.input-starvation")!;
  expect(buildWorkbenchNextAction({
    ...snapshot,
    investigationDiagnosticDispositions: [{
      id: "investigation-diagnostic:inspection-revision:revise-inspection:diagnostic",
      state: "current",
      disposition: "revise",
      queueEffect: "revisit",
      target: {
        diagnosticId: leadingDiagnostic.id,
        code: leadingDiagnostic.code,
        anchorId: "diagnostic",
        anchorKind: "diagnostic",
      },
      source: {
        investigationId: "inspection-revision",
        investigationName: "Inspection revision",
        entryId: "revise-inspection",
        entryHash: "a".repeat(64),
        sequence: 2,
        author: "agent",
        statement: "Revise the bounded inspection hypothesis against the unchanged current diagnostic.",
      },
      observed: { runId: "105-simulate", resultHash: "b".repeat(64) },
      reason: "Return to the Investigation.",
      invalidation: {
        summary: "Expires when exact evidence changes.",
        bindings: [
          "project",
          "selection",
          "execution-hashes",
          "compatible-run",
          "diagnostic",
          "loss-contributor",
        ],
      },
    }],
  })).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^investigation\.revisit:inspection-revision:revise-inspection:/),
    title: "Revise Inspection revision",
    argv: ["inm", "investigate", snapshot.project.rootDir, "--investigation", "inspection-revision", "--json"],
    studioRoute: "/memory-fab/investigations/inspection-revision",
    target: {
      kind: "investigation",
      investigationId: "inspection-revision",
      phase: "form-hypothesis",
      sourceEntryId: "revise-inspection",
    },
  }));
  expect(buildWorkbenchNextAction({
    ...snapshot,
    diagnostics: snapshot.diagnostics.filter((diagnostic) => diagnostic.code !== "fab-loss.input-starvation"),
  })).toEqual(expect.objectContaining({
    title: "Investigate the leading loss with Layer-two Particle Control",
    argv: ["inm", "design", snapshot.project.rootDir, "--program", "layer-two-particle-control", "--json"],
    studioRoute: "/memory-fab/designs/layer-two-particle-control",
    target: expect.objectContaining({
      kind: "design-program",
      programId: "layer-two-particle-control",
      diagnosticId: expect.stringMatching(/^fab-loss\.yield-quality:/),
    }),
  }));
  const exhaustedId = "f".repeat(64);
  const withExhaustedEvidence = snapshot.designPrograms.map((program) => program.id === "inspection-supply-path" ? {
    ...program,
    evidence: {
      state: "exhausted" as const,
      authorityRunId: exhaustedId,
      authorityAddressedLosses: ["input-starvation" as const],
      currentRuns: 1,
      commissionedRuns: 0,
      historicalRuns: 0,
      invalidRuns: 0,
      runs: [{
        id: exhaustedId,
        currentness: { state: "current" as const, reasons: [] },
        outcome: "exhausted" as const,
        continuation: null,
        budget: { maximum: 7, evaluated: 4 },
        best: {
          iteration: 0,
          blueprintHash: "a".repeat(64),
          promotionPatchOperations: 0,
          candidateScore: 29.321159,
          scoreDelta: 104.296881,
          verdict: "KEEP" as const,
        },
        stopReason: "frontier-exhausted" as const,
      }],
      invalid: [],
    },
  } : program);
  expect(buildWorkbenchNextAction({
    ...snapshot,
    designPrograms: withExhaustedEvidence,
    investigationDiagnosticDispositions: [],
  })).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^design\.run\.inspect:inspection-supply-path:/),
    title: "Expand Inspection Supply Path Convergence's intervention portfolio",
    actionLabel: "REVIEW EXHAUSTED DESIGN",
    argv: ["inm", "design", snapshot.project.rootDir, "--program", "inspection-supply-path", "--run-id", exhaustedId, "--json"],
    studioRoute: `/memory-fab/designs/inspection-supply-path/runs/${exhaustedId}`,
    target: expect.objectContaining({ kind: "design-run", programId: "inspection-supply-path", runId: exhaustedId, phase: "exhausted" }),
  }));
  expect(snapshot.operations.find((operation) => operation.id === "design.run")).toEqual(expect.objectContaining({
    effect: "creates-artifact",
    availability: { state: "available", reasons: [] },
  }));
  const yieldQuality = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "yield-quality");
  expect(yieldQuality).toMatchObject({
    id: "yield-quality",
    subjects: [
      { kind: "device", id: "etch-l2" },
      { kind: "route", id: "dram-front-end" },
      { kind: "project", id: "dram-wafer" },
    ],
    evidence: {
      inspectedLots: 12,
      firstPassCompleted: 10,
      reworkedLots: 2,
      scrapDispositions: 0,
      originContributors: 1,
      subjectIntroducedLots: 2,
      subjectPersistentLots: 0,
      subjectScrappedLots: 0,
    },
  });
  expect(yieldQuality?.contributors).toHaveLength(1);
  expect(yieldQuality?.contributors[0]).toMatchObject({
    label: "etch-cell-layer-2",
    mechanism: "quality-excursion",
    defects: ["critical-dimension", "particle-contamination"],
    lots: ["dram-lot-03", "dram-lot-08"],
    subjects: [{ kind: "device", id: "etch-l2" }, { kind: "route", id: "dram-front-end" }],
    evidence: {
      introducedLots: 2,
      detectedLots: 2,
      reworkAttemptedLots: 2,
      repairedLots: 2,
      persistentLots: 0,
      scrappedLots: 0,
      escapedLots: 0,
    },
  });
  const inputStarvation = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "input-starvation");
  expect(inputStarvation).toMatchObject({
    subjects: [
      { kind: "device", id: "inspection-1" },
      { kind: "connection", id: "etch-to-inspection" },
      { kind: "device", id: "etch-l2" },
      { kind: "connection", id: "rework-to-inspection" },
      { kind: "device", id: "rework-1" },
    ],
    evidence: {
      activeProductiveDevices: 11,
      flowProductiveDevices: 10,
      contributingDevices: 9,
      rawWaitingInputTicks: 1_596_215,
      flowRawWaitingInputTicks: 1_364_215,
      exceptionWaitingInputTicks: 232_000,
      boundaryWaitingInputTicks: 1_120_189,
      opportunityWindowTicks: 1_167_811,
      unavailableGapTicks: 79_000,
      starvationTicks: 244_026,
      subjectStarvationTicks: 56_984,
    },
  });
  expect(inputStarvation?.contributors.find((contributor) =>
    contributor.id === "device:furnace-1:material-input-shortage")).toMatchObject({
    id: "device:furnace-1:material-input-shortage",
    mechanism: "material-input-shortage",
    resources: ["dielectric-stack-lot"],
    subjects: [
      { kind: "device", id: "furnace-1" },
      { kind: "connection", id: "deposition-to-batch-furnace" },
      { kind: "device", id: "deposition-1" },
    ],
    evidence: {
      jobs: 12,
      starvationTicks: 38_856,
      opportunityWindowTicks: 110_856,
      unattributedGapTicks: 0,
    },
    inputStates: expect.arrayContaining([expect.objectContaining({
      process: "rapid-anneal-dielectric-stack",
      starvationTicks: 22_733,
      shortages: expect.arrayContaining([expect.objectContaining({
        resource: "dielectric-stack-lot",
        buffer: "batch-input",
        required: 1,
        supplies: expect.arrayContaining([expect.objectContaining({
          connection: "deposition-to-batch-furnace",
          sourceDevice: "deposition-1",
          state: "source-processing",
        })]),
      })]),
    })]),
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "q-time")).toBeUndefined();
  expect(snapshot.operations.find((operation) => operation.id === "candidate.preview")?.availability.state).toBe("conditional");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.guards).toContain("keep-verdict");
  expect(snapshot.operations.find((operation) => operation.id === "candidate.apply")?.availability.state).toBe("unavailable");
});

test("shared handoff advances from the explicitly deferred inspection branch to the next current physical loss", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"));
  const objectiveAuthority = snapshot.designPrograms
    .find((program) => program.id === "back-end-wip-convergence")?.evidence.authorityRunId;
  expect(objectiveAuthority).toBeNull();
  expect(snapshot.investigationDiagnosticDispositions).toEqual([
    expect.objectContaining({
      disposition: "defer",
      queueEffect: "suppressed",
      target: expect.objectContaining({
        code: "fab-loss.input-starvation",
      }),
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    title: "Investigate the leading loss with Layer-two Particle Control",
    actionLabel: "OPEN DESIGN LOOP",
    target: expect.objectContaining({
      kind: "design-program",
      programId: "layer-two-particle-control",
      diagnosticId: expect.stringMatching(/^fab-loss\.yield-quality:/),
    }),
  }));
});

test("an active physical loss still outranks current Objective Design evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-before-queue-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true });
  await rm(join(projectDir, "design-runs/front-end-queue-convergence"), { recursive: true, force: true });
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  expect(snapshot.version).toBe(18);
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "fab-loss.input-starvation")).toBeTrue();
  const currentInspection = snapshot.designPrograms.find((program) => program.id === "inspection-supply-path")?.evidence;
  if (currentInspection?.authorityRunId === "966127dd542de0b114eafefed250b1f3e8fff02b5cb240592b8a949657e7af06") {
    expect(snapshot.lossDispositions).toHaveLength(0);
    expect(currentInspection).toEqual(expect.objectContaining({
      state: "commissioned",
      currentRuns: 0,
      commissionedRuns: 1,
      historicalRuns: 4,
    }));
    expect(snapshot.nextAction).toEqual(expect.objectContaining({
      title: "Continue from the commissioned Inspection Supply Path Convergence lineage",
      target: expect.objectContaining({
        kind: "design-run",
        programId: "inspection-supply-path",
        phase: "commissioned",
        diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
      }),
    }));
    await rm(root, { recursive: true, force: true });
    return;
  }
  const objectiveAuthority = snapshot.designPrograms
    .find((program) => program.id === "back-end-wip-convergence")?.evidence.authorityRunId;
  if (objectiveAuthority && snapshot.lossDispositions.length > 0) {
    expect(snapshot.lossDispositions.map((disposition) => disposition.loss)).toEqual([
      "input-starvation",
      "maintenance-qualification",
      "power-interruption",
      "release-admission",
      "setup-campaign",
      "transport-blocking",
      "yield-quality",
    ]);
    expect(snapshot.lossDispositions.every((disposition) =>
      disposition.evidence.decisionBases["addressed-objective-not-improved"] === 0)).toBeTrue();
    expect(snapshot.nextAction).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^design\.inspect:front-end-queue-convergence:fab-loss\.queue-congestion:/),
      target: expect.objectContaining({
        kind: "design-program",
        programId: "front-end-queue-convergence",
        diagnosticId: expect.stringMatching(/^fab-loss\.queue-congestion:/),
      }),
    }));
    await rm(root, { recursive: true, force: true });
    return;
  }
  if (snapshot.lossDispositions.length === 0) {
    expect(snapshot.designPrograms.find((program) => program.id === "inspection-supply-path")?.evidence).toEqual(expect.objectContaining({
      state: "missing",
      authorityRunId: null,
      currentRuns: 0,
      historicalRuns: expect.any(Number),
    }));
    if (snapshot.investigationDiagnosticDispositions.some((disposition) =>
      disposition.queueEffect === "suppressed"
      && disposition.target.code === "fab-loss.input-starvation")) {
      expect(snapshot.nextAction).toEqual(expect.objectContaining({
        title: "Investigate the leading loss with Layer-two Particle Control",
        target: expect.objectContaining({
          kind: "design-program",
          programId: "layer-two-particle-control",
          diagnosticId: expect.stringMatching(/^fab-loss\.yield-quality:/),
        }),
      }));
      await rm(root, { recursive: true, force: true });
      return;
    }
    expect(snapshot.nextAction).toEqual(expect.objectContaining({
      title: "Investigate the leading loss with Inspection Supply Path Convergence",
      target: expect.objectContaining({
        kind: "design-program",
        programId: "inspection-supply-path",
        diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
      }),
    }));
    await rm(root, { recursive: true, force: true });
    return;
  }
  const inspectionEvidence = snapshot.designPrograms.find((program) => program.id === "inspection-supply-path")?.evidence;
  if (inspectionEvidence?.authorityRunId === "159ea491ae7862c7a028f8bd4cfe10849d1a4dc6209ac211816f35ffb576f2d8") {
    expect(snapshot.lossDispositions).toEqual([
      expect.objectContaining({
        state: "bounded-deferred",
        diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
        loss: "input-starvation",
        target: {
          contributor: "device:inspection-1:material-input-shortage",
          metric: "starvationTicks",
          direction: "decrease",
          currentValue: 59_584,
        },
        source: expect.objectContaining({
          programId: "inspection-supply-path",
          benchmarkId: "greenfield-dram-design",
          runId: inspectionEvidence.authorityRunId,
        }),
        observed: expect.objectContaining({ runId: "093-simulate" }),
        evidence: expect.objectContaining({
          attemptedCandidates: 6,
          improvedCandidates: 6,
          rejectedCandidates: 6,
          bestObservedValue: 57_084,
          largestReduction: 2_500,
        }),
      }),
    ]);
    expect(snapshot.nextAction).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^design\.inspect:layer-two-particle-control:fab-loss\.yield-quality:/),
      title: "Investigate the leading loss with Layer-two Particle Control",
      argv: ["inm", "design", projectDir, "--program", "layer-two-particle-control", "--json"],
      studioRoute: "/memory-fab/designs/layer-two-particle-control",
      target: expect.objectContaining({
        kind: "design-program",
        programId: "layer-two-particle-control",
        diagnosticId: expect.stringMatching(/^fab-loss\.yield-quality:/),
      }),
    }));
    await rm(root, { recursive: true, force: true });
    return;
  }
  expect(snapshot.lossDispositions).toEqual([
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
      loss: "input-starvation",
      target: {
        contributor: "device:inspection-1:material-input-shortage",
        metric: "starvationTicks",
        direction: "decrease",
        currentValue: 59_584,
      },
      source: expect.objectContaining({
        programId: "inspection-supply-path",
        benchmarkId: "greenfield-dram-design",
        runId: "df85fdd774f34544e9598dd7868ca0b99457e98abc6f939c047fd0c3211939a2",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 6,
        improvedCandidates: 6,
        rejectedCandidates: 6,
        bestObservedValue: 57_084,
        largestReduction: 2_500,
      }),
    }),
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.maintenance-qualification:/),
      loss: "maintenance-qualification",
      target: {
        contributor: "device:lithography-1:maintenance-qualification",
        metric: "totalTicks",
        direction: "decrease",
        currentValue: 34_000,
      },
      source: expect.objectContaining({
        programId: "lithography-maintenance-convergence",
        benchmarkId: "greenfield-dram-design",
        runId: "b74253a284862a7569e943b8a3b436823f3f7d390b2b09373554486687c71414",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 1,
        improvedCandidates: 1,
        rejectedCandidates: 1,
        bestObservedValue: 17_000,
        largestReduction: 17_000,
        decisionBases: expect.objectContaining({ "benchmark-gate": 1 }),
      }),
    }),
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.power-interruption:/),
      loss: "power-interruption",
      target: {
        contributor: "device:substrate-receiving-to-packaging-loader:power-interruption",
        metric: "unpoweredTicks",
        direction: "decrease",
        currentValue: 163_777,
      },
      source: expect.objectContaining({
        programId: "shipping-power-convergence",
        benchmarkId: "greenfield-dram-design",
        runId: "53b3a0eddf272358284e736fa86187a0f868bf992fc28ee3166ab0e604d77039",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 1,
        improvedCandidates: 1,
        rejectedCandidates: 1,
        bestObservedValue: 0,
        largestReduction: 163_777,
        decisionBases: expect.objectContaining({ "benchmark-gate": 1 }),
      }),
    }),
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.release-admission:/),
      loss: "release-admission",
      target: {
        contributor: "lot:dram-lot-07:release-admission",
        metric: "totalTicks",
        direction: "decrease",
        currentValue: 63_623,
      },
      source: expect.objectContaining({
        programId: "release-admission-convergence",
        benchmarkId: "greenfield-dram-design",
        runId: "f85f4cc3769246c53239e08070618d8b2e2177ab75cb36912197544be90fd859",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 1,
        improvedCandidates: 1,
        rejectedCandidates: 1,
        bestObservedValue: 0,
        largestReduction: 63_623,
        decisionBases: expect.objectContaining({ "benchmark-gate": 1 }),
      }),
    }),
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.setup-campaign:/),
      loss: "setup-campaign",
      target: {
        contributor: "device:burn-in-1:production-changeover:reliability-screen:commercial-screen:screen-commercial-dram",
        metric: "setupTicks",
        direction: "decrease",
        currentValue: 8_000,
      },
      source: expect.objectContaining({
        programId: "burn-in-changeover-convergence",
        benchmarkId: "greenfield-dram-design",
        runId: "7e530131290764610d16e3b253749c7792e8dfff935841f22d6480cb4245ad59",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 1,
        improvedCandidates: 1,
        rejectedCandidates: 1,
        bestObservedValue: 0,
        largestReduction: 8_000,
        decisionBases: expect.objectContaining({ "no-current-best-improvement": 1 }),
      }),
    }),
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.transport-blocking:/),
      loss: "transport-blocking",
      target: {
        contributor: "connection:probe-to-packaging:transport-line-contention",
        metric: "blockedItemTicks",
        direction: "decrease",
        currentValue: 46_800,
      },
      source: expect.objectContaining({
        programId: "back-end-die-handoff",
        benchmarkId: "greenfield-dram-design",
        runId: "f380b7f17083275669bf571a89a1c675a4bf11f88fd61b7528fcadbcc80b62ad",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 1,
        improvedCandidates: 1,
        rejectedCandidates: 1,
        bestObservedValue: 0,
        largestReduction: 46_800,
        decisionBases: expect.objectContaining({ "no-current-best-improvement": 1 }),
      }),
    }),
    expect.objectContaining({
      state: "bounded-deferred",
      diagnosticId: expect.stringMatching(/^fab-loss\.yield-quality:/),
      loss: "yield-quality",
      target: {
        contributor: "quality:quality-excursion:dram-front-end:etch-cell-layer-2:etch-l2:etch-cell-layer-2",
        metric: "introducedDefectInstances",
        direction: "decrease",
        currentValue: 2,
      },
      source: expect.objectContaining({
        programId: "layer-two-particle-control",
        benchmarkId: "greenfield-dram-design",
        runId: "f373ce6d778faea79cc2dfee70ea36125be23a10b642178c943d700bb32b6310",
      }),
      observed: expect.objectContaining({ runId: "093-simulate" }),
      evidence: expect.objectContaining({
        attemptedCandidates: 1,
        improvedCandidates: 1,
        rejectedCandidates: 1,
        bestObservedValue: 1,
        largestReduction: 1,
        decisionBases: expect.objectContaining({ "no-current-best-improvement": 1 }),
      }),
    }),
  ]);
  expect(snapshot.designPrograms.find((program) => program.id === "inspection-supply-path")?.evidence.authorityAddressedLosses)
    .toEqual(["input-starvation"]);
  expect(snapshot.designPrograms.find((program) => program.id === "layer-two-particle-control")).toEqual(expect.objectContaining({
    focus: { kind: "losses", losses: ["yield-quality"] },
    evidence: expect.objectContaining({
      state: "exhausted",
      authorityRunId: "f373ce6d778faea79cc2dfee70ea36125be23a10b642178c943d700bb32b6310",
      authorityAddressedLosses: ["yield-quality"],
    }),
  }));
  expect(snapshot.designPrograms.find((program) => program.id === "front-end-queue-convergence")).toEqual(expect.objectContaining({
    focus: { kind: "losses", losses: ["queue-congestion"] },
    evidence: expect.objectContaining({
      state: "missing",
      authorityRunId: null,
    }),
  }));
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^design\.inspect:front-end-queue-convergence:fab-loss\.queue-congestion:/),
    title: "Investigate the leading loss with Layer-one Etch Queue Convergence",
    argv: ["inm", "design", projectDir, "--program", "front-end-queue-convergence", "--json"],
    studioRoute: "/memory-fab/designs/front-end-queue-convergence",
    target: expect.objectContaining({
      kind: "design-program",
      programId: "front-end-queue-convergence",
      diagnosticId: expect.stringMatching(/^fab-loss\.queue-congestion:/),
    }),
  }));
  const queue = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "queue-congestion");
  expect(queue).toEqual(expect.objectContaining({
    subjects: [
      { kind: "device", id: "etch-1" },
      { kind: "route", id: "dram-front-end" },
    ],
    evidence: expect.objectContaining({
      totalQueueTicks: 66_166,
      attributedQueueTicks: 66_166,
      unattributedQueueTicks: 0,
    }),
  }));
  expect(queue?.contributors[0]).toEqual(expect.objectContaining({
    label: "etch-1",
    mechanism: "process-queue-wait",
    route: "dram-front-end",
    step: "etch-cell-layer-1",
    processes: ["etch-cell-layer-1"],
    resources: ["patterned-cell-l1-lot"],
    evidence: expect.objectContaining({
      queueTicks: 21_500,
      queueShare: 21_500 / 66_166,
      contributingLots: 3,
      segments: 3,
      maximumQueueTicks: 9_500,
    }),
  }));
  expect(queue?.subjects).not.toContainEqual({ kind: "device", id: "burn-in-1" });
  await rm(root, { recursive: true, force: true });
}, 20_000);

test("bounded loss disposition expires on any changed authority, target evidence, or frontier", async () => {
  const projectDir = join(repository, "examples/memory-fab");
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  const disposition = snapshot.lossDispositions[0];
  if (!disposition) {
    expect(snapshot.designPrograms.some((program) =>
      program.evidence.currentRuns === 0
      && program.evidence.historicalRuns > 0
      && program.evidence.runs.some((run) => run.currentness.reasons.includes("engine-version-mismatch")))).toBeTrue();
    return;
  }
  const loaded = await loadDesignRun(projectDir, disposition.source.programId, disposition.source.runId);
  const program = {
    id: disposition.source.programId,
    name: disposition.source.programName,
    benchmark: disposition.source.benchmarkId,
    programHash: disposition.source.programHash,
    benchmarkContractHash: disposition.source.benchmarkContractHash,
    authorityRunId: disposition.source.runId,
  };
  const context: Pick<ProjectWorkbenchSnapshot, "project" | "selection" | "hashes" | "diagnostics" | "lossAttribution"> = {
    project: snapshot.project,
    selection: snapshot.selection,
    hashes: snapshot.hashes,
    diagnostics: snapshot.diagnostics,
    lossAttribution: snapshot.lossAttribution,
  };
  const derive = (
    mutateManifest?: (manifest: DesignRunManifest) => void,
    mutateContext?: (value: typeof context) => void,
  ) => {
    const manifest = structuredClone(loaded.manifest);
    const scoped = structuredClone(context);
    mutateManifest?.(manifest);
    mutateContext?.(scoped);
    return deriveWorkbenchLossDisposition(program, manifest, scoped);
  };
  expect(derive()).toEqual(expect.objectContaining({ id: disposition.id }));
  expect(derive((manifest) => { manifest.program.hash = "0".repeat(64); })).toBeNull();
  expect(derive((manifest) => { manifest.benchmark.contractHash = "0".repeat(64); })).toBeNull();
  expect(derive((manifest) => { manifest.driver.selection.scenario = "changed"; })).toBeNull();
  expect(derive((manifest) => { manifest.driver.hashes.executionHash = "0".repeat(64); })).toBeNull();
  expect(derive((manifest) => { manifest.iterations[1]!.addressedLossTarget!.metric = "changed"; })).toBeNull();
  expect(derive(undefined, (value) => {
    const bucket = value.lossAttribution!.buckets.find((item) => item.id === "input-starvation")!;
    const contributor = bucket.contributors.find((item) => item.id === disposition.target.contributor)!;
    contributor.evidence.starvationTicks = disposition.target.currentValue + 1;
  })).toBeNull();
  expect(derive((manifest) => { manifest.iterations[0]!.lossTargetEvidence!.improved = false; })).toBeNull();
  expect(derive((manifest) => { manifest.iterations[0]!.decision = "KEEP"; })).toBeNull();
  expect(derive((manifest) => { manifest.best.verdict = "DISCARD"; })).toBeNull();
  expect(derive((manifest) => { manifest.frontier.scheduler.searchOrder = ["seed"]; })).toBeNull();
}, 20_000);

test("Design evidence classification chooses current leaf authority without timestamp or hash recency", () => {
  const hash = (value: string) => value.repeat(64);
  const identity: WorkbenchDesignEvidenceIdentity = {
    engineVersion: "inm-sim/test",
    project: "memory-fab",
    program: { id: "commissioned-dram-fab", hash: hash("a") },
    benchmark: { id: "greenfield-dram-design", contractHash: hash("b") },
    seed: {
      source: { kind: "blueprint", blueprint: "generated-dram-fab" },
      sourceBlueprintHash: hash("c"),
      blueprintHash: hash("d"),
    },
    driver: {
      selection: {
        world: "cleanroom",
        blueprint: "generated-dram-fab",
        productionPlan: "production-window",
        scenario: "production-window",
        objective: "dram-output",
      },
      hashes: {
        engineVersion: "inm-sim/test",
        executionHash: hash("x"),
        worldHash: hash("w"),
        blueprintHash: hash("d"),
        scenarioHash: hash("s"),
        objectiveHash: hash("o"),
      },
    },
    promotionBase: { blueprint: "generated-dram-fab", hash: hash("c") },
  };
  const run = (id: string, overrides: Partial<DesignRunSummary> = {}): DesignRunSummary => ({
    id: hash(id),
    path: `/design-runs/${id}`,
    engineVersion: identity.engineVersion,
    project: identity.project,
    program: identity.program.id,
    programHash: identity.program.hash,
    benchmark: identity.benchmark.id,
    benchmarkContractHash: identity.benchmark.contractHash,
    seed: structuredClone(identity.seed),
    driver: structuredClone(identity.driver),
    promotionBase: { ...identity.promotionBase },
    continuation: null,
    budget: { maximum: 1, evaluated: 1 },
    best: {
      iteration: 0,
      blueprintHash: identity.seed.blueprintHash,
      promotionPatchOperations: 0,
      candidateScore: 1,
      scoreDelta: 1,
      verdict: "KEEP",
    },
    stopReason: "budget-exhausted",
    ...overrides,
  });
  const source = run("1");
  const continuation = run("2", {
    continuation: { sourceResultHash: source.id, reusedIterations: 1, reusedExhaustions: 0, additionalCandidateBudget: 1 },
    budget: { maximum: 2, evaluated: 2 },
  });
  const exhausted = run("3", { budget: { maximum: 7, evaluated: 4 }, stopReason: "frontier-exhausted" });
  const promotable = run("4", {
    budget: { maximum: 3, evaluated: 3 },
    best: { ...source.best, iteration: 3, blueprintHash: hash("p"), promotionPatchOperations: 2, candidateScore: 4 },
    stopReason: "frontier-exhausted",
  });
  const historical = run("5", { programHash: hash("e") });
  const staleDriver = run("7", {
    driver: {
      ...structuredClone(identity.driver),
      hashes: { ...identity.driver.hashes, executionHash: hash("y") },
    },
  });
  const evidence = classifyDesignProgramEvidence(identity, [historical, staleDriver, exhausted, source, promotable, continuation], [{
    id: hash("6"), path: "/invalid", program: identity.program.id, code: "design.invalid-run", message: "invalid evidence",
  }]);
  expect(evidence).toEqual(expect.objectContaining({
    state: "promotable",
    authorityRunId: promotable.id,
    currentRuns: 4,
    historicalRuns: 2,
    invalidRuns: 1,
  }));
  expect(evidence.runs.find((item) => item.id === historical.id)?.currentness)
    .toEqual({ state: "historical", reasons: ["program-hash-mismatch"] });
  expect(evidence.runs.find((item) => item.id === staleDriver.id)?.currentness)
    .toEqual({ state: "historical", reasons: ["driver-hashes-mismatch"] });
  expect(evidence.runs.find((item) => item.id === continuation.id)?.outcome).toBe("continuable");
  expect(recommendedDesignProgramEvidenceAction(evidence)).toEqual({
    kind: "promote", effect: "creates-artifact", runId: promotable.id,
  });
  const continuableEvidence = classifyDesignProgramEvidence(identity, [source, continuation], []);
  expect(recommendedDesignProgramEvidenceAction(continuableEvidence)).toEqual({
    kind: "continue", effect: "creates-artifact", runId: continuation.id,
  });
  const exhaustedEvidence = classifyDesignProgramEvidence(identity, [exhausted], []);
  expect(recommendedDesignProgramEvidenceAction(exhaustedEvidence)).toEqual({
    kind: "open", effect: "read-only", runId: exhausted.id,
  });
  const missingEvidence = classifyDesignProgramEvidence(identity, [historical], []);
  expect(recommendedDesignProgramEvidenceAction(missingEvidence)).toEqual({
    kind: "run", effect: "creates-artifact", runId: null,
  });

  const commissionedIdentity: WorkbenchDesignEvidenceIdentity = {
    ...structuredClone(identity),
    seed: {
      ...structuredClone(identity.seed),
      sourceBlueprintHash: promotable.best.blueprintHash,
      blueprintHash: hash("n"),
    },
    driver: {
      ...structuredClone(identity.driver),
      hashes: {
        ...identity.driver.hashes,
        executionHash: hash("z"),
        blueprintHash: hash("n"),
      },
    },
    promotionBase: { ...identity.promotionBase, hash: promotable.best.blueprintHash },
  };
  const commissioning = {
    candidateId: "commissioned-design",
    benchmark: identity.benchmark.id,
    program: identity.program.id,
    runId: promotable.id,
    sourceBlueprintHash: promotable.best.blueprintHash,
    baseBlueprintHash: promotable.promotionBase.hash,
    appliedBlueprintHash: promotable.best.blueprintHash,
    proposalHash: hash("q"),
    reviewResultHash: hash("r"),
  };
  const commissionedEvidence = classifyDesignProgramEvidence(
    commissionedIdentity,
    [promotable],
    [],
    [commissioning],
  );
  expect(commissionedEvidence).toEqual(expect.objectContaining({
    state: "commissioned",
    authorityRunId: promotable.id,
    currentRuns: 0,
    commissionedRuns: 1,
    historicalRuns: 0,
  }));
  expect(commissionedEvidence.runs[0]).toEqual(expect.objectContaining({
    currentness: {
      state: "commissioned",
      reasons: [
        "seed-source-hash-mismatch",
        "seed-blueprint-hash-mismatch",
        "driver-hashes-mismatch",
        "promotion-base-mismatch",
      ],
      commissioning,
    },
  }));
  expect(recommendedDesignProgramEvidenceAction(commissionedEvidence)).toEqual({
    kind: "open", effect: "read-only", runId: promotable.id,
  });
  for (const mutate of [
    (value: typeof commissioning) => { value.program = "other"; },
    (value: typeof commissioning) => { value.runId = hash("8"); },
    (value: typeof commissioning) => { value.benchmark = "other"; },
    (value: typeof commissioning) => { value.sourceBlueprintHash = hash("8"); },
    (value: typeof commissioning) => { value.baseBlueprintHash = hash("8"); },
    (value: typeof commissioning) => { value.appliedBlueprintHash = hash("8"); },
  ]) {
    const broken = structuredClone(commissioning);
    mutate(broken);
    expect(classifyDesignProgramEvidence(commissionedIdentity, [promotable], [], [broken]).state).toBe("missing");
  }
});

test("a pre-contract historical run cannot supply current fab loss authority", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"), {
    world: "cleanroom", blueprint: "equipment-energy-sleep", scenario: "equipment-energy-window", objective: "dram-energy",
  });
  expect(snapshot.status.evidence).toEqual({ state: "missing", runId: null });
  expect(snapshot.lossAttribution).toBeNull();
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code.startsWith("fab-loss."))).toBeFalse();
});

test("a pre-contract Candidate and Design lineage remain historical after apply", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-commissioned-lineage-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes(".inm"),
  });
  await restorePreCompactMemoryFabBlueprint(projectDir);
  await rm(join(
    projectDir,
    "design-runs/inspection-supply-path/6f1f260672f18ae77d72dfb4425a3c9ddd5870f4f50a41cd84d95c0984730bde",
  ), { recursive: true, force: true });

  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  const evidence = snapshot.designPrograms.find((program) => program.id === "inspection-supply-path")!.evidence;
  expect(evidence).toEqual(expect.objectContaining({
    state: "missing",
    authorityRunId: null,
    currentRuns: 0,
    commissionedRuns: 0,
    historicalRuns: 5,
    invalidRuns: 4,
  }));
  expect(evidence.runs.find((run) =>
    run.id === "966127dd542de0b114eafefed250b1f3e8fff02b5cb240592b8a949657e7af06"))
    .toEqual(expect.objectContaining({
    outcome: "promotable",
    currentness: expect.objectContaining({
      state: "historical",
      reasons: expect.arrayContaining([
        "engine-version-mismatch",
        "driver-selection-mismatch",
        "driver-hashes-mismatch",
      ]),
    }),
  }));
  expect(snapshot.lossDispositions.some((disposition) =>
    disposition.source.programId === "inspection-supply-path")).toBeFalse();
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    title: "Refresh incompatible run evidence",
    actionLabel: "RUN SIMULATION",
    effect: "creates-artifact",
    target: expect.objectContaining({ kind: "operation", operationId: "simulate" }),
  }));
  const candidatePath = join(
    projectDir,
    "candidates/inspection-supply-path-966127dd.candidate.json",
  );
  const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
  candidate.hypothesis = `${candidate.hypothesis} Changed after review.`;
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  const brokenSnapshot = await openProjectWorkbenchSnapshot(projectDir);
  const brokenEvidence = brokenSnapshot.designPrograms
    .find((program) => program.id === "inspection-supply-path")!.evidence;
  expect(brokenEvidence).toEqual(expect.objectContaining({
    state: "missing",
    authorityRunId: null,
    currentRuns: 0,
    commissionedRuns: 0,
    historicalRuns: 5,
  }));
  expect(brokenSnapshot.lossDispositions.some((disposition) =>
    disposition.source.programId === "inspection-supply-path")).toBeFalse();
  await rm(root, { recursive: true, force: true });
}, 20_000);

test("a non-KEEP Candidate receipt resolves review work without displacing current fab evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-candidate-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("design-runs") && !source.split("/").includes(".inm"),
  });
  await rm(join(projectDir, "candidate-reviews", "stable-furnace-sleep"), { recursive: true, force: true });

  const review = await previewCandidateOperation(projectDir, "stable-furnace-sleep");
  expect(review.effect).toBe("creates-artifact");
  expect(review.artifacts).toEqual([expect.objectContaining({ kind: "candidate-review", immutable: true })]);
  const reviewed = await openProjectWorkbenchSnapshot(projectDir);
  expect(reviewed.candidates.find((candidate) => candidate.id === "stable-furnace-sleep")?.decision)
    .toEqual(expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD" }));
  expect(reviewed.status.review).toEqual({
    state: "stale",
    pendingCount: 0,
    disposedCount: 4,
    staleCount: 24,
    verifiedCount: 1,
  });
  expect(reviewed.nextAction).toEqual(expect.objectContaining({
    id: expect.stringContaining("design.inspect:layer-two-particle-control:fab-loss."),
    target: expect.objectContaining({ kind: "design-program", programId: "layer-two-particle-control" }),
  }));
}, 20_000);

test("workbench inspection stays read-only for a project without runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-readonly-"));
  const projectDir = join(root, "ironworks");
  await cp(join(repository, "examples/ironworks"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm"),
  });
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  expect(snapshot.runs).toEqual([]);
  expect(snapshot.counts.runs).toBe(0);
  expect(await pathExists(join(projectDir, "runs"))).toBeFalse();
  expect(await pathExists(join(projectDir, ".inm"))).toBeFalse();
});

test("workbench rejects an invalid explicit selection instead of falling back", async () => {
  const projectDir = join(repository, "examples/ironworks");
  expect(openProjectWorkbenchSnapshot(projectDir, { blueprint: "missing-blueprint" }))
    .rejects.toThrow("missing-blueprint.blueprint.json");
});
