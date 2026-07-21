import type { ActiveDeviceJob, BeltTransit, CarrierMission, DeviceStatus, FactoryState, LotReleaseBlockReason, ResourceTransit, Tick, WorkLot, WorkLotStatus } from "./types";

export type FactoryStateMutation =
  | { kind: "tick"; tick: Tick }
  | { kind: "status"; device: string; status: DeviceStatus }
  | { kind: "idle-power"; device: string; powered: boolean }
  | { kind: "buffer"; device: string; buffer: string; resource: string; delta: number; treatmentLevel?: number }
  | { kind: "lot.release-control"; open: boolean }
  | { kind: "lot.release-block"; lotId: string; reason: LotReleaseBlockReason | null }
  | { kind: "lot.release"; lotId: string; device: string; buffer: string }
  | { kind: "lot.depart"; lotIds: string[]; device: string; buffer: string; nextStatus: "processing" | "transport"; nextLocation: { kind: "device"; device: string } | { kind: "transit"; transit: string } }
  | { kind: "lot.arrive"; lotIds: string[]; device: string; buffer: string; resource: string; treatmentLevel?: number }
  | { kind: "lot.route-advance"; lotIds: string[]; route: string; fromStep: string; toStep: string | null; terminal: "complete" | "scrap" | null }
  | { kind: "lot.complete"; lotIds: string[]; device: string; buffer: string }
  | { kind: "lot.scrap"; lotIds: string[]; device: string; reason: string }
  | { kind: "lot.scrap-buffer"; lotIds: string[]; device: string; buffer: string; reason: string }
  | { kind: "lot.quality-excursion"; lotIds: string[]; excursion: string; defects: string[] }
  | { kind: "lot.inspect"; lotIds: string[]; result: "pass" | "reject" | "scrap" }
  | { kind: "lot.rework"; lotIds: string[]; repairs: string[] }
  | { kind: "lot.checkpoint"; lotIds: string[] }
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
  | { kind: "setup.finish"; device: string; group: string; durationTicks: Tick }
  | { kind: "production.finish"; device: string }
  | { kind: "maintenance.finish"; device: string; cause: "mandatory" | "opportunistic"; durationTicks: Tick }
  | { kind: "maintenance.cancel"; device: string }
  | { kind: "campaign.hold"; device: string; targetGroup: string; deadlineTick: Tick }
  | { kind: "campaign.release"; device: string; cause: "minimum-ready-lots" | "maximum-hold" }
  | { kind: "job.power"; device: string; remainingTicks: Tick; workedTicks: Tick; resumedAt: Tick; powerSatisfactionPpm: number }
  | { kind: "power.satisfaction"; grid: string; satisfactionPpm: number }
  | { kind: "progress"; device: string; progressTicks: Tick };

function mutateBufferQuantity(state: FactoryState, device: string, buffer: string, resource: string, delta: number, treatmentLevel = 0): void {
  const runtime = state.devices[device]!;
  const inventory = runtime.buffers[buffer];
  if (!inventory) throw new Error(`Unknown buffer for ${device}/${buffer}`);
  const materialInventory = runtime.materialBatches[buffer] ??= {};
  const batches = materialInventory[resource] ??= {};
  const level = String(treatmentLevel);
  batches[level] = (batches[level] ?? 0) + delta;
  if (batches[level] === 0) delete batches[level];
  if ((batches[level] ?? 0) < 0) throw new Error(`Negative material batch for ${device}/${buffer}/${resource}@${level}`);
  if (!Object.keys(batches).length) delete materialInventory[resource];
  inventory[resource] = (inventory[resource] ?? 0) + delta;
  if (inventory[resource] === 0) delete inventory[resource];
  if ((inventory[resource] ?? 0) < 0) throw new Error(`Negative buffer quantity for ${device}/${buffer}/${resource}`);
}

function advanceLotClock(lot: WorkLot, tick: Tick): void {
  const elapsed = tick - lot.statusSinceTick;
  if (elapsed < 0) throw new Error(`Lot '${lot.id}' moved backwards in time`);
  if (lot.status === "queued") lot.queueTicks += elapsed;
  else if (lot.status === "processing") lot.processTicks += elapsed;
  else if (lot.status === "transport") lot.transportTicks += elapsed;
  lot.statusSinceTick = tick;
}

function setLotStatus(lot: WorkLot, tick: Tick, status: WorkLotStatus, location: WorkLot["location"]): void {
  advanceLotClock(lot, tick);
  lot.status = status;
  lot.location = location;
}

