import { resolve } from "node:path";
import {
  compileFactoryProject,
  evaluateFactoryBlueprint,
  loadFactoryProject,
  prepareBlueprintBenchmark,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type {
  BlueprintMetricSnapshot,
  DeviceAsset,
  JsonPatchOperation,
  LoadedFactoryProject,
  LotDispatchPolicy,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  id: string;
  particleSuppression: boolean;
  etchDispatch?: LotDispatchPolicy;
  reworkDispatch?: LotDispatchPolicy;
  sleepAfterTicks?: number;
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
const etchDeviceId = "etch-l2";
const reworkDeviceId = "rework-1";
const etchAssetId = "closed-loop-plasma-etch-bay";
const processId = "etch-cell-layer-2";
const sleepEnvelope = {
  idleMilliWatts: 5_000,
  wakeDurationTicks: 5_000,
  wakePowerMilliWatts: 200_000,
};

const dispatchVariants: Variant[] = [
  { id: "particle+rework-edd", particleSuppression: true, reworkDispatch: "earliest-due-date" },
  { id: "particle+rework-priority", particleSuppression: true, reworkDispatch: "highest-priority" },
  { id: "particle+rework-oldest", particleSuppression: true, reworkDispatch: "oldest-release" },
  { id: "particle+etch-edd", particleSuppression: true, etchDispatch: "earliest-due-date" },
  {
    id: "particle+etch-edd+rework-edd",
    particleSuppression: true,
    etchDispatch: "earliest-due-date",
    reworkDispatch: "earliest-due-date",
  },
  {
    id: "particle+etch-priority+rework-edd",
    particleSuppression: true,
    etchDispatch: "highest-priority",
    reworkDispatch: "earliest-due-date",
  },
];

const sleepThresholds = [15_000, 20_000, 30_000, 45_000, 60_000];
const variants: Variant[] = [
  { id: "incumbent", particleSuppression: false },
  { id: "particle", particleSuppression: true },
  ...dispatchVariants,
  ...sleepThresholds.flatMap((sleepAfterTicks) => [
    {
      id: `particle+sleep-${sleepAfterTicks}`,
      particleSuppression: true,
      sleepAfterTicks,
    },
    {
      id: `particle+etch-edd+rework-edd+sleep-${sleepAfterTicks}`,
      particleSuppression: true,
      etchDispatch: "earliest-due-date" as const,
      reworkDispatch: "earliest-due-date" as const,
      sleepAfterTicks,
    },
  ]),
];

function replaceRecipeMode(
  loaded: LoadedFactoryProject,
  deviceIndex: number,
  mode: string,
  patch: JsonPatchOperation[],
): void {
  const device = loaded.blueprint.devices[deviceIndex]!;
  if (!device.recipes) throw new Error(`Device '${device.id}' has no qualified recipe list`);
  const recipeIndex = device.recipes.findIndex((recipe) => recipe.process === processId);
  const recipe = device.recipes[recipeIndex];
  if (!recipe) throw new Error(`Device '${device.id}' is not qualified for '${processId}'`);
  if (recipe.mode === mode) return;
  recipe.mode = mode;
  patch.push({
    op: "replace",
    path: `/devices/${deviceIndex}/recipes/${recipeIndex}/mode`,
    value: mode,
  });
}

function replaceLotDispatch(
  loaded: LoadedFactoryProject,
  deviceIndex: number,
  lotDispatch: LotDispatchPolicy,
  patch: JsonPatchOperation[],
): void {
  const device = loaded.blueprint.devices[deviceIndex]!;
  if (!device.policy) throw new Error(`Device '${device.id}' has no policy`);
  if (device.policy.lotDispatch === lotDispatch) return;
  patch.push({
    op: Object.hasOwn(device.policy, "lotDispatch") ? "replace" : "add",
    path: `/devices/${deviceIndex}/policy/lotDispatch`,
    value: lotDispatch,
  });
  device.policy.lotDispatch = lotDispatch;
}

function configureVariant(
  source: LoadedFactoryProject,
  variant: Variant,
): { loaded: LoadedFactoryProject; patch: JsonPatchOperation[] } {
  const loaded: LoadedFactoryProject = {
    ...source,
    blueprint: structuredClone(source.blueprint),
    deviceAssets: { ...source.deviceAssets },
  };
  const patch: JsonPatchOperation[] = [];
  const etchIndex = loaded.blueprint.devices.findIndex((device) => device.id === etchDeviceId);
  const reworkIndex = loaded.blueprint.devices.findIndex((device) => device.id === reworkDeviceId);
  if (etchIndex < 0 || reworkIndex < 0) throw new Error("Missing commissioned etch or rework Device");

  if (variant.particleSuppression) replaceRecipeMode(loaded, etchIndex, "particle-suppression", patch);
  if (variant.etchDispatch) replaceLotDispatch(loaded, etchIndex, variant.etchDispatch, patch);
  if (variant.reworkDispatch) replaceLotDispatch(loaded, reworkIndex, variant.reworkDispatch, patch);

  if (variant.sleepAfterTicks !== undefined) {
    const sourceAsset = source.deviceAssets[etchAssetId] as DeviceAsset | undefined;
    if (!sourceAsset) throw new Error(`Missing Device asset '${etchAssetId}'`);
    loaded.deviceAssets[etchAssetId] = {
      ...sourceAsset,
      power: { ...sourceAsset.power, sleep: sleepEnvelope },
    };
    const etch = loaded.blueprint.devices[etchIndex]!;
    if (!etch.policy) throw new Error(`Device '${etchDeviceId}' has no policy`);
    etch.policy.idleEnergy = { sleepAfterTicks: variant.sleepAfterTicks };
    patch.push({
      op: Object.hasOwn(source.blueprint.devices[etchIndex]!.policy ?? {}, "idleEnergy") ? "replace" : "add",
      path: `/devices/${etchIndex}/policy/idleEnergy`,
      value: { sleepAfterTicks: variant.sleepAfterTicks },
    });
  }
  return { loaded, patch };
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

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<string, { cases: CaseResult[]; patch: JsonPatchOperation[] }>();

for (const variant of variants) {
  const cases: CaseResult[] = [];
  let patch: JsonPatchOperation[] | null = null;
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const source = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const candidate = configureVariant(source, variant);
    patch ??= candidate.patch;
    const evaluation = evaluateFactoryBlueprint(
      compileFactoryProject(candidate.loaded),
      variant.id,
      item.seed,
    );
    cases.push({
      id: item.id,
      weight: item.weight,
      score: evaluation.metrics.score,
      baselineScore: preparedCase.evaluation.metrics.score,
      baselineDelta: evaluation.metrics.score - preparedCase.evaluation.metrics.score,
      capacityReady: evaluation.capacityPlan.ready,
      metrics: evaluation.metrics,
    });
  }
  if (!patch) throw new Error(`Incomplete research evidence for '${variant.id}'`);
  evaluated.set(variant.id, { cases, patch });
}

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent branch-repair evidence");
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (cases: CaseResult[], field: "score" | "baselineScore") =>
  cases.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight;
const incumbentAggregate = weightedMean(incumbent.cases, "score");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));

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
  return {
    id: variant.id,
    controls: {
      mode: variant.particleSuppression ? "particle-suppression" : "closed-loop-control",
      etchDispatch: variant.etchDispatch ?? "fifo",
      reworkDispatch: variant.reworkDispatch ?? "fifo",
      sleepAfterTicks: variant.sleepAfterTicks ?? null,
      sleepEnvelope: variant.sleepAfterTicks === undefined ? null : sleepEnvelope,
    },
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
    cases: result.cases.map((item) => ({
      id: item.id,
      score: item.score,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      outcomes: {
        completedLots: item.metrics.completedLots,
        onTimeLots: item.metrics.onTimeLots,
        meanTardinessTicks: item.metrics.meanTardinessTicks,
        meanCycleTimeTicks: item.metrics.meanCycleTimeTicks,
        averageWip: item.metrics.averageWip,
        firstPassYield: item.metrics.firstPassYield,
        reworkCycles: item.metrics.reworkCycles,
        energyConsumedMilliJoules: item.metrics.energyConsumedMilliJoules,
        equipmentSleeps: item.metrics.totalEquipmentSleeps,
        equipmentWakeups: item.metrics.totalEquipmentWakeups,
      },
    })),
  };
}).sort((left, right) =>
  Number(right.promotable) - Number(left.promotable)
  || right.aggregateDeltaFromIncumbent - left.aggregateDeltaFromIncumbent
  || right.minimumCurrentBestCaseDelta - left.minimumCurrentBestCaseDelta
  || left.id.localeCompare(right.id));

await Bun.write(Bun.stdout, `${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  incumbent: { aggregateScore: incumbentAggregate },
  rows,
}, 2)}\n`);
