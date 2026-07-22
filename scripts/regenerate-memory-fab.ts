import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { compileFactoryProject, loadFactoryProject, lockBlueprintBenchmark, specializeSharedWorkCenter } from "../packages/inm-core/src/index";

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
for (const id of ["buffer", "material-sink", "sorter", "splitter", "conveyor", "wind-turbine"]) {
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
    tracking: { kind: "lot", family: "dram-wafer", route: "dram-front-end" }, files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "resources", id, "visual.json"), { shape: "cylinder", texture: null, color, icon: null });
}
for (const [id, name, description, symbol, stackSize, color, tags] of [
  ["dram-package-substrate", "DRAM Package Substrate", "Package substrate and interconnect material consumed when qualified wafer lots are diced and packaged.", "substrate", 32, "#c7a66b", ["semiconductor", "packaging", "material"]],
  ["packaged-dram-device", "Packaged DRAM Device", "Singulated and packaged DRAM device awaiting burn-in and final electrical test.", "device", 32, "#4b8fda", ["semiconductor", "packaging", "wip"]],
  ["tested-dram-device", "Tested DRAM Device", "Finished DRAM device that passed package burn-in and final electrical test.", "device", 32, "#56d89b", ["semiconductor", "memory", "finished-good"]],
] as const) {
  await json(join(project, "assets", "resources", id, "asset.json"), {
    assetVersion: 1, type: "resource", id, name, description, tags,
    unit: { kind: "discrete", symbol, precision: 0 }, transport: { stackSize }, files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "resources", id, "visual.json"), { shape: "box", texture: null, color, icon: null });
}
for (const [id, name, description, color] of [
  ["chamber-clean-kit", "Chamber Clean Kit", "Single-use chemistry and seals for one vacuum-process maintenance service.", "#f0b45a"],
  ["metrology-calibration-kit", "Metrology Calibration Kit", "Traceable standards and consumables for one metrology maintenance service.", "#66c6e3"],
  ["tool-qualification-wafer", "Tool Qualification Wafer", "A sacrificial monitor wafer consumed to requalify a vacuum process tool after maintenance.", "#d7dce4"],
  ["metrology-reference-wafer", "Metrology Reference Wafer", "A traceable reference wafer consumed to release inspection equipment after maintenance.", "#8fd6e8"],
] as const) {
  await json(join(project, "assets", "resources", id, "asset.json"), {
    assetVersion: 1, type: "resource", id, name, description,
    tags: ["semiconductor", "maintenance", "consumable"],
    unit: { kind: "discrete", symbol: "kit", precision: 0 }, transport: { stackSize: 8 },
    files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "resources", id, "visual.json"), { shape: "box", texture: null, color, icon: null });
}
for (const [id, name, description, color] of [
  ["reticle-mask-set-l1", "Cell Layer 1 Reticle Set", "A finite reusable lithography reticle set qualified for the first memory-cell patterning pass.", "#d49cff"],
  ["reticle-mask-set-l2", "Cell Layer 2 Reticle Set", "A finite reusable lithography reticle set qualified for the re-entrant second memory-cell patterning pass.", "#a56ce0"],
] as const) {
  await json(join(project, "assets", "resources", id, "asset.json"), {
    assetVersion: 1, type: "resource", id, name, description,
    tags: ["semiconductor", "lithography", "reusable-tooling"],
    unit: { kind: "discrete", symbol: "set", precision: 0 }, transport: { stackSize: 1 },
    files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "resources", id, "visual.json"), { shape: "box", texture: null, color, icon: null });
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
    utilities: category === "lithography"
      ? [{ utility: "high-vacuum", units: 2 }]
      : category === "etch" || category === "deposition"
        ? [{ utility: "high-vacuum", units: 2 }, { utility: "hazardous-exhaust", units: 1 }]
        : undefined,
    ...(id === "pattern-cell-layer-1" ? { tooling: [{ resource: "reticle-mask-set-l1", count: 1 }] }
      : id === "pattern-cell-layer-2" ? { tooling: [{ resource: "reticle-mask-set-l2", count: 1 }] } : {}),
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

await json(join(project, "processes", "dice-package-dram.process.json"), {
  version: 1, id: "dice-package-dram", name: "Dice and package qualified DRAM devices",
  description: "Terminates one identity-preserving qualified wafer lot and materializes eight packaged DRAM devices using explicit package substrates.",
  category: "packaging", tags: ["dram", "back-end", "packaging", "lot-termination"], durationTicks: 12_000,
  inputs: [{ resource: "qualified-dram-wafer-lot", count: 1 }, { resource: "dram-package-substrate", count: 8 }],
  outputs: [{ resource: "packaged-dram-device", count: 8 }], lotTermination: { terminal: "complete" },
});
await json(join(project, "processes", "burn-in-test-dram.process.json"), {
  version: 1, id: "burn-in-test-dram", name: "Burn in and final-test packaged DRAM devices",
  description: "Runs one eight-device package batch through evaluator-visible burn-in and final electrical test before customer delivery.",
  category: "final-test", tags: ["dram", "back-end", "burn-in", "final-test", "batch"], durationTicks: 20_000,
  inputs: [{ resource: "packaged-dram-device", count: 8 }], outputs: [{ resource: "tested-dram-device", count: 8 }],
});

await json(join(project, "routes", "dram-front-end.route.json"), {
  version: 1, type: "route", id: "dram-front-end", name: "DRAM Front-End Wafer Route",
  description: "Evaluator-owned DRAM work-order route from blank wafer lot through front-end qualification and explicit termination at package conversion.",
  family: "dram-wafer", entry: { resource: "blank-dram-wafer-lot", step: "pattern-cell-layer-1" },
  steps: [
    { id: "pattern-cell-layer-1", name: "Pattern Cell Layer 1", operations: ["pattern-cell-layer-1"], transitions: [{ resource: "patterned-cell-l1-lot", to: "etch-cell-layer-1" }] },
    { id: "etch-cell-layer-1", name: "Etch Cell Layer 1", operations: ["etch-cell-layer-1"], transitions: [{ resource: "etched-cell-l1-lot", to: "deposit-dielectric-stack" }] },
    { id: "deposit-dielectric-stack", name: "Deposit Dielectric Stack", operations: ["deposit-dielectric-stack"], transitions: [{ resource: "dielectric-stack-lot", to: "anneal-dielectric-stack" }] },
    { id: "anneal-dielectric-stack", name: "Anneal Dielectric Stack", operations: ["batch-anneal-dielectric-stack", "rapid-anneal-dielectric-stack"], queueTime: { maximumTicks: 20_000, violationDefects: ["critical-dimension"] }, transitions: [{ resource: "annealed-dielectric-stack-lot", to: "pattern-cell-layer-2" }] },
    { id: "pattern-cell-layer-2", name: "Pattern Cell Layer 2", operations: ["pattern-cell-layer-2"], queueTime: { maximumTicks: 45_000, violationDefects: ["critical-dimension"] }, transitions: [{ resource: "patterned-cell-l2-lot", to: "etch-cell-layer-2" }] },
    { id: "etch-cell-layer-2", name: "Etch Cell Layer 2", operations: ["etch-cell-layer-2"], transitions: [{ resource: "dram-wafer-lot", to: "final-inspection" }] },
    { id: "final-inspection", name: "Final Pattern Inspection", operations: ["inspect-final-pattern-standard", "inspect-final-pattern-deep"], queueTime: { maximumTicks: 35_000, violationDefects: ["particle-contamination"] }, transitions: [
      { resource: "qualified-dram-wafer-lot", to: "package-dram" },
      { resource: "rework-required-dram-wafer-lot", to: "final-pattern-rework" },
      { resource: "scrap-dram-wafer-lot", terminal: "scrap" },
    ] },
    { id: "final-pattern-rework", name: "Final Pattern Rework", operations: ["rework-final-pattern"], transitions: [{ resource: "dram-wafer-lot", to: "final-inspection" }] },
    { id: "package-dram", name: "Dice and Package DRAM", operations: ["dice-package-dram"], transitions: [] },
  ],
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
  processes: string[],
  color: string,
  ports: Array<{ id: string; direction: "input" | "output"; side: "north" | "east" | "south" | "west"; offset: number; buffer: string }>,
  inputPorts: string[],
  outputPorts: string[],
  buildCost: number,
  changeoverTicks?: number,
  maintenance?: {
    maximumJobs: number; durationTicks: number; powerMilliWatts: number;
    service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> };
    qualification: {
      durationTicks: number; powerMilliWatts: number;
      service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> };
    };
    drift?: Array<{
      afterJobs: number; durationMultiplier: { numerator: number; denominator: number };
      powerMultiplier: { numerator: number; denominator: number }; defects: string[];
    }>;
  },
  equipment?: { footprint: { width: number; height: number }; idleMilliWatts: number; activeMilliWatts: number; bufferCapacity?: number },
): Promise<void> {
  const buffers = [...new Set(ports.map((port) => port.buffer))].map((buffer) => ({
    id: buffer,
    role: ports.some((port) => port.buffer === buffer && port.direction === "input") ? "input" : "output",
    capacity: equipment?.bufferCapacity ?? 24,
    accepts: ["*"],
  }));
  await json(join(project, "assets", "devices", id, "asset.json"), {
    assetVersion: 1, type: "device", id, name, description,
    tags: ["semiconductor", "work-center", category], capabilities: ["process"],
    geometry: { footprint: equipment?.footprint ?? { width: 3, height: 3 }, rotatable: true, ports: ports.map((port) => ({ ...port, kind: "resource" })) },
    buffers,
    production: {
      processes, categories: [category], speed: { numerator: 1, denominator: 1 }, inputPorts, outputPorts, modes: [standardMode],
      ...(changeoverTicks ? { changeover: { durationTicks: changeoverTicks, powerMilliWatts: 180_000 } } : {}),
      ...(maintenance ? { maintenance } : {}),
    },
    runtime: { apiVersion: 1, entry: "runtime.ts" },
    power: { idleMilliWatts: equipment?.idleMilliWatts ?? 30_000, activeMilliWatts: equipment?.activeMilliWatts ?? 280_000 }, economics: { buildCost }, files: { visual: "visual.json" },
  });
  await json(join(project, "assets", "devices", id, "visual.json"), { shape: "box", height: 2.4, texture: null, model: null, color, label: name.toUpperCase() });
  await text(join(project, "assets", "devices", id, "runtime.ts"), runtime);
}

