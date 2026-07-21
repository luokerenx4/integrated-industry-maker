import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  atomicWriteJson,
  lockBlueprintBenchmark,
  type Blueprint,
  type BlueprintBenchmarkManifest,
} from "../packages/inm-core/src/index";

const projectDir = resolve(process.argv[2] ?? join(import.meta.dir, "..", "examples", "ironworks"));
const main = JSON.parse(await readFile(join(projectDir, "blueprints", "main.blueprint.json"), "utf8")) as Blueprint;
const blueprint = structuredClone(main);
const network = blueprint.logisticsNetworks.find((item) => item.id === "inter-zone-main");
if (!network) throw new Error("Main Blueprint is missing inter-zone-main");
for (const station of network.stations) for (const slot of station.slots) {
  slot.capacity = 4;
  if (slot.mode === "demand") slot.demandTarget = 4;
}
for (const device of blueprint.devices) if (device.id === "station-supply" || device.id === "station-demand") {
  device.policy = { ...device.policy, highSpeedTransport: { enabled: false, minimumDistance: 0 } };
}

const benchmark: BlueprintBenchmarkManifest = {
  version: 1,
  id: "high-speed-transport",
  name: "Expedited Inter-zone Line Haul",
  baselineBlueprint: "high-speed-transport-base",
  candidateBlueprint: "high-speed-transport-candidate",
  cases: [{
    id: "small-batch-line-haul",
    name: "Small-batch inter-zone line haul",
    world: "main",
    scenario: "baseline",
    objective: "default",
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
  atomicWriteJson(join(projectDir, "blueprints", "high-speed-transport-base.blueprint.json"), blueprint),
  atomicWriteJson(join(projectDir, "blueprints", "high-speed-transport-candidate.blueprint.json"), blueprint),
  atomicWriteJson(join(projectDir, "benchmarks", "high-speed-transport.benchmark.json"), benchmark),
]);
await lockBlueprintBenchmark(projectDir, "high-speed-transport");
process.stdout.write("Regenerated and locked the high-speed transport benchmark fixture.\n");
