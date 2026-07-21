import type { JsonPatchOperation } from "./artifacts";
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { runUntil } from "./simulator";
import type { Blueprint, CompiledFactoryProject, FactoryMetrics } from "./types";
import { stableStringify } from "./utils";

export type BlueprintChangeKind = "device" | "connection" | "logistics-network" | "policy" | "metadata";
export type BlueprintChangeAction = "added" | "removed" | "changed";

export interface BlueprintSemanticChange {
  kind: BlueprintChangeKind;
  id: string;
  action: BlueprintChangeAction;
  fields: string[];
  before?: unknown;
  after?: unknown;
}

export interface BlueprintMetricSnapshot {
  score: number;
  throughputPerMinute: number;
  objectiveAttainment: number;
  completedLots: number;
  scheduledLots: number;
  releasedLots: number;
  pendingReleaseLots: number;
  meanActualReleaseIntervalTicks: number;
  meanReleaseDelayTicks: number;
  maximumReleaseDelayTicks: number;
  peakActiveLots: number;
  capacityBlockedLots: number;
  capacityBlockedTicks: number;
  controlBlockedLots: number;
  controlBlockedTicks: number;
  serviceLevelOpenings: number;
  scrappedLots: number;
  onTimeLots: number;
  goodYield: number;
  firstPassYield: number;
  qualityEscapes: number;
  reworkCycles: number;
  queueTimeViolations: number;
  queueTimeViolatedLots: number;
  maximumQueueTimeOverrunTicks: number;
  batchJobs: number;
  batchLots: number;
  averageLotsPerBatch: number;
  meanBatchQueueWaitTicksPerLot: number;
  meanCycleTimeTicks: number;
  p95CycleTimeTicks: number;
  meanQueueTimeTicks: number;
  meanTardinessTicks: number;
  totalChangeovers: number;
  totalSetupTicks: number;
  totalCampaignHolds: number;
  totalCampaignHoldTicks: number;
  campaignMinimumLotReleases: number;
  campaignMaximumHoldReleases: number;
  totalToolingAllocations: number;
  totalToolingCompleted: number;
  totalToolingCancelled: number;
  totalToolingOccupiedTicks: number;
  totalToolingUnitTicks: number;
  totalToolingInputWaitTicks: number;
  totalToolingInputBlocks: number;
  totalMaintenanceCompleted: number;
  totalMandatoryMaintenance: number;
  totalOpportunisticMaintenance: number;
  totalMaintenanceCancelled: number;
  totalMaintenanceTicks: number;
  totalQualificationCompleted: number;
  totalQualificationCancelled: number;
  totalQualificationTicks: number;
  totalDriftedJobs: number;
  totalDriftedLots: number;
  totalDriftDefects: number;
  totalMaintenanceInputWaitTicks: number;
  totalMaintenanceCrewWaitTicks: number;
  totalMaintenanceServiceCrewTicks: number;
  totalMaintenanceQualificationCrewTicks: number;
  energyConsumedMilliJoules: number;
  transportEnergyConsumedMilliJoules: number;
  storedMilliJoules: number;
  chargedMilliJoules: number;
  dischargedMilliJoules: number;
  unservedMilliJoules: number;
  curtailedMilliJoules: number;
  unpoweredTicks: number;
  totalBuildCost: number;
  occupiedArea: number;
  averageWip: number;
  averageBlockedBeltItems: number;
  beltCellUtilization: number;
  transportCongestion: number;
  bottleneckEntity: string | null;
  infeasibleReason: string | null;
}

