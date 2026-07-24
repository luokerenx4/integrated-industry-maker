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
  JsonPatchOperation,
  LotDispatchPolicy,
  ScoreBreakdown,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  id: string;
  policy: LotDispatchPolicy | null;
  devices: string[];
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
const fifoDevices = ["lithography-1", "etch-1", "furnace-1", "rework-1", "lithography-l2", "etch-l2"];
const variants: Variant[] = [
  { id: "incumbent", policy: null, devices: [] },
  ...fifoDevices.map((device) => ({
    id: `${device}-earliest-due-date`,
    policy: "earliest-due-date" as const,
    devices: [device],
  })),
  {
    id: "lithography-pair-earliest-due-date",
    policy: "earliest-due-date",
    devices: ["lithography-1", "lithography-l2"],
  },
  {
    id: "etch-pair-earliest-due-date",
    policy: "earliest-due-date",
    devices: ["etch-1", "etch-l2"],
  },
  {
    id: "front-end-earliest-due-date",
    policy: "earliest-due-date",
    devices: ["lithography-1", "etch-1", "furnace-1", "lithography-l2", "etch-l2"],
  },
  { id: "all-route-earliest-due-date", policy: "earliest-due-date", devices: fifoDevices },
  { id: "all-route-oldest-release", policy: "oldest-release", devices: fifoDevices },
  { id: "all-route-highest-priority", policy: "highest-priority", devices: fifoDevices },
];

function withDispatch(blueprint: Blueprint, variant: Variant): {
  blueprint: Blueprint;
  patch: JsonPatchOperation[];
} {
  const candidate = structuredClone(blueprint);
  const patch: JsonPatchOperation[] = [];
  if (!variant.policy) return { blueprint: candidate, patch };
  for (const deviceId of variant.devices) {
    const index = candidate.devices.findIndex((device) => device.id === deviceId);
    if (index < 0) throw new Error(`Missing commissioned Device '${deviceId}'`);
    const device = candidate.devices[index]!;
    if (!device.policy) throw new Error(`Device '${deviceId}' has no policy object`);
    if (device.policy.lotDispatch === variant.policy) continue;
    patch.push({
      op: Object.hasOwn(device.policy, "lotDispatch") ? "replace" : "add",
      path: `/devices/${index}/policy/lotDispatch`,
      value: variant.policy,
    });
    device.policy.lotDispatch = variant.policy;
  }
  return { blueprint: candidate, patch };
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
  const input = profile?.buckets.find((bucket) => bucket.id === "input-starvation");
  const queue = profile?.buckets.find((bucket) => bucket.id === "queue-congestion");
  return {
    chain: profile?.chain ?? [],
    inputStarvationScore: input?.score ?? 0,
    inputStarvationTicks: input?.evidence.starvationTicks ?? 0,
    leadingInputGap: input?.contributors[0]
      ? {
        id: input.contributors[0].label,
        ticks: input.contributors[0].evidence.starvationTicks,
      }
      : null,
    queueScore: queue?.score ?? 0,
  };
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<string, {
  cases: CaseResult[];
  patch: JsonPatchOperation[];
  mixedQualityLoss: ReturnType<typeof summarizeLoss>;
}>();

for (const variant of variants) {
  const cases: CaseResult[] = [];
  let patch: JsonPatchOperation[] | null = null;
  let mixedQualityLoss: ReturnType<typeof summarizeLoss> | null = null;
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const candidate = withDispatch(loaded.blueprint, variant);
    patch ??= candidate.patch;
    const project = compileFactoryProject({ ...loaded, blueprint: candidate.blueprint });
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
    }
  }
  if (!patch || !mixedQualityLoss) throw new Error(`Incomplete research evidence for '${variant.id}'`);
  evaluated.set(variant.id, { cases, patch, mixedQualityLoss });
}

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent dispatch result");
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
    policy: variant.policy,
    devices: variant.devices,
    patch: result.patch,
    benchmarkAccepted,
    hardOutcomesPassed,
    capacityReady,
    aggregateScore,
    aggregateDeltaFromBaseline,
    aggregateDeltaFromIncumbent,
    minimumBaselineCaseDelta,
    minimumCurrentBestCaseDelta,
    currentBestCaseDeltas,
    promotable:
      result.patch.length > 0
      && benchmarkAccepted
      && aggregateDeltaFromIncumbent > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9,
    mixedQualityScoreBreakdownDelta: subtractScoreBreakdown(
      incumbentMixed.metrics.scoreBreakdown,
      mixed.metrics.scoreBreakdown,
    ) as ScoreBreakdown,
    mixedQualityLoss: result.mixedQualityLoss,
    cases: result.cases.map((item) => ({
      id: item.id,
      score: item.score,
      baselineDelta: item.baselineDelta,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      outcomes: {
        completedLots: item.metrics.completedLots,
        onTimeLots: item.metrics.onTimeLots,
        meanTardinessTicks: item.metrics.meanTardinessTicks,
        meanQueueTimeTicks: item.metrics.meanQueueTimeTicks,
        firstPassYield: item.metrics.firstPassYield,
        scrappedLots: item.metrics.scrappedLots,
        qualityEscapes: item.metrics.qualityEscapes,
        pendingReleaseLots: item.metrics.pendingReleaseLots,
      },
    })),
  };
}).sort((left, right) =>
  Number(right.promotable) - Number(left.promotable)
  || right.aggregateDeltaFromIncumbent - left.aggregateDeltaFromIncumbent
  || right.minimumCurrentBestCaseDelta - left.minimumCurrentBestCaseDelta
  || left.id.localeCompare(right.id));

process.stdout.write(`${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  incumbent: {
    aggregateScore: incumbentAggregate,
    mixedQualityLoss: incumbent.mixedQualityLoss,
  },
  rows,
}, 2)}\n`);
