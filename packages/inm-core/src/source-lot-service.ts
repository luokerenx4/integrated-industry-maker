import type {
  CompiledFactoryProject,
  FactoryEvent,
  FactoryMetrics,
  ProcessId,
  SourceLotLineageLocation,
  Tick,
} from "./types";
import { hashValue } from "./utils";

export interface SourceLotServiceQuery {
  device: string;
  inputBuffer: string;
  inputResource: string;
  batchUnits: number;
}

export interface SourceLotServiceAnalysis {
  version: 1;
  kind: "source-lot-service";
  run: { id: string; resultHash: string; endTick: Tick };
  query: SourceLotServiceQuery;
  workCenter: {
    jobs: number;
    changeovers: number;
    setupTicks: Tick;
    firstWorkTick: Tick | null;
    lastFinishTick: Tick | null;
    remainingHorizonTicks: Tick;
    timeline: Array<({
      kind: "process";
      process: ProcessId;
      mode: string | null;
      sourceLotIds: string[];
      inputUnits: number;
    } | {
      kind: "changeover";
      from: string | null;
      to: string;
    }) & { startTick: Tick; finishTick: Tick; durationTicks: Tick }>;
  };
  sourceSets: Array<{
    sourceLotIds: string[];
    createdAtTick: Tick | null;
    inputArrival: {
      firstAtTick: Tick | null;
      fullBatchReadyAtTick: Tick | null;
      lastAtTick: Tick | null;
      arrivedUnits: number;
      batchUnits: number;
    };
    service: null | {
      process: ProcessId;
      mode: string | null;
      startTick: Tick;
      finishTick: Tick;
      queueTicksAfterFullBatch: Tick | null;
    };
    delivery: {
      units: number;
      firstAtTick: Tick | null;
      lastAtTick: Tick | null;
    };
    finalWip: SourceLotLineageLocation[];
    unservedAgeTicks: Tick;
  }>;
  analysisHash: string;
}

interface MutableSourceSet {
  sourceLotIds: string[];
  createdAtTick: Tick | null;
  arrivalTicks: Tick[];
  arrivedUnits: number;
  service: SourceLotServiceAnalysis["sourceSets"][number]["service"];
  deliveryTicks: Tick[];
  deliveredUnits: number;
  finalWip: SourceLotLineageLocation[];
}

function sourceSetKey(sourceLotIds: readonly string[]): string {
  return [...new Set(sourceLotIds)].sort().join("\0");
}

function eventBatches(event: FactoryEvent): Array<{ sourceLotIds: string[]; count: number }> {
  if (event.type === "resource.arrive" || event.type === "logistics.arrive") {
    return event.transit.sourceLotBatches ?? [];
  }
  return [];
}

export function sourceLotServiceQueries(project: CompiledFactoryProject): SourceLotServiceQuery[] {
  const queries = new Map<string, SourceLotServiceQuery>();
  for (const device of Object.values(project.devices).sort((left, right) => left.id.localeCompare(right.id))) {
    for (const plan of device.processPlans) {
      for (const input of plan.inputs) {
        if (project.resources[input.resource]?.lineage?.kind !== "source-lot") continue;
        const key = `${device.id}\0${input.buffer}\0${input.resource}`;
        const existing = queries.get(key);
        if (!existing || input.count > existing.batchUnits) queries.set(key, {
          device: device.id,
          inputBuffer: input.buffer,
          inputResource: input.resource,
          batchUnits: input.count,
        });
      }
    }
  }
  return [...queries.values()].sort((left, right) =>
    left.device.localeCompare(right.device)
      || left.inputBuffer.localeCompare(right.inputBuffer)
      || left.inputResource.localeCompare(right.inputResource));
}

