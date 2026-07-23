import { resolve } from "node:path";
import {
  compileFactoryProject,
  evaluatePreparedBlueprintBenchmark,
  loadFactoryProject,
  parallelizeWorkCenter,
  prepareBlueprintBenchmark,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type {
  Blueprint,
  BlueprintBenchmarkResult,
  BlueprintMetricSnapshot,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  strategy: string;
  hypothesis: string;
  blueprint: Blueprint;
  diagnosticOnly?: boolean;
}

interface ResultRow {
  strategy: string;
  hypothesis: string;
  verdict: "INCUMBENT" | "KEEP" | "REJECT";
  benchmarkAccepted: boolean;
  hardOutcomesPassed: boolean;
  capacityReady: boolean;
  aggregateDeltaFromIncumbent: number;
  minimumCaseDeltaFromIncumbent: number;
  caseDeltasFromIncumbent: Array<{ id: string; delta: number }>;
  reasons: string[];
  mixedQuality: ReturnType<typeof summarizeMetrics>;
  cases: Array<{ id: string; metrics: ReturnType<typeof summarizeMetrics> }>;
  outcomeGuardrails: BlueprintBenchmarkResult["outcomeGuardrails"];
  blueprint: Blueprint;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const incumbentBlueprintId = "generated-dram-fab";

function configureInspectionMaintenance(
  source: Blueprint,
  kind: "opportunistic" | "planned",
  afterJobs: number,
): Blueprint {
  const blueprint = structuredClone(source);
  const inspection = blueprint.devices.find((item) => item.id === "inspection-1");
  if (!inspection) throw new Error("commissioned yield research requires inspection-1");
  inspection.policy = {
    ...inspection.policy,
    preventiveMaintenance: { [kind]: { afterJobs } },
  };
  return blueprint;
}

function selectContinuousMetrology(source: Blueprint): Blueprint {
  const blueprint = structuredClone(source);
  const inspection = blueprint.devices.find((item) => item.id === "inspection-1");
  if (!inspection?.recipe || inspection.recipe.process !== "inspect-final-pattern-deep") {
    throw new Error("continuous deep metrology requires inspection-1 with the deep final-pattern recipe");
  }
  inspection.asset = "continuous-deep-metrology-cell";
  inspection.policy = { ...inspection.policy };
  delete inspection.policy.preventiveMaintenance;
  return blueprint;
}

function configureRelease(
  source: Blueprint,
  maximumWip: number,
  reopenAtWip: number,
  maximumReleaseDelayTicks: number,
): Blueprint {
  const blueprint = structuredClone(source);
  blueprint.policies.lotRelease = {
    kind: "conwip",
    maximumWip,
    reopenAtWip,
    dispatch: "earliest-due-date",
    maximumReleaseDelayTicks,
  };
  return blueprint;
}

function summarizeMetrics(metrics: BlueprintMetricSnapshot) {
  return {
    score: metrics.score,
    contractFulfillment: metrics.contractFulfillment,
    completedLots: metrics.completedLots,
    firstPassYield: metrics.firstPassYield,
    scrappedLots: metrics.scrappedLots,
    reworkCycles: metrics.reworkCycles,
    qualityEscapes: metrics.qualityEscapes,
    pendingReleaseLots: metrics.pendingReleaseLots,
    queueTimeViolations: metrics.queueTimeViolations,
    queueTimeViolatedLots: metrics.queueTimeViolatedLots,
    maximumQueueTimeOverrunTicks: metrics.maximumQueueTimeOverrunTicks,
    maintenanceCompleted: metrics.totalMaintenanceCompleted,
    assetLimitMaintenance: metrics.totalAssetLimitMaintenance,
    qualificationCompleted: metrics.totalQualificationCompleted,
    energyConsumedMilliJoules: metrics.energyConsumedMilliJoules,
    totalBuildCost: metrics.totalBuildCost,
    occupiedArea: metrics.occupiedArea,
    infeasibleReason: metrics.infeasibleReason,
  };
}

const source = await loadFactoryProject(projectDir, { blueprint: incumbentBlueprintId });
const incumbentProject = compileFactoryProject(source);
const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const incumbent = await evaluatePreparedBlueprintBenchmark(prepared, {
  candidateBlueprint: incumbentProject.blueprint,
  evaluationId: "commissioned-yield-incumbent",
});

const dualDeep = parallelizeWorkCenter(incumbentProject, incumbentProject.blueprint, {
  device: "inspection-1",
  cloneId: "inspection-2",
});
if (!dualDeep) throw new Error("could not construct the explicit dual-deep diagnostic topology");

const variants: Variant[] = [
  {
    strategy: "incumbent",
    hypothesis: "Record the exact commissioned Blueprint as the current-best comparison boundary.",
    blueprint: incumbentProject.blueprint,
  },
  {
    strategy: "maintenance:inspection-opportunistic-4",
    hypothesis: "Use an otherwise-idle window after four inspections to service the existing five-job bay.",
    blueprint: configureInspectionMaintenance(incumbentProject.blueprint, "opportunistic", 4),
  },
  {
    strategy: "maintenance:inspection-planned-4",
    hypothesis: "Block the fifth inspection until the existing bay completes physical service and qualification.",
    blueprint: configureInspectionMaintenance(incumbentProject.blueprint, "planned", 4),
  },
  {
    strategy: "capacity:dual-deep-inspection",
    hypothesis: "Route the final-inspection workload across two independently maintained deep-inspection bays.",
    blueprint: dualDeep.blueprint,
    diagnosticOnly: true,
  },
  {
    strategy: "asset:continuous-deep-metrology",
    hypothesis: "Replace the five-job bay with a higher-power, small-premium deep-metrology cell qualified across the full campaign and bounded rework return.",
    blueprint: selectContinuousMetrology(incumbentProject.blueprint),
  },
  {
    strategy: "toolset-capacity:continuous-deep-metrology+conwip-7-4",
    hypothesis: "Pair continuous deep disposition with a seven-card, four-card-reopen release window and a thirty-second starvation escape so higher inspection capacity produces terminal lots instead of excess WIP.",
    blueprint: configureRelease(
      selectContinuousMetrology(incumbentProject.blueprint),
      7,
      4,
      30_000,
    ),
  },
];

const rows: ResultRow[] = [];
for (const variant of variants) {
  const evaluation = variant.strategy === "incumbent"
    ? incumbent
    : await evaluatePreparedBlueprintBenchmark(prepared, {
      candidateBlueprint: variant.blueprint,
      evaluationId: `commissioned-yield-${variant.strategy}`,
    });
  const caseDeltasFromIncumbent = evaluation.cases.map((item) => {
    const current = incumbent.cases.find((candidate) => candidate.id === item.id);
    if (!current) throw new Error(`incumbent Benchmark evidence is missing case '${item.id}'`);
    return { id: item.id, delta: item.candidateScore - current.candidateScore };
  });
  const aggregateDeltaFromIncumbent = evaluation.candidateScore - incumbent.candidateScore;
  const minimumCaseDeltaFromIncumbent = Math.min(...caseDeltasFromIncumbent.map((item) => item.delta));
  const hardOutcomesPassed = evaluation.outcomeGuardrails?.every((item) => item.passed) ?? true;
  const capacityReady = evaluation.cases.every((item) => item.candidateCapacityReady);
  const currentBestPassed = aggregateDeltaFromIncumbent > 1e-9
    && minimumCaseDeltaFromIncumbent >= -1e-9;
  const reasons = [
    ...evaluation.reasons,
    ...(variant.diagnosticOnly ? ["diagnostic topology is not eligible for commissioning"] : []),
    ...(variant.strategy !== "incumbent" && aggregateDeltaFromIncumbent <= 1e-9
      ? [`aggregate delta ${aggregateDeltaFromIncumbent.toFixed(6)} does not improve the incumbent`] : []),
    ...(minimumCaseDeltaFromIncumbent < -1e-9
      ? [`current-best case regression ${minimumCaseDeltaFromIncumbent.toFixed(6)} is below zero`] : []),
  ];
  const mixed = evaluation.cases.find((item) => item.id === "mixed-quality");
  if (!mixed) throw new Error("greenfield-dram-design must contain mixed-quality");
  rows.push({
    strategy: variant.strategy,
    hypothesis: variant.hypothesis,
    verdict: variant.strategy === "incumbent"
      ? "INCUMBENT"
      : !variant.diagnosticOnly && evaluation.accepted && hardOutcomesPassed && capacityReady && currentBestPassed
        ? "KEEP"
        : "REJECT",
    benchmarkAccepted: evaluation.accepted,
    hardOutcomesPassed,
    capacityReady,
    aggregateDeltaFromIncumbent,
    minimumCaseDeltaFromIncumbent,
    caseDeltasFromIncumbent,
    reasons,
    mixedQuality: summarizeMetrics(mixed.candidateMetrics),
    cases: evaluation.cases.map((item) => ({ id: item.id, metrics: summarizeMetrics(item.candidateMetrics) })),
    outcomeGuardrails: evaluation.outcomeGuardrails,
    blueprint: variant.blueprint,
  });
}

rows.sort((left, right) =>
  Number(right.verdict === "KEEP") - Number(left.verdict === "KEEP")
  || Number(right.verdict === "INCUMBENT") - Number(left.verdict === "INCUMBENT")
  || right.aggregateDeltaFromIncumbent - left.aggregateDeltaFromIncumbent
  || right.minimumCaseDeltaFromIncumbent - left.minimumCaseDeltaFromIncumbent
  || left.strategy.localeCompare(right.strategy));

const report = {
  benchmark: benchmarkId,
  incumbent: {
    blueprint: incumbentBlueprintId,
    blueprintHash: incumbent.candidateBlueprintHash,
    aggregateScore: incumbent.candidateScore,
    cases: incumbent.cases.map((item) => ({ id: item.id, score: item.candidateScore })),
  },
  boundary: {
    requireBenchmarkAcceptance: true,
    requireAllOutcomeGuardrails: true,
    requireCapacityReady: true,
    minimumAggregateDeltaFromIncumbent: 0,
    maximumCaseRegressionFromIncumbent: 0,
  },
  rows,
};

if (Bun.argv.includes("--json")) {
  process.stdout.write(`${stableStringify(report, 2)}\n`);
} else {
  console.log(`# commissioned yield search · current=${incumbent.candidateScore.toFixed(6)} · ${rows.length} causal variants · locked Benchmark + 30 absolute thresholds + zero current-best regression`);
  console.log("verdict\tstrategy\taggregate-delta\tminimum-case-delta\tcase-deltas\thard-outcomes\tcapacity\tmixed-completed\tmixed-fpy\tmixed-scrap\tmixed-rework\tmixed-qtime\tmixed-qtime-lots\tmixed-maintenance\tmixed-energy-mj\tcost\tarea\treasons");
  for (const row of rows) console.log([
    row.verdict,
    row.strategy,
    row.aggregateDeltaFromIncumbent.toFixed(6),
    row.minimumCaseDeltaFromIncumbent.toFixed(6),
    row.caseDeltasFromIncumbent.map((item) => `${item.id}:${item.delta.toFixed(3)}`).join(","),
    row.hardOutcomesPassed ? "PASS" : "FAIL",
    row.capacityReady ? "READY" : "GAP",
    row.mixedQuality.completedLots,
    row.mixedQuality.firstPassYield.toFixed(3),
    row.mixedQuality.scrappedLots,
    row.mixedQuality.reworkCycles,
    row.mixedQuality.queueTimeViolations,
    row.mixedQuality.queueTimeViolatedLots,
    `${row.mixedQuality.assetLimitMaintenance}/${row.mixedQuality.maintenanceCompleted}`,
    (row.mixedQuality.energyConsumedMilliJoules / 1_000_000).toFixed(3),
    row.mixedQuality.totalBuildCost,
    row.mixedQuality.occupiedArea,
    row.reasons.join(" | ") || "none",
  ].join("\t"));
}
