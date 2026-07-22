import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compileFactoryProject,
  loadFactoryProject,
  planProductionCapacity,
  runUntil,
  stableStringify,
} from "../packages/inm-core/src/index";
import type { Blueprint, FactoryMetrics } from "../packages/inm-core/src/types";

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
  acceptance: { minimumAggregateScoreDelta: number; maximumCaseScoreRegression: number; requireCandidateCapacityReady?: boolean };
}

interface SearchRow {
  minimumQualificationTicks: number | null;
  blueprint: Blueprint;
  metrics: FactoryMetrics;
  scoreDelta: number;
  capacityReady: boolean;
  accepted: boolean;
}

const projectDir = resolve(import.meta.dir, "../examples/memory-fab");
const benchmarkPath = join(projectDir, "benchmarks/calendar-maintenance-research.benchmark.json");
const definition = JSON.parse(await readFile(benchmarkPath, "utf8")) as BenchmarkDefinition;
const benchmarkCase = definition.cases[0];
if (!benchmarkCase) throw new Error("Calendar maintenance research requires exactly one locked case");
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

function withCalendarWindow(source: Blueprint, minimumQualificationTicks: number | null): Blueprint {
  const blueprint = structuredClone(source);
  const lithography = blueprint.devices.find((device) => device.id === "lithography-1");
  if (!lithography) throw new Error("Calendar maintenance research requires lithography-1");
  lithography.policy = { ...lithography.policy };
  if (minimumQualificationTicks === null) delete lithography.policy.preventiveMaintenance;
  else lithography.policy.preventiveMaintenance = { minimumQualificationTicks };
  if (!Object.keys(lithography.policy).length) delete lithography.policy;
  return blueprint;
}

const baseline = await evaluate(definition.baselineBlueprint);
const baselineSource = await loadFactoryProject(projectDir, { blueprint: definition.baselineBlueprint });
const rows: SearchRow[] = [];

for (const minimumQualificationTicks of [null, 120_000, 130_000, 140_000, 145_000] as const) {
  const blueprint = withCalendarWindow(baselineSource.blueprint, minimumQualificationTicks);
  const result = await evaluate(definition.candidateBlueprint, blueprint);
  const scoreDelta = result.metrics.finalScore - baseline.metrics.finalScore;
  rows.push({
    minimumQualificationTicks,
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
  || (left.minimumQualificationTicks ?? Number.MAX_SAFE_INTEGER) - (right.minimumQualificationTicks ?? Number.MAX_SAFE_INTEGER));

console.log(`baseline_score\t${baseline.metrics.finalScore.toFixed(6)}`);
console.log("verdict\tminimum-qualification-ticks\tscore\tdelta\tcapacity\tcompleted\ton-time\tmean-cycle-ticks\tmandatory\topportunistic\tusage-triggered\tcalendar-triggered\tmaintenance-ticks\tcrew-wait-ticks");
for (const row of rows) console.log([
  row.accepted ? "KEEP" : row.scoreDelta === 0 ? "BASELINE" : "DISCARD",
  row.minimumQualificationTicks ?? "off",
  row.metrics.finalScore.toFixed(6),
  row.scoreDelta.toFixed(6),
  row.capacityReady ? "READY" : "GAPS",
  row.metrics.lotFlow.completed,
  row.metrics.lotFlow.onTimeCompleted,
  row.metrics.lotFlow.meanCycleTimeTicks.toFixed(3),
  row.metrics.equipmentMaintenance.totalMandatory,
  row.metrics.equipmentMaintenance.totalOpportunistic,
  row.metrics.equipmentMaintenance.totalUsageTriggered,
  row.metrics.equipmentMaintenance.totalCalendarTriggered,
  row.metrics.equipmentMaintenance.totalMaintenanceTicks,
  row.metrics.equipmentMaintenance.totalCrewWaitTicks,
].join("\t"));

const best = rows[0];
if (writeBest) {
  if (!best?.accepted || best.minimumQualificationTicks === null) {
    throw new Error("No gate-passing calendar window improved the baseline; candidate Blueprint was not changed");
  }
  const path = join(projectDir, "blueprints", `${definition.candidateBlueprint}.blueprint.json`);
  await writeFile(path, `${stableStringify({ ...best.blueprint, revision: "memory-fab-calendar-maintenance-research-v1" }, 2)}\n`);
  console.log(`# wrote ${path}: minimumQualificationTicks=${best.minimumQualificationTicks}`);
}
