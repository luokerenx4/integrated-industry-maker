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
  ["annealed-dielectric-stack-lot", "Annealed Dielectric Stack Lot", "Wafer lot released from a batch thermal anneal and ready for the second lithography pass.", "#45a6a0"],
  ["patterned-cell-l2-lot", "Patterned Cell L2 Lot", "Re-entrant wafer lot after the second lithography pass.", "#9c75ef"],
  ["dram-wafer-lot", "Unqualified DRAM Wafer Lot", "Completed front-end DRAM wafer lot awaiting inline quality disposition.", "#58d68d"],
  ["qualified-dram-wafer-lot", "Qualified DRAM Wafer Lot", "Defect-screened DRAM wafer lot released to wafer sort and downstream packaging.", "#42d392"],
  ["rework-required-dram-wafer-lot", "Rework-required DRAM Wafer Lot", "Inspected DRAM wafer lot routed to a qualified recovery operation.", "#f4b942"],
  ["scrap-dram-wafer-lot", "Scrap DRAM Wafer Lot", "DRAM wafer lot whose quality disposition is terminal scrap.", "#e25555"],
] as const;
for (const [id, name, description, color] of resources) {
  await json(join(project, "assets", "resources", id, "asset.json"), {
    assetVersion: 1, type: "resource", id, name, description,
    tags: ["semiconductor", "wafer-lot", id === "qualified-dram-wafer-lot" ? "finished" : id === "scrap-dram-wafer-lot" ? "scrap" : "wip"],
    unit: { kind: "discrete", symbol: "lot", precision: 0 }, transport: { stackSize: 1 },
    tracking: { kind: "lot", family: "dram-wafer" }, files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "resources", id, "visual.json"), { shape: "cylinder", texture: null, color, icon: null });
}

const processes = [
  ["pattern-cell-layer-1", "Pattern memory-cell layer 1", "lithography", "photo-mask-l1", 6_000, "blank-dram-wafer-lot", "patterned-cell-l1-lot"],
  ["etch-cell-layer-1", "Etch memory-cell layer 1", "etch", "etch-recipe-l1", 5_000, "patterned-cell-l1-lot", "etched-cell-l1-lot"],
  ["deposit-dielectric-stack", "Deposit capacitor dielectric stack", "deposition", "ald-dielectric", 7_000, "etched-cell-l1-lot", "dielectric-stack-lot"],
  ["pattern-cell-layer-2", "Pattern memory-cell layer 2", "lithography", "photo-mask-l2", 6_000, "annealed-dielectric-stack-lot", "patterned-cell-l2-lot"],
  ["etch-cell-layer-2", "Etch memory-cell layer 2", "etch", "etch-recipe-l2", 5_000, "patterned-cell-l2-lot", "dram-wafer-lot"],
] as const;
for (const [id, name, category, setupGroup, durationTicks, input, output] of processes) {
  await json(join(project, "processes", `${id}.process.json`), {
    version: 1, id, name,
    description: `${name} as one qualified operation in the re-entrant DRAM front-end route.`,
    category, tags: ["dram", "front-end", "re-entrant"], setupGroup, durationTicks,
    inputs: [{ resource: input, count: 1 }], outputs: [{ resource: output, count: 1 }],
  });
}

await json(join(project, "processes", "batch-anneal-dielectric-stack.process.json"), {
  version: 1, id: "batch-anneal-dielectric-stack", name: "Batch anneal capacitor dielectric stacks",
  description: "A three-lot furnace cycle that waits for a complete carrier batch before thermal annealing.",
  category: "thermal", tags: ["dram", "front-end", "batch", "thermal"], durationTicks: 12_000,
  inputs: [{ resource: "dielectric-stack-lot", count: 3 }], outputs: [{ resource: "annealed-dielectric-stack-lot", count: 3 }],
});
await json(join(project, "processes", "rapid-anneal-dielectric-stack.process.json"), {
  version: 1, id: "rapid-anneal-dielectric-stack", name: "Rapid anneal one dielectric stack lot",
  description: "A single-lot thermal cycle with lower queue delay but less carrier-level energy and capacity efficiency.",
  category: "thermal", tags: ["dram", "front-end", "single-lot", "thermal"], durationTicks: 6_000,
  inputs: [{ resource: "dielectric-stack-lot", count: 1 }], outputs: [{ resource: "annealed-dielectric-stack-lot", count: 1 }],
});

