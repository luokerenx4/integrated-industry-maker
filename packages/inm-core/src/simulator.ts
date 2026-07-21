import { DeterministicPriorityQueue } from "./priority-queue";
import { evaluateFactory, type SimulationStats } from "./evaluator";
import { evaluateDeviceProgram } from "./device-runtime";
import { connectionDispatchProfiles, effectiveDispatchPolicy, resourceCriticalDepth, stationRouteDispatchProfile } from "./dispatch-priority";
import type {
  BeltTransit, CompiledDevice, CompiledFactoryProject, DeviceProgramDecision, DeviceRuntimeState, FactoryEvent, FactoryState,
  ResourceBufferQuantity, ResourceTransit, SimulationResult,
} from "./types";
import { hashValue } from "./utils";
import { mutateFactoryState } from "./state";

type InternalEvent =
  | { kind: "complete"; device: string; generation: number }
  | { kind: "belt-step"; connection: string; transitId: string }
  | { kind: "arrive"; connection: string; transitId: string }
  | { kind: "station-arrive"; network: string; route: string; transitId: string }
  | { kind: "logistics-ready"; connection: string }
  | { kind: "power-boundary"; grid: string; generation: number }
  | { kind: "breakdown"; device: string }
  | { kind: "recover"; device: string };

export interface RunOptions { untilTick?: number; maxEvents?: number; seed?: number }

function quantity(inventory: Record<string, number>): number { return Object.values(inventory).reduce((sum, count) => sum + count, 0); }
function deviceQuantity(state: DeviceRuntimeState): number { return Object.values(state.buffers).reduce((sum, inventory) => sum + quantity(inventory), 0); }

