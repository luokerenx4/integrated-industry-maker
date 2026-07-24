import type { CompiledFactoryProject, FactoryEvent, FactoryMetrics } from "./types";
import { totalTransportBlockTicks, transportBlockCauseTotals } from "./transport-blocking";

export type FabLossBucketId =
  | "delivery-portfolio"
  | "release-admission"
  | "queue-congestion"
  | "input-starvation"
  | "batch-formation"
  | "setup-campaign"
  | "maintenance-qualification"
  | "tooling-contention"
  | "facility-contention"
  | "equipment-failure"
  | "power-interruption"
  | "transport-blocking"
  | "q-time"
  | "yield-quality";

export interface FabLossSubject {
  kind: "project" | "device" | "connection" | "route";
  id: string;
}

export type FabLossContributorMechanism =
  | "batch-companion-wait"
  | "maintenance-qualification"
  | "equipment-availability"
  | "inter-job-input-gap"
  | "transport-line-contention"
  | "transport-endpoint-capacity"
  | "transport-endpoint-power"
  | "transport-endpoint-failure"
  | "quality-excursion"
  | "equipment-process-drift"
  | "route-q-time-defect";

export interface FabLossContributor {
  id: string;
  label: string;
  mechanism: FabLossContributorMechanism;
  route: string | null;
  step: string | null;
  resources: string[];
  processes: string[];
  defects: string[];
  lots: string[];
  subjects: FabLossSubject[];
  evidence: Record<string, number>;
}

export interface FabLossBucket {
  id: FabLossBucketId;
  label: string;
  score: number;
  summary: string;
  subjects: FabLossSubject[];
  evidence: Record<string, number>;
  contributors: FabLossContributor[];
}

export interface FabLossProfile {
  version: 6;
  family: string;
  outcome: {
    scheduled: number;
    released: number;
    completed: number;
    scrapped: number;
    inProgress: number;
    pendingRelease: number;
    firstPassYield: number;
    contractFulfillment: number;
    deliveryShortfall: number;
    deliveryOverflow: number;
    portfolioNetValue: number;
  };
  primary: FabLossBucket | null;
  chain: FabLossBucketId[];
  buckets: FabLossBucket[];
  caveat: string;
}

