import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compileFactoryProject, loadFactoryProject, parallelizeWorkCenter, runUntil, specializeSharedWorkCenter, stableStringify,
} from "../packages/inm-core/src/index";
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
  topology: string;
  blueprint: Blueprint;
  inspectionMaintenance: number | null;
  dispatch: "fifo" | "earliest-due-date";
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  accepted: boolean;
  feasibleCases: number;
  scores: number[];
  completedLots: number[];
  scrappedLots: number[];
  qTimeViolations: number[];
  maximumInspectionQueueTicks: number[];
  mandatoryMaintenance: number[];
  opportunisticMaintenance: number[];
  totalBuildCost: number;
  occupiedArea: number;
}

const projectDir = resolve(import.meta.dir, "../examples/memory-fab");
const definition = JSON.parse(await readFile(join(projectDir, "benchmarks/dispatch-research.benchmark.json"), "utf8")) as BenchmarkDefinition;
const writeBest = Bun.argv.includes("--write-best");

function weightedMean(values: number[]): number {
  const totalWeight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / totalWeight;
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

function configureInspectionPolicy(
  source: Blueprint,
  inspectionMaintenance: number | null,
  dispatch: SearchRow["dispatch"],
): Blueprint {
  const blueprint = structuredClone(source);
  for (const device of blueprint.devices.filter((item) => /^lithography-\d+$/.test(item.id))) {
    device.policy = { ...device.policy, preventiveMaintenance: { minimumJobs: 7 } };
  }
  for (const device of blueprint.devices.filter((item) => /^etch-\d+$/.test(item.id))) {
    device.policy = { ...device.policy };
    delete device.policy.preventiveMaintenance;
  }
  for (const device of blueprint.devices.filter((item) => item.id === "inspection-1" || item.id === "inspection-2")) {
    device.policy = { ...device.policy, lotDispatch: dispatch };
    if (inspectionMaintenance === null) delete device.policy.preventiveMaintenance;
    else device.policy.preventiveMaintenance = { minimumJobs: inspectionMaintenance };
  }
  return blueprint;
}

const incumbentSource = await loadFactoryProject(projectDir, { blueprint: definition.candidateBlueprint });
const incumbentProject = compileFactoryProject(incumbentSource);
const seedProject = compileFactoryProject(await loadFactoryProject(projectDir, { blueprint: "tool-search-seed" }));
const physicalSeeds: Array<{ id: string; project: typeof seedProject; blueprint: Blueprint }> = [
  { id: "shared-lithography+shared-etch", project: seedProject, blueprint: seedProject.blueprint },
];
const lithography = specializeSharedWorkCenter(seedProject, seedProject.blueprint, {
  device: "lithography-1", process: "pattern-cell-layer-2", cloneId: "lithography-2",
});
if (!lithography) throw new Error("Could not author the dedicated-lithography capital-allocation seed");
const lithographyProject = compileFactoryProject({ ...seedProject, blueprint: lithography.blueprint });
const both = specializeSharedWorkCenter(lithographyProject, lithography.blueprint, {
  device: "etch-1", process: "etch-cell-layer-2", cloneId: "etch-2",
});
if (!both) throw new Error("Could not author the joint dedicated-tool seed");
physicalSeeds.push(
  { id: "dedicated-lithography+shared-etch", project: lithographyProject, blueprint: lithography.blueprint },
  { id: "dedicated-lithography+dedicated-etch", project: compileFactoryProject({ ...lithographyProject, blueprint: both.blueprint }), blueprint: both.blueprint },
  { id: "incumbent-layout", project: incumbentProject, blueprint: incumbentProject.blueprint },
);
const parallelTopologies = physicalSeeds.map((seed) => ({
  id: seed.id,
  result: parallelizeWorkCenter(seed.project, seed.blueprint, { device: "inspection-1", cloneId: "inspection-2" }),
}));
for (const topology of parallelTopologies) if (!topology.result) throw new Error(`Could not author explicit parallel inspection topology '${topology.id}'`);

const baselineMetrics = await simulate(definition.baselineBlueprint);
const incumbentMetrics = await simulate(definition.candidateBlueprint);
const baselineScores = baselineMetrics.map((metrics) => metrics.finalScore);
const incumbentScores = incumbentMetrics.map((metrics) => metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const rows: SearchRow[] = [];

for (const topology of parallelTopologies) {
  for (const inspectionMaintenance of [null, 3, 4] as const) {
    for (const dispatch of ["fifo", "earliest-due-date"] as const) {
      const blueprint = configureInspectionPolicy(topology.result!.blueprint, inspectionMaintenance, dispatch);
      const metrics = await simulate(definition.candidateBlueprint, blueprint);
      const scores = metrics.map((item) => item.finalScore);
      const aggregateScore = weightedMean(scores);
      const aggregateDelta = aggregateScore - incumbentAggregate;
      const minimumCaseDelta = Math.min(...scores.map((score, index) => score - baselineScores[index]!));
      rows.push({
        topology: topology.id, blueprint, inspectionMaintenance, dispatch, aggregateScore, aggregateDelta, minimumCaseDelta,
        accepted: aggregateDelta >= definition.acceptance.minimumAggregateScoreDelta
          && minimumCaseDelta >= -definition.acceptance.maximumCaseScoreRegression
          && metrics.every((item) => item.infeasibleReason === null),
        feasibleCases: metrics.filter((item) => item.infeasibleReason === null).length,
        scores,
        completedLots: metrics.map((item) => item.lotFlow.completed),
        scrappedLots: metrics.map((item) => item.lotFlow.scrapped),
        qTimeViolations: metrics.map((item) => item.routeFlow["dram-front-end"]!.queueTimeViolations),
        maximumInspectionQueueTicks: metrics.map((item) => item.routeFlow["dram-front-end"]!.steps["final-inspection"]!.maximumQueueTicks),
        mandatoryMaintenance: metrics.map((item) => item.equipmentMaintenance.totalMandatory),
        opportunisticMaintenance: metrics.map((item) => item.equipmentMaintenance.totalOpportunistic),
        totalBuildCost: metrics[0]!.totalBuildCost,
        occupiedArea: metrics[0]!.occupiedArea,
      });
    }
  }
}

rows.sort((left, right) => Number(right.accepted) - Number(left.accepted)
  || right.feasibleCases - left.feasibleCases
  || right.aggregateScore - left.aggregateScore || right.minimumCaseDelta - left.minimumCaseDelta
  || left.totalBuildCost - right.totalBuildCost || left.occupiedArea - right.occupiedArea
  || left.topology.localeCompare(right.topology)
  || left.dispatch.localeCompare(right.dispatch)
  || (left.inspectionMaintenance ?? 99) - (right.inspectionMaintenance ?? 99));

console.log(`# incumbent aggregate=${incumbentAggregate.toFixed(6)} · 4 capital topologies × 3 symmetric inspection-maintenance policies × 2 dispatch policies`);
console.log("verdict\tfeasible\taggregate\tdelta-vs-incumbent\tmin-case-vs-baseline\ttopology\tdispatch\tinspection-maint\tcost\tarea\tcase-scores\tcompleted\tscrapped\tqtime-violations\tinspection-max-queue-s\tmandatory\topportunistic");
for (const row of rows) console.log([
  row.accepted ? "KEEP" : "REJECT", `${row.feasibleCases}/${definition.cases.length}`, row.aggregateScore.toFixed(6), row.aggregateDelta.toFixed(6), row.minimumCaseDelta.toFixed(6),
  row.topology, row.dispatch, row.inspectionMaintenance ?? "off", row.totalBuildCost, row.occupiedArea,
  row.scores.map((value) => value.toFixed(3)).join(","), row.completedLots.join(","), row.scrappedLots.join(","),
  row.qTimeViolations.join(","), row.maximumInspectionQueueTicks.map((ticks) => (ticks / 1000).toFixed(1)).join(","),
  row.mandatoryMaintenance.join(","), row.opportunisticMaintenance.join(","),
].join("\t"));

const best = rows[0];
if (writeBest) {
  if (!best?.accepted) throw new Error("No gate-passing parallel metrology Blueprint improved the incumbent; candidate Blueprint was not changed");
  const path = join(projectDir, "blueprints", `${definition.candidateBlueprint}.blueprint.json`);
  await writeFile(path, `${stableStringify({ ...best.blueprint, revision: "memory-fab-parallel-metrology-v1" }, 2)}\n`);
  console.log(`# wrote ${path}: topology=${best.topology}, dispatch=${best.dispatch}, inspection maintenance=${best.inspectionMaintenance ?? "off"}`);
}