function setLotReleaseBlock(lot: WorkLot, tick: Tick, reason: LotReleaseBlockReason | null): void {
  const previous = lot.releaseWait.reason;
  if (previous === reason) return;
  if (previous) lot.releaseWait.ticks[previous] += tick - lot.releaseWait.sinceTick;
  lot.releaseWait.reason = reason;
  lot.releaseWait.sinceTick = tick;
  if (reason && !lot.releaseWait.encountered.includes(reason)) lot.releaseWait.encountered.push(reason);
}

function removeLotFromBuffer(state: FactoryState, lot: WorkLot, device: string, buffer: string): void {
  if (lot.status !== "queued" || lot.location.kind !== "buffer" || lot.location.device !== device || lot.location.buffer !== buffer) {
    throw new Error(`Lot '${lot.id}' is not queued in ${device}/${buffer}`);
  }
  const ids = state.devices[device]!.lotIds[buffer]?.[lot.resource];
  const index = ids?.indexOf(lot.id) ?? -1;
  if (index < 0) throw new Error(`Lot '${lot.id}' is missing from ${device}/${buffer}/${lot.resource}`);
  ids!.splice(index, 1);
  if (!ids!.length) delete state.devices[device]!.lotIds[buffer]![lot.resource];
  mutateBufferQuantity(state, device, buffer, lot.resource, -1, lot.treatmentLevel);
}

