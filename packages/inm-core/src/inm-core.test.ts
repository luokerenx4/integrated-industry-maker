import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  ExternalCommandResearchAgent, HeuristicResearchAgent, InmValidationError, analyzeProduction, applyBlueprintPatch, applyCandidateChangeSet, applyResearchPatch, compareFactoryBlueprints, compileFactoryProject, createFactorySceneModel, evaluateBlueprintBenchmark,
  findBlueprintConnectionPath, listRuns, loadBlueprintBenchmark, loadFactoryProject, lockBlueprintBenchmark, openFactoryProject, optimizeResourceDemand, optimizeResourceDemands, optimizeSpatialResourceDemand, planProductionCapacity, replayFactoryEvents, researchFactory, runUntil,
  hashValue, listCandidateChangeSets, previewCandidateChangeSet, stableStringify, stationRouteDispatchProfile, synthesizeFactoryBlueprint, validateResearchPatch, verifyRunReplay, writeRunArtifact, SeededRandom, evaluatePowerEnvelope, optimizePowerInfrastructure,
  parallelizeWorkCenter, rotatePortSide, specializeSharedWorkCenterCandidates, transportEndpointRotation,
  type Blueprint, type BlueprintResearchAgent, type DeviceProgram, type LoadedFactoryProject,
} from "./index";

const ironworks = resolve(import.meta.dir, "../../../examples/ironworks");
const memoryFab = resolve(import.meta.dir, "../../../examples/memory-fab");
async function loaded(): Promise<LoadedFactoryProject> { return loadFactoryProject(ironworks); }
type TestConnectionSpec = Omit<Blueprint["connections"][number], "logistics"> & {
  logistics: {
    loader: { deviceAsset: string; distance: number };
    line: { deviceAsset: string };
    unloader: { deviceAsset: string; distance: number };
  };
};
function setTestConnections(source: LoadedFactoryProject, connections: TestConnectionSpec[]): void {
  source.blueprint.devices = source.blueprint.devices.filter((device) => !device.transportEndpoint);
  const uniqueEndpointId = (base: string): string => {
    let id = base; let suffix = 1;
    while (source.blueprint.devices.some((device) => device.id === id)) id = `${base}-${++suffix}`;
    return id;
  };
  source.blueprint.connections = connections.map((connection) => {
    const from = source.blueprint.devices.find((device) => device.id === connection.from.device)!;
    const to = source.blueprint.devices.find((device) => device.id === connection.to.device)!;
    const fromPort = source.deviceAssets[from.asset]!.geometry.ports.find((port) => port.id === connection.from.port)!;
    const toPort = source.deviceAssets[to.asset]!.geometry.ports.find((port) => port.id === connection.to.port)!;
    const first = connection.path[0]!; const last = connection.path.at(-1)!;
    const loaderId = uniqueEndpointId(`${connection.id}-loader`);
    source.blueprint.devices.push({
      id: loaderId, asset: connection.logistics.loader.deviceAsset, region: from.region,
      position: { x: first.x, y: first.y },
      rotation: transportEndpointRotation("loader", rotatePortSide(fromPort.side, from.rotation)),
      transportEndpoint: { connection: connection.id, stage: "loader", distance: connection.logistics.loader.distance },
    });
    const unloaderId = uniqueEndpointId(`${connection.id}-unloader`);
    source.blueprint.devices.push({
      id: unloaderId, asset: connection.logistics.unloader.deviceAsset, region: to.region,
      position: { x: last.x, y: last.y },
      rotation: transportEndpointRotation("unloader", rotatePortSide(toPort.side, to.rotation)),
      transportEndpoint: { connection: connection.id, stage: "unloader", distance: connection.logistics.unloader.distance },
    });
    return {
      ...connection,
      logistics: { loader: { device: loaderId }, line: { ...connection.logistics.line }, unloader: { device: unloaderId } },
    };
  });
}
function removeTestConnections(source: LoadedFactoryProject, predicate: (connection: Blueprint["connections"][number]) => boolean): void {
  const removed = new Set(source.blueprint.connections.filter(predicate).map((connection) => connection.id));
  source.blueprint.connections = source.blueprint.connections.filter((connection) => !removed.has(connection.id));
  source.blueprint.devices = source.blueprint.devices.filter((device) => !device.transportEndpoint || !removed.has(device.transportEndpoint.connection));
}
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
async function directorySnapshot(root: string, excluded: Set<string> = new Set()): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name); const name = relative(root, path).split("\\").join("/");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && !excluded.has(name)) snapshot[name] = (await readFile(path)).toString("base64");
    }
  }
  await visit(root);
  return snapshot;
}

async function stationProjectSource(): Promise<LoadedFactoryProject> {
  const source = await loaded();
  source.blueprint.devices = [
    { id: "station-supply", asset: "logistics-station", region: "forge-zone", position: { x: 2, y: 10 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 200_000, highSpeedTransport: { enabled: false, minimumDistance: 0 } } },
    { id: "station-demand", asset: "logistics-station", region: "forge-zone", position: { x: 14, y: 10 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 200_000, highSpeedTransport: { enabled: false, minimumDistance: 0 } } },
    { id: "generator-1", asset: "generator", region: "forge-zone", position: { x: 10, y: 3 }, rotation: 0 },
  ];
  source.blueprint.connections = [];
  source.blueprint.logisticsNetworks = [{
    id: "local-main",
    kind: "local",
    stations: [
      { device: "station-supply", fleet: { deviceAsset: "logistics-drone", count: 1 }, slots: [{ resource: "iron-ore", mode: "supply", capacity: 25, minimumBatch: 10 }] },
      { device: "station-demand", fleet: { deviceAsset: "logistics-drone", count: 0 }, slots: [{ resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10 }] },
    ],
  }];
  source.scenario.durationTicks = 7_000;
  source.scenario.initialBuffers = {
    "station-supply": { storage: { "iron-ore": 25 } },
    "generator-1": { fuel: { coal: 1 } },
  };
  source.scenario.initialEnergyMilliJoules = { "station-supply": 3_000_000, "station-demand": 3_000_000 };
  source.scenario.failures = [];
  return source;
}

async function accumulatorProjectSource(options: { wind?: boolean; initialEnergyMilliJoules?: number } = {}): Promise<LoadedFactoryProject> {
  const source = await loaded();
  source.blueprint.policies = { ...source.blueprint.policies, powerAllocation: "priority-load-shedding" };
  const smelter = structuredClone(source.blueprint.devices.find((device) => device.id === "smelter-1")!);
  source.blueprint.devices = [
    ...(options.wind ? [{ id: "wind-1", asset: "wind-turbine", region: "forge-zone", position: { x: 2, y: 2 }, rotation: 0 as const }] : []),
    { id: "accumulator-1", asset: "accumulator", region: "forge-zone", position: { x: 5, y: 6 }, rotation: 0 },
    smelter,
  ];
  source.blueprint.connections = [];
  source.blueprint.logisticsNetworks = [];
  source.scenario.durationTicks = 10_000;
  source.scenario.initialBuffers = { "smelter-1": { input: { "iron-ore": 4 } } };
  source.scenario.initialEnergyMilliJoules = { "accumulator-1": options.initialEnergyMilliJoules ?? 810_000 };
  source.scenario.failures = [];
  return source;
}

describe("temporal power envelope planning", () => {
  const profile = {
    region: "forge-zone", asset: "wind-turbine", periodTicks: 8_000,
    points: [{ atTick: 0, outputPermille: 1000 }, { atTick: 4_000, outputPermille: 0 }],
  };

  test("integrates periodic generation, cold-start storage, and contiguous deficit energy exactly", () => {
    const envelope = evaluatePowerEnvelope({
      durationTicks: 8_000, loadMilliWatts: 180_000,
      sources: [{ outputMilliWatts: 600_000, count: 1, profile }],
      storage: { capacityMilliJoules: 1_000_000, chargeMilliWatts: 500_000, dischargeMilliWatts: 500_000 },
    });
    expect(envelope).toEqual(expect.objectContaining({
      generatedMilliJoules: 2_400_000, demandMilliJoules: 1_440_000, unservedMilliJoules: 0,
      finalStoredMilliJoules: 280_000, peakDeficitMilliWatts: 180_000, requiredStorageCapacityMilliJoules: 720_000,
    }));
  });

  test("jointly chooses a generator and storage bank instead of treating rated power as continuous", () => {
    const plan = optimizePowerInfrastructure({
      durationTicks: 8_000, loadMilliWatts: 180_000, minimumGenerators: 1,
      generator: { outputMilliWatts: 600_000, buildCost: 1_400, occupiedArea: 4, profile },
      storage: { capacityMilliJoules: 1_000_000, chargeMilliWatts: 500_000, dischargeMilliWatts: 500_000, idleMilliWatts: 0, buildCost: 100, occupiedArea: 1 },
    });
    expect(plan).toEqual(expect.objectContaining({ generators: 1, storageDevices: 1, buildCost: 1_500 }));
    expect(plan!.envelope.unservedMilliJoules).toBe(0);
  });
});

describe("production mix optimization", () => {
  test("jointly solves a cyclic refinery and cracking chain instead of greedily overproducing", () => {
    const plan = optimizeResourceDemand({
      targetResource: "hydrogen", targetRatePerMinute: 10, rawResources: ["crude-oil"],
      candidates: [
        { key: "refine", inputs: [{ resource: "crude-oil", count: 2 }], outputs: [{ resource: "refined-oil", count: 2 }, { resource: "hydrogen", count: 1 }], data: null },
        { key: "crack", inputs: [{ resource: "refined-oil", count: 2 }, { resource: "hydrogen", count: 1 }], outputs: [{ resource: "hydrogen", count: 3 }, { resource: "graphite", count: 1 }], data: null },
      ],
    });
    expect(plan.processes.map((row) => [row.candidate.key, row.requiredCyclesPerMinute])).toEqual([
      ["crack", expect.closeTo(10 / 3, 8)], ["refine", expect.closeTo(10 / 3, 8)],
    ]);
    expect(plan.rawDemandPerMinute["crude-oil"]).toBeCloseTo(20 / 3, 8);
    expect(plan.surplusPerMinute.graphite).toBeCloseTo(10 / 3, 8);
    expect(plan.surplusPerMinute.hydrogen ?? 0).toBeCloseTo(0, 8);
  });

  test("prefers a raw-efficient alternative before minimizing process capacity cost", () => {
    const plan = optimizeResourceDemand({
      targetResource: "product", targetRatePerMinute: 10, rawResources: ["ore"],
      candidates: [
        { key: "fast-wasteful", inputs: [{ resource: "ore", count: 4 }], outputs: [{ resource: "product", count: 2 }], data: null },
        { key: "slow-efficient", inputs: [{ resource: "ore", count: 1 }], outputs: [{ resource: "product", count: 1 }], data: null },
      ],
      candidateCost: (candidate) => candidate.key === "slow-efficient" ? 10 : 1,
    });
    expect(plan.processes.map((row) => row.candidate.key)).toEqual(["slow-efficient"]);
    expect(plan.rawDemandPerMinute.ore).toBeCloseTo(10, 8);
  });

  test("balances a multi-grade product portfolio without double-counting coproducts", () => {
    const plan = optimizeResourceDemands({
      demands: [
        { resource: "commercial", count: 8 },
        { resource: "performance", count: 3 },
        { resource: "automotive", count: 1.5 },
      ],
      rawResources: ["packaged"],
      candidates: [
        { key: "commercial-screen", inputs: [{ resource: "packaged", count: 8 }], outputs: [{ resource: "commercial", count: 8 }], data: null },
        { key: "reliability-screen", inputs: [{ resource: "packaged", count: 8 }], outputs: [
          { resource: "commercial", count: 2 }, { resource: "performance", count: 4 }, { resource: "automotive", count: 2 },
        ], data: null },
      ],
    });
    expect(plan.processes.map((row) => [row.candidate.key, row.requiredCyclesPerMinute])).toEqual([
      ["commercial-screen", expect.closeTo(0.8125, 8)], ["reliability-screen", expect.closeTo(0.75, 8)],
    ]);
    expect(plan.rawDemandPerMinute.packaged).toBeCloseTo(12.5, 8);
    expect(plan.surplusPerMinute.commercial ?? 0).toBeCloseTo(0, 8);
  });

  test("chooses whether to ship ore, intermediates, or finished goods as part of the process mix", () => {
    const processes = [
      { id: "smelt", inputs: [{ resource: "ore", count: 1 }], outputs: [{ resource: "plate", count: 1 }] },
      { id: "assemble", inputs: [{ resource: "plate", count: 2 }], outputs: [{ resource: "gear", count: 1 }] },
    ];
    const candidates = ["mine", "factory"].flatMap((region) => processes.map((process) => ({
      key: `${process.id}:${region}`, region, inputs: process.inputs, outputs: process.outputs, data: process.id,
    })));
    const transports = ["ore", "plate", "gear"].flatMap((resource) => [
      { resource, fromRegion: "mine", toRegion: "factory", costPerItem: 1 },
      { resource, fromRegion: "factory", toRegion: "mine", costPerItem: 1 },
    ]);
    const plan = optimizeSpatialResourceDemand({
      targetResource: "gear", targetRatePerMinute: 10, targetRegion: "factory", regions: ["mine", "factory"], candidates,
      rawSources: [{ resource: "ore", region: "mine", capacityPerMinute: 100, cost: 1 }], transports,
    });
    expect(plan.processes.map((row) => `${row.candidate.data}:${row.region}`)).toEqual(["assemble:mine", "smelt:mine"]);
    expect(plan.transports).toEqual([expect.objectContaining({ resource: "gear", fromRegion: "mine", toRegion: "factory", requiredPerMinute: 10 })]);
    expect(plan.rawSources).toEqual([expect.objectContaining({ resource: "ore", region: "mine", requiredPerMinute: 20 })]);
  });
});

describe("factory synthesis", () => {
  test("builds a deterministic, target-ready factory from a blank blueprint", async () => {
    const source = await loadFactoryProject(ironworks, { blueprint: "blank", scenario: "cold-start" });
    const first = synthesizeFactoryBlueprint(source); const second = synthesizeFactoryBlueprint(source);
    expect(stableStringify(first.blueprint)).toBe(stableStringify(second.blueprint));
    expect(first.blueprint.devices.every((device) => Boolean(source.deviceAssets[device.asset]))).toBeTrue();
    expect(first.blueprint.devices.filter((device) => source.deviceAssets[device.asset]!.production).every((device) => Boolean(device.recipe))).toBeTrue();
    expect(first.blueprint.devices.find((device) => device.asset === "assembler")!.recipe!.inputs).toEqual({ coal: "input-secondary", "iron-plate": "input-primary" });
    expect(first.blueprint.devices.find((device) => device.id === "synth-gear-sink")!.bufferFilters).toEqual({ input: ["gear"] });
    expect(first.blueprint.devices.filter((device) => device.asset === "inter-zone-logistics-station")
      .every((device) => stableStringify(device.bufferFilters) === stableStringify({ storage: ["iron-plate"] }))).toBeTrue();
    expect(first.blueprint.devices.filter((device) => device.asset === "mining-machine")
      .every((device) => Object.values(device.bufferFilters ?? {}).flat().length === 1)).toBeTrue();
    expect(first.stationNetworks).toHaveLength(1);
    expect(first.selectedProcesses.map((process) => [process.process, process.region])).toEqual([
      ["forge-gear-pair", "assembly-zone"], ["make-proliferator", "assembly-zone"], ["smelt-iron", "forge-zone"],
    ]);
    expect(first.selectedProcesses.find((process) => process.process === "forge-gear-pair")!.mode).toBe("productive");
    expect(first.plannedTransports).toEqual([{
      resource: "iron-plate", fromRegion: "forge-zone", toRegion: "assembly-zone", requiredPerMinute: 9, costPerItem: 100,
    }]);
    expect(first.localLogistics.find((connection) => connection.resource === "gear")).toEqual(expect.objectContaining({
      requiredPerMinute: 12, capacityPerMinute: 120, loader: "sorter", loaderDistance: 1,
      line: "conveyor", unloader: "sorter", unloaderDistance: 2, stackSize: 1,
    }));
    expect(first.blueprint.connections.every((connection) => connection.resources.length === 1)).toBeTrue();
    expect(first.blueprint.connections.find((connection) => connection.id.includes("synth-gear"))!.resources).toEqual(["gear"]);

    const project = compileFactoryProject({ ...source, blueprint: first.blueprint });
    expect(planProductionCapacity(project).ready).toBeTrue();
    expect(analyzeProduction(project).productionGraph).toEqual(expect.objectContaining({
      rawInputsPerTarget: { coal: 0.3125, "iron-ore": 1.5 },
      steps: expect.arrayContaining([expect.objectContaining({ process: "make-proliferator" })]),
    }));
    const simulation = runUntil(project);
    expect(simulation.metrics.throughputPerMinute).toBeGreaterThanOrEqual(source.objective.targetRatePerMinute);
    expect(simulation.metrics.occupiedArea).toBeLessThanOrEqual(source.objective.constraints!.maxOccupiedArea!);
    expect(simulation.metrics.totalBuildCost).toBeLessThanOrEqual(source.objective.constraints!.maxBuildCost!);
    expect(simulation.metrics.infeasibleReason).toBeNull();
    expect(simulation.events.some((event) => event.type === "power.shortage" || event.type === "transport.power-shortage")).toBeFalse();
  });

  test("synthesizes a Scenario-ready generator and storage envelope instead of rated-only power", async () => {
    const source = await loadFactoryProject(ironworks, {
      world: "scaled", blueprint: "blank", scenario: "intermittent-wind", objective: "scaled-production",
    });
    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.power.every((grid) => grid.profileApplied && grid.scenarioUnservedMilliJoules === 0)).toBeTrue();
    expect(synthesis.power.find((grid) => grid.region === "assembly-zone")).toEqual(expect.objectContaining({
      devices: 5, capacityDevices: 4, storageDevices: 0,
    }));
    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    expect(planProductionCapacity(project).ready).toBeTrue();
    expect(Object.values(runUntil(project).metrics.powerGrids).every((grid) => grid.unservedMilliJoules === 0)).toBeTrue();
  });

  test("scales multi-input production through junction trees and elevated belt crossings", async () => {
    const source = await loadFactoryProject(ironworks, { blueprint: "blank", scenario: "cold-start" });
    source.objective.targetRatePerMinute = 24;
    source.objective.constraints = { maxBuildCost: 50_000, maxOccupiedArea: 260 };
    source.deviceAssets.assembler!.production!.modes = source.deviceAssets.assembler!.production!.modes.filter((mode) => mode.id === "standard");
    for (const node of source.world.resourceNodes.filter((node) => node.resource === "iron-ore")) node.amount = 100;

    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.plannedTransports).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-zone", toRegion: "assembly-zone", requiredPerMinute: 36,
    })]);
    const junctions = synthesis.blueprint.devices.filter((device) => device.asset === "splitter");
    expect(junctions.length).toBeGreaterThan(2);
    expect(synthesis.blueprint.connections.some((connection) => connection.path.some((cell) => (cell.level ?? 0) > 0))).toBeTrue();

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    expect(planProductionCapacity(project).ready).toBeTrue();
    expect(Object.keys(project.transportCells).some((cell) => cell.includes("@1"))).toBeTrue();
    const simulation = runUntil(project);
    expect(simulation.metrics.produced.gear).toBeGreaterThanOrEqual(30);
    expect(simulation.metrics.infeasibleReason).toBeNull();
  });

  test("combines local production with a planned regional import", async () => {
    const source = await loadFactoryProject(ironworks, { blueprint: "blank", scenario: "cold-start" });
    source.world.resourceNodes.push({
      id: "assembly-iron-vein", region: "assembly-zone", resource: "iron-ore", position: { x: 1, y: 9 }, amount: 36,
    });
    source.deviceAssets.assembler!.production!.modes = source.deviceAssets.assembler!.production!.modes.filter((mode) => mode.id === "standard");

    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.selectedProcesses.map((process) => [process.process, process.region, process.requiredCyclesPerMinute])).toEqual([
      ["forge-gear-pair", "assembly-zone", 6],
      ["smelt-iron", "assembly-zone", 9],
      ["smelt-iron", "forge-zone", 9],
    ]);
    expect(synthesis.plannedTransports).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-zone", toRegion: "assembly-zone", requiredPerMinute: 9,
    })]);

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    const plan = planProductionCapacity(project);
    expect(plan.ready).toBeTrue();
    expect(plan.processes.filter((process) => process.process === "smelt-iron").map((process) => ({
      region: process.region, requiredCyclesPerMinute: process.requiredCyclesPerMinute, configuredMachines: process.configuredMachines,
    }))).toEqual([
      { region: "assembly-zone", requiredCyclesPerMinute: 9, configuredMachines: 1 },
      { region: "forge-zone", requiredCyclesPerMinute: 9, configuredMachines: 1 },
    ]);
    expect(runUntil(project).metrics.infeasibleReason).toBeNull();
  });

  test("selects project-local stacked logistics tiers for high-throughput synthesized flows", async () => {
    const source = await loadFactoryProject(ironworks, { blueprint: "blank", scenario: "cold-start" });
    source.objective.targetRatePerMinute = 200;
    source.objective.constraints = { maxBuildCost: 100_000, maxOccupiedArea: 300, minProduction: 5 };
    for (const node of source.world.resourceNodes) node.amount = 2_000;
    source.deviceAssets["mining-machine"]!.extraction!.cycleTicks = 100;
    source.deviceAssets.smelter!.production!.speed.numerator = 10;
    source.deviceAssets.assembler!.production!.speed.numerator = 10;
    source.deviceAssets.assembler!.production!.modes = source.deviceAssets.assembler!.production!.modes.filter((mode) => mode.id === "standard");

    const synthesis = synthesizeFactoryBlueprint(source);
    const trunk = synthesis.localLogistics.find((connection) => connection.resource === "iron-ore" && connection.requiredPerMinute === 600)!;
    expect(trunk).toEqual(expect.objectContaining({
      capacityPerMinute: 1_920, loader: "stack-sorter", line: "conveyor", unloader: "stack-sorter", stackSize: 4,
    }));
    expect(synthesis.localLogistics.every((connection) => connection.capacityPerMinute + 1e-9 >= connection.requiredPerMinute)).toBeTrue();
    const physicalTrunk = synthesis.blueprint.connections.find((connection) => connection.id === trunk.connection)!;
    expect(physicalTrunk.logistics.line).toEqual({ deviceAsset: "conveyor" });
    expect(synthesis.blueprint.devices.find((device) => device.id === physicalTrunk.logistics.loader.device)).toEqual(expect.objectContaining({
      asset: "stack-sorter", transportEndpoint: { connection: trunk.connection, stage: "loader", distance: 1 },
    }));
    expect(synthesis.blueprint.devices.find((device) => device.id === physicalTrunk.logistics.unloader.device)).toEqual(expect.objectContaining({
      asset: "stack-sorter", transportEndpoint: { connection: trunk.connection, stage: "unloader", distance: 1 },
    }));

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    expect(planProductionCapacity(project).ready).toBeTrue();
    expect(runUntil(project).metrics.infeasibleReason).toBeNull();
  });

  test("synthesizes explicit parallel lanes when one physical port cannot carry the planned rate", async () => {
    const source = await loadFactoryProject(ironworks, { blueprint: "blank", scenario: "cold-start" });
    source.objective.targetRatePerMinute = 2_000;
    source.objective.constraints = { maxBuildCost: 1_000_000, maxOccupiedArea: 5_000, minProduction: 1 };
    for (const region of source.world.regions) region.bounds = { width: 80, height: 80 };
    for (const node of source.world.resourceNodes) node.amount = 50_000;
    source.deviceAssets["mining-machine"]!.extraction!.cycleTicks = 32;
    source.deviceAssets["mining-machine"]!.extraction!.radius = 50;
    source.deviceAssets.smelter!.production!.speed.numerator = 100;
    source.deviceAssets.assembler!.production!.speed.numerator = 100;
    source.deviceAssets.assembler!.production!.modes = source.deviceAssets.assembler!.production!.modes.filter((mode) => mode.id === "standard");
    source.deviceAssets["line-haul-carrier"]!.logistics!.missionEnergy = { baseMilliJoules: 0, milliJoulesPerDistance: 1 };
    source.processes["smelt-iron"]!.inputs = [{ resource: "iron-ore", count: 1 }];

    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.selectedProcesses.find((selection) => selection.process === "forge-gear-pair")!.machines).toBe(2);
    expect(synthesis.selectedProcesses.find((selection) => selection.process === "smelt-iron")!.machines).toBe(2);
    expect(synthesis.stationNetworks).toHaveLength(2);
    expect(synthesis.plannedTransports).toEqual([expect.objectContaining({ requiredPerMinute: 3_000 })]);
    expect(synthesis.blueprint.devices.filter((device) => device.id.startsWith("synth-gear-sink-"))).toHaveLength(2);
    expect(synthesis.localLogistics.every((connection) => connection.requiredPerMinute <= 1_920 + 1e-9)).toBeTrue();
    expect(synthesis.localLogistics.every((connection) => connection.capacityPerMinute + 1e-9 >= connection.requiredPerMinute)).toBeTrue();
    const sourcePorts = synthesis.blueprint.connections.map((connection) => `${connection.from.device}:${connection.from.port}`);
    const targetPorts = synthesis.blueprint.connections.map((connection) => `${connection.to.device}:${connection.to.port}`);
    expect(new Set(sourcePorts).size).toBe(sourcePorts.length);
    expect(new Set(targetPorts).size).toBe(targetPorts.length);
    expect(synthesis.power.some((grid) => grid.devices > grid.capacityDevices)).toBeTrue();

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    for (const region of source.world.regions) {
      expect(Object.values(project.powerGrids).filter((grid) => grid.region === region.id)).toHaveLength(1);
    }
    expect(Object.values(project.devices).filter((device) => device.assetDef.power.activeMilliWatts > 0)
      .every((device) => device.powerGrid)).toBeTrue();
    expect(Object.values(project.connections).flatMap((connection) => connection.logisticsStages)
      .filter((stage) => stage.stage !== "line" && stage.asset.power.activeMilliWatts > 0)
      .every((stage) => stage.powerGrid)).toBeTrue();
    const capacityPlan = planProductionCapacity(project);
    expect(capacityPlan.ready).toBeTrue();
    expect(capacityPlan.stationNetworks.every((network) => network.requiredItemsPerMinute === 1_500)).toBeTrue();
    const simulation = runUntil(project);
    expect(simulation.metrics.infeasibleReason).toBeNull();
    expect(simulation.metrics.produced.gear ?? 0).toBeGreaterThan(0);
    expect(simulation.events.some((event) => event.type === "power.shortage" || event.type === "transport.power-shortage")).toBeFalse();
  });

  test("credits refinery coproducts once and routes both outputs into a configurable multi-input process", async () => {
    const source = await loadFactoryProject(ironworks, {
      world: "chemical", blueprint: "blank", scenario: "chemical-cold-start", objective: "plastic-production",
    });
    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.selectedProcesses.map((selection) => selection.process)).toEqual(["make-plastic", "refine-crude"]);
    expect(synthesis.extraction).toEqual([expect.objectContaining({ resource: "crude-oil", asset: "oil-extractor", machines: 1 })]);
    const refinery = synthesis.blueprint.devices.find((device) => device.asset === "refinery")!;
    expect(refinery.recipe).toEqual({
      process: "refine-crude", mode: "standard", inputs: { "crude-oil": "crude-input" },
      outputs: { "refined-oil": "liquid-output", hydrogen: "gas-output" },
    });

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    const plan = planProductionCapacity(project);
    expect(plan.rawResources).toEqual([expect.objectContaining({ resource: "crude-oil", totalDemandPerMinute: 20 })]);
    expect(plan.processes.find((process) => process.process === "refine-crude")).toEqual(expect.objectContaining({
      requiredCyclesPerMinute: 10, outputsPerMinute: { hydrogen: 10, "refined-oil": 20 }, requiredMachines: 1,
    }));
    expect(analyzeProduction(project).productionGraph).toEqual(expect.objectContaining({
      rawInputsPerTarget: { "crude-oil": 2 }, coproductSurplusPerTarget: {},
    }));
    const simulation = runUntil(project);
    expect(simulation.metrics.produced.plastic).toBeGreaterThanOrEqual(12);
    expect(simulation.metrics.infeasibleReason).toBeNull();
  });

  test("drains an unconsumed coproduct so its output buffer cannot stop the primary process", async () => {
    const source = await loadFactoryProject(ironworks, {
      world: "chemical", blueprint: "blank", scenario: "chemical-cold-start", objective: "plastic-production",
    });
    source.processes["make-plastic"]!.inputs = [{ resource: "refined-oil", count: 2 }];
    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.blueprint.devices.some((device) => device.id.startsWith("synth-hydrogen-surplus-sink") && device.asset === "material-sink")).toBeTrue();

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    expect(analyzeProduction(project).productionGraph.coproductSurplusPerTarget).toEqual({ hydrogen: 1 });
    const simulation = runUntil(project);
    expect(simulation.metrics.produced.plastic).toBeGreaterThanOrEqual(12);
    expect(simulation.state.devices["synth-refine-crude-1"]!.status).not.toBe("blocked-output");
  });

  test("synthesizes a closed-loop cracking network from a globally solved process mix", async () => {
    const source = await loadFactoryProject(ironworks, {
      world: "chemical", blueprint: "blank", scenario: "chemical-cold-start", objective: "hydrogen-production",
    });
    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.selectedProcesses.map((process) => [process.process, process.requiredCyclesPerMinute])).toEqual([
      ["refine-crude", expect.closeTo(10 / 3, 8)], ["xray-crack-oil", expect.closeTo(10 / 3, 8)],
    ]);
    expect(synthesis.blueprint.devices.some((device) => device.id.startsWith("synth-graphite-surplus-sink"))).toBeTrue();
    expect(synthesis.blueprint.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { device: "synth-refine-crude-1", port: "gas-output" }, to: { device: "synth-xray-crack-oil-1", port: "hydrogen-input" } }),
      expect.objectContaining({ from: { device: "synth-xray-crack-oil-1", port: "hydrogen-output" }, to: { device: "synth-hydrogen-sink", port: "input" } }),
    ]));

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    const plan = planProductionCapacity(project);
    expect(plan.rawResources).toEqual([expect.objectContaining({ resource: "crude-oil", totalDemandPerMinute: expect.closeTo(20 / 3, 8) })]);
    expect(plan.ready).toBeTrue();
    const simulation = runUntil(project);
    expect(simulation.metrics.throughputPerMinute).toBeGreaterThanOrEqual(10);
    expect(simulation.metrics.produced.graphite).toBeGreaterThan(0);
    expect(simulation.metrics.infeasibleReason).toBeNull();
  });
});