await workCenter("lithography-bay", "Lithography Bay", "A scarce qualified lithography work center revisited by the same wafer route.", "lithography", ["pattern-cell-layer-1", "pattern-cell-layer-2"], "#7f5af0", [
  { id: "release-input", direction: "input", side: "west", offset: 1, buffer: "release-input" },
  { id: "reentrant-input", direction: "input", side: "north", offset: 1, buffer: "reentrant-input" },
  { id: "pattern-output", direction: "output", side: "east", offset: 1, buffer: "pattern-output" },
], ["release-input", "reentrant-input"], ["pattern-output"], 18_000, 4_000,
{
  maximumJobs: 8, durationTicks: 9_000, powerMilliWatts: 220_000,
  service: { skill: "vacuum-process", crews: 1, inputs: [{ resource: "chamber-clean-kit", count: 1 }] },
  qualification: {
    durationTicks: 4_000, powerMilliWatts: 260_000,
    service: { skill: "equipment-qualification", crews: 1, inputs: [{ resource: "tool-qualification-wafer", count: 1 }] },
  },
  drift: [{
    afterJobs: 6,
    durationMultiplier: { numerator: 5, denominator: 4 },
    powerMultiplier: { numerator: 11, denominator: 10 },
    defects: ["critical-dimension"],
  }],
});

await workCenter("plasma-etch-bay", "Plasma Etch Bay", "A shared etch work center qualified for both memory-cell layers.", "etch", ["etch-cell-layer-1", "etch-cell-layer-2"], "#ed8b3a", [
  { id: "pattern-input", direction: "input", side: "west", offset: 1, buffer: "pattern-input" },
  { id: "loop-output", direction: "output", side: "east", offset: 1, buffer: "loop-output" },
  { id: "final-output", direction: "output", side: "south", offset: 1, buffer: "final-output" },
], ["pattern-input"], ["loop-output", "final-output"], 12_000, 3_000,
{
  maximumJobs: 8, durationTicks: 7_000, powerMilliWatts: 200_000,
  service: { skill: "vacuum-process", crews: 1, inputs: [{ resource: "chamber-clean-kit", count: 1 }] },
  qualification: {
    durationTicks: 3_500, powerMilliWatts: 220_000,
    service: { skill: "equipment-qualification", crews: 1, inputs: [{ resource: "tool-qualification-wafer", count: 1 }] },
  },
  drift: [{
    afterJobs: 6,
    durationMultiplier: { numerator: 6, denominator: 5 },
    powerMultiplier: { numerator: 6, denominator: 5 },
    defects: ["particle-contamination"],
  }],
});

await workCenter("ald-deposition-bay", "ALD Deposition Bay", "Atomic-layer deposition work center for the DRAM capacitor dielectric stack.", "deposition", ["deposit-dielectric-stack"], "#2cb6a0", [
  { id: "etch-input", direction: "input", side: "west", offset: 1, buffer: "etch-input" },
  { id: "return-output", direction: "output", side: "north", offset: 1, buffer: "return-output" },
], ["etch-input"], ["return-output"], 15_000);

