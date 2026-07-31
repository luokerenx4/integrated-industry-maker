import { resolve } from "node:path";
import {
  analyzeFabLossProfile,
  analyzeSourceLotServices,
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
  FactoryEvent,
  JsonPatchOperation,
  LoadedFactoryProject,
  LotDispatchPolicy,
  SourceLotServiceAnalysis,
} from "../../../../packages/inm-core/src/index";

interface Variant {
  id: string;
  policy: LotDispatchPolicy | null;
}

interface CaseResult {
  id: string;
  weight: number;
  score: number;
  baselineScore: number;
  capacityReady: boolean;
  metrics: BlueprintMetricSnapshot;
}

interface ProbeQueueEvidence {
  queueTicks: number;
  maximumQueueTicks: number;
  contributingLots: number;
  aggregateQueueTicks: number;
  queueShare: number;
}

interface LotChronology {
  lot: string;
  arrivalTick: number;
  startTick: number;
  finishTick: number;
  queueTicks: number;
}

interface SourceServiceSummary {
  sourceLots: string[];
  fullBatchReadyAtTick: number | null;
  serviceStartTick: number | null;
  serviceFinishTick: number | null;
  deliveredUnits: number;
  unservedAgeTicks: number;
}

interface DriverEvidence {
  queue: ProbeQueueEvidence;
  chronology: LotChronology[];
  packaging: SourceServiceSummary[];
  burnIn: SourceServiceSummary[];
  deliveryMix: Record<string, number>;
  finalWipSourceLots: string[][];
}

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const driverCaseId = "mixed-quality";
const probeDeviceId = "probe-1";
const probeContributorId = "device:probe-1:process-queue-wait:dram-front-end:probe-dram:probe-sort-dram-standard";

const variants: Variant[] = [
  { id: "incumbent-earliest-due-date", policy: null },
  { id: "probe-fifo", policy: "fifo" },
  { id: "probe-oldest-release", policy: "oldest-release" },
  { id: "probe-highest-priority", policy: "highest-priority" },
];

function configureVariant(
  loaded: LoadedFactoryProject,
  variant: Variant,
): { loaded: LoadedFactoryProject; patch: JsonPatchOperation[] } {
  const blueprint = structuredClone(loaded.blueprint);
  const index = blueprint.devices.findIndex((device) => device.id === probeDeviceId);
  if (index < 0) throw new Error(`Missing commissioned Device '${probeDeviceId}'`);
  const device = blueprint.devices[index]!;
  if (!device.policy || device.policy.lotDispatch !== "earliest-due-date") {
    throw new Error(`Expected ${probeDeviceId} to use earliest-due-date dispatch`);
  }
  if (!variant.policy) return { loaded: { ...loaded, blueprint }, patch: [] };
  const patch: JsonPatchOperation[] = [{
    op: "replace",
    path: `/devices/${index}/policy/lotDispatch`,
    value: variant.policy,
  }];
  device.policy.lotDispatch = variant.policy;
  return { loaded: { ...loaded, blueprint }, patch };
}

function probeQueueEvidence(profile: FabLossProfile | null): ProbeQueueEvidence {
  const bucket = profile?.buckets.find((item) => item.id === "queue-congestion");
  const contributor = bucket?.contributors.find((item) => item.id === probeContributorId);
  return {
    queueTicks: contributor?.evidence.queueTicks ?? 0,
    maximumQueueTicks: contributor?.evidence.maximumQueueTicks ?? 0,
    contributingLots: contributor?.evidence.contributingLots ?? 0,
    aggregateQueueTicks: bucket?.evidence.totalQueueTicks ?? 0,
    queueShare: contributor?.evidence.queueShare ?? 0,
  };
}

function probeChronology(events: readonly FactoryEvent[]): LotChronology[] {
  const arrivals = new Map<string, number>();
  const starts = new Map<string, { startTick: number; finishTick: number }>();
  for (const event of events) {
    if (event.type === "resource.arrive" && event.transit.to === probeDeviceId) {
      for (const lot of event.transit.lotIds ?? []) arrivals.set(lot, event.tick);
    }
    if (event.type === "device.start" && event.device === probeDeviceId) {
      for (const lot of event.lotIds ?? []) starts.set(lot, {
        startTick: event.tick,
        finishTick: event.tick + event.durationTicks,
      });
    }
  }
  return [...starts].map(([lot, service]) => {
    const arrivalTick = arrivals.get(lot);
    if (arrivalTick === undefined) throw new Error(`Missing Probe arrival for '${lot}'`);
    return {
      lot,
      arrivalTick,
      startTick: service.startTick,
      finishTick: service.finishTick,
      queueTicks: service.startTick - arrivalTick,
    };
  }).sort((left, right) => left.startTick - right.startTick || left.lot.localeCompare(right.lot));
}

