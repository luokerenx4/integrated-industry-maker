import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { compileFactoryProject } from "./compiler";
import { analyzeInputStarvation, analyzeQualityContributors, analyzeTransportBlocking } from "./fab-loss-analysis";
import { loadFactoryProject } from "./loader";
import type { CompiledFactoryProject, FactoryEvent, FactoryMetrics } from "./types";

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
} satisfies FactoryMetrics["transportFlows"][string];

test("necessary tracked-lot transit is context rather than recoverable transport loss", () => {
  const bucket = analyzeTransportBlocking({
    lotFlow: { family: "dram-wafer", meanTransportTimeTicks: 9_000 },
    transportFlows: {
      "clear-lane": clearTransportFlow,
    },
  }, 100_000);

  expect(bucket).toMatchObject({
    score: 0,
    summary: "Tracked lots averaged 9.0 s in necessary transit (context only); 0/1 physical lanes accumulated 0.0 blocked item-s.",
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

test("physical transport blocking identifies only positive connection contributors", () => {
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
    },
    contributors: [{
      id: "connection:blocked-lane:physical-lane-blocking",
      label: "blocked-lane",
      mechanism: "physical-lane-blocking",
      resources: ["blank-dram-wafer-lot"],
      subjects: [{ kind: "connection", id: "blocked-lane" }],
      evidence: {
        blockedItemTicks: 6_000,
        blockedFraction: .25,
        utilization: .3,
        deliveredItemsPerMinute: 72,
        capacityItemsPerMinute: 240,
      },
    }],
  });
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
  const events = [
    { type: "device.start", tick: 0, device: "lithography-1", operation: "pattern-cell-layer-1", durationTicks: 10 },
    { type: "device.finish", tick: 10, device: "lithography-1", operation: "pattern-cell-layer-1", produced: [] },
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
    { type: "device.start", tick: 130, device: "lithography-1", operation: "pattern-cell-layer-1", durationTicks: 10 },
    { type: "device.finish", tick: 140, device: "lithography-1", operation: "pattern-cell-layer-1", produced: [] },
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
    subjects: [{ kind: "device", id: "lithography-1" }],
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
      id: "device:lithography-1:inter-job-input-gap",
      mechanism: "inter-job-input-gap",
      processes: ["pattern-cell-layer-1"],
      evidence: {
        jobs: 3,
        opportunityWindowTicks: 170,
        interJobGapTicks: 140,
        unavailableGapTicks: 100,
        starvationTicks: 40,
      },
    }],
  });
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
