import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ExternalCommandResearchAgent, HeuristicResearchAgent, InmValidationError, analyzeProduction, applyResearchPatch, compileFactoryProject, createFactorySceneModel,
  listRuns, loadFactoryProject, openFactoryProject, replayFactoryEvents, researchFactory, runUntil,
  stableStringify, validateResearchPatch, verifyRunReplay, writeRunArtifact, SeededRandom,
  type BlueprintResearchAgent, type DeviceProgram, type LoadedFactoryProject,
} from "./index";

const ironworks = resolve(import.meta.dir, "../../../examples/ironworks");
async function loaded(): Promise<LoadedFactoryProject> { return loadFactoryProject(ironworks); }
function issueCodes(fn: () => unknown): string[] {
  try { fn(); return []; } catch (error) {
    expect(error).toBeInstanceOf(InmValidationError);
    return (error as InmValidationError).issues.map((issue) => issue.code);
  }
}
async function projectCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "inm-test-"));
  await cp(ironworks, dir, { recursive: true, filter: (source) => !source.split("/").includes("runs") && !source.split("/").includes(".inm") });
  return dir;
}

async function stationProjectSource(): Promise<LoadedFactoryProject> {
  const source = await loaded();
  source.blueprint.devices = [
    { id: "station-supply", asset: "logistics-station", region: "forge-world", position: { x: 2, y: 10 }, rotation: 0 },
    { id: "station-demand", asset: "logistics-station", region: "forge-world", position: { x: 14, y: 10 }, rotation: 0 },
    { id: "generator-1", asset: "generator", region: "forge-world", position: { x: 10, y: 3 }, rotation: 0 },
  ];
  source.blueprint.connections = [];
  source.blueprint.logisticsNetworks = [{
    id: "planetary-main",
    kind: "planetary",
    fleet: { deviceAsset: "logistics-drone", count: 1 },
    stations: [
      { device: "station-supply", slots: [{ resource: "iron-ore", mode: "supply", minimumBatch: 10 }] },
      { device: "station-demand", slots: [{ resource: "iron-ore", mode: "demand", minimumBatch: 10 }] },
    ],
  }];
  source.scenario.durationTicks = 7_000;
  source.scenario.initialBuffers = { "station-supply": { storage: { "iron-ore": 25 } } };
  source.scenario.failures = [];
  return source;
}

