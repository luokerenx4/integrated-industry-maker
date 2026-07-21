import type { ActiveDeviceJob, BeltTransit, CarrierMission, DeviceStatus, FactoryState, ResourceTransit, Tick } from "./types";

export type FactoryStateMutation =
  | { kind: "tick"; tick: Tick }
  | { kind: "status"; device: string; status: DeviceStatus }
  | { kind: "idle-power"; device: string; powered: boolean }
  | { kind: "buffer"; device: string; buffer: string; resource: string; delta: number; treatmentLevel?: number }
  | { kind: "transport.add"; connection: string; transit: BeltTransit }
  | { kind: "transport.update"; connection: string; transitId: string; changes: Partial<Pick<BeltTransit, "phase" | "cellIndex" | "readyTick" | "arriveTick">> & { blockedBy?: string | null } }
  | { kind: "transport.remove"; connection: string; transitId: string }
  | { kind: "logistics.add"; network: string; transit: ResourceTransit }
  | { kind: "logistics.remove"; network: string; transitId: string }
  | { kind: "logistics.mission-add"; network: string; mission: CarrierMission }
  | { kind: "logistics.mission-returning"; network: string; missionId: string }
  | { kind: "logistics.mission-remove"; network: string; missionId: string }
  | { kind: "produced"; resource: string; count: number }
  | { kind: "consumed"; resource: string; count: number }
  | { kind: "resource.reserve"; node: string; count: number }
  | { kind: "resource.release"; node: string; count: number }
  | { kind: "resource.extracted"; node: string; count: number }
  | { kind: "energy"; grid: string; consumedMilliJoules: number }
  | { kind: "energy.storage"; grid: string; device: string; deltaMilliJoules: number; mode: "charge" | "discharge" }
  | { kind: "station.energy"; device: string; deltaMilliJoules: number; mode: "charge" | "spend" }
  | { kind: "station.charge-satisfaction"; device: string; satisfactionPpm: number }
  | { kind: "fuel"; resource: string; count: number }
  | { kind: "treatment.agent"; resource: string; count: number }
  | { kind: "treatment.complete"; resource: string; level: number; count: number }
  | { kind: "orders"; count: number }
  | { kind: "high-speed-mission" }
  | { kind: "carrier-mission" }
  | { kind: "carrier-return" }
  | { kind: "job.start"; device: string; job: ActiveDeviceJob }
  | { kind: "job.finish"; device: string }
  | { kind: "job.power"; device: string; remainingTicks: Tick; workedTicks: Tick; resumedAt: Tick; powerSatisfactionPpm: number }
  | { kind: "power.satisfaction"; grid: string; satisfactionPpm: number }
  | { kind: "progress"; device: string; progressTicks: Tick };

