import { DeterministicPriorityQueue } from "./priority-queue";
import { evaluateFactory, type SimulationStats } from "./evaluator";
import { evaluateDeviceProgram } from "./device-runtime";
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
    devices[id] = { status: "idle", buffers };
  }
  const transports = Object.fromEntries(Object.keys(project.connections).sort().map((id) => [id, [] as BeltTransit[]]));
  const logisticsTransports = Object.fromEntries(Object.keys(project.logisticsNetworks).sort().map((id) => [id, [] as ResourceTransit[]]));
  const grids = Object.fromEntries(Object.values(project.powerGrids).sort((a, b) => a.id.localeCompare(b.id)).map((grid) => [grid.id, {
    availableMilliWatts: grid.members.reduce((sum, id) => sum + (project.devices[id]!.generationPlan?.kind === "renewable" ? project.devices[id]!.generationPlan.outputMilliWatts : 0), 0),
    consumedMilliJoules: 0,
  }]));
  const availableMilliWatts = Object.values(grids).reduce((sum, grid) => sum + grid.availableMilliWatts, 0);
  const resourceNodes = Object.fromEntries(Object.values(project.resourceNodes).sort((a, b) => a.id.localeCompare(b.id)).map((node) => [node.id, { remaining: node.amount, reserved: 0, extracted: 0 }]));
  return { tick: 0, devices, resourceNodes, transports, logisticsTransports, produced: {}, consumed: {}, energy: { availableMilliWatts, consumedMilliJoules: 0, grids, fuelConsumed: {} }, completedOrders: 0 };
}

