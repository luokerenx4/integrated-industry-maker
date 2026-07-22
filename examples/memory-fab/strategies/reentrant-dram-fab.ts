import type { Blueprint, ProjectSynthesisStrategy } from "./runtime-api";

type Side = "north" | "east" | "south" | "west";
type Point = { x: number; y: number };

function requireIds(kind: string, available: readonly string[], required: readonly string[]): void {
  const missing = required.filter((id) => !available.includes(id));
  if (missing.length) throw new Error(`memory-fab synthesis requires ${kind}: ${missing.join(", ")}`);
}

function buildBlueprint(): Blueprint {
  const devices: Blueprint["devices"] = [
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
      recipe: { process: "deposit-dielectric-stack", mode: "qualified", inputs: { "etched-cell-l1-lot": "etch-input" }, outputs: { "dielectric-stack-lot": "return-output" } }, policy: { powerPriority: 8 },
    },
    {
      id: "furnace-1", asset: "thermal-batch-furnace", region: "cleanroom", position: { x: 25, y: 5 }, rotation: 0,
      recipe: { process: "batch-anneal-dielectric-stack", mode: "qualified", inputs: { "dielectric-stack-lot": "batch-input" }, outputs: { "annealed-dielectric-stack-lot": "batch-output" } },
      policy: { lotDispatch: "fifo", powerPriority: 8 },
    },
    {
      id: "inspection-1", asset: "wafer-inspection-bay", region: "cleanroom", position: { x: 17, y: 20 }, rotation: 0,
      recipe: { process: "inspect-final-pattern-standard", mode: "qualified", inputs: { "dram-wafer-lot": "wafer-input" }, outputs: { "qualified-dram-wafer-lot": "pass-output", "rework-required-dram-wafer-lot": "reject-output", "scrap-dram-wafer-lot": "scrap-output" } },
      policy: { lotDispatch: "fifo", powerPriority: 7 },
    },
    {
      id: "rework-1", asset: "pattern-rework-bay", region: "cleanroom", position: { x: 27, y: 20 }, rotation: 0,
      recipe: { process: "rework-final-pattern", mode: "qualified", inputs: { "rework-required-dram-wafer-lot": "reject-input" }, outputs: { "dram-wafer-lot": "recovered-output" } },
      policy: { lotDispatch: "fifo", powerPriority: 6 },
    },
    {
      id: "probe-1", asset: "dram-wafer-probe-cell", region: "cleanroom", position: { x: 12, y: 20 }, rotation: 0,
      recipe: { process: "probe-sort-dram-standard", mode: "qualified", inputs: { "qualified-dram-wafer-lot": "wafer-input" }, outputs: { "known-good-dram-die": "die-output" } },
      policy: { lotDispatch: "earliest-due-date", powerPriority: 6 },
    },
    {
      id: "packaging-1", asset: "dram-packaging-cell", region: "cleanroom", position: { x: 7, y: 20 }, rotation: 0,
      recipe: { process: "package-known-good-dram", mode: "qualified", inputs: { "known-good-dram-die": "die-input", "dram-package-substrate": "substrate-input" }, outputs: { "packaged-dram-device": "package-output" } },
      policy: { lotDispatch: "earliest-due-date", powerPriority: 6 },
    },
    {
      id: "burn-in-1", asset: "dram-burn-in-rack", region: "cleanroom", position: { x: 8, y: 26 }, rotation: 0,
      recipes: [
        { process: "screen-commercial-dram", mode: "qualified", priority: 1, inputs: { "packaged-dram-device": "package-input" }, outputs: { "commercial-dram-device": "commercial-output" } },
        { process: "screen-performance-mix", mode: "qualified", priority: 10, inputs: { "packaged-dram-device": "package-input" }, outputs: { "commercial-dram-device": "commercial-output", "performance-dram-device": "performance-output", "automotive-dram-device": "automotive-output" } },
      ],
      policy: { recipeDispatch: "authored-order", powerPriority: 5 },
    },
    { id: "commercial-customer", asset: "material-sink", region: "cleanroom", position: { x: 2, y: 27 }, rotation: 0, bufferFilters: { input: ["commercial-dram-device"] } },
    { id: "performance-customer", asset: "material-sink", region: "cleanroom", position: { x: 13, y: 29 }, rotation: 0, bufferFilters: { input: ["performance-dram-device"] } },
    { id: "automotive-customer", asset: "material-sink", region: "cleanroom", position: { x: 15, y: 26 }, rotation: 0, bufferFilters: { input: ["automotive-dram-device"] } },
    { id: "quality-scrap", asset: "scrap-bin", region: "cleanroom", position: { x: 17, y: 27 }, rotation: 90, bufferFilters: { input: ["scrap-dram-wafer-lot"] } },
    { id: "reticle-stocker-1", asset: "reticle-stocker", region: "cleanroom", position: { x: 5, y: 8 }, rotation: 0 },
    { id: "maintenance-service-1", asset: "maintenance-service-bay", region: "cleanroom", position: { x: 34, y: 26 }, rotation: 0 },
    { id: "fab-utility-plant-1", asset: "fab-utility-plant", region: "cleanroom", position: { x: 34, y: 12 }, rotation: 0 },
    ...["a", "b", "c", "d"].map((suffix, index) => ({ id: `cleanroom-power-${suffix}`, asset: "wind-turbine", region: "cleanroom", position: { x: 4 + index * 8, y: 3 }, rotation: 0 })),
    { id: "cleanroom-power-e", asset: "wind-turbine", region: "cleanroom", position: { x: 22, y: 15 }, rotation: 0 },
    { id: "shipping-power", asset: "wind-turbine", region: "cleanroom", position: { x: 1, y: 30 }, rotation: 0 },
  ];
  const connections: Blueprint["connections"] = [];
  const rotations = { north: 270, east: 0, south: 90, west: 180 } as const;
  const inverseRotations = { north: 90, east: 180, south: 270, west: 0 } as const;
  const connect = (id: string, from: { device: string; port: string; side: Side }, to: { device: string; port: string; side: Side }, resources: string[], path: Point[]): void => {
    const loader = `${id}-loader`; const unloader = `${id}-unloader`;
    devices.push({ id: loader, asset: "sorter", region: "cleanroom", position: path[0], rotation: rotations[from.side], transportEndpoint: { connection: id, stage: "loader", distance: 1 } });
    devices.push({ id: unloader, asset: "sorter", region: "cleanroom", position: path.at(-1), rotation: inverseRotations[to.side], transportEndpoint: { connection: id, stage: "unloader", distance: 1 } });
    connections.push({ id, from: { device: from.device, port: from.port }, to: { device: to.device, port: to.port }, resources, path, logistics: { loader: { device: loader }, line: { deviceAsset: "conveyor" }, unloader: { device: unloader } } });
  };
  connect("release-to-lithography", { device: "lot-release", port: "output", side: "east" }, { device: "lithography-1", port: "release-input", side: "west" }, ["blank-dram-wafer-lot"], [{ x: 3, y: 13 }, { x: 4, y: 13 }, { x: 5, y: 13 }, { x: 6, y: 13 }, { x: 7, y: 13 }]);
  connect("lithography-to-etch", { device: "lithography-1", port: "pattern-output", side: "east" }, { device: "etch-1", port: "pattern-input", side: "west" }, ["patterned-cell-l1-lot", "patterned-cell-l2-lot"], [{ x: 11, y: 13 }, { x: 12, y: 13 }, { x: 13, y: 13 }, { x: 14, y: 13 }, { x: 15, y: 13 }, { x: 16, y: 13 }]);
  connect("etch-to-deposition", { device: "etch-1", port: "loop-output", side: "east" }, { device: "deposition-1", port: "etch-input", side: "west" }, ["etched-cell-l1-lot"], [{ x: 20, y: 13 }, { x: 21, y: 13 }, { x: 22, y: 13 }, { x: 23, y: 13 }, { x: 24, y: 13 }]);
  connect("deposition-to-batch-furnace", { device: "deposition-1", port: "return-output", side: "north" }, { device: "furnace-1", port: "batch-input", side: "south" }, ["dielectric-stack-lot"], [{ x: 26, y: 11 }, { x: 26, y: 10 }, { x: 26, y: 9 }, { x: 26, y: 8 }]);
  connect("batch-furnace-to-lithography", { device: "furnace-1", port: "batch-output", side: "west" }, { device: "lithography-1", port: "reentrant-input", side: "north" }, ["annealed-dielectric-stack-lot"], [{ x: 24, y: 6 }, { x: 23, y: 6 }, { x: 22, y: 6 }, { x: 21, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 6 }, { x: 18, y: 6 }, { x: 17, y: 6 }, { x: 16, y: 6 }, { x: 15, y: 6 }, { x: 14, y: 6 }, { x: 13, y: 6 }, { x: 12, y: 6 }, { x: 11, y: 6 }, { x: 10, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 }, { x: 9, y: 9 }, { x: 9, y: 10 }, { x: 9, y: 11 }]);
  connect("etch-to-inspection", { device: "etch-1", port: "final-output", side: "south" }, { device: "inspection-1", port: "wafer-input", side: "north" }, ["dram-wafer-lot"], [{ x: 18, y: 15 }, { x: 18, y: 16 }, { x: 18, y: 17 }, { x: 18, y: 18 }, { x: 18, y: 19 }]);
  connect("inspection-to-probe", { device: "inspection-1", port: "pass-output", side: "west" }, { device: "probe-1", port: "wafer-input", side: "east" }, ["qualified-dram-wafer-lot"], [{ x: 16, y: 21 }, { x: 15, y: 21 }]);
  connect("probe-to-packaging", { device: "probe-1", port: "die-output", side: "west" }, { device: "packaging-1", port: "die-input", side: "east" }, ["known-good-dram-die"], [{ x: 11, y: 21 }, { x: 10, y: 21 }]);
  connect("substrate-receiving-to-packaging", { device: "substrate-receiving", port: "output", side: "east" }, { device: "packaging-1", port: "substrate-input", side: "west" }, ["dram-package-substrate"], [{ x: 3, y: 20 }, { x: 4, y: 20 }, { x: 4, y: 21 }, { x: 5, y: 21 }, { x: 6, y: 21 }]);
  connect("packaging-to-burn-in", { device: "packaging-1", port: "package-output", side: "south" }, { device: "burn-in-1", port: "package-input", side: "north" }, ["packaged-dram-device"], [{ x: 8, y: 23 }, { x: 8, y: 24 }, { x: 9, y: 24 }, { x: 9, y: 25 }]);
  connect("commercial-to-customer", { device: "burn-in-1", port: "commercial-output", side: "west" }, { device: "commercial-customer", port: "input", side: "west" }, ["commercial-dram-device"], [{ x: 7, y: 27 }, { x: 6, y: 27 }, { x: 5, y: 27 }, { x: 4, y: 27 }, { x: 4, y: 28 }, { x: 4, y: 29 }, { x: 3, y: 29 }, { x: 2, y: 29 }, { x: 1, y: 29 }, { x: 0, y: 29 }, { x: 0, y: 28 }, { x: 0, y: 27 }, { x: 1, y: 27 }]);
  connect("performance-to-customer", { device: "burn-in-1", port: "performance-output", side: "south" }, { device: "performance-customer", port: "input", side: "west" }, ["performance-dram-device"], [{ x: 9, y: 29 }, { x: 10, y: 29 }, { x: 11, y: 29 }, { x: 12, y: 29 }]);
  connect("automotive-to-customer", { device: "burn-in-1", port: "automotive-output", side: "east" }, { device: "automotive-customer", port: "input", side: "west" }, ["automotive-dram-device"], [{ x: 11, y: 27 }, { x: 12, y: 27 }, { x: 13, y: 27 }, { x: 13, y: 26 }, { x: 14, y: 26 }]);
  connect("inspection-to-rework", { device: "inspection-1", port: "reject-output", side: "east" }, { device: "rework-1", port: "reject-input", side: "west" }, ["rework-required-dram-wafer-lot"], [{ x: 20, y: 21 }, { x: 21, y: 21 }, { x: 22, y: 21 }, { x: 23, y: 21 }, { x: 24, y: 21 }, { x: 25, y: 21 }, { x: 26, y: 21 }]);
  connect("rework-to-inspection", { device: "rework-1", port: "recovered-output", side: "east" }, { device: "inspection-1", port: "wafer-input", side: "north" }, ["dram-wafer-lot"], [{ x: 30, y: 21 }, { x: 31, y: 21 }, { x: 31, y: 20 }, { x: 31, y: 19 }, { x: 31, y: 18 }, { x: 31, y: 17 }, { x: 30, y: 17 }, { x: 29, y: 17 }, { x: 28, y: 17 }, { x: 27, y: 17 }, { x: 26, y: 17 }, { x: 25, y: 17 }, { x: 24, y: 17 }, { x: 23, y: 17 }, { x: 22, y: 17 }, { x: 21, y: 17 }, { x: 20, y: 17 }, { x: 19, y: 17 }, { x: 18, y: 17 }, { x: 18, y: 18 }, { x: 18, y: 19 }]);
  connect("inspection-to-scrap", { device: "inspection-1", port: "scrap-output", side: "south" }, { device: "quality-scrap", port: "input", side: "north" }, ["scrap-dram-wafer-lot"], [{ x: 18, y: 23 }, { x: 18, y: 24 }, { x: 18, y: 25 }, { x: 17, y: 25 }, { x: 17, y: 26 }]);
  return { version: 1, revision: "memory-fab-greenfield-seed-v1", devices, connections, logisticsNetworks: [], policies: { dispatch: "shortage-first", powerAllocation: "priority-load-shedding" } };
}