/** The sole write path for runtime factory state. Asset scripts can return actions but cannot mutate this store. */
export function mutateFactoryState(state: FactoryState, mutation: FactoryStateMutation): void {
  switch (mutation.kind) {
    case "tick": state.tick = mutation.tick; return;
    case "status": state.devices[mutation.device]!.status = mutation.status; return;
    case "idle-power": state.devices[mutation.device]!.idlePowered = mutation.powered; return;
    case "buffer": {
      mutateBufferQuantity(state, mutation.device, mutation.buffer, mutation.resource, mutation.delta, mutation.treatmentLevel);
      return;
    }
    case "lot.release-control": state.lotReleaseControl.open = mutation.open; return;
    case "lot.release-block": {
      const lot = state.lots[mutation.lotId];
      if (!lot) throw new Error(`Unknown lot '${mutation.lotId}'`);
      if (lot.status !== "scheduled") throw new Error(`Lot '${lot.id}' is not awaiting release`);
      setLotReleaseBlock(lot, state.tick, mutation.reason);
      return;
    }
    case "lot.release": {
      const lot = state.lots[mutation.lotId];
      if (!lot) throw new Error(`Unknown lot '${mutation.lotId}'`);
      if (lot.status !== "scheduled" || lot.location.kind !== "release") throw new Error(`Lot '${lot.id}' is not awaiting release`);
      if (lot.location.device !== mutation.device || lot.location.buffer !== mutation.buffer) throw new Error(`Lot '${lot.id}' has a different release location`);
      const runtime = state.devices[mutation.device]!;
      if (!runtime.buffers[mutation.buffer]) throw new Error(`Unknown buffer for ${mutation.device}/${mutation.buffer}`);
      setLotReleaseBlock(lot, state.tick, null);
      lot.releasedAtTick = state.tick;
      setLotStatus(lot, state.tick, "queued", { kind: "buffer", device: mutation.device, buffer: mutation.buffer });
      const ids = runtime.lotIds[mutation.buffer] ??= {};
      (ids[lot.resource] ??= []).push(lot.id);
      mutateBufferQuantity(state, mutation.device, mutation.buffer, lot.resource, 1, lot.treatmentLevel);
      return;
    }
    case "lot.depart": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        removeLotFromBuffer(state, lot, mutation.device, mutation.buffer);
        setLotStatus(lot, state.tick, mutation.nextStatus, mutation.nextLocation);
      }
      return;
    }
    case "lot.arrive": {
      const runtime = state.devices[mutation.device]!;
      if (!runtime.buffers[mutation.buffer]) throw new Error(`Unknown buffer for ${mutation.device}/${mutation.buffer}`);
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        if (lot.status === "completed") throw new Error(`Completed lot '${id}' cannot re-enter production`);
        lot.resource = mutation.resource;
        lot.treatmentLevel = mutation.treatmentLevel ?? 0;
        setLotStatus(lot, state.tick, "queued", { kind: "buffer", device: mutation.device, buffer: mutation.buffer });
        const ids = runtime.lotIds[mutation.buffer] ??= {};
        (ids[mutation.resource] ??= []).push(id);
        mutateBufferQuantity(state, mutation.device, mutation.buffer, mutation.resource, 1, lot.treatmentLevel);
      }
      return;
    }
    case "lot.route-advance": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        if (lot.route.id !== mutation.route || lot.route.step !== mutation.fromStep || lot.route.terminal) throw new Error(`Lot '${id}' is not at Route step '${mutation.route}/${mutation.fromStep}'`);
        lot.route.completedSteps += 1;
        lot.route.step = mutation.toStep;
        lot.route.terminal = mutation.terminal;
        if (mutation.toStep) {
          const visits = (lot.route.visits[mutation.toStep] ?? 0) + 1;
          if (visits > 1) lot.route.reentrantTransitions += 1;
          lot.route.visits[mutation.toStep] = visits;
        }
      }
      return;
    }
    case "lot.complete": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        if (lot.route.terminal !== "complete") throw new Error(`Lot '${id}' cannot complete before its Route reaches a complete terminal`);
        removeLotFromBuffer(state, lot, mutation.device, mutation.buffer);
        setLotStatus(lot, state.tick, "completed", { kind: "completed", device: mutation.device });
        lot.completedAtTick = state.tick;
      }
      return;
    }
    case "lot.scrap": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        if (lot.status !== "processing" || lot.location.kind !== "device" || lot.location.device !== mutation.device) {
          throw new Error(`Lot '${id}' is not processing on ${mutation.device}`);
        }
        setLotStatus(lot, state.tick, "scrapped", { kind: "scrapped", device: mutation.device, reason: mutation.reason });
      }
      return;
    }
    case "lot.scrap-buffer": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        if (lot.route.terminal !== "scrap") throw new Error(`Lot '${id}' cannot be discarded before its Route reaches a scrap terminal`);
        removeLotFromBuffer(state, lot, mutation.device, mutation.buffer);
        setLotStatus(lot, state.tick, "scrapped", { kind: "scrapped", device: mutation.device, reason: mutation.reason });
      }
      return;
    }
    case "lot.quality-excursion": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        if (lot.quality.appliedExcursions.includes(mutation.excursion)) continue;
        lot.quality.appliedExcursions.push(mutation.excursion);
        lot.quality.appliedExcursions.sort();
        lot.quality.defects = [...new Set([...lot.quality.defects, ...mutation.defects])].sort();
      }
      return;
    }
    case "lot.inspect": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        lot.quality.inspections += 1;
        if (mutation.result === "pass") lot.quality.passes += 1;
        else if (mutation.result === "reject") lot.quality.rejections += 1;
        else lot.quality.scrapDispositions += 1;
      }
      return;
    }
    case "lot.rework": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        const repairs = new Set(mutation.repairs);
        lot.quality.defects = lot.quality.defects.filter((defect) => !repairs.has(defect));
        lot.quality.reworkCycles += 1;
      }
      return;
    }
    case "lot.checkpoint": {
      for (const id of mutation.lotIds) {
        const lot = state.lots[id];
        if (!lot) throw new Error(`Unknown lot '${id}'`);
        advanceLotClock(lot, state.tick);
      }
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
    case "setup.finish": {
      const setup = state.devices[mutation.device]!.setup;
      if (!setup) throw new Error(`Device '${mutation.device}' does not track equipment setup`);
      setup.group = mutation.group;
      setup.changeovers++;
      setup.setupTicks += mutation.durationTicks;
      return;
    }
    case "production.finish": {
      const maintenance = state.devices[mutation.device]!.maintenance;
      if (!maintenance) throw new Error(`Device '${mutation.device}' does not track equipment maintenance`);
      maintenance.jobsSinceMaintenance++;
      return;
    }
    case "maintenance.finish": {
      const maintenance = state.devices[mutation.device]!.maintenance;
      if (!maintenance) throw new Error(`Device '${mutation.device}' does not track equipment maintenance`);
      maintenance.jobsSinceMaintenance = 0;
      maintenance.completed++;
      maintenance[mutation.cause]++;
      maintenance.maintenanceTicks += mutation.durationTicks;
      return;
    }
    case "maintenance.cancel": {
      const maintenance = state.devices[mutation.device]!.maintenance;
      if (!maintenance) throw new Error(`Device '${mutation.device}' does not track equipment maintenance`);
      maintenance.cancelled++;
      return;
    }
    case "campaign.hold": {
      const setup = state.devices[mutation.device]!.setup;
      if (!setup) throw new Error(`Device '${mutation.device}' does not track equipment setup`);
      setup.campaign = { targetGroup: mutation.targetGroup, sinceTick: state.tick, deadlineTick: mutation.deadlineTick };
      setup.campaignHolds++;
      return;
    }
    case "campaign.release": {
      const setup = state.devices[mutation.device]!.setup;
      if (!setup?.campaign) throw new Error(`Device '${mutation.device}' has no held setup campaign`);
      setup.campaignHoldTicks += state.tick - setup.campaign.sinceTick;
      if (mutation.cause === "minimum-ready-lots") setup.campaignMinimumLotReleases++;
      else setup.campaignMaximumHoldReleases++;
      delete setup.campaign;
      return;
    }
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