export interface BlueprintMetricDelta {
  score: number;
  throughputPerMinute: number;
  objectiveAttainment: number;
  completedLots: number;
  scheduledLots: number;
  releasedLots: number;
  pendingReleaseLots: number;
  meanActualReleaseIntervalTicks: number;
  meanReleaseDelayTicks: number;
  maximumReleaseDelayTicks: number;
  peakActiveLots: number;
  capacityBlockedLots: number;
  capacityBlockedTicks: number;
  controlBlockedLots: number;
  controlBlockedTicks: number;
  serviceLevelOpenings: number;
  scrappedLots: number;
  onTimeLots: number;
  goodYield: number;
  firstPassYield: number;
  qualityEscapes: number;
  reworkCycles: number;
  queueTimeViolations: number;
  queueTimeViolatedLots: number;
  maximumQueueTimeOverrunTicks: number;
  batchJobs: number;
  batchLots: number;
  averageLotsPerBatch: number;
  meanBatchQueueWaitTicksPerLot: number;
  meanCycleTimeTicks: number;
  p95CycleTimeTicks: number;
  meanQueueTimeTicks: number;
  meanTardinessTicks: number;
  totalChangeovers: number;
  totalSetupTicks: number;
  totalCampaignHolds: number;
  totalCampaignHoldTicks: number;
  campaignMinimumLotReleases: number;
  campaignMaximumHoldReleases: number;
  totalToolingAllocations: number;
  totalToolingCompleted: number;
  totalToolingCancelled: number;
  totalToolingOccupiedTicks: number;
  totalToolingUnitTicks: number;
  totalToolingInputWaitTicks: number;
  totalToolingInputBlocks: number;
  totalMaintenanceCompleted: number;
  totalMandatoryMaintenance: number;
  totalOpportunisticMaintenance: number;
  totalMaintenanceCancelled: number;
  totalMaintenanceTicks: number;
  totalQualificationCompleted: number;
  totalQualificationCancelled: number;
  totalQualificationTicks: number;
  totalDriftedJobs: number;
  totalDriftedLots: number;
  totalDriftDefects: number;
  totalMaintenanceInputWaitTicks: number;
  totalMaintenanceCrewWaitTicks: number;
  totalMaintenanceServiceCrewTicks: number;
  totalMaintenanceQualificationCrewTicks: number;
  energyConsumedMilliJoules: number;
  transportEnergyConsumedMilliJoules: number;
  storedMilliJoules: number;
  chargedMilliJoules: number;
  dischargedMilliJoules: number;
  unservedMilliJoules: number;
  curtailedMilliJoules: number;
  unpoweredTicks: number;
  totalBuildCost: number;
  occupiedArea: number;
  averageWip: number;
  averageBlockedBeltItems: number;
  beltCellUtilization: number;
  transportCongestion: number;
}

export interface FactoryBlueprintComparison {
  from: { label: string; blueprintHash: string; metrics: BlueprintMetricSnapshot; capacityPlan: ProductionCapacityPlan };
  to: { label: string; blueprintHash: string; metrics: BlueprintMetricSnapshot; capacityPlan: ProductionCapacityPlan };
  seed: number;
  patch: JsonPatchOperation[];
  changes: BlueprintSemanticChange[];
  delta: BlueprintMetricDelta;
  verdict: "IMPROVED" | "REGRESSED" | "UNCHANGED";
}