for (const inspection of [
  { id: "inspect-final-pattern-standard", name: "Standard final patterned-wafer inspection", durationTicks: 4_000, detects: ["critical-dimension", "particle-contamination"] },
  { id: "inspect-final-pattern-deep", name: "Deep final patterned-wafer inspection", durationTicks: 8_000, detects: ["critical-dimension", "latent-electrical", "particle-contamination"] },
]) await json(join(project, "processes", `${inspection.id}.process.json`), {
  version: 1, id: inspection.id, name: inspection.name,
  description: `${inspection.name} classifies each identity-preserving wafer lot into pass, rework, or terminal scrap.`,
  category: "inspection", tags: ["dram", "quality", "inline-inspection"], durationTicks: inspection.durationTicks,
  inputs: [{ resource: "dram-wafer-lot", count: 1 }], outputs: [{ resource: "qualified-dram-wafer-lot", count: 1 }],
  quality: {
    kind: "inspection", detects: inspection.detects, rejectResource: "rework-required-dram-wafer-lot",
    scrapResource: "scrap-dram-wafer-lot", maxReworkCycles: 1,
  },
});

await json(join(project, "processes", "rework-final-pattern.process.json"), {
  version: 1, id: "rework-final-pattern", name: "Recover final pattern excursion",
  description: "A selective recovery operation that can repair critical-dimension excursions but not particle or latent electrical defects.",
  category: "rework", tags: ["dram", "quality", "rework"], durationTicks: 8_000,
  inputs: [{ resource: "rework-required-dram-wafer-lot", count: 1 }], outputs: [{ resource: "dram-wafer-lot", count: 1 }],
  quality: { kind: "rework", repairs: ["critical-dimension"] },
});

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
  changeoverTicks?: number,
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
    production: {
      categories: [category], speed: { numerator: 1, denominator: 1 }, inputPorts, outputPorts, modes: [standardMode],
      ...(changeoverTicks ? { changeover: { durationTicks: changeoverTicks, powerMilliWatts: 180_000 } } : {}),
    },
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
], ["release-input", "reentrant-input"], ["pattern-output"], 18_000, 4_000);

await workCenter("plasma-etch-bay", "Plasma Etch Bay", "A shared etch work center qualified for both memory-cell layers.", "etch", "#ed8b3a", [
  { id: "pattern-input", direction: "input", side: "west", offset: 1, buffer: "pattern-input" },
  { id: "loop-output", direction: "output", side: "east", offset: 1, buffer: "loop-output" },
  { id: "final-output", direction: "output", side: "south", offset: 1, buffer: "final-output" },
], ["pattern-input"], ["loop-output", "final-output"], 12_000, 3_000);

await workCenter("ald-deposition-bay", "ALD Deposition Bay", "Atomic-layer deposition work center for the DRAM capacitor dielectric stack.", "deposition", "#2cb6a0", [
  { id: "etch-input", direction: "input", side: "west", offset: 1, buffer: "etch-input" },
  { id: "return-output", direction: "output", side: "north", offset: 1, buffer: "return-output" },
], ["etch-input"], ["return-output"], 15_000);

await workCenter("thermal-batch-furnace", "Thermal Batch Furnace", "A carrier-scale furnace that can run an efficient three-lot batch or a faster single-lot rapid cycle.", "thermal", "#db7c4b", [
  { id: "batch-input", direction: "input", side: "south", offset: 1, buffer: "batch-input" },
  { id: "batch-output", direction: "output", side: "west", offset: 1, buffer: "batch-output" },
], ["batch-input"], ["batch-output"], 16_000);

