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

interface Variant {
  id: string;
  recoverBelowItems: number | null;
}

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
const variants: Variant[] = [
  { id: "incumbent", recoverBelowItems: null },
  ...[1, 2, 3, 4, 5, 6].map((recoverBelowItems) => ({
    id: `adaptive-agile-pulse-below-${recoverBelowItems}`,
    recoverBelowItems,
  })),
];

function withCadenceControl(blueprint: Blueprint, recoverBelowItems: number): Blueprint {
  const candidate = structuredClone(blueprint);
  const deposition = candidate.devices.find((device) => device.id === "deposition-1");
  if (!deposition?.recipe || deposition.recipe.process !== "deposit-dielectric-stack" || deposition.recipe.mode !== "qualified") {
    throw new Error("deposition-1 is not the expected commissioned qualified ALD Device");
  }
  const normal = structuredClone(deposition.recipe);
  delete deposition.recipe;
  deposition.recipes = [normal, { ...structuredClone(normal), mode: "agile-pulse" }];
  deposition.policy = {
    ...deposition.policy,
    cadenceControl: {
      kind: "downstream-starvation-recovery",
      process: "deposit-dielectric-stack",
      normalMode: "qualified",
      recoveryMode: "agile-pulse",
      downstreamConnection: "deposition-to-batch-furnace",
      recoverBelowItems,
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
  const deposition = bucket?.contributors.find((item) => item.label === "deposition-1");
  return {
    chain: profile?.chain ?? [],
    inputStarvationScore: bucket?.score ?? 0,
    totalStarvationTicks: bucket?.evidence.starvationTicks ?? 0,
    furnaceStarvationTicks: furnace?.evidence.starvationTicks ?? 0,
    depositionStarvationTicks: deposition?.evidence.starvationTicks ?? 0,
  };
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<string, {
  cases: CaseResult[];
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
  mixedQualityModeJobs: { normal: number; recovery: number };
}>();

for (const variant of variants) {
  const cases: CaseResult[] = [];
  let mixedQualityLoss: ReturnType<typeof summarizeLoss> | null = null;
  let mixedQualityModeJobs = { normal: 0, recovery: 0 };
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const blueprint = variant.recoverBelowItems === null
      ? loaded.blueprint
      : withCadenceControl(loaded.blueprint, variant.recoverBelowItems);
    const project = compileFactoryProject({ ...loaded, blueprint });
    const evaluation = evaluateFactoryBlueprint(project, variant.id, item.seed);
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
      const control = run.metrics.cadenceControl.devices["deposition-1"];
      mixedQualityModeJobs = {
        normal: control?.normalJobs ?? 0,
        recovery: control?.recoveryJobs ?? 0,
      };
    }
  }
  if (!mixedQualityLoss) throw new Error("Benchmark is missing mixed-quality");
  evaluated.set(variant.id, { cases, mixedQualityLoss, mixedQualityModeJobs });
}

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent result");
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (cases: CaseResult[], field: "score" | "baselineScore") =>
  cases.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight;
const incumbentAggregate = weightedMean(incumbent.cases, "score");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));
const incumbentMixed = incumbent.cases.find((item) => item.id === "mixed-quality")!;

const rows = variants.map((variant) => {
  const result = evaluated.get(variant.id)!;
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
    id: variant.id,
    recoverBelowItems: variant.recoverBelowItems,
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
    mixedQualityModeJobs: result.mixedQualityModeJobs,
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
    })),
  };
}).sort((left, right) => Number(right.promotable) - Number(left.promotable)
  || right.aggregateScore - left.aggregateScore
  || right.minimumCurrentBestCaseDelta - left.minimumCurrentBestCaseDelta
  || (left.recoverBelowItems ?? 0) - (right.recoverBelowItems ?? 0));

console.log(stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  incumbent: {
    aggregateScore: incumbentAggregate,
    mixedQualityLoss: incumbent.mixedQualityLoss,
  },
  rows,
}, 2));