function equal(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function encodePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function childPointer(path: string, key: string): string {
  return `${path}/${encodePointer(key)}`;
}

function diffValue(before: unknown, after: unknown, path: string, patch: JsonPatchOperation[]): void {
  if (equal(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    const common = Math.min(before.length, after.length);
    for (let index = 0; index < common; index++) diffValue(before[index], after[index], childPointer(path, String(index)), patch);
    for (let index = before.length - 1; index >= after.length; index--) patch.push({ op: "remove", path: childPointer(path, String(index)) });
    for (let index = common; index < after.length; index++) patch.push({ op: "add", path: `${path}/-`, value: structuredClone(after[index]) });
    return;
  }
  if (before !== null && after !== null && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    const left = before as Record<string, unknown>; const right = after as Record<string, unknown>;
    const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
    for (const key of leftKeys.filter((key) => !(key in right))) patch.push({ op: "remove", path: childPointer(path, key) });
    for (const key of rightKeys.filter((key) => !(key in left))) patch.push({ op: "add", path: childPointer(path, key), value: structuredClone(right[key]) });
    for (const key of leftKeys.filter((key) => key in right)) diffValue(left[key], right[key], childPointer(path, key), patch);
    return;
  }
  patch.push({ op: "replace", path, value: structuredClone(after) });
}

export function createBlueprintPatch(before: Blueprint, after: Blueprint): JsonPatchOperation[] {
  const patch: JsonPatchOperation[] = [];
  diffValue(before, after, "", patch);
  return patch;
}

function decodePointer(value: string): string {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function applyBlueprintPatch(blueprint: Blueprint, patch: JsonPatchOperation[]): Blueprint {
  const candidate = structuredClone(blueprint) as unknown as Record<string, unknown>;
  for (const [operationIndex, operation] of patch.entries()) {
    if (!operation.path.startsWith("/") || operation.path.includes("/__proto__") || operation.path.includes("/constructor") || operation.path.includes("/prototype")) {
      throw new Error(`Blueprint patch operation ${operationIndex} has an invalid path '${operation.path}'`);
    }
    const segments = operation.path.slice(1).split("/").map(decodePointer); let parent: unknown = candidate;
    for (const segment of segments.slice(0, -1)) {
      if (parent === null || typeof parent !== "object") throw new Error(`Blueprint patch path does not exist: ${operation.path}`);
      parent = (parent as Record<string, unknown>)[segment];
    }
    const key = segments.at(-1)!;
    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : Number.parseInt(key, 10);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`Invalid array index in Blueprint patch path: ${operation.path}`);
      if (operation.op === "add") parent.splice(index, 0, structuredClone(operation.value));
      else if (operation.op === "remove") { if (index >= parent.length) throw new Error(`Blueprint patch path does not exist: ${operation.path}`); parent.splice(index, 1); }
      else { if (index >= parent.length) throw new Error(`Blueprint patch path does not exist: ${operation.path}`); parent[index] = structuredClone(operation.value); }
    } else if (parent !== null && typeof parent === "object") {
      const record = parent as Record<string, unknown>;
      if (operation.op === "remove") { if (!(key in record)) throw new Error(`Blueprint patch path does not exist: ${operation.path}`); delete record[key]; }
      else { if (operation.op === "replace" && !(key in record)) throw new Error(`Blueprint patch path does not exist: ${operation.path}`); record[key] = structuredClone(operation.value); }
    } else throw new Error(`Blueprint patch path does not exist: ${operation.path}`);
  }
  return candidate as unknown as Blueprint;
}

function changedFields(before: unknown, after: unknown, prefix = ""): string[] {
  if (equal(before, after)) return [];
  if (Array.isArray(before) || Array.isArray(after) || before === null || after === null || typeof before !== "object" || typeof after !== "object") return [prefix || "value"];
  const left = before as Record<string, unknown>; const right = after as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap((key) => changedFields(left[key], right[key], prefix ? `${prefix}.${key}` : key));
}

function compareEntities(
  kind: Exclude<BlueprintChangeKind, "policy" | "metadata">,
  before: Array<{ id: string }>,
  after: Array<{ id: string }>,
): BlueprintSemanticChange[] {
  const left = new Map(before.map((entity) => [entity.id, entity])); const right = new Map(after.map((entity) => [entity.id, entity]));
  const changes: BlueprintSemanticChange[] = [];
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const previous = left.get(id); const next = right.get(id);
    if (!previous) { changes.push({ kind, id, action: "added", fields: [], after: structuredClone(next) }); continue; }
    if (!next) { changes.push({ kind, id, action: "removed", fields: [], before: structuredClone(previous) }); continue; }
    const fields = changedFields(previous, next);
    if (fields.length) changes.push({ kind, id, action: "changed", fields, before: structuredClone(previous), after: structuredClone(next) });
  }
  return changes;
}

export function compareBlueprintSemantics(before: Blueprint, after: Blueprint): BlueprintSemanticChange[] {
  const changes = [
    ...compareEntities("device", before.devices, after.devices),
    ...compareEntities("connection", before.connections, after.connections),
    ...compareEntities("logistics-network", before.logisticsNetworks, after.logisticsNetworks),
  ];
  if (!equal(before.policies, after.policies)) changes.push({
    kind: "policy", id: "factory", action: before.policies === undefined ? "added" : after.policies === undefined ? "removed" : "changed",
    fields: changedFields(before.policies, after.policies), ...(before.policies === undefined ? {} : { before: structuredClone(before.policies) }),
    ...(after.policies === undefined ? {} : { after: structuredClone(after.policies) }),
  });
  for (const field of ["version", "revision"] as const) if (!equal(before[field], after[field])) changes.push({
    kind: "metadata", id: field, action: before[field] === undefined ? "added" : after[field] === undefined ? "removed" : "changed",
    fields: [field], ...(before[field] === undefined ? {} : { before: before[field] }), ...(after[field] === undefined ? {} : { after: after[field] }),
  });
  return changes;
}

