import { cp, mkdtemp, rm } from "node:fs/promises";
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
  type ProjectWorkbenchSnapshot,
  type WorkbenchDesignEvidenceIdentity,
} from "./workbench";
import { pathExists, stableStringify } from "./utils";

const repository = resolve(import.meta.dir, "../../..");

test("shared workbench snapshot orients an operator with stable diagnostics and operations", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/ironworks"));
  expect(snapshot.version).toBe(10);
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
    flow: { state: "at-risk", warningCount: 15, infoCount: 12 },
    evidence: { state: "current", runId: "090-simulate" },
    review: { state: "stale", pendingCount: 0, staleCount: 15, verifiedCount: 1 },
  }));
  expect(snapshot.selection.blueprint.id).toBe("generated-dram-fab");
  expect(snapshot.objective.wipResources).toContain("packaged-dram-device");
  expect(snapshot.objective.wipResources).not.toContain("dram-package-substrate");
  expect(snapshot.inventoryAccounting).toEqual(expect.objectContaining({
    runId: "090-simulate",
    averageWip: 19.872825,
    averageTotalInventory: 116.16841666666667,
    averageExcludedInventory: 96.29559166666667,
    peakWip: 56,
  }));
  expect(snapshot.inventoryAccounting?.resources["dram-package-substrate"]).toEqual(expect.objectContaining({
    includedInWip: false,
    averageInventory: 39.4292,
  }));
  expect(snapshot.lossAttribution).toEqual(expect.objectContaining({
    version: 8,
    chain: [
      "input-starvation",
      "yield-quality",
      "queue-congestion",
      "maintenance-qualification",
      "release-admission",
      "power-interruption",
      "setup-campaign",
      "transport-blocking",
    ],
  }));
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "power-interruption")).toMatchObject({
    evidence: {
      unpoweredTicks: 552_076,
      attributedTicks: 552_076,
      unattributedTicks: 0,
      contributors: 7,
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
          unpoweredTicks: 163_777,
          gridUnservedMilliJoules: 149_450,
          gridPeakDeficitMilliWatts: 7_000,
          gridRequiredStorageCapacityMilliJoules: 21_225,
        }),
      }),
      expect.objectContaining({
        id: "device:substrate-receiving-to-packaging-unloader:power-interruption",
        endpointStage: "unloader",
        evidence: expect.objectContaining({ unpoweredTicks: 163_777 }),
      }),
    ]),
  });
  expect(snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "transport-blocking")).toMatchObject({
    label: "Local transport blocking by cause",
    evidence: {
      blockedConnections: 2,
      blockedItemTicks: 58_000,
      connections: 17,
      lineContentionTicks: 33_000,
      endpointCapacityTicks: 15_300,
      endpointPowerTicks: 9_700,
      endpointFailureTicks: 0,
    },
    subjects: [{ kind: "connection", id: "probe-to-packaging" }],
    contributors: expect.arrayContaining([expect.objectContaining({
      id: "connection:probe-to-packaging:transport-line-contention",
      mechanism: "transport-line-contention",
      evidence: expect.objectContaining({
        blockedItemTicks: 46_800,
        lineContentionTicks: 27_000,
        endpointCapacityTicks: 14_000,
        endpointPowerTicks: 5_800,
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
      controlBlockedTicks: 171_738,
      blockedTicks: 171_738,
      attributedTicks: 171_738,
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
          totalTicks: 63_623,
          controlBlockedTicks: 63_623,
          plannedReleaseTick: 36_000,
          actualReleaseTick: 99_623,
          dueTick: 180_000,
          priority: 5,
          releaseOrdinal: 12,
          activeWipBeforeRelease: 5,
          maximumWip: 6,
          reopenAtWip: 5,
        }),
      }),
      expect.objectContaining({ id: "lot:dram-lot-08:release-admission", evidence: expect.objectContaining({ totalTicks: 49_623 }) }),
      expect.objectContaining({ id: "lot:dram-lot-09:release-admission", evidence: expect.objectContaining({ totalTicks: 35_623 }) }),
      expect.objectContaining({ id: "lot:dram-lot-11:release-admission", evidence: expect.objectContaining({ totalTicks: 15_623 }) }),
      expect.objectContaining({ id: "lot:dram-lot-10:release-admission", evidence: expect.objectContaining({ totalTicks: 5_623 }) }),
      expect.objectContaining({ id: "lot:dram-lot-12:release-admission", evidence: expect.objectContaining({ totalTicks: 1_623 }) }),
    ],
  });
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "fab-loss.transport-blocking")).toBeTrue();
  expect(snapshot.catalog.routes.map((route) => route.id)).toEqual(["dram-front-end"]);
  expect(snapshot.experiments.map((experiment) => experiment.id)).toContain("equipment-energy-research");
  expect(snapshot.counts.designPrograms).toBe(9);
  expect(snapshot.designPrograms).toEqual([
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
  expect(snapshot.candidates).toEqual([
    expect.objectContaining({
      id: "candidate-3", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "13d5f06aa3c5df68bfd42c903a38670706a9291c3907d46f23556446cf41505e",
        proposedCandidateHash: "dc9909a63f85966cf52c5b5080159b8e74395080020ae0f79e090ff5a8d006f1",
      }),
    }),
    expect.objectContaining({
      id: "closed-loop-layer-two-etch", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "b57802197eca94e2238013b2ead200e2f39436ae43ebdf1ec944bedca1dfc2d0",
        proposedCandidateHash: "6ed24bc31d8176104a511777e4e6296f04a623547c8d97c491196e28e00f1c23",
      }),
    }),
    expect.objectContaining({
      id: "commissioned-furnace-supply-recovery", benchmark: "greenfield-dram-design", patchOperations: 3,
      decision: expect.objectContaining({
        state: "verified", verdict: "KEEP",
        proposalHash: "04a1b22b3d1d952c98394a838bf054e833c4c8273ac7666da2ced6d398016aac",
        proposedCandidateHash: "35ef45f0eb537a5e2f7a94b40b1e41bf74fb5f13fb21d067ed996443785ed144",
      }),
    }),
    expect.objectContaining({
      id: "commissioned-greenfield-dram-fab", benchmark: "greenfield-dram-design", patchOperations: 74,
      decision: expect.objectContaining({ state: "stale" }),
    }),
    expect.objectContaining({
      id: "commissioned-release-control", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "9ccae6b3df3178e9c2794ca06cb5270f6662a42d89b7d1bee02d5bc1bfe8e2e1",
        proposedCandidateHash: "0bc0ef35709a69a92426608cdcdc6350cb109dc88f3caaad48f7e4f3f46a25e3",
      }),
    }),
    expect.objectContaining({
      id: "commissioned-sustained-starvation-cadence", benchmark: "greenfield-dram-design", patchOperations: 3,
      decision: expect.objectContaining({
        state: "stale",
        proposalHash: "c9f730553f7eab0997d3c057b6c69e083747b7d52c701ade852c15a23a7a6265",
      }),
    }),
    expect.objectContaining({
      id: "continuous-deep-metrology", benchmark: "greenfield-dram-design", patchOperations: 4,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "dedicated-etch-quality-cell", benchmark: "greenfield-dram-design", patchOperations: 27,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "furnace-flex-dual-service", benchmark: "greenfield-dram-design", patchOperations: 4,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
      }),
    }),
    expect.objectContaining({
      id: "identity-safe-release-control", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "a6e8489bce16c1f9148cdd07ac6367b43fac8c5df57317abee03dbb1b05148e5",
        proposedCandidateHash: "c4177e82f758ab0704e8b17fc5213714d7bda6164d3375b03804d3c361ac9891",
      }),
    }),
    expect.objectContaining({
      id: "inspection-edd-resilience", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
      }),
    }),
    expect.objectContaining({
      id: "layer-two-lithography-capacity", benchmark: "greenfield-dram-design", patchOperations: 30,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "lithography-l2-edd", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "639e2552beb8344d3e2e55eba3612265a3b2bb08b2c9738ded86bd323f284b12",
        proposedCandidateHash: "967aa232816e20e936e6e3e16d63114f52971574e825185f19aa36c9394e0a07",
      }),
    }),
    expect.objectContaining({
      id: "planned-lithography-maintenance", benchmark: "greenfield-dram-design", patchOperations: 2,
      decision: expect.objectContaining({
        state: "stale", verdict: "KEEP",
        proposalHash: "165714663627742c4e413d673e23b0b14c521ca89551cbed7ce0b62470300b18",
        proposedCandidateHash: "f4d8d4900067931ca81454498badbc3050041e2eb7a87f2decf3e1e67a600612",
      }),
    }),
    expect.objectContaining({
      id: "portfolio-aware-dram-dispatch", benchmark: "greenfield-dram-design", patchOperations: 1,
      decision: expect.objectContaining({ state: "stale", verdict: "KEEP" }),
    }),
    expect.objectContaining({
      id: "recovered-output-high-throughput", benchmark: "greenfield-dram-design", patchOperations: 7,
      decision: expect.objectContaining({
        state: "stale",
      }),
    }),
    expect.objectContaining({
      id: "stable-furnace-sleep", benchmark: "equipment-energy-research", patchOperations: 1,
      decision: expect.objectContaining({ state: "reviewed-discard", verdict: "DISCARD", proposalHash: "7a901798f75777ed93f195cec9e4e140ec68fed7d7ea1a61270fff993355f174" }),
    }),
  ]);
  expect(snapshot.nextAction).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^design\.inspect:commissioned-dram-fab:fab-loss\.input-starvation:/),
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "design", snapshot.project.rootDir, "--program", "commissioned-dram-fab", "--json"],
    studioRoute: "/memory-fab/designs/commissioned-dram-fab",
    target: expect.objectContaining({
      kind: "design-program",
      programId: "commissioned-dram-fab",
      diagnosticId: expect.stringMatching(/^fab-loss\.input-starvation:/),
    }),
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
  expect(buildWorkbenchNextAction({ ...snapshot, designPrograms: withExhaustedEvidence })).toEqual(expect.objectContaining({
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
      contributingDevices: 8,
      rawWaitingInputTicks: 1_588_215,
      flowRawWaitingInputTicks: 1_356_215,
      exceptionWaitingInputTicks: 232_000,
      boundaryWaitingInputTicks: 1_106_939,
      opportunityWindowTicks: 1_181_061,
      unavailableGapTicks: 79_000,
      starvationTicks: 249_276,
      subjectStarvationTicks: 59_584,
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
      starvationTicks: 40_456,
      opportunityWindowTicks: 112_456,
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

test("current inspection and yield evidence advances the shared handoff to the focused layer-one queue Program", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-workbench-before-queue-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, { recursive: true });
  await rm(join(projectDir, "design-runs/front-end-queue-convergence"), { recursive: true, force: true });
  const snapshot = await openProjectWorkbenchSnapshot(projectDir);
  expect(snapshot.version).toBe(10);
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "fab-loss.input-starvation")).toBeTrue();
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
        runId: "9ede1fd47e7006179f29e5ca9434762d7fa098c81139d15340626ee4faf0d269",
      }),
      observed: expect.objectContaining({ runId: "090-simulate" }),
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
        runId: "630b46d261c21a6c31a39d1d0ea345eebdc73d2100224e64fb01eac2fd27dde2",
      }),
      observed: expect.objectContaining({ runId: "090-simulate" }),
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
        runId: "efdf2963a73292a245dc9c562f1e6642785b7dfeec10bbf258aa5e6d6fce6227",
      }),
      observed: expect.objectContaining({ runId: "090-simulate" }),
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
        runId: "1a23962af0674431da235210d017fa8cba39c296ecca06d4f61ff2e5a67ed49d",
      }),
      observed: expect.objectContaining({ runId: "090-simulate" }),
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
        runId: "eee125da8b3184e8042e64ac1f06a9d23e068731ec9df97a4907db679881cefb",
      }),
      observed: expect.objectContaining({ runId: "090-simulate" }),
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
      authorityRunId: "eee125da8b3184e8042e64ac1f06a9d23e068731ec9df97a4907db679881cefb",
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
  const disposition = snapshot.lossDispositions[0]!;
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
  expect(derive((manifest) => { manifest.driver.hashes.deviceCatalogHash = "0".repeat(64); })).toBeNull();
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
        scenario: "production-window",
        objective: "dram-output",
      },
      hashes: {
        engineVersion: "inm-sim/test",
        resourceCatalogHash: hash("r"),
        processCatalogHash: hash("p"),
        routeCatalogHash: hash("t"),
        deviceCatalogHash: hash("v"),
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
    best: { ...source.best, iteration: 3, promotionPatchOperations: 2, candidateScore: 4 },
    stopReason: "frontier-exhausted",
  });
  const historical = run("5", { programHash: hash("e") });
  const staleDriver = run("7", {
    driver: {
      ...structuredClone(identity.driver),
      hashes: { ...identity.driver.hashes, deviceCatalogHash: hash("x") },
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
  expect(classifyDesignProgramEvidence(identity, [exhausted], []).state).toBe("exhausted");
  expect(classifyDesignProgramEvidence(identity, [], []).state).toBe("missing");
});

test("a historical run with a stale Device catalog cannot supply current fab loss authority", async () => {
  const snapshot = await openProjectWorkbenchSnapshot(join(repository, "examples/memory-fab"), {
    world: "cleanroom", blueprint: "equipment-energy-sleep", scenario: "equipment-energy-window", objective: "dram-energy",
  });
  expect(snapshot.status.evidence).toEqual({ state: "incompatible", runId: "066-simulate" });
  expect(snapshot.lossAttribution).toBeNull();
  expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code.startsWith("fab-loss."))).toBeFalse();
});

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
  expect(reviewed.status.review).toEqual({ state: "stale", pendingCount: 0, staleCount: 15, verifiedCount: 1 });
  expect(reviewed.nextAction).toEqual(expect.objectContaining({
    id: expect.stringContaining("design.inspect:commissioned-dram-fab:fab-loss."),
    target: expect.objectContaining({ kind: "design-program", programId: "commissioned-dram-fab" }),
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
