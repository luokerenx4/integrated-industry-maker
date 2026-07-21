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
for (const device of blueprint.devices) {
  if (device.id === "station-supply") device.policy = { ...device.policy, stationChargeMilliWatts: 20_000 };
  if (device.id === "station-demand") device.policy = { ...device.policy, stationChargeMilliWatts: 0 };
}

const benchmark: BlueprintBenchmarkManifest = {
  version: 1,
  id: "station-energy",
  name: "Station Carrier Energy and Charging",
  baselineBlueprint: "station-energy-base",
  candidateBlueprint: "station-energy-candidate",
  cases: [{
    id: "cold-station",
    name: "Cold station carrier launch",
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
  atomicWriteJson(join(projectDir, "blueprints", "station-energy-base.blueprint.json"), blueprint),
  atomicWriteJson(join(projectDir, "blueprints", "station-energy-candidate.blueprint.json"), blueprint),
  atomicWriteJson(join(projectDir, "benchmarks", "station-energy.benchmark.json"), benchmark),
]);
await lockBlueprintBenchmark(projectDir, "station-energy");
process.stdout.write("Regenerated and locked the station carrier-energy benchmark fixture.\n");