await workCenter("wafer-inspection-bay", "Wafer Inspection Bay", "Inline patterned-wafer inspection that performs deterministic pass, rework, and scrap disposition.", "inspection", "#3fa7d6", [
  { id: "wafer-input", direction: "input", side: "north", offset: 1, buffer: "wafer-input" },
  { id: "pass-output", direction: "output", side: "west", offset: 1, buffer: "pass-output" },
  { id: "reject-output", direction: "output", side: "east", offset: 1, buffer: "reject-output" },
  { id: "scrap-output", direction: "output", side: "south", offset: 1, buffer: "scrap-output" },
], ["wafer-input"], ["pass-output", "reject-output", "scrap-output"], 22_000);

await workCenter("pattern-rework-bay", "Pattern Rework Bay", "Qualified recovery cell for repairable final-pattern excursions.", "rework", "#f2a93b", [
  { id: "reject-input", direction: "input", side: "west", offset: 1, buffer: "reject-input" },
  { id: "recovered-output", direction: "output", side: "east", offset: 1, buffer: "recovered-output" },
], ["reject-input"], ["recovered-output"], 10_000);

await cp(join(ironworksAssets, "devices", "material-sink"), join(project, "assets", "devices", "scrap-bin"), { recursive: true, force: true });
const scrapAsset = JSON.parse(await readFile(join(ironworksAssets, "devices", "material-sink", "asset.json"), "utf8")) as Record<string, unknown>;
await json(join(project, "assets", "devices", "scrap-bin", "asset.json"), {
  ...scrapAsset,
  id: "scrap-bin",
  name: "Quality Scrap Bin",
  description: "Terminal quality disposition that destroys rejected tracked lots without counting delivery.",
  tags: ["quality", "scrap", "terminal"],
  capabilities: ["discard"],
});
await json(join(project, "assets", "devices", "scrap-bin", "visual.json"), {
  shape: "box", height: 1.2, texture: null, model: null, color: "#8f3c45", label: "SCRAP",
});