export default {
  apiVersion: 1,
  synthesize(context) {
    if (context.project.id !== "memory-fab") throw new Error(`strategy belongs to memory-fab, received '${context.project.id}'`);
    const route = context.catalogs.routes.find((candidate) => candidate.id === "dram-front-end");
    if (!route) throw new Error("memory-fab synthesis requires the dram-front-end tracked Route");
    const routeOperations = route.steps.flatMap((step) => step.operations);
    requireIds("Route operations", context.catalogs.processes, routeOperations);
    requireIds("downstream Processes", context.catalogs.processes, ["probe-sort-dram-standard", "package-known-good-dram", "screen-commercial-dram", "screen-performance-mix"]);
    requireIds("equipment assets", context.catalogs.deviceAssets, ["buffer", "lithography-bay", "plasma-etch-bay", "ald-deposition-bay", "thermal-batch-furnace", "wafer-inspection-bay", "pattern-rework-bay", "dram-wafer-probe-cell", "dram-packaging-cell", "dram-burn-in-rack", "maintenance-service-bay", "reticle-stocker", "fab-utility-plant", "wind-turbine", "sorter", "conveyor", "material-sink", "scrap-bin"]);
    if (!context.world.regions.some((region) => region.id === "cleanroom" && region.bounds.width >= 38 && region.bounds.height >= 32)) throw new Error("memory-fab synthesis requires a cleanroom region of at least 38×32 cells");
    return {
      blueprint: buildBlueprint(),
      summary: {
        title: "Generated a complete re-entrant DRAM factory from the project-local tracked Route contract.",
        trackedRoute: route.id,
        notes: [
          "Shares lithography and etch across both re-entrant passes with explicit qualification.",
          "Adds batch anneal, inspection/rework, probe, packaging and three product dispositions.",
          "Places physical sorter endpoints, facility utilities, reusable reticles, maintenance and power coverage.",
        ],
      },
    };
  },
} satisfies ProjectSynthesisStrategy;
