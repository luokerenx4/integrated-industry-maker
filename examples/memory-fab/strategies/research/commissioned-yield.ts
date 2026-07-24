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

function selectAdvancedRecovery(
  source: Blueprint,
  lotDispatch: "fifo" | "earliest-due-date" | "highest-priority" = "fifo",
): Blueprint {
  const blueprint = structuredClone(source);
  const recovery = blueprint.devices.find((item) => item.id === "rework-1");
  if (!recovery?.recipe || recovery.recipe.process !== "rework-final-pattern") {
    throw new Error("advanced pattern recovery requires rework-1 with the incumbent selective-rework recipe");
  }
  recovery.asset = "advanced-pattern-recovery-cell";
  recovery.recipe.process = "recover-final-pattern-advanced";
  recovery.policy = { ...recovery.policy, lotDispatch };
  delete recovery.policy.preventiveMaintenance;
  return blueprint;
}

function configureRelease(
  source: Blueprint,
  maximumWip: number,
  reopenAtWip: number,
  serviceLevelAfterTicks: number,
  dispatch: "fifo" | "earliest-due-date" | "highest-priority" = "earliest-due-date",
): Blueprint {
  const blueprint = structuredClone(source);
  blueprint.policies.lotRelease = {
    kind: "conwip",
    maximumWip,
    reopenAtWip,
    dispatch,
    serviceLevelAfterTicks,
  };
  return blueprint;
}