function metricSnapshot(metrics: FactoryMetrics): BlueprintMetricSnapshot {
  const storage = Object.values(metrics.energyStorage);
  const power = Object.values(metrics.powerGrids);
  const routes = Object.values(metrics.routeFlow);
  return {
    score: metrics.finalScore,
    throughputPerMinute: metrics.throughputPerMinute,
    objectiveAttainment: metrics.onTimeDelivery,
    completedLots: metrics.lotFlow.completed,
    scheduledLots: metrics.releaseFlow.scheduled,
    releasedLots: metrics.releaseFlow.released,
    pendingReleaseLots: metrics.releaseFlow.pending,
    meanActualReleaseIntervalTicks: metrics.releaseFlow.meanActualIntervalTicks,
    meanReleaseDelayTicks: metrics.releaseFlow.meanReleaseDelayTicks,
    maximumReleaseDelayTicks: metrics.releaseFlow.maximumReleaseDelayTicks,
    peakActiveLots: metrics.releaseFlow.peakActiveLots,
    capacityBlockedLots: metrics.releaseFlow.capacityBlockedLots,
    capacityBlockedTicks: metrics.releaseFlow.capacityBlockedTicks,
    controlBlockedLots: metrics.releaseFlow.controlBlockedLots,
    controlBlockedTicks: metrics.releaseFlow.controlBlockedTicks,
    serviceLevelOpenings: metrics.releaseFlow.serviceLevelOpenings,
    scrappedLots: metrics.lotFlow.scrapped,
    onTimeLots: metrics.lotFlow.onTimeCompleted,
    goodYield: metrics.qualityFlow.goodYield,
    firstPassYield: metrics.qualityFlow.firstPassYield,
    qualityEscapes: metrics.qualityFlow.escapedDefects,
    reworkCycles: metrics.qualityFlow.totalReworkCycles,
    queueTimeViolations: routes.reduce((sum, route) => sum + route.queueTimeViolations, 0),
    queueTimeViolatedLots: routes.reduce((sum, route) => sum + route.violatedLots, 0),
    maximumQueueTimeOverrunTicks: routes.reduce((maximum, route) => Math.max(maximum, ...Object.values(route.steps).map((step) =>
      step.queueTimeMaximumTicks === null ? 0 : Math.max(0, step.maximumQueueTicks - step.queueTimeMaximumTicks))), 0),
    batchJobs: metrics.batchFlow.jobs,
    batchLots: metrics.batchFlow.lots,
    averageLotsPerBatch: metrics.batchFlow.averageLotsPerJob,
    meanBatchQueueWaitTicksPerLot: metrics.batchFlow.meanQueueWaitTicksPerLot,
    meanCycleTimeTicks: metrics.lotFlow.meanCycleTimeTicks,
    p95CycleTimeTicks: metrics.lotFlow.p95CycleTimeTicks,
    meanQueueTimeTicks: metrics.lotFlow.meanQueueTimeTicks,
    meanTardinessTicks: metrics.lotFlow.meanTardinessTicks,
    totalChangeovers: metrics.equipmentSetups.totalChangeovers,
    totalSetupTicks: metrics.equipmentSetups.totalSetupTicks,
    totalCampaignHolds: metrics.equipmentSetups.totalCampaignHolds,
    totalCampaignHoldTicks: metrics.equipmentSetups.totalCampaignHoldTicks,
    campaignMinimumLotReleases: metrics.equipmentSetups.campaignMinimumLotReleases,
    campaignMaximumHoldReleases: metrics.equipmentSetups.campaignMaximumHoldReleases,
    totalToolingAllocations: metrics.productionTooling.totalAllocations,
    totalToolingCompleted: metrics.productionTooling.totalCompleted,
    totalToolingCancelled: metrics.productionTooling.totalCancelled,
    totalToolingOccupiedTicks: metrics.productionTooling.totalOccupiedTicks,
    totalToolingUnitTicks: metrics.productionTooling.totalUnitTicks,
    totalToolingInputWaitTicks: metrics.productionTooling.totalInputWaitTicks,
    totalToolingInputBlocks: metrics.productionTooling.totalInputBlocks,
    totalMaintenanceCompleted: metrics.equipmentMaintenance.totalCompleted,
    totalMandatoryMaintenance: metrics.equipmentMaintenance.totalMandatory,
    totalOpportunisticMaintenance: metrics.equipmentMaintenance.totalOpportunistic,
    totalMaintenanceCancelled: metrics.equipmentMaintenance.totalCancelled,
    totalMaintenanceTicks: metrics.equipmentMaintenance.totalMaintenanceTicks,
    totalQualificationCompleted: metrics.equipmentMaintenance.totalQualificationCompleted,
    totalQualificationCancelled: metrics.equipmentMaintenance.totalQualificationCancelled,
    totalQualificationTicks: metrics.equipmentMaintenance.totalQualificationTicks,
    totalDriftedJobs: metrics.equipmentMaintenance.totalDriftedJobs,
    totalDriftedLots: metrics.equipmentMaintenance.totalDriftedLots,
    totalDriftDefects: metrics.equipmentMaintenance.totalDriftDefects,
    totalMaintenanceInputWaitTicks: metrics.equipmentMaintenance.totalInputWaitTicks,
    totalMaintenanceCrewWaitTicks: metrics.equipmentMaintenance.totalCrewWaitTicks,
    totalMaintenanceServiceCrewTicks: metrics.equipmentMaintenance.totalServiceCrewTicks,
    totalMaintenanceQualificationCrewTicks: metrics.equipmentMaintenance.totalQualificationCrewTicks,
    energyConsumedMilliJoules: metrics.energyConsumedMilliJoules,
    transportEnergyConsumedMilliJoules: metrics.transportEnergyConsumedMilliJoules,
    storedMilliJoules: storage.reduce((sum, grid) => sum + grid.storedMilliJoules, 0),
    chargedMilliJoules: storage.reduce((sum, grid) => sum + grid.chargedMilliJoules, 0),
    dischargedMilliJoules: storage.reduce((sum, grid) => sum + grid.dischargedMilliJoules, 0),
    unservedMilliJoules: power.reduce((sum, grid) => sum + grid.unservedMilliJoules, 0),
    curtailedMilliJoules: power.reduce((sum, grid) => sum + grid.curtailedMilliJoules, 0),
    unpoweredTicks: Object.values(metrics.unpoweredTime).reduce((sum, ticks) => sum + ticks, 0),
    totalBuildCost: metrics.totalBuildCost,
    occupiedArea: metrics.occupiedArea,
    averageWip: metrics.averageWip,
    averageBlockedBeltItems: metrics.averageBlockedBeltItems,
    beltCellUtilization: metrics.beltCellUtilization,
    transportCongestion: metrics.transportCongestion,
    bottleneckEntity: metrics.bottleneckEntity,
    infeasibleReason: metrics.infeasibleReason,
  };
}

