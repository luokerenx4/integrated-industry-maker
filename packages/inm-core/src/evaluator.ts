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
  lotOutputProfiles: Record<string, {
    jobs: number;
    profiles: Record<string, number>;
    nominalOutputs: Record<string, number>;
    actualOutputs: Record<string, number>;
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
  const objectiveContracts = project.objective.deliveryContracts ?? [{
    id: "primary", name: project.objective.name, resource: project.objective.targetResource, region: project.objective.targetRegion,
    demandPerMinute: project.objective.targetRatePerMinute, valuePerItem: 0, shortfallPenaltyPerItem: 0,
  }];
  const contractMetrics = objectiveContracts.map((contract) => {
    const demand = contract.demandPerMinute * duration / 60_000;
    const delivered = stats.consumedByRegion[contract.region]?.[contract.resource] ?? 0;
    const valued = delivered;
    const overflow = Math.max(0, delivered - demand);
    const shortfall = Math.max(0, demand - delivered);
    const fulfillment = demand > 0 ? delivered / demand : 1;
    const grossValue = valued * contract.valuePerItem;
    const shortfallPenalty = shortfall * contract.shortfallPenaltyPerItem;
    return { ...contract, demand, delivered, valued, overflow, shortfall, fulfillment, grossValue, shortfallPenalty, netValue: grossValue - shortfallPenalty };
  });
  const demanded = contractMetrics.reduce((sum, contract) => sum + contract.demand, 0);
  const targetProduced = contractMetrics.reduce((sum, contract) => sum + contract.delivered, 0);
  const valued = contractMetrics.reduce((sum, contract) => sum + contract.valued, 0);
  const grossValue = contractMetrics.reduce((sum, contract) => sum + contract.grossValue, 0);
  const shortfallPenalty = contractMetrics.reduce((sum, contract) => sum + contract.shortfallPenalty, 0);
  const netValue = grossValue - shortfallPenalty;
  const deliveryPortfolio: FactoryMetrics["deliveryPortfolio"] = {
    demanded, delivered: targetProduced, valued, overflow: contractMetrics.reduce((sum, contract) => sum + contract.overflow, 0),
    fulfillment: demanded > 0 ? targetProduced / demanded : 1,
    grossValue, shortfallPenalty, netValue, netValuePerMinute: netValue * 60_000 / duration,
    contracts: Object.fromEntries(contractMetrics.map((contract) => [contract.id, {
      name: contract.name, resource: contract.resource, region: contract.region,
      demand: contract.demand, delivered: contract.delivered, valued: contract.valued, overflow: contract.overflow,
      shortfall: contract.shortfall, fulfillment: contract.fulfillment, grossValue: contract.grossValue,
      shortfallPenalty: contract.shortfallPenalty, netValue: contract.netValue,
    }])),
  };
  const throughputPerMinute = targetProduced * 60_000 / duration;
  const targetFamily = project.objective.trackedFamily ?? project.resources[project.objective.targetResource]?.tracking?.family ?? null;
  const targetLots = targetFamily ? Object.values(state.lots).filter((lot) => lot.family === targetFamily) : [];
  const releasedTargetLots = targetLots.filter((lot) => lot.releasedAtTick !== undefined);
  const completedTargetLots = releasedTargetLots.filter((lot) => lot.status === "completed"
    && (project.objective.trackedFamily ? lot.route.terminal === "complete" : lot.resource === project.objective.targetResource)
    && lot.completedAtTick !== undefined);
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
  const routeFlow: FactoryMetrics["routeFlow"] = Object.fromEntries(Object.values(project.routes).sort((left, right) => left.id.localeCompare(right.id)).map((route) => {
    const lots = Object.values(state.lots).filter((lot) => lot.route.id === route.id);
    return [route.id, {
      family: route.family,
      scheduled: lots.length,
      completed: lots.filter((lot) => lot.route.terminal === "complete").length,
      scrapped: lots.filter((lot) => lot.route.terminal === "scrap").length,
      inProgress: lots.filter((lot) => lot.releasedAtTick !== undefined && !lot.route.terminal && lot.status !== "scrapped").length,
      transitions: lots.reduce((sum, lot) => sum + lot.route.completedSteps, 0),
      reentrantTransitions: lots.reduce((sum, lot) => sum + lot.route.reentrantTransitions, 0),
      queueTimeViolations: lots.reduce((sum, lot) => sum + lot.route.queueTimeViolations, 0),
      violatedLots: lots.filter((lot) => lot.route.queueTimeViolations > 0).length,
      steps: Object.fromEntries(route.steps.map((step) => {
        const starts = lots.reduce((sum, lot) => sum + (lot.route.queue[step.id]?.starts ?? 0), 0);
        const totalQueueTicks = lots.reduce((sum, lot) => sum + (lot.route.queue[step.id]?.totalTicks ?? 0), 0);
        return [step.id, {
          visits: lots.reduce((sum, lot) => sum + (lot.route.visits[step.id] ?? 0), 0),
          starts,
          activeLots: lots.filter((lot) => lot.route.step === step.id).length,
          meanQueueTicks: starts ? totalQueueTicks / starts : 0,
          maximumQueueTicks: lots.reduce((maximum, lot) => Math.max(maximum, lot.route.queue[step.id]?.maximumTicks ?? 0), 0),
          queueTimeMaximumTicks: step.queueTime?.maximumTicks ?? null,
          queueTimeViolations: lots.reduce((sum, lot) => sum + (lot.route.queue[step.id]?.violations ?? 0), 0),
        }];
      })),
    }];
  }));
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
  const outputAmounts = (values: Record<string, number>): number => Object.values(values).reduce((sum, count) => sum + count, 0);
  const outputLosses = (nominal: Record<string, number>, actual: Record<string, number>): Record<string, number> => Object.fromEntries(
    [...new Set([...Object.keys(nominal), ...Object.keys(actual)])].sort().map((resource) => [resource, Math.max(0, (nominal[resource] ?? 0) - (actual[resource] ?? 0))]),
  );
  const lotOutputProcesses = Object.fromEntries(Object.entries(stats.lotOutputProfiles).sort(([left], [right]) => left.localeCompare(right)).map(([process, measured]) => {
    const nominalUnits = outputAmounts(measured.nominalOutputs);
    const actualUnits = outputAmounts(measured.actualOutputs);
    const lostOutputs = outputLosses(measured.nominalOutputs, measured.actualOutputs);
    return [process, {
      jobs: measured.jobs, nominalUnits, actualUnits, lostUnits: Math.max(0, nominalUnits - actualUnits),
      outputRatio: nominalUnits ? actualUnits / nominalUnits : 1,
      profiles: { ...measured.profiles }, nominalOutputs: { ...measured.nominalOutputs },
      actualOutputs: { ...measured.actualOutputs }, lostOutputs,
    }];
  }));
  const nominalOutputs = Object.values(lotOutputProcesses).reduce<Record<string, number>>((totals, process) => {
    for (const [resource, count] of Object.entries(process.nominalOutputs)) totals[resource] = (totals[resource] ?? 0) + count;
    return totals;
  }, {});
  const actualOutputs = Object.values(lotOutputProcesses).reduce<Record<string, number>>((totals, process) => {
    for (const [resource, count] of Object.entries(process.actualOutputs)) totals[resource] = (totals[resource] ?? 0) + count;
    return totals;
  }, {});
  const lostOutputs = outputLosses(nominalOutputs, actualOutputs);
  const nominalUnits = outputAmounts(nominalOutputs); const actualUnits = outputAmounts(actualOutputs);
  const lotOutputFlow: FactoryMetrics["lotOutputFlow"] = {
    jobs: Object.values(lotOutputProcesses).reduce((sum, process) => sum + process.jobs, 0),
    nominalUnits, actualUnits, lostUnits: Math.max(0, nominalUnits - actualUnits), outputRatio: nominalUnits ? actualUnits / nominalUnits : 1,
    nominalOutputs, actualOutputs, lostOutputs, processes: lotOutputProcesses,
  };
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
  for (const contract of contractMetrics) if (contract.minimumFulfillment !== undefined && contract.fulfillment + 1e-12 < contract.minimumFulfillment) violations.push(
    `delivery contract ${contract.id} fulfillment ${(contract.fulfillment * 100).toFixed(1)}% is below ${(contract.minimumFulfillment * 100).toFixed(1)}%`,
  );
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
  const toolingDevices = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.productionTooling)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => {
      const tooling = structuredClone(runtime.productionTooling!);
      if (tooling.wait) tooling.inputWaitTicks += state.tick - tooling.wait.sinceTick;
      return [id, tooling];
    }));
  const toolingProviders = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.toolingProvider)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => [id, structuredClone(runtime.toolingProvider!)]));
  for (const [deviceId, runtime] of Object.entries(state.devices)) {
    const allocation = runtime.activeJob?.tooling;
    if (!allocation) continue;
    const client = toolingDevices[deviceId];
    const provider = toolingProviders[allocation.provider];
    if (!client || !provider) continue;
    const occupiedTicks = Math.max(0, state.tick - runtime.activeJob!.startedAt);
    client.occupiedTicks += occupiedTicks;
    provider.occupiedTicks += occupiedTicks;
    for (const amount of allocation.amounts) {
      const unitTicks = occupiedTicks * amount.count;
      client.unitTicks += unitTicks;
      provider.unitTicks += unitTicks;
      client.resources[amount.resource]!.unitTicks += unitTicks;
      provider.resources[amount.resource]!.unitTicks += unitTicks;
    }
  }
  for (const [deviceId, client] of Object.entries(toolingDevices)) {
    const hold = client.hold;
    if (!hold) continue;
    const provider = toolingProviders[hold.provider];
    if (!provider) continue;
    const occupiedTicks = Math.max(0, state.tick - hold.acquiredAtTick);
    client.occupiedTicks += occupiedTicks;
    provider.occupiedTicks += occupiedTicks;
    for (const amount of hold.amounts) {
      const unitTicks = occupiedTicks * amount.count;
      client.unitTicks += unitTicks;
      provider.unitTicks += unitTicks;
      client.resources[amount.resource]!.unitTicks += unitTicks;
      provider.resources[amount.resource]!.unitTicks += unitTicks;
    }
  }
  const toolingResources = Object.values(toolingDevices).reduce<FactoryMetrics["productionTooling"]["resources"]>((totals, tooling) => {
    for (const [resource, measured] of Object.entries(tooling.resources)) {
      const aggregate = totals[resource] ??= { allocations: 0, unitsAllocated: 0, unitTicks: 0 };
      aggregate.allocations += measured.allocations;
      aggregate.unitsAllocated += measured.unitsAllocated;
      aggregate.unitTicks += measured.unitTicks;
    }
    return totals;
  }, {});
  const productionTooling: FactoryMetrics["productionTooling"] = {
    totalAllocations: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.allocations, 0),
    totalCompleted: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.completed, 0),
    totalCancelled: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.cancelled, 0),
    totalOccupiedTicks: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.occupiedTicks, 0),
    totalUnitTicks: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.unitTicks, 0),
    totalInputWaitTicks: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.inputWaitTicks, 0),
    totalInputBlocks: Object.values(toolingDevices).reduce((sum, tooling) => sum + tooling.inputBlocks, 0),
    resources: toolingResources, devices: toolingDevices, providers: toolingProviders,
  };
  const utilityDevices = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.productionUtilities)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => {
      const utilities = structuredClone(runtime.productionUtilities!);
      if (utilities.wait) utilities.inputWaitTicks += state.tick - utilities.wait.sinceTick;
      return [id, utilities];
    }));
  const utilityProviders = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.utilityProvider)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => [id, structuredClone(runtime.utilityProvider!)]));
  for (const [deviceId, runtime] of Object.entries(state.devices)) {
    if (!runtime.activeJob?.utilities?.length) continue;
    const client = utilityDevices[deviceId];
    if (!client) continue;
    const occupiedTicks = Math.max(0, state.tick - runtime.activeJob.startedAt);
    client.occupiedTicks += occupiedTicks;
    for (const allocation of runtime.activeJob.utilities) {
      const provider = utilityProviders[allocation.provider];
      if (!provider) continue;
      provider.occupiedTicks += occupiedTicks;
      const unitTicks = occupiedTicks * allocation.units;
      client.unitTicks += unitTicks;
      provider.unitTicks += unitTicks;
      client.utilities[allocation.utility]!.unitTicks += unitTicks;
      provider.utilities[allocation.utility]!.unitTicks += unitTicks;
    }
  }
  const utilityTotals = Object.values(utilityDevices).reduce<FactoryMetrics["productionUtilities"]["utilities"]>((totals, device) => {
    for (const [utility, measured] of Object.entries(device.utilities)) {
      const aggregate = totals[utility] ??= { allocations: 0, unitsAllocated: 0, unitTicks: 0 };
      aggregate.allocations += measured.allocations;
      aggregate.unitsAllocated += measured.unitsAllocated;
      aggregate.unitTicks += measured.unitTicks;
    }
    return totals;
  }, {});
  const productionUtilities: FactoryMetrics["productionUtilities"] = {
    totalAllocations: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.allocations, 0),
    totalCompleted: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.completed, 0),
    totalCancelled: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.cancelled, 0),
    totalProviderInterruptions: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.providerInterruptions, 0),
    totalOccupiedTicks: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.occupiedTicks, 0),
    totalUnitTicks: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.unitTicks, 0),
    totalInputWaitTicks: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.inputWaitTicks, 0),
    totalInputBlocks: Object.values(utilityDevices).reduce((sum, utility) => sum + utility.inputBlocks, 0),
    utilities: utilityTotals, devices: utilityDevices, providers: utilityProviders,
  };
  const maintenanceDevices = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.maintenance)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => {
      const maintenance = {
        ...runtime.maintenance!,
        serviceConsumables: { ...runtime.maintenance!.serviceConsumables },
        qualificationConsumables: { ...runtime.maintenance!.qualificationConsumables },
        ...(runtime.maintenance!.qualificationPending ? { qualificationPending: { ...runtime.maintenance!.qualificationPending } } : {}),
        ...(runtime.maintenance!.wait ? { wait: { ...runtime.maintenance!.wait } } : {}),
      };
      if (maintenance.wait) {
        const key = maintenance.wait.reason === "consumable" ? "inputWaitTicks" : "crewWaitTicks";
        maintenance[key] += state.tick - maintenance.wait.sinceTick;
      }
      return [id, maintenance];
    }));
  const maintenanceProviders = Object.fromEntries(Object.entries(state.devices).filter(([, runtime]) => runtime.maintenanceProvider)
    .sort(([left], [right]) => left.localeCompare(right)).map(([id, runtime]) => [id, {
      ...runtime.maintenanceProvider!, consumables: { ...runtime.maintenanceProvider!.consumables },
    }]));
  for (const runtime of Object.values(state.devices)) {
    const job = runtime.activeJob?.maintenance;
    if (!job) continue;
    const provider = maintenanceProviders[job.provider];
    if (!provider) continue;
    const activeCrewTicks = Math.max(0, state.tick - runtime.activeJob!.startedAt) * job.crews;
    provider.serviceCrewTicks += activeCrewTicks;
    if (job.phase === "qualification") provider.qualificationCrewTicks += activeCrewTicks;
  }
  const serviceConsumables = Object.values(maintenanceDevices).reduce<Record<string, number>>((totals, maintenance) => {
    for (const [resource, count] of Object.entries(maintenance.serviceConsumables)) totals[resource] = (totals[resource] ?? 0) + count;
    return totals;
  }, {});
  const qualificationConsumables = Object.values(maintenanceDevices).reduce<Record<string, number>>((totals, maintenance) => {
    for (const [resource, count] of Object.entries(maintenance.qualificationConsumables)) totals[resource] = (totals[resource] ?? 0) + count;
    return totals;
  }, {});
  const equipmentMaintenance: FactoryMetrics["equipmentMaintenance"] = {
    totalCompleted: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.completed, 0),
    totalMandatory: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.mandatory, 0),
    totalOpportunistic: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.opportunistic, 0),
    totalCancelled: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.cancelled, 0),
    totalMaintenanceTicks: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.maintenanceTicks, 0),
    totalQualificationCompleted: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.qualificationCompleted, 0),
    totalQualificationCancelled: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.qualificationCancelled, 0),
    totalQualificationTicks: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.qualificationTicks, 0),
    totalDriftedJobs: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.driftedJobs, 0),
    totalDriftedLots: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.driftedLots, 0),
    totalDriftDefects: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.driftDefects, 0),
    totalInputWaitTicks: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.inputWaitTicks, 0),
    totalCrewWaitTicks: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.crewWaitTicks, 0),
    totalInputBlocks: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.inputBlocks, 0),
    totalCrewBlocks: Object.values(maintenanceDevices).reduce((sum, maintenance) => sum + maintenance.crewBlocks, 0),
    totalServiceCrewTicks: Object.values(maintenanceProviders).reduce((sum, provider) => sum + provider.serviceCrewTicks, 0),
    totalQualificationCrewTicks: Object.values(maintenanceProviders).reduce((sum, provider) => sum + provider.qualificationCrewTicks, 0),
    serviceConsumables,
    qualificationConsumables,
    devices: maintenanceDevices,
    providers: maintenanceProviders,
  };
  const onTimeDelivery = targetLots.length ? lotFlow.onTimeCompleted / targetLots.length : deliveryPortfolio.fulfillment;
  const weights = project.objective.weights;
  const scoreBreakdown: ScoreBreakdown = {
    throughput: throughputPerMinute * weights.throughput,
    deliveryValue: deliveryPortfolio.netValuePerMinute * (weights.deliveryValue ?? 0),
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
    produced: { ...state.produced }, consumed: { ...state.consumed }, extracted, resourceNodes, throughputPerMinute, deliveryPortfolio,
    completedOrders: state.completedOrders, highSpeedMissions: state.highSpeedMissions,
    carrierMissions: state.carrierMissions, carrierReturns: state.carrierReturns, stationFleets,
    onTimeDelivery, lotFlow, routeFlow, releaseFlow, qualityFlow, lotOutputFlow, batchFlow, energyConsumedMilliJoules: state.energy.consumedMilliJoules, energyStorage, stationEnergy, fuelConsumed: { ...state.energy.fuelConsumed },
    powerGrids: Object.fromEntries(Object.entries(stats.powerGrids).map(([grid, power]) => [grid, {
      generatedMilliJoules: power.generatedMilliJoules, demandMilliJoules: power.demandMilliJoules,
      servedMilliJoules: power.servedMilliJoules, unservedMilliJoules: power.unservedMilliJoules, curtailedMilliJoules: power.curtailedMilliJoules,
      peakGenerationMilliWatts: power.peakGenerationMilliWatts, peakDemandMilliWatts: power.peakDemandMilliWatts,
      peakDeficitMilliWatts: power.peakDeficitMilliWatts, peakSurplusMilliWatts: power.peakSurplusMilliWatts,
      averageSatisfactionPpm: power.satisfactionPpmArea / duration,
      minimumSatisfactionPpm: power.minimumSatisfactionPpm,
      requiredStorageCapacityMilliJoules: power.requiredStorageCapacityMilliJoules,
    }])),
    materialTreatment: structuredClone(state.materialTreatment), productionTooling, productionUtilities, equipmentSetups, equipmentMaintenance,
    totalBuildCost, occupiedArea, machineUtilization, idleTime, waitingInputTime, blockedOutputTime, unpoweredTime, failedTime,
    averageWip, averageBeltItems, averageBlockedBeltItems, peakBeltItems: stats.peakBeltItems, beltCellUtilization,
    transportStageUtilization, transportFlows, transportEnergyConsumedMilliJoules: stats.transportEnergyConsumedMilliJoules,
    transportCongestion, bottleneckEntity, infeasibleReason: violations.length ? violations.join("; ") : null,
    scoreBreakdown, finalScore,
  };
}
