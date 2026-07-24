import { DeterministicPriorityQueue } from "./priority-queue";
import { evaluateFactory, type SimulationStats } from "./evaluator";
import { evaluateDeviceProgram } from "./device-runtime";
import { connectionDispatchProfiles, effectiveDispatchPolicy, resourceCriticalDepth, stationRouteDispatchProfile } from "./dispatch-priority";
import type {
  ActiveDeviceJob, BeltTransit, CarrierMission, CompiledDevice, CompiledFactoryProject, DeviceProgramDecision, DeviceRuntimeState, FactoryEvent, FactoryState,
  MaintenanceCause, MaintenanceTrigger, ResourceBufferQuantity, ResourceTransit, SimulationResult, Tick, TransportBlockCause, TransportBlockStage,
} from "./types";
import { hashValue } from "./utils";
import { mutateFactoryState } from "./state";
import { emptyTransportBlockTicks } from "./transport-blocking";

type InternalEvent =
  | { kind: "lot-release"; lotIds: string[] }
  | { kind: "material-delivery"; deliveryIds: string[] }
  | { kind: "complete"; device: string; generation: number }
  | { kind: "belt-step"; connection: string; transitId: string }
  | { kind: "arrive"; connection: string; transitId: string }
  | { kind: "station-arrive"; network: string; route: string; transitId: string }
  | { kind: "carrier-return"; network: string; route: string; missionId: string }
  | { kind: "logistics-ready"; connection: string }
  | { kind: "power-boundary"; grid: string; generation: number }
  | { kind: "generation-boundary"; device: string }
  | { kind: "electricity-tariff-boundary"; region: string }
  | { kind: "campaign-timeout"; device: string; targetGroup: string; deadlineTick: Tick }
  | { kind: "batch-timeout"; device: string; preferredProcess: string; deadlineTick: Tick }
  | { kind: "maintenance-boundary"; device: string; qualifiedAtTick: Tick }
  | { kind: "sleep-boundary"; device: string; idleSinceTick: Tick }
  | { kind: "breakdown"; device: string }
  | { kind: "recover"; device: string };

export interface RunOptions { untilTick?: number; maxEvents?: number; seed?: number }

const POWER_SATISFACTION_SCALE = 1_000_000;
const scaledCeil = (value: number, multiplier: { numerator: number; denominator: number }): number =>
  Math.ceil(value * multiplier.numerator / multiplier.denominator);

function quantity(inventory: Record<string, number>): number { return Object.values(inventory).reduce((sum, count) => sum + count, 0); }
function inventoryByResource(state: FactoryState): Record<string, number> {
  const result: Record<string, number> = {};
  const add = (resource: string, count: number) => {
    result[resource] = (result[resource] ?? 0) + count;
  };
  for (const runtime of Object.values(state.devices)) {
    for (const inventory of Object.values(runtime.buffers)) {
      for (const [resource, count] of Object.entries(inventory)) add(resource, count);
    }
  }
  for (const transit of Object.values(state.transports).flat()) add(transit.resource, transit.count);
  for (const transit of Object.values(state.logisticsTransports).flat()) add(transit.resource, transit.count);
  return result;
}
function stationFleetKey(network: string, station: string): string { return `${network}:${station}`; }

function renewableProfileFor(project: CompiledFactoryProject, deviceId: string) {
  const device = project.devices[deviceId]!;
  return project.scenario.renewableProfiles?.find((profile) => profile.region === device.region && (!profile.asset || profile.asset === device.asset));
}

function generatorOutputAt(project: CompiledFactoryProject, deviceId: string, tick: number): { outputMilliWatts: number; outputPermille: number } {
  const rated = project.devices[deviceId]!.generationPlan?.kind === "renewable" ? project.devices[deviceId]!.generationPlan.outputMilliWatts : 0;
  const profile = renewableProfileFor(project, deviceId);
  if (!profile) return { outputMilliWatts: rated, outputPermille: 1000 };
  const phase = tick % profile.periodTicks;
  const point = [...profile.points].reverse().find((candidate) => candidate.atTick <= phase)!;
  return { outputMilliWatts: Math.floor(rated * point.outputPermille / 1000), outputPermille: point.outputPermille };
}

function nextGeneratorBoundary(project: CompiledFactoryProject, deviceId: string, tick: number): number | undefined {
  const profile = renewableProfileFor(project, deviceId);
  if (!profile) return undefined;
  const cycleStart = tick - tick % profile.periodTicks;
  const nextPoint = profile.points.find((point) => cycleStart + point.atTick > tick);
  return nextPoint ? cycleStart + nextPoint.atTick : cycleStart + profile.periodTicks;
}

function electricityTariffFor(project: CompiledFactoryProject, region: string) {
  return project.scenario.electricityTariffs?.find((tariff) => tariff.region === region);
}

function electricityPriceAt(project: CompiledFactoryProject, region: string, tick: number): number {
  const tariff = electricityTariffFor(project, region);
  if (!tariff) return 0;
  const phase = tick % tariff.periodTicks;
  return [...tariff.points].reverse().find((point) => point.atTick <= phase)!
    .energyPriceMicroCurrencyPerKiloWattHour;
}

function nextElectricityTariffBoundary(project: CompiledFactoryProject, region: string, tick: number): number | undefined {
  const tariff = electricityTariffFor(project, region);
  if (!tariff || tariff.points.length === 1) return undefined;
  const cycleStart = tick - tick % tariff.periodTicks;
  const nextPoint = tariff.points.find((point) => cycleStart + point.atTick > tick);
  return nextPoint ? cycleStart + nextPoint.atTick : cycleStart + tariff.periodTicks;
}

export function createInitialFactoryState(project: CompiledFactoryProject): FactoryState {
  const devices: Record<string, DeviceRuntimeState> = {};
  for (const id of Object.keys(project.devices).sort()) {
    const toolingProvider = project.devices[id]!.assetDef.toolingProvider;
    const buffers = Object.fromEntries(project.devices[id]!.assetDef.buffers.map((buffer) => [
      buffer.id, toolingProvider?.inventoryBuffer === buffer.id
        ? Object.fromEntries(toolingProvider.stock.map((amount) => [amount.resource, amount.count]))
        : { ...(project.scenario.initialBuffers?.[id]?.[buffer.id] ?? {}) },
    ]));
    const materialBatches = Object.fromEntries(Object.entries(buffers).map(([buffer, inventory]) => [
      buffer, Object.fromEntries(Object.entries(inventory).filter(([, count]) => count > 0).map(([resource, count]) => [resource, { "0": count }])),
    ]));
    const lotIds = Object.fromEntries(Object.keys(buffers).map((buffer) => [buffer, {}]));
    const storage = project.devices[id]!.storagePlan;
    const stationEnergy = project.devices[id]!.stationEnergyPlan;
    const initialMilliJoules = project.scenario.initialEnergyMilliJoules?.[id] ?? 0;
    devices[id] = {
      status: "idle", idlePowered: project.devices[id]!.assetDef.power.idleMilliWatts === 0, buffers, materialBatches, lotIds,
      ...(project.devices[id]!.policy?.cadenceControl ? { cadenceControl: {
        starvedSinceTick: null,
        starvationEpisodes: 0,
        starvationTicks: 0,
      } } : {}),
      ...(project.devices[id]!.policy?.idleEnergy ? { energyManagement: {
        mode: "awake" as const, idleSinceTick: 0, sleeps: 0, wakeups: 0, wakeTicks: 0,
      } } : {}),
      ...(project.devices[id]!.policy?.batchFormation ? { batchFormation: {
        holds: 0, holdTicks: 0, preferredReleases: 0, timeoutReleases: 0, draining: false,
      } } : {}),
      ...(project.devices[id]!.assetDef.production?.changeover ? { setup: {
        group: project.scenario.initialSetups?.[id] ?? null,
        changeovers: 0,
        setupTicks: 0,
        campaignHolds: 0,
        campaignHoldTicks: 0,
        campaignMinimumLotReleases: 0,
        campaignMaximumHoldReleases: 0,
      } } : {}),
      ...(project.devices[id]!.assetDef.production?.maintenance ? { maintenance: {
        jobsSinceMaintenance: 0,
        qualifiedAtTick: 0,
        usageTriggered: 0,
        calendarTriggered: 0,
        completed: 0,
        assetLimit: 0,
        plannedBoundary: 0,
        opportunistic: 0,
        cancelled: 0,
        maintenanceTicks: 0,
        qualificationCompleted: 0,
        qualificationCancelled: 0,
        qualificationTicks: 0,
        driftedJobs: 0,
        driftedLots: 0,
        driftDefects: 0,
        inputWaitTicks: 0,
        crewWaitTicks: 0,
        inputBlocks: 0,
        crewBlocks: 0,
        serviceConsumables: {},
        qualificationConsumables: {},
      } } : {}),
      ...(project.devices[id]!.assetDef.maintenanceProvider ? { maintenanceProvider: {
        crews: project.devices[id]!.assetDef.maintenanceProvider!.crews,
        crewsInUse: 0,
        peakCrewsInUse: 0,
        assignments: 0,
        completed: 0,
        cancelled: 0,
        serviceCrewTicks: 0,
        qualificationAssignments: 0,
        qualificationCompleted: 0,
        qualificationCancelled: 0,
        qualificationCrewTicks: 0,
        consumables: {},
      } } : {}),
      ...(project.devices[id]!.processPlans.some((plan) => plan.tooling.length) ? { productionTooling: {
        allocations: 0, completed: 0, cancelled: 0, occupiedTicks: 0, unitTicks: 0,
        inputWaitTicks: 0, inputBlocks: 0, resources: {},
      } } : {}),
      ...(project.devices[id]!.assetDef.toolingProvider ? { toolingProvider: {
        reserved: {}, peakReserved: {}, allocations: 0, completed: 0, cancelled: 0,
        occupiedTicks: 0, unitTicks: 0, resources: {},
      } } : {}),
      ...(project.devices[id]!.processPlans.some((plan) => plan.utilities.length) ? { productionUtilities: {
        allocations: 0, completed: 0, cancelled: 0, providerInterruptions: 0, occupiedTicks: 0, unitTicks: 0,
        inputWaitTicks: 0, inputBlocks: 0, utilities: {},
      } } : {}),
      ...(project.devices[id]!.assetDef.utilityProvider ? { utilityProvider: {
        capacity: Object.fromEntries(project.devices[id]!.assetDef.utilityProvider!.capacities.map((capacity) => [capacity.utility, capacity.units])),
        reserved: {}, peakReserved: {}, allocations: 0, completed: 0, cancelled: 0, interruptedJobs: 0,
        occupiedTicks: 0, unitTicks: 0, utilities: {},
      } } : {}),
      ...(storage ? { energyStorage: {
        capacityMilliJoules: storage.capacityMilliJoules,
        storedMilliJoules: initialMilliJoules,
        initialMilliJoules,
        chargedMilliJoules: 0,
        dischargedMilliJoules: 0,
      } } : {}),
      ...(stationEnergy ? { stationEnergy: {
        capacityMilliJoules: stationEnergy.capacityMilliJoules,
        storedMilliJoules: initialMilliJoules,
        initialMilliJoules,
        chargedMilliJoules: 0,
        spentMilliJoules: 0,
        chargeSatisfactionPpm: POWER_SATISFACTION_SCALE,
      } } : {}),
    };
  }
  for (const treatment of project.scenario.initialTreatments ?? []) {
    const batches = devices[treatment.device]!.materialBatches[treatment.buffer]![treatment.resource]!;
    batches["0"]! -= treatment.count;
    if (batches["0"] === 0) delete batches["0"];
    batches[String(treatment.level)] = (batches[String(treatment.level)] ?? 0) + treatment.count;
  }
  const lots: FactoryState["lots"] = {};
  for (const definition of project.scenario.lotReleases ?? []) {
    const resource = project.resources[definition.resource]!;
    const route = project.routes[resource.tracking!.route]!;
    lots[definition.id] = {
      id: definition.id,
      family: resource.tracking!.family,
      resource: definition.resource,
      treatmentLevel: 0,
      priority: definition.priority ?? 0,
      plannedReleaseTick: definition.releaseTick,
      ...(definition.dueTick === undefined ? {} : { dueTick: definition.dueTick }),
      releaseWait: {
        reason: null, sinceTick: definition.releaseTick,
        ticks: { "buffer-capacity": 0, "resource-capacity": 0, "conwip-limit": 0 }, encountered: [],
      },
      route: {
        id: route.id, step: route.entry.step, completedSteps: 0, visits: { [route.entry.step]: 1 }, reentrantTransitions: 0,
        stepEnteredAtTick: null, queue: {}, queueTimeViolations: 0, terminal: null,
      },
      quality: {
        defects: [], appliedExcursions: [], inspections: 0, passes: 0,
        rejections: 0, scrapDispositions: 0, reworkCycles: 0,
      },
      status: "scheduled",
      statusSinceTick: 0,
      queueTicks: 0,
      processTicks: 0,
      transportTicks: 0,
      location: { kind: "release", device: definition.device, buffer: definition.buffer },
    };
  }
  const transports = Object.fromEntries(Object.keys(project.connections).sort().map((id) => [id, [] as BeltTransit[]]));
  const logisticsTransports = Object.fromEntries(Object.keys(project.logisticsNetworks).sort().map((id) => [id, [] as ResourceTransit[]]));
  const logisticsMissions = Object.fromEntries(Object.keys(project.logisticsNetworks).sort().map((id) => [id, [] as CarrierMission[]]));
  const grids = Object.fromEntries(Object.values(project.powerGrids).sort((a, b) => a.id.localeCompare(b.id)).map((grid) => {
    const renewable = grid.members.reduce((sum, id) => sum + generatorOutputAt(project, id, 0).outputMilliWatts, 0);
    const storedMilliJoules = grid.storageDevices.reduce((sum, id) => sum + (devices[id]!.energyStorage?.storedMilliJoules ?? 0), 0);
    const discharge = grid.storageDevices.reduce((sum, id) => sum + ((devices[id]!.energyStorage?.storedMilliJoules ?? 0) > 0 ? project.devices[id]!.storagePlan!.dischargeMilliWatts : 0), 0);
    return [grid.id, {
      availableMilliWatts: renewable + discharge,
      satisfactionPpm: POWER_SATISFACTION_SCALE,
      consumedMilliJoules: 0,
      storedMilliJoules,
      storageCapacityMilliJoules: grid.storageCapacityMilliJoules,
      chargedMilliJoules: 0,
      dischargedMilliJoules: 0,
    }];
  }));
  const availableMilliWatts = Object.values(grids).reduce((sum, grid) => sum + grid.availableMilliWatts, 0);
  const resourceNodes = Object.fromEntries(Object.values(project.resourceNodes).sort((a, b) => a.id.localeCompare(b.id)).map((node) => [node.id, { remaining: node.amount, reserved: 0, extracted: 0 }]));
  return {
    tick: 0, devices, lots, lotReleaseControl: { open: true }, resourceNodes, transports, logisticsTransports, logisticsMissions, produced: {}, consumed: {},
    energy: { availableMilliWatts, consumedMilliJoules: 0, grids, fuelConsumed: {} }, completedOrders: 0, highSpeedMissions: 0,
    carrierMissions: 0, carrierReturns: 0,
    materialTreatment: { treated: {}, agentsConsumed: {} },
  };
}