/** The sole write path for runtime factory state. Asset scripts can return actions but cannot mutate this store. */
export function mutateFactoryState(state: FactoryState, mutation: FactoryStateMutation): void {
  switch (mutation.kind) {
    case "tick": state.tick = mutation.tick; return;
    case "status": state.devices[mutation.device]!.status = mutation.status; return;
    case "idle-power": state.devices[mutation.device]!.idlePowered = mutation.powered; return;
    case "buffer": {
      const runtime = state.devices[mutation.device]!;
      const inventory = runtime.buffers[mutation.buffer];
      if (!inventory) throw new Error(`Unknown buffer for ${mutation.device}/${mutation.buffer}`);
      const materialInventory = runtime.materialBatches[mutation.buffer] ??= {};
      const batches = materialInventory[mutation.resource] ??= {};
      const level = String(mutation.treatmentLevel ?? 0);
      batches[level] = (batches[level] ?? 0) + mutation.delta;
      if (batches[level] === 0) delete batches[level];
      if ((batches[level] ?? 0) < 0) throw new Error(`Negative material batch for ${mutation.device}/${mutation.buffer}/${mutation.resource}@${level}`);
      if (!Object.keys(batches).length) delete materialInventory[mutation.resource];
      inventory[mutation.resource] = (inventory[mutation.resource] ?? 0) + mutation.delta;
      if (inventory[mutation.resource] === 0) delete inventory[mutation.resource];
      if ((inventory[mutation.resource] ?? 0) < 0) throw new Error(`Negative buffer quantity for ${mutation.device}/${mutation.buffer}/${mutation.resource}`);
      return;
    }
    case "transport.add": state.transports[mutation.connection]!.push(mutation.transit); return;
    case "transport.update": {
      const transit = state.transports[mutation.connection]!.find((item) => item.id === mutation.transitId);
      if (!transit) throw new Error(`Unknown transit '${mutation.transitId}' on '${mutation.connection}'`);
      Object.assign(transit, mutation.changes);
      if (mutation.changes.blockedBy === null) delete transit.blockedBy;
      return;
    }
    case "transport.remove": {
      const transits = state.transports[mutation.connection]!; const index = transits.findIndex((item) => item.id === mutation.transitId);
      if (index < 0) throw new Error(`Unknown transit '${mutation.transitId}' on '${mutation.connection}'`);
      transits.splice(index, 1); return;
    }
    case "logistics.add": state.logisticsTransports[mutation.network]!.push(mutation.transit); return;
    case "logistics.remove": {
      const transits = state.logisticsTransports[mutation.network]!; const index = transits.findIndex((item) => item.id === mutation.transitId);
      if (index < 0) throw new Error(`Unknown logistics transit '${mutation.transitId}' on '${mutation.network}'`);
      transits.splice(index, 1); return;
    }
    case "logistics.mission-add": state.logisticsMissions[mutation.network]!.push(mutation.mission); return;
    case "logistics.mission-returning": {
      const mission = state.logisticsMissions[mutation.network]!.find((item) => item.id === mutation.missionId);
      if (!mission) throw new Error(`Unknown carrier mission '${mutation.missionId}' on '${mutation.network}'`);
      mission.phase = "returning"; return;
    }
    case "logistics.mission-remove": {
      const missions = state.logisticsMissions[mutation.network]!; const index = missions.findIndex((item) => item.id === mutation.missionId);
      if (index < 0) throw new Error(`Unknown carrier mission '${mutation.missionId}' on '${mutation.network}'`);
      missions.splice(index, 1); return;
    }
    case "produced": state.produced[mutation.resource] = (state.produced[mutation.resource] ?? 0) + mutation.count; return;
    case "consumed": state.consumed[mutation.resource] = (state.consumed[mutation.resource] ?? 0) + mutation.count; return;
    case "resource.reserve": {
      const node = state.resourceNodes[mutation.node];
      if (!node || node.remaining < mutation.count) throw new Error(`Insufficient resource remaining on node '${mutation.node}'`);
      node.remaining -= mutation.count; node.reserved += mutation.count; return;
    }
    case "resource.release": {
      const node = state.resourceNodes[mutation.node];
      if (!node) throw new Error(`Unknown resource node '${mutation.node}'`);
      if (node.reserved < mutation.count) throw new Error(`Insufficient reserved resource on node '${mutation.node}'`);
      node.remaining += mutation.count; node.reserved -= mutation.count; return;
    }
    case "resource.extracted": {
      const node = state.resourceNodes[mutation.node];
      if (!node) throw new Error(`Unknown resource node '${mutation.node}'`);
      if (node.reserved < mutation.count) throw new Error(`Insufficient reserved resource on node '${mutation.node}'`);
      node.reserved -= mutation.count; node.extracted += mutation.count; return;
    }
    case "energy": {
      state.energy.consumedMilliJoules += mutation.consumedMilliJoules;
      state.energy.grids[mutation.grid]!.consumedMilliJoules += mutation.consumedMilliJoules;
      return;
    }
    case "power.satisfaction": state.energy.grids[mutation.grid]!.satisfactionPpm = mutation.satisfactionPpm; return;
    case "energy.storage": {
      const storage = state.devices[mutation.device]!.energyStorage;
      const grid = state.energy.grids[mutation.grid];
      if (!storage || !grid) throw new Error(`Unknown power storage '${mutation.device}' on '${mutation.grid}'`);
      const next = storage.storedMilliJoules + mutation.deltaMilliJoules;
      if (next < -1e-6 || next > storage.capacityMilliJoules + 1e-6) throw new Error(`Power storage '${mutation.device}' energy would leave its physical capacity`);
      const previous = storage.storedMilliJoules;
      storage.storedMilliJoules = Math.max(0, Math.min(storage.capacityMilliJoules, next));
      const appliedDelta = storage.storedMilliJoules - previous;
      grid.storedMilliJoules = Math.max(0, Math.min(grid.storageCapacityMilliJoules, grid.storedMilliJoules + appliedDelta));
      if (mutation.mode === "charge") {
        storage.chargedMilliJoules += appliedDelta;
        grid.chargedMilliJoules += appliedDelta;
      } else {
        storage.dischargedMilliJoules -= appliedDelta;
        grid.dischargedMilliJoules -= appliedDelta;
      }
      return;
    }
    case "station.energy": {
      const energy = state.devices[mutation.device]!.stationEnergy;
      if (!energy) throw new Error(`Unknown station energy buffer '${mutation.device}'`);
      const next = energy.storedMilliJoules + mutation.deltaMilliJoules;
      if (next < -1e-6 || next > energy.capacityMilliJoules + 1e-6) throw new Error(`Station '${mutation.device}' energy would leave its physical capacity`);
      const previous = energy.storedMilliJoules;
      energy.storedMilliJoules = Math.max(0, Math.min(energy.capacityMilliJoules, next));
      const appliedDelta = energy.storedMilliJoules - previous;
      if (mutation.mode === "charge") energy.chargedMilliJoules += appliedDelta;
      else energy.spentMilliJoules -= appliedDelta;
      return;
    }
    case "station.charge-satisfaction": state.devices[mutation.device]!.stationEnergy!.chargeSatisfactionPpm = mutation.satisfactionPpm; return;
    case "fuel": state.energy.fuelConsumed[mutation.resource] = (state.energy.fuelConsumed[mutation.resource] ?? 0) + mutation.count; return;
    case "treatment.agent": state.materialTreatment.agentsConsumed[mutation.resource] = (state.materialTreatment.agentsConsumed[mutation.resource] ?? 0) + mutation.count; return;
    case "treatment.complete": {
      const levels = state.materialTreatment.treated[mutation.resource] ??= {};
      levels[String(mutation.level)] = (levels[String(mutation.level)] ?? 0) + mutation.count;
      return;
    }
    case "orders": state.completedOrders += mutation.count; return;
    case "high-speed-mission": state.highSpeedMissions += 1; return;
    case "carrier-mission": state.carrierMissions += 1; return;
    case "carrier-return": state.carrierReturns += 1; return;
    case "job.start": state.devices[mutation.device]!.activeJob = structuredClone(mutation.job); state.devices[mutation.device]!.progressTicks = 0; return;
    case "job.finish": delete state.devices[mutation.device]!.activeJob; delete state.devices[mutation.device]!.progressTicks; return;
    case "job.power": {
      const job = state.devices[mutation.device]!.activeJob;
      if (!job) throw new Error(`Device '${mutation.device}' has no active job to update`);
      job.remainingTicks = mutation.remainingTicks; job.workedTicks = mutation.workedTicks; job.resumedAt = mutation.resumedAt;
      job.powerSatisfactionPpm = mutation.powerSatisfactionPpm;
      return;
    }
    case "progress": state.devices[mutation.device]!.progressTicks = mutation.progressTicks; return;
  }
}
