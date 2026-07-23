import type { CompiledFactoryProject, FactoryMetrics } from "./types";

export type FabLossBucketId =
  | "delivery-portfolio"
  | "release-admission"
  | "queue-congestion"
  | "input-starvation"
  | "batch-formation"
  | "setup-campaign"
  | "maintenance-qualification"
  | "tooling-contention"
  | "facility-contention"
  | "equipment-failure"
  | "power-interruption"
  | "transport-blocking"
  | "q-time"
  | "yield-quality";

export interface FabLossSubject {
  kind: "project" | "device" | "connection" | "route";
  id: string;
}

export interface FabLossBucket {
  id: FabLossBucketId;
  label: string;
  score: number;
  summary: string;
  subjects: FabLossSubject[];
  evidence: Record<string, number>;
}

export interface FabLossProfile {
  version: 3;
  family: string;
  outcome: {
    scheduled: number;
    released: number;
    completed: number;
    scrapped: number;
    inProgress: number;
    pendingRelease: number;
    firstPassYield: number;
    contractFulfillment: number;
    deliveryShortfall: number;
    deliveryOverflow: number;
    portfolioNetValue: number;
  };
  primary: FabLossBucket | null;
  chain: FabLossBucketId[];
  buckets: FabLossBucket[];
  caveat: string;
}