export function analyzeSourceLotService(
  events: readonly FactoryEvent[],
  metrics: FactoryMetrics,
  run: { id: string; resultHash: string; endTick: Tick },
  query: SourceLotServiceQuery,
): SourceLotServiceAnalysis {
  const sourceSets = new Map<string, MutableSourceSet>();
  const mutableSourceSet = (sourceLotIds: readonly string[]): MutableSourceSet => {
    const normalized = [...new Set(sourceLotIds)].sort();
    const key = sourceSetKey(normalized);
    let entry = sourceSets.get(key);
    if (!entry) {
      entry = {
        sourceLotIds: normalized,
        createdAtTick: null,
        arrivalTicks: [],
        arrivedUnits: 0,
        service: null,
        deliveryTicks: [],
        deliveredUnits: 0,
        finalWip: [],
      };
      sourceSets.set(key, entry);
    }
    return entry;
  };

  for (const lineage of metrics.sourceLotLineage.sourceSets) {
    const entry = mutableSourceSet(lineage.sourceLotIds);
    entry.finalWip = structuredClone(lineage.finalWip);
  }

  const timeline: SourceLotServiceAnalysis["workCenter"]["timeline"] = [];
  let activeProcess: null | {
    startTick: Tick;
    process: ProcessId;
    mode: string | null;
    sourceLotIds: string[];
    inputUnits: number;
  } = null;
  let activeChangeover: null | { startTick: Tick; from: string | null; to: string } = null;

  for (const event of events) {
    if (event.type === "source-lot.created") {
      const entry = mutableSourceSet(event.sourceLotIds);
      entry.createdAtTick = entry.createdAtTick === null ? event.tick : Math.min(entry.createdAtTick, event.tick);
    }
    if ((event.type === "resource.arrive" || event.type === "logistics.arrive")
      && event.transit.to === query.device
      && event.transit.toBuffer === query.inputBuffer
      && event.transit.resource === query.inputResource) {
      for (const batch of eventBatches(event)) {
        const entry = mutableSourceSet(batch.sourceLotIds);
        entry.arrivedUnits += batch.count;
        entry.arrivalTicks.push(...Array.from({ length: batch.count }, () => event.tick));
      }
    }
    if (event.type === "device.start" && event.device === query.device) {
      const inputs = (event.sourceLotInputs ?? []).filter((batch) => batch.resource === query.inputResource);
      if (inputs.length) {
        const sourceLotIds = [...new Set(inputs.flatMap((batch) => batch.sourceLotIds))].sort();
        const inputUnits = inputs.reduce((sum, batch) => sum + batch.count, 0);
        activeProcess = {
          startTick: event.tick,
          process: event.operation,
          mode: event.mode ?? null,
          sourceLotIds,
          inputUnits,
        };
        mutableSourceSet(sourceLotIds);
      }
    } else if (event.type === "device.finish" && event.device === query.device && activeProcess) {
      const durationTicks = event.tick - activeProcess.startTick;
      timeline.push({
        kind: "process",
        startTick: activeProcess.startTick,
        finishTick: event.tick,
        durationTicks,
        process: activeProcess.process,
        mode: activeProcess.mode,
        sourceLotIds: activeProcess.sourceLotIds,
        inputUnits: activeProcess.inputUnits,
      });
      const entry = mutableSourceSet(activeProcess.sourceLotIds);
      const sortedArrivals = [...entry.arrivalTicks].sort((left, right) => left - right);
      const fullBatchReadyAtTick = sortedArrivals[query.batchUnits - 1] ?? null;
      entry.service = {
        process: activeProcess.process,
        mode: activeProcess.mode,
        startTick: activeProcess.startTick,
        finishTick: event.tick,
        queueTicksAfterFullBatch: fullBatchReadyAtTick === null
          ? null
          : Math.max(0, activeProcess.startTick - fullBatchReadyAtTick),
      };
      activeProcess = null;
    }
    if (event.type === "device.changeover-start" && event.device === query.device) {
      activeChangeover = { startTick: event.tick, from: event.from, to: event.to };
    } else if (event.type === "device.changeover-finish" && event.device === query.device && activeChangeover) {
      timeline.push({
        kind: "changeover",
        startTick: activeChangeover.startTick,
        finishTick: event.tick,
        durationTicks: event.tick - activeChangeover.startTick,
        from: activeChangeover.from,
        to: activeChangeover.to,
      });
      activeChangeover = null;
    }
    if (event.type === "resource.consumed") {
      for (const batch of event.sourceLotBatches ?? []) {
        const entry = mutableSourceSet(batch.sourceLotIds);
        entry.deliveredUnits += batch.count;
        entry.deliveryTicks.push(event.tick);
      }
    }
  }

  timeline.sort((left, right) => left.startTick - right.startTick
    || left.finishTick - right.finishTick
    || left.kind.localeCompare(right.kind));
  const projectedSourceSets = [...sourceSets.values()].map((entry) => {
    const arrivalTicks = [...entry.arrivalTicks].sort((left, right) => left - right);
    const deliveryTicks = [...entry.deliveryTicks].sort((left, right) => left - right);
    const fullBatchReadyAtTick = arrivalTicks[query.batchUnits - 1] ?? null;
    return {
      sourceLotIds: entry.sourceLotIds,
      createdAtTick: entry.createdAtTick,
      inputArrival: {
        firstAtTick: arrivalTicks[0] ?? null,
        fullBatchReadyAtTick,
        lastAtTick: arrivalTicks.at(-1) ?? null,
        arrivedUnits: entry.arrivedUnits,
        batchUnits: query.batchUnits,
      },
      service: entry.service,
      delivery: {
        units: entry.deliveredUnits,
        firstAtTick: deliveryTicks[0] ?? null,
        lastAtTick: deliveryTicks.at(-1) ?? null,
      },
      finalWip: entry.finalWip,
      unservedAgeTicks: entry.service || fullBatchReadyAtTick === null
        ? 0
        : Math.max(0, run.endTick - fullBatchReadyAtTick),
    };
  }).filter((entry) =>
    entry.inputArrival.arrivedUnits > 0 || entry.service || entry.finalWip.some((location) =>
      location.kind === "buffer"
        && location.device === query.device
        && location.buffer === query.inputBuffer))
    .sort((left, right) =>
      (left.inputArrival.fullBatchReadyAtTick ?? Number.MAX_SAFE_INTEGER)
        - (right.inputArrival.fullBatchReadyAtTick ?? Number.MAX_SAFE_INTEGER)
      || sourceSetKey(left.sourceLotIds).localeCompare(sourceSetKey(right.sourceLotIds)));
  const firstWorkTick = timeline[0]?.startTick ?? null;
  const lastFinishTick = timeline.at(-1)?.finishTick ?? null;
  const payload = {
    version: 1 as const,
    kind: "source-lot-service" as const,
    run: { ...run },
    query: { ...query },
    workCenter: {
      jobs: timeline.filter((item) => item.kind === "process").length,
      changeovers: timeline.filter((item) => item.kind === "changeover").length,
      setupTicks: timeline.filter((item) => item.kind === "changeover")
        .reduce((sum, item) => sum + item.durationTicks, 0),
      firstWorkTick,
      lastFinishTick,
      remainingHorizonTicks: lastFinishTick === null ? run.endTick : Math.max(0, run.endTick - lastFinishTick),
      timeline,
    },
    sourceSets: projectedSourceSets,
  };
  return { ...payload, analysisHash: hashValue(payload) };
}

export function analyzeSourceLotServices(
  project: CompiledFactoryProject,
  events: readonly FactoryEvent[],
  metrics: FactoryMetrics,
  run: { id: string; resultHash: string; endTick: Tick },
): SourceLotServiceAnalysis[] {
  return sourceLotServiceQueries(project)
    .map((query) => analyzeSourceLotService(events, metrics, run, query))
    .filter((analysis) => analysis.sourceSets.length > 0);
}
