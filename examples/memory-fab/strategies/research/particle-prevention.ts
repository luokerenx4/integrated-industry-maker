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
  ProductionModeDefinition,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  id: string;
  name: string;
  duration: { numerator: number; denominator: number };
  power: { numerator: number; denominator: number };
  diagnosticOnly?: boolean;
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
const deviceId = "etch-l2";
const assetId = "closed-loop-plasma-etch-bay";
const processId = "etch-cell-layer-2";
const modeId = "particle-suppression";

const variants: Variant[] = [
  {
    id: "incumbent",
    name: "Existing latent-electrical closed-loop control",
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 6, denominator: 5 },
  },
  {
    id: "diagnostic:no-extra-energy",
    name: "Particle suppression without an incremental operating envelope",
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 6, denominator: 5 },
    diagnosticOnly: true,
  },
  {
    id: "particle-suppression:13-10-power",
    name: "Inline particle suppression at 13/10 active power",
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 13, denominator: 10 },
  },
  {
    id: "particle-suppression:7-5-power",
    name: "Inline particle suppression at 7/5 active power",
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 7, denominator: 5 },
  },
  {
    id: "particle-suppression:3-2-power",
    name: "Inline particle suppression at 3/2 active power",
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 3, denominator: 2 },
  },
  {
    id: "particle-suppression:7-5-power+11-10-duration",
    name: "Particle suppression with a 10% chamber-conditioning hold",
    duration: { numerator: 11, denominator: 10 },
    power: { numerator: 7, denominator: 5 },
  },
  {
    id: "particle-suppression:8-5-power+11-10-duration",
    name: "High-energy particle suppression with a 10% chamber-conditioning hold",
    duration: { numerator: 11, denominator: 10 },
    power: { numerator: 8, denominator: 5 },
  },
];

function particleMode(variant: Variant): ProductionModeDefinition {
  return {
    id: modeId,
    name: variant.name,
    inputCycles: 1,
    outputCycles: 1,
    durationMultiplier: variant.duration,
    powerMultiplier: variant.power,
    auxiliaryInputs: [],
    preventsDefects: ["latent-electrical", "particle-contamination"],
    minimumInputTreatmentLevel: 0,
  };
}

function configureVariant(
  loaded: LoadedFactoryProject,
  variant: Variant,
): { loaded: LoadedFactoryProject; patch: JsonPatchOperation[] } {
  const blueprint = structuredClone(loaded.blueprint);
  const index = blueprint.devices.findIndex((device) => device.id === deviceId);
  if (index < 0) throw new Error(`Missing commissioned Device '${deviceId}'`);
  const device = blueprint.devices[index]!;
  if (device.asset !== assetId || !device.recipes?.some((recipe) => recipe.process === processId)) {
    throw new Error(`Device '${deviceId}' is not the commissioned layer-two closed-loop etch bay`);
  }
  if (variant.id === "incumbent") return { loaded: { ...loaded, blueprint }, patch: [] };

  const sourceAsset = loaded.deviceAssets[assetId] as DeviceAsset | undefined;
  if (!sourceAsset?.production) throw new Error(`Missing production asset '${assetId}'`);
  const production = structuredClone(sourceAsset.production);
  production.modes = [
    ...production.modes.filter((mode) => mode.id !== modeId),
    particleMode(variant),
  ];
  const asset: DeviceAsset = {
    ...sourceAsset,
    production,
  };

  const recipeIndex = device.recipes.findIndex((recipe) => recipe.process === processId);
  const recipe = device.recipes[recipeIndex]!;
  recipe.mode = modeId;
  return {
    loaded: {
      ...loaded,
      blueprint,
      deviceAssets: { ...loaded.deviceAssets, [assetId]: asset },
    },
    patch: [{
      op: "replace",
      path: `/devices/${index}/recipes/${recipeIndex}/mode`,
      value: modeId,
    }],
  };
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
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const candidate = configureVariant(loaded, variant);
    patch ??= candidate.patch;
    const project = compileFactoryProject(candidate.loaded);
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
  }
  if (!patch) throw new Error(`Incomplete research evidence for '${variant.id}'`);
  evaluated.set(variant.id, { cases, patch });
}

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent particle-prevention result");
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
    name: variant.name,
    diagnosticOnly: variant.diagnosticOnly ?? false,
    durationMultiplier: variant.duration,
    powerMultiplier: variant.power,
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
      !variant.diagnosticOnly
      && result.patch.length > 0
      && benchmarkAccepted
      && aggregateDeltaFromIncumbent > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9,
    cases: result.cases.map((item) => ({
      id: item.id,
      score: item.score,
      baselineDelta: item.baselineDelta,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      outcomes: {
        completedLots: item.metrics.completedLots,
        onTimeLots: item.metrics.onTimeLots,
        firstPassYield: item.metrics.firstPassYield,
        reworkCycles: item.metrics.reworkCycles,
        scrappedLots: item.metrics.scrappedLots,
        qualityEscapes: item.metrics.qualityEscapes,
        preventedDefectInstances: item.metrics.preventedDefectInstances,
        appliedDefectInstances: item.metrics.appliedDefectInstances,
        energyConsumedMilliJoules: item.metrics.energyConsumedMilliJoules,
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
  incumbent: { aggregateScore: incumbentAggregate },
  rows,
}, 2)}\n`);