export interface FabLossAttribution extends FabLossProfile {
  run: { id: string; resultHash: string };
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
const topKey = (values: Record<string, number>): string | null => Object.entries(values)
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
const productionCapabilities = new Set(["extract", "process", "treat"]);
const isProductiveDevice = (project: Pick<CompiledFactoryProject, "devices">, id: string) =>
  project.devices[id]?.assetDef.capabilities.some((capability) => productionCapabilities.has(capability)) ?? false;

export function analyzeFabLossProfile(
  metrics: FactoryMetrics,
  durationTicks: number,
  project: Pick<CompiledFactoryProject, "devices">,
): FabLossProfile | null {
  if (!metrics.lotFlow.family) return null;
  const scheduled = Math.max(1, metrics.lotFlow.scheduled);
  const cycleTicks = Math.max(1, metrics.lotFlow.meanCycleTimeTicks);
  const buckets: FabLossBucket[] = [];
  const add = (bucket: FabLossBucket) => { if (bucket.score > 1e-9) buckets.push(bucket); };

  const deliveryContracts = Object.values(metrics.deliveryPortfolio.contracts);
  const deliveryShortfall = deliveryContracts.reduce((total, contract) => total + contract.shortfall, 0);
  const deliveryOverflow = deliveryContracts.reduce((total, contract) => total + contract.overflow, 0);
  const underfilledContracts = deliveryContracts.filter((contract) => contract.fulfillment < 1 - 1e-12).length;
  const meanContractShortfallShare = deliveryContracts.length
    ? deliveryContracts.reduce((total, contract) => total + Math.max(0, 1 - Math.min(1, contract.fulfillment)), 0) / deliveryContracts.length
    : 0;
  add({
    id: "delivery-portfolio", label: "Delivery portfolio shortfall", score: meanContractShortfallShare,
    summary: `${underfilledContracts}/${deliveryContracts.length} delivery contracts are below demand with ${deliveryShortfall} units short, ${deliveryOverflow} above-demand units, and ${metrics.deliveryPortfolio.netValue.toFixed(3)} net value.`,
    subjects: [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: {
      contracts: deliveryContracts.length,
      underfilledContracts,
      demanded: metrics.deliveryPortfolio.demanded,
      delivered: metrics.deliveryPortfolio.delivered,
      shortfall: deliveryShortfall,
      overflow: deliveryOverflow,
      grossValue: metrics.deliveryPortfolio.grossValue,
      shortfallPenalty: metrics.deliveryPortfolio.shortfallPenalty,
      netValue: metrics.deliveryPortfolio.netValue,
    },
  });

  const releaseBlockedTicks = metrics.releaseFlow.capacityBlockedTicks + metrics.releaseFlow.controlBlockedTicks;
  add({
    id: "release-admission", label: "Release and admission", score: ratio(metrics.releaseFlow.pending, scheduled) + ratio(releaseBlockedTicks, durationTicks * scheduled),
    summary: `${metrics.releaseFlow.pending} scheduled lots remained pending; ${metrics.releaseFlow.capacityBlockedLots} capacity-blocked and ${metrics.releaseFlow.controlBlockedLots} control-blocked releases accumulated ${(releaseBlockedTicks / 1000).toFixed(1)} lot-s.`,
    subjects: [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: { pendingLots: metrics.releaseFlow.pending, capacityBlockedLots: metrics.releaseFlow.capacityBlockedLots, controlBlockedLots: metrics.releaseFlow.controlBlockedLots, blockedTicks: releaseBlockedTicks },
  });

  const productiveWaitingInput = Object.fromEntries(Object.entries(metrics.waitingInputTime).filter(([id]) =>
    isProductiveDevice(project, id)));
  const waitingInputTicks = sum(productiveWaitingInput);
  const queueShare = ratio(metrics.lotFlow.meanQueueTimeTicks, cycleTicks);
  const bottleneckDevice = metrics.bottleneckEntity && isProductiveDevice(project, metrics.bottleneckEntity)
    ? metrics.bottleneckEntity
    : null;
  const queueRoute = topKey(Object.fromEntries(Object.entries(metrics.routeFlow).map(([id, route]) =>
    [id, Object.values(route.steps).reduce((total, step) => total + step.meanQueueTicks * step.visits, 0)])));
  add({
    id: "queue-congestion", label: "Tracked-lot queue congestion", score: queueShare,
    summary: `Tracked lots averaged ${(metrics.lotFlow.meanQueueTimeTicks / 1000).toFixed(1)} s queued in a ${(cycleTicks / 1000).toFixed(1)} s cycle; ${bottleneckDevice ?? queueRoute ?? metrics.lotFlow.family} is the measured bottleneck context.`,
    subjects: bottleneckDevice
      ? [{ kind: "device", id: bottleneckDevice }]
      : queueRoute ? [{ kind: "route", id: queueRoute }] : [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: {
      meanQueueTicks: metrics.lotFlow.meanQueueTimeTicks,
      meanCycleTicks: cycleTicks,
      meanProcessTicks: metrics.lotFlow.meanProcessTimeTicks,
      meanTransportTicks: metrics.lotFlow.meanTransportTimeTicks,
      bottleneckUtilization: bottleneckDevice ? metrics.machineUtilization[bottleneckDevice] ?? 0 : 0,
    },
  });

  const activeProductiveDevices = Object.keys(productiveWaitingInput)
    .filter((id) => (metrics.machineUtilization[id] ?? 0) > 1e-12);
  const utilizationWeight = activeProductiveDevices.reduce((total, id) => total + (metrics.machineUtilization[id] ?? 0), 0);
  const weightedWaitingInput = Object.fromEntries(activeProductiveDevices.map((id) =>
    [id, productiveWaitingInput[id]! * (metrics.machineUtilization[id] ?? 0)]));
  const weightedWaitingInputTicks = sum(weightedWaitingInput);
  const waitingDevice = topKey(weightedWaitingInput);
  add({
    id: "input-starvation", label: "Productive-equipment input starvation",
    score: ratio(weightedWaitingInputTicks, durationTicks * utilizationWeight),
    summary: `${activeProductiveDevices.length} active productive devices accumulated ${(waitingInputTicks / 1000).toFixed(1)} raw device-s without input; utilization weighting identifies ${waitingDevice ?? metrics.lotFlow.family} without promoting normally sparse exception equipment.`,
    subjects: waitingDevice ? [{ kind: "device", id: waitingDevice }] : [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: {
      activeProductiveDevices: activeProductiveDevices.length,
      waitingInputTicks,
      weightedWaitingInputTicks,
      utilizationWeight,
      subjectWaitingInputTicks: waitingDevice ? productiveWaitingInput[waitingDevice] ?? 0 : 0,
      subjectUtilization: waitingDevice ? metrics.machineUtilization[waitingDevice] ?? 0 : 0,
    },
  });

  add({
    id: "batch-formation", label: "Batch formation", score: ratio(metrics.batchFlow.formationHoldTicks, durationTicks * Math.max(1, Object.keys(metrics.batchFlow.formationDevices).length)) + ratio(metrics.batchFlow.meanQueueWaitTicksPerLot, cycleTicks),
    summary: `${metrics.batchFlow.formationHolds} formation holds consumed ${(metrics.batchFlow.formationHoldTicks / 1000).toFixed(1)} s; average batch wait was ${(metrics.batchFlow.meanQueueWaitTicksPerLot / 1000).toFixed(1)} s/lot with ${metrics.batchFlow.timeoutReleases} timeout releases.`,
    subjects: Object.keys(metrics.batchFlow.formationDevices).sort().slice(0, 3).map((id) => ({ kind: "device" as const, id })),
    evidence: { holds: metrics.batchFlow.formationHolds, holdTicks: metrics.batchFlow.formationHoldTicks, meanWaitTicks: metrics.batchFlow.meanQueueWaitTicksPerLot, timeoutReleases: metrics.batchFlow.timeoutReleases },
  });

  const setupDevice = topKey(Object.fromEntries(Object.entries(metrics.equipmentSetups.devices).map(([id, value]) => [id, value.setupTicks + value.campaignHoldTicks])));
  add({
    id: "setup-campaign", label: "Setup and campaign control", score: ratio(metrics.equipmentSetups.totalSetupTicks + metrics.equipmentSetups.totalCampaignHoldTicks, durationTicks * Math.max(1, Object.keys(metrics.equipmentSetups.devices).length)),
    summary: `${metrics.equipmentSetups.totalChangeovers} changeovers and ${metrics.equipmentSetups.totalCampaignHolds} campaign holds consumed ${((metrics.equipmentSetups.totalSetupTicks + metrics.equipmentSetups.totalCampaignHoldTicks) / 1000).toFixed(1)} equipment-s.`,
    subjects: setupDevice ? [{ kind: "device", id: setupDevice }] : [],
    evidence: { changeovers: metrics.equipmentSetups.totalChangeovers, setupTicks: metrics.equipmentSetups.totalSetupTicks, campaignHolds: metrics.equipmentSetups.totalCampaignHolds, campaignHoldTicks: metrics.equipmentSetups.totalCampaignHoldTicks },
  });

  const maintenanceTicks = metrics.equipmentMaintenance.totalMaintenanceTicks + metrics.equipmentMaintenance.totalQualificationTicks + metrics.equipmentMaintenance.totalInputWaitTicks + metrics.equipmentMaintenance.totalCrewWaitTicks;
  const maintenanceDevice = topKey(Object.fromEntries(Object.entries(metrics.equipmentMaintenance.devices).map(([id, value]) => [id, value.maintenanceTicks + value.qualificationTicks + value.inputWaitTicks + value.crewWaitTicks])));
  add({
    id: "maintenance-qualification", label: "Maintenance and qualification", score: ratio(maintenanceTicks, durationTicks * Math.max(1, Object.keys(metrics.equipmentMaintenance.devices).length)),
    summary: `${metrics.equipmentMaintenance.totalCompleted} maintenance and ${metrics.equipmentMaintenance.totalQualificationCompleted} qualification completions consumed ${(maintenanceTicks / 1000).toFixed(1)} service/wait device-s; ${metrics.equipmentMaintenance.totalCancelled + metrics.equipmentMaintenance.totalQualificationCancelled} phases were cancelled.`,
    subjects: maintenanceDevice ? [{ kind: "device", id: maintenanceDevice }] : [],
    evidence: { maintenanceTicks: metrics.equipmentMaintenance.totalMaintenanceTicks, qualificationTicks: metrics.equipmentMaintenance.totalQualificationTicks, inputWaitTicks: metrics.equipmentMaintenance.totalInputWaitTicks, crewWaitTicks: metrics.equipmentMaintenance.totalCrewWaitTicks, cancelled: metrics.equipmentMaintenance.totalCancelled + metrics.equipmentMaintenance.totalQualificationCancelled },
  });

  const toolingDevice = topKey(Object.fromEntries(Object.entries(metrics.productionTooling.devices).map(([id, value]) => [id, value.inputWaitTicks])));
  add({
    id: "tooling-contention", label: "Reusable tooling contention", score: ratio(metrics.productionTooling.totalInputWaitTicks, durationTicks * Math.max(1, Object.keys(metrics.productionTooling.devices).length)),
    summary: `${metrics.productionTooling.totalInputBlocks} tooling input blocks accumulated ${(metrics.productionTooling.totalInputWaitTicks / 1000).toFixed(1)} device-s of wait; ${metrics.productionTooling.totalCancelled} allocations were cancelled.`,
    subjects: toolingDevice ? [{ kind: "device", id: toolingDevice }] : [],
    evidence: { blocks: metrics.productionTooling.totalInputBlocks, waitTicks: metrics.productionTooling.totalInputWaitTicks, cancelled: metrics.productionTooling.totalCancelled },
  });

  const utilityDevice = topKey(Object.fromEntries(Object.entries(metrics.productionUtilities.devices).map(([id, value]) => [id, value.inputWaitTicks])));
  add({
    id: "facility-contention", label: "Fab facility contention", score: ratio(metrics.productionUtilities.totalInputWaitTicks, durationTicks * Math.max(1, Object.keys(metrics.productionUtilities.devices).length)) + ratio(metrics.productionUtilities.totalProviderInterruptions, scheduled),
    summary: `${metrics.productionUtilities.totalInputBlocks} facility input blocks accumulated ${(metrics.productionUtilities.totalInputWaitTicks / 1000).toFixed(1)} device-s of wait; providers interrupted ${metrics.productionUtilities.totalProviderInterruptions} active jobs.`,
    subjects: utilityDevice ? [{ kind: "device", id: utilityDevice }] : [],
    evidence: { blocks: metrics.productionUtilities.totalInputBlocks, waitTicks: metrics.productionUtilities.totalInputWaitTicks, interruptions: metrics.productionUtilities.totalProviderInterruptions },
  });

  const failedTicks = sum(metrics.failedTime);
  const failedDevice = topKey(metrics.failedTime);
  add({ id: "equipment-failure", label: "Equipment failure", score: ratio(failedTicks, durationTicks * Math.max(1, Object.keys(metrics.failedTime).length)), summary: `Equipment accumulated ${(failedTicks / 1000).toFixed(1)} failed device-s.`, subjects: failedDevice ? [{ kind: "device", id: failedDevice }] : [], evidence: { failedTicks } });

  const unpoweredTicks = sum(metrics.unpoweredTime);
  const unpoweredDevice = topKey(metrics.unpoweredTime);
  add({ id: "power-interruption", label: "Power interruption", score: ratio(unpoweredTicks, durationTicks * Math.max(1, Object.keys(metrics.unpoweredTime).length)), summary: `Equipment accumulated ${(unpoweredTicks / 1000).toFixed(1)} unpowered device-s across the selected operating window.`, subjects: unpoweredDevice ? [{ kind: "device", id: unpoweredDevice }] : [], evidence: { unpoweredTicks } });

  const blockedTransportTicks = Object.values(metrics.transportFlows).reduce((total, flow) => total + flow.blockedItemTicks, 0);
  const blockedConnection = topKey(Object.fromEntries(Object.entries(metrics.transportFlows).map(([id, flow]) => [id, flow.blockedItemTicks])));
  add({
    id: "transport-blocking", label: "Physical transport", score: ratio(metrics.lotFlow.meanTransportTimeTicks, cycleTicks) + ratio(blockedTransportTicks, durationTicks * Math.max(1, Object.keys(metrics.transportFlows).length)),
    summary: `Tracked lots averaged ${(metrics.lotFlow.meanTransportTimeTicks / 1000).toFixed(1)} s in transport; physical lanes accumulated ${(blockedTransportTicks / 1000).toFixed(1)} blocked item-s.`,
    subjects: blockedConnection ? [{ kind: "connection", id: blockedConnection }] : [],
    evidence: { meanTransportTicks: metrics.lotFlow.meanTransportTimeTicks, blockedItemTicks: blockedTransportTicks },
  });

  const qTimeViolations = Object.values(metrics.routeFlow).reduce((total, route) => total + route.queueTimeViolations, 0);
  const qTimeLots = Object.values(metrics.routeFlow).reduce((total, route) => total + route.violatedLots, 0);
  const qTimeRoute = topKey(Object.fromEntries(Object.entries(metrics.routeFlow).map(([id, route]) => [id, route.queueTimeViolations])));
  add({ id: "q-time", label: "Route Q-time", score: ratio(qTimeLots, scheduled) + ratio(qTimeViolations, scheduled), summary: `${qTimeLots} lots crossed a Route Q-time limit in ${qTimeViolations} step visits.`, subjects: qTimeRoute ? [{ kind: "route", id: qTimeRoute }] : [], evidence: { violatedLots: qTimeLots, violations: qTimeViolations } });

  const inspectedLots = metrics.qualityFlow.inspectedLots;
  const firstPassYield = inspectedLots ? ratio(metrics.qualityFlow.firstPassCompleted, inspectedLots) : 1;
  const affectedLots = metrics.qualityFlow.reworkedLots + metrics.qualityFlow.scrapDispositions + metrics.qualityFlow.escapedDefects;
  const driftDefects = Object.fromEntries(Object.entries(metrics.equipmentMaintenance.devices)
    .filter(([, maintenance]) => maintenance.driftDefects > 0)
    .map(([id, maintenance]) => [id, maintenance.driftDefects]));
  const driftDevice = topKey(driftDefects);
  const driftedLots = Object.values(metrics.equipmentMaintenance.devices)
    .reduce((total, maintenance) => total + maintenance.driftedLots, 0);
  const driftDefectCount = sum(driftDefects);
  const driftContext = driftDevice
    ? ` Equipment drift introduced ${driftDefectCount} defect instances across ${driftedLots} lot jobs; ${driftDevice} contributed ${driftDefects[driftDevice]}.`
    : "";
  add({
    id: "yield-quality", label: "Verified yield and quality loss", score: ratio(affectedLots, inspectedLots) + ratio(metrics.lotOutputFlow.lostUnits, metrics.lotOutputFlow.nominalUnits),
    summary: `${metrics.qualityFlow.firstPassCompleted}/${inspectedLots} inspected lots passed first inspection; ${metrics.qualityFlow.reworkedLots} reworked, ${metrics.qualityFlow.scrapDispositions} scrapped, ${metrics.qualityFlow.escapedDefects} escaped, and ${metrics.lotOutputFlow.lostUnits} lot-derived output units were lost.${driftContext}`,
    subjects: [
      ...(driftDevice ? [{ kind: "device" as const, id: driftDevice }] : []),
      { kind: "project", id: metrics.lotFlow.family },
    ],
    evidence: {
      inspectedLots,
      firstPassCompleted: metrics.qualityFlow.firstPassCompleted,
      firstPassYield,
      reworkedLots: metrics.qualityFlow.reworkedLots,
      scrapDispositions: metrics.qualityFlow.scrapDispositions,
      escapedDefects: metrics.qualityFlow.escapedDefects,
      lostOutputUnits: metrics.lotOutputFlow.lostUnits,
      equipmentDriftedLots: driftedLots,
      equipmentDriftDefects: driftDefectCount,
      subjectDriftedLots: driftDevice ? metrics.equipmentMaintenance.devices[driftDevice]!.driftedLots : 0,
      subjectDriftDefects: driftDevice ? driftDefects[driftDevice]! : 0,
    },
  });

  buckets.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return {
    version: 3,
    family: metrics.lotFlow.family,
    outcome: {
      scheduled: metrics.lotFlow.scheduled, released: metrics.lotFlow.released, completed: metrics.lotFlow.completed,
      scrapped: metrics.lotFlow.scrapped, inProgress: metrics.lotFlow.inProgress, pendingRelease: metrics.lotFlow.pendingRelease,
      firstPassYield, contractFulfillment: metrics.deliveryPortfolio.fulfillment,
      deliveryShortfall, deliveryOverflow, portfolioNetValue: metrics.deliveryPortfolio.netValue,
    },
    primary: buckets[0] ?? null,
    chain: buckets.slice(0, 5).map((bucket) => bucket.id),
    buckets,
    caveat: "Bucket scores are deterministic ranking signals derived from overlapping measured delays and losses; they are not additive units of foregone output or calibrated causal estimates.",
  };
}

export function analyzeFabLosses(
  metrics: FactoryMetrics,
  durationTicks: number,
  run: { id: string; resultHash: string },
  project: Pick<CompiledFactoryProject, "devices">,
): FabLossAttribution | null {
  const profile = analyzeFabLossProfile(metrics, durationTicks, project);
  return profile ? { ...profile, run } : null;
}
