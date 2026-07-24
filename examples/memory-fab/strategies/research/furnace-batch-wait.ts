import { resolve } from "node:path";
import {
  analyzeFabLossProfile,
  compileFactoryProject,
  evaluateFactoryBlueprint,
  loadFactoryProject,
  prepareBlueprintBenchmark,
  runUntil,
  stableStringify,
  subtractScoreBreakdown,
} from "../../../../packages/inm-core/src/index";
import type {
  Blueprint,
  BlueprintMetricSnapshot,
  FabLossProfile,
  ScoreBreakdown,
} from "../../../../packages/inm-core/src/index";

interface CaseResult {
  id: string;
  weight: number;
  score: number;
  baselineScore: number;
  baselineDelta: number;
  capacityReady: boolean;
  metrics: BlueprintMetricSnapshot;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const waitTicks = [0, 500, 1_000, 1_500, 2_000, 3_000, 5_000, 7_000, 10_000, 15_000];

function withBatchWait(blueprint: Blueprint, maximumWaitTicks: number): Blueprint {
  const candidate = structuredClone(blueprint);
  const furnace = candidate.devices.find((device) => device.id === "furnace-1");
  if (!furnace
    || !furnace.recipes?.some((recipe) => recipe.process === "batch-anneal-dielectric-stack")
    || !furnace.recipes.some((recipe) => recipe.process === "rapid-anneal-dielectric-stack")) {
    throw new Error("furnace-1 is missing its qualified batch/rapid process pair");
  }
  furnace.policy = {
    ...furnace.policy,
    batchFormation: {
      preferredProcess: "batch-anneal-dielectric-stack",
      maximumWaitTicks,
    },
  };
  return candidate;
}

function guardrailPassed(
  metrics: BlueprintMetricSnapshot,
  guardrail: NonNullable<typeof prepared.manifest.acceptance.outcomeGuardrails>[number],
  caseId: string,
): boolean {
  const threshold = guardrail.thresholds[caseId];
  if (threshold === undefined) return true;
  const value = metrics[guardrail.metric];
  return guardrail.operator === "minimum" ? value >= threshold - 1e-9 : value <= threshold + 1e-9;
}

function summarizeLoss(profile: FabLossProfile | null) {
  const bucket = profile?.buckets.find((item) => item.id === "input-starvation");
  const furnace = bucket?.contributors.find((item) => item.label === "furnace-1");
  return {
    chain: profile?.chain ?? [],
    inputStarvationScore: bucket?.score ?? 0,
    totalStarvationTicks: bucket?.evidence.starvationTicks ?? 0,
    furnaceStarvationTicks: furnace?.evidence.starvationTicks ?? 0,
    furnaceOpportunityWindowTicks: furnace?.evidence.opportunityWindowTicks ?? 0,
  };
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<number, {
  cases: CaseResult[];
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
  mixedQualityBatchFlow: ReturnType<typeof runUntil>["metrics"]["batchFlow"];
}>();

for (const maximumWaitTicks of waitTicks) {
  const cases: CaseResult[] = [];
  let mixedQualityLoss: ReturnType<typeof summarizeLoss> | null = null;
  let mixedQualityBatchFlow: ReturnType<typeof runUntil>["metrics"]["batchFlow"] | null = null;
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const blueprint = withBatchWait(loaded.blueprint, maximumWaitTicks);
    const project = compileFactoryProject({ ...loaded, blueprint });
    const evaluation = evaluateFactoryBlueprint(project, `furnace-batch-wait-${maximumWaitTicks}`, item.seed);
    cases.push({
      id: item.id,
      weight: item.weight,
      score: evaluation.metrics.score,
      baselineScore: preparedCase.evaluation.metrics.score,
      baselineDelta: evaluation.metrics.score - preparedCase.evaluation.metrics.score,
      capacityReady: evaluation.capacityPlan.ready,
      metrics: evaluation.metrics,
    });
    if (item.id === "mixed-quality") {
      const run = runUntil(project, undefined, { seed: item.seed });
      mixedQualityLoss = summarizeLoss(
        analyzeFabLossProfile(run.metrics, project.scenario.durationTicks, project, run.events),
      );
      mixedQualityBatchFlow = run.metrics.batchFlow;
    }
  }
  if (!mixedQualityLoss || !mixedQualityBatchFlow) throw new Error("Benchmark is missing mixed-quality");
  evaluated.set(maximumWaitTicks, { cases, mixedQualityLoss, mixedQualityBatchFlow });
}

const incumbent = evaluated.get(0);
if (!incumbent) throw new Error("Missing zero-wait incumbent");
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (cases: CaseResult[], field: "score" | "baselineScore") =>
  cases.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight;
const incumbentAggregate = weightedMean(incumbent.cases, "score");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));
const incumbentMixed = incumbent.cases.find((item) => item.id === "mixed-quality")!;