await workCenter("thermal-batch-furnace", "Thermal Batch Furnace", "A carrier-scale furnace that can run an efficient three-lot batch or a faster single-lot rapid cycle.", "thermal", ["batch-anneal-dielectric-stack", "rapid-anneal-dielectric-stack"], "#db7c4b", [
  { id: "batch-input", direction: "input", side: "south", offset: 1, buffer: "batch-input" },
  { id: "batch-output", direction: "output", side: "west", offset: 1, buffer: "batch-output" },
], ["batch-input"], ["batch-output"], 16_000);

await workCenter("wafer-inspection-bay", "Wafer Inspection Bay", "Inline patterned-wafer inspection qualified for standard optical and deep electrical disposition.", "inspection", ["inspect-final-pattern-standard", "inspect-final-pattern-deep"], "#3fa7d6", [
  { id: "wafer-input", direction: "input", side: "north", offset: 1, buffer: "wafer-input" },
  { id: "pass-output", direction: "output", side: "west", offset: 1, buffer: "pass-output" },
  { id: "reject-output", direction: "output", side: "east", offset: 1, buffer: "reject-output" },
  { id: "scrap-output", direction: "output", side: "south", offset: 1, buffer: "scrap-output" },
], ["wafer-input"], ["pass-output", "reject-output", "scrap-output"], 22_000, undefined,
{
  maximumJobs: 5, durationTicks: 6_000, powerMilliWatts: 150_000,
  service: { skill: "metrology", crews: 1, inputs: [{ resource: "metrology-calibration-kit", count: 1 }] },
  qualification: {
    durationTicks: 3_000, powerMilliWatts: 170_000,
    service: { skill: "metrology-qualification", crews: 1, inputs: [{ resource: "metrology-reference-wafer", count: 1 }] },
  },
});

await workCenter("rapid-metrology-cell", "Rapid Optical Metrology Cell", "Compact high-throughput optical metrology qualified only for standard final-pattern screening.", "inspection", ["inspect-final-pattern-standard"], "#35c2c1", [
  { id: "wafer-input", direction: "input", side: "north", offset: 1, buffer: "wafer-input" },
  { id: "pass-output", direction: "output", side: "west", offset: 1, buffer: "pass-output" },
  { id: "reject-output", direction: "output", side: "east", offset: 1, buffer: "reject-output" },
  { id: "scrap-output", direction: "output", side: "south", offset: 1, buffer: "scrap-output" },
], ["wafer-input"], ["pass-output", "reject-output", "scrap-output"], 6_500, undefined,
{
  maximumJobs: 8, durationTicks: 4_000, powerMilliWatts: 90_000,
  service: { skill: "metrology", crews: 1, inputs: [{ resource: "metrology-calibration-kit", count: 1 }] },
  qualification: {
    durationTicks: 2_000, powerMilliWatts: 110_000,
    service: { skill: "metrology-qualification", crews: 1, inputs: [{ resource: "metrology-reference-wafer", count: 1 }] },
  },
},
{ footprint: { width: 3, height: 3 }, idleMilliWatts: 20_000, activeMilliWatts: 180_000 });

await workCenter("pattern-rework-bay", "Pattern Rework Bay", "Qualified recovery cell for repairable final-pattern excursions.", "rework", ["rework-final-pattern"], "#f2a93b", [
  { id: "reject-input", direction: "input", side: "west", offset: 1, buffer: "reject-input" },
  { id: "recovered-output", direction: "output", side: "east", offset: 1, buffer: "recovered-output" },
], ["reject-input"], ["recovered-output"], 10_000);

await workCenter("dram-packaging-cell", "DRAM Packaging Cell", "Back-end work center that dices a qualified wafer lot, consumes package substrates, and ends the wafer-lot route as packaged devices.", "packaging", ["dice-package-dram"], "#b98a52", [
  { id: "wafer-input", direction: "input", side: "east", offset: 1, buffer: "wafer-input" },
  { id: "substrate-input", direction: "input", side: "west", offset: 1, buffer: "substrate-input" },
  { id: "package-output", direction: "output", side: "south", offset: 1, buffer: "package-output" },
], ["wafer-input", "substrate-input"], ["package-output"], 18_000, undefined, undefined,
{ footprint: { width: 3, height: 3 }, idleMilliWatts: 25_000, activeMilliWatts: 210_000, bufferCapacity: 128 });

await workCenter("dram-burn-in-rack", "DRAM Burn-in and Final-test Rack", "Batch back-end equipment that holds packaged DRAM devices through burn-in and final electrical test.", "final-test", ["burn-in-test-dram"], "#397bb8", [
  { id: "package-input", direction: "input", side: "north", offset: 1, buffer: "package-input" },
  { id: "tested-output", direction: "output", side: "west", offset: 1, buffer: "tested-output" },
], ["package-input"], ["tested-output"], 14_000, undefined, undefined,
{ footprint: { width: 3, height: 3 }, idleMilliWatts: 35_000, activeMilliWatts: 240_000 });

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

await json(join(project, "assets", "devices", "maintenance-service-bay", "asset.json"), {
  assetVersion: 1, type: "device", id: "maintenance-service-bay", name: "Maintenance Service Bay",
  description: "A shared cleanroom service team with one physical crew and a project-local maintenance consumables store.",
  tags: ["semiconductor", "maintenance", "utility"], capabilities: ["maintain"],
  geometry: {
    footprint: { width: 2, height: 2 }, rotatable: true,
    ports: [{ id: "service-store-input", direction: "input", kind: "resource", side: "west", offset: 0, buffer: "service-store" }],
  },
  buffers: [{
    id: "service-store", role: "input", capacity: 64,
    accepts: ["chamber-clean-kit", "metrology-calibration-kit", "tool-qualification-wafer", "metrology-reference-wafer"],
  }],
  maintenanceProvider: {
    skills: ["vacuum-process", "metrology", "equipment-qualification", "metrology-qualification"],
    crews: 1, serviceRadius: 35, inventoryBuffer: "service-store",
  },
  runtime: { apiVersion: 1, entry: "runtime.ts" },
  power: { idleMilliWatts: 15_000, activeMilliWatts: 50_000 },
  economics: { buildCost: 5_000 }, files: { visual: "visual.json" },
});
await json(join(project, "assets", "devices", "maintenance-service-bay", "visual.json"), {
  shape: "box", height: 1.8, texture: null, model: null, color: "#e2a84a", label: "SERVICE",
});
await text(join(project, "assets", "devices", "maintenance-service-bay", "runtime.ts"),
  `import type { DeviceProgram } from "../../runtime-api";\n\nexport default {\n  apiVersion: 1,\n  evaluate() { return { kind: "wait", reason: "idle" }; },\n} satisfies DeviceProgram;\n`);