export function runUntil(project: CompiledFactoryProject, initialState = createInitialFactoryState(project), options: RunOptions = {}): SimulationResult {
  const untilTick = options.untilTick ?? project.scenario.durationTicks;
  const maxEvents = options.maxEvents ?? 1_000_000;
  const seed = options.seed ?? 0;
  const state: FactoryState = structuredClone(initialState);
  const routeDownstreamTicks: Record<string, Record<string, number>> = Object.fromEntries(Object.values(project.routes).map((route) => {
    const remaining: Record<string, number> = Object.fromEntries(route.steps.map((step) => [step.id, Number.POSITIVE_INFINITY]));
    for (let pass = 0; pass < route.steps.length; pass++) for (const step of route.steps) {
      const candidates = step.transitions.flatMap((transition) => {
        if (transition.terminal === "complete") return [0];
        if (!transition.to || !Number.isFinite(remaining[transition.to])) return [];
        const next = route.steps.find((candidate) => candidate.id === transition.to)!;
        const nextDuration = Math.min(...next.operations.map((process) => project.processes[process]!.durationTicks));
        return [nextDuration + remaining[transition.to]!];
      });
      if (!step.transitions.length && step.operations.some((process) => project.processes[process]!.lotTermination?.terminal === "complete")) candidates.push(0);
      if (candidates.length) remaining[step.id] = Math.min(remaining[step.id]!, ...candidates);
    }
    return [route.id, remaining];
  }));
  const proportionalPower = project.blueprint.policies.powerAllocation === "proportional";
  const criticalDepths = resourceCriticalDepth(project);
  const dispatchProfiles = Object.fromEntries(Object.values(project.connections).map((connection) => [
    connection.id, connectionDispatchProfiles(project, connection, criticalDepths),
  ]));
  const stationDispatchProfiles = Object.fromEntries(Object.values(project.logisticsNetworks).flatMap((network) => network.routes.map((route) => [
    route.id, stationRouteDispatchProfile(project, route, criticalDepths),
  ])));
  const events: FactoryEvent[] = [];
  const queue = new DeterministicPriorityQueue<InternalEvent>();
  const generations: Record<string, number> = Object.fromEntries(Object.keys(project.devices).map((id) => [id, 0]));
  const statusSince: Record<string, number> = Object.fromEntries(Object.keys(project.devices).map((id) => [id, state.tick]));
  const stats: SimulationStats = {
    durations: {}, wipArea: 0, inventoryArea: {}, inventoryPeak: {}, peakTotalInventory: 0, peakWip: 0,
    congestionArea: 0, beltOccupancyArea: 0, beltItemArea: 0, beltBlockedArea: 0, peakBeltItems: 0, peakActiveLots: 0,
    releaseControlServiceLevelOpenings: 0,
    transportStageActiveArea: {}, connectionOccupancyArea: {}, connectionBlockedAreaByCause: {}, connectionDepartedItems: {}, connectionDeliveredItems: {},
    connectionDepartedByResource: {}, connectionDeliveredByResource: {}, stationFleetBusyArea: {}, stationFleetCompletedReturns: {},
    lotProcessBatches: {}, lotOutputProfiles: {},
    consumedByRegion: {},
    powerGrids: Object.fromEntries(Object.keys(project.powerGrids).sort().map((grid) => [grid, {
      generatedMilliJoules: 0, demandMilliJoules: 0, servedMilliJoules: 0, unservedMilliJoules: 0, curtailedMilliJoules: 0,
      peakGenerationMilliWatts: 0, peakDemandMilliWatts: 0, peakDeficitMilliWatts: 0, peakSurplusMilliWatts: 0,
      currentDeficitEpisodeMilliJoules: 0, requiredStorageCapacityMilliJoules: 0,
      satisfactionPpmArea: 0, minimumSatisfactionPpm: POWER_SATISFACTION_SCALE,
    }])),
    electricityMarkets: Object.fromEntries((project.scenario.electricityTariffs ?? [])
      .map((tariff) => [tariff.region, {
        energyConsumedMilliJoules: 0, energyChargeMicroCurrency: 0, peakDemandMilliWatts: 0,
      }])),
    transportEnergyConsumedMilliJoules: 0, elapsedTicks: state.tick,
  };
  let sequence = 0; let transitSequence = 0; let publicEventCount = 0;
  const unmetPowerDemand: Record<string, number> = {};
  const dispatchCursors: Record<string, number> = {};
  const transportCellCursors: Record<string, number> = {};
  const transportPowerBlocked: Record<string, boolean> = {};
  const pausedTransportWork: Record<string, {
    connection: string; device: string; stage: "loader" | "unloader"; transitId: string; remainingTicks: number;
    reason: "failure" | "power";
  }> = {};
  const proportionalTransportWork: Record<string, {
    connection: string; device: string; stage: "loader" | "unloader"; transitId: string;
    remainingTicks: number; workedTicks: number; resumedAt: number; satisfactionPpm: number;
  }> = {};
  const stationDispatchCursors: Record<string, number> = {};
  const stationEnergyBlocked = new Set<string>();
  const nextDispatchTick: Record<string, number> = Object.fromEntries(Object.keys(project.connections).map((id) => [id, state.tick]));
  const scheduledDispatchTick: Record<string, number | undefined> = {};
  const scheduledPowerBoundaryTick: Record<string, number | undefined> = {};
  const eligibleLotReleases = new Set<string>();
  const pendingMaterialDeliveries = new Set<string>();
  const materialDeliveries = Object.fromEntries((project.scenario.materialDeliveries ?? []).map((delivery) => [delivery.id, delivery]));
  const releasePolicy = project.blueprint.policies.lotRelease;
  const activeLotWip = () => Object.values(state.lots)
    .filter((lot) => lot.releasedAtTick !== undefined && lot.status !== "completed" && lot.status !== "scrapped").length;
  const updatePeakActiveLots = () => { stats.peakActiveLots = Math.max(stats.peakActiveLots, activeLotWip()); };
  const isServiceProtectedLot = (id: string): boolean => {
    const lot = state.lots[id];
    return lot?.status === "scheduled" && releasePolicy?.serviceLevelAfterTicks !== undefined
      && state.tick - lot.plannedReleaseTick >= releasePolicy.serviceLevelAfterTicks;
  };
  const compareEligibleLots = (leftId: string, rightId: string): number => {
    const left = state.lots[leftId]!; const right = state.lots[rightId]!;
    const serviceClass = Number(isServiceProtectedLot(rightId)) - Number(isServiceProtectedLot(leftId));
    if (serviceClass) return serviceClass;
    if (releasePolicy?.dispatch === "earliest-due-date") {
      const due = (left.dueTick ?? Number.MAX_SAFE_INTEGER) - (right.dueTick ?? Number.MAX_SAFE_INTEGER);
      if (due) return due;
    } else if (releasePolicy?.dispatch === "highest-priority") {
      const priority = right.priority - left.priority;
      if (priority) return priority;
    }
    return left.plannedReleaseTick - right.plannedReleaseTick || left.id.localeCompare(right.id);
  };
  const powerBoundaryGenerations: Record<string, number> = Object.fromEntries(Object.keys(project.powerGrids).map((id) => [id, 0]));
  const schedule = (tick: number, priority: number, value: InternalEvent) => queue.push({ tick, priority, sequence: sequence++, value });
  const scheduleLogisticsReady = (connection: string, tick: number) => {
    if (scheduledDispatchTick[connection] !== undefined && scheduledDispatchTick[connection]! <= tick) return;
    scheduledDispatchTick[connection] = tick;
    schedule(tick, 11, { kind: "logistics-ready", connection });
  };
  const emit = (event: FactoryEvent) => {
    if (event.type === "power.shortage") unmetPowerDemand[event.device] = event.requiredMilliWatts;
    events.push(event); publicEventCount++;
  };
  const setReleaseControlOpen = (open: boolean, cause?: "reopen-threshold" | "service-level"): boolean => {
    if (!releasePolicy || state.lotReleaseControl.open === open) return false;
    mutateFactoryState(state, { kind: "lot.release-control", open });
    if (open) {
      if (!cause) throw new Error("Opening the lot release controller requires a cause");
      if (cause === "service-level") stats.releaseControlServiceLevelOpenings++;
      emit({
        type: "lot.release-control-opened", tick: state.tick, cause,
        activeWip: activeLotWip(), reopenAtWip: releasePolicy.reopenAtWip, maximumWip: releasePolicy.maximumWip,
      });
    } else emit({
      type: "lot.release-control-closed", tick: state.tick,
      activeWip: activeLotWip(), reopenAtWip: releasePolicy.reopenAtWip, maximumWip: releasePolicy.maximumWip,
    });
    return true;
  };
  const setStatus = (device: string, status: DeviceRuntimeState["status"]) => {
    const runtime = state.devices[device]!;
    if (status === "unpowered") unmetPowerDemand[device] ??= runtime.activeJob?.powerMilliWatts
      ?? project.devices[device]!.processPlan?.powerMilliWatts
      ?? project.devices[device]!.assetDef.power.activeMilliWatts;
    else delete unmetPowerDemand[device];
    if (runtime.status === status) return;
    const durations = stats.durations[device] ??= {};
    durations[runtime.status] = (durations[runtime.status] ?? 0) + state.tick - statusSince[device]!;
    statusSince[device] = state.tick;
    mutateFactoryState(state, { kind: "status", device, status });
  };
  const usesPersistentPower = (device: CompiledDevice) => device.assetDef.capabilities.includes("station") || device.assetDef.capabilities.includes("transport-junction");
  const powerPriority = (device: CompiledDevice) => device.policy?.powerPriority ?? 0;
  const comparePowerRank = (left: CompiledDevice, right: CompiledDevice) => powerPriority(right) - powerPriority(left) || left.id.localeCompare(right.id);
  const outranksForPower = (candidate: CompiledDevice, incumbent: CompiledDevice) => comparePowerRank(candidate, incumbent) < 0;
  const transportStage = (connection: CompiledFactoryProject["connections"][string], stage: "loader" | "unloader") => connection.logisticsStages.find((item) => item.stage === stage)!;
  const transportPhase = (stage: "loader" | "unloader") => stage === "loader" ? "loading" : "unloading";
  const transportWorkKey = (connection: string, stage: "loader" | "unloader", transitId: string) => `${connection}:${stage}:${transitId}`;
  const standbyRequirement = (device: CompiledDevice): number => {
    const runtime = state.devices[device.id]!;
    return runtime.energyManagement?.mode === "sleeping"
      ? device.assetDef.power.sleep!.idleMilliWatts
      : device.assetDef.power.idleMilliWatts;
  };
  const startProportionalTransportWork = (connection: string, stage: "loader" | "unloader", transitId: string, device: string, durationTicks: number) => {
    if (!proportionalPower) return;
    proportionalTransportWork[transportWorkKey(connection, stage, transitId)] = {
      connection, device, stage, transitId, remainingTicks: durationTicks, workedTicks: 0,
      resumedAt: state.tick, satisfactionPpm: POWER_SATISFACTION_SCALE,
    };
  };
  const syncTransportEndpointStatus = (connection: CompiledFactoryProject["connections"][string], stageName: "loader" | "unloader") => {
    const stage = transportStage(connection, stageName); const runtime = state.devices[stage.device!.id]!;
    if (runtime.status === "failed") return;
    const active = state.transports[connection.id]!.some((transit) => transit.phase === transportPhase(stageName));
    const key = `${connection.id}:${stageName}`;
    setStatus(stage.device!.id, transportPowerBlocked[key] ? "unpowered" : active ? "processing" : "idle");
  };
  const standbyPower = (grid?: string) => Object.entries(state.devices).reduce((sum, [id, runtime]) => {
    const device = project.devices[id]!;
    if (!runtime.idlePowered || runtime.status === "failed" || (grid !== undefined && device.powerGrid !== grid)) return sum;
    return sum + standbyRequirement(device);
  }, 0);
  const requestedStandbyPower = (grid?: string) => Object.entries(state.devices).reduce((sum, [id, runtime]) => {
    const device = project.devices[id]!;
    if (runtime.status === "failed" || !device.powerGrid || (grid !== undefined && device.powerGrid !== grid)) return sum;
    return sum + standbyRequirement(device);
  }, 0);
  const activeTransportPowerDelta = (grid?: string) => Object.entries(state.transports).reduce((sum, [connectionId, transits]) => {
    const connection = project.connections[connectionId]!;
    return sum + (["loader", "unloader"] as const).reduce((stageSum, stageName) => {
      const stage = transportStage(connection, stageName);
      if (!transits.some((transit) => transit.phase === transportPhase(stageName))
        || (!proportionalPower && state.devices[stage.device!.id]!.status !== "processing")) return stageSum;
      if (grid !== undefined && stage.powerGrid !== grid) return stageSum;
      return stageSum + Math.max(0, stage.asset.power.activeMilliWatts - stage.asset.power.idleMilliWatts);
    }, 0);
  }, 0);
  const transportStandbyPower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    const runtime = state.devices[device.id]!;
    if (!device.transportEndpoint || !runtime.idlePowered || runtime.status === "failed" || (grid !== undefined && device.powerGrid !== grid)) return sum;
    return sum + device.assetDef.power.idleMilliWatts;
  }, 0);
  const activeTransportPower = (grid?: string) => transportStandbyPower(grid) + activeTransportPowerDelta(grid);
  const requestedTransportPowerDelta = (grid?: string) => Object.entries(state.transports).reduce((sum, [connectionId, transits]) => {
    const connection = project.connections[connectionId]!;
    return sum + (["loader", "unloader"] as const).reduce((stageSum, stageName) => {
      const stage = transportStage(connection, stageName); const runtime = state.devices[stage.device!.id]!;
      if (runtime.status === "failed" || (grid !== undefined && stage.powerGrid !== grid)) return stageSum;
      const requested = transits.some((transit) => transit.phase === transportPhase(stageName)) || transportPowerBlocked[`${connectionId}:${stageName}`];
      return stageSum + (requested ? Math.max(0, stage.asset.power.activeMilliWatts - stage.asset.power.idleMilliWatts) : 0);
    }, 0);
  }, 0);
  const hasActiveTransportWork = (device: CompiledDevice): boolean => {
    if (!device.transportEndpoint) return false;
    const attachment = device.transportEndpoint;
    return state.transports[attachment.connection]!.some((transit) => transit.phase === transportPhase(attachment.stage));
  };
  const stationChargeRequestedDelta = (device: CompiledDevice): number => {
    const runtime = state.devices[device.id]!; const energy = runtime.stationEnergy;
    if (!device.stationEnergyPlan || !energy || runtime.status === "failed"
      || energy.storedMilliJoules >= energy.capacityMilliJoules - 1e-9) return 0;
    return device.stationEnergyPlan.chargeMilliWatts;
  };
  const stationChargePower = (device: CompiledDevice): number => {
    const runtime = state.devices[device.id]!; const energy = runtime.stationEnergy;
    return energy && runtime.idlePowered ? stationChargeRequestedDelta(device) * energy.chargeSatisfactionPpm / POWER_SATISFACTION_SCALE : 0;
  };
  const requestedActiveDeltaForDevice = (device: CompiledDevice): number => {
    const runtime = state.devices[device.id]!;
    if (runtime.status === "failed" || runtime.activeJob?.generationMilliWatts) return 0;
    if (runtime.activeJob) return Math.max(0, runtime.activeJob.powerMilliWatts - standbyRequirement(device));
    if (device.stationEnergyPlan) return stationChargeRequestedDelta(device);
    return hasActiveTransportWork(device)
      ? Math.max(0, device.assetDef.power.activeMilliWatts - device.assetDef.power.idleMilliWatts) : 0;
  };
  const activePower = (grid?: string) => standbyPower(grid) + Object.entries(state.devices).reduce((sum, [id, runtime]) => {
    if (grid !== undefined && project.devices[id]!.powerGrid !== grid) return sum;
    if (project.devices[id]!.stationEnergyPlan) return sum + stationChargePower(project.devices[id]!);
    if (!runtime.idlePowered || runtime.status !== "processing" || !runtime.activeJob || runtime.activeJob.generationMilliWatts) return sum;
    return sum + Math.max(0, runtime.activeJob.powerMilliWatts - standbyRequirement(project.devices[id]!));
  }, 0) + activeTransportPowerDelta(grid);
  const requestedPower = (grid?: string) => requestedStandbyPower(grid) + Object.entries(state.devices).reduce((sum, [id, runtime]) => {
    if (grid !== undefined && project.devices[id]!.powerGrid !== grid) return sum;
    if (runtime.status === "failed" || runtime.activeJob?.generationMilliWatts) return sum;
    if (project.devices[id]!.stationEnergyPlan) return sum + stationChargeRequestedDelta(project.devices[id]!);
    const baseline = standbyRequirement(project.devices[id]!);
    const requested = runtime.activeJob?.powerMilliWatts
      ?? (!project.devices[id]!.transportEndpoint && runtime.status === "unpowered" ? unmetPowerDemand[id] ?? baseline : baseline);
    return sum + Math.max(0, requested - baseline);
  }, 0) + requestedTransportPowerDelta(grid);
  const requestedTransportPower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    const runtime = state.devices[device.id]!;
    if (!device.transportEndpoint || runtime.status === "failed" || (grid !== undefined && device.powerGrid !== grid)) return sum;
    return sum + device.assetDef.power.idleMilliWatts;
  }, 0) + requestedTransportPowerDelta(grid);
  const generationPower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    if (grid !== undefined && device.powerGrid !== grid) return sum;
    if (state.devices[device.id]!.status === "failed") return sum;
    if (device.generationPlan?.kind === "renewable") return sum + generatorOutputAt(project, device.id, state.tick).outputMilliWatts;
    return sum + (state.devices[device.id]!.activeJob?.generationMilliWatts ?? 0);
  }, 0);
  const storageDischargePower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    if (!device.storagePlan || (grid !== undefined && device.powerGrid !== grid) || state.devices[device.id]!.status === "failed") return sum;
    return sum + ((state.devices[device.id]!.energyStorage?.storedMilliJoules ?? 0) > 1e-9 ? device.storagePlan.dischargeMilliWatts : 0);
  }, 0);
  const availablePower = (grid?: string) => generationPower(grid) + storageDischargePower(grid);
  const gridSatisfactionPpm = (grid: string): number => {
    if (!proportionalPower) return POWER_SATISFACTION_SCALE;
    const demand = requestedPower(grid);
    if (demand <= 0) return POWER_SATISFACTION_SCALE;
    return Math.max(0, Math.min(POWER_SATISFACTION_SCALE, Math.floor(availablePower(grid) * POWER_SATISFACTION_SCALE / demand)));
  };
  const gridLoad = (grid: string): number => proportionalPower ? requestedPower(grid) : activePower(grid);
  const canClaimActivePower = (device: CompiledDevice, requiredDelta: number, grid: string): boolean => {
    let claimable = Math.max(0, availablePower(grid) - activePower(grid));
    for (const incumbent of project.powerGrids[grid]!.members.map((id) => project.devices[id]!).sort(comparePowerRank)) {
      if (!outranksForPower(device, incumbent)) continue;
      const runtime = state.devices[incumbent.id]!;
      if (runtime.idlePowered) claimable += standbyRequirement(incumbent);
      if (runtime.status === "processing" && runtime.activeJob && !runtime.activeJob.generationMilliWatts) {
        claimable += Math.max(0, runtime.activeJob.powerMilliWatts - standbyRequirement(incumbent));
      }
      if (incumbent.stationEnergyPlan) claimable += stationChargePower(incumbent);
      if (!incumbent.transportEndpoint || runtime.status !== "processing") continue;
      const attachment = incumbent.transportEndpoint;
      const connection = project.connections[attachment.connection]!;
      if (state.transports[connection.id]!.some((transit) => transit.phase === transportPhase(attachment.stage))) {
        claimable += Math.max(0, incumbent.assetDef.power.activeMilliWatts - incumbent.assetDef.power.idleMilliWatts);
      }
    }
    return requiredDelta <= claimable;
  };
  const canStartPoweredWork = (device: CompiledDevice, requiredMilliWatts: number): boolean => {
    if (requiredMilliWatts <= 0) return true;
    const runtime = state.devices[device.id]!; const grid = device.powerGrid;
    if (!runtime.idlePowered || !grid) return false;
    return proportionalPower
      ? availablePower(grid) > 0
      : canClaimActivePower(device, Math.max(0, requiredMilliWatts - standbyRequirement(device)), grid);
  };
  const syncPowerAvailability = () => {
    for (const grid of Object.keys(project.powerGrids)) state.energy.grids[grid]!.availableMilliWatts = availablePower(grid);
    state.energy.availableMilliWatts = availablePower();
  };
  const measureUntil = (tick: number) => {
    const delta = tick - state.tick;
    if (delta <= 0) return;
    const inventory = inventoryByResource(state);
    const wipScope = new Set(project.objective.wipResources);
    const totalInventory = Object.values(inventory).reduce((sum, count) => sum + count, 0);
    const wip = Object.entries(inventory).reduce((sum, [resource, count]) => sum + (wipScope.has(resource) ? count : 0), 0);
    for (const [resource, count] of Object.entries(inventory)) {
      stats.inventoryArea[resource] = (stats.inventoryArea[resource] ?? 0) + count * delta;
      stats.inventoryPeak[resource] = Math.max(stats.inventoryPeak[resource] ?? 0, count);
    }
    stats.peakTotalInventory = Math.max(stats.peakTotalInventory, totalInventory);
    stats.peakWip = Math.max(stats.peakWip, wip);
    updatePeakActiveLots();
    const beltTransits = Object.values(state.transports).flat().filter((transit) => transit.phase === "belt");
    const occupiedBeltCells = beltTransits.length;
    const beltItems = beltTransits.reduce((sum, transit) => sum + transit.count, 0);
    const blockedBeltItems = Object.values(state.transports).flat().filter((transit) => transit.blockedBy).reduce((sum, transit) => sum + transit.count, 0);
    const connectionCongestion = occupiedBeltCells / Math.max(1, Object.keys(project.transportCells).length) * Object.keys(project.connections).length;
    const stationCongestion = Object.entries(state.logisticsMissions).reduce((sum, [id, missions]) => sum
      + project.logisticsNetworks[id]!.fleets.reduce((fleetSum, fleet) => {
        if (fleet.count <= 0) return fleetSum;
        const busy = missions.filter((mission) => mission.homeStation === fleet.station && mission.carrierAsset === fleet.asset.id).length;
        return fleetSum + busy / fleet.count;
      }, 0), 0);
    const congestion = connectionCongestion + stationCongestion;
    stats.wipArea += wip * delta; stats.congestionArea += congestion * delta;
    stats.beltOccupancyArea += occupiedBeltCells * delta;
    stats.beltItemArea += beltItems * delta;
    stats.beltBlockedArea += blockedBeltItems * delta;
    stats.peakBeltItems = Math.max(stats.peakBeltItems, beltItems);
    for (const missions of Object.values(state.logisticsMissions)) for (const mission of missions) {
      const key = stationFleetKey(mission.network, mission.homeStation);
      stats.stationFleetBusyArea[key] = (stats.stationFleetBusyArea[key] ?? 0) + delta;
    }
    for (const [connectionId, transits] of Object.entries(state.transports)) {
      const active = stats.transportStageActiveArea[connectionId] ??= { loader: 0, unloader: 0 };
      const connection = project.connections[connectionId]!;
      const loader = transportStage(connection, "loader"); const unloader = transportStage(connection, "unloader");
      if (state.devices[loader.device!.id]!.status === "processing") active.loader += transits.filter((transit) => transit.phase === "loading").length * delta;
      if (state.devices[unloader.device!.id]!.status === "processing") active.unloader += transits.filter((transit) => transit.phase === "unloading").length * delta;
      stats.connectionOccupancyArea[connectionId] = (stats.connectionOccupancyArea[connectionId] ?? 0)
        + transits.reduce((sum, transit) => sum + transit.count, 0) * delta;
      const blockedByCause = stats.connectionBlockedAreaByCause[connectionId] ??= emptyTransportBlockTicks();
      for (const transit of transits.filter((item) => item.blockedBy)) {
        if (!transit.blockedCause || !transit.blockedStage) {
          throw new Error(`Blocked transit '${transit.id}' on '${connectionId}' has no typed cause and stage`);
        }
        blockedByCause[transit.blockedCause][transit.blockedStage] += transit.count * delta;
      }
    }
    const regionalMeteredPower: Record<string, number> = {};
    for (const grid of Object.keys(project.powerGrids).sort()) {
      const generated = generationPower(grid); const load = gridLoad(grid); const requestedLoad = requestedPower(grid);
      const powerStats = stats.powerGrids[grid]!;
      const satisfactionPpm = proportionalPower ? state.energy.grids[grid]!.satisfactionPpm : POWER_SATISFACTION_SCALE;
      powerStats.satisfactionPpmArea += satisfactionPpm * delta;
      if (requestedLoad > 0) powerStats.minimumSatisfactionPpm = Math.min(powerStats.minimumSatisfactionPpm, satisfactionPpm);
      powerStats.generatedMilliJoules += generated * delta / 1000;
      powerStats.demandMilliJoules += requestedLoad * delta / 1000;
      powerStats.peakGenerationMilliWatts = Math.max(powerStats.peakGenerationMilliWatts, generated);
      powerStats.peakDemandMilliWatts = Math.max(powerStats.peakDemandMilliWatts, requestedLoad);
      powerStats.peakDeficitMilliWatts = Math.max(powerStats.peakDeficitMilliWatts, requestedLoad - generated);
      powerStats.peakSurplusMilliWatts = Math.max(powerStats.peakSurplusMilliWatts, generated - requestedLoad);
      if (requestedLoad > generated) {
        powerStats.currentDeficitEpisodeMilliJoules += (requestedLoad - generated) * delta / 1000;
        powerStats.requiredStorageCapacityMilliJoules = Math.max(powerStats.requiredStorageCapacityMilliJoules, powerStats.currentDeficitEpisodeMilliJoules);
      } else powerStats.currentDeficitEpisodeMilliJoules = 0;
      const storageDevices = project.powerGrids[grid]!.storageDevices.map((id) => project.devices[id]!)
        .filter((device) => state.devices[device.id]!.status !== "failed").sort((a, b) => a.id.localeCompare(b.id));
      let transferredMilliJoules = 0; let chargedMilliJoules = 0;
      const deficitMilliJoules = Math.max(0, load - generated) * delta / 1000;
      const surplusMilliJoules = Math.max(0, generated - load) * delta / 1000;
      if (deficitMilliJoules > 0) {
        let remaining = deficitMilliJoules;
        for (const device of storageDevices) {
          const storage = state.devices[device.id]!.energyStorage!; const before = storage.storedMilliJoules;
          const amount = Math.min(remaining, before, device.storagePlan!.dischargeMilliWatts * delta / 1000);
          if (amount <= 0) continue;
          mutateFactoryState(state, { kind: "energy.storage", grid, device: device.id, deltaMilliJoules: -amount, mode: "discharge" });
          transferredMilliJoules += amount; remaining -= amount;
          if (before > 1e-9 && storage.storedMilliJoules <= 1e-9) emit({ type: "power.storage-depleted", tick, device: device.id, grid });
        }
      } else if (surplusMilliJoules > 0) {
        let remaining = surplusMilliJoules;
        for (const device of storageDevices) {
          const storage = state.devices[device.id]!.energyStorage!; const before = storage.storedMilliJoules;
          const headroom = storage.capacityMilliJoules - before;
          const amount = Math.min(remaining, headroom, device.storagePlan!.chargeMilliWatts * delta / 1000);
          if (amount <= 0) continue;
          mutateFactoryState(state, { kind: "energy.storage", grid, device: device.id, deltaMilliJoules: amount, mode: "charge" });
          chargedMilliJoules += amount; remaining -= amount;
          if (before < storage.capacityMilliJoules - 1e-9 && storage.storedMilliJoules >= storage.capacityMilliJoules - 1e-9) emit({ type: "power.storage-full", tick, device: device.id, grid, storedMilliJoules: storage.storedMilliJoules });
        }
      }
      const deliveredPower = Math.min(load, generated + transferredMilliJoules * 1000 / delta);
      const transportLoad = proportionalPower ? requestedTransportPower(grid) : activeTransportPower(grid); const nonTransportLoad = load - transportLoad;
      const consumedMilliJoules = deliveredPower * delta / 1000;
      const region = project.powerGrids[grid]!.region;
      const market = stats.electricityMarkets[region];
      if (market) {
        regionalMeteredPower[region] = (regionalMeteredPower[region] ?? 0) + deliveredPower;
        market.energyConsumedMilliJoules += consumedMilliJoules;
        market.energyChargeMicroCurrency += consumedMilliJoules * electricityPriceAt(project, region, state.tick) / 3_600_000_000;
      }
      powerStats.servedMilliJoules += consumedMilliJoules;
      powerStats.unservedMilliJoules += Math.max(0, requestedLoad * delta / 1000 - consumedMilliJoules);
      powerStats.curtailedMilliJoules += Math.max(0, surplusMilliJoules - chargedMilliJoules);
      stats.transportEnergyConsumedMilliJoules += (proportionalPower
        ? transportLoad * satisfactionPpm / POWER_SATISFACTION_SCALE
        : Math.min(transportLoad, Math.max(0, deliveredPower - nonTransportLoad))) * delta / 1000;
      for (const device of project.powerGrids[grid]!.members.map((id) => project.devices[id]!).filter((item) => item.stationEnergyPlan).sort((a, b) => a.id.localeCompare(b.id))) {
        const energy = state.devices[device.id]!.stationEnergy!; const before = energy.storedMilliJoules;
        const amount = Math.min(energy.capacityMilliJoules - before, stationChargePower(device) * delta / 1000);
        if (amount <= 0) continue;
        mutateFactoryState(state, { kind: "station.energy", device: device.id, deltaMilliJoules: amount, mode: "charge" });
        if (before < energy.capacityMilliJoules - 1e-9 && energy.storedMilliJoules >= energy.capacityMilliJoules - 1e-9) {
          emit({ type: "logistics.energy-full", tick, device: device.id, grid, storedMilliJoules: energy.storedMilliJoules });
        }
      }
      if (consumedMilliJoules) mutateFactoryState(state, { kind: "energy", grid, consumedMilliJoules });
    }
    for (const [region, meteredPower] of Object.entries(regionalMeteredPower)) {
      stats.electricityMarkets[region]!.peakDemandMilliWatts = Math.max(
        stats.electricityMarkets[region]!.peakDemandMilliWatts, meteredPower,
      );
    }
    mutateFactoryState(state, { kind: "tick", tick }); stats.elapsedTicks = tick;
  };
  const nextPowerBoundaryDelay = (grid: string): number | undefined => {
    const generated = generationPower(grid); const load = gridLoad(grid);
    const devices = project.powerGrids[grid]!.storageDevices.map((id) => project.devices[id]!)
      .filter((device) => state.devices[device.id]!.status !== "failed").sort((a, b) => a.id.localeCompare(b.id));
    let remainingPower = Math.abs(generated - load);
    const charging = generated > load; let delay = Number.POSITIVE_INFINITY;
    for (const device of devices) {
      const storage = state.devices[device.id]!.energyStorage!;
      const rate = charging ? device.storagePlan!.chargeMilliWatts : device.storagePlan!.dischargeMilliWatts;
      const availableEnergy = charging ? storage.capacityMilliJoules - storage.storedMilliJoules : storage.storedMilliJoules;
      if (availableEnergy <= 1e-9) continue;
      const allocatedPower = Math.min(rate, remainingPower);
      if (allocatedPower > 0) delay = Math.min(delay, Math.max(1, Math.ceil(availableEnergy * 1000 / allocatedPower)));
      remainingPower -= allocatedPower;
      if (remainingPower <= 0) break;
    }
    for (const device of project.powerGrids[grid]!.members.map((id) => project.devices[id]!).filter((item) => item.stationEnergyPlan).sort((a, b) => a.id.localeCompare(b.id))) {
      const energy = state.devices[device.id]!.stationEnergy!; const rate = stationChargePower(device);
      if (rate <= 0) continue;
      const thresholds = Object.values(project.logisticsNetworks).flatMap((network) => network.routes
        .filter((route) => route.from === device.id && route.missionEnergyMilliJoules > energy.storedMilliJoules + 1e-9)
        .map((route) => route.missionEnergyMilliJoules));
      const nextEnergy = Math.min(energy.capacityMilliJoules, ...thresholds);
      const requiredEnergy = Math.max(0, nextEnergy - energy.storedMilliJoules);
      if (requiredEnergy > 1e-9) delay = Math.min(delay, Math.max(1, Math.ceil(requiredEnergy * 1000 / rate)));
    }
    return Number.isFinite(delay) ? delay : undefined;
  };
  const schedulePowerBoundaries = () => {
    for (const grid of Object.keys(project.powerGrids).sort()) {
      const delay = nextPowerBoundaryDelay(grid); const target = delay === undefined ? undefined : state.tick + delay;
      if (scheduledPowerBoundaryTick[grid] === target) continue;
      powerBoundaryGenerations[grid]!++;
      scheduledPowerBoundaryTick[grid] = target;
      if (target !== undefined) schedule(target, 2, { kind: "power-boundary", grid, generation: powerBoundaryGenerations[grid]! });
    }
  };
  const accepts = (device: CompiledDevice, buffer: string, resource: string) => {
    const contract = device.buffers[buffer]!.accepts;
    return contract.includes("*") || contract.includes(resource);
  };
  const materialLevels = (device: string, buffer: string, resource: string): Array<[number, number]> => Object.entries(
    state.devices[device]!.materialBatches[buffer]?.[resource] ?? {},
  ).map(([level, count]): [number, number] => [Number(level), count]).filter(([, count]) => count > 0).sort((a, b) => a[0] - b[0]);
  const materialQuantity = (device: string, buffer: string, resource: string, minimumTreatmentLevel = 0): number => materialLevels(device, buffer, resource)
    .filter(([level]) => level >= minimumTreatmentLevel).reduce((sum, [, count]) => sum + count, 0);
  const sourceTreatmentLevel = (device: string, buffer: string, resource: string, minimumTreatmentLevel = 0): number | undefined => materialLevels(device, buffer, resource)
    .find(([level]) => level >= minimumTreatmentLevel)?.[0];
  const isTracked = (resource: string): boolean => Boolean(project.resources[resource]?.tracking);
  const trackedJobLotIds = (job: ActiveDeviceJob): string[] => [
    ...(job.lotTransfers?.flatMap((transfer) => transfer.lotIds) ?? []),
    ...(job.lotTerminations?.flatMap((termination) => termination.lotIds) ?? []),
  ];
  const rankedLotIds = (device: CompiledDevice, buffer: string, resource: string, treatmentLevel?: number): string[] => {
    const ids = [...(state.devices[device.id]!.lotIds[buffer]?.[resource] ?? [])]
      .filter((id) => treatmentLevel === undefined || state.lots[id]!.treatmentLevel === treatmentLevel);
    const policy = device.policy?.lotDispatch ?? "fifo";
    if (policy === "fifo") return ids;
    return ids.sort((leftId, rightId) => {
      const left = state.lots[leftId]!; const right = state.lots[rightId]!;
      if (policy === "oldest-release") return left.releasedAtTick! - right.releasedAtTick! || left.id.localeCompare(right.id);
      if (policy === "earliest-due-date") return (left.dueTick ?? Number.MAX_SAFE_INTEGER) - (right.dueTick ?? Number.MAX_SAFE_INTEGER)
        || left.releasedAtTick! - right.releasedAtTick! || left.id.localeCompare(right.id);
      return right.priority - left.priority || left.releasedAtTick! - right.releasedAtTick! || left.id.localeCompare(right.id);
    });
  };
  const routeAllows = (lotId: string, process: string): boolean => {
    const lot = state.lots[lotId]!;
    if (!lot.route.step || lot.route.terminal) return false;
    return project.routes[lot.route.id]!.steps.find((step) => step.id === lot.route.step)?.operations.includes(process) ?? false;
  };
  const remainingRouteTicks = (lotId: string, plan: CompiledDevice["processPlans"][number]): Tick => {
    const lot = state.lots[lotId]!;
    const downstream = lot.route.step ? routeDownstreamTicks[lot.route.id]?.[lot.route.step] : undefined;
    return plan.durationTicks + (Number.isFinite(downstream) ? downstream! : 0);
  };
  const lotSlackTicks = (lotId: string, plan: CompiledDevice["processPlans"][number]): Tick => {
    const lot = state.lots[lotId]!;
    return lot.dueTick === undefined ? Number.MAX_SAFE_INTEGER : lot.dueTick - state.tick - remainingRouteTicks(lotId, plan);
  };
  const routeQueueAssessment = (lotId: string, process: string) => {
    const lot = state.lots[lotId]!;
    const stepId = lot.route.step;
    if (!stepId || lot.route.stepEnteredAtTick === null) return undefined;
    const step = project.routes[lot.route.id]!.steps.find((candidate) => candidate.id === stepId);
    if (!step?.operations.includes(process)) return undefined;
    const queueTicks = state.tick - lot.route.stepEnteredAtTick;
    const maximumTicks = step.queueTime?.maximumTicks ?? null;
    const violated = maximumTicks !== null && queueTicks > maximumTicks;
    return {
      lotId, route: lot.route.id, step: stepId, queueTicks, maximumTicks, violated,
      defects: violated ? [...step.queueTime!.violationDefects] : [],
    };
  };
  const rankedProcessLotIds = (device: CompiledDevice, buffer: string, resource: string, process: string, minimumTreatmentLevel = 0): string[] =>
    rankedLotIds(device, buffer, resource).filter((id) => state.lots[id]!.treatmentLevel >= minimumTreatmentLevel && routeAllows(id, process));
  const takeLotIds = (device: CompiledDevice, buffer: string, resource: string, count: number, treatmentLevel?: number): string[] => {
    const ids = rankedLotIds(device, buffer, resource, treatmentLevel).slice(0, count);
    if (ids.length !== count) throw new Error(`Tracked Resource '${resource}' in ${device.id}/${buffer} has ${ids.length} identities for ${count} items`);
    return ids;
  };
  const incomingQuantity = (device: string, buffer: string, resource?: string, minimumTreatmentLevel = 0) => [...Object.values(state.transports).flat(), ...Object.values(state.logisticsTransports).flat()]
    .filter((transit) => transit.to === device && transit.toBuffer === buffer && (resource === undefined || transit.resource === resource)
      && (resource === undefined || transit.treatmentLevel >= minimumTreatmentLevel))
    .reduce((sum, transit) => sum + transit.count, 0);
  const freeBufferCapacity = (deviceId: string, bufferId: string, resource: string): number => {
    const device = project.devices[deviceId]!;
    const definition = device.buffers[bufferId]!;
    const inventory = state.devices[deviceId]!.buffers[bufferId]!;
    const totalFree = definition.capacity - quantity(inventory) - incomingQuantity(deviceId, bufferId);
    const resourceCapacity = definition.resourceCapacities?.[resource];
    if (resourceCapacity === undefined) return Math.max(0, totalFree);
    const resourceFree = resourceCapacity - (inventory[resource] ?? 0) - incomingQuantity(deviceId, bufferId, resource);
    return Math.max(0, Math.min(totalFree, resourceFree));
  };
  const transportStagePowered = (connection: CompiledFactoryProject["connections"][string], stageName: "loader" | "unloader"): boolean => {
    const stage = transportStage(connection, stageName); const required = stage.asset.power.activeMilliWatts;
    const runtime = state.devices[stage.device!.id]!;
    if (runtime.status === "failed") return false;
    if (required <= 0) {
      syncTransportEndpointStatus(connection, stageName);
      return true;
    }
    const grid = stage.powerGrid ?? null;
    const available = grid ? Math.max(0, availablePower(grid) - activePower(grid)) : 0;
    const hasPower = canStartPoweredWork(stage.device!, required)
      || (!proportionalPower && runtime.status === "processing");
    const key = `${connection.id}:${stageName}`;
    if (!hasPower) {
      if (!transportPowerBlocked[key]) emit({ type: "transport.power-shortage", tick: state.tick, device: stage.device!.id, connection: connection.id, stage: stageName, grid, requiredMilliWatts: required, availableMilliWatts: available });
      transportPowerBlocked[key] = true; setStatus(stage.device!.id, "unpowered"); return false;
    }
    if (transportPowerBlocked[key]) emit({ type: "transport.power-restored", tick: state.tick, device: stage.device!.id, connection: connection.id, stage: stageName, grid: grid! });
    delete transportPowerBlocked[key]; syncTransportEndpointStatus(connection, stageName); return true;
  };
  const occupiedCell = (cell: string): BeltTransit | undefined => {
    for (const [connectionId, transits] of Object.entries(state.transports)) {
      const connection = project.connections[connectionId]!;
      const occupant = transits.find((transit) => transit.phase === "belt" && connection.transportCells[transit.cellIndex] === cell);
      if (occupant) return occupant;
    }
    return undefined;
  };
  const desiredCell = (connectionId: string, transit: BeltTransit): string | null => {
    const connection = project.connections[connectionId]!;
    if (transit.phase === "loading") return connection.transportCells[0]!;
    if (transit.phase === "belt" && transit.cellIndex < connection.transportCells.length - 1) return connection.transportCells[transit.cellIndex + 1]!;
    return null;
  };
  const waitingConnections = (cell: string): string[] => {
    const waiting = new Set<string>();
    for (const [connectionId, transits] of Object.entries(state.transports)) {
      if (transits.some((transit) => transit.readyTick <= state.tick && desiredCell(connectionId, transit) === cell)) waiting.add(connectionId);
    }
    return project.transportCells[cell]!.connections.filter((connection) => waiting.has(connection));
  };
  const markBlocked = (
    connectionId: string,
    transit: BeltTransit,
    waitingFor: string,
    retryTicks: number,
    cause: TransportBlockCause,
    stage: TransportBlockStage,
  ) => {
    const firstBlock = transit.blockedBy !== waitingFor
      || transit.blockedCause !== cause
      || transit.blockedStage !== stage;
    mutateFactoryState(state, {
      kind: "transport.update",
      connection: connectionId,
      transitId: transit.id,
      changes: {
        readyTick: state.tick + retryTicks,
        blockedBy: waitingFor,
        blockedCause: cause,
        blockedStage: stage,
      },
    });
    if (firstBlock) {
      const connection = project.connections[connectionId]!;
      const cell = transit.phase === "belt" ? connection.transportCells[transit.cellIndex]! : null;
      emit({
        type: "resource.belt-blocked",
        tick: state.tick,
        transit: { ...transit },
        connection: connectionId,
        cell,
        waitingFor,
        cause,
        stage,
      });
    }
    schedule(state.tick + retryTicks, 8, { kind: "belt-step", connection: connectionId, transitId: transit.id });
  };
  const clearBlocked = (connectionId: string, transit: BeltTransit) => {
    if (!transit.blockedBy) return;
    mutateFactoryState(state, {
      kind: "transport.update",
      connection: connectionId,
      transitId: transit.id,
      changes: { blockedBy: null, blockedCause: null, blockedStage: null },
    });
    emit({ type: "resource.belt-unblocked", tick: state.tick, transit: { ...transit }, connection: connectionId });
  };

  const dispatchResourceCandidates = (connection: CompiledFactoryProject["connections"][string]) => {
    const sourceBuffer = state.devices[connection.from.device]!.buffers[connection.fromPort.buffer]!;
    const targetBuffer = state.devices[connection.to.device]!.buffers[connection.toPort.buffer]!;
    const filter = connection.fromDevice.policy?.filter;
    const candidates = dispatchProfiles[connection.id]!.flatMap((profile) => {
      const sourceLevel = sourceTreatmentLevel(connection.from.device, connection.fromPort.buffer, profile.resource, profile.minimumTreatmentLevel);
      if (sourceLevel === undefined || !accepts(connection.toDevice, connection.toPort.buffer, profile.resource)
        || freeBufferCapacity(connection.to.device, connection.toPort.buffer, profile.resource) <= 0) return [];
      if (filter && (connection.from.port === filter.outputPort ? profile.resource !== filter.resource : profile.resource === filter.resource)) return [];
      const residentAndInbound = materialQuantity(connection.to.device, connection.toPort.buffer, profile.resource, profile.minimumTreatmentLevel)
        + incomingQuantity(connection.to.device, connection.toPort.buffer, profile.resource, profile.minimumTreatmentLevel);
      return [{ ...profile, sourceLevel, coverage: residentAndInbound / profile.coverageUnit }];
    });
    if (effectiveDispatchPolicy(project, connection) !== "shortage-first") return candidates.sort((a, b) => a.resource.localeCompare(b.resource));
    return candidates.sort((a, b) => a.coverage - b.coverage
      || (a.criticalDepth ?? Number.MAX_SAFE_INTEGER) - (b.criticalDepth ?? Number.MAX_SAFE_INTEGER)
      || a.resource.localeCompare(b.resource));
  };

  const dispatch = (): boolean => {
    let moved = false;
    const sourceIds = [...new Set(Object.values(project.connections).map((connection) => connection.from.device))].sort();
    const sourceOrderedConnections = sourceIds.flatMap((sourceId) => {
      const outgoing = Object.values(project.connections).filter((connection) => connection.from.device === sourceId).sort((a, b) => a.id.localeCompare(b.id));
      const outputPriority = project.devices[sourceId]!.policy?.outputPriority;
      if (outgoing.length < 2) return outgoing;
      const policy = effectiveDispatchPolicy(project, outgoing[0]!);
      if (policy === "fifo") return outgoing.sort((a, b) => Number(b.from.port === outputPriority) - Number(a.from.port === outputPriority) || a.id.localeCompare(b.id));
      const cursor = dispatchCursors[sourceId] ?? 0;
      const rotated = [...outgoing.slice(cursor % outgoing.length), ...outgoing.slice(0, cursor % outgoing.length)];
      if (policy === "round-robin") return rotated.sort((a, b) => Number(b.from.port === outputPriority) - Number(a.from.port === outputPriority));
      return rotated.map((connection) => ({ connection, rank: dispatchResourceCandidates(connection)[0] }))
        .sort((a, b) => Number(b.connection.from.port === outputPriority) - Number(a.connection.from.port === outputPriority)
          || Number(Boolean(b.rank)) - Number(Boolean(a.rank))
          || (a.rank?.coverage ?? Number.POSITIVE_INFINITY) - (b.rank?.coverage ?? Number.POSITIVE_INFINITY)
          || (a.rank?.criticalDepth ?? Number.MAX_SAFE_INTEGER) - (b.rank?.criticalDepth ?? Number.MAX_SAFE_INTEGER))
        .map((item) => item.connection);
    });
    const orderedConnections = sourceOrderedConnections.map((connection, index) => ({
      connection, index,
      inputPriority: Number(project.devices[connection.to.device]!.policy?.inputPriority === connection.to.port),
    })).sort((a, b) => b.inputPriority - a.inputPriority || a.index - b.index).map((item) => item.connection);
    for (const connection of orderedConnections) {
      const sourceState = state.devices[connection.from.device]!;
      const targetState = state.devices[connection.to.device]!;
      if ((usesPersistentPower(connection.fromDevice) && sourceState.status === "unpowered") || (usesPersistentPower(connection.toDevice) && targetState.status === "unpowered")) continue;
      const loader = transportStage(connection, "loader");
      if (state.devices[loader.device!.id]!.status === "failed") continue;
      if (state.transports[connection.id]!.filter((transit) => transit.phase === "loading").length >= loader.capacity) continue;
      const candidate = dispatchResourceCandidates(connection)[0];
      if (!candidate) continue;
      const { resource, sourceLevel } = candidate;
      const readyTick = nextDispatchTick[connection.id]!;
      if (state.tick < readyTick) {
        scheduleLogisticsReady(connection.id, readyTick);
        continue;
      }
      if (!transportStagePowered(connection, "loader")) continue;
      const freeCapacity = freeBufferCapacity(connection.to.device, connection.toPort.buffer, resource);
      const count = Math.min(materialLevels(connection.from.device, connection.fromPort.buffer, resource).find(([level]) => level === sourceLevel)?.[1] ?? 0,
        freeCapacity, connection.stackSizeByResource[resource] ?? 1);
      if (count <= 0) continue;
      const transitId = `transit-${String(transitSequence++).padStart(6, "0")}`;
      const lotIds = isTracked(resource) ? takeLotIds(connection.fromDevice, connection.fromPort.buffer, resource, count, sourceLevel) : [];
      if (lotIds.length) mutateFactoryState(state, {
        kind: "lot.depart", lotIds, device: connection.from.device, buffer: connection.fromPort.buffer,
        nextStatus: "transport", nextLocation: { kind: "transit", transit: transitId },
      });
      else mutateFactoryState(state, { kind: "buffer", device: connection.from.device, buffer: connection.fromPort.buffer, resource, delta: -count, treatmentLevel: sourceLevel });
      const transit: BeltTransit = {
        id: transitId, resource, count, treatmentLevel: sourceLevel, ...(lotIds.length ? { lotIds } : {}),
        from: connection.from.device, fromBuffer: connection.fromPort.buffer,
        to: connection.to.device, toBuffer: connection.toPort.buffer,
        departTick: state.tick, arriveTick: state.tick + connection.travelTicks,
        phase: "loading", cellIndex: -1, readyTick: state.tick + loader.durationTicks,
      };
      mutateFactoryState(state, { kind: "transport.add", connection: connection.id, transit });
      startProportionalTransportWork(connection.id, "loader", transit.id, loader.device!.id, loader.durationTicks);
      stats.connectionDepartedItems[connection.id] = (stats.connectionDepartedItems[connection.id] ?? 0) + transit.count;
      const departedByResource = stats.connectionDepartedByResource[connection.id] ??= {};
      departedByResource[transit.resource] = (departedByResource[transit.resource] ?? 0) + transit.count;
      emit({ type: "resource.depart", tick: state.tick, transit: { ...transit }, connection: connection.id });
      emit({ type: "transport.stage-start", tick: state.tick, device: loader.device!.id, connection: connection.id, stage: "loader", transitId: transit.id, durationTicks: loader.durationTicks });
      syncTransportEndpointStatus(connection, "loader");
      schedule(transit.readyTick, 8, { kind: "belt-step", connection: connection.id, transitId: transit.id });
      nextDispatchTick[connection.id] = state.tick + connection.loaderDispatchIntervalTicks;
      scheduleLogisticsReady(connection.id, nextDispatchTick[connection.id]!);
      moved = true;
      if (effectiveDispatchPolicy(project, connection) !== "fifo") {
        const count = Object.values(project.connections).filter((item) => item.from.device === connection.from.device).length;
        dispatchCursors[connection.from.device] = ((dispatchCursors[connection.from.device] ?? 0) + 1) % count;
      }
      if (sourceState.status === "blocked-output") { setStatus(connection.from.device, "idle"); emit({ type: "buffer.unblocked", tick: state.tick, device: connection.from.device }); }
    }
    return moved;
  };

  const refreshStandbyPower = (): boolean => {
    let changed = false;
    const connected = new Set<string>();
    for (const grid of Object.keys(project.powerGrids).sort()) {
      let remaining = availablePower(grid);
      const members = project.powerGrids[grid]!.members.map((id) => project.devices[id]!)
        .sort(proportionalPower ? (left, right) => left.id.localeCompare(right.id) : comparePowerRank);
      for (const device of members) {
        connected.add(device.id);
        const runtime = state.devices[device.id]!; const required = standbyRequirement(device);
        const powered = runtime.status !== "failed" && (required === 0 || (proportionalPower ? availablePower(grid) > 0 : required <= remaining));
        if (!proportionalPower && powered) remaining -= required;
        if (!proportionalPower && powered) remaining -= requestedActiveDeltaForDevice(device);
        const powerChanged = runtime.idlePowered !== powered;
        if (powerChanged) {
          mutateFactoryState(state, { kind: "idle-power", device: device.id, powered });
          changed = true;
        }
        if (!powered) {
          if (runtime.status !== "failed" && runtime.status !== "unpowered") {
            emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: proportionalPower ? availablePower(grid) : Math.max(0, remaining) });
            // Active jobs and sorter stages must stay processing until rebalanceActivePower records
            // their exact remaining work; idle infrastructure can become unpowered immediately.
            if (!runtime.activeJob && !hasActiveTransportWork(device)) setStatus(device.id, "unpowered");
          }
        } else if (powerChanged && !runtime.activeJob && !device.transportEndpoint && runtime.status === "unpowered") {
          setStatus(device.id, runtime.energyManagement?.mode === "sleeping" ? "sleeping" : "idle");
          emit({ type: "power.standby-restored", tick: state.tick, device: device.id, grid });
        }
      }
    }
    for (const device of Object.values(project.devices).filter((item) => !connected.has(item.id)).sort((a, b) => a.id.localeCompare(b.id))) {
      const runtime = state.devices[device.id]!; const required = standbyRequirement(device);
      const powered = required === 0 && runtime.status !== "failed";
      if (runtime.idlePowered !== powered) {
        mutateFactoryState(state, { kind: "idle-power", device: device.id, powered }); changed = true;
      }
      if (!powered && runtime.status !== "failed" && runtime.status !== "unpowered") {
        emit({ type: "power.shortage", tick: state.tick, device: device.id, grid: null, requiredMilliWatts: required, availableMilliWatts: 0 });
        if (!runtime.activeJob) setStatus(device.id, "unpowered");
      }
    }
    return changed;
  };

  const dispatchStations = (): boolean => {
    let moved = false;
    for (const network of Object.values(project.logisticsNetworks).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!network.routes.length) continue;
      const activeMissions = state.logisticsMissions[network.id]!;
      while (true) {
        const stableRouteIndices = network.routes.map((_, index) => index).sort((a, b) => network.routes[a]!.id.localeCompare(network.routes[b]!.id));
        const cursor = (stationDispatchCursors[network.id] ?? 0) % stableRouteIndices.length;
        const routeIndices = network.dispatchPolicy === "fifo" ? stableRouteIndices
          : [...stableRouteIndices.slice(cursor), ...stableRouteIndices.slice(0, cursor)];
        let selected: {
          route: (typeof network.routes)[number]; available: number; free: number;
          coverage: number; criticalDepth: number | null; nextCursor: number; sourceLevel: number;
        } | undefined;
        for (const [offset, routeIndex] of routeIndices.entries()) {
          const route = network.routes[routeIndex]!;
          const busyAtSource = activeMissions.filter((mission) => mission.homeStation === route.from && mission.carrierAsset === route.carrierAsset).length;
          if (busyAtSource >= route.fleetSize) continue;
          const sourceState = state.devices[route.from]!;
          const targetState = state.devices[route.to]!;
          const residentTarget = targetState.buffers[route.toBuffer]![route.resource] ?? 0;
          const profile = stationDispatchProfiles[route.id]!;
          const sourceLevel = sourceTreatmentLevel(route.from, route.fromBuffer, route.resource, profile.minimumTreatmentLevel);
          if (sourceLevel === undefined) continue;
          const levelAvailable = materialLevels(route.from, route.fromBuffer, route.resource).find(([level]) => level === sourceLevel)?.[1] ?? 0;
          const available = Math.min(levelAvailable, Math.max(0, (sourceState.buffers[route.fromBuffer]![route.resource] ?? 0) - route.supplyReserve));
          const targetFree = route.demandTarget - residentTarget - incomingQuantity(route.to, route.toBuffer, route.resource);
          const free = Math.max(0, Math.min(freeBufferCapacity(route.to, route.toBuffer, route.resource), targetFree));
          if (sourceState.status === "failed" || targetState.status === "failed" || available < route.minimumBatch || free < route.minimumBatch
            || !sourceState.idlePowered || !targetState.idlePowered) continue;
          const energy = sourceState.stationEnergy!;
          if (energy.storedMilliJoules + 1e-9 < route.missionEnergyMilliJoules) {
            if (!stationEnergyBlocked.has(route.id)) emit({
              type: "logistics.energy-shortage", tick: state.tick, device: route.from, network: network.id, route: route.id,
              requiredMilliJoules: route.missionEnergyMilliJoules, storedMilliJoules: energy.storedMilliJoules,
            });
            stationEnergyBlocked.add(route.id);
            continue;
          }
          stationEnergyBlocked.delete(route.id);
          const coverage = (materialQuantity(route.to, route.toBuffer, route.resource, profile.minimumTreatmentLevel)
            + incomingQuantity(route.to, route.toBuffer, route.resource, profile.minimumTreatmentLevel)) / profile.coverageUnit;
          if (!selected || route.demandPriority > selected.route.demandPriority
            || (route.demandPriority === selected.route.demandPriority && route.supplyPriority > selected.route.supplyPriority)
            || (network.dispatchPolicy === "shortage-first" && route.demandPriority === selected.route.demandPriority
              && route.supplyPriority === selected.route.supplyPriority && (coverage < selected.coverage
                || (coverage === selected.coverage && (profile.criticalDepth ?? Number.MAX_SAFE_INTEGER) < (selected.criticalDepth ?? Number.MAX_SAFE_INTEGER))))) {
            selected = {
              route, available, free, coverage, criticalDepth: profile.criticalDepth, sourceLevel,
              nextCursor: network.dispatchPolicy === "fifo" ? cursor : (cursor + offset + 1) % routeIndices.length,
            };
          }
        }
        if (!selected) break;
        const { route, available, free, sourceLevel } = selected;
        stationDispatchCursors[network.id] = selected.nextCursor;
        const count = Math.min(route.capacity, available, free);
        mutateFactoryState(state, { kind: "station.energy", device: route.from, deltaMilliJoules: -route.missionEnergyMilliJoules, mode: "spend" });
        if (route.highSpeed?.enabled) mutateFactoryState(state, { kind: "high-speed-mission" });
        mutateFactoryState(state, { kind: "carrier-mission" });
        emit({
          type: "logistics.energy-spent", tick: state.tick, device: route.from, network: network.id, route: route.id,
          energyMilliJoules: route.missionEnergyMilliJoules, storedMilliJoules: state.devices[route.from]!.stationEnergy!.storedMilliJoules,
        });
        const transitId = `transit-${String(transitSequence++).padStart(6, "0")}`;
        const lotIds = isTracked(route.resource) ? takeLotIds(project.devices[route.from]!, route.fromBuffer, route.resource, count, sourceLevel) : [];
        if (lotIds.length) mutateFactoryState(state, {
          kind: "lot.depart", lotIds, device: route.from, buffer: route.fromBuffer,
          nextStatus: "transport", nextLocation: { kind: "transit", transit: transitId },
        });
        else mutateFactoryState(state, { kind: "buffer", device: route.from, buffer: route.fromBuffer, resource: route.resource, delta: -count, treatmentLevel: sourceLevel });
        const transit: ResourceTransit = {
          id: transitId,
          resource: route.resource,
          count,
          treatmentLevel: sourceLevel,
          ...(lotIds.length ? { lotIds } : {}),
          from: route.from,
          fromBuffer: route.fromBuffer,
          to: route.to,
          toBuffer: route.toBuffer,
          departTick: state.tick,
          arriveTick: state.tick + route.travelTicks,
          logisticsRoute: route.id,
          ...(route.highSpeed?.enabled ? { highSpeed: true } : {}),
        };
        const mission: CarrierMission = {
          id: `mission-${transit.id}`,
          network: network.id,
          route: route.id,
          homeStation: route.from,
          carrierAsset: route.carrierAsset,
          phase: "outbound",
          departTick: state.tick,
          cargoArriveTick: transit.arriveTick,
          returnTick: state.tick + route.roundTripTicks,
          ...(route.highSpeed?.enabled ? { highSpeed: true } : {}),
        };
        mutateFactoryState(state, { kind: "logistics.add", network: network.id, transit });
        mutateFactoryState(state, { kind: "logistics.mission-add", network: network.id, mission });
        emit({ type: "logistics.depart", tick: state.tick, transit: { ...transit }, network: network.id, route: route.id });
        schedule(transit.arriveTick, 10, { kind: "station-arrive", network: network.id, route: route.id, transitId: transit.id });
        schedule(mission.returnTick, 10, { kind: "carrier-return", network: network.id, route: route.id, missionId: mission.id });
        moved = true;
      }
    }
    return moved;
  };

  const amountAvailable = (device: CompiledDevice, amount: ResourceBufferQuantity): boolean => {
    if (!device.buffers[amount.buffer] || !project.resources[amount.resource]) return false;
    return materialQuantity(device.id, amount.buffer, amount.resource, amount.minimumTreatmentLevel ?? 0) >= amount.count;
  };
  const outputFits = (device: CompiledDevice, produce: ResourceBufferQuantity[]): boolean => {
    const additions: Record<string, number> = {};
    const resourceAdditions: Record<string, Record<string, number>> = {};
    for (const amount of produce) {
      const buffer = device.buffers[amount.buffer];
      if (!buffer || !project.resources[amount.resource] || !(buffer.accepts.includes("*") || buffer.accepts.includes(amount.resource))) return false;
      additions[amount.buffer] = (additions[amount.buffer] ?? 0) + amount.count;
      const byResource = resourceAdditions[amount.buffer] ??= {};
      byResource[amount.resource] = (byResource[amount.resource] ?? 0) + amount.count;
    }
    return Object.entries(additions).every(([buffer, count]) => {
      const inventory = state.devices[device.id]!.buffers[buffer]!;
      if (quantity(inventory) + incomingQuantity(device.id, buffer) + count > device.buffers[buffer]!.capacity) return false;
      return Object.entries(resourceAdditions[buffer]!).every(([resource, resourceCount]) => {
        const capacity = device.buffers[buffer]!.resourceCapacities?.[resource];
        return capacity === undefined || (inventory[resource] ?? 0) + incomingQuantity(device.id, buffer, resource) + resourceCount <= capacity;
      });
    });
  };
  const allAmountsKnown = (device: CompiledDevice, amounts: ResourceBufferQuantity[]) => amounts.every((amount) => device.buffers[amount.buffer] && project.resources[amount.resource]);
  const sameAmounts = (left: ResourceBufferQuantity[], right: ResourceBufferQuantity[]) => {
    const key = (amount: ResourceBufferQuantity) => `${amount.buffer}\0${amount.resource}\0${amount.count}\0${amount.minimumTreatmentLevel ?? "any"}\0${amount.treatmentLevel ?? 0}`;
    const leftKeys = left.map(key).sort(); const rightKeys = right.map(key).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((value, index) => value === rightKeys[index]);
  };
  const amountKey = (amount: Pick<ResourceBufferQuantity, "buffer" | "resource">): string => `${amount.buffer}\0${amount.resource}`;
  const resolveInspectionExecution = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]) => {
    const quality = plan.quality;
    if (quality?.kind !== "inspection") return undefined;
    const transfer = plan.lotTransfers[0]!;
    const lotId = rankedProcessLotIds(device, transfer.input.buffer, transfer.input.resource, plan.definition.id, transfer.input.minimumTreatmentLevel ?? 0)[0];
    if (!lotId) return undefined;
    const lot = state.lots[lotId]!;
    const assessment = routeQueueAssessment(lotId, plan.definition.id);
    const effectiveDefects = [...new Set([...lot.quality.defects, ...(assessment?.defects ?? [])])];
    const detectedDefects = effectiveDefects.filter((defect) => quality.detects.includes(defect)).sort();
    const result = detectedDefects.length === 0 ? "pass" as const
      : quality.scrapOutput && lot.quality.reworkCycles >= quality.maxReworkCycles ? "scrap" as const
        : "reject" as const;
    const output = result === "pass" ? quality.passOutput
      : result === "scrap" ? quality.scrapOutput!
        : quality.rejectOutput;
    return { lotId, detectedDefects, result, output };
  };
  const resolveLotOutputExecution = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]) => {
    if (!plan.lotOutputProfiles.length) return undefined;
    const termination = plan.lotTerminations[0];
    if (!termination || termination.input.count !== 1) return undefined;
    const lotId = rankedProcessLotIds(device, termination.input.buffer, termination.input.resource, plan.definition.id, termination.input.minimumTreatmentLevel ?? 0)[0];
    if (!lotId) return undefined;
    const lot = state.lots[lotId]!;
    const assessment = routeQueueAssessment(lotId, plan.definition.id);
    const defects = [...new Set([...lot.quality.defects, ...(assessment?.defects ?? [])])].sort();
    const profile = plan.lotOutputProfiles.find((candidate) => candidate.defectsAny.some((defect) => defects.includes(defect)));
    return { lotId, defects, profile: profile?.id ?? "nominal", outputs: structuredClone(profile?.outputs ?? plan.outputs) };
  };
  const applyConsume = (device: CompiledDevice, amounts: ResourceBufferQuantity[], disposition: "process" | "deliver" | "scrap", process?: string): Record<string, string[]> => {
    const consumedLots: Record<string, string[]> = {};
    for (const amount of amounts) {
      if (isTracked(amount.resource)) {
        const lotIds = (process
          ? rankedProcessLotIds(device, amount.buffer, amount.resource, process, amount.minimumTreatmentLevel ?? 0)
          : rankedLotIds(device, amount.buffer, amount.resource).filter((id) => state.lots[id]!.treatmentLevel >= (amount.minimumTreatmentLevel ?? 0)))
          .slice(0, amount.count);
        if (lotIds.length !== amount.count) throw new Error(`Insufficient tracked lots for ${device.id}/${amount.buffer}/${amount.resource}`);
        consumedLots[amountKey(amount)] = lotIds;
        if (disposition === "deliver") {
          mutateFactoryState(state, { kind: "lot.complete", lotIds, device: device.id, buffer: amount.buffer });
          for (const id of lotIds) {
            const lot = state.lots[id]!;
            const cycleTicks = state.tick - lot.releasedAtTick!;
            const tardinessTicks = Math.max(0, state.tick - (lot.dueTick ?? state.tick));
            emit({ type: "lot.completed", tick: state.tick, device: device.id, lot: id, family: lot.family, resource: amount.resource, cycleTicks, tardinessTicks });
          }
        } else if (disposition === "scrap") {
          mutateFactoryState(state, { kind: "lot.scrap-buffer", lotIds, device: device.id, buffer: amount.buffer, reason: "quality-rejection" });
          for (const id of lotIds) {
            const lot = state.lots[id]!;
            emit({ type: "lot.scrapped", tick: state.tick, device: device.id, lot: id, family: lot.family, resource: amount.resource, reason: "quality-rejection" });
          }
        } else mutateFactoryState(state, {
          kind: "lot.depart", lotIds, device: device.id, buffer: amount.buffer,
          nextStatus: "processing", nextLocation: { kind: "device", device: device.id },
        });
      } else {
      let remaining = amount.count;
      for (const [level, count] of materialLevels(device.id, amount.buffer, amount.resource).filter(([level]) => level >= (amount.minimumTreatmentLevel ?? 0))) {
        const consumed = Math.min(remaining, count);
        if (consumed > 0) mutateFactoryState(state, {
          kind: "buffer", device: device.id, buffer: amount.buffer, resource: amount.resource, delta: -consumed, treatmentLevel: level,
        });
        remaining -= consumed;
        if (remaining === 0) break;
      }
      if (remaining > 0) throw new Error(`Insufficient eligible material for ${device.id}/${amount.buffer}/${amount.resource}`);
      }
      if (disposition === "deliver") {
        mutateFactoryState(state, { kind: "consumed", resource: amount.resource, count: amount.count });
        mutateFactoryState(state, { kind: "orders", count: amount.count });
        const regional = stats.consumedByRegion[device.region] ??= {};
        regional[amount.resource] = (regional[amount.resource] ?? 0) + amount.count;
        emit({ type: "resource.consumed", tick: state.tick, device: device.id, resource: amount.resource, count: amount.count, ...(consumedLots[amountKey(amount)]?.length ? { lotIds: consumedLots[amountKey(amount)] } : {}) });
      }
    }
    return consumedLots;
  };
  const tryDecision = (
    device: CompiledDevice,
    decision: DeviceProgramDecision,
    selectedProcessPlan?: CompiledDevice["processPlans"][number],
  ): boolean => {
    const runtime = state.devices[device.id]!;
    if (decision.kind === "none") { setStatus(device.id, "idle"); return false; }
    if (decision.kind === "wait") {
      const status = decision.reason === "input" ? "waiting-input" : decision.reason === "output" ? "blocked-output" : "idle";
      if (status === "blocked-output" && runtime.status !== "blocked-output") emit({ type: "buffer.blocked", tick: state.tick, device: device.id });
      setStatus(device.id, status); return false;
    }
    if (decision.kind === "extract") {
      const plan = device.extractionPlan;
      const node = plan?.nodes.find((item) => item.id === decision.node);
      if (!plan || !node) throw new Error(`Device program '${device.asset}' tried to extract unbound resource node '${decision.node}'`);
      if (decision.count > plan.itemsPerCycle || decision.durationTicks !== plan.cycleTicks) throw new Error(`Device program '${device.asset}' cannot exceed its compiled extraction rate of ${plan.itemsPerCycle} items per ${plan.cycleTicks} ticks`);
      const resourceState = state.resourceNodes[node.id]!;
      if (resourceState.remaining < decision.count) { setStatus(device.id, "waiting-input"); return false; }
      const produce = [{ buffer: plan.outputBuffer, resource: node.resource, count: decision.count }];
      if (!outputFits(device, produce)) {
        if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
        return false;
      }
      const required = decision.powerMilliWatts ?? device.assetDef.power.activeMilliWatts;
      const grid = device.powerGrid ?? null;
      const availableDelta = grid ? availablePower(grid) - activePower(grid) : 0;
      if (!canStartPoweredWork(device, required)) {
        if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: runtime.idlePowered ? device.assetDef.power.idleMilliWatts + Math.max(0, availableDelta) : 0 });
        setStatus(device.id, "unpowered"); return false;
      }
      mutateFactoryState(state, { kind: "resource.reserve", node: node.id, count: decision.count });
      const job = {
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
        remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick, powerSatisfactionPpm: POWER_SATISFACTION_SCALE,
        powerMilliWatts: required, produce, extraction: { node: node.id, count: decision.count },
      };
      setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
      emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks });
      schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
      return true;
    }
    if (decision.kind === "generate") {
      const plan = device.generationPlan;
      const fuel = plan?.kind === "fuel" ? plan.fuels.find((item) => item.resource === decision.resource) : undefined;
      if (!plan || plan.kind !== "fuel" || !fuel) throw new Error(`Device program '${device.asset}' tried to burn unsupported fuel '${decision.resource}'`);
      if (decision.count !== 1 || decision.durationTicks !== fuel.durationTicks || decision.outputMilliWatts !== plan.outputMilliWatts) throw new Error(`Device program '${device.asset}' must use the compiled fuel generation plan`);
      const amount = { buffer: plan.fuelBuffer, resource: fuel.resource, count: 1 };
      if (!amountAvailable(device, amount)) { setStatus(device.id, "waiting-input"); return false; }
      applyConsume(device, [amount], "process");
      mutateFactoryState(state, { kind: "fuel", resource: fuel.resource, count: 1 });
      const job = {
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
        remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick, powerSatisfactionPpm: POWER_SATISFACTION_SCALE, powerMilliWatts: 0, produce: [],
        generationMilliWatts: plan.outputMilliWatts, fuel: { resource: fuel.resource, count: 1, energyMilliJoules: fuel.energyMilliJoules },
      };
      setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
      emit({ type: "power.fuel-loaded", tick: state.tick, device: device.id, grid: device.powerGrid!, resource: fuel.resource, count: 1, energyMilliJoules: fuel.energyMilliJoules, durationTicks: fuel.durationTicks });
      emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks });
      schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
      return true;
    }
    if (decision.kind === "treat") {
      const plan = device.treatmentPlan;
      if (!plan) throw new Error(`Device program '${device.asset}' tried to treat material without a compiled treatment plan`);
      if (decision.operation !== plan.mode.id || decision.durationTicks !== plan.mode.durationTicks || decision.count !== plan.mode.itemCount
        || decision.inputTreatmentLevel < 0 || decision.inputTreatmentLevel >= plan.mode.level) {
        throw new Error(`Device program '${device.asset}' must execute compiled treatment mode '${plan.mode.id}' exactly`);
      }
      if (!project.resources[decision.resource] || !accepts(device, plan.inputBuffer, decision.resource) || !accepts(device, plan.outputBuffer, decision.resource)) {
        throw new Error(`Treatment Device '${device.id}' cannot process Resource '${decision.resource}'`);
      }
      const availableMaterial = materialLevels(device.id, plan.inputBuffer, decision.resource)
        .find(([level]) => level === decision.inputTreatmentLevel)?.[1] ?? 0;
      const agent = { buffer: plan.agentBuffer, resource: plan.mode.agent.resource, count: plan.mode.agent.count };
      if (availableMaterial < decision.count || !amountAvailable(device, agent)) { setStatus(device.id, "waiting-input"); return false; }
      const produce = [{ buffer: plan.outputBuffer, resource: decision.resource, count: decision.count, treatmentLevel: plan.mode.level }];
      if (!outputFits(device, produce)) {
        if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
        return false;
      }
      const required = decision.powerMilliWatts ?? device.assetDef.power.activeMilliWatts;
      if (required !== device.assetDef.power.activeMilliWatts) throw new Error(`Treatment Device '${device.id}' must use its compiled active power`);
      const grid = device.powerGrid ?? null;
      const availablePowerForJob = grid ? availablePower(grid) - activePower(grid) : 0;
      if (!canStartPoweredWork(device, required)) {
        if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: runtime.idlePowered ? device.assetDef.power.idleMilliWatts + Math.max(0, availablePowerForJob) : 0 });
        setStatus(device.id, "unpowered"); return false;
      }
      const treatmentLotIds = isTracked(decision.resource)
        ? takeLotIds(device, plan.inputBuffer, decision.resource, decision.count, decision.inputTreatmentLevel) : [];
      if (treatmentLotIds.length) mutateFactoryState(state, {
        kind: "lot.depart", lotIds: treatmentLotIds, device: device.id, buffer: plan.inputBuffer,
        nextStatus: "processing", nextLocation: { kind: "device", device: device.id },
      });
      else mutateFactoryState(state, {
        kind: "buffer", device: device.id, buffer: plan.inputBuffer, resource: decision.resource,
        delta: -decision.count, treatmentLevel: decision.inputTreatmentLevel,
      });
      applyConsume(device, [agent], "process");
      mutateFactoryState(state, { kind: "treatment.agent", resource: agent.resource, count: agent.count });
      const job = {
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
        remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick, powerSatisfactionPpm: POWER_SATISFACTION_SCALE,
        powerMilliWatts: required, produce,
        treatment: {
          resource: decision.resource, fromLevel: decision.inputTreatmentLevel, toLevel: plan.mode.level, count: decision.count,
          agentResource: agent.resource, agentCount: agent.count,
        },
        ...(treatmentLotIds.length ? { lotTransfers: [{ lotIds: treatmentLotIds, output: produce[0]! }] } : {}),
      };
      setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
      emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks,
        ...(treatmentLotIds.length ? { lotIds: treatmentLotIds } : {}) });
      schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
      return true;
    }
    if (!allAmountsKnown(device, decision.consume)) throw new Error(`Device program '${device.asset}' referenced an unknown resource or buffer`);
    if (!decision.consume.every((amount) => amountAvailable(device, amount))) { setStatus(device.id, "waiting-input"); return false; }
    if (decision.kind === "consume") {
      applyConsume(device, decision.consume, device.assetDef.capabilities.includes("discard") ? "scrap" : "deliver");
      setStatus(device.id, "idle"); return true;
    }
    if (!allAmountsKnown(device, decision.produce)) throw new Error(`Device program '${device.asset}' referenced an unknown output resource or buffer`);
    if (selectedProcessPlan) {
      const plan = selectedProcessPlan;
      const required = decision.powerMilliWatts ?? device.assetDef.power.activeMilliWatts;
      if (decision.operation !== plan.definition.id || decision.durationTicks !== plan.durationTicks
        || !sameAmounts(decision.consume, plan.inputs) || !sameAmounts(decision.produce, plan.outputs) || required !== plan.powerMilliWatts) {
        throw new Error(`Device program '${device.asset}' must execute compiled process '${plan.definition.id}' mode '${plan.mode.id}' exactly`);
      }
    }
    const equipmentDrift = selectedProcessPlan && runtime.maintenance
      ? device.assetDef.production?.maintenance?.drift?.filter((stage) => runtime.maintenance!.jobsSinceMaintenance >= stage.afterJobs).at(-1)
      : undefined;
    const effectiveDurationTicks = equipmentDrift ? scaledCeil(decision.durationTicks, equipmentDrift.durationMultiplier) : decision.durationTicks;
    const nominalPowerMilliWatts = decision.powerMilliWatts ?? device.assetDef.power.activeMilliWatts;
    const required = equipmentDrift ? scaledCeil(nominalPowerMilliWatts, equipmentDrift.powerMultiplier) : nominalPowerMilliWatts;
    const inspectionExecution = selectedProcessPlan?.quality?.kind === "inspection"
      ? resolveInspectionExecution(device, selectedProcessPlan) : undefined;
    const lotOutputExecution = selectedProcessPlan ? resolveLotOutputExecution(device, selectedProcessPlan) : undefined;
    const capacityOutputs = inspectionExecution ? [inspectionExecution.output] : lotOutputExecution?.outputs ?? decision.produce;
    if (!outputFits(device, capacityOutputs)) {
      if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
      return false;
    }
    const grid = device.powerGrid ?? null;
    const available = grid ? availablePower(grid) - activePower(grid) : 0;
    if (!canStartPoweredWork(device, required)) {
      if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: runtime.idlePowered ? device.assetDef.power.idleMilliWatts + Math.max(0, available) : 0 });
      setStatus(device.id, "unpowered"); return false;
    }
    const toolingProvider = selectedProcessPlan?.tooling.length ? toolingProviderFor(device, selectedProcessPlan) : undefined;
    if (selectedProcessPlan?.tooling.length && !toolingProvider) {
      mutateFactoryState(state, { kind: "tooling.wait", device: device.id, process: selectedProcessPlan.definition.id, waiting: true });
      setStatus(device.id, "waiting-input");
      return false;
    }
    const utilityAllocations = selectedProcessPlan?.utilities.length ? utilityAllocationsFor(selectedProcessPlan) : [];
    if (selectedProcessPlan?.utilities.length && !utilityAllocations) {
      mutateFactoryState(state, { kind: "utility.wait", device: device.id, process: selectedProcessPlan.definition.id, waiting: true });
      setStatus(device.id, "waiting-input");
      return false;
    }
    if (toolingProvider && selectedProcessPlan) {
      mutateFactoryState(state, {
        kind: "tooling.allocate", device: device.id, provider: toolingProvider.device,
        inventoryBuffer: toolingProvider.inventoryBuffer, amounts: selectedProcessPlan.tooling,
      });
      emit({
        type: "device.tooling-acquired", tick: state.tick, device: device.id,
        process: selectedProcessPlan.definition.id, provider: toolingProvider.device,
        tooling: structuredClone(selectedProcessPlan.tooling),
      });
    }
    if (utilityAllocations?.length && selectedProcessPlan) {
      mutateFactoryState(state, { kind: "utility.allocate", device: device.id, allocations: utilityAllocations });
      emit({
        type: "device.utility-acquired", tick: state.tick, device: device.id,
        process: selectedProcessPlan.definition.id, allocations: structuredClone(utilityAllocations),
      });
    }
    const selectedLotInputs = selectedProcessPlan ? [
      ...selectedProcessPlan.lotTransfers.map((transfer) => transfer.input),
      ...selectedProcessPlan.lotTerminations.map((termination) => termination.input),
    ] : [];
    const routeStarts = selectedLotInputs.flatMap((input) =>
      rankedProcessLotIds(device, input.buffer, input.resource, selectedProcessPlan!.definition.id, input.minimumTreatmentLevel ?? 0)
        .slice(0, input.count).map((id) => routeQueueAssessment(id, selectedProcessPlan!.definition.id)!));
    for (const assessment of routeStarts) {
      mutateFactoryState(state, {
        kind: "lot.route-start", lotId: assessment.lotId, route: assessment.route, step: assessment.step,
        queueTicks: assessment.queueTicks, violated: assessment.violated,
      });
      if (assessment.violated) {
        const lot = state.lots[assessment.lotId]!;
        mutateFactoryState(state, {
          kind: "lot.quality-excursion", lotIds: [assessment.lotId],
          excursion: `queue-time:${assessment.route}:${assessment.step}:${lot.route.visits[assessment.step] ?? 1}`,
          defects: assessment.defects,
        });
        emit({
          type: "lot.queue-time-violation", tick: state.tick, device: device.id, lot: assessment.lotId,
          route: assessment.route, step: assessment.step, process: selectedProcessPlan!.definition.id,
          queueTicks: assessment.queueTicks, maximumTicks: assessment.maximumTicks!, defects: [...assessment.defects],
        });
      }
    }
    const lotQueueWaitAtStart = Object.fromEntries(selectedLotInputs.flatMap((input) =>
      rankedProcessLotIds(device, input.buffer, input.resource, selectedProcessPlan!.definition.id, input.minimumTreatmentLevel ?? 0)
        .slice(0, input.count)
        .map((id) => [id, state.lots[id]!.status === "queued" ? state.tick - state.lots[id]!.statusSinceTick : 0])));
    const consumedLots = applyConsume(device, decision.consume, "process", selectedProcessPlan?.definition.id);
    let lotTransfers = selectedProcessPlan?.lotTransfers.map((transfer) => ({
      lotIds: consumedLots[amountKey(transfer.input)] ?? [],
      output: { ...transfer.output },
    })).filter((transfer) => transfer.lotIds.length) ?? [];
    const lotTerminations = selectedProcessPlan?.lotTerminations.map((termination) => ({
      lotIds: consumedLots[amountKey(termination.input)] ?? [], terminal: termination.terminal,
    })).filter((termination) => termination.lotIds.length) ?? [];
    let actualProduce = structuredClone(decision.produce);
    let quality: ActiveDeviceJob["quality"];
    let lotOutput: ActiveDeviceJob["lotOutput"];
    const processQuality = selectedProcessPlan?.quality;
    if (processQuality?.kind === "inspection") {
      const lotIds = lotTransfers.flatMap((transfer) => transfer.lotIds);
      if (lotIds.length !== 1) throw new Error(`Inspection Process '${selectedProcessPlan!.definition.id}' must select exactly one lot`);
      if (!inspectionExecution || inspectionExecution.lotId !== lotIds[0]) throw new Error(`Inspection lot selection changed while starting '${selectedProcessPlan!.definition.id}'`);
      const { detectedDefects, result, output } = inspectionExecution;
      actualProduce = [{ ...output }];
      lotTransfers = [{ lotIds, output: { ...output } }];
      quality = { kind: "inspection", lotIds, detectedDefects, result };
    } else if (processQuality?.kind === "rework") {
      quality = {
        kind: "rework", lotIds: lotTransfers.flatMap((transfer) => transfer.lotIds),
        repairs: [...processQuality.repairs],
      };
    } else if (lotOutputExecution) {
      const lotIds = lotTerminations.flatMap((termination) => termination.lotIds);
      if (lotIds.length !== 1 || lotIds[0] !== lotOutputExecution.lotId) throw new Error(`Lot output selection changed while starting '${selectedProcessPlan!.definition.id}'`);
      actualProduce = structuredClone(lotOutputExecution.outputs);
      lotOutput = {
        lotId: lotOutputExecution.lotId, profile: lotOutputExecution.profile,
        defects: [...lotOutputExecution.defects], nominalOutputs: structuredClone(selectedProcessPlan!.outputs),
      };
    }
    const job = {
      operation: decision.operation, startedAt: state.tick, durationTicks: effectiveDurationTicks,
      remainingTicks: effectiveDurationTicks, workedTicks: 0, resumedAt: state.tick, powerSatisfactionPpm: POWER_SATISFACTION_SCALE,
      powerMilliWatts: required, produce: actualProduce,
      ...(toolingProvider && selectedProcessPlan ? { tooling: {
        provider: toolingProvider.device, amounts: structuredClone(selectedProcessPlan.tooling),
      } } : {}),
      ...(utilityAllocations?.length ? { utilities: structuredClone(utilityAllocations) } : {}),
      ...(lotTransfers.length ? { lotTransfers } : {}),
      ...(lotTerminations.length ? { lotTerminations } : {}),
      ...(lotOutput ? { lotOutput } : {}),
      ...(quality ? { quality } : {}),
      ...(selectedProcessPlan?.mode.preventsDefects.length ? { qualityControl: {
        mode: selectedProcessPlan.mode.id,
        preventsDefects: [...selectedProcessPlan.mode.preventsDefects],
      } } : {}),
      ...(selectedProcessPlan ? { productionMode: selectedProcessPlan.mode.id } : {}),
      ...(selectedProcessPlan && runtime.maintenance ? { production: true as const } : {}),
      ...(equipmentDrift ? { equipmentDrift: {
        afterJobs: equipmentDrift.afterJobs,
        jobsSinceMaintenance: runtime.maintenance!.jobsSinceMaintenance,
        durationMultiplier: { ...equipmentDrift.durationMultiplier },
        powerMultiplier: { ...equipmentDrift.powerMultiplier },
        defects: [...equipmentDrift.defects],
      } } : {}),
    };
    const jobLotIds = [...lotTransfers.flatMap((transfer) => transfer.lotIds), ...lotTerminations.flatMap((termination) => termination.lotIds)];
    if (selectedProcessPlan && jobLotIds.length) {
      const key = `${device.id}:${selectedProcessPlan.definition.id}:${selectedProcessPlan.mode.id}`;
      const operation = stats.lotProcessBatches[key] ??= {
        device: device.id, process: selectedProcessPlan.definition.id, mode: selectedProcessPlan.mode.id,
        expectedLotsPerJob: selectedLotInputs.reduce((sum, input) => sum + input.count, 0),
        jobs: 0, lots: 0, queueWaitTicks: 0, maximumLotsPerJob: 0,
      };
      operation.jobs += 1;
      operation.lots += jobLotIds.length;
      operation.queueWaitTicks += jobLotIds.reduce((sum, id) => sum + (lotQueueWaitAtStart[id] ?? 0), 0);
      operation.maximumLotsPerJob = Math.max(operation.maximumLotsPerJob, jobLotIds.length);
    }
    setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
    const routeDispatchLot = selectedProcessPlan && device.policy?.recipeDispatch === "least-slack" && jobLotIds.length
      ? [...jobLotIds].sort((left, right) => lotSlackTicks(left, selectedProcessPlan) - lotSlackTicks(right, selectedProcessPlan) || left.localeCompare(right))[0]
      : undefined;
    emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation,
      ...(selectedProcessPlan ? { mode: selectedProcessPlan.mode.id } : {}), durationTicks: effectiveDurationTicks,
      ...(jobLotIds.length ? { lotIds: jobLotIds } : {}),
      ...(routeDispatchLot && selectedProcessPlan ? { routeDispatch: {
        policy: "least-slack", lot: routeDispatchLot,
        remainingRouteTicks: remainingRouteTicks(routeDispatchLot, selectedProcessPlan),
        slackTicks: lotSlackTicks(routeDispatchLot, selectedProcessPlan),
      } } : {}) });
    schedule(state.tick + effectiveDurationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
    return true;
  };
  const toolingProviderFor = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]) => plan.toolingProviders.flatMap((candidate) => {
    const providerDevice = project.devices[candidate.device]!;
    const contract = providerDevice.assetDef.toolingProvider!;
    const runtime = state.devices[candidate.device]!.toolingProvider!;
    const inventory = state.devices[candidate.device]!.buffers[contract.inventoryBuffer]!;
    return plan.tooling.every((amount) => (inventory[amount.resource] ?? 0) - (runtime.reserved[amount.resource] ?? 0) >= amount.count)
      ? [{ ...candidate, inventoryBuffer: contract.inventoryBuffer }] : [];
  })[0];
  const utilityAllocationsFor = (plan: CompiledDevice["processPlans"][number]) => {
    const allocations: Array<{ provider: string; utility: string; units: number }> = [];
    for (const demand of plan.utilities) {
      const candidate = plan.utilityProviders[demand.utility]!.find((provider) => {
        const runtime = state.devices[provider.device]!.utilityProvider!;
        const providerState = state.devices[provider.device]!;
        const connected = providerState.status !== "failed"
          && (providerState.idlePowered || project.devices[provider.device]!.assetDef.power.idleMilliWatts === 0);
        return connected && (runtime.capacity[demand.utility] ?? 0) - (runtime.reserved[demand.utility] ?? 0) >= demand.units;
      });
      if (!candidate) return undefined;
      allocations.push({ provider: candidate.device, utility: demand.utility, units: demand.units });
    }
    return allocations;
  };
  const contractCommitted = (resource: string, region: string): number => {
    const delivered = stats.consumedByRegion[region]?.[resource] ?? 0;
    const buffered = Object.values(project.devices).filter((candidate) => candidate.region === region).reduce((sum, candidate) =>
      sum + Object.values(state.devices[candidate.id]!.buffers).reduce((bufferSum, inventory) => bufferSum + (inventory[resource] ?? 0), 0), 0);
    const inTransit = [...Object.values(state.transports).flat(), ...Object.values(state.logisticsTransports).flat()]
      .filter((transit) => transit.resource === resource && project.devices[transit.to]?.region === region)
      .reduce((sum, transit) => sum + transit.count, 0);
    const activeOutputs = Object.values(project.devices).filter((candidate) => candidate.region === region).reduce((sum, candidate) =>
      sum + (state.devices[candidate.id]!.activeJob?.produce ?? []).filter((amount) => amount.resource === resource)
        .reduce((outputSum, amount) => outputSum + amount.count, 0), 0);
    return delivered + buffered + inTransit + activeOutputs;
  };
  const contractContribution = (
    device: CompiledDevice,
    plan: CompiledDevice["processPlans"][number],
    executions = 1,
  ): number =>
    (project.objective.deliveryContracts ?? []).reduce((sum, contract) => {
      if (contract.region !== device.region) return sum;
      const output = (plan.outputs.find((amount) => amount.resource === contract.resource)?.count ?? 0) * executions;
      if (output <= 0) return sum;
      const demand = contract.demandPerMinute * project.scenario.durationTicks / 60_000;
      const remaining = Math.max(0, demand - contractCommitted(contract.resource, contract.region));
      return sum + output * contract.valuePerItem + Math.min(output, remaining) * contract.shortfallPenaltyPerItem;
    }, 0);
  const contractWindowContribution = (
    device: CompiledDevice,
    plan: CompiledDevice["processPlans"][number],
  ): { value: number; firstDeliveryTicks: number } => {
    const setup = state.devices[device.id]!.setup;
    const changeoverTicks = setup && plan.setupGroup && setup.group !== plan.setupGroup
      ? device.assetDef.production?.changeover?.transitions.find((transition) =>
        transition.from === setup.group && transition.to === plan.setupGroup)?.durationTicks ?? 0
      : 0;
    const firstDeliveryTicks = changeoverTicks + plan.durationTicks;
    const remainingTicks = Math.max(0, project.scenario.durationTicks - state.tick);
    const timeExecutions = Math.max(0, Math.floor((remainingTicks - changeoverTicks) / plan.durationTicks));
    return { value: contractContribution(device, plan, timeExecutions), firstDeliveryTicks };
  };
  const isContractDispatchDevice = (device: CompiledDevice): boolean => device.policy?.recipeDispatch === "contract-value"
    && device.processPlans.some((plan) => plan.outputs.some((output) => (project.objective.deliveryContracts ?? [])
      .some((contract) => contract.resource === output.resource && contract.region === device.region)));
  const processPlanMaterialReady = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]): boolean =>
    plan.inputs.every((amount) => amountAvailable(device, amount) && (!isTracked(amount.resource)
      || rankedProcessLotIds(device, amount.buffer, amount.resource, plan.definition.id, amount.minimumTreatmentLevel ?? 0).length >= amount.count))
      && (!isContractDispatchDevice(device) || contractContribution(device, plan) > 0)
      && outputFits(device, plan.quality?.kind === "inspection"
        ? [resolveInspectionExecution(device, plan)?.output ?? plan.quality.passOutput]
        : resolveLotOutputExecution(device, plan)?.outputs ?? plan.outputs);
  const processPlanReady = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]): boolean =>
    processPlanMaterialReady(device, plan)
      && (!plan.tooling.length || Boolean(toolingProviderFor(device, plan)))
      && (!plan.utilities.length || Boolean(utilityAllocationsFor(plan)));
  const rankProcessPlans = (
    device: CompiledDevice,
    candidates: CompiledDevice["processPlans"] = device.processPlans,
  ): Array<{ plan: CompiledDevice["processPlans"][number]; index: number }> => {
    const ranked = candidates.map((plan) => ({ plan, index: device.processPlans.indexOf(plan) }));
    const cadence = device.policy?.cadenceControl;
    if (cadence) {
      const connection = project.connections[cadence.downstreamConnection]!;
      const output = device.processPlans.find((plan) =>
        plan.definition.id === cadence.process && plan.mode.id === cadence.normalMode)!.outputs[0]!;
      const coverage = materialQuantity(connection.toDevice.id, connection.toPort.buffer, output.resource, output.treatmentLevel ?? 0)
        + incomingQuantity(connection.toDevice.id, connection.toPort.buffer, output.resource, output.treatmentLevel ?? 0);
      const starved = coverage < cadence.recoverBelowItems;
      mutateFactoryState(state, { kind: "cadence.coverage", device: device.id, starved });
      const runtimeCadence = state.devices[device.id]!.cadenceControl!;
      const starvationTicks = runtimeCadence.starvedSinceTick === null ? 0 : state.tick - runtimeCadence.starvedSinceTick;
      const preferredMode = starved && starvationTicks >= cadence.minimumStarvationTicks
        ? cadence.recoveryMode : cadence.normalMode;
      ranked.sort((left, right) => Number(right.plan.definition.id === cadence.process && right.plan.mode.id === preferredMode)
        - Number(left.plan.definition.id === cadence.process && left.plan.mode.id === preferredMode)
        || left.index - right.index);
      return ranked;
    }
    const policy = device.policy?.recipeDispatch ?? "authored-order";
    if (policy === "shortest-cycle") ranked.sort((left, right) => left.plan.durationTicks - right.plan.durationTicks || left.index - right.index);
    else if (policy === "highest-priority") ranked.sort((left, right) => right.plan.priority - left.plan.priority || left.index - right.index);
    else if (policy === "minimize-changeover") {
      const currentGroup = state.devices[device.id]!.setup?.group;
      ranked.sort((left, right) => Number(right.plan.setupGroup === currentGroup) - Number(left.plan.setupGroup === currentGroup) || left.index - right.index);
    }
    else if (policy === "contract-value") ranked.sort((left, right) => {
      const leftWindow = contractWindowContribution(device, left.plan);
      const rightWindow = contractWindowContribution(device, right.plan);
      const leftRate = contractContribution(device, left.plan) / left.plan.durationTicks;
      const rightRate = contractContribution(device, right.plan) / right.plan.durationTicks;
      return rightWindow.value - leftWindow.value
        || leftWindow.firstDeliveryTicks - rightWindow.firstDeliveryTicks
        || rightRate - leftRate
        || right.plan.priority - left.plan.priority
        || left.index - right.index;
    });
    else if (policy === "oldest-lot" || policy === "earliest-due-date" || policy === "least-slack" || policy === "highest-lot-priority") {
      const candidateLot = (plan: CompiledDevice["processPlans"][number]) => {
        const lots = plan.inputs.filter((amount) => isTracked(amount.resource))
          .flatMap((amount) => rankedLotIds(device, amount.buffer, amount.resource)
            .filter((id) => state.lots[id]!.treatmentLevel >= (amount.minimumTreatmentLevel ?? 0))).map((id) => state.lots[id]!);
        lots.sort((left, right) => policy === "oldest-lot"
          ? left.releasedAtTick! - right.releasedAtTick! || left.id.localeCompare(right.id)
          : policy === "earliest-due-date"
            ? (left.dueTick ?? Number.MAX_SAFE_INTEGER) - (right.dueTick ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)
            : policy === "least-slack"
              ? lotSlackTicks(left.id, plan) - lotSlackTicks(right.id, plan) || left.id.localeCompare(right.id)
            : right.priority - left.priority || left.id.localeCompare(right.id));
        return lots[0];
      };
      ranked.sort((left, right) => {
        const leftLot = candidateLot(left.plan); const rightLot = candidateLot(right.plan);
        if (!leftLot || !rightLot) return Number(Boolean(rightLot)) - Number(Boolean(leftLot)) || left.index - right.index;
        if (policy === "oldest-lot") return leftLot.releasedAtTick! - rightLot.releasedAtTick! || left.index - right.index;
        if (policy === "earliest-due-date") return (leftLot.dueTick ?? Number.MAX_SAFE_INTEGER) - (rightLot.dueTick ?? Number.MAX_SAFE_INTEGER) || left.index - right.index;
        if (policy === "least-slack") return lotSlackTicks(leftLot.id, left.plan) - lotSlackTicks(rightLot.id, right.plan) || left.index - right.index;
        return rightLot.priority - leftLot.priority || left.index - right.index;
      });
    }
    return ranked;
  };
  const selectProcessPlan = (
    device: CompiledDevice,
    candidates: CompiledDevice["processPlans"] = device.processPlans,
    fallback = true,
  ): CompiledDevice["processPlans"][number] | undefined => {
    const ranked = rankProcessPlans(device, candidates);
    const ready = ranked.find(({ plan }) => processPlanReady(device, plan));
    return (ready ?? (fallback ? ranked[0] : undefined))?.plan;
  };
  const readyLotsForSetupGroup = (device: CompiledDevice, setupGroup: string): number => {
    const ids = new Set<string>();
    for (const plan of device.processPlans.filter((candidate) => candidate.setupGroup === setupGroup)) {
      for (const transfer of plan.lotTransfers) {
        for (const id of rankedLotIds(device, transfer.input.buffer, transfer.input.resource)) {
          if (state.lots[id]!.treatmentLevel >= (transfer.input.minimumTreatmentLevel ?? 0)) ids.add(id);
        }
      }
    }
    return ids.size;
  };
  const compatibleBatchFallbacks = (
    device: CompiledDevice,
    preferred: CompiledDevice["processPlans"][number],
  ): CompiledDevice["processPlans"] => device.processPlans.filter((candidate) => candidate !== preferred
    && candidate.lotTransfers.length === preferred.lotTransfers.length
    && preferred.lotTransfers.every((preferredTransfer) => candidate.lotTransfers.some((candidateTransfer) =>
      candidateTransfer.family === preferredTransfer.family
      && candidateTransfer.input.resource === preferredTransfer.input.resource
      && candidateTransfer.output.resource === preferredTransfer.output.resource
      && candidateTransfer.input.count < preferredTransfer.input.count)));
  const readyTrackedLotsForPlan = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]): number => {
    const ids = new Set<string>();
    for (const transfer of plan.lotTransfers) for (const id of rankedLotIds(device, transfer.input.buffer, transfer.input.resource)) {
      if (state.lots[id]!.treatmentLevel >= (transfer.input.minimumTreatmentLevel ?? 0)) ids.add(id);
    }
    return ids.size;
  };
  const selectBatchFormationProcessPlan = (device: CompiledDevice): {
    plan?: CompiledDevice["processPlans"][number]; held: boolean; changed: boolean;
  } => {
    const policy = device.policy?.batchFormation;
    const formation = state.devices[device.id]!.batchFormation;
    if (!policy || !formation) return { plan: selectProcessPlan(device), held: false, changed: false };
    const preferred = device.processPlans.find((plan) => plan.definition.id === policy.preferredProcess)!;
    const fallbacks = compatibleBatchFallbacks(device, preferred);
    const preferredReady = processPlanReady(device, preferred);
    const fallback = selectProcessPlan(device, fallbacks, false);
    const readyLots = readyTrackedLotsForPlan(device, preferred);
    const preferredLots = Math.max(...preferred.lotTransfers.map((transfer) => transfer.input.count));
    if (preferredReady) {
      let changed = false;
      if (formation.hold) {
        emit({
          type: "device.batch-released", tick: state.tick, device: device.id, preferredProcess: preferred.definition.id,
          readyLots, heldTicks: state.tick - formation.hold.sinceTick, cause: "preferred-ready",
        });
        mutateFactoryState(state, { kind: "batch.release", device: device.id, cause: "preferred-ready" });
        changed = true;
      } else if (formation.draining) {
        mutateFactoryState(state, { kind: "batch.reset", device: device.id });
        changed = true;
      }
      return { plan: preferred, held: false, changed };
    }
    if (formation.hold) {
      if (state.tick < formation.hold.deadlineTick) return { held: true, changed: false };
      emit({
        type: "device.batch-released", tick: state.tick, device: device.id, preferredProcess: preferred.definition.id,
        readyLots, heldTicks: state.tick - formation.hold.sinceTick, cause: "maximum-wait",
      });
      mutateFactoryState(state, { kind: "batch.release", device: device.id, cause: "maximum-wait" });
      return { plan: fallback, held: false, changed: true };
    }
    if (formation.draining) {
      if (fallback) return { plan: fallback, held: false, changed: false };
      if (fallbacks.some((plan) => readyTrackedLotsForPlan(device, plan) > 0)) {
        return { plan: selectProcessPlan(device, fallbacks), held: false, changed: false };
      }
      mutateFactoryState(state, { kind: "batch.reset", device: device.id });
      return { plan: selectProcessPlan(device), held: false, changed: true };
    }
    if (!fallback || policy.maximumWaitTicks === 0) return { plan: fallback ?? selectProcessPlan(device), held: false, changed: false };
    const deadlineTick = state.tick + policy.maximumWaitTicks;
    mutateFactoryState(state, { kind: "batch.hold", device: device.id, preferredProcess: preferred.definition.id, deadlineTick });
    emit({
      type: "device.batch-held", tick: state.tick, device: device.id, preferredProcess: preferred.definition.id,
      readyLots, preferredLots, deadlineTick,
    });
    schedule(deadlineTick, 3, { kind: "batch-timeout", device: device.id, preferredProcess: preferred.definition.id, deadlineTick });
    return { held: true, changed: true };
  };
  const selectCampaignProcessPlan = (device: CompiledDevice): {
    plan?: CompiledDevice["processPlans"][number];
    held: boolean;
    changed: boolean;
  } => {
    if (device.policy?.batchFormation) return selectBatchFormationProcessPlan(device);
    const policy = device.policy?.setupCampaign;
    const setup = state.devices[device.id]!.setup;
    if (!policy || !setup || setup.group === null) return { plan: selectProcessPlan(device), held: false, changed: false };
    const readyPlans = device.processPlans.filter((plan) => processPlanReady(device, plan));
    const currentPlans = readyPlans.filter((plan) => plan.setupGroup === setup.group);
    const currentPlan = selectProcessPlan(device, currentPlans, false);
    if (setup.campaign) {
      const hold = setup.campaign;
      const targetPlans = readyPlans.filter((plan) => plan.setupGroup === hold.targetGroup);
      const targetPlan = selectProcessPlan(device, targetPlans, false);
      if (targetPlan) {
        const readyLots = readyLotsForSetupGroup(device, hold.targetGroup);
        const cause = readyLots >= policy.minimumReadyLots ? "minimum-ready-lots"
          : state.tick >= hold.deadlineTick ? "maximum-hold" : null;
        if (cause) {
          emit({
            type: "device.campaign-released", tick: state.tick, device: device.id, from: setup.group, to: hold.targetGroup,
            readyLots, heldTicks: state.tick - hold.sinceTick, cause,
          });
          mutateFactoryState(state, { kind: "campaign.release", device: device.id, cause });
          return { plan: targetPlan, held: false, changed: true };
        }
      }
      if (currentPlan) return { plan: currentPlan, held: false, changed: false };
      return { held: true, changed: false };
    }
    if (currentPlan) return { plan: currentPlan, held: false, changed: false };
    const selected = selectProcessPlan(device);
    if (!selected || !processPlanReady(device, selected) || !selected.setupGroup || selected.setupGroup === setup.group) {
      return { plan: selected, held: false, changed: false };
    }
    const readyLots = readyLotsForSetupGroup(device, selected.setupGroup);
    if (readyLots >= policy.minimumReadyLots || policy.maximumHoldTicks === 0) {
      return { plan: selected, held: false, changed: false };
    }
    const deadlineTick = state.tick + policy.maximumHoldTicks;
    mutateFactoryState(state, { kind: "campaign.hold", device: device.id, targetGroup: selected.setupGroup, deadlineTick });
    emit({
      type: "device.campaign-held", tick: state.tick, device: device.id, from: setup.group, to: selected.setupGroup,
      readyLots, minimumReadyLots: policy.minimumReadyLots, deadlineTick,
    });
    schedule(deadlineTick, 3, { kind: "campaign-timeout", device: device.id, targetGroup: selected.setupGroup, deadlineTick });
    return { held: true, changed: true };
  };
  const changeoverTransition = (device: CompiledDevice, from: string | null, to: string) =>
    device.assetDef.production?.changeover?.transitions.find((transition) => transition.from === from && transition.to === to);
  const requiresChangeover = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]): boolean => {
    const setup = state.devices[device.id]!.setup;
    return Boolean(setup && plan.setupGroup && setup.group !== plan.setupGroup
      && changeoverTransition(device, setup.group, plan.setupGroup) && processPlanReady(device, plan));
  };
  const tryStartChangeover = (device: CompiledDevice, plan: CompiledDevice["processPlans"][number]): boolean => {
    const runtime = state.devices[device.id]!;
    const setup = runtime.setup;
    if (!setup || !plan.setupGroup) return false;
    const transition = changeoverTransition(device, setup.group, plan.setupGroup);
    if (!transition) return false;
    const required = transition.powerMilliWatts;
    const grid = device.powerGrid ?? null;
    const available = grid ? availablePower(grid) - activePower(grid) : 0;
    if (!canStartPoweredWork(device, required)) {
      if (runtime.status !== "unpowered") emit({
        type: "power.shortage", tick: state.tick, device: device.id, grid,
        requiredMilliWatts: required,
        availableMilliWatts: runtime.idlePowered ? device.assetDef.power.idleMilliWatts + Math.max(0, available) : 0,
      });
      setStatus(device.id, "unpowered");
      return false;
    }
    const changeover = { from: setup.group, to: plan.setupGroup };
    const job = {
      operation: `changeover:${setup.group ?? "unconfigured"}->${plan.setupGroup}`,
      startedAt: state.tick,
      durationTicks: transition.durationTicks,
      remainingTicks: transition.durationTicks,
      workedTicks: 0,
      resumedAt: state.tick,
      powerSatisfactionPpm: POWER_SATISFACTION_SCALE,
      powerMilliWatts: required,
      produce: [],
      changeover,
    };
    setStatus(device.id, "processing");
    mutateFactoryState(state, { kind: "job.start", device: device.id, job });
    emit({
      type: "device.changeover-start", tick: state.tick, device: device.id, ...changeover,
      durationTicks: transition.durationTicks, powerMilliWatts: transition.powerMilliWatts,
    });
    schedule(state.tick + transition.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
    return true;
  };
  type MaintenanceDecision = { cause: MaintenanceCause; trigger: MaintenanceTrigger };
  const maintenanceDecision = (device: CompiledDevice, allowOpportunistic: boolean): MaintenanceDecision | null => {
    const contract = device.assetDef.production?.maintenance;
    const runtime = state.devices[device.id]!.maintenance;
    if (!contract || !runtime) return null;
    const policy = device.policy?.preventiveMaintenance;
    const qualificationAgeTicks = state.tick - runtime.qualifiedAtTick;
    const assetLimitTrigger = runtime.jobsSinceMaintenance >= contract.maximumJobs
      ? "usage" as const
      : qualificationAgeTicks >= contract.maximumQualificationTicks ? "calendar" as const : null;
    if (assetLimitTrigger) return { cause: "asset-limit", trigger: assetLimitTrigger };
    const plannedTrigger = policy?.planned?.afterJobs !== undefined && runtime.jobsSinceMaintenance >= policy.planned.afterJobs
      ? "usage" as const
      : policy?.planned?.afterQualificationTicks !== undefined && qualificationAgeTicks >= policy.planned.afterQualificationTicks
        ? "calendar" as const : null;
    if (plannedTrigger) return { cause: "planned-boundary", trigger: plannedTrigger };
    if (!allowOpportunistic || !policy?.opportunistic) return null;
    if (policy.opportunistic.afterJobs !== undefined && runtime.jobsSinceMaintenance >= policy.opportunistic.afterJobs) {
      return { cause: "opportunistic", trigger: "usage" };
    }
    if (policy.opportunistic.afterQualificationTicks !== undefined && qualificationAgeTicks >= policy.opportunistic.afterQualificationTicks) {
      return { cause: "opportunistic", trigger: "calendar" };
    }
    return null;
  };
  const tryStartMaintenancePhase = (
    device: CompiledDevice,
    cause: MaintenanceCause,
    trigger: MaintenanceTrigger,
    phase: "service" | "qualification",
    jobsSinceMaintenance: number,
    qualificationAgeTicks: Tick,
  ): boolean => {
    const runtime = state.devices[device.id]!;
    const maintenance = runtime.maintenance;
    const contract = device.assetDef.production?.maintenance;
    if (!maintenance || !contract) return false;
    const phaseContract = phase === "service"
      ? { durationTicks: contract.durationTicks, powerMilliWatts: contract.powerMilliWatts, service: contract.service }
      : contract.qualification;
    const service = phaseContract.service;
    const candidates = (phase === "service" ? device.maintenanceProviders : device.qualificationProviders).map((candidate) => {
      const providerDevice = project.devices[candidate.device]!;
      const providerContract = providerDevice.assetDef.maintenanceProvider!;
      const providerRuntime = state.devices[candidate.device]!.maintenanceProvider!;
      const inventory = state.devices[candidate.device]!.buffers[providerContract.inventoryBuffer]!;
      return { ...candidate, providerDevice, providerContract, providerRuntime, inventory };
    });
    const stocked = candidates.filter((candidate) => service.inputs.every((input) => (candidate.inventory[input.resource] ?? 0) >= input.count));
    const provider = stocked.find((candidate) => candidate.providerRuntime.crews - candidate.providerRuntime.crewsInUse >= service.crews);
    if (!provider) {
      const reason = stocked.length ? "crew" as const : "consumable" as const;
      const changed = maintenance.wait?.reason !== reason || maintenance.wait?.phase !== phase;
      mutateFactoryState(state, { kind: "maintenance.wait", device: device.id, phase, reason });
      setStatus(device.id, "waiting-input");
      if (changed) emit({
        type: "device.maintenance-blocked", tick: state.tick, device: device.id, phase, cause, trigger,
        qualificationAgeTicks, reason,
        skill: service.skill, crews: service.crews, inputs: structuredClone(service.inputs),
      });
      return false;
    }
    mutateFactoryState(state, { kind: "maintenance.wait", device: device.id, phase, reason: null });
    const required = phaseContract.powerMilliWatts;
    const grid = device.powerGrid ?? null;
    const available = grid ? availablePower(grid) - activePower(grid) : 0;
    if (!canStartPoweredWork(device, required)) {
      if (runtime.status !== "unpowered") emit({
        type: "power.shortage", tick: state.tick, device: device.id, grid,
        requiredMilliWatts: required,
        availableMilliWatts: runtime.idlePowered ? device.assetDef.power.idleMilliWatts + Math.max(0, available) : 0,
      });
      setStatus(device.id, "unpowered");
      return false;
    }
    mutateFactoryState(state, {
      kind: "maintenance.service-start", device: device.id, phase, provider: provider.device,
      inventoryBuffer: provider.providerContract.inventoryBuffer, crews: service.crews, inputs: service.inputs,
    });
    const job = {
      operation: phase === "service" ? "equipment-maintenance" : "equipment-qualification",
      startedAt: state.tick,
      durationTicks: phaseContract.durationTicks,
      remainingTicks: phaseContract.durationTicks,
      workedTicks: 0,
      resumedAt: state.tick,
      powerSatisfactionPpm: POWER_SATISFACTION_SCALE,
      powerMilliWatts: required,
      produce: [],
      maintenance: {
        phase, cause, trigger, qualificationAgeTicks,
        provider: provider.device, skill: service.skill, crews: service.crews,
        inputs: structuredClone(service.inputs),
      },
    };
    setStatus(device.id, "processing");
    mutateFactoryState(state, { kind: "job.start", device: device.id, job });
    if (phase === "service") emit({
      type: "device.maintenance-start", tick: state.tick, device: device.id, cause,
      trigger, jobsSinceMaintenance, qualificationAgeTicks, durationTicks: phaseContract.durationTicks,
      provider: provider.device, skill: service.skill, crews: service.crews, inputs: structuredClone(service.inputs),
    }); else emit({
      type: "device.qualification-start", tick: state.tick, device: device.id, cause,
      trigger, jobsSinceMaintenance, qualificationAgeTicks, durationTicks: phaseContract.durationTicks,
      provider: provider.device, skill: service.skill, crews: service.crews, inputs: structuredClone(service.inputs),
    });
    schedule(state.tick + phaseContract.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
    return true;
  };
  const tryStartMaintenance = (device: CompiledDevice, decision: MaintenanceDecision): boolean => {
    const maintenance = state.devices[device.id]!.maintenance!;
    return tryStartMaintenancePhase(
      device, decision.cause, decision.trigger, "service", maintenance.jobsSinceMaintenance,
      state.tick - maintenance.qualifiedAtTick,
    );
  };
  const tryStartQualification = (device: CompiledDevice): boolean => {
    const pending = state.devices[device.id]!.maintenance?.qualificationPending;
    return pending ? tryStartMaintenancePhase(
      device, pending.cause, pending.trigger, "qualification", pending.jobsSinceMaintenance, pending.qualificationAgeTicks,
    ) : false;
  };
  const scheduleSleepBoundary = (device: CompiledDevice): void => {
    const idleSinceTick = state.devices[device.id]!.energyManagement?.idleSinceTick;
    const sleepAfterTicks = device.policy?.idleEnergy?.sleepAfterTicks;
    if (idleSinceTick === undefined || sleepAfterTicks === undefined) return;
    schedule(Math.max(state.tick, idleSinceTick + sleepAfterTicks), 3, {
      kind: "sleep-boundary", device: device.id, idleSinceTick,
    });
  };
  const scheduleMaintenanceCalendarBoundaries = (device: CompiledDevice, qualifiedAtTick: Tick): void => {
    const policy = device.policy?.preventiveMaintenance;
    const boundaries = [
      policy?.opportunistic?.afterQualificationTicks,
      policy?.planned?.afterQualificationTicks,
    ].filter((ticks): ticks is number => ticks !== undefined);
    for (const ticks of [...new Set(boundaries)].sort((left, right) => left - right)) {
      schedule(Math.max(state.tick, qualifiedAtTick + ticks), 3, {
        kind: "maintenance-boundary", device: device.id, qualifiedAtTick,
      });
    }
  };
  const markDeviceIdle = (device: CompiledDevice): void => {
    mutateFactoryState(state, { kind: "energy.idle", device: device.id, tick: state.tick });
    setStatus(device.id, "idle");
    scheduleSleepBoundary(device);
  };
  const tryStartWake = (device: CompiledDevice): boolean => {
    const runtime = state.devices[device.id]!;
    const sleep = device.assetDef.power.sleep;
    if (!sleep || runtime.energyManagement?.mode !== "sleeping") return false;
    const grid = device.powerGrid ?? null;
    const available = grid ? availablePower(grid) - activePower(grid) : 0;
    if (!canStartPoweredWork(device, sleep.wakePowerMilliWatts)) {
      if (runtime.status !== "unpowered") emit({
        type: "power.shortage", tick: state.tick, device: device.id, grid,
        requiredMilliWatts: sleep.wakePowerMilliWatts,
        availableMilliWatts: runtime.idlePowered ? standbyRequirement(device) + Math.max(0, available) : 0,
      });
      setStatus(device.id, "unpowered");
      return false;
    }
    const job: ActiveDeviceJob = {
      operation: "wake-from-sleep", startedAt: state.tick, durationTicks: sleep.wakeDurationTicks,
      remainingTicks: sleep.wakeDurationTicks, workedTicks: 0, resumedAt: state.tick,
      powerSatisfactionPpm: POWER_SATISFACTION_SCALE, powerMilliWatts: sleep.wakePowerMilliWatts,
      produce: [], wake: true,
    };
    setStatus(device.id, "processing");
    mutateFactoryState(state, { kind: "job.start", device: device.id, job });
    emit({
      type: "device.wake-start", tick: state.tick, device: device.id,
      durationTicks: sleep.wakeDurationTicks, powerMilliWatts: sleep.wakePowerMilliWatts,
    });
    schedule(state.tick + sleep.wakeDurationTicks, 20, {
      kind: "complete", device: device.id, generation: generations[device.id]!,
    });
    return true;
  };
  const tryEvaluate = (device: CompiledDevice): boolean => {
    const runtime = state.devices[device.id]!;
    if (runtime.status === "failed" || runtime.activeJob || device.transportEndpoint || device.assetDef.capabilities.includes("station") || device.assetDef.maintenanceProvider || device.assetDef.utilityProvider
      || (!runtime.idlePowered && standbyRequirement(device) > 0)) return false;
    if (runtime.maintenance?.qualificationPending) return runtime.energyManagement?.mode === "sleeping"
      ? tryStartWake(device) : tryStartQualification(device);
    const campaignSelection = selectCampaignProcessPlan(device);
    const selectedProcessPlan = campaignSelection.plan;
    const toolingBlockedPlan = selectedProcessPlan?.tooling.length
      && processPlanMaterialReady(device, selectedProcessPlan) && !toolingProviderFor(device, selectedProcessPlan)
      ? selectedProcessPlan
      : selectedProcessPlan ? undefined : device.processPlans.find((plan) =>
        plan.tooling.length > 0 && processPlanMaterialReady(device, plan) && !toolingProviderFor(device, plan));
    const previousToolingWait = runtime.productionTooling?.wait;
    const utilityBlockedPlan = selectedProcessPlan?.utilities.length
      && processPlanMaterialReady(device, selectedProcessPlan) && !utilityAllocationsFor(selectedProcessPlan)
      ? selectedProcessPlan
      : selectedProcessPlan ? undefined : device.processPlans.find((plan) =>
        plan.utilities.length > 0 && processPlanMaterialReady(device, plan) && !utilityAllocationsFor(plan));
    const previousUtilityWait = runtime.productionUtilities?.wait;
    const productionReady = Boolean(selectedProcessPlan && processPlanReady(device, selectedProcessPlan));
    const blockingMaintenance = maintenanceDecision(device, false);
    const plannedStopDue = blockingMaintenance?.cause === "planned-boundary";
    if (runtime.energyManagement?.mode === "sleeping") {
      if (productionReady || plannedStopDue) return tryStartWake(device);
      const previousStatus = runtime.status;
      setStatus(device.id, "sleeping");
      return previousStatus !== runtime.status;
    }
    if (blockingMaintenance && (productionReady || plannedStopDue)) return tryStartMaintenance(device, blockingMaintenance);
    const opportunisticMaintenance = maintenanceDecision(device,
      campaignSelection.held || !productionReady);
    if (opportunisticMaintenance?.cause === "opportunistic") {
      if (previousToolingWait) mutateFactoryState(state, {
        kind: "tooling.wait", device: device.id, process: previousToolingWait.process, waiting: false,
      });
      if (previousUtilityWait) mutateFactoryState(state, {
        kind: "utility.wait", device: device.id, process: previousUtilityWait.process, waiting: false,
      });
      return tryStartMaintenance(device, opportunisticMaintenance);
    }
    if (toolingBlockedPlan) {
      if (previousUtilityWait) mutateFactoryState(state, {
        kind: "utility.wait", device: device.id, process: previousUtilityWait.process, waiting: false,
      });
      mutateFactoryState(state, { kind: "tooling.wait", device: device.id, process: toolingBlockedPlan.definition.id, waiting: true });
      setStatus(device.id, "waiting-input");
      if (!previousToolingWait) emit({
        type: "device.tooling-blocked", tick: state.tick, device: device.id,
        process: toolingBlockedPlan.definition.id, tooling: structuredClone(toolingBlockedPlan.tooling),
      });
      return !previousToolingWait || previousToolingWait.process !== toolingBlockedPlan.definition.id;
    }
    if (previousToolingWait) mutateFactoryState(state, {
      kind: "tooling.wait", device: device.id, process: previousToolingWait.process, waiting: false,
    });
    if (utilityBlockedPlan) {
      mutateFactoryState(state, { kind: "utility.wait", device: device.id, process: utilityBlockedPlan.definition.id, waiting: true });
      setStatus(device.id, "waiting-input");
      if (!previousUtilityWait || previousUtilityWait.process !== utilityBlockedPlan.definition.id) emit({
        type: "device.utility-blocked", tick: state.tick, device: device.id,
        process: utilityBlockedPlan.definition.id, utilities: structuredClone(utilityBlockedPlan.utilities),
      });
      return !previousUtilityWait || previousUtilityWait.process !== utilityBlockedPlan.definition.id;
    }
    if (previousUtilityWait) mutateFactoryState(state, {
      kind: "utility.wait", device: device.id, process: previousUtilityWait.process, waiting: false,
    });
    if (runtime.maintenance?.wait) mutateFactoryState(state, {
      kind: "maintenance.wait", device: device.id, phase: runtime.maintenance.wait.phase, reason: null,
    });
    if (campaignSelection.held) {
      const previousStatus = runtime.status;
      setStatus(device.id, "waiting-input");
      return campaignSelection.changed || previousStatus !== runtime.status;
    }
    if (selectedProcessPlan && requiresChangeover(device, selectedProcessPlan)) return tryStartChangeover(device, selectedProcessPlan);
    const decision = evaluateDeviceProgram(device.asset, device.assetDef.program, {
      apiVersion: 1, tick: state.tick,
      device: { id: device.id, asset: device.asset, config: device.config ?? {} },
      buffers: runtime.buffers,
      materialBatches: runtime.materialBatches,
      ...(selectedProcessPlan ? { process: {
        id: selectedProcessPlan.definition.id,
        name: selectedProcessPlan.definition.name,
        category: selectedProcessPlan.definition.category,
        durationTicks: selectedProcessPlan.durationTicks,
        mode: {
          id: selectedProcessPlan.mode.id,
          name: selectedProcessPlan.mode.name,
          inputCycles: selectedProcessPlan.mode.inputCycles,
          outputCycles: selectedProcessPlan.mode.outputCycles,
          preventsDefects: [...selectedProcessPlan.mode.preventsDefects],
        },
        powerMilliWatts: selectedProcessPlan.powerMilliWatts,
        inputs: selectedProcessPlan.inputs,
        tooling: selectedProcessPlan.tooling,
        toolingProviders: selectedProcessPlan.toolingProviders,
        utilities: selectedProcessPlan.utilities,
        utilityProviders: selectedProcessPlan.utilityProviders,
        outputs: selectedProcessPlan.outputs,
      } } : {}),
      ...(device.treatmentPlan ? { treatment: {
        id: device.treatmentPlan.mode.id,
        name: device.treatmentPlan.mode.name,
        level: device.treatmentPlan.mode.level,
        durationTicks: device.treatmentPlan.mode.durationTicks,
        itemCount: device.treatmentPlan.mode.itemCount,
        inputBuffer: device.treatmentPlan.inputBuffer,
        outputBuffer: device.treatmentPlan.outputBuffer,
        agent: {
          buffer: device.treatmentPlan.agentBuffer,
          resource: device.treatmentPlan.mode.agent.resource,
          count: device.treatmentPlan.mode.agent.count,
        },
      } } : {}),
      ...(device.extractionPlan ? { extraction: {
        outputBuffer: device.extractionPlan.outputBuffer,
        cycleTicks: device.extractionPlan.cycleTicks,
        itemsPerCycle: device.extractionPlan.itemsPerCycle,
        nodes: device.extractionPlan.nodes.map((node) => ({ id: node.id, resource: node.resource, remaining: state.resourceNodes[node.id]!.remaining })),
      } } : {}),
      ...(device.generationPlan?.kind === "fuel" ? { generation: {
        kind: "fuel" as const,
        outputMilliWatts: device.generationPlan.outputMilliWatts,
        fuelBuffer: device.generationPlan.fuelBuffer,
        fuels: device.generationPlan.fuels,
      } } : {}),
    });
    return tryDecision(device, decision, selectedProcessPlan);
  };
  const rebalanceActivePower = (): boolean => {
    let changed = false;
    for (const grid of Object.keys(project.powerGrids).sort()) {
      let remainingPower = Math.max(0, availablePower(grid) - standbyPower(grid));
      const consumers: Array<{
        kind: "job" | "station-charge" | "transport"; device: CompiledDevice;
        connection?: CompiledFactoryProject["connections"][string]; stage?: "loader" | "unloader";
      }> = [];
      for (const device of project.powerGrids[grid]!.members.map((id) => project.devices[id]!)) {
        const runtime = state.devices[device.id]!;
        if (device.stationEnergyPlan) {
          if (stationChargeRequestedDelta(device) > 0) consumers.push({ kind: "station-charge", device });
          else if (runtime.stationEnergy!.chargeSatisfactionPpm !== 0) {
            mutateFactoryState(state, { kind: "station.charge-satisfaction", device: device.id, satisfactionPpm: 0 });
            changed = true;
          }
        }
        if (runtime.activeJob && runtime.status !== "failed" && !runtime.activeJob.generationMilliWatts) consumers.push({ kind: "job", device });
        if (!device.transportEndpoint || runtime.status === "failed") continue;
        const attachment = device.transportEndpoint; const connection = project.connections[attachment.connection]!;
        if (state.transports[connection.id]!.some((transit) => transit.phase === transportPhase(attachment.stage))) {
          consumers.push({ kind: "transport", device, connection, stage: attachment.stage });
        }
      }
      consumers.sort((left, right) => comparePowerRank(left.device, right.device) || left.kind.localeCompare(right.kind));
      for (const consumer of consumers) {
        const device = consumer.device;
        const runtime = state.devices[device.id]!; const job = runtime.activeJob;
        const activeRequired = consumer.kind === "job" ? job!.powerMilliWatts
          : consumer.kind === "station-charge" ? device.assetDef.power.idleMilliWatts + device.stationEnergyPlan!.chargeMilliWatts
            : device.assetDef.power.activeMilliWatts;
        const requiredDelta = Math.max(0, activeRequired - standbyRequirement(device));
        if (runtime.idlePowered && requiredDelta <= remainingPower) {
          remainingPower -= requiredDelta;
          if (consumer.kind === "station-charge" && runtime.stationEnergy!.chargeSatisfactionPpm !== POWER_SATISFACTION_SCALE) {
            mutateFactoryState(state, { kind: "station.charge-satisfaction", device: device.id, satisfactionPpm: POWER_SATISFACTION_SCALE });
            changed = true;
          } else if (consumer.kind === "job" && runtime.status === "unpowered") {
            mutateFactoryState(state, { kind: "job.power", device: device.id, remainingTicks: job!.remainingTicks, workedTicks: job!.workedTicks, resumedAt: state.tick, powerSatisfactionPpm: POWER_SATISFACTION_SCALE });
            setStatus(device.id, "processing");
            emit({ type: "power.restored", tick: state.tick, device: device.id, grid, remainingTicks: job!.remainingTicks });
            schedule(state.tick + job!.remainingTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
            changed = true;
          } else if (consumer.kind === "transport" && runtime.status === "unpowered") {
            const works = Object.entries(pausedTransportWork).filter(([, work]) => work.reason === "power"
              && work.connection === consumer.connection!.id && work.stage === consumer.stage).sort(([left], [right]) => left.localeCompare(right));
            if (works.length) {
              for (const [key, work] of works) {
                const transit = state.transports[work.connection]!.find((item) => item.id === work.transitId);
                if (!transit || transit.phase !== transportPhase(work.stage)) { delete pausedTransportWork[key]; continue; }
                const readyTick = state.tick + work.remainingTicks;
                mutateFactoryState(state, {
                  kind: "transport.update", connection: work.connection, transitId: work.transitId,
                  changes: { readyTick, ...(work.stage === "unloader" ? { arriveTick: readyTick } : {}) },
                });
                schedule(readyTick, work.stage === "loader" ? 8 : 7, work.stage === "loader"
                  ? { kind: "belt-step", connection: work.connection, transitId: work.transitId }
                  : { kind: "arrive", connection: work.connection, transitId: work.transitId });
                delete pausedTransportWork[key];
              }
              delete transportPowerBlocked[`${consumer.connection!.id}:${consumer.stage}`];
              syncTransportEndpointStatus(consumer.connection!, consumer.stage!);
              emit({ type: "transport.power-restored", tick: state.tick, device: device.id, connection: consumer.connection!.id, stage: consumer.stage!, grid });
              changed = true;
            }
          }
          continue;
        }
        if (consumer.kind === "station-charge") {
          if (runtime.stationEnergy!.chargeSatisfactionPpm !== 0) {
            mutateFactoryState(state, { kind: "station.charge-satisfaction", device: device.id, satisfactionPpm: 0 });
            changed = true;
          }
          continue;
        }
        if (runtime.status !== "processing") continue;
        if (consumer.kind === "transport") {
          for (const transit of state.transports[consumer.connection!.id]!.filter((item) => item.phase === transportPhase(consumer.stage!))) {
            const key = transportWorkKey(consumer.connection!.id, consumer.stage!, transit.id);
            if (pausedTransportWork[key]) continue;
            pausedTransportWork[key] = {
              connection: consumer.connection!.id, device: device.id, stage: consumer.stage!, transitId: transit.id,
              remainingTicks: Math.max(1, transit.readyTick - state.tick), reason: "power",
            };
            mutateFactoryState(state, {
              kind: "transport.update", connection: consumer.connection!.id, transitId: transit.id,
              changes: { readyTick: Number.MAX_SAFE_INTEGER, ...(consumer.stage === "unloader" ? { arriveTick: Number.MAX_SAFE_INTEGER } : {}) },
            });
          }
          transportPowerBlocked[`${consumer.connection!.id}:${consumer.stage}`] = true;
          setStatus(device.id, "unpowered");
          emit({
            type: "transport.power-shortage", tick: state.tick, device: device.id, connection: consumer.connection!.id, stage: consumer.stage!, grid,
            requiredMilliWatts: activeRequired, availableMilliWatts: runtime.idlePowered ? remainingPower + standbyRequirement(device) : 0,
          });
          changed = true;
          continue;
        }
        const elapsed = Math.min(job!.remainingTicks, Math.max(0, state.tick - job!.resumedAt));
        if (elapsed >= job!.remainingTicks) continue;
        const remainingTicks = job!.remainingTicks - elapsed; const workedTicks = job!.workedTicks + elapsed;
        mutateFactoryState(state, { kind: "job.power", device: device.id, remainingTicks, workedTicks, resumedAt: state.tick, powerSatisfactionPpm: 0 });
        generations[device.id]!++;
        setStatus(device.id, "unpowered");
        emit({
          type: "power.shortage", tick: state.tick, device: device.id, grid,
          requiredMilliWatts: activeRequired, availableMilliWatts: runtime.idlePowered ? remainingPower + standbyRequirement(device) : 0, remainingTicks, workedTicks,
        });
        changed = true;
      }
    }
    return changed;
  };
  const rebalanceProportionalPower = (): boolean => {
    if (!proportionalPower) return false;
    let changed = false;
    for (const grid of Object.keys(project.powerGrids).sort()) {
      const satisfactionPpm = gridSatisfactionPpm(grid);
      const previousGridSatisfaction = state.energy.grids[grid]!.satisfactionPpm;
      if (previousGridSatisfaction !== satisfactionPpm) {
        mutateFactoryState(state, { kind: "power.satisfaction", grid, satisfactionPpm });
        emit({
          type: "power.satisfaction-changed", tick: state.tick, grid,
          demandMilliWatts: requestedPower(grid), availableMilliWatts: availablePower(grid), satisfactionPpm,
        });
        changed = true;
      }
      for (const device of project.powerGrids[grid]!.members.map((id) => project.devices[id]!).filter((item) => item.stationEnergyPlan).sort((a, b) => a.id.localeCompare(b.id))) {
        const runtime = state.devices[device.id]!; const energy = runtime.stationEnergy!;
        const assigned = runtime.idlePowered && stationChargeRequestedDelta(device) > 0 ? satisfactionPpm : 0;
        if (energy.chargeSatisfactionPpm === assigned) continue;
        mutateFactoryState(state, { kind: "station.charge-satisfaction", device: device.id, satisfactionPpm: assigned });
        changed = true;
      }
      for (const device of project.powerGrids[grid]!.members.map((id) => project.devices[id]!).sort((left, right) => left.id.localeCompare(right.id))) {
        const runtime = state.devices[device.id]!; const job = runtime.activeJob;
        if (!job || job.generationMilliWatts || runtime.status === "failed" || job.powerSatisfactionPpm === satisfactionPpm) continue;
        const elapsedTicks = Math.max(0, state.tick - job.resumedAt);
        const completedWork = Math.min(job.remainingTicks, elapsedTicks * job.powerSatisfactionPpm / POWER_SATISFACTION_SCALE);
        const remainingTicks = Math.max(0, job.remainingTicks - completedWork);
        const workedTicks = job.workedTicks + completedWork;
        generations[device.id]!++;
        mutateFactoryState(state, {
          kind: "job.power", device: device.id, remainingTicks, workedTicks,
          resumedAt: state.tick, powerSatisfactionPpm: satisfactionPpm,
        });
        if (satisfactionPpm > 0) {
          if (runtime.status === "unpowered") {
            setStatus(device.id, "processing");
            emit({ type: "power.restored", tick: state.tick, device: device.id, grid, remainingTicks: Math.ceil(remainingTicks) });
          }
          const completionDelay = remainingTicks <= 1e-9 ? 0 : Math.max(1, Math.ceil(remainingTicks * POWER_SATISFACTION_SCALE / satisfactionPpm));
          schedule(state.tick + completionDelay, 20, {
            kind: "complete", device: device.id, generation: generations[device.id]!,
          });
        } else if (runtime.status !== "unpowered") {
          setStatus(device.id, "unpowered");
          emit({
            type: "power.shortage", tick: state.tick, device: device.id, grid,
            requiredMilliWatts: job.powerMilliWatts, availableMilliWatts: 0,
            remainingTicks: Math.ceil(remainingTicks), workedTicks: Math.floor(workedTicks),
          });
        }
        changed = true;
      }
      const activeWorks = Object.values(proportionalTransportWork)
        .filter((work) => project.devices[work.device]!.powerGrid === grid)
        .sort((left, right) => transportWorkKey(left.connection, left.stage, left.transitId).localeCompare(transportWorkKey(right.connection, right.stage, right.transitId)));
      for (const work of activeWorks) {
        const transit = state.transports[work.connection]?.find((item) => item.id === work.transitId);
        if (!transit || transit.phase !== transportPhase(work.stage)) {
          delete proportionalTransportWork[transportWorkKey(work.connection, work.stage, work.transitId)];
          continue;
        }
        if (work.satisfactionPpm === satisfactionPpm) continue;
        const elapsedTicks = Math.max(0, state.tick - work.resumedAt);
        const completedWork = Math.min(work.remainingTicks, elapsedTicks * work.satisfactionPpm / POWER_SATISFACTION_SCALE);
        work.remainingTicks = Math.max(0, work.remainingTicks - completedWork);
        work.workedTicks += completedWork;
        work.resumedAt = state.tick;
        work.satisfactionPpm = satisfactionPpm;
        const readyTick = satisfactionPpm > 0
          ? state.tick + (work.remainingTicks <= 1e-9 ? 0 : Math.max(1, Math.ceil(work.remainingTicks * POWER_SATISFACTION_SCALE / satisfactionPpm)))
          : Number.MAX_SAFE_INTEGER;
        mutateFactoryState(state, {
          kind: "transport.update", connection: work.connection, transitId: work.transitId,
          changes: { readyTick, ...(work.stage === "unloader" ? { arriveTick: readyTick } : {}) },
        });
        if (satisfactionPpm > 0) schedule(readyTick, work.stage === "loader" ? 8 : 7, work.stage === "loader"
          ? { kind: "belt-step", connection: work.connection, transitId: work.transitId }
          : { kind: "arrive", connection: work.connection, transitId: work.transitId });
        changed = true;
      }
      for (const stage of project.powerGrids[grid]!.transportStages) {
        const key = `${stage.connection}:${stage.stage}`;
        const connection = project.connections[stage.connection]!;
        const active = state.transports[stage.connection]!.some((transit) => transit.phase === transportPhase(stage.stage));
        if (!active) continue;
        if (satisfactionPpm === 0 && !transportPowerBlocked[key]) {
          const endpoint = transportStage(connection, stage.stage);
          transportPowerBlocked[key] = true;
          setStatus(stage.device, "unpowered");
          emit({
            type: "transport.power-shortage", tick: state.tick, device: stage.device, connection: stage.connection, stage: stage.stage, grid,
            requiredMilliWatts: endpoint.asset.power.activeMilliWatts, availableMilliWatts: 0,
          });
          changed = true;
        } else if (satisfactionPpm > 0 && transportPowerBlocked[key]) {
          delete transportPowerBlocked[key];
          syncTransportEndpointStatus(connection, stage.stage);
          emit({ type: "transport.power-restored", tick: state.tick, device: stage.device, connection: stage.connection, stage: stage.stage, grid });
          changed = true;
        }
      }
    }
    return changed;
  };
  const settle = () => {
    let changed = true; let guard = 0;
    while (changed && guard++ < 100_000) {
      syncPowerAvailability();
      let releaseControlChanged = false;
      if (releasePolicy && !state.lotReleaseControl.open) {
        const activeWip = activeLotWip();
        const reopenThresholdDue = activeWip <= releasePolicy.reopenAtWip;
        const serviceLevelDue = releasePolicy.serviceLevelAfterTicks !== undefined && activeWip < releasePolicy.maximumWip
          && [...eligibleLotReleases].some(isServiceProtectedLot);
        if (reopenThresholdDue || serviceLevelDue) {
          releaseControlChanged = setReleaseControlOpen(true, reopenThresholdDue ? "reopen-threshold" : "service-level");
        }
      }
      let lotsReleased = false;
      for (const id of [...eligibleLotReleases].sort(compareEligibleLots)) {
        const lot = state.lots[id];
        if (!lot || lot.status !== "scheduled" || lot.location.kind !== "release") { eligibleLotReleases.delete(id); continue; }
        const device = project.devices[lot.location.device]!;
        const buffer = device.buffers[lot.location.buffer]!;
        const inventory = state.devices[device.id]!.buffers[buffer.id]!;
        const resourceCapacity = buffer.resourceCapacities?.[lot.resource];
        const blockRelease = (reason: "buffer-capacity" | "resource-capacity" | "conwip-limit") => {
          if (lot.releaseWait.reason === reason) return;
          mutateFactoryState(state, { kind: "lot.release-block", lotId: id, reason });
          emit({
            type: "lot.release-blocked", tick: state.tick, device: device.id, buffer: buffer.id, lot: id, reason,
            activeWip: activeLotWip(), maximumWip: reason === "conwip-limit" ? releasePolicy!.maximumWip : null,
          });
        };
        if (quantity(inventory) + incomingQuantity(device.id, buffer.id) >= buffer.capacity) { blockRelease("buffer-capacity"); continue; }
        if (resourceCapacity !== undefined && (inventory[lot.resource] ?? 0) + incomingQuantity(device.id, buffer.id, lot.resource) >= resourceCapacity) { blockRelease("resource-capacity"); continue; }
        const activeWipBeforeRelease = activeLotWip();
        if (releasePolicy && (activeWipBeforeRelease >= releasePolicy.maximumWip || !state.lotReleaseControl.open)) {
          if (activeWipBeforeRelease >= releasePolicy.maximumWip) releaseControlChanged = setReleaseControlOpen(false) || releaseControlChanged;
          blockRelease("conwip-limit"); continue;
        }
        const serviceProtected = isServiceProtectedLot(id);
        mutateFactoryState(state, { kind: "lot.release", lotId: id, device: device.id, buffer: buffer.id });
        eligibleLotReleases.delete(id);
        emit({
          type: "lot.released", tick: state.tick, device: device.id, buffer: buffer.id, lot: id,
          family: lot.family, resource: lot.resource, plannedReleaseTick: lot.plannedReleaseTick,
          releaseDelayTicks: state.tick - lot.plannedReleaseTick,
          releaseControl: releasePolicy ? "conwip" : "open-loop",
          serviceProtected,
          activeWipBeforeRelease,
        });
        updatePeakActiveLots();
        if (releasePolicy && activeLotWip() >= releasePolicy.maximumWip) releaseControlChanged = setReleaseControlOpen(false) || releaseControlChanged;
        lotsReleased = true;
      }
      let materialDelivered = false;
      for (const id of [...pendingMaterialDeliveries].sort()) {
        const delivery = materialDeliveries[id]!;
        const device = project.devices[delivery.device]!;
        const buffer = device.buffers[delivery.buffer]!;
        const inventory = state.devices[delivery.device]!.buffers[delivery.buffer]!;
        const resourceCapacity = buffer.resourceCapacities?.[delivery.resource];
        if (quantity(inventory) + incomingQuantity(delivery.device, delivery.buffer) + delivery.count > buffer.capacity) continue;
        if (resourceCapacity !== undefined && (inventory[delivery.resource] ?? 0) + incomingQuantity(delivery.device, delivery.buffer, delivery.resource) + delivery.count > resourceCapacity) continue;
        mutateFactoryState(state, { kind: "buffer", device: delivery.device, buffer: delivery.buffer, resource: delivery.resource, delta: delivery.count, treatmentLevel: 0 });
        pendingMaterialDeliveries.delete(id);
        emit({
          type: "material.delivered", tick: state.tick, device: delivery.device, buffer: delivery.buffer,
          delivery: id, resource: delivery.resource, count: delivery.count,
          plannedReleaseTick: delivery.releaseTick, deliveryDelayTicks: state.tick - delivery.releaseTick,
        });
        materialDelivered = true;
      }
      const evaluationOrder = Object.values(project.devices).sort((a, b) => Number(Boolean(b.generationPlan)) - Number(Boolean(a.generationPlan)) || comparePowerRank(a, b));
      let generationChanged = false;
      for (const device of evaluationOrder.filter((item) => item.generationPlan)) if (tryEvaluate(device)) generationChanged = true;
      syncPowerAvailability();
      const standbyPowerChanged = refreshStandbyPower();
      const jobPowerChanged = proportionalPower ? rebalanceProportionalPower() : rebalanceActivePower();
      const physicalMoved = dispatch();
      const stationMoved = dispatchStations();
      changed = releaseControlChanged || lotsReleased || materialDelivered || generationChanged || standbyPowerChanged || jobPowerChanged || physicalMoved || stationMoved;
      for (const device of evaluationOrder.filter((item) => !item.generationPlan)) if (tryEvaluate(device)) changed = true;
    }
    syncPowerAvailability();
    schedulePowerBoundaries();
    if (guard >= 100_000) throw new Error("Device scripts did not reach a stable state after 100000 actions at one tick");
  };

  for (const failure of project.scenario.failures ?? []) {
    schedule(failure.atTick, 0, { kind: "breakdown", device: failure.device });
    schedule(failure.atTick + failure.durationTicks, 1, { kind: "recover", device: failure.device });
  }
  const releaseGroups = new Map<number, string[]>();
  for (const lot of project.scenario.lotReleases ?? []) {
    const group = releaseGroups.get(lot.releaseTick) ?? [];
    group.push(lot.id);
    releaseGroups.set(lot.releaseTick, group);
  }
  for (const [releaseTick, lotIds] of [...releaseGroups].sort(([left], [right]) => left - right)) schedule(releaseTick, 2, { kind: "lot-release", lotIds: lotIds.sort() });
  const materialDeliveryGroups = new Map<number, string[]>();
  for (const delivery of project.scenario.materialDeliveries ?? []) {
    const group = materialDeliveryGroups.get(delivery.releaseTick) ?? [];
    group.push(delivery.id);
    materialDeliveryGroups.set(delivery.releaseTick, group);
  }
  for (const [releaseTick, deliveryIds] of [...materialDeliveryGroups].sort(([left], [right]) => left - right)) schedule(releaseTick, 2, { kind: "material-delivery", deliveryIds: deliveryIds.sort() });
  for (const [device, runtime] of Object.entries(state.devices).sort(([left], [right]) => left.localeCompare(right))) {
    const campaign = runtime.setup?.campaign;
    if (campaign) schedule(Math.max(state.tick, campaign.deadlineTick), 3, {
      kind: "campaign-timeout", device, targetGroup: campaign.targetGroup, deadlineTick: campaign.deadlineTick,
    });
    const batchHold = runtime.batchFormation?.hold;
    if (batchHold) schedule(Math.max(state.tick, batchHold.deadlineTick), 3, {
      kind: "batch-timeout", device, preferredProcess: batchHold.preferredProcess, deadlineTick: batchHold.deadlineTick,
    });
    if (runtime.maintenance) scheduleMaintenanceCalendarBoundaries(project.devices[device]!, runtime.maintenance.qualifiedAtTick);
    scheduleSleepBoundary(project.devices[device]!);
  }
  for (const deviceId of Object.values(project.devices).filter((device) => device.generationPlan?.kind === "renewable" && renewableProfileFor(project, device.id)).map((device) => device.id).sort()) {
    const device = project.devices[deviceId]!; const output = generatorOutputAt(project, deviceId, state.tick);
    emit({
      type: "power.generation-changed", tick: state.tick, device: deviceId, grid: device.powerGrid!,
      ratedMilliWatts: device.generationPlan!.outputMilliWatts, ...output,
    });
    const next = nextGeneratorBoundary(project, deviceId, state.tick);
    if (next !== undefined) schedule(next, 1, { kind: "generation-boundary", device: deviceId });
  }
  for (const tariff of project.scenario.electricityTariffs ?? []) {
    emit({
      type: "power.electricity-price-changed", tick: state.tick, region: tariff.region,
      energyPriceMicroCurrencyPerKiloWattHour: electricityPriceAt(project, tariff.region, state.tick),
    });
    const next = nextElectricityTariffBoundary(project, tariff.region, state.tick);
    if (next !== undefined) schedule(next, 1, { kind: "electricity-tariff-boundary", region: tariff.region });
  }
  settle();
  while (queue.size && publicEventCount < maxEvents) {
    const item = queue.peek()!;
    if (item.tick > untilTick) break;
    queue.pop(); measureUntil(item.tick);
    const event = item.value;
    if (event.kind === "lot-release") {
      for (const id of event.lotIds) if (state.lots[id]?.status === "scheduled") eligibleLotReleases.add(id);
    } else if (event.kind === "material-delivery") {
      for (const id of event.deliveryIds) pendingMaterialDeliveries.add(id);
    } else if (event.kind === "complete") {
      if (event.generation !== generations[event.device] || state.devices[event.device]!.status !== "processing") continue;
      const runtime = state.devices[event.device]!; const job = runtime.activeJob!;
      if (job.wake) {
        const device = project.devices[event.device]!;
        mutateFactoryState(state, { kind: "job.finish", device: event.device });
        mutateFactoryState(state, {
          kind: "energy.wake-finish", device: event.device, tick: state.tick, durationTicks: job.durationTicks,
        });
        markDeviceIdle(device);
        emit({
          type: "device.wake-finish", tick: state.tick, device: event.device,
          durationTicks: job.durationTicks, powerMilliWatts: job.powerMilliWatts,
        });
      } else if (job.maintenance) {
        const jobsSinceMaintenance = runtime.maintenance!.jobsSinceMaintenance;
        mutateFactoryState(state, {
          kind: "maintenance.service-release", phase: job.maintenance.phase,
          provider: job.maintenance.provider, crews: job.maintenance.crews,
          occupiedTicks: state.tick - job.startedAt, outcome: "completed",
        });
        markDeviceIdle(project.devices[event.device]!);
        mutateFactoryState(state, { kind: "job.finish", device: event.device });
        if (job.maintenance.phase === "service") {
          mutateFactoryState(state, {
            kind: "maintenance.service-finish", device: event.device, cause: job.maintenance.cause,
            trigger: job.maintenance.trigger, jobsSinceMaintenance,
            qualificationAgeTicks: job.maintenance.qualificationAgeTicks, durationTicks: job.durationTicks,
          });
          emit({
            type: "device.maintenance-service-finish", tick: state.tick, device: event.device,
            cause: job.maintenance.cause, trigger: job.maintenance.trigger,
            qualificationAgeTicks: job.maintenance.qualificationAgeTicks,
            provider: job.maintenance.provider, skill: job.maintenance.skill,
            crews: job.maintenance.crews, inputs: structuredClone(job.maintenance.inputs),
            jobsSinceMaintenance, durationTicks: job.durationTicks,
          });
        } else {
          mutateFactoryState(state, {
            kind: "maintenance.qualification-finish", device: event.device,
            cause: job.maintenance.cause, trigger: job.maintenance.trigger,
            qualifiedAtTick: state.tick, durationTicks: job.durationTicks,
          });
          emit({
            type: "device.qualification-finish", tick: state.tick, device: event.device,
            cause: job.maintenance.cause, trigger: job.maintenance.trigger,
            qualificationAgeTicks: job.maintenance.qualificationAgeTicks,
            provider: job.maintenance.provider, skill: job.maintenance.skill,
            crews: job.maintenance.crews, inputs: structuredClone(job.maintenance.inputs),
            jobsSinceMaintenance, durationTicks: job.durationTicks,
          });
          emit({
            type: "device.maintenance-finish", tick: state.tick, device: event.device,
            cause: job.maintenance.cause, trigger: job.maintenance.trigger,
            qualificationAgeTicks: job.maintenance.qualificationAgeTicks, jobsSinceMaintenance,
            serviceDurationTicks: project.devices[event.device]!.assetDef.production!.maintenance!.durationTicks,
            qualificationDurationTicks: job.durationTicks,
          });
          scheduleMaintenanceCalendarBoundaries(project.devices[event.device]!, state.tick);
        }
      } else if (job.changeover) {
        mutateFactoryState(state, { kind: "setup.finish", device: event.device, group: job.changeover.to, durationTicks: job.durationTicks });
        markDeviceIdle(project.devices[event.device]!);
        mutateFactoryState(state, { kind: "job.finish", device: event.device });
        emit({
          type: "device.changeover-finish", tick: state.tick, device: event.device,
          ...job.changeover, durationTicks: job.durationTicks, powerMilliWatts: job.powerMilliWatts,
        });
      } else {
      if (job.utilities?.length) {
        const occupiedTicks = state.tick - job.startedAt;
        mutateFactoryState(state, {
          kind: "utility.release", device: event.device, allocations: job.utilities,
          occupiedTicks, outcome: "completed",
        });
        emit({
          type: "device.utility-released", tick: state.tick, device: event.device,
          process: job.operation, allocations: structuredClone(job.utilities), occupiedTicks, outcome: "completed",
        });
      }
      if (job.tooling) {
        const occupiedTicks = state.tick - job.startedAt;
        mutateFactoryState(state, {
          kind: "tooling.release", device: event.device, provider: job.tooling.provider,
          amounts: job.tooling.amounts, occupiedTicks, outcome: "completed",
        });
        emit({
          type: "device.tooling-released", tick: state.tick, device: event.device,
          process: job.operation, provider: job.tooling.provider,
          tooling: structuredClone(job.tooling.amounts), occupiedTicks, outcome: "completed",
        });
      }
      for (const output of job.produce) {
        const transfer = job.lotTransfers?.find((candidate) => candidate.output.buffer === output.buffer && candidate.output.resource === output.resource);
        if (isTracked(output.resource)) {
          if (!transfer || transfer.lotIds.length !== output.count) throw new Error(`Tracked output '${output.resource}' from '${event.device}' has no identity-preserving lot transfer`);
          if (project.processes[job.operation]) for (const lotId of transfer.lotIds) {
            const lot = state.lots[lotId]!;
            const fromStep = lot.route.step;
            const step = fromStep ? project.routes[lot.route.id]!.steps.find((candidate) => candidate.id === fromStep) : undefined;
            const transition = step?.transitions.find((candidate) => candidate.resource === output.resource);
            if (!fromStep || !step?.operations.includes(job.operation) || !transition) throw new Error(`Process '${job.operation}' cannot advance Lot '${lotId}' from Route '${lot.route.id}/${fromStep ?? "terminal"}' with '${output.resource}'`);
            const toStep = transition.to ?? null; const terminal = transition.terminal ?? null;
            const reentrant = Boolean(toStep && (lot.route.visits[toStep] ?? 0) > 0);
            mutateFactoryState(state, { kind: "lot.route-advance", lotIds: [lotId], route: lot.route.id, fromStep, toStep, terminal });
            emit({
              type: "lot.route-advanced", tick: state.tick, device: event.device, lot: lotId, route: lot.route.id, fromStep,
              process: job.operation, outputResource: output.resource, toStep, terminal,
              visit: toStep ? state.lots[lotId]!.route.visits[toStep]! : 0, reentrant,
            });
          }
          mutateFactoryState(state, {
            kind: "lot.arrive", lotIds: transfer.lotIds, device: event.device, buffer: output.buffer,
            resource: output.resource, treatmentLevel: output.treatmentLevel,
          });
        } else mutateFactoryState(state, { kind: "buffer", device: event.device, buffer: output.buffer, resource: output.resource, delta: output.count, treatmentLevel: output.treatmentLevel });
        mutateFactoryState(state, { kind: "produced", resource: output.resource, count: output.count });
      }
      if (job.lotOutput) {
        const measured = stats.lotOutputProfiles[job.operation] ??= { jobs: 0, profiles: {}, nominalOutputs: {}, actualOutputs: {} };
        measured.jobs += 1;
        measured.profiles[job.lotOutput.profile] = (measured.profiles[job.lotOutput.profile] ?? 0) + 1;
        for (const output of job.lotOutput.nominalOutputs) measured.nominalOutputs[output.resource] = (measured.nominalOutputs[output.resource] ?? 0) + output.count;
        for (const output of job.produce) measured.actualOutputs[output.resource] = (measured.actualOutputs[output.resource] ?? 0) + output.count;
        emit({
          type: "lot.output-profile", tick: state.tick, device: event.device, lot: job.lotOutput.lotId,
          process: job.operation, profile: job.lotOutput.profile, defects: [...job.lotOutput.defects],
          nominalOutputs: job.lotOutput.nominalOutputs.map(({ resource, count }) => ({ resource, count })),
          actualOutputs: job.produce.map(({ resource, count }) => ({ resource, count })),
        });
      }
      if (job.quality?.kind === "inspection") {
        mutateFactoryState(state, { kind: "lot.inspect", lotIds: job.quality.lotIds, result: job.quality.result });
        for (const id of job.quality.lotIds) emit({
          type: "lot.inspected", tick: state.tick, device: event.device, lot: id, process: job.operation,
          result: job.quality.result, detectedDefects: [...job.quality.detectedDefects], reworkCycles: state.lots[id]!.quality.reworkCycles,
        });
      } else if (job.quality?.kind === "rework") {
        const before = Object.fromEntries(job.quality.lotIds.map((id) => [id, [...state.lots[id]!.quality.defects]]));
        mutateFactoryState(state, { kind: "lot.rework", lotIds: job.quality.lotIds, repairs: job.quality.repairs });
        for (const id of job.quality.lotIds) {
          const remainingDefects = [...state.lots[id]!.quality.defects];
          const repairedDefects = before[id]!.filter((defect) => !remainingDefects.includes(defect));
          emit({
            type: "lot.reworked", tick: state.tick, device: event.device, lot: id, process: job.operation,
            repairedDefects, remainingDefects, reworkCycles: state.lots[id]!.quality.reworkCycles,
          });
        }
      }
      for (const id of trackedJobLotIds(job)) {
        for (const excursion of (project.scenario.qualityExcursions ?? []).filter((candidate) => candidate.process === job.operation && candidate.lot === id)) {
          if (state.lots[id]!.quality.appliedExcursions.includes(excursion.id)) continue;
          const preventedDefects = excursion.defects.filter((defect) => job.qualityControl?.preventsDefects.includes(defect));
          const defects = excursion.defects.filter((defect) => !preventedDefects.includes(defect));
          mutateFactoryState(state, { kind: "lot.quality-excursion", lotIds: [id], excursion: excursion.id, defects });
          emit({
            type: "lot.quality-excursion", tick: state.tick, device: event.device, lot: id, process: job.operation,
            mode: job.qualityControl?.mode ?? "uncontrolled",
            excursion: excursion.id,
            authoredDefects: [...excursion.defects],
            preventedDefects,
            defects,
          });
        }
      }
      const driftLotIds = trackedJobLotIds(job);
      let driftDefectsIntroduced = 0;
      if (job.equipmentDrift) {
        for (const id of driftLotIds) {
          const before = new Set(state.lots[id]!.quality.defects);
          driftDefectsIntroduced += job.equipmentDrift.defects.filter((defect) => !before.has(defect)).length;
        }
        if (job.equipmentDrift.defects.length && driftLotIds.length) mutateFactoryState(state, {
          kind: "lot.quality-excursion", lotIds: driftLotIds,
          excursion: `equipment-drift:${event.device}:${job.operation}:${job.startedAt}`,
          defects: job.equipmentDrift.defects,
        });
        emit({
          type: "device.process-drift", tick: state.tick, device: event.device, process: job.operation,
          lotIds: [...driftLotIds], afterJobs: job.equipmentDrift.afterJobs,
          jobsSinceMaintenance: job.equipmentDrift.jobsSinceMaintenance,
          durationTicks: job.durationTicks, powerMilliWatts: job.powerMilliWatts,
          defects: [...job.equipmentDrift.defects],
        });
      }
      for (const termination of job.lotTerminations ?? []) for (const id of termination.lotIds) {
        const lot = state.lots[id]!;
        const fromStep = lot.route.step;
        const step = fromStep ? project.routes[lot.route.id]!.steps.find((candidate) => candidate.id === fromStep) : undefined;
        const definition = project.processes[job.operation];
        if (!fromStep || !step?.operations.includes(job.operation) || definition?.lotTermination?.terminal !== termination.terminal) {
          throw new Error(`Process '${job.operation}' cannot terminate Lot '${id}' from Route '${lot.route.id}/${fromStep ?? "terminal"}'`);
        }
        const inputResource = lot.resource;
        const route = lot.route.id;
        mutateFactoryState(state, {
          kind: "lot.terminate", lotIds: [id], device: event.device, route, fromStep,
          terminal: termination.terminal, reason: `process:${job.operation}`,
        });
        emit({
          type: "lot.route-terminated", tick: state.tick, device: event.device, lot: id, route, fromStep,
          process: job.operation, inputResource, terminal: termination.terminal,
        });
        if (termination.terminal === "complete") {
          const cycleTicks = state.tick - lot.releasedAtTick!;
          const tardinessTicks = Math.max(0, state.tick - (lot.dueTick ?? state.tick));
          emit({ type: "lot.completed", tick: state.tick, device: event.device, lot: id, family: lot.family, resource: inputResource, cycleTicks, tardinessTicks });
        } else emit({
          type: "lot.scrapped", tick: state.tick, device: event.device, lot: id,
          family: lot.family, resource: inputResource, reason: "process-termination",
        });
      }
      if (job.extraction) {
        const node = project.resourceNodes[job.extraction.node]!;
        mutateFactoryState(state, { kind: "resource.extracted", node: node.id, count: job.extraction.count });
        emit({ type: "resource.extracted", tick: state.tick, device: event.device, node: node.id, resource: node.resource, count: job.extraction.count, remaining: state.resourceNodes[node.id]!.remaining });
        if (state.resourceNodes[node.id]!.remaining === 0 && state.resourceNodes[node.id]!.reserved === 0) emit({ type: "resource.depleted", tick: state.tick, node: node.id, resource: node.resource });
      }
      if (job.fuel) emit({ type: "power.fuel-spent", tick: state.tick, device: event.device, grid: project.devices[event.device]!.powerGrid!, resource: job.fuel.resource, count: job.fuel.count });
      if (job.treatment) {
        mutateFactoryState(state, { kind: "treatment.complete", resource: job.treatment.resource, level: job.treatment.toLevel, count: job.treatment.count });
        emit({ type: "material.treated", tick: state.tick, device: event.device, ...job.treatment });
      }
      if (job.production) mutateFactoryState(state, {
        kind: "production.finish", device: event.device,
        ...(job.equipmentDrift ? { driftedLots: driftLotIds.length, driftDefects: driftDefectsIntroduced } : {}),
      });
      markDeviceIdle(project.devices[event.device]!); mutateFactoryState(state, { kind: "job.finish", device: event.device });
      emit({ type: "device.finish", tick: state.tick, device: event.device, operation: job.operation,
        ...(job.productionMode ? { mode: job.productionMode } : {}), produced: structuredClone(job.produce),
        ...(trackedJobLotIds(job).length ? { lotIds: trackedJobLotIds(job) } : {}) });
      }
    } else if (event.kind === "belt-step") {
      const transit = state.transports[event.connection]?.find((item) => item.id === event.transitId);
      if (!transit || transit.readyTick !== state.tick || transit.phase === "unloading") continue;
      const connection = project.connections[event.connection]!;
      if (transit.phase === "belt" && transit.cellIndex === connection.transportCells.length - 1) {
        const unloader = transportStage(connection, "unloader");
        if (state.devices[unloader.device!.id]!.status === "failed") {
          markBlocked(
            event.connection,
            transit,
            `device:${unloader.device!.id}:failed`,
            Math.max(1, unloader.durationTicks),
            "endpoint-failure",
            "unloader",
          );
          continue;
        }
        const unloading = state.transports[event.connection]!.filter((item) => item.phase === "unloading").length;
        if (unloading >= unloader.capacity) {
          markBlocked(
            event.connection,
            transit,
            `${connection.to.device}.${connection.to.port}`,
            connection.lineCellTravelTicks,
            "endpoint-capacity",
            "unloader",
          );
          continue;
        }
        if (!transportStagePowered(connection, "unloader")) {
          markBlocked(
            event.connection,
            transit,
            `power:${unloader.powerGrid ?? "disconnected"}`,
            connection.lineCellTravelTicks,
            "endpoint-power",
            "unloader",
          );
          continue;
        }
        clearBlocked(event.connection, transit);
        const arriveTick = state.tick + unloader.durationTicks;
        mutateFactoryState(state, {
          kind: "transport.update", connection: event.connection, transitId: transit.id,
          changes: { phase: "unloading", cellIndex: -1, readyTick: arriveTick, arriveTick },
        });
        startProportionalTransportWork(event.connection, "unloader", transit.id, unloader.device!.id, unloader.durationTicks);
        emit({ type: "resource.unload-start", tick: state.tick, transit: { ...transit }, connection: event.connection });
        emit({ type: "transport.stage-start", tick: state.tick, device: unloader.device!.id, connection: event.connection, stage: "unloader", transitId: transit.id, durationTicks: unloader.durationTicks });
        syncTransportEndpointStatus(connection, "unloader");
        schedule(arriveTick, 7, { kind: "arrive", connection: event.connection, transitId: transit.id });
      } else {
        const finishedLoading = transit.phase === "loading";
        const loader = finishedLoading ? transportStage(connection, "loader") : undefined;
        if (loader && state.devices[loader.device!.id]!.status === "failed") {
          markBlocked(
            event.connection,
            transit,
            `device:${loader.device!.id}:failed`,
            Math.max(1, loader.durationTicks),
            "endpoint-failure",
            "loader",
          );
          continue;
        }
        if (loader && !transportStagePowered(connection, "loader")) {
          markBlocked(
            event.connection,
            transit,
            `power:${loader.powerGrid ?? "disconnected"}`,
            Math.max(1, loader.durationTicks),
            "endpoint-power",
            "loader",
          );
          continue;
        }
        const targetIndex = transit.phase === "loading" ? 0 : transit.cellIndex + 1;
        const targetCell = connection.transportCells[targetIndex]!;
        const cell = project.transportCells[targetCell]!;
        const contenders = waitingConnections(targetCell);
        const cursor = (transportCellCursors[targetCell] ?? 0) % cell.connections.length;
        const preferred = contenders.length > 1
          ? [...cell.connections.slice(cursor), ...cell.connections.slice(0, cursor)].find((candidate) => contenders.includes(candidate))!
          : event.connection;
        if (occupiedCell(targetCell) || preferred !== event.connection) {
          markBlocked(event.connection, transit, targetCell, cell.travelTicks, "line-contention", "line");
          continue;
        }
        clearBlocked(event.connection, transit);
        const nextReadyTick = state.tick + cell.travelTicks;
        mutateFactoryState(state, {
          kind: "transport.update", connection: event.connection, transitId: transit.id,
          changes: { phase: "belt", cellIndex: targetIndex, readyTick: nextReadyTick },
        });
        if (cell.connections.length > 1) {
          const index = cell.connections.indexOf(event.connection);
          transportCellCursors[targetCell] = (index + 1) % cell.connections.length;
        }
        if (finishedLoading) {
          delete proportionalTransportWork[transportWorkKey(event.connection, "loader", transit.id)];
          emit({ type: "transport.stage-finish", tick: state.tick, device: loader!.device!.id, connection: event.connection, stage: "loader", transitId: transit.id });
          syncTransportEndpointStatus(connection, "loader");
        }
        emit({ type: "resource.belt-position", tick: state.tick, transit: { ...transit }, connection: event.connection, cell: targetCell, cellIndex: targetIndex });
        schedule(nextReadyTick, 8, { kind: "belt-step", connection: event.connection, transitId: transit.id });
      }
    } else if (event.kind === "arrive") {
      const transits = state.transports[event.connection]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!;
      if (transit.phase !== "unloading" || transit.readyTick !== state.tick) continue;
      const connection = project.connections[event.connection]!; const unloader = transportStage(connection, "unloader");
      if (state.devices[unloader.device!.id]!.status === "failed" || !transportStagePowered(connection, "unloader")) {
        const retryTick = state.tick + Math.max(1, unloader.durationTicks);
        mutateFactoryState(state, { kind: "transport.update", connection: event.connection, transitId: transit.id, changes: { readyTick: retryTick, arriveTick: retryTick } });
        schedule(retryTick, 7, { kind: "arrive", connection: event.connection, transitId: transit.id });
        continue;
      }
      delete proportionalTransportWork[transportWorkKey(event.connection, "unloader", transit.id)];
      mutateFactoryState(state, { kind: "transport.remove", connection: event.connection, transitId: transit.id });
      if (transit.lotIds?.length) mutateFactoryState(state, {
        kind: "lot.arrive", lotIds: transit.lotIds, device: transit.to, buffer: transit.toBuffer,
        resource: transit.resource, treatmentLevel: transit.treatmentLevel,
      });
      else mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count, treatmentLevel: transit.treatmentLevel });
      stats.connectionDeliveredItems[event.connection] = (stats.connectionDeliveredItems[event.connection] ?? 0) + transit.count;
      const deliveredByResource = stats.connectionDeliveredByResource[event.connection] ??= {};
      deliveredByResource[transit.resource] = (deliveredByResource[transit.resource] ?? 0) + transit.count;
      emit({ type: "transport.stage-finish", tick: state.tick, device: unloader.device!.id, connection: event.connection, stage: "unloader", transitId: transit.id });
      syncTransportEndpointStatus(connection, "unloader");
      emit({ type: "resource.arrive", tick: state.tick, transit: { ...transit }, connection: event.connection });
    } else if (event.kind === "station-arrive") {
      const transits = state.logisticsTransports[event.network]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!;
      mutateFactoryState(state, { kind: "logistics.remove", network: event.network, transitId: transit.id });
      mutateFactoryState(state, { kind: "logistics.mission-returning", network: event.network, missionId: `mission-${transit.id}` });
      if (transit.lotIds?.length) mutateFactoryState(state, {
        kind: "lot.arrive", lotIds: transit.lotIds, device: transit.to, buffer: transit.toBuffer,
        resource: transit.resource, treatmentLevel: transit.treatmentLevel,
      });
      else mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count, treatmentLevel: transit.treatmentLevel });
      emit({ type: "logistics.arrive", tick: state.tick, transit: { ...transit }, network: event.network, route: event.route });
    } else if (event.kind === "carrier-return") {
      const mission = state.logisticsMissions[event.network]!.find((item) => item.id === event.missionId);
      if (!mission) continue;
      mutateFactoryState(state, { kind: "logistics.mission-remove", network: event.network, missionId: mission.id });
      mutateFactoryState(state, { kind: "carrier-return" });
      const key = stationFleetKey(mission.network, mission.homeStation);
      stats.stationFleetCompletedReturns[key] = (stats.stationFleetCompletedReturns[key] ?? 0) + 1;
      emit({ type: "logistics.return", tick: state.tick, mission: { ...mission }, network: event.network, route: event.route });
    } else if (event.kind === "logistics-ready") {
      if (scheduledDispatchTick[event.connection] === state.tick) delete scheduledDispatchTick[event.connection];
    } else if (event.kind === "power-boundary") {
      if (event.generation !== powerBoundaryGenerations[event.grid] || scheduledPowerBoundaryTick[event.grid] !== state.tick) continue;
      delete scheduledPowerBoundaryTick[event.grid];
    } else if (event.kind === "generation-boundary") {
      const device = project.devices[event.device]!; const output = generatorOutputAt(project, event.device, state.tick);
      emit({
        type: "power.generation-changed", tick: state.tick, device: event.device, grid: device.powerGrid!,
        ratedMilliWatts: device.generationPlan!.outputMilliWatts, ...output,
      });
      const next = nextGeneratorBoundary(project, event.device, state.tick);
      if (next !== undefined) schedule(next, 1, { kind: "generation-boundary", device: event.device });
    } else if (event.kind === "electricity-tariff-boundary") {
      emit({
        type: "power.electricity-price-changed", tick: state.tick, region: event.region,
        energyPriceMicroCurrencyPerKiloWattHour: electricityPriceAt(project, event.region, state.tick),
      });
      const next = nextElectricityTariffBoundary(project, event.region, state.tick);
      if (next !== undefined) schedule(next, 1, { kind: "electricity-tariff-boundary", region: event.region });
    } else if (event.kind === "campaign-timeout") {
      const campaign = state.devices[event.device]?.setup?.campaign;
      if (!campaign || campaign.targetGroup !== event.targetGroup || campaign.deadlineTick !== event.deadlineTick) continue;
    } else if (event.kind === "batch-timeout") {
      const hold = state.devices[event.device]?.batchFormation?.hold;
      if (!hold || hold.preferredProcess !== event.preferredProcess || hold.deadlineTick !== event.deadlineTick) continue;
    } else if (event.kind === "maintenance-boundary") {
      const maintenance = state.devices[event.device]?.maintenance;
      if (!maintenance || maintenance.qualifiedAtTick !== event.qualifiedAtTick) continue;
    } else if (event.kind === "sleep-boundary") {
      const device = project.devices[event.device]!;
      const runtime = state.devices[event.device]!;
      const energy = runtime.energyManagement;
      if (!energy || energy.mode !== "awake" || energy.idleSinceTick !== event.idleSinceTick || runtime.status === "failed" || runtime.activeJob
        || state.tick < energy.idleSinceTick + device.policy!.idleEnergy!.sleepAfterTicks) continue;
      mutateFactoryState(state, { kind: "energy.sleep", device: event.device });
      setStatus(event.device, "sleeping");
      emit({
        type: "device.sleep", tick: state.tick, device: event.device,
        idleTicks: state.tick - energy.idleSinceTick,
        idleMilliWatts: device.assetDef.power.sleep!.idleMilliWatts,
      });
    } else if (event.kind === "breakdown") {
      if (project.devices[event.device]!.assetDef.utilityProvider) {
        const interruptedJobs = Object.entries(state.devices)
          .filter(([deviceId, runtime]) => deviceId !== event.device
            && runtime.activeJob?.utilities?.some((allocation) => allocation.provider === event.device))
          .sort(([left], [right]) => left.localeCompare(right));
        for (const [deviceId, runtime] of interruptedJobs) {
          const job = runtime.activeJob!;
          const failedUtilities = job.utilities!.filter((allocation) => allocation.provider === event.device)
            .map(({ utility, units }) => ({ utility, units }));
          const occupiedTicks = state.tick - job.startedAt;
          generations[deviceId]!++;
          mutateFactoryState(state, { kind: "utility.interrupt", device: deviceId, provider: event.device });
          mutateFactoryState(state, {
            kind: "utility.release", device: deviceId, allocations: job.utilities!, occupiedTicks, outcome: "cancelled",
          });
          emit({
            type: "device.utility-interrupted", tick: state.tick, device: deviceId, process: job.operation,
            provider: event.device, failedUtilities: structuredClone(failedUtilities), occupiedTicks,
          });
          emit({
            type: "device.utility-released", tick: state.tick, device: deviceId, process: job.operation,
            allocations: structuredClone(job.utilities!), occupiedTicks, outcome: "cancelled",
          });
          if (job.tooling) {
            mutateFactoryState(state, {
              kind: "tooling.release", device: deviceId, provider: job.tooling.provider,
              amounts: job.tooling.amounts, occupiedTicks, outcome: "cancelled",
            });
            emit({
              type: "device.tooling-released", tick: state.tick, device: deviceId, process: job.operation,
              provider: job.tooling.provider, tooling: structuredClone(job.tooling.amounts), occupiedTicks, outcome: "cancelled",
            });
          }
          const scrappedLots = trackedJobLotIds(job);
          if (scrappedLots.length) {
            mutateFactoryState(state, { kind: "lot.scrap", lotIds: scrappedLots, device: deviceId, reason: "facility-interlock" });
            for (const id of scrappedLots) {
              const lot = state.lots[id]!;
              emit({
                type: "lot.scrapped", tick: state.tick, device: deviceId, lot: id,
                family: lot.family, resource: lot.resource, reason: "facility-interlock",
              });
            }
          }
          mutateFactoryState(state, { kind: "job.finish", device: deviceId });
          markDeviceIdle(project.devices[deviceId]!);
        }
      }
      generations[event.device]!++;
      const activeJob = state.devices[event.device]!.activeJob;
      const utilityWait = state.devices[event.device]!.productionUtilities?.wait;
      if (utilityWait) mutateFactoryState(state, {
        kind: "utility.wait", device: event.device, process: utilityWait.process, waiting: false,
      });
      if (activeJob?.changeover) emit({
        type: "device.changeover-cancelled", tick: state.tick, device: event.device,
        ...activeJob.changeover, reason: "equipment-breakdown",
      });
      if (activeJob?.wake) emit({
        type: "device.wake-cancelled", tick: state.tick, device: event.device,
        durationTicks: activeJob.durationTicks, powerMilliWatts: activeJob.powerMilliWatts,
        reason: "equipment-breakdown",
      });
      if (activeJob?.maintenance) {
        mutateFactoryState(state, {
          kind: "maintenance.service-release", phase: activeJob.maintenance.phase,
          provider: activeJob.maintenance.provider, crews: activeJob.maintenance.crews,
          occupiedTicks: state.tick - activeJob.startedAt, outcome: "cancelled",
        });
        const cancellation = {
          tick: state.tick, device: event.device, cause: activeJob.maintenance.cause,
          trigger: activeJob.maintenance.trigger,
          qualificationAgeTicks: activeJob.maintenance.qualificationAgeTicks,
          provider: activeJob.maintenance.provider, skill: activeJob.maintenance.skill,
          crews: activeJob.maintenance.crews, inputs: structuredClone(activeJob.maintenance.inputs),
          jobsSinceMaintenance: state.devices[event.device]!.maintenance!.jobsSinceMaintenance,
          reason: "equipment-breakdown" as const,
        };
        if (activeJob.maintenance.phase === "service") emit({ type: "device.maintenance-cancelled", ...cancellation });
        else emit({ type: "device.qualification-cancelled", ...cancellation });
        mutateFactoryState(state, { kind: "maintenance.cancel", device: event.device, phase: activeJob.maintenance.phase });
      }
      const maintenanceWait = state.devices[event.device]!.maintenance?.wait;
      if (maintenanceWait) mutateFactoryState(state, {
        kind: "maintenance.wait", device: event.device, phase: maintenanceWait.phase, reason: null,
      });
      if (activeJob?.extraction) mutateFactoryState(state, { kind: "resource.release", node: activeJob.extraction.node, count: activeJob.extraction.count });
      if (activeJob?.tooling) mutateFactoryState(state, {
        kind: "tooling.hold", device: event.device, provider: activeJob.tooling.provider,
        process: activeJob.operation, amounts: activeJob.tooling.amounts, acquiredAtTick: activeJob.startedAt,
      });
      if (activeJob?.utilities?.length) {
        const occupiedTicks = state.tick - activeJob.startedAt;
        mutateFactoryState(state, {
          kind: "utility.release", device: event.device, allocations: activeJob.utilities,
          occupiedTicks, outcome: "cancelled",
        });
        emit({
          type: "device.utility-released", tick: state.tick, device: event.device,
          process: activeJob.operation, allocations: structuredClone(activeJob.utilities), occupiedTicks, outcome: "cancelled",
        });
      }
      const scrappedLots = activeJob ? trackedJobLotIds(activeJob) : [];
      if (scrappedLots.length) {
        mutateFactoryState(state, { kind: "lot.scrap", lotIds: scrappedLots, device: event.device, reason: "equipment-breakdown" });
        for (const id of scrappedLots) {
          const lot = state.lots[id]!;
          emit({ type: "lot.scrapped", tick: state.tick, device: event.device, lot: id, family: lot.family, resource: lot.resource, reason: "equipment-breakdown" });
        }
      }
      if (activeJob) mutateFactoryState(state, { kind: "job.finish", device: event.device });
      for (const connection of Object.values(project.connections).sort((left, right) => left.id.localeCompare(right.id))) {
        for (const stageName of ["loader", "unloader"] as const) {
          const stage = transportStage(connection, stageName);
          if (stage.device!.id !== event.device) continue;
          for (const transit of state.transports[connection.id]!.filter((item) => item.phase === transportPhase(stageName))) {
            const key = transportWorkKey(connection.id, stageName, transit.id);
            const existing = pausedTransportWork[key];
            const proportional = proportionalTransportWork[key];
            const proportionalRemaining = proportional
              ? Math.max(0, proportional.remainingTicks - Math.max(0, state.tick - proportional.resumedAt) * proportional.satisfactionPpm / POWER_SATISFACTION_SCALE)
              : undefined;
            delete proportionalTransportWork[key];
            pausedTransportWork[key] = {
              connection: connection.id, device: event.device, stage: stageName, transitId: transit.id,
              remainingTicks: existing?.remainingTicks ?? proportionalRemaining ?? Math.max(1, transit.readyTick - state.tick), reason: "failure",
            };
            mutateFactoryState(state, {
              kind: "transport.update", connection: connection.id, transitId: transit.id,
              changes: { readyTick: Number.MAX_SAFE_INTEGER, ...(stageName === "unloader" ? { arriveTick: Number.MAX_SAFE_INTEGER } : {}) },
            });
          }
        }
      }
      mutateFactoryState(state, { kind: "idle-power", device: event.device, powered: false });
      setStatus(event.device, "failed"); emit({ type: "device.breakdown", tick: state.tick, device: event.device });
    } else if (event.kind === "recover") {
      const toolingHold = state.devices[event.device]!.productionTooling?.hold;
      if (toolingHold) {
        const occupiedTicks = state.tick - toolingHold.acquiredAtTick;
        mutateFactoryState(state, {
          kind: "tooling.release", device: event.device, provider: toolingHold.provider,
          amounts: toolingHold.amounts, occupiedTicks, outcome: "cancelled",
        });
        emit({
          type: "device.tooling-released", tick: state.tick, device: event.device,
          process: toolingHold.process, provider: toolingHold.provider,
          tooling: structuredClone(toolingHold.amounts), occupiedTicks, outcome: "cancelled",
        });
      }
      const recoveredDevice = project.devices[event.device]!;
      if (state.devices[event.device]!.energyManagement?.mode === "sleeping") setStatus(event.device, "sleeping");
      else markDeviceIdle(recoveredDevice);
      emit({ type: "device.recover", tick: state.tick, device: event.device });
      for (const [key, work] of Object.entries(pausedTransportWork).sort(([left], [right]) => left.localeCompare(right))) {
        if (work.device !== event.device || work.reason !== "failure") continue;
        const transit = state.transports[work.connection]?.find((item) => item.id === work.transitId);
        if (!transit || transit.phase !== transportPhase(work.stage)) { delete pausedTransportWork[key]; continue; }
        const readyTick = state.tick + work.remainingTicks;
        startProportionalTransportWork(work.connection, work.stage, work.transitId, work.device, work.remainingTicks);
        mutateFactoryState(state, {
          kind: "transport.update", connection: work.connection, transitId: work.transitId,
          changes: { readyTick, ...(work.stage === "unloader" ? { arriveTick: readyTick } : {}) },
        });
        schedule(readyTick, work.stage === "loader" ? 8 : 7, work.stage === "loader"
          ? { kind: "belt-step", connection: work.connection, transitId: work.transitId }
          : { kind: "arrive", connection: work.connection, transitId: work.transitId });
        delete pausedTransportWork[key];
        syncTransportEndpointStatus(project.connections[work.connection]!, work.stage);
      }
    } else {
      event satisfies never;
    }
    settle();
  }
  measureUntil(untilTick);
  for (const id of Object.keys(project.devices)) {
    const runtime = state.devices[id]!; const durations = stats.durations[id] ??= {};
    durations[runtime.status] = (durations[runtime.status] ?? 0) + state.tick - statusSince[id]!;
    if (runtime.activeJob) {
      const activeProgress = runtime.status === "processing"
        ? Math.min(runtime.activeJob.remainingTicks, Math.max(0, state.tick - runtime.activeJob.resumedAt) * runtime.activeJob.powerSatisfactionPpm / POWER_SATISFACTION_SCALE) : 0;
      mutateFactoryState(state, { kind: "progress", device: id, progressTicks: runtime.activeJob.workedTicks + activeProgress });
    }
  }
  mutateFactoryState(state, { kind: "lot.checkpoint", lotIds: Object.keys(state.lots).sort() });
  const reason = publicEventCount >= maxEvents ? "max-events" : "until-tick";
  emit({ type: "simulation.completed", tick: state.tick, reason });
  const metrics = evaluateFactory(project, state, stats, events);
  const runKey = hashValue({ ...project.hashes, seed, untilTick, maxEvents });
  const resultHash = hashValue({ runKey, events, state, metrics });
  return { state, events, metrics, resultHash, runKey };
}