export function createInitialFactoryState(project: CompiledFactoryProject): FactoryState {
  const devices: Record<string, DeviceRuntimeState> = {};
  for (const id of Object.keys(project.devices).sort()) {
    const buffers = Object.fromEntries(project.devices[id]!.assetDef.buffers.map((buffer) => [
      buffer.id, { ...(project.scenario.initialBuffers?.[id]?.[buffer.id] ?? {}) },
    ]));
    const materialBatches = Object.fromEntries(Object.entries(buffers).map(([buffer, inventory]) => [
      buffer, Object.fromEntries(Object.entries(inventory).filter(([, count]) => count > 0).map(([resource, count]) => [resource, { "0": count }])),
    ]));
    const storage = project.devices[id]!.storagePlan;
    const initialMilliJoules = project.scenario.initialEnergyMilliJoules?.[id] ?? 0;
    devices[id] = {
      status: "idle", buffers, materialBatches,
      ...(storage ? { energyStorage: {
        capacityMilliJoules: storage.capacityMilliJoules,
        storedMilliJoules: initialMilliJoules,
        initialMilliJoules,
        chargedMilliJoules: 0,
        dischargedMilliJoules: 0,
      } } : {}),
    };
  }
  for (const treatment of project.scenario.initialTreatments ?? []) {
    const batches = devices[treatment.device]!.materialBatches[treatment.buffer]![treatment.resource]!;
    batches["0"]! -= treatment.count;
    if (batches["0"] === 0) delete batches["0"];
    batches[String(treatment.level)] = (batches[String(treatment.level)] ?? 0) + treatment.count;
  }
  const transports = Object.fromEntries(Object.keys(project.connections).sort().map((id) => [id, [] as BeltTransit[]]));
  const logisticsTransports = Object.fromEntries(Object.keys(project.logisticsNetworks).sort().map((id) => [id, [] as ResourceTransit[]]));
  const grids = Object.fromEntries(Object.values(project.powerGrids).sort((a, b) => a.id.localeCompare(b.id)).map((grid) => {
    const renewable = grid.members.reduce((sum, id) => sum + (project.devices[id]!.generationPlan?.kind === "renewable" ? project.devices[id]!.generationPlan.outputMilliWatts : 0), 0);
    const storedMilliJoules = grid.storageDevices.reduce((sum, id) => sum + (devices[id]!.energyStorage?.storedMilliJoules ?? 0), 0);
    const discharge = grid.storageDevices.reduce((sum, id) => sum + ((devices[id]!.energyStorage?.storedMilliJoules ?? 0) > 0 ? project.devices[id]!.storagePlan!.dischargeMilliWatts : 0), 0);
    return [grid.id, {
      availableMilliWatts: renewable + discharge,
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
    tick: 0, devices, resourceNodes, transports, logisticsTransports, produced: {}, consumed: {},
    energy: { availableMilliWatts, consumedMilliJoules: 0, grids, fuelConsumed: {} }, completedOrders: 0,
    materialTreatment: { treated: {}, agentsConsumed: {} },
  };
}

export function runUntil(project: CompiledFactoryProject, initialState = createInitialFactoryState(project), options: RunOptions = {}): SimulationResult {
  const untilTick = options.untilTick ?? project.scenario.durationTicks;
  const maxEvents = options.maxEvents ?? 1_000_000;
  const seed = options.seed ?? 0;
  const state: FactoryState = structuredClone(initialState);
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
    durations: {}, wipArea: 0, congestionArea: 0, beltOccupancyArea: 0, beltItemArea: 0, beltBlockedArea: 0, peakBeltItems: 0,
    transportStageActiveArea: {}, connectionOccupancyArea: {}, connectionBlockedArea: {}, connectionDepartedItems: {}, connectionDeliveredItems: {},
    connectionDepartedByResource: {}, connectionDeliveredByResource: {},
    consumedByRegion: {},
    transportEnergyConsumedMilliJoules: 0, elapsedTicks: state.tick,
  };
  let sequence = 0; let transitSequence = 0; let publicEventCount = 0;
  const dispatchCursors: Record<string, number> = {};
  const transportCellCursors: Record<string, number> = {};
  const transportPowerBlocked: Record<string, boolean> = {};
  const stationDispatchCursors: Record<string, number> = {};
  const nextDispatchTick: Record<string, number> = Object.fromEntries(Object.keys(project.connections).map((id) => [id, state.tick]));
  const scheduledDispatchTick: Record<string, number | undefined> = {};
  const scheduledPowerBoundaryTick: Record<string, number | undefined> = {};
  const powerBoundaryGenerations: Record<string, number> = Object.fromEntries(Object.keys(project.powerGrids).map((id) => [id, 0]));
  const schedule = (tick: number, priority: number, value: InternalEvent) => queue.push({ tick, priority, sequence: sequence++, value });
  const scheduleLogisticsReady = (connection: string, tick: number) => {
    if (scheduledDispatchTick[connection] !== undefined && scheduledDispatchTick[connection]! <= tick) return;
    scheduledDispatchTick[connection] = tick;
    schedule(tick, 11, { kind: "logistics-ready", connection });
  };
  const emit = (event: FactoryEvent) => { events.push(event); publicEventCount++; };
  const setStatus = (device: string, status: DeviceRuntimeState["status"]) => {
    const runtime = state.devices[device]!;
    if (runtime.status === status) return;
    const durations = stats.durations[device] ??= {};
    durations[runtime.status] = (durations[runtime.status] ?? 0) + state.tick - statusSince[device]!;
    statusSince[device] = state.tick;
    mutateFactoryState(state, { kind: "status", device, status });
  };
  const usesPersistentPower = (device: CompiledDevice) => device.assetDef.capabilities.includes("station") || device.assetDef.capabilities.includes("transport-junction");
  const transportStage = (connection: CompiledFactoryProject["connections"][string], stage: "loader" | "unloader") => connection.logisticsStages.find((item) => item.stage === stage)!;
  const infrastructureBasePower = (grid?: string) => Object.entries(state.devices).reduce((sum, [id, runtime]) => {
    const device = project.devices[id]!;
    if (!usesPersistentPower(device) || runtime.status === "failed") return sum;
    if (grid !== undefined && device.powerGrid !== grid) return sum;
    return sum + device.assetDef.power.consumptionMilliWatts;
  }, 0);
  const activeTransportPower = (grid?: string) => Object.entries(state.transports).reduce((sum, [connectionId, transits]) => {
    const connection = project.connections[connectionId]!;
    return sum + (["loader", "unloader"] as const).reduce((stageSum, stageName) => {
      const phase = stageName === "loader" ? "loading" : "unloading";
      if (!transits.some((transit) => transit.phase === phase)) return stageSum;
      const stage = transportStage(connection, stageName);
      if (grid !== undefined && stage.powerGrid !== grid) return stageSum;
      return stageSum + stage.asset.power.consumptionMilliWatts;
    }, 0);
  }, 0);
  const activePower = (grid?: string) => infrastructureBasePower(grid) + Object.entries(state.devices).reduce((sum, [id, runtime]) => {
    if (grid !== undefined && project.devices[id]!.powerGrid !== grid) return sum;
    return sum + (runtime.status === "processing" ? runtime.activeJob?.powerMilliWatts ?? 0 : 0);
  }, 0) + activeTransportPower(grid);
  const generationPower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    if (grid !== undefined && device.powerGrid !== grid) return sum;
    if (state.devices[device.id]!.status === "failed") return sum;
    if (device.generationPlan?.kind === "renewable") return sum + device.generationPlan.outputMilliWatts;
    return sum + (state.devices[device.id]!.activeJob?.generationMilliWatts ?? 0);
  }, 0);
  const storageDischargePower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    if (!device.storagePlan || (grid !== undefined && device.powerGrid !== grid) || state.devices[device.id]!.status === "failed") return sum;
    return sum + ((state.devices[device.id]!.energyStorage?.storedMilliJoules ?? 0) > 1e-9 ? device.storagePlan.dischargeMilliWatts : 0);
  }, 0);
  const availablePower = (grid?: string) => generationPower(grid) + storageDischargePower(grid);
  const syncPowerAvailability = () => {
    for (const grid of Object.keys(project.powerGrids)) state.energy.grids[grid]!.availableMilliWatts = availablePower(grid);
    state.energy.availableMilliWatts = availablePower();
  };
  const measureUntil = (tick: number) => {
    const delta = tick - state.tick;
    if (delta <= 0) return;
    const wip = Object.values(state.devices).reduce((sum, runtime) => sum + deviceQuantity(runtime), 0)
      + Object.values(state.transports).flat().reduce((sum, transit) => sum + transit.count, 0)
      + Object.values(state.logisticsTransports).flat().reduce((sum, transit) => sum + transit.count, 0);
    const beltTransits = Object.values(state.transports).flat().filter((transit) => transit.phase === "belt");
    const occupiedBeltCells = beltTransits.length;
    const beltItems = beltTransits.reduce((sum, transit) => sum + transit.count, 0);
    const blockedBeltItems = Object.values(state.transports).flat().filter((transit) => transit.blockedBy).reduce((sum, transit) => sum + transit.count, 0);
    const connectionCongestion = occupiedBeltCells / Math.max(1, Object.keys(project.transportCells).length) * Object.keys(project.connections).length;
    const stationCongestion = Object.entries(state.logisticsTransports).reduce((sum, [id, transits]) => sum + transits.length / project.logisticsNetworks[id]!.fleetSize, 0);
    const congestion = connectionCongestion + stationCongestion;
    stats.wipArea += wip * delta; stats.congestionArea += congestion * delta;
    stats.beltOccupancyArea += occupiedBeltCells * delta;
    stats.beltItemArea += beltItems * delta;
    stats.beltBlockedArea += blockedBeltItems * delta;
    stats.peakBeltItems = Math.max(stats.peakBeltItems, beltItems);
    for (const [connectionId, transits] of Object.entries(state.transports)) {
      const active = stats.transportStageActiveArea[connectionId] ??= { loader: 0, unloader: 0 };
      active.loader += transits.filter((transit) => transit.phase === "loading").length * delta;
      active.unloader += transits.filter((transit) => transit.phase === "unloading").length * delta;
      stats.connectionOccupancyArea[connectionId] = (stats.connectionOccupancyArea[connectionId] ?? 0)
        + transits.reduce((sum, transit) => sum + transit.count, 0) * delta;
      stats.connectionBlockedArea[connectionId] = (stats.connectionBlockedArea[connectionId] ?? 0)
        + transits.filter((transit) => transit.blockedBy).reduce((sum, transit) => sum + transit.count, 0) * delta;
    }
    for (const grid of Object.keys(project.powerGrids).sort()) {
      const generated = generationPower(grid); const load = activePower(grid);
      const storageDevices = project.powerGrids[grid]!.storageDevices.map((id) => project.devices[id]!)
        .filter((device) => state.devices[device.id]!.status !== "failed").sort((a, b) => a.id.localeCompare(b.id));
      let transferredMilliJoules = 0;
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
          remaining -= amount;
          if (before < storage.capacityMilliJoules - 1e-9 && storage.storedMilliJoules >= storage.capacityMilliJoules - 1e-9) emit({ type: "power.storage-full", tick, device: device.id, grid, storedMilliJoules: storage.storedMilliJoules });
        }
      }
      const deliveredPower = Math.min(load, generated + transferredMilliJoules * 1000 / delta);
      const transportLoad = activeTransportPower(grid); const nonTransportLoad = load - transportLoad;
      const consumedMilliJoules = deliveredPower * delta / 1000;
      stats.transportEnergyConsumedMilliJoules += Math.min(transportLoad, Math.max(0, deliveredPower - nonTransportLoad)) * delta / 1000;
      if (consumedMilliJoules) mutateFactoryState(state, { kind: "energy", grid, consumedMilliJoules });
    }
    mutateFactoryState(state, { kind: "tick", tick }); stats.elapsedTicks = tick;
  };
  const nextPowerBoundaryDelay = (grid: string): number | undefined => {
    const generated = generationPower(grid); const load = activePower(grid);
    const devices = project.powerGrids[grid]!.storageDevices.map((id) => project.devices[id]!)
      .filter((device) => state.devices[device.id]!.status !== "failed").sort((a, b) => a.id.localeCompare(b.id));
    let remainingPower = Math.abs(generated - load);
    if (remainingPower <= 0) return undefined;
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
    const stage = transportStage(connection, stageName); const required = stage.asset.power.consumptionMilliWatts;
    if (required <= 0) return true;
    const grid = stage.powerGrid ?? null;
    const phase = stageName === "loader" ? "loading" : "unloading";
    const alreadyActive = state.transports[connection.id]!.some((transit) => transit.phase === phase);
    const available = grid ? Math.max(0, availablePower(grid) - activePower(grid)) : 0;
    const hasPower = Boolean(grid) && (alreadyActive ? availablePower(grid!) >= activePower(grid!) : available >= required);
    const key = `${connection.id}:${stageName}`;
    if (!hasPower) {
      if (!transportPowerBlocked[key]) emit({ type: "transport.power-shortage", tick: state.tick, connection: connection.id, stage: stageName, grid, requiredMilliWatts: required, availableMilliWatts: available });
      transportPowerBlocked[key] = true; return false;
    }
    if (transportPowerBlocked[key]) emit({ type: "transport.power-restored", tick: state.tick, connection: connection.id, stage: stageName, grid: grid! });
    delete transportPowerBlocked[key]; return true;
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
  const markBlocked = (connectionId: string, transit: BeltTransit, waitingFor: string, retryTicks: number) => {
    const firstBlock = transit.blockedBy !== waitingFor;
    mutateFactoryState(state, { kind: "transport.update", connection: connectionId, transitId: transit.id, changes: { readyTick: state.tick + retryTicks, blockedBy: waitingFor } });
    if (firstBlock) {
      const connection = project.connections[connectionId]!;
      const cell = transit.phase === "belt" ? connection.transportCells[transit.cellIndex]! : null;
      emit({ type: "resource.belt-blocked", tick: state.tick, transit: { ...transit }, connection: connectionId, cell, waitingFor });
    }
    schedule(state.tick + retryTicks, 8, { kind: "belt-step", connection: connectionId, transitId: transit.id });
  };
  const clearBlocked = (connectionId: string, transit: BeltTransit) => {
    if (!transit.blockedBy) return;
    mutateFactoryState(state, { kind: "transport.update", connection: connectionId, transitId: transit.id, changes: { blockedBy: null } });
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
      mutateFactoryState(state, { kind: "buffer", device: connection.from.device, buffer: connection.fromPort.buffer, resource, delta: -count, treatmentLevel: sourceLevel });
      const transit: BeltTransit = {
        id: `transit-${String(transitSequence++).padStart(6, "0")}`, resource, count, treatmentLevel: sourceLevel,
        from: connection.from.device, fromBuffer: connection.fromPort.buffer,
        to: connection.to.device, toBuffer: connection.toPort.buffer,
        departTick: state.tick, arriveTick: state.tick + connection.travelTicks,
        phase: "loading", cellIndex: -1, readyTick: state.tick + loader.durationTicks,
      };
      mutateFactoryState(state, { kind: "transport.add", connection: connection.id, transit });
      stats.connectionDepartedItems[connection.id] = (stats.connectionDepartedItems[connection.id] ?? 0) + transit.count;
      const departedByResource = stats.connectionDepartedByResource[connection.id] ??= {};
      departedByResource[transit.resource] = (departedByResource[transit.resource] ?? 0) + transit.count;
      emit({ type: "resource.depart", tick: state.tick, transit: { ...transit }, connection: connection.id });
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

  const infrastructurePowered = (device: CompiledDevice): boolean => {
    if (state.devices[device.id]!.status === "failed") return false;
    const required = device.assetDef.power.consumptionMilliWatts;
    if (required === 0) return true;
    const grid = device.powerGrid ?? null;
    const available = grid ? availablePower(grid) : 0;
    if (grid && activePower(grid) <= available) {
      if (state.devices[device.id]!.status === "unpowered") setStatus(device.id, "idle");
      return true;
    }
    if (state.devices[device.id]!.status !== "unpowered") {
      emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: Math.max(0, available - (grid ? activePower(grid) - required : 0)) });
    }
    setStatus(device.id, "unpowered");
    return false;
  };

  const refreshInfrastructurePower = (): boolean => {
    let changed = false;
    for (const device of Object.values(project.devices).filter(usesPersistentPower).sort((a, b) => a.id.localeCompare(b.id))) {
      const before = state.devices[device.id]!.status;
      infrastructurePowered(device);
      if (state.devices[device.id]!.status !== before) changed = true;
    }
    return changed;
  };

  const dispatchStations = (): boolean => {
    let moved = false;
    for (const network of Object.values(project.logisticsNetworks).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!network.routes.length) continue;
      const active = state.logisticsTransports[network.id]!;
      while (active.length < network.fleetSize) {
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
          const sourceDevice = project.devices[route.from]!;
          const targetDevice = project.devices[route.to]!;
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
            || !infrastructurePowered(sourceDevice) || !infrastructurePowered(targetDevice)) continue;
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
        mutateFactoryState(state, { kind: "buffer", device: route.from, buffer: route.fromBuffer, resource: route.resource, delta: -count, treatmentLevel: sourceLevel });
        const transit: ResourceTransit = {
          id: `transit-${String(transitSequence++).padStart(6, "0")}`,
          resource: route.resource,
          count,
          treatmentLevel: sourceLevel,
          from: route.from,
          fromBuffer: route.fromBuffer,
          to: route.to,
          toBuffer: route.toBuffer,
          departTick: state.tick,
          arriveTick: state.tick + route.travelTicks,
          logisticsRoute: route.id,
        };
        mutateFactoryState(state, { kind: "logistics.add", network: network.id, transit });
        emit({ type: "logistics.depart", tick: state.tick, transit: { ...transit }, network: network.id, route: route.id });
        schedule(transit.arriveTick, 10, { kind: "station-arrive", network: network.id, route: route.id, transitId: transit.id });
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
  const applyConsume = (device: CompiledDevice, amounts: ResourceBufferQuantity[], delivered: boolean) => {
    for (const amount of amounts) {
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
      if (delivered) {
        mutateFactoryState(state, { kind: "consumed", resource: amount.resource, count: amount.count });
        mutateFactoryState(state, { kind: "orders", count: amount.count });
        const regional = stats.consumedByRegion[device.region] ??= {};
        regional[amount.resource] = (regional[amount.resource] ?? 0) + amount.count;
        emit({ type: "resource.consumed", tick: state.tick, device: device.id, resource: amount.resource, count: amount.count });
      }
    }
  };
  const tryDecision = (device: CompiledDevice, decision: DeviceProgramDecision): boolean => {
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
      const required = decision.powerMilliWatts ?? device.assetDef.power.consumptionMilliWatts;
      const grid = device.powerGrid ?? null;
      const available = grid ? availablePower(grid) - activePower(grid) : 0;
      if (required > 0 && required > available) {
        if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: Math.max(0, available) });
        setStatus(device.id, "unpowered"); return false;
      }
      mutateFactoryState(state, { kind: "resource.reserve", node: node.id, count: decision.count });
      const job = {
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
        remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick,
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
      applyConsume(device, [amount], false);
      mutateFactoryState(state, { kind: "fuel", resource: fuel.resource, count: 1 });
      const job = {
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
        remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick, powerMilliWatts: 0, produce: [],
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
      const required = decision.powerMilliWatts ?? device.assetDef.power.consumptionMilliWatts;
      if (required !== device.assetDef.power.consumptionMilliWatts) throw new Error(`Treatment Device '${device.id}' must use its compiled active power`);
      const grid = device.powerGrid ?? null;
      const availablePowerForJob = grid ? availablePower(grid) - activePower(grid) : 0;
      if (required > 0 && required > availablePowerForJob) {
        if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: Math.max(0, availablePowerForJob) });
        setStatus(device.id, "unpowered"); return false;
      }
      mutateFactoryState(state, {
        kind: "buffer", device: device.id, buffer: plan.inputBuffer, resource: decision.resource,
        delta: -decision.count, treatmentLevel: decision.inputTreatmentLevel,
      });
      applyConsume(device, [agent], false);
      mutateFactoryState(state, { kind: "treatment.agent", resource: agent.resource, count: agent.count });
      const job = {
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
        remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick,
        powerMilliWatts: required, produce,
        treatment: {
          resource: decision.resource, fromLevel: decision.inputTreatmentLevel, toLevel: plan.mode.level, count: decision.count,
          agentResource: agent.resource, agentCount: agent.count,
        },
      };
      setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
      emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks });
      schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
      return true;
    }
    if (!allAmountsKnown(device, decision.consume)) throw new Error(`Device program '${device.asset}' referenced an unknown resource or buffer`);
    if (!decision.consume.every((amount) => amountAvailable(device, amount))) { setStatus(device.id, "waiting-input"); return false; }
    if (decision.kind === "consume") { applyConsume(device, decision.consume, true); setStatus(device.id, "idle"); return true; }
    if (!allAmountsKnown(device, decision.produce)) throw new Error(`Device program '${device.asset}' referenced an unknown output resource or buffer`);
    if (device.processPlan) {
      const plan = device.processPlan;
      const required = decision.powerMilliWatts ?? device.assetDef.power.consumptionMilliWatts;
      if (decision.operation !== plan.definition.id || decision.durationTicks !== plan.durationTicks
        || !sameAmounts(decision.consume, plan.inputs) || !sameAmounts(decision.produce, plan.outputs) || required !== plan.powerMilliWatts) {
        throw new Error(`Device program '${device.asset}' must execute compiled process '${plan.definition.id}' mode '${plan.mode.id}' exactly`);
      }
    }
    if (!outputFits(device, decision.produce)) {
      if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
      return false;
    }
    const required = decision.powerMilliWatts ?? device.assetDef.power.consumptionMilliWatts;
    const grid = device.powerGrid ?? null;
    const available = grid ? availablePower(grid) - activePower(grid) : 0;
    if (required > 0 && required > available) {
      if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, grid, requiredMilliWatts: required, availableMilliWatts: Math.max(0, available) });
      setStatus(device.id, "unpowered"); return false;
    }
    applyConsume(device, decision.consume, false);
    const job = {
      operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks,
      remainingTicks: decision.durationTicks, workedTicks: 0, resumedAt: state.tick,
      powerMilliWatts: required, produce: structuredClone(decision.produce),
    };
    setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
    emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks });
    schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
    return true;
  };
  const tryEvaluate = (device: CompiledDevice): boolean => {
    const runtime = state.devices[device.id]!;
    if (runtime.status === "failed" || runtime.activeJob || device.assetDef.capabilities.includes("station")) return false;
    const decision = evaluateDeviceProgram(device.asset, device.assetDef.program, {
      apiVersion: 1, tick: state.tick,
      device: { id: device.id, asset: device.asset, config: device.config ?? {} },
      buffers: runtime.buffers,
      materialBatches: runtime.materialBatches,
      ...(device.processPlan ? { process: {
        id: device.processPlan.definition.id,
        name: device.processPlan.definition.name,
        category: device.processPlan.definition.category,
        durationTicks: device.processPlan.durationTicks,
        mode: {
          id: device.processPlan.mode.id,
          name: device.processPlan.mode.name,
          inputCycles: device.processPlan.mode.inputCycles,
          outputCycles: device.processPlan.mode.outputCycles,
        },
        powerMilliWatts: device.processPlan.powerMilliWatts,
        inputs: device.processPlan.inputs,
        outputs: device.processPlan.outputs,
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
    return tryDecision(device, decision);
  };
  const rebalanceActiveJobPower = (): boolean => {
    let changed = false;
    for (const grid of Object.keys(project.powerGrids).sort()) {
      let remainingPower = Math.max(0, availablePower(grid) - infrastructureBasePower(grid) - activeTransportPower(grid));
      const jobs = project.powerGrids[grid]!.members.map((id) => project.devices[id]!).filter((device) => {
        const runtime = state.devices[device.id]!;
        return runtime.activeJob && runtime.status !== "failed" && !runtime.activeJob.generationMilliWatts;
      }).sort((a, b) => a.id.localeCompare(b.id));
      for (const device of jobs) {
        const runtime = state.devices[device.id]!; const job = runtime.activeJob!; const required = job.powerMilliWatts;
        if (required <= remainingPower) {
          remainingPower -= required;
          if (runtime.status === "unpowered") {
            mutateFactoryState(state, { kind: "job.power", device: device.id, remainingTicks: job.remainingTicks, workedTicks: job.workedTicks, resumedAt: state.tick });
            setStatus(device.id, "processing");
            emit({ type: "power.restored", tick: state.tick, device: device.id, grid, remainingTicks: job.remainingTicks });
            schedule(state.tick + job.remainingTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
            changed = true;
          }
          continue;
        }
        if (runtime.status !== "processing") continue;
        const elapsed = Math.min(job.remainingTicks, Math.max(0, state.tick - job.resumedAt));
        if (elapsed >= job.remainingTicks) continue;
        const remainingTicks = job.remainingTicks - elapsed; const workedTicks = job.workedTicks + elapsed;
        mutateFactoryState(state, { kind: "job.power", device: device.id, remainingTicks, workedTicks, resumedAt: state.tick });
        generations[device.id]!++;
        setStatus(device.id, "unpowered");
        emit({
          type: "power.shortage", tick: state.tick, device: device.id, grid,
          requiredMilliWatts: required, availableMilliWatts: remainingPower, remainingTicks, workedTicks,
        });
        changed = true;
      }
    }
    return changed;
  };
  const settle = () => {
    let changed = true; let guard = 0;
    while (changed && guard++ < 100_000) {
      syncPowerAvailability();
      const evaluationOrder = Object.values(project.devices).sort((a, b) => Number(Boolean(b.generationPlan)) - Number(Boolean(a.generationPlan)) || a.id.localeCompare(b.id));
      let generationChanged = false;
      for (const device of evaluationOrder.filter((item) => item.generationPlan)) if (tryEvaluate(device)) generationChanged = true;
      syncPowerAvailability();
      const jobPowerChanged = rebalanceActiveJobPower();
      const stationPowerChanged = refreshInfrastructurePower();
      const physicalMoved = dispatch();
      const stationMoved = dispatchStations();
      changed = generationChanged || jobPowerChanged || stationPowerChanged || physicalMoved || stationMoved;
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
  settle();
  while (queue.size && publicEventCount < maxEvents) {
    const item = queue.peek()!;
    if (item.tick > untilTick) break;
    queue.pop(); measureUntil(item.tick);
    const event = item.value;
    if (event.kind === "complete") {
      if (event.generation !== generations[event.device] || state.devices[event.device]!.status !== "processing") continue;
      const runtime = state.devices[event.device]!; const job = runtime.activeJob!;
      for (const output of job.produce) {
        mutateFactoryState(state, { kind: "buffer", device: event.device, buffer: output.buffer, resource: output.resource, delta: output.count, treatmentLevel: output.treatmentLevel });
        mutateFactoryState(state, { kind: "produced", resource: output.resource, count: output.count });
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
      setStatus(event.device, "idle"); mutateFactoryState(state, { kind: "job.finish", device: event.device });
      emit({ type: "device.finish", tick: state.tick, device: event.device, operation: job.operation, produced: structuredClone(job.produce) });
    } else if (event.kind === "belt-step") {
      const transit = state.transports[event.connection]?.find((item) => item.id === event.transitId);
      if (!transit || transit.readyTick !== state.tick || transit.phase === "unloading") continue;
      const connection = project.connections[event.connection]!;
      if (transit.phase === "belt" && transit.cellIndex === connection.transportCells.length - 1) {
        const unloader = transportStage(connection, "unloader");
        const unloading = state.transports[event.connection]!.filter((item) => item.phase === "unloading").length;
        if (unloading >= unloader.capacity) {
          markBlocked(event.connection, transit, `${connection.to.device}.${connection.to.port}`, connection.lineCellTravelTicks);
          continue;
        }
        if (!transportStagePowered(connection, "unloader")) {
          markBlocked(event.connection, transit, `power:${unloader.powerGrid ?? "disconnected"}`, connection.lineCellTravelTicks);
          continue;
        }
        clearBlocked(event.connection, transit);
        const arriveTick = state.tick + unloader.durationTicks;
        mutateFactoryState(state, {
          kind: "transport.update", connection: event.connection, transitId: transit.id,
          changes: { phase: "unloading", cellIndex: -1, readyTick: arriveTick, arriveTick },
        });
        emit({ type: "resource.unload-start", tick: state.tick, transit: { ...transit }, connection: event.connection });
        schedule(arriveTick, 7, { kind: "arrive", connection: event.connection, transitId: transit.id });
      } else {
        const targetIndex = transit.phase === "loading" ? 0 : transit.cellIndex + 1;
        const targetCell = connection.transportCells[targetIndex]!;
        const cell = project.transportCells[targetCell]!;
        const contenders = waitingConnections(targetCell);
        const cursor = (transportCellCursors[targetCell] ?? 0) % cell.connections.length;
        const preferred = contenders.length > 1
          ? [...cell.connections.slice(cursor), ...cell.connections.slice(0, cursor)].find((candidate) => contenders.includes(candidate))!
          : event.connection;
        if (occupiedCell(targetCell) || preferred !== event.connection) {
          markBlocked(event.connection, transit, targetCell, cell.travelTicks);
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
        emit({ type: "resource.belt-position", tick: state.tick, transit: { ...transit }, connection: event.connection, cell: targetCell, cellIndex: targetIndex });
        schedule(nextReadyTick, 8, { kind: "belt-step", connection: event.connection, transitId: transit.id });
      }
    } else if (event.kind === "arrive") {
      const transits = state.transports[event.connection]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!;
      if (transit.phase !== "unloading" || transit.readyTick !== state.tick) continue;
      mutateFactoryState(state, { kind: "transport.remove", connection: event.connection, transitId: transit.id });
      mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count, treatmentLevel: transit.treatmentLevel });
      stats.connectionDeliveredItems[event.connection] = (stats.connectionDeliveredItems[event.connection] ?? 0) + transit.count;
      const deliveredByResource = stats.connectionDeliveredByResource[event.connection] ??= {};
      deliveredByResource[transit.resource] = (deliveredByResource[transit.resource] ?? 0) + transit.count;
      emit({ type: "resource.arrive", tick: state.tick, transit: { ...transit }, connection: event.connection });
    } else if (event.kind === "station-arrive") {
      const transits = state.logisticsTransports[event.network]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!;
      mutateFactoryState(state, { kind: "logistics.remove", network: event.network, transitId: transit.id });
      mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count, treatmentLevel: transit.treatmentLevel });
      emit({ type: "logistics.arrive", tick: state.tick, transit: { ...transit }, network: event.network, route: event.route });
    } else if (event.kind === "logistics-ready") {
      if (scheduledDispatchTick[event.connection] === state.tick) delete scheduledDispatchTick[event.connection];
    } else if (event.kind === "power-boundary") {
      if (event.generation !== powerBoundaryGenerations[event.grid] || scheduledPowerBoundaryTick[event.grid] !== state.tick) continue;
      delete scheduledPowerBoundaryTick[event.grid];
    } else if (event.kind === "breakdown") {
      generations[event.device]!++;
      const activeJob = state.devices[event.device]!.activeJob;
      if (activeJob?.extraction) mutateFactoryState(state, { kind: "resource.release", node: activeJob.extraction.node, count: activeJob.extraction.count });
      if (activeJob) mutateFactoryState(state, { kind: "job.finish", device: event.device });
      setStatus(event.device, "failed"); emit({ type: "device.breakdown", tick: state.tick, device: event.device });
    } else {
      setStatus(event.device, "idle"); emit({ type: "device.recover", tick: state.tick, device: event.device });
    }
    settle();
  }
  measureUntil(untilTick);
  for (const id of Object.keys(project.devices)) {
    const runtime = state.devices[id]!; const durations = stats.durations[id] ??= {};
    durations[runtime.status] = (durations[runtime.status] ?? 0) + state.tick - statusSince[id]!;
    if (runtime.activeJob) {
      const activeProgress = runtime.status === "processing" ? Math.min(runtime.activeJob.remainingTicks, Math.max(0, state.tick - runtime.activeJob.resumedAt)) : 0;
      mutateFactoryState(state, { kind: "progress", device: id, progressTicks: runtime.activeJob.workedTicks + activeProgress });
    }
  }
  const reason = publicEventCount >= maxEvents ? "max-events" : "until-tick";
  emit({ type: "simulation.completed", tick: state.tick, reason });
  const metrics = evaluateFactory(project, state, stats);
  const runKey = hashValue({ ...project.hashes, seed, untilTick, maxEvents });
  const resultHash = hashValue({ runKey, events, state, metrics });
  return { state, events, metrics, resultHash, runKey };
}