await json(join(project, "assets", "devices", "reticle-stocker", "asset.json"), {
  assetVersion: 1, type: "device", id: "reticle-stocker", name: "Reticle Stocker",
  description: "A local cleanroom stocker with finite physical reticle inventory shared by nearby lithography equipment.",
  tags: ["semiconductor", "lithography", "reusable-tooling"], capabilities: ["tooling"],
  geometry: {
    footprint: { width: 2, height: 2 }, rotatable: true,
    ports: [{ id: "reticle-load", direction: "input", kind: "resource", side: "west", offset: 0, buffer: "reticle-inventory" }],
  },
  buffers: [{
    id: "reticle-inventory", role: "input", capacity: 4,
    accepts: ["reticle-mask-set-l1", "reticle-mask-set-l2"],
  }],
  toolingProvider: {
    serviceRadius: 16, inventoryBuffer: "reticle-inventory",
    stock: [{ resource: "reticle-mask-set-l1", count: 1 }, { resource: "reticle-mask-set-l2", count: 1 }],
  },
  runtime: { apiVersion: 1, entry: "runtime.ts" },
  power: { idleMilliWatts: 8_000, activeMilliWatts: 8_000 },
  economics: { buildCost: 6_000 }, files: { visual: "visual.json" },
});
await json(join(project, "assets", "devices", "reticle-stocker", "visual.json"), {
  shape: "box", height: 1.8, texture: null, model: null, color: "#9f6be8", label: "RETICLES",
});
await text(join(project, "assets", "devices", "reticle-stocker", "runtime.ts"),
  `import type { DeviceProgram } from "../../runtime-api";\n\nexport default {\n  apiVersion: 1,\n  evaluate() { return { kind: "wait", reason: "idle" }; },\n} satisfies DeviceProgram;\n`);

await json(join(project, "assets", "devices", "fab-utility-plant", "asset.json"), {
  assetVersion: 1, type: "device", id: "fab-utility-plant", name: "Fab Utility Plant",
  description: "A placed cleanroom facility plant supplying finite shared high-vacuum and hazardous-exhaust capacity to nearby process equipment.",
  tags: ["semiconductor", "facility", "vacuum", "exhaust"], capabilities: ["utility"],
  geometry: { footprint: { width: 3, height: 3 }, rotatable: true, ports: [] }, buffers: [],
  utilityProvider: {
    serviceRadius: 35,
    capacities: [{ utility: "high-vacuum", units: 6 }, { utility: "hazardous-exhaust", units: 2 }],
  },
  runtime: { apiVersion: 1, entry: "runtime.ts" },
  power: { idleMilliWatts: 65_000, activeMilliWatts: 65_000 },
  economics: { buildCost: 9_000 }, files: { visual: "visual.json" },
});
await json(join(project, "assets", "devices", "fab-utility-plant", "visual.json"), {
  shape: "cylinder", height: 2.8, texture: null, model: null, color: "#58b7c8", label: "FAB UTILITIES",
});
await text(join(project, "assets", "devices", "fab-utility-plant", "runtime.ts"),
  `import type { DeviceProgram } from "../../runtime-api";\n\nexport default {\n  apiVersion: 1,\n  evaluate() { return { kind: "wait", reason: "idle" }; },\n} satisfies DeviceProgram;\n`);

