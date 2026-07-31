import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileFactoryProject } from "./compiler";
import { analyzeInputStarvation, analyzeQualityContributors, analyzeQueueCongestion, analyzeReleaseAdmission, analyzeSetupCampaign, analyzeTransportBlocking } from "./fab-loss-analysis";
import { loadFactoryProject } from "./loader";
import { runUntil } from "./simulator";
import type { CompiledFactoryProject, FactoryEvent, FactoryMetrics, InputSupplyState, MaterialInputShortage, TransportBlockTicks } from "./types";

const transportBlockTicks = (
  values: Partial<Record<keyof TransportBlockTicks, Partial<TransportBlockTicks[keyof TransportBlockTicks]>>> = {},
): TransportBlockTicks => ({
  "line-contention": { line: 0, loader: 0, unloader: 0, ...values["line-contention"] },
  "endpoint-capacity": { line: 0, loader: 0, unloader: 0, ...values["endpoint-capacity"] },
  "endpoint-power": { line: 0, loader: 0, unloader: 0, ...values["endpoint-power"] },
  "endpoint-failure": { line: 0, loader: 0, unloader: 0, ...values["endpoint-failure"] },
});

const clearTransportFlow = {
  departedItems: 12,
  deliveredItems: 12,
  departedByResource: { "dram-wafer-lot": 12 },
  deliveredByResource: { "dram-wafer-lot": 12 },
  departedItemsPerMinute: 72,
  deliveredItemsPerMinute: 72,
  capacityItemsPerMinute: 240,
  utilization: .3,
  averageInFlightItems: .6,
  blockedItemTicks: 0,
  blockedFraction: 0,
  blockedItemTicksByCause: transportBlockTicks(),
} satisfies FactoryMetrics["transportFlows"][string];