describe("blueprint compiler", () => {
  test("compiles the complete Ironworks project", async () => {
    const project = compileFactoryProject(await loaded());
    expect(Object.keys(project.devices)).toHaveLength(29);
    expect(Object.values(project.devices).filter((device) => device.transportEndpoint)).toHaveLength(16);
    expect(Object.keys(project.regions)).toEqual(["forge-zone", "assembly-zone"]);
    expect(Object.keys(project.resourceNodes)).toEqual(["iron-vein-1", "iron-vein-2", "iron-vein-3", "coal-seam-forge", "coal-seam-assembly"]);
    expect(project.devices["ore-source-1"]!.extractionPlan).toEqual(expect.objectContaining({ outputBuffer: "output", cycleTicks: 1_000, itemsPerCycle: 1 }));
    expect(Object.keys(project.resources)).toEqual(["coal", "crude-oil", "gear", "graphite", "hydrogen", "iron-ore", "iron-plate", "plastic", "proliferator", "refined-oil"]);
    expect(Object.keys(project.processes)).toEqual(["assemble-gear", "forge-gear-pair", "make-plastic", "make-proliferator", "refine-crude", "smelt-iron", "xray-crack-oil"]);
    expect(project.devices["smelter-1"]!.processPlan?.definition.id).toBe("smelt-iron");
    expect(project.devices["smelter-1"]!.processPlan?.durationTicks).toBe(4000);
    expect(project.devices["assembler-1"]!.processPlan?.inputs).toEqual([
      { buffer: "input-primary", resource: "iron-plate", count: 2, minimumTreatmentLevel: 0 },
      { buffer: "input-secondary", resource: "coal", count: 1, minimumTreatmentLevel: 0 },
    ]);
    expect(project.devices["assembler-1"]!.buffers["input-primary"]!.accepts).toEqual(["iron-plate"]);
    expect(project.devices["assembler-1"]!.buffers["input-secondary"]!.accepts).toEqual(["coal"]);
    expect(project.devices["smelter-1"]!.powerGrid).toBe("grid-forge-zone-generator-1");
    expect(project.devices["assembler-1"]!.powerGrid).toBe("grid-assembly-zone-generator-2");
    expect(project.powerGrids["grid-forge-zone-generator-1"]!.members).not.toContain("assembler-1");
    expect(project.powerGrids["grid-forge-zone-generator-1"]!.productionMilliWatts).toBe(1_000_000);
    expect(project.powerGrids["grid-assembly-zone-generator-2"]!.productionMilliWatts).toBe(1_600_000);
    expect(project.connections["ore-to-smelter"]!.logisticsStages.map((stage) => `${stage.stage}:${stage.asset.id}`)).toEqual([
      "loader:sorter", "line:conveyor", "unloader:sorter",
    ]);
    expect(project.connections["ore-to-smelter"]!.logisticsStages.map((stage) => stage.powerGrid ?? null)).toEqual([
      "grid-forge-zone-generator-1", null, "grid-forge-zone-generator-1",
    ]);
    expect(project.powerGrids["grid-forge-zone-generator-1"]!.transportStages).toContainEqual({ connection: "ore-to-smelter", stage: "loader", device: "ore-to-smelter-loader" });
    expect(project.connections["ore-to-smelter"]!.logisticsStages.map((stage) => stage.distance)).toEqual([3, 3, 1]);
    expect(project.connections["ore-to-smelter"]!.dispatchIntervalTicks).toBe(750);
    expect(project.connections["ore-to-smelter"]!.travelTicks).toBe(1_300);
    expect(project.logisticsNetworks["inter-zone-main"]!.routes).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-zone", toRegion: "assembly-zone", distance: 88, travelTicks: 12_040,
    })]);
    expect(project.hashes.blueprintHash).toHaveLength(64);
    expect(project.hashes.worldHash).toHaveLength(64);
    expect(project.hashes.processCatalogHash).toHaveLength(64);
  });

  test("loads self-contained resource and TypeScript device asset packages", async () => {
    const source = await loaded();
    expect(source.resources.gear!.assetDir.endsWith("assets/resources/gear")).toBeTrue();
    expect(source.deviceAssets.smelter!.runtime.entry).toBe("runtime.ts");
    expect(source.deviceAssets.smelter!.runtimeSourceHash).toHaveLength(64);
    expect(typeof source.deviceAssets.smelter!.program.evaluate).toBe("function");
    expect(source.deviceAssets.accumulator!.power.storage).toEqual({
      capacityMilliJoules: 3_600_000, chargeMilliWatts: 400_000, dischargeMilliWatts: 400_000,
    });
  });

  test("compiles grid storage and validates scenario startup energy", async () => {
    const source = await accumulatorProjectSource();
    const project = compileFactoryProject(source);
    expect(project.devices["accumulator-1"]!.storagePlan).toEqual({
      capacityMilliJoules: 3_600_000, chargeMilliWatts: 400_000, dischargeMilliWatts: 400_000,
    });
    expect(project.powerGrids["grid-forge-zone-accumulator-1"]).toEqual(expect.objectContaining({
      storageDevices: ["accumulator-1"], storageCapacityMilliJoules: 3_600_000,
      storageChargeMilliWatts: 400_000, storageDischargeMilliWatts: 400_000,
    }));

    const overflowing = await accumulatorProjectSource({ initialEnergyMilliJoules: 3_600_001 });
    expect(issueCodes(() => compileFactoryProject(overflowing))).toContain("power.energy-capacity");
    const nonStorage = await accumulatorProjectSource();
    nonStorage.scenario.initialEnergyMilliJoules = { "smelter-1": 1 };
    expect(issueCodes(() => compileFactoryProject(nonStorage))).toContain("power.energy-buffer-required");
    const hybrid = await accumulatorProjectSource();
    hybrid.deviceAssets.accumulator!.power.generation = { kind: "renewable", outputMilliWatts: 1 };
    expect(issueCodes(() => compileFactoryProject(hybrid))).toContain("power.storage-generation-exclusive");
  });

  test("validates periodic renewable generator profiles against the compiled Blueprint", async () => {
    const source = await accumulatorProjectSource({ wind: true });
    source.scenario.renewableProfiles = [{ region: "forge-zone", asset: "wind-turbine", periodTicks: 8_000, points: [{ atTick: 0, outputPermille: 1000 }, { atTick: 4_000, outputPermille: 0 }] }];
    expect(() => compileFactoryProject(source)).not.toThrow();

    const wrongKind = await accumulatorProjectSource({ wind: true });
    wrongKind.scenario.renewableProfiles = [{ region: "forge-zone", asset: "smelter", periodTicks: 8_000, points: [{ atTick: 0, outputPermille: 1000 }] }];
    expect(issueCodes(() => compileFactoryProject(wrongKind))).toContain("power.renewable-profile-required");

    const malformed = await accumulatorProjectSource({ wind: true });
    malformed.scenario.renewableProfiles = [{ region: "forge-zone", asset: "wind-turbine", periodTicks: 8_000, points: [{ atTick: 1_000, outputPermille: 1000 }, { atTick: 8_000, outputPermille: 0 }] }];
    const codes = issueCodes(() => compileFactoryProject(malformed));
    expect(codes).toContain("power.generator-profile-origin");
    expect(codes).toContain("power.generator-profile-period");
  });

  test("fuel generators require resources with declared energy values", async () => {
    const source = await loaded(); source.resources.coal!.fuel = undefined;
    expect(issueCodes(() => compileFactoryProject(source))).toContain("power.resource-not-fuel");
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
    const source = await loaded();
    const loader = source.blueprint.devices.find((device) => device.id === source.blueprint.connections[0]!.logistics.loader.device)!;
    loader.asset = "conveyor";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.stage-role");
  });

  test("requires every explicit sorter Device to have one exact physical endpoint binding", async () => {
    const orphan = await loaded();
    const endpoint = orphan.blueprint.devices.find((device) => device.transportEndpoint)!;
    orphan.blueprint.devices.push({ ...structuredClone(endpoint), id: `${endpoint.id}-orphan` });
    expect(issueCodes(() => compileFactoryProject(orphan))).toContain("logistics.endpoint-reference-count");

    const wrongBinding = await loaded();
    wrongBinding.blueprint.devices.find((device) => device.id === wrongBinding.blueprint.connections[0]!.logistics.loader.device)!
      .transportEndpoint!.stage = "unloader";
    expect(issueCodes(() => compileFactoryProject(wrongBinding))).toContain("logistics.endpoint-binding");

    const wrongPosition = await loaded();
    wrongPosition.blueprint.devices.find((device) => device.id === wrongPosition.blueprint.connections[0]!.logistics.loader.device)!
      .position.x += 1;
    expect(issueCodes(() => compileFactoryProject(wrongPosition))).toContain("logistics.endpoint-position");

    const wrongRotation = await loaded();
    const loader = wrongRotation.blueprint.devices.find((device) => device.id === wrongRotation.blueprint.connections[0]!.logistics.loader.device)!;
    loader.rotation = ((loader.rotation + 90) % 360) as typeof loader.rotation;
    expect(issueCodes(() => compileFactoryProject(wrongRotation))).toContain("logistics.endpoint-rotation");
  });

  test("requires endpoint reach on sorter assets and enforces the selected connection distance", async () => {
    const missing = await loaded(); missing.deviceAssets.sorter!.logistics!.endpointRange = undefined;
    expect(issueCodes(() => compileFactoryProject(missing))).toContain("logistics.endpoint-range-required");
    const reversed = await loaded(); reversed.deviceAssets.sorter!.logistics!.endpointRange = { minimum: 3, maximum: 1 };
    expect(issueCodes(() => compileFactoryProject(reversed))).toContain("logistics.endpoint-range-order");
    const outOfRange = await loaded();
    outOfRange.blueprint.devices.find((device) => device.id === outOfRange.blueprint.connections[0]!.logistics.loader.device)!.transportEndpoint!.distance = 4;
    expect(issueCodes(() => compileFactoryProject(outOfRange))).toContain("logistics.endpoint-distance");
  });

  test("requires one declared line slot for every physical belt cell", async () => {
    const source = await loaded();
    source.deviceAssets.conveyor!.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 100 }) };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.line-slot-count");
  });

  test("validates explicit cardinal transport paths against ports, devices, deposits, and bounds", async () => {
    const source = await loaded();
    source.blueprint.connections[0]!.path[0] = { x: 5, y: 10 };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.path-start");
    source.blueprint.connections[0]!.path = [{ x: 4, y: 10 }, { x: 6, y: 10 }, { x: 8, y: 10 }];
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.path-disconnected");
    source.blueprint.connections[0]!.path = [{ x: 4, y: 10 }, { x: 4, y: 9 }, { x: 3, y: 9 }, { x: 4, y: 9 }, { x: 8, y: 10 }];
    expect(issueCodes(() => compileFactoryProject(source))).toEqual(expect.arrayContaining(["logistics.path-resource-collision", "logistics.path-self-intersection"]));
  });

  test("rejects unknown resource references", async () => {
    const source = await loaded();
    source.deviceAssets["mining-machine"]!.buffers[0]!.accepts[0] = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
  });

  test("rejects unknown device assets", async () => {
    const source = await loaded(); source.blueprint.devices[0]!.asset = "missing-device";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.device");
  });

  test("rejects Device power envelopes whose idle draw exceeds the active total", async () => {
    const source = await loaded();
    source.deviceAssets.smelter!.power.idleMilliWatts = source.deviceAssets.smelter!.power.activeMilliWatts + 1;
    expect(issueCodes(() => compileFactoryProject(source))).toContain("power.idle-exceeds-active");
  });

  test("rejects missing and incompatible process bindings", async () => {
    const missing = await loaded(); missing.blueprint.devices[1]!.recipe!.process = "missing-process";
    expect(issueCodes(() => compileFactoryProject(missing))).toContain("reference.process");
    const incompatible = await loaded(); incompatible.blueprint.devices[1]!.recipe!.process = "assemble-gear";
    expect(issueCodes(() => compileFactoryProject(incompatible))).toContain("production.category");
    const unqualified = await loaded(); unqualified.deviceAssets.assembler!.production!.processes = ["forge-gear-pair"];
    expect(issueCodes(() => compileFactoryProject(unqualified))).toContain("production.process-qualification");
    const unknownQualification = await loaded(); unknownQualification.deviceAssets.assembler!.production!.processes = ["missing-process"];
    expect(issueCodes(() => compileFactoryProject(unknownQualification))).toContain("reference.process");
    const duplicateQualification = await loaded(); duplicateQualification.deviceAssets.assembler!.production!.processes = ["assemble-gear", "assemble-gear"];
    expect(issueCodes(() => compileFactoryProject(duplicateQualification))).toContain("production.duplicate-process");
  });

  test("recipe bindings configure each physical port and must cover the selected process exactly", async () => {
    const missing = await loaded(); delete missing.blueprint.devices[2]!.recipe!.inputs.coal;
    expect(issueCodes(() => compileFactoryProject(missing))).toContain("recipe.binding-required");
    const extra = await loaded(); extra.blueprint.devices[2]!.recipe!.inputs["iron-ore"] = "input-primary";
    expect(issueCodes(() => compileFactoryProject(extra))).toContain("recipe.extra-binding");
    const wrongRole = await loaded(); wrongRole.blueprint.devices[2]!.recipe!.inputs.coal = "output";
    expect(issueCodes(() => compileFactoryProject(wrongRole))).toContain("recipe.port-role");
    const project = compileFactoryProject(await loaded());
    expect(project.devices["assembler-1"]!.ports.find((port) => port.id === "input-primary")!.accepts).toEqual(["iron-plate"]);
    expect(project.devices["assembler-1"]!.ports.find((port) => port.id === "input-secondary")!.accepts).toEqual(["coal"]);
    const crossedLane = await loaded();
    crossedLane.blueprint.connections.find((connection) => connection.id === "coal-splitter-to-assembler")!.to.port = "input-primary";
    expect(issueCodes(() => compileFactoryProject(crossedLane))).toContain("connection.target-resource-contract");
    const portFiltered = await loaded();
    portFiltered.blueprint.devices[2]!.portFilters = { "input-secondary": ["iron-plate"] };
    expect(issueCodes(() => compileFactoryProject(portFiltered))).toContain("recipe.resource-filter");
    const sharedBuffer = await loaded();
    sharedBuffer.deviceAssets.assembler!.geometry.ports.find((port) => port.id === "input-secondary")!.buffer = "input-primary";
    const sharedProject = compileFactoryProject(sharedBuffer);
    expect(sharedProject.devices["assembler-1"]!.buffers["input-primary"]!.accepts).toEqual(["coal", "iron-plate"]);
    expect(sharedProject.devices["assembler-1"]!.buffers["input-primary"]!.resourceCapacities).toEqual({ coal: 3, "iron-plate": 5 });
    expect(sharedProject.devices["assembler-1"]!.ports.find((port) => port.id === "input-primary")!.accepts).toEqual(["iron-plate"]);
    expect(sharedProject.devices["assembler-1"]!.ports.find((port) => port.id === "input-secondary")!.accepts).toEqual(["coal"]);
    expect(runUntil(sharedProject, undefined, { seed: 42 }).metrics.throughputPerMinute).toBeGreaterThan(0);
    const undersizedSharedBuffer = await loaded();
    undersizedSharedBuffer.deviceAssets.assembler!.geometry.ports.find((port) => port.id === "input-secondary")!.buffer = "input-primary";
    undersizedSharedBuffer.deviceAssets.assembler!.buffers.find((buffer) => buffer.id === "input-primary")!.capacity = 2;
    expect(issueCodes(() => compileFactoryProject(undersizedSharedBuffer))).toContain("production-mode.job-capacity");
    const alternative = await loaded(); alternative.blueprint.devices[2]!.recipe!.process = "forge-gear-pair";
    expect(analyzeProduction(compileFactoryProject(alternative)).productionGraph.rawInputsPerTarget).toEqual({ coal: .5, "iron-ore": 3 });
  });

  test("shared work centers qualify multiple operations and dispatch ready WIP deterministically", async () => {
    const source = await loaded();
    const assembler = structuredClone(source.blueprint.devices.find((device) => device.id === "assembler-1")!);
    delete assembler.recipe;
    assembler.recipes = [
      { process: "assemble-gear", mode: "standard", priority: 1, inputs: { "iron-plate": "input-primary", coal: "input-secondary" }, outputs: { gear: "output" } },
      { process: "forge-gear-pair", mode: "standard", priority: 10, inputs: { "iron-plate": "input-primary", coal: "input-secondary" }, outputs: { gear: "output" } },
    ];
    assembler.policy = { ...assembler.policy, recipeDispatch: "highest-priority" };
    source.blueprint.devices = [
      assembler,
      { id: "wind-test", asset: "wind-turbine", region: assembler.region, position: { x: 4, y: 6 }, rotation: 0 },
    ];
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.durationTicks = 4_500;
    source.scenario.initialBuffers = { "assembler-1": { "input-primary": { "iron-plate": 5 }, "input-secondary": { coal: 2 } } };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.devices["assembler-1"]!.processPlans.map((plan) => plan.definition.id)).toEqual(["assemble-gear", "forge-gear-pair"]);
    expect(project.devices["assembler-1"]!.ports.find((port) => port.id === "input-primary")!.accepts).toEqual(["iron-plate"]);
    const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.find((event) => event.type === "device.start" && event.device === "assembler-1")).toEqual(expect.objectContaining({ operation: "forge-gear-pair" }));
    expect(result.state.produced.gear).toBe(2);
    expect(analyzeProduction(project).devices.filter((device) => device.device === "assembler-1")).toHaveLength(2);
  });

  test("usage-based maintenance is mandatory at the physical limit and may be pulled into an idle window", async () => {
    const maintenanceSource = async (maximumJobs: number, minimumJobs?: number, minimumQualificationTicks?: number) => {
      const source = await loaded();
      source.deviceAssets.smelter!.production!.maintenance = {
        maximumJobs, maximumQualificationTicks: 1_000_000,
        durationTicks: 1_000, powerMilliWatts: 100_000,
        service: { skill: "mechanical", crews: 1, inputs: [{ resource: "coal", count: 1 }] },
        qualification: {
          durationTicks: 500, powerMilliWatts: 80_000,
          service: { skill: "quality", crews: 1, inputs: [{ resource: "coal", count: 1 }] },
        },
      };
      source.deviceAssets["maintenance-bay"] = {
        ...source.deviceAssets.buffer!,
        id: "maintenance-bay",
        name: "Maintenance Bay",
        capabilities: ["maintain"],
        geometry: {
          footprint: { width: 2, height: 2 }, rotatable: true,
          ports: [{ id: "inventory-input", direction: "input", kind: "resource", side: "west", offset: 0, buffer: "inventory" }],
        },
        buffers: [{ id: "inventory", role: "input", capacity: 8, accepts: ["coal"] }],
        maintenanceProvider: { skills: ["mechanical", "quality"], crews: 1, serviceRadius: 20, inventoryBuffer: "inventory" },
        economics: { buildCost: 500 },
      };
      const smelter = structuredClone(source.blueprint.devices.find((device) => device.id === "smelter-1")!);
      if (minimumJobs !== undefined || minimumQualificationTicks !== undefined) smelter.policy = {
        preventiveMaintenance: {
          ...(minimumJobs !== undefined ? { minimumJobs } : {}),
          ...(minimumQualificationTicks !== undefined ? { minimumQualificationTicks } : {}),
        },
      };
      source.blueprint.devices = [
        smelter,
        { id: "maintenance-bay-1", asset: "maintenance-bay", region: smelter.region, position: { x: 7, y: 6 }, rotation: 0 },
        { id: "maintenance-wind", asset: "wind-turbine", region: smelter.region, position: { x: 4, y: 6 }, rotation: 0 },
      ];
      source.blueprint.connections = [];
      source.blueprint.logisticsNetworks = [];
      source.scenario.initialBuffers = {
        "smelter-1": { input: { "iron-ore": 6 } },
        "maintenance-bay-1": { inventory: { coal: 8 } },
      };
      source.scenario.initialEnergyMilliJoules = {};
      source.scenario.renewableProfiles = [];
      source.scenario.failures = [];
      return source;
    };

    const mandatory = runUntil(compileFactoryProject(await maintenanceSource(2)), undefined, { untilTick: 14_000 });
    expect(mandatory.events.filter((event) => event.type === "device.maintenance-start")).toEqual([
      expect.objectContaining({
        tick: 8_000, device: "smelter-1", cause: "mandatory", jobsSinceMaintenance: 2,
        provider: "maintenance-bay-1", skill: "mechanical", crews: 1, inputs: [{ resource: "coal", count: 1 }],
      }),
    ]);
    expect(mandatory.events.filter((event) => event.type === "device.maintenance-finish")).toEqual([
      expect.objectContaining({
        tick: 9_500, device: "smelter-1", cause: "mandatory", jobsSinceMaintenance: 2,
        serviceDurationTicks: 1_000, qualificationDurationTicks: 500,
      }),
    ]);
    expect(mandatory.events.filter((event) => event.type === "device.qualification-start")).toEqual([
      expect.objectContaining({
        tick: 9_000, device: "smelter-1", provider: "maintenance-bay-1", skill: "quality",
        durationTicks: 500, inputs: [{ resource: "coal", count: 1 }],
      }),
    ]);
    expect(mandatory.events.filter((event) => event.type === "device.finish").map((event) => event.tick)).toEqual([4_000, 8_000, 13_500]);
    expect(mandatory.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 1, totalMandatory: 1, totalOpportunistic: 0, totalCancelled: 0, totalMaintenanceTicks: 1_500,
      totalQualificationCompleted: 1, totalQualificationCancelled: 0, totalQualificationTicks: 500,
      totalServiceCrewTicks: 1_500, totalQualificationCrewTicks: 500,
      serviceConsumables: { coal: 1 }, qualificationConsumables: { coal: 1 },
    }));
    expect(mandatory.metrics.equipmentMaintenance.devices["smelter-1"]).toEqual(expect.objectContaining({ jobsSinceMaintenance: 1 }));
    expect(mandatory.metrics.equipmentMaintenance.providers["maintenance-bay-1"]).toEqual(expect.objectContaining({
      crews: 1, peakCrewsInUse: 1, assignments: 2, completed: 2, cancelled: 0,
      serviceCrewTicks: 1_500, qualificationAssignments: 1, qualificationCompleted: 1,
      qualificationCrewTicks: 500, consumables: { coal: 2 },
    }));

    const opportunisticSource = await maintenanceSource(3, 2);
    opportunisticSource.scenario.initialBuffers!["smelter-1"] = { input: { "iron-ore": 4 } };
    const opportunistic = runUntil(compileFactoryProject(opportunisticSource), undefined, { untilTick: 10_000 });
    expect(opportunistic.events.filter((event) => event.type === "device.maintenance-start")).toEqual([
      expect.objectContaining({ tick: 8_000, cause: "opportunistic", jobsSinceMaintenance: 2 }),
    ]);
    expect(opportunistic.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 1, totalMandatory: 0, totalOpportunistic: 1,
    }));

    const calendarMandatorySource = await maintenanceSource(100);
    calendarMandatorySource.deviceAssets.smelter!.production!.maintenance!.maximumQualificationTicks = 9_000;
    calendarMandatorySource.scenario.initialBuffers!["smelter-1"] = { input: { "iron-ore": 2 } };
    calendarMandatorySource.scenario.materialDeliveries = [{
      id: "second-shift-ore", device: "smelter-1", buffer: "input", resource: "iron-ore", count: 2, releaseTick: 10_000,
    }];
    const calendarMandatory = runUntil(compileFactoryProject(calendarMandatorySource), undefined, { untilTick: 16_000 });
    expect(calendarMandatory.events.filter((event) => event.type === "device.maintenance-start")).toEqual([
      expect.objectContaining({
        tick: 10_000, cause: "mandatory", trigger: "calendar", jobsSinceMaintenance: 1, qualificationAgeTicks: 10_000,
      }),
    ]);
    expect(calendarMandatory.events.filter((event) => event.type === "device.finish").map((event) => event.tick)).toEqual([4_000, 15_500]);
    expect(calendarMandatory.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 1, totalMandatory: 1, totalUsageTriggered: 0, totalCalendarTriggered: 1,
    }));

    const calendarEarlySource = await maintenanceSource(100, undefined, 7_000);
    calendarEarlySource.deviceAssets.smelter!.production!.maintenance!.maximumQualificationTicks = 9_000;
    calendarEarlySource.scenario.initialBuffers!["smelter-1"] = { input: { "iron-ore": 2 } };
    calendarEarlySource.scenario.materialDeliveries = [{
      id: "second-shift-ore", device: "smelter-1", buffer: "input", resource: "iron-ore", count: 2, releaseTick: 10_000,
    }];
    const calendarEarly = runUntil(compileFactoryProject(calendarEarlySource), undefined, { untilTick: 15_000 });
    expect(calendarEarly.events.filter((event) => event.type === "device.maintenance-start")).toEqual([
      expect.objectContaining({
        tick: 7_000, cause: "opportunistic", trigger: "calendar", jobsSinceMaintenance: 1, qualificationAgeTicks: 7_000,
      }),
    ]);
    expect(calendarEarly.events.filter((event) => event.type === "device.finish").map((event) => event.tick)).toEqual([4_000, 14_000]);
    expect(calendarEarly.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 1, totalMandatory: 0, totalOpportunistic: 1, totalUsageTriggered: 0, totalCalendarTriggered: 1,
    }));

    const interruptedSource = await maintenanceSource(1);
    interruptedSource.deviceAssets.smelter!.production!.maintenance!.durationTicks = 3_000;
    interruptedSource.scenario.initialBuffers!["smelter-1"] = { input: { "iron-ore": 4 } };
    interruptedSource.scenario.failures = [{ device: "smelter-1", atTick: 5_000, durationTicks: 1_000 }];
    const interrupted = runUntil(compileFactoryProject(interruptedSource), undefined, { untilTick: 14_000 });
    expect(interrupted.events.filter((event) => event.type === "device.maintenance-start").map((event) => [event.tick, event.cause])).toEqual([
      [4_000, "mandatory"], [6_000, "mandatory"],
    ]);
    expect(interrupted.events.filter((event) => event.type === "device.qualification-start").map((event) => event.tick)).toEqual([9_000]);
    expect(interrupted.events).toContainEqual(expect.objectContaining({
      type: "device.maintenance-cancelled", tick: 5_000, jobsSinceMaintenance: 1,
    }));
    expect(interrupted.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 1, totalMandatory: 1, totalCancelled: 1, totalMaintenanceTicks: 3_500,
      totalQualificationCompleted: 1, totalQualificationTicks: 500,
      totalServiceCrewTicks: 4_500, totalQualificationCrewTicks: 500,
      serviceConsumables: { coal: 2 }, qualificationConsumables: { coal: 1 },
    }));

    const qualificationInterruptedSource = await maintenanceSource(1);
    qualificationInterruptedSource.deviceAssets.smelter!.production!.maintenance!.qualification.durationTicks = 2_000;
    qualificationInterruptedSource.scenario.initialBuffers!["smelter-1"] = { input: { "iron-ore": 4 } };
    qualificationInterruptedSource.scenario.failures = [{ device: "smelter-1", atTick: 5_500, durationTicks: 1_000 }];
    const qualificationInterrupted = runUntil(compileFactoryProject(qualificationInterruptedSource), undefined, { untilTick: 13_000 });
    expect(qualificationInterrupted.events.filter((event) => event.type === "device.maintenance-start").map((event) => event.tick)).toEqual([4_000]);
    expect(qualificationInterrupted.events.filter((event) => event.type === "device.qualification-start").map((event) => event.tick)).toEqual([5_000, 6_500]);
    expect(qualificationInterrupted.events).toContainEqual(expect.objectContaining({
      type: "device.qualification-cancelled", tick: 5_500, device: "smelter-1", reason: "equipment-breakdown",
    }));
    expect(qualificationInterrupted.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 1, totalCancelled: 1, totalQualificationCompleted: 1, totalQualificationCancelled: 1,
      totalMaintenanceTicks: 3_000, totalServiceCrewTicks: 3_500, totalQualificationCrewTicks: 2_500,
      serviceConsumables: { coal: 1 }, qualificationConsumables: { coal: 2 },
    }));

    const driftSource = await maintenanceSource(3);
    driftSource.deviceAssets.smelter!.production!.maintenance!.drift = [{
      afterJobs: 1,
      durationMultiplier: { numerator: 2, denominator: 1 },
      powerMultiplier: { numerator: 3, denominator: 2 },
      defects: [],
    }];
    const drifted = runUntil(compileFactoryProject(driftSource), undefined, { untilTick: 21_000 });
    expect(drifted.events.flatMap((event) => event.type === "device.start" && event.device === "smelter-1"
      ? [event.durationTicks] : [])).toEqual([4_000, 8_000, 8_000]);
    expect(drifted.events.filter((event) => event.type === "device.process-drift")).toEqual([
      expect.objectContaining({ tick: 12_000, device: "smelter-1", process: "smelt-iron", afterJobs: 1, jobsSinceMaintenance: 1, durationTicks: 8_000, powerMilliWatts: 270_000, lotIds: [] }),
      expect.objectContaining({ tick: 20_000, device: "smelter-1", process: "smelt-iron", afterJobs: 1, jobsSinceMaintenance: 2, durationTicks: 8_000, powerMilliWatts: 270_000, lotIds: [] }),
    ]);
    expect(drifted.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalDriftedJobs: 2, totalDriftedLots: 0, totalDriftDefects: 0,
    }));

    const invalidPolicy = await maintenanceSource(3, 4);
    expect(issueCodes(() => compileFactoryProject(invalidPolicy))).toContain("production.maintenance-threshold");
    const invalidCalendarPolicy = await maintenanceSource(3, undefined, 1_000_001);
    expect(issueCodes(() => compileFactoryProject(invalidCalendarPolicy))).toContain("production.maintenance-calendar-threshold");
    const invalidPower = await maintenanceSource(3);
    invalidPower.deviceAssets.smelter!.production!.maintenance!.powerMilliWatts = 9_999;
    expect(issueCodes(() => compileFactoryProject(invalidPower))).toContain("production.maintenance-power");
    const invalidQualificationPower = await maintenanceSource(3);
    invalidQualificationPower.deviceAssets.smelter!.production!.maintenance!.qualification.powerMilliWatts = 9_999;
    expect(issueCodes(() => compileFactoryProject(invalidQualificationPower))).toContain("production.qualification-power");
    const invalidDrift = await maintenanceSource(3);
    invalidDrift.deviceAssets.smelter!.production!.maintenance!.drift = [{
      afterJobs: 3,
      durationMultiplier: { numerator: 1, denominator: 1 },
      powerMultiplier: { numerator: 1, denominator: 1 },
      defects: [],
    }];
    expect(issueCodes(() => compileFactoryProject(invalidDrift))).toEqual(expect.arrayContaining([
      "production.drift-threshold", "production.drift-no-effect",
    ]));
    const nonMonotonicDrift = await maintenanceSource(4);
    nonMonotonicDrift.deviceAssets.smelter!.production!.maintenance!.drift = [{
      afterJobs: 1,
      durationMultiplier: { numerator: 2, denominator: 1 },
      powerMultiplier: { numerator: 3, denominator: 2 },
      defects: ["chamber-particle"],
    }, {
      afterJobs: 2,
      durationMultiplier: { numerator: 3, denominator: 2 },
      powerMultiplier: { numerator: 1, denominator: 2 },
      defects: [],
    }];
    expect(issueCodes(() => compileFactoryProject(nonMonotonicDrift))).toEqual(expect.arrayContaining([
      "production.drift-improvement", "production.drift-regression", "production.drift-defect-loss",
    ]));
    const missingContract = await loaded();
    missingContract.blueprint.devices.find((device) => device.id === "smelter-1")!.policy = { preventiveMaintenance: { minimumJobs: 1 } };
    expect(issueCodes(() => compileFactoryProject(missingContract))).toContain("production.maintenance-required");

    const sharedCrewSource = await maintenanceSource(2);
    const secondSmelter = structuredClone(sharedCrewSource.blueprint.devices.find((device) => device.id === "smelter-1")!);
    secondSmelter.id = "smelter-2";
    secondSmelter.position = { x: 12, y: 10 };
    sharedCrewSource.blueprint.devices.push(secondSmelter);
    sharedCrewSource.scenario.initialBuffers!["smelter-2"] = { input: { "iron-ore": 6 } };
    const sharedCrew = runUntil(compileFactoryProject(sharedCrewSource), undefined, { untilTick: 11_000 });
    expect(sharedCrew.events.filter((event) => event.type === "device.maintenance-blocked")).toContainEqual(expect.objectContaining({
      tick: 8_000, device: "smelter-2", cause: "mandatory", reason: "crew", skill: "mechanical", crews: 1,
    }));
    expect(sharedCrew.events.filter((event) => event.type === "device.maintenance-start").map((event) => [event.tick, event.device, event.provider])).toEqual([
      [8_000, "smelter-1", "maintenance-bay-1"], [9_500, "smelter-2", "maintenance-bay-1"],
    ]);
    expect(sharedCrew.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCrewWaitTicks: 1_500, totalCrewBlocks: 1, totalServiceCrewTicks: 3_000,
      totalQualificationCrewTicks: 1_000, serviceConsumables: { coal: 2 }, qualificationConsumables: { coal: 2 },
    }));

    const noConsumablesSource = await maintenanceSource(1);
    noConsumablesSource.scenario.initialBuffers!["maintenance-bay-1"] = { inventory: {} };
    const noConsumables = runUntil(compileFactoryProject(noConsumablesSource), undefined, { untilTick: 6_000 });
    expect(noConsumables.events).toContainEqual(expect.objectContaining({
      type: "device.maintenance-blocked", tick: 4_000, device: "smelter-1", reason: "consumable",
    }));
    expect(noConsumables.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalInputBlocks: 1, totalInputWaitTicks: 2_000, totalCompleted: 0,
    }));

    const uncovered = await maintenanceSource(2);
    uncovered.blueprint.devices = uncovered.blueprint.devices.filter((device) => device.id !== "maintenance-bay-1");
    expect(issueCodes(() => compileFactoryProject(uncovered))).toContain("maintenance.provider-uncovered");
    const qualificationUncovered = await maintenanceSource(2);
    qualificationUncovered.deviceAssets["maintenance-bay"]!.maintenanceProvider!.skills = ["mechanical"];
    expect(issueCodes(() => compileFactoryProject(qualificationUncovered))).toContain("qualification.provider-uncovered");
  });

  test("reusable production tooling is reserved across failure and returned without material consumption", async () => {
    const source = await loaded();
    source.processes["smelt-iron"]!.tooling = [{ resource: "coal", count: 1 }];
    source.deviceAssets["tool-crib"] = {
      ...source.deviceAssets.buffer!, id: "tool-crib", name: "Tool Crib",
      capabilities: ["tooling"],
      buffers: [{ id: "inventory", role: "input", capacity: 2, accepts: ["coal"] }],
      geometry: { footprint: { width: 2, height: 2 }, rotatable: true, ports: [] },
      toolingProvider: { serviceRadius: 20, inventoryBuffer: "inventory", stock: [{ resource: "coal", count: 1 }] },
      economics: { buildCost: 400 },
    };
    const smelter1 = structuredClone(source.blueprint.devices.find((device) => device.id === "smelter-1")!);
    const smelter2 = structuredClone(smelter1);
    smelter2.id = "smelter-2";
    smelter2.position = { x: 12, y: 10 };
    source.blueprint.devices = [
      smelter1, smelter2,
      { id: "tool-crib-1", asset: "tool-crib", region: smelter1.region, position: { x: 7, y: 6 }, rotation: 0 },
      { id: "tooling-wind", asset: "wind-turbine", region: smelter1.region, position: { x: 4, y: 6 }, rotation: 0 },
    ];
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = {
      "smelter-1": { input: { "iron-ore": 2 } },
      "smelter-2": { input: { "iron-ore": 2 } },
    };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [];
    source.scenario.failures = [{ device: "smelter-1", atTick: 2_000, durationTicks: 2_000 }];
    const project = compileFactoryProject(source);
    expect(project.devices["smelter-1"]!.processPlan!.toolingProviders).toEqual([
      expect.objectContaining({ device: "tool-crib-1" }),
    ]);
    const toolingAnalysis = analyzeProduction({
      ...project, objective: { ...project.objective, targetResource: "iron-plate", targetRegion: smelter1.region, targetRatePerMinute: 1 },
    });
    expect(toolingAnalysis.toolingProviders).toEqual([{
      device: "tool-crib-1", asset: "tool-crib", serviceRadius: 20, inventoryBuffer: "inventory",
      stock: [{ resource: "coal", count: 1 }], buildCost: 400, occupiedArea: 4,
    }]);
    const result = runUntil(project, undefined, { untilTick: 11_000 });
    expect(result.events.filter((event) => event.type === "device.tooling-acquired").map((event) => [event.tick, event.device, event.provider])).toEqual([
      [0, "smelter-1", "tool-crib-1"], [4_000, "smelter-2", "tool-crib-1"],
    ]);
    expect(result.events.filter((event) => event.type === "device.tooling-released").map((event) => [event.tick, event.device, event.occupiedTicks])).toEqual([
      [4_000, "smelter-1", 4_000], [8_000, "smelter-2", 4_000],
    ]);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "device.tooling-blocked", tick: 0, device: "smelter-2", process: "smelt-iron", tooling: [{ resource: "coal", count: 1 }],
    }));
    expect(result.state.devices["tool-crib-1"]!.buffers.inventory).toEqual({ coal: 1 });
    expect(result.state.devices["tool-crib-1"]!.toolingProvider!.reserved).toEqual({});
    expect(result.state.consumed.coal).toBeUndefined();
    expect(result.metrics.productionTooling).toEqual(expect.objectContaining({
      totalAllocations: 2, totalCompleted: 1, totalCancelled: 1, totalOccupiedTicks: 8_000, totalUnitTicks: 8_000,
      totalInputWaitTicks: 4_000, totalInputBlocks: 1,
      resources: { coal: { allocations: 2, unitsAllocated: 2, unitTicks: 8_000 } },
    }));
    expect(result.metrics.productionTooling.providers["tool-crib-1"]).toEqual(expect.objectContaining({
      allocations: 2, completed: 1, cancelled: 1, peakReserved: { coal: 1 }, reserved: {}, unitTicks: 8_000,
    }));

    const purchasedCapacity = { ...source, blueprint: structuredClone(source.blueprint), scenario: structuredClone(source.scenario) };
    purchasedCapacity.blueprint.devices.push({
      id: "tool-crib-2", asset: "tool-crib", region: smelter1.region, position: { x: 14, y: 6 }, rotation: 0,
    });
    purchasedCapacity.scenario.failures = [];
    const purchased = runUntil(compileFactoryProject(purchasedCapacity), undefined, { untilTick: 5_000 });
    expect(purchased.events.filter((event) => event.type === "device.tooling-acquired").map((event) => [event.tick, event.device, event.provider])).toEqual([
      [0, "smelter-1", "tool-crib-1"], [0, "smelter-2", "tool-crib-2"],
    ]);
    expect(purchased.state.devices["tool-crib-1"]!.buffers.inventory).toEqual({ coal: 1 });
    expect(purchased.state.devices["tool-crib-2"]!.buffers.inventory).toEqual({ coal: 1 });

    const freeScenarioStock = { ...source, blueprint: structuredClone(source.blueprint), scenario: structuredClone(source.scenario) };
    freeScenarioStock.scenario.initialBuffers!["tool-crib-1"] = { inventory: { coal: 1 } };
    expect(issueCodes(() => compileFactoryProject(freeScenarioStock))).toContain("tooling.asset-stock-owned");

    const filteredStock = { ...source, blueprint: structuredClone(source.blueprint) };
    filteredStock.blueprint.devices.find((device) => device.id === "tool-crib-1")!.bufferFilters = { inventory: [] };
    expect(issueCodes(() => compileFactoryProject(filteredStock))).toContain("tooling.stock-filtered");

    const duplicateStock = { ...source, deviceAssets: { ...source.deviceAssets, "tool-crib": {
      ...source.deviceAssets["tool-crib"]!, toolingProvider: {
        ...source.deviceAssets["tool-crib"]!.toolingProvider!,
        stock: [{ resource: "coal", count: 1 }, { resource: "coal", count: 1 }],
      },
    } } };
    expect(issueCodes(() => compileFactoryProject(duplicateStock))).toContain("tooling.duplicate-stock");

    const uncovered = await loaded();
    uncovered.processes["smelt-iron"]!.tooling = [{ resource: "coal", count: 1 }];
    expect(issueCodes(() => compileFactoryProject(uncovered))).toContain("tooling.provider-uncovered");
  });

  test("fab utility capacity is acquired atomically, released on failure, and expanded by placed plants", async () => {
    const source = await loaded();
    source.processes["smelt-iron"]!.utilities = [
      { utility: "high-vacuum", units: 1 },
      { utility: "hazardous-exhaust", units: 1 },
    ];
    source.deviceAssets["fab-utility-plant"] = {
      ...source.deviceAssets.buffer!, id: "fab-utility-plant", name: "Fab Utility Plant",
      capabilities: ["utility"], buffers: [],
      geometry: { footprint: { width: 2, height: 2 }, rotatable: true, ports: [] },
      utilityProvider: {
        serviceRadius: 20,
        capacities: [{ utility: "high-vacuum", units: 1 }, { utility: "hazardous-exhaust", units: 1 }],
      },
      economics: { buildCost: 1_200 },
    };
    const smelter1 = structuredClone(source.blueprint.devices.find((device) => device.id === "smelter-1")!);
    const smelter2 = structuredClone(smelter1);
    smelter2.id = "smelter-2";
    smelter2.position = { x: 12, y: 10 };
    source.blueprint.devices = [
      smelter1, smelter2,
      { id: "fab-utility-plant-1", asset: "fab-utility-plant", region: smelter1.region, position: { x: 7, y: 6 }, rotation: 0 },
      { id: "utility-wind", asset: "wind-turbine", region: smelter1.region, position: { x: 4, y: 6 }, rotation: 0 },
    ];
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = {
      "smelter-1": { input: { "iron-ore": 2 } },
      "smelter-2": { input: { "iron-ore": 2 } },
    };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [];
    source.scenario.failures = [{ device: "smelter-1", atTick: 2_000, durationTicks: 2_000 }];
    const project = compileFactoryProject(source);
    expect(project.devices["smelter-1"]!.processPlan!.utilityProviders).toEqual({
      "high-vacuum": [expect.objectContaining({ device: "fab-utility-plant-1" })],
      "hazardous-exhaust": [expect.objectContaining({ device: "fab-utility-plant-1" })],
    });
    expect(analyzeProduction({
      ...project, objective: { ...project.objective, targetResource: "iron-plate", targetRegion: smelter1.region, targetRatePerMinute: 1 },
    }).utilityProviders).toEqual([{
      device: "fab-utility-plant-1", asset: "fab-utility-plant", serviceRadius: 20,
      capacities: [{ utility: "high-vacuum", units: 1 }, { utility: "hazardous-exhaust", units: 1 }],
      buildCost: 1_200, occupiedArea: 4,
    }]);
    const result = runUntil(project, undefined, { untilTick: 7_000 });
    expect(result.events.filter((event) => event.type === "device.utility-acquired").map((event) => [event.tick, event.device])).toEqual([
      [0, "smelter-1"], [2_000, "smelter-2"],
    ]);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "device.utility-blocked", tick: 0, device: "smelter-2", process: "smelt-iron",
    }));
    expect(result.events.filter((event) => event.type === "device.utility-released").map((event) => [event.tick, event.device, event.occupiedTicks, event.outcome])).toEqual([
      [2_000, "smelter-1", 2_000, "cancelled"], [6_000, "smelter-2", 4_000, "completed"],
    ]);
    expect(result.state.devices["fab-utility-plant-1"]!.utilityProvider!.reserved).toEqual({});
    expect(result.metrics.productionUtilities).toEqual(expect.objectContaining({
      totalAllocations: 2, totalCompleted: 1, totalCancelled: 1,
      totalOccupiedTicks: 6_000, totalUnitTicks: 12_000, totalInputWaitTicks: 2_000, totalInputBlocks: 1,
    }));
    expect(result.metrics.productionUtilities.providers["fab-utility-plant-1"]).toEqual(expect.objectContaining({
      allocations: 4, completed: 2, cancelled: 2, reserved: {},
      peakReserved: { "high-vacuum": 1, "hazardous-exhaust": 1 }, unitTicks: 12_000,
    }));

    const purchasedCapacity = { ...source, blueprint: structuredClone(source.blueprint), scenario: structuredClone(source.scenario) };
    purchasedCapacity.blueprint.devices.push({
      id: "fab-utility-plant-2", asset: "fab-utility-plant", region: smelter1.region, position: { x: 14, y: 6 }, rotation: 0,
    });
    purchasedCapacity.scenario.failures = [];
    const purchased = runUntil(compileFactoryProject(purchasedCapacity), undefined, { untilTick: 1 });
    expect(purchased.events.filter((event) => event.type === "device.utility-acquired").map((event) => [event.tick, event.device])).toEqual([
      [0, "smelter-1"], [0, "smelter-2"],
    ]);

    const providerFailure = { ...source, blueprint: structuredClone(source.blueprint), scenario: structuredClone(source.scenario) };
    providerFailure.blueprint.devices = providerFailure.blueprint.devices.filter((device) => device.id !== "smelter-2");
    providerFailure.blueprint.devices.push({
      id: "fab-utility-plant-2", asset: "fab-utility-plant", region: smelter1.region, position: { x: 14, y: 6 }, rotation: 0,
    });
    providerFailure.scenario.initialBuffers = { "smelter-1": { input: { "iron-ore": 4 } } };
    providerFailure.scenario.failures = [{ device: "fab-utility-plant-1", atTick: 2_000, durationTicks: 2_000 }];
    const failedOver = runUntil(compileFactoryProject(providerFailure), undefined, { untilTick: 7_000 });
    expect(failedOver.events.filter((event) => event.type === "device.utility-acquired")
      .map((event) => [event.tick, event.device, ...new Set(event.allocations.map((allocation) => allocation.provider))])).toEqual([
      [0, "smelter-1", "fab-utility-plant-1"], [2_000, "smelter-1", "fab-utility-plant-2"],
    ]);
    expect(failedOver.events).toContainEqual({
      type: "device.utility-interrupted", tick: 2_000, device: "smelter-1", process: "smelt-iron",
      provider: "fab-utility-plant-1",
      failedUtilities: [{ utility: "high-vacuum", units: 1 }, { utility: "hazardous-exhaust", units: 1 }],
      occupiedTicks: 2_000,
    });
    expect(failedOver.events.filter((event) => event.type === "device.utility-released")
      .map((event) => [event.tick, event.outcome])).toEqual([[2_000, "cancelled"], [6_000, "completed"]]);
    expect(failedOver.metrics.productionUtilities).toEqual(expect.objectContaining({
      totalAllocations: 2, totalCompleted: 1, totalCancelled: 1, totalProviderInterruptions: 1,
    }));
    expect(failedOver.metrics.productionUtilities.providers["fab-utility-plant-1"]!.interruptedJobs).toBe(1);
    expect(failedOver.metrics.productionUtilities.providers["fab-utility-plant-2"]!.completed).toBe(2);

    const duplicateCapacity = { ...source, deviceAssets: { ...source.deviceAssets, "fab-utility-plant": {
      ...source.deviceAssets["fab-utility-plant"]!, utilityProvider: {
        ...source.deviceAssets["fab-utility-plant"]!.utilityProvider!,
        capacities: [...source.deviceAssets["fab-utility-plant"]!.utilityProvider!.capacities, { utility: "high-vacuum", units: 1 }],
      },
    } } };
    expect(issueCodes(() => compileFactoryProject(duplicateCapacity))).toContain("utility.duplicate-capacity");
    const uncovered = await loaded();
    uncovered.processes["smelt-iron"]!.utilities = [{ utility: "high-vacuum", units: 1 }];
    expect(issueCodes(() => compileFactoryProject(uncovered))).toContain("utility.provider-uncovered");
  });

  test("identity-preserving wafer lots close re-entrant setup, inspection, rework, and scrap loops", async () => {
    const source = await loadFactoryProject(memoryFab);
    const baselineProject = compileFactoryProject(source);
    const productionGraph = analyzeProduction(baselineProject).productionGraph;
    expect(productionGraph.rawInputsPerTarget).toEqual({ "blank-dram-wafer-lot": 0.125, "dram-package-substrate": 1 });
    expect(productionGraph.steps.some((step) => step.process === "rework-final-pattern")).toBeFalse();
    expect(productionGraph.steps.some((step) => step.process === "probe-sort-dram-standard" && step.cyclesPerTarget === 0.125)).toBeTrue();
    expect(productionGraph.steps.some((step) => step.process === "package-known-good-dram" && step.cyclesPerTarget === 1)).toBeTrue();
    expect(productionGraph.steps.some((step) => step.process === "screen-commercial-dram" && step.cyclesPerTarget === 0.125)).toBeTrue();
    const baseline = runUntil(baselineProject, undefined, { seed: 42 });
    const lots = Object.values(baseline.state.lots).sort((left, right) => left.id.localeCompare(right.id));
    expect(lots).toHaveLength(12);
    expect(lots.every((lot) => lot.releasedAtTick === lot.plannedReleaseTick)).toBeTrue();
    expect(lots.filter((lot) => lot.status === "completed")).toHaveLength(5);
    expect(lots.filter((lot) => lot.status === "completed").every((lot) => lot.resource === "qualified-dram-wafer-lot" && lot.route.terminal === "complete" && lot.route.completedSteps >= 8)).toBeTrue();
    expect(lots.filter((lot) => lot.status === "completed").every((lot) => lot.completedAtTick! - lot.releasedAtTick! === lot.queueTicks + lot.processTicks + lot.transportTicks)).toBeTrue();
    expect(baseline.metrics.lotFlow).toEqual(expect.objectContaining({ family: "dram-wafer", scheduled: 12, released: 12, pendingRelease: 0, completed: 5, scrapped: 3, inProgress: 4, onTimeCompleted: 2 }));
    expect(baseline.metrics.routeFlow["dram-front-end"]).toEqual(expect.objectContaining({
      family: "dram-wafer", scheduled: 12, completed: 5, scrapped: 3, inProgress: 4,
      transitions: 105, reentrantTransitions: 10, queueTimeViolations: 9, violatedLots: 8,
    }));
    expect(baseline.metrics.routeFlow["dram-front-end"]!.steps["anneal-dielectric-stack"]).toEqual(expect.objectContaining({ queueTimeMaximumTicks: 20_000, maximumQueueTicks: 33_400, queueTimeViolations: 2 }));
    expect(baseline.metrics.routeFlow["dram-front-end"]!.steps["pattern-cell-layer-2"]).toEqual(expect.objectContaining({ queueTimeMaximumTicks: 45_000, maximumQueueTicks: 70_000, queueTimeViolations: 6 }));
    expect(baseline.metrics.routeFlow["dram-front-end"]!.steps["final-inspection"]).toEqual(expect.objectContaining({ visits: 22, starts: 19, activeLots: 4, queueTimeMaximumTicks: 35_000, queueTimeViolations: 1 }));
    expect(baseline.metrics.releaseFlow).toEqual(expect.objectContaining({
      scheduled: 12, released: 12, pending: 0, plannedSpanTicks: 66_000, actualSpanTicks: 66_000,
      meanPlannedIntervalTicks: 6_000, meanActualIntervalTicks: 6_000, meanReleaseDelayTicks: 0, maximumReleaseDelayTicks: 0,
      control: "open-loop", maximumWip: null, reopenAtWip: null, maximumReleaseDelayPolicyTicks: null, dispatch: null, peakActiveLots: 12,
      capacityBlockedLots: 0, capacityBlockedTicks: 0, controlBlockedLots: 0, controlBlockedTicks: 0,
      serviceLevelOpenings: 0,
    }));
    expect(baseline.metrics.qualityFlow).toEqual(expect.objectContaining({
      inspectedLots: 12, totalInspections: 18, passedInspections: 5, rejectedInspections: 10,
      scrapDispositions: 3, reworkedLots: 10, totalReworkCycles: 10, defectFreeCompleted: 5,
      firstPassCompleted: 2, escapedDefects: 0, goodYield: 5 / 12, firstPassYield: 2 / 12,
    }));
    expect(baseline.state.lots["dram-lot-03"]!.quality).toEqual(expect.objectContaining({ defects: ["particle-contamination"], reworkCycles: 1, inspections: 2, scrapDispositions: 1 }));
    expect(baseline.state.lots["dram-lot-08"]!.quality).toEqual(expect.objectContaining({ defects: ["particle-contamination"], reworkCycles: 1, scrapDispositions: 0 }));
    expect(baseline.state.lots["dram-lot-11"]!.quality).toEqual(expect.objectContaining({ defects: ["latent-electrical", "particle-contamination"], scrapDispositions: 0 }));
    expect(baseline.events.filter((event) => event.type === "lot.completed")).toHaveLength(5);
    expect(baseline.events.filter((event) => event.type === "lot.route-terminated")).toHaveLength(5);
    expect(baseline.events.filter((event) => event.type === "lot.output-profile")).toHaveLength(5);
    expect(baseline.metrics.lotOutputFlow).toEqual(expect.objectContaining({
      jobs: 5, nominalUnits: 40, actualUnits: 40, lostUnits: 0, outputRatio: 1,
    }));
    expect(baseline.metrics.lotOutputFlow.processes["probe-sort-dram-standard"]).toEqual(expect.objectContaining({
      jobs: 5, profiles: { nominal: 5 }, nominalUnits: 40, actualUnits: 40, lostUnits: 0,
    }));
    expect(baseline.events.filter((event) => event.type === "material.delivered")).toHaveLength(12);
    expect(baseline.metrics.produced["packaged-dram-device"]).toBe(36);
    expect(baseline.metrics.produced["commercial-dram-device"]).toBe(24);
    expect(baseline.metrics.consumed["commercial-dram-device"]).toBe(24);
    expect(baseline.metrics.throughputPerMinute).toBe(6);
    expect(baseline.metrics.deliveryPortfolio).toEqual(expect.objectContaining({
      demanded: 50, delivered: 24, valued: 24, overflow: 0, fulfillment: 24 / 50, netValuePerMinute: -28,
    }));
    expect(baseline.events.filter((event) => event.type === "lot.released").map((event) => event.tick)).toEqual(Array.from({ length: 12 }, (_, index) => index * 6_000));
    expect(baseline.events.filter((event) => event.type === "lot.quality-excursion")).toHaveLength(3);
    expect(baseline.events.filter((event) => event.type === "lot.inspected")).toHaveLength(18);
    expect(baseline.events.filter((event) => event.type === "lot.reworked")).toHaveLength(10);
    expect(baseline.events.filter((event) => event.type === "lot.route-advanced")).toHaveLength(100);
    expect(baseline.events.filter((event) => event.type === "lot.route-advanced" && event.reentrant)).toHaveLength(10);
    expect(baseline.events.filter((event) => event.type === "lot.queue-time-violation")).toHaveLength(9);
    expect(baseline.events.filter((event) => event.type === "lot.scrapped" && event.reason === "quality-rejection")).toHaveLength(3);
    expect(baseline.events.filter((event) => event.type === "device.start" && event.lotIds?.length)).not.toHaveLength(0);
    expect(baseline.events.filter((event) => event.type === "resource.depart" && event.transit.lotIds?.length)).not.toHaveLength(0);
    expect(baseline.metrics.equipmentSetups).toEqual(expect.objectContaining({ totalChangeovers: 3, totalSetupTicks: 10_000 }));
    expect(baseline.events.filter((event) => event.type === "device.changeover-start")).toHaveLength(3);
    expect(baseline.events.filter((event) => event.type === "device.changeover-finish")).toHaveLength(3);
    expect(baselineProject.devices["lithography-1"]!.assetDef.production!.changeover!.transitions).toEqual([
      { from: null, to: "photo-mask-l1", durationTicks: 4_000, powerMilliWatts: 180_000 },
      { from: null, to: "photo-mask-l2", durationTicks: 4_000, powerMilliWatts: 180_000 },
      { from: "photo-mask-l1", to: "photo-mask-l2", durationTicks: 4_000, powerMilliWatts: 180_000 },
      { from: "photo-mask-l2", to: "photo-mask-l1", durationTicks: 45_000, powerMilliWatts: 180_000 },
    ]);
    expect(baseline.metrics.equipmentMaintenance).toEqual(expect.objectContaining({
      totalCompleted: 8, totalMandatory: 8, totalOpportunistic: 0,
      totalUsageTriggered: 7, totalCalendarTriggered: 1, totalMaintenanceTicks: 83_000,
      totalQualificationCompleted: 8, totalQualificationTicks: 27_000,
      totalDriftedJobs: 12, totalDriftedLots: 12, totalDriftDefects: 10,
      totalCrewWaitTicks: 12_300, totalCrewBlocks: 2, totalServiceCrewTicks: 83_000,
      totalQualificationCrewTicks: 27_000,
      serviceConsumables: { "chamber-clean-kit": 4, "metrology-calibration-kit": 4 },
      qualificationConsumables: { "tool-qualification-wafer": 4, "metrology-reference-wafer": 4 },
    }));
    expect(baseline.metrics.equipmentMaintenance.providers["maintenance-service-1"]).toEqual(expect.objectContaining({
      crews: 1, crewsInUse: 0, peakCrewsInUse: 1, assignments: 16, completed: 16, serviceCrewTicks: 83_000,
      qualificationAssignments: 8, qualificationCompleted: 8, qualificationCrewTicks: 27_000,
    }));
    expect(baseline.events.filter((event) => event.type === "device.maintenance-blocked")).toEqual([
      expect.objectContaining({ device: "inspection-1", trigger: "calendar", reason: "crew" }),
      expect.objectContaining({ device: "etch-1", trigger: "usage", reason: "crew" }),
    ]);
    expect(baseline.events.filter((event) => event.type === "device.maintenance-start")).toHaveLength(8);
    expect(baseline.events.filter((event) => event.type === "device.qualification-start")).toHaveLength(8);
    expect(baseline.events.filter((event) => event.type === "device.qualification-finish")).toHaveLength(8);
    expect(baseline.events.filter((event) => event.type === "device.process-drift")).toHaveLength(12);
    expect(baseline.metrics.batchFlow).toEqual(expect.objectContaining({
      batchOperations: 1, jobs: 4, lots: 12, averageLotsPerJob: 3, meanQueueWaitTicksPerLot: 30_250 / 3,
    }));
    expect(baseline.metrics.batchFlow.operations["furnace-1:batch-anneal-dielectric-stack:qualified"]).toEqual(expect.objectContaining({
      expectedLotsPerJob: 3, jobs: 4, lots: 12, averageLotsPerJob: 3, maximumLotsPerJob: 3,
    }));
    const furnaceStarts = baseline.events.filter((event) => event.type === "device.start" && event.device === "furnace-1");
    expect(furnaceStarts).toHaveLength(4);
    expect(furnaceStarts.every((event) => event.type === "device.start" && event.lotIds?.length === 3)).toBeTrue();

    const unownedRouteProcess = await loadFactoryProject(memoryFab);
    unownedRouteProcess.routes["dram-front-end"]!.steps.find((step) => step.id === "anneal-dielectric-stack")!.operations = ["rapid-anneal-dielectric-stack"];
    expect(issueCodes(() => compileFactoryProject(unownedRouteProcess))).toContain("route.process-unassigned");
    const intermediateRelease = await loadFactoryProject(memoryFab);
    intermediateRelease.scenario.lotReleases![0]!.resource = "dram-wafer-lot";
    expect(issueCodes(() => compileFactoryProject(intermediateRelease))).toContain("route.release-entry");
    const malformedTermination = await loadFactoryProject(memoryFab);
    malformedTermination.processes["probe-sort-dram-standard"]!.outputs.push({ resource: "qualified-dram-wafer-lot", count: 1 });
    expect(issueCodes(() => compileFactoryProject(malformedTermination))).toContain("lot.termination-shape");
    const hiddenDeadEnd = await loadFactoryProject(memoryFab);
    hiddenDeadEnd.routes["dram-front-end"]!.steps.find((step) => step.id === "probe-dram")!.operations.push("inspect-final-pattern-standard");
    expect(issueCodes(() => compileFactoryProject(hiddenDeadEnd))).toContain("route.dead-end");
    const trackedMaterialDelivery = await loadFactoryProject(memoryFab);
    trackedMaterialDelivery.scenario.materialDeliveries![0]!.resource = "blank-dram-wafer-lot";
    expect(issueCodes(() => compileFactoryProject(trackedMaterialDelivery))).toContain("material.untracked-required");
    const queueBoundarySource = await loadFactoryProject(memoryFab);
    queueBoundarySource.routes["dram-front-end"]!.steps.find((step) => step.id === "anneal-dielectric-stack")!.queueTime!.maximumTicks = 33_400;
    const queueBoundary = runUntil(compileFactoryProject(queueBoundarySource), undefined, { seed: 42 });
    expect(queueBoundary.events.filter((event) => event.type === "lot.queue-time-violation" && event.step === "anneal-dielectric-stack")).toHaveLength(0);
    const duplicateQueueDefect = await loadFactoryProject(memoryFab);
    duplicateQueueDefect.routes["dram-front-end"]!.steps.find((step) => step.id === "anneal-dielectric-stack")!.queueTime!.violationDefects.push("critical-dimension");
    expect(issueCodes(() => compileFactoryProject(duplicateQueueDefect))).toContain("route.queue-time-duplicate-defect");
    const duplicateContractResource = await loadFactoryProject(memoryFab);
    duplicateContractResource.objective.deliveryContracts!.push({
      id: "duplicate-commercial", name: "Duplicate commercial order", resource: "commercial-dram-device", region: "cleanroom",
      demandPerMinute: 1, valuePerItem: 1, shortfallPenaltyPerItem: 1,
    });
    expect(issueCodes(() => compileFactoryProject(duplicateContractResource))).toContain("objective.duplicate-contract-resource");

    const portfolioProject = compileFactoryProject(await loadFactoryProject(memoryFab, { blueprint: "experiment" }));
    const portfolio = runUntil(portfolioProject, undefined, { seed: 42 });
    expect(portfolioProject.devices["burn-in-1"]!.policy?.recipeDispatch).toBe("contract-value");
    expect(portfolio.metrics.deliveryPortfolio).toEqual(expect.objectContaining({
      demanded: 50, valued: 56, overflow: 6, fulfillment: 1.12, netValuePerMinute: 49,
    }));
    expect(portfolio.metrics.deliveryPortfolio.contracts).toEqual(expect.objectContaining({
      "commercial-order": expect.objectContaining({ demand: 32, delivered: 38, valued: 38, overflow: 6, fulfillment: 38 / 32 }),
      "performance-order": expect.objectContaining({ demand: 12, delivered: 12, fulfillment: 1 }),
      "automotive-order": expect.objectContaining({ demand: 6, delivered: 6, fulfillment: 1 }),
    }));

    const partial = runUntil(baselineProject, undefined, { seed: 42, untilTick: 30_000 });
    expect(partial.metrics.releaseFlow).toEqual(expect.objectContaining({ scheduled: 12, released: 6, pending: 6, meanReleaseDelayTicks: 0 }));
    expect(Object.values(partial.state.lots).filter((lot) => lot.status === "scheduled")).toHaveLength(6);

    const blockedReleaseSource = await loadFactoryProject(memoryFab);
    blockedReleaseSource.deviceAssets.buffer!.buffers.find((buffer) => buffer.id === "storage")!.capacity = 1;
    blockedReleaseSource.scenario.materialDeliveries = [];
    for (const lot of blockedReleaseSource.scenario.lotReleases!) lot.releaseTick = 0;
    blockedReleaseSource.scenario.failures = [{ device: "release-to-lithography-loader", atTick: 0, durationTicks: 240_000 }];
    const blockedRelease = runUntil(compileFactoryProject(blockedReleaseSource), undefined, { seed: 42, untilTick: 1_000 });
    expect(blockedRelease.metrics.releaseFlow).toEqual(expect.objectContaining({ scheduled: 12, released: 1, pending: 11 }));
    expect(blockedRelease.metrics.releaseFlow.meanReleaseDelayTicks).toBeGreaterThan(0);
    expect(blockedRelease.metrics.releaseFlow).toEqual(expect.objectContaining({
      capacityBlockedLots: 11, capacityBlockedTicks: 11_000, controlBlockedLots: 0, controlBlockedTicks: 0,
    }));
    expect(blockedRelease.events.filter((event) => event.type === "lot.release-blocked" && event.reason === "buffer-capacity")).toHaveLength(11);

    const controlledSource = await loadFactoryProject(memoryFab, { blueprint: "tool-search-seed", scenario: "steady-production" });
    controlledSource.blueprint.policies.lotRelease = {
      kind: "conwip", maximumWip: 5, reopenAtWip: 2, dispatch: "earliest-due-date",
    };
    const controlled = runUntil(compileFactoryProject(controlledSource), undefined, { seed: 42 });
    expect(controlled.metrics.releaseFlow).toEqual(expect.objectContaining({
      control: "conwip", maximumWip: 5, reopenAtWip: 2, maximumReleaseDelayPolicyTicks: null,
      dispatch: "earliest-due-date", peakActiveLots: 5, serviceLevelOpenings: 0,
      released: 8, pending: 4, controlBlockedLots: 7, controlBlockedTicks: 911_700, capacityBlockedLots: 0,
    }));
    expect(controlled.events.filter((event) => event.type === "lot.release-control-closed")).toHaveLength(2);
    expect(controlled.events.filter((event) => event.type === "lot.release-control-opened")).toHaveLength(1);
    expect(controlled.events.filter((event) => event.type === "lot.release-control-opened").every((event) => event.type === "lot.release-control-opened" && event.cause === "reopen-threshold")).toBeTrue();
    expect(controlled.events.filter((event) => event.type === "lot.released").every((event) => event.type === "lot.released" && event.releaseControl === "conwip" && event.activeWipBeforeRelease < 5)).toBeTrue();
    expect(controlled.events.filter((event) => event.type === "lot.released" && event.tick === 95_900).map((event) => event.type === "lot.released" ? event.lot : "")).toEqual([
      "dram-lot-12", "dram-lot-11", "dram-lot-10",
    ]);

    const serviceProtectedSource = await loadFactoryProject(memoryFab, { blueprint: "tool-search-seed", scenario: "steady-production" });
    serviceProtectedSource.blueprint.policies.lotRelease = {
      kind: "conwip", maximumWip: 5, reopenAtWip: 2, maximumReleaseDelayTicks: 24_000, dispatch: "earliest-due-date",
    };
    const serviceProtected = runUntil(compileFactoryProject(serviceProtectedSource), undefined, { seed: 42 });
    expect(serviceProtected.metrics.releaseFlow).toEqual(expect.objectContaining({
      maximumWip: 5, maximumReleaseDelayPolicyTicks: 24_000, peakActiveLots: 5, serviceLevelOpenings: 4,
    }));
    expect(serviceProtected.events.filter((event) => event.type === "lot.release-control-opened" && event.cause === "maximum-release-delay")).toHaveLength(4);
    expect(serviceProtected.events.filter((event) => event.type === "lot.released").every((event) => event.type === "lot.released" && event.activeWipBeforeRelease < 5)).toBeTrue();

    const candidateSource = { ...source, blueprint: structuredClone(source.blueprint) };
    for (const id of ["lithography-1", "etch-1"]) {
      const device = candidateSource.blueprint.devices.find((item) => item.id === id)!;
      device.policy = { ...device.policy, recipeDispatch: "earliest-due-date", lotDispatch: "earliest-due-date" };
    }
    candidateSource.blueprint.devices.find((item) => item.id === "furnace-1")!.recipe!.process = "rapid-anneal-dielectric-stack";
    const candidate = runUntil(compileFactoryProject(candidateSource), undefined, { seed: 42 });
    expect(candidate.metrics.lotFlow.onTimeCompleted).toBeLessThanOrEqual(baseline.metrics.lotFlow.onTimeCompleted);
    expect(candidate.metrics.lotFlow.meanTardinessTicks).toBeGreaterThan(baseline.metrics.lotFlow.meanTardinessTicks);
    expect(candidate.metrics.lotFlow.p95CycleTimeTicks).toBeGreaterThan(baseline.metrics.lotFlow.p95CycleTimeTicks);
    expect(candidate.metrics.batchFlow.jobs).toBe(0);
    expect(candidate.metrics.equipmentSetups.totalChangeovers).toBe(baseline.metrics.equipmentSetups.totalChangeovers);
    expect(candidate.metrics.finalScore).toBeLessThan(baseline.metrics.finalScore);

    const leastSlackSource = await loadFactoryProject(memoryFab, { blueprint: "baseline", scenario: "steady-production" });
    leastSlackSource.scenario.lotReleases!.forEach((lot, index) => { lot.dueTick = 180_000 + index * 1_000; });
    for (const id of ["lithography-1", "etch-1"]) {
      const device = leastSlackSource.blueprint.devices.find((item) => item.id === id)!;
      device.policy = { ...device.policy, recipeDispatch: "least-slack", lotDispatch: "earliest-due-date" };
    }
    leastSlackSource.blueprint.devices.find((item) => item.id === "furnace-1")!.recipe!.process = "rapid-anneal-dielectric-stack";
    const leastSlack = runUntil(compileFactoryProject(leastSlackSource), undefined, { seed: 42 });
    const firstContendedLithographyStart = leastSlack.events.find((event) =>
      event.type === "device.start" && event.device === "lithography-1" && event.tick >= 31_000)!;
    expect(firstContendedLithographyStart).toEqual(expect.objectContaining({
      type: "device.start", tick: 31_000, operation: "pattern-cell-layer-1", lotIds: ["dram-lot-06"],
      routeDispatch: { policy: "least-slack", lot: "dram-lot-06", remainingRouteTicks: 47_000, slackTicks: 107_000 },
    }));
    expect(leastSlack.events.filter((event) => event.type === "device.start" && event.routeDispatch)
      .every((event) => event.type === "device.start" && event.routeDispatch!.slackTicks
        === leastSlack.state.lots[event.routeDispatch!.lot]!.dueTick! - event.tick - event.routeDispatch!.remainingRouteTicks)).toBeTrue();

    const untrackedRouteDispatch = await loadFactoryProject(memoryFab, { blueprint: "baseline" });
    untrackedRouteDispatch.blueprint.devices.find((device) => device.id === "burn-in-1")!.policy = { recipeDispatch: "least-slack" };
    expect(issueCodes(() => compileFactoryProject(untrackedRouteDispatch))).toContain("production.route-dispatch-tracking-required");
    const nonProductionRouteDispatch = await loadFactoryProject(memoryFab, { blueprint: "baseline" });
    nonProductionRouteDispatch.blueprint.devices.find((device) => device.id === "lot-release")!.policy = { recipeDispatch: "least-slack" };
    expect(issueCodes(() => compileFactoryProject(nonProductionRouteDispatch))).toContain("production.route-dispatch-tracking-required");

    const directedChangeoverSource = await loadFactoryProject(memoryFab, { blueprint: "baseline", scenario: "steady-production" });
    directedChangeoverSource.scenario.lotReleases!.forEach((lot, index) => { lot.dueTick = 180_000 + index * 1_000; });
    directedChangeoverSource.blueprint.devices.find((item) => item.id === "furnace-1")!.recipe!.process = "rapid-anneal-dielectric-stack";
    for (const id of ["lithography-1", "etch-1"]) {
      const device = directedChangeoverSource.blueprint.devices.find((item) => item.id === id)!;
      device.policy = { ...device.policy, recipeDispatch: "earliest-due-date", lotDispatch: "earliest-due-date" };
    }
    const directedChangeover = runUntil(compileFactoryProject(directedChangeoverSource), undefined, { seed: 42 });
    expect(directedChangeover.events).toContainEqual(expect.objectContaining({
      type: "device.changeover-start", device: "lithography-1", from: "photo-mask-l2", to: "photo-mask-l1",
      durationTicks: 45_000, powerMilliWatts: 180_000,
    }));
    expect(directedChangeover.events).toContainEqual(expect.objectContaining({
      type: "device.changeover-start", device: "etch-1", from: "etch-recipe-l2", to: "etch-recipe-l1",
      durationTicks: 35_000, powerMilliWatts: 180_000,
    }));

    const missingChangeover = await loadFactoryProject(memoryFab, { blueprint: "baseline" });
    missingChangeover.deviceAssets["lithography-bay"]!.production!.changeover!.transitions.pop();
    expect(issueCodes(() => compileFactoryProject(missingChangeover))).toContain("production.changeover-transition-missing");
    const duplicateChangeover = await loadFactoryProject(memoryFab, { blueprint: "baseline" });
    duplicateChangeover.deviceAssets["lithography-bay"]!.production!.changeover!.transitions.push({
      ...duplicateChangeover.deviceAssets["lithography-bay"]!.production!.changeover!.transitions[0]!,
    });
    expect(issueCodes(() => compileFactoryProject(duplicateChangeover))).toContain("production.changeover-transition-duplicate");

    const boundedBatchSource = await loadFactoryProject(memoryFab, { blueprint: "baseline", scenario: "steady-production" });
    boundedBatchSource.scenario.lotReleases = boundedBatchSource.scenario.lotReleases!.slice(0, 11);
    boundedBatchSource.scenario.materialDeliveries = boundedBatchSource.scenario.materialDeliveries!.slice(0, 11);
    boundedBatchSource.scenario.durationTicks = 360_000;
    const boundedFurnace = boundedBatchSource.blueprint.devices.find((device) => device.id === "furnace-1")!;
    const batchRecipe = structuredClone(boundedFurnace.recipe!);
    boundedFurnace.recipes = [batchRecipe, { ...structuredClone(batchRecipe), process: "rapid-anneal-dielectric-stack" }];
    delete boundedFurnace.recipe;
    boundedFurnace.policy = {
      ...boundedFurnace.policy,
      batchFormation: { preferredProcess: "batch-anneal-dielectric-stack", maximumWaitTicks: 15_000 },
    };
    const boundedBatch = runUntil(compileFactoryProject(boundedBatchSource), undefined, { seed: 42 });
    expect(boundedBatch.metrics.batchFlow).toEqual(expect.objectContaining({
      jobs: 3, lots: 9, formationHolds: 4, formationHoldTicks: 52_000,
      preferredReleases: 3, timeoutReleases: 1,
    }));
    expect(boundedBatch.metrics.deliveryPortfolio).toEqual(expect.objectContaining({ delivered: 56, valued: 56, overflow: 8 }));
    expect(boundedBatch.events.filter((event) => event.type === "device.batch-released").map((event) =>
      event.type === "device.batch-released" ? event.cause : null)).toEqual([
      "preferred-ready", "preferred-ready", "maximum-wait", "preferred-ready",
    ]);

    const invalidBatchSource = await loadFactoryProject(memoryFab, { blueprint: "baseline" });
    invalidBatchSource.blueprint.devices.find((device) => device.id === "furnace-1")!.policy = {
      batchFormation: { preferredProcess: "batch-anneal-dielectric-stack", maximumWaitTicks: 15_000 },
    };
    expect(issueCodes(() => compileFactoryProject(invalidBatchSource))).toContain("production.batch-compatible-fallback");

    const setupAwareSource = { ...source, blueprint: structuredClone(source.blueprint) };
    for (const id of ["lithography-1", "etch-1"]) {
      const device = setupAwareSource.blueprint.devices.find((item) => item.id === id)!;
      device.policy = { ...device.policy, recipeDispatch: "minimize-changeover", lotDispatch: "earliest-due-date" };
    }
    const setupAware = runUntil(compileFactoryProject(setupAwareSource), undefined, { seed: 42 });
    expect(setupAware.metrics.equipmentSetups.totalChangeovers).toBe(baseline.metrics.equipmentSetups.totalChangeovers);
    expect(setupAware.metrics.lotFlow.meanTardinessTicks).toBeLessThan(baseline.metrics.lotFlow.meanTardinessTicks);

    const minimumLotCampaignSource = await loadFactoryProject(memoryFab, { blueprint: "tool-search-seed", scenario: "steady-production" });
    for (const id of ["lithography-1", "etch-1"]) minimumLotCampaignSource.blueprint.devices.find((device) => device.id === id)!.policy = {
      ...minimumLotCampaignSource.blueprint.devices.find((device) => device.id === id)!.policy,
      setupCampaign: { minimumReadyLots: 2, maximumHoldTicks: 12_000 },
    };
    const minimumLotCampaign = runUntil(compileFactoryProject(minimumLotCampaignSource), undefined, { seed: 42 });
    expect(minimumLotCampaign.metrics.equipmentSetups).toEqual(expect.objectContaining({
      totalChangeovers: 3, totalCampaignHolds: 1, totalCampaignHoldTicks: 3_500,
      campaignMinimumLotReleases: 1, campaignMaximumHoldReleases: 0,
    }));
    expect(minimumLotCampaign.events.filter((event) => event.type === "device.campaign-held")).toEqual([
      expect.objectContaining({ device: "etch-1", from: "etch-recipe-l1", to: "etch-recipe-l2", readyLots: 1, minimumReadyLots: 2 }),
    ]);
    expect(minimumLotCampaign.events.filter((event) => event.type === "device.campaign-released")).toEqual([
      expect.objectContaining({ device: "etch-1", readyLots: 2, heldTicks: 3_500, cause: "minimum-ready-lots" }),
    ]);

    const timeoutCampaignSource = await loadFactoryProject(memoryFab, { blueprint: "tool-search-seed", scenario: "steady-production" });
    for (const id of ["lithography-1", "etch-1"]) timeoutCampaignSource.blueprint.devices.find((device) => device.id === id)!.policy!.setupCampaign = {
      minimumReadyLots: 3, maximumHoldTicks: 5_000,
    };
    const timeoutCampaign = runUntil(compileFactoryProject(timeoutCampaignSource), undefined, { seed: 42 });
    expect(timeoutCampaign.metrics.equipmentSetups).toEqual(expect.objectContaining({
      totalCampaignHolds: 1, totalCampaignHoldTicks: 5_000,
      campaignMinimumLotReleases: 0, campaignMaximumHoldReleases: 1,
    }));
    expect(timeoutCampaign.events.filter((event) => event.type === "device.campaign-released")).toEqual([
      expect.objectContaining({ device: "etch-1", readyLots: 2, heldTicks: 5_000, cause: "maximum-hold" }),
    ]);

    const deepInspectionSource = { ...source, blueprint: structuredClone(source.blueprint) };
    deepInspectionSource.blueprint.devices.find((device) => device.id === "inspection-1")!.recipe!.process = "inspect-final-pattern-deep";
    const deepInspection = runUntil(compileFactoryProject(deepInspectionSource), undefined, { seed: 42 });
    expect(deepInspection.metrics.qualityFlow.escapedDefects).toBe(0);
    expect(deepInspection.metrics.qualityFlow.scrapDispositions).toBe(2);
    expect(deepInspection.metrics.lotFlow).toEqual(expect.objectContaining({ completed: 2, inProgress: 8 }));
    expect(deepInspection.metrics.routeFlow["dram-front-end"]).toEqual(expect.objectContaining({ queueTimeViolations: 12, violatedLots: 10 }));
    expect(deepInspection.metrics.finalScore).toBeLessThan(baseline.metrics.finalScore);

    const invalid = { ...source, scenario: structuredClone(source.scenario) };
    invalid.scenario.lotReleases = [];
    invalid.scenario.initialBuffers = { "lot-release": { storage: { "blank-dram-wafer-lot": 1 } } };
    expect(issueCodes(() => compileFactoryProject(invalid))).toContain("lot.explicit-required");

    const outsideWindow = { ...source, scenario: structuredClone(source.scenario) };
    outsideWindow.scenario.lotReleases![0]!.releaseTick = outsideWindow.scenario.durationTicks + 1;
    expect(issueCodes(() => compileFactoryProject(outsideWindow))).toContain("lot.release-outside-scenario");

    const dueBeforeRelease = { ...source, scenario: structuredClone(source.scenario) };
    dueBeforeRelease.scenario.lotReleases![0]!.releaseTick = dueBeforeRelease.scenario.lotReleases![0]!.dueTick! + 1;
    expect(issueCodes(() => compileFactoryProject(dueBeforeRelease))).toContain("lot.due-before-release");

    const invalidReleaseControl = { ...source, blueprint: structuredClone(source.blueprint) };
    invalidReleaseControl.blueprint.policies.lotRelease = { kind: "conwip", maximumWip: 5, reopenAtWip: 5, dispatch: "fifo" };
    expect(issueCodes(() => compileFactoryProject(invalidReleaseControl))).toContain("lot.release-control-threshold");

    const invalidSetup = { ...source, scenario: structuredClone(source.scenario) };
    invalidSetup.scenario.initialSetups = { ...invalidSetup.scenario.initialSetups, "lithography-1": "unknown-mask" };
    expect(issueCodes(() => compileFactoryProject(invalidSetup))).toContain("production.setup-group-qualified");

    const missingSetupGroup = { ...source, processes: structuredClone(source.processes) };
    delete missingSetupGroup.processes["pattern-cell-layer-1"]!.setupGroup;
    expect(issueCodes(() => compileFactoryProject(missingSetupGroup))).toContain("production.setup-group-required");

    const invalidCampaign = { ...source, blueprint: structuredClone(source.blueprint) };
    invalidCampaign.blueprint.devices.find((device) => device.id === "inspection-1")!.policy = {
      setupCampaign: { minimumReadyLots: 2, maximumHoldTicks: 12_000 },
    };
    expect(issueCodes(() => compileFactoryProject(invalidCampaign))).toContain("production.campaign-changeover-required");

    const missingDispositionBinding = { ...source, blueprint: structuredClone(source.blueprint) };
    delete missingDispositionBinding.blueprint.devices.find((device) => device.id === "inspection-1")!.recipe!.outputs["scrap-dram-wafer-lot"];
    expect(issueCodes(() => compileFactoryProject(missingDispositionBinding))).toContain("recipe.binding-required");

    const profilesWithoutTermination = { ...source, processes: structuredClone(source.processes) };
    delete profilesWithoutTermination.processes["probe-sort-dram-standard"]!.lotTermination;
    expect(issueCodes(() => compileFactoryProject(profilesWithoutTermination))).toContain("lot.output-termination-required");

    const malformedProfileShape = { ...source, processes: structuredClone(source.processes) };
    malformedProfileShape.processes["probe-sort-dram-standard"]!.lotOutputProfiles![0]!.outputCounts = {};
    expect(issueCodes(() => compileFactoryProject(malformedProfileShape))).toContain("lot.output-resource-shape");

    const excessiveProfile = { ...source, processes: structuredClone(source.processes) };
    excessiveProfile.processes["probe-sort-dram-standard"]!.lotOutputProfiles![0]!.outputCounts["known-good-dram-die"] = 9;
    expect(issueCodes(() => compileFactoryProject(excessiveProfile))).toContain("lot.output-exceeds-nominal");

    const duplicateProfile = { ...source, processes: structuredClone(source.processes) };
    duplicateProfile.processes["probe-sort-dram-standard"]!.lotOutputProfiles!.push(structuredClone(duplicateProfile.processes["probe-sort-dram-standard"]!.lotOutputProfiles![0]!));
    expect(issueCodes(() => compileFactoryProject(duplicateProfile))).toContain("lot.output-duplicate-profile");

    const unknownExcursionLot = { ...source, scenario: structuredClone(source.scenario) };
    unknownExcursionLot.scenario.qualityExcursions![0]!.lot = "unknown-lot";
    expect(issueCodes(() => compileFactoryProject(unknownExcursionLot))).toContain("quality.unknown-lot");

    const cancelledSetupSource = { ...source, scenario: structuredClone(source.scenario) };
    cancelledSetupSource.scenario.initialSetups = { ...cancelledSetupSource.scenario.initialSetups, "lithography-1": "photo-mask-l2" };
    cancelledSetupSource.scenario.failures = [{ device: "lithography-1", atTick: 2_000, durationTicks: 5_000 }];
    const cancelledSetup = runUntil(compileFactoryProject(cancelledSetupSource), undefined, { seed: 42 });
    expect(cancelledSetup.events.filter((event) => event.type === "device.changeover-cancelled")).toHaveLength(1);
    expect(cancelledSetup.events.filter((event) => event.type === "lot.scrapped" && event.reason === "equipment-breakdown")).toHaveLength(0);

    const failureSource = { ...source, scenario: structuredClone(source.scenario) };
    failureSource.scenario.failures = [{ device: "lithography-1", atTick: 3_000, durationTicks: 5_000 }];
    const interrupted = runUntil(compileFactoryProject(failureSource), undefined, { seed: 42 });
    expect(interrupted.metrics.lotFlow.scrapped).toBe(5);
    expect(Object.values(interrupted.state.lots).filter((lot) => lot.status === "scrapped")).toHaveLength(5);
    expect(interrupted.events.filter((event) => event.type === "lot.scrapped" && event.reason === "equipment-breakdown")).toHaveLength(1);
  }, 30_000);

  test("production modes are explicit and validate treatment levels, auxiliary inputs, and physical job capacity", async () => {
    const unknown = await loaded(); unknown.blueprint.devices[2]!.recipe!.mode = "missing-mode";
    expect(issueCodes(() => compileFactoryProject(unknown))).toContain("production-mode.unknown");

    const filtered = await loaded();
    filtered.blueprint.devices[2]!.recipe!.mode = "productive";
    filtered.deviceAssets.assembler!.production!.modes.find((mode) => mode.id === "productive")!.auxiliaryInputs = [
      { resource: "coal", count: 1, port: "input-secondary" },
    ];
    filtered.blueprint.devices[2]!.bufferFilters = { "input-primary": ["iron-plate"], "input-secondary": ["iron-plate"], output: ["gear"] };
    expect(issueCodes(() => compileFactoryProject(filtered))).toContain("production-mode.resource-filter");

    const oversized = await loaded();
    oversized.blueprint.devices[2]!.recipe!.mode = "productive";
    oversized.deviceAssets.assembler!.production!.modes.find((mode) => mode.id === "productive")!.outputCycles = 9;
    expect(issueCodes(() => compileFactoryProject(oversized))).toContain("production-mode.job-capacity");
  });

  test("instance buffer filters narrow wildcard assets and constrain recipes, extraction, stations, and initial inventory", async () => {
    const source = await loaded();
    const sink = source.blueprint.devices.find((device) => device.id === "output-1")!;
    sink.bufferFilters = { input: ["gear"] };
    const project = compileFactoryProject(source);
    expect(project.devices["output-1"]!.buffers.input!.accepts).toEqual(["gear"]);
    expect(project.devices["ore-source-1"]!.buffers.output!.accepts).toEqual(["iron-ore"]);

    const invalidInitial = await loaded();
    invalidInitial.blueprint.devices.find((device) => device.id === "output-1")!.bufferFilters = { input: ["gear"] };
    invalidInitial.scenario.initialBuffers = { "output-1": { input: { coal: 1 } } };
    expect(issueCodes(() => compileFactoryProject(invalidInitial))).toContain("buffer.resource-contract");

    const invalidRecipe = await loaded();
    invalidRecipe.blueprint.devices.find((device) => device.id === "assembler-1")!.bufferFilters = { "input-primary": ["coal"] };
    expect(issueCodes(() => compileFactoryProject(invalidRecipe))).toContain("recipe.resource-filter");

    const invalidExtractor = await loaded();
    invalidExtractor.blueprint.devices.find((device) => device.id === "ore-source-1")!.bufferFilters = { output: ["coal"] };
    expect(issueCodes(() => compileFactoryProject(invalidExtractor))).toContain("extraction.resource-filter");

    const invalidStation = await stationProjectSource();
    invalidStation.blueprint.devices.find((device) => device.id === "station-demand")!.bufferFilters = { storage: ["coal"] };
    expect(issueCodes(() => compileFactoryProject(invalidStation))).toContain("station.resource-contract");

    const invalidJunctionPolicy = await loaded();
    const filteredJunction = invalidJunctionPolicy.blueprint.devices.find((device) => device.id === "coal-splitter-assembly")!;
    filteredJunction.bufferFilters = { storage: ["iron-ore"] };
    filteredJunction.policy = { dispatch: "round-robin", filter: { resource: "coal", outputPort: "output-north" } };
    expect(issueCodes(() => compileFactoryProject(invalidJunctionPolicy))).toContain("policy.filter-resource-filter");

    const invalidAssetContract = await loaded();
    invalidAssetContract.blueprint.devices.find((device) => device.id === "smelter-1")!.bufferFilters = { input: ["coal", "coal"] };
    expect(issueCodes(() => compileFactoryProject(invalidAssetContract))).toEqual(expect.arrayContaining([
      "buffer-filter.resource-contract", "buffer-filter.duplicate-resource", "recipe.resource-filter",
    ]));
  }, 15_000);

  test("validates process resource references", async () => {
    const source = await loaded(); source.processes["smelt-iron"]!.inputs[0]!.resource = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
  });

  test("validates extractor bindings against immutable world resource nodes", async () => {
    const unknown = await loaded(); unknown.blueprint.devices[0]!.resourceNodes = ["missing-vein"];
    expect(issueCodes(() => compileFactoryProject(unknown))).toContain("reference.resource-node");
    const crossRegion = await loaded(); crossRegion.world.resourceNodes[0]!.region = "assembly-zone";
    expect(issueCodes(() => compileFactoryProject(crossRegion))).toContain("extraction.cross-region");
    const outOfRange = await loaded(); outOfRange.world.resourceNodes[0]!.position = { x: 19, y: 23 };
    expect(issueCodes(() => compileFactoryProject(outOfRange))).toContain("extraction.out-of-range");
  });

  test("compiles spatially isolated power grids instead of a factory-global pool", async () => {
    const source = await loaded();
    const generator = source.blueprint.devices.find((device) => device.id === "generator-1")!;
    const oreSource = source.blueprint.devices.find((device) => device.id === "ore-source-1")!;
    const assembler = source.blueprint.devices.find((device) => device.id === "assembler-1")!;
    const secondGenerator = source.blueprint.devices.find((device) => device.id === "generator-2")!;
    source.deviceAssets.generator!.power.distribution = { connectionRange: 8, coverageRange: 8 };
    source.world.resourceNodes.forEach((node, index) => { node.position = { x: 3 + index, y: 2 }; });
    source.blueprint.devices = [
      { ...generator, position: { x: 0, y: 0 } },
      { ...secondGenerator, position: { x: 0, y: 0 } },
      { ...oreSource, position: { x: 3, y: 0 } },
      { ...assembler, position: { x: 3, y: 0 } },
    ];
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    const project = compileFactoryProject(source);
    expect(Object.keys(project.powerGrids)).toEqual(["grid-forge-zone-generator-1", "grid-assembly-zone-generator-2"]);
    expect(project.devices["ore-source-1"]!.powerGrid).toBe("grid-forge-zone-generator-1");
    expect(project.devices["assembler-1"]!.powerGrid).toBe("grid-assembly-zone-generator-2");
    expect(project.powerGrids["grid-forge-zone-generator-1"]!.ratedConsumptionMilliWatts).toBe(50_000);
    expect(project.powerGrids["grid-assembly-zone-generator-2"]!.ratedConsumptionMilliWatts).toBe(220_000);
  });

  test("enforces region-local physical and local links and cross-region inter-zone links", async () => {
    const physical = await loaded();
    physical.blueprint.connections[0]!.to.device = "assembler-1";
    physical.blueprint.connections[0]!.to.port = "input";
    expect(issueCodes(() => compileFactoryProject(physical))).toContain("connection.cross-region");

    const local = await stationProjectSource();
    local.blueprint.devices.find((device) => device.id === "station-demand")!.region = "assembly-zone";
    expect(issueCodes(() => compileFactoryProject(local))).toContain("station.local-cross-region");

    const interZone = await loaded();
    interZone.blueprint.devices.find((device) => device.id === "station-demand")!.region = "forge-zone";
    interZone.blueprint.devices.find((device) => device.id === "station-demand")!.position = { x: 1, y: 16 };
    interZone.blueprint.devices = interZone.blueprint.devices.filter((device) => device.id.startsWith("station-") || device.id === "generator-1");
    interZone.blueprint.connections = [];
    expect(issueCodes(() => compileFactoryProject(interZone))).toContain("station.inter-zone-single-region");
  });

  test("automatic pathfinding ignores belts at the same local coordinates in another region", async () => {
    const source = await loaded();
    source.blueprint.devices = [
      { id: "forge-source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "forge-target", asset: "buffer", region: "forge-zone", position: { x: 4, y: 0 }, rotation: 0 },
      { id: "assembly-source", asset: "buffer", region: "assembly-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "assembly-target", asset: "buffer", region: "assembly-zone", position: { x: 4, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "assembly-belt", from: { device: "assembly-source", port: "output" }, to: { device: "assembly-target", port: "input" },
      resources: ["iron-ore"],
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    expect(findBlueprintConnectionPath(source.blueprint, source.world, source.deviceAssets, {
      from: { device: "forge-source", port: "output" }, to: { device: "forge-target", port: "input" },
    })).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  test("reports unknown device regions without crashing route compilation", async () => {
    const source = await loaded();
    source.blueprint.devices.find((device) => device.id === "station-supply")!.region = "missing-world";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.region");
  });

  test("compiles supply and demand slots into reusable-carrier station routes", async () => {
    const project = compileFactoryProject(await stationProjectSource());
    const network = project.logisticsNetworks["local-main"]!;
    expect(network.fleets).toEqual([
      expect.objectContaining({ station: "station-demand", count: 0, asset: expect.objectContaining({ id: "logistics-drone" }) }),
      expect.objectContaining({ station: "station-supply", count: 1, asset: expect.objectContaining({ id: "logistics-drone" }) }),
    ]);
    expect(network.routes).toEqual([expect.objectContaining({
      resource: "iron-ore", from: "station-supply", to: "station-demand", fromSlotCapacity: 25, toSlotCapacity: 20,
      supplyReserve: 0, demandTarget: 20, supplyPriority: 0, demandPriority: 0,
      capacity: 10, minimumBatch: 10, travelTicks: 3_400,
    })]);
    expect(project.devices["station-supply"]!.buffers.storage!.resourceCapacities).toEqual({ "iron-ore": 25 });
    expect(project.devices["station-demand"]!.buffers.storage!.resourceCapacities).toEqual({ "iron-ore": 20 });
  });

  test("requires an explicit high-speed policy and rejects unsupported carrier service", async () => {
    const missingPolicy = await stationProjectSource();
    delete missingPolicy.blueprint.devices.find((device) => device.id === "station-supply")!.policy!.highSpeedTransport;
    expect(issueCodes(() => compileFactoryProject(missingPolicy))).toContain("station.high-speed-policy-required");

    const unsupported = await stationProjectSource();
    unsupported.blueprint.devices.find((device) => device.id === "station-supply")!.policy!.highSpeedTransport = { enabled: true, minimumDistance: 0 };
    delete unsupported.deviceAssets["logistics-drone"]!.logistics!.highSpeedMission;
    expect(issueCodes(() => compileFactoryProject(unsupported))).toContain("station.high-speed-unsupported");
  });

  test("validates a carrier's high-speed time and energy trade envelope", async () => {
    const source = await stationProjectSource();
    source.deviceAssets["logistics-drone"]!.logistics!.highSpeedMission = {
      durationMultiplier: { numerator: 1, denominator: 1 },
      energyMultiplier: { numerator: 1, denominator: 1 },
    };
    const codes = issueCodes(() => compileFactoryProject(source));
    expect(codes).toContain("logistics.high-speed-duration");
    expect(codes).toContain("logistics.high-speed-energy");
  });

  test("rejects incompatible station carriers and duplicate resource slots", async () => {
    const source = await stationProjectSource();
    source.blueprint.logisticsNetworks[0]!.stations[0]!.fleet.deviceAsset = "conveyor";
    source.blueprint.logisticsNetworks[0]!.stations[0]!.slots.push({ resource: "iron-ore", mode: "storage", capacity: 25 });
    const codes = issueCodes(() => compileFactoryProject(source));
    expect(codes).toContain("logistics.carrier-kind");
    expect(codes).toContain("station.duplicate-resource");
  });

  test("requires explicit station charging and carrier mission-energy contracts", async () => {
    const source = await stationProjectSource();
    delete source.blueprint.devices.find((device) => device.id === "station-supply")!.policy!.stationChargeMilliWatts;
    delete source.deviceAssets["logistics-drone"]!.logistics!.missionEnergy;
    const codes = issueCodes(() => compileFactoryProject(source));
    expect(codes).toContain("station.charge-power-required");
    expect(codes).toContain("logistics.carrier-energy-required");
  });

  test("rejects station slot allocations that conflict or exceed the backing buffer", async () => {
    const oversized = await stationProjectSource();
    oversized.blueprint.devices.find((device) => device.id === "station-supply")!.bufferFilters = { storage: ["iron-ore", "gear"] };
    oversized.blueprint.logisticsNetworks[0]!.stations[0]!.slots.push({ resource: "gear", mode: "storage", capacity: 180 });
    oversized.deviceAssets["logistics-station"]!.logisticsStation!.slots = 1;
    const oversizedCodes = issueCodes(() => compileFactoryProject(oversized));
    expect(oversizedCodes).toContain("station.buffer-capacity");
    expect(oversizedCodes).toContain("station.slot-count");

    const conflicting = await stationProjectSource();
    const second = structuredClone(conflicting.blueprint.logisticsNetworks[0]!);
    second.id = "local-secondary";
    second.stations[0]!.slots[0]!.capacity = 24;
    conflicting.blueprint.logisticsNetworks.push(second);
    expect(issueCodes(() => compileFactoryProject(conflicting))).toContain("station.slot-capacity-conflict");

    const invalidBatch = await stationProjectSource();
    invalidBatch.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0]!.capacity = 5;
    expect(issueCodes(() => compileFactoryProject(invalidBatch))).toContain("station.minimum-batch-slot");

    const invalidPolicy = await stationProjectSource();
    invalidPolicy.blueprint.logisticsNetworks[0]!.stations[0]!.slots[0]!.supplyReserve = 25;
    invalidPolicy.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0]!.demandTarget = 21;
    const invalidPolicyCodes = issueCodes(() => compileFactoryProject(invalidPolicy));
    expect(invalidPolicyCodes).toContain("station.supply-reserve");
    expect(invalidPolicyCodes).toContain("station.demand-target");

    const wrongMode = await stationProjectSource();
    wrongMode.blueprint.logisticsNetworks[0]!.stations[0]!.slots[0]!.demandTarget = 1;
    wrongMode.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0]!.supplyReserve = 1;
    const wrongModeCodes = issueCodes(() => compileFactoryProject(wrongMode));
    expect(wrongModeCodes).toContain("station.supply-reserve-mode");
    expect(wrongModeCodes).toContain("station.demand-target-mode");

    const storagePolicy = await stationProjectSource();
    storagePolicy.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0] = { resource: "iron-ore", mode: "storage", capacity: 20, priority: 1 };
    expect(issueCodes(() => compileFactoryProject(storagePolicy))).toContain("station.storage-policy");

    const initialOverflow = await stationProjectSource();
    initialOverflow.scenario.initialBuffers!["station-demand"] = { storage: { "iron-ore": 21 } };
    expect(issueCodes(() => compileFactoryProject(initialOverflow))).toContain("buffer.resource-capacity");

    const slotLimited = await stationProjectSource();
    slotLimited.blueprint.logisticsNetworks[0]!.stations[0]!.slots[0] = {
      resource: "iron-ore", mode: "supply", capacity: 25, minimumBatch: 1, supplyReserve: 20,
    };
    slotLimited.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0] = {
      resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 1, demandTarget: 4,
    };
    expect(compileFactoryProject(slotLimited).logisticsNetworks["local-main"]!.routes[0]).toEqual(expect.objectContaining({
      carrierCapacity: 10, supplyReserve: 20, demandTarget: 4, capacity: 4,
    }));
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
    expect(analysis.declarativeDevices).toBe(9);
    expect(analysis.extractionDevices).toEqual(expect.arrayContaining([
      expect.objectContaining({ device: "ore-source-1", resource: "iron-ore", itemsPerMinute: 60 }),
      expect.objectContaining({ device: "coal-miner-forge", resource: "coal", itemsPerMinute: 60 }),
      expect.objectContaining({ device: "coal-miner-assembly", resource: "coal", itemsPerMinute: 60 }),
    ]));
    expect(analysis.generationDevices).toEqual(expect.arrayContaining([
      expect.objectContaining({ device: "generator-1", kind: "fuel", fuelResource: "coal", fuelPerMinute: 60_000 / 70_000 }),
      expect.objectContaining({ device: "generator-2", kind: "fuel", fuelResource: "coal", fuelPerMinute: 60_000 / 70_000 }),
    ]));
    expect(analysis.storageDevices).toContainEqual(expect.objectContaining({
      device: "storage-forge", capacityMilliJoules: 3_600_000, initialMilliJoules: 0,
      chargeMilliWatts: 400_000, dischargeMilliWatts: 400_000,
    }));
    expect(analysis.resourceNodes).toHaveLength(5);
    expect(plate.producedPerMinute).toBe(15);
    expect(plate.consumedPerMinute).toBe(40);
    expect(plate.netPerMinute).toBe(-25);
    expect(analysis.productionGraph).toEqual(expect.objectContaining({
      targetResource: "gear", rawInputsPerTarget: { coal: 1, "iron-ore": 4 },
    }));
    expect(analysis.productionGraph.steps).toEqual([
      { device: "assembler-1", process: "assemble-gear", mode: "standard", cyclesPerTarget: 1 },
      { device: "smelter-1", process: "smelt-iron", mode: "standard", cyclesPerTarget: 2 },
    ]);
    expect(analysis.recipeOptions).toContainEqual(expect.objectContaining({
      device: "assembler-1", process: "forge-gear-pair", selected: false, targetOutputPerMinute: 30,
      inputPorts: { "iron-plate": "input-primary", coal: "input-secondary" }, outputPorts: { gear: "output" },
    }));
    expect(analysis.recipeOptions).toContainEqual(expect.objectContaining({
      device: "assembler-1", process: "assemble-gear", mode: "productive", selected: false,
      cycleTicks: 3000, powerMilliWatts: 330000, minimumInputTreatmentLevel: 2,
      inputs: [{ resource: "coal", count: 1 }, { resource: "iron-plate", count: 2 }], outputs: [{ resource: "gear", count: 2 }],
    }));
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "material-deficit" && diagnostic.resource === "iron-plate")).toBeTrue();
    expect(analysis.powerGrids).toEqual([
      expect.objectContaining({ grid: "grid-assembly-zone-generator-2", region: "assembly-zone", headroomMilliWatts: 290_000 }),
      expect.objectContaining({ grid: "grid-forge-zone-generator-1", region: "forge-zone", headroomMilliWatts: -292_000 }),
    ]);
    expect(analysis.connections.find((connection) => connection.connection === "ore-to-smelter")).toEqual(expect.objectContaining({
      dispatchPolicy: "round-robin",
      dispatchProfiles: [{ resource: "iron-ore", targetKind: "process", coverageUnit: 2, criticalDepth: 1, minimumTreatmentLevel: 0 }],
    }));
    expect(analysis.connections.find((connection) => connection.connection === "coal-splitter-to-generator")).toEqual(expect.objectContaining({
      dispatchPolicy: "shortage-first",
      dispatchProfiles: [{ resource: "coal", targetKind: "fuel", coverageUnit: 1, criticalDepth: 0, minimumTreatmentLevel: 0 }],
    }));
    expect(analysis.stationNetworks.find((network) => network.network === "inter-zone-main")).toEqual(expect.objectContaining({
      dispatchPolicy: "shortage-first",
      routes: [expect.objectContaining({
        resource: "iron-plate",
        dispatchProfile: {
      resource: "iron-plate", targetKind: "process", coverageUnit: 2, criticalDepth: 0,
      minimumTreatmentLevel: 0,
      downstreamConnections: ["station-to-assembler"],
        },
      })],
    }));
  });
  test("target-rate planning sizes recipes, extraction, logistics, station fleets, power, and finite reserves", async () => {
    const project = await openFactoryProject(ironworks);
    const plan = planProductionCapacity(project);
    expect(plan).toEqual(expect.objectContaining({ targetResource: "gear", targetRatePerMinute: 12, scenarioMinutes: 2, targetItemsForScenario: 24, ready: false }));
    expect(plan.processes).toEqual(expect.arrayContaining([
      expect.objectContaining({ process: "assemble-gear", requiredOutputPerMinute: 12, configuredMachines: 1, requiredMachines: 1, additionalMachines: 0 }),
      expect.objectContaining({ process: "smelt-iron", requiredOutputPerMinute: 24, configuredMachines: 1, requiredMachines: 2, additionalMachines: 1 }),
    ]));
    expect(plan.rawResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resource: "iron-ore", totalDemandPerMinute: 48, configuredExtractionPerMinute: 60,
        scheduledSupply: 0, scheduledSupplyPerMinute: 0, configuredSupplyPerMinute: 60,
        supplyDeficitPerMinute: 0, finiteReserve: 90, scenarioDemand: 96,
        scenarioSupply: 90, scenarioBalance: -6,
      }),
    ]));
    expect(plan.transport.find((flow) => flow.process === "smelt-iron" && flow.direction === "input")).toEqual(expect.objectContaining({ resource: "iron-ore", requiredItemsPerMinute: 48, configuredCapacityPerMinute: 80 }));
    expect(plan.stationNetworks).toContainEqual(expect.objectContaining({ network: "inter-zone-main", resource: "iron-plate", requiredItemsPerMinute: 24, requiredCarriers: 1, configuredCarriers: 1 }));
    expect(plan.power).toContainEqual(expect.objectContaining({ region: "forge-zone", headroomMilliWatts: -422_000 }));
    expect(plan.gaps.map((gap) => gap.kind)).toEqual(["process", "reserve", "power"]);
  });

  test("target-rate planning rejects a rated-ready grid whose Scenario envelope leaves energy unserved", async () => {
    const project = await openFactoryProject(ironworks, { world: "scaled", blueprint: "scaled-factory", scenario: "intermittent-wind", objective: "scaled-production" });
    const plan = planProductionCapacity(project);
    expect(plan.power.every((grid) => grid.headroomMilliWatts > 0)).toBeTrue();
    expect(plan.power).toEqual(expect.arrayContaining([
      expect.objectContaining({ region: "assembly-zone", scenarioUnservedMilliJoules: 3_600_000, requiredStorageCapacityMilliJoules: 3_600_000 }),
      expect.objectContaining({ region: "forge-zone", scenarioUnservedMilliJoules: 0, requiredStorageCapacityMilliJoules: 0 }),
    ]));
    expect(plan.ready).toBeFalse();
    expect(plan.gaps.filter((gap) => gap.kind === "power")).toHaveLength(1);
  });

  test("fab capacity planning allocates qualified shared tool time and credits scheduled wafer and purchased-material supply", async () => {
    const baselineSource = await loadFactoryProject(memoryFab, { blueprint: "baseline", scenario: "steady-production" });
    const baseline = planProductionCapacity(compileFactoryProject(baselineSource));
    expect(baseline.ready).toBeTrue();
    expect(baseline.rawResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resource: "blank-dram-wafer-lot", totalDemandPerMinute: 1.5625,
        scheduledSupply: 12, scheduledSupplyPerMinute: 3, configuredSupplyPerMinute: 3,
        supplyDeficitPerMinute: 0, scenarioDemand: 6.25, scenarioSupply: 12, scenarioBalance: 5.75,
      }),
      expect.objectContaining({
        resource: "dram-package-substrate", totalDemandPerMinute: 12.5,
        scheduledSupply: 96, scheduledSupplyPerMinute: 24, configuredSupplyPerMinute: 24,
        supplyDeficitPerMinute: 0, scenarioDemand: 50, scenarioSupply: 96, scenarioBalance: 46,
      }),
    ]));
    expect(baseline.toolsets).toEqual([
      expect.objectContaining({
        id: "cleanroom:dram-burn-in-rack", requiredDeviceTicksPerMinute: 32_250,
        configuredDeviceTicksPerMinute: 60_000, unallocatedDeviceTicksPerMinute: 0, utilization: 32_250 / 60_000,
      }),
      expect.objectContaining({
        id: "cleanroom:lithography-bay", requiredDeviceTicksPerMinute: 18_750,
        configuredDeviceTicksPerMinute: 60_000, unallocatedDeviceTicksPerMinute: 0, utilization: 18_750 / 60_000,
      }),
      expect.objectContaining({
        id: "cleanroom:plasma-etch-bay", requiredDeviceTicksPerMinute: 15_625,
        configuredDeviceTicksPerMinute: 60_000, unallocatedDeviceTicksPerMinute: 0, utilization: 15_625 / 60_000,
      }),
    ]);

    baselineSource.objective.deliveryContracts = undefined;
    baselineSource.objective.targetRatePerMinute = 56;
    const overloaded = planProductionCapacity(compileFactoryProject(baselineSource));
    expect(overloaded.gaps.filter((gap) => gap.kind === "toolset").map((gap) => gap.entity)).toEqual([
      "cleanroom:lithography-bay", "cleanroom:plasma-etch-bay",
    ]);
    expect(overloaded.toolsets.map((toolset) => [toolset.id, toolset.unallocatedDeviceTicksPerMinute, toolset.minimumAdditionalDevices])).toEqual([
      ["cleanroom:lithography-bay", 24_000, 1], ["cleanroom:plasma-etch-bay", 10_000, 1],
    ]);

    const specializedSource = await loadFactoryProject(memoryFab, { blueprint: "experiment", scenario: "steady-production" });
    specializedSource.objective.deliveryContracts = undefined;
    specializedSource.objective.targetRatePerMinute = 56;
    const specialized = planProductionCapacity(compileFactoryProject(specializedSource));
    expect(specialized.gaps.some((gap) => gap.kind === "toolset")).toBeFalse();
    expect(specialized.toolsets.every((toolset) => toolset.unallocatedDeviceTicksPerMinute === 0)).toBeTrue();
  });

  test("station shortage profiles traverse same-buffer pass-through links to the real Process batch", async () => {
    const project = compileFactoryProject(await loaded());
    const route = project.logisticsNetworks["inter-zone-main"]!.routes[0]!;
    const direct = project.connections["station-to-assembler"]!;
    const passThrough = project.devices["station-supply"]!;
    const input = passThrough.ports.find((port) => port.direction === "input")!;
    const output = passThrough.ports.find((port) => port.direction === "output")!;
    delete project.connections[direct.id];
    project.connections["station-to-buffer"] = {
      ...direct, id: "station-to-buffer", to: { device: passThrough.id, port: input.id }, toDevice: passThrough, toPort: input,
    };
    project.connections["buffer-to-assembler"] = {
      ...direct, id: "buffer-to-assembler", from: { device: passThrough.id, port: output.id }, fromDevice: passThrough, fromPort: output,
    };
    expect(stationRouteDispatchProfile(project, route)).toEqual({
      resource: "iron-plate", targetKind: "process", coverageUnit: 2, criticalDepth: 0,
      minimumTreatmentLevel: 0,
      downstreamConnections: ["buffer-to-assembler", "station-to-buffer"],
    });
  });
  test("identical inputs and seed produce identical events, state, metrics, and hash", async () => {
    const project = await openFactoryProject(ironworks); const first = runUntil(project, undefined, { seed: 42 }); const second = runUntil(project, undefined, { seed: 42 });
    expect(first).toEqual(second); expect(first.metrics.consumed.gear).toBeGreaterThanOrEqual(9);
  });

  test("counts objective delivery only in the declared target region", async () => {
    const source = await loaded();
    source.objective.targetRegion = "forge-zone";
    const result = runUntil(compileFactoryProject(source));
    expect(result.metrics.consumed.gear).toBeGreaterThan(0);
    expect(result.metrics.throughputPerMinute).toBe(0);
  });

  test("fuel generation burns delivered coal and contributes power only for its compiled burn duration", async () => {
    const source = await loaded();
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id === "station-supply" || device.id === "generator-1");
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "generator-1": { fuel: { coal: 1 } } };
    source.scenario.failures = [];
    source.scenario.durationTicks = 71_000;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 71_000 });
    expect(result.events.some((event) => event.type === "power.fuel-loaded" && event.tick === 0 && event.device === "generator-1" && event.resource === "coal" && event.durationTicks === 70_000)).toBeTrue();
    expect(result.events.some((event) => event.type === "power.fuel-spent" && event.tick === 70_000 && event.device === "generator-1" && event.resource === "coal")).toBeTrue();
    expect(result.events.some((event) => event.type === "power.shortage" && event.tick === 70_000 && event.device === "station-supply")).toBeTrue();
    expect(result.metrics.fuelConsumed).toEqual({ coal: 1 });
    expect(result.state.energy.availableMilliWatts).toBe(0);
  });

  test("finite world nodes reserve, extract, deplete, and conserve their initial amount", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "resource.extracted" && event.node === "iron-vein-1")).toBeTrue();
    expect(result.events.some((event) => event.type === "resource.depleted" && event.node === "iron-vein-1")).toBeTrue();
    expect(result.metrics.extracted["iron-ore"]).toBeGreaterThan(0);
    for (const node of Object.values(result.metrics.resourceNodes)) expect(node.remaining + node.reserved + node.extracted).toBe(node.initial);
  });

  test("multiple miners atomically share a node without over-extraction or duplicate depletion", async () => {
    const source = await loaded();
    source.world.resourceNodes = [{ ...source.world.resourceNodes[0]!, position: { x: 3, y: 9 }, amount: 2 }];
    const first = source.blueprint.devices.find((device) => device.id === "ore-source-1")!;
    first.resourceNodes = ["iron-vein-1"];
    source.blueprint.devices = [first, { ...structuredClone(first), id: "ore-source-2", position: { x: 4, y: 10 } }, source.blueprint.devices.find((device) => device.id === "generator-1")!];
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "generator-1": { fuel: { coal: 1 } } };
    source.scenario.durationTicks = 1_000;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 1_000 });
    expect(result.metrics.resourceNodes["iron-vein-1"]).toEqual({ initial: 2, remaining: 0, reserved: 0, extracted: 2, depleted: true });
    expect(result.events.filter((event) => event.type === "resource.depleted" && event.node === "iron-vein-1")).toHaveLength(1);
  });

  test("transport arrivals preserve configured delay", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const departure = result.events.find((event) => event.type === "resource.depart");
    if (!departure || departure.type !== "resource.depart") throw new Error("missing departure");
    const arrival = result.events.find((event) => event.type === "resource.arrive" && event.transit.id === departure.transit.id);
    if (!arrival) throw new Error("missing arrival");
    expect(arrival.tick - departure.tick).toBe(project.connections[departure.connection]!.travelTicks);
  });

  test("powered transport endpoints stop and recover with their local grid", async () => {
    const source = await loaded();
    source.blueprint.policies = { ...source.blueprint.policies, powerAllocation: "priority-load-shedding" };
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 11_000 };
    source.deviceAssets.splitter!.power.idleMilliWatts = 10_000;
    source.deviceAssets.splitter!.power.activeMilliWatts = 10_000;
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-zone", position: { x: 4, y: 0 }, rotation: 0 },
      { id: "wind", asset: "wind-turbine", region: "forge-zone", position: { x: 0, y: 4 }, rotation: 0 },
      { id: "blocker", asset: "splitter", region: "forge-zone", position: { x: 4, y: 4 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "powered-belt", from: { device: "source", port: "output" }, to: { device: "target", port: "input" },
      resources: ["iron-ore"],
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { "iron-ore": 1 } } };
    source.scenario.failures = [{ device: "blocker", atTick: 500, durationTicks: 5_000 }];
    const project = compileFactoryProject(source);
    expect(project.powerGrids["grid-forge-zone-wind"]!.transportStages).toEqual([
      { connection: "powered-belt", stage: "loader", device: "powered-belt-loader" },
      { connection: "powered-belt", stage: "unloader", device: "powered-belt-unloader" },
    ]);

    const result = runUntil(project, undefined, { untilTick: 2_000 });
    expect(result.events.some((event) => event.type === "transport.power-shortage" && event.tick === 0 && event.connection === "powered-belt" && event.stage === "loader")).toBeTrue();
    expect(result.events.some((event) => event.type === "transport.power-restored" && event.tick === 500 && event.connection === "powered-belt" && event.stage === "loader")).toBeTrue();
    expect(result.events.find((event) => event.type === "resource.depart")?.tick).toBe(500);
    expect(result.events.find((event) => event.type === "resource.arrive")?.tick).toBe(1_300);
    expect(result.metrics.transportStageUtilization["powered-belt"]!.loader).toBeGreaterThan(0);
    expect(result.metrics.transportStageUtilization["powered-belt"]!.unloader).toBeGreaterThan(0);
    expect(result.metrics.transportEnergyConsumedMilliJoules).toBe(2_750);
  });

  test("explicit sorter failures pause their own in-flight stage and resume exact remaining work", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 1, durationTicks: 1_000 }),
    };
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-zone", position: { x: 4, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "failure-belt", from: { device: "source", port: "output" }, to: { device: "target", port: "input" },
      resources: ["iron-ore"], path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { "iron-ore": 1 } } };
    source.scenario.failures = [{ device: "failure-belt-loader", atTick: 400, durationTicks: 900 }];
    const project = compileFactoryProject(source);
    const result = runUntil(project, undefined, { untilTick: 4_000 });
    const stageEvents = result.events.filter((event) => event.type === "transport.stage-start" || event.type === "transport.stage-finish");
    expect(stageEvents.map((event) => [event.type, event.device, event.tick])).toEqual([
      ["transport.stage-start", "failure-belt-loader", 0],
      ["transport.stage-finish", "failure-belt-loader", 1_900],
      ["transport.stage-start", "failure-belt-unloader", 2_200],
      ["transport.stage-finish", "failure-belt-unloader", 3_200],
    ]);
    expect(result.events.find((event) => event.type === "resource.arrive")?.tick).toBe(3_200);
    expect(result.metrics.machineUtilization["failure-belt-loader"]).toBe(0.25);
    expect(result.metrics.idleTime["failure-belt-loader"]).toBe(2_100);
    expect(result.metrics.failedTime["failure-belt-loader"]).toBe(900);
    expect(replayFactoryEvents(project, result.events, 500).devices["failure-belt-loader"]!.runtimeStatus).toBe("failed");
    expect(replayFactoryEvents(project, result.events, 1_500).devices["failure-belt-loader"]!.runtimeStatus).toBe("processing");
    expect(replayFactoryEvents(project, result.events, 2_000).devices["failure-belt-loader"]!.runtimeStatus).toBe("idle");
  });

  test("the slowest logistics stage gates connection dispatch", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 1, durationTicks: 1_000 }),
    };
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source-buffer", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target-buffer", asset: "buffer", region: "forge-zone", position: { x: 10, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "buffer-link", from: { device: "source-buffer", port: "output" }, to: { device: "target-buffer", port: "input" },
      resources: ["iron-ore"],
      path: Array.from({ length: 9 }, (_, index) => ({ x: index + 1, y: 0 })),
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "source-buffer": { storage: { "iron-ore": 4 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.connections["buffer-link"]!.dispatchIntervalTicks).toBe(1_000);
    const result = runUntil(project, undefined, { untilTick: 2_500 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.tick)).toEqual([0, 1_000, 2_000]);
  });

  test("sorter span changes physical belt endpoints, latency, and throughput", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "span-source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "span-target", asset: "buffer", region: "forge-zone", position: { x: 10, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "span-link", from: { device: "span-source", port: "output" }, to: { device: "span-target", port: "input" },
      resources: ["iron-ore"],
      path: Array.from({ length: 6 }, (_, index) => ({ x: index + 3, y: 0 })),
      logistics: { loader: { deviceAsset: "sorter", distance: 3 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 2 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "span-source": { storage: { "iron-ore": 4 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    const connection = project.connections["span-link"]!;
    expect(connection.path).toEqual([{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 0 }]);
    expect(connection.logisticsStages.map((stage) => [stage.stage, stage.distance, stage.durationTicks])).toEqual([
      ["loader", 3, 750], ["line", 6, 600], ["unloader", 2, 500],
    ]);
    expect(connection.travelTicks).toBe(1_850);
    expect(connection.dispatchIntervalTicks).toBe(750);
    const result = runUntil(project, undefined, { untilTick: 2_500 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.tick)).toEqual([0, 750, 1_500, 2_250]);
    expect(result.events.find((event) => event.type === "resource.arrive")?.tick).toBe(1_850);
  });

  test("stack-capable sorters move multiple Resource items in one physical belt cell", async () => {
    const source = await loaded();
    source.blueprint.devices = [
      { id: "stack-source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "stack-target", asset: "buffer", region: "forge-zone", position: { x: 8, y: 0 }, rotation: 0 },
      { id: "stack-power", asset: "wind-turbine", region: "forge-zone", position: { x: 4, y: 4 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "stacked-link", from: { device: "stack-source", port: "output" }, to: { device: "stack-target", port: "input" },
      resources: ["iron-ore"],
      path: Array.from({ length: 7 }, (_, index) => ({ x: index + 1, y: 0 })), stackSize: 4,
      logistics: { loader: { deviceAsset: "stack-sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "stack-sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.durationTicks = 2_000; source.scenario.initialBuffers = { "stack-source": { storage: { "iron-ore": 8 } } }; source.scenario.failures = [];
    const project = compileFactoryProject(source); const connection = project.connections["stacked-link"]!;
    expect(connection.stackSizeByResource["iron-ore"]).toBe(4);
    expect(connection.maxStackSize).toBe(4);
    const result = runUntil(project);
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.type === "resource.depart" ? event.transit.count : 0)).toEqual([4, 4]);
    expect(result.metrics.transportFlows["stacked-link"]!.deliveredItems).toBe(8);
    expect(result.metrics.transportFlows["stacked-link"]!.capacityItemsPerMinute).toBe(1_920);
    expect(result.metrics.peakBeltItems).toBe(8);

    source.blueprint.connections[0]!.stackSize = 5;
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.stack-capacity");
    source.blueprint.connections[0]!.stackSize = 4; source.resources["iron-ore"]!.transport.stackSize = 2;
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.resource-stack-limit");
  });

  test("connections sharing physical belt cells share bandwidth with deterministic fair arbitration", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 10 }) };
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source-a", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "source-b", asset: "buffer", region: "forge-zone", position: { x: 0, y: 2 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-zone", position: { x: 8, y: 1 }, rotation: 0 },
    ];
    const logistics = { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } };
    setTestConnections(source, [
      { id: "shared-a", from: { device: "source-a", port: "output" }, to: { device: "target", port: "input" }, resources: ["iron-ore"], path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }], logistics },
      { id: "shared-b", from: { device: "source-b", port: "output" }, to: { device: "target", port: "input" }, resources: ["iron-ore"], path: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }], logistics },
    ]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "source-a": { storage: { "iron-ore": 10 } }, "source-b": { storage: { "iron-ore": 10 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.transportCells["forge-zone:4,1"]!.connections).toEqual(["shared-a", "shared-b"]);
    const result = runUntil(project, undefined, { untilTick: 1_000 });
    expect(result.events.flatMap((event) => event.type === "resource.belt-position" && event.cell === "forge-zone:4,1" ? [[event.tick, event.connection]] : [])).toEqual([
      [410, "shared-a"], [510, "shared-b"], [620, "shared-a"], [720, "shared-b"], [830, "shared-a"], [930, "shared-b"],
    ]);
    expect(result.events.some((event) => event.type === "resource.belt-blocked" && event.waitingFor === "forge-zone:2,1")).toBeTrue();
    const occupied = Object.entries(result.state.transports).flatMap(([connection, transits]) => transits
      .filter((transit) => transit.phase === "belt")
      .map((transit) => project.connections[connection]!.transportCells[transit.cellIndex]!));
    expect(new Set(occupied).size).toBe(occupied.length);
    source.blueprint.devices.push({ id: "target-b", asset: "buffer", region: "forge-zone", position: { x: 8, y: 3 }, rotation: 0 });
    source.blueprint.connections[1]!.to = { device: "target-b", port: "input" };
    source.blueprint.connections[1]!.path = [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 }];
    source.blueprint.devices.find((device) => device.id === source.blueprint.connections[1]!.logistics.unloader.device)!.position = { x: 7, y: 3 };
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.shared-cell-direction");
  });

  test("slow unloading fills concrete belt cells and propagates backpressure upstream", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 10 }) };
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.deviceAssets["slow-unloader"] = {
      ...source.deviceAssets.sorter!, id: "slow-unloader", name: "Slow unloader",
      program: { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 1_000 }) },
    };
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-zone", position: { x: 6, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "belt", from: { device: "source", port: "output" }, to: { device: "target", port: "input" },
      resources: ["iron-ore"],
      path: Array.from({ length: 5 }, (_, index) => ({ x: index + 1, y: 0 })),
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "slow-unloader", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { "iron-ore": 20 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    const result = runUntil(project, undefined, { untilTick: 1_500 });
    const beltItems = result.state.transports.belt!.filter((transit) => transit.phase === "belt");
    expect(beltItems.map((transit) => transit.cellIndex).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(result.state.transports.belt!.some((transit) => transit.phase === "loading" && transit.blockedBy === "forge-zone:1,0")).toBeTrue();
    expect(result.state.transports.belt!.some((transit) => transit.phase === "unloading")).toBeTrue();
    expect(result.events.some((event) => event.type === "resource.belt-blocked" && event.cell === "forge-zone:5,0" && event.waitingFor === "target.input")).toBeTrue();
    expect(result.metrics.averageBlockedBeltItems).toBeGreaterThan(0);
    expect(result.metrics.peakBeltItems).toBe(5);
    expect(result.metrics.beltCellUtilization).toBeGreaterThan(0.5);
    expect(result.metrics.transportFlows.belt!.departedByResource["iron-ore"]).toBeGreaterThan(0);
    expect(result.metrics.transportFlows.belt!.deliveredItems).toBe(0);
    expect(result.metrics.transportFlows.belt!.averageInFlightItems).toBeGreaterThan(1);
    expect(result.metrics.transportFlows.belt!.blockedItemTicks).toBeGreaterThan(0);
    expect(result.metrics.transportFlows.belt!.blockedFraction).toBeGreaterThan(0);
  });

  test("splitter policies route filtered resources through explicit output ports", async () => {
    const source = await loaded();
    source.blueprint.devices = [
      { id: "splitter-1", asset: "splitter", region: "forge-zone", position: { x: 4, y: 4 }, rotation: 0, policy: { dispatch: "round-robin", filter: { resource: "coal", outputPort: "output-north" } } },
      { id: "target-east", asset: "buffer", region: "forge-zone", position: { x: 10, y: 4 }, rotation: 0 },
      { id: "target-north", asset: "buffer", region: "forge-zone", position: { x: 7, y: 2 }, rotation: 0 },
      { id: "wind-1", asset: "wind-turbine", region: "forge-zone", position: { x: 0, y: 4 }, rotation: 0 },
    ];
    const logistics = { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } };
    setTestConnections(source, [
      { id: "split-east", from: { device: "splitter-1", port: "output-east" }, to: { device: "target-east", port: "input" }, resources: ["coal", "iron-ore"], path: [{ x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }], logistics },
      { id: "split-north", from: { device: "splitter-1", port: "output-north" }, to: { device: "target-north", port: "input" }, resources: ["coal", "iron-ore"], path: [{ x: 5, y: 3 }, { x: 5, y: 2 }, { x: 6, y: 2 }], logistics },
    ]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "splitter-1": { storage: { coal: 1, "iron-ore": 1 } } };
    source.scenario.failures = [];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 2_000 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => [event.connection, event.transit.resource])).toEqual([
      ["split-east", "iron-ore"], ["split-north", "coal"],
    ]);
    expect(result.state.devices["target-east"]!.buffers.storage!["iron-ore"]).toBe(1);
    expect(result.state.devices["target-north"]!.buffers.storage!.coal).toBe(1);
  });

  test("shortage-first dispatch feeds the least-covered downstream buffer deterministically", async () => {
    const source = await loaded();
    source.deviceAssets.splitter!.power.idleMilliWatts = 0;
    source.deviceAssets.splitter!.power.activeMilliWatts = 0;
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source", asset: "splitter", region: "forge-zone", position: { x: 4, y: 4 }, rotation: 0 },
      { id: "stocked", asset: "buffer", region: "forge-zone", position: { x: 10, y: 4 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] } },
      { id: "starved", asset: "buffer", region: "forge-zone", position: { x: 7, y: 2 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] } },
    ];
    const logistics = { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } };
    setTestConnections(source, [
      { id: "a-stocked", from: { device: "source", port: "output-east" }, to: { device: "stocked", port: "input" }, resources: ["iron-ore"], path: [{ x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }], logistics },
      { id: "z-starved", from: { device: "source", port: "output-north" }, to: { device: "starved", port: "input" }, resources: ["iron-ore"], path: [{ x: 5, y: 3 }, { x: 5, y: 2 }, { x: 6, y: 2 }], logistics },
    ]);
    source.blueprint.logisticsNetworks = [];
    source.blueprint.policies = { dispatch: "shortage-first", powerAllocation: "proportional" };
    source.scenario.initialBuffers = {
      source: { storage: { "iron-ore": 1 } },
      stocked: { storage: { "iron-ore": 5 } },
    };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    const first = runUntil(project, undefined, { untilTick: 100 });
    const second = runUntil(project, undefined, { untilTick: 100 });
    expect(first.events.filter((event) => event.type === "resource.depart").map((event) => event.connection)).toEqual(["z-starved"]);
    expect(first).toEqual(second);
  });

  test("shortage-first dispatch chooses the least-covered Resource on a shared lane and counts inbound cargo", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-zone", position: { x: 6, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "mixed-lane", from: { device: "source", port: "output" }, to: { device: "target", port: "input" },
      resources: ["coal", "gear"],
      path: Array.from({ length: 5 }, (_, index) => ({ x: index + 1, y: 0 })),
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.blueprint.policies = { dispatch: "shortage-first", powerAllocation: "proportional" };
    source.scenario.initialBuffers = {
      source: { storage: { coal: 1, gear: 2 } },
    };
    source.scenario.failures = [];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 300 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.transit.resource)).toEqual(["gear", "coal"]);
  });

  test("explicit output priority overrides shortage-first dispatch", async () => {
    const source = await loaded();
    source.deviceAssets.splitter!.power.idleMilliWatts = 0;
    source.deviceAssets.splitter!.power.activeMilliWatts = 0;
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source", asset: "splitter", region: "forge-zone", position: { x: 4, y: 4 }, rotation: 0, policy: { dispatch: "shortage-first", outputPriority: "output-east" } },
      { id: "preferred", asset: "buffer", region: "forge-zone", position: { x: 10, y: 4 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] } },
      { id: "starved", asset: "buffer", region: "forge-zone", position: { x: 7, y: 2 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] } },
    ];
    const logistics = { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } };
    setTestConnections(source, [
      { id: "preferred-lane", from: { device: "source", port: "output-east" }, to: { device: "preferred", port: "input" }, resources: ["iron-ore"], path: [{ x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }], logistics },
      { id: "starved-lane", from: { device: "source", port: "output-north" }, to: { device: "starved", port: "input" }, resources: ["iron-ore"], path: [{ x: 5, y: 3 }, { x: 5, y: 2 }, { x: 6, y: 2 }], logistics },
    ]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = {
      source: { storage: { "iron-ore": 1 } },
      preferred: { storage: { "iron-ore": 5 } },
    };
    source.scenario.failures = [];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 100 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.connection)).toEqual(["preferred-lane"]);
  });

  test("connection Resource filters admit only the declared material from a mixed source", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "gear-only", asset: "buffer", region: "forge-zone", position: { x: 6, y: 0 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "filtered-belt", from: { device: "source", port: "output" }, to: { device: "gear-only", port: "input" },
      resources: ["gear"],
      path: Array.from({ length: 5 }, (_, index) => ({ x: index + 1, y: 0 })),
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { coal: 1, gear: 1 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.connections["filtered-belt"]!.stackSizeByResource).toEqual({ gear: 1 });
    const result = runUntil(project, undefined, { untilTick: 2_000 });
    expect(result.state.devices["gear-only"]!.buffers.storage).toEqual({ gear: 1 });
    expect(result.state.devices.source!.buffers.storage).toEqual({ coal: 1 });
    expect(result.events.filter((event) => event.type === "resource.depart").map((event) => event.transit.resource)).toEqual(["gear"]);

    const lane = source.blueprint.connections[0]!;
    lane.resources = ["gear", "gear"];
    expect(issueCodes(() => compileFactoryProject(source))).toContain("connection.resource-duplicate");
    lane.resources = ["missing-resource"];
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
    lane.resources = [];
    expect(issueCodes(() => compileFactoryProject(source))).toContain("connection.resources-required");
    source.blueprint.devices.find((device) => device.id === "gear-only")!.bufferFilters = { storage: ["gear"] };
    lane.resources = ["coal"];
    expect(issueCodes(() => compileFactoryProject(source))).toContain("connection.target-resource-contract");
  });

  test("station networks batch resources through a finite station-owned round-trip fleet", async () => {
    const project = compileFactoryProject(await stationProjectSource());
    expect(project.devices["station-supply"]!.buffers.storage!.accepts).toEqual(["iron-ore"]);
    expect(project.devices["station-demand"]!.buffers.storage!.accepts).toEqual(["iron-ore"]);
    const result = runUntil(project, undefined, { untilTick: 13_600 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => [event.tick, event.transit.count])).toEqual([[0, 10], [6_800, 10]]);
    expect(result.events.filter((event) => event.type === "logistics.arrive").map((event) => event.tick)).toEqual([3_400, 10_200]);
    expect(result.events.filter((event) => event.type === "logistics.return").map((event) => event.tick)).toEqual([6_800, 13_600]);
    expect(result.state.devices["station-demand"]!.buffers.storage!["iron-ore"]).toBe(20);
    expect(result.state.devices["station-supply"]!.buffers.storage!["iron-ore"]).toBe(5);
    expect(result.state.logisticsTransports["local-main"]).toHaveLength(0);
    expect(result.state.logisticsMissions["local-main"]).toHaveLength(0);
    expect(result.metrics.stationFleets["local-main:station-supply"]).toEqual(expect.objectContaining({ configuredCarriers: 1, activeMissions: 0, completedReturns: 2, utilization: 1 }));
    expect(result.metrics.totalBuildCost).toBe(6_500);
  });

  test("station carriers wait for distance-priced launch energy and recharge from the local grid", async () => {
    const source = await stationProjectSource();
    source.blueprint.devices.find((device) => device.id === "station-demand")!.policy!.stationChargeMilliWatts = 0;
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.durationTicks = 14_400;
    const project = compileFactoryProject(source);
    const route = project.logisticsNetworks["local-main"]!.routes[0]!;
    expect(route.distance).toBe(12);
    expect(route.missionEnergyMilliJoules).toBe(160_000);

    const result = runUntil(project, undefined, { untilTick: 14_400 });
    expect(result.events.filter((event) => event.type === "logistics.energy-shortage").map((event) => event.tick)).toEqual([0]);
    expect(result.events.filter((event) => event.type === "logistics.energy-spent").map((event) => [event.tick, event.energyMilliJoules])).toEqual([
      [800, 160_000], [7_600, 160_000],
    ]);
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => event.tick)).toEqual([800, 7_600]);
    expect(result.events.filter((event) => event.type === "logistics.arrive").map((event) => event.tick)).toEqual([4_200, 11_000]);
    expect(result.events.filter((event) => event.type === "logistics.return").map((event) => event.tick)).toEqual([7_600, 14_400]);
    expect(result.metrics.stationEnergy["station-supply"]).toEqual({
      initialMilliJoules: 0,
      storedMilliJoules: 2_560_000,
      capacityMilliJoules: 3_000_000,
      chargedMilliJoules: 2_880_000,
      spentMilliJoules: 320_000,
      configuredChargeMilliWatts: 200_000,
    });
  });

  test("high-speed carrier policy trades launch energy for deterministic fleet turnaround", async () => {
    const source = await stationProjectSource();
    source.blueprint.devices.find((device) => device.id === "station-supply")!.policy!.highSpeedTransport = { enabled: true, minimumDistance: 10 };
    const project = compileFactoryProject(source);
    const route = project.logisticsNetworks["local-main"]!.routes[0]!;
    expect(route).toEqual(expect.objectContaining({
      distance: 12,
      standardTravelTicks: 3_400,
      standardRoundTripTicks: 6_800,
      standardMissionEnergyMilliJoules: 160_000,
      travelTicks: 1_700,
      roundTripTicks: 3_400,
      missionEnergyMilliJoules: 213_334,
      highSpeed: { enabled: true, travelTicks: 1_700, roundTripTicks: 3_400, missionEnergyMilliJoules: 213_334 },
    }));

    const result = runUntil(project, undefined, { untilTick: 6_800 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => [event.tick, event.transit.highSpeed])).toEqual([
      [0, true], [3_400, true],
    ]);
    expect(result.events.filter((event) => event.type === "logistics.arrive").map((event) => event.tick)).toEqual([1_700, 5_100]);
    expect(result.events.filter((event) => event.type === "logistics.return").map((event) => event.tick)).toEqual([3_400, 6_800]);
    expect(result.metrics.highSpeedMissions).toBe(2);
    expect(result.metrics.stationEnergy["station-supply"]!.spentMilliJoules).toBe(426_668);
  });

  test("station cargo preserves one exact material treatment level", async () => {
    const source = await stationProjectSource();
    source.scenario.initialTreatments = [{
      device: "station-supply", buffer: "storage", resource: "iron-ore", level: 2, count: 25,
    }];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 10_200 });
    expect(result.events.filter((event) => event.type === "logistics.depart")
      .map((event) => [event.transit.count, event.transit.treatmentLevel])).toEqual([[10, 2], [10, 2]]);
    expect(result.state.devices["station-demand"]!.materialBatches.storage!["iron-ore"]).toEqual({ "2": 20 });
    expect(result.state.devices["station-supply"]!.materialBatches.storage!["iron-ore"]).toEqual({ "2": 5 });
  });

  test("station demand targets reserve inbound cargo and stop partial batches below minimum", async () => {
    const source = await stationProjectSource();
    source.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0]!.demandTarget = 15;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 7_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => [event.tick, event.transit.count])).toEqual([[0, 10]]);
    expect(result.state.devices["station-demand"]!.buffers.storage).toEqual({ "iron-ore": 10 });
    expect(result.state.devices["station-supply"]!.buffers.storage).toEqual({ "iron-ore": 15 });
  });

  test("station supply reserves retain inventory for local consumers", async () => {
    const source = await stationProjectSource();
    source.blueprint.logisticsNetworks[0]!.stations[0]!.slots[0]!.supplyReserve = 15;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 7_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => event.transit.count)).toEqual([10]);
    expect(result.state.devices["station-supply"]!.buffers.storage).toEqual({ "iron-ore": 15 });
    expect(result.state.devices["station-demand"]!.buffers.storage).toEqual({ "iron-ore": 10 });
  });

  test("station demand priority wins finite home-fleet capacity and falls back when its target is full", async () => {
    const source = await stationProjectSource();
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.blueprint.devices.push({
      id: "station-priority", asset: "logistics-station", region: "forge-zone", position: { x: 8, y: 10 }, rotation: 0,
      bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 0, highSpeedTransport: { enabled: false, minimumDistance: 0 } },
    });
    const network = source.blueprint.logisticsNetworks[0]!;
    network.stations[0]!.slots[0]!.capacity = 30;
    network.stations[1]!.slots[0] = { resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10, priority: 0, demandTarget: 20 };
    network.stations.push({ device: "station-priority", fleet: { deviceAsset: "logistics-drone", count: 0 }, slots: [{ resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10, priority: 10, demandTarget: 20 }] });
    source.scenario.initialBuffers!["station-supply"]!.storage!["iron-ore"] = 30;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 9_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => [event.tick, event.transit.to])).toEqual([
      [0, "station-priority"], [4_400, "station-priority"], [8_800, "station-demand"],
    ]);
  });

  test("shortage-first station dispatch follows downstream coverage within equal explicit priorities", async () => {
    const source = await stationProjectSource();
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.blueprint.devices.push({
      id: "station-starved", asset: "logistics-station", region: "forge-zone", position: { x: 8, y: 10 }, rotation: 0,
      bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 0, highSpeedTransport: { enabled: false, minimumDistance: 0 } },
    });
    const network = source.blueprint.logisticsNetworks[0]!;
    network.dispatch = "shortage-first";
    network.stations[0]!.slots[0]!.capacity = 30;
    network.stations.push({ device: "station-starved", fleet: { deviceAsset: "logistics-drone", count: 0 }, slots: [{ resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10 }] });
    source.scenario.initialBuffers!["station-supply"]!.storage!["iron-ore"] = 30;
    source.scenario.initialBuffers!["station-demand"] = { storage: { "iron-ore": 10 } };
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 4_500 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => [event.tick, event.transit.to])).toEqual([
      [0, "station-starved"], [4_400, "station-demand"],
    ]);
  });

  test("equal station priorities remain deterministic round-robin", async () => {
    const source = await stationProjectSource();
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.blueprint.devices.push({
      id: "station-peer", asset: "logistics-station", region: "forge-zone", position: { x: 8, y: 10 }, rotation: 0,
      bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 0, highSpeedTransport: { enabled: false, minimumDistance: 0 } },
    });
    const network = source.blueprint.logisticsNetworks[0]!;
    network.dispatch = "round-robin";
    network.stations[0]!.slots[0]!.capacity = 20;
    network.stations[1]!.slots[0]!.priority = 5;
    network.stations.push({ device: "station-peer", fleet: { deviceAsset: "logistics-drone", count: 0 }, slots: [{ resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10, priority: 5 }] });
    source.scenario.initialBuffers!["station-supply"]!.storage!["iron-ore"] = 20;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 7_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => event.transit.to)).toEqual([
      "station-demand", "station-peer",
    ]);
  });

  test("FIFO station dispatch keeps stable route order within equal explicit priorities", async () => {
    const source = await stationProjectSource();
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.blueprint.devices.push({
      id: "station-peer", asset: "logistics-station", region: "forge-zone", position: { x: 8, y: 10 }, rotation: 0,
      bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 0, highSpeedTransport: { enabled: false, minimumDistance: 0 } },
    });
    const network = source.blueprint.logisticsNetworks[0]!;
    network.dispatch = "fifo";
    network.stations[0]!.slots[0]!.capacity = 20;
    network.stations.push({ device: "station-peer", fleet: { deviceAsset: "logistics-drone", count: 0 }, slots: [{ resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10 }] });
    source.scenario.initialBuffers!["station-supply"]!.storage!["iron-ore"] = 20;
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 7_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart").map((event) => event.transit.to)).toEqual([
      "station-demand", "station-demand",
    ]);
  });

  test("local belts take replenishment headroom first and may fill beyond the remote demand target", async () => {
    const source = await stationProjectSource();
    source.blueprint.logisticsNetworks[0]!.stations[1]!.slots[0] = {
      resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10, demandTarget: 10,
    };
    source.blueprint.devices.push({ id: "local-source", asset: "buffer", region: "forge-zone", position: { x: 11, y: 11 }, rotation: 0, bufferFilters: { storage: ["iron-ore"] } });
    setTestConnections(source, [{
      id: "local-to-station", from: { device: "local-source", port: "output" }, to: { device: "station-demand", port: "input" },
      resources: ["iron-ore"],
      path: [{ x: 12, y: 11 }, { x: 13, y: 11 }],
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.scenario.initialBuffers = {
      "station-supply": { storage: { "iron-ore": 25 } },
      "local-source": { storage: { "iron-ore": 20 } },
      "generator-1": { fuel: { coal: 1 } },
    };
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 10_000 });
    expect(result.events.filter((event) => event.type === "logistics.depart")).toHaveLength(0);
    expect(result.state.devices["station-demand"]!.buffers.storage).toEqual({ "iron-ore": 20 });
    expect(result.state.devices["local-source"]!.buffers.storage).toEqual({});
    expect(result.state.devices["station-supply"]!.buffers.storage).toEqual({ "iron-ore": 25 });
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
    const source = await loaded(); source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1" && device.id !== "storage-forge");
    removeTestConnections(source, (connection) => connection.to.device === "generator-1" || connection.from.device === "generator-1");
    delete source.scenario.initialBuffers?.["generator-1"];
    const result = runUntil(compileFactoryProject(source), undefined, { seed: 42, untilTick: 10_000 });
    expect(result.events.some((event) => event.type === "power.shortage" && event.grid === null)).toBeTrue();
    expect(result.state.devices["ore-source-1"]!.status).toBe("unpowered");
  });

  test("connected idle Devices consume their standby envelope while waiting for input", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "accumulator-1");
    source.scenario.initialBuffers = {};
    source.scenario.initialEnergyMilliJoules = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 2_000 });
    const grid = Object.values(result.metrics.powerGrids)[0]!;
    expect(result.state.devices["smelter-1"]!.status).toBe("waiting-input");
    expect(result.state.devices["smelter-1"]!.idlePowered).toBeTrue();
    expect(result.state.energy.consumedMilliJoules).toBe(20_000);
    expect(grid.demandMilliJoules).toBe(20_000);
    expect(grid.servedMilliJoules).toBe(20_000);
  });

  test("integrates regional time-of-use electricity and peak-demand charges at exact boundaries", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.blueprint.devices = source.blueprint.devices.filter((device) => ["smelter-1", "wind-1"].includes(device.id));
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 500_000 };
    source.scenario.durationTicks = 4_000;
    source.scenario.initialBuffers = { "smelter-1": { input: { "iron-ore": 2 } } };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [];
    source.scenario.electricityTariffs = [{
      region: "forge-zone", periodTicks: 4_000,
      points: [
        { atTick: 0, energyPriceMicroCurrencyPerKiloWattHour: 1_000_000 },
        { atTick: 2_000, energyPriceMicroCurrencyPerKiloWattHour: 2_000_000 },
      ],
      demandChargeMicroCurrencyPerKiloWatt: 10_000_000,
    }];
    source.objective.weights.electricityCost = 2;

    const result = runUntil(compileFactoryProject(source));
    expect(result.metrics.energyConsumedMilliJoules).toBe(720_000);
    expect(result.metrics.electricityCosts).toEqual(expect.objectContaining({
      energyChargeMicroCurrency: 300,
      demandChargeMicroCurrency: 1_800_000,
      totalMicroCurrency: 1_800_300,
    }));
    expect(result.metrics.electricityCosts.regions["forge-zone"]).toEqual(expect.objectContaining({
      energyConsumedMilliJoules: 720_000,
      peakDemandMilliWatts: 180_000,
      energyChargeMicroCurrency: 300,
      demandChargeMicroCurrency: 1_800_000,
    }));
    expect(result.metrics.scoreBreakdown.electricityCost).toBeCloseTo(-3.6006, 8);
    expect(result.events.filter((event) => event.type === "power.electricity-price-changed")
      .map((event) => [event.tick, event.energyPriceMicroCurrencyPerKiloWattHour])).toEqual([
        [0, 1_000_000], [2_000, 2_000_000], [4_000, 1_000_000],
      ]);

    const regional = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    regional.blueprint.policies.powerAllocation = "proportional";
    regional.blueprint.devices = regional.blueprint.devices.filter((device) => ["smelter-1", "wind-1"].includes(device.id));
    const firstSmelter = regional.blueprint.devices.find((device) => device.id === "smelter-1")!;
    const firstWind = regional.blueprint.devices.find((device) => device.id === "wind-1")!;
    firstSmelter.position = { x: 4, y: 4 };
    firstWind.position = { x: 1, y: 1 };
    regional.blueprint.devices.push(
      { ...structuredClone(firstSmelter), id: "smelter-2", position: { x: 15, y: 18 } },
      { ...structuredClone(firstWind), id: "wind-2", position: { x: 18, y: 21 } },
    );
    regional.blueprint.connections = [];
    regional.blueprint.logisticsNetworks = [];
    regional.deviceAssets["wind-turbine"]!.power.distribution = { connectionRange: 4, coverageRange: 5 };
    regional.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 500_000 };
    regional.scenario.durationTicks = 4_000;
    regional.scenario.initialBuffers = {
      "smelter-1": { input: { "iron-ore": 2 } },
      "smelter-2": { input: { "iron-ore": 2 } },
    };
    regional.scenario.initialEnergyMilliJoules = {};
    regional.scenario.renewableProfiles = [];
    regional.scenario.electricityTariffs = [{
      region: "forge-zone", periodTicks: 4_000,
      points: [{ atTick: 0, energyPriceMicroCurrencyPerKiloWattHour: 1_000_000 }],
      demandChargeMicroCurrencyPerKiloWatt: 10_000_000,
    }];
    const aggregate = runUntil(compileFactoryProject(regional));
    expect(Object.keys(aggregate.metrics.powerGrids)).toHaveLength(2);
    expect(aggregate.metrics.electricityCosts.regions["forge-zone"]).toEqual(expect.objectContaining({
      energyConsumedMilliJoules: 1_440_000,
      peakDemandMilliWatts: 360_000,
      demandChargeMicroCurrency: 3_600_000,
    }));

    regional.deviceAssets["wind-turbine"]!.power.generation.outputMilliWatts = 90_000;
    const shortage = runUntil(compileFactoryProject(regional));
    expect(shortage.metrics.electricityCosts.regions["forge-zone"]).toEqual(expect.objectContaining({
      energyConsumedMilliJoules: 720_000,
      peakDemandMilliWatts: 180_000,
      demandChargeMicroCurrency: 1_800_000,
    }));

    source.scenario.electricityTariffs = [
      { ...source.scenario.electricityTariffs[0]!, points: [{ atTick: 1, energyPriceMicroCurrencyPerKiloWattHour: 1 }] },
      { ...source.scenario.electricityTariffs[0]! },
    ];
    const codes = issueCodes(() => compileFactoryProject(source));
    expect(codes).toContain("power.electricity-tariff-origin");
    expect(codes).toContain("power.electricity-tariff-overlap");
  });

  test("Blueprint idle-energy control sleeps across a production gap and pays exact wake work", async () => {
    const energySource = async () => {
      const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
      source.deviceAssets.smelter!.power.sleep = {
        idleMilliWatts: 1_000, wakeDurationTicks: 3_000, wakePowerMilliWatts: 10_000,
      };
      const smelter = source.blueprint.devices.find((device) => device.id === "smelter-1")!;
      smelter.policy = { ...smelter.policy, idleEnergy: { sleepAfterTicks: 2_000 } };
      source.blueprint.devices = source.blueprint.devices.filter((device) => ["smelter-1", "wind-1"].includes(device.id));
      source.blueprint.connections = [];
      source.blueprint.logisticsNetworks = [];
      source.scenario.durationTicks = 20_000;
      source.scenario.initialBuffers = { "smelter-1": { input: { "iron-ore": 2 } } };
      source.scenario.materialDeliveries = [{
        id: "second-shift-ore", device: "smelter-1", buffer: "input",
        resource: "iron-ore", count: 2, releaseTick: 12_000,
      }];
      source.scenario.initialEnergyMilliJoules = {};
      source.scenario.failures = [];
      return source;
    };

    const source = await energySource();
    const result = runUntil(compileFactoryProject(source));
    expect(result.events.filter((event) => event.type === "device.sleep")).toEqual([
      expect.objectContaining({ tick: 6_000, device: "smelter-1", idleTicks: 2_000, idleMilliWatts: 1_000 }),
    ]);
    expect(result.events.filter((event) => event.type === "device.wake-start")).toEqual([
      expect.objectContaining({ tick: 12_000, device: "smelter-1", durationTicks: 3_000, powerMilliWatts: 10_000 }),
    ]);
    expect(result.events.filter((event) => event.type === "device.wake-finish")).toEqual([
      expect.objectContaining({ tick: 15_000, device: "smelter-1", durationTicks: 3_000, powerMilliWatts: 10_000 }),
    ]);
    expect(result.events.filter((event) => event.type === "device.finish").map((event) => event.tick)).toEqual([4_000, 19_000]);
    expect(result.metrics.equipmentEnergyManagement).toEqual(expect.objectContaining({
      totalSleeps: 1, totalWakeups: 1, totalSleepingTicks: 6_000, totalWakeTicks: 3_000,
    }));
    expect(result.metrics.equipmentEnergyManagement.devices["smelter-1"]).toEqual(expect.objectContaining({
      mode: "awake", sleeps: 1, wakeups: 1, sleepingTicks: 6_000, wakeTicks: 3_000,
    }));
    expect(result.metrics.sleepingTime["smelter-1"]).toBe(6_000);

    const alwaysHotSource = await energySource();
    delete alwaysHotSource.blueprint.devices.find((device) => device.id === "smelter-1")!.policy!.idleEnergy;
    const alwaysHot = runUntil(compileFactoryProject(alwaysHotSource));
    expect(result.metrics.energyConsumedMilliJoules).toBeLessThan(alwaysHot.metrics.energyConsumedMilliJoules);
    expect(alwaysHot.events.filter((event) => event.type.startsWith("device.wake") || event.type === "device.sleep")).toHaveLength(0);

    const interruptedSource = await energySource();
    interruptedSource.scenario.durationTicks = 23_000;
    interruptedSource.scenario.failures = [{ device: "smelter-1", atTick: 13_000, durationTicks: 1_000 }];
    const interrupted = runUntil(compileFactoryProject(interruptedSource));
    expect(interrupted.events.filter((event) => event.type === "device.wake-start").map((event) => event.tick)).toEqual([12_000, 14_000]);
    expect(interrupted.events).toContainEqual(expect.objectContaining({
      type: "device.wake-cancelled", tick: 13_000, device: "smelter-1", reason: "equipment-breakdown",
    }));
    expect(interrupted.events.filter((event) => event.type === "device.finish").map((event) => event.tick)).toEqual([4_000, 21_000]);

    const failedWhileIdleSource = await energySource();
    failedWhileIdleSource.scenario.failures = [{ device: "smelter-1", atTick: 5_000, durationTicks: 3_000 }];
    const failedWhileIdle = runUntil(compileFactoryProject(failedWhileIdleSource));
    expect(failedWhileIdle.events.filter((event) => event.type === "device.sleep").map((event) => event.tick)).toEqual([10_000]);
    expect(failedWhileIdle.events.filter((event) => event.type === "device.wake-start").map((event) => event.tick)).toEqual([12_000]);

    const unsupported = await energySource();
    delete unsupported.deviceAssets.smelter!.power.sleep;
    expect(issueCodes(() => compileFactoryProject(unsupported))).toContain("power.sleep-unsupported");
    const invalidAsset = await energySource();
    invalidAsset.deviceAssets.smelter!.power.sleep!.idleMilliWatts = invalidAsset.deviceAssets.smelter!.power.idleMilliWatts;
    expect(issueCodes(() => compileFactoryProject(invalidAsset))).toContain("power.sleep-not-lower");
  });

  test("active draw includes standby instead of adding it twice", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "accumulator-1");
    source.scenario.initialBuffers = { "smelter-1": { input: { "iron-ore": 2 } } };
    source.scenario.initialEnergyMilliJoules = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 4_000 });
    const grid = Object.values(result.metrics.powerGrids)[0]!;
    expect(result.events).toContainEqual(expect.objectContaining({ type: "device.start", tick: 0, device: "smelter-1" }));
    expect(result.state.energy.consumedMilliJoules).toBe(720_000);
    expect(grid.demandMilliJoules).toBe(720_000);
    expect(grid.peakDemandMilliWatts).toBe(180_000);
  });

  test("standby allocation sheds Devices deterministically when a grid cannot cover idle demand", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 15_000 };
    const smelter = source.blueprint.devices.find((device) => device.id === "smelter-1")!;
    source.blueprint.devices = [
      source.blueprint.devices.find((device) => device.id === "wind-1")!,
      { ...structuredClone(smelter), id: "a-smelter", position: { x: 5, y: 6 } },
      { ...structuredClone(smelter), id: "b-smelter", position: { x: 9, y: 6 } },
    ];
    source.scenario.initialBuffers = {};
    source.scenario.initialEnergyMilliJoules = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 2_000 });
    const grid = Object.values(result.metrics.powerGrids)[0]!;
    expect(result.state.devices["a-smelter"]!.status).toBe("waiting-input");
    expect(result.state.devices["b-smelter"]!.status).toBe("unpowered");
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "power.shortage", tick: 0, device: "b-smelter", requiredMilliWatts: 10_000, availableMilliWatts: 5_000,
    }));
    expect(grid.demandMilliJoules).toBe(40_000);
    expect(grid.servedMilliJoules).toBe(20_000);
    expect(grid.unservedMilliJoules).toBe(20_000);
  });

  test("authored power priority overrides Device-id order for standby allocation", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 15_000 };
    const smelter = source.blueprint.devices.find((device) => device.id === "smelter-1")!;
    source.blueprint.devices = [
      source.blueprint.devices.find((device) => device.id === "wind-1")!,
      { ...structuredClone(smelter), id: "a-smelter", position: { x: 5, y: 6 }, policy: { powerPriority: 0 } },
      { ...structuredClone(smelter), id: "b-smelter", position: { x: 9, y: 6 }, policy: { powerPriority: 10 } },
    ];
    source.scenario.initialBuffers = {};
    source.scenario.initialEnergyMilliJoules = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 100 });
    expect(result.state.devices["a-smelter"]!.status).toBe("unpowered");
    expect(result.state.devices["b-smelter"]!.status).toBe("waiting-input");
    expect(result.events).toContainEqual(expect.objectContaining({ type: "power.shortage", device: "a-smelter" }));
  });

  test("authored power priority reserves active capacity for the higher-ranked production job", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 180_000 };
    const smelter = source.blueprint.devices.find((device) => device.id === "smelter-1")!;
    source.blueprint.devices = [
      source.blueprint.devices.find((device) => device.id === "wind-1")!,
      { ...structuredClone(smelter), id: "a-smelter", position: { x: 5, y: 6 }, policy: { powerPriority: 0 } },
      { ...structuredClone(smelter), id: "b-smelter", position: { x: 9, y: 6 }, policy: { powerPriority: 10 } },
    ];
    source.scenario.initialBuffers = {
      "a-smelter": { input: { "iron-ore": 2 } },
      "b-smelter": { input: { "iron-ore": 2 } },
    };
    source.scenario.initialEnergyMilliJoules = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 3_999 });
    expect(result.state.devices["a-smelter"]!.status).toBe("unpowered");
    expect(result.state.devices["b-smelter"]!.status).toBe("processing");
    expect(result.events).toContainEqual(expect.objectContaining({ type: "device.start", device: "b-smelter", tick: 0 }));
    expect(result.events.some((event) => event.type === "device.start" && event.device === "a-smelter")).toBeFalse();
  });

  test("explicit sorter power priority preempts and resumes lower-ranked stage work", async () => {
    const source = await loaded();
    source.blueprint.policies = { ...source.blueprint.policies, powerAllocation: "priority-load-shedding" };
    source.deviceAssets.sorter!.power.idleMilliWatts = 500;
    source.deviceAssets.sorter!.power.activeMilliWatts = 10_000;
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 25_000 };
    source.blueprint.devices = [
      { id: "source-a", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target-a", asset: "buffer", region: "forge-zone", position: { x: 4, y: 0 }, rotation: 0 },
      { id: "source-b", asset: "buffer", region: "forge-zone", position: { x: 0, y: 4 }, rotation: 0 },
      { id: "target-b", asset: "buffer", region: "forge-zone", position: { x: 4, y: 4 }, rotation: 0 },
      { id: "wind", asset: "wind-turbine", region: "forge-zone", position: { x: 8, y: 8 }, rotation: 0 },
    ];
    setTestConnections(source, [
      {
        id: "lane-a", from: { device: "source-a", port: "output" }, to: { device: "target-a", port: "input" }, resources: ["iron-ore"],
        path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
        logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
      },
      {
        id: "lane-b", from: { device: "source-b", port: "output" }, to: { device: "target-b", port: "input" }, resources: ["iron-ore"],
        path: [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }],
        logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
      },
    ]);
    for (const device of source.blueprint.devices.filter((item) => item.transportEndpoint?.connection === "lane-b")) device.policy = { powerPriority: 10 };
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = {
      "source-a": { storage: { "iron-ore": 1 } },
      "source-b": { storage: { "iron-ore": 1 } },
    };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [{
      region: "forge-zone", asset: "wind-turbine", periodTicks: 2_000,
      points: [{ atTick: 0, outputPermille: 1_000 }, { atTick: 50, outputPermille: 416 }, { atTick: 150, outputPermille: 1_000 }],
    }];
    source.scenario.failures = [];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 2_000 });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "transport.power-shortage", tick: 50, connection: "lane-a", stage: "loader", device: "lane-a-loader",
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "transport.power-restored", tick: 150, connection: "lane-a", stage: "loader", device: "lane-a-loader",
    }));
    expect(result.events.find((event) => event.type === "resource.arrive")?.connection).toBe("lane-b");
    expect(result.state.devices["lane-a-loader"]!.status).not.toBe("failed");
  });

  test("proportional grid satisfaction slows every production job instead of shedding one", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.blueprint.policies = { ...source.blueprint.policies, powerAllocation: "proportional" };
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 180_000 };
    const smelter = source.blueprint.devices.find((device) => device.id === "smelter-1")!;
    source.blueprint.devices = [
      source.blueprint.devices.find((device) => device.id === "wind-1")!,
      { ...structuredClone(smelter), id: "smelter-a", position: { x: 5, y: 6 } },
      { ...structuredClone(smelter), id: "smelter-b", position: { x: 9, y: 6 } },
    ];
    source.scenario.initialBuffers = {
      "smelter-a": { input: { "iron-ore": 2 } },
      "smelter-b": { input: { "iron-ore": 2 } },
    };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 8_000 });
    expect(result.events.filter((event) => event.type === "device.finish").map((event) => [event.tick, event.device])).toEqual([
      [8_000, "smelter-a"], [8_000, "smelter-b"],
    ]);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "power.satisfaction-changed", tick: 0, demandMilliWatts: 360_000, availableMilliWatts: 180_000, satisfactionPpm: 500_000,
    }));
    const grid = Object.values(result.metrics.powerGrids)[0]!;
    expect(grid.averageSatisfactionPpm).toBe(500_000);
    expect(grid.minimumSatisfactionPpm).toBe(500_000);
    expect(grid.demandMilliJoules).toBe(2_880_000);
    expect(grid.servedMilliJoules).toBe(1_440_000);
  });

  test("proportional work is checkpointed exactly across a renewable generation boundary", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.blueprint.policies = { ...source.blueprint.policies, powerAllocation: "proportional" };
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "accumulator-1");
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 180_000 };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [{
      region: "forge-zone", asset: "wind-turbine", periodTicks: 10_000,
      points: [{ atTick: 0, outputPermille: 1_000 }, { atTick: 2_000, outputPermille: 500 }],
    }];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 6_000 });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "power.satisfaction-changed", tick: 2_000, demandMilliWatts: 180_000, availableMilliWatts: 90_000, satisfactionPpm: 500_000,
    }));
    expect(result.events.find((event) => event.type === "device.finish")).toEqual(expect.objectContaining({ tick: 6_000, device: "smelter-1" }));
    expect(result.state.devices["smelter-1"]!.buffers.output).toEqual({ "iron-plate": 1 });
  });

  test("proportional grid satisfaction stretches explicit sorter loading and unloading", async () => {
    const source = await loaded();
    source.blueprint.policies = { ...source.blueprint.policies, powerAllocation: "proportional" };
    source.deviceAssets.sorter!.power.idleMilliWatts = 0;
    source.deviceAssets.sorter!.power.activeMilliWatts = 10_000;
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 5_000 };
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-zone", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-zone", position: { x: 4, y: 0 }, rotation: 0 },
      { id: "wind", asset: "wind-turbine", region: "forge-zone", position: { x: 8, y: 8 }, rotation: 0 },
    ];
    setTestConnections(source, [{
      id: "scaled-lane", from: { device: "source", port: "output" }, to: { device: "target", port: "input" }, resources: ["iron-ore"],
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { "iron-ore": 1 } } };
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.renewableProfiles = [];
    source.scenario.failures = [];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 1_300 });
    expect(result.events.filter((event) => event.type === "transport.stage-finish").map((event) => [event.tick, event.stage])).toEqual([
      [500, "loader"], [1_300, "unloader"],
    ]);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "resource.unload-start", tick: 800 }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: "resource.arrive", tick: 1_300 }));
    expect(result.events.filter((event) => event.type === "power.satisfaction-changed" && event.satisfactionPpm === 500_000)).toHaveLength(2);
  });

  test("renewable surplus charges grid storage continuously", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "smelter-1");
    source.scenario.initialBuffers = {};
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 2_000 });
    const grid = result.metrics.energyStorage["grid-forge-zone-accumulator-1"]!;
    expect(grid).toEqual({
      initialMilliJoules: 0, storedMilliJoules: 800_000, capacityMilliJoules: 3_600_000,
      chargedMilliJoules: 800_000, dischargedMilliJoules: 0,
    });
    expect(result.state.devices["accumulator-1"]!.energyStorage!.storedMilliJoules).toBe(800_000);
  });

  test("periodic renewable output wakes the event loop and records exact grid deficit envelopes", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.scenario.durationTicks = 12_000;
    source.scenario.renewableProfiles = [{ region: "forge-zone", asset: "wind-turbine", periodTicks: 8_000, points: [{ atTick: 0, outputPermille: 1000 }, { atTick: 4_000, outputPermille: 0 }] }];
    const result = runUntil(compileFactoryProject(source));
    expect(result.events.filter((event) => event.type === "power.generation-changed").map((event) => [event.tick, event.outputMilliWatts])).toEqual([
      [0, 600_000], [4_000, 0], [8_000, 600_000], [12_000, 0],
    ]);
    const grid = result.metrics.powerGrids["grid-forge-zone-accumulator-1"]!;
    expect(grid.generatedMilliJoules).toBe(4_800_000);
    expect(grid.peakDeficitMilliWatts).toBe(180_000);
    expect(grid.requiredStorageCapacityMilliJoules).toBe(720_000);
    expect(grid.unservedMilliJoules).toBe(0);
  });

  test("storage depletion pauses an active Device job without refunding its inputs", async () => {
    const result = runUntil(compileFactoryProject(await accumulatorProjectSource()), undefined, { untilTick: 10_000 });
    const smelter = result.state.devices["smelter-1"]!;
    expect(result.metrics.produced["iron-plate"]).toBe(1);
    expect(smelter.buffers.input).toEqual({});
    expect(smelter.status).toBe("unpowered");
    expect(smelter.activeJob).toEqual(expect.objectContaining({ remainingTicks: 3_500, workedTicks: 500 }));
    expect(smelter.progressTicks).toBe(500);
    expect(result.metrics.energyStorage["grid-forge-zone-accumulator-1"]).toEqual(expect.objectContaining({
      storedMilliJoules: 0, dischargedMilliJoules: 810_000,
    }));
    expect(result.metrics.unpoweredTime["smelter-1"]).toBe(5_500);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "power.storage-depleted", tick: 4_500, device: "accumulator-1" }),
      expect.objectContaining({ type: "power.shortage", tick: 4_500, device: "smelter-1" }),
    ]));
  });

  test("restored generation resumes the exact remaining Device work", async () => {
    const source = await accumulatorProjectSource({ wind: true });
    source.scenario.failures = [{ device: "wind-1", atTick: 0, durationTicks: 6_000 }];
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 10_000 });
    expect(result.metrics.produced["iron-plate"]).toBe(2);
    expect(result.metrics.unpoweredTime["smelter-1"]).toBe(1_500);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "power.storage-depleted", tick: 4_500, device: "accumulator-1" }),
      expect.objectContaining({ type: "power.restored", tick: 6_000, device: "smelter-1", remainingTicks: 3_500 }),
      expect.objectContaining({ type: "device.finish", tick: 9_500, device: "smelter-1" }),
    ]));
    expect(result.metrics.energyStorage["grid-forge-zone-accumulator-1"]).toEqual(expect.objectContaining({
      storedMilliJoules: 1_600_000, chargedMilliJoules: 1_600_000, dischargedMilliJoules: 810_000,
    }));
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
    setTestConnections(source, [{
      id: "ore-to-buffer", from: { device: "ore-source-1", port: "output" }, to: { device: "buffer-1", port: "input" },
      resources: ["iron-ore"],
      path: Array.from({ length: 6 }, (_, index) => ({ x: index + 4, y: 10 })),
      logistics: { loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter", distance: 1 } },
    }]);
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "generator-1": { fuel: { coal: 1 } } };
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
    source.blueprint.devices.find((device) => device.id === "generator-1")!.region = "assembly-zone";
    source.blueprint.devices.find((device) => device.id === "generator-1")!.position = { x: 4, y: 3 };
    delete source.blueprint.devices.find((device) => device.id === "assembler-1")!.recipe;
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.durationTicks = 1000;
    source.scenario.initialBuffers = {
      "assembler-1": { "ore-input": { "iron-ore": 1 }, "plate-input": { "iron-plate": 1 } },
      "generator-1": { fuel: { coal: 1 } },
    };
    const result = runUntil(compileFactoryProject(source), undefined, { untilTick: 1000 });
    expect(result.metrics.produced.gear).toBe(1);
    expect(result.metrics.produced["iron-plate"]).toBe(1);
  });

  test("productive mode compiles and executes one exact powered physical job", async () => {
    const source = await loaded();
    const assembler = source.blueprint.devices.find((device) => device.id === "assembler-1")!;
    assembler.recipe!.mode = "productive";
    source.blueprint.devices = source.blueprint.devices.filter((device) => device.id === "assembler-1" || device.id === "generator-2");
    source.blueprint.connections = [];
    source.blueprint.logisticsNetworks = [];
    source.scenario.durationTicks = 3100;
    source.scenario.initialBuffers = {
      "assembler-1": { "input-primary": { "iron-plate": 2 }, "input-secondary": { coal: 1 } },
      "generator-2": { fuel: { coal: 1 } },
    };
    source.scenario.initialTreatments = [
      { device: "assembler-1", buffer: "input-primary", resource: "iron-plate", level: 2, count: 2 },
      { device: "assembler-1", buffer: "input-secondary", resource: "coal", level: 2, count: 1 },
    ];
    const project = compileFactoryProject(source);
    expect(project.devices["assembler-1"]!.processPlan).toEqual(expect.objectContaining({
      durationTicks: 3000, powerMilliWatts: 330000,
      inputs: [
        { buffer: "input-primary", resource: "iron-plate", count: 2, minimumTreatmentLevel: 2 },
        { buffer: "input-secondary", resource: "coal", count: 1, minimumTreatmentLevel: 2 },
      ],
      outputs: [{ buffer: "output", resource: "gear", count: 2, treatmentLevel: 0 }],
    }));
    const result = runUntil(project);
    expect(result.metrics.produced.gear).toBe(2);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "device.start", device: "assembler-1", durationTicks: 3000 }));

    source.deviceAssets.assembler!.program = {
      apiVersion: 1,
      evaluate: (context) => context.process ? {
        kind: "start", operation: context.process.id, durationTicks: context.process.durationTicks,
        consume: [...context.process.inputs], produce: [...context.process.outputs], powerMilliWatts: context.process.powerMilliWatts - 1,
      } : { kind: "wait", reason: "idle" },
    } satisfies DeviceProgram;
    expect(() => runUntil(compileFactoryProject(source))).toThrow("must execute compiled process 'assemble-gear' mode 'productive' exactly");
  });

  test("treated material keeps its level across a physical belt and unlocks a productive recipe", async () => {
    const source = await loaded();
    source.blueprint = {
      version: 1,
      devices: [
        {
          id: "coater-1", asset: "spray-coater", region: "assembly-zone", position: { x: 5, y: 10 }, rotation: 0,
          treatment: { mode: "mk2" },
          bufferFilters: { "material-input": ["iron-plate"], "material-output": ["iron-plate"], "agent-input": ["proliferator"] },
        },
        {
          id: "assembler-1", asset: "assembler", region: "assembly-zone", position: { x: 14, y: 10 }, rotation: 0,
          recipe: { process: "assemble-gear", mode: "productive", inputs: { "iron-plate": "input-primary", coal: "input-secondary" }, outputs: { gear: "output" } },
        },
        { id: "wind-1", asset: "wind-turbine", region: "assembly-zone", position: { x: 10, y: 3 }, rotation: 0 },
      ],
      connections: [], logisticsNetworks: [], policies: { dispatch: "shortage-first", powerAllocation: "proportional" },
    };
    const connection: TestConnectionSpec = {
      id: "coated-plate-to-assembler",
      from: { device: "coater-1", port: "material-output" },
      to: { device: "assembler-1", port: "input-primary" },
      resources: ["iron-plate"], path: [],
      logistics: {
        loader: { deviceAsset: "sorter", distance: 1 }, line: { deviceAsset: "conveyor" },
        unloader: { deviceAsset: "sorter", distance: 1 },
      },
    };
    connection.path = findBlueprintConnectionPath(source.blueprint, source.world, source.deviceAssets, connection)!;
    setTestConnections(source, [connection]);
    source.scenario.durationTicks = 5_000;
    source.scenario.initialBuffers = {
      "coater-1": { "material-input": { "iron-plate": 8 }, "agent-input": { proliferator: 1 } },
      "assembler-1": { "input-secondary": { coal: 1 } },
    };
    source.scenario.initialTreatments = [
      { device: "assembler-1", buffer: "input-secondary", resource: "coal", level: 2, count: 1 },
    ];
    source.scenario.initialEnergyMilliJoules = {};
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.devices["coater-1"]!.treatmentPlan).toEqual(expect.objectContaining({ mode: expect.objectContaining({ id: "mk2", level: 2 }) }));
    const result = runUntil(project);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "device.start", device: "coater-1", operation: "mk2" }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "material.treated", device: "coater-1", resource: "iron-plate", count: 4, fromLevel: 0, toLevel: 2,
      agentResource: "proliferator", agentCount: 1,
    }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: "resource.depart", transit: expect.objectContaining({ resource: "iron-plate", treatmentLevel: 2 }) }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: "device.start", device: "assembler-1", operation: "assemble-gear" }));
    expect(result.metrics.produced.gear).toBe(2);
    expect(result.metrics.materialTreatment).toEqual({ treated: { "iron-plate": { "2": 4 } }, agentsConsumed: { proliferator: 1 } });
    expect(result.state.devices["assembler-1"]!.materialBatches.output!.gear).toEqual({ "0": 2 });
  });

  test("failure scenarios break and recover devices deterministically", async () => {
    const project = await openFactoryProject(ironworks, { scenario: "machine-failure" }); const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "device.breakdown")).toBeTrue();
    expect(result.events.some((event) => event.type === "device.recover")).toBeTrue();
  });
});