describe("blueprint compiler", () => {
  test("compiles the complete Ironworks project", async () => {
    const project = compileFactoryProject(await loaded());
    expect(Object.keys(project.devices)).toHaveLength(8);
    expect(Object.keys(project.regions)).toEqual(["forge-world", "assembly-world"]);
    expect(Object.keys(project.resources)).toEqual(["gear", "iron-ore", "iron-plate"]);
    expect(Object.keys(project.processes)).toEqual(["assemble-gear", "smelt-iron"]);
    expect(project.devices["smelter-1"]!.processPlan?.definition.id).toBe("smelt-iron");
    expect(project.devices["smelter-1"]!.processPlan?.durationTicks).toBe(4000);
    expect(project.devices["smelter-1"]!.powerGrid).toBe("grid-forge-world-generator-1");
    expect(project.devices["assembler-1"]!.powerGrid).toBe("grid-assembly-world-generator-2");
    expect(project.powerGrids["grid-forge-world-generator-1"]!.members).not.toContain("assembler-1");
    expect(project.powerGrids["grid-forge-world-generator-1"]!.productionMilliWatts).toBe(1_000_000);
    expect(project.powerGrids["grid-assembly-world-generator-2"]!.productionMilliWatts).toBe(1_000_000);
    expect(project.connections["ore-to-smelter"]!.logisticsStages.map((stage) => `${stage.stage}:${stage.asset.id}`)).toEqual([
      "loader:sorter", "line:conveyor", "unloader:sorter",
    ]);
    expect(project.connections["ore-to-smelter"]!.dispatchIntervalTicks).toBe(250);
    expect(project.connections["ore-to-smelter"]!.travelTicks).toBe(1_200);
    expect(project.logisticsNetworks["interstellar-main"]!.routes).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-world", toRegion: "assembly-world", distance: 88, travelTicks: 12_040,
    })]);
    expect(project.hashes.blueprintHash).toHaveLength(64);
    expect(project.hashes.processCatalogHash).toHaveLength(64);
  });

  test("loads self-contained resource and TypeScript device asset packages", async () => {
    const source = await loaded();
    expect(source.resources.gear!.assetDir.endsWith("assets/resources/gear")).toBeTrue();
    expect(source.deviceAssets.smelter!.runtime.entry).toBe("runtime.ts");
    expect(source.deviceAssets.smelter!.runtimeSourceHash).toHaveLength(64);
    expect(typeof source.deviceAssets.smelter!.program.evaluate).toBe("function");
  });

  test("rejects out-of-bounds devices", async () => {
    const source = await loaded(); source.blueprint.devices[0]!.position.x = 19;
    expect(issueCodes(() => compileFactoryProject(source))).toContain("geometry.out-of-bounds");
  });

  test("rejects footprint overlap", async () => {
    const source = await loaded(); source.blueprint.devices[1]!.position = { ...source.blueprint.devices[0]!.position };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("geometry.overlap");
  });

  test("rejects incompatible port direction", async () => {
    const source = await loaded(); source.blueprint.connections[0]!.from = { device: "smelter-1", port: "input" };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("port.direction");
  });

  test("rejects logistics assets in unsupported connection stages", async () => {
    const source = await loaded(); source.blueprint.connections[0]!.logistics.loader.deviceAsset = "conveyor";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.stage-role");
  });

  test("rejects unknown resource references", async () => {
    const source = await loaded();
    source.deviceAssets["ore-source"]!.buffers[0]!.accepts[0] = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
  });

  test("rejects unknown device assets", async () => {
    const source = await loaded(); source.blueprint.devices[0]!.asset = "missing-device";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.device");
  });

  test("rejects missing and incompatible process bindings", async () => {
    const missing = await loaded(); missing.blueprint.devices[1]!.process = "missing-process";
    expect(issueCodes(() => compileFactoryProject(missing))).toContain("reference.process");
    const incompatible = await loaded(); incompatible.blueprint.devices[1]!.process = "assemble-gear";
    expect(issueCodes(() => compileFactoryProject(incompatible))).toContain("production.category");
  });

  test("validates process resource references", async () => {
    const source = await loaded(); source.processes["smelt-iron"]!.inputs[0]!.resource = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
  });

  test("compiles spatially isolated power grids instead of a factory-global pool", async () => {
    const source = await loaded();
    const generator = source.blueprint.devices.find((device) => device.id === "generator-1")!;
    const oreSource = source.blueprint.devices.find((device) => device.id === "ore-source-1")!;
    const assembler = source.blueprint.devices.find((device) => device.id === "assembler-1")!;
    const secondGenerator = source.blueprint.devices.find((device) => device.id === "generator-2")!;
    source.deviceAssets.generator!.power.distribution = { connectionRange: 8, coverageRange: 8 };
    source.blueprint.devices = [
      { ...generator, position: { x: 0, y: 0 } },
      { ...secondGenerator, position: { x: 0, y: 0 } },
      { ...oreSource, position: { x: 3, y: 0 } },
      { ...assembler, position: { x: 3, y: 0 } },
    ];
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    const project = compileFactoryProject(source);
    expect(Object.keys(project.powerGrids)).toEqual(["grid-forge-world-generator-1", "grid-assembly-world-generator-2"]);
    expect(project.devices["ore-source-1"]!.powerGrid).toBe("grid-forge-world-generator-1");
    expect(project.devices["assembler-1"]!.powerGrid).toBe("grid-assembly-world-generator-2");
    expect(project.powerGrids["grid-forge-world-generator-1"]!.ratedConsumptionMilliWatts).toBe(50_000);
    expect(project.powerGrids["grid-assembly-world-generator-2"]!.ratedConsumptionMilliWatts).toBe(220_000);
  });

  test("enforces region-local physical and planetary links and cross-region interstellar links", async () => {
    const physical = await loaded();
    physical.blueprint.connections[0]!.to.device = "assembler-1";
    physical.blueprint.connections[0]!.to.port = "input";
    expect(issueCodes(() => compileFactoryProject(physical))).toContain("connection.cross-region");

    const planetary = await stationProjectSource();
    planetary.blueprint.devices.find((device) => device.id === "station-demand")!.region = "assembly-world";
    expect(issueCodes(() => compileFactoryProject(planetary))).toContain("station.planetary-cross-region");

    const interstellar = await loaded();
    interstellar.blueprint.devices.find((device) => device.id === "station-demand")!.region = "forge-world";
    interstellar.blueprint.devices.find((device) => device.id === "station-demand")!.position = { x: 1, y: 16 };
    interstellar.blueprint.devices = interstellar.blueprint.devices.filter((device) => device.id.startsWith("station-") || device.id === "generator-1");
    interstellar.blueprint.connections = [];
    expect(issueCodes(() => compileFactoryProject(interstellar))).toContain("station.interstellar-single-region");
  });

  test("reports unknown device regions without crashing route compilation", async () => {
    const source = await loaded();
    source.blueprint.devices.find((device) => device.id === "station-supply")!.region = "missing-world";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.region");
  });

  test("compiles supply and demand slots into reusable-carrier station routes", async () => {
    const project = compileFactoryProject(await stationProjectSource());
    const network = project.logisticsNetworks["planetary-main"]!;
    expect(network.fleetAsset.id).toBe("logistics-drone");
    expect(network.fleetSize).toBe(1);
    expect(network.routes).toEqual([expect.objectContaining({
      resource: "iron-ore", from: "station-supply", to: "station-demand", capacity: 10, minimumBatch: 10, travelTicks: 3_400,
    })]);
  });

  test("rejects incompatible station carriers and duplicate resource slots", async () => {
    const source = await stationProjectSource();
    source.blueprint.logisticsNetworks[0]!.fleet.deviceAsset = "conveyor";
    source.blueprint.logisticsNetworks[0]!.stations[0]!.slots.push({ resource: "iron-ore", mode: "storage" });
    const codes = issueCodes(() => compileFactoryProject(source));
    expect(codes).toContain("logistics.carrier-kind");
    expect(codes).toContain("station.duplicate-resource");
  });
});

