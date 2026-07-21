import type { CompiledFactoryProject, FactoryMetrics, FactoryState, ScoreBreakdown, Tick } from "./types";

export interface SimulationStats {
  durations: Record<string, Record<string, Tick>>;
  wipArea: number;
  congestionArea: number;
  beltOccupancyArea: number;
  beltItemArea: number;
  beltBlockedArea: number;
  peakBeltItems: number;
  transportStageActiveArea: Record<string, { loader: number; unloader: number }>;
  connectionOccupancyArea: Record<string, number>;
  connectionBlockedArea: Record<string, number>;
  connectionDepartedItems: Record<string, number>;
  connectionDeliveredItems: Record<string, number>;
  connectionDepartedByResource: Record<string, Record<string, number>>;
  connectionDeliveredByResource: Record<string, Record<string, number>>;
  consumedByRegion: Record<string, Record<string, number>>;
  powerGrids: Record<string, {
    generatedMilliJoules: number; demandMilliJoules: number; servedMilliJoules: number; unservedMilliJoules: number; curtailedMilliJoules: number;
    peakGenerationMilliWatts: number; peakDemandMilliWatts: number; peakDeficitMilliWatts: number; peakSurplusMilliWatts: number;
    currentDeficitEpisodeMilliJoules: number; requiredStorageCapacityMilliJoules: number;
  }>;
  transportEnergyConsumedMilliJoules: number;
  elapsedTicks: number;
}

export function evaluateFactory(project: CompiledFactoryProject, state: FactoryState, stats: SimulationStats): FactoryMetrics {
  const duration = Math.max(1, state.tick);
  const occupiedArea = Object.values(project.devices).reduce((sum, device) => sum + device.footprint.width * device.footprint.height, 0) + Object.keys(project.transportCells).length;
  const totalBuildCost = Object.values(project.devices).reduce((sum, device) => sum + (device.assetDef.economics?.buildCost ?? 0), 0)
    + Object.values(project.connections).reduce((sum, connection) => sum + connection.logisticsStages.filter((stage) => stage.stage !== "line").reduce((stageSum, stage) => stageSum + stage.asset.economics.buildCost * stage.distance, 0), 0)
    + Object.values(project.transportCells).reduce((sum, cell) => sum + cell.asset.economics.buildCost, 0)
    + Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.fleetAsset.economics.buildCost * network.fleetSize, 0);
  const targetProduced = stats.consumedByRegion[project.objective.targetRegion]?.[project.objective.targetResource] ?? 0;
  const throughputPerMinute = targetProduced * 60_000 / duration;
  const machineUtilization: Record<string, number> = {};
  const idleTime: Record<string, Tick> = {};
  const waitingInputTime: Record<string, Tick> = {};
  const blockedOutputTime: Record<string, Tick> = {};
  const unpoweredTime: Record<string, Tick> = {};
  let bottleneckEntity: string | null = null; let bottleneckValue = -1;
  for (const id of Object.keys(project.devices).sort()) {
    const times = stats.durations[id] ?? {};
    machineUtilization[id] = (times.processing ?? 0) / duration;
    idleTime[id] = times.idle ?? 0;
    waitingInputTime[id] = times["waiting-input"] ?? 0;
    blockedOutputTime[id] = times["blocked-output"] ?? 0;
    unpoweredTime[id] = times.unpowered ?? 0;
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
    return [connection.id, { loader: active.loader / duration / loader.capacity, unloader: active.unloader / duration / unloader.capacity }];
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
  const onTimeDelivery = Math.min(1, throughputPerMinute / project.objective.targetRatePerMinute);
  const weights = project.objective.weights;
  const scoreBreakdown: ScoreBreakdown = {
    throughput: throughputPerMinute * weights.throughput,
    onTimeDelivery: onTimeDelivery * (weights.onTimeDelivery ?? 0),
    energy: -(state.energy.consumedMilliJoules / 1_000_000) * weights.energy,
    buildCost: -(totalBuildCost / 1_000) * weights.buildCost,
    occupiedArea: -occupiedArea * weights.occupiedArea,
    wip: -averageWip * weights.wip,
    blocked: -(Object.values(blockedOutputTime).reduce((a, b) => a + b, 0) / duration) * weights.blocked,
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
  return {
    produced: { ...state.produced }, consumed: { ...state.consumed }, extracted, resourceNodes, throughputPerMinute,
    completedOrders: state.completedOrders, onTimeDelivery, energyConsumedMilliJoules: state.energy.consumedMilliJoules, energyStorage, fuelConsumed: { ...state.energy.fuelConsumed },
    powerGrids: Object.fromEntries(Object.entries(stats.powerGrids).map(([grid, power]) => [grid, {
      generatedMilliJoules: power.generatedMilliJoules, demandMilliJoules: power.demandMilliJoules,
      servedMilliJoules: power.servedMilliJoules, unservedMilliJoules: power.unservedMilliJoules, curtailedMilliJoules: power.curtailedMilliJoules,
      peakGenerationMilliWatts: power.peakGenerationMilliWatts, peakDemandMilliWatts: power.peakDemandMilliWatts,
      peakDeficitMilliWatts: power.peakDeficitMilliWatts, peakSurplusMilliWatts: power.peakSurplusMilliWatts,
      requiredStorageCapacityMilliJoules: power.requiredStorageCapacityMilliJoules,
    }])),
    materialTreatment: structuredClone(state.materialTreatment),
    totalBuildCost, occupiedArea, machineUtilization, idleTime, waitingInputTime, blockedOutputTime, unpoweredTime,
    averageWip, averageBeltItems, averageBlockedBeltItems, peakBeltItems: stats.peakBeltItems, beltCellUtilization,
    transportStageUtilization, transportFlows, transportEnergyConsumedMilliJoules: stats.transportEnergyConsumedMilliJoules,
    transportCongestion, bottleneckEntity, infeasibleReason: violations.length ? violations.join("; ") : null,
    scoreBreakdown, finalScore,
  };
}
