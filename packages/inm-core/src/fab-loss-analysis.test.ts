import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { compileFactoryProject } from "./compiler";
import { analyzeInputStarvation } from "./fab-loss-analysis";
import { loadFactoryProject } from "./loader";
import type { CompiledFactoryProject, FactoryEvent, FactoryMetrics } from "./types";

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
