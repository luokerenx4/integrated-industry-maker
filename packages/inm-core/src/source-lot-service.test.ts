import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analyzeSourceLotServices,
  compileFactoryProject,
  loadFactoryProject,
  type FactoryEvent,
  type FactoryMetrics,
  type FactoryState,
} from "./index";

const memoryFab = resolve(import.meta.dir, "../../../examples/memory-fab");
const runDir = resolve(memoryFab, "runs/105-simulate");

describe("source-lot service analysis", () => {
  test("binds Run 105 Burn-in arrival, occupation, service, delivery, and terminal WIP to one stable analysis identity", async () => {
    const [loaded, manifest, metrics, state, eventText] = await Promise.all([
      loadFactoryProject(memoryFab),
      readFile(resolve(runDir, "manifest.json"), "utf8").then((text) => JSON.parse(text) as { resultHash: string }),
      readFile(resolve(runDir, "metrics.json"), "utf8").then((text) => JSON.parse(text) as FactoryMetrics),
      readFile(resolve(runDir, "final-state.json"), "utf8").then((text) => JSON.parse(text) as FactoryState),
      readFile(resolve(runDir, "events.ndjson"), "utf8"),
    ]);
    const events = eventText.trim().split("\n").map((line) => JSON.parse(line) as FactoryEvent);
    const analyses = analyzeSourceLotServices(
      compileFactoryProject(loaded),
      events,
      metrics,
      { id: "105-simulate", resultHash: manifest.resultHash, endTick: state.tick },
    );
    const burnIn = analyses.find((analysis) => analysis.query.device === "burn-in-1");
    expect(burnIn).toBeDefined();
    expect(burnIn!.query).toEqual({
      device: "burn-in-1",
      inputBuffer: "package-input",
      inputResource: "packaged-dram-device",
      batchUnits: 8,
    });
    expect(burnIn!.workCenter).toEqual(expect.objectContaining({
      jobs: 11,
      changeovers: 3,
      setupTicks: 14_000,
      lastFinishTick: 235_623,
      remainingHorizonTicks: 4_377,
    }));
    expect(burnIn!.workCenter.timeline.filter((item) => item.kind === "process")
      .map((item) => item.kind === "process" ? item.process : null)).toEqual([
      "screen-performance-mix",
      "screen-performance-mix",
      "screen-performance-mix",
      "screen-commercial-dram",
      "screen-commercial-dram",
      "screen-commercial-dram",
      "screen-commercial-dram",
      "screen-commercial-dram",
      "screen-performance-mix",
      "screen-performance-mix",
      "screen-performance-mix",
    ]);
    const tail = burnIn!.sourceSets.find((sourceSet) => sourceSet.sourceLotIds.join() === "dram-lot-08");
    expect(tail).toEqual(expect.objectContaining({
      createdAtTick: 163_879,
      inputArrival: {
        firstAtTick: 194_673,
        fullBatchReadyAtTick: 205_173,
        lastAtTick: 205_173,
        arrivedUnits: 8,
        batchUnits: 8,
      },
      service: null,
      delivery: { units: 0, firstAtTick: null, lastAtTick: null },
      unservedAgeTicks: 34_827,
    }));
    expect(tail!.finalWip).toEqual([
      expect.objectContaining({
        kind: "buffer",
        device: "burn-in-1",
        buffer: "package-input",
        resource: "packaged-dram-device",
        count: 8,
      }),
    ]);
    expect(burnIn!.analysisHash).toBe("93b87b1949dea24903070c3576bcce8b6fe4fc8fa44d9da3f7377738a47ff01f");
    expect(analyzeSourceLotServices(
      compileFactoryProject(loaded),
      events,
      metrics,
      { id: "105-simulate", resultHash: manifest.resultHash, endTick: state.tick },
    ).find((analysis) => analysis.query.device === "burn-in-1")!.analysisHash).toBe(burnIn!.analysisHash);
  });
});