type Device = Record<string, unknown>;
type Connection = Record<string, unknown>;
const devices: Device[] = [
  { id: "lot-release", asset: "buffer", region: "cleanroom", position: { x: 2, y: 13 }, rotation: 0, bufferFilters: { storage: ["blank-dram-wafer-lot"] } },
  { id: "substrate-receiving", asset: "buffer", region: "cleanroom", position: { x: 2, y: 20 }, rotation: 0, bufferFilters: { storage: ["dram-package-substrate"] } },
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
  {
    id: "packaging-1", asset: "dram-packaging-cell", region: "cleanroom", position: { x: 8, y: 20 }, rotation: 0,
    recipe: {
      process: "dice-package-dram", mode: "qualified",
      inputs: { "qualified-dram-wafer-lot": "wafer-input", "dram-package-substrate": "substrate-input" },
      outputs: { "packaged-dram-device": "package-output" },
    },
    policy: { lotDispatch: "earliest-due-date", powerPriority: 6 },
  },
  {
    id: "burn-in-1", asset: "dram-burn-in-rack", region: "cleanroom", position: { x: 8, y: 26 }, rotation: 0,
    recipe: { process: "burn-in-test-dram", mode: "qualified", inputs: { "packaged-dram-device": "package-input" }, outputs: { "tested-dram-device": "tested-output" } },
    policy: { powerPriority: 5 },
  },
  { id: "memory-customer", asset: "material-sink", region: "cleanroom", position: { x: 2, y: 27 }, rotation: 0, bufferFilters: { input: ["tested-dram-device"] } },
  { id: "quality-scrap", asset: "scrap-bin", region: "cleanroom", position: { x: 17, y: 27 }, rotation: 90, bufferFilters: { input: ["scrap-dram-wafer-lot"] } },
  { id: "reticle-stocker-1", asset: "reticle-stocker", region: "cleanroom", position: { x: 5, y: 8 }, rotation: 0 },
  { id: "maintenance-service-1", asset: "maintenance-service-bay", region: "cleanroom", position: { x: 34, y: 26 }, rotation: 0 },
  { id: "fab-utility-plant-1", asset: "fab-utility-plant", region: "cleanroom", position: { x: 34, y: 12 }, rotation: 0 },
  { id: "cleanroom-power-a", asset: "wind-turbine", region: "cleanroom", position: { x: 4, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-b", asset: "wind-turbine", region: "cleanroom", position: { x: 12, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-c", asset: "wind-turbine", region: "cleanroom", position: { x: 20, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-d", asset: "wind-turbine", region: "cleanroom", position: { x: 28, y: 3 }, rotation: 0 },
  { id: "cleanroom-power-e", asset: "wind-turbine", region: "cleanroom", position: { x: 22, y: 15 }, rotation: 0 },
  { id: "shipping-power", asset: "wind-turbine", region: "cleanroom", position: { x: 1, y: 30 }, rotation: 0 },
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
connect("inspection-to-packaging", { device: "inspection-1", port: "pass-output", side: "west" }, { device: "packaging-1", port: "wafer-input", side: "east" }, ["qualified-dram-wafer-lot"], [
  { x: 16, y: 21 }, { x: 15, y: 21 }, { x: 14, y: 21 }, { x: 13, y: 21 }, { x: 12, y: 21 }, { x: 11, y: 21 },
]);
connect("substrate-receiving-to-packaging", { device: "substrate-receiving", port: "output", side: "east" }, { device: "packaging-1", port: "substrate-input", side: "west" }, ["dram-package-substrate"], [
  { x: 3, y: 20 }, { x: 4, y: 20 }, { x: 4, y: 21 }, { x: 5, y: 21 }, { x: 6, y: 21 }, { x: 7, y: 21 },
]);
connect("packaging-to-burn-in", { device: "packaging-1", port: "package-output", side: "south" }, { device: "burn-in-1", port: "package-input", side: "north" }, ["packaged-dram-device"], [
  { x: 9, y: 23 }, { x: 9, y: 24 }, { x: 9, y: 25 },
]);
connect("burn-in-to-customer", { device: "burn-in-1", port: "tested-output", side: "west" }, { device: "memory-customer", port: "input", side: "west" }, ["tested-dram-device"], [
  { x: 7, y: 27 }, { x: 6, y: 27 }, { x: 5, y: 27 }, { x: 4, y: 27 },
  { x: 4, y: 28 }, { x: 4, y: 29 }, { x: 3, y: 29 }, { x: 2, y: 29 }, { x: 1, y: 29 }, { x: 0, y: 29 },
  { x: 0, y: 28 }, { x: 0, y: 27 }, { x: 1, y: 27 },
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

const blueprint = { version: 1, revision: "memory-fab-product-v1", devices, connections, logisticsNetworks: [], policies: { dispatch: "shortage-first", powerAllocation: "priority-load-shedding" } };
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
await json(join(project, "blueprints", "tool-search-seed.blueprint.json"), {
  ...experimentBlueprint, revision: "memory-fab-tool-search-seed-v1",
});
await json(join(project, "blueprints", "experiment.blueprint.json"), experimentBlueprint);
await json(join(project, "inm.json"), { version: 1, id: "memory-fab", name: "Re-entrant DRAM Memory Fab", defaultWorld: "cleanroom", defaultBlueprint: "baseline", defaultScenario: "production-window", defaultObjective: "dram-output" });
await json(join(project, "worlds", "cleanroom.world.json"), { version: 1, id: "cleanroom", name: "DRAM Integrated Fab", regions: [{ id: "cleanroom", name: "Memory Fab Industrial Zone", kind: "industrial-zone", coordinates: { x: 0, y: 0, z: 0 }, bounds: { width: 40, height: 32 } }], resourceNodes: [] });

const lotReleases = Array.from({ length: 12 }, (_, index) => ({
    id: `dram-lot-${String(index + 1).padStart(2, "0")}`,
    device: "lot-release", buffer: "storage", resource: "blank-dram-wafer-lot",
    releaseTick: index * 6_000,
    priority: index >= 9 ? 10 : index >= 6 ? 5 : 1,
    dueTick: 240_000 - index * 10_000,
  }));
const materialDeliveries = Array.from({ length: 12 }, (_, index) => ({
  id: `substrate-delivery-${String(index + 1).padStart(2, "0")}`,
  device: "substrate-receiving", buffer: "storage", resource: "dram-package-substrate",
  count: 8, releaseTick: index * 6_000,
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
    id, name, durationTicks: 240_000, lotReleases, materialDeliveries, initialSetups, qualityExcursions,
    initialBuffers: {
      "maintenance-service-1": { "service-store": {
        "chamber-clean-kit": 16, "metrology-calibration-kit": 16,
        "tool-qualification-wafer": 16, "metrology-reference-wafer": 16,
      } },
    },
    initialEnergyMilliJoules: {}, failures,
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
  { device: "lithography-1", atTick: 48_000, durationTicks: 30_000 },
]);
await scenario("facility-interruption", "Four-minute excursion-free window with a fab utility interruption", [], [
  { device: "fab-utility-plant-1", atTick: 48_000, durationTicks: 30_000 },
]);
await json(join(project, "objectives", "dram-output.objective.json"), {
  id: "dram-output", name: "Deliver tested DRAM devices with controlled wafer-lot service", targetResource: "tested-dram-device", trackedFamily: "dram-wafer", targetRegion: "cleanroom", targetRatePerMinute: 20,
  constraints: { maxBuildCost: 210_000, maxOccupiedArea: 350, minProduction: 8 },
  weights: {
    throughput: 20, onTimeDelivery: 20, energy: 0.005, buildCost: 0.05, occupiedArea: 0.05, wip: 1.5,
    blocked: 3, cycleTime: 2, tardiness: 4, changeovers: 0.5, qualityEscapes: 15, rework: 0.5,
  },
});
await json(join(project, "tests", "reentrant-flow.fixture.json"), {
  name: "reentrant DRAM route closes deterministic inspection rework and scrap loops", world: "cleanroom", blueprint: "baseline", scenario: "production-window", objective: "dram-output", seed: 42,
  assertions: [
    { kind: "metric", path: "produced.tested-dram-device", min: 16 },
    { kind: "metric", path: "throughputPerMinute", min: 4 },
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
    { kind: "metric", path: "productionTooling.totalAllocations", min: 12 },
    { kind: "metric", path: "productionTooling.resources.reticle-mask-set-l1.unitsAllocated", min: 6 },
    { kind: "metric", path: "productionTooling.resources.reticle-mask-set-l2.unitsAllocated", min: 6 },
    { kind: "event", type: "device.tooling-acquired", present: true },
    { kind: "event", type: "device.tooling-released", present: true },
    { kind: "metric", path: "productionUtilities.totalAllocations", min: 30 },
    { kind: "metric", path: "productionUtilities.utilities.high-vacuum.unitsAllocated", min: 60 },
    { kind: "metric", path: "productionUtilities.utilities.hazardous-exhaust.unitsAllocated", min: 20 },
    { kind: "event", type: "device.utility-acquired", present: true },
    { kind: "event", type: "device.utility-released", present: true },
    { kind: "metric", path: "equipmentMaintenance.totalMandatory", min: 1 },
    { kind: "metric", path: "equipmentMaintenance.totalMaintenanceTicks", min: 1 },
    { kind: "metric", path: "equipmentMaintenance.totalDriftedJobs", min: 1 },
    { kind: "metric", path: "equipmentMaintenance.totalDriftedLots", min: 1 },
    { kind: "metric", path: "equipmentMaintenance.totalDriftDefects", min: 1 },
    { kind: "metric", path: "qualityFlow.rejectedInspections", min: 2 },
    { kind: "metric", path: "qualityFlow.totalReworkCycles", min: 2 },
    { kind: "metric", path: "qualityFlow.scrapDispositions", min: 1 },
    { kind: "metric", path: "qualityFlow.escapedDefects", equals: 0 },
    { kind: "metric", path: "batchFlow.jobs", min: 4 },
    { kind: "metric", path: "batchFlow.averageLotsPerJob", equals: 3 },
    { kind: "event", type: "device.start", present: true },
    { kind: "event", type: "lot.released", present: true },
    { kind: "event", type: "device.changeover-finish", present: true },
    { kind: "event", type: "device.maintenance-finish", present: true },
    { kind: "event", type: "device.process-drift", present: true },
    { kind: "event", type: "lot.completed", present: true },
    { kind: "event", type: "lot.route-terminated", present: true },
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
    { id: "facility-interruption", name: "Timed fab utility interruption", world: "cleanroom", scenario: "facility-interruption", objective: "dram-output", seed: 42, weight: 1 },
  ],
  acceptance: { minimumAggregateScoreDelta: 0.001, maximumCaseScoreRegression: 2, requireCandidateCapacityReady: true },
});
let specializedSource = await loadFactoryProject(project, {
  blueprint: "experiment", world: "cleanroom", scenario: "steady-production", objective: "dram-output",
});
let specializedProject = compileFactoryProject(specializedSource);
for (const request of [
  { device: "lithography-1", process: "pattern-cell-layer-2", cloneId: "lithography-2" },
  { device: "etch-1", process: "etch-cell-layer-2", cloneId: "etch-2" },
]) {
  const result = specializeSharedWorkCenter(specializedProject, specializedProject.blueprint, request);
  if (!result) throw new Error(`Could not regenerate dedicated memory-fab work center '${request.device}'`);
  specializedSource = { ...specializedSource, blueprint: result.blueprint };
  specializedProject = compileFactoryProject(specializedSource);
}
specializedProject.blueprint.devices.push({
  id: "fab-utility-plant-2", asset: "fab-utility-plant", region: "cleanroom", position: { x: 34, y: 17 }, rotation: 0,
});
specializedSource = { ...specializedSource, blueprint: specializedProject.blueprint };
specializedProject = compileFactoryProject(specializedSource);
for (const device of specializedProject.blueprint.devices) {
  const minimumJobs = device.id === "inspection-1" ? 4 : undefined;
  if (minimumJobs !== undefined) device.policy = {
    ...device.policy, preventiveMaintenance: { minimumJobs },
  };
}
specializedSource = { ...specializedSource, blueprint: specializedProject.blueprint };
specializedProject = compileFactoryProject(specializedSource);
await json(join(project, "blueprints", "experiment.blueprint.json"), {
  ...specializedProject.blueprint, revision: "memory-fab-facility-utilities-v1",
});
await lockBlueprintBenchmark(project, "dispatch-research");

await text(join(project, "AUTORESEARCH.md"), `# Memory-fab autoresearch program\n\nEdit exactly one file: \`blueprints/experiment.blueprint.json\`. The locked benchmark compares it with \`baseline.blueprint.json\` across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption. Case inputs are immutable; only the candidate Blueprint may change.\n\nTwelve named wafer lots become available six seconds apart. Before each Scenario-owned \`releaseTick\` a lot is scheduled outside the fab; admission into \`lot-release\` is capacity-gated and records actual release delay. Planned starts, due dates, quality excursions, and failures are fixed test workload, so a candidate cannot improve its score by deleting or postponing work. A candidate may add \`policies.lotRelease\` as explicit CONWIP code: \`maximumWip\` is the hard card count, \`reopenAtWip\` controls replenishment-wave hysteresis, and \`dispatch\` chooses among eligible identities.\n\nThe wafer route revisits \`lithography-1\` and \`etch-1\`. Their \`recipes\` arrays declare qualified operations; \`policy.recipeDispatch\` chooses among ready route steps while \`policy.lotDispatch\` chooses identity-preserving wafer lots within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power.\n\nBetween deposition and the second lithography pass, the baseline furnace requires three dielectric-stack lots before one fixed twelve-second anneal job may start. The same three lot identities leave together, and the evaluator owns actual lots/job plus pre-start batch queue wait. A six-second single-lot rapid-anneal Process is qualified on the same physical furnace, so batch policy is a visible Blueprint recipe choice instead of scheduler magic.\n\nAfter final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The immutable baseline uses fixed-batch anneal, standard inspection, authored operation order, FIFO lots, and open-loop admission.\n\nThe checked-in candidate contains three kept hypotheses: earliest-due-date operation and lot dispatch on both re-entrant work centers, deep inspection, and single-lot rapid anneal. Deep inspection catches latent electrical defects and converts otherwise escaped lots into terminal scrap. Rapid anneal removes the baseline's three-lot formation gate but spends more furnace time per lot. Under scheduled arrivals the combined candidate accepts a small excursion-free score regression inside the declared per-case gate in exchange for stronger mixed-quality, excursion, and interruption results; the aggregate locked score remains the authority. Continue from this candidate rather than resetting it.\n\nThe TypeScript command \`bun run memory-fab:research-release\` sweeps CONWIP maximum/reopen/dispatch settings in memory against this incumbent without editing either Blueprint. The first 225-policy sweep found settings that improved aggregate score through lower WIP and completed-lot cycle time, but those settings exceeded the fixed per-case regression gate; settings inside the gate did not improve the incumbent aggregate. That robust negative result is intentional evidence, so the candidate remains open-loop until another layout, equipment, dispatch, or control change satisfies both conditions.\n\nCoding Agents may next test \`minimize-changeover\`, tool duplication, parallel inspection, furnace duplication, buffers, routes, power, or \`policies.lotRelease\` by editing the candidate Blueprint only. Scheduled/released/pending lots, release interval/delay, peak WIP, controller/capacity blocked lot-time, yield, quality escapes, rework, scrap, batch jobs, lots per batch, batch wait, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.\n\nRun:\n\n\`\`\`bash\nbun run inm validate examples/memory-fab --blueprint experiment\nbun run inm analyze examples/memory-fab --blueprint experiment\nbun run inm benchmark examples/memory-fab --benchmark dispatch-research\nbun run memory-fab:research-release -- --min-cap 10 --max-cap 12\n\`\`\`\n\nKeep an experiment only when the locked benchmark reports \`verdict KEEP\`. The aggregate score must improve, and no individual operating condition may regress by more than the declared gate. Record every attempt in the ignored project-local \`results.tsv\` so failed hypotheses remain useful.\n`);
await text(join(project, "README.md"), `# Re-entrant DRAM memory fab\n\nThis self-contained INM project is the industrial north-star example. Twelve named wafer lots become available six seconds apart, carry priority and due dates through lithography → etch → deposition → thermal anneal, then return to the same lithography and etch work centers before inline inspection. Scheduled lots remain outside factory WIP until their capacity-gated and optional Blueprint CONWIP release succeeds. Their identities and latent defect state then survive processing and physical transport. The baseline furnace starts only when three lots are resident and returns the same three identities after one fixed batch job; its alternative rapid-anneal Process handles one lot at a time. Lithography masks and etch recipes are explicit setup groups, so every layer transition occupies shared equipment, consumes power, and competes with due-date service. Fixed process excursions exercise repairable critical-dimension defects, terminal particle contamination, and latent electrical defects missed by standard inspection. Lots physically branch through pass, selective rework, or scrap routes.\n\nEquipment condition is equally physical. Usage drift changes cycle time, power, and defect exposure until a provider performs maintenance with the required clean/calibration kit. Service completion then creates a separate qualification job: vacuum tools consume sacrificial tool-qualification wafers, metrology consumes reference wafers, the corresponding skilled crew is reserved, and production remains locked until that powered qualification finishes. A failed qualification retries only the release phase instead of repeating completed service.\n\nThe locked Coding Agent benchmark evaluates one candidate Blueprint across excursion-free production, mixed quality work, a systematic excursion, and a timed lithography interruption. This prevents a layout or policy from winning only by memorizing one defect schedule. The evaluator measures scheduled/released/pending work, planned and actual release cadence, peak active lots, physical/controller blocked lot-time, good and first-pass yield, inspection count, rework, scrap, quality escape, actual lots per batch, pre-start batch queue wait, complete cycle, queue, processing, transport, changeover, maintenance/qualification work and consumables, on-time service, tardiness, and per-case score instead of inferring them from fungible inventory.\n\nThe model is deliberately a process-flow abstraction, not a claim to encode a proprietary DRAM recipe or inspection algorithm. Timing, defect, and capacity values are synthetic benchmark parameters. Start with \`bun run inm analyze examples/memory-fab\`, \`bun run inm simulate examples/memory-fab\`, \`bun run inm benchmark examples/memory-fab --benchmark dispatch-research\`, \`bun run memory-fab:research-release\`, or \`bun run inm studio examples/memory-fab --port 4176\`.\n`);
const autoresearchPath = join(project, "AUTORESEARCH.md");
const generatedAutoresearch = await readFile(autoresearchPath, "utf8");
await text(autoresearchPath, generatedAutoresearch
  .replace(
    "Twelve named wafer lots become available six seconds apart.",
    "The benchmark target is a delivered tested DRAM device, not a qualified wafer-lot proxy. One qualified wafer lot plus eight scheduled package substrates enters the explicit dice/package Process; that Process terminates the tracked wafer work order and creates eight fungible packaged devices. An eight-device burn-in/final-test batch then feeds the customer boundary. Product throughput is counted in devices while cycle time, tardiness, yield, and WIP remain attached to the source `dram-wafer` family. Twelve named wafer lots and twelve eight-substrate shipments become available six seconds apart.",
  )
  .replace(
    "across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption.",
    "across five evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, a timed lithography interruption, and a timed fab-utility interruption.",
  )
  .replace(
    "`reopenAtWip` controls replenishment-wave hysteresis, and `dispatch` chooses among eligible identities.",
    "`reopenAtWip` controls replenishment-wave hysteresis, optional `maximumReleaseDelayTicks` protects admission service without exceeding the cap, and `dispatch` chooses among eligible identities.",
  )
  .replace(
    "\n\nThe wafer route revisits `lithography-1` and `etch-1`.",
    "\n\n`inm plan` treats those twelve scheduled blank-wafer lots as fixed external supply over the four-minute Scenario instead of demanding a fictional extractor. It also allocates required lithography and etch device-time across the exact qualification matrix. A shared bay owns one clock even when it qualifies both DRAM layers; the dedicated candidate tools provide separate physical clocks. The benchmark requires every candidate case to report capacity READY, so a score improvement cannot hide a toolset, raw-supply, logistics, utility-power, or other target-rate gap. Setup, maintenance, utility contention, failures, and dispatch-dependent queues are still judged by the locked event simulation.\n\nThe wafer route revisits `lithography-1` and `etch-1`.",
  )
  .replace(
    "Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power.",
    "Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power. Each lithography Process also reserves its own finite physical reticle set from the placed `reticle-stocker-1` for the complete job; power loss retains that reservation and equipment failure traps it until recovery. Reticles remain in provider inventory and are never counted as consumed material. The stocker's project-local Device asset bundles one layer-1 and one layer-2 set into every placed instance, so duplicating it in the Blueprint purchases another complete package with real cost, area, power, and service reach; Scenarios cannot inject free reticles. Optional `policy.setupCampaign` may hold that switch until `minimumReadyLots` are resident, with `maximumHoldTicks` as the starvation guard. Route-owned Q-time windows measure the complete delay from step entry to physical job start; transport, batch formation, setup, maintenance, power loss and tool queues consume the same clock, and a late start adds fixed defects before ordinary inspection/rework/scrap disposition.",
  )
  .replace(
    "The checked-in candidate contains three kept hypotheses: earliest-due-date operation and lot dispatch on both re-entrant work centers, deep inspection, and single-lot rapid anneal. Deep inspection catches latent electrical defects and converts otherwise escaped lots into terminal scrap. Rapid anneal removes the baseline's three-lot formation gate but spends more furnace time per lot. Under scheduled arrivals the combined candidate accepts a small excursion-free score regression inside the declared per-case gate in exchange for stronger mixed-quality, excursion, and interruption results; the aggregate locked score remains the authority. Continue from this candidate rather than resetting it.",
    "The checked-in candidate contains six kept hypotheses: earliest-due-date lot dispatch, deep inspection, single-lot rapid anneal, dedicated layer-2 lithography/etch tools, inspection-only opportunistic preventive maintenance, and a second placed fab-utility plant. The physical specialization is an ordinary Blueprint diff: it copies project-local equipment assets, narrows each Device qualification, splits exact Resource lanes, routes a short elevated crossing, and owns separate setup and maintenance state. Equipment assets also own deterministic usage drift. Maintenance is physical factory work followed by a separate equipment-release phase. Lithography, etch, and ALD jobs atomically reserve finite high-vacuum and hazardous-exhaust capacity; a provider outage interlocks affected work, while the second costed plant keeps subsequent work moving as N+1 capacity. The current checked-in benchmark lock is the score authority; continue from this candidate rather than resetting it.",
  )
  .replace(
    "The TypeScript command `bun run memory-fab:research-release` sweeps CONWIP maximum/reopen/dispatch settings in memory against this incumbent without editing either Blueprint. The first 225-policy sweep found settings that improved aggregate score through lower WIP and completed-lot cycle time, but those settings exceeded the fixed per-case regression gate; settings inside the gate did not improve the incumbent aggregate. That robust negative result is intentional evidence, so the candidate remains open-loop until another layout, equipment, dispatch, or control change satisfies both conditions.",
    "The TypeScript commands `bun run memory-fab:research-release` and `bun run memory-fab:research-campaign` search admission and setup control without editing a Blueprint. Their earlier sweeps are retained as historical negative evidence. Because physical specialization and facility capacity change the queueing regime, rerun them against the current candidate before adopting a controller.\n\n`bun run memory-fab:research-tools` starts from the frozen `tool-search-seed` Blueprint, extracts layer-2 qualifications into project-local dedicated tools, jointly ranks position and rotation, compares ground and elevated routes, rebuilds explicit sorter ownership, and evaluates every topology across the locked cases. `--write-best` writes only a strict gate-passing improvement.\n\n`bun run memory-fab:research-maintenance` searches 27 Blueprint timing policies without changing asset physics. Its pre-utility sweep selected lithography off / etch off / inspection 4; rerun it after facility changes rather than treating the historical score as timeless.\n\n`bun run memory-fab:research-metrology` compares seven explicit equipment architectures across capital layouts, equipment-specific maintenance, and lot dispatch. Re-run this search after changing equipment physics; its prior rejection remains historical evidence rather than a timeless result.",
  )
  .replace(
    "Coding Agents may next test `minimize-changeover`, tool duplication, parallel inspection, furnace duplication, buffers, routes, power, or `policies.lotRelease` by editing the candidate Blueprint only. Scheduled/released/pending lots, release interval/delay, peak WIP, controller/capacity blocked lot-time, yield, quality escapes, rework, scrap, batch jobs, lots per batch, batch wait, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.",
    "Coding Agents may next test utility-plant count/placement, reticle-stocker count/placement, paired same-layer lithography capacity, a second service crew, service-bay placement, qualification-wafer inventory, furnace duplication, buffers, routes, power, `policies.lotRelease`, or `policy.setupCampaign` by editing the candidate Blueprint only. Facility allocations, capacity-unit time, waits, blocks, provider trips, reusable-tool occupancy, maintenance, quality, cycle time, tardiness, throughput, WIP, energy, cost, and area are evaluator-owned measurements.",
  )
  .replace(
    "bun run memory-fab:research-release -- --min-cap 10 --max-cap 12\n```",
    "bun run memory-fab:research-release -- --min-cap 10 --max-cap 12\nbun run memory-fab:research-release -- --joint --min-cap 10 --max-cap 10 --min-reopen 3 --max-reopen 7 --release-dispatch fifo\nbun run memory-fab:research-campaign\nbun run memory-fab:research-campaign -- --maximum-wip 10 --reopen-at-wip 4 --release-dispatch fifo\nbun run memory-fab:research-tools\nbun run memory-fab:research-maintenance\nbun run memory-fab:research-metrology\nbun run memory-fab:research-qtime\n```",
  )
  .replace(
    "The aggregate score must improve, and no individual operating condition may regress by more than the declared gate.",
    "The aggregate score must improve, every candidate case must remain capacity READY, and no individual operating condition may regress by more than the declared gate.",
  ));

const projectReadmePath = join(project, "README.md");
const generatedReadme = await readFile(projectReadmePath, "utf8");
await text(projectReadmePath, generatedReadme
  .replace(
    "\n\nEquipment condition is equally physical.",
    "\n\nThe modeled factory now crosses the wafer-to-product boundary. Twelve fixed shipments of eight package substrates enter through a placed receiving buffer and a physical lane. Each qualified wafer lot is diced and packaged into eight ordinary packaged devices; that Process explicitly completes the tracked wafer work order rather than renaming one lot into eight objects. Burn-in and final electrical test run in eight-device batches before the customer boundary. The Objective counts delivered tested devices while retaining `dram-wafer` cycle, tardiness, WIP, and quality service. This mirrors the public wafer-probe → package-good-die → final-test/burn-in structure while keeping all timing and yield values synthetic.\n\nEquipment condition is equally physical.",
  )
  .replace(
    "\n\nEquipment condition is equally physical.",
    "\n\nThe static target-rate planner now models that same equipment boundary: required layer-1 and layer-2 work is fractionally allocated across the physical lithography and etch qualification graphs, while the twelve Scenario-scheduled blank-wafer lots are fixed external supply. The candidate's extra tools reduce each toolset's planned load instead of creating duplicate paper capacity. Capacity READY is a hard gate in all five benchmark cases; time-dependent losses remain simulation-owned.\n\nEquipment condition is equally physical.",
  )
  .replace(
    "across excursion-free production, mixed quality work, a systematic excursion, and a timed lithography interruption.",
    "across excursion-free production, mixed quality work, a systematic excursion, a timed lithography interruption, and a timed fab-utility interruption. The last condition interlocks affected in-flight work and lets surviving capacity serve subsequent starts.",
  )
  .replace(
    "# Re-entrant DRAM memory fab\n\n",
    "# Re-entrant DRAM memory fab\n\nThe project-local `routes/dram-front-end.route.json` freezes the evaluator-owned DRAM product flow as an explicit state machine; Blueprints may allocate qualified tools and dispatch work but cannot skip, reorder, or invent wafer operations.\n\nThree synthetic Q-time contracts make internal process delay part of quality physics: dielectric stacks must start anneal within 20 seconds, annealed lots must return to layer-2 lithography within 45 seconds, and final inspection must start within 35 seconds. Transport, batch formation, setup, maintenance, power and tool queues consume these windows. A late start adds evaluator-owned defects that flow through the ordinary inspection, rework and scrap model.\n\n",
  )
  .replace(
    "Lithography masks and etch recipes are explicit setup groups, so every layer transition occupies shared equipment, consumes power, and competes with due-date service.",
    "Lithography masks and etch recipes are explicit setup groups, so every layer transition occupies shared equipment, consumes power, and competes with due-date service. The two lithography Processes separately require finite layer-1 and layer-2 reticle sets held by a placed stocker; a set is reserved for the complete powered job, survives power pauses, remains trapped on a failed bay until recovery, and is returned without entering material-consumption totals. Lithography, etch, and ALD also atomically reserve finite facility capacity from placed utility plants: high vacuum for all three classes and hazardous exhaust for etch and ALD. These services are not belt Resources or hidden speed multipliers. The kept candidate buys a second costed, powered plant so its dedicated layer-2 tools can actually run concurrently. Every placed stocker purchases its asset-bundled pair of reticle sets as part of its build cost; Scenarios cannot inject free tooling, so provider count and placement remain honest Blueprint decisions. Optional Blueprint setup campaigns can retain a mask/recipe until enough target lots accumulate or an exact maximum hold expires. The kept candidate also buys dedicated layer-2 lithography and etch tools, splits their exact material lanes, and uses an elevated crossing to gain parallel capacity without hidden equipment pools. Lithography, etch, and inspection assets own synthetic usage-based maintenance limits and fixed work. Every maintenance contract requires a placed in-range provider, and all maintained tools compete for one shared cleanroom crew.",
  )
  .replace(
    "peak active lots, physical/controller blocked lot-time",
    "peak active lots, maximum-delay service openings, physical/controller blocked lot-time, setup-campaign holds and release causes, reusable-tool allocations/occupancy/wait, facility allocations/capacity-time/wait/blocks/provider trips, mandatory/opportunistic/cancelled maintenance work, consumable/crew wait, service crew-time and consumed kits",
  )
  .replace(
    "`bun run memory-fab:research-release`, or `bun run inm studio",
    "`bun run memory-fab:research-release`, `bun run memory-fab:research-campaign`, `bun run memory-fab:research-tools`, `bun run memory-fab:research-maintenance`, `bun run memory-fab:research-metrology`, `bun run memory-fab:research-qtime`, or `bun run inm studio",
  ));

await text(join(project, ".gitignore"), ".inm/\nruns/\nresults.tsv\n");

const tsconfig = JSON.parse(await readFile(join(project, "assets", "tsconfig.json"), "utf8")) as Record<string, unknown>;
await json(join(project, "assets", "tsconfig.json"), tsconfig);
console.log(`Regenerated ${project}`);