function summarizeService(analysis: SourceLotServiceAnalysis): SourceServiceSummary[] {
  return analysis.sourceSets.map((sourceSet) => ({
    sourceLots: sourceSet.sourceLotIds,
    fullBatchReadyAtTick: sourceSet.inputArrival.fullBatchReadyAtTick,
    serviceStartTick: sourceSet.service?.startTick ?? null,
    serviceFinishTick: sourceSet.service?.finishTick ?? null,
    deliveredUnits: sourceSet.delivery.units,
    unservedAgeTicks: sourceSet.unservedAgeTicks,
  }));
}

function serviceForDevice(
  analyses: SourceLotServiceAnalysis[],
  device: "packaging-1" | "burn-in-1",
): SourceServiceSummary[] {
  const analysis = analyses.find((item) => item.query.device === device);
  if (!analysis) throw new Error(`Missing source-lot service analysis for '${device}'`);
  return summarizeService(analysis);
}

function serviceDeltas(
  before: SourceServiceSummary[],
  after: SourceServiceSummary[],
): Array<SourceServiceSummary & {
  fullBatchReadyDelta: number | null;
  serviceStartDelta: number | null;
  serviceFinishDelta: number | null;
  deliveredDelta: number;
}> {
  const beforeBySource = new Map(before.map((item) => [item.sourceLots.join("+"), item]));
  return after.map((item) => {
    const previous = beforeBySource.get(item.sourceLots.join("+"));
    const delta = (current: number | null, old: number | null | undefined) =>
      current === null || old === null || old === undefined ? null : current - old;
    return {
      ...item,
      fullBatchReadyDelta: delta(item.fullBatchReadyAtTick, previous?.fullBatchReadyAtTick),
      serviceStartDelta: delta(item.serviceStartTick, previous?.serviceStartTick),
      serviceFinishDelta: delta(item.serviceFinishTick, previous?.serviceFinishTick),
      deliveredDelta: item.deliveredUnits - (previous?.deliveredUnits ?? 0),
    };
  });
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
const evaluated = new Map<string, {
  cases: CaseResult[];
  patch: JsonPatchOperation[];
  driver: DriverEvidence;
}>();

for (const variant of variants) {
  process.stderr.write(`Evaluating ${variant.id} across ${prepared.cases.length} locked cases\n`);
  const cases: CaseResult[] = [];
  let patch: JsonPatchOperation[] | null = null;
  let driver: DriverEvidence | null = null;
  for (const preparedCase of prepared.cases) {
    const item = preparedCase.manifest;
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: blueprintId,
      world: item.world,
      productionPlan: item.productionPlan,
      scenario: item.scenario,
      objective: item.objective,
    });
    const configured = configureVariant(loaded, variant);
    patch ??= configured.patch;
    const project = compileFactoryProject(configured.loaded);
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
      const profile = analyzeFabLossProfile(run.metrics, project.scenario.durationTicks, project, run.events);
      const services = analyzeSourceLotServices(project, run.events, run.metrics, {
        id: variant.id,
        resultHash: `bounded-research:${variant.id}`,
        endTick: project.scenario.durationTicks,
      });
      driver = {
        queue: probeQueueEvidence(profile),
        chronology: probeChronology(run.events),
        packaging: serviceForDevice(services, "packaging-1"),
        burnIn: serviceForDevice(services, "burn-in-1"),
        deliveryMix: Object.fromEntries(Object.entries(run.metrics.deliveryPortfolio.contracts)
          .map(([id, contract]) => [id, contract.delivered])),
        finalWipSourceLots: run.metrics.sourceLotLineage.sourceSets
          .filter((sourceSet) => sourceSet.finalWip.length > 0)
          .map((sourceSet) => sourceSet.sourceLotIds),
      };
    }
  }
  if (!patch || !driver) throw new Error(`Incomplete bounded evidence for '${variant.id}'`);
  evaluated.set(variant.id, { cases, patch, driver });
}