type Device = Record<string, unknown>;
type Connection = Record<string, unknown>;
const devices: Device[] = [
  { id: "lot-release", asset: "buffer", region: "cleanroom", position: { x: 2, y: 13 }, rotation: 0, bufferFilters: { storage: ["blank-dram-wafer-lot"] } },
  {
    id: "lithography-1", asset: "lithography-bay", region: "cleanroom", position: { x: 8, y: 12 }, rotation: 0,
    recipes: [
      { process: "pattern-cell-layer-1", mode: "qualified", priority: 1, inputs: { "blank-dram-wafer-lot": "release-input" }, outputs: { "patterned-cell-l1-lot": "pattern-output" } },
      { process: "pattern-cell-layer-2", mode: "qualified", priority: 10, inputs: { "annealed-dielectric-stack-lot": "reentrant-input" }, outputs: { "patterned-cell-l2-lot": "pattern-output" } },
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
  {
    id: "furnace-1", asset: "thermal-batch-furnace", region: "cleanroom", position: { x: 25, y: 5 }, rotation: 0,
    recipe: {
      process: "batch-anneal-dielectric-stack", mode: "qualified",
      inputs: { "dielectric-stack-lot": "batch-input" }, outputs: { "annealed-dielectric-stack-lot": "batch-output" },
    },
    policy: { lotDispatch: "fifo", powerPriority: 8 },
  },
  {
    id: "inspection-1", asset: "wafer-inspection-bay", region: "cleanroom", position: { x: 17, y: 20 }, rotation: 0,
    recipe: {
      process: "inspect-final-pattern-standard", mode: "qualified",
      inputs: { "dram-wafer-lot": "wafer-input" },
      outputs: {
        "qualified-dram-wafer-lot": "pass-output",
        "rework-required-dram-wafer-lot": "reject-output",
        "scrap-dram-wafer-lot": "scrap-output",
      },
    },
    policy: { lotDispatch: "fifo", powerPriority: 7 },
  },
  {
    id: "rework-1", asset: "pattern-rework-bay", region: "cleanroom", position: { x: 27, y: 20 }, rotation: 0,
    recipe: {
      process: "rework-final-pattern", mode: "qualified",
      inputs: { "rework-required-dram-wafer-lot": "reject-input" },
      outputs: { "dram-wafer-lot": "recovered-output" },
    },
    policy: { lotDispatch: "fifo", powerPriority: 6 },
  },
  { id: "wafer-sort-boundary", asset: "material-sink", region: "cleanroom", position: { x: 8, y: 20 }, rotation: 0, bufferFilters: { input: ["qualified-dram-wafer-lot"] } },
  { id: "quality-scrap", asset: "scrap-bin", region: "cleanroom", position: { x: 17, y: 27 }, rotation: 90, bufferFilters: { input: ["scrap-dram-wafer-lot"] } },
  { id: "cleanroom-power-a", asset: "wind-turbine", region: "cleanroom", position: { x: 4, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-b", asset: "wind-turbine", region: "cleanroom", position: { x: 12, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-c", asset: "wind-turbine", region: "cleanroom", position: { x: 20, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-d", asset: "wind-turbine", region: "cleanroom", position: { x: 28, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-e", asset: "wind-turbine", region: "cleanroom", position: { x: 22, y: 15 }, rotation: 0 },
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
connect("deposition-to-batch-furnace", { device: "deposition-1", port: "return-output", side: "north" }, { device: "furnace-1", port: "batch-input", side: "south" }, ["dielectric-stack-lot"], [
  { x: 26, y: 11 }, { x: 26, y: 10 }, { x: 26, y: 9 }, { x: 26, y: 8 },
]);
connect("batch-furnace-to-lithography", { device: "furnace-1", port: "batch-output", side: "west" }, { device: "lithography-1", port: "reentrant-input", side: "north" }, ["annealed-dielectric-stack-lot"], [
  { x: 24, y: 6 }, { x: 23, y: 6 }, { x: 22, y: 6 }, { x: 21, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 6 }, { x: 18, y: 6 }, { x: 17, y: 6 },
  { x: 16, y: 6 }, { x: 15, y: 6 }, { x: 14, y: 6 }, { x: 13, y: 6 }, { x: 12, y: 6 }, { x: 11, y: 6 }, { x: 10, y: 6 }, { x: 9, y: 6 },
  { x: 9, y: 7 }, { x: 9, y: 8 }, { x: 9, y: 9 }, { x: 9, y: 10 }, { x: 9, y: 11 },
]);
connect("etch-to-inspection", { device: "etch-1", port: "final-output", side: "south" }, { device: "inspection-1", port: "wafer-input", side: "north" }, ["dram-wafer-lot"], [
  { x: 18, y: 15 }, { x: 18, y: 16 }, { x: 18, y: 17 }, { x: 18, y: 18 }, { x: 18, y: 19 },
]);
connect("inspection-to-wafer-sort", { device: "inspection-1", port: "pass-output", side: "west" }, { device: "wafer-sort-boundary", port: "input", side: "west" }, ["qualified-dram-wafer-lot"], [
  { x: 16, y: 21 }, { x: 15, y: 21 }, { x: 14, y: 21 }, { x: 13, y: 21 }, { x: 12, y: 21 }, { x: 11, y: 21 }, { x: 10, y: 21 },
  { x: 10, y: 22 }, { x: 9, y: 22 }, { x: 8, y: 22 }, { x: 7, y: 22 }, { x: 7, y: 21 }, { x: 7, y: 20 },
]);
connect("inspection-to-rework", { device: "inspection-1", port: "reject-output", side: "east" }, { device: "rework-1", port: "reject-input", side: "west" }, ["rework-required-dram-wafer-lot"], [
  { x: 20, y: 21 }, { x: 21, y: 21 }, { x: 22, y: 21 }, { x: 23, y: 21 }, { x: 24, y: 21 }, { x: 25, y: 21 }, { x: 26, y: 21 },
]);
connect("rework-to-inspection", { device: "rework-1", port: "recovered-output", side: "east" }, { device: "inspection-1", port: "wafer-input", side: "north" }, ["dram-wafer-lot"], [
  { x: 30, y: 21 }, { x: 31, y: 21 }, { x: 31, y: 20 }, { x: 31, y: 19 }, { x: 31, y: 18 }, { x: 31, y: 17 },
  { x: 30, y: 17 }, { x: 29, y: 17 }, { x: 28, y: 17 }, { x: 27, y: 17 }, { x: 26, y: 17 }, { x: 25, y: 17 }, { x: 24, y: 17 }, { x: 23, y: 17 }, { x: 22, y: 17 }, { x: 21, y: 17 }, { x: 20, y: 17 }, { x: 19, y: 17 }, { x: 18, y: 17 }, { x: 18, y: 18 }, { x: 18, y: 19 },
]);
connect("inspection-to-scrap", { device: "inspection-1", port: "scrap-output", side: "south" }, { device: "quality-scrap", port: "input", side: "north" }, ["scrap-dram-wafer-lot"], [
  { x: 18, y: 23 }, { x: 18, y: 24 }, { x: 18, y: 25 }, { x: 17, y: 25 }, { x: 17, y: 26 },
]);

const blueprint = { version: 1, revision: "memory-fab-batch-v4", devices, connections, logisticsNetworks: [], policies: { dispatch: "shortage-first", powerAllocation: "priority-load-shedding" } };
const experimentBlueprint = structuredClone(blueprint);
for (const device of experimentBlueprint.devices) if (["lithography-1", "etch-1"].includes(String(device.id))) {
  device.policy = { ...(device.policy as Record<string, unknown>), recipeDispatch: "earliest-due-date", lotDispatch: "earliest-due-date" };
}
const experimentInspection = experimentBlueprint.devices.find((device) => device.id === "inspection-1");
if (experimentInspection?.recipe && typeof experimentInspection.recipe === "object") {
  (experimentInspection.recipe as Record<string, unknown>).process = "inspect-final-pattern-deep";
}
const experimentFurnace = experimentBlueprint.devices.find((device) => device.id === "furnace-1");
if (experimentFurnace?.recipe && typeof experimentFurnace.recipe === "object") {
  (experimentFurnace.recipe as Record<string, unknown>).process = "rapid-anneal-dielectric-stack";
}
await json(join(project, "blueprints", "baseline.blueprint.json"), blueprint);
await json(join(project, "blueprints", "experiment.blueprint.json"), experimentBlueprint);
await json(join(project, "inm.json"), { version: 1, id: "memory-fab", name: "Re-entrant DRAM Memory Fab", defaultWorld: "cleanroom", defaultBlueprint: "baseline", defaultScenario: "production-window", defaultObjective: "dram-output" });
await json(join(project, "worlds", "cleanroom.world.json"), { version: 1, id: "cleanroom", name: "DRAM Front-End Cleanroom", regions: [{ id: "cleanroom", name: "Memory Fab Cleanroom", kind: "industrial-zone", coordinates: { x: 0, y: 0, z: 0 }, bounds: { width: 40, height: 30 } }], resourceNodes: [] });

const lotReleases = Array.from({ length: 12 }, (_, index) => ({
    id: `dram-lot-${String(index + 1).padStart(2, "0")}`,
    device: "lot-release", buffer: "storage", resource: "blank-dram-wafer-lot",
    releaseTick: index * 6_000,
    priority: index >= 9 ? 10 : index >= 6 ? 5 : 1,
    dueTick: 240_000 - index * 10_000,
  }));
const initialSetups = { "lithography-1": "photo-mask-l1", "etch-1": "etch-recipe-l1" };
const mixedExcursions = [
  { id: "cd-excursion-lot-03", process: "etch-cell-layer-2", lot: "dram-lot-03", defects: ["critical-dimension"] },
  { id: "particle-excursion-lot-08", process: "etch-cell-layer-2", lot: "dram-lot-08", defects: ["particle-contamination"] },
  { id: "latent-electrical-lot-11", process: "etch-cell-layer-2", lot: "dram-lot-11", defects: ["latent-electrical"] },
];

async function scenario(
  id: string,
  name: string,
  qualityExcursions: Array<{ id: string; process: string; lot: string; defects: string[] }>,
  failures: Array<{ device: string; atTick: number; durationTicks: number }> = [],
): Promise<void> {
  await json(join(project, "scenarios", `${id}.scenario.json`), {
    id, name, durationTicks: 240_000, lotReleases, initialSetups, qualityExcursions, initialEnergyMilliJoules: {}, failures,
  });
}

await scenario("steady-production", "Four-minute excursion-free DRAM production window", []);
await scenario("production-window", "Four-minute mixed-quality DRAM production window", mixedExcursions);
await scenario("quality-excursion", "Four-minute systematic DRAM quality-excursion window", [
  { id: "cd-excursion-lot-02", process: "etch-cell-layer-2", lot: "dram-lot-02", defects: ["critical-dimension"] },
  { id: "cd-excursion-lot-05", process: "etch-cell-layer-2", lot: "dram-lot-05", defects: ["critical-dimension"] },
  { id: "particle-excursion-lot-07", process: "etch-cell-layer-2", lot: "dram-lot-07", defects: ["particle-contamination"] },
  { id: "particle-excursion-lot-10", process: "etch-cell-layer-2", lot: "dram-lot-10", defects: ["particle-contamination"] },
  { id: "latent-electrical-lot-08", process: "etch-cell-layer-2", lot: "dram-lot-08", defects: ["latent-electrical"] },
  { id: "latent-electrical-lot-11", process: "etch-cell-layer-2", lot: "dram-lot-11", defects: ["latent-electrical"] },
]);
await scenario("lithography-interruption", "Four-minute mixed-quality window with a lithography interruption", mixedExcursions, [
  { device: "lithography-1", atTick: 60_000, durationTicks: 30_000 },
]);
await json(join(project, "objectives", "dram-output.objective.json"), {
  id: "dram-output", name: "Deliver qualified DRAM wafer lots with controlled quality loss", targetResource: "qualified-dram-wafer-lot", targetRegion: "cleanroom", targetRatePerMinute: 2.5,
  constraints: { maxBuildCost: 140_000, maxOccupiedArea: 320, minProduction: 4 },
  weights: {
    throughput: 20, onTimeDelivery: 20, energy: 0.005, buildCost: 0.05, occupiedArea: 0.05, wip: 1.5,
    blocked: 3, cycleTime: 2, tardiness: 4, changeovers: 0.5, qualityEscapes: 15, rework: 0.5,
  },
});
await json(join(project, "tests", "reentrant-flow.fixture.json"), {
  name: "reentrant DRAM route closes deterministic inspection rework and scrap loops", world: "cleanroom", blueprint: "baseline", scenario: "production-window", objective: "dram-output", seed: 42,
  assertions: [
    { kind: "metric", path: "produced.qualified-dram-wafer-lot", min: 4 },
    { kind: "metric", path: "throughputPerMinute", min: 1 },
    { kind: "metric", path: "machineUtilization.lithography-1", min: 0.2 },
    { kind: "metric", path: "machineUtilization.etch-1", min: 0.2 },
    { kind: "metric", path: "lotFlow.released", equals: 12 },
    { kind: "metric", path: "releaseFlow.pending", equals: 0 },
    { kind: "metric", path: "releaseFlow.meanPlannedIntervalTicks", equals: 6_000 },
    { kind: "metric", path: "releaseFlow.meanReleaseDelayTicks", equals: 0 },
    { kind: "metric", path: "releaseFlow.control", equals: "open-loop" },
    { kind: "metric", path: "releaseFlow.peakActiveLots", equals: 12 },
    { kind: "metric", path: "releaseFlow.controlBlockedLots", equals: 0 },
    { kind: "metric", path: "lotFlow.completed", min: 4 },
    { kind: "metric", path: "lotFlow.meanCycleTimeTicks", min: 1 },
    { kind: "metric", path: "equipmentSetups.totalChangeovers", min: 2 },
    { kind: "metric", path: "qualityFlow.rejectedInspections", min: 2 },
    { kind: "metric", path: "qualityFlow.totalReworkCycles", min: 2 },
    { kind: "metric", path: "qualityFlow.scrapDispositions", min: 1 },
    { kind: "metric", path: "qualityFlow.escapedDefects", equals: 1 },
    { kind: "metric", path: "batchFlow.jobs", min: 4 },
    { kind: "metric", path: "batchFlow.averageLotsPerJob", equals: 3 },
    { kind: "event", type: "device.start", present: true },
    { kind: "event", type: "lot.released", present: true },
    { kind: "event", type: "device.changeover-finish", present: true },
    { kind: "event", type: "lot.completed", present: true },
    { kind: "event", type: "lot.quality-excursion", present: true },
    { kind: "event", type: "lot.inspected", present: true },
    { kind: "event", type: "lot.reworked", present: true },
    { kind: "event", type: "lot.scrapped", present: true },
  ],
});
await json(join(project, "benchmarks", "dispatch-research.benchmark.json"), {
  version: 1, id: "dispatch-research", name: "DRAM Multi-condition Blueprint Research",
  baselineBlueprint: "baseline", candidateBlueprint: "experiment",
  cases: [
    { id: "steady-production", name: "Excursion-free production", world: "cleanroom", scenario: "steady-production", objective: "dram-output", seed: 42, weight: 1 },
    { id: "mixed-quality", name: "Mixed repair, scrap, and escape workload", world: "cleanroom", scenario: "production-window", objective: "dram-output", seed: 42, weight: 2 },
    { id: "quality-excursion", name: "Systematic quality excursion", world: "cleanroom", scenario: "quality-excursion", objective: "dram-output", seed: 42, weight: 2 },
    { id: "lithography-interruption", name: "Timed lithography interruption", world: "cleanroom", scenario: "lithography-interruption", objective: "dram-output", seed: 42, weight: 1 },
  ],
  acceptance: { minimumAggregateScoreDelta: 0.001, maximumCaseScoreRegression: 2, requireCandidateCapacityReady: false },
});
await lockBlueprintBenchmark(project, "dispatch-research");

await text(join(project, "AUTORESEARCH.md"), `# Memory-fab autoresearch program\n\nEdit exactly one file: \`blueprints/experiment.blueprint.json\`. The locked benchmark compares it with \`baseline.blueprint.json\` across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption. Case inputs are immutable; only the candidate Blueprint may change.\n\nTwelve named wafer lots become available six seconds apart. Before each Scenario-owned \`releaseTick\` a lot is scheduled outside the fab; admission into \`lot-release\` is capacity-gated and records actual release delay. Planned starts, due dates, quality excursions, and failures are fixed test workload, so a candidate cannot improve its score by deleting or postponing work. A candidate may add \`policies.lotRelease\` as explicit CONWIP code: \`maximumWip\` is the hard card count, \`reopenAtWip\` controls replenishment-wave hysteresis, and \`dispatch\` chooses among eligible identities.\n\nThe wafer route revisits \`lithography-1\` and \`etch-1\`. Their \`recipes\` arrays declare qualified operations; \`policy.recipeDispatch\` chooses among ready route steps while \`policy.lotDispatch\` chooses identity-preserving wafer lots within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power.\n\nBetween deposition and the second lithography pass, the baseline furnace requires three dielectric-stack lots before one fixed twelve-second anneal job may start. The same three lot identities leave together, and the evaluator owns actual lots/job plus pre-start batch queue wait. A six-second single-lot rapid-anneal Process is qualified on the same physical furnace, so batch policy is a visible Blueprint recipe choice instead of scheduler magic.\n\nAfter final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The immutable baseline uses fixed-batch anneal, standard inspection, authored operation order, FIFO lots, and open-loop admission.\n\nThe checked-in candidate contains three kept hypotheses: earliest-due-date operation and lot dispatch on both re-entrant work centers, deep inspection, and single-lot rapid anneal. Deep inspection catches latent electrical defects and converts otherwise escaped lots into terminal scrap. Rapid anneal removes the baseline's three-lot formation gate but spends more furnace time per lot. Under scheduled arrivals the combined candidate accepts a small excursion-free score regression inside the declared per-case gate in exchange for stronger mixed-quality, excursion, and interruption results; the aggregate locked score remains the authority. Continue from this candidate rather than resetting it.\n\nThe TypeScript command \`bun run memory-fab:research-release\` sweeps CONWIP maximum/reopen/dispatch settings in memory against this incumbent without editing either Blueprint. The first 225-policy sweep found settings that improved aggregate score through lower WIP and completed-lot cycle time, but those settings exceeded the fixed per-case regression gate; settings inside the gate did not improve the incumbent aggregate. That robust negative result is intentional evidence, so the candidate remains open-loop until another layout, equipment, dispatch, or control change satisfies both conditions.\n\nCoding Agents may next test \`minimize-changeover\`, tool duplication, parallel inspection, furnace duplication, buffers, routes, power, or \`policies.lotRelease\` by editing the candidate Blueprint only. Scheduled/released/pending lots, release interval/delay, peak WIP, controller/capacity blocked lot-time, yield, quality escapes, rework, scrap, batch jobs, lots per batch, batch wait, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.\n\nRun:\n\n\`\`\`bash\nbun run inm validate examples/memory-fab --blueprint experiment\nbun run inm analyze examples/memory-fab --blueprint experiment\nbun run inm benchmark examples/memory-fab --benchmark dispatch-research\nbun run memory-fab:research-release -- --min-cap 10 --max-cap 12\n\`\`\`\n\nKeep an experiment only when the locked benchmark reports \`verdict KEEP\`. The aggregate score must improve, and no individual operating condition may regress by more than the declared gate. Record every attempt in the ignored project-local \`results.tsv\` so failed hypotheses remain useful.\n`);
await text(join(project, "README.md"), `# Re-entrant DRAM memory fab\n\nThis self-contained INM project is the industrial north-star example. Twelve named wafer lots become available six seconds apart, carry priority and due dates through lithography → etch → deposition → thermal anneal, then return to the same lithography and etch work centers before inline inspection. Scheduled lots remain outside factory WIP until their capacity-gated and optional Blueprint CONWIP release succeeds. Their identities and latent defect state then survive processing and physical transport. The baseline furnace starts only when three lots are resident and returns the same three identities after one fixed batch job; its alternative rapid-anneal Process handles one lot at a time. Lithography masks and etch recipes are explicit setup groups, so every layer transition occupies shared equipment, consumes power, and competes with due-date service. Fixed process excursions exercise repairable critical-dimension defects, terminal particle contamination, and latent electrical defects missed by standard inspection. Lots physically branch through pass, selective rework, or scrap routes.\n\nThe locked Coding Agent benchmark evaluates one candidate Blueprint across excursion-free production, mixed quality work, a systematic excursion, and a timed lithography interruption. This prevents a layout or policy from winning only by memorizing one defect schedule. The evaluator measures scheduled/released/pending work, planned and actual release cadence, peak active lots, physical/controller blocked lot-time, good and first-pass yield, inspection count, rework, scrap, quality escape, actual lots per batch, pre-start batch queue wait, complete cycle, queue, processing, transport, changeover, on-time service, tardiness, and per-case score instead of inferring them from fungible inventory.\n\nThe model is deliberately a process-flow abstraction, not a claim to encode a proprietary DRAM recipe or inspection algorithm. Timing, defect, and capacity values are synthetic benchmark parameters. Start with \`bun run inm analyze examples/memory-fab\`, \`bun run inm simulate examples/memory-fab\`, \`bun run inm benchmark examples/memory-fab --benchmark dispatch-research\`, \`bun run memory-fab:research-release\`, or \`bun run inm studio examples/memory-fab --port 4176\`.\n`);
await text(join(project, ".gitignore"), ".inm/\nruns/\nresults.tsv\n");

const tsconfig = JSON.parse(await readFile(join(project, "assets", "tsconfig.json"), "utf8")) as Record<string, unknown>;
await json(join(project, "assets", "tsconfig.json"), tsconfig);
console.log(`Regenerated ${project}`);