describe("research boundary and experiment decisions", () => {
  test("authors ranked dedicated-tool Blueprints from a shared work center", async () => {
    const source = await loadFactoryProject(memoryFab, {
      blueprint: "tool-search-seed", world: "cleanroom", scenario: "steady-production", objective: "dram-output",
    });
    const project = compileFactoryProject(source);
    const candidates = specializeSharedWorkCenterCandidates(project, project.blueprint, {
      device: "lithography-1", process: "pattern-cell-layer-2", cloneId: "lithography-2",
    }, 2);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.transportCells).toBeLessThanOrEqual(candidates[1]!.transportCells);
    expect(candidates[0]!.patch.length).toBeGreaterThan(0);
    const patched = applyResearchPatch(project.blueprint, candidates[0]!.patch);
    const specialized = compileFactoryProject({ ...source, blueprint: patched });
    expect(specialized.devices["lithography-1"]!.processPlans.map((plan) => plan.definition.id)).toEqual(["pattern-cell-layer-1"]);
    expect(specialized.devices["lithography-2"]!.processPlans.map((plan) => plan.definition.id)).toEqual(["pattern-cell-layer-2"]);
    expect(specialized.connections["batch-furnace-to-lithography"]!.to.device).toBe("lithography-2");
    expect(specialized.connections["lithography-to-etch"]!.resources).toEqual(["patterned-cell-l1-lot"]);
    const layerTwo = Object.values(specialized.connections).find((connection) => connection.resources.includes("patterned-cell-l2-lot"));
    expect(layerTwo?.from.device).toBe("lithography-2");
    expect(layerTwo?.path.length).toBeGreaterThan(0);
    const endpointOwners = patched.devices.filter((device) => device.transportEndpoint)
      .map((device) => `${device.transportEndpoint!.connection}/${device.transportEndpoint!.stage}`);
    expect(new Set(endpointOwners).size).toBe(endpointOwners.length);
    const etchCandidates = specializeSharedWorkCenterCandidates(specialized, specialized.blueprint, {
      device: "etch-1", process: "etch-cell-layer-2", cloneId: "etch-2",
    }, 1);
    expect(etchCandidates).toHaveLength(1);
    const dedicatedLayerTwo = etchCandidates[0]!.blueprint.connections.find((connection) => connection.resources.includes("patterned-cell-l2-lot"));
    expect(dedicatedLayerTwo?.path.some((cell) => (cell.level ?? 0) > 0)).toBeTrue();
    expect(etchCandidates[0]!.blueprint.devices.filter((device) => device.transportEndpoint)
      .every((device) => !("level" in device.position))).toBeTrue();
  }, 20_000);

  test("authors explicit parallel work-center topology and lets the Objective reject unaffordable capacity", async () => {
    const source = await loadFactoryProject(memoryFab, {
      blueprint: "experiment", world: "cleanroom", scenario: "quality-excursion", objective: "dram-output",
    });
    const project = compileFactoryProject(source);
    const parallel = parallelizeWorkCenter(project, project.blueprint, { device: "inspection-1", cloneId: "inspection-2" });
    expect(parallel).not.toBeNull();
    expect(parallel).toEqual(expect.objectContaining({
      originalDevice: "inspection-1", parallelDevice: "inspection-2", addedBuildCost: 22_600, addedArea: 13,
    }));
    expect(parallel!.junctionDevices).toHaveLength(1);
    expect(stableStringify(applyResearchPatch(project.blueprint, parallel!.patch))).toBe(stableStringify(parallel!.blueprint));
    const candidate = compileFactoryProject({ ...source, blueprint: parallel!.blueprint });
    expect(candidate.devices["inspection-1"]!.processPlans[0]!.definition.id).toBe("inspect-final-pattern-deep");
    expect(candidate.devices["inspection-2"]!.processPlans[0]!.definition.id).toBe("inspect-final-pattern-deep");
    const dispatcher = parallel!.junctionDevices[0]!;
    expect(Object.values(candidate.connections).filter((connection) => connection.from.device === dispatcher)).toHaveLength(2);
    const endpointOwners = parallel!.blueprint.devices.filter((device) => device.transportEndpoint)
      .map((device) => `${device.transportEndpoint!.connection}/${device.transportEndpoint!.stage}`);
    expect(new Set(endpointOwners).size).toBe(endpointOwners.length);
    const result = runUntil(candidate, undefined, { seed: 42 });
    expect(result.metrics.routeFlow["dram-front-end"]).toEqual(expect.objectContaining({
      completed: 8, scrapped: 4, queueTimeViolations: 0, violatedLots: 0,
    }));
    expect(result.metrics.routeFlow["dram-front-end"]!.steps["final-inspection"]!.maximumQueueTicks).toBeLessThan(35_000);
    expect(result.metrics.infeasibleReason).toBe("build cost 240230 exceeds 230000");

    const hybrid = parallelizeWorkCenter(project, project.blueprint, {
      device: "inspection-1", cloneId: "inspection-2", cloneAsset: "rapid-metrology-cell", cloneProcess: "inspect-final-pattern-standard",
    });
    expect(hybrid).toEqual(expect.objectContaining({ addedBuildCost: 7_100, addedArea: 13 }));
    const hybridProject = compileFactoryProject({ ...source, blueprint: hybrid!.blueprint });
    expect(hybridProject.devices["inspection-1"]!.processPlans[0]!.definition.id).toBe("inspect-final-pattern-deep");
    expect(hybridProject.devices["inspection-2"]!.assetDef.id).toBe("rapid-metrology-cell");
    expect(hybridProject.devices["inspection-2"]!.processPlans[0]!.definition.id).toBe("inspect-final-pattern-standard");
    const illegalDeepClone = structuredClone(hybrid!.blueprint);
    illegalDeepClone.devices.find((device) => device.id === "inspection-2")!.recipe!.process = "inspect-final-pattern-deep";
    expect(issueCodes(() => compileFactoryProject({ ...source, blueprint: illegalDeepClone }))).toContain("production.process-qualification");
  }, 20_000);

  test("Blueprint comparison exposes an unfed treatment mode as a regression", async () => {
    const source = await loaded(); const before = compileFactoryProject(source);
    const candidate = structuredClone(source.blueprint); const assembler = candidate.devices.find((device) => device.id === "assembler-1");
    if (!assembler?.recipe) throw new Error("assembler-1 recipe missing from test fixture");
    assembler.recipe.mode = "accelerated";
    const after = compileFactoryProject({ ...source, blueprint: candidate });
    const comparison = compareFactoryBlueprints(before, after, { seed: 42, fromLabel: "main", toLabel: "accelerated" });

    expect(stableStringify(applyBlueprintPatch(before.blueprint, comparison.patch))).toBe(stableStringify(after.blueprint));
    expect(comparison.changes).toEqual([expect.objectContaining({ kind: "device", id: "assembler-1", action: "changed", fields: ["recipe.mode"] })]);
    expect(comparison.to.capacityPlan.processes.some((process) => process.mode === "accelerated")).toBeTrue();
    expect(comparison.to.capacityPlan.gaps.some((gap) => gap.kind === "treatment")).toBeTrue();
    expect(comparison.delta.score).toBeLessThan(0);
    expect(comparison.verdict).toBe("REGRESSED");
    expect(compareFactoryBlueprints(before, after, { seed: 42 }).delta).toEqual(comparison.delta);
  });

  test("Blueprint comparison rejects a benchmark or seed change", async () => {
    const baseline = await openFactoryProject(ironworks); const otherScenario = await openFactoryProject(ironworks, { scenario: "machine-failure" });
    expect(() => compareFactoryBlueprints(baseline, otherScenario)).toThrow("Scenario differs");
    expect(() => compareFactoryBlueprints(baseline, baseline, { seed: -1 })).toThrow("non-negative safe integer");
  });

  test("patches can optimize logistics networks but cannot edit world assets, scenarios, objectives, or regions", () => {
    expect(() => validateResearchPatch([{ op: "replace", path: "/logisticsNetworks/0/fleet/count", value: 2 }])).not.toThrow();
    for (const path of ["/assets/resources/iron-ore", "/assets/devices/smelter", "/scenarios/baseline", "/objectives/default", "/world/regions/0/bounds/width", "/resourceNodes/0/amount"]) {
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
    const proposal = await new ExternalCommandResearchAgent(command).propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history: [] });
    expect(proposal.hypothesis).toBe("Use FIFO"); expect(proposal.patch[0]!.path).toBe("/policies");
  });

  test("heuristic candidate improves the Ironworks score and is kept", async () => {
    const dir = await projectCopy(); const result = await researchFactory(dir, { iterations: 1, seed: 42, agent: new HeuristicResearchAgent() });
    expect(result.iterations[0]!.decision).toBe("KEEP"); expect(result.bestScore).toBeGreaterThan(result.baseline.score);
  });

  test("research writes the explicitly selected Blueprint instead of the project default", async () => {
    const dir = await projectCopy();
    const defaultPath = join(dir, "blueprints/main.blueprint.json");
    const selectedPath = join(dir, "blueprints/experiment.blueprint.json");
    await cp(defaultPath, selectedPath);
    const defaultBefore = await readFile(defaultPath, "utf8");
    const selectedBefore = await readFile(selectedPath, "utf8");
    const result = await researchFactory(dir, { blueprint: "experiment", iterations: 1, seed: 42, agent: new HeuristicResearchAgent() });
    expect(result.iterations[0]!.decision).toBe("KEEP");
    expect(await readFile(defaultPath, "utf8")).toBe(defaultBefore);
    expect(await readFile(selectedPath, "utf8")).not.toBe(selectedBefore);
  });

  test("heuristic strategies read diagnostics and do not immediately repeat experiment history", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const agent = new HeuristicResearchAgent();
    const base = { project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), capacityPlan: planProductionCapacity(project) };
    const first = await agent.propose({ iteration: 1, ...base, history: [] });
    expect(first.strategy).toBe("power:power-deficit:generator-1");
    const firstHistory = [{
      iteration: 1, strategy: first.strategy!, hypothesis: first.hypothesis, decision: "REVERT", score: result.metrics.finalScore, scoreDelta: -1,
    }] as const;
    const second = await agent.propose({ iteration: 2, ...base, history: [...firstHistory] });
    expect(second.strategy).toBe("generation:grid-forge-zone-generator-1:wind-turbine:+1");
    const third = await agent.propose({ iteration: 3, ...base, history: [...firstHistory, {
      iteration: 2, strategy: second.strategy!, hypothesis: second.hypothesis, decision: "REVERT", score: result.metrics.finalScore, scoreDelta: -1,
    }] });
    expect(third.strategy).toBe("recipe:assembler-1:forge-gear-pair:standard");
    const fourth = await agent.propose({ iteration: 4, ...base, history: [...firstHistory, {
      iteration: 2, strategy: second.strategy!, hypothesis: second.hypothesis, decision: "REVERT", score: result.metrics.finalScore, scoreDelta: -1,
    }, {
      iteration: 3, strategy: third.strategy!, hypothesis: third.hypothesis, decision: "REVERT", score: result.metrics.finalScore, scoreDelta: -1,
    }] });
    expect(fourth.strategy).toBe("capacity-plan:smelt-iron:1->2");
    expect(fourth.patch.some((operation) => operation.path === "/devices" || operation.path === "/connections")).toBeFalse();
    const candidate = compileFactoryProject({ ...await loaded(), blueprint: applyResearchPatch(project.blueprint, fourth.patch) });
    expect(candidate.devices["smelter-1-parallel"]).toBeDefined();
    expect(Object.values(candidate.devices).filter((device) => device.transportEndpoint).length)
      .toBe(candidate.blueprint.connections.length * 2);
  });

  test("heuristic strategy adds project-local generation for disconnected consumers", async () => {
    const source = await loaded(); source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1" && device.id !== "storage-forge");
    removeTestConnections(source, (connection) => connection.to.device === "generator-1" || connection.from.device === "generator-1");
    delete source.scenario.initialBuffers?.["generator-1"];
    const project = compileFactoryProject(source); const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history: [],
    });
    expect(proposal.strategy?.startsWith("power:power-disconnected:")).toBeTrue();
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(analyzeProduction(candidate).diagnostics.filter((diagnostic) => diagnostic.code === "power-disconnected")).toHaveLength(0);
  });

  test("heuristic research sizes project-local storage from measured intermittent-power deficits", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.scenario.durationTicks = 8_000;
    source.scenario.renewableProfiles = [{ region: "forge-zone", asset: "wind-turbine", periodTicks: 8_000, points: [{ atTick: 0, outputPermille: 1000 }, { atTick: 4_000, outputPermille: 0 }] }];
    source.objective.targetResource = "iron-plate"; source.objective.targetRegion = "forge-zone"; source.objective.targetRatePerMinute = 1;
    source.deviceAssets.accumulator!.power.storage = { capacityMilliJoules: 200_000, chargeMilliWatts: 100_000, dischargeMilliWatts: 100_000 };
    const project = compileFactoryProject(source); const result = runUntil(project);
    const measured = result.metrics.powerGrids["grid-forge-zone-accumulator-1"]!;
    expect(measured.unservedMilliJoules).toBeGreaterThan(0);
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics,
      production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history: [],
    });
    expect(proposal.strategy).toBe("storage:grid-forge-zone-accumulator-1:1->4");
    expect(proposal.patch).toHaveLength(3);
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(Object.values(candidate.devices).filter((device) => device.storagePlan)).toHaveLength(4);
    expect(runUntil(candidate).metrics.powerGrids["grid-forge-zone-accumulator-1"]!.unservedMilliJoules).toBe(0);
  });

  test("heuristic research expands profiled generation when the Scenario lacks total energy", async () => {
    const source = await accumulatorProjectSource({ wind: true, initialEnergyMilliJoules: 0 });
    source.scenario.durationTicks = 8_000;
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 200_000 };
    source.scenario.renewableProfiles = [{
      region: "forge-zone", asset: "wind-turbine", periodTicks: 8_000,
      points: [{ atTick: 0, outputPermille: 1000 }, { atTick: 2_000, outputPermille: 800 }],
    }];
    source.objective.targetResource = "iron-plate"; source.objective.targetRegion = "forge-zone"; source.objective.targetRatePerMinute = 1;
    const project = compileFactoryProject(source); const result = runUntil(project);
    const measured = result.metrics.powerGrids["grid-forge-zone-accumulator-1"]!;
    expect(measured.generatedMilliJoules).toBeLessThan(measured.demandMilliJoules);
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics,
      production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history: [],
    });
    expect(proposal.strategy).toBe("generation:grid-forge-zone-accumulator-1:wind-turbine:+1");
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(candidate.scenario.renewableProfiles).toEqual(source.scenario.renewableProfiles);
    const candidateGrid = candidate.devices["accumulator-1"]!.powerGrid!;
    expect(runUntil(candidate).metrics.powerGrids[candidateGrid]!.unservedMilliJoules).toBe(0);
  });

  test("heuristic logistics strategy upgrades every tied bottleneck stage together", async () => {
    const source = await loaded();
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 2_000_000 };
    const sorter = source.deviceAssets.sorter!;
    sorter.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 5_000 }) };
    source.deviceAssets["fast-sorter"] = {
      ...sorter, id: "fast-sorter", name: "Fast Sorter",
      program: { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 100 }) },
    };
    const project = compileFactoryProject(source); const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const analysis = analyzeProduction(project);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "input-logistics")).toBeTrue();
    const proposal = await new HeuristicResearchAgent().propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analysis, capacityPlan: planProductionCapacity(project), history: [] });
    expect(proposal.strategy?.startsWith("logistics:ore-to-smelter:")).toBeTrue();
    expect(proposal.patch).toHaveLength(2);
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(candidate.connections["ore-to-smelter"]!.dispatchIntervalTicks).toBeLessThan(project.connections["ore-to-smelter"]!.dispatchIntervalTicks);
  });

  test("heuristic logistics strategy can act on measured saturation without a static logistics diagnostic", async () => {
    const source = await loaded();
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 2_000_000 };
    const sorter = source.deviceAssets.sorter!;
    sorter.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 5_000 }) };
    const project = compileFactoryProject(source);
    const result = runUntil(project, undefined, { seed: 42 });
    const analysis = analyzeProduction(project);
    const withoutStaticLogistics = {
      ...analysis,
      diagnostics: analysis.diagnostics.filter((diagnostic) => diagnostic.code !== "input-logistics" && diagnostic.code !== "output-logistics"),
    };
    expect(Object.values(result.metrics.transportFlows).some((flow) => flow.utilization >= 0.7)).toBeTrue();
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: withoutStaticLogistics, capacityPlan: planProductionCapacity(project), history: [],
    });
    expect(proposal.strategy?.startsWith("logistics:")).toBeTrue();
    expect(proposal.strategy).toContain("stack-sorter");
    expect(proposal.hypothesis).toContain("simulation delivered");
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    const connection = proposal.strategy!.split(":")[1]!;
    expect(candidate.connections[connection]!.dispatchIntervalTicks).toBeLessThan(project.connections[connection]!.dispatchIntervalTicks);
    expect(candidate.connections[connection]!.maxStackSize).toBe(4);
    expect(candidate.connections[connection]!.maxStackSize / candidate.connections[connection]!.dispatchIntervalTicks)
      .toBeGreaterThan(project.connections[connection]!.maxStackSize / project.connections[connection]!.dispatchIntervalTicks);
  });

  test("heuristic station strategy expands a statically undersized station-owned fleet", async () => {
    const source = await loaded();
    delete source.deviceAssets["line-haul-carrier"]!.logistics!.highSpeedMission;
    source.deviceAssets["line-haul-carrier"]!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 3, durationTicks: 180_000 }),
    };
    source.deviceAssets["line-haul-carrier"]!.logistics!.missionEnergy = { baseMilliJoules: 0, milliJoulesPerDistance: 1 };
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 2_000_000 };
    const project = compileFactoryProject(source);
    const analysis = analyzeProduction(project);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "station-fleet-deficit")).toBeTrue();
    const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const proposal = await new HeuristicResearchAgent().propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analysis, capacityPlan: planProductionCapacity(project), history: [] });
    expect(proposal.strategy).toBe("station-fleet:inter-zone-main:station-supply:80");
    expect(proposal.patch).toEqual([{ op: "replace", path: "/logisticsNetworks/0/stations/0/fleet/count", value: 80 }]);
  });

  test("heuristic station strategy enables high-speed line haul only when its energy trade improves capacity", async () => {
    const source = await loaded();
    source.deviceAssets["line-haul-carrier"]!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 20, durationTicks: 120_000 }),
    };
    source.deviceAssets["line-haul-carrier"]!.logistics!.missionEnergy = { baseMilliJoules: 100_000, milliJoulesPerDistance: 1_000 };
    source.deviceAssets["line-haul-carrier"]!.logistics!.highSpeedMission = {
      durationMultiplier: { numerator: 1, denominator: 4 },
      energyMultiplier: { numerator: 2, denominator: 1 },
    };
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 2_000_000 };
    const project = compileFactoryProject(source);
    const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics,
      production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history: [],
    });
    expect(proposal.strategy).toContain("station-high-speed:station-supply:inter-zone-main");
    expect(proposal.patch).toEqual([{ op: "replace", path: expect.stringMatching(/^\/devices\/\d+\/policy\/highSpeedTransport$/), value: { enabled: true, minimumDistance: 88 } }]);
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(candidate.logisticsNetworks["inter-zone-main"]!.routes[0]!.highSpeed?.enabled).toBeTrue();
    expect(candidate.logisticsNetworks["inter-zone-main"]!.routes[0]!.travelTicks).toBe(30_000);
  });

  test("heuristic research can isolate home-fleet dispatch policy from the factory default", async () => {
    const source = await stationProjectSource();
    source.objective.targetResource = "iron-ore";
    source.objective.targetRegion = "forge-zone";
    source.objective.targetRatePerMinute = 1;
    source.deviceAssets.generator!.power.generation = { ...source.deviceAssets.generator!.power.generation!, outputMilliWatts: 2_000_000 };
    source.blueprint.devices.push({
      id: "station-peer", asset: "logistics-station", region: "forge-zone", position: { x: 8, y: 10 }, rotation: 0,
      bufferFilters: { storage: ["iron-ore"] }, policy: { stationChargeMilliWatts: 0, highSpeedTransport: { enabled: false, minimumDistance: 0 } },
    });
    const network = source.blueprint.logisticsNetworks[0]!;
    network.dispatch = "shortage-first";
    network.stations.push({ device: "station-peer", fleet: { deviceAsset: "logistics-drone", count: 0 }, slots: [{ resource: "iron-ore", mode: "demand", capacity: 20, minimumBatch: 10 }] });
    const project = compileFactoryProject(source);
    const result = runUntil(project, undefined, { seed: 42, untilTick: 1_000 });
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 2, project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), capacityPlan: planProductionCapacity(project),
      history: [{ iteration: 1, strategy: "dispatch:fifo", hypothesis: "already tested", decision: "REVERT", score: result.metrics.finalScore, scoreDelta: 0 }],
    });
    expect(proposal.strategy).toBe("station-dispatch:local-main:fifo");
    expect(proposal.patch).toEqual([{ op: "replace", path: "/logisticsNetworks/0/dispatch", value: "fifo" }]);
  });

  test("worse valid candidate is reverted", async () => {
    const agent: BlueprintResearchAgent = { async propose(input) {
      const index = input.blueprint.connections.findIndex((connection) => connection.id === "gear-to-output");
      const endpointIndexes = input.blueprint.devices.map((device, deviceIndex) => ({ device, deviceIndex }))
        .filter(({ device }) => device.transportEndpoint?.connection === "gear-to-output")
        .map(({ deviceIndex }) => deviceIndex).sort((left, right) => right - left);
      return { hypothesis: "Remove finished-goods delivery", patch: [
        ...endpointIndexes.map((deviceIndex) => ({ op: "remove" as const, path: `/devices/${deviceIndex}` })),
        { op: "remove", path: `/connections/${index}` },
      ] };
    } };
    const dir = await projectCopy(); const result = await researchFactory(dir, { iterations: 1, seed: 42, agent });
    expect(result.iterations[0]!.decision).toBe("REVERT"); expect(result.bestScore).toBe(result.baseline.score);
  });
});

