import type { CompiledFactoryProject, FactoryMetrics, FactoryState, ScoreBreakdown, Tick } from "./types";

export interface SimulationStats {
  durations: Record<string, Record<string, Tick>>;
  wipArea: number;
  congestionArea: number;
  beltOccupancyArea: number;
  beltBlockedArea: number;
  peakBeltItems: number;
  transportStageActiveArea: Record<string, { loader: number; unloader: number }>;
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
  const targetProduced = state.consumed[project.objective.targetResource] ?? 0;
  const throughputPerMinute = targetProduced * 60_000 / duration;
  const machineUtilization: Record<string, number> = {};
  const idleTime: Record<string, Tick> = {};
  const waitingInputTime: Record<string, Tick> = {};
  const blockedOutputTime: Record<string, Tick> = {};
  let bottleneckEntity: string | null = null; let bottleneckValue = -1;
  for (const id of Object.keys(project.devices).sort()) {
    const times = stats.durations[id] ?? {};
    machineUtilization[id] = (times.processing ?? 0) / duration;
    idleTime[id] = times.idle ?? 0;
    waitingInputTime[id] = times["waiting-input"] ?? 0;
    blockedOutputTime[id] = times["blocked-output"] ?? 0;
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
  const averageBeltItems = stats.beltOccupancyArea / duration;
  const averageBlockedBeltItems = stats.beltBlockedArea / duration;
  const beltCellUtilization = averageBeltItems / Math.max(1, Object.keys(project.transportCells).length);
  const transportStageUtilization = Object.fromEntries(Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id)).map((connection) => {
    const active = stats.transportStageActiveArea[connection.id] ?? { loader: 0, unloader: 0 };
    const loader = connection.logisticsStages.find((stage) => stage.stage === "loader")!;
    const unloader = connection.logisticsStages.find((stage) => stage.stage === "unloader")!;
    return [connection.id, { loader: active.loader / duration / loader.capacity, unloader: active.unloader / duration / unloader.capacity }];
  }));
  const transportEntityCount = Object.keys(project.connections).length + Object.keys(project.logisticsNetworks).length;
  const transportCongestion = stats.congestionArea / duration / Math.max(1, transportEntityCount);
  const onTimeDelivery = constraints.minProduction ? Math.min(1, targetProduced / constraints.minProduction) : targetProduced > 0 ? 1 : 0;
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
  return {
    produced: { ...state.produced }, consumed: { ...state.consumed }, extracted, resourceNodes, throughputPerMinute,
    completedOrders: state.completedOrders, onTimeDelivery, energyConsumedMilliJoules: state.energy.consumedMilliJoules, fuelConsumed: { ...state.energy.fuelConsumed },
    totalBuildCost, occupiedArea, machineUtilization, idleTime, waitingInputTime, blockedOutputTime,
    averageWip, averageBeltItems, averageBlockedBeltItems, peakBeltItems: stats.peakBeltItems, beltCellUtilization,
    transportStageUtilization, transportEnergyConsumedMilliJoules: stats.transportEnergyConsumedMilliJoules,
    transportCongestion, bottleneckEntity, infeasibleReason: violations.length ? violations.join("; ") : null,
    scoreBreakdown, finalScore,
  };
}