function metricDelta(before: BlueprintMetricSnapshot, after: BlueprintMetricSnapshot): BlueprintMetricDelta {
  return {
    score: after.score - before.score,
    throughputPerMinute: after.throughputPerMinute - before.throughputPerMinute,
    objectiveAttainment: after.objectiveAttainment - before.objectiveAttainment,
    completedLots: after.completedLots - before.completedLots,
    scheduledLots: after.scheduledLots - before.scheduledLots,
    releasedLots: after.releasedLots - before.releasedLots,
    pendingReleaseLots: after.pendingReleaseLots - before.pendingReleaseLots,
    meanActualReleaseIntervalTicks: after.meanActualReleaseIntervalTicks - before.meanActualReleaseIntervalTicks,
    meanReleaseDelayTicks: after.meanReleaseDelayTicks - before.meanReleaseDelayTicks,
    maximumReleaseDelayTicks: after.maximumReleaseDelayTicks - before.maximumReleaseDelayTicks,
    peakActiveLots: after.peakActiveLots - before.peakActiveLots,
    capacityBlockedLots: after.capacityBlockedLots - before.capacityBlockedLots,
    capacityBlockedTicks: after.capacityBlockedTicks - before.capacityBlockedTicks,
    controlBlockedLots: after.controlBlockedLots - before.controlBlockedLots,
    controlBlockedTicks: after.controlBlockedTicks - before.controlBlockedTicks,
    serviceLevelOpenings: after.serviceLevelOpenings - before.serviceLevelOpenings,
    scrappedLots: after.scrappedLots - before.scrappedLots,
    onTimeLots: after.onTimeLots - before.onTimeLots,
    goodYield: after.goodYield - before.goodYield,
    firstPassYield: after.firstPassYield - before.firstPassYield,
    qualityEscapes: after.qualityEscapes - before.qualityEscapes,
    reworkCycles: after.reworkCycles - before.reworkCycles,
    queueTimeViolations: after.queueTimeViolations - before.queueTimeViolations,
    queueTimeViolatedLots: after.queueTimeViolatedLots - before.queueTimeViolatedLots,
    maximumQueueTimeOverrunTicks: after.maximumQueueTimeOverrunTicks - before.maximumQueueTimeOverrunTicks,
    batchJobs: after.batchJobs - before.batchJobs,
    batchLots: after.batchLots - before.batchLots,
    averageLotsPerBatch: after.averageLotsPerBatch - before.averageLotsPerBatch,
    meanBatchQueueWaitTicksPerLot: after.meanBatchQueueWaitTicksPerLot - before.meanBatchQueueWaitTicksPerLot,
    meanCycleTimeTicks: after.meanCycleTimeTicks - before.meanCycleTimeTicks,
    p95CycleTimeTicks: after.p95CycleTimeTicks - before.p95CycleTimeTicks,
    meanQueueTimeTicks: after.meanQueueTimeTicks - before.meanQueueTimeTicks,
    meanTardinessTicks: after.meanTardinessTicks - before.meanTardinessTicks,
    totalChangeovers: after.totalChangeovers - before.totalChangeovers,
    totalSetupTicks: after.totalSetupTicks - before.totalSetupTicks,
    totalCampaignHolds: after.totalCampaignHolds - before.totalCampaignHolds,
    totalCampaignHoldTicks: after.totalCampaignHoldTicks - before.totalCampaignHoldTicks,
    campaignMinimumLotReleases: after.campaignMinimumLotReleases - before.campaignMinimumLotReleases,
    campaignMaximumHoldReleases: after.campaignMaximumHoldReleases - before.campaignMaximumHoldReleases,
    totalToolingAllocations: after.totalToolingAllocations - before.totalToolingAllocations,
    totalToolingCompleted: after.totalToolingCompleted - before.totalToolingCompleted,
    totalToolingCancelled: after.totalToolingCancelled - before.totalToolingCancelled,
    totalToolingOccupiedTicks: after.totalToolingOccupiedTicks - before.totalToolingOccupiedTicks,
    totalToolingUnitTicks: after.totalToolingUnitTicks - before.totalToolingUnitTicks,
    totalToolingInputWaitTicks: after.totalToolingInputWaitTicks - before.totalToolingInputWaitTicks,
    totalToolingInputBlocks: after.totalToolingInputBlocks - before.totalToolingInputBlocks,
    totalMaintenanceCompleted: after.totalMaintenanceCompleted - before.totalMaintenanceCompleted,
    totalMandatoryMaintenance: after.totalMandatoryMaintenance - before.totalMandatoryMaintenance,
    totalOpportunisticMaintenance: after.totalOpportunisticMaintenance - before.totalOpportunisticMaintenance,
    totalMaintenanceCancelled: after.totalMaintenanceCancelled - before.totalMaintenanceCancelled,
    totalMaintenanceTicks: after.totalMaintenanceTicks - before.totalMaintenanceTicks,
    totalQualificationCompleted: after.totalQualificationCompleted - before.totalQualificationCompleted,
    totalQualificationCancelled: after.totalQualificationCancelled - before.totalQualificationCancelled,
    totalQualificationTicks: after.totalQualificationTicks - before.totalQualificationTicks,
    totalDriftedJobs: after.totalDriftedJobs - before.totalDriftedJobs,
    totalDriftedLots: after.totalDriftedLots - before.totalDriftedLots,
    totalDriftDefects: after.totalDriftDefects - before.totalDriftDefects,
    totalMaintenanceInputWaitTicks: after.totalMaintenanceInputWaitTicks - before.totalMaintenanceInputWaitTicks,
    totalMaintenanceCrewWaitTicks: after.totalMaintenanceCrewWaitTicks - before.totalMaintenanceCrewWaitTicks,
    totalMaintenanceServiceCrewTicks: after.totalMaintenanceServiceCrewTicks - before.totalMaintenanceServiceCrewTicks,
    totalMaintenanceQualificationCrewTicks: after.totalMaintenanceQualificationCrewTicks - before.totalMaintenanceQualificationCrewTicks,
    energyConsumedMilliJoules: after.energyConsumedMilliJoules - before.energyConsumedMilliJoules,
    transportEnergyConsumedMilliJoules: after.transportEnergyConsumedMilliJoules - before.transportEnergyConsumedMilliJoules,
    storedMilliJoules: after.storedMilliJoules - before.storedMilliJoules,
    chargedMilliJoules: after.chargedMilliJoules - before.chargedMilliJoules,
    dischargedMilliJoules: after.dischargedMilliJoules - before.dischargedMilliJoules,
    unservedMilliJoules: after.unservedMilliJoules - before.unservedMilliJoules,
    curtailedMilliJoules: after.curtailedMilliJoules - before.curtailedMilliJoules,
    unpoweredTicks: after.unpoweredTicks - before.unpoweredTicks,
    totalBuildCost: after.totalBuildCost - before.totalBuildCost,
    occupiedArea: after.occupiedArea - before.occupiedArea,
    averageWip: after.averageWip - before.averageWip,
    averageBlockedBeltItems: after.averageBlockedBeltItems - before.averageBlockedBeltItems,
    beltCellUtilization: after.beltCellUtilization - before.beltCellUtilization,
    transportCongestion: after.transportCongestion - before.transportCongestion,
  };
}