export interface FabLossAttribution extends FabLossProfile {
  run: { id: string; resultHash: string };
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
const topKey = (values: Record<string, number>): string | null => Object.entries(values)
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
const productionCapabilities = new Set(["extract", "process", "treat"]);
const isProductiveDevice = (project: Pick<CompiledFactoryProject, "devices">, id: string) =>
  project.devices[id]?.assetDef.capabilities.some((capability) => productionCapabilities.has(capability)) ?? false;
const isFlowProductiveDevice = (project: Pick<CompiledFactoryProject, "devices">, id: string) => {
  const device = project.devices[id];
  if (!device || !isProductiveDevice(project, id)) return false;
  return device.processPlans.length === 0
    || device.processPlans.some((plan) => plan.definition.quality?.kind !== "rework");
};

interface TickInterval {
  start: number;
  end: number;
}

const unavailableEventPairs: Array<{ opens: Set<string>; closes: Set<string> }> = [
  {
    opens: new Set(["device.maintenance-blocked", "device.maintenance-start"]),
    closes: new Set(["device.maintenance-finish", "device.maintenance-cancelled", "device.qualification-cancelled"]),
  },
  { opens: new Set(["device.changeover-start"]), closes: new Set(["device.changeover-finish", "device.changeover-cancelled"]) },
  { opens: new Set(["device.breakdown"]), closes: new Set(["device.recover"]) },
  { opens: new Set(["buffer.blocked"]), closes: new Set(["buffer.unblocked"]) },
  { opens: new Set(["device.batch-held"]), closes: new Set(["device.batch-released"]) },
  { opens: new Set(["device.campaign-held"]), closes: new Set(["device.campaign-released"]) },
  { opens: new Set(["device.tooling-blocked"]), closes: new Set(["device.tooling-acquired"]) },
  { opens: new Set(["device.utility-blocked"]), closes: new Set(["device.utility-acquired"]) },
  { opens: new Set(["device.sleep"]), closes: new Set(["device.wake-finish", "device.wake-cancelled"]) },
  { opens: new Set(["power.shortage"]), closes: new Set(["power.restored", "power.standby-restored"]) },
];

function mergeIntervals(intervals: TickInterval[]): TickInterval[] {
  const ordered = intervals.filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: TickInterval[] = [];
  for (const interval of ordered) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function unavailableIntervals(
  events: readonly FactoryEvent[],
  device: string,
  durationTicks: number,
): TickInterval[] {
  const deviceEvents = events.filter((event) => "device" in event && event.device === device);
  const intervals: TickInterval[] = [];
  for (const pair of unavailableEventPairs) {
    let openedAt: number | null = null;
    for (const event of deviceEvents) {
      if (pair.opens.has(event.type)) openedAt ??= event.tick;
      if (pair.closes.has(event.type) && openedAt !== null) {
        intervals.push({ start: openedAt, end: event.tick });
        openedAt = null;
      }
    }
    if (openedAt !== null) intervals.push({ start: openedAt, end: durationTicks });
  }
  return mergeIntervals(intervals);
}

function intervalOverlap(intervals: readonly TickInterval[], start: number, end: number): number {
  return intervals.reduce((total, interval) =>
    total + Math.max(0, Math.min(end, interval.end) - Math.max(start, interval.start)), 0);
}

export function analyzeInputStarvation(
  metrics: Pick<FactoryMetrics, "waitingInputTime" | "machineUtilization">
    & { lotFlow: Pick<FactoryMetrics["lotFlow"], "family"> },
  durationTicks: number,
  project: Pick<CompiledFactoryProject, "devices">,
  events: readonly FactoryEvent[],
): Omit<FabLossBucket, "id" | "label"> {
  const activeProductiveDevices = Object.keys(metrics.waitingInputTime)
    .filter((id) => isProductiveDevice(project, id) && (metrics.machineUtilization[id] ?? 0) > 1e-12)
    .sort();
  const rawWaitingInputTicks = activeProductiveDevices
    .reduce((total, id) => total + (metrics.waitingInputTime[id] ?? 0), 0);
  const flowProductiveDevices = activeProductiveDevices.filter((id) => isFlowProductiveDevice(project, id));
  const flowRawWaitingInputTicks = flowProductiveDevices
    .reduce((total, id) => total + (metrics.waitingInputTime[id] ?? 0), 0);
  const exceptionWaitingInputTicks = rawWaitingInputTicks - flowRawWaitingInputTicks;
  const contributors: FabLossContributor[] = [];
  let opportunityWindowTicks = 0;
  let interJobGapTicks = 0;
  let unavailableGapTicks = 0;
  let starvationTicks = 0;

  for (const device of flowProductiveDevices) {
    const starts = events.filter((event): event is Extract<FactoryEvent, { type: "device.start" }> =>
      event.type === "device.start" && event.device === device);
    const finishes = events.filter((event): event is Extract<FactoryEvent, { type: "device.finish" }> =>
      event.type === "device.finish" && event.device === device);
    const pairedGaps = Math.min(finishes.length, Math.max(0, starts.length - 1));
    if (pairedGaps === 0) continue;
    const lastFinish = finishes[Math.min(finishes.length - 1, starts.length - 1)]!;
    const opportunityTicks = Math.max(0, lastFinish.tick - starts[0]!.tick);
    if (opportunityTicks === 0) continue;
    const unavailable = unavailableIntervals(events, device, durationTicks);
    const processes = new Set<string>();
    let deviceGapTicks = 0;
    let deviceUnavailableTicks = 0;
    let deviceStarvationTicks = 0;
    for (let index = 0; index < pairedGaps; index++) {
      const gapStart = finishes[index]!.tick;
      const nextStart = starts[index + 1]!;
      const gapEnd = nextStart.tick;
      const gapTicks = Math.max(0, gapEnd - gapStart);
      const excludedTicks = Math.min(gapTicks, intervalOverlap(unavailable, gapStart, gapEnd));
      const observedStarvationTicks = Math.max(0, gapTicks - excludedTicks);
      deviceGapTicks += gapTicks;
      deviceUnavailableTicks += excludedTicks;
      deviceStarvationTicks += observedStarvationTicks;
      if (observedStarvationTicks > 0) processes.add(nextStart.operation);
    }
    opportunityWindowTicks += opportunityTicks;
    interJobGapTicks += deviceGapTicks;
    unavailableGapTicks += deviceUnavailableTicks;
    starvationTicks += deviceStarvationTicks;
    if (deviceStarvationTicks === 0) continue;
    const utilization = metrics.machineUtilization[device] ?? 0;
    const deviceRawWaitingInputTicks = metrics.waitingInputTime[device] ?? 0;
    contributors.push({
      id: `device:${device}:inter-job-input-gap`,
      label: device,
      mechanism: "inter-job-input-gap",
      route: null,
      step: null,
      resources: [],
      processes: [...processes].sort(),
      defects: [],
      lots: [],
      subjects: [{ kind: "device", id: device }],
      evidence: {
        jobs: starts.length,
        completedJobs: finishes.length,
        opportunityWindowTicks: opportunityTicks,
        interJobGapTicks: deviceGapTicks,
        unavailableGapTicks: deviceUnavailableTicks,
        starvationTicks: deviceStarvationTicks,
        rawWaitingInputTicks: deviceRawWaitingInputTicks,
        boundaryWaitingInputTicks: Math.max(0, deviceRawWaitingInputTicks - deviceStarvationTicks),
        utilization,
        weightedStarvationTicks: deviceStarvationTicks * utilization,
      },
    });
  }
  contributors.sort((left, right) =>
    right.evidence.weightedStarvationTicks! - left.evidence.weightedStarvationTicks!
    || right.evidence.starvationTicks! - left.evidence.starvationTicks!
    || left.id.localeCompare(right.id));
  const subject = contributors[0] ?? null;
  const boundaryWaitingInputTicks = Math.max(0, flowRawWaitingInputTicks - starvationTicks);
  return {
    score: ratio(starvationTicks, opportunityWindowTicks),
    summary: `${contributors.length}/${flowProductiveDevices.length} active flow Devices accumulated ${(starvationTicks / 1000).toFixed(1)} event-backed inter-job input-gap device-s inside ${(opportunityWindowTicks / 1000).toFixed(1)} device-s of observed production opportunity; ${(boundaryWaitingInputTicks / 1000).toFixed(1)} of ${(flowRawWaitingInputTicks / 1000).toFixed(1)} flow input-wait device-s lay outside those ranked gaps${exceptionWaitingInputTicks > 0 ? `, with ${(exceptionWaitingInputTicks / 1000).toFixed(1)} additional exception-only device-s excluded from ranking` : ""}.`,
    subjects: subject ? subject.subjects : [{ kind: "project", id: metrics.lotFlow.family! }],
    evidence: {
      activeProductiveDevices: activeProductiveDevices.length,
      flowProductiveDevices: flowProductiveDevices.length,
      contributingDevices: contributors.length,
      rawWaitingInputTicks,
      flowRawWaitingInputTicks,
      exceptionWaitingInputTicks,
      boundaryWaitingInputTicks,
      opportunityWindowTicks,
      interJobGapTicks,
      unavailableGapTicks,
      starvationTicks,
      subjectStarvationTicks: subject?.evidence.starvationTicks ?? 0,
      subjectOpportunityWindowTicks: subject?.evidence.opportunityWindowTicks ?? 0,
      subjectUtilization: subject?.evidence.utilization ?? 0,
    },
    contributors,
  };
}

type QueueTimeViolationEvent = Extract<FactoryEvent, { type: "lot.queue-time-violation" }>;

function qTimeMechanism(
  event: QueueTimeViolationEvent,
  events: readonly FactoryEvent[],
  project: Pick<CompiledFactoryProject, "devices">,
): { mechanism: FabLossContributorMechanism; providers: string[] } {
  const queueStartedAt = event.tick - event.queueTicks;
  const maintenanceEvents = events.filter((candidate) =>
    candidate.tick >= queueStartedAt
    && candidate.tick <= event.tick
    && "device" in candidate
    && candidate.device === event.device
    && (
      candidate.type === "device.maintenance-start"
      || candidate.type === "device.maintenance-service-finish"
      || candidate.type === "device.maintenance-blocked"
      || candidate.type === "device.qualification-start"
      || candidate.type === "device.qualification-finish"
      || candidate.type === "device.maintenance-finish"
    ));
  if (maintenanceEvents.length) {
    return {
      mechanism: "maintenance-qualification",
      providers: [...new Set(maintenanceEvents.flatMap((candidate) =>
        "provider" in candidate ? [candidate.provider] : []))].sort(),
    };
  }
  const processPlan = project.devices[event.device]?.processPlans.find((plan) =>
    plan.definition.id === event.process);
  if (processPlan?.lotTransfers.some((transfer) => transfer.input.count > 1)) {
    return { mechanism: "batch-companion-wait", providers: [] };
  }
  return { mechanism: "equipment-availability", providers: [] };
}

function qTimeContributors(
  events: readonly FactoryEvent[],
  project: Pick<CompiledFactoryProject, "devices">,
): FabLossContributor[] {
  const groups = new Map<string, {
    route: string;
    step: string;
    mechanism: FabLossContributorMechanism;
    processes: Set<string>;
    devices: Set<string>;
    providers: Set<string>;
    lots: Set<string>;
    defects: Set<string>;
    violations: number;
    totalQueueTicks: number;
    maximumQueueTicks: number;
    limitTicks: number;
    totalOverrunTicks: number;
    maximumOverrunTicks: number;
  }>();
  for (const event of events) {
    if (event.type !== "lot.queue-time-violation") continue;
    const { mechanism, providers } = qTimeMechanism(event, events, project);
    const id = `${event.route}:${event.step}:${mechanism}`;
    const group = groups.get(id) ?? {
      route: event.route,
      step: event.step,
      mechanism,
      processes: new Set<string>(),
      devices: new Set<string>(),
      providers: new Set<string>(),
      lots: new Set<string>(),
      defects: new Set<string>(),
      violations: 0,
      totalQueueTicks: 0,
      maximumQueueTicks: 0,
      limitTicks: event.maximumTicks,
      totalOverrunTicks: 0,
      maximumOverrunTicks: 0,
    };
    const overrunTicks = Math.max(0, event.queueTicks - event.maximumTicks);
    group.processes.add(event.process);
    group.devices.add(event.device);
    providers.forEach((provider) => group.providers.add(provider));
    group.lots.add(event.lot);
    event.defects.forEach((defect) => group.defects.add(defect));
    group.violations++;
    group.totalQueueTicks += event.queueTicks;
    group.maximumQueueTicks = Math.max(group.maximumQueueTicks, event.queueTicks);
    group.limitTicks = Math.min(group.limitTicks, event.maximumTicks);
    group.totalOverrunTicks += overrunTicks;
    group.maximumOverrunTicks = Math.max(group.maximumOverrunTicks, overrunTicks);
    groups.set(id, group);
  }
  return [...groups.entries()].map(([id, group]) => ({
    id,
    label: group.step,
    mechanism: group.mechanism,
    route: group.route,
    step: group.step,
    resources: [],
    processes: [...group.processes].sort(),
    defects: [...group.defects].sort(),
    lots: [...group.lots].sort(),
    subjects: [
      { kind: "route" as const, id: group.route },
      ...[...group.devices, ...group.providers].sort().map((device) => ({ kind: "device" as const, id: device })),
    ],
    evidence: {
      violations: group.violations,
      violatedLots: group.lots.size,
      totalQueueTicks: group.totalQueueTicks,
      meanQueueTicks: group.totalQueueTicks / group.violations,
      maximumQueueTicks: group.maximumQueueTicks,
      limitTicks: group.limitTicks,
      totalOverrunTicks: group.totalOverrunTicks,
      maximumOverrunTicks: group.maximumOverrunTicks,
    },
  })).sort((left, right) =>
    right.evidence.violations! - left.evidence.violations!
    || right.evidence.totalOverrunTicks! - left.evidence.totalOverrunTicks!
    || left.id.localeCompare(right.id));
}

type DefectOriginEvent = Extract<FactoryEvent,
  { type: "lot.quality-excursion" | "device.process-drift" | "lot.queue-time-violation" }>;

function routeStepForProcess(
  project: Pick<CompiledFactoryProject, "routes">,
  process: string,
): { route: string; step: string } | null {
  const matches: { route: string; step: string }[] = [];
  for (const route of Object.values(project.routes).sort((left, right) => left.id.localeCompare(right.id))) {
    for (const step of route.steps) {
      if (step.operations.includes(process)) matches.push({ route: route.id, step: step.id });
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

function routeStepForOrigin(
  event: DefectOriginEvent,
  lot: string,
  events: readonly FactoryEvent[],
  project: Pick<CompiledFactoryProject, "routes">,
): { route: string; step: string } | null {
  if (event.type === "lot.queue-time-violation") return { route: event.route, step: event.step };
  const transition = events.find((candidate): candidate is Extract<FactoryEvent, { type: "lot.route-advanced" }> =>
    candidate.type === "lot.route-advanced"
    && candidate.tick === event.tick
    && candidate.device === event.device
    && candidate.process === event.process
    && candidate.lot === lot);
  return transition
    ? { route: transition.route, step: transition.fromStep }
    : routeStepForProcess(project, event.process);
}

export function analyzeQualityContributors(
  project: Pick<CompiledFactoryProject, "routes">,
  events: readonly FactoryEvent[],
): FabLossContributor[] {
  const groups = new Map<string, {
    label: string;
    mechanism: Extract<FabLossContributorMechanism,
      "quality-excursion" | "equipment-process-drift" | "route-q-time-defect">;
    route: string | null;
    step: string | null;
    process: string;
    device: string;
    originEvents: number;
    introducedDefectInstances: number;
    lotDefects: Map<string, Map<string, number>>;
  }>();
  for (const event of events) {
    if (
      event.type !== "lot.quality-excursion"
      && event.type !== "device.process-drift"
      && event.type !== "lot.queue-time-violation"
    ) continue;
    if (event.defects.length === 0) continue;
    const mechanism = event.type === "lot.quality-excursion"
      ? "quality-excursion"
      : event.type === "device.process-drift"
        ? "equipment-process-drift"
        : "route-q-time-defect";
    const lots = event.type === "device.process-drift" ? event.lotIds : [event.lot];
    const eventGroups = new Set<string>();
    for (const lot of lots) {
      const location = routeStepForOrigin(event, lot, events, project);
      const id = `quality:${mechanism}:${location?.route ?? "unrouted"}:${location?.step ?? event.process}:${event.device}:${event.process}`;
      const group = groups.get(id) ?? {
        label: location?.step ?? event.process,
        mechanism,
        route: location?.route ?? null,
        step: location?.step ?? null,
        process: event.process,
        device: event.device,
        originEvents: 0,
        introducedDefectInstances: 0,
        lotDefects: new Map<string, Map<string, number>>(),
      };
      if (!eventGroups.has(id)) {
        group.originEvents++;
        eventGroups.add(id);
      }
      group.introducedDefectInstances += event.defects.length;
      const lotOrigin = group.lotDefects.get(lot) ?? new Map<string, number>();
      event.defects.forEach((defect) =>
        lotOrigin.set(defect, Math.min(lotOrigin.get(defect) ?? event.tick, event.tick)));
      group.lotDefects.set(lot, lotOrigin);
      groups.set(id, group);
    }
  }

  const intersectsAfterOrigin = (
    defects: readonly string[],
    origins: ReadonlyMap<string, number>,
    tick: number,
  ) => defects.some((defect) => (origins.get(defect) ?? Number.POSITIVE_INFINITY) <= tick);
  return [...groups.entries()].map(([id, group]) => {
    const detectedLots = new Set<string>();
    const reworkAttemptedLots = new Set<string>();
    const repairedLots = new Set<string>();
    const persistentLots = new Set<string>();
    const scrappedLots = new Set<string>();
    const escapedLots = new Set<string>();
    for (const [lot, origins] of group.lotDefects) {
      for (const event of events) {
        if (!("lot" in event) || event.lot !== lot) continue;
        if (event.type === "lot.inspected" && intersectsAfterOrigin(event.detectedDefects, origins, event.tick)) {
          detectedLots.add(lot);
          if (event.result === "scrap") scrappedLots.add(lot);
        } else if (event.type === "lot.reworked") {
          if (intersectsAfterOrigin([...event.repairedDefects, ...event.remainingDefects], origins, event.tick)) {
            reworkAttemptedLots.add(lot);
          }
          if (intersectsAfterOrigin(event.repairedDefects, origins, event.tick)) repairedLots.add(lot);
          if (intersectsAfterOrigin(event.remainingDefects, origins, event.tick)) persistentLots.add(lot);
        } else if (event.type === "lot.output-profile" && intersectsAfterOrigin(event.defects, origins, event.tick)) {
          escapedLots.add(lot);
        }
      }
    }
    const defects = [...new Set([...group.lotDefects.values()].flatMap((origin) => [...origin.keys()]))].sort();
    return {
      id,
      label: group.label,
      mechanism: group.mechanism,
      route: group.route,
      step: group.step,
      resources: [],
      processes: [group.process],
      defects,
      lots: [...group.lotDefects.keys()].sort(),
      subjects: [
        { kind: "device" as const, id: group.device },
        ...(group.route ? [{ kind: "route" as const, id: group.route }] : []),
      ],
      evidence: {
        originEvents: group.originEvents,
        introducedLots: group.lotDefects.size,
        introducedDefectInstances: group.introducedDefectInstances,
        detectedLots: detectedLots.size,
        reworkAttemptedLots: reworkAttemptedLots.size,
        repairedLots: repairedLots.size,
        persistentLots: persistentLots.size,
        scrappedLots: scrappedLots.size,
        escapedLots: escapedLots.size,
      },
    };
  }).sort((left, right) =>
    right.evidence.scrappedLots! - left.evidence.scrappedLots!
    || right.evidence.escapedLots! - left.evidence.escapedLots!
    || right.evidence.persistentLots! - left.evidence.persistentLots!
    || right.evidence.reworkAttemptedLots! - left.evidence.reworkAttemptedLots!
    || right.evidence.introducedLots! - left.evidence.introducedLots!
    || left.id.localeCompare(right.id));
}

export function analyzeTransportBlocking(
  metrics: Pick<FactoryMetrics, "transportFlows">
    & { lotFlow: Pick<FactoryMetrics["lotFlow"], "family" | "meanTransportTimeTicks"> },
  durationTicks: number,
): Omit<FabLossBucket, "id" | "label"> {
  const flows = Object.entries(metrics.transportFlows)
    .sort(([left], [right]) => left.localeCompare(right));
  const contributors: FabLossContributor[] = flows
    .filter(([, flow]) => flow.blockedItemTicks > 0)
    .map(([connection, flow]) => {
      const causeTicks = transportBlockCauseTotals(flow.blockedItemTicksByCause);
      const partitionedTicks = totalTransportBlockTicks(flow.blockedItemTicksByCause);
      if (partitionedTicks !== flow.blockedItemTicks) {
        throw new Error(
          `Transport flow '${connection}' reports ${flow.blockedItemTicks} blocked item-ticks but its physical-cause partition sums to ${partitionedTicks}`,
        );
      }
      const dominantCause = topKey(causeTicks)! as keyof typeof causeTicks;
      const mechanism = {
        "line-contention": "transport-line-contention",
        "endpoint-capacity": "transport-endpoint-capacity",
        "endpoint-power": "transport-endpoint-power",
        "endpoint-failure": "transport-endpoint-failure",
      }[dominantCause] as FabLossContributorMechanism;
      return {
        id: `connection:${connection}:${mechanism}`,
        label: connection,
        mechanism,
        route: null,
        step: null,
        resources: [...new Set([
          ...Object.entries(flow.departedByResource)
            .filter(([, count]) => count > 0)
            .map(([resource]) => resource),
          ...Object.entries(flow.deliveredByResource)
            .filter(([, count]) => count > 0)
            .map(([resource]) => resource),
        ])].sort(),
        processes: [],
        defects: [],
        lots: [],
        subjects: [{ kind: "connection" as const, id: connection }],
        evidence: {
          departedItems: flow.departedItems,
          deliveredItems: flow.deliveredItems,
          departedItemsPerMinute: flow.departedItemsPerMinute,
          deliveredItemsPerMinute: flow.deliveredItemsPerMinute,
          capacityItemsPerMinute: flow.capacityItemsPerMinute,
          utilization: flow.utilization,
          averageInFlightItems: flow.averageInFlightItems,
          blockedItemTicks: flow.blockedItemTicks,
          blockedFraction: flow.blockedFraction,
          lineContentionTicks: causeTicks["line-contention"],
          endpointCapacityTicks: causeTicks["endpoint-capacity"],
          endpointPowerTicks: causeTicks["endpoint-power"],
          endpointFailureTicks: causeTicks["endpoint-failure"],
          loaderCapacityTicks: flow.blockedItemTicksByCause["endpoint-capacity"].loader,
          unloaderCapacityTicks: flow.blockedItemTicksByCause["endpoint-capacity"].unloader,
          loaderPowerTicks: flow.blockedItemTicksByCause["endpoint-power"].loader,
          unloaderPowerTicks: flow.blockedItemTicksByCause["endpoint-power"].unloader,
          loaderFailureTicks: flow.blockedItemTicksByCause["endpoint-failure"].loader,
          unloaderFailureTicks: flow.blockedItemTicksByCause["endpoint-failure"].unloader,
        },
      };
    })
    .sort((left, right) =>
      right.evidence.blockedItemTicks! - left.evidence.blockedItemTicks!
      || right.evidence.blockedFraction! - left.evidence.blockedFraction!
      || left.id.localeCompare(right.id));
  const blockedItemTicks = contributors
    .reduce((total, contributor) => total + contributor.evidence.blockedItemTicks!, 0);
  const lineContentionTicks = contributors
    .reduce((total, contributor) => total + contributor.evidence.lineContentionTicks!, 0);
  const endpointCapacityTicks = contributors
    .reduce((total, contributor) => total + contributor.evidence.endpointCapacityTicks!, 0);
  const endpointPowerTicks = contributors
    .reduce((total, contributor) => total + contributor.evidence.endpointPowerTicks!, 0);
  const endpointFailureTicks = contributors
    .reduce((total, contributor) => total + contributor.evidence.endpointFailureTicks!, 0);
  return {
    score: ratio(blockedItemTicks, durationTicks * Math.max(1, flows.length)),
    summary: `Tracked lots averaged ${(metrics.lotFlow.meanTransportTimeTicks / 1000).toFixed(1)} s in necessary transit (context only); ${contributors.length}/${flows.length} connections accumulated ${(blockedItemTicks / 1000).toFixed(1)} blocked item-s (${(lineContentionTicks / 1000).toFixed(1)} line, ${(endpointCapacityTicks / 1000).toFixed(1)} endpoint capacity, ${(endpointPowerTicks / 1000).toFixed(1)} endpoint power, ${(endpointFailureTicks / 1000).toFixed(1)} endpoint failure).`,
    subjects: contributors[0]?.subjects ?? [{ kind: "project", id: metrics.lotFlow.family ?? "tracked-lot" }],
    evidence: {
      connections: flows.length,
      blockedConnections: contributors.length,
      meanTransportTicks: metrics.lotFlow.meanTransportTimeTicks,
      blockedItemTicks,
      lineContentionTicks,
      endpointCapacityTicks,
      endpointPowerTicks,
      endpointFailureTicks,
    },
    contributors,
  };
}

export function analyzeFabLossProfile(
  metrics: FactoryMetrics,
  durationTicks: number,
  project: Pick<CompiledFactoryProject, "devices" | "routes">,
  events: readonly FactoryEvent[],
): FabLossProfile | null {
  if (!metrics.lotFlow.family) return null;
  const scheduled = Math.max(1, metrics.lotFlow.scheduled);
  const cycleTicks = Math.max(1, metrics.lotFlow.meanCycleTimeTicks);
  const buckets: FabLossBucket[] = [];
  const add = (bucket: Omit<FabLossBucket, "contributors"> & { contributors?: FabLossContributor[] }) => {
    if (bucket.score > 1e-9) buckets.push({ contributors: [], ...bucket });
  };

  const deliveryContracts = Object.values(metrics.deliveryPortfolio.contracts);
  const deliveryShortfall = deliveryContracts.reduce((total, contract) => total + contract.shortfall, 0);
  const deliveryOverflow = deliveryContracts.reduce((total, contract) => total + contract.overflow, 0);
  const underfilledContracts = deliveryContracts.filter((contract) => contract.fulfillment < 1 - 1e-12).length;
  const meanContractShortfallShare = deliveryContracts.length
    ? deliveryContracts.reduce((total, contract) => total + Math.max(0, 1 - Math.min(1, contract.fulfillment)), 0) / deliveryContracts.length
    : 0;
  add({
    id: "delivery-portfolio", label: "Delivery portfolio shortfall", score: meanContractShortfallShare,
    summary: `${underfilledContracts}/${deliveryContracts.length} delivery contracts are below demand with ${deliveryShortfall} units short, ${deliveryOverflow} above-demand units, and ${metrics.deliveryPortfolio.netValue.toFixed(3)} net value.`,
    subjects: [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: {
      contracts: deliveryContracts.length,
      underfilledContracts,
      demanded: metrics.deliveryPortfolio.demanded,
      delivered: metrics.deliveryPortfolio.delivered,
      shortfall: deliveryShortfall,
      overflow: deliveryOverflow,
      grossValue: metrics.deliveryPortfolio.grossValue,
      shortfallPenalty: metrics.deliveryPortfolio.shortfallPenalty,
      netValue: metrics.deliveryPortfolio.netValue,
    },
  });

  const releaseBlockedTicks = metrics.releaseFlow.capacityBlockedTicks + metrics.releaseFlow.controlBlockedTicks;
  add({
    id: "release-admission", label: "Release and admission", score: ratio(metrics.releaseFlow.pending, scheduled) + ratio(releaseBlockedTicks, durationTicks * scheduled),
    summary: `${metrics.releaseFlow.pending} scheduled lots remained pending; ${metrics.releaseFlow.capacityBlockedLots} capacity-blocked and ${metrics.releaseFlow.controlBlockedLots} control-blocked releases accumulated ${(releaseBlockedTicks / 1000).toFixed(1)} lot-s.`,
    subjects: [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: { pendingLots: metrics.releaseFlow.pending, capacityBlockedLots: metrics.releaseFlow.capacityBlockedLots, controlBlockedLots: metrics.releaseFlow.controlBlockedLots, blockedTicks: releaseBlockedTicks },
  });

  const queueShare = ratio(metrics.lotFlow.meanQueueTimeTicks, cycleTicks);
  const bottleneckDevice = metrics.bottleneckEntity && isProductiveDevice(project, metrics.bottleneckEntity)
    ? metrics.bottleneckEntity
    : null;
  const queueRoute = topKey(Object.fromEntries(Object.entries(metrics.routeFlow).map(([id, route]) =>
    [id, Object.values(route.steps).reduce((total, step) => total + step.meanQueueTicks * step.visits, 0)])));
  add({
    id: "queue-congestion", label: "Tracked-lot queue congestion", score: queueShare,
    summary: `Tracked lots averaged ${(metrics.lotFlow.meanQueueTimeTicks / 1000).toFixed(1)} s queued in a ${(cycleTicks / 1000).toFixed(1)} s cycle; ${bottleneckDevice ?? queueRoute ?? metrics.lotFlow.family} is the measured bottleneck context.`,
    subjects: bottleneckDevice
      ? [{ kind: "device", id: bottleneckDevice }]
      : queueRoute ? [{ kind: "route", id: queueRoute }] : [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: {
      meanQueueTicks: metrics.lotFlow.meanQueueTimeTicks,
      meanCycleTicks: cycleTicks,
      meanProcessTicks: metrics.lotFlow.meanProcessTimeTicks,
      meanTransportTicks: metrics.lotFlow.meanTransportTimeTicks,
      bottleneckUtilization: bottleneckDevice ? metrics.machineUtilization[bottleneckDevice] ?? 0 : 0,
    },
  });

  add({
    id: "input-starvation", label: "Productive-equipment input starvation",
    ...analyzeInputStarvation(metrics, durationTicks, project, events),
  });

  add({
    id: "batch-formation", label: "Batch formation", score: ratio(metrics.batchFlow.formationHoldTicks, durationTicks * Math.max(1, Object.keys(metrics.batchFlow.formationDevices).length)) + ratio(metrics.batchFlow.meanQueueWaitTicksPerLot, cycleTicks),
    summary: `${metrics.batchFlow.formationHolds} formation holds consumed ${(metrics.batchFlow.formationHoldTicks / 1000).toFixed(1)} s; average batch wait was ${(metrics.batchFlow.meanQueueWaitTicksPerLot / 1000).toFixed(1)} s/lot with ${metrics.batchFlow.timeoutReleases} timeout releases.`,
    subjects: Object.keys(metrics.batchFlow.formationDevices).sort().slice(0, 3).map((id) => ({ kind: "device" as const, id })),
    evidence: { holds: metrics.batchFlow.formationHolds, holdTicks: metrics.batchFlow.formationHoldTicks, meanWaitTicks: metrics.batchFlow.meanQueueWaitTicksPerLot, timeoutReleases: metrics.batchFlow.timeoutReleases },
  });

  const setupDevice = topKey(Object.fromEntries(Object.entries(metrics.equipmentSetups.devices).map(([id, value]) => [id, value.setupTicks + value.campaignHoldTicks])));
  add({
    id: "setup-campaign", label: "Setup and campaign control", score: ratio(metrics.equipmentSetups.totalSetupTicks + metrics.equipmentSetups.totalCampaignHoldTicks, durationTicks * Math.max(1, Object.keys(metrics.equipmentSetups.devices).length)),
    summary: `${metrics.equipmentSetups.totalChangeovers} changeovers and ${metrics.equipmentSetups.totalCampaignHolds} campaign holds consumed ${((metrics.equipmentSetups.totalSetupTicks + metrics.equipmentSetups.totalCampaignHoldTicks) / 1000).toFixed(1)} equipment-s.`,
    subjects: setupDevice ? [{ kind: "device", id: setupDevice }] : [],
    evidence: { changeovers: metrics.equipmentSetups.totalChangeovers, setupTicks: metrics.equipmentSetups.totalSetupTicks, campaignHolds: metrics.equipmentSetups.totalCampaignHolds, campaignHoldTicks: metrics.equipmentSetups.totalCampaignHoldTicks },
  });

  const maintenanceTicks = metrics.equipmentMaintenance.totalMaintenanceTicks + metrics.equipmentMaintenance.totalQualificationTicks + metrics.equipmentMaintenance.totalInputWaitTicks + metrics.equipmentMaintenance.totalCrewWaitTicks;
  const maintenanceDevice = topKey(Object.fromEntries(Object.entries(metrics.equipmentMaintenance.devices).map(([id, value]) => [id, value.maintenanceTicks + value.qualificationTicks + value.inputWaitTicks + value.crewWaitTicks])));
  add({
    id: "maintenance-qualification", label: "Maintenance and qualification", score: ratio(maintenanceTicks, durationTicks * Math.max(1, Object.keys(metrics.equipmentMaintenance.devices).length)),
    summary: `${metrics.equipmentMaintenance.totalCompleted} maintenance and ${metrics.equipmentMaintenance.totalQualificationCompleted} qualification completions consumed ${(maintenanceTicks / 1000).toFixed(1)} service/wait device-s; ${metrics.equipmentMaintenance.totalCancelled + metrics.equipmentMaintenance.totalQualificationCancelled} phases were cancelled.`,
    subjects: maintenanceDevice ? [{ kind: "device", id: maintenanceDevice }] : [],
    evidence: { maintenanceTicks: metrics.equipmentMaintenance.totalMaintenanceTicks, qualificationTicks: metrics.equipmentMaintenance.totalQualificationTicks, inputWaitTicks: metrics.equipmentMaintenance.totalInputWaitTicks, crewWaitTicks: metrics.equipmentMaintenance.totalCrewWaitTicks, cancelled: metrics.equipmentMaintenance.totalCancelled + metrics.equipmentMaintenance.totalQualificationCancelled },
  });

  const toolingDevice = topKey(Object.fromEntries(Object.entries(metrics.productionTooling.devices).map(([id, value]) => [id, value.inputWaitTicks])));
  add({
    id: "tooling-contention", label: "Reusable tooling contention", score: ratio(metrics.productionTooling.totalInputWaitTicks, durationTicks * Math.max(1, Object.keys(metrics.productionTooling.devices).length)),
    summary: `${metrics.productionTooling.totalInputBlocks} tooling input blocks accumulated ${(metrics.productionTooling.totalInputWaitTicks / 1000).toFixed(1)} device-s of wait; ${metrics.productionTooling.totalCancelled} allocations were cancelled.`,
    subjects: toolingDevice ? [{ kind: "device", id: toolingDevice }] : [],
    evidence: { blocks: metrics.productionTooling.totalInputBlocks, waitTicks: metrics.productionTooling.totalInputWaitTicks, cancelled: metrics.productionTooling.totalCancelled },
  });

  const utilityDevice = topKey(Object.fromEntries(Object.entries(metrics.productionUtilities.devices).map(([id, value]) => [id, value.inputWaitTicks])));
  add({
    id: "facility-contention", label: "Fab facility contention", score: ratio(metrics.productionUtilities.totalInputWaitTicks, durationTicks * Math.max(1, Object.keys(metrics.productionUtilities.devices).length)) + ratio(metrics.productionUtilities.totalProviderInterruptions, scheduled),
    summary: `${metrics.productionUtilities.totalInputBlocks} facility input blocks accumulated ${(metrics.productionUtilities.totalInputWaitTicks / 1000).toFixed(1)} device-s of wait; providers interrupted ${metrics.productionUtilities.totalProviderInterruptions} active jobs.`,
    subjects: utilityDevice ? [{ kind: "device", id: utilityDevice }] : [],
    evidence: { blocks: metrics.productionUtilities.totalInputBlocks, waitTicks: metrics.productionUtilities.totalInputWaitTicks, interruptions: metrics.productionUtilities.totalProviderInterruptions },
  });

  const failedTicks = sum(metrics.failedTime);
  const failedDevice = topKey(metrics.failedTime);
  add({ id: "equipment-failure", label: "Equipment failure", score: ratio(failedTicks, durationTicks * Math.max(1, Object.keys(metrics.failedTime).length)), summary: `Equipment accumulated ${(failedTicks / 1000).toFixed(1)} failed device-s.`, subjects: failedDevice ? [{ kind: "device", id: failedDevice }] : [], evidence: { failedTicks } });

  const unpoweredTicks = sum(metrics.unpoweredTime);
  const unpoweredDevice = topKey(metrics.unpoweredTime);
  add({ id: "power-interruption", label: "Power interruption", score: ratio(unpoweredTicks, durationTicks * Math.max(1, Object.keys(metrics.unpoweredTime).length)), summary: `Equipment accumulated ${(unpoweredTicks / 1000).toFixed(1)} unpowered device-s across the selected operating window.`, subjects: unpoweredDevice ? [{ kind: "device", id: unpoweredDevice }] : [], evidence: { unpoweredTicks } });

  add({
    id: "transport-blocking",
    label: "Local transport blocking by cause",
    ...analyzeTransportBlocking(metrics, durationTicks),
  });

  const qTimeViolations = Object.values(metrics.routeFlow).reduce((total, route) => total + route.queueTimeViolations, 0);
  const qTimeLots = Object.values(metrics.routeFlow).reduce((total, route) => total + route.violatedLots, 0);
  const qTimeRoute = topKey(Object.fromEntries(Object.entries(metrics.routeFlow).map(([id, route]) => [id, route.queueTimeViolations])));
  const qTimeDetails = qTimeContributors(events, project);
  add({
    id: "q-time",
    label: "Route Q-time",
    score: ratio(qTimeLots, scheduled) + ratio(qTimeViolations, scheduled),
    summary: `${qTimeLots} ${qTimeLots === 1 ? "lot" : "lots"} crossed a Route Q-time limit in ${qTimeViolations} ${qTimeViolations === 1 ? "step visit" : "step visits"} across ${qTimeDetails.length} measured ${qTimeDetails.length === 1 ? "contributor" : "contributors"}.`,
    subjects: qTimeRoute ? [{ kind: "route", id: qTimeRoute }] : [],
    evidence: { violatedLots: qTimeLots, violations: qTimeViolations, contributors: qTimeDetails.length },
    contributors: qTimeDetails,
  });

  const inspectedLots = metrics.qualityFlow.inspectedLots;
  const firstPassYield = inspectedLots ? ratio(metrics.qualityFlow.firstPassCompleted, inspectedLots) : 1;
  const affectedLots = metrics.qualityFlow.reworkedLots + metrics.qualityFlow.scrapDispositions + metrics.qualityFlow.escapedDefects;
  const driftDefects = Object.fromEntries(Object.entries(metrics.equipmentMaintenance.devices)
    .filter(([, maintenance]) => maintenance.driftDefects > 0)
    .map(([id, maintenance]) => [id, maintenance.driftDefects]));
  const driftDevice = topKey(driftDefects);
  const driftedLots = Object.values(metrics.equipmentMaintenance.devices)
    .reduce((total, maintenance) => total + maintenance.driftedLots, 0);
  const driftDefectCount = sum(driftDefects);
  const driftContext = driftDevice
    ? ` Equipment drift introduced ${driftDefectCount} defect instances across ${driftedLots} lot jobs; ${driftDevice} contributed ${driftDefects[driftDevice]}.`
    : "";
  const qualityDetails = analyzeQualityContributors(project, events);
  const qualitySubject = qualityDetails[0] ?? null;
  const contributorContext = qualitySubject
    ? ` ${qualityDetails.length} defect-origin contributors are traceable; ${qualitySubject.label} leads with ${qualitySubject.evidence.scrappedLots} scrap dispositions.`
    : "";
  const qualityControlContext = metrics.qualityFlow.qualityControl.authoredDefectInstances
    ? ` Mode controls prevented ${metrics.qualityFlow.qualityControl.preventedDefectInstances}/${metrics.qualityFlow.qualityControl.authoredDefectInstances} authored defect instances across ${metrics.qualityFlow.qualityControl.preventedLots} lots.`
    : "";
  add({
    id: "yield-quality", label: "Verified yield and quality loss", score: ratio(affectedLots, inspectedLots) + ratio(metrics.lotOutputFlow.lostUnits, metrics.lotOutputFlow.nominalUnits),
    summary: `${metrics.qualityFlow.firstPassCompleted}/${inspectedLots} inspected lots passed first inspection; ${metrics.qualityFlow.reworkedLots} reworked, ${metrics.qualityFlow.scrapDispositions} scrapped, ${metrics.qualityFlow.escapedDefects} escaped, and ${metrics.lotOutputFlow.lostUnits} lot-derived output units were lost.${qualityControlContext}${driftContext}${contributorContext}`,
    subjects: [
      ...(qualitySubject?.subjects ?? (driftDevice ? [{ kind: "device" as const, id: driftDevice }] : [])),
      { kind: "project", id: metrics.lotFlow.family },
    ],
    evidence: {
      inspectedLots,
      firstPassCompleted: metrics.qualityFlow.firstPassCompleted,
      firstPassYield,
      reworkedLots: metrics.qualityFlow.reworkedLots,
      scrapDispositions: metrics.qualityFlow.scrapDispositions,
      escapedDefects: metrics.qualityFlow.escapedDefects,
      authoredDefectInstances: metrics.qualityFlow.qualityControl.authoredDefectInstances,
      preventedDefectInstances: metrics.qualityFlow.qualityControl.preventedDefectInstances,
      appliedDefectInstances: metrics.qualityFlow.qualityControl.appliedDefectInstances,
      preventedLots: metrics.qualityFlow.qualityControl.preventedLots,
      lostOutputUnits: metrics.lotOutputFlow.lostUnits,
      equipmentDriftedLots: driftedLots,
      equipmentDriftDefects: driftDefectCount,
      leadingDriftDeviceLots: driftDevice ? metrics.equipmentMaintenance.devices[driftDevice]!.driftedLots : 0,
      leadingDriftDeviceDefects: driftDevice ? driftDefects[driftDevice]! : 0,
      originContributors: qualityDetails.length,
      subjectIntroducedLots: qualitySubject?.evidence.introducedLots ?? 0,
      subjectPersistentLots: qualitySubject?.evidence.persistentLots ?? 0,
      subjectScrappedLots: qualitySubject?.evidence.scrappedLots ?? 0,
    },
    contributors: qualityDetails,
  });

  buckets.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return {
    version: 6,
    family: metrics.lotFlow.family,
    outcome: {
      scheduled: metrics.lotFlow.scheduled, released: metrics.lotFlow.released, completed: metrics.lotFlow.completed,
      scrapped: metrics.lotFlow.scrapped, inProgress: metrics.lotFlow.inProgress, pendingRelease: metrics.lotFlow.pendingRelease,
      firstPassYield, contractFulfillment: metrics.deliveryPortfolio.fulfillment,
      deliveryShortfall, deliveryOverflow, portfolioNetValue: metrics.deliveryPortfolio.netValue,
    },
    primary: buckets[0] ?? null,
    chain: buckets.slice(0, 5).map((bucket) => bucket.id),
    buckets,
    caveat: "Bucket scores are deterministic ranking signals derived from overlapping measured delays and losses; they are not additive units of foregone output or calibrated causal estimates.",
  };
}

export function analyzeFabLosses(
  metrics: FactoryMetrics,
  durationTicks: number,
  run: { id: string; resultHash: string },
  project: Pick<CompiledFactoryProject, "devices" | "routes">,
  events: readonly FactoryEvent[],
): FabLossAttribution | null {
  const profile = analyzeFabLossProfile(metrics, durationTicks, project, events);
  return profile ? { ...profile, run } : null;
}