const incumbent = evaluated.get("incumbent-earliest-due-date");
if (!incumbent) throw new Error("Missing incumbent result");
const incumbentByCase = new Map(incumbent.cases.map((item) => [item.id, item]));
const totalWeight = prepared.manifest.cases.reduce((sum, item) => sum + item.weight, 0);
const aggregateScore = (cases: CaseResult[]) =>
  cases.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
const incumbentAggregate = aggregateScore(incumbent.cases);
const incumbentDriverCase = incumbentByCase.get(driverCaseId)!;

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
  const driverCase = result.cases.find((item) => item.id === driverCaseId)!;
  const targetDelta = result.driver.queue.queueTicks - incumbent.driver.queue.queueTicks;
  return {
    ...variant,
    patch: result.patch,
    aggregateScore: aggregate,
    aggregateDeltaFromIncumbent: aggregate - incumbentAggregate,
    minimumCurrentBestCaseDelta,
    benchmarkAccepted,
    hardOutcomesPassed,
    capacityReady,
    promotable: result.patch.length > 0
      && targetDelta < 0
      && result.driver.queue.maximumQueueTicks < incumbent.driver.queue.maximumQueueTicks
      && aggregate - incumbentAggregate > 1e-9
      && minimumCurrentBestCaseDelta >= -1e-9
      && benchmarkAccepted,
    target: {
      contributor: probeContributorId,
      before: incumbent.driver.queue,
      after: result.driver.queue,
      delta: targetDelta,
    },
    driver: {
      score: driverCase.score,
      scoreDelta: driverCase.score - incumbentDriverCase.score,
      deliveredItems: driverCase.metrics.deliveredItems,
      deliveredDelta: driverCase.metrics.deliveredItems - incumbentDriverCase.metrics.deliveredItems,
      deliveryMix: result.driver.deliveryMix,
      averageWipEquivalentUnits: driverCase.metrics.averageWipEquivalentUnits,
      wipDelta: driverCase.metrics.averageWipEquivalentUnits
        - incumbentDriverCase.metrics.averageWipEquivalentUnits,
      meanCycleTimeTicks: driverCase.metrics.meanCycleTimeTicks,
      cycleDelta: driverCase.metrics.meanCycleTimeTicks - incumbentDriverCase.metrics.meanCycleTimeTicks,
      meanQueueTimeTicks: driverCase.metrics.meanQueueTimeTicks,
      queueDelta: driverCase.metrics.meanQueueTimeTicks - incumbentDriverCase.metrics.meanQueueTimeTicks,
      completedLots: driverCase.metrics.completedLots,
      onTimeLots: driverCase.metrics.onTimeLots,
      firstPassYield: driverCase.metrics.firstPassYield,
      scrappedLots: driverCase.metrics.scrappedLots,
      qualityEscapes: driverCase.metrics.qualityEscapes,
      finalWipSourceLots: result.driver.finalWipSourceLots,
      scoreBreakdownDelta: subtractScoreBreakdown(
        incumbentDriverCase.metrics.scoreBreakdown,
        driverCase.metrics.scoreBreakdown,
      ),
    },
    chronology: result.driver.chronology,
    packagingService: serviceDeltas(incumbent.driver.packaging, result.driver.packaging),
    burnInService: serviceDeltas(incumbent.driver.burnIn, result.driver.burnIn),
    cases: result.cases.map((item) => ({
      id: item.id,
      score: item.score,
      currentBestDelta: item.score - incumbentByCase.get(item.id)!.score,
      deliveredItems: item.metrics.deliveredItems,
      averageWipEquivalentUnits: item.metrics.averageWipEquivalentUnits,
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
  || left.target.after.queueTicks - right.target.after.queueTicks
  || left.id.localeCompare(right.id));

process.stdout.write(`${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  driverCase: driverCaseId,
  sourceRun: "114-candidate-trial-run-112-dimensional-stability",
  hypothesisEntry: "reorder-probe-ready-lots",
  incumbent: {
    aggregateScore: incumbentAggregate,
    driver: incumbent.driver,
  },
  rows,
}, 2)}\n`);
