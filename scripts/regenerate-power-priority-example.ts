import { join, resolve } from "node:path";
import {
  atomicWriteJson,
  lockBlueprintBenchmark,
  type Blueprint,
  type BlueprintBenchmarkManifest,
  type Objective,
  type Scenario,
} from "../packages/inm-core/src/index";

const projectDir = resolve(process.argv[2] ?? join(import.meta.dir, "..", "examples", "ironworks"));

const decoyPositions = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 },
  { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 2 }, { x: 6, y: 2 },
];

const blueprint: Blueprint = {
  version: 1,
  devices: [
    ...decoyPositions.map((position, index) => ({
      id: `a-noncritical-load-${String(index + 1).padStart(2, "0")}`,
      asset: "splitter",
      region: "assembly-zone",
      position,
      rotation: 0 as const,
    })),
    {
      id: "power-priority-wind",
      asset: "wind-turbine",
      region: "assembly-zone",
      position: { x: 10, y: 2 },
      rotation: 0,
    },
    {
      id: "z-critical-assembler",
      asset: "assembler",
      region: "assembly-zone",
      position: { x: 2, y: 10 },
      rotation: 0,
      recipe: {
        process: "assemble-gear",
        mode: "standard",
        inputs: { "iron-plate": "input-primary", coal: "input-secondary" },
        outputs: { gear: "output" },
      },
      bufferFilters: {
        "input-primary": ["iron-plate"],
        "input-secondary": ["coal"],
        output: ["gear"],
      },
    },
    {
      id: "z-critical-sink",
      asset: "material-sink",
      region: "assembly-zone",
      position: { x: 10, y: 10 },
      rotation: 0,
      bufferFilters: { input: ["gear"] },
    },
    {
      id: "z-critical-link-loader",
      asset: "sorter",
      region: "assembly-zone",
      position: { x: 4, y: 10 },
      rotation: 0,
      transportEndpoint: { connection: "z-critical-link", stage: "loader", distance: 1 },
    },
    {
      id: "z-critical-link-unloader",
      asset: "sorter",
      region: "assembly-zone",
      position: { x: 9, y: 10 },
      rotation: 0,
      transportEndpoint: { connection: "z-critical-link", stage: "unloader", distance: 1 },
    },
  ],
  connections: [{
    id: "z-critical-link",
    from: { device: "z-critical-assembler", port: "output" },
    to: { device: "z-critical-sink", port: "input" },
    resources: ["gear"],
    path: Array.from({ length: 6 }, (_, index) => ({ x: index + 4, y: 10 })),
    logistics: {
      loader: { device: "z-critical-link-loader" },
      line: { deviceAsset: "conveyor" },
      unloader: { device: "z-critical-link-unloader" },
    },
  }],
  logisticsNetworks: [],
  policies: { dispatch: "fifo", powerAllocation: "priority-load-shedding" },
};

const scenario: Scenario = {
  id: "power-priority",
  name: "Constrained Grid Load Shedding",
  durationTicks: 20_000,
  initialBuffers: {
    "z-critical-assembler": {
      "input-primary": { "iron-plate": 8 },
      "input-secondary": { coal: 4 },
    },
  },
  renewableProfiles: [{
    region: "assembly-zone",
    asset: "wind-turbine",
    periodTicks: 20_000,
    points: [{ atTick: 0, outputPermille: 400 }],
  }],
  failures: [],
};

const objective: Objective = {
  id: "power-priority",
  name: "Protect Critical Gear Delivery",
  targetResource: "gear",
  targetRegion: "assembly-zone",
  targetRatePerMinute: 12,
  constraints: { maxBuildCost: 12_000, maxOccupiedArea: 80, minProduction: 4 },
  weights: { throughput: 10, onTimeDelivery: 10, energy: 0.01, buildCost: 0.2, occupiedArea: 0.1, wip: 0.1, blocked: 2 },
};

const benchmark: BlueprintBenchmarkManifest = {
  version: 1,
  id: "power-priority",
  name: "Explicit Sorter and Critical Load Priority",
  baselineBlueprint: "power-priority-base",
  candidateBlueprint: "power-priority-candidate",
  cases: [{
    id: "constrained-grid",
    name: "Critical line under a 240 kW grid cap",
    world: "main",
    scenario: "power-priority",
    objective: "power-priority",
    seed: 42,
    weight: 1,
  }],
  acceptance: {
    minimumAggregateScoreDelta: 0.001,
    maximumCaseScoreRegression: 0,
    requireCandidateCapacityReady: false,
  },
};

const satisfactionBlueprint: Blueprint = {
  ...structuredClone(blueprint),
  policies: { dispatch: "fifo", powerAllocation: "proportional" },
};

const satisfactionScenario: Scenario = {
  ...structuredClone(scenario),
  id: "power-satisfaction",
  name: "Proportional Grid Satisfaction",
  durationTicks: 14_000,
  renewableProfiles: [{
    region: "assembly-zone",
    asset: "wind-turbine",
    periodTicks: 14_000,
    points: [{ atTick: 0, outputPermille: 400 }],
  }],
};

const satisfactionBenchmark: BlueprintBenchmarkManifest = {
  version: 1,
  id: "power-satisfaction",
  name: "DSP-Style Proportional Grid Satisfaction",
  baselineBlueprint: "power-satisfaction-base",
  candidateBlueprint: "power-satisfaction-candidate",
  cases: [{
    id: "undersupplied-grid",
    name: "Whole-factory slowdown under a 240 kW grid cap",
    world: "main",
    scenario: "power-satisfaction",
    objective: "power-priority",
    seed: 42,
    weight: 1,
  }],
  acceptance: {
    minimumAggregateScoreDelta: 0.001,
    maximumCaseScoreRegression: 0,
    requireCandidateCapacityReady: false,
  },
};

await Promise.all([
  atomicWriteJson(join(projectDir, "blueprints", "power-priority-base.blueprint.json"), blueprint),
  atomicWriteJson(join(projectDir, "blueprints", "power-priority-candidate.blueprint.json"), blueprint),
  atomicWriteJson(join(projectDir, "scenarios", "power-priority.scenario.json"), scenario),
  atomicWriteJson(join(projectDir, "objectives", "power-priority.objective.json"), objective),
  atomicWriteJson(join(projectDir, "benchmarks", "power-priority.benchmark.json"), benchmark),
  atomicWriteJson(join(projectDir, "blueprints", "power-satisfaction-base.blueprint.json"), satisfactionBlueprint),
  atomicWriteJson(join(projectDir, "blueprints", "power-satisfaction-candidate.blueprint.json"), satisfactionBlueprint),
  atomicWriteJson(join(projectDir, "scenarios", "power-satisfaction.scenario.json"), satisfactionScenario),
  atomicWriteJson(join(projectDir, "benchmarks", "power-satisfaction.benchmark.json"), satisfactionBenchmark),
]);
await lockBlueprintBenchmark(projectDir, "power-priority");
await lockBlueprintBenchmark(projectDir, "power-satisfaction");

process.stdout.write("Regenerated and locked the explicit-sorter priority and proportional-satisfaction benchmark fixtures.\n");
