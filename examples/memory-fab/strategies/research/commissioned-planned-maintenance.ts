import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compileFactoryProject,
  loadFactoryProject,
  planProductionCapacity,
  runUntil,
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
  cases: BenchmarkCase[];
}

interface EvaluatedVariant {
  strategy: string;
  aggregateDelta: number;
  minimumCaseDelta: number;
  caseDeltas: number[];
  capacityReady: boolean;
  commissionedFloorPassed: boolean;
  zeroRegressionPassed: boolean;
  metrics: FactoryMetrics[];
}

const projectDir = resolve(import.meta.dir, "../..");
const definition = JSON.parse(
  await readFile(join(projectDir, "benchmarks/greenfield-dram-design.benchmark.json"), "utf8"),
) as BenchmarkDefinition;
const incumbentBlueprint = "generated-dram-fab";
const totalWeight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (values: number[]) =>
  values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / totalWeight;

function withLithographyPlannedStop(source: Blueprint, afterJobs: number): Blueprint {
  const blueprint = structuredClone(source);
  const lithography = blueprint.devices.find((device) => device.id === "lithography-1");
  if (!lithography) throw new Error("Commissioned planned-maintenance research requires lithography-1");
  lithography.policy = {
    ...lithography.policy,
    preventiveMaintenance: { planned: { afterJobs } },
  };
  return blueprint;
}

async function evaluate(blueprint: Blueprint): Promise<{ metrics: FactoryMetrics[]; capacityReady: boolean }> {
  const evaluations = await Promise.all(definition.cases.map(async (item) => {
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: incumbentBlueprint,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const project = compileFactoryProject({ ...loaded, blueprint });
    return {
      capacityReady: planProductionCapacity(project).ready,
      metrics: runUntil(project, undefined, { seed: item.seed }).metrics,
    };
  }));
  return {
    metrics: evaluations.map((evaluation) => evaluation.metrics),
    capacityReady: evaluations.every((evaluation) => evaluation.capacityReady),
  };
}

function commissionedFloor(metrics: FactoryMetrics): boolean {
  const contracts = metrics.deliveryPortfolio.contracts;
  const terminalLots = metrics.lotFlow.completed + metrics.lotFlow.scrapped;
  const qTimeViolations = Object.values(metrics.routeFlow).reduce((sum, route) => sum + route.queueTimeViolations, 0);
  return (contracts["commercial-order"]?.delivered ?? 0) >= 38
    && (contracts["performance-order"]?.delivered ?? 0) >= 12
    && (contracts["automotive-order"]?.delivered ?? 0) >= 6
    && metrics.deliveryPortfolio.netValue >= 196
    && terminalLots === 12
    && metrics.lotFlow.completed >= 8
    && metrics.qualityFlow.firstPassCompleted >= 8
    && metrics.qualityFlow.firstPassYield >= 2 / 3
    && metrics.qualityFlow.totalReworkCycles <= 4
    && metrics.qualityFlow.scrapDispositions <= 4
    && metrics.qualityFlow.escapedDefects === 0
    && qTimeViolations <= 2;
}

const incumbentSource = await loadFactoryProject(projectDir, {
  blueprint: incumbentBlueprint,
  world: definition.cases[0]!.world,
  scenario: definition.cases[0]!.scenario,
  objective: definition.cases[0]!.objective,
});
const incumbent = compileFactoryProject(incumbentSource);
const incumbentEvaluation = await evaluate(incumbent.blueprint);
const incumbentScores = incumbentEvaluation.metrics.map((metrics) => metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const commissionedCaseIndex = definition.cases.findIndex((item) => item.id === "mixed-quality");
if (commissionedCaseIndex < 0) throw new Error("greenfield-dram-design must include mixed-quality");

const rows: EvaluatedVariant[] = [];
for (const afterJobs of [4, 5, 6, 7]) {
  const candidate = withLithographyPlannedStop(incumbent.blueprint, afterJobs);
  const evaluated = await evaluate(candidate);
  const scores = evaluated.metrics.map((metrics) => metrics.finalScore);
  const caseDeltas = scores.map((score, index) => score - incumbentScores[index]!);
  rows.push({
    strategy: `planned-maintenance:lithography-after-${afterJobs}-jobs`,
    aggregateDelta: weightedMean(scores) - incumbentAggregate,
    minimumCaseDelta: Math.min(...caseDeltas),
    caseDeltas,
    capacityReady: evaluated.capacityReady,
    commissionedFloorPassed: commissionedFloor(evaluated.metrics[commissionedCaseIndex]!),
    zeroRegressionPassed: caseDeltas.every((delta) => delta >= -1e-9),
    metrics: evaluated.metrics,
  });
}

rows.sort((left, right) =>
  Number(right.zeroRegressionPassed && right.commissionedFloorPassed && right.capacityReady)
    - Number(left.zeroRegressionPassed && left.commissionedFloorPassed && left.capacityReady)
  || right.aggregateDelta - left.aggregateDelta
  || right.minimumCaseDelta - left.minimumCaseDelta
  || left.strategy.localeCompare(right.strategy));

console.log(`# commissioned planned-maintenance search · incumbent aggregate=${incumbentAggregate.toFixed(6)} · zero current-best regression + commissioned floor`);
console.log("verdict\tstrategy\taggregate-delta\tminimum-case-delta\tcase-deltas\tcapacity\tfloor\tmixed-drift\tmixed-completed\tmixed-first-pass\tmixed-rework\tmixed-scrap\tmixed-qtime\tmixed-net-value\tasset-limit\tplanned\topportunistic");
for (const row of rows) {
  const mixed = row.metrics[commissionedCaseIndex]!;
  const qTimeViolations = Object.values(mixed.routeFlow).reduce((sum, route) => sum + route.queueTimeViolations, 0);
  console.log([
    row.zeroRegressionPassed && row.commissionedFloorPassed && row.capacityReady && row.aggregateDelta > 1e-9 ? "KEEP" : "REJECT",
    row.strategy,
    row.aggregateDelta.toFixed(6),
    row.minimumCaseDelta.toFixed(6),
    row.caseDeltas.map((value) => value.toFixed(3)).join(","),
    row.capacityReady ? "READY" : "GAPS",
    row.commissionedFloorPassed ? "PASS" : "FAIL",
    mixed.equipmentMaintenance.totalDriftDefects,
    mixed.lotFlow.completed,
    mixed.qualityFlow.firstPassCompleted,
    mixed.qualityFlow.totalReworkCycles,
    mixed.qualityFlow.scrapDispositions,
    qTimeViolations,
    mixed.deliveryPortfolio.netValue.toFixed(3),
    mixed.equipmentMaintenance.totalAssetLimit,
    mixed.equipmentMaintenance.totalPlannedBoundary,
    mixed.equipmentMaintenance.totalOpportunistic,
  ].join("\t"));
}