describe("coding-agent Blueprint benchmarks", () => {
  test("scores one editable file against locked fixed-case industrial inputs", async () => {
    const runCount = (await listRuns(ironworks)).length;
    const result = await evaluateBlueprintBenchmark(ironworks, "autoresearch");
    expect(result.verdict).toBe("UNCHANGED");
    expect(result.accepted).toBeFalse();
    expect(result.cases.map((item) => item.id)).toEqual(["normal-production", "smelter-outage", "intermittent-power"]);
    expect(result.totalSimulationTicks).toBe(720_000);
    expect(result.patch).toEqual([]);
    expect(result.reasons[0]).toContain("below required");
    expect(await listRuns(ironworks)).toHaveLength(runCount);

    const dir = await projectCopy();
    const kept = (await listRuns(ironworks)).find((run) => run.name.includes("duplicate-processor-smelter"));
    expect(kept).toBeDefined();
    await cp(join(kept!.path, "blueprint.json"), join(dir, "blueprints/autoresearch.blueprint.json"));
    const improved = await evaluateBlueprintBenchmark(dir, "autoresearch");
    expect(improved.verdict).toBe("KEEP");
    expect(improved.scoreDelta).toBeGreaterThan(70);
    expect(improved.cases.every((item) => item.scoreDelta > 0)).toBeTrue();
    expect(improved.cases.some((item) => item.candidateCapacityReady)).toBeTrue();
    expect(improved.patch.length).toBeGreaterThan(0);

    const scenarioPath = join(dir, "scenarios/autoresearch-power.scenario.json");
    const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
    scenario.name = "Tampered benchmark input";
    await writeFile(scenarioPath, `${stableStringify(scenario, 2)}\n`);
    expect(evaluateBlueprintBenchmark(dir, "autoresearch")).rejects.toThrow("fixed input drifted");
    const previousLock = (await loadBlueprintBenchmark(dir, "autoresearch")).lock!.cases["intermittent-power"]!.scenarioHash;
    await lockBlueprintBenchmark(dir, "autoresearch");
    expect((await loadBlueprintBenchmark(dir, "autoresearch")).lock!.cases["intermittent-power"]!.scenarioHash).not.toBe(previousLock);
  }, 20_000);

  test("keeps dispatch, inspection, rapid anneal, dedicated tools, and qualified maintenance across the locked memory-fab envelope", async () => {
    const result = await evaluateBlueprintBenchmark(memoryFab, "dispatch-research");
    expect(result.verdict).toBe("KEEP");
    expect(result.accepted).toBeTrue();
    expect(result.cases.map((item) => item.id)).toEqual([
      "steady-production", "mixed-quality", "quality-excursion", "lithography-interruption", "facility-interruption",
    ]);
    expect(result.totalSimulationTicks).toBe(2_400_000);
    expect(result.cases.every((item) => item.scoreDelta > 0)).toBeTrue();
    expect(result.minimumCaseScoreDelta).toBeCloseTo(Math.min(...result.cases.map((item) => item.scoreDelta)), 8);
    expect(result.worstCaseCandidateScore).toBeGreaterThan(result.worstCaseBaselineScore);
    expect(result.scoreDelta).toBeGreaterThan(10);
    expect(result.minimumCaseScoreDelta).toBeGreaterThan(2);
    expect(result.cases.every((item) => item.candidateMetrics.qualityEscapes === 0)).toBeTrue();
    expect(result.cases.some((item) => item.candidateMetrics.totalOpportunisticMaintenance > 0)).toBeTrue();
    expect(result.cases.every((item) => item.candidateMetrics.totalMandatoryMaintenance <= item.baselineMetrics.totalMandatoryMaintenance)).toBeTrue();
    expect(result.cases.some((item) => item.candidateMetrics.totalMandatoryMaintenance < item.baselineMetrics.totalMandatoryMaintenance)).toBeTrue();
    expect(result.cases.every((item) => item.candidateMetrics.totalQualificationCompleted === item.candidateMetrics.totalMaintenanceCompleted)).toBeTrue();
    expect(result.cases.every((item) => item.candidateMetrics.totalQualificationTicks > 0)).toBeTrue();
    expect(result.cases.every((item) => item.candidateCapacityReady)).toBeTrue();
    const facilityInterruption = result.cases.find((item) => item.id === "facility-interruption")!;
    expect(facilityInterruption.baselineMetrics.totalUtilityProviderInterruptions).toBeGreaterThan(0);
    expect(facilityInterruption.candidateMetrics.totalUtilityProviderInterruptions)
      .toBe(facilityInterruption.baselineMetrics.totalUtilityProviderInterruptions);
    expect(facilityInterruption.candidateMetrics.totalUtilityInputWaitTicks)
      .toBeLessThan(facilityInterruption.baselineMetrics.totalUtilityInputWaitTicks);
    expect(result.changes.map((change) => change.id)).toContain("lithography-2");
    expect(result.changes.map((change) => change.id)).toContain("etch-2");
    expect(result.changes.map((change) => change.id)).toContain("lithography-to-etch-lithography-2");
  }, 15_000);

  test("keeps a one-value DRAM product-mix control edit against a locked evaluator", async () => {
    const result = await evaluateBlueprintBenchmark(memoryFab, "product-mix-research");
    expect(result.verdict).toBe("KEEP");
    expect(result.accepted).toBeTrue();
    expect(result.patch).toHaveLength(1);
    expect(result.patch[0]).toEqual(expect.objectContaining({ op: "replace", value: "contract-value" }));
    expect(result.cases.every((item) => item.scoreDelta > 0 && item.candidateCapacityReady)).toBeTrue();
    expect(result.cases.every((item) => item.candidateMetrics.deliveryNetValuePerMinute > item.baselineMetrics.deliveryNetValuePerMinute)).toBeTrue();
  }, 15_000);

  test("keeps a one-process DRAM wafer-probe yield program against locked latent-defect work", async () => {
    const result = await evaluateBlueprintBenchmark(memoryFab, "yield-research");
    expect(result.verdict).toBe("KEEP");
    expect(result.accepted).toBeTrue();
    expect(result.patch).toHaveLength(1);
    expect(result.patch[0]).toEqual(expect.objectContaining({ op: "replace", value: "probe-sort-dram-adaptive" }));
    expect(result.cases.map((item) => item.id)).toEqual(["yield-window", "yield-excursion"]);
    expect(result.totalSimulationTicks).toBe(1_200_000);
    expect(result.cases.every((item) => item.candidateMetrics.lotOutputRatio > item.baselineMetrics.lotOutputRatio)).toBeTrue();
    expect(result.cases.every((item) => item.candidateMetrics.lotOutputLostUnits < item.baselineMetrics.lotOutputLostUnits)).toBeTrue();
    expect(result.cases.every((item) => item.scoreDelta > 0 && item.candidateCapacityReady)).toBeTrue();
  }, 15_000);

  test("keeps bounded DRAM furnace batches while draining an incomplete production tail", async () => {
    const result = await evaluateBlueprintBenchmark(memoryFab, "batch-formation-research");
    expect(result.verdict).toBe("KEEP");
    expect(result.accepted).toBeTrue();
    expect(result.cases.map((item) => item.id)).toEqual(["incomplete-tail"]);
    expect(result.totalSimulationTicks).toBe(720_000);
    expect(result.scoreDelta).toBeCloseTo(14.534068, 5);
    expect(result.cases[0]!.baselineMetrics.batchJobs).toBe(3);
    expect(result.cases[0]!.candidateMetrics).toEqual(expect.objectContaining({
      batchJobs: 3, averageLotsPerBatch: 3, batchFormationHolds: 4,
      batchPreferredReleases: 3, batchTimeoutReleases: 1, deliveryOverflow: 8,
    }));
    expect(result.cases[0]!.candidateMetrics.completedLots).toBeGreaterThan(result.cases[0]!.baselineMetrics.completedLots);
    expect(result.cases[0]!.candidateMetrics.deliveryNetValuePerMinute).toBeGreaterThan(result.cases[0]!.baselineMetrics.deliveryNetValuePerMinute);
  }, 15_000);

  test("keeps a one-policy furnace sleep threshold against locked two-wave energy work", async () => {
    const result = await evaluateBlueprintBenchmark(memoryFab, "equipment-energy-research");
    expect(result.verdict).toBe("KEEP");
    expect(result.accepted).toBeTrue();
    expect(result.patch).toHaveLength(1);
    expect(result.patch[0]).toEqual(expect.objectContaining({
      op: "add", value: { sleepAfterTicks: 30_000 },
    }));
    expect(result.changes).toHaveLength(1);
    const benchmarkCase = result.cases[0]!;
    expect(benchmarkCase.candidateCapacityReady).toBeTrue();
    expect(benchmarkCase.candidateMetrics.energyConsumedMilliJoules)
      .toBeLessThan(benchmarkCase.baselineMetrics.energyConsumedMilliJoules);
    expect(benchmarkCase.candidateMetrics.electricityTotalCostMicroCurrency)
      .toBeLessThan(benchmarkCase.baselineMetrics.electricityTotalCostMicroCurrency);
    expect(benchmarkCase.candidateMetrics.electricityDemandChargeMicroCurrency)
      .toBe(benchmarkCase.baselineMetrics.electricityDemandChargeMicroCurrency);
    expect(benchmarkCase.candidateMetrics).toEqual(expect.objectContaining({
      totalEquipmentSleeps: 2,
      totalEquipmentWakeups: 1,
      totalEquipmentSleepingTicks: 196_000,
      totalEquipmentWakeTicks: 4_000,
    }));
    expect(result.scoreDelta).toBeGreaterThan(0.5);
  }, 15_000);

  test("lets a coding agent protect an explicit sorter line with authored power priority", async () => {
    const unchanged = await evaluateBlueprintBenchmark(ironworks, "power-priority");
    expect(unchanged.verdict).toBe("UNCHANGED");
    expect(unchanged.totalSimulationTicks).toBe(40_000);

    const dir = await projectCopy();
    const candidatePath = join(dir, "blueprints/power-priority-candidate.blueprint.json");
    const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Blueprint;
    for (const device of candidate.devices) if ([
      "z-critical-assembler", "z-critical-link-loader", "z-critical-link-unloader",
    ].includes(device.id)) device.policy = { ...device.policy, powerPriority: 10 };
    await writeFile(candidatePath, `${stableStringify(candidate, 2)}\n`);

    const prioritized = await evaluateBlueprintBenchmark(dir, "power-priority");
    expect(prioritized.verdict).toBe("KEEP");
    expect(prioritized.accepted).toBeTrue();
    expect(prioritized.scoreDelta).toBeGreaterThan(1_000_000);
    expect(prioritized.patch).toHaveLength(3);
    expect(prioritized.changes.every((change) => change.kind === "device" && change.fields?.includes("policy"))).toBeTrue();
  });

  test("previews and atomically applies a hash-pinned KEEP candidate change set", async () => {
    const dir = await projectCopy();
    const blueprintPath = join(dir, "blueprints/power-priority-candidate.blueprint.json");
    const beforeBlueprint = await readFile(blueprintPath, "utf8");
    const blueprint = JSON.parse(beforeBlueprint) as Blueprint;
    const baseCandidateHash = hashValue(blueprint);
    const protectedIds = new Set(["z-critical-assembler", "z-critical-link-loader", "z-critical-link-unloader"]);
    const patch = blueprint.devices.flatMap((device, index) => !protectedIds.has(device.id) ? [] : [device.policy ? {
      op: "add" as const, path: `/devices/${index}/policy/powerPriority`, value: 10,
    } : {
      op: "add" as const, path: `/devices/${index}/policy`, value: { powerPriority: 10 },
    }]);
    await mkdir(join(dir, "candidates"));
    await writeFile(join(dir, "candidates/protect-critical-line.candidate.json"), `${stableStringify({
      version: 1,
      id: "protect-critical-line",
      name: "Protect critical sorter line",
      benchmark: "power-priority",
      hypothesis: "Critical production and its physical transport endpoints should preempt discretionary loads.",
      baseCandidateHash,
      patch,
    }, 2)}\n`);

    expect((await listCandidateChangeSets(dir, "power-priority")).map((item) => item.id)).toEqual(["protect-critical-line"]);
    const beforePreview = await readFile(blueprintPath, "utf8");
    const beforeFixedProject = await directorySnapshot(dir, new Set(["blueprints/power-priority-candidate.blueprint.json"]));
    const preview = await previewCandidateChangeSet(dir, "protect-critical-line");
    expect(preview.result.verdict).toBe("KEEP");
    expect(preview.result.patch).toHaveLength(4);
    expect(await readFile(blueprintPath, "utf8")).toBe(beforePreview);

    const applied = await applyCandidateChangeSet(dir, "protect-critical-line", preview);
    expect(applied.applied).toBeTrue();
    expect(hashValue(JSON.parse(await readFile(blueprintPath, "utf8")))).toBe(preview.proposedCandidateHash);
    const appliedProject = compileFactoryProject(await loadFactoryProject(dir, {
      world: "main", blueprint: "power-priority-candidate", scenario: "power-priority", objective: "power-priority",
    }));
    expect(appliedProject.hashes.blueprintHash).toBe(preview.proposedCandidateHash);
    expect(await directorySnapshot(dir, new Set(["blueprints/power-priority-candidate.blueprint.json"]))).toEqual(beforeFixedProject);
    expect(preview.proposedCandidateHash).not.toBe(baseCandidateHash);
    await expect(previewCandidateChangeSet(dir, "protect-critical-line")).rejects.toMatchObject({ code: "candidate.stale-base" });
  });

  test("rejects changed, non-KEEP, invalid-root, and uncompilable candidate proposals with stable codes", async () => {
    const dir = await projectCopy();
    const blueprintPath = join(dir, "blueprints/power-priority-candidate.blueprint.json");
    const beforeBlueprint = await readFile(blueprintPath, "utf8");
    const blueprint = JSON.parse(beforeBlueprint) as Blueprint;
    const baseCandidateHash = hashValue(blueprint);
    await mkdir(join(dir, "candidates"));
    const writeCandidate = async (id: string, hypothesis: string, patch: Array<{ op: "add" | "remove" | "replace"; path: string; value?: unknown }>) => {
      await writeFile(join(dir, `candidates/${id}.candidate.json`), `${stableStringify({
        version: 1, id, name: id, benchmark: "power-priority", hypothesis, baseCandidateHash, patch,
      }, 2)}\n`);
    };

    await writeCandidate("invalid-root", "Attempt to edit Core-owned revision metadata.", [{ op: "replace", path: "/revision", value: "forbidden" }]);
    await expect(previewCandidateChangeSet(dir, "invalid-root")).rejects.toMatchObject({ code: "candidate.invalid-patch" });

    await writeCandidate("uncompilable", "Point a Device at an asset that does not exist.", [{ op: "replace", path: "/devices/0/asset", value: "missing-asset" }]);
    await expect(previewCandidateChangeSet(dir, "uncompilable")).rejects.toMatchObject({ code: "candidate.evaluation-failed" });

    await writeCandidate("no-op", "Repeat an existing coordinate without changing factory behavior.", [{ op: "replace", path: "/devices/0/position/x", value: blueprint.devices[0]!.position.x }]);
    const unchanged = await previewCandidateChangeSet(dir, "no-op");
    expect(unchanged.result.verdict).toBe("UNCHANGED");
    await expect(applyCandidateChangeSet(dir, "no-op", unchanged)).rejects.toMatchObject({ code: "candidate.not-accepted" });

    const protectedIndex = blueprint.devices.findIndex((device) => device.id === "z-critical-assembler");
    const changedPatch = [{ op: "add" as const, path: `/devices/${protectedIndex}/policy`, value: { powerPriority: 10 } }];
    await writeCandidate("changed-after-review", "Protect the critical assembler.", changedPatch);
    const reviewed = await previewCandidateChangeSet(dir, "changed-after-review");
    await writeCandidate("changed-after-review", "This hypothesis changed after human review.", changedPatch);
    await expect(applyCandidateChangeSet(dir, "changed-after-review", reviewed)).rejects.toMatchObject({ code: "candidate.review-proposal-mismatch" });
    expect(await readFile(blueprintPath, "utf8")).toBe(beforeBlueprint);
  });

  test("lets a coding agent improve proportional satisfaction by editing only the Blueprint", async () => {
    const unchanged = await evaluateBlueprintBenchmark(ironworks, "power-satisfaction");
    expect(unchanged.verdict).toBe("UNCHANGED");
    expect(unchanged.totalSimulationTicks).toBe(28_000);

    const dir = await projectCopy();
    const candidatePath = join(dir, "blueprints/power-satisfaction-candidate.blueprint.json");
    const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Blueprint;
    candidate.devices.push({
      id: "z-satisfaction-wind-2", asset: "wind-turbine", region: "assembly-zone",
      position: { x: 12, y: 4 }, rotation: 0,
    });
    await writeFile(candidatePath, `${stableStringify(candidate, 2)}\n`);

    const expanded = await evaluateBlueprintBenchmark(dir, "power-satisfaction");
    expect(expanded.verdict).toBe("KEEP");
    expect(expanded.accepted).toBeTrue();
    expect(expanded.scoreDelta).toBeGreaterThan(1_000_000);
    expect(expanded.patch).toEqual([expect.objectContaining({ op: "add", path: "/devices/-" })]);
  });

  test("lets a coding agent remove a station charging bottleneck in one Blueprint edit", async () => {
    const unchanged = await evaluateBlueprintBenchmark(ironworks, "station-energy");
    expect(unchanged.verdict).toBe("UNCHANGED");
    expect(unchanged.totalSimulationTicks).toBe(240_000);

    const dir = await projectCopy();
    const candidatePath = join(dir, "blueprints/station-energy-candidate.blueprint.json");
    const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Blueprint;
    candidate.devices.find((device) => device.id === "station-supply")!.policy!.stationChargeMilliWatts = 300_000;
    await writeFile(candidatePath, `${stableStringify(candidate, 2)}\n`);

    const charged = await evaluateBlueprintBenchmark(dir, "station-energy");
    expect(charged.verdict).toBe("KEEP");
    expect(charged.accepted).toBeTrue();
    expect(charged.scoreDelta).toBeGreaterThan(1);
    expect(charged.patch).toEqual([expect.objectContaining({ op: "replace", path: expect.stringContaining("/policy/stationChargeMilliWatts") })]);
  });

  test("lets a coding agent trade station energy for faster inter-zone turnaround", async () => {
    const unchanged = await evaluateBlueprintBenchmark(ironworks, "high-speed-transport");
    expect(unchanged.verdict).toBe("UNCHANGED");
    expect(unchanged.totalSimulationTicks).toBe(240_000);

    const dir = await projectCopy();
    const candidatePath = join(dir, "blueprints/high-speed-transport-candidate.blueprint.json");
    const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Blueprint;
    candidate.devices.find((device) => device.id === "station-supply")!.policy!.highSpeedTransport = { enabled: true, minimumDistance: 0 };
    await writeFile(candidatePath, `${stableStringify(candidate, 2)}\n`);

    const expedited = await evaluateBlueprintBenchmark(dir, "high-speed-transport");
    expect(expedited.verdict).toBe("KEEP");
    expect(expedited.accepted).toBeTrue();
    expect(expedited.scoreDelta).toBeGreaterThan(0.001);
    expect(expedited.patch).toEqual([expect.objectContaining({ op: "replace", path: expect.stringContaining("/policy/highSpeedTransport/enabled") })]);
  });
});

