import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ExternalCommandResearchAgent, HeuristicResearchAgent, InmValidationError, analyzeProduction, applyResearchPatch, compileFactoryProject, createFactorySceneModel,
  findBlueprintConnectionPath, listRuns, loadFactoryProject, openFactoryProject, optimizeResourceDemand, optimizeSpatialResourceDemand, planProductionCapacity, replayFactoryEvents, researchFactory, runUntil,
  stableStringify, synthesizeFactoryBlueprint, validateResearchPatch, verifyRunReplay, writeRunArtifact, SeededRandom,
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
  source.scenario.initialBuffers = {
    "station-supply": { storage: { "iron-ore": 25 } },
    "generator-1": { fuel: { coal: 1 } },
  };
  source.scenario.failures = [];
  return source;
}

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
    expect(first.stationNetworks).toHaveLength(1);
    expect(first.selectedProcesses.map((process) => [process.process, process.region])).toEqual([
      ["forge-gear-pair", "assembly-world"], ["smelt-iron", "forge-world"],
    ]);
    expect(first.plannedTransports).toEqual([{
      resource: "iron-plate", fromRegion: "forge-world", toRegion: "assembly-world", requiredPerMinute: 18, costPerItem: 100,
    }]);

    const project = compileFactoryProject({ ...source, blueprint: first.blueprint });
    expect(planProductionCapacity(project).ready).toBeTrue();
    const simulation = runUntil(project);
    expect(simulation.metrics.throughputPerMinute).toBeGreaterThanOrEqual(source.objective.targetRatePerMinute);
    expect(simulation.metrics.occupiedArea).toBeLessThanOrEqual(source.objective.constraints!.maxOccupiedArea!);
    expect(simulation.metrics.totalBuildCost).toBeLessThanOrEqual(source.objective.constraints!.maxBuildCost!);
    expect(simulation.metrics.infeasibleReason).toBeNull();
    expect(simulation.events.some((event) => event.type === "power.shortage" || event.type === "transport.power-shortage")).toBeFalse();
  });

  test("scales multi-input production through junction trees and elevated belt crossings", async () => {
    const source = await loadFactoryProject(ironworks, { blueprint: "blank", scenario: "cold-start" });
    source.objective.targetRatePerMinute = 24;
    source.objective.constraints = { maxBuildCost: 50_000, maxOccupiedArea: 260 };
    for (const node of source.world.resourceNodes.filter((node) => node.resource === "iron-ore")) node.amount = 100;

    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.plannedTransports).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-world", toRegion: "assembly-world", requiredPerMinute: 36,
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
      id: "assembly-iron-vein", region: "assembly-world", resource: "iron-ore", position: { x: 1, y: 9 }, amount: 36,
    });

    const synthesis = synthesizeFactoryBlueprint(source);
    expect(synthesis.selectedProcesses.map((process) => [process.process, process.region, process.requiredCyclesPerMinute])).toEqual([
      ["forge-gear-pair", "assembly-world", 6],
      ["smelt-iron", "assembly-world", 9],
      ["smelt-iron", "forge-world", 9],
    ]);
    expect(synthesis.plannedTransports).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-world", toRegion: "assembly-world", requiredPerMinute: 9,
    })]);

    const project = compileFactoryProject({ ...source, blueprint: synthesis.blueprint });
    expect(planProductionCapacity(project).ready).toBeTrue();
    expect(runUntil(project).metrics.infeasibleReason).toBeNull();
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
      process: "refine-crude", inputs: { "crude-oil": "crude-input" },
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
    expect(Object.keys(project.devices)).toHaveLength(12);
    expect(Object.keys(project.regions)).toEqual(["forge-world", "assembly-world"]);
    expect(Object.keys(project.resourceNodes)).toEqual(["iron-vein-1", "iron-vein-2", "iron-vein-3", "coal-seam-forge", "coal-seam-assembly"]);
    expect(project.devices["ore-source-1"]!.extractionPlan).toEqual(expect.objectContaining({ outputBuffer: "output", cycleTicks: 1_000, itemsPerCycle: 1 }));
    expect(Object.keys(project.resources)).toEqual(["coal", "crude-oil", "gear", "graphite", "hydrogen", "iron-ore", "iron-plate", "plastic", "refined-oil"]);
    expect(Object.keys(project.processes)).toEqual(["assemble-gear", "forge-gear-pair", "make-plastic", "refine-crude", "smelt-iron", "xray-crack-oil"]);
    expect(project.devices["smelter-1"]!.processPlan?.definition.id).toBe("smelt-iron");
    expect(project.devices["smelter-1"]!.processPlan?.durationTicks).toBe(4000);
    expect(project.devices["assembler-1"]!.processPlan?.inputs).toEqual([
      { buffer: "input-primary", resource: "iron-plate", count: 2 },
      { buffer: "input-secondary", resource: "coal", count: 1 },
    ]);
    expect(project.devices["assembler-1"]!.buffers["input-primary"]!.accepts).toEqual(["iron-plate"]);
    expect(project.devices["assembler-1"]!.buffers["input-secondary"]!.accepts).toEqual(["coal"]);
    expect(project.devices["smelter-1"]!.powerGrid).toBe("grid-forge-world-generator-1");
    expect(project.devices["assembler-1"]!.powerGrid).toBe("grid-assembly-world-generator-2");
    expect(project.powerGrids["grid-forge-world-generator-1"]!.members).not.toContain("assembler-1");
    expect(project.powerGrids["grid-forge-world-generator-1"]!.productionMilliWatts).toBe(1_000_000);
    expect(project.powerGrids["grid-assembly-world-generator-2"]!.productionMilliWatts).toBe(1_600_000);
    expect(project.connections["ore-to-smelter"]!.logisticsStages.map((stage) => `${stage.stage}:${stage.asset.id}`)).toEqual([
      "loader:sorter", "line:conveyor", "unloader:sorter",
    ]);
    expect(project.connections["ore-to-smelter"]!.logisticsStages.map((stage) => stage.powerGrid ?? null)).toEqual([
      "grid-forge-world-generator-1", null, "grid-forge-world-generator-1",
    ]);
    expect(project.powerGrids["grid-forge-world-generator-1"]!.transportStages).toContainEqual({ connection: "ore-to-smelter", stage: "loader" });
    expect(project.connections["ore-to-smelter"]!.dispatchIntervalTicks).toBe(250);
    expect(project.connections["ore-to-smelter"]!.travelTicks).toBe(1_000);
    expect(project.logisticsNetworks["interstellar-main"]!.routes).toEqual([expect.objectContaining({
      resource: "iron-plate", fromRegion: "forge-world", toRegion: "assembly-world", distance: 88, travelTicks: 12_040,
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
    const source = await loaded(); source.blueprint.connections[0]!.logistics.loader.deviceAsset = "conveyor";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.stage-role");
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

  test("rejects missing and incompatible process bindings", async () => {
    const missing = await loaded(); missing.blueprint.devices[1]!.recipe!.process = "missing-process";
    expect(issueCodes(() => compileFactoryProject(missing))).toContain("reference.process");
    const incompatible = await loaded(); incompatible.blueprint.devices[1]!.recipe!.process = "assemble-gear";
    expect(issueCodes(() => compileFactoryProject(incompatible))).toContain("production.category");
  });

  test("recipe bindings configure each physical input buffer and must cover the selected process exactly", async () => {
    const missing = await loaded(); delete missing.blueprint.devices[2]!.recipe!.inputs.coal;
    expect(issueCodes(() => compileFactoryProject(missing))).toContain("recipe.binding-required");
    const extra = await loaded(); extra.blueprint.devices[2]!.recipe!.inputs["iron-ore"] = "input-primary";
    expect(issueCodes(() => compileFactoryProject(extra))).toContain("recipe.extra-binding");
    const wrongRole = await loaded(); wrongRole.blueprint.devices[2]!.recipe!.inputs.coal = "output";
    expect(issueCodes(() => compileFactoryProject(wrongRole))).toContain("recipe.buffer-role");
    const project = compileFactoryProject(await loaded());
    expect(project.connections["station-to-assembler"]!.toDevice.buffers["input-primary"]!.accepts).toEqual(["iron-plate"]);
    expect(project.connections["coal-splitter-to-assembler"]!.toDevice.buffers["input-secondary"]!.accepts).toEqual(["coal"]);
    const alternative = await loaded(); alternative.blueprint.devices[2]!.recipe!.process = "forge-gear-pair";
    expect(analyzeProduction(compileFactoryProject(alternative)).productionGraph.rawInputsPerTarget).toEqual({ coal: .5, "iron-ore": 3 });
  });

  test("validates process resource references", async () => {
    const source = await loaded(); source.processes["smelt-iron"]!.inputs[0]!.resource = "unobtainium";
    expect(issueCodes(() => compileFactoryProject(source))).toContain("reference.resource");
  });

  test("validates extractor bindings against immutable world resource nodes", async () => {
    const unknown = await loaded(); unknown.blueprint.devices[0]!.resourceNodes = ["missing-vein"];
    expect(issueCodes(() => compileFactoryProject(unknown))).toContain("reference.resource-node");
    const crossRegion = await loaded(); crossRegion.world.resourceNodes[0]!.region = "assembly-world";
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

  test("automatic pathfinding ignores belts at the same local coordinates in another region", async () => {
    const source = await loaded();
    source.blueprint.devices = [
      { id: "forge-source", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "forge-target", asset: "buffer", region: "forge-world", position: { x: 4, y: 0 }, rotation: 0 },
      { id: "assembly-source", asset: "buffer", region: "assembly-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "assembly-target", asset: "buffer", region: "assembly-world", position: { x: 4, y: 0 }, rotation: 0 },
    ];
    source.blueprint.connections = [{
      id: "assembly-belt", from: { device: "assembly-source", port: "output" }, to: { device: "assembly-target", port: "input" },
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      logistics: { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } },
    }];
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
    expect(analysis.declarativeDevices).toBe(8);
    expect(analysis.extractionDevices).toEqual(expect.arrayContaining([
      expect.objectContaining({ device: "ore-source-1", resource: "iron-ore", itemsPerMinute: 60 }),
      expect.objectContaining({ device: "coal-miner-forge", resource: "coal", itemsPerMinute: 60 }),
      expect.objectContaining({ device: "coal-miner-assembly", resource: "coal", itemsPerMinute: 60 }),
    ]));
    expect(analysis.generationDevices).toEqual(expect.arrayContaining([
      expect.objectContaining({ device: "generator-1", kind: "fuel", fuelResource: "coal", fuelPerMinute: 60_000 / 70_000 }),
      expect.objectContaining({ device: "generator-2", kind: "fuel", fuelResource: "coal", fuelPerMinute: 60_000 / 70_000 }),
    ]));
    expect(analysis.resourceNodes).toHaveLength(5);
    expect(plate.producedPerMinute).toBe(15);
    expect(plate.consumedPerMinute).toBe(40);
    expect(plate.netPerMinute).toBe(-25);
    expect(analysis.productionGraph).toEqual(expect.objectContaining({
      targetResource: "gear", rawInputsPerTarget: { coal: 1, "iron-ore": 4 },
    }));
    expect(analysis.productionGraph.steps).toEqual([
      { device: "assembler-1", process: "assemble-gear", cyclesPerTarget: 1 },
      { device: "smelter-1", process: "smelt-iron", cyclesPerTarget: 2 },
    ]);
    expect(analysis.recipeOptions).toContainEqual(expect.objectContaining({
      device: "assembler-1", process: "forge-gear-pair", selected: false, targetOutputPerMinute: 30,
      inputBindings: { "iron-plate": "input-primary", coal: "input-secondary" }, outputBindings: { gear: "output" },
    }));
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.code === "material-deficit" && diagnostic.resource === "iron-plate")).toBeTrue();
    expect(analysis.powerGrids).toEqual([
      expect.objectContaining({ grid: "grid-assembly-world-generator-2", region: "assembly-world", headroomMilliWatts: 590_000 }),
      expect.objectContaining({ grid: "grid-forge-world-generator-1", region: "forge-world", headroomMilliWatts: 8_000 }),
    ]);
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
      expect.objectContaining({ resource: "iron-ore", totalDemandPerMinute: 48, configuredExtractionPerMinute: 60, finiteReserve: 90, scenarioDemand: 96, reserveAfterScenario: -6 }),
    ]));
    expect(plan.transport.find((flow) => flow.process === "smelt-iron" && flow.direction === "input")).toEqual(expect.objectContaining({ resource: "iron-ore", requiredItemsPerMinute: 48, configuredCapacityPerMinute: 240 }));
    expect(plan.stationNetworks).toContainEqual(expect.objectContaining({ network: "interstellar-main", resource: "iron-plate", requiredItemsPerMinute: 24, requiredCarriers: 1, configuredCarriers: 1 }));
    expect(plan.power).toContainEqual(expect.objectContaining({ region: "forge-world", headroomMilliWatts: -122_000 }));
    expect(plan.gaps.map((gap) => gap.kind)).toEqual(["process", "reserve", "power"]);
  });
  test("identical inputs and seed produce identical events, state, metrics, and hash", async () => {
    const project = await openFactoryProject(ironworks); const first = runUntil(project, undefined, { seed: 42 }); const second = runUntil(project, undefined, { seed: 42 });
    expect(first).toEqual(second); expect(first.metrics.consumed.gear).toBeGreaterThanOrEqual(10);
  });

  test("counts objective delivery only in the declared target region", async () => {
    const source = await loaded();
    source.objective.targetRegion = "forge-world";
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
    source.deviceAssets["wind-turbine"]!.power.generation = { kind: "renewable", outputMilliWatts: 11_000 };
    source.deviceAssets.splitter!.power.consumptionMilliWatts = 10_000;
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-world", position: { x: 4, y: 0 }, rotation: 0 },
      { id: "wind", asset: "wind-turbine", region: "forge-world", position: { x: 0, y: 4 }, rotation: 0 },
      { id: "blocker", asset: "splitter", region: "forge-world", position: { x: 4, y: 4 }, rotation: 0 },
    ];
    source.blueprint.connections = [{
      id: "powered-belt", from: { device: "source", port: "output" }, to: { device: "target", port: "input" },
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      logistics: { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } },
    }];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { "iron-ore": 1 } } };
    source.scenario.failures = [{ device: "blocker", atTick: 500, durationTicks: 5_000 }];
    const project = compileFactoryProject(source);
    expect(project.powerGrids["grid-forge-world-wind"]!.transportStages).toEqual([
      { connection: "powered-belt", stage: "loader" },
      { connection: "powered-belt", stage: "unloader" },
    ]);

    const result = runUntil(project, undefined, { untilTick: 2_000 });
    expect(result.events.some((event) => event.type === "transport.power-shortage" && event.tick === 0 && event.connection === "powered-belt" && event.stage === "loader")).toBeTrue();
    expect(result.events.some((event) => event.type === "transport.power-restored" && event.tick === 500 && event.connection === "powered-belt" && event.stage === "loader")).toBeTrue();
    expect(result.events.find((event) => event.type === "resource.depart")?.tick).toBe(500);
    expect(result.events.find((event) => event.type === "resource.arrive")?.tick).toBe(1_300);
    expect(result.metrics.transportStageUtilization["powered-belt"]!.loader).toBeGreaterThan(0);
    expect(result.metrics.transportStageUtilization["powered-belt"]!.unloader).toBeGreaterThan(0);
    expect(result.metrics.transportEnergyConsumedMilliJoules).toBe(1_000);
  });

  test("the slowest logistics stage gates connection dispatch", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = {
      apiVersion: 1,
      evaluate: () => ({ kind: "none" }),
      planTransport: () => ({ capacity: 1, durationTicks: 1_000 }),
    };
    source.deviceAssets.sorter!.power.consumptionMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source-buffer", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target-buffer", asset: "buffer", region: "forge-world", position: { x: 10, y: 0 }, rotation: 0 },
    ];
    source.blueprint.connections = [{
      id: "buffer-link", from: { device: "source-buffer", port: "output" }, to: { device: "target-buffer", port: "input" },
      path: Array.from({ length: 9 }, (_, index) => ({ x: index + 1, y: 0 })),
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

  test("stack-capable sorters move multiple Resource items in one physical belt cell", async () => {
    const source = await loaded();
    source.blueprint.devices = [
      { id: "stack-source", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "stack-target", asset: "buffer", region: "forge-world", position: { x: 8, y: 0 }, rotation: 0 },
      { id: "stack-power", asset: "wind-turbine", region: "forge-world", position: { x: 4, y: 4 }, rotation: 0 },
    ];
    source.blueprint.connections = [{
      id: "stacked-link", from: { device: "stack-source", port: "output" }, to: { device: "stack-target", port: "input" },
      path: Array.from({ length: 7 }, (_, index) => ({ x: index + 1, y: 0 })), stackSize: 4,
      logistics: { loader: { deviceAsset: "stack-sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "stack-sorter" } },
    }];
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
    source.deviceAssets.sorter!.power.consumptionMilliWatts = 0;
    source.blueprint.devices = [
      { id: "source-a", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "source-b", asset: "buffer", region: "forge-world", position: { x: 0, y: 2 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-world", position: { x: 8, y: 1 }, rotation: 0 },
    ];
    const logistics = { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } };
    source.blueprint.connections = [
      { id: "shared-a", from: { device: "source-a", port: "output" }, to: { device: "target", port: "input" }, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }], logistics },
      { id: "shared-b", from: { device: "source-b", port: "output" }, to: { device: "target", port: "input" }, path: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }], logistics },
    ];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { "source-a": { storage: { "iron-ore": 10 } }, "source-b": { storage: { "iron-ore": 10 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    expect(project.transportCells["forge-world:4,1"]!.connections).toEqual(["shared-a", "shared-b"]);
    const result = runUntil(project, undefined, { untilTick: 1_000 });
    expect(result.events.flatMap((event) => event.type === "resource.belt-position" && event.cell === "forge-world:4,1" ? [[event.tick, event.connection]] : [])).toEqual([
      [410, "shared-a"], [510, "shared-b"], [620, "shared-a"], [720, "shared-b"], [830, "shared-a"], [930, "shared-b"],
    ]);
    expect(result.events.some((event) => event.type === "resource.belt-blocked" && event.waitingFor === "forge-world:2,1")).toBeTrue();
    const occupied = Object.entries(result.state.transports).flatMap(([connection, transits]) => transits
      .filter((transit) => transit.phase === "belt")
      .map((transit) => project.connections[connection]!.transportCells[transit.cellIndex]!));
    expect(new Set(occupied).size).toBe(occupied.length);
    source.blueprint.devices.push({ id: "target-b", asset: "buffer", region: "forge-world", position: { x: 8, y: 3 }, rotation: 0 });
    source.blueprint.connections[1]!.to = { device: "target-b", port: "input" };
    source.blueprint.connections[1]!.path = [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 }];
    expect(issueCodes(() => compileFactoryProject(source))).toContain("logistics.shared-cell-direction");
  });

  test("slow unloading fills concrete belt cells and propagates backpressure upstream", async () => {
    const source = await loaded();
    source.deviceAssets.sorter!.program = { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 10 }) };
    source.deviceAssets.sorter!.power.consumptionMilliWatts = 0;
    source.deviceAssets["slow-unloader"] = {
      ...source.deviceAssets.sorter!, id: "slow-unloader", name: "Slow unloader",
      program: { apiVersion: 1, evaluate: () => ({ kind: "none" }), planTransport: () => ({ capacity: 1, durationTicks: 1_000 }) },
    };
    source.blueprint.devices = [
      { id: "source", asset: "buffer", region: "forge-world", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "target", asset: "buffer", region: "forge-world", position: { x: 6, y: 0 }, rotation: 0 },
    ];
    source.blueprint.connections = [{
      id: "belt", from: { device: "source", port: "output" }, to: { device: "target", port: "input" },
      path: Array.from({ length: 5 }, (_, index) => ({ x: index + 1, y: 0 })),
      logistics: { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "slow-unloader" } },
    }];
    source.blueprint.logisticsNetworks = [];
    source.scenario.initialBuffers = { source: { storage: { "iron-ore": 20 } } };
    source.scenario.failures = [];
    const project = compileFactoryProject(source);
    const result = runUntil(project, undefined, { untilTick: 1_500 });
    const beltItems = result.state.transports.belt!.filter((transit) => transit.phase === "belt");
    expect(beltItems.map((transit) => transit.cellIndex).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(result.state.transports.belt!.some((transit) => transit.phase === "loading" && transit.blockedBy === "forge-world:1,0")).toBeTrue();
    expect(result.state.transports.belt!.some((transit) => transit.phase === "unloading")).toBeTrue();
    expect(result.events.some((event) => event.type === "resource.belt-blocked" && event.cell === "forge-world:5,0" && event.waitingFor === "target.input")).toBeTrue();
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
      { id: "splitter-1", asset: "splitter", region: "forge-world", position: { x: 4, y: 4 }, rotation: 0, policy: { dispatch: "round-robin", filter: { resource: "coal", outputPort: "output-north" } } },
      { id: "target-east", asset: "buffer", region: "forge-world", position: { x: 10, y: 4 }, rotation: 0 },
      { id: "target-north", asset: "buffer", region: "forge-world", position: { x: 7, y: 2 }, rotation: 0 },
      { id: "wind-1", asset: "wind-turbine", region: "forge-world", position: { x: 0, y: 4 }, rotation: 0 },
    ];
    const logistics = { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } };
    source.blueprint.connections = [
      { id: "split-east", from: { device: "splitter-1", port: "output-east" }, to: { device: "target-east", port: "input" }, path: [{ x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 }], logistics },
      { id: "split-north", from: { device: "splitter-1", port: "output-north" }, to: { device: "target-north", port: "input" }, path: [{ x: 5, y: 3 }, { x: 5, y: 2 }, { x: 6, y: 2 }], logistics },
    ];
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
    source.blueprint.connections = source.blueprint.connections.filter((connection) => connection.to.device !== "generator-1" && connection.from.device !== "generator-1");
    delete source.scenario.initialBuffers?.["generator-1"];
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
      path: Array.from({ length: 6 }, (_, index) => ({ x: index + 4, y: 10 })),
      logistics: { loader: { deviceAsset: "sorter" }, line: { deviceAsset: "conveyor" }, unloader: { deviceAsset: "sorter" } },
    }];
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
    source.blueprint.devices.find((device) => device.id === "generator-1")!.region = "assembly-world";
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

  test("failure scenarios break and recover devices deterministically", async () => {
    const project = await openFactoryProject(ironworks, { scenario: "machine-failure" }); const result = runUntil(project, undefined, { seed: 42 });
    expect(result.events.some((event) => event.type === "device.breakdown")).toBeTrue();
    expect(result.events.some((event) => event.type === "device.recover")).toBeTrue();
  });
});

