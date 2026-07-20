import { DeterministicPriorityQueue } from "./priority-queue";
import { evaluateFactory, type SimulationStats } from "./evaluator";
import { evaluateDeviceProgram } from "./device-runtime";
import type {
  CompiledDevice, CompiledFactoryProject, DeviceProgramDecision, DeviceRuntimeState, FactoryEvent, FactoryState,
  ResourceBufferQuantity, ResourceTransit, SimulationResult,
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
function deviceQuantity(state: DeviceRuntimeState): number { return Object.values(state.buffers).reduce((sum, inventory) => sum + quantity(inventory), 0); }

export function createInitialFactoryState(project: CompiledFactoryProject): FactoryState {
  const devices: Record<string, DeviceRuntimeState> = {};
  for (const id of Object.keys(project.devices).sort()) {
    const buffers = Object.fromEntries(project.devices[id]!.assetDef.buffers.map((buffer) => [
      buffer.id, { ...(project.scenario.initialBuffers?.[id]?.[buffer.id] ?? {}) },
    ]));
    devices[id] = { status: "idle", buffers };
  }
  const transports = Object.fromEntries(Object.keys(project.connections).sort().map((id) => [id, [] as ResourceTransit[]]));
  const availableMilliWatts = Object.values(project.devices).reduce((sum, device) => sum + device.assetDef.power.productionMilliWatts, 0);
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
  const activePower = () => Object.values(state.devices).reduce((sum, runtime) => sum + (runtime.activeJob?.powerMilliWatts ?? 0), 0);
  const measureUntil = (tick: number) => {
    const delta = tick - state.tick;
    if (delta <= 0) return;
    const wip = Object.values(state.devices).reduce((sum, runtime) => sum + deviceQuantity(runtime), 0)
      + Object.values(state.transports).flat().reduce((sum, transit) => sum + transit.count, 0);
    const congestion = Object.entries(state.transports).reduce((sum, [id, transits]) => sum + transits.reduce((n, transit) => n + transit.count, 0) / project.connections[id]!.capacity, 0);
    stats.wipArea += wip * delta; stats.congestionArea += congestion * delta;
    mutateFactoryState(state, { kind: "energy", consumedMilliJoules: activePower() * delta / 1000 });
    mutateFactoryState(state, { kind: "tick", tick }); stats.elapsedTicks = tick;
  };
  const accepts = (device: CompiledDevice, buffer: string, resource: string) => {
    const contract = device.buffers[buffer]!.accepts;
    return contract.includes("*") || contract.includes(resource);
  };
  const incomingQuantity = (device: string, buffer: string) => Object.values(state.transports).flat()
    .filter((transit) => transit.to === device && transit.toBuffer === buffer).reduce((sum, transit) => sum + transit.count, 0);

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
      const sourceBuffer = sourceState.buffers[connection.fromPort.buffer]!;
      const targetState = state.devices[connection.to.device]!;
      const targetBuffer = targetState.buffers[connection.toPort.buffer]!;
      const inTransit = state.transports[connection.id]!.reduce((sum, transit) => sum + transit.count, 0);
      if (inTransit >= connection.capacity) continue;
      const resource = Object.keys(sourceBuffer).sort().find((id) => (sourceBuffer[id] ?? 0) > 0 && accepts(connection.toDevice, connection.toPort.buffer, id));
      if (!resource) continue;
      const targetCapacity = connection.toDevice.buffers[connection.toPort.buffer]!.capacity;
      if (quantity(targetBuffer) + incomingQuantity(connection.to.device, connection.toPort.buffer) >= targetCapacity) continue;
      mutateFactoryState(state, { kind: "buffer", device: connection.from.device, buffer: connection.fromPort.buffer, resource, delta: -1 });
      const transit: ResourceTransit = {
        id: `transit-${String(transitSequence++).padStart(6, "0")}`, resource, count: 1,
        from: connection.from.device, fromBuffer: connection.fromPort.buffer,
        to: connection.to.device, toBuffer: connection.toPort.buffer,
        departTick: state.tick, arriveTick: state.tick + connection.travelTicks,
      };
      mutateFactoryState(state, { kind: "transport.add", connection: connection.id, transit });
      emit({ type: "resource.depart", tick: state.tick, transit: { ...transit }, connection: connection.id });
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

  const amountAvailable = (device: CompiledDevice, amount: ResourceBufferQuantity): boolean => {
    if (!device.buffers[amount.buffer] || !project.resources[amount.resource]) return false;
    return (state.devices[device.id]!.buffers[amount.buffer]![amount.resource] ?? 0) >= amount.count;
  };
  const outputFits = (device: CompiledDevice, produce: ResourceBufferQuantity[]): boolean => {
    const additions: Record<string, number> = {};
    for (const amount of produce) {
      const buffer = device.buffers[amount.buffer];
      if (!buffer || !project.resources[amount.resource] || !(buffer.accepts.includes("*") || buffer.accepts.includes(amount.resource))) return false;
      additions[amount.buffer] = (additions[amount.buffer] ?? 0) + amount.count;
    }
    return Object.entries(additions).every(([buffer, count]) => quantity(state.devices[device.id]!.buffers[buffer]!) + count <= device.buffers[buffer]!.capacity);
  };
  const allAmountsKnown = (device: CompiledDevice, amounts: ResourceBufferQuantity[]) => amounts.every((amount) => device.buffers[amount.buffer] && project.resources[amount.resource]);
  const applyConsume = (device: CompiledDevice, amounts: ResourceBufferQuantity[], delivered: boolean) => {
    for (const amount of amounts) {
      mutateFactoryState(state, { kind: "buffer", device: device.id, buffer: amount.buffer, resource: amount.resource, delta: -amount.count });
      if (delivered) {
        mutateFactoryState(state, { kind: "consumed", resource: amount.resource, count: amount.count });
        mutateFactoryState(state, { kind: "orders", count: amount.count });
        emit({ type: "resource.consumed", tick: state.tick, device: device.id, resource: amount.resource, count: amount.count });
      }
    }
  };
  const tryDecision = (device: CompiledDevice, decision: DeviceProgramDecision): boolean => {
    const runtime = state.devices[device.id]!;
    if (decision.kind === "none") { setStatus(device.id, "idle"); return false; }
    if (decision.kind === "wait") { setStatus(device.id, decision.reason === "input" ? "waiting-input" : decision.reason === "output" ? "blocked-output" : "idle"); return false; }
    if (!allAmountsKnown(device, decision.consume)) throw new Error(`Device program '${device.asset}' referenced an unknown resource or buffer`);
    if (!decision.consume.every((amount) => amountAvailable(device, amount))) { setStatus(device.id, "waiting-input"); return false; }
    if (decision.kind === "consume") { applyConsume(device, decision.consume, true); setStatus(device.id, "idle"); return true; }
    if (!allAmountsKnown(device, decision.produce)) throw new Error(`Device program '${device.asset}' referenced an unknown output resource or buffer`);
    if (!outputFits(device, decision.produce)) {
      if (runtime.status !== "blocked-output") { setStatus(device.id, "blocked-output"); emit({ type: "buffer.blocked", tick: state.tick, device: device.id }); }
      return false;
    }
    const required = decision.powerMilliWatts ?? device.assetDef.power.consumptionMilliWatts;
    const available = state.energy.availableMilliWatts - activePower();
    if (required > available) {
      if (runtime.status !== "unpowered") emit({ type: "power.shortage", tick: state.tick, device: device.id, requiredMilliWatts: required, availableMilliWatts: Math.max(0, available) });
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
    if (runtime.status === "failed" || runtime.status === "processing") return false;
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
    });
    return tryDecision(device, decision);
  };
  const hasBlockedOutput = (device: CompiledDevice): boolean => device.ports.some((port) => port.direction === "output" && quantity(state.devices[device.id]!.buffers[port.buffer]!) > 0);

  const settle = () => {
    let changed = true; let guard = 0;
    while (changed && guard++ < 100_000) {
      changed = dispatch();
      for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) if (tryEvaluate(device)) changed = true;
    }
    if (guard >= 100_000) throw new Error("Device scripts did not reach a stable state after 100000 actions at one tick");
    for (const device of Object.values(project.devices)) {
      const runtime = state.devices[device.id]!;
      if (runtime.status !== "failed" && runtime.status !== "processing" && hasBlockedOutput(device)) {
        if (runtime.status !== "blocked-output") emit({ type: "buffer.blocked", tick: state.tick, device: device.id });
        setStatus(device.id, "blocked-output");
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
      const runtime = state.devices[event.device]!; const job = runtime.activeJob!;
      for (const output of job.produce) {
        mutateFactoryState(state, { kind: "buffer", device: event.device, buffer: output.buffer, resource: output.resource, delta: output.count });
        mutateFactoryState(state, { kind: "produced", resource: output.resource, count: output.count });
      }
      setStatus(event.device, "idle"); mutateFactoryState(state, { kind: "job.finish", device: event.device });
      emit({ type: "device.finish", tick: state.tick, device: event.device, operation: job.operation, produced: structuredClone(job.produce) });
    } else if (event.kind === "arrive") {
      const transits = state.transports[event.connection]!; const index = transits.findIndex((transit) => transit.id === event.transitId);
      if (index < 0) continue;
      const transit = transits[index]!;
      mutateFactoryState(state, { kind: "transport.remove", connection: event.connection, transitId: transit.id });
      mutateFactoryState(state, { kind: "buffer", device: transit.to, buffer: transit.toBuffer, resource: transit.resource, delta: transit.count });
      emit({ type: "resource.arrive", tick: state.tick, transit: { ...transit }, connection: event.connection });
    } else if (event.kind === "breakdown") {
      generations[event.device]!++;
      if (state.devices[event.device]!.activeJob) mutateFactoryState(state, { kind: "job.finish", device: event.device });
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