test("setup attribution separates commissioning from exact recurring Process transitions", async () => {
  const projectDir = resolve("examples/memory-fab");
  const project = compileFactoryProject(await loadFactoryProject(projectDir));
  const metrics = JSON.parse(await readFile(resolve(projectDir, "runs/090-simulate/metrics.json"), "utf8")) as FactoryMetrics;
  const events = (await readFile(resolve(projectDir, "runs/090-simulate/events.ndjson"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line) as FactoryEvent);
  const bucket = analyzeSetupCampaign(metrics, project.scenario.durationTicks, project, events);

  expect(bucket).toMatchObject({
    subjects: [{ kind: "device", id: "burn-in-1" }],
    evidence: {
      changeovers: 5,
      setupTicks: 21_000,
      commissioningSetupTicks: 10_000,
      productionChangeoverTicks: 11_000,
      campaignHolds: 0,
      campaignHoldTicks: 0,
      totalTicks: 21_000,
      attributedTicks: 21_000,
      unattributedTicks: 0,
      contributors: 5,
    },
  });
  expect(bucket.contributors.map((contributor) => ({
    id: contributor.id,
    mechanism: contributor.mechanism,
    process: contributor.processes[0],
    ticks: contributor.evidence.totalTicks,
    power: contributor.evidence.powerMilliWatts,
  }))).toEqual([
    {
      id: "device:burn-in-1:production-changeover:reliability-screen:commercial-screen:screen-commercial-dram",
      mechanism: "equipment-production-changeover",
      process: "screen-commercial-dram",
      ticks: 8_000,
      power: 180_000,
    },
    {
      id: "device:lithography-l2:commissioning-setup:unconfigured:photo-mask-l2:pattern-cell-layer-2",
      mechanism: "equipment-commissioning-setup",
      process: "pattern-cell-layer-2",
      ticks: 4_000,
      power: 180_000,
    },
    {
      id: "device:burn-in-1:commissioning-setup:unconfigured:reliability-screen:screen-performance-mix",
      mechanism: "equipment-commissioning-setup",
      process: "screen-performance-mix",
      ticks: 3_000,
      power: 180_000,
    },
    {
      id: "device:burn-in-1:production-changeover:commercial-screen:reliability-screen:screen-performance-mix",
      mechanism: "equipment-production-changeover",
      process: "screen-performance-mix",
      ticks: 3_000,
      power: 180_000,
    },
    {
      id: "device:etch-l2:commissioning-setup:unconfigured:etch-recipe-l2:etch-cell-layer-2",
      mechanism: "equipment-commissioning-setup",
      process: "etch-cell-layer-2",
      ticks: 3_000,
      power: 180_000,
    },
  ]);
  expect(bucket.contributors.reduce((total, contributor) => total + contributor.evidence.setupTicks!, 0))
    .toBe(metrics.equipmentSetups.totalSetupTicks);
});

test("setup attribution retains campaign release cause and held time separately", async () => {
  const project = compileFactoryProject(await loadFactoryProject(resolve("examples/memory-fab")));
  const events: FactoryEvent[] = [
    {
      type: "device.campaign-held",
      tick: 10_000,
      device: "burn-in-1",
      from: "reliability-screen",
      to: "commercial-screen",
      readyLots: 1,
      minimumReadyLots: 3,
      deadlineTick: 15_000,
    },
    {
      type: "device.campaign-released",
      tick: 15_000,
      device: "burn-in-1",
      from: "reliability-screen",
      to: "commercial-screen",
      readyLots: 2,
      heldTicks: 5_000,
      cause: "maximum-hold",
    },
  ];
  const metrics = {
    equipmentSetups: {
      totalChangeovers: 0,
      totalSetupTicks: 0,
      totalCampaignHolds: 1,
      totalCampaignHoldTicks: 5_000,
      campaignMinimumLotReleases: 0,
      campaignMaximumHoldReleases: 1,
      devices: {},
    },
  };
  const bucket = analyzeSetupCampaign(metrics, 20_000, project, events);

  expect(bucket.contributors).toEqual([
    expect.objectContaining({
      id: "device:burn-in-1:campaign-hold:reliability-screen:commercial-screen:screen-commercial-dram:maximum-hold",
      mechanism: "setup-campaign-hold",
      setupFrom: "reliability-screen",
      setupTo: "commercial-screen",
      releaseCause: "maximum-hold",
      processes: ["screen-commercial-dram"],
      evidence: expect.objectContaining({
        totalTicks: 5_000,
        setupTicks: 0,
        campaignHoldTicks: 5_000,
        campaignHolds: 1,
        maximumHoldReleases: 1,
      }),
    }),
  ]);
});

test("release admission conserves exact per-lot controller wait and preserves Production Plan authority", async () => {
  const projectDir = resolve("examples/memory-fab");
  const project = compileFactoryProject(await loadFactoryProject(projectDir));
  const metrics = JSON.parse(await readFile(resolve(projectDir, "runs/090-simulate/metrics.json"), "utf8")) as FactoryMetrics;
  const events = (await readFile(resolve(projectDir, "runs/090-simulate/events.ndjson"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line) as FactoryEvent);
  const bucket = analyzeReleaseAdmission(metrics, project.scenario.durationTicks, project, events);

  expect(bucket).toMatchObject({
    subjects: [
      { kind: "device", id: "lot-release" },
      { kind: "route", id: "dram-front-end" },
    ],
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
  });
  expect(bucket.contributors.map((contributor) => ({
    lot: contributor.label,
    ticks: contributor.evidence.totalTicks,
    planned: contributor.evidence.plannedReleaseTick,
    actual: contributor.evidence.actualReleaseTick,
    due: contributor.evidence.dueTick,
    priority: contributor.evidence.priority,
    ordinal: contributor.evidence.releaseOrdinal,
  }))).toEqual([
    { lot: "dram-lot-07", ticks: 63_623, planned: 36_000, actual: 99_623, due: 180_000, priority: 5, ordinal: 12 },
    { lot: "dram-lot-08", ticks: 49_623, planned: 42_000, actual: 91_623, due: 170_000, priority: 5, ordinal: 11 },
    { lot: "dram-lot-09", ticks: 35_623, planned: 48_000, actual: 83_623, due: 160_000, priority: 5, ordinal: 10 },
    { lot: "dram-lot-11", ticks: 15_623, planned: 60_000, actual: 75_623, due: 140_000, priority: 10, ordinal: 9 },
    { lot: "dram-lot-10", ticks: 5_623, planned: 54_000, actual: 59_623, due: 150_000, priority: 10, ordinal: 7 },
    { lot: "dram-lot-12", ticks: 1_623, planned: 66_000, actual: 67_623, due: 130_000, priority: 10, ordinal: 8 },
  ]);
  expect(bucket.contributors.reduce((total, contributor) => total + contributor.evidence.controlBlockedTicks!, 0))
    .toBe(metrics.releaseFlow.controlBlockedTicks);
});

test("release admission partitions cause transitions for a pending lot", async () => {
  const project = compileFactoryProject(await loadFactoryProject(resolve("examples/memory-fab")));
  const metrics = JSON.parse(await readFile(resolve("examples/memory-fab/runs/090-simulate/metrics.json"), "utf8")) as FactoryMetrics;
  const declaration = project.productionPlan.lotReleases![0]!;
  const syntheticProject = {
    resources: project.resources,
    routes: project.routes,
    productionPlan: { ...project.productionPlan, lotReleases: [declaration] },
    scenario: { ...project.scenario, durationTicks: 100 },
  };
  const syntheticMetrics = {
    lotFlow: { ...metrics.lotFlow, scheduled: 1, released: 0, pendingRelease: 1 },
    releaseFlow: {
      ...metrics.releaseFlow,
      scheduled: 1,
      released: 0,
      pending: 1,
      capacityBlockedLots: 1,
      capacityBlockedTicks: 50,
      controlBlockedLots: 1,
      controlBlockedTicks: 50,
    },
  };
  const events: FactoryEvent[] = [
    { type: "lot.release-blocked", tick: 0, device: declaration.device, buffer: declaration.buffer, lot: declaration.id, reason: "buffer-capacity", activeWip: 0, maximumWip: null },
    { type: "lot.release-blocked", tick: 30, device: declaration.device, buffer: declaration.buffer, lot: declaration.id, reason: "resource-capacity", activeWip: 0, maximumWip: null },
    { type: "lot.release-blocked", tick: 50, device: declaration.device, buffer: declaration.buffer, lot: declaration.id, reason: "conwip-limit", activeWip: 6, maximumWip: 6 },
  ];
  const bucket = analyzeReleaseAdmission(syntheticMetrics, 100, syntheticProject, events);

  expect(bucket.contributors).toHaveLength(1);
  expect(bucket.contributors[0]).toMatchObject({
    label: "dram-lot-01",
    evidence: {
      totalTicks: 100,
      bufferCapacityTicks: 30,
      resourceCapacityTicks: 20,
      controlBlockedTicks: 50,
      pending: 1,
      causeTransitions: 3,
    },
  });
});

test("necessary tracked-lot transit is context rather than recoverable transport loss", () => {
  const bucket = analyzeTransportBlocking({
    lotFlow: { family: "dram-wafer", meanTransportTimeTicks: 9_000 },
    transportFlows: {
      "clear-lane": clearTransportFlow,
    },
  }, 100_000);

  expect(bucket).toMatchObject({
    score: 0,
    summary: "Tracked lots averaged 9.0 s in necessary transit (context only); 0/1 connections accumulated 0.0 blocked item-s (0.0 line, 0.0 endpoint capacity, 0.0 endpoint power, 0.0 endpoint failure).",
    subjects: [{ kind: "project", id: "dram-wafer" }],
    evidence: {
      connections: 1,
      blockedConnections: 0,
      meanTransportTicks: 9_000,
      blockedItemTicks: 0,
    },
    contributors: [],
  });
});

test("transport blocking identifies positive connections and preserves exact physical causes", () => {
  const bucket = analyzeTransportBlocking({
    lotFlow: { family: "dram-wafer", meanTransportTimeTicks: 9_000 },
    transportFlows: {
      "clear-lane": clearTransportFlow,
      "blocked-lane": {
        ...clearTransportFlow,
        departedByResource: { "blank-dram-wafer-lot": 8, "process-gas": 0 },
        deliveredByResource: { "blank-dram-wafer-lot": 7 },
        blockedItemTicks: 6_000,
        blockedFraction: .25,
        blockedItemTicksByCause: transportBlockTicks({
          "line-contention": { line: 2_000 },
          "endpoint-capacity": { unloader: 4_000 },
        }),
      },
    },
  }, 100_000);

  expect(bucket).toMatchObject({
    score: .03,
    subjects: [{ kind: "connection", id: "blocked-lane" }],
    evidence: {
      connections: 2,
      blockedConnections: 1,
      meanTransportTicks: 9_000,
      blockedItemTicks: 6_000,
      lineContentionTicks: 2_000,
      endpointCapacityTicks: 4_000,
      endpointPowerTicks: 0,
      endpointFailureTicks: 0,
    },
    contributors: [{
      id: "connection:blocked-lane:transport-endpoint-capacity",
      label: "blocked-lane",
      mechanism: "transport-endpoint-capacity",
      resources: ["blank-dram-wafer-lot"],
      subjects: [{ kind: "connection", id: "blocked-lane" }],
      evidence: {
        blockedItemTicks: 6_000,
        blockedFraction: .25,
        utilization: .3,
        deliveredItemsPerMinute: 72,
        capacityItemsPerMinute: 240,
        lineContentionTicks: 2_000,
        endpointCapacityTicks: 4_000,
        endpointPowerTicks: 0,
        endpointFailureTicks: 0,
        loaderCapacityTicks: 0,
        unloaderCapacityTicks: 4_000,
      },
    }],
  });
});

test("transport blocking rejects a total that disagrees with its strict physical-cause partition", () => {
  expect(() => analyzeTransportBlocking({
    lotFlow: { family: "dram-wafer", meanTransportTimeTicks: 9_000 },
    transportFlows: {
      "invalid-lane": {
        ...clearTransportFlow,
        blockedItemTicks: 1,
      },
    },
  }, 100_000)).toThrow("physical-cause partition sums to 0");
});

test("tracked-lot queue attribution conserves completed-lot wait at exact upstream locations", async () => {
  const projectDir = resolve("examples/memory-fab");
  const project = compileFactoryProject(await loadFactoryProject(projectDir));
  const metrics = JSON.parse(await readFile(resolve(projectDir, "runs/089-simulate/metrics.json"), "utf8")) as FactoryMetrics;
  const events = (await readFile(resolve(projectDir, "runs/089-simulate/events.ndjson"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line) as FactoryEvent);
  const bucket = analyzeQueueCongestion(metrics, project, events);

  expect(bucket).toMatchObject({
    subjects: [
      { kind: "device", id: "etch-1" },
      { kind: "route", id: "dram-front-end" },
    ],
    evidence: {
      completedLots: 12,
      meanQueueTicks: 5_513.833333333333,
      totalQueueTicks: 66_166,
      attributedQueueTicks: 66_166,
      unattributedQueueTicks: 0,
      contributors: 6,
      subjectQueueTicks: 21_500,
    },
  });
  expect(bucket.contributors.map((contributor) => ({
    label: contributor.label,
    mechanism: contributor.mechanism,
    step: contributor.step,
    process: contributor.processes[0],
    ticks: contributor.evidence.queueTicks,
  }))).toEqual([
    { label: "etch-1", mechanism: "process-queue-wait", step: "etch-cell-layer-1", process: "etch-cell-layer-1", ticks: 21_500 },
    { label: "probe-1", mechanism: "process-queue-wait", step: "probe-dram", process: "probe-sort-dram-standard", ticks: 17_210 },
    { label: "etch-l2", mechanism: "process-queue-wait", step: "etch-cell-layer-2", process: "etch-cell-layer-2", ticks: 11_333 },
    { label: "lithography-l2", mechanism: "process-queue-wait", step: "pattern-cell-layer-2", process: "pattern-cell-layer-2", ticks: 7_544 },
    { label: "deposition-1", mechanism: "process-queue-wait", step: "deposit-dielectric-stack", process: "deposit-dielectric-stack", ticks: 6_000 },
    { label: "inspection-1", mechanism: "process-queue-wait", step: "final-inspection", process: "inspect-final-pattern-deep", ticks: 2_579 },
  ]);
  expect(bucket.contributors.flatMap((contributor) => contributor.subjects)
    .some((subject) => subject.kind === "device" && subject.id === "burn-in-1")).toBeFalse();
  expect(bucket.contributors.reduce((total, contributor) => total + contributor.evidence.queueTicks!, 0))
    .toBe(bucket.evidence.totalQueueTicks!);
});

test("input starvation counts only available gaps between repeated productive jobs", async () => {
  const project = compileFactoryProject(await loadFactoryProject(resolve("examples/memory-fab")));
  const devices = {
    "lithography-1": project.devices["lithography-1"]!,
    "lithography-l2": project.devices["lithography-l2"]!,
    "rework-1": project.devices["rework-1"]!,
  } satisfies Pick<CompiledFactoryProject, "devices">["devices"];
  const metrics = {
    waitingInputTime: { "lithography-1": 180, "lithography-l2": 140, "rework-1": 140 },
    machineUtilization: { "lithography-1": .5, "lithography-l2": .2, "rework-1": .2 },
    lotFlow: { family: "dram-wafer" },
  } satisfies Pick<FactoryMetrics, "waitingInputTime" | "machineUtilization">
    & { lotFlow: Pick<FactoryMetrics["lotFlow"], "family"> };
  const shortage = (state: InputSupplyState, inFlight = 0): MaterialInputShortage[] => [{
    buffer: "release-input",
    resource: "blank-dram-wafer-lot",
    required: 1,
    available: 0,
    missing: 1,
    minimumTreatmentLevel: 0,
    supplies: [{
      connection: "release-to-lithography",
      sourceDevice: "lot-release",
      sourceBuffer: "storage",
      sourceAvailable: 0,
      inFlight,
      sourceStatus: state === "source-processing" ? "processing" : "idle",
      loaderDevice: "release-to-lithography-loader",
      loaderStatus: "idle",
      unloaderDevice: "release-to-lithography-unloader",
      unloaderStatus: "idle",
      state,
    }],
  }];
  const events = [
    { type: "device.start", tick: 0, device: "lithography-1", operation: "pattern-cell-layer-1", durationTicks: 10 },
    { type: "device.finish", tick: 10, device: "lithography-1", operation: "pattern-cell-layer-1", produced: [] },
    { type: "device.input-starved", tick: 10, device: "lithography-1", process: "pattern-cell-layer-1", shortages: shortage("source-processing") },
    { type: "device.maintenance-start", tick: 20, device: "lithography-1" },
    { type: "device.maintenance-finish", tick: 30, device: "lithography-1" },
    { type: "device.changeover-start", tick: 30, device: "lithography-1" },
    { type: "device.changeover-finish", tick: 40, device: "lithography-1" },
    { type: "device.breakdown", tick: 40, device: "lithography-1" },
    { type: "device.recover", tick: 50, device: "lithography-1" },
    { type: "buffer.blocked", tick: 50, device: "lithography-1" },
    { type: "buffer.unblocked", tick: 60, device: "lithography-1" },
    { type: "device.batch-held", tick: 60, device: "lithography-1" },
    { type: "device.batch-released", tick: 70, device: "lithography-1" },
    { type: "device.campaign-held", tick: 70, device: "lithography-1" },
    { type: "device.campaign-released", tick: 80, device: "lithography-1" },
    { type: "device.tooling-blocked", tick: 80, device: "lithography-1" },
    { type: "device.tooling-acquired", tick: 90, device: "lithography-1" },
    { type: "device.utility-blocked", tick: 90, device: "lithography-1" },
    { type: "device.utility-acquired", tick: 100, device: "lithography-1" },
    { type: "device.sleep", tick: 100, device: "lithography-1" },
    { type: "device.wake-finish", tick: 110, device: "lithography-1" },
    { type: "power.shortage", tick: 110, device: "lithography-1" },
    { type: "power.restored", tick: 120, device: "lithography-1" },
    { type: "device.input-restored", tick: 125, device: "lithography-1", process: "pattern-cell-layer-1", cause: "changed" },
    { type: "device.input-starved", tick: 125, device: "lithography-1", process: "pattern-cell-layer-1", shortages: shortage("transport-in-flight", 1) },
    { type: "device.input-restored", tick: 130, device: "lithography-1", process: "pattern-cell-layer-1", cause: "ready" },
    { type: "device.start", tick: 130, device: "lithography-1", operation: "pattern-cell-layer-1", durationTicks: 10 },
    { type: "device.finish", tick: 140, device: "lithography-1", operation: "pattern-cell-layer-1", produced: [] },
    { type: "device.input-starved", tick: 140, device: "lithography-1", process: "pattern-cell-layer-1", shortages: shortage("source-empty") },
    { type: "device.input-restored", tick: 160, device: "lithography-1", process: "pattern-cell-layer-1", cause: "ready" },
    { type: "device.start", tick: 160, device: "lithography-1", operation: "pattern-cell-layer-1", durationTicks: 10 },
    { type: "device.finish", tick: 170, device: "lithography-1", operation: "pattern-cell-layer-1", produced: [] },
    { type: "device.start", tick: 50, device: "lithography-l2", operation: "pattern-cell-layer-2", durationTicks: 10 },
    { type: "device.finish", tick: 60, device: "lithography-l2", operation: "pattern-cell-layer-2", produced: [] },
    { type: "device.start", tick: 0, device: "rework-1", operation: "rework-final-pattern", durationTicks: 10 },
    { type: "device.finish", tick: 10, device: "rework-1", operation: "rework-final-pattern", produced: [] },
    { type: "device.start", tick: 50, device: "rework-1", operation: "rework-final-pattern", durationTicks: 10 },
    { type: "device.finish", tick: 60, device: "rework-1", operation: "rework-final-pattern", produced: [] },
  ] as unknown as FactoryEvent[];

  const bucket = analyzeInputStarvation(metrics, 200, { devices }, events);

  expect(bucket).toMatchObject({
    score: 40 / 170,
    subjects: [
      { kind: "device", id: "lithography-1" },
      { kind: "connection", id: "release-to-lithography" },
      { kind: "device", id: "lot-release" },
    ],
    evidence: {
      activeProductiveDevices: 3,
      flowProductiveDevices: 2,
      contributingDevices: 1,
      rawWaitingInputTicks: 460,
      flowRawWaitingInputTicks: 320,
      exceptionWaitingInputTicks: 140,
      boundaryWaitingInputTicks: 280,
      opportunityWindowTicks: 170,
      interJobGapTicks: 140,
      unavailableGapTicks: 100,
      starvationTicks: 40,
    },
    contributors: [{
      id: "device:lithography-1:material-input-shortage",
      mechanism: "material-input-shortage",
      resources: ["blank-dram-wafer-lot"],
      processes: ["pattern-cell-layer-1"],
      evidence: {
        jobs: 3,
        opportunityWindowTicks: 170,
        interJobGapTicks: 140,
        unavailableGapTicks: 100,
        starvationTicks: 40,
        unattributedGapTicks: 0,
      },
      inputStates: [
        {
          process: "pattern-cell-layer-1",
          starvationTicks: 20,
          shortages: [{ resource: "blank-dram-wafer-lot", supplies: [{ state: "source-empty" }] }],
        },
        {
          process: "pattern-cell-layer-1",
          starvationTicks: 15,
          shortages: [{ resource: "blank-dram-wafer-lot", supplies: [{ state: "source-processing" }] }],
        },
        {
          process: "pattern-cell-layer-1",
          starvationTicks: 5,
          shortages: [{ resource: "blank-dram-wafer-lot", supplies: [{ state: "transport-in-flight" }] }],
        },
      ],
    }],
  });
});

test("runtime material starvation records multi-input shortages, state changes, restoration, and conserved attribution", async () => {
  const project = compileFactoryProject(await loadFactoryProject(resolve("examples/memory-fab")));
  const result = runUntil(project);
  const opened = result.events.filter((event): event is Extract<FactoryEvent, { type: "device.input-starved" }> =>
    event.type === "device.input-starved");
  const restored = result.events.filter((event): event is Extract<FactoryEvent, { type: "device.input-restored" }> =>
    event.type === "device.input-restored");
  const packaging = opened.find((event) => event.device === "packaging-1" && event.shortages.length === 2);
  expect(packaging).toMatchObject({
    process: "package-known-good-dram",
    shortages: [
      {
        buffer: "die-input",
        resource: "known-good-dram-die",
        required: 1,
        available: 0,
        missing: 1,
        supplies: [{ connection: "probe-to-packaging", sourceDevice: "probe-1" }],
      },
      {
        buffer: "substrate-input",
        resource: "dram-package-substrate",
        required: 1,
        available: 0,
        missing: 1,
        supplies: [{ connection: "substrate-receiving-to-packaging", sourceDevice: "substrate-receiving" }],
      },
    ],
  });
  const changed = restored.find((event) => event.cause === "changed");
  expect(changed).toBeDefined();
  expect(opened.some((event) => event.device === changed!.device && event.tick === changed!.tick)).toBeTrue();
  expect(restored.some((event) => event.cause === "ready")).toBeTrue();

  const bucket = analyzeInputStarvation(result.metrics, project.scenario.durationTicks, project, result.events);
  expect(bucket.contributors.length).toBeGreaterThan(0);
  for (const contributor of bucket.contributors) {
    expect(contributor.inputStates.reduce((sum, state) => sum + state.starvationTicks, 0))
      .toBe(contributor.evidence.starvationTicks!);
    expect(contributor.resources.length).toBeGreaterThan(0);
    expect(contributor.inputStates.every((state) => state.shortages.every((shortage) =>
      shortage.supplies.length > 0))).toBeTrue();
  }
});

test("quality contributors trace authored, drift, and Q-time defects to separate outcomes", async () => {
  const project = compileFactoryProject(await loadFactoryProject(resolve("examples/memory-fab")));
  const events = [
    {
      type: "lot.quality-excursion", tick: 10, device: "etch-l2", lot: "lot-a",
      process: "etch-cell-layer-2", mode: "qualified", excursion: "authored-cd",
      authoredDefects: ["critical-dimension"], preventedDefects: [], defects: ["critical-dimension"],
    },
    {
      type: "lot.inspected", tick: 20, device: "inspection-1", lot: "lot-a",
      process: "inspect-final-pattern-deep", result: "reject", detectedDefects: ["critical-dimension"], reworkCycles: 0,
    },
    {
      type: "lot.reworked", tick: 30, device: "rework-1", lot: "lot-a",
      process: "rework-final-pattern", repairedDefects: ["critical-dimension"], remainingDefects: [], reworkCycles: 1,
    },
    {
      type: "lot.queue-time-violation", tick: 40, device: "inspection-1", lot: "lot-a",
      route: "dram-front-end", step: "final-inspection", process: "inspect-final-pattern-deep",
      queueTicks: 80, maximumTicks: 35, defects: ["particle-contamination"],
    },
    {
      type: "lot.inspected", tick: 50, device: "inspection-1", lot: "lot-a",
      process: "inspect-final-pattern-deep", result: "scrap", detectedDefects: ["particle-contamination"], reworkCycles: 1,
    },
    {
      type: "device.process-drift", tick: 15, device: "etch-l2", process: "etch-cell-layer-2",
      lotIds: ["lot-b", "lot-c"], afterJobs: 5, jobsSinceMaintenance: 6, durationTicks: 5,
      powerMilliWatts: 1, defects: ["latent-electrical"],
    },
    {
      type: "lot.inspected", tick: 25, device: "inspection-1", lot: "lot-b",
      process: "inspect-final-pattern-deep", result: "reject", detectedDefects: ["latent-electrical"], reworkCycles: 0,
    },
    {
      type: "lot.reworked", tick: 35, device: "rework-1", lot: "lot-b",
      process: "rework-final-pattern", repairedDefects: [], remainingDefects: ["latent-electrical"], reworkCycles: 1,
    },
    {
      type: "lot.inspected", tick: 45, device: "inspection-1", lot: "lot-b",
      process: "inspect-final-pattern-deep", result: "scrap", detectedDefects: ["latent-electrical"], reworkCycles: 1,
    },
    {
      type: "lot.output-profile", tick: 55, device: "probe-1", lot: "lot-c",
      process: "probe-sort-dram-standard", profile: "latent-loss", defects: ["latent-electrical"],
      nominalOutputs: [], actualOutputs: [],
    },
  ] as unknown as FactoryEvent[];

  expect(analyzeQualityContributors(project, events)).toMatchObject([
    {
      mechanism: "equipment-process-drift",
      route: "dram-front-end",
      step: "etch-cell-layer-2",
      processes: ["etch-cell-layer-2"],
      defects: ["latent-electrical"],
      lots: ["lot-b", "lot-c"],
      subjects: [{ kind: "device", id: "etch-l2" }, { kind: "route", id: "dram-front-end" }],
      evidence: {
        originEvents: 1,
        introducedLots: 2,
        introducedDefectInstances: 2,
        detectedLots: 1,
        reworkAttemptedLots: 1,
        repairedLots: 0,
        persistentLots: 1,
        scrappedLots: 1,
        escapedLots: 1,
      },
    },
    {
      mechanism: "route-q-time-defect",
      route: "dram-front-end",
      step: "final-inspection",
      defects: ["particle-contamination"],
      lots: ["lot-a"],
      evidence: {
        introducedLots: 1,
        detectedLots: 1,
        reworkAttemptedLots: 0,
        repairedLots: 0,
        persistentLots: 0,
        scrappedLots: 1,
        escapedLots: 0,
      },
    },
    {
      mechanism: "quality-excursion",
      route: "dram-front-end",
      step: "etch-cell-layer-2",
      defects: ["critical-dimension"],
      lots: ["lot-a"],
      evidence: {
        introducedLots: 1,
        detectedLots: 1,
        reworkAttemptedLots: 1,
        repairedLots: 1,
        persistentLots: 0,
        scrappedLots: 0,
        escapedLots: 0,
      },
    },
  ]);
});

test("quality contributor identity separates defect classes at one physical origin", async () => {
  const project = compileFactoryProject(await loadFactoryProject(resolve("examples/memory-fab")));
  const events = [
    {
      type: "lot.quality-excursion", tick: 10, device: "etch-l2", lot: "lot-a",
      process: "etch-cell-layer-2", mode: "qualified", excursion: "authored-combined",
      authoredDefects: ["critical-dimension", "particle-contamination"], preventedDefects: [],
      defects: ["critical-dimension", "particle-contamination"],
    },
    {
      type: "lot.inspected", tick: 20, device: "inspection-1", lot: "lot-a",
      process: "inspect-final-pattern-deep", result: "reject",
      detectedDefects: ["critical-dimension", "particle-contamination"], reworkCycles: 0,
    },
    {
      type: "lot.reworked", tick: 30, device: "rework-1", lot: "lot-a",
      process: "recover-final-pattern-advanced", repairedDefects: ["critical-dimension", "particle-contamination"],
      remainingDefects: [], reworkCycles: 1,
    },
  ] as unknown as FactoryEvent[];

  const contributors = analyzeQualityContributors(project, events);
  expect(contributors).toHaveLength(2);
  expect(contributors.map((contributor) => contributor.id)).toEqual([
    "quality:quality-excursion:dram-front-end:etch-cell-layer-2:etch-l2:etch-cell-layer-2:critical-dimension",
    "quality:quality-excursion:dram-front-end:etch-cell-layer-2:etch-l2:etch-cell-layer-2:particle-contamination",
  ]);
  expect(contributors.map((contributor) => contributor.defects)).toEqual([
    ["critical-dimension"],
    ["particle-contamination"],
  ]);
  expect(contributors.reduce((total, contributor) =>
    total + contributor.evidence.introducedDefectInstances!, 0)).toBe(2);
  expect(contributors.every((contributor) =>
    contributor.evidence.originEvents === 1
    && contributor.evidence.introducedLots === 1
    && contributor.evidence.repairedLots === 1)).toBeTrue();
});
