import { readFile, writeFile } from "node:fs/promises";
// Project-local exhaustive search retained for focused operator research.
import { join, resolve } from "node:path";
import {
  compileFactoryProject, loadFactoryProject, parallelizeWorkCenter, runUntil, specializeSharedWorkCenter, stableStringify,
} from "../../../../packages/inm-core/src/index";
import type { Blueprint, FactoryMetrics } from "../../../../packages/inm-core/src/types";

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
  inspectionMaintenance: string;
  dispatch: "fifo" | "earliest-due-date";
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  accepted: boolean;
  feasibleCases: number;
  scores: number[];
  completedLots: number[];
  scrappedLots: number[];
  qualityEscapes: number[];
  qTimeViolations: number[];
  maximumInspectionQueueTicks: number[];
  assetLimitMaintenance: number[];
  plannedBoundaryMaintenance: number[];
  opportunisticMaintenance: number[];
  totalBuildCost: number;
  occupiedArea: number;
}

const projectDir = resolve(import.meta.dir, "../..");
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
  maintenance: { deep: number | null; rapid: number | null },
  dispatch: SearchRow["dispatch"],
): Blueprint {
  const blueprint = structuredClone(source);
  for (const device of blueprint.devices.filter((item) => /^lithography-\d+$/.test(item.id))) {
    device.policy = { ...device.policy, preventiveMaintenance: { opportunistic: { afterJobs: 7 } } };
  }
  for (const device of blueprint.devices.filter((item) => /^etch-\d+$/.test(item.id))) {
    device.policy = { ...device.policy };
    delete device.policy.preventiveMaintenance;
  }
  for (const device of blueprint.devices.filter((item) => item.id === "inspection-1" || item.id === "inspection-2")) {
    device.policy = { ...device.policy, lotDispatch: dispatch };
    const opportunisticAfterJobs = device.asset === "rapid-metrology-cell" ? maintenance.rapid : maintenance.deep;
    if (opportunisticAfterJobs === null) delete device.policy.preventiveMaintenance;
    else device.policy.preventiveMaintenance = { opportunistic: { afterJobs: opportunisticAfterJobs } };
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
  id: `${seed.id}:deep+deep`,
  result: parallelizeWorkCenter(seed.project, seed.blueprint, { device: "inspection-1", cloneId: "inspection-2" }),
}));
for (const topology of parallelTopologies) if (!topology.result) throw new Error(`Could not author explicit parallel inspection topology '${topology.id}'`);

const hybrid = parallelizeWorkCenter(incumbentProject, incumbentProject.blueprint, {
  device: "inspection-1", cloneId: "inspection-2", cloneAsset: "rapid-metrology-cell", cloneProcess: "inspect-final-pattern-standard",
});
if (!hybrid) throw new Error("Could not author the deep+rapid heterogeneous metrology topology");
const rapidOnly = structuredClone(incumbentProject.blueprint);
const rapidInspection = rapidOnly.devices.find((device) => device.id === "inspection-1");
if (!rapidInspection?.recipe) throw new Error("Could not find the incumbent inspection recipe");
rapidInspection.asset = "rapid-metrology-cell";
rapidInspection.recipe.process = "inspect-final-pattern-standard";
const rapidOnlyProject = compileFactoryProject({ ...incumbentProject, blueprint: rapidOnly });
const doubleRapid = parallelizeWorkCenter(rapidOnlyProject, rapidOnly, { device: "inspection-1", cloneId: "inspection-2" });
if (!doubleRapid) throw new Error("Could not author the rapid+rapid metrology topology");

const topologies: Array<{ id: string; blueprint: Blueprint }> = [
  ...parallelTopologies.map((topology) => ({ id: topology.id, blueprint: topology.result!.blueprint })),
  { id: "incumbent-layout:deep+rapid", blueprint: hybrid.blueprint },
  { id: "incumbent-layout:rapid-only", blueprint: rapidOnly },
  { id: "incumbent-layout:rapid+rapid", blueprint: doubleRapid.blueprint },
];
const maintenancePolicies = [
  { id: "off/off", deep: null, rapid: null },
  { id: "deep-3/rapid-7", deep: 3, rapid: 7 },
  { id: "deep-4/rapid-7", deep: 4, rapid: 7 },
  { id: "deep-3/rapid-4", deep: 3, rapid: 4 },
] as const;

