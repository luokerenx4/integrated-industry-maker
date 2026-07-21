import type { CompiledFactoryProject, FactoryMetrics, FactoryState, ScoreBreakdown, Tick } from "./types";

export interface SimulationStats {
  durations: Record<string, Record<string, Tick>>;
  wipArea: number;
  congestionArea: number;
  beltOccupancyArea: number;
  beltItemArea: number;
  beltBlockedArea: number;
  peakBeltItems: number;
  peakActiveLots: number;
  releaseControlServiceLevelOpenings: number;
  transportStageActiveArea: Record<string, { loader: number; unloader: number }>;
  connectionOccupancyArea: Record<string, number>;
  connectionBlockedArea: Record<string, number>;
  connectionDepartedItems: Record<string, number>;
  connectionDeliveredItems: Record<string, number>;
  connectionDepartedByResource: Record<string, Record<string, number>>;
  connectionDeliveredByResource: Record<string, Record<string, number>>;
  stationFleetBusyArea: Record<string, number>;
  stationFleetCompletedReturns: Record<string, number>;
  lotProcessBatches: Record<string, {
    device: string; process: string; mode: string; expectedLotsPerJob: number;
    jobs: number; lots: number; queueWaitTicks: number; maximumLotsPerJob: number;
  }>;
  consumedByRegion: Record<string, Record<string, number>>;
  powerGrids: Record<string, {
    generatedMilliJoules: number; demandMilliJoules: number; servedMilliJoules: number; unservedMilliJoules: number; curtailedMilliJoules: number;
    peakGenerationMilliWatts: number; peakDemandMilliWatts: number; peakDeficitMilliWatts: number; peakSurplusMilliWatts: number;
    currentDeficitEpisodeMilliJoules: number; requiredStorageCapacityMilliJoules: number;
    satisfactionPpmArea: number; minimumSatisfactionPpm: number;
  }>;
  transportEnergyConsumedMilliJoules: number;
  elapsedTicks: number;
}