describe("deterministic discrete-event simulation", () => {
  test("seeded PRNG produces a stable sequence", () => {
    const first = new SeededRandom(42); const second = new SeededRandom(42); const third = new SeededRandom(43);
    const a = Array.from({ length: 8 }, () => first.nextUint32()); const b = Array.from({ length: 8 }, () => second.nextUint32()); const c = Array.from({ length: 8 }, () => third.nextUint32());
    expect(a).toEqual(b); expect(a).not.toEqual(c);
  });
  test("static production analysis exposes nominal material deficits before simulation", async () => {
    const analysis = analyzeProduction(await openFactoryProject(ironworks));
    const plate = analysis.resources.find((resource) => resource.resource === "iron-plate")!;
    expect(analysis.declarativeDevices).toBe(2);
    expect(plate.producedPerMinute).toBe(15);
    expect(plate.consumedPerMinute).toBe(40);
    expect(plate.netPerMinute).toBe(-25);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "material-deficit" && diagnostic.resource === "iron-plate")).toBeTrue();
    expect(analysis.powerGrids).toEqual([
      expect.objectContaining({ grid: "grid-assembly-world-generator-2", region: "assembly-world", headroomMilliWatts: 80_000 }),
      expect.objectContaining({ grid: "grid-forge-world-generator-1", region: "forge-world", headroomMilliWatts: 70_000 }),
    ]);
  });
  test("identical inputs and seed produce identical events, state, metrics, and hash", async () => {
    const project = await openFactoryProject(ironworks); const first = runUntil(project, undefined, { seed: 42 }); const second = runUntil(project, undefined, { seed: 42 });
    expect(first).toEqual(second); expect(first.metrics.consumed.gear).toBeGreaterThanOrEqual(10);
  });

  test("transport arrivals preserve configured delay", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const departure = result.events.find((event) => event.type === "resource.depart");
    if (!departure || departure.type !== "resource.depart") throw new Error("missing departure");
    const arrival = result.events.find((event) => event.type === "resource.arrive" && event.transit.id === departure.transit.id);
    if (!arrival) throw new Error("missing arrival");
    expect(arrival.tick - departure.tick).toBe(project.connections[departure.connection]!.travelTicks);
  });

  test("the slowest logistics stage gates connection dispatch", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 1, durationTicks: 1_000 }),
    };
    source.blueprint.devices = [
      { id: "source-buffer", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target-buffer", asset: "buffer", region: "forge-world", position: { x: 10, y: 0 }, rotation: 0 },
    ];
    source.blueprint.connections = [{
      id: "buffer-link", from: { device: "source-buffer", port: "output" }, to: { device: "target-buffer", port: "input" },
      logistics: { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } },
    }];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "source-buffer": { storage: { "iron-ore": 4 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.connections["buffer-link"]!.dispatchIntervalTicks).toBe(1_000);
    const result = runUntil(project, undefined, { untilTick: 2_500 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.tick)).toEqual([0, 1_000, 2_000]);
  });

  test("station networks batch resources and share a finite reusable fleet", async () => {
    const project = compileFactoryProject(await stationProjectSource());
    const result = runUntil(project, undefined, { untilTick: 7_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => [event.tick, event.transit.count])).toEqual([[0, 10], [3_400, 10]]);
    expect(result.events.filter((event) => event.type === "logistics.arrive").map((event) => event.tick)).toEqual([3_400, 6_800]);
    expect(result.state.devices["station-demand"]!.buffers.storage!["iron-ore"]).toBe(20);
    expect(result.state.devices["station-supply"]!.buffers.storage!["iron-ore"]).toBe(5);
    expect(result.state.logisticsTransports["planetary-main"]).toHaveLength(0);
    expect(result.metrics.totalBuildCost).toBe(6_500);
  });

  test("station infrastructure reports spatial power loss before cargo is available", async () => {
    const source = await stationProjectSource();
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1");
    source.scenario.initialBuffers = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 100 });
    expect(result.events.filter((event) => event.type === "power.shortage").map((event) => event.device)).toEqual(["station-demand", "station-supply"]);
    expect(result.state.devices["station-supply"]!.status).toBe("unpowered");
    expect(result.state.devices["station-demand"]!.status).toBe("unpowered");
  });

  test("power shortage produces an event and unpowered state", async () => {
    const source = await loaded(); source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1");
    const result = runUntil(compileFactoryProject(source), undefined, { seed: 42, untilTick: 10_000 });
    expect(result.events.some((event) => event.type === "power.shortage" && event.grid === null)).toBeTrue();
    expect(result.state.devices["ore-source-1"]!.status).toBe("unpowered");
  });

  test("full output buffers block upstream", async () => {
    const result = runUntil(await openFactoryProject(ironworks), undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "buffer.blocked" && event.device === "ore-source-1")).toBeTrue();
    expect(result.metrics.blockedOutputTime["ore-source-1"]).toBeGreaterThan(0);
  });

  test("a full storage Device causes its upstream source to enter blocked-output", async () => {
    const source = await loaded();
    const oreSource = source.blueprint.devices.find((device) => device.id === "ore-source-1")!;
    const generator = source.blueprint.devices.find((device) => device.id === "generator-1")!;
    source.blueprint.devices = [oreSource, generator, { id: "buffer-1", asset: "buffer", region: oreSource.region, position: { x: 10, y: 10 }, rotation: 0 }];
    source.blueprint.connections = [{
      id: "ore-to-buffer", from: { device: "ore-source-1", port: "output" }, to: { device: "buffer-1", port: "input" },
      logistics: { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } },
    }];
    source.blueprint.logisticsNetworks = [];
    const result = runUntil(compileFactoryProject(source), undefined, { seed: 42 });
    expect(Object.values(result.state.devices["buffer-1"]!.buffers.storage!).reduce((sum, count) => sum + count, 0)).toBe(20);
    expect(result.metrics.blockedOutputTime["ore-source-1"]).toBeGreaterThan(0);
    expect(result.events.some((event) => event.type === "buffer.blocked" && event.device === "ore-source-1")).toBeTrue();
  });

  test("visual metadata has no effect on logical execution", async () => {
    const withVisual = compileFactoryProject(await loaded()); const source = await loaded();
    for (const resource of Object.values(source.resources)) resource.visual.color = "#ffffff";
    for (const device of Object.values(source.deviceAssets)) device.visual.color = "#000000";
    const recolored = compileFactoryProject(source);
    const first = runUntil(withVisual, undefined, { seed: 42 }); const second = runUntil(recolored, undefined, { seed: 42 });
    expect(first.events).toEqual(second.events); expect(first.state).toEqual(second.state); expect(first.metrics).toEqual(second.metrics);
  });

  test("one TypeScript device program can consume and produce multiple resource streams", async () => {
    const source = await loaded(); const asset = source.deviceAssets.assembler!;
    asset.geometry.ports = [
      { id: "ore-input", direction: "input", kind: "resource", side: "west", offset: 0, buffer: "ore-input" },
      { id: "plate-input", direction: "input", kind: "resource", side: "west", offset: 1, buffer: "plate-input" },
      { id: "gear-output", direction: "output", kind: "resource", side: "east", offset: 0, buffer: "gear-output" },
      { id: "plate-output", direction: "output", kind: "resource", side: "east", offset: 1, buffer: "plate-output" },
    ];
    asset.buffers = [
      { id: "ore-input", role: "input", capacity: 4, accepts: ["iron-ore"] },
      { id: "plate-input", role: "input", capacity: 4, accepts: ["iron-plate"] },
      { id: "gear-output", role: "output", capacity: 4, accepts: ["gear"] },
      { id: "plate-output", role: "output", capacity: 4, accepts: ["iron-plate"] },
    ];
    asset.production = undefined;
    asset.program = {
      apiVersion: 1,
      evaluate(context) {
        if (!(context.buffers["ore-input"]?.["iron-ore"] && context.buffers["plate-input"]?.["iron-plate"])) return { kind: "wait", reason: "input" };
        return {
          kind: "start", operation: "multi-stream", durationTicks: 500,
          consume: [
            { buffer: "ore-input", resource: "iron-ore", count: 1 },
            { buffer: "plate-input", resource: "iron-plate", count: 1 },
          ],
          produce: [
            { buffer: "gear-output", resource: "gear", count: 1 },
            { buffer: "plate-output", resource: "iron-plate", count: 1 },
          ],
        };
      },
    } satisfies DeviceProgram;
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id === "assembler-1" || device.id === "generator-1");
    source.blueprint.devices.find((device) => device.id === "assembler-1")!.position = { x: 10, y: 10 };
    source.blueprint.devices.find((device) => device.id === "generator-1")!.region = "assembly-world";
    source.blueprint.devices.find((device) => device.id === "generator-1")!.position = { x: 4, y: 3 };
    delete source.blueprint.devices.find((device) => device.id === "assembler-1")!.process;
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.durationTicks = 1000;
    source.scenario.initialBuffers = { "assembler-1": { "ore-input": { "iron-ore": 1 }, "plate-input": { "iron-plate": 1 } } };
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 1000 });
    expect(result.metrics.produced.gear).toBe(1);
    expect(result.metrics.produced["iron-plate"]).toBe(1);
  });

  test("failure scenarios break and recover devices deterministically", async () => {
    const project = await openFactoryProject(ironworks, { scenario: "machine-failure" }); const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "device.breakdown")).toBeTrue();
    expect(result.events.some((event) => event.type === "device.recover")).toBeTrue();
  });
});

