import { DeterministicPriorityQueue } from "./priority-queue";
import { evaluateFactory, type SimulationStats } from "./evaluator";
import type {
  CompiledDevice, CompiledFactoryProject, DeviceRuntimeState, FactoryEvent, FactoryState,
  MaterialTransit, SimulationResult,
} from "./types";
import { hashValue } from "./utils";
import { mutateFactoryState } from "./state";

type InternalEvent =
  | { kind: "complete"; device: string; generation: number }
  | { kind: "arrive"; connection: string; transitId: string }
  | { kind: "breakdown"; device: string }
  | { kind: "recover"; device: string };

export interface RunOptions { untilTick?: number; maxEvents?: number; seed?: number }

function quantity(inventory: Record<string, number>): number { return Object.values(inventory).reduce((sum, count) => sum + count, 0); }

export function createInitialFactoryState(project: CompiledFactoryProject): FactoryState {
  const devices: Record<string, DeviceRuntimeState> = {};
  for (const id of Object.keys(project.devices).sort()) {
    devices[id] = { status: "idle", inventory: { ...(project.scenario.initialInventories?.[id] ?? {}) } };
  }
  const transports = Object.fromEntries(Object.keys(project.connections).sort().map((id) => [id, [] as MaterialTransit[]]));
  const availableMilliWatts = Object.values(project.devices).reduce((sum, device) => device.assetDef.behavior.kind === "power" ? sum + device.assetDef.behavior.outputMilliWatts : sum, 0);
  return { tick: 0, devices, transports, produced: {}, consumed: {}, energy: { availableMilliWatts, consumedMilliJoules: 0 }, completedOrders: 0 };
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
  const stats: SimulationStats = { durations: {}, wipArea: 0, congestionArea: 0, elapsedTicks: state.tick };
  let sequence = 0; let transitSequence = 0; let publicEventCount = 0;
  const dispatchCursors: Record<string, number> = {};
  const schedule = (tick: number, priority: number, value: InternalEvent) => queue.push({ tick, priority, sequence: sequence++, value });
  const emit = (event: FactoryEvent) => { events.push(event); publicEventCount++; };
  const setStatus = (device: string, status: DeviceRuntimeState["status"]) => {
    const runtime = state.devices[device]!;
    if (runtime.status === status) return;
    const durations = stats.durations[device] ??= {};
    durations[runtime.status] = (durations[runtime.status] ?? 0) + state.tick - statusSince[device]!;
    statusSince[device] = state.tick;
    mutateFactoryState(state, { kind: "status", device, status });
  };
  const activePower = () => Object.entries(state.devices).reduce((sum, [id, runtime]) => runtime.status === "processing" ? sum + (project.devices[id]!.assetDef.simulation?.powerConsumptionMilliWatts ?? 0) : sum, 0);
  const measureUntil = (tick: number) => {
    const delta = tick - state.tick;
    if (delta <= 0) return;
    const wip = Object.values(state.devices).reduce((sum, runtime) => sum + quantity(runtime.inventory), 0)
      + Object.values(state.transports).flat().reduce((sum, transit) => sum + transit.count, 0);
    const congestion = Object.entries(state.transports).reduce((sum, [id, transits]) => sum + transits.reduce((n, transit) => n + transit.count, 0) / project.connections[id]!.transportAsset.behavior.capacity, 0);
    stats.wipArea += wip * delta; stats.congestionArea += congestion * delta;
    mutateFactoryState(state, { kind: "energy", consumedMilliJoules: activePower() * delta / 1000 });
    mutateFactoryState(state, { kind: "tick", tick }); stats.elapsedTicks = tick;
  };
  const outputMaterials = (device: CompiledDevice): string[] => {
    const behavior = device.assetDef.behavior;
    if (behavior.kind === "source") return [behavior.material];
    if (behavior.kind === "processor") return device.recipe?.outputs.map((item) => item.material) ?? [];
    return Object.keys(state.devices[device.id]!.inventory).sort();
  };
  const targetAccepts = (target: CompiledDevice, material: string): boolean => {
    const behavior = target.assetDef.behavior;
    if (behavior.kind === "sink") return (target.config?.accepts ?? behavior.accepts).includes(material);
    if (behavior.kind === "storage") return behavior.accepts.includes("*") || behavior.accepts.includes(material);
    if (behavior.kind === "processor") return Boolean(target.recipe?.inputs.some((item) => item.material === material));
    return false;
  };
  const targetCapacity = (target: CompiledDevice): number => {
    const behavior = target.assetDef.behavior;
    if (behavior.kind === "sink") return Number.MAX_SAFE_INTEGER;
    if (behavior.kind === "storage") return behavior.capacity;
    if (behavior.kind === "processor") return behavior.inputCapacity;
    return 0;
  };
  const incomingQuantity = (device: string) => Object.values(state.transports).flat().filter((transit) => transit.to === device).reduce((sum, transit) => sum + transit.count, 0);

  const dispatch = (): boolean => {
    let moved = false;
    const sourceIds = [...new Set(Object.values(project.connections).map((connection) => connection.from.device))].sort();
    const orderedConnections = sourceIds.flatMap((sourceId) => {
      const outgoing = Object.values(project.connections).filter((connection) => connection.from.device === sourceId).sort((a, b) => a.id.localeCompare(b.id));
      if (outgoing.length < 2 || (project.devices[sourceId]!.policy?.dispatch ?? project.blueprint.policies?.dispatch ?? "fifo") === "fifo") return outgoing;
      const cursor = dispatchCursors[sourceId] ?? 0;
      return [...outgoing.slice(cursor % outgoing.length), ...outgoing.slice(0, cursor % outgoing.length)];
    });
    for (const connection of orderedConnections) {
      const sourceState = state.devices[connection.from.device]!;
      const target = connection.toDevice;
      const inTransit = state.transports[connection.id]!.reduce((sum, transit) => sum + transit.count, 0);
      if (inTransit >= connection.transportAsset.behavior.capacity) continue;
      const material = outputMaterials(connection.fromDevice).find((id) => (sourceState.inventory[id] ?? 0) > 0 && targetAccepts(target, id));
      if (!material) continue;
      if (quantity(state.devices[target.id]!.inventory) + incomingQuantity(target.id) >= targetCapacity(target)) continue;
      mutateFactoryState(state, { kind: "inventory", device: connection.from.device, material, delta: -1 });
      const transit: MaterialTransit = {
        id: `transit-${String(transitSequence++).padStart(6, "0")}`, material, count: 1,
        from: connection.from.device, to: connection.to.device, departTick: state.tick, arriveTick: state.tick + connection.travelTicks,
      };
      mutateFactoryState(state, { kind: "transport.add", connection: connection.id, transit });
      emit({ type: "material.depart", tick: state.tick, transit: { ...transit }, connection: connection.id });
      schedule(transit.arriveTick, 10, { kind: "arrive", connection: connection.id, transitId: transit.id });
      moved = true;
      if ((connection.fromDevice.policy?.dispatch ?? project.blueprint.policies?.dispatch) === "round-robin") {
        const count = Object.values(project.connections).filter((item) => item.from.device === connection.from.device).length;
        dispatchCursors[connection.from.device] = ((dispatchCursors[connection.from.device] ?? 0) + 1) % count;
      }
      if (sourceState.status === "blocked-output") { setStatus(connection.from.device, "idle"); emit({ type: "buffer.unblocked", tick: state.tick, device: connection.from.device }); }
    }
    return moved;
  };

  const canStartProcessor = (device: CompiledDevice): boolean => Boolean(device.recipe?.inputs.every((input) => (state.devices[device.id]!.inventory[input.material] ?? 0) >= input.count));
  const tryStart = (device: CompiledDevice): boolean => {
    const runtime = state.devices[device.id]!; const behavior = device.assetDef.behavior;
    if (runtime.status === "failed" || runtime.status === "processing") return false;
    if (behavior.kind !== "source" && behavior.kind !== "processor") return false;
    if (behavior.kind === "processor" && !canStartProcessor(device)) { setStatus(device.id, "waiting-input"); return false; }
    if (behavior.kind === "processor") {
      const pendingOutput = device.recipe!.outputs.reduce((sum, output) => sum + (runtime.inventory[output.material] ?? 0) + output.count, 0);
      if (pendingOutput > behavior.outputCapacity) {
        if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
        return false;
      }
    }
    if (behavior.kind === "source" && quantity(runtime.inventory) >= (behavior.outputCapacity ?? behavior.count * 4)) {
      if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
      return false;
    }
    const required = device.assetDef.simulation?.powerConsumptionMilliWatts ?? 0;
    const available = state.energy.availableMilliWatts - activePower();
    if (required > available) {
      if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, requiredMilliWatts: required, availableMilliWatts: Math.max(0, available) });
      setStatus(device.id, "unpowered"); return false;
    }
    if (behavior.kind === "processor") for (const input of device.recipe!.inputs) mutateFactoryState(state, { kind: "inventory", device: device.id, material: input.material, delta: -input.count });
    const duration = behavior.kind === "source" ? behavior.durationTicks : device.recipe!.durationTicks;
    setStatus(device.id, "processing"); mutateFactoryState(state, { kind: "job.start", device: device.id, tick: state.tick, ...(device.recipe ? { recipe: device.recipe.id } : {}) });
    emit({ type: "device.start", tick: state.tick, device: device.id, ...(device.recipe ? { recipe: device.recipe.id } : {}) });
    schedule(state.tick + duration, 20, { kind: "complete", device: device.id, generation: generations[device.id]! });
    return true;
  };

  const settle = () => {
    let changed = true; let guard = 0;
    while (changed && guard++ < 100_000) {
      changed = dispatch();
      for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) if (tryStart(device)) changed = true;
    }
    for (const device of Object.values(project.devices)) {
      const runtime = state.devices[device.id]!;
      if ((device.assetDef.behavior.kind === "source" || device.assetDef.behavior.kind === "processor") && runtime.status === "idle" && outputMaterials(device).some((id) => (runtime.inventory[id] ?? 0) > 0)) {
        setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id });
      }
    }
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
      const device = project.devices[event.device]!; const runtime = state.devices[event.device]!; const behavior = device.assetDef.behavior;
      setStatus(event.device, "idle"); mutateFactoryState(state, { kind: "job.finish", device: event.device });
      if (behavior.kind === "source") {
        mutateFactoryState(state, { kind: "inventory", device: event.device, material: behavior.material, delta: behavior.count });
        mutateFactoryState(state, { kind: "produced", material: behavior.material, count: behavior.count });
        emit({ type: "device.finish", tick: state.tick, device: event.device, material: behavior.material, count: behavior.count });
      } else if (behavior.kind === "processor") {
        for (const output of device.recipe!.outputs) {
          mutateFactoryState(state, { kind: "inventory", device: event.device, material: output.material, delta: output.count });
          mutateFactoryState(state, { kind: "produced", material: output.material, count: output.count });
        }
        emit({ type: "device.finish", tick: state.tick, device: event.device, recipe: device.recipe!.id });
      }
    } else if (event.kind === "arrive") {
      const transits = state.transports[event.connection]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!; mutateFactoryState(state, { kind: "transport.remove", connection: event.connection, transitId: transit.id }); const target = project.devices[transit.to]!; const behavior = target.assetDef.behavior;
      emit({ type: "material.arrive", tick: state.tick, transit: { ...transit! }, connection: event.connection });
      if (behavior.kind === "sink") {
        mutateFactoryState(state, { kind: "consumed", material: transit.material, count: transit.count }); mutateFactoryState(state, { kind: "orders", count: transit.count });
        emit({ type: "sink.accepted", tick: state.tick, device: target.id, material: transit.material, count: transit.count });
      } else mutateFactoryState(state, { kind: "inventory", device: target.id, material: transit.material, delta: transit.count });
    } else if (event.kind === "breakdown") {
      generations[event.device]!++; setStatus(event.device, "failed"); emit({ type: "device.breakdown", tick: state.tick, device: event.device });
    } else {
      setStatus(event.device, "idle"); emit({ type: "device.recover", tick: state.tick, device: event.device });
    }
    settle();
  }
  measureUntil(untilTick);
  for (const id of Object.keys(project.devices)) {
    const runtime = state.devices[id]!; const durations = stats.durations[id] ??= {};
    durations[runtime.status] = (durations[runtime.status] ?? 0) + state.tick - statusSince[id]!;
    if (runtime.status === "processing" && runtime.startedAt !== undefined) mutateFactoryState(state, { kind: "progress", device: id, progressTicks: state.tick - runtime.startedAt });
  }
  const reason = publicEventCount >= maxEvents ? "max-events" : "until-tick";
  emit({ type: "simulation.completed", tick: state.tick, reason });
  const metrics = evaluateFactory(project, state, stats);
  const runKey = hashValue({ ...project.hashes, seed, untilTick, maxEvents });
  const resultHash = hashValue({ runKey, events, state, metrics });
  return { state, events, metrics, resultHash, runKey };
}