const rows = waitTicks.map((maximumWaitTicks) => {
  const result = evaluated.get(maximumWaitTicks)!;
  const aggregateScore = weightedMean(result.cases, "score");
  const aggregateBaseline = weightedMean(result.cases, "baselineScore");
  const aggregateDeltaFromBaseline = aggregateScore - aggregateBaseline;
  const aggregateDeltaFromIncumbent = aggregateScore - incumbentAggregate;
  const minimumBaselineCaseDelta = Math.min(...result.cases.map((item) => item.baselineDelta));
  const currentBestCaseDeltas = result.cases.map((item) => ({
    id: item.id,
    delta: item.score - incumbentByCase.get(item.id)!.score,
  }));
  const minimumCurrentBestCaseDelta = Math.min(...currentBestCaseDeltas.map((item) => item.delta));
  const capacityReady = result.cases.every((item) => item.capacityReady);
  const hardOutcomesPassed = result.cases.every((item) =>
    prepared.manifest.acceptance.outcomeGuardrails?.every((guardrail) =>
      guardrailPassed(item.metrics, guardrail, item.id)) ?? true);
  const benchmarkAccepted =
    aggregateDeltaFromBaseline >= prepared.manifest.acceptance.minimumAggregateScoreDelta - 1e-9
    && minimumBaselineCaseDelta >= -prepared.manifest.acceptance.maximumCaseScoreRegression - 1e-9
    && (!prepared.manifest.acceptance.requireCandidateCapacityReady || capacityReady)
    && hardOutcomesPassed;
  const mixed = result.cases.find((item) => item.id === "mixed-quality")!;
  return {
    id: `furnace-batch-wait-${maximumWaitTicks}`,
    maximumWaitTicks,
    benchmarkAccepted,
    capacityReady,
    hardOutcomesPassed,
    aggregateScore,
    aggregateDeltaFromBaseline,
    aggregateDeltaFromIncumbent,
    minimumBaselineCaseDelta,
    minimumCurrentBestCaseDelta,
    currentBestCaseDeltas,
    promotable: benchmarkAccepted && aggregateDeltaFromIncumbent > 1e-9 && minimumCurrentBestCaseDelta >= -1e-9,
    mixedQualityScoreBreakdownDelta: subtractScoreBreakdown(
      incumbentMixed.metrics.scoreBreakdown,
      mixed.metrics.scoreBreakdown,
    ) as ScoreBreakdown,
    mixedQualityLoss: result.mixedQualityLoss,
    mixedQualityBatchFlow: result.mixedQualityBatchFlow,
    cases: result.cases.map((item) => ({
      id: item.id,
      score: item.score,
      baselineDelta: item.baselineDelta,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      outcomes: {
        completedLots: item.metrics.completedLots,
        onTimeLots: item.metrics.onTimeLots,
        firstPassYield: item.metrics.firstPassYield,
        scrappedLots: item.metrics.scrappedLots,
        qualityEscapes: item.metrics.qualityEscapes,
      },
      cadenceControl: item.metrics.cadenceControl.devices["deposition-1"] ?? null,
    })),
  };
}).sort((left, right) => Number(right.promotable) - Number(left.promotable)
  || right.aggregateScore - left.aggregateScore
  || right.minimumCurrentBestCaseDelta - left.minimumCurrentBestCaseDelta
  || left.maximumWaitTicks - right.maximumWaitTicks);

console.log(stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  incumbent: {
    aggregateScore: incumbentAggregate,
    mixedQualityLoss: incumbent.mixedQualityLoss,
    mixedQualityBatchFlow: incumbent.mixedQualityBatchFlow,
  },
  rows,
}, 2));