export function runUntil(project: CompiledFactoryProject, initialState = createInitialFactoryState(project), options: RunOptions = {}): SimulationResult {
  const untilTick = options.untilTick ?? project.scenario.durationTicks;
  const maxEvents = options.maxEvents ?? 1_000_000;
  const seed = options.seed ?? 0;
  const state: FactoryState = structuredClone(initialState);
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
    return sum + (runtime.activeJob?.powerMilliWatts ?? 0);
  }, 0) + activeTransportPower(grid);
  const availablePower = (grid?: string) => Object.values(project.devices).reduce((sum, device) => {
    if (grid !== undefined && device.powerGrid !== grid) return sum;
    if (state.devices[device.id]!.status === "failed") return sum;
    if (device.generationPlan?.kind === "renewable") return sum + device.generationPlan.outputMilliWatts;
    return sum + (state.devices[device.id]!.activeJob?.generationMilliWatts ?? 0);
  }, 0);
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
      const available = availablePower(grid); const transportLoad = activeTransportPower(grid); const nonTransportLoad = activePower(grid) - transportLoad;
      const consumedMilliJoules = Math.min(available, nonTransportLoad + transportLoad) * delta / 1000;
      stats.transportEnergyConsumedMilliJoules += Math.min(transportLoad, Math.max(0, available - nonTransportLoad)) * delta / 1000;
      if (consumedMilliJoules) mutateFactoryState(state, { kind: "energy", grid, consumedMilliJoules });
    }
    mutateFactoryState(state, { kind: "tick", tick }); stats.elapsedTicks = tick;
  };
  const accepts = (device: CompiledDevice, buffer: string, resource: string) => {
    const contract = device.buffers[buffer]!.accepts;
    return contract.includes("*") || contract.includes(resource);
  };
  const incomingQuantity = (device: string, buffer: string, resource?: string) => [...Object.values(state.transports).flat(), ...Object.values(state.logisticsTransports).flat()]
    .filter((transit) => transit.to === device && transit.toBuffer === buffer && (resource === undefined || transit.resource === resource))
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

  const dispatch = (): boolean => {
    let moved = false;
    const sourceIds = [...new Set(Object.values(project.connections).map((connection) => connection.from.device))].sort();
    const sourceOrderedConnections = sourceIds.flatMap((sourceId) => {
      const outgoing = Object.values(project.connections).filter((connection) => connection.from.device === sourceId).sort((a, b) => a.id.localeCompare(b.id));
      const outputPriority = project.devices[sourceId]!.policy?.outputPriority;
      if (outputPriority) return outgoing.sort((a, b) => Number(b.from.port === outputPriority) - Number(a.from.port === outputPriority) || a.id.localeCompare(b.id));
      if (outgoing.length < 2 || (project.devices[sourceId]!.policy?.dispatch ?? project.blueprint.policies?.dispatch ?? "fifo") === "fifo") return outgoing;
      const cursor = dispatchCursors[sourceId] ?? 0;
      return [...outgoing.slice(cursor % outgoing.length), ...outgoing.slice(0, cursor % outgoing.length)];
    });
    const orderedConnections = sourceOrderedConnections.map((connection, index) => ({
      connection, index,
      inputPriority: Number(project.devices[connection.to.device]!.policy?.inputPriority === connection.to.port),
    })).sort((a, b) => b.inputPriority - a.inputPriority || a.index - b.index).map((item) => item.connection);
    for (const connection of orderedConnections) {
      const sourceState = state.devices[connection.from.device]!;
      const sourceBuffer = sourceState.buffers[connection.fromPort.buffer]!;
      const targetState = state.devices[connection.to.device]!;
      if ((usesPersistentPower(connection.fromDevice) && sourceState.status === "unpowered") || (usesPersistentPower(connection.toDevice) && targetState.status === "unpowered")) continue;
      const loader = transportStage(connection, "loader");
      if (state.transports[connection.id]!.filter((transit) => transit.phase === "loading").length >= loader.capacity) continue;
      const filter = connection.fromDevice.policy?.filter;
      const resource = Object.keys(sourceBuffer).sort().find((id) => {
        if ((sourceBuffer[id] ?? 0) <= 0 || !accepts(connection.toDevice, connection.toPort.buffer, id)) return false;
        if (!filter) return true;
        return connection.from.port === filter.outputPort ? id === filter.resource : id !== filter.resource;
      });
      if (!resource) continue;
      const readyTick = nextDispatchTick[connection.id]!;
      if (state.tick < readyTick) {
        scheduleLogisticsReady(connection.id, readyTick);
        continue;
      }
      if (!transportStagePowered(connection, "loader")) continue;
      const freeCapacity = freeBufferCapacity(connection.to.device, connection.toPort.buffer, resource);
      const count = Math.min(sourceBuffer[resource] ?? 0, freeCapacity, connection.stackSizeByResource[resource] ?? 1);
      if (count <= 0) continue;
      mutateFactoryState(state, { kind: "buffer", device: connection.from.device, buffer: connection.fromPort.buffer, resource, delta: -count });
      const transit: BeltTransit = {
        id: `transit-${String(transitSequence++).padStart(6, "0")}`, resource, count,
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
      if ((connection.fromDevice.policy?.dispatch ?? project.blueprint.policies?.dispatch) === "round-robin") {
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
        const cursor = (stationDispatchCursors[network.id] ?? 0) % network.routes.length;
        let selected: { route: (typeof network.routes)[number]; routeIndex: number; available: number; free: number } | undefined;
        for (let offset = 0; offset < network.routes.length; offset++) {
          const routeIndex = (cursor + offset) % network.routes.length;
          const route = network.routes[routeIndex]!;
          const sourceDevice = project.devices[route.from]!;
          const targetDevice = project.devices[route.to]!;
          const sourceState = state.devices[route.from]!;
          const targetState = state.devices[route.to]!;
          const residentTarget = targetState.buffers[route.toBuffer]![route.resource] ?? 0;
          const available = Math.max(0, (sourceState.buffers[route.fromBuffer]![route.resource] ?? 0) - route.supplyReserve);
          const targetFree = route.demandTarget - residentTarget - incomingQuantity(route.to, route.toBuffer, route.resource);
          const free = Math.max(0, Math.min(freeBufferCapacity(route.to, route.toBuffer, route.resource), targetFree));
          if (sourceState.status === "failed" || targetState.status === "failed" || available < route.minimumBatch || free < route.minimumBatch
            || !infrastructurePowered(sourceDevice) || !infrastructurePowered(targetDevice)) continue;
          if (!selected || route.demandPriority > selected.route.demandPriority
            || (route.demandPriority === selected.route.demandPriority && route.supplyPriority > selected.route.supplyPriority)) {
            selected = { route, routeIndex, available, free };
          }
        }
        if (!selected) break;
        const { route, routeIndex, available, free } = selected;
        stationDispatchCursors[network.id] = (routeIndex + 1) % network.routes.length;
        const count = Math.min(route.capacity, available, free);
        mutateFactoryState(state, { kind: "buffer", device: route.from, buffer: route.fromBuffer, resource: route.resource, delta: -count });
        const transit: ResourceTransit = {
          id: `transit-${String(transitSequence++).padStart(6, "0")}`,
          resource: route.resource,
          count,
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
    return (state.devices[device.id]!.buffers[amount.buffer]![amount.resource] ?? 0) >= amount.count;
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
  const applyConsume = (device: CompiledDevice, amounts: ResourceBufferQuantity[], delivered: boolean) => {
    for (const amount of amounts) {
      mutateFactoryState(state, { kind: "buffer", device: device.id, buffer: amount.buffer, resource: amount.resource, delta: -amount.count });
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
      const job = { operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks, powerMilliWatts: required, produce, extraction: { node: node.id, count: decision.count } };
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
        operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks, powerMilliWatts: 0, produce: [],
        generationMilliWatts: plan.outputMilliWatts, fuel: { resource: fuel.resource, count: 1, energyMilliJoules: fuel.energyMilliJoules },
      };
      setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
      emit({ type: "power.fuel-loaded", tick: state.tick, device: device.id, grid: device.powerGrid!, resource: fuel.resource, count: 1, energyMilliJoules: fuel.energyMilliJoules, durationTicks: fuel.durationTicks });
      emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks });
      schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
      return true;
    }
    if (!allAmountsKnown(device, decision.consume)) throw new Error(`Device program '${device.asset}' referenced an unknown resource or buffer`);
    if (!decision.consume.every((amount) => amountAvailable(device, amount))) { setStatus(device.id, "waiting-input"); return false; }
    if (decision.kind === "consume") { applyConsume(device, decision.consume, true); setStatus(device.id, "idle"); return true; }
    if (!allAmountsKnown(device, decision.produce)) throw new Error(`Device program '${device.asset}' referenced an unknown output resource or buffer`);
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
    const job = { operation: decision.operation, startedAt: state.tick, durationTicks: decision.durationTicks, powerMilliWatts: required, produce: structuredClone(decision.produce) };
    setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, job });
    emit({ type: "device.start", tick: state.tick, device: device.id, operation: decision.operation, durationTicks: decision.durationTicks });
    schedule(state.tick + decision.durationTicks, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
    return true;
  };
  const tryEvaluate = (device: CompiledDevice): boolean => {
    const runtime = state.devices[device.id]!;
    if (runtime.status === "failed" || runtime.status === "processing" || device.assetDef.capabilities.includes("station")) return false;
    const decision = evaluateDeviceProgram(device.asset, device.assetDef.program, {
      apiVersion: 1, tick: state.tick,
      device: { id: device.id, asset: device.asset, config: device.config ?? {} },
      buffers: runtime.buffers,
      ...(device.processPlan ? { process: {
        id: device.processPlan.definition.id,
        name: device.processPlan.definition.name,
        category: device.processPlan.definition.category,
        durationTicks: device.processPlan.durationTicks,
        inputs: device.processPlan.inputs,
        outputs: device.processPlan.outputs,
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
  const settle = () => {
    let changed = true; let guard = 0;
    while (changed && guard++ < 100_000) {
      syncPowerAvailability();
      const evaluationOrder = Object.values(project.devices).sort((a, b) => Number(Boolean(b.generationPlan)) - Number(Boolean(a.generationPlan)) || a.id.localeCompare(b.id));
      let generationChanged = false;
      for (const device of evaluationOrder.filter((item) => item.generationPlan)) if (tryEvaluate(device)) generationChanged = true;
      syncPowerAvailability();
      const stationPowerChanged = refreshInfrastructurePower();
      const physicalMoved = dispatch();
      const stationMoved = dispatchStations();
      changed = generationChanged || stationPowerChanged || physicalMoved || stationMoved;
      for (const device of evaluationOrder.filter((item) => !item.generationPlan)) if (tryEvaluate(device)) changed = true;
    }
    syncPowerAvailability();
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
        mutateFactoryState(state, { kind: "buffer", device: event.device, buffer: output.buffer, resource: output.resource, delta: output.count });
        mutateFactoryState(state, { kind: "produced", resource: output.resource, count: output.count });
      }
      if (job.extraction) {
        const node = project.resourceNodes[job.extraction.node]!;
        mutateFactoryState(state, { kind: "resource.extracted", node: node.id, count: job.extraction.count });
        emit({ type: "resource.extracted", tick: state.tick, device: event.device, node: node.id, resource: node.resource, count: job.extraction.count, remaining: state.resourceNodes[node.id]!.remaining });
        if (state.resourceNodes[node.id]!.remaining === 0 && state.resourceNodes[node.id]!.reserved === 0) emit({ type: "resource.depleted", tick: state.tick, node: node.id, resource: node.resource });
      }
      if (job.fuel) emit({ type: "power.fuel-spent", tick: state.tick, device: event.device, grid: project.devices[event.device]!.powerGrid!, resource: job.fuel.resource, count: job.fuel.count });
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
      mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count });
      stats.connectionDeliveredItems[event.connection] = (stats.connectionDeliveredItems[event.connection] ?? 0) + transit.count;
      const deliveredByResource = stats.connectionDeliveredByResource[event.connection] ??= {};
      deliveredByResource[transit.resource] = (deliveredByResource[transit.resource] ?? 0) + transit.count;
      emit({ type: "resource.arrive", tick: state.tick, transit: { ...transit }, connection: event.connection });
    } else if (event.kind === "station-arrive") {
      const transits = state.logisticsTransports[event.network]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!;
      mutateFactoryState(state, { kind: "logistics.remove", network: event.network, transitId: transit.id });
      mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count });
      emit({ type: "logistics.arrive", tick: state.tick, transit: { ...transit }, network: event.network, route: event.route });
    } else if (event.kind === "logistics-ready") {
      if (scheduledDispatchTick[event.connection] === state.tick) delete scheduledDispatchTick[event.connection];
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
    if (runtime.status === "processing" && runtime.activeJob) mutateFactoryState(state, { kind: "progress", device: id, progressTicks: state.tick - runtime.activeJob.startedAt });
  }
  const reason = publicEventCount >= maxEvents ? "max-events" : "until-tick";
  emit({ type: "simulation.completed", tick: state.tick, reason });
  const metrics = evaluateFactory(project, state, stats);
  const runKey = hashValue({ ...project.hashes, seed, untilTick, maxEvents });
  const resultHash = hashValue({ runKey, events, state, metrics });
  return { state, events, metrics, resultHash, runKey };
}