function assertComparable(before: CompiledFactoryProject, after: CompiledFactoryProject): void {
  for (const [name, left, right] of [
    ["Resource catalog", before.hashes.resourceCatalogHash, after.hashes.resourceCatalogHash],
    ["Process catalog", before.hashes.processCatalogHash, after.hashes.processCatalogHash],
    ["Route catalog", before.hashes.routeCatalogHash, after.hashes.routeCatalogHash],
    ["Device catalog", before.hashes.deviceCatalogHash, after.hashes.deviceCatalogHash],
    ["World", before.hashes.worldHash, after.hashes.worldHash],
    ["Scenario", before.hashes.scenarioHash, after.hashes.scenarioHash],
    ["Objective", before.hashes.objectiveHash, after.hashes.objectiveHash],
  ] as const) if (left !== right) throw new Error(`${name} differs between compared projects; inm compare isolates Blueprint changes and requires identical benchmark inputs`);
}

export function compareFactoryBlueprints(
  before: CompiledFactoryProject,
  after: CompiledFactoryProject,
  options: { seed?: number; fromLabel?: string; toLabel?: string } = {},
): FactoryBlueprintComparison {
  assertComparable(before, after);
  const seed = options.seed ?? 42;
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("Blueprint comparison seed must be a non-negative safe integer");
  const evaluate = (project: CompiledFactoryProject, label: string): BlueprintMetricSnapshot => {
    try { return metricSnapshot(runUntil(project, undefined, { seed }).metrics); }
    catch (error) { throw new Error(`Could not evaluate Blueprint '${label}': ${error instanceof Error ? error.message : String(error)}`); }
  };
  const beforeLabel = options.fromLabel ?? "before"; const afterLabel = options.toLabel ?? "after";
  const beforeMetrics = evaluate(before, beforeLabel);
  const afterMetrics = evaluate(after, afterLabel);
  const delta = metricDelta(beforeMetrics, afterMetrics);
  return {
    from: { label: beforeLabel, blueprintHash: before.hashes.blueprintHash, metrics: beforeMetrics, capacityPlan: planProductionCapacity(before) },
    to: { label: afterLabel, blueprintHash: after.hashes.blueprintHash, metrics: afterMetrics, capacityPlan: planProductionCapacity(after) },
    seed,
    patch: createBlueprintPatch(before.blueprint, after.blueprint),
    changes: compareBlueprintSemantics(before.blueprint, after.blueprint),
    delta,
    verdict: delta.score > 1e-9 ? "IMPROVED" : delta.score < -1e-9 ? "REGRESSED" : "UNCHANGED",
  };
}