describe("research boundary and experiment decisions", () => {
  test("patches can optimize logistics networks but cannot edit world assets, scenarios, objectives, or regions", () => {
    expect(() => validateResearchPatch([{ op: "replace", path: "/logisticsNetworks/0/fleet/count", value: 2 }])).not.toThrow();
    for (const path of ["/assets/resources/iron-ore", "/assets/devices/smelter", "/scenarios/baseline", "/objectives/default", "/regions/0/bounds/width"]) {
      expect(() => validateResearchPatch([{ op: "replace", path, value: 1 }])).toThrow();
    }
  });

  test("RFC 6902 add creates a candidate without mutating the original", async () => {
    const blueprint = (await loaded()).blueprint; const count = blueprint.devices.length;
    const candidate = applyResearchPatch(blueprint, [{ op: "add", path: "/devices/-", value: { ...blueprint.devices[0], id: "new-source", position: { x: 0, y: 0 } } }]);
    expect(candidate.devices).toHaveLength(count + 1); expect(blueprint.devices).toHaveLength(count);
  });

  test("external command adapter accepts vendor-neutral proposal JSON", async () => {
    const command = `cat >/dev/null; printf '%s' '{"hypothesis":"Use FIFO","patch":[{"op":"replace","path":"/policies","value":{"dispatch":"fifo"}}]}'`;
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const proposal = await new ExternalCommandResearchAgent(command).propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), history: [] });
    expect(proposal.hypothesis).toBe("Use FIFO"); expect(proposal.patch[0]!.path).toBe("/policies");
  });

  test("heuristic candidate improves the Ironworks score and is kept", async () => {
    const dir = await projectCopy(); const result = await researchFactory(dir, { iterations: 1, seed: 42, agent: new HeuristicResearchAgent() });
    expect(result.iterations[0]!.decision).toBe("KEEP"); expect(result.bestScore).toBeGreaterThan(result.baseline.score);
  });

  test("heuristic strategies read diagnostics and do not immediately repeat experiment history", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const agent = new HeuristicResearchAgent();
    const base = { project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project) };
    const first = await agent.propose({ iteration: 1, ...base, history: [] });
    expect(first.strategy).toBe("capacity:smelter-1");
    const second = await agent.propose({ iteration: 2, ...base, history: [{
      iteration: 1, strategy: first.strategy!, hypothesis: first.hypothesis, decision: "REVERT", score: result.metrics.finalScore, scoreDelta: -1,
    }] });
    expect(second.strategy).not.toBe(first.strategy);
  });

  test("heuristic strategy adds project-local generation for disconnected consumers", async () => {
    const source = await loaded(); source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1");
    const project = compileFactoryProject(source); const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), history: [],
    });
    expect(proposal.strategy?.startsWith("power:power-disconnected:")).toBeTrue();
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(analyzeProduction(candidate).diagnostics.filter((diagnostic) => diagnostic.code === "power-disconnected")).toHaveLength(0);
  });

  test("heuristic logistics strategy upgrades every tied bottleneck stage together", async () => {
    const source = await loaded();
    const sorter = source.deviceAssets.sorter!;
    sorter.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 5_000 }) };
    source.deviceAssets["fast-sorter"] = {
      ...sorter, id: "fast-sorter", name: "Fast Sorter",
      program: { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 100 }) },
    };
    const project = compileFactoryProject(source); const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const analysis = analyzeProduction(project);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "input-logistics")).toBeTrue();
    const proposal = await new HeuristicResearchAgent().propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analysis, history: [] });
    expect(proposal.strategy?.startsWith("logistics:ore-to-smelter:")).toBeTrue();
    expect(proposal.patch).toHaveLength(2);
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(candidate.connections["ore-to-smelter"]!.dispatchIntervalTicks).toBeLessThan(project.connections["ore-to-smelter"]!.dispatchIntervalTicks);
  });

  test("heuristic station strategy expands a statically undersized shared fleet", async () => {
    const source = await loaded();
    source.deviceAssets["logistics-vessel"]!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 3, durationTicks: 180_000 }),
    };
    const project = compileFactoryProject(source);
    const analysis = analyzeProduction(project);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "station-fleet-deficit")).toBeTrue();
    const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const proposal = await new HeuristicResearchAgent().propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analysis, history: [] });
    expect(proposal.strategy).toBe("station-fleet:interstellar-main:40");
    expect(proposal.patch).toEqual([{ op: "replace", path: "/logisticsNetworks/0/fleet/count", value: 40 }]);
  });

  test("worse valid candidate is reverted", async () => {
    const agent: BlueprintResearchAgent = { async propose(input) {
      const index = input.blueprint.connections.findIndex((connection) => connection.id === "gear-to-output");
      return { hypothesis: "Remove finished-goods delivery", patch: [{ op: "remove", path: `/connections/${index}` }] };
    } };
    const dir = await projectCopy(); const result = await researchFactory(dir, { iterations: 1, seed: 42, agent });
    expect(result.iterations[0]!.decision).toBe("REVERT"); expect(result.bestScore).toBe(result.baseline.score);
  });
});