const baselineMetrics = await simulate(definition.baselineBlueprint);
const incumbentMetrics = await simulate(definition.candidateBlueprint);
const baselineScores = baselineMetrics.map((metrics) => metrics.finalScore);
const incumbentScores = incumbentMetrics.map((metrics) => metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const rows: SearchRow[] = [];

for (const topology of topologies) {
  for (const inspectionMaintenance of maintenancePolicies) {
    for (const dispatch of ["fifo", "earliest-due-date"] as const) {
      const blueprint = configureInspectionPolicy(topology.blueprint, inspectionMaintenance, dispatch);
      const metrics = await simulate(definition.candidateBlueprint, blueprint);
      const scores = metrics.map((item) => item.finalScore);
      const aggregateScore = weightedMean(scores);
      const aggregateDelta = aggregateScore - incumbentAggregate;
      const minimumCaseDelta = Math.min(...scores.map((score, index) => score - baselineScores[index]!));
      rows.push({
        topology: topology.id, blueprint, inspectionMaintenance: inspectionMaintenance.id, dispatch, aggregateScore, aggregateDelta, minimumCaseDelta,
        accepted: aggregateDelta >= definition.acceptance.minimumAggregateScoreDelta
          && minimumCaseDelta >= -definition.acceptance.maximumCaseScoreRegression
          && metrics.every((item) => item.infeasibleReason === null),
        feasibleCases: metrics.filter((item) => item.infeasibleReason === null).length,
        scores,
        completedLots: metrics.map((item) => item.lotFlow.completed),
        scrappedLots: metrics.map((item) => item.lotFlow.scrapped),
        qualityEscapes: metrics.map((item) => item.qualityFlow.escapedDefects),
        qTimeViolations: metrics.map((item) => item.routeFlow["dram-front-end"]!.queueTimeViolations),
        maximumInspectionQueueTicks: metrics.map((item) => item.routeFlow["dram-front-end"]!.steps["final-inspection"]!.maximumQueueTicks),
        assetLimitMaintenance: metrics.map((item) => item.equipmentMaintenance.totalAssetLimit),
        plannedBoundaryMaintenance: metrics.map((item) => item.equipmentMaintenance.totalPlannedBoundary),
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
  || left.inspectionMaintenance.localeCompare(right.inspectionMaintenance));

console.log(`# incumbent aggregate=${incumbentAggregate.toFixed(6)} · 7 equipment architectures × 4 equipment-specific maintenance policies × 2 lot-dispatch policies`);
console.log("verdict\tfeasible\taggregate\tdelta-vs-incumbent\tmin-case-vs-baseline\ttopology\tdispatch\tinspection-maint\tcost\tarea\tcase-scores\tcompleted\tscrapped\tescaped-defects\tqtime-violations\tinspection-max-queue-s\tasset-limit\tplanned-boundary\topportunistic");
for (const row of rows) console.log([
  row.accepted ? "KEEP" : "REJECT", `${row.feasibleCases}/${definition.cases.length}`, row.aggregateScore.toFixed(6), row.aggregateDelta.toFixed(6), row.minimumCaseDelta.toFixed(6),
  row.topology, row.dispatch, row.inspectionMaintenance, row.totalBuildCost, row.occupiedArea,
  row.scores.map((value) => value.toFixed(3)).join(","), row.completedLots.join(","), row.scrappedLots.join(","),
  row.qualityEscapes.join(","),
  row.qTimeViolations.join(","), row.maximumInspectionQueueTicks.map((ticks) => (ticks / 1000).toFixed(1)).join(","),
  row.assetLimitMaintenance.join(","), row.plannedBoundaryMaintenance.join(","), row.opportunisticMaintenance.join(","),
].join("\t"));

const best = rows[0];
if (writeBest) {
  if (!best?.accepted) throw new Error("No gate-passing parallel metrology Blueprint improved the incumbent; candidate Blueprint was not changed");
  const path = join(projectDir, "blueprints", `${definition.candidateBlueprint}.blueprint.json`);
  await writeFile(path, `${stableStringify({ ...best.blueprint, revision: "memory-fab-parallel-metrology-v1" }, 2)}\n`);
  console.log(`# wrote ${path}: topology=${best.topology}, dispatch=${best.dispatch}, inspection maintenance=${best.inspectionMaintenance}`);
}