export function evaluateFactory(project: CompiledFactoryProject, state: FactoryState, stats: SimulationStats): FactoryMetrics {
  const duration = Math.max(1, state.tick);
  const occupiedArea = Object.values(project.devices).reduce((sum, device) => sum + (device.transportEndpoint ? 0 : device.footprint.width * device.footprint.height), 0) + Object.keys(project.transportCells).length;
  const totalBuildCost = Object.values(project.devices).reduce((sum, device) => sum + (device.assetDef.economics?.buildCost ?? 0), 0)
    + Object.values(project.transportCells).reduce((sum, cell) => sum + cell.asset.economics.buildCost, 0)
    + Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.fleets.reduce((fleetSum, fleet) => fleetSum + fleet.asset.economics.buildCost * fleet.count, 0), 0);
  const targetProduced = stats.consumedByRegion[project.objective.targetRegion]?.[project.objective.targetResource] ?? 0;
  const throughputPerMinute = targetProduced * 60_000 / duration;
  const targetFamily = project.resources[project.objective.targetResource]?.tracking?.family ?? null;
  const targetLots = targetFamily ? Object.values(state.lots).filter((lot) => lot.family === targetFamily) : [];
  const releasedTargetLots = targetLots.filter((lot) => lot.releasedAtTick !== undefined);
  const completedTargetLots = releasedTargetLots.filter((lot) => lot.status === "completed" && lot.resource === project.objective.targetResource && lot.completedAtTick !== undefined);
  const mean = (values: number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const intervals = (ticks: number[]): number[] => {
    const sorted = [...ticks].sort((a, b) => a - b);
    return sorted.slice(1).map((tick, index) => tick - sorted[index]!);
  };
  const elapsed = (lot: (typeof targetLots)[number], status: "queued" | "processing" | "transport" | "completed" | "scrapped"): number => lot.status === status ? state.tick - lot.statusSinceTick : 0;
  const cycleTimes = completedTargetLots.map((lot) => lot.completedAtTick! - lot.releasedAtTick!).sort((a, b) => a - b);
  const tardiness = completedTargetLots.map((lot) => Math.max(0, lot.completedAtTick! - (lot.dueTick ?? lot.completedAtTick!))).sort((a, b) => a - b);
  const plannedReleaseTicks = targetLots.map((lot) => lot.plannedReleaseTick).sort((a, b) => a - b);
  const actualReleaseTicks = releasedTargetLots.map((lot) => lot.releasedAtTick!).sort((a, b) => a - b);
  const releaseDelays = targetLots.map((lot) => Math.max(0, (lot.releasedAtTick ?? state.tick) - lot.plannedReleaseTick));
  const releaseBlockedTicks = (lot: (typeof targetLots)[number], reason: keyof (typeof lot.releaseWait.ticks)): number =>
    lot.releaseWait.ticks[reason] + (lot.releaseWait.reason === reason ? Math.max(0, state.tick - lot.releaseWait.sinceTick) : 0);
  const capacityReasons = ["buffer-capacity", "resource-capacity"] as const;
  const releasePolicy = project.blueprint.policies.lotRelease;
  const lotFlow: FactoryMetrics["lotFlow"] = {
    family: targetFamily,
    scheduled: targetLots.length,
    released: releasedTargetLots.length,
    pendingRelease: targetLots.length - releasedTargetLots.length,
    completed: completedTargetLots.length,
    scrapped: releasedTargetLots.filter((lot) => lot.status === "scrapped").length,
    onTimeCompleted: completedTargetLots.filter((lot) => lot.dueTick === undefined || lot.completedAtTick! <= lot.dueTick).length,
    inProgress: releasedTargetLots.filter((lot) => lot.status !== "completed" && lot.status !== "scrapped").length,
    meanCycleTimeTicks: mean(cycleTimes),
    p95CycleTimeTicks: cycleTimes.length ? cycleTimes[Math.max(0, Math.ceil(cycleTimes.length * .95) - 1)]! : 0,
    maximumCycleTimeTicks: cycleTimes.at(-1) ?? 0,
    meanQueueTimeTicks: mean(completedTargetLots.map((lot) => lot.queueTicks + elapsed(lot, "queued"))),
    meanProcessTimeTicks: mean(completedTargetLots.map((lot) => lot.processTicks + elapsed(lot, "processing"))),
    meanTransportTimeTicks: mean(completedTargetLots.map((lot) => lot.transportTicks + elapsed(lot, "transport"))),
    meanTardinessTicks: mean(tardiness),
    maximumTardinessTicks: tardiness.at(-1) ?? 0,
  };
  const releaseFlow: FactoryMetrics["releaseFlow"] = {
    scheduled: targetLots.length,
    released: releasedTargetLots.length,
    pending: targetLots.length - releasedTargetLots.length,
    plannedSpanTicks: plannedReleaseTicks.length ? plannedReleaseTicks.at(-1)! - plannedReleaseTicks[0]! : 0,
    actualSpanTicks: actualReleaseTicks.length ? actualReleaseTicks.at(-1)! - actualReleaseTicks[0]! : 0,
    meanPlannedIntervalTicks: mean(intervals(plannedReleaseTicks)),
    meanActualIntervalTicks: mean(intervals(actualReleaseTicks)),
    meanReleaseDelayTicks: mean(releaseDelays),
    maximumReleaseDelayTicks: releaseDelays.length ? Math.max(...releaseDelays) : 0,
    control: releasePolicy ? "conwip" : "open-loop",
    maximumWip: releasePolicy?.maximumWip ?? null,
    reopenAtWip: releasePolicy?.reopenAtWip ?? null,
    maximumReleaseDelayPolicyTicks: releasePolicy?.maximumReleaseDelayTicks ?? null,
    dispatch: releasePolicy?.dispatch ?? null,
    peakActiveLots: stats.peakActiveLots,
    capacityBlockedLots: targetLots.filter((lot) => capacityReasons.some((reason) => lot.releaseWait.encountered.includes(reason))).length,
    capacityBlockedTicks: targetLots.reduce((sum, lot) => sum + capacityReasons.reduce((lotSum, reason) => lotSum + releaseBlockedTicks(lot, reason), 0), 0),
    controlBlockedLots: targetLots.filter((lot) => lot.releaseWait.encountered.includes("conwip-limit")).length,
    controlBlockedTicks: targetLots.reduce((sum, lot) => sum + releaseBlockedTicks(lot, "conwip-limit"), 0),
    serviceLevelOpenings: stats.releaseControlServiceLevelOpenings,
  };
  const defectFreeCompleted = completedTargetLots.filter((lot) => lot.quality.defects.length === 0).length;
  const firstPassCompleted = completedTargetLots.filter((lot) => lot.quality.reworkCycles === 0 && lot.quality.defects.length === 0).length;
  const qualityFlow: FactoryMetrics["qualityFlow"] = {
    inspectedLots: releasedTargetLots.filter((lot) => lot.quality.inspections > 0).length,
    totalInspections: releasedTargetLots.reduce((sum, lot) => sum + lot.quality.inspections, 0),
    passedInspections: releasedTargetLots.reduce((sum, lot) => sum + lot.quality.passes, 0),
    rejectedInspections: releasedTargetLots.reduce((sum, lot) => sum + lot.quality.rejections, 0),
    scrapDispositions: releasedTargetLots.reduce((sum, lot) => sum + lot.quality.scrapDispositions, 0),
    reworkedLots: releasedTargetLots.filter((lot) => lot.quality.reworkCycles > 0).length,
    totalReworkCycles: releasedTargetLots.reduce((sum, lot) => sum + lot.quality.reworkCycles, 0),
    defectFreeCompleted,
    firstPassCompleted,
    escapedDefects: completedTargetLots.filter((lot) => lot.quality.defects.length > 0).length,
    activeDefects: releasedTargetLots.filter((lot) => lot.status !== "completed" && lot.status !== "scrapped")
      .reduce((sum, lot) => sum + lot.quality.defects.length, 0),
    goodYield: releasedTargetLots.length ? defectFreeCompleted / releasedTargetLots.length : 0,
    firstPassYield: releasedTargetLots.length ? firstPassCompleted / releasedTargetLots.length : 0,
  };
  const batchOperations = Object.fromEntries(Object.entries(stats.lotProcessBatches)
    .filter(([, operation]) => operation.expectedLotsPerJob > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, operation]) => [key, {
      device: operation.device, process: operation.process, mode: operation.mode,
      expectedLotsPerJob: operation.expectedLotsPerJob, jobs: operation.jobs, lots: operation.lots,
      averageLotsPerJob: operation.jobs ? operation.lots / operation.jobs : 0,
      maximumLotsPerJob: operation.maximumLotsPerJob,
      meanQueueWaitTicksPerLot: operation.lots ? operation.queueWaitTicks / operation.lots : 0,
    }]));
  const batchFlow: FactoryMetrics["batchFlow"] = {
    batchOperations: Object.keys(batchOperations).length,
    jobs: Object.values(batchOperations).reduce((sum, operation) => sum + operation.jobs, 0),
    lots: Object.values(batchOperations).reduce((sum, operation) => sum + operation.lots, 0),
    averageLotsPerJob: 0,
    meanQueueWaitTicksPerLot: 0,
    operations: batchOperations,
  };
  batchFlow.averageLotsPerJob = batchFlow.jobs ? batchFlow.lots / batchFlow.jobs : 0;
  const totalBatchQueueWait = Object.values(batchOperations)
    .reduce((sum, operation) => sum + operation.meanQueueWaitTicksPerLot * operation.lots, 0);
  batchFlow.meanQueueWaitTicksPerLot = batchFlow.lots ? totalBatchQueueWait / batchFlow.lots : 0;
  const machineUtilization: Record<string, number> = {};
  const idleTime: Record<string, Tick> = {};
  const waitingInputTime: Record<string, Tick> = {};
  const blockedOutputTime: Record<string, Tick> = {};
  const unpoweredTime: Record<string, Tick> = {};
  const failedTime: Record<string, Tick> = {};
  let bottleneckEntity: string | null = null; let bottleneckValue = -1;
  for (const id of Object.keys(project.devices).sort()) {
    const times = stats.durations[id] ?? {};
    machineUtilization[id] = (times.processing ?? 0) / duration;
    idleTime[id] = times.idle ?? 0;
    waitingInputTime[id] = times["waiting-input"] ?? 0;
    blockedOutputTime[id] = times["blocked-output"] ?? 0;
    unpoweredTime[id] = times.unpowered ?? 0;
    failedTime[id] = times.failed ?? 0;
    const value = machineUtilization[id]! * duration + blockedOutputTime[id]! * 0.5;
    const processCapable = project.devices[id]!.assetDef.capabilities.includes("process");
    if (processCapable && value > bottleneckValue) {
      bottleneckValue = value; bottleneckEntity = id;
    }
  }
  const constraints = project.objective.constraints ?? {};
  const violations: string[] = [];
  if (constraints.maxBuildCost !== undefined && totalBuildCost > constraints.maxBuildCost) violations.push(`build cost ${totalBuildCost} exceeds ${constraints.maxBuildCost}`);
  if (constraints.maxOccupiedArea !== undefined && occupiedArea > constraints.maxOccupiedArea) violations.push(`occupied area ${occupiedArea} exceeds ${constraints.maxOccupiedArea}`);
  if (constraints.minProduction !== undefined && targetProduced < constraints.minProduction) violations.push(`production ${targetProduced} is below ${constraints.minProduction}`);
  const averageWip = stats.wipArea / duration;
  const averageBeltItems = stats.beltItemArea / duration;
  const averageBlockedBeltItems = stats.beltBlockedArea / duration;
  const beltCellUtilization = stats.beltOccupancyArea / duration / Math.max(1, Object.keys(project.transportCells).length);
  const transportStageUtilization = Object.fromEntries(Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id)).map((connection) => {
    const active = stats.transportStageActiveArea[connection.id] ?? { loader: 0, unloader: 0 };
    const loader = connection.logisticsStages.find((stage) => stage.stage === "loader")!;
    const unloader = connection.logisticsStages.find((stage) => stage.stage === "unloader")!;
    const utilization = { loader: active.loader / duration / loader.capacity, unloader: active.unloader / duration / unloader.capacity };
    if (loader.device) {
      machineUtilization[loader.device.id] = utilization.loader;
    }
    if (unloader.device) {
      machineUtilization[unloader.device.id] = utilization.unloader;
    }
    return [connection.id, utilization];
  }));
  const transportFlows = Object.fromEntries(Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id)).map((connection) => {
    const departedItems = stats.connectionDepartedItems[connection.id] ?? 0;
    const deliveredItems = stats.connectionDeliveredItems[connection.id] ?? 0;
    const departedByResource = { ...(stats.connectionDepartedByResource[connection.id] ?? {}) };
    const deliveredByResource = { ...(stats.connectionDeliveredByResource[connection.id] ?? {}) };
    const departedItemsPerMinute = departedItems * 60_000 / duration;
    const deliveredItemsPerMinute = deliveredItems * 60_000 / duration;
    const deliveredEntries = Object.entries(deliveredByResource);
    const equivalentStacks = deliveredEntries.reduce((sum, [resource, count]) => sum + count / (connection.stackSizeByResource[resource] ?? 1), 0);
    const effectiveStackSize = equivalentStacks > 0 ? deliveredItems / equivalentStacks : connection.maxStackSize;
    const capacityItemsPerMinute = effectiveStackSize * 60_000 / connection.dispatchIntervalTicks;
    const occupancyArea = stats.connectionOccupancyArea[connection.id] ?? 0;
    const blockedItemTicks = stats.connectionBlockedArea[connection.id] ?? 0;
    return [connection.id, {
      departedItems, deliveredItems, departedByResource, deliveredByResource, departedItemsPerMinute, deliveredItemsPerMinute, capacityItemsPerMinute,
      utilization: deliveredItemsPerMinute / capacityItemsPerMinute,
      averageInFlightItems: occupancyArea / duration,
      blockedItemTicks,
      blockedFraction: blockedItemTicks / Math.max(1, occupancyArea),
    }];
  }));
  const transportEntityCount = Object.keys(project.connections).length + Object.keys(project.logisticsNetworks).length;
  const transportCongestion = stats.congestionArea / duration / Math.max(1, transportEntityCount);
  const setupDevices = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.setup)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => [id, {
      ...runtime.setup!,
      campaignHoldTicks: runtime.setup!.campaignHoldTicks
        + (runtime.setup!.campaign ? state.tick - runtime.setup!.campaign.sinceTick : 0),
    }]));
  const equipmentSetups: FactoryMetrics["equipmentSetups"] = {
    totalChangeovers: Object.values(setupDevices).reduce((sum, setup) => sum + setup.changeovers, 0),
    totalSetupTicks: Object.values(setupDevices).reduce((sum, setup) => sum + setup.setupTicks, 0),
    totalCampaignHolds: Object.values(setupDevices).reduce((sum, setup) => sum + setup.campaignHolds, 0),
    totalCampaignHoldTicks: Object.values(setupDevices).reduce((sum, setup) => sum + setup.campaignHoldTicks, 0),
    campaignMinimumLotReleases: Object.values(setupDevices).reduce((sum, setup) => sum + setup.campaignMinimumLotReleases, 0),
    campaignMaximumHoldReleases: Object.values(setupDevices).reduce((sum, setup) => sum + setup.campaignMaximumHoldReleases, 0),
    devices: setupDevices,
  };
  const onTimeDelivery = targetLots.length ? lotFlow.onTimeCompleted / targetLots.length : Math.min(1, throughputPerMinute / project.objective.targetRatePerMinute);
  const weights = project.objective.weights;
  const scoreBreakdown: ScoreBreakdown = {
    throughput: throughputPerMinute * weights.throughput,
    onTimeDelivery: onTimeDelivery * (weights.onTimeDelivery ?? 0),
    energy: -(state.energy.consumedMilliJoules / 1_000_000) * weights.energy,
    buildCost: -(totalBuildCost / 1_000) * weights.buildCost,
    occupiedArea: -occupiedArea * weights.occupiedArea,
    wip: -averageWip * weights.wip,
    blocked: -(Object.values(blockedOutputTime).reduce((a, b) => a + b, 0) / duration) * weights.blocked,
    cycleTime: -(lotFlow.meanCycleTimeTicks / 60_000) * (weights.cycleTime ?? 0),
    tardiness: -(lotFlow.meanTardinessTicks / 60_000) * (weights.tardiness ?? 0),
    changeovers: -equipmentSetups.totalChangeovers * (weights.changeovers ?? 0),
    qualityEscapes: -qualityFlow.escapedDefects * (weights.qualityEscapes ?? 0),
    rework: -qualityFlow.totalReworkCycles * (weights.rework ?? 0),
    constraintPenalty: violations.length ? -1_000_000 : 0,
  };
  const finalScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const extracted: Record<string, number> = {};
  const resourceNodes = Object.fromEntries(Object.values(project.resourceNodes).sort((a, b) => a.id.localeCompare(b.id)).map((node) => {
    const runtime = state.resourceNodes[node.id]!;
    extracted[node.resource] = (extracted[node.resource] ?? 0) + runtime.extracted;
    return [node.id, { initial: node.amount, remaining: runtime.remaining, reserved: runtime.reserved, extracted: runtime.extracted, depleted: runtime.remaining === 0 && runtime.reserved === 0 }];
  }));
  const energyStorage = Object.fromEntries(Object.values(project.powerGrids).sort((a, b) => a.id.localeCompare(b.id)).map((grid) => {
    const runtime = state.energy.grids[grid.id]!;
    const initialMilliJoules = grid.storageDevices.reduce((sum, id) => sum + (state.devices[id]!.energyStorage?.initialMilliJoules ?? 0), 0);
    return [grid.id, {
      initialMilliJoules,
      storedMilliJoules: runtime.storedMilliJoules,
      capacityMilliJoules: runtime.storageCapacityMilliJoules,
      chargedMilliJoules: runtime.chargedMilliJoules,
      dischargedMilliJoules: runtime.dischargedMilliJoules,
    }];
  }));
  const stationEnergy = Object.fromEntries(Object.values(project.devices).filter((device) => device.stationEnergyPlan)
    .sort((a, b) => a.id.localeCompare(b.id)).map((device) => {
      const energy = state.devices[device.id]!.stationEnergy!;
      return [device.id, {
        initialMilliJoules: energy.initialMilliJoules,
        storedMilliJoules: energy.storedMilliJoules,
        capacityMilliJoules: energy.capacityMilliJoules,
        chargedMilliJoules: energy.chargedMilliJoules,
        spentMilliJoules: energy.spentMilliJoules,
        configuredChargeMilliWatts: device.stationEnergyPlan!.chargeMilliWatts,
      }];
    }));
  const stationFleets = Object.fromEntries(Object.values(project.logisticsNetworks).flatMap((network) => network.fleets.map((fleet) => {
    const key = `${network.id}:${fleet.station}`;
    return [key, {
    network: network.id,
    station: fleet.station,
    carrierAsset: fleet.asset.id,
    configuredCarriers: fleet.count,
    activeMissions: state.logisticsMissions[network.id]!.filter((mission) => mission.homeStation === fleet.station && mission.carrierAsset === fleet.asset.id).length,
    completedReturns: stats.stationFleetCompletedReturns[key] ?? 0,
    utilization: fleet.count > 0 ? (stats.stationFleetBusyArea[key] ?? 0) / duration / fleet.count : 0,
  }] as const;
  })));
  return {
    produced: { ...state.produced }, consumed: { ...state.consumed }, extracted, resourceNodes, throughputPerMinute,
    completedOrders: state.completedOrders, highSpeedMissions: state.highSpeedMissions,
    carrierMissions: state.carrierMissions, carrierReturns: state.carrierReturns, stationFleets,
    onTimeDelivery, lotFlow, releaseFlow, qualityFlow, batchFlow, energyConsumedMilliJoules: state.energy.consumedMilliJoules, energyStorage, stationEnergy, fuelConsumed: { ...state.energy.fuelConsumed },
    powerGrids: Object.fromEntries(Object.entries(stats.powerGrids).map(([grid, power]) => [grid, {
      generatedMilliJoules: power.generatedMilliJoules, demandMilliJoules: power.demandMilliJoules,
      servedMilliJoules: power.servedMilliJoules, unservedMilliJoules: power.unservedMilliJoules, curtailedMilliJoules: power.curtailedMilliJoules,
      peakGenerationMilliWatts: power.peakGenerationMilliWatts, peakDemandMilliWatts: power.peakDemandMilliWatts,
      peakDeficitMilliWatts: power.peakDeficitMilliWatts, peakSurplusMilliWatts: power.peakSurplusMilliWatts,
      averageSatisfactionPpm: power.satisfactionPpmArea / duration,
      minimumSatisfactionPpm: power.minimumSatisfactionPpm,
      requiredStorageCapacityMilliJoules: power.requiredStorageCapacityMilliJoules,
    }])),
    materialTreatment: structuredClone(state.materialTreatment), equipmentSetups,
    totalBuildCost, occupiedArea, machineUtilization, idleTime, waitingInputTime, blockedOutputTime, unpoweredTime, failedTime,
    averageWip, averageBeltItems, averageBlockedBeltItems, peakBeltItems: stats.peakBeltItems, beltCellUtilization,
    transportStageUtilization, transportFlows, transportEnergyConsumedMilliJoules: stats.transportEnergyConsumedMilliJoules,
    transportCongestion, bottleneckEntity, infeasibleReason: violations.length ? violations.join("; ") : null,
    scoreBreakdown, finalScore,
  };
}
