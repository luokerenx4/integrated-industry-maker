import { resolve } from "node:path";
import {
  compileFactoryProject,
  evaluateFactoryBlueprint,
  hashValue,
  loadFactoryProject,
  prepareBlueprintBenchmark,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type {
  BlueprintMetricSnapshot,
  DeviceAsset,
  JsonPatchOperation,
  LoadedFactoryProject,
} from "../../../../packages/inm-core/src/index";

interface ProbeMode {
  id: string;
  name: string;
  durationMultiplier: { numerator: number; denominator: number };
  powerMultiplier: { numerator: number; denominator: number };
}

interface Variant {
  id: string;
  particleSuppression: boolean;
  etchSleep: boolean;
  probeMode?: ProbeMode;
  burnInMode?: ProbeMode;
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
const etchAssetId = "closed-loop-plasma-etch-bay";
const etchProcessId = "etch-cell-layer-2";
const probeDeviceId = "probe-1";
const probeAssetId = "dram-wafer-probe-cell";
const probeProcessId = "probe-sort-dram-standard";
const burnInDeviceId = "burn-in-1";
const burnInAssetId = "dram-burn-in-rack";
const sleepAfterTicks = 45_000;
const sleepEnvelope = {
  idleMilliWatts: 5_000,
  wakeDurationTicks: 5_000,
  wakePowerMilliWatts: 200_000,
};
const probeModes: ProbeMode[] = [
  {
    id: "agile-probe-95",
    name: "Agile 95% cycle Probe",
    durationMultiplier: { numerator: 19, denominator: 20 },
    powerMultiplier: { numerator: 20, denominator: 19 },
  },
  {
    id: "agile-probe-90",
    name: "Agile 90% cycle Probe",
    durationMultiplier: { numerator: 9, denominator: 10 },
    powerMultiplier: { numerator: 10, denominator: 9 },
  },
  {
    id: "agile-probe-85",
    name: "Agile 85% cycle Probe",
    durationMultiplier: { numerator: 17, denominator: 20 },
    powerMultiplier: { numerator: 20, denominator: 17 },
  },
  {
    id: "agile-probe-80",
    name: "Agile 80% cycle Probe",
    durationMultiplier: { numerator: 4, denominator: 5 },
    powerMultiplier: { numerator: 5, denominator: 4 },
  },
];
const burnInModes: ProbeMode[] = [
  {
    id: "agile-screening-5-8",
    name: "Agile 62.5% cycle screening",
    durationMultiplier: { numerator: 5, denominator: 8 },
    powerMultiplier: { numerator: 8, denominator: 5 },
  },
  {
    id: "agile-screening-3-5",
    name: "Agile 60% cycle screening",
    durationMultiplier: { numerator: 3, denominator: 5 },
    powerMultiplier: { numerator: 5, denominator: 3 },
  },
  {
    id: "agile-screening-1-2",
    name: "Agile 50% cycle screening",
    durationMultiplier: { numerator: 1, denominator: 2 },
    powerMultiplier: { numerator: 2, denominator: 1 },
  },
];
const probeVariants: Variant[] = [
  { id: "incumbent", particleSuppression: false, etchSleep: false },
  { id: "particle", particleSuppression: true, etchSleep: false },
  { id: "particle+sleep-45000", particleSuppression: true, etchSleep: true },
  ...probeModes.flatMap((probeMode) => [
    {
      id: `probe-${probeMode.durationMultiplier.numerator}-${probeMode.durationMultiplier.denominator}`,
      particleSuppression: false,
      etchSleep: false,
      probeMode,
    },
    {
      id: `particle+probe-${probeMode.durationMultiplier.numerator}-${probeMode.durationMultiplier.denominator}`,
      particleSuppression: true,
      etchSleep: false,
      probeMode,
    },
    {
      id: `particle+sleep-45000+probe-${probeMode.durationMultiplier.numerator}-${probeMode.durationMultiplier.denominator}`,
      particleSuppression: true,
      etchSleep: true,
      probeMode,
    },
  ]),
];
const probeFourFifths = probeModes.find((mode) => mode.id === "agile-probe-80")!;
const backendVariants: Variant[] = [
  { id: "incumbent", particleSuppression: false, etchSleep: false },
  {
    id: "probe-4-5",
    particleSuppression: false,
    etchSleep: false,
    probeMode: probeFourFifths,
  },
  {
    id: "particle+probe-4-5",
    particleSuppression: true,
    etchSleep: false,
    probeMode: probeFourFifths,
  },
  {
    id: "particle+sleep-45000+probe-4-5",
    particleSuppression: true,
    etchSleep: true,
    probeMode: probeFourFifths,
  },
  ...burnInModes.flatMap((burnInMode) => [
    {
      id: `burn-in-${burnInMode.durationMultiplier.numerator}-${burnInMode.durationMultiplier.denominator}`,
      particleSuppression: false,
      etchSleep: false,
      burnInMode,
    },
    {
      id: `probe-4-5+burn-in-${burnInMode.durationMultiplier.numerator}-${burnInMode.durationMultiplier.denominator}`,
      particleSuppression: false,
      etchSleep: false,
      probeMode: probeFourFifths,
      burnInMode,
    },
    {
      id: `particle+probe-4-5+burn-in-${burnInMode.durationMultiplier.numerator}-${burnInMode.durationMultiplier.denominator}`,
      particleSuppression: true,
      etchSleep: false,
      probeMode: probeFourFifths,
      burnInMode,
    },
    {
      id: `particle+sleep-45000+probe-4-5+burn-in-${burnInMode.durationMultiplier.numerator}-${burnInMode.durationMultiplier.denominator}`,
      particleSuppression: true,
      etchSleep: true,
      probeMode: probeFourFifths,
      burnInMode,
    },
  ]),
];
const backendResearch = Bun.argv.includes("--backend");
const variants = backendResearch ? backendVariants : probeVariants;

function replaceMode(
  loaded: LoadedFactoryProject,
  deviceId: string,
  processId: string,
  mode: string,
  patch: JsonPatchOperation[],
): number {
  const deviceIndex = loaded.blueprint.devices.findIndex((device) => device.id === deviceId);
  const device = loaded.blueprint.devices[deviceIndex];
  if (!device) throw new Error(`Missing qualified Device '${deviceId}'`);
  if (device.recipe?.process === processId) {
    if (device.recipe.mode !== mode) {
      device.recipe.mode = mode;
      patch.push({
        op: "replace",
        path: `/devices/${deviceIndex}/recipe/mode`,
        value: mode,
      });
    }
    return deviceIndex;
  }
  if (!device.recipes) throw new Error(`Device '${deviceId}' is not qualified for '${processId}'`);
  const recipeIndex = device.recipes.findIndex((recipe) => recipe.process === processId);
  const recipe = device.recipes[recipeIndex];
  if (!recipe) throw new Error(`Device '${deviceId}' is not qualified for '${processId}'`);
  if (recipe.mode !== mode) {
    recipe.mode = mode;
    patch.push({
      op: "replace",
      path: `/devices/${deviceIndex}/recipes/${recipeIndex}/mode`,
      value: mode,
    });
  }
  return deviceIndex;
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

  if (variant.particleSuppression) {
    replaceMode(loaded, etchDeviceId, etchProcessId, "particle-suppression", patch);
  }
  if (variant.etchSleep) {
    const sourceAsset = source.deviceAssets[etchAssetId] as DeviceAsset | undefined;
    if (!sourceAsset) throw new Error(`Missing Device asset '${etchAssetId}'`);
    loaded.deviceAssets[etchAssetId] = {
      ...sourceAsset,
      power: { ...sourceAsset.power, sleep: sleepEnvelope },
      contentHash: hashValue({ source: sourceAsset.contentHash, sleep: sleepEnvelope }),
    };
    const deviceIndex = loaded.blueprint.devices.findIndex((device) => device.id === etchDeviceId);
    const device = loaded.blueprint.devices[deviceIndex];
    if (!device?.policy) throw new Error(`Device '${etchDeviceId}' has no policy`);
    device.policy.idleEnergy = { sleepAfterTicks };
    patch.push({
      op: Object.hasOwn(source.blueprint.devices[deviceIndex]!.policy ?? {}, "idleEnergy") ? "replace" : "add",
      path: `/devices/${deviceIndex}/policy/idleEnergy`,
      value: { sleepAfterTicks },
    });
  }
  if (variant.probeMode) {
    const sourceAsset = source.deviceAssets[probeAssetId] as DeviceAsset | undefined;
    if (!sourceAsset?.production) throw new Error(`Missing production asset '${probeAssetId}'`);
    loaded.deviceAssets[probeAssetId] = {
      ...sourceAsset,
      production: {
        ...sourceAsset.production,
        modes: [
          ...structuredClone(sourceAsset.production.modes).filter((mode) => mode.id !== variant.probeMode!.id),
          {
            id: variant.probeMode.id,
            name: variant.probeMode.name,
            inputCycles: 1,
            outputCycles: 1,
            durationMultiplier: { ...variant.probeMode.durationMultiplier },
            powerMultiplier: { ...variant.probeMode.powerMultiplier },
            auxiliaryInputs: [],
            preventsDefects: [],
            minimumInputTreatmentLevel: 0,
          },
        ],
      },
      contentHash: hashValue({ source: sourceAsset.contentHash, mode: variant.probeMode }),
    };
    replaceMode(loaded, probeDeviceId, probeProcessId, variant.probeMode.id, patch);
  }
  if (variant.burnInMode) {
    const sourceAsset = source.deviceAssets[burnInAssetId] as DeviceAsset | undefined;
    if (!sourceAsset?.production) throw new Error(`Missing production asset '${burnInAssetId}'`);
    loaded.deviceAssets[burnInAssetId] = {
      ...sourceAsset,
      production: {
        ...sourceAsset.production,
        modes: [
          ...structuredClone(sourceAsset.production.modes).filter((mode) => mode.id !== variant.burnInMode!.id),
          {
            id: variant.burnInMode.id,
            name: variant.burnInMode.name,
            inputCycles: 1,
            outputCycles: 1,
            durationMultiplier: { ...variant.burnInMode.durationMultiplier },
            powerMultiplier: { ...variant.burnInMode.powerMultiplier },
            auxiliaryInputs: [],
            preventsDefects: [],
            minimumInputTreatmentLevel: 0,
          },
        ],
      },
      contentHash: hashValue({ source: sourceAsset.contentHash, mode: variant.burnInMode }),
    };
    const deviceIndex = loaded.blueprint.devices.findIndex((device) => device.id === burnInDeviceId);
    const device = loaded.blueprint.devices[deviceIndex];
    if (!device?.recipes?.length) throw new Error(`Missing qualified Device '${burnInDeviceId}'`);
    for (let recipeIndex = 0; recipeIndex < device.recipes.length; recipeIndex++) {
      const recipe = device.recipes[recipeIndex]!;
      recipe.mode = variant.burnInMode.id;
      patch.push({
        op: "replace",
        path: `/devices/${deviceIndex}/recipes/${recipeIndex}/mode`,
        value: variant.burnInMode.id,
      });
    }
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
if (!incumbent) throw new Error("Missing incumbent Probe-repair evidence");
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedScore = (cases: CaseResult[], field: "score" | "baselineScore") =>
  cases.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight;
const incumbentAggregate = weightedScore(incumbent.cases, "score");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));

const rows = variants.map((variant) => {
  const result = evaluated.get(variant.id)!;
  const aggregateScore = weightedScore(result.cases, "score");
  const aggregateBaseline = weightedScore(result.cases, "baselineScore");
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
      etchMode: variant.particleSuppression ? "particle-suppression" : "closed-loop-control",
      etchSleepAfterTicks: variant.etchSleep ? sleepAfterTicks : null,
      etchSleepEnvelope: variant.etchSleep ? sleepEnvelope : null,
      probeMode: variant.probeMode ?? null,
      burnInMode: variant.burnInMode ?? null,
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
      scoreBreakdown: item.metrics.scoreBreakdown,
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
  research: backendResearch ? "particle-backend-repair" : "particle-probe-repair",
  benchmark: benchmarkId,
  blueprint: blueprintId,
  incumbent: { aggregateScore: incumbentAggregate },
  rows,
}, 2)}\n`);
