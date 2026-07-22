import { readFile, writeFile } from "node:fs/promises";
// Project-local exhaustive search retained for focused operator research.
import { join, resolve } from "node:path";
import {
  compileFactoryProject,
  loadFactoryProject,
  planProductionCapacity,
  runUntil,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type { Blueprint, FactoryMetrics } from "../../../../packages/inm-core/src/types";

interface BenchmarkCase {
  world: string;
  scenario: string;
  objective: string;
  seed: number;
}

interface BenchmarkDefinition {
  baselineBlueprint: string;
  candidateBlueprint: string;
  cases: [BenchmarkCase];
  acceptance: {
    minimumAggregateScoreDelta: number;
    maximumCaseScoreRegression: number;
    requireCandidateCapacityReady?: boolean;
  };
}

interface SearchRow {
  sleepAfterTicks: number | null;
  blueprint: Blueprint;
  metrics: FactoryMetrics;
  scoreDelta: number;
  capacityReady: boolean;
  accepted: boolean;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkPath = join(projectDir, "benchmarks/equipment-energy-research.benchmark.json");
const definition = JSON.parse(await readFile(benchmarkPath, "utf8")) as BenchmarkDefinition;
const benchmarkCase = definition.cases[0];
if (!benchmarkCase) throw new Error("Equipment energy research requires exactly one locked case");
const writeBest = Bun.argv.includes("--write-best");

async function evaluate(blueprintName: string, blueprint?: Blueprint): Promise<{
  metrics: FactoryMetrics;
  capacityReady: boolean;
}> {
  const source = await loadFactoryProject(projectDir, {
    blueprint: blueprintName,
    world: benchmarkCase.world,
    scenario: benchmarkCase.scenario,
    objective: benchmarkCase.objective,
  });
  const project = compileFactoryProject(blueprint ? { ...source, blueprint } : source);
  return {
    metrics: runUntil(project, undefined, { seed: benchmarkCase.seed }).metrics,
    capacityReady: planProductionCapacity(project).ready,
  };
}

function withFurnaceSleep(source: Blueprint, sleepAfterTicks: number | null): Blueprint {
  const blueprint = structuredClone(source);
  const furnace = blueprint.devices.find((device) => device.id === "furnace-1");
  if (!furnace) throw new Error("Equipment energy research requires furnace-1");
  furnace.policy = { ...furnace.policy };
  if (sleepAfterTicks === null) delete furnace.policy.idleEnergy;
  else furnace.policy.idleEnergy = { sleepAfterTicks };
  if (!Object.keys(furnace.policy).length) delete furnace.policy;
  return blueprint;
}

const baseline = await evaluate(definition.baselineBlueprint);
const baselineSource = await loadFactoryProject(projectDir, { blueprint: definition.baselineBlueprint });
const rows: SearchRow[] = [];

for (const sleepAfterTicks of [null, 0, 10_000, 20_000, 30_000, 60_000, 90_000, 120_000, 150_000] as const) {
  const blueprint = withFurnaceSleep(baselineSource.blueprint, sleepAfterTicks);
  const result = await evaluate(definition.candidateBlueprint, blueprint);
  const scoreDelta = result.metrics.finalScore - baseline.metrics.finalScore;
  rows.push({
    sleepAfterTicks,
    blueprint,
    metrics: result.metrics,
    scoreDelta,
    capacityReady: result.capacityReady,
    accepted: scoreDelta >= definition.acceptance.minimumAggregateScoreDelta
      && scoreDelta >= -definition.acceptance.maximumCaseScoreRegression
      && (!definition.acceptance.requireCandidateCapacityReady || result.capacityReady),
  });
}

rows.sort((left, right) => Number(right.accepted) - Number(left.accepted)
  || right.metrics.finalScore - left.metrics.finalScore
  || (left.sleepAfterTicks ?? Number.MAX_SAFE_INTEGER) - (right.sleepAfterTicks ?? Number.MAX_SAFE_INTEGER));

console.log(`baseline_score\t${baseline.metrics.finalScore.toFixed(6)}`);
console.log("verdict\tsleep-after-ticks\tscore\tdelta\tcapacity\tenergy-mj\tenergy-charge\tdemand-charge\ttotal-electricity-cost\tmean-cycle-ticks\tsleeps\twakeups\tsleep-ticks\twake-ticks");
for (const row of rows) console.log([
  row.accepted ? "KEEP" : row.scoreDelta === 0 ? "BASELINE" : "DISCARD",
  row.sleepAfterTicks ?? "off",
  row.metrics.finalScore.toFixed(6),
  row.scoreDelta.toFixed(6),
  row.capacityReady ? "READY" : "GAPS",
  row.metrics.energyConsumedMilliJoules,
  (row.metrics.electricityCosts.energyChargeMicroCurrency / 1_000_000).toFixed(6),
  (row.metrics.electricityCosts.demandChargeMicroCurrency / 1_000_000).toFixed(6),
  (row.metrics.electricityCosts.totalMicroCurrency / 1_000_000).toFixed(6),
  row.metrics.lotFlow.meanCycleTimeTicks.toFixed(3),
  row.metrics.equipmentEnergyManagement.totalSleeps,
  row.metrics.equipmentEnergyManagement.totalWakeups,
  row.metrics.equipmentEnergyManagement.totalSleepingTicks,
  row.metrics.equipmentEnergyManagement.totalWakeTicks,
].join("\t"));

const best = rows[0];
if (writeBest) {
  if (!best?.accepted || best.sleepAfterTicks === null) {
    throw new Error("No gate-passing sleep threshold improved the baseline; candidate Blueprint was not changed");
  }
  const path = join(projectDir, "blueprints", `${definition.candidateBlueprint}.blueprint.json`);
  await writeFile(path, `${stableStringify({ ...best.blueprint, revision: "memory-fab-equipment-energy-research-v1" }, 2)}\n`);
  console.log(`# wrote ${path}: sleepAfterTicks=${best.sleepAfterTicks}`);
}
