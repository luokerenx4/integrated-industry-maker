import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compileFactoryProject, loadFactoryProject, runUntil, stableStringify } from "../packages/inm-core/src/index";
import type { Blueprint, FactoryMetrics } from "../packages/inm-core/src/types";

interface BenchmarkCase {
  id: string;
  world: string;
  scenario: string;
  objective: string;
  seed: number;
  weight: number;
}

interface BenchmarkDefinition {
  baselineBlueprint: string;
  candidateBlueprint: string;
  cases: BenchmarkCase[];
  acceptance: { minimumAggregateScoreDelta: number; maximumCaseScoreRegression: number };
}

interface SearchRow {
  lithography: number | null;
  etch: number | null;
  inspection: number | null;
  blueprint: Blueprint;
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  accepted: boolean;
  scores: number[];
  completedLots: number[];
  onTimeLots: number[];
  mandatory: number[];
  opportunistic: number[];
  cancelled: number[];
  maintenanceTicks: number[];
}

const projectDir = resolve(import.meta.dir, "../examples/memory-fab");
const definition = JSON.parse(await readFile(join(projectDir, "benchmarks/dispatch-research.benchmark.json"), "utf8")) as BenchmarkDefinition;
const writeBest = Bun.argv.includes("--write-best");

function weightedMean(values: number[]): number {
  const weight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / weight;
}

async function simulate(blueprintName: string, blueprint?: Blueprint): Promise<FactoryMetrics[]> {
  return Promise.all(definition.cases.map(async (item) => {
    const source = await loadFactoryProject(projectDir, {
      blueprint: blueprintName, world: item.world, scenario: item.scenario, objective: item.objective,
    });
    const project = compileFactoryProject(blueprint ? { ...source, blueprint } : source);
    return runUntil(project, undefined, { seed: item.seed }).metrics;
  }));
}

function withThresholds(
  incumbent: Blueprint,
  lithography: number | null,
  etch: number | null,
  inspection: number | null,
): Blueprint {
  const blueprint = structuredClone(incumbent);
  for (const device of blueprint.devices) {
    const threshold = /^lithography-\d+$/.test(device.id) ? lithography
      : /^etch-\d+$/.test(device.id) ? etch
        : device.id === "inspection-1" ? inspection : undefined;
    if (threshold === undefined) continue;
    device.policy = { ...device.policy };
    if (threshold === null) delete device.policy.preventiveMaintenance;
    else device.policy.preventiveMaintenance = { minimumJobs: threshold };
    if (!Object.keys(device.policy).length) delete device.policy;
  }
  return blueprint;
}

const incumbentSource = await loadFactoryProject(projectDir, { blueprint: definition.candidateBlueprint });
const incumbent = incumbentSource.blueprint;
const baselineMetrics = await simulate(definition.baselineBlueprint);
const incumbentMetrics = await simulate(definition.candidateBlueprint);
const baselineScores = baselineMetrics.map((metrics) => metrics.finalScore);
const incumbentScores = incumbentMetrics.map((metrics) => metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const rows: SearchRow[] = [];

for (const lithography of [null, 6, 7] as const) {
  for (const etch of [null, 6, 7] as const) {
    for (const inspection of [null, 3, 4] as const) {
      const blueprint = withThresholds(incumbent, lithography, etch, inspection);
      const metrics = await simulate(definition.candidateBlueprint, blueprint);
      const scores = metrics.map((item) => item.finalScore);
      const aggregateScore = weightedMean(scores);
      const aggregateDelta = aggregateScore - incumbentAggregate;
      const minimumCaseDelta = Math.min(...scores.map((score, index) => score - baselineScores[index]!));
      rows.push({
        lithography, etch, inspection, blueprint, aggregateScore, aggregateDelta, minimumCaseDelta,
        accepted: aggregateDelta >= definition.acceptance.minimumAggregateScoreDelta
          && minimumCaseDelta >= -definition.acceptance.maximumCaseScoreRegression,
        scores,
        completedLots: metrics.map((item) => item.lotFlow.completed),
        onTimeLots: metrics.map((item) => item.lotFlow.onTimeCompleted),
        mandatory: metrics.map((item) => item.equipmentMaintenance.totalMandatory),
        opportunistic: metrics.map((item) => item.equipmentMaintenance.totalOpportunistic),
        cancelled: metrics.map((item) => item.equipmentMaintenance.totalCancelled),
        maintenanceTicks: metrics.map((item) => item.equipmentMaintenance.totalMaintenanceTicks),
      });
    }
  }
}

rows.sort((left, right) => Number(right.accepted) - Number(left.accepted)
  || right.aggregateScore - left.aggregateScore || right.minimumCaseDelta - left.minimumCaseDelta
  || (left.lithography ?? 99) - (right.lithography ?? 99)
  || (left.etch ?? 99) - (right.etch ?? 99)
  || (left.inspection ?? 99) - (right.inspection ?? 99));

console.log(`# incumbent aggregate=${incumbentAggregate.toFixed(6)} · 27 maintenance policies · case gate=${definition.acceptance.maximumCaseScoreRegression.toFixed(3)}`);
console.log("verdict\taggregate\tdelta-vs-incumbent\tmin-case-vs-baseline\tlithography\tetch\tinspection\tcase-scores\tcompleted\ton-time\tmandatory\topportunistic\tcancelled\tmaintenance-ticks");
for (const row of rows) console.log([
  row.accepted ? "KEEP" : row.aggregateDelta === 0 ? "INCUMBENT" : "REJECT",
  row.aggregateScore.toFixed(6), row.aggregateDelta.toFixed(6), row.minimumCaseDelta.toFixed(6),
  row.lithography ?? "off", row.etch ?? "off", row.inspection ?? "off",
  row.scores.map((value) => value.toFixed(3)).join(","), row.completedLots.join(","), row.onTimeLots.join(","),
  row.mandatory.join(","), row.opportunistic.join(","), row.cancelled.join(","), row.maintenanceTicks.join(","),
].join("\t"));

const best = rows[0];
if (writeBest) {
  if (!best?.accepted) throw new Error("No gate-passing maintenance policy improved the incumbent; candidate Blueprint was not changed");
  const path = join(projectDir, "blueprints", `${definition.candidateBlueprint}.blueprint.json`);
  await writeFile(path, `${stableStringify({ ...best.blueprint, revision: "memory-fab-preventive-maintenance-v1" }, 2)}\n`);
  console.log(`# wrote ${path}: lithography=${best.lithography ?? "off"}, etch=${best.etch ?? "off"}, inspection=${best.inspection ?? "off"}`);
}