describe("artifacts and renderer-independent projection", () => {
  test("every checked-in demonstration run replays to its recorded result hash", async () => {
    const runs = await listRuns(ironworks);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    for (const run of runs) {
      const source = await loadFactoryProject(ironworks, run.manifest.selection);
      const blueprint = JSON.parse(await readFile(join(run.path, "blueprint.json"), "utf8"));
      const project = compileFactoryProject({ ...source, blueprint });
      expect(runUntil(project, undefined, { seed: run.manifest.seed }).resultHash).toBe(run.manifest.resultHash);
    }
  }, 15_000);

  test("checked-in KEEP history closes the objective target-rate capacity plan", async () => {
    const source = await loaded(); const runs = await listRuns(ironworks);
    const baseline = runs.find((run) => run.manifest.decision === "BASELINE")!;
    const finalKeep = runs.filter((run) => run.manifest.decision === "KEEP").at(-1)!;
    const baselineBlueprint = JSON.parse(await readFile(join(baseline.path, "blueprint.json"), "utf8"));
    const finalBlueprint = JSON.parse(await readFile(join(finalKeep.path, "blueprint.json"), "utf8"));
    const baselinePlan = planProductionCapacity(compileFactoryProject({ ...source, blueprint: baselineBlueprint }));
    const finalPlan = planProductionCapacity(compileFactoryProject({ ...source, blueprint: finalBlueprint }));
    expect(baselinePlan.ready).toBeFalse();
    expect(baselinePlan.gaps.map((gap) => gap.kind)).toEqual(["process", "reserve", "power"]);
    expect(finalPlan.ready).toBeTrue();
    expect(finalPlan.gaps).toEqual([]);
  });

  test("completed run can be replayed exactly", async () => {
    const dir = await projectCopy(); const project = await openFactoryProject(dir); const result = runUntil(project, undefined, { seed: 42 });
    const run = await writeRunArtifact(project, result, { label: "replay", seed: 42 });
    expect(await verifyRunReplay(project, run, runUntil(project, undefined, { seed: 42 }))).toBeTrue();
    expect(run.manifest.selection).toEqual({ world: "main", blueprint: "main", scenario: "baseline", objective: "default" });
    expect((await listRuns(dir))[0]!.manifest.status).toBe("completed");
    expect(JSON.parse(await readFile(join(run.path, "metrics.json"), "utf8")).scoreBreakdown).toBeDefined();
  });

  test("FactorySceneModel is pure serializable data and replays transit", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const base = createFactorySceneModel(project, result.metrics); const frame = replayFactoryEvents(project, result.events, 5000, result.metrics);
    expect(base.devices["smelter-1"]!.assetId).toBe("smelter"); expect(stableStringify(frame)).not.toContain("THREE.");
    expect(() => structuredClone(frame)).not.toThrow();
    const beltEvent = result.events.find((event) => event.type === "resource.belt-position");
    if (!beltEvent || beltEvent.type !== "resource.belt-position") throw new Error("missing belt position event");
    const beltFrame = replayFactoryEvents(project, result.events, beltEvent.tick, result.metrics);
    const item = beltFrame.resourcesInTransit.find((transit) => transit.id === beltEvent.transit.id)!;
    const connection = project.connections[beltEvent.connection]!;
    const cell = connection.path[beltEvent.cellIndex]!;
    const regionOffset = beltFrame.regions.find((region) => region.id === connection.fromDevice.region)!.offset;
    expect(item.position).toEqual({ x: cell.x + regionOffset.x + .5, y: cell.y + regionOffset.y + .5, level: cell.level ?? 0 });
  });
});