describe("artifacts and renderer-independent projection", () => {
  test("every checked-in demonstration run replays to its recorded result hash", async () => {
    const source = await loaded(); const runs = await listRuns(ironworks);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    for (const run of runs) {
      const blueprint = JSON.parse(await readFile(join(run.path, "blueprint.json"), "utf8"));
      const project = compileFactoryProject({ ...source, blueprint });
      expect(runUntil(project, undefined, { seed: run.manifest.seed }).resultHash).toBe(run.manifest.resultHash);
    }
  });

  test("completed run can be replayed exactly", async () => {
    const dir = await projectCopy(); const project = await openFactoryProject(dir); const result = runUntil(project, undefined, { seed: 42 });
    const run = await writeRunArtifact(project, result, { label: "replay", seed: 42 });
    expect(await verifyRunReplay(project, run, runUntil(project, undefined, { seed: 42 }))).toBeTrue();
    expect((await listRuns(dir))[0]!.manifest.status).toBe("completed");
    expect(JSON.parse(await readFile(join(run.path, "metrics.json"), "utf8")).scoreBreakdown).toBeDefined();
  });

  test("FactorySceneModel is pure serializable data and replays transit", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const base = createFactorySceneModel(project, result.metrics); const frame = replayFactoryEvents(project, result.events, 5000, result.metrics);
    expect(base.devices["smelter-1"]!.assetId).toBe("smelter"); expect(stableStringify(frame)).not.toContain("THREE.");
    expect(() => structuredClone(frame)).not.toThrow();
  });
});
