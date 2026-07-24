import { resolve } from "node:path";
import {
  compileFactoryProject,
  loadFactoryProject,
  prepareBlueprintBenchmark,
  runUntil,
  stableStringify,
} from "../../../../packages/inm-core/src/index";
import type {
  FactoryEvent,
  LoadedFactoryProject,
} from "../../../../packages/inm-core/src/index";

const projectDir = resolve(import.meta.dir, "../..");
const benchmarkId = "greenfield-dram-design";
const blueprintId = "generated-dram-fab";
const caseId = "lithography-interruption";
const etchDeviceId = "etch-l2";
const processId = "etch-cell-layer-2";
const downstreamDevices = new Set([
  "etch-l2",
  "inspection-1",
  "rework-1",
  "probe-1",
  "packaging-1",
  "burn-in-1",
]);

interface TraceEvent {
  type: FactoryEvent["type"];
  tick: number;
  device?: string;
  lot?: string;
  lotIds?: string[];
  operation?: string;
  result?: string;
  tardinessTicks?: number;
  reworkCycles?: number;
  authoredDefects?: string[];
  preventedDefects?: string[];
  defects?: string[];
  repairedDefects?: string[];
  remainingDefects?: string[];
}

function selectParticleSuppression(source: LoadedFactoryProject): LoadedFactoryProject {
  const loaded: LoadedFactoryProject = {
    ...source,
    blueprint: structuredClone(source.blueprint),
  };
  const device = loaded.blueprint.devices.find((item) => item.id === etchDeviceId);
  if (!device?.recipes) throw new Error(`Missing qualified '${etchDeviceId}' Device`);
  const recipe = device.recipes.find((item) => item.process === processId);
  if (!recipe) throw new Error(`Device '${etchDeviceId}' is not qualified for '${processId}'`);
  recipe.mode = "particle-suppression";
  return loaded;
}

function traceEvent(event: FactoryEvent): TraceEvent | null {
  if (event.type === "lot.completed") return {
    type: event.type,
    tick: event.tick,
    device: event.device,
    lot: event.lot,
    tardinessTicks: event.tardinessTicks,
  };
  if (event.type === "lot.inspected") return {
    type: event.type,
    tick: event.tick,
    device: event.device,
    lot: event.lot,
    result: event.result,
    reworkCycles: event.reworkCycles,
    defects: event.detectedDefects,
  };
  if (event.type === "lot.reworked") return {
    type: event.type,
    tick: event.tick,
    device: event.device,
    lot: event.lot,
    reworkCycles: event.reworkCycles,
    repairedDefects: event.repairedDefects,
    remainingDefects: event.remainingDefects,
  };
  if (event.type === "lot.quality-excursion") return {
    type: event.type,
    tick: event.tick,
    device: event.device,
    lot: event.lot,
    authoredDefects: event.authoredDefects,
    preventedDefects: event.preventedDefects,
    defects: event.defects,
  };
  if (event.type === "device.start" && downstreamDevices.has(event.device) && event.lotIds?.length) return {
    type: event.type,
    tick: event.tick,
    device: event.device,
    operation: event.operation,
    lotIds: event.lotIds,
  };
  return null;
}

const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId);
const preparedCase = prepared.cases.find((item) => item.manifest.id === caseId);
if (!preparedCase) throw new Error(`Benchmark '${benchmarkId}' has no '${caseId}' case`);

const source = await loadFactoryProject(projectDir, {
  blueprint: blueprintId,
  world: preparedCase.manifest.world,
  scenario: preparedCase.manifest.scenario,
  objective: preparedCase.manifest.objective,
});

const variants = [
  { id: "incumbent", project: source },
  { id: "particle", project: selectParticleSuppression(source) },
];

const traces = variants.map((variant) => {
  const result = runUntil(compileFactoryProject(variant.project), undefined, {
    seed: preparedCase.manifest.seed,
  });
  return {
    id: variant.id,
    metrics: {
      score: result.metrics.finalScore,
      completedLots: result.metrics.lotFlow.completed,
      onTimeLots: result.metrics.lotFlow.onTimeCompleted,
      meanTardinessTicks: result.metrics.lotFlow.meanTardinessTicks,
      meanCycleTimeTicks: result.metrics.lotFlow.meanCycleTimeTicks,
      reworkCycles: result.metrics.qualityFlow.totalReworkCycles,
      energyConsumedMilliJoules: result.metrics.energyConsumedMilliJoules,
      scoreBreakdown: result.metrics.scoreBreakdown,
    },
    lots: Object.values(result.state.lots)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((lot) => ({
        id: lot.id,
        dueTick: lot.dueTick ?? null,
        completedAtTick: lot.completedAtTick ?? null,
        tardinessTicks: lot.completedAtTick === undefined || lot.dueTick === undefined
          ? null
          : Math.max(0, lot.completedAtTick - lot.dueTick),
        reworkCycles: lot.quality.reworkCycles,
        defects: lot.quality.defects,
      })),
    events: result.events.flatMap((event) => {
      const traced = traceEvent(event);
      return traced ? [traced] : [];
    }),
  };
});

process.stdout.write(`${stableStringify({
  benchmark: benchmarkId,
  blueprint: blueprintId,
  case: caseId,
  traces,
}, 2)}\n`);