function summarizeMetrics(metrics: BlueprintMetricSnapshot) {
  return {
    score: metrics.score,
    contractFulfillment: metrics.contractFulfillment,
    deliveryNetValuePerMinute: metrics.deliveryNetValuePerMinute,
    deliveryOverflow: metrics.deliveryOverflow,
    completedLots: metrics.completedLots,
    onTimeLots: metrics.onTimeLots,
    firstPassYield: metrics.firstPassYield,
    scrappedLots: metrics.scrappedLots,
    reworkCycles: metrics.reworkCycles,
    qualityEscapes: metrics.qualityEscapes,
    pendingReleaseLots: metrics.pendingReleaseLots,
    queueTimeViolations: metrics.queueTimeViolations,
    queueTimeViolatedLots: metrics.queueTimeViolatedLots,
    maximumQueueTimeOverrunTicks: metrics.maximumQueueTimeOverrunTicks,
    meanCycleTimeTicks: metrics.meanCycleTimeTicks,
    meanTardinessTicks: metrics.meanTardinessTicks,
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
const outcomeGuardrailCount = prepared.manifest.acceptance.outcomeGuardrails?.length ?? 0;
const outcomeThresholdCount = prepared.manifest.acceptance.outcomeGuardrails?.reduce(
  (total, guardrail) => total + Object.keys(guardrail.thresholds).length,
  0,
) ?? 0;
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
  {
    strategy: "recovery:advanced-pattern-recovery",
    hypothesis: "Replace the selective pattern bay with a higher-power advanced recovery cell that removes particle contamination while leaving latent electrical damage terminal.",
    blueprint: selectAdvancedRecovery(incumbentProject.blueprint),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+edd",
    hypothesis: "Run the advanced recovery cell earliest-due-date so repaired lots return to continuous metrology in contract-slack order.",
    blueprint: selectAdvancedRecovery(incumbentProject.blueprint, "earliest-due-date"),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+priority",
    hypothesis: "Run the advanced recovery cell highest-priority so the most valuable delayed lot receives scarce recovery capacity first.",
    blueprint: selectAdvancedRecovery(incumbentProject.blueprint, "highest-priority"),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3",
    hypothesis: "Pair advanced recovery with a six-card release window so recoverable lots reach the back end with less congestion.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 30_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-18",
    hypothesis: "Use the six-card recovery window with an eighteen-second starvation escape to preserve interruption service.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 18_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-20",
    hypothesis: "Use the six-card recovery window with a twenty-second starvation escape between the two observed interruption blockers.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 20_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-22",
    hypothesis: "Use the six-card recovery window with a twenty-two-second starvation escape between the two observed interruption blockers.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 22_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-24",
    hypothesis: "Use the six-card recovery window with a twenty-four-second starvation escape between the two observed interruption blockers.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 24_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-26",
    hypothesis: "Use the six-card recovery window with a twenty-six-second starvation escape between the two observed interruption blockers.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 26_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-28",
    hypothesis: "Use the six-card recovery window with a twenty-eight-second starvation escape between the two observed interruption blockers.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 28_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-45",
    hypothesis: "Use the six-card recovery window with a forty-five-second starvation escape to reduce congestion in the quality stress wave.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 45_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-60",
    hypothesis: "Use the six-card recovery window with a sixty-second starvation escape to test strict WIP control under all locked cases.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 60_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-18-fifo",
    hypothesis: "Use FIFO admission with the six-card recovery window and eighteen-second starvation escape to avoid resequencing lots into the lithography outage.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 18_000, "fifo"),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-30-fifo",
    hypothesis: "Use FIFO admission with the six-card recovery window and thirty-second starvation escape to preserve authored wave order.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 30_000, "fifo"),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-18-priority",
    hypothesis: "Use priority admission with the six-card recovery window and eighteen-second starvation escape to serve the fixed high-priority tail first.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 18_000, "highest-priority"),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-3-delay-30-priority",
    hypothesis: "Use priority admission with the six-card recovery window and thirty-second starvation escape to serve the fixed high-priority tail first.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 3, 30_000, "highest-priority"),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-6-4",
    hypothesis: "Reopen the six-card recovery window at four lots so the facility-interruption case can replenish earlier.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 6, 4, 30_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-7-3",
    hypothesis: "Keep seven maximum active lots but require a deeper drain before admitting the recovery wave.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 7, 3, 30_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-5-3",
    hypothesis: "Use a five-card recovery window reopening at three to test whether the smallest practical front-end wave improves robust service.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 5, 3, 30_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-8-5",
    hypothesis: "Pair advanced recovery with an eight-card release window so the recovered particle lot reaches product disposition earlier without reopening the original nine-card wave.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 8, 5, 30_000),
  },
  {
    strategy: "recovery:advanced-pattern-recovery+conwip-9-6",
    hypothesis: "Pair advanced recovery with the earlier nine-card commissioned release window so recovered yield has enough downstream horizon to become product.",
    blueprint: configureRelease(selectAdvancedRecovery(incumbentProject.blueprint), 9, 6, 18_000),
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
    outcomeGuardrails: outcomeGuardrailCount,
    outcomeThresholds: outcomeThresholdCount,
  },
  rows,
};

if (Bun.argv.includes("--json")) {
  process.stdout.write(`${stableStringify(report, 2)}\n`);
} else {
  console.log(`# commissioned yield search · current=${incumbent.candidateScore.toFixed(6)} · ${rows.length} causal variants · locked Benchmark + ${outcomeGuardrailCount} guardrails / ${outcomeThresholdCount} absolute thresholds + zero current-best regression`);
  console.log("verdict\tstrategy\taggregate-delta\tminimum-case-delta\tcase-deltas\thard-outcomes\tcapacity\tmixed-value/min\tmixed-overflow\tmixed-completed/on-time\tmixed-fpy\tmixed-scrap\tmixed-rework\tmixed-cycle/tardy-s\tmixed-qtime\tmixed-qtime-lots\tmixed-maintenance\tmixed-energy-mj\tcost\tarea\treasons");
  for (const row of rows) console.log([
    row.verdict,
    row.strategy,
    row.aggregateDeltaFromIncumbent.toFixed(6),
    row.minimumCaseDeltaFromIncumbent.toFixed(6),
    row.caseDeltasFromIncumbent.map((item) => `${item.id}:${item.delta.toFixed(3)}`).join(","),
    row.hardOutcomesPassed ? "PASS" : "FAIL",
    row.capacityReady ? "READY" : "GAP",
    row.mixedQuality.deliveryNetValuePerMinute.toFixed(3),
    row.mixedQuality.deliveryOverflow,
    `${row.mixedQuality.completedLots}/${row.mixedQuality.onTimeLots}`,
    row.mixedQuality.firstPassYield.toFixed(3),
    row.mixedQuality.scrappedLots,
    row.mixedQuality.reworkCycles,
    `${(row.mixedQuality.meanCycleTimeTicks / 1000).toFixed(3)}/${(row.mixedQuality.meanTardinessTicks / 1000).toFixed(3)}`,
    row.mixedQuality.queueTimeViolations,
    row.mixedQuality.queueTimeViolatedLots,
    `${row.mixedQuality.assetLimitMaintenance}/${row.mixedQuality.maintenanceCompleted}`,
    (row.mixedQuality.energyConsumedMilliJoules / 1_000_000).toFixed(3),
    row.mixedQuality.totalBuildCost,
    row.mixedQuality.occupiedArea,
    row.reasons.join(" | ") || "none",
  ].join("\t"));
}
