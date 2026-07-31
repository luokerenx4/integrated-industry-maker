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
  BlueprintMetricSnapshot,
  FabLossProfile,
  InputSupplyState,
  LoadedFactoryProject,
} from "../../../../packages/inm-core/src/index";

type ControlKind = "incumbent" | "always" | "input-queue" | "downstream-coverage";

interface Variant {
  id: string;
  control: ControlKind;
  mode?: "queue-cycle-optimized-19-20" | "queue-high-rate-4-5";
  minimumTicks?: number;
}

interface CaseResult {
  id: string;
  weight: number;
  score: number;
  baselineScore: number;
  capacityReady: boolean;
  metrics: BlueprintMetricSnapshot;
}

interface FurnaceEvidence {
  starvationTicks: number;
  sourceProcessingTicks: number;
  sourceWaitingInputTicks: number;
  transportInFlightTicks: number;
  otherTicks: number;
  aggregateStarvationTicks: number;
  depositionStarvationTicks: number;
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const driverCaseId = "mixed-quality";
const deviceId = "etch-1";
const processId = "etch-cell-layer-1";
const inputResource = "patterned-cell-l1-lot";
const outputConnection = "etch-to-deposition";
const contributorId = "device:furnace-1:material-input-shortage";

const variants: Variant[] = [
  { id: "incumbent", control: "incumbent" },
  {
    id: "endpoint-cycle-optimized-19-20",
    control: "always",
    mode: "queue-cycle-optimized-19-20",
  },
  {
    id: "input-queue-high-rate-after-5s",
    control: "input-queue",
    mode: "queue-high-rate-4-5",
    minimumTicks: 5_000,
  },
  ...[1_000, 5_000, 10_000].map((minimumTicks): Variant => ({
    id: `ald-coverage-high-rate-after-${minimumTicks / 1_000}s`,
    control: "downstream-coverage",
    mode: "queue-high-rate-4-5",
    minimumTicks,
  })),
];

function configureVariant(loaded: LoadedFactoryProject, variant: Variant): LoadedFactoryProject {
  if (variant.control === "incumbent") return loaded;
  const blueprint = structuredClone(loaded.blueprint);
  const device = blueprint.devices.find((item) => item.id === deviceId);
  const normalRecipe = device?.recipes?.find((recipe) => recipe.process === processId);
  if (!device || device.asset !== "plasma-etch-bay" || !normalRecipe || normalRecipe.mode !== "qualified") {
    throw new Error(`Missing commissioned ${deviceId}/${processId} binding`);
  }
  if (!variant.mode) throw new Error(`Variant '${variant.id}' has no mode`);

  if (variant.control === "always") {
    normalRecipe.mode = variant.mode;
    return { ...loaded, blueprint };
  }

  device.recipes = [
    structuredClone(normalRecipe),
    { ...structuredClone(normalRecipe), mode: variant.mode },
  ];
  device.policy = { ...device.policy };
  delete device.policy.recipeDispatch;
  if (variant.control === "input-queue") {
    device.policy.cadenceControl = {
      kind: "input-queue-recovery",
      process: processId,
      normalMode: "qualified",
      recoveryMode: variant.mode,
      inputResource,
      recoverAtItems: 1,
      minimumQueueTicks: variant.minimumTicks!,
    };
  } else {
    device.policy.cadenceControl = {
      kind: "downstream-coverage-recovery",
      process: processId,
      normalMode: "qualified",
      recoveryMode: variant.mode,
      downstreamConnection: outputConnection,
      recoverBelowItems: 1,
      minimumCoverageDeficitTicks: variant.minimumTicks!,
    };
  }
  return { ...loaded, blueprint };
}

function furnaceEvidence(profile: FabLossProfile | null): FurnaceEvidence {
  const bucket = profile?.buckets.find((item) => item.id === "input-starvation");
  const furnace = bucket?.contributors.find((item) => item.id === contributorId);
  const ticksForState = (state: InputSupplyState) => furnace?.inputStates.reduce((sum, inputState) =>
    sum + (inputState.shortages.some((shortage) => shortage.supplies.some((supply) => supply.state === state))
      ? inputState.starvationTicks : 0), 0) ?? 0;
  const starvationTicks = furnace?.evidence.starvationTicks ?? 0;
  const sourceProcessingTicks = ticksForState("source-processing");
  const sourceWaitingInputTicks = ticksForState("source-waiting-input");
  const transportInFlightTicks = ticksForState("transport-in-flight");
  return {
    starvationTicks,
    sourceProcessingTicks,
    sourceWaitingInputTicks,
    transportInFlightTicks,
    otherTicks: starvationTicks - sourceProcessingTicks - sourceWaitingInputTicks - transportInFlightTicks,
    aggregateStarvationTicks: bucket?.evidence.starvationTicks ?? 0,
    depositionStarvationTicks: bucket?.contributors.find((item) =>
      item.id === "device:deposition-1:material-input-shortage")?.evidence.starvationTicks ?? 0,
  };
}

function subtractFurnace(before: FurnaceEvidence, after: FurnaceEvidence): FurnaceEvidence {
  return {
    starvationTicks: after.starvationTicks - before.starvationTicks,
    sourceProcessingTicks: after.sourceProcessingTicks - before.sourceProcessingTicks,
    sourceWaitingInputTicks: after.sourceWaitingInputTicks - before.sourceWaitingInputTicks,
    transportInFlightTicks: after.transportInFlightTicks - before.transportInFlightTicks,
    otherTicks: after.otherTicks - before.otherTicks,
    aggregateStarvationTicks: after.aggregateStarvationTicks - before.aggregateStarvationTicks,
    depositionStarvationTicks: after.depositionStarvationTicks - before.depositionStarvationTicks,
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
const evaluated = new Map<string, { cases: CaseResult[]; furnace: FurnaceEvidence }>();

for (const variant of variants) {
  process.stderr.write(`Evaluating ${variant.id} across ${prepared.cases.length} locked cases\n`);
  const cases: CaseResult[] = [];
  let driverEvidence: FurnaceEvidence | null = null;
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      productionPlan: item.productionPlan,
      scenario: item.scenario,
      objective: item.objective,
    });
    const project = compileFactoryProject(configureVariant(loaded, variant));
    const evaluation = evaluateFactoryBlueprint(project, variant.id, item.seed);
    cases.push({
      id: item.id,
      weight: item.weight,
      score: evaluation.metrics.score,
      baselineScore: preparedCase.evaluation.metrics.score,
      capacityReady: evaluation.capacityPlan.ready,
      metrics: evaluation.metrics,
    });
    if (item.id === driverCaseId) {
      const run = runUntil(project, undefined, { seed: item.seed });
      driverEvidence = furnaceEvidence(
        analyzeFabLossProfile(run.metrics, project.scenario.durationTicks, project, run.events),
      );
    }
  }
  if (!driverEvidence) throw new Error(`Missing ${driverCaseId} evidence for '${variant.id}'`);
  evaluated.set(variant.id, { cases, furnace: driverEvidence });
}

