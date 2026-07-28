import { resolve } from "node:path";
import {
  analyzeFabLossProfile,
  compileFactoryProject,
  evaluateFactoryBlueprint,
  loadFactoryProject,
  prepareBlueprintBenchmark,
  runUntil,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type {
  BlueprintMetricSnapshot,
  DeviceAsset,
  LoadedFactoryProject,
  ProductionModeDefinition,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  id: string;
  name: string;
  duration: { numerator: number; denominator: number };
  power: { numerator: number; denominator: number };
  control?: {
    recoverAtItems: number;
    minimumQueueTicks: number;
  };
  release?: {
    maximumWip: number;
    reopenAtWip: number;
  };
}

interface CaseResult {
  id: string;
  weight: number;
  score: number;
  capacityReady: boolean;
  metrics: BlueprintMetricSnapshot;
  targetQueueTicks: number | null;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const driverCaseId = "mixed-quality";
const deviceId = "etch-1";
const assetId = "plasma-etch-bay";
const processId = "etch-cell-layer-1";
const modeId = "high-rate-qualified";
const contributorId = "device:etch-1:process-queue-wait:dram-front-end:etch-cell-layer-1:etch-cell-layer-1";

const variants: Variant[] = [
  {
    id: "incumbent",
    name: "Existing qualified layer-one etch",
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 1, denominator: 1 },
  },
  {
    id: "high-rate:9-10",
    name: "Nine-tenths qualified cycle at 10/9 active power",
    duration: { numerator: 9, denominator: 10 },
    power: { numerator: 10, denominator: 9 },
  },
  {
    id: "high-rate:4-5",
    name: "Four-fifths qualified cycle at 5/4 active power",
    duration: { numerator: 4, denominator: 5 },
    power: { numerator: 5, denominator: 4 },
  },
  {
    id: "high-rate:3-4",
    name: "Three-quarters qualified cycle at 4/3 active power",
    duration: { numerator: 3, denominator: 4 },
    power: { numerator: 4, denominator: 3 },
  },
  {
    id: "high-rate:2-3",
    name: "Two-thirds qualified cycle at 3/2 active power",
    duration: { numerator: 2, denominator: 3 },
    power: { numerator: 3, denominator: 2 },
  },
  {
    id: "cycle-optimized:19-20",
    name: "Nineteen-twentieths cycle-optimized recipe at qualified active power",
    duration: { numerator: 19, denominator: 20 },
    power: { numerator: 1, denominator: 1 },
  },
  {
    id: "cycle-optimized:9-10",
    name: "Nine-tenths cycle-optimized recipe at qualified active power",
    duration: { numerator: 9, denominator: 10 },
    power: { numerator: 1, denominator: 1 },
  },
  {
    id: "endpoint-optimized:19-20",
    name: "Nineteen-twentieths endpoint-controlled recipe at 19/20 active power",
    duration: { numerator: 19, denominator: 20 },
    power: { numerator: 19, denominator: 20 },
  },
  {
    id: "endpoint-optimized:9-10",
    name: "Nine-tenths endpoint-controlled recipe at 9/10 active power",
    duration: { numerator: 9, denominator: 10 },
    power: { numerator: 9, denominator: 10 },
  },
  ...[
    {
      duration: { numerator: 9, denominator: 10 },
      power: { numerator: 10, denominator: 9 },
      label: "Nine-tenths",
      envelope: "9-10",
    },
    {
      duration: { numerator: 4, denominator: 5 },
      power: { numerator: 5, denominator: 4 },
      label: "Four-fifths",
      envelope: "4-5",
    },
  ].flatMap(({ duration, power, label, envelope }) =>
    [1_000, 2_500, 5_000, 7_500].map((minimumQueueTicks): Variant => ({
      id: `queue:${envelope}:1:${minimumQueueTicks}`,
      name: `${label} qualified cycle after one resident lot waits ${minimumQueueTicks / 1_000}s`,
      duration,
      power,
      control: { recoverAtItems: 1, minimumQueueTicks },
    }))),
  ...[1_000, 5_000, 7_500].map((minimumQueueTicks): Variant => ({
    id: `queue:cycle-optimized:9-10:1:${minimumQueueTicks}`,
    name: `Nine-tenths cycle-optimized recipe after one resident lot waits ${minimumQueueTicks / 1_000}s`,
    duration: { numerator: 9, denominator: 10 },
    power: { numerator: 1, denominator: 1 },
    control: { recoverAtItems: 1, minimumQueueTicks },
  })),
  ...[
    { maximumWip: 6, reopenAtWip: 4 },
    { maximumWip: 6, reopenAtWip: 3 },
    { maximumWip: 5, reopenAtWip: 4 },
    { maximumWip: 5, reopenAtWip: 3 },
    { maximumWip: 4, reopenAtWip: 3 },
  ].map((release): Variant => ({
    id: `release:${release.maximumWip}-${release.reopenAtWip}`,
    name: `CONWIP ${release.maximumWip}/${release.reopenAtWip} with incumbent layer-one etch`,
    duration: { numerator: 1, denominator: 1 },
    power: { numerator: 1, denominator: 1 },
    release,
  })),
  {
    id: "release:6-4+cycle:19-20",
    name: "CONWIP 6/4 with nineteen-twentieths cycle-optimized etch",
    duration: { numerator: 19, denominator: 20 },
    power: { numerator: 1, denominator: 1 },
    release: { maximumWip: 6, reopenAtWip: 4 },
  },
  {
    id: "release:6-3+cycle:19-20",
    name: "CONWIP 6/3 with nineteen-twentieths cycle-optimized etch",
    duration: { numerator: 19, denominator: 20 },
    power: { numerator: 1, denominator: 1 },
    release: { maximumWip: 6, reopenAtWip: 3 },
  },
  {
    id: "release:5-4+cycle:19-20",
    name: "CONWIP 5/4 with nineteen-twentieths cycle-optimized etch",
    duration: { numerator: 19, denominator: 20 },
    power: { numerator: 1, denominator: 1 },
    release: { maximumWip: 5, reopenAtWip: 4 },
  },
  {
    id: "release:5-3+cycle:19-20",
    name: "CONWIP 5/3 with nineteen-twentieths cycle-optimized etch",
    duration: { numerator: 19, denominator: 20 },
    power: { numerator: 1, denominator: 1 },
    release: { maximumWip: 5, reopenAtWip: 3 },
  },
];

function highRateMode(variant: Variant): ProductionModeDefinition {
  return {
    id: modeId,
    name: variant.name,
    inputCycles: 1,
    outputCycles: 1,
    durationMultiplier: variant.duration,
    powerMultiplier: variant.power,
    auxiliaryInputs: [],
    preventsDefects: [],
    minimumInputTreatmentLevel: 0,
  };
}

function configureVariant(loaded: LoadedFactoryProject, variant: Variant): LoadedFactoryProject {
  const blueprint = structuredClone(loaded.blueprint);
  if (variant.id === "incumbent") return { ...loaded, blueprint };
  if (variant.release) {
    const incumbentRelease = blueprint.policies.lotRelease?.kind === "conwip"
      ? blueprint.policies.lotRelease : null;
    blueprint.policies.lotRelease = {
      kind: "conwip",
      maximumWip: variant.release.maximumWip,
      reopenAtWip: variant.release.reopenAtWip,
      dispatch: incumbentRelease?.dispatch ?? "earliest-due-date",
      ...(incumbentRelease?.serviceLevelAfterTicks === undefined
        ? {} : { serviceLevelAfterTicks: incumbentRelease.serviceLevelAfterTicks }),
    };
  }
  const changesMode = variant.duration.numerator !== variant.duration.denominator
    || variant.power.numerator !== variant.power.denominator;
  if (!changesMode) return { ...loaded, blueprint };

  const deviceIndex = blueprint.devices.findIndex((device) => device.id === deviceId);
  const device = blueprint.devices[deviceIndex];
  const recipeIndex = device?.recipes?.findIndex((recipe) => recipe.process === processId) ?? -1;
  if (!device || device.asset !== assetId || recipeIndex < 0) {
    throw new Error(`Missing commissioned ${deviceId}/${processId} binding`);
  }
  if (variant.control) {
    const normalRecipe = structuredClone(device.recipes![recipeIndex]!);
    device.recipes = [
      normalRecipe,
      { ...structuredClone(normalRecipe), mode: modeId },
    ];
    device.policy = {
      ...device.policy,
      cadenceControl: {
        kind: "input-queue-recovery",
        process: processId,
        normalMode: "qualified",
        recoveryMode: modeId,
        inputResource: "patterned-cell-l1-lot",
        ...variant.control,
      },
    };
    delete device.policy.recipeDispatch;
  } else {
    device.recipes![recipeIndex]!.mode = modeId;
  }

  const sourceAsset = loaded.deviceAssets[assetId] as DeviceAsset | undefined;
  if (!sourceAsset?.production) throw new Error(`Missing production asset '${assetId}'`);
  const production = structuredClone(sourceAsset.production);
  production.modes = [
    ...production.modes.filter((mode) => mode.id !== modeId),
    highRateMode(variant),
  ];
  return {
    ...loaded,
    blueprint,
    deviceAssets: {
      ...loaded.deviceAssets,
      [assetId]: { ...sourceAsset, production },
    },
  };
}

function targetQueueTicks(
  loaded: LoadedFactoryProject,
  seed: number,
): number {
  const project = compileFactoryProject(loaded);
  const result = runUntil(project, undefined, { seed });
  const profile = analyzeFabLossProfile(
    result.metrics,
    project.scenario.durationTicks,
    project,
    result.events,
  );
  const contributor = profile?.buckets
    .find((bucket) => bucket.id === "queue-congestion")
    ?.contributors.find((item) => item.id === contributorId);
  const value = contributor?.evidence.queueTicks;
  if (!contributor) return 0;
  if (typeof value !== "number") {
    throw new Error(`Missing exact queue contributor '${contributorId}'`);
  }
  return value;
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

const selectedVariants = Bun.argv.includes("--endpoint-only")
  ? variants.filter((variant) => variant.id === "incumbent" || variant.id.startsWith("endpoint-optimized:"))
  : Bun.argv.includes("--release-only")
    ? variants.filter((variant) => variant.id === "incumbent" || variant.id.startsWith("release:"))
  : Bun.argv.includes("--release-six")
    ? variants.filter((variant) => variant.id === "incumbent" || variant.id.startsWith("release:6-"))
  : variants;
const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const evaluated = new Map<string, CaseResult[]>();

for (const variant of selectedVariants) {
  process.stderr.write(`Evaluating ${variant.id} across ${prepared.cases.length} locked cases\n`);
  const cases: CaseResult[] = [];
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    const candidate = configureVariant(loaded, variant);
    const project = compileFactoryProject(candidate);
    const evaluation = evaluateFactoryBlueprint(project, variant.id, item.seed);
    cases.push({
      id: item.id,
      weight: item.weight,
      score: evaluation.metrics.score,
      capacityReady: evaluation.capacityPlan.ready,
      metrics: evaluation.metrics,
      targetQueueTicks: item.id === driverCaseId ? targetQueueTicks(candidate, item.seed) : null,
    });
  }
  evaluated.set(variant.id, cases);
}

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent queue result");
const incumbentDriver = incumbent.find((item) => item.id === driverCaseId);
const incumbentQueueTicks = incumbentDriver?.targetQueueTicks;
if (!incumbentQueueTicks) throw new Error("Missing incumbent driver queue evidence");
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const aggregateScore = (cases: CaseResult[]) =>
  cases.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
const incumbentAggregate = aggregateScore(incumbent);
const incumbentByCase = new Map(incumbent.map((item) => [item.id, item]));

const rows = selectedVariants.map((variant) => {
  const cases = evaluated.get(variant.id)!;
  const driver = cases.find((item) => item.id === driverCaseId);
  if (driver?.targetQueueTicks === null || driver?.targetQueueTicks === undefined) {
    throw new Error(`Missing driver evidence for '${variant.id}'`);
  }
  const aggregate = aggregateScore(cases);
  const currentBestDeltas = cases.map((item) => ({
    id: item.id,
    delta: item.score - incumbentByCase.get(item.id)!.score,
  }));
  const minimumCurrentBestCaseDelta = Math.min(...currentBestDeltas.map((item) => item.delta));
  const capacityReady = cases.every((item) => item.capacityReady);
  const hardOutcomesPassed = cases.every((item) =>
    prepared.manifest.acceptance.outcomeGuardrails?.every((guardrail) =>
      guardrailPassed(item.metrics, guardrail, item.id)) ?? true);
  const targetDelta = driver.targetQueueTicks - incumbentQueueTicks;
  return {
    id: variant.id,
    name: variant.name,
    durationMultiplier: variant.duration,
    powerMultiplier: variant.power,
    aggregateScore: aggregate,
    aggregateDeltaFromIncumbent: aggregate - incumbentAggregate,
    minimumCurrentBestCaseDelta,
    capacityReady,
    hardOutcomesPassed,
    target: {
      contributor: contributorId,
      metric: "queueTicks",
      before: incumbentQueueTicks,
      after: driver.targetQueueTicks,
      delta: targetDelta,
    },
    control: variant.control ?? null,
    release: variant.release ?? null,
    promotable: variant.id !== "incumbent"
      && targetDelta < 0
      && aggregate - incumbentAggregate > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9
      && capacityReady
      && hardOutcomesPassed,
    cases: cases.map((item) => ({
      id: item.id,
      score: item.score,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      outcomes: {
        completedLots: item.metrics.completedLots,
        onTimeLots: item.metrics.onTimeLots,
        firstPassYield: item.metrics.firstPassYield,
        reworkCycles: item.metrics.reworkCycles,
        scrappedLots: item.metrics.scrappedLots,
        qualityEscapes: item.metrics.qualityEscapes,
        energyConsumedMilliJoules: item.metrics.energyConsumedMilliJoules,
        scoreBreakdown: item.metrics.scoreBreakdown,
      },
      cadence: item.metrics.cadenceControl.devices[deviceId] ?? null,
    })),
  };
}).sort((left, right) =>
  Number(right.promotable) - Number(left.promotable)
  || right.aggregateDeltaFromIncumbent - left.aggregateDeltaFromIncumbent
  || left.target.after - right.target.after
  || left.id.localeCompare(right.id));

process.stdout.write(`${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  driverCase: driverCaseId,
  incumbent: {
    aggregateScore: incumbentAggregate,
    targetQueueTicks: incumbentQueueTicks,
  },
  rows,
}, 2)}\n`);
