import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { lockBlueprintBenchmark } from "../packages/inm-core/src/index";

const root = resolve(import.meta.dir, "..");
const project = join(root, "examples", "memory-fab");
const ironworksAssets = join(root, "examples", "ironworks", "assets");

async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function text(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

await mkdir(project, { recursive: true });
await cp(join(ironworksAssets, "runtime-api.ts"), join(project, "assets", "runtime-api.ts"), { force: true });
await cp(join(ironworksAssets, "tsconfig.json"), join(project, "assets", "tsconfig.json"), { force: true });
for (const id of ["buffer", "material-sink", "sorter", "conveyor", "wind-turbine"]) {
  await cp(join(ironworksAssets, "devices", id), join(project, "assets", "devices", id), { recursive: true, force: true });
}

const resources = [
  ["blank-dram-wafer-lot", "Blank DRAM Wafer Lot", "Released 300 mm wafer lot awaiting the first memory-cell patterning pass.", "#78828f"],
  ["patterned-cell-l1-lot", "Patterned Cell L1 Lot", "Wafer lot after the first lithography pass.", "#c878dc"],
  ["etched-cell-l1-lot", "Etched Cell L1 Lot", "Wafer lot after the first plasma etch pass.", "#d69252"],
  ["dielectric-stack-lot", "Dielectric Stack Lot", "Wafer lot with the deposited capacitor dielectric stack, routed back to lithography.", "#53b7b0"],
  ["patterned-cell-l2-lot", "Patterned Cell L2 Lot", "Re-entrant wafer lot after the second lithography pass.", "#9c75ef"],
  ["dram-wafer-lot", "Completed DRAM Wafer Lot", "Completed front-end DRAM wafer lot delivered to wafer sort and downstream packaging.", "#58d68d"],
] as const;
for (const [id, name, description, color] of resources) {
  await json(join(project, "assets", "resources", id, "asset.json"), {
    assetVersion: 1, type: "resource", id, name, description,
    tags: ["semiconductor", "wafer-lot", id === "dram-wafer-lot" ? "finished" : "wip"],
    unit: { kind: "discrete", symbol: "lot", precision: 0 }, transport: { stackSize: 1 },
    tracking: { kind: "lot", family: "dram-wafer" }, files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "resources", id, "visual.json"), { shape: "cylinder", texture: null, color, icon: null });
}

const processes = [
  ["pattern-cell-layer-1", "Pattern memory-cell layer 1", "lithography", 6_000, "blank-dram-wafer-lot", "patterned-cell-l1-lot"],
  ["etch-cell-layer-1", "Etch memory-cell layer 1", "etch", 5_000, "patterned-cell-l1-lot", "etched-cell-l1-lot"],
  ["deposit-dielectric-stack", "Deposit capacitor dielectric stack", "deposition", 7_000, "etched-cell-l1-lot", "dielectric-stack-lot"],
  ["pattern-cell-layer-2", "Pattern memory-cell layer 2", "lithography", 6_000, "dielectric-stack-lot", "patterned-cell-l2-lot"],
  ["etch-cell-layer-2", "Etch memory-cell layer 2", "etch", 5_000, "patterned-cell-l2-lot", "dram-wafer-lot"],
] as const;
for (const [id, name, category, durationTicks, input, output] of processes) {
  await json(join(project, "processes", `${id}.process.json`), {
    version: 1, id, name,
    description: `${name} as one qualified operation in the re-entrant DRAM front-end route.`,
    category, tags: ["dram", "front-end", "re-entrant"], durationTicks,
    inputs: [{ resource: input, count: 1 }], outputs: [{ resource: output, count: 1 }],
  });
}

const runtime = `import type { DeviceProgram } from "../../runtime-api";\n\nexport default {\n  apiVersion: 1,\n  evaluate(context) {\n    const process = context.process;\n    if (!process) return { kind: "wait", reason: "idle" };\n    if (process.inputs.some((amount) => (context.buffers[amount.buffer]?.[amount.resource] ?? 0) < amount.count)) return { kind: "wait", reason: "input" };\n    return { kind: "start", operation: process.id, durationTicks: process.durationTicks, consume: [...process.inputs], produce: [...process.outputs], powerMilliWatts: process.powerMilliWatts };\n  },\n} satisfies DeviceProgram;\n`;

const standardMode = {
  id: "qualified", name: "Qualified production recipe", inputCycles: 1, outputCycles: 1,
  durationMultiplier: { numerator: 1, denominator: 1 }, powerMultiplier: { numerator: 1, denominator: 1 },
  auxiliaryInputs: [], minimumInputTreatmentLevel: 0,
};

async function workCenter(
  id: string,
  name: string,
  description: string,
  category: string,
  color: string,
  ports: Array<{ id: string; direction: "input" | "output"; side: "north" | "east" | "south" | "west"; offset: number; buffer: string }>,
  inputPorts: string[],
  outputPorts: string[],
  buildCost: number,
): Promise<void> {
  const buffers = [...new Set(ports.map((port) => port.buffer))].map((buffer) => ({
    id: buffer,
    role: ports.some((port) => port.buffer === buffer && port.direction === "input") ? "input" : "output",
    capacity: 24,
    accepts: ["*"],
  }));
  await json(join(project, "assets", "devices", id, "asset.json"), {
    assetVersion: 1, type: "device", id, name, description,
    tags: ["semiconductor", "work-center", category], capabilities: ["process"],
    geometry: { footprint: { width: 3, height: 3 }, rotatable: true, ports: ports.map((port) => ({ ...port, kind: "resource" })) },
    buffers,
    production: { categories: [category], speed: { numerator: 1, denominator: 1 }, inputPorts, outputPorts, modes: [standardMode] },
    runtime: { apiVersion: 1, entry: "runtime.ts" },
    power: { idleMilliWatts: 30_000, activeMilliWatts: 280_000 }, economics: { buildCost }, files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "devices", id, "visual.json"), { shape: "box", height: 2.4, texture: null, model: null, color, label: name.toUpperCase() });
  await text(join(project, "assets", "devices", id, "runtime.ts"), runtime);
}

await workCenter("lithography-bay", "Lithography Bay", "A scarce qualified lithography work center revisited by the same wafer route.", "lithography", "#7f5af0", [
  { id: "release-input", direction: "input", side: "west", offset: 1, buffer: "release-input" },
  { id: "reentrant-input", direction: "input", side: "north", offset: 1, buffer: "reentrant-input" },
  { id: "pattern-output", direction: "output", side: "east", offset: 1, buffer: "pattern-output" },
], ["release-input", "reentrant-input"], ["pattern-output"], 18_000);

await workCenter("plasma-etch-bay", "Plasma Etch Bay", "A shared etch work center qualified for both memory-cell layers.", "etch", "#ed8b3a", [
  { id: "pattern-input", direction: "input", side: "west", offset: 1, buffer: "pattern-input" },
  { id: "loop-output", direction: "output", side: "east", offset: 1, buffer: "loop-output" },
  { id: "final-output", direction: "output", side: "south", offset: 1, buffer: "final-output" },
], ["pattern-input"], ["loop-output", "final-output"], 12_000);

await workCenter("ald-deposition-bay", "ALD Deposition Bay", "Atomic-layer deposition work center for the DRAM capacitor dielectric stack.", "deposition", "#2cb6a0", [
  { id: "etch-input", direction: "input", side: "west", offset: 1, buffer: "etch-input" },
  { id: "return-output", direction: "output", side: "north", offset: 1, buffer: "return-output" },
], ["etch-input"], ["return-output"], 15_000);

type Device = Record<string, unknown>;
type Connection = Record<string, unknown>;
const devices: Device[] = [
  { id: "lot-release", asset: "buffer", region: "cleanroom", position: { x: 2, y: 13 }, rotation: 0, bufferFilters: { storage: ["blank-dram-wafer-lot"] } },
  {
    id: "lithography-1", asset: "lithography-bay", region: "cleanroom", position: { x: 8, y: 12 }, rotation: 0,
    recipes: [
      { process: "pattern-cell-layer-1", mode: "qualified", priority: 1, inputs: { "blank-dram-wafer-lot": "release-input" }, outputs: { "patterned-cell-l1-lot": "pattern-output" } },
      { process: "pattern-cell-layer-2", mode: "qualified", priority: 10, inputs: { "dielectric-stack-lot": "reentrant-input" }, outputs: { "patterned-cell-l2-lot": "pattern-output" } },
    ],
    policy: { recipeDispatch: "authored-order", lotDispatch: "fifo", powerPriority: 10 },
  },
  {
    id: "etch-1", asset: "plasma-etch-bay", region: "cleanroom", position: { x: 17, y: 12 }, rotation: 0,
    recipes: [
      { process: "etch-cell-layer-1", mode: "qualified", priority: 1, inputs: { "patterned-cell-l1-lot": "pattern-input" }, outputs: { "etched-cell-l1-lot": "loop-output" } },
      { process: "etch-cell-layer-2", mode: "qualified", priority: 10, inputs: { "patterned-cell-l2-lot": "pattern-input" }, outputs: { "dram-wafer-lot": "final-output" } },
    ],
    policy: { recipeDispatch: "authored-order", lotDispatch: "fifo", powerPriority: 9 },
  },
  {
    id: "deposition-1", asset: "ald-deposition-bay", region: "cleanroom", position: { x: 25, y: 12 }, rotation: 0,
    recipe: { process: "deposit-dielectric-stack", mode: "qualified", inputs: { "etched-cell-l1-lot": "etch-input" }, outputs: { "dielectric-stack-lot": "return-output" } },
    policy: { powerPriority: 8 },
  },
  { id: "wafer-sort-boundary", asset: "material-sink", region: "cleanroom", position: { x: 17, y: 22 }, rotation: 90, bufferFilters: { input: ["dram-wafer-lot"] } },
  { id: "cleanroom-power-a", asset: "wind-turbine", region: "cleanroom", position: { x: 4, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-b", asset: "wind-turbine", region: "cleanroom", position: { x: 12, y: 3 }, rotation: 0 },
];
const connections: Connection[] = [];

function connect(
  id: string,
  from: { device: string; port: string; side: "north" | "east" | "south" | "west" },
  to: { device: string; port: string; side: "north" | "east" | "south" | "west" },
  resources: string[],
  path: Array<{ x: number; y: number }>,
): void {
  const loader = `${id}-loader`;
  const unloader = `${id}-unloader`;
  const loaderRotation = ({ north: 270, east: 0, south: 90, west: 180 } as const)[from.side];
  const unloaderRotation = ({ north: 90, east: 180, south: 270, west: 0 } as const)[to.side];
  devices.push({ id: loader, asset: "sorter", region: "cleanroom", position: path[0], rotation: loaderRotation, transportEndpoint: { connection: id, stage: "loader", distance: 1 } });
  devices.push({ id: unloader, asset: "sorter", region: "cleanroom", position: path.at(-1), rotation: unloaderRotation, transportEndpoint: { connection: id, stage: "unloader", distance: 1 } });
  connections.push({ id, from: { device: from.device, port: from.port }, to: { device: to.device, port: to.port }, resources, path, logistics: { loader: { device: loader }, line: { deviceAsset: "conveyor" }, unloader: { device: unloader } } });
}

connect("release-to-lithography", { device: "lot-release", port: "output", side: "east" }, { device: "lithography-1", port: "release-input", side: "west" }, ["blank-dram-wafer-lot"], [
  { x: 3, y: 13 }, { x: 4, y: 13 }, { x: 5, y: 13 }, { x: 6, y: 13 }, { x: 7, y: 13 },
]);
connect("lithography-to-etch", { device: "lithography-1", port: "pattern-output", side: "east" }, { device: "etch-1", port: "pattern-input", side: "west" }, ["patterned-cell-l1-lot", "patterned-cell-l2-lot"], [
  { x: 11, y: 13 }, { x: 12, y: 13 }, { x: 13, y: 13 }, { x: 14, y: 13 }, { x: 15, y: 13 }, { x: 16, y: 13 },
]);
connect("etch-to-deposition", { device: "etch-1", port: "loop-output", side: "east" }, { device: "deposition-1", port: "etch-input", side: "west" }, ["etched-cell-l1-lot"], [
  { x: 20, y: 13 }, { x: 21, y: 13 }, { x: 22, y: 13 }, { x: 23, y: 13 }, { x: 24, y: 13 },
]);
connect("deposition-return-to-lithography", { device: "deposition-1", port: "return-output", side: "north" }, { device: "lithography-1", port: "reentrant-input", side: "north" }, ["dielectric-stack-lot"], [
  { x: 26, y: 11 }, { x: 26, y: 10 }, { x: 26, y: 9 }, { x: 26, y: 8 }, { x: 25, y: 8 }, { x: 24, y: 8 }, { x: 23, y: 8 }, { x: 22, y: 8 }, { x: 21, y: 8 }, { x: 20, y: 8 }, { x: 19, y: 8 }, { x: 18, y: 8 }, { x: 17, y: 8 }, { x: 16, y: 8 }, { x: 15, y: 8 }, { x: 14, y: 8 }, { x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }, { x: 10, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 9 }, { x: 9, y: 10 }, { x: 9, y: 11 },
]);
connect("etch-to-wafer-sort", { device: "etch-1", port: "final-output", side: "south" }, { device: "wafer-sort-boundary", port: "input", side: "north" }, ["dram-wafer-lot"], [
  { x: 18, y: 15 }, { x: 18, y: 16 }, { x: 18, y: 17 }, { x: 18, y: 18 }, { x: 17, y: 18 }, { x: 17, y: 19 }, { x: 17, y: 20 }, { x: 17, y: 21 },
]);

const blueprint = { version: 1, revision: "memory-fab-reentrant-v1", devices, connections, logisticsNetworks: [], policies: { dispatch: "shortage-first", powerAllocation: "priority-load-shedding" } };
await json(join(project, "blueprints", "baseline.blueprint.json"), blueprint);
await json(join(project, "blueprints", "experiment.blueprint.json"), blueprint);
await json(join(project, "inm.json"), { version: 1, id: "memory-fab", name: "Re-entrant DRAM Memory Fab", defaultWorld: "cleanroom", defaultBlueprint: "baseline", defaultScenario: "production-window", defaultObjective: "dram-output" });
await json(join(project, "worlds", "cleanroom.world.json"), { version: 1, id: "cleanroom", name: "DRAM Front-End Cleanroom", regions: [{ id: "cleanroom", name: "Memory Fab Cleanroom", kind: "industrial-zone", coordinates: { x: 0, y: 0, z: 0 }, bounds: { width: 40, height: 30 } }], resourceNodes: [] });
await json(join(project, "scenarios", "production-window.scenario.json"), {
  id: "production-window", name: "Three-minute DRAM Production Window", durationTicks: 180_000,
  initialLots: Array.from({ length: 12 }, (_, index) => ({
    id: `dram-lot-${String(index + 1).padStart(2, "0")}`,
    device: "lot-release", buffer: "storage", resource: "blank-dram-wafer-lot",
    priority: index >= 9 ? 10 : index >= 6 ? 5 : 1,
    dueTick: 180_000 - index * 10_000,
  })),
  initialEnergyMilliJoules: {}, failures: [],
});
await json(join(project, "objectives", "dram-output.objective.json"), {
  id: "dram-output", name: "Complete DRAM wafer lots with low WIP", targetResource: "dram-wafer-lot", targetRegion: "cleanroom", targetRatePerMinute: 3,
  constraints: { maxBuildCost: 80_000, maxOccupiedArea: 180, minProduction: 4 },
  weights: { throughput: 20, onTimeDelivery: 20, energy: 0.005, buildCost: 0.05, occupiedArea: 0.05, wip: 1.5, blocked: 3, cycleTime: 2, tardiness: 4 },
});
await json(join(project, "tests", "reentrant-flow.fixture.json"), {
  name: "reentrant DRAM route completes lots through shared lithography and etch bays", world: "cleanroom", blueprint: "baseline", scenario: "production-window", objective: "dram-output", seed: 42,
  assertions: [
    { kind: "metric", path: "produced.dram-wafer-lot", min: 4 },
    { kind: "metric", path: "throughputPerMinute", min: 1 },
    { kind: "metric", path: "machineUtilization.lithography-1", min: 0.2 },
    { kind: "metric", path: "machineUtilization.etch-1", min: 0.2 },
    { kind: "metric", path: "lotFlow.released", equals: 12 },
    { kind: "metric", path: "lotFlow.completed", min: 4 },
    { kind: "metric", path: "lotFlow.meanCycleTimeTicks", min: 1 },
    { kind: "event", type: "device.start", present: true },
    { kind: "event", type: "lot.completed", present: true },
  ],
});
await json(join(project, "benchmarks", "dispatch-research.benchmark.json"), {
  version: 1, id: "dispatch-research", name: "DRAM Re-entrant Work-Center Dispatch Research",
  baselineBlueprint: "baseline", candidateBlueprint: "experiment",
  cases: [{ id: "production-window", name: "Fixed three-minute production window", world: "cleanroom", scenario: "production-window", objective: "dram-output", seed: 42, weight: 1 }],
  acceptance: { minimumAggregateScoreDelta: 0.001, maximumCaseScoreRegression: 0, requireCandidateCapacityReady: false },
});
await lockBlueprintBenchmark(project, "dispatch-research");

await text(join(project, "AUTORESEARCH.md"), `# Memory-fab autoresearch program\n\nEdit exactly one file: \`blueprints/experiment.blueprint.json\`. The fixed benchmark compares it with \`baseline.blueprint.json\` under the same three-minute DRAM production window.\n\nThe wafer route revisits \`lithography-1\` and \`etch-1\`. Their \`recipes\` arrays declare qualified operations; \`policy.recipeDispatch\` chooses among ready route steps while \`policy.lotDispatch\` chooses an identity-preserving wafer lot within one step. The baseline uses authored operation order and FIFO lots. Coding Agents can test earliest-due-date, lot-priority, tool duplication, buffers, routes, or power by editing the candidate Blueprint only. Cycle time, queue time, tardiness, throughput, WIP, energy, cost, and area are all evaluator-owned measurements.\n\nRun:\n\n\`\`\`bash\nbun run inm validate examples/memory-fab --blueprint experiment\nbun run inm benchmark examples/memory-fab --benchmark dispatch-research\n\`\`\`\n\nKeep an experiment only when the locked benchmark reports \`verdict KEEP\`.\n`);
await text(join(project, "README.md"), `# Re-entrant DRAM memory fab\n\nThis self-contained INM project is the industrial north-star example. Twelve named wafer lots carry priority and due dates through lithography → etch → deposition, then return to the same lithography and etch work centers before delivery. Their identities survive processing and physical transport, so the evaluator measures complete cycle, queue, processing, transport, on-time, and tardiness behavior instead of inferring it from fungible inventory.\n\nThe model is deliberately a process-flow abstraction, not a claim to encode a proprietary DRAM recipe. Timing and capacity values are synthetic benchmark parameters.\n\nStart with \`bun run inm analyze examples/memory-fab\`, \`bun run inm simulate examples/memory-fab\`, or \`bun run inm studio examples/memory-fab --port 4176\`.\n`);
await text(join(project, ".gitignore"), ".inm/\nruns/\nresults.tsv\n");

const tsconfig = JSON.parse(await readFile(join(project, "assets", "tsconfig.json"), "utf8")) as Record<string, unknown>;
await json(join(project, "assets", "tsconfig.json"), tsconfig);
console.log(`Regenerated ${project}`);