const incumbent = evaluated.get("incumbent");
if (!incumbent) throw new Error("Missing incumbent result");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const aggregateScore = (cases: CaseResult[]) =>
  cases.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
const incumbentAggregate = aggregateScore(incumbent.cases);

const rows = variants.map((variant) => {
  const result = evaluated.get(variant.id)!;
  const aggregate = aggregateScore(result.cases);
  const aggregateBaseline = result.cases.reduce((sum, item) =>
    sum + item.baselineScore * item.weight, 0) / totalWeight;
  const minimumBaselineCaseDelta = Math.min(...result.cases.map((item) => item.score - item.baselineScore));
  const minimumCurrentBestCaseDelta = Math.min(...result.cases.map((item) =>
    item.score - incumbentByCase.get(item.id)!.score));
  const capacityReady = result.cases.every((item) => item.capacityReady);
  const hardOutcomesPassed = result.cases.every((item) =>
    prepared.manifest.acceptance.outcomeGuardrails?.every((guardrail) =>
      guardrailPassed(item.metrics, guardrail, item.id)) ?? true);
  const benchmarkAccepted = aggregate - aggregateBaseline
      >= prepared.manifest.acceptance.minimumAggregateScoreDelta - 1e-9
    && minimumBaselineCaseDelta
      >= -prepared.manifest.acceptance.maximumCaseScoreRegression - 1e-9
    && (!prepared.manifest.acceptance.requireCandidateCapacityReady || capacityReady)
    && hardOutcomesPassed;
  const targetDelta = result.furnace.starvationTicks - incumbent.furnace.starvationTicks;
  const driver = result.cases.find((item) => item.id === driverCaseId)!;
  const incumbentDriver = incumbentByCase.get(driverCaseId)!;
  return {
    ...variant,
    aggregateScore: aggregate,
    aggregateDeltaFromIncumbent: aggregate - incumbentAggregate,
    minimumCurrentBestCaseDelta,
    benchmarkAccepted,
    capacityReady,
    hardOutcomesPassed,
    promotable: variant.id !== "incumbent"
      && targetDelta < 0
      && aggregate - incumbentAggregate > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9
      && benchmarkAccepted,
    target: {
      contributor: contributorId,
      metric: "starvationTicks",
      before: incumbent.furnace.starvationTicks,
      after: result.furnace.starvationTicks,
      delta: targetDelta,
      partition: result.furnace,
      partitionDelta: subtractFurnace(incumbent.furnace, result.furnace),
    },
    driver: {
      score: driver.score,
      scoreDelta: driver.score - incumbentDriver.score,
      averageWipEquivalentUnits: driver.metrics.averageWipEquivalentUnits,
      wipDelta: driver.metrics.averageWipEquivalentUnits - incumbentDriver.metrics.averageWipEquivalentUnits,
      completedLots: driver.metrics.completedLots,
      onTimeLots: driver.metrics.onTimeLots,
      firstPassYield: driver.metrics.firstPassYield,
      reworkCycles: driver.metrics.reworkCycles,
      scrappedLots: driver.metrics.scrappedLots,
      qualityEscapes: driver.metrics.qualityEscapes,
      energyConsumedMilliJoules: driver.metrics.energyConsumedMilliJoules,
      scoreBreakdownDelta: subtractScoreBreakdown(
        incumbentDriver.metrics.scoreBreakdown,
        driver.metrics.scoreBreakdown,
      ),
      cadence: driver.metrics.cadenceControl.devices[deviceId] ?? null,
    },
    cases: result.cases.map((item) => ({
      id: item.id,
      score: item.score,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      completedLots: item.metrics.completedLots,
      onTimeLots: item.metrics.onTimeLots,
      firstPassYield: item.metrics.firstPassYield,
      scrappedLots: item.metrics.scrappedLots,
      qualityEscapes: item.metrics.qualityEscapes,
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
  sourceRun: "114-candidate-trial-run-112-dimensional-stability",
  incumbent: {
    aggregateScore: incumbentAggregate,
    furnace: incumbent.furnace,
  },
  rows,
}, 2)}\n`);