describe("research boundary and experiment decisions", () => {
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

  test("heuristic strategies read diagnostics and do not immediately repeat experiment history", async () => {
    const project = await openFactoryProject(ironworks); const result = runUntil(project, undefined, { seed: 42 });
    const agent = new HeuristicResearchAgent();
    const base = { project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), capacityPlan: planProductionCapacity(project) };
    const first = await agent.propose({ iteration: 1, ...base, history: [] });
    expect(first.strategy).toBe("recipe:assembler-1:forge-gear-pair");
    const second = await agent.propose({ iteration: 2, ...base, history: [{
      iteration: 1, strategy: first.strategy!, hypothesis: first.hypothesis, decision: "REVERT", score: result.metrics.finalScore, scoreDelta: -1,
    }] });
    expect(second.strategy).toBe("capacity-plan:smelt-iron:1->2");
  });

  test("heuristic strategy adds project-local generation for disconnected consumers", async () => {
    const source = await loaded(); source.blueprint.devices = source.blueprint.devices.filter((device) => device.id !== "generator-1");
    source.blueprint.connections = source.blueprint.connections.filter((connection) => connection.to.device !== "generator-1" && connection.from.device !== "generator-1");
    delete source.scenario.initialBuffers?.["generator-1"];
    const project = compileFactoryProject(source); const result = runUntil(project, undefined, { seed: 42, untilTick: 10_000 });
    const proposal = await new HeuristicResearchAgent().propose({
      iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analyzeProduction(project), capacityPlan: planProductionCapacity(project), history: [],
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
    const proposal = await new HeuristicResearchAgent().propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analysis, capacityPlan: planProductionCapacity(project), history: [] });
    expect(proposal.strategy?.startsWith("logistics:ore-to-smelter:")).toBeTrue();
    expect(proposal.patch).toHaveLength(2);
    const candidate = compileFactoryProject({ ...source, blueprint: applyResearchPatch(project.blueprint, proposal.patch) });
    expect(candidate.connections["ore-to-smelter"]!.dispatchIntervalTicks).toBeLessThan(project.connections["ore-to-smelter"]!.dispatchIntervalTicks);
  });

  test("heuristic logistics strategy can act on measured saturation without a static logistics diagnostic", async () => {
    const source = await loaded();
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
    const proposal = await new HeuristicResearchAgent().propose({ iteration: 1, project, blueprint: project.blueprint, metrics: result.metrics, production: analysis, capacityPlan: planProductionCapacity(project), history: [] });
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
    const runs = await listRuns(ironworks);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    for (const run of runs) {
      const source = await loadFactoryProject(ironworks, run.manifest.selection);
      const blueprint = JSON.parse(await readFile(join(run.path, "blueprint.json"), "utf8"));
      const project = compileFactoryProject({ ...source, blueprint });
      expect(runUntil(project, undefined, { seed: run.manifest.seed }).resultHash).toBe(run.manifest.resultHash);
    }
  });

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
