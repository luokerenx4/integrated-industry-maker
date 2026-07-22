import type { FactoryMetrics } from "./types";

export type FabLossBucketId =
  | "release-admission"
  | "queue-starvation"
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

export interface FabLossAttribution {
  version: 1;
  run: { id: string; resultHash: string };
  family: string;
  outcome: {
    scheduled: number;
    released: number;
    completed: number;
    scrapped: number;
    inProgress: number;
    pendingRelease: number;
    goodYield: number;
    contractFulfillment: number;
  };
  primary: FabLossBucket | null;
  chain: FabLossBucketId[];
  buckets: FabLossBucket[];
  caveat: string;
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
const topKey = (values: Record<string, number>): string | null => Object.entries(values)
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;

export function analyzeFabLosses(
  metrics: FactoryMetrics,
  durationTicks: number,
  run: { id: string; resultHash: string },
): FabLossAttribution | null {
  if (!metrics.lotFlow.family) return null;
  const scheduled = Math.max(1, metrics.lotFlow.scheduled);
  const cycleTicks = Math.max(1, metrics.lotFlow.meanCycleTimeTicks);
  const buckets: FabLossBucket[] = [];
  const add = (bucket: FabLossBucket) => { if (bucket.score > 1e-9) buckets.push(bucket); };

  const releaseBlockedTicks = metrics.releaseFlow.capacityBlockedTicks + metrics.releaseFlow.controlBlockedTicks;
  add({
    id: "release-admission", label: "Release and admission", score: ratio(metrics.releaseFlow.pending, scheduled) + ratio(releaseBlockedTicks, durationTicks * scheduled),
    summary: `${metrics.releaseFlow.pending} scheduled lots remained pending; ${metrics.releaseFlow.capacityBlockedLots} capacity-blocked and ${metrics.releaseFlow.controlBlockedLots} control-blocked releases accumulated ${(releaseBlockedTicks / 1000).toFixed(1)} lot-s.`,
    subjects: [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: { pendingLots: metrics.releaseFlow.pending, capacityBlockedLots: metrics.releaseFlow.capacityBlockedLots, controlBlockedLots: metrics.releaseFlow.controlBlockedLots, blockedTicks: releaseBlockedTicks },
  });

  const waitingInputTicks = sum(metrics.waitingInputTime);
  const waitingDevice = topKey(metrics.waitingInputTime);
  add({
    id: "queue-starvation", label: "Queue and input starvation", score: ratio(metrics.lotFlow.meanQueueTimeTicks, cycleTicks) + ratio(waitingInputTicks, durationTicks * Math.max(1, Object.keys(metrics.waitingInputTime).length)),
    summary: `Tracked lots averaged ${(metrics.lotFlow.meanQueueTimeTicks / 1000).toFixed(1)} s queued; equipment accumulated ${(waitingInputTicks / 1000).toFixed(1)} device-s waiting for input.`,
    subjects: waitingDevice ? [{ kind: "device", id: waitingDevice }] : [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: { meanQueueTicks: metrics.lotFlow.meanQueueTimeTicks, waitingInputTicks },
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

  add({
    id: "yield-quality", label: "Yield and quality loss", score: (1 - metrics.qualityFlow.goodYield) + ratio(metrics.lotFlow.scrapped, scheduled) + ratio(metrics.lotOutputFlow.lostUnits, metrics.lotOutputFlow.nominalUnits),
    summary: `${(metrics.qualityFlow.goodYield * 100).toFixed(1)}% good yield, ${metrics.lotFlow.scrapped} scrapped lots, ${metrics.qualityFlow.totalReworkCycles} rework cycles, ${metrics.qualityFlow.escapedDefects} escaped defects, and ${metrics.lotOutputFlow.lostUnits} lost lot-derived output units.`,
    subjects: [{ kind: "project", id: metrics.lotFlow.family }],
    evidence: { goodYield: metrics.qualityFlow.goodYield, scrappedLots: metrics.lotFlow.scrapped, reworkCycles: metrics.qualityFlow.totalReworkCycles, escapedDefects: metrics.qualityFlow.escapedDefects, lostOutputUnits: metrics.lotOutputFlow.lostUnits },
  });

  buckets.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return {
    version: 1,
    run,
    family: metrics.lotFlow.family,
    outcome: {
      scheduled: metrics.lotFlow.scheduled, released: metrics.lotFlow.released, completed: metrics.lotFlow.completed,
      scrapped: metrics.lotFlow.scrapped, inProgress: metrics.lotFlow.inProgress, pendingRelease: metrics.lotFlow.pendingRelease,
      goodYield: metrics.qualityFlow.goodYield, contractFulfillment: metrics.deliveryPortfolio.fulfillment,
    },
    primary: buckets[0] ?? null,
    chain: buckets.slice(0, 5).map((bucket) => bucket.id),
    buckets,
    caveat: "Bucket scores are deterministic ranking signals derived from overlapping measured delays and losses; they are not additive units of foregone output or calibrated causal estimates.",
  };
}
