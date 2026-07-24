import React, { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlueprintBenchmarkSummary, DesignProgramSummary, ProjectOperationResult, ProjectWorkbenchSnapshot, WorkbenchDiagnostic, WorkbenchNextActionTarget, WorkbenchOperationDescriptor } from "@inm/core";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { Billboard, Clone, Grid, Html, Line, OrbitControls, RoundedBox, Text, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import "./styles.css";
import { connectedSceneObjects, normalizeStudioSelection, selectStudioObject, type StudioSelection } from "./selection";
import { factoryPresentation, type FactoryLabelDensity, type FactoryPresentation as FactoryPresentationPolicy, type FactoryPresentationRequest } from "./factory-presentation";
import { analysisPath, catalogPath, designPath, experimentPath, factoryObjectPath, overlayReturnPath, projectPath, studioRoute, viewPath, type AssetKind, type StudioView } from "./routes";
import { ExperimentWorkbench } from "./experiment-workbench";
import { DesignWorkbench } from "./design-workbench";

type Status = "idle" | "sleeping" | "waiting-input" | "processing" | "blocked-output" | "unpowered" | "failed";

interface ResourceVisual {
  shape?: string;
  color?: string | null;
  texture?: string | null;
  icon?: string | null;
}

interface DeviceMaterialVisual {
  baseColor: string;
  maps: {
    baseColor: string | null;
    normal: string | null;
    roughness: string | null;
    metalness: string | null;
    emissive: string | null;
  };
  metalness: number;
  roughness: number;
  normalScale: number;
  emissiveColor: string;
  emissiveIntensity: number;
  repeat: { x: number; y: number };
}

interface DeviceVisual {
  shape: string;
  height: number;
  label: string;
  model: string | null;
  material: DeviceMaterialVisual;
}

interface ProjectSummary {
  id: string;
  name: string;
  isDefault: boolean;
  resourceAssets: number;
  deviceAssets: number;
  processes: number;
  deviceInstances: number;
  connections: number;
  logisticsNetworks: number;
  runs: number;
  regions: number;
  resourceNodes: number;
}

interface ProjectIndex {
  name: string;
  workspace: boolean;
  projects: ProjectSummary[];
}

interface DeviceRecipe {
  process: string; mode: string; modeName: string; durationTicks: number; powerMilliWatts: number; priority?: number;
  setupGroup?: string;
  inputs: Array<{ resource: string; buffer: string; count: number; minimumTreatmentLevel?: number }>;
  tooling: Array<{ resource: string; count: number }>;
  toolingProviders: Array<{ device: string; distance: number }>;
  utilities: Array<{ utility: string; units: number }>;
  utilityProviders: Record<string, Array<{ device: string; distance: number }>>;
  outputs: Array<{ resource: string; buffer: string; count: number; treatmentLevel?: number }>;
  quality?: { kind: "inspection" | "rework"; detects?: string[]; repairs?: string[]; rejectResource?: string; scrapResource?: string; maxReworkCycles?: number };
}

interface Device {
  id: string;
  assetId: string;
  name: string;
  region: string;
  powerPriority: number;
  recipeDispatch: string;
  lotDispatch: string;
  changeoverTransitions?: Array<{ from: string | null; to: string; durationTicks: number; powerMilliWatts: number }>;
  setupCampaign?: { minimumReadyLots: number; maximumHoldTicks: number };
  batchFormation?: { preferredProcess: string; maximumWaitTicks: number };
  cadenceControl?: {
    kind: "downstream-starvation-recovery"; process: string; normalMode: string; recoveryMode: string;
    downstreamConnection: string; recoverBelowItems: number; minimumStarvationTicks: number;
  };
  preventiveMaintenance?: {
    opportunistic?: { afterJobs?: number; afterQualificationTicks?: number };
    planned?: { afterJobs?: number; afterQualificationTicks?: number };
  };
  idleEnergy?: { sleepAfterTicks: number };
  maintenance?: {
    maximumJobs: number; maximumQualificationTicks: number; durationTicks: number; powerMilliWatts: number;
    service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> };
    qualification: {
      durationTicks: number; powerMilliWatts: number;
      service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> };
    };
    drift?: Array<{
      afterJobs: number; durationMultiplier: { numerator: number; denominator: number };
      powerMultiplier: { numerator: number; denominator: number }; defects: string[];
    }>;
  };
  maintenanceProviders: Array<{ device: string; distance: number }>;
  qualificationProviders: Array<{ device: string; distance: number }>;
  maintenanceProvider?: { skills: string[]; crews: number; serviceRadius: number; inventoryBuffer: string };
  toolingProvider?: { serviceRadius: number; inventoryBuffer: string; stock: Array<{ resource: string; count: number }> };
  utilityProvider?: { serviceRadius: number; capacities: Array<{ utility: string; units: number }> };
  capabilities: string[];
  position: { x: number; y: number };
  rotation: number;
  footprint: { width: number; height: number };
  visual: DeviceVisual;
  transportEndpoint?: { connection: string; stage: "loader" | "unloader"; distance: number };
  recipe?: DeviceRecipe;
  recipes?: DeviceRecipe[];
  treatment?: { mode: string; modeName: string; level: number; durationTicks: number; itemCount: number; inputBuffer: string; outputBuffer: string; agentBuffer: string; agentResource: string; agentCount: number };
  resourceContracts: Record<string, string[]>;
}

interface DeviceCatalogAsset {
  type: "device";
  id: string;
  name: string;
  description: string;
  tags: string[];
  capabilities: string[];
  geometry: {
    footprint: { width: number; height: number };
    rotatable: boolean;
    ports: Array<{ id: string; direction: "input" | "output"; side: string; buffer: string }>;
  };
  buffers: Array<{ id: string; role: string; capacity: number; accepts: string[] }>;
  production?: {
    processes: string[]; categories: string[]; speed: { numerator: number; denominator: number }; inputPorts: string[]; outputPorts: string[];
    modes: Array<{
      id: string; name: string; inputCycles: number; outputCycles: number;
      durationMultiplier: { numerator: number; denominator: number }; powerMultiplier: { numerator: number; denominator: number };
      auxiliaryInputs: Array<{ resource: string; count: number; port: string }>;
      preventsDefects: string[];
      minimumInputTreatmentLevel: number;
    }>;
    changeover?: { transitions: Array<{ from: string | null; to: string; durationTicks: number; powerMilliWatts: number }> };
    maintenance?: {
      maximumJobs: number; maximumQualificationTicks: number; durationTicks: number; powerMilliWatts: number;
      service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> };
      qualification: {
        durationTicks: number; powerMilliWatts: number;
        service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> };
      };
      drift?: Array<{
        afterJobs: number; durationMultiplier: { numerator: number; denominator: number };
        powerMultiplier: { numerator: number; denominator: number }; defects: string[];
      }>;
    };
  };
  maintenanceProvider?: { skills: string[]; crews: number; serviceRadius: number; inventoryBuffer: string };
  toolingProvider?: { serviceRadius: number; inventoryBuffer: string; stock: Array<{ resource: string; count: number }> };
  utilityProvider?: { serviceRadius: number; capacities: Array<{ utility: string; units: number }> };
  treatment?: {
    inputBuffer: string; outputBuffer: string; agentBuffer: string;
    modes: Array<{ id: string; name: string; level: number; durationTicks: number; itemCount: number; agent: { resource: string; count: number } }>;
  };
  extraction?: { resources: string[]; radius: number; outputBuffer: string; cycleTicks: number; itemsPerCycle: number };
  logistics?: { roles: Array<"loader" | "line" | "unloader" | "carrier">; carrierKinds?: Array<"local" | "inter-zone">; missionEnergy?: { baseMilliJoules: number; milliJoulesPerDistance: number }; highSpeedMission?: { durationMultiplier: { numerator: number; denominator: number }; energyMultiplier: { numerator: number; denominator: number } }; endpointRange?: { minimum: number; maximum: number } };
  logisticsStation?: { networkKinds: Array<"local" | "inter-zone">; buffer: string; slots: number; energyCapacityMilliJoules: number; maximumChargeMilliWatts: number };
  runtime: { apiVersion: 1; entry: string };
  power: {
    idleMilliWatts: number;
    activeMilliWatts: number;
    sleep?: { idleMilliWatts: number; wakeDurationTicks: number; wakePowerMilliWatts: number };
    generation?: { kind: "renewable"; outputMilliWatts: number } | { kind: "fuel"; outputMilliWatts: number; fuelBuffer: string; fuels: string[] };
    distribution?: { connectionRange: number; coverageRange: number };
    storage?: { capacityMilliJoules: number; chargeMilliWatts: number; dischargeMilliWatts: number };
  };
  economics: { buildCost: number };
  visual: DeviceVisual;
  contentHash: string;
  instanceCount: number;
  fleetCount: number;
}

interface ResourceCatalogAsset {
  type: "resource";
  id: string;
  name: string;
  description: string;
  tags: string[];
  unit: { kind: "discrete" | "continuous"; symbol: string; precision: number };
  transport: { stackSize: number };
  tracking?: { kind: "lot"; family: string; route: string };
  fuel?: { energyMilliJoules: number };
  visual: ResourceVisual;
  contentHash: string;
}

interface ProcessCatalogAsset {
  type: "process";
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  setupGroup?: string;
  quality?: {
    kind: "inspection" | "rework"; detects?: string[]; repairs?: string[];
    rejectResource?: string; scrapResource?: string; maxReworkCycles?: number;
  };
  lotTermination?: { terminal: "complete" | "scrap" };
  lotOutputProfiles?: Array<{ id: string; defectsAny: string[]; outputCounts: Record<string, number> }>;
  durationTicks: number;
  inputs: Array<{ resource: string; count: number }>;
  tooling?: Array<{ resource: string; count: number }>;
  utilities?: Array<{ utility: string; units: number }>;
  outputs: Array<{ resource: string; count: number }>;
  contentHash: string;
}

interface RouteCatalogAsset {
  type: "route";
  id: string;
  name: string;
  description: string;
  tags: string[];
  family: string;
  entry: { resource: string; step: string };
  steps: Array<{ id: string; name: string; operations: string[]; queueTime?: { maximumTicks: number; violationDefects: string[] }; transitions: Array<{ resource: string; to?: string; terminal?: "complete" | "scrap" }> }>;
  contentHash: string;
}

interface FactoryEvent {
  type: string;
  tick: number;
  device?: string;
  mode?: string;
  durationTicks?: number;
  resource?: string;
  node?: string;
  count?: number;
  remaining?: number;
  transit?: { id: string; resource: string; count: number; treatmentLevel: number; departTick: number; arriveTick: number };
  transitId?: string;
  connection?: string;
  cell?: string | null;
  cellIndex?: number;
  waitingFor?: string;
  stage?: "loader" | "unloader";
  grid?: string | null;
  requiredMilliWatts?: number;
  availableMilliWatts?: number;
  remainingTicks?: number;
  workedTicks?: number;
  ratedMilliWatts?: number;
  outputMilliWatts?: number;
  outputPermille?: number;
  satisfactionPpm?: number;
  requiredMilliJoules?: number;
  storedMilliJoules?: number;
  energyMilliJoules?: number;
  network?: string;
  route?: string;
}

interface Metrics {
  finalScore: number;
  throughputPerMinute: number;
  deliveryPortfolio: {
    demanded: number; delivered: number; valued: number; overflow: number; fulfillment: number;
    grossValue: number; shortfallPenalty: number; netValue: number; netValuePerMinute: number;
    contracts: Record<string, {
      name: string; resource: string; region: string; demand: number; delivered: number; valued: number;
      overflow: number; shortfall: number; fulfillment: number; grossValue: number; shortfallPenalty: number; netValue: number;
    }>;
  };
  onTimeDelivery: number;
  lotFlow: {
    family: string | null; scheduled: number; released: number; pendingRelease: number; completed: number; scrapped: number; onTimeCompleted: number; inProgress: number;
    meanCycleTimeTicks: number; p95CycleTimeTicks: number; maximumCycleTimeTicks: number;
    meanQueueTimeTicks: number; meanProcessTimeTicks: number; meanTransportTimeTicks: number;
    meanTardinessTicks: number; maximumTardinessTicks: number;
  };
  routeFlow: Record<string, {
    family: string; scheduled: number; completed: number; scrapped: number; inProgress: number; transitions: number; reentrantTransitions: number;
    queueTimeViolations: number; violatedLots: number;
    steps: Record<string, { visits: number; starts: number; activeLots: number; meanQueueTicks: number; maximumQueueTicks: number; queueTimeMaximumTicks: number | null; queueTimeViolations: number }>;
  }>;
  releaseFlow: {
    scheduled: number; released: number; pending: number; plannedSpanTicks: number; actualSpanTicks: number;
    meanPlannedIntervalTicks: number; meanActualIntervalTicks: number; meanReleaseDelayTicks: number; maximumReleaseDelayTicks: number;
    control: "open-loop" | "conwip"; maximumWip: number | null; reopenAtWip: number | null;
    maximumReleaseDelayPolicyTicks: number | null; serviceLevelOpenings: number;
    dispatch: "fifo" | "earliest-due-date" | "highest-priority" | null; peakActiveLots: number;
    capacityBlockedLots: number; capacityBlockedTicks: number; controlBlockedLots: number; controlBlockedTicks: number;
  };
  qualityFlow: {
    inspectedLots: number; totalInspections: number; passedInspections: number; rejectedInspections: number; scrapDispositions: number;
    reworkedLots: number; totalReworkCycles: number; defectFreeCompleted: number; firstPassCompleted: number;
    escapedDefects: number; activeDefects: number; goodYield: number; firstPassYield: number;
    qualityControl: {
      authoredExcursions: number; authoredDefectInstances: number; preventedDefectInstances: number;
      appliedDefectInstances: number; preventedLots: number;
      devices: Record<string, {
        mode: string; authoredDefectInstances: number; preventedDefectInstances: number;
        appliedDefectInstances: number; lots: string[]; preventedByClass: Record<string, number>;
      }>;
    };
  };
  lotOutputFlow: {
    jobs: number; nominalUnits: number; actualUnits: number; lostUnits: number; outputRatio: number;
    nominalOutputs: Record<string, number>; actualOutputs: Record<string, number>; lostOutputs: Record<string, number>;
    processes: Record<string, {
      jobs: number; nominalUnits: number; actualUnits: number; lostUnits: number; outputRatio: number;
      profiles: Record<string, number>; nominalOutputs: Record<string, number>; actualOutputs: Record<string, number>; lostOutputs: Record<string, number>;
    }>;
  };
  batchFlow: {
    batchOperations: number; jobs: number; lots: number; averageLotsPerJob: number; meanQueueWaitTicksPerLot: number;
    formationHolds: number; formationHoldTicks: number; preferredReleases: number; timeoutReleases: number;
    formationDevices: Record<string, { holds: number; holdTicks: number; preferredReleases: number; timeoutReleases: number; draining: boolean; hold?: { preferredProcess: string; sinceTick: number; deadlineTick: number } }>;
    operations: Record<string, { device: string; process: string; mode: string; expectedLotsPerJob: number; jobs: number; lots: number; averageLotsPerJob: number; maximumLotsPerJob: number; meanQueueWaitTicksPerLot: number }>;
  };
  cadenceControl: {
    devices: Record<string, {
      kind: "downstream-starvation-recovery"; process: string; normalMode: string; recoveryMode: string;
      downstreamConnection: string; recoverBelowItems: number; minimumStarvationTicks: number;
      normalJobs: number; recoveryJobs: number; recoveryActivations: number;
      starvationEpisodes: number; starvationTicks: number;
    }>;
  };
  energyConsumedMilliJoules: number;
  electricityCosts: {
    energyChargeMicroCurrency: number; demandChargeMicroCurrency: number; totalMicroCurrency: number;
    regions: Record<string, { energyConsumedMilliJoules: number; energyChargeMicroCurrency: number; peakDemandMilliWatts: number; demandChargeMicroCurrency: number; totalMicroCurrency: number; demandChargeMicroCurrencyPerKiloWatt: number }>;
  };
  energyStorage: Record<string, { initialMilliJoules: number; storedMilliJoules: number; capacityMilliJoules: number; chargedMilliJoules: number; dischargedMilliJoules: number }>;
  stationEnergy: Record<string, { initialMilliJoules: number; storedMilliJoules: number; capacityMilliJoules: number; chargedMilliJoules: number; spentMilliJoules: number; configuredChargeMilliWatts: number }>;
  powerGrids: Record<string, {
    generatedMilliJoules: number; demandMilliJoules: number; servedMilliJoules: number; unservedMilliJoules: number; curtailedMilliJoules: number;
    peakGenerationMilliWatts: number; peakDemandMilliWatts: number; peakDeficitMilliWatts: number; peakSurplusMilliWatts: number;
    averageSatisfactionPpm: number; minimumSatisfactionPpm: number;
    requiredStorageCapacityMilliJoules: number;
  }>;
  fuelConsumed: Record<string, number>;
  highSpeedMissions: number;
  carrierMissions: number;
  carrierReturns: number;
  stationFleets: Record<string, { network: string; station: string; carrierAsset: string; configuredCarriers: number; activeMissions: number; completedReturns: number; utilization: number }>;
  materialTreatment: { treated: Record<string, Record<string, number>>; agentsConsumed: Record<string, number> };
  productionTooling: {
    totalAllocations: number; totalCompleted: number; totalCancelled: number; totalOccupiedTicks: number; totalUnitTicks: number;
    totalInputWaitTicks: number; totalInputBlocks: number;
    resources: Record<string, { allocations: number; unitsAllocated: number; unitTicks: number }>;
    devices: Record<string, {
      allocations: number; completed: number; cancelled: number; occupiedTicks: number; unitTicks: number;
      inputWaitTicks: number; inputBlocks: number;
      resources: Record<string, { allocations: number; unitsAllocated: number; unitTicks: number }>;
      wait?: { process: string; sinceTick: number };
      hold?: { provider: string; process: string; amounts: Array<{ resource: string; count: number }>; acquiredAtTick: number };
    }>;
    providers: Record<string, {
      reserved: Record<string, number>; peakReserved: Record<string, number>; allocations: number; completed: number; cancelled: number;
      occupiedTicks: number; unitTicks: number; resources: Record<string, { allocations: number; unitsAllocated: number; unitTicks: number }>;
    }>;
  };
  productionUtilities: {
    totalAllocations: number; totalCompleted: number; totalCancelled: number; totalProviderInterruptions: number; totalOccupiedTicks: number; totalUnitTicks: number;
    totalInputWaitTicks: number; totalInputBlocks: number;
    utilities: Record<string, { allocations: number; unitsAllocated: number; unitTicks: number }>;
    devices: Record<string, { allocations: number; completed: number; cancelled: number; providerInterruptions: number; occupiedTicks: number; unitTicks: number; inputWaitTicks: number; inputBlocks: number; utilities: Record<string, { allocations: number; unitsAllocated: number; unitTicks: number }> }>;
    providers: Record<string, { capacity: Record<string, number>; reserved: Record<string, number>; peakReserved: Record<string, number>; allocations: number; completed: number; cancelled: number; interruptedJobs: number; occupiedTicks: number; unitTicks: number; utilities: Record<string, { allocations: number; unitsAllocated: number; unitTicks: number }> }>;
  };
  equipmentSetups: {
    totalChangeovers: number; totalSetupTicks: number; totalCampaignHolds: number; totalCampaignHoldTicks: number;
    campaignMinimumLotReleases: number; campaignMaximumHoldReleases: number;
    devices: Record<string, {
      group: string | null; changeovers: number; setupTicks: number; campaignHolds: number; campaignHoldTicks: number;
      campaignMinimumLotReleases: number; campaignMaximumHoldReleases: number;
      campaign?: { targetGroup: string; sinceTick: number; deadlineTick: number };
    }>;
  };
  equipmentMaintenance: {
    totalCompleted: number; totalAssetLimit: number; totalPlannedBoundary: number; totalOpportunistic: number; totalUsageTriggered: number; totalCalendarTriggered: number; totalCancelled: number; totalMaintenanceTicks: number;
    totalQualificationCompleted: number; totalQualificationCancelled: number; totalQualificationTicks: number;
    totalDriftedJobs: number; totalDriftedLots: number; totalDriftDefects: number;
    totalInputWaitTicks: number; totalCrewWaitTicks: number; totalInputBlocks: number; totalCrewBlocks: number; totalServiceCrewTicks: number; totalQualificationCrewTicks: number;
    serviceConsumables: Record<string, number>;
    qualificationConsumables: Record<string, number>;
    devices: Record<string, {
      jobsSinceMaintenance: number; qualifiedAtTick: number; qualificationAgeTicks: number; usageTriggered: number; calendarTriggered: number; completed: number; assetLimit: number; plannedBoundary: number; opportunistic: number; cancelled: number; maintenanceTicks: number;
      qualificationCompleted: number; qualificationCancelled: number; qualificationTicks: number;
      driftedJobs: number; driftedLots: number; driftDefects: number; inputWaitTicks: number; crewWaitTicks: number; inputBlocks: number; crewBlocks: number;
      serviceConsumables: Record<string, number>; qualificationConsumables: Record<string, number>;
      qualificationPending?: { cause: "asset-limit" | "planned-boundary" | "opportunistic"; trigger: "usage" | "calendar"; jobsSinceMaintenance: number; qualificationAgeTicks: number };
      wait?: { phase: "service" | "qualification"; reason: "consumable" | "crew"; sinceTick: number };
    }>;
    providers: Record<string, {
      crews: number; crewsInUse: number; peakCrewsInUse: number; assignments: number; completed: number; cancelled: number;
      serviceCrewTicks: number; qualificationAssignments: number; qualificationCompleted: number; qualificationCancelled: number;
      qualificationCrewTicks: number; consumables: Record<string, number>;
    }>;
  };
  equipmentEnergyManagement: {
    totalSleeps: number; totalWakeups: number; totalWakeTicks: number; totalSleepingTicks: number;
    devices: Record<string, {
      mode: "awake" | "sleeping"; idleSinceTick: number; sleeps: number; wakeups: number; wakeTicks: number; sleepingTicks: number;
    }>;
  };
  totalBuildCost: number;
  occupiedArea: number;
  averageWip: number;
  inventoryAccounting: {
    averageTotalInventory: number; averageWip: number; averageExcludedInventory: number;
    peakTotalInventory: number; peakWip: number;
    resources: Record<string, {
      includedInWip: boolean; averageInventory: number; peakInventory: number; finalInventory: number;
    }>;
  };
  averageBeltItems: number;
  averageBlockedBeltItems: number;
  peakBeltItems: number;
  beltCellUtilization: number;
  transportStageUtilization: Record<string, { loader: number; unloader: number }>;
  transportFlows: Record<string, {
    departedItems: number; deliveredItems: number; departedByResource: Record<string, number>; deliveredByResource: Record<string, number>;
    departedItemsPerMinute: number; deliveredItemsPerMinute: number; capacityItemsPerMinute: number; utilization: number;
    averageInFlightItems: number; blockedItemTicks: number; blockedFraction: number;
  }>;
  transportEnergyConsumedMilliJoules: number;
  bottleneckEntity: string | null;
  consumed: Record<string, number>;
  extracted: Record<string, number>;
  resourceNodes: Record<string, { initial: number; remaining: number; reserved: number; extracted: number; depleted: boolean }>;
  machineUtilization: Record<string, number>;
  idleTime: Record<string, number>;
  sleepingTime: Record<string, number>;
  waitingInputTime: Record<string, number>;
  blockedOutputTime: Record<string, number>;
  unpoweredTime: Record<string, number>;
  failedTime: Record<string, number>;
  scoreBreakdown: Record<string, number>;
}

interface IndustrialAnalysis {
  powerAllocation: "proportional" | "priority-load-shedding";
  declarativeDevices: number;
  opaqueDevices: number;
  devices: Array<{
    device: string; asset: string; process: string; mode: string; inputCycles: number; outputCycles: number; minimumInputTreatmentLevel: number; preventsDefects: string[]; category: string; cycleTicks: number; cyclesPerMinute: number;
    setupGroup?: string; changeoverTransitions?: Array<{ from: string | null; to: string; durationTicks: number; powerMilliWatts: number }>;
    inputsPerMinute: Record<string, number>; outputsPerMinute: Record<string, number>;
    inputPorts: Record<string, string>; outputPorts: Record<string, string>; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number;
    sleepIdleMilliWatts?: number; wakeDurationTicks?: number; wakePowerMilliWatts?: number; sleepAfterTicks?: number;
  }>;
  bufferContracts: Array<{
    device: string; asset: string;
    buffers: Array<{ buffer: string; role: string; capacity: number; accepts: string[]; resourceCapacities?: Record<string, number> }>;
  }>;
  portContracts: Array<{
    device: string; asset: string;
    ports: Array<{ port: string; direction: "input" | "output"; buffer: string; accepts: string[] }>;
  }>;
  recipeOptions: Array<{
    device: string; asset: string; process: string; mode: string; modeName: string; minimumInputTreatmentLevel: number; preventsDefects: string[]; name: string; category: string; selected: boolean;
    cycleTicks: number; cyclesPerMinute: number; inputs: Array<{ resource: string; count: number }>; outputs: Array<{ resource: string; count: number }>;
    inputPorts: Record<string, string>; outputPorts: Record<string, string>; targetOutputPerMinute: number; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number;
  }>;
  productionGraph: {
    targetResource: string; rawInputsPerTarget: Record<string, number>; coproductSurplusPerTarget: Record<string, number>;
    steps: Array<{ device: string; process: string; mode: string; cyclesPerTarget: number }>;
    dependencies: Array<{ device: string; process: string; mode: string; inputs: string[]; outputs: string[] }>;
  };
  extractionDevices: Array<{ device: string; asset: string; resource: string; nodes: string[]; cycleTicks: number; itemsPerCycle: number; itemsPerMinute: number; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number }>;
  treatmentDevices: Array<{
    device: string; asset: string; mode: string; level: number; itemCount: number; cycleTicks: number; itemsPerMinute: number;
    inputBuffer: string; outputBuffer: string; agentBuffer: string; agentResource: string; agentPerCycle: number; agentPerMinute: number; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number;
  }>;
  generationDevices: Array<{ device: string; asset: string; region: string; kind: "renewable" | "fuel"; outputMilliWatts: number; fuelBuffer?: string; fuelResource?: string; fuelPerMinute?: number; burnTicks?: number }>;
  storageDevices: Array<{ device: string; asset: string; region: string; capacityMilliJoules: number; initialMilliJoules: number; chargeMilliWatts: number; dischargeMilliWatts: number }>;
  resourceNodes: Array<{ node: string; region: string; resource: string; amount: number; miners: string[]; nominalSharePerMinute: number; estimatedDepletionMinutes: number | null }>;
  resources: Array<{ resource: string; producedPerMinute: number; consumedPerMinute: number; netPerMinute: number; hasBoundarySupply: boolean; hasBoundaryDemand: boolean }>;
  connections: Array<{
    connection: string; from: string; to: string; capacityItemsPerMinute: number; travelTicks: number; dispatchIntervalTicks: number; pathCells: number; sharedCells: number; maxLevel: number;
    resources: string[];
    dispatchPolicy: "fifo" | "round-robin" | "shortage-first";
    dispatchProfiles: Array<{ resource: string; targetKind: "objective" | "process" | "fuel" | "buffer"; coverageUnit: number; criticalDepth: number | null; minimumTreatmentLevel: number }>;
    capacityByResource: Record<string, number>; stackSizeByResource: Record<string, number>; maxStackSize: number;
    stages: Array<{ stage: "loader" | "line" | "unloader"; device?: string; asset: string; distance: number; capacity: number; durationTicks: number; stackCapacity: number; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number; powerGrid?: string; position?: { x: number; y: number } }>;
  }>;
  transportCells: Array<{ cell: string; region: string; position: { x: number; y: number; level?: number }; asset: string; connections: string[]; output: { kind: "cell"; cell: string } | { kind: "port"; device: string; port: string }; travelTicks: number; capacityStacksPerMinute: number }>;
  powerGrids: Array<{
    grid: string; region: string; distributors: string[]; members: string[];
    transportStages: Array<{ connection: string; stage: "loader" | "unloader"; device: string }>;
    generators: IndustrialAnalysis["generationDevices"]; storageDevices: IndustrialAnalysis["storageDevices"];
    productionMilliWatts: number; idleConsumptionMilliWatts: number; ratedConsumptionMilliWatts: number; headroomMilliWatts: number;
    storageCapacityMilliJoules: number; initialStoredMilliJoules: number; storageChargeMilliWatts: number; storageDischargeMilliWatts: number;
  }>;
  stationNetworks: Array<{
    network: string; kind: "local" | "inter-zone"; dispatchPolicy: "fifo" | "round-robin" | "shortage-first"; fleets: Array<{ station: string; region: string; carrierAsset: string; count: number; estimatedLoad: number }>; stations: number; estimatedCarrierLoad: number;
    stationEnergy: Array<{ device: string; region: string; capacityMilliJoules: number; chargeMilliWatts: number }>;
    routes: Array<{
      route: string; resource: string; from: string; to: string; fromRegion: string; toRegion: string;
      fromSlotCapacity: number; toSlotCapacity: number; supplyReserve: number; demandTarget: number; supplyPriority: number; demandPriority: number;
      minimumBatch: number; carrierBatchCapacity: number; carrierAsset: string; fleetSize: number; batchCapacity: number; standardTravelTicks: number; standardRoundTripTicks: number; standardMissionEnergyMilliJoules: number; travelTicks: number; roundTripTicks: number; missionEnergyMilliJoules: number; highSpeed: { enabled: boolean; travelTicks: number; roundTripTicks: number; missionEnergyMilliJoules: number } | null; capacityItemsPerMinute: number; energyLimitedItemsPerMinute: number;
      dispatchProfile: { resource: string; targetKind: "objective" | "process" | "fuel" | "buffer"; coverageUnit: number; criticalDepth: number | null; minimumTreatmentLevel: number; downstreamConnections: string[] };
    }>;
  }>;
  diagnostics: Array<{ code: string; severity: "warning" | "info"; resource?: string; device?: string; connection?: string; message: string }>;
}

interface CapacityPlan {
  targetResource: string; targetRatePerMinute: number; scenarioMinutes: number; targetItemsForScenario: number; ready: boolean;
  processes: Array<{
    resource: string; process: string; mode: string; asset: string; templateDevice: string; requiredOutputPerMinute: number; requiredCyclesPerMinute: number;
    inputsPerMinute: Record<string, number>; outputsPerMinute: Record<string, number>; capacityPerMachine: number; configuredMachines: number; configuredCapacityPerMinute: number;
    requiredMachines: number; additionalMachines: number; region: string; powerMilliWattsPerMachine: number; minimumInputTreatmentLevel: number;
  }>;
  toolsets: Array<{
    id: string; asset: string; region: string; requiredDeviceTicksPerMinute: number; configuredDeviceTicksPerMinute: number;
    allocatedDeviceTicksPerMinute: number; unallocatedDeviceTicksPerMinute: number; utilization: number; minimumAdditionalDevices: number;
    operations: Array<{ process: string; mode: string; requiredDeviceTicksPerMinute: number; allocatedDeviceTicksPerMinute: number; unallocatedDeviceTicksPerMinute: number; qualifiedDevices: string[] }>;
    devices: Array<{ device: string; allocatedDeviceTicksPerMinute: number; utilization: number; qualifiedOperations: string[] }>;
  }>;
  treatments: Array<{
    process: string; mode: string; resource: string; region: string; minimumLevel: number; asset: string; treatmentMode: string; agentResource: string;
    requiredItemsPerMinute: number; requiredAgentPerMinute: number; capacityPerDevice: number; requiredDevices: number; configuredDevices: number;
    configuredCapacityPerMinute: number; additionalDevices: number;
  }>;
  rawResources: Array<{
    resource: string; processDemandPerMinute: number; infrastructureDemandPerMinute: number; totalDemandPerMinute: number;
    configuredExtractors: number; configuredExtractionPerMinute: number; scheduledSupply: number; scheduledSupplyPerMinute: number;
    configuredSupplyPerMinute: number; supplyDeficitPerMinute: number; additionalExtractors: number;
    finiteReserve: number; lifetimeMinutes: number | null; scenarioDemand: number; scenarioSupply: number; scenarioBalance: number;
  }>;
  transport: Array<{ direction: "input" | "output"; process: string; resource: string; devices: string[]; connections: string[]; requiredItemsPerMinute: number; configuredCapacityPerMinute: number; capacityDeficitPerMinute: number }>;
  stationNetworks: Array<{ network: string; resource: string; routes: string[]; requiredItemsPerMinute: number; perCarrierItemsPerMinute: number; energyLimitedItemsPerMinute: number; configuredItemsPerMinute: number; requiredCarriers: number; configuredCarriers: number; additionalCarriers: number; additionalChargeMilliWatts: number }>;
  power: Array<{
    region: string; requiredMilliWatts: number; configuredGenerationMilliWatts: number; headroomMilliWatts: number;
    scenarioGeneratedMilliJoules: number; scenarioDemandMilliJoules: number; scenarioUnservedMilliJoules: number; scenarioCurtailedMilliJoules: number;
    requiredStorageCapacityMilliJoules: number; configuredStorageCapacityMilliJoules: number;
    configuredStorageChargeMilliWatts: number; configuredStorageDischargeMilliWatts: number;
  }>;
  gaps: Array<{ kind: string; entity: string; message: string }>;
}

interface StudioData {
  projectId: string;
  name: string;
  environment: {
    floor?: {
      baseColor: string;
      gridColor: string;
      sectionColor: string;
      edgeColor: string;
      aisleColor: string;
      slabMargin: number;
      material: {
        maps: {
          baseColor: string;
          normal: string;
          roughness: string;
        };
        metalness: number;
        roughness: number;
        normalScale: number;
        tileSize: number;
      };
    };
    backdrop?: {
      image: string;
      height: number;
      distance: number;
      opacity: number;
    };
  } | null;
  selection: { world: string; blueprint: string; scenario: string; objective: string };
  experiments: BlueprintBenchmarkSummary[];
  designPrograms: DesignProgramSummary[];
  blueprintHash: string;
  bounds: { width: number; height: number };
  regions: Array<{
    id: string; name: string; kind: "industrial-zone";
    coordinates: { x: number; y: number; z: number };
    bounds: { width: number; height: number };
    offset: { x: number; y: number };
  }>;
  resourceNodes: Array<{ id: string; region: string; resource: string; amount: number; remaining: number; position: { x: number; y: number } }>;
  devices: Device[];
  connections: Array<{
    id: string;
    fromDevice: string;
    toDevice: string;
    endpointDevices: string[];
    resources: string[];
    from: { x: number; y: number; level: number };
    to: { x: number; y: number; level: number };
    points: Array<{ x: number; y: number; level: number }>;
    endpoints: Array<{ stage: "loader" | "unloader"; device: string; asset: string; distance: number; from: { x: number; y: number; level: number }; to: { x: number; y: number; level: number }; position: { x: number; y: number }; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number; powerGrid: string | null }>;
  }>;
  logisticsRoutes: Array<{
    id: string; network: string; resource: string; fromDevice: string; toDevice: string;
    from: { x: number; y: number }; to: { x: number; y: number };
  }>;
  resources: Record<string, { visual?: ResourceVisual }>;
  electricityTariffs: Array<{
    region: string; periodTicks: number; demandChargeMicroCurrencyPerKiloWatt: number;
    points: Array<{ atTick: number; energyPriceMicroCurrencyPerKiloWattHour: number }>;
  }>;
  analysis: IndustrialAnalysis;
  capacityPlan: CapacityPlan;
  assets: { devices: DeviceCatalogAsset[]; resources: ResourceCatalogAsset[]; processes: ProcessCatalogAsset[]; routes: RouteCatalogAsset[] };
  events: FactoryEvent[];
  metrics: Metrics | null;
  selectedRun: string | null;
  runs: Array<{ name: string; score: number; decision: string; blueprint: string; resultHash: string }>;
}

interface DeviceFrame { status: Status; progress: number }
interface TransitFrame { id: string; material: string; count: number; treatmentLevel: number; progress: number; path: string; kind: "belt" | "station"; position?: { x: number; y: number; level?: number }; blocked?: boolean }
interface FactoryFrame { devices: Record<string, DeviceFrame>; transits: TransitFrame[]; endpointPower: Record<string, boolean>; visibleEvents: FactoryEvent[] }

const STATUS_COLORS: Record<Status, string> = {
  idle: "#64748b",
  sleeping: "#38bdf8",
  "waiting-input": "#818cf8",
  processing: "#22d3a7",
  "blocked-output": "#f59e0b",
  unpowered: "#a855f7",
  failed: "#ef4444",
};
const STATUS_LABELS: Record<Status, string> = {
  idle: "IDLE",
  sleeping: "SLEEP",
  "waiting-input": "WAITING",
  processing: "RUNNING",
  "blocked-output": "BLOCKED",
  unpowered: "NO POWER",
  failed: "FAILED",
};

const formatTick = (tick: number) => `${(tick / 1000).toFixed(1)}s`;
const jobQuantity = (rates: Record<string, number>, cyclesPerMinute: number) => Object.values(rates).reduce((sum, rate) => sum + rate, 0) / cyclesPerMinute;
const formatQuantity = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const fileUrl = (projectId: string, path: string) => `/api/projects/${encodeURIComponent(projectId)}/files/${path.split("/").map(encodeURIComponent).join("/")}`;

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status})`);
  return value;
}

function buildFrame(data: StudioData, tick: number): FactoryFrame {
  const devices = Object.fromEntries(data.devices.map((device) => [device.id, { status: "idle" as Status, progress: 0 }]));
  const endpointPower = Object.fromEntries(data.connections.flatMap((connection) => connection.endpoints.map((endpoint) => [`${connection.id}:${endpoint.stage}`, Boolean(endpoint.powerGrid)])));
  const jobs = new Map<string, { durationTicks: number; workedTicks: number; resumedAt?: number }>();
  const transportJobs = new Map<string, Set<string>>();
  const sleepingDevices = new Set<string>();
  const transits = new Map<string, TransitFrame>();
  const visibleEvents: FactoryEvent[] = [];
  for (const event of data.events) {
    if (event.tick > tick) break;
    visibleEvents.push(event);
    if (event.device && (event.type === "device.start" || event.type === "device.changeover-start" || event.type === "device.maintenance-start" || event.type === "device.wake-start")) {
      devices[event.device] = { status: "processing", progress: 0 };
      jobs.set(event.device, { durationTicks: event.durationTicks ?? 1, workedTicks: 0, resumedAt: event.tick });
    } else if (event.device && event.type === "device.sleep") {
      sleepingDevices.add(event.device);
      devices[event.device] = { status: "sleeping", progress: 0 };
    } else if (event.device && (event.type === "device.finish" || event.type === "device.changeover-finish" || event.type === "device.maintenance-finish" || event.type === "device.wake-finish" || event.type === "device.recover" || event.type === "buffer.unblocked")) {
      if (event.type === "device.wake-finish") sleepingDevices.delete(event.device);
      devices[event.device] = { status: event.type === "device.recover" && transportJobs.get(event.device)?.size ? "processing" : sleepingDevices.has(event.device) ? "sleeping" : "idle", progress: 0 };
      if (event.type === "device.finish" || event.type === "device.changeover-finish" || event.type === "device.maintenance-finish" || event.type === "device.wake-finish" || event.type === "device.recover") jobs.delete(event.device);
      if (event.type === "device.recover") for (const connection of data.connections) for (const endpoint of connection.endpoints) {
        if (endpoint.device === event.device) endpointPower[`${connection.id}:${endpoint.stage}`] = Boolean(endpoint.powerGrid);
      }
    } else if (event.device && event.type === "buffer.blocked") devices[event.device] = { status: "blocked-output", progress: 0 };
    else if (event.device && event.type === "power.shortage") {
      const job = jobs.get(event.device);
      if (job && event.workedTicks !== undefined) { job.workedTicks = event.workedTicks; delete job.resumedAt; }
      devices[event.device] = { status: "unpowered", progress: job ? job.workedTicks / job.durationTicks : 0 };
    } else if (event.device && event.type === "power.standby-restored") {
      devices[event.device] = { status: sleepingDevices.has(event.device) ? "sleeping" : "idle", progress: 0 };
    } else if (event.device && event.type === "power.restored") {
      const job = jobs.get(event.device);
      if (job) { job.workedTicks = Math.max(job.workedTicks, job.durationTicks - (event.remainingTicks ?? job.durationTicks)); job.resumedAt = event.tick; }
      devices[event.device] = { status: "processing", progress: job ? job.workedTicks / job.durationTicks : 0 };
    } else if (event.device && event.type === "device.breakdown") {
      devices[event.device] = { status: "failed", progress: 0 };
      jobs.delete(event.device);
      for (const connection of data.connections) for (const endpoint of connection.endpoints) {
        if (endpoint.device === event.device) endpointPower[`${connection.id}:${endpoint.stage}`] = false;
      }
    }
    else if (event.type === "transport.power-shortage" && event.connection && event.stage) {
      endpointPower[`${event.connection}:${event.stage}`] = false;
      if (event.device) devices[event.device] = { status: "unpowered", progress: 0 };
    }
    else if (event.type === "transport.power-restored" && event.connection && event.stage) {
      endpointPower[`${event.connection}:${event.stage}`] = true;
      if (event.device) devices[event.device] = { status: transportJobs.get(event.device)?.size ? "processing" : "idle", progress: 0 };
    }
    else if (event.type === "transport.stage-start" && event.device && event.transitId) {
      const active = transportJobs.get(event.device) ?? new Set<string>();
      active.add(event.transitId); transportJobs.set(event.device, active);
      devices[event.device] = { status: "processing", progress: 0 };
    }
    else if (event.type === "transport.stage-finish" && event.device && event.transitId) {
      const active = transportJobs.get(event.device) ?? new Set<string>();
      active.delete(event.transitId); transportJobs.set(event.device, active);
      if (devices[event.device]?.status !== "failed" && devices[event.device]?.status !== "unpowered") {
        devices[event.device] = { status: active.size ? "processing" : "idle", progress: 0 };
      }
    }
    else if (event.type === "resource.depart" && event.transit && event.connection) {
      const connection = data.connections.find((item) => item.id === event.connection)!;
      transits.set(event.transit.id, { id: event.transit.id, material: event.transit.resource, count: event.transit.count, treatmentLevel: event.transit.treatmentLevel, progress: 0, path: event.connection, kind: "belt", position: connection.points[0] });
    } else if (event.type === "resource.belt-position" && event.transit && event.connection && event.cellIndex !== undefined) {
      const transit = transits.get(event.transit.id); const connection = data.connections.find((item) => item.id === event.connection);
      if (transit && connection) { transit.position = connection.points[event.cellIndex + 1]; transit.progress = (event.cellIndex + 1) / (connection.points.length - 1); transit.blocked = false; }
    } else if (event.type === "resource.belt-blocked" && event.transit) {
      const transit = transits.get(event.transit.id); if (transit) transit.blocked = true;
    } else if (event.type === "resource.belt-unblocked" && event.transit) {
      const transit = transits.get(event.transit.id); if (transit) transit.blocked = false;
    } else if (event.type === "resource.unload-start" && event.transit && event.connection) {
      const transit = transits.get(event.transit.id); const connection = data.connections.find((item) => item.id === event.connection);
      if (transit && connection) { transit.position = connection.points.at(-1); transit.progress = 1; transit.blocked = false; }
    } else if (event.type === "resource.arrive" && event.transit) transits.delete(event.transit.id);
    else if (event.type === "logistics.depart" && event.transit && event.route) {
      transits.set(event.transit.id, { id: event.transit.id, material: event.transit.resource, count: event.transit.count, treatmentLevel: event.transit.treatmentLevel, progress: 0, path: event.route, kind: "station" });
    } else if (event.type === "logistics.arrive" && event.transit) transits.delete(event.transit.id);
  }
  for (const device of data.devices) {
    const job = jobs.get(device.id);
    if (!job) continue;
    const activeTicks = devices[device.id]?.status === "processing" && job.resumedAt !== undefined ? Math.max(0, tick - job.resumedAt) : 0;
    devices[device.id]!.progress = Math.min(1, (job.workedTicks + activeTicks) / Math.max(1, job.durationTicks));
  }
  for (const transit of transits.values()) {
    if (transit.kind === "station") {
      const depart = data.events.findLast((event) => event.type === "logistics.depart" && event.transit?.id === transit.id)?.transit;
      if (depart) transit.progress = Math.max(0, Math.min(1, (tick - depart.departTick) / Math.max(1, depart.arriveTick - depart.departTick)));
    }
  }
  return { devices, transits: [...transits.values()], endpointPower, visibleEvents };
}

function pointAlongPath(points: Array<{ x: number; y: number; level?: number }>, progress: number): { x: number; y: number; level: number } {
  if (points.length < 2) return points[0] ? { ...points[0], level: points[0].level ?? 0 } : { x: 0, y: 0, level: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y, ((point.level ?? 0) - (points[index]!.level ?? 0)) * .65));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const ratio = length ? remaining / length : 0;
      return {
        x: THREE.MathUtils.lerp(points[index]!.x, points[index + 1]!.x, ratio),
        y: THREE.MathUtils.lerp(points[index]!.y, points[index + 1]!.y, ratio),
        level: THREE.MathUtils.lerp(points[index]!.level ?? 0, points[index + 1]!.level ?? 0, ratio),
      };
    }
    remaining -= length;
  }
  const last = points.at(-1)!; return { ...last, level: last.level ?? 0 };
}

function FactoryTexture({ projectId, path, color, processing }: { projectId: string; path: string; color: string; processing: boolean }) {
  const texture = useTexture(fileUrl(projectId, path));
  texture.colorSpace = THREE.SRGBColorSpace;
  return <meshStandardMaterial map={texture} color={color} metalness={.32} roughness={.48} emissive={color} emissiveIntensity={processing ? .16 : .02} />;
}

type DeviceMaterialMapName = keyof DeviceMaterialVisual["maps"];

function TexturedDeviceMaterial({ projectId, material, color, processing, entries }: {
  projectId: string;
  material: DeviceMaterialVisual;
  color: string;
  processing: boolean;
  entries: Array<[DeviceMaterialMapName, string]>;
}) {
  const loaded = useTexture(entries.map(([, path]) => fileUrl(projectId, path))) as THREE.Texture[];
  const textures = Object.fromEntries(entries.map(([name], index) => [name, loaded[index]!])) as Partial<Record<DeviceMaterialMapName, THREE.Texture>>;
  for (const [name, texture] of Object.entries(textures) as Array<[DeviceMaterialMapName, THREE.Texture]>) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(material.repeat.x, material.repeat.y);
    texture.colorSpace = name === "baseColor" || name === "emissive" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
  }
  const emissive = processing ? color : material.emissiveColor;
  const emissiveIntensity = processing ? Math.max(.2, material.emissiveIntensity) : material.emissiveIntensity;
  return <meshStandardMaterial
    color={color}
    map={textures.baseColor}
    normalMap={textures.normal}
    normalScale={new THREE.Vector2(material.normalScale, material.normalScale)}
    roughness={material.roughness}
    roughnessMap={textures.roughness}
    metalness={material.metalness}
    metalnessMap={textures.metalness}
    emissive={emissive}
    emissiveMap={textures.emissive}
    emissiveIntensity={emissiveIntensity}
  />;
}

function DeviceSurfaceMaterial({ projectId, material, color, processing }: {
  projectId: string;
  material: DeviceMaterialVisual;
  color: string;
  processing: boolean;
}) {
  const entries = Object.entries(material.maps).filter((entry): entry is [DeviceMaterialMapName, string] => entry[1] !== null);
  if (entries.length) return <TexturedDeviceMaterial projectId={projectId} material={material} color={color} processing={processing} entries={entries} />;
  return <meshStandardMaterial
    color={color}
    metalness={material.metalness}
    roughness={material.roughness}
    emissive={processing ? color : material.emissiveColor}
    emissiveIntensity={processing ? Math.max(.2, material.emissiveIntensity) : material.emissiveIntensity}
  />;
}

function DetailMaterial({ color, processing, dark = false, glass = false }: { color: string; processing: boolean; dark?: boolean; glass?: boolean }) {
  const materialColor = dark ? "#102128" : color;
  return <meshStandardMaterial
    color={materialColor}
    metalness={glass ? .2 : dark ? .68 : .52}
    roughness={glass ? .12 : dark ? .3 : .36}
    emissive={processing ? color : dark ? "#071217" : color}
    emissiveIntensity={processing ? (glass ? .5 : .18) : .025}
    transparent={glass}
    opacity={glass ? .58 : 1}
  />;
}

function FactoryModel({ projectId, path, footprint, height }: { projectId: string; path: string; footprint: Device["footprint"]; height: number }) {
  const gltf = useGLTF(fileUrl(projectId, path));
  const scale = Math.min(footprint.width, footprint.height, height);
  return <Clone object={gltf.scene} scale={scale} castShadow receiveShadow />;
}

function ProcessBayBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .86;
  const depth = device.footprint.height * .86;
  return <group>
    <RoundedBox args={[width, height * .72, depth * .82]} position={[0, -.02, depth * .05]} radius={.1} smoothness={3} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    <RoundedBox args={[width * .68, height * .25, depth * .22]} position={[0, -height * .28, -depth * .48]} radius={.05} smoothness={2} castShadow>
      <DetailMaterial color={color} processing={processing} dark />
    </RoundedBox>
    <mesh position={[0, height * .17, -depth * .42]} castShadow>
      <boxGeometry args={[width * .44, height * .2, .06]} /><DetailMaterial color="#87e8db" processing={processing} glass />
    </mesh>
    {[-.27, .27].map((x) => <mesh key={x} position={[width * x, height * .46, depth * .12]} castShadow>
      <cylinderGeometry args={[width * .075, width * .09, height * .2, 20]} /><DetailMaterial color={color} processing={processing} dark />
    </mesh>)}
  </group>;
}

function ScannerCellBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .88;
  const depth = device.footprint.height * .86;
  return <group>
    {[-.23, .23].map((x, index) => <RoundedBox key={x} args={[width * .48, height * (index ? .7 : .82), depth * .72]} position={[width * x, -.03, depth * (index ? .07 : -.03)]} radius={.09} smoothness={3} castShadow receiveShadow>
      {index === 0
        ? <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
        : <DetailMaterial color={color} processing={processing} dark />}
    </RoundedBox>)}
    <mesh position={[0, height * .12, -depth * .39]} castShadow>
      <boxGeometry args={[width * .26, height * .26, .08]} /><DetailMaterial color="#b594ff" processing={processing} glass />
    </mesh>
    <mesh position={[width * .24, -height * .19, -depth * .39]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[Math.min(width, depth) * .1, .035, 12, 32]} /><DetailMaterial color="#d8fff4" processing={processing} />
    </mesh>
  </group>;
}

function ChamberToolBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .86;
  const depth = device.footprint.height * .86;
  const chamberRadius = Math.min(width, depth) * .17;
  return <group>
    <RoundedBox args={[width * .5, height * .78, depth * .62]} position={[0, 0, depth * .1]} radius={.08} smoothness={3} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    {[-.31, .31].map((x) => <group key={x} position={[width * x, -height * .08, -depth * .13]}>
      <mesh castShadow receiveShadow><cylinderGeometry args={[chamberRadius, chamberRadius * 1.08, height * .46, 32]} /><DetailMaterial color={color} processing={processing} dark /></mesh>
      <mesh position={[0, height * .24, 0]}><cylinderGeometry args={[chamberRadius * .72, chamberRadius, height * .06, 32]} /><DetailMaterial color={color} processing={processing} /></mesh>
    </group>)}
    <mesh position={[0, -height * .28, -depth * .41]} castShadow>
      <boxGeometry args={[width * .42, height * .18, .08]} /><DetailMaterial color="#ffb45f" processing={processing} glass />
    </mesh>
  </group>;
}

function VerticalFurnaceBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .84;
  const depth = device.footprint.height * .84;
  return <group>
    <RoundedBox args={[width, height * .28, depth]} position={[0, -height * .36, 0]} radius={.07} smoothness={3} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    {[-.24, 0, .24].map((x) => <group key={x} position={[width * x, height * .08, 0]}>
      <mesh castShadow receiveShadow><cylinderGeometry args={[width * .13, width * .15, height * .72, 32]} /><DetailMaterial color={color} processing={processing} dark={x !== 0} /></mesh>
      <mesh position={[0, height * .38, 0]}><cylinderGeometry args={[width * .1, width * .13, height * .06, 32]} /><DetailMaterial color="#ffc56e" processing={processing} /></mesh>
    </group>)}
  </group>;
}

function MetrologyCellBody({ projectId, device, height, color, processing, probe = false }: { projectId: string; device: Device; height: number; color: string; processing: boolean; probe?: boolean }) {
  const width = device.footprint.width * .86;
  const depth = device.footprint.height * .86;
  return <group>
    <RoundedBox args={[width, height * .42, depth]} position={[0, -height * .29, 0]} radius={.08} smoothness={3} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    <RoundedBox args={[width * .68, height * .42, depth * .64]} position={[0, height * .12, depth * .04]} radius={.13} smoothness={4} castShadow>
      <DetailMaterial color={probe ? "#72d8cb" : "#8fd7ff"} processing={processing} glass />
    </RoundedBox>
    <mesh position={[0, -height * .04, -depth * .28]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[Math.min(width, depth) * .18, Math.min(width, depth) * .18, .07, 40]} /><DetailMaterial color="#d9fbf5" processing={processing} dark />
    </mesh>
    <mesh position={[0, height * .35, probe ? 0 : depth * .04]} castShadow>
      {probe ? <boxGeometry args={[width * .2, height * .24, depth * .16]} /> : <cylinderGeometry args={[width * .06, width * .1, height * .2, 24]} />}
      <DetailMaterial color={color} processing={processing} dark />
    </mesh>
  </group>;
}

function EquipmentRackBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .86;
  const depth = device.footprint.height * .82;
  return <group>
    <RoundedBox args={[width, height * .94, depth]} radius={.06} smoothness={2} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    {[-.3, -.1, .1, .3].map((y, index) => <mesh key={y} position={[0, height * y, -depth * .51]}>
      <boxGeometry args={[width * .82, height * .11, .035]} /><DetailMaterial color={index % 2 ? "#17333b" : color} processing={processing} dark={index % 2 === 1} />
    </mesh>)}
    {[-.34, .34].map((x) => <mesh key={x} position={[width * x, 0, -depth * .54]}>
      <boxGeometry args={[.035, height * .78, .04]} /><DetailMaterial color="#b7e6e3" processing={processing} />
    </mesh>)}
  </group>;
}

function PackagingCellBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .88;
  const depth = device.footprint.height * .86;
  return <group>
    {[-.27, .27].map((x) => <RoundedBox key={x} args={[width * .42, height * .48, depth * .68]} position={[width * x, -height * .22, 0]} radius={.07} smoothness={3} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>)}
    {[-.42, .42].map((x) => <mesh key={x} position={[width * x, height * .16, 0]} castShadow>
      <boxGeometry args={[.07, height * .64, .07]} /><DetailMaterial color={color} processing={processing} dark />
    </mesh>)}
    <mesh position={[0, height * .46, 0]} castShadow>
      <boxGeometry args={[width * .9, .08, depth * .18]} /><DetailMaterial color={color} processing={processing} dark />
    </mesh>
    <mesh position={[0, height * .11, 0]} castShadow>
      <boxGeometry args={[width * .2, height * .3, depth * .2]} /><DetailMaterial color="#ffd695" processing={processing} glass />
    </mesh>
  </group>;
}

function ServiceBayBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .86;
  const depth = device.footprint.height * .84;
  return <group>
    <RoundedBox args={[width, height * .16, depth]} position={[0, -height * .42, 0]} radius={.04} smoothness={2} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    {[-.42, .42].flatMap((x) => [-.38, .38].map((z) => <mesh key={`${x}-${z}`} position={[width * x, 0, depth * z]} castShadow>
      <boxGeometry args={[.08, height * .78, .08]} /><DetailMaterial color={color} processing={processing} dark />
    </mesh>))}
    <RoundedBox args={[width, height * .12, depth]} position={[0, height * .43, 0]} radius={.05} smoothness={2} castShadow>
      <DetailMaterial color={color} processing={processing} />
    </RoundedBox>
    {[-.22, .22].map((x) => <mesh key={x} position={[width * x, -height * .28, 0]} castShadow>
      <boxGeometry args={[width * .28, height * .2, depth * .42]} /><DetailMaterial color="#293d42" processing={processing} dark />
    </mesh>)}
  </group>;
}

function StorageRackBody({ projectId, device, height, color, processing, bin = false }: { projectId: string; device: Device; height: number; color: string; processing: boolean; bin?: boolean }) {
  const width = device.footprint.width * .82;
  const depth = device.footprint.height * .8;
  if (bin) return <group>
    <RoundedBox args={[width, height * .7, depth]} position={[0, -height * .12, 0]} radius={.05} smoothness={2} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    <mesh position={[0, height * .25, 0]}><boxGeometry args={[width * .78, .04, depth * .72]} /><DetailMaterial color="#071217" processing={processing} dark /></mesh>
  </group>;
  return <group>
    {[-.43, .43].flatMap((x) => [-.42, .42].map((z) => <mesh key={`${x}-${z}`} position={[width * x, 0, depth * z]} castShadow>
      <boxGeometry args={[.06, height * .92, .06]} /><DetailMaterial color={color} processing={processing} dark />
    </mesh>))}
    {[-.42, -.14, .14, .42].map((y) => <mesh key={y} position={[0, height * y, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, .07, depth]} /><DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </mesh>)}
  </group>;
}

function UtilitySkidBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .84;
  const depth = device.footprint.height * .84;
  const radius = Math.min(width, depth) * .2;
  return <group>
    <RoundedBox args={[width, height * .1, depth]} position={[0, -height * .45, 0]} radius={.04} smoothness={2} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    {[-.25, .25].map((x, index) => <group key={x} position={[width * x, -height * .02, index ? depth * .08 : -depth * .08]}>
      <mesh castShadow receiveShadow><cylinderGeometry args={[radius, radius * 1.04, height * (index ? .72 : .82), 32]} /><DetailMaterial color={color} processing={processing} dark={index === 1} /></mesh>
      <mesh position={[0, height * (index ? .38 : .43), 0]}><sphereGeometry args={[radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><DetailMaterial color={color} processing={processing} /></mesh>
    </group>)}
    <mesh position={[0, height * .23, -depth * .38]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[.045, .045, width * .78, 12]} /><DetailMaterial color="#8ed8d2" processing={processing} />
    </mesh>
  </group>;
}

function WindTurbineBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  const width = device.footprint.width * .82;
  const depth = device.footprint.height * .82;
  const bladeLength = Math.min(width, height) * .36;
  return <group>
    <RoundedBox args={[width, height * .08, depth]} position={[0, -height * .46, 0]} radius={.04} smoothness={2} castShadow receiveShadow>
      <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />
    </RoundedBox>
    <mesh position={[0, -height * .05, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[width * .055, width * .13, height * .82, 24]} /><DetailMaterial color={color} processing={processing} />
    </mesh>
    <group position={[0, height * .32, -depth * .04]}>
      {[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle) => <group key={angle} rotation={[0, 0, angle]}>
        <mesh position={[0, bladeLength * .48, 0]} castShadow>
          <boxGeometry args={[width * .07, bladeLength, .055]} /><DetailMaterial color="#d9f3f5" processing={processing} />
        </mesh>
      </group>)}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[width * .09, width * .12, depth * .12, 24]} /><DetailMaterial color={color} processing={processing} dark />
      </mesh>
    </group>
  </group>;
}

function DeviceBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  if (device.visual.model) return <FactoryModel projectId={projectId} path={device.visual.model} footprint={device.footprint} height={height} />;
  const props = { projectId, device, height, color, processing };
  if (device.visual.shape === "process-bay") return <ProcessBayBody {...props} />;
  if (device.visual.shape === "scanner-cell") return <ScannerCellBody {...props} />;
  if (device.visual.shape === "chamber-tool") return <ChamberToolBody {...props} />;
  if (device.visual.shape === "vertical-furnace") return <VerticalFurnaceBody {...props} />;
  if (device.visual.shape === "metrology-cell") return <MetrologyCellBody {...props} />;
  if (device.visual.shape === "probe-cell") return <MetrologyCellBody {...props} probe />;
  if (device.visual.shape === "equipment-rack") return <EquipmentRackBody {...props} />;
  if (device.visual.shape === "packaging-cell") return <PackagingCellBody {...props} />;
  if (device.visual.shape === "service-bay") return <ServiceBayBody {...props} />;
  if (device.visual.shape === "storage-rack") return <StorageRackBody {...props} />;
  if (device.visual.shape === "utility-skid") return <UtilitySkidBody {...props} />;
  if (device.visual.shape === "wind-turbine") return <WindTurbineBody {...props} />;
  if (device.visual.shape === "bin") return <StorageRackBody {...props} bin />;
  const material = <DeviceSurfaceMaterial projectId={projectId} material={device.visual.material} color={color} processing={processing} />;
  if (device.visual.shape === "cylinder") return <mesh castShadow receiveShadow><cylinderGeometry args={[device.footprint.width * .42, device.footprint.width * .48, height, 32]} />{material}</mesh>;
  if (device.visual.shape === "sphere") return <mesh castShadow receiveShadow><sphereGeometry args={[Math.min(device.footprint.width, device.footprint.height, height) * .48, 32, 24]} />{material}</mesh>;
  if (device.visual.shape === "plane") return <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow><boxGeometry args={[device.footprint.width * .88, device.footprint.height * .88, .12]} />{material}</mesh>;
  return <RoundedBox args={[device.footprint.width * .88, height, device.footprint.height * .88]} radius={.12} smoothness={4} castShadow receiveShadow>{material}</RoundedBox>;
}

function FactoryDevice({ projectId, device, frame, bottleneck, selected, labelDensity, onSelect }: {
  projectId: string; device: Device; frame: DeviceFrame; bottleneck: boolean; selected: boolean; labelDensity: FactoryLabelDensity; onSelect: () => void;
}) {
  const height = device.transportEndpoint ? .34 : device.visual.height ?? 1.25;
  const baseColor = device.visual.material.baseColor;
  const color = frame.status === "idle" ? baseColor : STATUS_COLORS[frame.status];
  const showTelemetry = selected || bottleneck || frame.status !== "idle";
  const showIdentity = labelDensity === "all" || showTelemetry;
  const position: [number, number, number] = [device.position.x + device.footprint.width / 2, height / 2, device.position.y + device.footprint.height / 2];
  return <group
    position={position}
    rotation={[0, -device.rotation * Math.PI / 180, 0]}
    onClick={(event) => { event.stopPropagation(); onSelect(); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
    onPointerOut={() => { document.body.style.cursor = "default"; }}
  >
    {bottleneck && <mesh position={[0, .03 - height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[Math.max(device.footprint.width, device.footprint.height) * .7, Math.max(device.footprint.width, device.footprint.height) * .88, 48]} /><meshBasicMaterial color="#ffcf5c" transparent opacity={.8} /></mesh>}
    {selected && <mesh position={[0, .025 - height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[Math.max(device.footprint.width, device.footprint.height) * .58, Math.max(device.footprint.width, device.footprint.height) * .98, 64]} /><meshBasicMaterial color="#55f2c5" transparent opacity={.95} depthTest={false} /></mesh>}
    {device.transportEndpoint
      ? <><mesh castShadow><cylinderGeometry args={[.18, .24, .18, 16]} /><meshStandardMaterial color={color} metalness={.7} roughness={.25} emissive={frame.status === "unpowered" ? "#761424" : "#102a31"} /></mesh><mesh position={[0, .13, 0]}><boxGeometry args={[.48, .12, .18]} /><meshStandardMaterial color={color} metalness={.72} roughness={.22} /></mesh></>
      : <DeviceBody projectId={projectId} device={device} height={height} color={color} processing={frame.status === "processing"} />}
    {!device.transportEndpoint && <mesh position={[device.footprint.width * .31, height / 2 + .09, -device.footprint.height * .31]}>
      <sphereGeometry args={[.065, 16, 12]} />
      <meshStandardMaterial color={STATUS_COLORS[frame.status]} emissive={STATUS_COLORS[frame.status]} emissiveIntensity={frame.status === "idle" ? .45 : 1.4} roughness={.2} />
    </mesh>}
    <mesh position={[0, height / 2 + .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[device.footprint.width * .65 * frame.progress, .08]} /><meshBasicMaterial color="#d8fff4" /></mesh>
    {showIdentity && (!device.transportEndpoint || selected) && <Billboard position={[0, height / 2 + .42, 0]}>
      <Text fontSize={device.transportEndpoint ? .14 : .21} color={selected ? "#cffff2" : "#d7e7e9"} anchorY="bottom" outlineWidth={.012} outlineColor="#071117" maxWidth={Math.max(2.2, device.footprint.width * 1.5)} textAlign="center">{device.visual.label ?? device.name}</Text>
      {showTelemetry && <Text position={[0, -.2, 0]} fontSize={.105} color={STATUS_COLORS[frame.status]}>{device.transportEndpoint ? `${device.transportEndpoint.stage.toUpperCase()} · ${STATUS_LABELS[frame.status]}` : STATUS_LABELS[frame.status]}</Text>}
      {showTelemetry && device.recipe && <Text position={[0, -.36, 0]} fontSize={.082} color="#9dd9d0">{(device.recipes?.length ?? 0) > 1 ? `${device.recipes!.length} QUALIFIED OPS` : `${device.recipe.process} / ${device.recipe.mode}`}</Text>}
      {selected && Object.values(device.resourceContracts).flat().length > 0 && <Text position={[0, device.recipe ? -.5 : -.36, 0]} fontSize={.075} color="#72b9d0">{[...new Set(Object.values(device.resourceContracts).flat())].join(" + ")}</Text>}
    </Billboard>}
  </group>;
}

function ResourceDeposit({ data, node, remaining }: { data: StudioData; node: StudioData["resourceNodes"][number]; remaining: number }) {
  const fraction = remaining / node.amount;
  const color = data.resources[node.resource]?.visual?.color ?? "#a8784f";
  const scale = .18 + .48 * Math.cbrt(Math.max(0, fraction));
  return <group position={[node.position.x + .5, scale * .55, node.position.y + .5]}>
    <mesh scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={remaining ? .08 : 0} roughness={.72} metalness={.34} transparent opacity={remaining ? .95 : .18} />
    </mesh>
    <Billboard position={[0, scale + .25, 0]}><Text fontSize={.15} color={remaining ? "#d9edf0" : "#6d7d80"}>{node.id} · {remaining}/{node.amount}</Text></Billboard>
  </group>;
}

function FactoryCameraControls({ presentation }: { presentation: FactoryPresentationPolicy }) {
  const { camera, size } = useThree();
  const verticalFov = THREE.MathUtils.degToRad(46);
  const aspect = Math.max(.55, size.width / Math.max(1, size.height));
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const widthDistance = presentation.span.width * .58 / Math.tan(horizontalFov / 2);
  const depthDistance = (presentation.span.height * .65 + 3) * .58 / Math.tan(verticalFov / 2);
  const distance = Math.max(presentation.minimumDistance, widthDistance, depthDistance);
  const target = useMemo(
    () => new THREE.Vector3(presentation.target.x, presentation.target.y, presentation.target.z),
    [presentation.target.x, presentation.target.y, presentation.target.z],
  );

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const direction = new THREE.Vector3(0, .58, .82).normalize();
    perspectiveCamera.fov = 46;
    perspectiveCamera.near = .1;
    perspectiveCamera.far = Math.max(200, distance * 4);
    perspectiveCamera.position.copy(target).addScaledVector(direction, distance);
    perspectiveCamera.lookAt(target);
    perspectiveCamera.updateProjectionMatrix();
  }, [camera, distance, target]);

  return <OrbitControls
    makeDefault
    target={target}
    minDistance={Math.max(8, distance * .38)}
    maxDistance={Math.max(80, distance * 1.8)}
    maxPolarAngle={Math.PI * .47}
  />;
}

function FactoryBackdrop({ data }: { data: StudioData }) {
  const backdrop = data.environment?.backdrop;
  if (!backdrop) return null;
  return <FactoryBackdropImage data={data} backdrop={backdrop} />;
}

function FactoryBackdropImage({ data, backdrop }: {
  data: StudioData;
  backdrop: NonNullable<NonNullable<StudioData["environment"]>["backdrop"]>;
}) {
  const texture = useTexture(fileUrl(data.projectId, backdrop.image));
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 2.5;
  const width = Math.max(data.bounds.width + 8, backdrop.height * aspect);
  return <mesh
    position={[data.bounds.width / 2, backdrop.height / 2 - .02, -backdrop.distance]}
    renderOrder={-2}
  >
    <planeGeometry args={[width, backdrop.height]} />
    <meshBasicMaterial map={texture} transparent opacity={backdrop.opacity} toneMapped={false} />
  </mesh>;
}

type EnvironmentFloor = NonNullable<NonNullable<StudioData["environment"]>["floor"]>;

function EnvironmentFloorMaterial({ data, floor, width, depth }: {
  data: StudioData;
  floor: EnvironmentFloor;
  width: number;
  depth: number;
}) {
  const [baseColorSource, normalSource, roughnessSource] = useTexture([
    fileUrl(data.projectId, floor.material.maps.baseColor),
    fileUrl(data.projectId, floor.material.maps.normal),
    fileUrl(data.projectId, floor.material.maps.roughness),
  ]) as THREE.Texture[];
  const textures = useMemo(
    () => [baseColorSource!, normalSource!, roughnessSource!].map((texture) => texture.clone()),
    [baseColorSource, normalSource, roughnessSource],
  );
  useEffect(() => {
    for (const texture of textures) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(width / floor.material.tileSize, depth / floor.material.tileSize);
      texture.needsUpdate = true;
    }
    textures[0]!.colorSpace = THREE.SRGBColorSpace;
    textures[1]!.colorSpace = THREE.NoColorSpace;
    textures[2]!.colorSpace = THREE.NoColorSpace;
    return () => textures.forEach((texture) => texture.dispose());
  }, [depth, floor.material.tileSize, textures, width]);
  return <meshStandardMaterial
    color={floor.baseColor}
    map={textures[0]}
    normalMap={textures[1]}
    normalScale={new THREE.Vector2(floor.material.normalScale, floor.material.normalScale)}
    roughnessMap={textures[2]}
    metalness={floor.material.metalness}
    roughness={floor.material.roughness}
  />;
}

function FactoryEnvironment({ data }: { data: StudioData }) {
  const floor = data.environment?.floor;
  if (!floor) return <FactoryBackdrop data={data} />;
  const margin = floor.slabMargin;
  const slabWidth = data.bounds.width + margin * 2;
  const slabDepth = data.bounds.height + margin * 2;
  const centerX = data.bounds.width / 2;
  const centerZ = data.bounds.height / 2;
  const rearZ = -margin + .15;
  const columns = Math.max(3, Math.ceil(slabWidth / 8));
  return <group>
    <mesh position={[centerX, -.12, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[slabWidth, slabDepth]} />
      <EnvironmentFloorMaterial data={data} floor={floor} width={slabWidth} depth={slabDepth} />
    </mesh>
    <mesh position={[centerX, -.045, -margin / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[data.bounds.width + margin * 1.35, Math.max(1.6, margin)]} />
      <meshStandardMaterial color={floor.aisleColor} roughness={.72} metalness={.12} />
    </mesh>
    <mesh position={[centerX, .13, rearZ]} receiveShadow castShadow>
      <boxGeometry args={[slabWidth, .34, .32]} />
      <meshStandardMaterial color="#183139" roughness={.48} metalness={.5} />
    </mesh>
    <mesh position={[-margin + .15, .13, centerZ]} receiveShadow castShadow>
      <boxGeometry args={[.32, .34, slabDepth]} />
      <meshStandardMaterial color="#183139" roughness={.48} metalness={.5} />
    </mesh>
    <mesh position={[data.bounds.width + margin - .15, .13, centerZ]} receiveShadow castShadow>
      <boxGeometry args={[.32, .34, slabDepth]} />
      <meshStandardMaterial color="#183139" roughness={.48} metalness={.5} />
    </mesh>
    {Array.from({ length: columns }, (_, index) => {
      const x = -margin + (slabWidth * index) / (columns - 1);
      return <group key={index} position={[x, 0, rearZ]}>
        <mesh position={[0, 2.35, 0]} castShadow receiveShadow>
          <boxGeometry args={[.38, 4.7, .38]} />
          <meshStandardMaterial color="#183943" roughness={.42} metalness={.62} />
        </mesh>
        <mesh position={[0, 4.15, .22]}>
          <boxGeometry args={[.56, .08, .10]} />
          <meshStandardMaterial color="#8ef1e0" emissive="#3fb8aa" emissiveIntensity={1.4} roughness={.3} />
        </mesh>
      </group>;
    })}
    <Line points={[[-margin + .5, .015, -margin / 2], [data.bounds.width + margin - .5, .015, -margin / 2]]} color={floor.edgeColor} lineWidth={2} transparent opacity={.72} />
    <FactoryBackdrop data={data} />
  </group>;
}

function FactoryWorld({ data, tick, selection, presentationRequest, onPresentationMode, onSelection }: {
  data: StudioData;
  tick: number;
  selection: StudioSelection | null;
  presentationRequest: FactoryPresentationRequest;
  onPresentationMode: (mode: FactoryPresentationPolicy["mode"]) => void;
  onSelection: (selection: StudioSelection) => void;
}) {
  const { size } = useThree();
  const presentation = useMemo(
    () => factoryPresentation(data, presentationRequest, selection, { width: size.width, height: size.height }),
    [data, presentationRequest, selection, size.height, size.width],
  );
  useEffect(() => onPresentationMode(presentation.mode), [onPresentationMode, presentation.mode]);
  const frame = useMemo(() => buildFrame(data, tick), [data, tick]);
  const nodeRemaining = useMemo(() => {
    const remaining = Object.fromEntries(data.resourceNodes.map((node) => [node.id, node.amount]));
    for (const event of data.events) if (event.tick <= tick && event.type === "resource.extracted" && event.node && event.count) remaining[event.node] = Math.max(0, remaining[event.node]! - event.count);
    return remaining;
  }, [data, tick]);
  return <>
    <color attach="background" args={["#071014"]} />
    <fog attach="fog" args={["#071014", 42, 92]} />
    <ambientLight intensity={.34} />
    <hemisphereLight args={["#c8f4ff", "#102026", 1.28]} />
    <directionalLight position={[12, 24, 8]} intensity={2.45} castShadow shadow-mapSize={[2048, 2048]} />
    <directionalLight position={[-14, 14, -10]} intensity={.72} color="#73d8d1" />
    <FactoryEnvironment data={data} />
    {data.regions.map((region) => <group key={region.id}>
      <mesh position={[region.offset.x + region.bounds.width / 2, -.055, region.offset.y + region.bounds.height / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[region.bounds.width, region.bounds.height]} />
        {data.environment?.floor
          ? <EnvironmentFloorMaterial data={data} floor={data.environment.floor} width={region.bounds.width} depth={region.bounds.height} />
          : <meshStandardMaterial color="#0b191d" roughness={.78} metalness={.16} />}
      </mesh>
      <Grid args={[region.bounds.width, region.bounds.height]} position={[region.offset.x + region.bounds.width / 2, 0, region.offset.y + region.bounds.height / 2]} cellSize={1} cellThickness={.32} cellColor={data.environment?.floor?.gridColor ?? "#173038"} sectionSize={4} sectionThickness={.95} sectionColor={data.environment?.floor?.sectionColor ?? "#32717a"} fadeDistance={82} infiniteGrid={false} />
      <Line points={[
        [region.offset.x, .025, region.offset.y],
        [region.offset.x + region.bounds.width, .025, region.offset.y],
        [region.offset.x + region.bounds.width, .025, region.offset.y + region.bounds.height],
        [region.offset.x, .025, region.offset.y + region.bounds.height],
        [region.offset.x, .025, region.offset.y],
      ]} color={data.environment?.floor?.edgeColor ?? "#48b8ad"} lineWidth={2} transparent opacity={.55} />
      <Billboard position={[region.offset.x + 1, .75, region.offset.y + 1]}><Text fontSize={.38} color="#9edce7" anchorX="left" anchorY="bottom" outlineWidth={.02} outlineColor="#071014">{region.name.toUpperCase()}</Text><Text position={[0, -.28, 0]} fontSize={.14} color="#5f8992" anchorX="left">{region.kind.toUpperCase()} · {region.id}</Text></Billboard>
    </group>)}
    {data.resourceNodes.map((node) => <ResourceDeposit key={node.id} data={data} node={node} remaining={nodeRemaining[node.id] ?? node.amount} />)}
    {data.connections.map((connection) => {
      const selected = selection?.kind === "connection" && selection.id === connection.id;
      const choose = () => onSelection({ kind: "connection", id: connection.id });
      const beltPoints = connection.points.slice(1, -1);
      return <group key={connection.id}>
        {beltPoints.length > 1 && <Line
          points={beltPoints.map((point) => [point.x, .16 + point.level * .65, point.y])}
          color={selected ? "#5ff2c8" : beltPoints.some((point) => point.level > 0) ? "#65a8b7" : "#4f7680"}
          lineWidth={selected ? 7 : 3}
          transparent
          opacity={selected ? 1 : .9}
          onClick={(event) => { event.stopPropagation(); choose(); }}
        />}
        {beltPoints.map((point, index) => <mesh
          key={index}
          position={[point.x, .16 + point.level * .65, point.y]}
          onClick={(event) => { event.stopPropagation(); choose(); }}
          onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { document.body.style.cursor = "default"; }}
        >
          <boxGeometry args={[.78, .10, .78]} />
          <meshStandardMaterial color={selected ? "#48c7ad" : point.level > 0 ? "#376b78" : "#27464f"} metalness={.7} roughness={.35} emissive={selected ? "#163f39" : "#091519"} />
        </mesh>)}
      </group>;
    })}
    {data.connections.flatMap((connection) => connection.endpoints.map((endpoint) => { const powered = frame.endpointPower[`${connection.id}:${endpoint.stage}`]; return <group key={`${connection.id}-${endpoint.stage}`}>
      <Line points={[[endpoint.from.x, .28 + endpoint.from.level * .65, endpoint.from.y], [endpoint.to.x, .28 + endpoint.to.level * .65, endpoint.to.y]]} color={powered ? endpoint.stage === "loader" ? "#f5b84b" : "#5dd7ff" : "#ff5d68"} lineWidth={2.5} />
      <mesh position={[endpoint.position.x, .3, endpoint.position.y]} rotation={[0, Math.atan2(endpoint.to.x - endpoint.from.x, endpoint.to.y - endpoint.from.y), 0]} castShadow>
        <boxGeometry args={[.16, .16, .48]} /><meshStandardMaterial color={powered ? endpoint.stage === "loader" ? "#f5b84b" : "#5dd7ff" : "#ff5d68"} metalness={.65} roughness={.28} emissiveIntensity={powered ? .35 : 1} emissive={powered ? endpoint.stage === "loader" ? "#7d4a08" : "#0d607b" : "#8b1420"} />
      </mesh>
    </group>; }))}
    {data.logisticsRoutes.map((route) => <Line key={route.id} points={[[route.from.x, .32, route.from.y], [route.to.x, .32, route.to.y]]} color="#55c9df" lineWidth={1.5} dashed dashScale={2.4} dashSize={.45} gapSize={.28} transparent opacity={.7} />)}
    {data.devices.map((device) => <FactoryDevice
      key={device.id}
      projectId={data.projectId}
      device={device}
      frame={frame.devices[device.id] ?? { status: "idle", progress: 0 }}
      bottleneck={data.metrics?.bottleneckEntity === device.id}
      selected={selection?.kind === "device" && selection.id === device.id}
      labelDensity={presentation.labelDensity}
      onSelect={() => onSelection({ kind: "device", id: device.id })}
    />)}
    {frame.transits.map((transit) => {
      const connection = [...data.connections, ...data.logisticsRoutes].find((item) => item.id === transit.path)!;
      const position = transit.position ?? ("points" in connection ? pointAlongPath(connection.points, transit.progress) : pointAlongPath([connection.from, connection.to], transit.progress));
      const x = position.x;
      const z = position.y;
      const resource = data.resources[transit.material];
      const color = resource?.visual?.color ?? "#d7f3ff";
      const layers = transit.kind === "belt" ? Math.min(4, transit.count) : 1;
      return <group key={transit.id} position={[x, (transit.blocked ? .46 : .36) + (position.level ?? 0) * .65, z]}>
        {Array.from({ length: layers }, (_, index) => <mesh key={index} position={[0, index * .17, 0]} castShadow>
          {resource?.visual?.shape === "box" ? <boxGeometry args={[.25, .14, .25]} /> : resource?.visual?.shape === "cylinder" ? <cylinderGeometry args={[.14, .14, .14, 16]} /> : <sphereGeometry args={[.13, 16, 16]} />}
          {resource?.visual?.texture ? <FactoryTexture projectId={data.projectId} path={resource.visual.texture} color={color} processing /> : <meshStandardMaterial color={color} emissive={transit.blocked ? "#ff7b49" : transit.treatmentLevel ? "#2de2c5" : color} emissiveIntensity={transit.blocked ? 1.2 : transit.treatmentLevel ? .95 : .55} />}
        </mesh>)}
        {(transit.count > 1 || transit.treatmentLevel > 0) && <Html position={[0, layers * .17 + .12, 0]} center distanceFactor={12}><span className="cargo-stack-count">{transit.count > 1 ? `×${transit.count}` : ""}{transit.treatmentLevel > 0 ? ` @${transit.treatmentLevel}` : ""}</span></Html>}
      </group>;
    })}
    <FactoryCameraControls presentation={presentation} />
  </>;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function InspectorHeader({ kind, id, title, subtitle, onClose }: { kind: string; id: string; title: string; subtitle: string; onClose: () => void }) {
  return <header className="scene-inspector-header">
    <div><span>{kind}</span><h2>{title}</h2><code>{id}</code><p>{subtitle}</p></div>
    <button aria-label="Close inspector" onClick={onClose}>×</button>
  </header>;
}

function InspectorFlow({ label, amounts }: { label: string; amounts: Array<{ resource: string; buffer: string; count: number; minimumTreatmentLevel?: number; treatmentLevel?: number }> }) {
  return <div className="inspector-flow"><label>{label}</label>{amounts.length ? amounts.map((amount) => <div key={`${amount.buffer}-${amount.resource}`}><b>{amount.count}× {amount.resource}{amount.minimumTreatmentLevel ? `@${amount.minimumTreatmentLevel}+` : amount.treatmentLevel ? `@${amount.treatmentLevel}` : ""}</b><code>{amount.buffer}</code></div>) : <small>NONE</small>}</div>;
}

function DeviceInspector({ data, frame, device, onClose, onSelection }: {
  data: StudioData; frame: FactoryFrame; device: Device; onClose: () => void; onSelection: (selection: StudioSelection) => void;
}) {
  const runtime = frame.devices[device.id] ?? { status: "idle" as Status, progress: 0 };
  const asset = data.assets.devices.find((item) => item.id === device.assetId);
  const production = data.analysis.devices.find((item) => item.device === device.id);
  const configuredRecipes = device.recipes ?? (device.recipe ? [device.recipe] : []);
  const extraction = data.analysis.extractionDevices.find((item) => item.device === device.id);
  const treatment = data.analysis.treatmentDevices.find((item) => item.device === device.id);
  const generation = data.analysis.generationDevices.find((item) => item.device === device.id);
  const storage = data.analysis.storageDevices.find((item) => item.device === device.id);
  const buffers = data.analysis.bufferContracts.find((item) => item.device === device.id)?.buffers ?? [];
  const ports = data.analysis.portContracts.find((item) => item.device === device.id)?.ports ?? [];
  const grid = data.analysis.powerGrids.find((item) => item.members.includes(device.id) || item.distributors.includes(device.id));
  const links = connectedSceneObjects(data, device.id).map((selection) => data.connections.find((connection) => connection.id === selection.id)!);
  const diagnostics = data.analysis.diagnostics.filter((diagnostic) => diagnostic.device === device.id);
  const idlePowerMilliWatts = production?.idlePowerMilliWatts ?? extraction?.idlePowerMilliWatts ?? treatment?.idlePowerMilliWatts ?? asset?.power.idleMilliWatts ?? 0;
  const powerMilliWatts = device.recipe?.powerMilliWatts ?? extraction?.powerMilliWatts ?? asset?.power.activeMilliWatts ?? 0;
  const utilization = data.metrics?.machineUtilization[device.id];
  const setup = data.metrics?.equipmentSetups.devices[device.id];
  const batchFormation = data.metrics?.batchFlow.formationDevices[device.id];
  const cadenceControl = data.metrics?.cadenceControl.devices[device.id];
  const tooling = data.metrics?.productionTooling.devices[device.id];
  const toolingProvider = data.metrics?.productionTooling.providers[device.id];
  const utilities = data.metrics?.productionUtilities.devices[device.id];
  const utilityProvider = data.metrics?.productionUtilities.providers[device.id];
  const maintenance = data.metrics?.equipmentMaintenance.devices[device.id];
  const energyManagement = data.metrics?.equipmentEnergyManagement.devices[device.id];
  const maintenanceProvider = data.metrics?.equipmentMaintenance.providers[device.id];
  const qualityControl = data.metrics?.qualityFlow.qualityControl.devices[device.id];
  const activeDrift = device.maintenance?.drift?.filter((stage) => (maintenance?.jobsSinceMaintenance ?? 0) >= stage.afterJobs).at(-1);
  const statusTimes = data.metrics ? [
    ["IDLE", data.metrics.idleTime[device.id] ?? 0],
    ["SLEEP", data.metrics.sleepingTime[device.id] ?? 0],
    ["WAIT", data.metrics.waitingInputTime[device.id] ?? 0],
    ["BLOCKED", data.metrics.blockedOutputTime[device.id] ?? 0],
    ["NO POWER", data.metrics.unpoweredTime[device.id] ?? 0],
    ["FAILED", data.metrics.failedTime[device.id] ?? 0],
  ] as const : [];
  return <section className="scene-inspector" aria-label={`Device inspector: ${device.id}`} data-testid={`device-inspector-${device.id}`}>
    <InspectorHeader kind="DEVICE INSTANCE" id={device.id} title={device.name} subtitle={`${device.assetId} · ${device.region}`} onClose={onClose} />
    <div className="scene-inspector-scroll">
      <div className="inspector-status-row">
        <span className={`inspector-status ${runtime.status}`}><i style={{ background: STATUS_COLORS[runtime.status] }} />{STATUS_LABELS[runtime.status]}</span>
        <span><b>{(runtime.progress * 100).toFixed(0)}%</b><small>JOB PROGRESS</small></span>
        <span><b>{utilization === undefined ? "—" : `${(utilization * 100).toFixed(1)}%`}</b><small>RUN UTILIZATION</small></span>
      </div>
      {statusTimes.length > 0 && <div className="inspector-facts">{statusTimes.map(([label, ticks]) => <span key={label}><small>{label}</small><b>{formatTick(ticks)}</b></span>)}</div>}
      <div className="inspector-facts">
        <span><small>POSITION</small><b>{device.position.x.toFixed(0)}, {device.position.y.toFixed(0)} · {device.rotation}°</b></span>
        <span><small>FOOTPRINT</small><b>{device.footprint.width} × {device.footprint.height}</b></span>
        <span><small>BUILD COST</small><b>{asset?.economics.buildCost.toLocaleString() ?? "—"}</b></span>
        <span><small>POWER PRIORITY</small><b>P{device.powerPriority}</b></span>
        {configuredRecipes.length > 0 && <span><small>OPERATION / LOT DISPATCH</small><b>{device.recipeDispatch} / {device.lotDispatch}</b></span>}
        <span><small>IDLE → ACTIVE POWER</small><b>{(idlePowerMilliWatts / 1000).toFixed(1)} → {(powerMilliWatts / 1000).toFixed(1)} W</b></span>
        {asset?.power.sleep && <span><small>SLEEP → WAKE</small><b>{(asset.power.sleep.idleMilliWatts / 1000).toFixed(1)} W → {formatTick(asset.power.sleep.wakeDurationTicks)} @ {(asset.power.sleep.wakePowerMilliWatts / 1000).toFixed(1)} W</b></span>}
        {device.idleEnergy && <span><small>SLEEP POLICY</small><b>AFTER {formatTick(device.idleEnergy.sleepAfterTicks)} IDLE</b></span>}
        {energyManagement && <span><small>SLEEPS / WAKES</small><b>{energyManagement.sleeps} / {energyManagement.wakeups} · {energyManagement.mode.toUpperCase()}</b></span>}
        {setup && <span><small>FINAL SETUP</small><b>{setup.group ?? "UNCONFIGURED"}</b></span>}
        {setup && <span><small>CHANGEOVERS</small><b>{setup.changeovers} · {formatTick(setup.setupTicks)}</b></span>}
        {device.changeoverTransitions && <span><small>CHANGEOVER MATRIX</small><b>{device.changeoverTransitions.map((transition) =>
          `${transition.from ?? "UNCONFIGURED"}→${transition.to} ${formatTick(transition.durationTicks)} @ ${(transition.powerMilliWatts / 1000).toFixed(0)} W`).join(" · ")}</b></span>}
        {device.setupCampaign && <span><small>SETUP CAMPAIGN</small><b>{device.setupCampaign.minimumReadyLots} LOTS · {formatTick(device.setupCampaign.maximumHoldTicks)} MAX</b></span>}
        {setup && <span><small>CAMPAIGN HOLDS</small><b>{setup.campaignHolds} · {formatTick(setup.campaignHoldTicks)}</b></span>}
        {device.batchFormation && <span><small>PREFERRED BATCH</small><b>{device.batchFormation.preferredProcess} · {formatTick(device.batchFormation.maximumWaitTicks)} MAX WAIT</b></span>}
        {batchFormation && <span><small>BATCH HOLDS</small><b>{batchFormation.holds} · {formatTick(batchFormation.holdTicks)} · {batchFormation.preferredReleases} FULL / {batchFormation.timeoutReleases} TIMEOUT</b></span>}
        {device.cadenceControl && <span><small>CADENCE CONTROL</small><b>{device.cadenceControl.normalMode.toUpperCase()} → {device.cadenceControl.recoveryMode.toUpperCase()} AFTER {(device.cadenceControl.minimumStarvationTicks / 1000).toFixed(1)}S BELOW {device.cadenceControl.recoverBelowItems} · {device.cadenceControl.downstreamConnection}</b></span>}
        {cadenceControl && <span><small>CADENCE MODE JOBS</small><b>{cadenceControl.normalJobs} {cadenceControl.normalMode.toUpperCase()} / {cadenceControl.recoveryJobs} {cadenceControl.recoveryMode.toUpperCase()} · {cadenceControl.recoveryActivations} ACTIVATIONS</b></span>}
        {cadenceControl && <span><small>STARVATION OBSERVED</small><b>{cadenceControl.starvationEpisodes} EPISODES / {(cadenceControl.starvationTicks / 1000).toFixed(1)}S</b></span>}
        {tooling && <span><small>TOOLING ALLOCATIONS</small><b>{tooling.allocations} · {tooling.completed} COMPLETE / {tooling.cancelled} CANCEL</b></span>}
        {tooling && <span><small>TOOLING OCCUPANCY</small><b>{formatTick(tooling.occupiedTicks)} EQUIPMENT · {formatTick(tooling.unitTicks)} UNIT-TIME</b></span>}
        {tooling && <span><small>TOOLING WAIT</small><b>{formatTick(tooling.inputWaitTicks)} · {tooling.inputBlocks} BLOCKS{tooling.wait ? ` · ${tooling.wait.process}` : ""}</b></span>}
        {tooling?.hold && <span><small>TRAPPED TOOLING</small><b>{tooling.hold.amounts.map((amount) => `${amount.count} ${amount.resource}`).join(" + ")} · {tooling.hold.provider}</b></span>}
        {device.toolingProvider && <span><small>TOOLING SERVICE</small><b>{device.toolingProvider.serviceRadius} RANGE · {device.toolingProvider.stock.map((tool) => `${tool.count} ${tool.resource}`).join(" + ")} · INVENTORY {device.toolingProvider.inventoryBuffer}</b></span>}
        {toolingProvider && <span><small>TOOLING RESERVATIONS</small><b>{Object.entries(toolingProvider.reserved).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "NONE"} · {toolingProvider.allocations} ALLOCATIONS</b></span>}
        {utilities && <span><small>UTILITY ALLOCATIONS</small><b>{utilities.allocations} · {utilities.completed} COMPLETE / {utilities.cancelled} CANCEL / {utilities.providerInterruptions} TRIPS</b></span>}
        {utilities && <span><small>UTILITY WAIT</small><b>{formatTick(utilities.inputWaitTicks)} · {utilities.inputBlocks} BLOCKS</b></span>}
        {device.utilityProvider && <span><small>FACILITY UTILITIES</small><b>{device.utilityProvider.capacities.map((capacity) => `${capacity.units} ${capacity.utility}`).join(" + ")} · {device.utilityProvider.serviceRadius} RANGE</b></span>}
        {utilityProvider && <span><small>UTILITY RESERVATIONS</small><b>{Object.entries(utilityProvider.reserved).map(([utility, units]) => `${units}/${utilityProvider.capacity[utility]} ${utility}`).join(" + ") || "NONE"}</b></span>}
        {utilityProvider && <span><small>UTILITY RELIABILITY</small><b>{utilityProvider.interruptedJobs} INTERLOCKED JOBS · {utilityProvider.cancelled} CANCELLED ALLOCATIONS</b></span>}
        {device.maintenance && <span><small>MAINTENANCE LIMIT</small><b>{device.maintenance.maximumJobs} JOBS / {formatTick(device.maintenance.maximumQualificationTicks)} AGE · {formatTick(device.maintenance.durationTicks)}</b></span>}
        {device.maintenance && <span><small>SERVICE CONTRACT</small><b>{device.maintenance.service.crews}× {device.maintenance.service.skill.toUpperCase()} · {device.maintenance.service.inputs.map((input) => `${input.count} ${input.resource}`).join(" + ") || "NO CONSUMABLE"}</b></span>}
        {device.maintenance && <span><small>SERVICE PROVIDERS</small><b>{device.maintenanceProviders.map((provider) => `${provider.device} @ ${provider.distance.toFixed(1)}`).join(" · ") || "UNCOVERED"}</b></span>}
        {device.maintenance && <span><small>QUALIFICATION CONTRACT</small><b>{formatTick(device.maintenance.qualification.durationTicks)} · {device.maintenance.qualification.service.crews}× {device.maintenance.qualification.service.skill.toUpperCase()} · {device.maintenance.qualification.service.inputs.map((input) => `${input.count} ${input.resource}`).join(" + ") || "NO CONSUMABLE"}</b></span>}
        {device.maintenance && <span><small>QUALIFICATION PROVIDERS</small><b>{device.qualificationProviders.map((provider) => `${provider.device} @ ${provider.distance.toFixed(1)}`).join(" · ") || "UNCOVERED"}</b></span>}
        {device.preventiveMaintenance?.opportunistic && <span><small>OPPORTUNISTIC WINDOW</small><b>{device.preventiveMaintenance.opportunistic.afterJobs !== undefined ? `AFTER ${device.preventiveMaintenance.opportunistic.afterJobs} JOBS` : ""}{device.preventiveMaintenance.opportunistic.afterJobs !== undefined && device.preventiveMaintenance.opportunistic.afterQualificationTicks !== undefined ? " · " : ""}{device.preventiveMaintenance.opportunistic.afterQualificationTicks !== undefined ? `AFTER ${formatTick(device.preventiveMaintenance.opportunistic.afterQualificationTicks)} AGE` : ""}</b></span>}
        {device.preventiveMaintenance?.planned && <span><small>PLANNED STOP</small><b>{device.preventiveMaintenance.planned.afterJobs !== undefined ? `BEFORE JOB ${device.preventiveMaintenance.planned.afterJobs + 1}` : ""}{device.preventiveMaintenance.planned.afterJobs !== undefined && device.preventiveMaintenance.planned.afterQualificationTicks !== undefined ? " · " : ""}{device.preventiveMaintenance.planned.afterQualificationTicks !== undefined ? `AT ${formatTick(device.preventiveMaintenance.planned.afterQualificationTicks)} AGE` : ""}</b></span>}
        {maintenance && <span><small>JOBS SINCE MAINTENANCE</small><b>{maintenance.jobsSinceMaintenance} / {device.maintenance?.maximumJobs ?? "—"}</b></span>}
        {maintenance && <span><small>QUALIFICATION AGE</small><b>{formatTick(maintenance.qualificationAgeTicks)} / {device.maintenance ? formatTick(device.maintenance.maximumQualificationTicks) : "—"}</b></span>}
        {maintenance && <span><small>MAINTENANCE COMPLETED</small><b>{maintenance.completed} · {maintenance.assetLimit} ASSET / {maintenance.plannedBoundary} PLANNED / {maintenance.opportunistic} OPPORTUNISTIC</b></span>}
        {maintenance?.qualificationPending && <span><small>RELEASE STATE</small><b>AWAITING {maintenance.qualificationPending.cause.toUpperCase()} {maintenance.qualificationPending.trigger.toUpperCase()} QUALIFICATION · {maintenance.qualificationPending.jobsSinceMaintenance} JOBS / {formatTick(maintenance.qualificationPending.qualificationAgeTicks)}</b></span>}
        {maintenance && <span><small>PHYSICAL WORK WAIT</small><b>{formatTick(maintenance.inputWaitTicks)} INPUT / {formatTick(maintenance.crewWaitTicks)} CREW · {maintenance.inputBlocks + maintenance.crewBlocks} BLOCKS{maintenance.wait ? ` · ${maintenance.wait.phase.toUpperCase()} ${maintenance.wait.reason.toUpperCase()}` : ""}</b></span>}
        {maintenance && <span><small>SERVICE CONSUMABLES</small><b>{Object.entries(maintenance.serviceConsumables).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "NONE"}</b></span>}
        {maintenance && <span><small>QUALIFICATION WORK</small><b>{maintenance.qualificationCompleted} COMPLETE / {maintenance.qualificationCancelled} CANCEL · {formatTick(maintenance.qualificationTicks)}</b></span>}
        {maintenance && <span><small>QUALIFICATION CONSUMABLES</small><b>{Object.entries(maintenance.qualificationConsumables).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "NONE"}</b></span>}
        {device.maintenanceProvider && <span><small>SERVICE CAPABILITY</small><b>{device.maintenanceProvider.crews} CREW · {device.maintenanceProvider.skills.join(" / ")} · {device.maintenanceProvider.serviceRadius} RANGE</b></span>}
        {maintenanceProvider && <span><small>CREW USE</small><b>{maintenanceProvider.crewsInUse} / {maintenanceProvider.crews} NOW · {maintenanceProvider.peakCrewsInUse} PEAK · {maintenanceProvider.assignments} ASSIGNMENTS</b></span>}
        {maintenanceProvider && <span><small>SERVICE WORK</small><b>{formatTick(maintenanceProvider.serviceCrewTicks)} CREW-TIME · {maintenanceProvider.completed} COMPLETE / {maintenanceProvider.cancelled} CANCEL</b></span>}
        {maintenanceProvider && <span><small>QUALIFICATION WORK</small><b>{formatTick(maintenanceProvider.qualificationCrewTicks)} CREW-TIME · {maintenanceProvider.qualificationCompleted} COMPLETE / {maintenanceProvider.qualificationCancelled} CANCEL</b></span>}
        {activeDrift && <span><small>ACTIVE PROCESS DRIFT</small><b>{activeDrift.durationMultiplier.numerator}/{activeDrift.durationMultiplier.denominator}× TIME · {activeDrift.powerMultiplier.numerator}/{activeDrift.powerMultiplier.denominator}× POWER</b></span>}
        {maintenance && <span><small>DRIFT EXPOSURE</small><b>{maintenance.driftedJobs} JOBS / {maintenance.driftedLots} LOTS · {maintenance.driftDefects} DEFECTS</b></span>}
        {qualityControl && <span><small>IN-SITU QUALITY CONTROL</small><b>{qualityControl.mode.toUpperCase()} · {qualityControl.preventedDefectInstances}/{qualityControl.authoredDefectInstances} PREVENTED · {qualityControl.appliedDefectInstances} APPLIED</b></span>}
      </div>
      {device.transportEndpoint && <div className="inspector-section"><div className="inspector-section-title"><span>TRANSPORT ATTACHMENT</span><b>{device.transportEndpoint.stage.toUpperCase()}</b></div><div className="inspector-inline"><strong>{device.transportEndpoint.connection}</strong><code>{device.transportEndpoint.distance} cell arm · belt-side anchor</code></div></div>}
      {configuredRecipes.length > 0 && <div className="inspector-section">
        <div className="inspector-section-title"><span>{configuredRecipes.length > 1 ? "QUALIFIED OPERATIONS" : "CONFIGURED PROCESS"}</span><b>{configuredRecipes.length}</b></div>
        {configuredRecipes.map((recipe) => {
          const rate = data.analysis.devices.find((item) => item.device === device.id && item.process === recipe.process && item.mode === recipe.mode);
          return <div key={`${recipe.process}/${recipe.mode}`}>
            <div className="inspector-recipe-head"><strong>{recipe.process}</strong><code>P{recipe.priority ?? 0} · {recipe.durationTicks} ms / job · {rate?.cyclesPerMinute.toFixed(2) ?? "—"} max jobs/min{recipe.setupGroup ? ` · setup ${recipe.setupGroup}` : ""}{recipe.quality ? ` · ${recipe.quality.kind}` : ""}</code></div>
            {rate && rate.preventsDefects.length > 0 && <div className="inspector-inline"><strong>PREVENTS FIXED EXCURSION DEFECTS</strong><code>{rate.preventsDefects.join(" · ")}</code></div>}
            <div className="inspector-recipe"><InspectorFlow label="INPUTS" amounts={recipe.inputs} /><i>→</i><InspectorFlow label="OUTPUTS" amounts={recipe.outputs} /></div>
            {recipe.tooling.length > 0 && <div className="inspector-inline"><strong>REUSABLE TOOLING · {recipe.tooling.map((tool) => `${tool.count} ${tool.resource}`).join(" + ")}</strong><code>{recipe.toolingProviders.map((provider) => `${provider.device} @ ${provider.distance.toFixed(1)}`).join(" · ") || "UNCOVERED"}</code></div>}
            {recipe.utilities.length > 0 && <div className="inspector-inline"><strong>FACILITY UTILITIES · {recipe.utilities.map((utility) => `${utility.units} ${utility.utility}`).join(" + ")}</strong><code>{Object.entries(recipe.utilityProviders).map(([utility, providers]) => `${utility}: ${providers.map((provider) => `${provider.device} @ ${provider.distance.toFixed(1)}`).join(" / ")}`).join(" · ") || "UNCOVERED"}</code></div>}
          </div>;
        })}
      </div>}
      {device.treatment && treatment && <div className="inspector-section"><div className="inspector-section-title"><span>MATERIAL TREATMENT</span><b>{device.treatment.modeName}</b></div><div className="inspector-inline"><strong>{device.treatment.itemCount} items → @{device.treatment.level}</strong><code>{device.treatment.durationTicks} ms · {treatment.itemsPerMinute.toFixed(2)} items/min</code></div><div className="inspector-inline"><strong>{device.treatment.agentCount}× {device.treatment.agentResource}</strong><code>{device.treatment.agentBuffer} · {treatment.agentPerMinute.toFixed(2)}/min</code></div></div>}
      {extraction && <div className="inspector-section"><div className="inspector-section-title"><span>EXTRACTION</span><b>{extraction.resource}</b></div><div className="inspector-inline"><strong>{extraction.itemsPerMinute.toFixed(2)} /min</strong><code>{extraction.itemsPerCycle} items / {extraction.cycleTicks} ms</code></div><div className="inspector-chip-row">{extraction.nodes.map((node) => <span key={node}>{node}</span>)}</div></div>}
      {generation && <div className="inspector-section"><div className="inspector-section-title"><span>GENERATION</span><b>{generation.kind}</b></div><div className="inspector-inline"><strong>{(generation.outputMilliWatts / 1000).toFixed(1)} W</strong><code>{generation.fuelResource ? `${generation.fuelPerMinute?.toFixed(2)} ${generation.fuelResource}/min` : "continuous output"}</code></div></div>}
      {storage && <div className="inspector-section"><div className="inspector-section-title"><span>GRID STORAGE</span><b>{data.metrics ? "MEASURED" : "CONFIGURED"}</b></div><div className="inspector-inline"><strong>{((data.metrics?.energyStorage[grid?.grid ?? ""]?.storedMilliJoules ?? storage.initialMilliJoules) / 1e6).toFixed(3)} / {(storage.capacityMilliJoules / 1e6).toFixed(3)} MJ</strong><code>initial {(storage.initialMilliJoules / 1e6).toFixed(3)} MJ · charge +{(storage.chargeMilliWatts / 1000).toFixed(0)} W · discharge −{(storage.dischargeMilliWatts / 1000).toFixed(0)} W</code></div></div>}
      <div className="inspector-section">
        <div className="inspector-section-title"><span>BUFFER CONTRACTS</span><b>{buffers.length}</b></div>
        <div className="inspector-buffer-list">{buffers.map((buffer) => <div key={buffer.buffer}><span><b>{buffer.buffer}</b><small>{buffer.role}</small></span><code>CAP {buffer.capacity}</code><p>{buffer.accepts.map((resource) => buffer.resourceCapacities?.[resource] === undefined ? resource : `${resource} ≤ ${buffer.resourceCapacities[resource]}`).join(" · ") || "CLOSED"}</p></div>)}</div>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>PHYSICAL PORT CONTRACTS</span><b>{ports.length}</b></div>
        <div className="inspector-buffer-list">{ports.map((port) => <div key={port.port}><span><b>{port.port}</b><small>{port.direction} → {port.buffer}</small></span><p>{port.accepts.join(" · ") || "CLOSED"}</p></div>)}</div>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>POWER GRID</span><b>{grid ? "CONNECTED" : powerMilliWatts ? "DISCONNECTED" : "PASSIVE"}</b></div>
        {grid ? <div className="inspector-grid"><strong>{grid.grid}</strong><code>{(grid.productionMilliWatts / 1000).toFixed(0)} W generation · {(grid.idleConsumptionMilliWatts / 1000).toFixed(0)} W idle · {(grid.ratedConsumptionMilliWatts / 1000).toFixed(0)} W rated · {(grid.headroomMilliWatts / 1000).toFixed(0)} W headroom{grid.storageCapacityMilliJoules ? ` · ${(grid.storageCapacityMilliJoules / 1e6).toFixed(3)} MJ storage` : ""}</code></div> : <small className="inspector-empty">NO GRID MEMBERSHIP</small>}
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>LOCAL CONNECTIONS</span><b>{links.length}</b></div>
        <div className="inspector-link-list">{links.map((connection) => {
          const outgoing = connection.fromDevice === device.id; const flow = data.metrics?.transportFlows[connection.id];
          return <button key={connection.id} onClick={() => onSelection({ kind: "connection", id: connection.id })}><span><i>{outgoing ? "OUT" : "IN"}</i><b>{connection.id}</b><small>{connection.fromDevice} → {connection.toDevice}</small></span><code>{flow ? `${flow.deliveredItemsPerMinute.toFixed(1)}/min` : "inspect →"}</code></button>;
        })}{!links.length && <small className="inspector-empty">NO LOCAL CONNECTIONS</small>}</div>
      </div>
      {diagnostics.length > 0 && <div className="inspector-section inspector-diagnostics"><div className="inspector-section-title"><span>DIAGNOSTICS</span><b>{diagnostics.length}</b></div>{diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${index}`}><code>{diagnostic.code}</code><p>{diagnostic.message}</p></div>)}</div>}
    </div>
  </section>;
}

function ConnectionInspector({ data, frame, connection, onClose, onSelection }: {
  data: StudioData; frame: FactoryFrame; connection: StudioData["connections"][number]; onClose: () => void; onSelection: (selection: StudioSelection) => void;
}) {
  const analysis = data.analysis.connections.find((item) => item.connection === connection.id);
  const flow = data.metrics?.transportFlows[connection.id];
  const stageUtilization = data.metrics?.transportStageUtilization[connection.id];
  const liveCargo = frame.transits.filter((transit) => transit.kind === "belt" && transit.path === connection.id);
  const diagnostics = data.analysis.diagnostics.filter((diagnostic) => diagnostic.connection === connection.id);
  return <section className="scene-inspector connection-inspector" aria-label={`Connection inspector: ${connection.id}`} data-testid={`connection-inspector-${connection.id}`}>
    <InspectorHeader kind="PHYSICAL CONNECTION" id={connection.id} title={`${connection.fromDevice} → ${connection.toDevice}`} subtitle={`${analysis?.pathCells ?? connection.points.length - 2} belt cells · ${analysis?.maxLevel ? `raised to L${analysis.maxLevel}` : "ground route"}`} onClose={onClose} />
    <div className="scene-inspector-scroll">
      <div className="inspector-status-row connection-kpis">
        <span><b>{flow ? flow.deliveredItemsPerMinute.toFixed(2) : "—"}</b><small>DELIVERED / MIN</small></span>
        <span><b>{analysis?.capacityItemsPerMinute.toFixed(2) ?? "—"}</b><small>CAPACITY / MIN</small></span>
        <span><b>{flow ? `${(flow.utilization * 100).toFixed(1)}%` : "—"}</b><small>UTILIZATION</small></span>
      </div>
      <div className="inspector-endpoints">
        <button onClick={() => onSelection({ kind: "device", id: connection.fromDevice })}><small>SOURCE</small><b>{connection.fromDevice}</b></button><i>→</i><button onClick={() => onSelection({ kind: "device", id: connection.toDevice })}><small>TARGET</small><b>{connection.toDevice}</b></button>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>MATERIAL FILTER</span><b>EXACT ALLOWLIST</b></div>
        <div className="inspector-chip-row">{connection.resources.map((resource) => <span key={resource}>{resource}</span>)}</div>
        <div className="inspector-inline"><strong>{analysis?.dispatchPolicy ?? "—"}</strong><code>{analysis?.dispatchProfiles.map((profile) => `${profile.resource}${profile.minimumTreatmentLevel ? `@${profile.minimumTreatmentLevel}+` : ""} · ${profile.targetKind} · ${profile.coverageUnit}/batch · depth ${profile.criticalDepth ?? "—"}`).join(" | ")}</code></div>
      </div>
      <div className="inspector-facts">
        <span><small>TRAVEL</small><b>{analysis?.travelTicks ?? "—"} ms</b></span>
        <span><small>DISPATCH</small><b>{analysis?.dispatchIntervalTicks ?? "—"} ms</b></span>
        <span><small>STACK</small><b>×{analysis?.maxStackSize ?? 1}</b></span>
        <span><small>LIVE CARGO</small><b>{liveCargo.reduce((sum, transit) => sum + transit.count, 0)}</b></span>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>PIPELINE STAGES</span><b>POWER + CAPACITY</b></div>
        <div className="inspector-stage-list">{analysis?.stages.map((stage) => {
          const endpointPowered = stage.stage === "line" ? true : frame.endpointPower[`${connection.id}:${stage.stage}`];
          const utilization = stage.stage === "loader" ? stageUtilization?.loader : stage.stage === "unloader" ? stageUtilization?.unloader : flow?.utilization;
          return <div key={stage.stage}><span className={endpointPowered ? "powered" : "unpowered"}><i />{stage.stage}</span><b>{stage.device ? `${stage.device} · ` : ""}{stage.asset}</b><code>{stage.distance} cell span · {stage.capacity} cargo · stack×{stage.stackCapacity} · {stage.durationTicks} ms</code><small>{utilization === undefined ? "NO RUN" : `${(utilization * 100).toFixed(1)}% ACTIVE`} · P{stage.powerPriority}{stage.powerMilliWatts ? ` · ${(stage.idlePowerMilliWatts / 1000).toFixed(1)} → ${(stage.powerMilliWatts / 1000).toFixed(1)} W` : ""}</small></div>;
        })}</div>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>MEASURED MATERIAL FLOW</span><b>{flow?.deliveredItems ?? 0} ITEMS</b></div>
        <div className="inspector-material-list">{flow && Object.keys(flow.deliveredByResource).length ? Object.entries(flow.deliveredByResource).map(([resource, count]) => <div key={resource}><b>{resource}</b><span>{count} delivered</span><code>{flow.departedByResource[resource] ?? 0} departed</code></div>) : <small className="inspector-empty">NO MEASURED DELIVERIES</small>}</div>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-title"><span>CONGESTION</span><b>{flow?.blockedItemTicks ?? 0} BLOCKED ITEM-TICKS</b></div>
        <div className="inspector-inline"><strong>{flow ? `${(flow.blockedFraction * 100).toFixed(2)}% blocked` : "NO RUN"}</strong><code>{flow ? `${flow.averageInFlightItems.toFixed(2)} average in flight` : "Select a completed run for telemetry"}</code></div>
      </div>
      {diagnostics.length > 0 && <div className="inspector-section inspector-diagnostics"><div className="inspector-section-title"><span>DIAGNOSTICS</span><b>{diagnostics.length}</b></div>{diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${index}`}><code>{diagnostic.code}</code><p>{diagnostic.message}</p></div>)}</div>}
    </div>
  </section>;
}

function SceneInspector({ data, frame, selection, onClose, onSelection }: {
  data: StudioData; frame: FactoryFrame; selection: StudioSelection; onClose: () => void; onSelection: (selection: StudioSelection) => void;
}) {
  if (selection.kind === "device") {
    const device = data.devices.find((item) => item.id === selection.id);
    return device ? <DeviceInspector data={data} frame={frame} device={device} onClose={onClose} onSelection={onSelection} /> : null;
  }
  const connection = data.connections.find((item) => item.id === selection.id);
  return connection ? <ConnectionInspector data={data} frame={frame} connection={connection} onClose={onClose} onSelection={onSelection} /> : null;
}

function AssetGlyph({ projectId, asset }: { projectId: string; asset: DeviceCatalogAsset | ResourceCatalogAsset | ProcessCatalogAsset | RouteCatalogAsset }) {
  if (asset.type === "process") return <span className="asset-glyph process">ƒ</span>;
  if (asset.type === "route") return <span className="asset-glyph process">⇢</span>;
  if (asset.type === "resource" && asset.visual.icon) return <img className="asset-icon-image" src={fileUrl(projectId, asset.visual.icon)} alt="" />;
  const color = asset.type === "device" ? asset.visual.material.baseColor : asset.visual.color ?? "#4f7f86";
  return <span className={`asset-glyph ${asset.visual.shape ?? "box"}`} style={{ "--asset-color": color } as React.CSSProperties} />;
}

function AssetBrowser({ data, initialKind = "devices", initialId, onNavigate, onClose }: {
  data: StudioData;
  initialKind?: AssetKind;
  initialId?: string | null;
  onNavigate?: (kind: AssetKind, assetId: string | null) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<AssetKind>(initialKind);
  const [search, setSearch] = useState("");
  const baseItems: Array<DeviceCatalogAsset | ResourceCatalogAsset | ProcessCatalogAsset | RouteCatalogAsset> = kind === "devices" ? data.assets.devices : kind === "resources" ? data.assets.resources : kind === "processes" ? data.assets.processes : data.assets.routes;
  const [selectedId, setSelectedId] = useState(initialId ?? baseItems[0]?.id ?? "");
  const query = search.trim().toLowerCase();
  const items = query ? baseItems.filter((asset) => `${asset.id} ${asset.name} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase().includes(query)) : baseItems;
  const selected = items.find((asset) => asset.id === selectedId) ?? items[0] ?? baseItems[0];

  useEffect(() => { setKind(initialKind); }, [initialKind]);
  useEffect(() => { if (initialId) setSelectedId(initialId); }, [initialId]);
  const chooseKind = (nextKind: AssetKind) => {
    const nextItems = nextKind === "devices" ? data.assets.devices : nextKind === "resources" ? data.assets.resources : nextKind === "processes" ? data.assets.processes : data.assets.routes;
    const nextId = nextItems[0]?.id ?? "";
    setKind(nextKind); setSelectedId(nextId); setSearch(""); onNavigate?.(nextKind, nextId || null);
  };
  const chooseAsset = (assetId: string) => { setSelectedId(assetId); onNavigate?.(kind, assetId); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="asset-browser" role="dialog" aria-modal="true" aria-label="Project assets">
      <header className="asset-browser-header">
        <div><span className="eyebrow">PROJECT CATALOG</span><h2>{data.name}</h2><p>Self-contained · {data.assets.devices.length} devices · {data.assets.resources.length} resources · {data.assets.processes.length} processes · {data.assets.routes.length} routes</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close asset browser">×</button>
      </header>
      <div className="asset-browser-body">
        <nav className="asset-kinds" aria-label="Asset categories">
          <button data-testid="asset-kind-devices" className={kind === "devices" ? "active" : ""} onClick={() => chooseKind("devices")}><span>DEVICE</span><b>{data.assets.devices.length}</b></button>
          <button data-testid="asset-kind-resources" className={kind === "resources" ? "active" : ""} onClick={() => chooseKind("resources")}><span>RESOURCE</span><b>{data.assets.resources.length}</b></button>
          <button data-testid="asset-kind-processes" className={kind === "processes" ? "active" : ""} onClick={() => chooseKind("processes")}><span>PROCESS</span><b>{data.assets.processes.length}</b></button>
          <button data-testid="asset-kind-routes" className={kind === "routes" ? "active" : ""} onClick={() => chooseKind("routes")}><span>ROUTE</span><b>{data.assets.routes.length}</b></button>
        </nav>
        <div className="asset-list" role="listbox" aria-label={kind}>
          <label className="asset-search"><span>SEARCH</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Filter ${kind}`} /></label>
          <div className="asset-list-title">{kind.toUpperCase()} <span>{items.length} / {baseItems.length}</span></div>
          {items.map((asset) => <button key={asset.id} role="option" aria-selected={selected?.id === asset.id} data-testid={`asset-${kind}-${asset.id}`} className={selected?.id === asset.id ? "selected" : ""} onClick={() => chooseAsset(asset.id)}>
            <AssetGlyph projectId={data.projectId} asset={asset} />
            <span><strong>{asset.name}</strong><small>{asset.id}</small></span>
            {asset.type === "device" && <em>{asset.fleetCount ? `${asset.fleetCount} fleet` : `${asset.instanceCount}×`}</em>}
          </button>)}
          {!items.length && <div className="asset-list-empty">NO MATCHING PROJECT ASSETS</div>}
        </div>
        <article className="asset-detail">
          {selected && <>
            <div className="asset-hero"><AssetGlyph projectId={data.projectId} asset={selected} /><div><span className="asset-type">{selected.type}</span><h3>{selected.name}</h3><code>{selected.id}</code></div></div>
            <p className="asset-description">{selected.description}</p>
            <div className="tag-row">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            {selected.type === "device" ? <>
              <div className="detail-grid">
                <div><label>FOOTPRINT</label><strong>{selected.geometry.footprint.width} × {selected.geometry.footprint.height}</strong></div>
                <div><label>PLACED</label><strong>{selected.instanceCount}</strong></div>
                {selected.fleetCount > 0 && <div><label>FLEET UNITS</label><strong>{selected.fleetCount}</strong></div>}
                <div><label>BUILD COST</label><strong>{selected.economics.buildCost.toLocaleString()}</strong></div>
                <div><label>IDLE POWER</label><strong>{(selected.power.idleMilliWatts / 1000).toFixed(1)} W</strong></div>
                <div><label>ACTIVE POWER</label><strong>{(selected.power.activeMilliWatts / 1000).toFixed(1)} W</strong></div>
              </div>
              <section className="asset-section"><h4>Capabilities</h4><div className="capability-row">{selected.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></section>
              {selected.production && <section className="asset-section"><h4>Equipment qualification</h4><div className="asset-table"><div><b>{selected.production.categories.join(", ")}</b><strong>{selected.production.inputPorts.join(" + ")} → {selected.production.outputPorts.join(" + ")}</strong><span>{selected.production.changeover ? `${selected.production.changeover.transitions.length} directed changeovers` : "physical ports"}</span><code>{selected.production.speed.numerator}/{selected.production.speed.denominator}× speed{selected.production.changeover ? ` · ${Math.min(...selected.production.changeover.transitions.map((transition) => transition.durationTicks))}-${Math.max(...selected.production.changeover.transitions.map((transition) => transition.durationTicks))} ms matrix` : ""}</code></div>{selected.production.processes.map((processId) => { const process = data.assets.processes.find((item) => item.id === processId); return <div key={processId}><b>QUALIFIED PROCESS</b><strong>{process?.name ?? processId}</strong><span>{process?.category ?? "unknown category"}{process ? ` · ${(process.durationTicks / 1000).toFixed(1)} s` : ""}</span><code>{processId}</code></div>; })}{selected.production.modes.map((mode) => <div key={mode.id}><b>{mode.name}</b><strong>{mode.inputCycles}× input → {mode.outputCycles}× output</strong><span>{mode.preventsDefects.length ? `prevents ${mode.preventsDefects.join(" · ")}` : mode.minimumInputTreatmentLevel ? `all process inputs @${mode.minimumInputTreatmentLevel}+` : mode.auxiliaryInputs.map((input) => `+${input.count} ${input.resource} @ ${input.port}`).join(" · ") || "untreated inputs"}</span><code>{mode.durationMultiplier.numerator}/{mode.durationMultiplier.denominator} time · {mode.powerMultiplier.numerator}/{mode.powerMultiplier.denominator} power</code></div>)}</div></section>}
              {selected.production?.maintenance && <section className="asset-section"><h4>Usage drift & maintenance</h4><div className="asset-table"><div><b>MANDATORY AFTER {selected.production.maintenance.maximumJobs} JOBS OR {formatTick(selected.production.maintenance.maximumQualificationTicks)} AGE</b><strong>{formatTick(selected.production.maintenance.durationTicks)} service + {formatTick(selected.production.maintenance.qualification.durationTicks)} qualification</strong><span>usage and calendar state reset only after qualification</span><code>{(selected.production.maintenance.powerMilliWatts / 1000).toFixed(1)} W → {(selected.production.maintenance.qualification.powerMilliWatts / 1000).toFixed(1)} W</code></div>{(selected.production.maintenance.drift ?? []).map((stage) => <div key={stage.afterJobs}><b>AFTER {stage.afterJobs} JOBS</b><strong>{stage.durationMultiplier.numerator}/{stage.durationMultiplier.denominator}× time · {stage.powerMultiplier.numerator}/{stage.powerMultiplier.denominator}× power</strong><span>{stage.defects.length ? stage.defects.join(" · ") : "no defect injection"}</span><code>active until equipment release</code></div>)}</div></section>}
              {selected.production?.maintenance && <section className="asset-section"><h4>Maintenance & qualification contracts</h4><div className="asset-table"><div><b>SERVICE · {selected.production.maintenance.service.crews}× {selected.production.maintenance.service.skill}</b><strong>{selected.production.maintenance.service.inputs.map((input) => `${input.count} ${input.resource}`).join(" + ") || "no consumables"}</strong><span>allocated for complete physical service</span><code>shared provider capacity</code></div><div><b>QUALIFICATION · {selected.production.maintenance.qualification.service.crews}× {selected.production.maintenance.qualification.service.skill}</b><strong>{selected.production.maintenance.qualification.service.inputs.map((input) => `${input.count} ${input.resource}`).join(" + ") || "no consumables"}</strong><span>{formatTick(selected.production.maintenance.qualification.durationTicks)} before production release</span><code>{(selected.production.maintenance.qualification.powerMilliWatts / 1000).toFixed(1)} W</code></div></div></section>}
              {selected.maintenanceProvider && <section className="asset-section"><h4>Maintenance provider</h4><div className="asset-table"><div><b>{selected.maintenanceProvider.crews} SHARED CREW</b><strong>{selected.maintenanceProvider.skills.join(" / ")}</strong><span>service radius {selected.maintenanceProvider.serviceRadius}</span><code>inventory @ {selected.maintenanceProvider.inventoryBuffer}</code></div></div></section>}
              {selected.toolingProvider && <section className="asset-section"><h4>Reusable tooling provider</h4><div className="asset-table"><div><b>ASSET-BUNDLED PHYSICAL STOCK</b><strong>{selected.toolingProvider.stock.map((tool) => `${tool.count} ${tool.resource}`).join(" + ")}</strong><span>each placed instance purchases this stock · service radius {selected.toolingProvider.serviceRadius}</span><code>reserved per job @ {selected.toolingProvider.inventoryBuffer}</code></div></div></section>}
              {selected.utilityProvider && <section className="asset-section"><h4>Facility utility plant</h4><div className="asset-table"><div><b>PLACED SHARED CAPACITY</b><strong>{selected.utilityProvider.capacities.map((capacity) => `${capacity.units} ${capacity.utility}`).join(" + ")}</strong><span>each placed instance adds costed capacity · service radius {selected.utilityProvider.serviceRadius}</span><code>atomically reserved for each physical process job</code></div></div></section>}
              {selected.treatment && <section className="asset-section"><h4>Material treatment</h4><div className="asset-table"><div><b>{selected.treatment.inputBuffer} → {selected.treatment.outputBuffer}</b><strong>agent @ {selected.treatment.agentBuffer}</strong><span>lot-preserving</span><code>{selected.treatment.modes.length} modes</code></div>{selected.treatment.modes.map((mode) => <div key={mode.id}><b>{mode.name}</b><strong>{mode.itemCount} items → level {mode.level}</strong><span>{mode.agent.count} {mode.agent.resource}</span><code>{mode.durationTicks}ms</code></div>)}</div></section>}
              {selected.extraction && <section className="asset-section"><h4>Extraction</h4><div className="asset-table"><div><b>{selected.extraction.resources.join(", ")}</b><strong>{selected.extraction.itemsPerCycle} / {selected.extraction.cycleTicks}ms</strong><span>radius</span><code>{selected.extraction.radius} cells</code></div></div></section>}
              {selected.logistics && <section className="asset-section"><h4>Logistics roles</h4><div className="capability-row">{selected.logistics.roles.map((role) => <span key={role}>{role}</span>)}</div></section>}
              {selected.logistics?.endpointRange && <section className="asset-section"><h4>Endpoint reach</h4><div className="asset-table"><div><b>{selected.logistics.endpointRange.minimum}–{selected.logistics.endpointRange.maximum} cells</b><strong>distance-aware transfer</strong><span>loader / unloader</span><code>throughput comes from runtime.ts</code></div></div></section>}
              {selected.logistics?.carrierKinds && <section className="asset-section"><h4>Carrier networks</h4><div className="capability-row">{selected.logistics.carrierKinds.map((kind) => <span key={kind}>{kind}</span>)}</div></section>}
              {selected.logistics?.missionEnergy && <section className="asset-section"><h4>Mission energy</h4><div className="asset-table"><div><b>{(selected.logistics.missionEnergy.baseMilliJoules / 1e6).toFixed(3)} MJ base</b><strong>+{(selected.logistics.missionEnergy.milliJoulesPerDistance / 1e6).toFixed(3)} MJ / distance</strong><span>charged at departure</span></div></div></section>}
              {selected.logistics?.highSpeedMission && <section className="asset-section"><h4>High-speed transport</h4><div className="asset-table"><div><b>{selected.logistics.highSpeedMission.durationMultiplier.numerator}/{selected.logistics.highSpeedMission.durationMultiplier.denominator} travel time</b><strong>{selected.logistics.highSpeedMission.energyMultiplier.numerator}/{selected.logistics.highSpeedMission.energyMultiplier.denominator} mission energy</strong><span>agile carrier envelope</span></div></div></section>}
              {selected.logisticsStation && <section className="asset-section"><h4>Station specification</h4><div className="asset-table"><div><b>{selected.logisticsStation.networkKinds.join(", ")}</b><strong>{selected.logisticsStation.slots} slots</strong><span>buffer</span><code>{selected.logisticsStation.buffer}</code></div><div><b>{(selected.logisticsStation.energyCapacityMilliJoules / 1e6).toFixed(3)} MJ</b><strong>{(selected.logisticsStation.maximumChargeMilliWatts / 1000).toFixed(0)} W max charge</strong><span>carrier energy</span></div></div></section>}
              {selected.power.generation && <section className="asset-section"><h4>Power generation</h4><div className="asset-table"><div><b>{selected.power.generation.kind}</b><strong>{(selected.power.generation.outputMilliWatts / 1000).toFixed(0)} W</strong><span>{selected.power.generation.kind === "fuel" ? selected.power.generation.fuels.join(", ") : "Scenario-profiled environment"}</span><code>{selected.power.generation.kind === "fuel" ? selected.power.generation.fuelBuffer : "rated renewable"}</code></div></div></section>}
              {selected.power.sleep && <section className="asset-section"><h4>Low-power idle</h4><div className="asset-table"><div><b>{(selected.power.sleep.idleMilliWatts / 1000).toFixed(1)} W asleep</b><strong>{formatTick(selected.power.sleep.wakeDurationTicks)} wake @ {(selected.power.sleep.wakePowerMilliWatts / 1000).toFixed(1)} W</strong><span>Blueprint-controlled idle threshold</span><code>asset-owned wake physics</code></div></div></section>}
              {selected.power.storage && <section className="asset-section"><h4>Power storage</h4><div className="asset-table"><div><b>{(selected.power.storage.capacityMilliJoules / 1e6).toFixed(3)} MJ</b><strong>+{(selected.power.storage.chargeMilliWatts / 1000).toFixed(0)} / −{(selected.power.storage.dischargeMilliWatts / 1000).toFixed(0)} W</strong><span>charge / discharge</span><code>deterministic grid buffer</code></div></div></section>}
              {selected.power.distribution && <section className="asset-section"><h4>Power distribution</h4><div className="asset-table"><div><b>grid reach</b><strong>{selected.power.distribution.connectionRange} cells</strong><span>coverage</span><code>{selected.power.distribution.coverageRange} cells</code></div></div></section>}
              <section className="asset-section"><h4>Presentation material</h4><div className="asset-table"><div><b>{selected.visual.shape}</b><strong>{selected.visual.material.baseColor}</strong><span>{selected.visual.material.metalness.toFixed(2)} metal · {selected.visual.material.roughness.toFixed(2)} rough</span><code>{Object.values(selected.visual.material.maps).filter(Boolean).length} texture maps · repeat {selected.visual.material.repeat.x}×{selected.visual.material.repeat.y}</code></div></div></section>
              <section className="asset-section"><h4>Ports</h4><div className="asset-table">{selected.geometry.ports.map((port) => <div key={port.id}><b className={port.direction}>{port.direction === "input" ? "IN" : "OUT"}</b><strong>{port.id}</strong><span>{port.side}</span><code>{port.buffer}</code></div>)}</div></section>
              <section className="asset-section"><h4>Buffers</h4><div className="asset-table">{selected.buffers.map((buffer) => <div key={buffer.id}><b>{buffer.role}</b><strong>{buffer.id}</strong><span>cap {buffer.capacity}</span><code>{buffer.accepts.join(", ")}</code></div>)}</div></section>
              <section className="asset-section compact"><h4>Runtime</h4><code>{selected.runtime.entry}</code></section>
            </> : selected.type === "resource" ? <>
              <div className="detail-grid">
                <div><label>UNIT</label><strong>{selected.unit.symbol}</strong></div>
                <div><label>KIND</label><strong>{selected.unit.kind}</strong></div>
                <div><label>PRECISION</label><strong>{selected.unit.precision}</strong></div>
                <div><label>STACK SIZE</label><strong>{selected.transport.stackSize}</strong></div>
                {selected.tracking && <div><label>TRACKING</label><strong>LOT · {selected.tracking.family}</strong></div>}
                {selected.fuel && <div><label>FUEL ENERGY</label><strong>{(selected.fuel.energyMilliJoules / 1e6).toFixed(1)} MJ</strong></div>}
              </div>
              <section className="asset-section"><h4>Presentation</h4><div className="asset-table"><div><b>shape</b><strong>{selected.visual.shape}</strong><span>color</span><code>{selected.visual.color ?? "default"}</code></div></div></section>
            </> : selected.type === "process" ? <>
              <div className="detail-grid">
                <div><label>CATEGORY</label><strong>{selected.category}</strong></div>
                <div><label>CYCLE</label><strong>{(selected.durationTicks / 1000).toFixed(2)} s</strong></div>
                {selected.setupGroup && <div><label>SETUP GROUP</label><strong>{selected.setupGroup}</strong></div>}
                {selected.quality && <div><label>QUALITY MODE</label><strong>{selected.quality.kind}</strong></div>}
                {selected.lotTermination && <div><label>LOT TERMINAL</label><strong>{selected.lotTermination.terminal}</strong></div>}
                <div><label>INPUT STREAMS</label><strong>{selected.inputs.length}</strong></div>
                <div><label>REUSABLE TOOLING</label><strong>{selected.tooling?.length ?? 0}</strong></div>
                <div><label>FACILITY UTILITIES</label><strong>{selected.utilities?.length ?? 0}</strong></div>
                <div><label>OUTPUT STREAMS</label><strong>{selected.outputs.length}</strong></div>
              </div>
              <section className="asset-section"><h4>Material transformation</h4><div className="process-flow"><div><label>INPUT</label>{selected.inputs.map((amount) => <span key={amount.resource}><b>{amount.count}×</b> {amount.resource}</span>)}</div><i>→</i><div><label>OUTPUT</label>{selected.outputs.map((amount) => <span key={amount.resource}><b>{amount.count}×</b> {amount.resource}</span>)}</div></div></section>
              {selected.lotTermination && <section className="asset-section"><h4>Tracked-lot boundary</h4><div className="asset-table"><div><b>{selected.lotTermination.terminal.toUpperCase()}</b><strong>source work-lot lifecycle ends here</strong><span>ordinary outputs continue as fungible product inventory</span><code>explicit Process contract</code></div></div></section>}
              {(selected.lotOutputProfiles?.length ?? 0) > 0 && <section className="asset-section"><h4>Lot-derived output profiles</h4><div className="asset-table">{selected.lotOutputProfiles!.map((profile) => <div key={profile.id}><b>{profile.id}</b><strong>when any defect: {profile.defectsAny.join(", ")}</strong><span>{Object.entries(profile.outputCounts).map(([resource, count]) => `${count}× ${resource}`).join(" · ")}</span><code>first matching profile wins</code></div>)}</div></section>}
              {(selected.tooling?.length ?? 0) > 0 && <section className="asset-section"><h4>Reusable production tooling</h4><div className="asset-table">{selected.tooling!.map((tool) => <div key={tool.resource}><b>{tool.count}× {tool.resource}</b><strong>reserved, not consumed</strong><span>held through power loss and failure recovery</span><code>external tooling provider</code></div>)}</div></section>}
              {(selected.utilities?.length ?? 0) > 0 && <section className="asset-section"><h4>Facility utility demand</h4><div className="asset-table">{selected.utilities!.map((utility) => <div key={utility.utility}><b>{utility.units}× {utility.utility}</b><strong>finite shared capacity</strong><span>atomically reserved for the complete physical job</span><code>spatial utility provider</code></div>)}</div></section>}
              {selected.quality?.kind === "inspection" && <section className="asset-section"><h4>Quality disposition</h4><div className="asset-table"><div><b>detects</b><strong>{selected.quality.detects?.join(", ")}</strong><span>rework</span><code>{selected.quality.rejectResource}</code></div><div><b>terminal scrap</b><strong>{selected.quality.scrapResource ?? "none"}</strong><span>after rework cycles</span><code>{selected.quality.maxReworkCycles ?? "unlimited"}</code></div></div></section>}
              {selected.quality?.kind === "rework" && <section className="asset-section"><h4>Quality recovery</h4><div className="asset-table"><div><b>repairs</b><strong>{selected.quality.repairs?.join(", ")}</strong><span>lot identity retained</span></div></div></section>}
            </> : <>
              <div className="detail-grid">
                <div><label>FAMILY</label><strong>{selected.family}</strong></div>
                <div><label>STEPS</label><strong>{selected.steps.length}</strong></div>
                <div><label>ENTRY RESOURCE</label><strong>{selected.entry.resource}</strong></div>
                <div><label>ENTRY STEP</label><strong>{selected.entry.step}</strong></div>
              </div>
              <section className="asset-section"><h4>Process route</h4><div className="asset-table">{selected.steps.map((step) => <div key={step.id}><b>{step.name}</b><strong>{step.operations.join(" / ")}</strong><span>{step.transitions.map((transition) => `${transition.resource} → ${transition.to ?? transition.terminal}`).join(" · ")}{step.queueTime ? ` · Q-time ≤ ${(step.queueTime.maximumTicks / 1000).toFixed(1)} s → ${step.queueTime.violationDefects.join(" + ")}` : ""}</span><code>{step.id}</code></div>)}</div></section>
            </>}
            <div className="asset-hash"><label>CONTENT HASH</label><code>{selected.contentHash}</code></div>
          </>}
        </article>
      </div>
    </section>
  </div>;
}

function AnalysisBrowser({ data, focusDiagnostic, onClose }: { data: StudioData; focusDiagnostic?: WorkbenchDiagnostic; onClose: () => void }) {
  const analysis = data.analysis;
  const plan = data.capacityPlan;
  const [diagnosticQuery, setDiagnosticQuery] = useState("");
  const filteredDiagnostics = analysis.diagnostics.filter((diagnostic) => {
    const query = diagnosticQuery.trim().toLowerCase();
    return !query || `${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}`.toLowerCase().includes(query);
  });
  const warningCount = analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className={`analysis-browser ${focusDiagnostic ? "has-focus" : ""}`} role="dialog" aria-modal="true" aria-label="Industrial analysis">
      <header className="analysis-header">
        <div><span className="eyebrow">COMPILED INDUSTRIAL MODEL</span><h2>{data.name}</h2><p>Nominal design envelope + measured selected-run flow</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close industrial analysis">×</button>
      </header>
      <div className="analysis-summary">
        <Metric label="DECLARATIVE DEVICES" value={String(analysis.declarativeDevices)} accent />
        <Metric label="MATERIAL STREAMS" value={String(analysis.resources.length)} />
        <Metric label="LOGISTICS LINKS" value={String(analysis.connections.length)} />
        <Metric label="STATION NETS" value={String(analysis.stationNetworks.length)} />
        <Metric label="POWER GRIDS" value={String(analysis.powerGrids.length)} />
        <Metric label="WARNINGS" value={String(warningCount)} />
      </div>
      {focusDiagnostic && <div className={`analysis-focus ${focusDiagnostic.severity}`} data-diagnostic-id={focusDiagnostic.id}><span>{focusDiagnostic.severity.toUpperCase()}</span><div><code>{focusDiagnostic.code}</code><strong>{focusDiagnostic.message}</strong><small>{focusDiagnostic.evidence.source} · {focusDiagnostic.subjects.map((subject) => `${subject.kind}:${subject.id}`).join(" · ")}</small></div></div>}
      <div className="analysis-body">
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>TARGET-RATE CAPACITY PLAN</span><b>{plan.ready ? "READY" : `${plan.gaps.length} GAPS`} · {plan.targetRatePerMinute.toFixed(2)} {plan.targetResource.toUpperCase()}/MIN</b></div>
          <div className="pipeline-list">{plan.processes.map((process) => <div className="pipeline-card" key={`${process.process}-${process.mode}-${process.resource}`}>
            <div className="pipeline-head"><span><strong>{process.process} / {process.mode}</strong><small>{process.region} · {process.asset} · {Object.entries(process.inputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")} → {Object.entries(process.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")}</small></span><b>{process.configuredMachines} / {process.requiredMachines} MACHINES</b></div>
            <footer><span>CAPACITY {process.configuredCapacityPerMinute.toFixed(2)} / {process.requiredOutputPerMinute.toFixed(2)}/MIN</span><span>{process.additionalMachines ? `ADD ${process.additionalMachines} ${process.asset.toUpperCase()}` : "CAPACITY READY"}</span><span>{(process.powerMilliWattsPerMachine / 1000).toFixed(0)} W / MACHINE</span></footer>
          </div>)}</div>
          <div className="analysis-section-title"><span>QUALIFIED TOOLSET ALLOCATION</span><b>{plan.toolsets.length} SHARED TOOLSETS</b></div>
          <div className="pipeline-list">{plan.toolsets.map((toolset) => <div className="pipeline-card" key={toolset.id}>
            <div className="pipeline-head"><span><strong>{toolset.id}</strong><small>{toolset.operations.map((operation) => `${operation.process}/${operation.mode}: ${(operation.allocatedDeviceTicksPerMinute / 60_000).toFixed(2)}/${(operation.requiredDeviceTicksPerMinute / 60_000).toFixed(2)} machine-eq`).join(" · ")}</small></span><b className={toolset.unallocatedDeviceTicksPerMinute > 0 ? "negative" : "positive"}>{(toolset.allocatedDeviceTicksPerMinute / 60_000).toFixed(2)} / {(toolset.requiredDeviceTicksPerMinute / 60_000).toFixed(2)} ALLOCATED</b></div>
            <footer><span>{toolset.devices.length} PHYSICAL DEVICES · {(toolset.utilization * 100).toFixed(1)}% INSTALLED LOAD</span><span>{toolset.minimumAdditionalDevices ? `ADD ${toolset.minimumAdditionalDevices} QUALIFIED ${toolset.asset.toUpperCase()}` : "QUALIFICATION READY"}</span><span>{toolset.devices.map((device) => `${device.device} ${(device.utilization * 100).toFixed(0)}%`).join(" · ")}</span></footer>
          </div>)}</div>
          <div className="pipeline-list">{plan.treatments.map((treatment) => <div className="pipeline-card" key={`${treatment.process}-${treatment.resource}-${treatment.minimumLevel}`}>
            <div className="pipeline-head"><span><strong>{treatment.resource}@{treatment.minimumLevel}+ treatment</strong><small>{treatment.process} / {treatment.mode} · {treatment.asset} / {treatment.treatmentMode} · {treatment.region}</small></span><b>{treatment.configuredDevices} / {treatment.requiredDevices} COATERS</b></div>
            <footer><span>{treatment.requiredItemsPerMinute.toFixed(2)} ITEMS/MIN</span><span>{treatment.requiredAgentPerMinute.toFixed(2)} {treatment.agentResource.toUpperCase()}/MIN</span><span>{treatment.additionalDevices ? `ADD ${treatment.additionalDevices}` : "TREATMENT READY"}</span></footer>
          </div>)}</div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>RAW RESOURCE</span><span>NEED / MIN</span><span>EXTRACT + SCHEDULE</span><span>SCENARIO BALANCE</span></div>{plan.rawResources.map((resource) => <div key={resource.resource}>
            <strong>{resource.resource}</strong><span>{resource.totalDemandPerMinute.toFixed(3)}</span><span>{resource.configuredExtractionPerMinute.toFixed(3)} + {resource.scheduledSupplyPerMinute.toFixed(3)}</span><b className={resource.scenarioBalance < 0 ? "negative" : "positive"}>{resource.scenarioBalance.toFixed(3)}</b><small>{resource.scheduledSupply} scheduled lots · {resource.lifetimeMinutes === null ? "no deposit" : `${resource.lifetimeMinutes.toFixed(2)} min deposit lifetime`}</small>
          </div>)}</div>
          <div className="pipeline-list">{plan.power.map((power) => <div className="pipeline-card" key={`plan-power-${power.region}`}>
            <div className="pipeline-head"><span><strong>{power.region} temporal power</strong><small>Scenario generated {(power.scenarioGeneratedMilliJoules / 1e6).toFixed(3)} / demanded {(power.scenarioDemandMilliJoules / 1e6).toFixed(3)} MJ · curtailed {(power.scenarioCurtailedMilliJoules / 1e6).toFixed(3)} MJ</small></span><b className={power.scenarioUnservedMilliJoules > 0 ? "negative" : "positive"}>{(power.scenarioUnservedMilliJoules / 1e6).toFixed(3)} MJ UNSERVED</b></div>
            <footer><span>RATED {(power.configuredGenerationMilliWatts / 1000).toFixed(0)} / {(power.requiredMilliWatts / 1000).toFixed(0)} W</span><span>STORAGE {(power.configuredStorageCapacityMilliJoules / 1e6).toFixed(3)} / {(power.requiredStorageCapacityMilliJoules / 1e6).toFixed(3)} MJ</span><span>CHARGE/DISCHARGE {(power.configuredStorageChargeMilliWatts / 1000).toFixed(0)} / {(power.configuredStorageDischargeMilliWatts / 1000).toFixed(0)} W</span></footer>
          </div>)}</div>
          <div className="diagnostic-list">{plan.gaps.length ? plan.gaps.map((gap) => <div className="warning" key={`${gap.kind}-${gap.entity}`}><i>!</i><span><code>{gap.kind}</code><p>{gap.message}</p></span></div>) : <div className="diagnostics-clear"><i>✓</i><span>TARGET RATE IS FULLY PROVISIONED</span></div>}</div>
        </section>
        <section className="analysis-section material-analysis">
          <div className="analysis-section-title"><span>FINITE RESOURCE NODES</span><b>WORLD INPUT</b></div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>NODE</span><span>AMOUNT</span><span>MINERS</span><span>DEPLETION</span></div>{analysis.resourceNodes.map((node) => <div key={node.node}>
            <strong>{node.node}</strong><span>{node.amount} {node.resource}</span><span>{node.miners.join(", ") || "none"}</span><b>{node.estimatedDepletionMinutes === null ? "—" : `${node.estimatedDepletionMinutes.toFixed(2)}m`}</b><small>{node.region}</small>
          </div>)}</div>
        </section>
        <section className="analysis-section material-analysis">
          <div className="analysis-section-title"><span>MATERIAL BALANCE</span><b>ITEMS / MIN</b></div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>RESOURCE</span><span>PRODUCE</span><span>CONSUME</span><span>NET</span></div>{analysis.resources.map((resource) => <div key={resource.resource}>
            <strong>{resource.resource}</strong><span>{resource.producedPerMinute.toFixed(3)}</span><span>{resource.consumedPerMinute.toFixed(3)}</span><b className={resource.netPerMinute < 0 ? "negative" : resource.netPerMinute > 0 ? "positive" : ""}>{resource.netPerMinute.toFixed(3)}</b>
            <small>{resource.hasBoundarySupply ? "SUPPLY" : ""}{resource.hasBoundarySupply && resource.hasBoundaryDemand ? " · " : ""}{resource.hasBoundaryDemand ? "DEMAND" : ""}</small>
          </div>)}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>CONFIGURED RECIPES</span><b>RESOURCE → PHYSICAL PORT</b></div>
          <div className="pipeline-list">{analysis.devices.map((device) => <div className="pipeline-card" key={`${device.device}-${device.process}-${device.mode}`}>
            <div className="pipeline-head"><span><strong>{device.device}</strong><small>{device.asset} · {device.process} / {device.mode}</small></span><b>{device.cyclesPerMinute.toFixed(2)} cycles/min</b></div>
            <div className="pipeline-stages"><span><small>inputs</small><strong>{Object.entries(device.inputPorts).map(([resource, port]) => `${resource} → ${port}`).join(" + ") || "none"}</strong><code>{Object.entries(device.inputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")}</code></span><i>⇒</i><span><small>outputs</small><strong>{Object.entries(device.outputPorts).map(([resource, port]) => `${resource} → ${port}`).join(" + ")}</strong><code>{Object.entries(device.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")}</code></span></div>
            <footer><span>JOB {formatQuantity(jobQuantity(device.inputsPerMinute, device.cyclesPerMinute))} IN / {formatQuantity(jobQuantity(device.outputsPerMinute, device.cyclesPerMinute))} OUT · {device.cycleTicks}ms{device.minimumInputTreatmentLevel ? ` · INPUTS @${device.minimumInputTreatmentLevel}+` : ""}{device.preventsDefects.length ? ` · PREVENTS ${device.preventsDefects.join(" + ")}` : ""}</span><span>P{device.powerPriority} · {(device.idlePowerMilliWatts / 1000).toFixed(0)} → {(device.powerMilliWatts / 1000).toFixed(0)} W</span></footer>
          </div>)}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>MATERIAL TREATMENT</span><b>AGENT → LOT LEVEL</b></div>
          <div className="pipeline-list">{analysis.treatmentDevices.length ? analysis.treatmentDevices.map((device) => <div className="pipeline-card" key={device.device}>
            <div className="pipeline-head"><span><strong>{device.device}</strong><small>{device.asset} / {device.mode} · {device.inputBuffer} → {device.outputBuffer}</small></span><b>@{device.level} · {device.itemsPerMinute.toFixed(2)} ITEMS/MIN</b></div>
            <footer><span>{device.itemCount} ITEMS / {device.cycleTicks}ms</span><span>{device.agentPerMinute.toFixed(2)} {device.agentResource.toUpperCase()}/MIN @ {device.agentBuffer}</span><span>P{device.powerPriority} · {(device.idlePowerMilliWatts / 1000).toFixed(0)} → {(device.powerMilliWatts / 1000).toFixed(0)} W</span></footer>
          </div>) : <div className="diagnostics-clear"><i>·</i><span>NO MATERIAL TREATMENT DEVICES</span></div>}</div>
        </section>
        <section className="analysis-section material-analysis">
          <div className="analysis-section-title"><span>INSTANCE BUFFER CONTRACTS</span><b>BLUEPRINT RESOURCE FILTERS</b></div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>DEVICE / BUFFER</span><span>ROLE</span><span>CAPACITY</span><span>ACCEPTS</span></div>{analysis.bufferContracts.flatMap((device) => device.buffers.map((buffer) => <div key={`${device.device}-${buffer.buffer}`}>
            <strong>{device.device}<small>{buffer.buffer}</small></strong><span>{buffer.role}</span><span>{buffer.capacity}</span><b>{buffer.accepts.map((resource) => buffer.resourceCapacities?.[resource] === undefined ? resource : `${resource} ≤ ${buffer.resourceCapacities[resource]}`).join(" + ") || "CLOSED"}</b><small>{device.asset}</small>
          </div>))}</div>
        </section>
        <section className="analysis-section material-analysis">
          <div className="analysis-section-title"><span>INSTANCE PORT CONTRACTS</span><b>PHYSICAL INGRESS / EGRESS</b></div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>DEVICE / PORT</span><span>DIRECTION</span><span>BUFFER</span><span>CARRIES</span></div>{analysis.portContracts.flatMap((device) => device.ports.map((port) => <div key={`${device.device}-${port.port}`}>
            <strong>{device.device}<small>{port.port}</small></strong><span>{port.direction}</span><span>{port.buffer}</span><b>{port.accepts.join(" + ") || "CLOSED"}</b><small>{device.asset}</small>
          </div>))}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>PRODUCTION GRAPH</span><b>PER 1 {analysis.productionGraph.targetResource.toUpperCase()}</b></div>
          <div className="pipeline-list"><div className="pipeline-card">
            <div className="pipeline-head"><span><strong>{analysis.productionGraph.targetResource}</strong><small>selected recipe dependency chain</small></span><b>{Object.entries(analysis.productionGraph.rawInputsPerTarget).map(([resource, amount]) => `${amount.toFixed(2)} ${resource}`).join(" + ")}</b></div>
            <div className="pipeline-stages">{analysis.productionGraph.steps.map((step, index) => <React.Fragment key={`${step.device}-${step.process}-${step.mode}`}><span><small>{step.device}</small><strong>{step.process} / {step.mode}</strong><code>{step.cyclesPerTarget.toFixed(2)} jobs / target</code></span>{index < analysis.productionGraph.steps.length - 1 && <i>→</i>}</React.Fragment>)}</div>
          </div></div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>RECIPE ALTERNATIVES</span><b>AUTO-PATCH CANDIDATES</b></div>
          <div className="pipeline-list">{analysis.recipeOptions.filter((option) => !option.selected).map((option) => <div className="pipeline-card" key={`${option.device}-${option.process}-${option.mode}`}>
            <div className="pipeline-head"><span><strong>{option.process} / {option.modeName}</strong><small>{option.device} · {option.name} · P{option.powerPriority} · {(option.idlePowerMilliWatts / 1000).toFixed(0)} → {(option.powerMilliWatts / 1000).toFixed(0)} W</small></span><b>{option.targetOutputPerMinute.toFixed(2)} {analysis.productionGraph.targetResource}/min</b></div>
            <div className="pipeline-stages"><span><small>inputs</small><strong>{Object.entries(option.inputPorts).map(([resource, port]) => `${resource} → ${port}`).join(" + ")}</strong><code>{option.inputs.map((amount) => `${amount.count} ${amount.resource}`).join(" + ")}</code></span><i>⇒</i><span><small>outputs</small><strong>{Object.entries(option.outputPorts).map(([resource, port]) => `${resource} → ${port}`).join(" + ")}</strong><code>{option.outputs.map((amount) => `${amount.count} ${amount.resource}`).join(" + ")}</code></span></div>
            {option.preventsDefects.length > 0 && <footer><span>PREVENTS FIXED EXCURSION DEFECTS · {option.preventsDefects.join(" + ")}</span></footer>}
          </div>)}</div>
        </section>
        <section className="analysis-section diagnostics-analysis">
          <div className="analysis-section-title analysis-diagnostic-title"><span>DIAGNOSTICS</span><label><span>FILTER</span><input value={diagnosticQuery} onChange={(event) => setDiagnosticQuery(event.target.value)} placeholder="code, message, severity" aria-label="Filter diagnostics" /></label><b>{filteredDiagnostics.length} / {analysis.diagnostics.length}</b></div>
          <div className="diagnostic-list">{filteredDiagnostics.length ? filteredDiagnostics.map((diagnostic, index) => <div className={diagnostic.severity} key={`${diagnostic.code}-${index}`}><i>{diagnostic.severity === "warning" ? "!" : "·"}</i><span><code>{diagnostic.code}</code><p>{diagnostic.message}</p></span></div>) : <div className="diagnostics-clear"><i>{analysis.diagnostics.length ? "·" : "✓"}</i><span>{analysis.diagnostics.length ? "NO DIAGNOSTICS MATCH" : "NO STATIC WARNINGS"}</span></div>}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>LOGISTICS PIPELINES</span><b>LOADER → LINE → UNLOADER</b></div>
          <div className="pipeline-list">{analysis.connections.map((connection) => {
            const flow = data.metrics?.transportFlows[connection.connection];
            const mix = flow ? Object.entries(flow.deliveredByResource).map(([resource, count]) => `${count} ${resource}`).join(" + ") : "";
            return <div className="pipeline-card" key={connection.connection}>
              <div className="pipeline-head"><span><strong>{connection.connection}</strong><small>{connection.from} → {connection.to} · FILTER {connection.resources.join(" + ")}{mix ? ` · ${mix}` : ""}</small></span><b>{flow ? `${flow.deliveredItemsPerMinute.toFixed(1)} / ` : ""}{connection.capacityItemsPerMinute.toFixed(1)} /min · STACK ×{connection.maxStackSize}</b></div>
              <div className="pipeline-stages">{connection.stages.map((stage, index) => <React.Fragment key={stage.stage}><span><small>{stage.stage}</small><strong>{stage.asset}</strong><code>{stage.distance} cells · {stage.capacity} cargo · stack×{stage.stackCapacity} / {stage.durationTicks}ms · P{stage.powerPriority}{stage.powerMilliWatts ? ` · ${(stage.idlePowerMilliWatts / 1000).toFixed(1)}→${(stage.powerMilliWatts / 1000).toFixed(1)}W · ${stage.powerGrid ?? "NO GRID"}` : ""}</code></span>{index < connection.stages.length - 1 && <i>→</i>}</React.Fragment>)}</div>
              <footer><span>{connection.dispatchPolicy.toUpperCase()}{connection.dispatchPolicy === "shortage-first" ? ` · ${connection.dispatchProfiles.map((profile) => `${profile.resource}${profile.minimumTreatmentLevel ? `@${profile.minimumTreatmentLevel}+` : ""}:${profile.targetKind}/D${profile.criticalDepth ?? "-"}`).join(" + ")}` : ""}</span><span>{flow ? `MEASURED ${(flow.utilization * 100).toFixed(1)}% · ${flow.blockedItemTicks} BLOCKED ITEM-TICKS` : `DISPATCH ${connection.dispatchIntervalTicks}ms`}</span><span>LATENCY {connection.travelTicks}ms</span><span>PATH {connection.pathCells} CELLS{connection.maxLevel ? ` · LEVEL ${connection.maxLevel}` : ""}{connection.sharedCells ? ` · ${connection.sharedCells} SHARED` : ""}</span></footer>
            </div>;
          })}</div>
        </section>
        <section className="analysis-section station-analysis">
          <div className="analysis-section-title"><span>STATION NETWORKS</span><b>SUPPLY DEPOT → LOADED OUTBOUND → EMPTY RETURN</b></div>
          <div className="station-network-list">{analysis.stationNetworks.length ? analysis.stationNetworks.map((network) => <div className="station-network-card" key={network.network}>
            <div className="pipeline-head"><span><strong>{network.network}</strong><small>{network.kind} · {network.stations} stations · load {network.estimatedCarrierLoad.toFixed(2)}</small></span><b>{network.dispatchPolicy.toUpperCase()} · {network.fleets.reduce((sum, fleet) => sum + fleet.count, 0)} STATION-OWNED CARRIERS</b></div>
            <div className="station-route-list">{network.fleets.map((fleet) => {
              const measured = data.metrics?.stationFleets[`${network.network}:${fleet.station}`];
              return <div key={`fleet-${fleet.station}`}><span><b>{fleet.station}</b><small>{fleet.region} · HOME DEPOT · load {fleet.estimatedLoad.toFixed(2)}</small></span><code>{fleet.count}× {fleet.carrierAsset} · {((measured?.utilization ?? 0) * 100).toFixed(1)}% BUSY · {measured?.completedReturns ?? 0} RETURNS</code></div>;
            })}{network.stationEnergy.map((station) => {
              const measured = data.metrics?.stationEnergy[station.device];
              return <div key={`energy-${station.device}`}><span><b>{station.device}</b><small>{station.region} · CARRIER ENERGY BUFFER</small></span><code>{((measured?.storedMilliJoules ?? 0) / 1e6).toFixed(2)} / {(station.capacityMilliJoules / 1e6).toFixed(2)} MJ · {(station.chargeMilliWatts / 1000).toFixed(0)} W CHARGE</code></div>;
            })}{network.routes.length ? network.routes.map((route) => <div key={route.route}><span><b>{route.resource}{route.dispatchProfile.minimumTreatmentLevel ? `@${route.dispatchProfile.minimumTreatmentLevel}+` : ""}</b><small>{route.from}@{route.fromRegion} [{route.fromSlotCapacity}, keep {route.supplyReserve}] → {route.to}@{route.toRegion} [{route.toSlotCapacity}, target {route.demandTarget}] · P{route.demandPriority}/{route.supplyPriority}</small><small>{route.fleetSize}× {route.carrierAsset} at {route.from} · {route.dispatchProfile.targetKind} · {route.dispatchProfile.coverageUnit}/batch · depth {route.dispatchProfile.criticalDepth ?? "—"}{route.dispatchProfile.downstreamConnections.length ? ` · via ${route.dispatchProfile.downstreamConnections.join(" + ")}` : ""} · energy cap {route.energyLimitedItemsPerMinute.toFixed(1)}/min{route.highSpeed ? ` · high-speed ${route.highSpeed.enabled ? "ON" : "OFF"}` : ""}</small></span><code>{route.minimumBatch}-{route.batchCapacity}{route.carrierBatchCapacity !== route.batchCapacity ? ` / carrier ${route.carrierBatchCapacity}` : ""} · {route.travelTicks}ms OUT / {route.roundTripTicks}ms ROUND · {(route.missionEnergyMilliJoules / 1e6).toFixed(2)} MJ{route.highSpeed ? ` · agile ${route.standardRoundTripTicks}→${route.highSpeed.roundTripTicks}ms round / ${(route.standardMissionEnergyMilliJoules / 1e6).toFixed(2)}→${(route.highSpeed.missionEnergyMilliJoules / 1e6).toFixed(2)}MJ` : ""}</code></div>) : <small>NO MATCHED ROUTES</small>}</div>
          </div>) : <div className="diagnostics-clear"><i>·</i><span>NO STATION NETWORK</span></div>}</div>
        </section>
        <section className="analysis-section power-analysis">
          <div className="analysis-section-title"><span>POWER GRIDS</span><b>{analysis.powerAllocation.toUpperCase()}</b></div>
          <div className="power-grid-list">{analysis.powerGrids.length ? analysis.powerGrids.map((grid) => {
            const utilization = grid.productionMilliWatts ? Math.min(100, grid.ratedConsumptionMilliWatts / grid.productionMilliWatts * 100) : 100;
            const measuredStorage = data.metrics?.energyStorage[grid.grid];
            const measuredPower = data.metrics?.powerGrids[grid.grid];
            const tariff = data.electricityTariffs.find((item) => item.region === grid.region);
            const electricity = data.metrics?.electricityCosts.regions[grid.region];
            return <div className="power-grid-card" key={grid.grid}><div><strong>{grid.grid}</strong><code>{grid.region} · {grid.generators.map((generator) => `${generator.device} (${generator.kind}${generator.fuelResource ? `, ${generator.fuelPerMinute!.toFixed(2)} ${generator.fuelResource}/min` : ""})`).join(", ") || "no generator"}</code></div><span><b>{(grid.productionMilliWatts / 1000).toFixed(0)} W</b><small>RATED GEN</small></span><span><b>{(grid.idleConsumptionMilliWatts / 1000).toFixed(0)} W</b><small>IDLE LOAD</small></span><span><b>{(grid.ratedConsumptionMilliWatts / 1000).toFixed(0)} W</b><small>RATED LOAD</small></span><span className={(measuredPower?.unservedMilliJoules ?? 0) > 0 || grid.headroomMilliWatts < 0 ? "negative" : "positive"}><b>{measuredPower ? `${(measuredPower.unservedMilliJoules / 1e6).toFixed(2)} MJ` : `${(grid.headroomMilliWatts / 1000).toFixed(0)} W`}</b><small>{measuredPower ? "UNSERVED" : "HEADROOM"}</small></span><span><b>{grid.storageCapacityMilliJoules ? `${((measuredStorage?.storedMilliJoules ?? grid.initialStoredMilliJoules) / 1e6).toFixed(2)} MJ` : "—"}</b><small>STORED</small></span><div className="power-bar"><i style={{ width: `${utilization}%` }} /></div><footer>{measuredPower ? `SATISFACTION ${(measuredPower.averageSatisfactionPpm / 10_000).toFixed(1)}% AVG / ${(measuredPower.minimumSatisfactionPpm / 10_000).toFixed(1)}% MIN · MEASURED ${(measuredPower.generatedMilliJoules / 1e6).toFixed(2)} MJ GENERATED · ${(measuredPower.demandMilliJoules / 1e6).toFixed(2)} MJ DEMAND · ${(measuredPower.requiredStorageCapacityMilliJoules / 1e6).toFixed(2)} MJ STORAGE ENVELOPE · ` : ""}{tariff ? `TARIFF ${tariff.points.map((point) => `${(point.atTick / 1000).toFixed(0)}s@${(point.energyPriceMicroCurrencyPerKiloWattHour / 1e6).toFixed(3)}/kWh`).join(" · ")} · DEMAND ${(tariff.demandChargeMicroCurrencyPerKiloWatt / 1e6).toFixed(3)}/kW${electricity ? ` · COST ${(electricity.totalMicroCurrency / 1e6).toFixed(6)}` : ""} · ` : ""}{grid.members.length} DEVICES · {grid.storageDevices.length} ACCUMULATORS · {grid.transportStages.length} POWERED TRANSPORT STAGES</footer></div>;
          }) : <div className="diagnostics-clear"><i>!</i><span>NO POWER GRID</span></div>}</div>
        </section>
      </div>
    </section>
  </div>;
}

function ProjectLauncher({ index }: { index: ProjectIndex }) {
  return <div className="launcher-shell">
    <header className="launcher-header"><div className="brand"><div className="mark">INM</div><div><h1>Integrated Industry Maker</h1><p>PROJECT WORKSPACE</p></div></div><span className="engine-status"><i /> ENGINE READY</span></header>
    <section className="launcher-content">
      <div className="launcher-intro"><span className="eyebrow">{index.workspace ? "ENGINE WORKSPACE" : "STANDALONE PROJECT"}</span><h2>{index.name}</h2><p>Choose a self-contained industrial project. Its route, assets, runs, and simulation state remain isolated from every other project.</p></div>
      {index.projects.length ? <div className="project-grid">{index.projects.map((project) => <a className="project-card" href={projectPath(project.id)} key={project.id} data-testid={`project-${project.id}`}>
        <div className="project-card-top"><span className="project-monogram">{project.name.slice(0, 2).toUpperCase()}</span>{project.isDefault && <em>DEFAULT</em>}</div>
        <div className="project-diagram" aria-hidden="true"><i /><i /><i /><span /><span /></div>
        <h3>{project.name}</h3><code>/{project.id}</code>
        <div className="project-stats"><span><b>{project.deviceInstances}</b> devices</span><span><b>{project.resourceNodes}</b> deposits</span><span><b>{project.connections}</b> local links</span><span><b>{project.logisticsNetworks}</b> station nets</span><span><b>{project.deviceAssets + project.resourceAssets + project.processes}</b> catalog</span><span><b>{project.runs}</b> runs</span></div>
        <div className="project-card-footer"><span>{project.regions} INDUSTRIAL {project.regions === 1 ? "ZONE" : "ZONES"}</span><strong>OPEN PROJECT →</strong></div>
      </a>)}</div> : <div className="empty-projects"><span>NO PROJECTS</span><p>Create one with <code>inm project create</code>, then refresh this page.</p></div>}
    </section>
    <footer className="launcher-footer"><span>INM PRE-ALPHA</span><span>PROJECTS ARE SELF-CONTAINED</span></footer>
  </div>;
}

function ProjectLoading({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  return <div className="route-state"><div className="route-mark">INM</div><span>OPENING PROJECT</span><strong>{projectId}</strong><div className="loading-bar"><i /></div><button onClick={onBack}>← PROJECTS</button></div>;
}

function ProjectHeader({ indexName, data, overview, view, loading, onBack, onNavigate, onRefresh }: {
  indexName: string;
  data: StudioData;
  overview: ProjectWorkbenchSnapshot;
  view: StudioView;
  loading: boolean;
  onBack: () => void;
  onNavigate: (view: StudioView) => void;
  onRefresh: () => void;
}) {
  const tabs: Array<{ view: StudioView; label: string; count?: number }> = [
    { view: "overview", label: "OVERVIEW" },
    { view: "factory", label: "FACTORY" },
    { view: "runs", label: "RUNS", count: overview.counts.runs },
    { view: "designs", label: "DESIGN", count: overview.counts.designPrograms },
    { view: "experiments", label: "EXPERIMENTS", count: overview.counts.experiments },
    { view: "analysis", label: "ANALYSIS", count: overview.diagnostics.length },
    { view: "catalog", label: "CATALOG", count: overview.counts.resourceAssets + overview.counts.deviceAssets + overview.counts.processes + overview.counts.routes },
  ];
  const destination = (target: StudioView) => target === "overview" ? projectPath(data.projectId)
    : target === "catalog" ? catalogPath(data.projectId)
      : target === "analysis" ? analysisPath(data.projectId)
        : target === "designs" ? designPath(data.projectId)
        : target === "experiments" ? experimentPath(data.projectId)
          : target === "factory" ? factoryObjectPath(data.projectId)
            : viewPath(data.projectId, "runs");
  return <header className="project-header">
    <div className="header-project">
      <a className="back-button" href="/" onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onBack();
      }} aria-label="Back to projects">←</a>
      <div className="mark">INM</div>
      <div><div className="breadcrumb"><span>{indexName}</span><b>/</b><code>{data.projectId}</code></div><h1>{data.name}</h1></div>
    </div>
    <nav className="project-nav" aria-label="Project workbench">
      {tabs.map((tab) => <a href={destination(tab.view)} key={tab.view} data-testid={`view-${tab.view}`} aria-current={view === tab.view ? "page" : undefined} className={view === tab.view ? "active" : ""} onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onNavigate(tab.view);
      }}>{tab.label}{tab.count !== undefined && <b>{tab.count}</b>}</a>)}
    </nav>
    <div className="header-tools compact-tools">
      <span className="project-local"><i /> PROJECT LOCAL</span>
      <span className="hash">BP {(view === "factory" ? data.blueprintHash : overview.hashes.blueprintHash).slice(0, 10)}</span>
      <button onClick={onRefresh}>{loading ? "SYNCING" : "REFRESH"}</button>
    </div>
  </header>;
}

function CopyButton({ text, label = "COPY CLI", testId }: { text: string; label?: string; testId?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.setTimeout(() => setStatus("idle"), 1_600);
  };
  return <button className={status === "copied" ? "copy-confirmed" : status === "failed" ? "copy-failed" : ""} data-testid={testId} onClick={() => { void copy(); }} aria-live="polite">{status === "copied" ? "COPIED ✓" : status === "failed" ? "COPY FAILED" : label}</button>;
}

function operationCli(snapshot: ProjectWorkbenchSnapshot, operation: WorkbenchOperationDescriptor): string {
  const argument = (value: string) => /^[a-zA-Z0-9_./:@+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
  const root = argument(snapshot.project.rootDir);
  const selection = `--world ${argument(snapshot.selection.world.id)} --blueprint ${argument(snapshot.selection.blueprint.id)} --scenario ${argument(snapshot.selection.scenario.id)} --objective ${argument(snapshot.selection.objective.id)}`;
  if (operation.id === "benchmark.evaluate") return `inm benchmark ${root} --benchmark ${argument(snapshot.experiments.find((item) => item.locked)?.id ?? "<benchmark-id>")} --json`;
  if (operation.id === "candidate.preview" || operation.id === "candidate.apply") return `inm candidate ${root} --candidate ${argument(snapshot.candidates[0]?.id ?? "<candidate-id>")}${operation.id === "candidate.apply" ? " --apply" : ""} --json`;
  if (operation.id === "design.run") {
    const program = snapshot.designPrograms.find((item) => item.alignment.state === "aligned") ?? snapshot.designPrograms.find((item) => item.locked);
    return `inm design ${root} --program ${argument(program?.id ?? "<program-id>")} --run --max-candidates ${program?.budget.maxCandidates ?? "<candidate-budget>"} --json`;
  }
  if (operation.id === "synthesize") return `inm synthesize ${root} ${selection} --output '<new-blueprint-id>' --json`;
  return `inm ${operation.id} ${root} ${selection} --json`;
}

function OperationResultDialog({ result, cli, onClose }: { result: ProjectOperationResult<unknown>; cli: string; onClose: () => void }) {
  const data = result.data as Record<string, unknown>;
  const analysis = result.operation === "analyze" ? data as { diagnostics?: unknown[]; devices?: unknown[]; connections?: unknown[]; powerGrids?: unknown[] } : null;
  const plan = result.operation === "plan" ? data as { ready?: boolean; gaps?: unknown[]; targetRatePerMinute?: number; targetResource?: string } : null;
  const simulation = result.operation === "simulate" ? data as { cached?: boolean; run?: { id?: string; path?: string }; resultHash?: string; metrics?: { finalScore?: number; throughputPerMinute?: number; bottleneckEntity?: string | null; deliveryPortfolio?: { fulfillment?: number } } } : null;
  const validation = result.operation === "validate" ? data as { valid?: boolean; devices?: number; connections?: number; regions?: number; resourceNodes?: number } : null;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="operation-result" role="dialog" aria-modal="true" aria-label={`Operation result: ${result.operation}`} data-testid={`operation-result-${result.operation}`}>
      <header><div><span className="eyebrow">SHARED CORE OPERATION</span><h2>{result.operation}</h2><p>{result.effect} · {result.status} in {result.durationMs.toFixed(1)} ms</p></div><button className="icon-button" onClick={onClose} aria-label="Close operation result">×</button></header>
      <div className="operation-context">
        <div><small>SELECTION</small><strong>{result.context.selection.blueprint}</strong><code>{result.context.selection.world} / {result.context.selection.scenario} / {result.context.selection.objective}</code></div>
        <div><small>INPUT HASH</small><strong>{result.context.hashes.engineVersion}</strong><code>{result.context.hashes.blueprintHash.slice(0, 16)}</code></div>
        <div><small>ACTUAL WRITE SET</small><strong>{result.writeSet.length ? `${result.writeSet.length} WRITTEN` : "READ ONLY"}</strong><code>{result.writeSet.join(" · ") || "no project files"}</code></div>
      </div>
      <div className="operation-result-body">
        <section className="operation-outcome"><span className="eyebrow">OUTCOME</span>
          {validation && <><strong>{validation.valid ? "PROJECT VALID" : "INVALID"}</strong><p>{validation.regions} zones · {validation.resourceNodes} deposits · {validation.devices} devices · {validation.connections} links</p></>}
          {analysis && <><strong>{analysis.diagnostics?.length ?? 0} DIAGNOSTICS</strong><p>{analysis.devices?.length ?? 0} production bindings · {analysis.connections?.length ?? 0} logistics links · {analysis.powerGrids?.length ?? 0} power grids</p></>}
          {plan && <><strong>{plan.ready ? "CAPACITY READY" : `${plan.gaps?.length ?? 0} CAPACITY GAPS`}</strong><p>{plan.targetRatePerMinute} {plan.targetResource}/min requested</p></>}
          {simulation && <><strong>{simulation.cached ? "IMMUTABLE RUN REUSED" : "IMMUTABLE RUN CREATED"}</strong><p>{simulation.run?.id} · score {simulation.metrics?.finalScore?.toFixed(3)} · throughput {simulation.metrics?.throughputPerMinute?.toFixed(3)}/min</p><code>{simulation.resultHash}</code></>}
        </section>
        <section className="operation-evidence"><span className="eyebrow">EVIDENCE</span><div><b>{result.diagnostics.length}</b><small>DIAGNOSTICS</small></div><div><b>{result.artifacts.length}</b><small>ARTIFACTS</small></div>{result.artifacts.map((artifact) => <code key={artifact.path}>{artifact.kind}:{artifact.id} · {artifact.path}</code>)}</section>
        <section className="operation-verify"><span className="eyebrow">VERIFY NEXT</span>{result.verification.map((item) => <div key={item.id}><strong>{item.id}</strong><p>{item.description}</p></div>)}</section>
        <section className="operation-cli"><span className="eyebrow">EXACT CLI REPRODUCTION</span><code>{cli}</code><CopyButton text={cli} label="COPY COMMAND" testId={`copy-result-${result.operation}`} /></section>
      </div>
    </section>
  </div>;
}

function ProjectOverview({ snapshot, onNavigate, onDiagnostic, onDiagnosticFocus, onExperiment, onCandidate, onDesign, onRun, onOperation }: {
  snapshot: ProjectWorkbenchSnapshot;
  onNavigate: (view: StudioView) => void;
  onDiagnostic: (diagnostic: WorkbenchDiagnostic) => void;
  onDiagnosticFocus: (diagnosticId: string) => void;
  onExperiment: (id: string) => void;
  onCandidate: (benchmarkId: string, candidateId: string) => void;
  onDesign: (programId: string, runId?: string) => void;
  onRun: (runId: string) => void;
  onOperation: (operation: WorkbenchOperationDescriptor, cli: string) => void;
}) {
  const latestRun = snapshot.runs.at(-1);
  const priority = snapshot.diagnostics.slice(0, 4);
  const availableOperations = snapshot.operations.filter((operation) => operation.availability.state !== "unavailable");
  const recommendation = snapshot.nextAction;
  const qTimeContributors = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "q-time")?.contributors ?? [];
  const inputStarvationContributors = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "input-starvation")?.contributors ?? [];
  const transportContributors = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "transport-blocking")?.contributors ?? [];
  const qualityContributors = snapshot.lossAttribution?.buckets.find((bucket) => bucket.id === "yield-quality")?.contributors ?? [];
  const wipContributors = snapshot.inventoryAccounting
    ? Object.entries(snapshot.inventoryAccounting.resources)
      .filter(([, accounting]) => accounting.includedInWip && accounting.averageInventory > 0)
      .sort(([, left], [, right]) => right.averageInventory - left.averageInventory)
    : [];
  const contributorMechanismLabel = (mechanism: (typeof qTimeContributors)[number]["mechanism"]) => ({
    "batch-companion-wait": "BATCH COMPANION WAIT",
    "maintenance-qualification": "MAINTENANCE + QUALIFICATION",
    "equipment-availability": "EQUIPMENT AVAILABILITY",
    "inter-job-input-gap": "INTER-JOB INPUT GAP",
    "physical-lane-blocking": "PHYSICAL LANE BLOCKING",
    "quality-excursion": "AUTHORED QUALITY EXCURSION",
    "equipment-process-drift": "EQUIPMENT PROCESS DRIFT",
    "route-q-time-defect": "ROUTE Q-TIME DEFECT",
  })[mechanism];
  const followRecommendation = (target: WorkbenchNextActionTarget) => {
    if (target.kind === "diagnostic") {
      onDiagnosticFocus(target.diagnosticId);
      return;
    }
    if (target.kind === "candidate") { onCandidate(target.benchmarkId, target.candidateId); return; }
    if (target.kind === "design-program") { onDesign(target.programId); return; }
    if (target.kind === "design-run") { onDesign(target.programId, target.runId); return; }
    if (target.kind === "run") { onRun(target.runId); return; }
    const operation = snapshot.operations.find((item) => item.id === target.operationId);
    if (operation) onOperation(operation, operationCli(snapshot, operation));
  };
  return <section className="overview-page" aria-label="Project overview">
    <div className="overview-hero">
      <div className="overview-hero-copy"><span className="eyebrow">INDUSTRIAL PROGRAM</span><h2>{snapshot.selection.objective.name}</h2><p>Deliver <strong>{snapshot.objective.targetRatePerMinute} {snapshot.objective.targetResource}/min</strong> into <strong>{snapshot.objective.targetRegion}</strong> under {snapshot.selection.scenario.name}.</p><div className="decision-status" aria-label="Project decision status">
        <span className={snapshot.status.capacity.state}><small>CAPACITY</small><b>{snapshot.status.capacity.state.toUpperCase()}</b>{snapshot.status.capacity.gapCount > 0 && <em>{snapshot.status.capacity.gapCount} GAPS</em>}</span>
        <span className={snapshot.status.flow.state}><small>FLOW</small><b>{snapshot.status.flow.state.toUpperCase()}</b>{snapshot.status.flow.warningCount > 0 && <em>{snapshot.status.flow.warningCount} RISKS</em>}</span>
        <span className={snapshot.status.review.state}><small>REVIEW</small><b>{snapshot.status.review.state.toUpperCase()}</b>{snapshot.status.review.pendingCount > 0 && <em>{snapshot.status.review.pendingCount} PENDING</em>}{snapshot.status.review.staleCount > 0 && <em>{snapshot.status.review.staleCount} STALE</em>}</span>
        <span className={snapshot.status.evidence.state}><small>EVIDENCE</small><b>{snapshot.status.evidence.state.toUpperCase()}</b>{snapshot.status.evidence.runId && <em>{snapshot.status.evidence.runId}</em>}</span>
      </div><div className="hero-footprint"><span>{snapshot.counts.regions} ZONES</span><span>{snapshot.counts.deviceInstances} DEVICES</span><span>{snapshot.counts.connections} LINKS</span><span>{snapshot.counts.powerGrids} GRIDS</span></div></div>
      <div className={`readiness-orbit ${snapshot.status.capacity.state}`}><span>{snapshot.status.capacity.state === "ready" ? "READY" : snapshot.status.capacity.gapCount}</span><small>{snapshot.status.capacity.state === "ready" ? "CAPACITY PROVISIONED" : "CAPACITY GAPS"}</small></div>
    </div>
    <section className={`operator-recommendation ${recommendation.tone}`} data-testid="operator-recommendation" data-recommendation-id={recommendation.id}>
      <div className="recommendation-index"><span>01</span><small>NEXT BEST ACTION</small></div>
      <div className="recommendation-copy"><span className="eyebrow">OPERATOR BRIEF</span><h3>{recommendation.title}</h3><p>{recommendation.reason}</p></div>
      <button data-testid="recommendation-action" onClick={() => followRecommendation(recommendation.target)}>{recommendation.actionLabel}<b>→</b></button>
    </section>
    <details className="selection-disclosure">
      <summary data-testid="effective-selection"><span><small>EFFECTIVE SELECTION</small><strong>{snapshot.selection.blueprint.id}</strong></span><code>{snapshot.selection.world.id} / {snapshot.selection.scenario.id} / {snapshot.selection.objective.id}</code><b>CONTEXT + HASHES</b></summary>
      <div className="selection-strip" aria-label="Effective project selection">
        {(["world", "blueprint", "scenario", "objective"] as const).map((key) => <div key={key}><small>{key.toUpperCase()}</small><strong>{snapshot.selection[key].name}</strong><code>{snapshot.selection[key].id}</code></div>)}
        <div><small>INPUT IDENTITY</small><strong>{snapshot.hashes.engineVersion}</strong><code>{snapshot.hashes.blueprintHash.slice(0, 12)} · {snapshot.hashes.objectiveHash.slice(0, 12)}</code></div>
      </div>
    </details>
    <div className="overview-grid">
      <section className="overview-panel priority-panel">
        <header><div><span className="eyebrow">ACTIVE WORK QUEUE</span><h3>Priority issues</h3></div><button onClick={() => onNavigate("analysis")}>ALL {snapshot.diagnostics.length} →</button></header>
        <div className="overview-diagnostics">{priority.length ? priority.map((diagnostic) => <button key={diagnostic.id} className={diagnostic.severity} data-diagnostic-id={diagnostic.id} data-testid={`diagnostic-${diagnostic.id}`} onClick={() => onDiagnostic(diagnostic)}>
          <span>{diagnostic.severity === "blocking" ? "!" : diagnostic.severity === "warning" ? "△" : "·"}</span><div><code>{diagnostic.code}</code><strong>{diagnostic.message}</strong><small>{diagnostic.subjects.map((subject) => `${subject.kind}:${subject.id}`).join(" · ")}</small></div><b>→</b>
        </button>) : <div className="overview-empty positive"><b>✓</b><span>No static readiness or analysis issue is open.</span></div>}</div>
      </section>
      {snapshot.lossAttribution && <section className="overview-panel fab-loss-panel" data-testid="fab-loss-attribution">
        <header><div><span className="eyebrow">COMPATIBLE RUN · {snapshot.lossAttribution.run.id}</span><h3>Realized fab loss chain</h3></div><b>{snapshot.lossAttribution.outcome.completed}/{snapshot.lossAttribution.outcome.scheduled}<small> LOTS COMPLETE</small></b></header>
        <div className="fab-loss-chain">{snapshot.lossAttribution.buckets.slice(0, 5).map((bucket, index) => <div key={bucket.id} className={index === 0 ? "primary" : ""}><em>{String(index + 1).padStart(2, "0")}</em><span><strong>{bucket.label}</strong><small>{bucket.summary}</small></span><b>{bucket.score.toFixed(4)}</b></div>)}</div>
        {qualityContributors.length > 0 && <div className="q-time-contributors quality-contributors" data-testid="quality-origin-contributors">
          <header><span className="eyebrow">QUALITY-ORIGIN CONTRIBUTORS</span><small>Observed defect origins followed through inspection, rework, persistence, scrap, and escape</small></header>
          <div>{qualityContributors.slice(0, 5).map((contributor) => <article key={contributor.id} data-testid={`quality-origin-contributor-${contributor.label}`}>
            <span><small>{contributorMechanismLabel(contributor.mechanism)}</small><strong>{contributor.label}</strong><code>{contributor.processes.join(" + ")} · {contributor.defects.join(" + ")}</code></span>
            <span><b>{contributor.evidence.introducedLots}</b><small>{contributor.evidence.introducedLots === 1 ? "LOT" : "LOTS"} / {contributor.evidence.introducedDefectInstances} {contributor.evidence.introducedDefectInstances === 1 ? "DEFECT" : "DEFECTS"}</small></span>
            <span><b>{contributor.evidence.reworkAttemptedLots} / {contributor.evidence.persistentLots}</b><small>REWORK / PERSISTENT</small></span>
            <span><b>{contributor.evidence.scrappedLots} / {contributor.evidence.escapedLots}</b><small>SCRAP / ESCAPE</small></span>
            <code>{contributor.subjects.filter((subject) => subject.kind === "device").map((subject) => subject.id).join(" · ")} · {contributor.lots.join(" · ")} · {contributor.evidence.repairedLots} repaired</code>
          </article>)}</div>
        </div>}
        {inputStarvationContributors.length > 0 && <div className="q-time-contributors starvation-contributors" data-testid="input-starvation-contributors">
          <header><span className="eyebrow">INPUT-GAP CONTRIBUTORS</span><small>Event-backed gaps inside repeated production opportunity · top {Math.min(5, inputStarvationContributors.length)} of {inputStarvationContributors.length}</small></header>
          <div>{inputStarvationContributors.slice(0, 5).map((contributor) => <article key={contributor.id} data-testid={`input-starvation-contributor-${contributor.label}`}>
            <span><small>INTER-JOB INPUT GAP</small><strong>{contributor.label}</strong><code>{contributor.processes.join(" + ")}</code></span>
            <span><b>{(contributor.evidence.starvationTicks! / 1000).toFixed(1)}s</b><small>INPUT GAP</small></span>
            <span><b>{(contributor.evidence.opportunityWindowTicks! / 1000).toFixed(1)}s</b><small>OPPORTUNITY</small></span>
            <span><b>{(contributor.evidence.unavailableGapTicks! / 1000).toFixed(1)}s</b><small>OTHER UNAVAILABILITY</small></span>
            <code>{contributor.evidence.jobs} jobs · {(contributor.evidence.utilization! * 100).toFixed(1)}% utilization · {(contributor.evidence.boundaryWaitingInputTicks! / 1000).toFixed(1)}s boundary wait excluded</code>
          </article>)}</div>
        </div>}
        {transportContributors.length > 0 && <div className="q-time-contributors transport-contributors" data-testid="transport-blocking-contributors">
          <header><span className="eyebrow">TRANSPORT-BLOCKING CONTRIBUTORS</span><small>Only measured physical backpressure is ranked; necessary transit remains context</small></header>
          <div>{transportContributors.slice(0, 5).map((contributor) => <article key={contributor.id} data-testid={`transport-blocking-contributor-${contributor.label}`}>
            <span><small>PHYSICAL LANE BLOCKING</small><strong>{contributor.label}</strong><code>{contributor.resources.join(" + ") || "no delivered resources"}</code></span>
            <span><b>{(contributor.evidence.blockedItemTicks! / 1000).toFixed(1)}s</b><small>BLOCKED ITEM-TIME</small></span>
            <span><b>{(contributor.evidence.blockedFraction! * 100).toFixed(1)}%</b><small>IN-FLIGHT BLOCKING</small></span>
            <span><b>{contributor.evidence.deliveredItemsPerMinute!.toFixed(1)}</b><small>/ {contributor.evidence.capacityItemsPerMinute!.toFixed(1)} ITEMS/MIN</small></span>
            <code>{contributor.evidence.deliveredItems} delivered · {contributor.evidence.averageInFlightItems!.toFixed(2)} average in flight</code>
          </article>)}</div>
        </div>}
        {qTimeContributors.length > 0 && <div className="q-time-contributors" data-testid="q-time-contributors">
          <header><span className="eyebrow">Q-TIME CONTRIBUTORS</span><small>Exact event-backed step, equipment, lot, and wait evidence</small></header>
          <div>{qTimeContributors.map((contributor) => <article key={contributor.id} data-testid={`q-time-contributor-${contributor.step ?? contributor.label}`}>
            <span><small>{contributorMechanismLabel(contributor.mechanism)}</small><strong>{contributor.step ?? contributor.label}</strong><code>{[contributor.route, contributor.processes.join(" + ")].filter(Boolean).join(" · ")}</code></span>
            <span><b>{contributor.evidence.violatedLots}</b><small>{contributor.evidence.violatedLots === 1 ? "LOT" : "LOTS"} / {contributor.evidence.violations} {contributor.evidence.violations === 1 ? "VISIT" : "VISITS"}</small></span>
            <span><b>{(contributor.evidence.meanQueueTicks! / 1000).toFixed(1)}s</b><small>MEAN / {(contributor.evidence.limitTicks! / 1000).toFixed(1)}s LIMIT</small></span>
            <span><b>+{(contributor.evidence.totalOverrunTicks! / 1000).toFixed(1)}s</b><small>TOTAL OVERRUN</small></span>
            <code>{contributor.subjects.filter((subject) => subject.kind === "device").map((subject) => subject.id).join(" · ")}</code>
          </article>)}</div>
        </div>}
        <footer><span>FIRST-PASS YIELD {(snapshot.lossAttribution.outcome.firstPassYield * 100).toFixed(1)}%</span><span>CONTRACTS {(snapshot.lossAttribution.outcome.contractFulfillment * 100).toFixed(1)}%</span><small>Ranking signals overlap; they are not additive lost output.</small></footer>
      </section>}
      <section className="overview-panel inventory-panel" data-testid="objective-inventory-accounting">
        <header><div><span className="eyebrow">OBJECTIVE ACCOUNTING{snapshot.inventoryAccounting ? ` · ${snapshot.inventoryAccounting.runId}` : ""}</span><h3>Scored work in process</h3></div>{snapshot.inventoryAccounting && <b>{snapshot.inventoryAccounting.averageWip.toFixed(2)}<small> AVG WIP</small></b>}</header>
        {snapshot.inventoryAccounting ? <>
          <div className="contract-list">{wipContributors.slice(0, 6).map(([resource, accounting]) => <div key={resource}><span><strong>{resource}</strong><code>{accounting.finalInventory.toFixed(2)} final · {accounting.peakInventory.toFixed(2)} peak</code></span><b>{accounting.averageInventory.toFixed(2)}<small> AVG</small></b></div>)}</div>
          <footer><span>{snapshot.inventoryAccounting.averageTotalInventory.toFixed(2)} average total inventory</span><span>{snapshot.inventoryAccounting.averageExcludedInventory.toFixed(2)} excluded</span><span>{snapshot.inventoryAccounting.peakWip.toFixed(2)} peak WIP</span></footer>
        </> : <div className="overview-empty"><span>Create a compatible immutable run to measure the Objective's WIP scope.</span></div>}
        <code>{snapshot.objective.wipResources.join(" · ") || "Objective scores no Resource inventory as WIP"}</code>
      </section>
      <section className="overview-panel contracts-panel">
        <header><div><span className="eyebrow">INDUSTRIAL OUTCOME</span><h3>Delivery contracts</h3></div></header>
        <div className="contract-list">{snapshot.objective.deliveryContracts.map((contract) => <div key={contract.id}><span><strong>{contract.id}</strong><code>{contract.resource} → {contract.region}</code></span><b>{contract.demandPerMinute.toFixed(2)}<small>/ MIN</small></b></div>)}</div>
        <footer><span>{snapshot.counts.regions} zones</span><span>{snapshot.counts.deviceInstances} devices</span><span>{snapshot.counts.connections} local links</span><span>{snapshot.counts.powerGrids} power grids</span></footer>
      </section>
      <section className="overview-panel evidence-panel">
        <header><div><span className="eyebrow">RECENT EVIDENCE</span><h3>Runs and experiments</h3></div><button onClick={() => onNavigate("runs")}>ALL RUNS →</button></header>
        {latestRun ? <button className="latest-run" onClick={() => onRun(latestRun.id)}><span><small>LATEST IMMUTABLE RUN</small><strong>{latestRun.id}</strong><code>{latestRun.selection.blueprint} · {latestRun.decision} · {latestRun.resultHash.slice(0, 12)}</code></span><b>{latestRun.score.toFixed(2)}</b></button> : <div className="overview-empty"><span>No completed run exists. Use the recommended simulation action to create evidence.</span></div>}
        <div className="experiment-shortlist">{snapshot.experiments.slice(0, 2).map((experiment) => <button key={experiment.id} onClick={() => onExperiment(experiment.id)}><span><strong>{experiment.name}</strong><code>{experiment.id} · {experiment.cases.length} cases</code></span><b>{experiment.locked ? "LOCKED" : "UNLOCKED"}</b></button>)}</div>
      </section>
      <section className="overview-panel candidates-panel">
        <header><div><span className="eyebrow">REVIEW QUEUE</span><h3>Candidate proposals</h3></div><button onClick={() => onNavigate("experiments")}>EXPERIMENTS →</button></header>
        {snapshot.candidates.length ? snapshot.candidates.slice(0, 3).map((candidate) => <button className="candidate-short" key={candidate.id} onClick={() => onCandidate(candidate.benchmark, candidate.id)}><span><strong>{candidate.name}</strong><small>{candidate.hypothesis}</small><code>{candidate.patchOperations} patch ops · {candidate.decision.state.toUpperCase()} · {candidate.decision.currentCandidateHash.slice(0, 12)}</code></span><b>{candidate.decision.state === "reviewed-keep" ? "APPLY →" : candidate.decision.state === "verified" ? "VERIFIED →" : candidate.decision.state === "stale" ? "STALE →" : "REVIEW →"}</b></button>) : <div className="overview-empty"><span>No Candidate Change Set is waiting for review.</span></div>}
      </section>
      <details className="overview-panel operations-panel">
        <summary><div><span className="eyebrow">ADVANCED CONTROL</span><h3>Shared Core operations</h3><p>Inspect effects, guards, and exact CLI reproduction.</p></div><span><b>{availableOperations.length}</b> AVAILABLE <i>+</i></span></summary>
        <div className="operation-grid">{availableOperations.map((operation) => {
          const cli = operationCli(snapshot, operation);
          const runnable = ["validate", "analyze", "plan", "simulate"].includes(operation.id);
          const review = operation.id.startsWith("candidate") || operation.id === "benchmark.evaluate";
          const design = operation.id === "design.run";
          const current = operation.id === "inspect";
          const available = operation.availability.state !== "unavailable";
          const designProgram = snapshot.designPrograms.find((item) => item.alignment.state === "aligned") ?? snapshot.designPrograms.find((item) => item.locked);
          const action = runnable ? () => onOperation(operation, cli) : review ? () => onNavigate("experiments") : design && designProgram ? () => onDesign(designProgram.id, designProgram.evidence.authorityRunId ?? undefined) : () => { void navigator.clipboard.writeText(cli); };
          const description = operation.availability.state === "conditional" ? operation.availability.reasons[0] : operation.description;
          return <article key={operation.id} data-operation-id={operation.id} data-testid={`operation-${operation.id}`}><span className={operation.effect}>{operation.effect}</span><strong>{operation.label}</strong><p>{description}</p><code>{operation.selectionAware ? "CURRENT SELECTION" : "PROJECT WIDE"}{operation.guards.length ? ` · ${operation.guards.join(" + ")}` : ""}</code><div><button disabled={current || !available} onClick={action}>{!available ? "UNAVAILABLE" : runnable ? "RUN OPERATION" : review ? "OPEN WORKBENCH" : design ? operation.availability.state === "conditional" ? "REVIEW CURRENT RUN" : "OPEN DESIGN" : current ? "CURRENT VIEW" : "COPY CLI TEMPLATE"}</button><CopyButton text={cli} testId={`copy-operation-${operation.id}`} /></div></article>;
        })}</div>
      </details>
    </div>
  </section>;
}

function RunsOverview({ snapshot, onOpenFactory }: { snapshot: ProjectWorkbenchSnapshot; onOpenFactory: (runId: string) => void }) {
  return <section className="runs-page" aria-label="Project runs">
    <header><span className="eyebrow">IMMUTABLE EVIDENCE</span><h2>Simulation runs</h2><p>Every result is reconstructed from project files; browser memory is not authoritative.</p></header>
    {snapshot.runs.length ? <div className="runs-table"><div className="runs-head"><span>RUN</span><span>SELECTION</span><span>DECISION</span><span>SCORE</span><span>RESULT HASH</span></div>{[...snapshot.runs].reverse().map((run) => <button key={run.id} data-testid={`run-${run.id}`} onClick={() => onOpenFactory(run.id)}><strong>{run.id}</strong><span>{run.selection.blueprint}<small>{run.selection.world} / {run.selection.scenario} / {run.selection.objective}</small></span><b className={run.decision.toLowerCase()}>{run.decision}</b><em>{run.score.toFixed(3)}</em><code>{run.resultHash.slice(0, 16)}</code></button>)}</div> : <div className="runs-empty"><b>NO COMPLETED RUNS</b><p>Run <code>inm simulate {snapshot.project.rootDir} --json</code>, then refresh.</p></div>}
  </section>;
}

function App() {
  const initialRoute = useMemo(() => studioRoute(), []);
  const [routeProject, setRouteProject] = useState<string | null>(initialRoute.projectId);
  const [routeView, setRouteView] = useState<StudioView>(initialRoute.view);
  const [routeExperiment, setRouteExperiment] = useState<string | null>(initialRoute.experimentId);
  const [routeCandidate, setRouteCandidate] = useState<string | null>(initialRoute.candidateId);
  const [routeDesignProgram, setRouteDesignProgram] = useState<string | null>(initialRoute.designProgramId);
  const [routeDesignRun, setRouteDesignRun] = useState<string | null>(initialRoute.designRunId);
  const [routeAssetKind, setRouteAssetKind] = useState<AssetKind | null>(initialRoute.assetKind);
  const [routeAssetId, setRouteAssetId] = useState<string | null>(initialRoute.assetId);
  const [routeDiagnostic, setRouteDiagnostic] = useState<string | null>(initialRoute.diagnosticId);
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [data, setData] = useState<StudioData | null>(null);
  const [overview, setOverview] = useState<ProjectWorkbenchSnapshot | null>(null);
  const [run, setRun] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<{ id: string; cli: string } | null>(null);
  const [operationResult, setOperationResult] = useState<ProjectOperationResult<unknown> | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [selection, setSelection] = useState<StudioSelection | null>(initialRoute.selection);
  const [factoryPresentationRequest, setFactoryPresentationRequest] = useState<FactoryPresentationRequest>("auto");
  const [factoryPresentationMode, setFactoryPresentationMode] = useState<FactoryPresentationPolicy["mode"]>(initialRoute.selection ? "selection" : "overview");
  const runRef = useRef<string | null>(null);
  const projectRef = useRef<string | null>(routeProject);
  const requestSequence = useRef(0);

  const loadIndex = useCallback(async () => {
    try { setIndex(await responseJson<ProjectIndex>(await fetch("/api/projects"))); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  }, []);

  const loadProject = useCallback(async (projectId: string, selectedRun?: string | null) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const query = selectedRun ? `?run=${encodeURIComponent(selectedRun)}` : "";
      const next = await responseJson<StudioData>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/data${query}`));
      const overviewQuery = new URLSearchParams(next.selection).toString();
      const nextOverview = await responseJson<ProjectWorkbenchSnapshot>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/overview?${overviewQuery}`));
      if (sequence !== requestSequence.current) return;
      setData(next);
      setOverview(nextOverview);
      setSelection((current) => normalizeStudioSelection(next, current ?? studioRoute().selection));
      setRun(next.selectedRun);
      runRef.current = next.selectedRun;
      projectRef.current = next.projectId;
      setTick(0);
      setPlaying(false);
    } catch (nextError) {
      if (sequence === requestSequence.current) setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const navigateProject = useCallback((projectId: string | null) => {
    window.history.pushState({}, "", projectId ? projectPath(projectId) : "/");
    projectRef.current = projectId;
    runRef.current = null;
    setRouteProject(projectId);
    setRouteView("overview");
    setRouteExperiment(null);
    setRouteCandidate(null);
    setRouteDesignProgram(null);
    setRouteDesignRun(null);
    setRouteAssetKind(null);
    setRouteAssetId(null);
    setRouteDiagnostic(null);
    setSelection(null);
    setError(null);
    if (!projectId) {
      requestSequence.current += 1;
      setData(null);
      setOverview(null);
      setLoading(false);
    }
  }, []);

  const navigateView = useCallback((view: StudioView) => {
    if (!routeProject) return;
    const path = view === "overview" ? projectPath(routeProject)
      : view === "experiments" ? experimentPath(routeProject)
        : view === "designs" ? designPath(routeProject)
        : view === "catalog" ? catalogPath(routeProject)
          : view === "analysis" ? analysisPath(routeProject)
            : view === "factory" ? factoryObjectPath(routeProject)
              : viewPath(routeProject, "runs");
    if (path === window.location.pathname) return;
    const overlay = view === "catalog" || view === "analysis" || view === "experiments" || view === "designs";
    const currentOverlay = routeView === "catalog" || routeView === "analysis" || routeView === "experiments" || routeView === "designs";
    const state = overlay ? currentOverlay ? window.history.state : { inmOverlayFrom: window.location.pathname } : {};
    if (currentOverlay) window.history.replaceState(overlay ? state : {}, "", path);
    else window.history.pushState(state, "", path);
    setRouteView(view); setRouteExperiment(view === "experiments" ? "" : null); setRouteCandidate(null);
    setRouteDesignProgram(view === "designs" ? "" : null); setRouteDesignRun(null);
    setRouteAssetKind(null); setRouteAssetId(null); setRouteDiagnostic(null); setSelection(null);
  }, [routeProject, routeView]);

  const closeRouteSurface = useCallback(() => {
    if (!routeProject) return;
    const path = overlayReturnPath(routeProject, window.history.state) ?? projectPath(routeProject);
    const nextRoute = studioRoute(path);
    window.history.replaceState({}, "", path);
    setRouteView(nextRoute.view); setRouteExperiment(nextRoute.experimentId); setRouteCandidate(nextRoute.candidateId);
    setRouteDesignProgram(nextRoute.designProgramId); setRouteDesignRun(nextRoute.designRunId);
    setRouteAssetKind(nextRoute.assetKind); setRouteAssetId(nextRoute.assetId); setRouteDiagnostic(nextRoute.diagnosticId); setSelection(nextRoute.selection);
  }, [routeProject]);

  const navigateExperiment = useCallback((experimentId: string | null) => {
    if (!routeProject) return;
    if (experimentId === null) { closeRouteSurface(); return; }
    const state = routeView === "experiments" ? window.history.state : { inmOverlayFrom: window.location.pathname };
    window.history.pushState(state, "", experimentPath(routeProject, experimentId || undefined));
    setRouteView(experimentId === null ? "overview" : "experiments");
    setRouteExperiment(experimentId);
    setRouteCandidate(null);
    setRouteAssetKind(null); setRouteAssetId(null); setRouteDiagnostic(null);
    setSelection(null);
    setFactoryPresentationRequest("auto");
  }, [closeRouteSurface, routeProject, routeView]);

  const navigateCandidate = useCallback((candidateId: string | null) => {
    if (!routeProject || !routeExperiment) return;
    window.history.pushState(window.history.state, "", experimentPath(routeProject, routeExperiment, candidateId || undefined));
    setRouteCandidate(candidateId);
  }, [routeExperiment, routeProject]);

  const navigateCandidateDirect = useCallback((experimentId: string, candidateId: string) => {
    if (!routeProject) return;
    window.history.pushState({ inmOverlayFrom: window.location.pathname }, "", experimentPath(routeProject, experimentId, candidateId));
    setRouteView("experiments"); setRouteExperiment(experimentId); setRouteCandidate(candidateId);
  }, [routeProject]);

  const navigateDesignProgram = useCallback((programId: string) => {
    if (!routeProject) return;
    const state = routeView === "designs" ? window.history.state : { inmOverlayFrom: window.location.pathname };
    window.history.pushState(state, "", designPath(routeProject, programId));
    setRouteView("designs"); setRouteDesignProgram(programId); setRouteDesignRun(null);
    setRouteExperiment(null); setRouteCandidate(null); setRouteAssetKind(null); setRouteAssetId(null); setRouteDiagnostic(null); setSelection(null);
  }, [routeProject, routeView]);

  const navigateDesignRun = useCallback((runId: string | null) => {
    if (!routeProject || !routeDesignProgram) return;
    window.history.pushState(window.history.state, "", designPath(routeProject, routeDesignProgram, runId ?? undefined));
    setRouteDesignRun(runId);
  }, [routeDesignProgram, routeProject]);

  const navigateDesignSource = useCallback((programId: string, runId: string) => {
    if (!routeProject) return;
    window.history.pushState(window.history.state, "", designPath(routeProject, programId, runId));
    setRouteView("designs"); setRouteDesignProgram(programId); setRouteDesignRun(runId);
    setRouteExperiment(null); setRouteCandidate(null);
  }, [routeProject]);

  const navigateCatalog = useCallback((kind: AssetKind, assetId: string | null) => {
    if (!routeProject) return;
    window.history.replaceState(window.history.state, "", catalogPath(routeProject, kind, assetId));
    setRouteView("catalog"); setRouteAssetKind(kind); setRouteAssetId(assetId);
  }, [routeProject]);

  const navigateAnalysisDiagnostic = useCallback((diagnosticId: string | null) => {
    if (!routeProject) return;
    const state = routeView === "analysis" ? window.history.state : { inmOverlayFrom: window.location.pathname };
    window.history.pushState(state, "", analysisPath(routeProject, diagnosticId));
    setRouteView("analysis"); setRouteDiagnostic(diagnosticId);
  }, [routeProject, routeView]);

  const navigateFactoryObject = useCallback((next: StudioSelection | null) => {
    if (!routeProject) return;
    window.history.pushState({}, "", factoryObjectPath(routeProject, next));
    setRouteView("factory"); setSelection(next);
  }, [routeProject]);

  const clearFactorySelection = useCallback(() => {
    if (!routeProject) return;
    window.history.replaceState({}, "", factoryObjectPath(routeProject));
    setSelection(null);
  }, [routeProject]);

  useEffect(() => { void loadIndex(); }, [loadIndex]);
  useEffect(() => {
    const popstate = () => {
      const nextRoute = studioRoute();
      projectRef.current = nextRoute.projectId;
      setRouteProject(nextRoute.projectId);
      setRouteView(nextRoute.view);
      setRouteExperiment(nextRoute.experimentId);
      setRouteCandidate(nextRoute.candidateId);
      setRouteDesignProgram(nextRoute.designProgramId);
      setRouteDesignRun(nextRoute.designRunId);
      setRouteAssetKind(nextRoute.assetKind);
      setRouteAssetId(nextRoute.assetId);
      setRouteDiagnostic(nextRoute.diagnosticId);
      setSelection(nextRoute.selection);
      if (!nextRoute.projectId) { setData(null); setOverview(null); }
    };
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  }, []);
  useEffect(() => {
    if (routeProject) void loadProject(routeProject);
  }, [routeProject, loadProject]);
  useEffect(() => {
    let source: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      source = new WebSocket(`${protocol}//${window.location.host}/api/watch`);
      source.onmessage = (event) => {
        if (event.data !== "refresh") return;
        void loadIndex();
        if (projectRef.current) void loadProject(projectRef.current, runRef.current);
      };
      source.onclose = () => {
        if (!closed) reconnectTimer = window.setTimeout(connect, 1_000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [loadIndex, loadProject]);
  useEffect(() => {
    const experiment = routeExperiment && data?.experiments.find((item) => item.id === routeExperiment);
    const design = routeDesignProgram && data?.designPrograms.find((item) => item.id === routeDesignProgram);
    const viewLabel = routeView === "overview" ? "" : `${routeView[0]!.toUpperCase()}${routeView.slice(1)} · `;
    document.title = experiment ? `${routeCandidate ? `${routeCandidate} · ` : ""}${experiment.name} · ${data!.name} · INM Studio` : design ? `${routeDesignRun ? `${routeDesignRun.slice(0, 8)} · ` : ""}${design.name} · ${data!.name} · INM Studio` : data ? `${viewLabel}${data.name} · INM Studio` : index ? `${index.name} · INM Studio` : "INM Studio";
  }, [data, index, routeCandidate, routeDesignProgram, routeDesignRun, routeExperiment, routeView]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (operationStatus && (operationResult || operationError)) {
        setOperationStatus(null); setOperationResult(null); setOperationError(null);
      } else if (routeView === "catalog" || routeView === "analysis" || routeView === "experiments" || routeView === "designs") closeRouteSurface();
      else if (routeView === "factory" && selection) clearFactorySelection();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [clearFactorySelection, closeRouteSurface, operationError, operationResult, operationStatus, routeView, selection]);

  const maxTick = data?.events.at(-1)?.tick ?? 0;
  useEffect(() => {
    if (!playing || !data) return;
    let animation = 0;
    let previous = performance.now();
    const step = (now: number) => {
      const delta = now - previous;
      previous = now;
      setTick((value) => {
        const next = Math.min(maxTick, value + delta * speed);
        if (next >= maxTick) setPlaying(false);
        return next;
      });
      animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animation);
  }, [playing, speed, maxTick, data]);

  if (!routeProject) {
    if (!index && !error) return <div className="loading">DISCOVERING PROJECTS…</div>;
    if (error && !index) return <div className="route-state error-state"><span>WORKSPACE ERROR</span><strong>{error}</strong><button onClick={() => window.location.reload()}>RETRY</button></div>;
    return <ProjectLauncher index={index!} />;
  }
  if ((!data || !overview) && loading) return <ProjectLoading projectId={routeProject} onBack={() => navigateProject(null)} />;
  if (!data || !overview || error) return <div className="route-state error-state"><div className="route-mark">!</div><span>PROJECT UNAVAILABLE</span><strong>{error ?? routeProject}</strong><button onClick={() => navigateProject(null)}>← PROJECTS</button></div>;

  const header = <ProjectHeader
    indexName={index?.name ?? "WORKSPACE"} data={data} overview={overview} view={routeView} loading={loading}
    onBack={() => navigateProject(null)} onNavigate={navigateView} onRefresh={() => void loadProject(data.projectId, run)}
  />;
  const openDiagnostic = (diagnostic: WorkbenchDiagnostic) => {
    const subject = diagnostic.subjects[0];
    if (subject?.kind === "device") { navigateFactoryObject({ kind: "device", id: subject.id }); return; }
    if (subject?.kind === "connection") { navigateFactoryObject({ kind: "connection", id: subject.id }); return; }
    if (subject?.kind === "resource") { navigateView("catalog"); queueMicrotask(() => navigateCatalog("resources", subject.id)); return; }
    if (subject?.kind === "process") { navigateView("catalog"); queueMicrotask(() => navigateCatalog("processes", subject.id)); return; }
    if (subject?.kind === "route") { navigateView("catalog"); queueMicrotask(() => navigateCatalog("routes", subject.id)); return; }
    navigateAnalysisDiagnostic(diagnostic.id);
  };
  const executeOperation = async (operation: WorkbenchOperationDescriptor, cli: string) => {
    setOperationStatus({ id: operation.id, cli });
    setOperationResult(null);
    setOperationError(null);
    try {
      const selection = {
        world: overview.selection.world.id,
        blueprint: overview.selection.blueprint.id,
        scenario: overview.selection.scenario.id,
        objective: overview.selection.objective.id,
      };
      const result = await responseJson<ProjectOperationResult<unknown>>(await fetch(`/api/projects/${encodeURIComponent(data.projectId)}/operations/${operation.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selection }),
      }));
      setOperationResult(result);
      if (operation.id === "simulate") await loadProject(data.projectId, result.artifacts.find((artifact) => artifact.kind === "run")?.id ?? runRef.current);
    } catch (nextError) {
      setOperationError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };
  const openRun = (runId: string) => {
    void loadProject(data.projectId, runId);
    navigateView("factory");
  };
  const overviewContent = <ProjectOverview snapshot={overview} onNavigate={navigateView} onDiagnostic={openDiagnostic} onDiagnosticFocus={navigateAnalysisDiagnostic}
    onExperiment={(id) => navigateExperiment(id)} onCandidate={navigateCandidateDirect}
    onDesign={(programId, runId) => runId ? navigateDesignSource(programId, runId) : navigateDesignProgram(programId)}
    onRun={openRun} onOperation={(operation, cli) => { void executeOperation(operation, cli); }} />;

  if (routeView !== "factory") {
    const focusedDiagnostic = routeDiagnostic ? overview.diagnostics.find((diagnostic) => diagnostic.id === routeDiagnostic) : undefined;
    return <main className={`project-shell ${loading ? "syncing" : ""}`}>
      {header}
      <div className="workbench-content">{routeView === "runs" ? <RunsOverview snapshot={overview} onOpenFactory={openRun} /> : overviewContent}</div>
      {routeView === "catalog" && <AssetBrowser data={data} initialKind={routeAssetKind ?? "devices"} initialId={routeAssetId} onNavigate={navigateCatalog} onClose={closeRouteSurface} />}
      {routeView === "analysis" && <AnalysisBrowser data={data} focusDiagnostic={focusedDiagnostic} onClose={closeRouteSurface} />}
      {routeView === "experiments" && <ExperimentWorkbench
        projectId={data.projectId} experiments={data.experiments} selectedId={routeExperiment || null} selectedCandidateId={routeCandidate}
        onSelect={(experimentId) => navigateExperiment(experimentId)} onSelectCandidate={navigateCandidate} onDesignSource={navigateDesignSource} onClose={closeRouteSurface}
      />}
      {routeView === "designs" && <DesignWorkbench
        projectId={data.projectId} programs={data.designPrograms} selectedProgramId={routeDesignProgram || null} selectedRunId={routeDesignRun}
        onSelectProgram={navigateDesignProgram} onSelectRun={navigateDesignRun} onCandidate={navigateCandidateDirect} onClose={closeRouteSurface}
      />}
      {operationStatus && !operationResult && <div className="modal-backdrop"><section className={`operation-progress ${operationError ? "failed" : ""}`} role="dialog" aria-modal="true" aria-label={`Operation progress: ${operationStatus.id}`}><span className="eyebrow">SHARED CORE OPERATION</span><h2>{operationError ? "OPERATION FAILED" : "OPERATION RUNNING"}</h2><strong>{operationStatus.id}</strong>{operationError ? <><p>{operationError}</p><button onClick={() => { setOperationStatus(null); setOperationError(null); }}>CLOSE</button></> : <><div className="loading-bar"><i /></div><code>{operationStatus.cli}</code></>}</section></div>}
      {operationStatus && operationResult && <OperationResultDialog result={operationResult} cli={operationStatus.cli} onClose={() => { setOperationStatus(null); setOperationResult(null); setOperationError(null); }} />}
    </main>;
  }

  const frame = buildFrame(data, tick);
  const recent = frame.visibleEvents.slice(-8).reverse();
  const selectedRun = data.runs.find((item) => item.name === run);
  const storageTotals = Object.values(data.metrics?.energyStorage ?? {}).reduce((total, storage) => ({ stored: total.stored + storage.storedMilliJoules, capacity: total.capacity + storage.capacityMilliJoules }), { stored: 0, capacity: 0 });
  const stationMissionEnergy = Object.values(data.metrics?.stationEnergy ?? {}).reduce((sum, energy) => sum + energy.spentMilliJoules, 0);
  const minimumGridSatisfaction = data.metrics && Object.keys(data.metrics.powerGrids).length
    ? Math.min(...Object.values(data.metrics.powerGrids).map((grid) => grid.minimumSatisfactionPpm)) / 10_000 : null;
  const chooseSceneObject = (next: StudioSelection) => setSelection((current) => {
    const selected = selectStudioObject(current, next);
    if (selected) window.history.pushState({}, "", factoryObjectPath(data.projectId, selected));
    else window.history.replaceState({}, "", factoryObjectPath(data.projectId));
    return selected;
  });

  return <main className={loading ? "syncing" : ""}>
    {header}
    <section className="workspace">
      <div className="viewport">
        <Canvas shadows camera={{ position: [data.bounds.width / 2, 32, data.bounds.height * 1.75], fov: 42, near: .1, far: 200 }} dpr={[1, 1.75]} onPointerMissed={clearFactorySelection}><Suspense fallback={routeExperiment === null ? <Html center>Loading world…</Html> : null}><FactoryWorld data={data} tick={tick} selection={selection} presentationRequest={factoryPresentationRequest} onPresentationMode={setFactoryPresentationMode} onSelection={chooseSceneObject} /></Suspense></Canvas>
        <div className="viewport-title"><span className="live-dot" /> FACTORY SYSTEM <b>{data.regions.length} INDUSTRIAL ZONES</b></div>
        <div className="factory-presentation-controls" role="group" aria-label="Factory presentation scale">
          {(["auto", "overview", "work-cell"] as const).map((request) => <button
            key={request}
            type="button"
            aria-pressed={factoryPresentationRequest === request}
            data-testid={`factory-presentation-${request}`}
            onClick={() => setFactoryPresentationRequest(request)}
          >{request === "work-cell" ? "WORK CELL" : request.toUpperCase()}</button>)}
          {selection && <button
            type="button"
            aria-pressed={factoryPresentationRequest === "selection"}
            data-testid="factory-presentation-selection"
            onClick={() => setFactoryPresentationRequest("selection")}
          >FOCUS</button>}
          <span className="factory-presentation-status" aria-live="polite">VIEW: {factoryPresentationMode === "selection" ? "FOCUS" : factoryPresentationMode === "work-cell" ? "WORK CELL" : "OVERVIEW"}</span>
        </div>
        <div className="scene-stats"><span><b>{data.regions.length}</b> INDUSTRIAL ZONES</span><span><b>{data.devices.filter((device) => !device.transportEndpoint).length}</b> MACHINES</span><span><b>{data.devices.filter((device) => device.transportEndpoint).length}</b> SORTERS</span><span><b>{data.resourceNodes.length}</b> DEPOSITS</span><span><b>{data.connections.length}</b> LOCAL LINKS</span><span><b>{data.analysis.stationNetworks.length}</b> STATION NETS</span><span><b>{data.assets.processes.length}</b> PROCESSES</span></div>
        {!selection && <div className="scene-selection-hint"><i>⌖</i><span>CLICK A MACHINE OR BELT</span><b>INSPECT INDUSTRIAL STATE</b></div>}
        {selection && <SceneInspector data={data} frame={frame} selection={selection} onClose={clearFactorySelection} onSelection={chooseSceneObject} />}
        <div className="legend">{Object.entries(STATUS_COLORS).map(([status, color]) => <span key={status}><i style={{ background: color }} />{status}</span>)}</div>
      </div>
      <aside>
        {data.metrics && <div className="panel"><h2>Delivery contracts</h2><div className="metrics"><Metric label="DEMAND ATTAINMENT" value={`${(data.metrics.deliveryPortfolio.fulfillment * 100).toFixed(1)}%`} accent /><Metric label="NET VALUE / MIN" value={data.metrics.deliveryPortfolio.netValuePerMinute.toFixed(2)} /><Metric label="VALUED / DEMANDED" value={`${data.metrics.deliveryPortfolio.valued.toFixed(0)} / ${data.metrics.deliveryPortfolio.demanded.toFixed(0)}`} /><Metric label="ABOVE DEMAND" value={data.metrics.deliveryPortfolio.overflow.toFixed(0)} />{Object.entries(data.metrics.deliveryPortfolio.contracts).map(([id, contract]) => <Metric key={id} label={id.toUpperCase()} value={`${contract.delivered.toFixed(0)} / ${contract.demand.toFixed(0)} ${contract.resource} · ${(contract.fulfillment * 100).toFixed(1)}%`} />)}</div></div>}
        <div className="panel run-panel"><label>SIMULATION RUN</label><select value={run ?? ""} disabled={!data.runs.length} onChange={(event) => void loadProject(data.projectId, event.target.value)}>{!data.runs.length && <option value="">NO COMPLETED RUNS · USE INM SIMULATE</option>}{data.runs.map((item) => <option key={item.name} value={item.name}>{item.decision === "BASELINE" ? item.blueprint.toUpperCase() : `${item.decision} · ${item.blueprint.toUpperCase()}`} · {item.name} · {item.score.toFixed(1)}</option>)}</select>{selectedRun && <div className={`decision ${selectedRun.decision.toLowerCase()}`}>{selectedRun.blueprint.toUpperCase()}</div>}</div>
        {data.metrics && <div className="panel" data-testid="factory-inventory-accounting"><h2>Objective inventory</h2><div className="metrics"><Metric label="AVERAGE WIP / TOTAL" value={`${data.metrics.inventoryAccounting.averageWip.toFixed(2)} / ${data.metrics.inventoryAccounting.averageTotalInventory.toFixed(2)}`} accent /><Metric label="PEAK WIP / TOTAL" value={`${data.metrics.inventoryAccounting.peakWip.toFixed(0)} / ${data.metrics.inventoryAccounting.peakTotalInventory.toFixed(0)}`} />{Object.entries(data.metrics.inventoryAccounting.resources).filter(([, accounting]) => accounting.includedInWip && accounting.averageInventory > 0).sort(([, left], [, right]) => right.averageInventory - left.averageInventory).slice(0, 6).map(([resource, accounting]) => <Metric key={resource} label={resource.toUpperCase()} value={`${accounting.averageInventory.toFixed(2)} avg · ${accounting.peakInventory.toFixed(0)} peak`} />)}</div></div>}
        <div className="panel"><h2>Performance</h2><div className="metrics"><Metric label="SCORE" value={data.metrics?.finalScore.toFixed(2) ?? "—"} accent /><Metric label="THROUGHPUT / MIN" value={data.metrics?.throughputPerMinute.toFixed(2) ?? "—"} />{data.metrics?.lotFlow.family && <><Metric label="COMPLETE / RELEASED / PLAN" value={`${data.metrics.lotFlow.completed} / ${data.metrics.lotFlow.released} / ${data.metrics.lotFlow.scheduled}`} />{Object.entries(data.metrics.routeFlow).map(([route, flow]) => <Fragment key={route}><Metric label={`ROUTE ${route.toUpperCase()}`} value={`${flow.transitions} steps / ${flow.reentrantTransitions} re-entry`} /><Metric label="ROUTE TERMINALS / ACTIVE" value={`${flow.completed} complete · ${flow.scrapped} scrap / ${flow.inProgress} active`} /></Fragment>)}<Metric label="RELEASE INTERVAL PLAN / ACTUAL" value={`${(data.metrics.releaseFlow.meanPlannedIntervalTicks / 1000).toFixed(1)} / ${(data.metrics.releaseFlow.meanActualIntervalTicks / 1000).toFixed(1)} s`} /><Metric label="RELEASE DELAY / PENDING" value={`${(data.metrics.releaseFlow.meanReleaseDelayTicks / 1000).toFixed(1)} s / ${data.metrics.releaseFlow.pending}`} /><Metric label="RELEASE CONTROL / PEAK" value={`${data.metrics.releaseFlow.control === "conwip" ? `CONWIP ${data.metrics.releaseFlow.maximumWip}↕${data.metrics.releaseFlow.reopenAtWip}` : "OPEN LOOP"} / ${data.metrics.releaseFlow.peakActiveLots}`} /><Metric label="MAX DELAY / SERVICE OPENS" value={`${data.metrics.releaseFlow.maximumReleaseDelayPolicyTicks === null ? "—" : `${(data.metrics.releaseFlow.maximumReleaseDelayPolicyTicks / 1000).toFixed(1)} s`} / ${data.metrics.releaseFlow.serviceLevelOpenings}`} /><Metric label="CONTROL BLOCK LOTS / TIME" value={`${data.metrics.releaseFlow.controlBlockedLots} / ${(data.metrics.releaseFlow.controlBlockedTicks / 1000).toFixed(1)} lot-s`} /><Metric label="CAPACITY BLOCK LOTS / TIME" value={`${data.metrics.releaseFlow.capacityBlockedLots} / ${(data.metrics.releaseFlow.capacityBlockedTicks / 1000).toFixed(1)} lot-s`} /><Metric label="LOTS SCRAPPED" value={String(data.metrics.lotFlow.scrapped)} /><Metric label="ON-TIME LOTS" value={`${data.metrics.lotFlow.onTimeCompleted} · ${(data.metrics.onTimeDelivery * 100).toFixed(1)}%`} /><Metric label="MEAN / P95 CYCLE" value={`${(data.metrics.lotFlow.meanCycleTimeTicks / 1000).toFixed(1)} / ${(data.metrics.lotFlow.p95CycleTimeTicks / 1000).toFixed(1)} s`} /><Metric label="QUEUE / PROCESS / MOVE" value={`${(data.metrics.lotFlow.meanQueueTimeTicks / 1000).toFixed(1)} / ${(data.metrics.lotFlow.meanProcessTimeTicks / 1000).toFixed(1)} / ${(data.metrics.lotFlow.meanTransportTimeTicks / 1000).toFixed(1)} s`} /><Metric label="MEAN TARDINESS" value={`${(data.metrics.lotFlow.meanTardinessTicks / 1000).toFixed(1)} s`} /><Metric label="GOOD / FIRST-PASS YIELD" value={`${(data.metrics.qualityFlow.goodYield * 100).toFixed(1)} / ${(data.metrics.qualityFlow.firstPassYield * 100).toFixed(1)}%`} /><Metric label="PREVENTED / AUTHORED DEFECTS" value={`${data.metrics.qualityFlow.qualityControl.preventedDefectInstances} / ${data.metrics.qualityFlow.qualityControl.authoredDefectInstances}`} /><Metric label="INSPECTIONS / REWORK" value={`${data.metrics.qualityFlow.totalInspections} / ${data.metrics.qualityFlow.totalReworkCycles}`} /><Metric label="SCRAP / QUALITY ESCAPES" value={`${data.metrics.qualityFlow.scrapDispositions} / ${data.metrics.qualityFlow.escapedDefects}`} />{data.metrics.batchFlow.batchOperations > 0 && <><Metric label="BATCH JOBS / LOTS" value={`${data.metrics.batchFlow.jobs} / ${data.metrics.batchFlow.lots}`} /><Metric label="LOTS / BATCH" value={data.metrics.batchFlow.averageLotsPerJob.toFixed(2)} /><Metric label="MEAN BATCH WAIT" value={`${(data.metrics.batchFlow.meanQueueWaitTicksPerLot / 1000).toFixed(1)} s`} /></>}{Object.entries(data.metrics.cadenceControl.devices).map(([device, control]) => <Fragment key={device}><Metric label={`${device.toUpperCase()} NORMAL / RECOVERY`} value={`${control.normalJobs} ${control.normalMode} / ${control.recoveryJobs} ${control.recoveryMode}`} /><Metric label="RECOVERY BOUNDARY" value={`< ${control.recoverBelowItems} items · ${control.downstreamConnection}`} /></Fragment>)}</>}<Metric label="CHANGEOVERS / SETUP" value={data.metrics ? `${data.metrics.equipmentSetups.totalChangeovers} / ${(data.metrics.equipmentSetups.totalSetupTicks / 1000).toFixed(1)} s` : "—"} /><Metric label="CAMPAIGN HOLDS / TIME" value={data.metrics ? `${data.metrics.equipmentSetups.totalCampaignHolds} / ${(data.metrics.equipmentSetups.totalCampaignHoldTicks / 1000).toFixed(1)} s` : "—"} /><Metric label="CAMPAIGN LOT-READY / TIMEOUT" value={data.metrics ? `${data.metrics.equipmentSetups.campaignMinimumLotReleases} / ${data.metrics.equipmentSetups.campaignMaximumHoldReleases}` : "—"} /><Metric label="MIN GRID SATISFACTION" value={minimumGridSatisfaction === null ? "—" : `${minimumGridSatisfaction.toFixed(1)}%`} /><Metric label="BELT UTILIZATION" value={data.metrics ? `${(data.metrics.beltCellUtilization * 100).toFixed(1)}%` : "—"} /><Metric label="BLOCKED BELT ITEMS" value={data.metrics?.averageBlockedBeltItems.toFixed(2) ?? "—"} /><Metric label="PEAK BELT ITEMS" value={String(data.metrics?.peakBeltItems ?? "—")} /><Metric label="SORTER ENERGY" value={`${((data.metrics?.transportEnergyConsumedMilliJoules ?? 0) / 1e6).toFixed(2)} MJ`} /><Metric label="CARRIER MISSIONS / RETURNS" value={`${data.metrics?.carrierMissions ?? 0} / ${data.metrics?.carrierReturns ?? 0}`} /><Metric label="CARRIER MISSION ENERGY" value={`${(stationMissionEnergy / 1e6).toFixed(2)} MJ`} /><Metric label="HIGH-SPEED MISSIONS" value={String(data.metrics?.highSpeedMissions ?? 0)} /><Metric label="ENERGY" value={`${((data.metrics?.energyConsumedMilliJoules ?? 0) / 1e6).toFixed(1)} MJ`} /><Metric label="GRID STORAGE" value={data.metrics && storageTotals.capacity ? `${(storageTotals.stored / 1e6).toFixed(2)} / ${(storageTotals.capacity / 1e6).toFixed(2)} MJ` : "—"} /><Metric label="FUEL BURNED" value={data.metrics ? Object.entries(data.metrics.fuelConsumed).map(([resource, count]) => `${count} ${resource}`).join(", ") || "0" : "—"} /><Metric label="BUILD COST" value={(data.metrics?.totalBuildCost ?? 0).toLocaleString()} /><Metric label="AREA" value={`${data.metrics?.occupiedArea ?? 0} cells`} /></div></div>
        {data.metrics && Object.keys(data.metrics.routeFlow).length > 0 && <div className="panel"><h2>Route Q-time</h2><div className="metrics">{Object.entries(data.metrics.routeFlow).map(([route, flow]) => <Fragment key={route}><Metric label={`${route.toUpperCase()} VIOLATIONS / LOTS`} value={`${flow.queueTimeViolations} / ${flow.violatedLots}`} />{Object.entries(flow.steps).filter(([, step]) => step.queueTimeMaximumTicks !== null).map(([stepId, step]) => <Metric key={stepId} label={stepId.toUpperCase()} value={`${(step.meanQueueTicks / 1000).toFixed(1)} avg · ${(step.maximumQueueTicks / 1000).toFixed(1)} / ${(step.queueTimeMaximumTicks! / 1000).toFixed(1)} s · ${step.queueTimeViolations} late`} />)}</Fragment>)}</div></div>}
        {data.metrics && data.metrics.productionTooling.totalAllocations > 0 && <div className="panel"><h2>Reusable production tooling</h2><div className="metrics"><Metric label="ALLOCATED / COMPLETE" value={`${data.metrics.productionTooling.totalAllocations} / ${data.metrics.productionTooling.totalCompleted}`} /><Metric label="CANCELLED" value={String(data.metrics.productionTooling.totalCancelled)} /><Metric label="EQUIPMENT / UNIT TIME" value={`${(data.metrics.productionTooling.totalOccupiedTicks / 1000).toFixed(1)} / ${(data.metrics.productionTooling.totalUnitTicks / 1000).toFixed(1)} s`} /><Metric label="WAIT / BLOCKS" value={`${(data.metrics.productionTooling.totalInputWaitTicks / 1000).toFixed(1)} s / ${data.metrics.productionTooling.totalInputBlocks}`} /><Metric label="TOOL ASSETS" value={Object.entries(data.metrics.productionTooling.resources).map(([resource, measured]) => `${resource}: ${measured.unitsAllocated} allocations / ${(measured.unitTicks / 1000).toFixed(1)} unit-s`).join(" · ") || "NONE"} /></div></div>}
        {data.metrics && data.metrics.productionUtilities.totalAllocations > 0 && <div className="panel"><h2>Fab facility utilities</h2><div className="metrics"><Metric label="JOBS / COMPLETE" value={`${data.metrics.productionUtilities.totalAllocations} / ${data.metrics.productionUtilities.totalCompleted}`} /><Metric label="CANCELLED / TRIPS" value={`${data.metrics.productionUtilities.totalCancelled} / ${data.metrics.productionUtilities.totalProviderInterruptions}`} /><Metric label="JOB / CAPACITY TIME" value={`${(data.metrics.productionUtilities.totalOccupiedTicks / 1000).toFixed(1)} / ${(data.metrics.productionUtilities.totalUnitTicks / 1000).toFixed(1)} s`} /><Metric label="WAIT / BLOCKS" value={`${(data.metrics.productionUtilities.totalInputWaitTicks / 1000).toFixed(1)} s / ${data.metrics.productionUtilities.totalInputBlocks}`} /><Metric label="UTILITY SERVICES" value={Object.entries(data.metrics.productionUtilities.utilities).map(([utility, measured]) => `${utility}: ${measured.unitsAllocated} units / ${(measured.unitTicks / 1000).toFixed(1)} unit-s`).join(" · ") || "NONE"} /></div></div>}
        {data.metrics && Object.keys(data.metrics.equipmentMaintenance.devices).length > 0 && <div className="panel"><h2>Equipment maintenance</h2><div className="metrics"><Metric label="ASSET / PLANNED / OPPORTUNISTIC" value={`${data.metrics.equipmentMaintenance.totalAssetLimit} / ${data.metrics.equipmentMaintenance.totalPlannedBoundary} / ${data.metrics.equipmentMaintenance.totalOpportunistic}`} /><Metric label="USAGE / CALENDAR TRIGGERS" value={`${data.metrics.equipmentMaintenance.totalUsageTriggered} / ${data.metrics.equipmentMaintenance.totalCalendarTriggered}`} /><Metric label="RELEASED / SERVICE CANCEL" value={`${data.metrics.equipmentMaintenance.totalCompleted} / ${data.metrics.equipmentMaintenance.totalCancelled}`} /><Metric label="SERVICE / QUALIFICATION" value={`${(data.metrics.equipmentMaintenance.totalMaintenanceTicks / 1000).toFixed(1)} / ${(data.metrics.equipmentMaintenance.totalQualificationTicks / 1000).toFixed(1)} s`} /><Metric label="QUALIFIED / CANCELLED" value={`${data.metrics.equipmentMaintenance.totalQualificationCompleted} / ${data.metrics.equipmentMaintenance.totalQualificationCancelled}`} /><Metric label="SERVICE / QUAL CREW" value={`${(data.metrics.equipmentMaintenance.totalServiceCrewTicks / 1000).toFixed(1)} / ${(data.metrics.equipmentMaintenance.totalQualificationCrewTicks / 1000).toFixed(1)} crew-s`} /><Metric label="INPUT / CREW WAIT" value={`${(data.metrics.equipmentMaintenance.totalInputWaitTicks / 1000).toFixed(1)} / ${(data.metrics.equipmentMaintenance.totalCrewWaitTicks / 1000).toFixed(1)} s`} /><Metric label="INPUT / CREW BLOCKS" value={`${data.metrics.equipmentMaintenance.totalInputBlocks} / ${data.metrics.equipmentMaintenance.totalCrewBlocks}`} /><Metric label="SERVICE CONSUMABLES" value={Object.entries(data.metrics.equipmentMaintenance.serviceConsumables).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "NONE"} /><Metric label="QUALIFICATION CONSUMABLES" value={Object.entries(data.metrics.equipmentMaintenance.qualificationConsumables).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "NONE"} /><Metric label="DRIFTED JOBS / LOTS" value={`${data.metrics.equipmentMaintenance.totalDriftedJobs} / ${data.metrics.equipmentMaintenance.totalDriftedLots}`} /><Metric label="DRIFT DEFECTS" value={String(data.metrics.equipmentMaintenance.totalDriftDefects)} /></div></div>}
        {data.metrics && Object.keys(data.metrics.equipmentEnergyManagement.devices).length > 0 && <div className="panel"><h2>Equipment energy states</h2><div className="metrics"><Metric label="SLEEPS / WAKES" value={`${data.metrics.equipmentEnergyManagement.totalSleeps} / ${data.metrics.equipmentEnergyManagement.totalWakeups}`} /><Metric label="SLEEP / WAKE TIME" value={`${(data.metrics.equipmentEnergyManagement.totalSleepingTicks / 1000).toFixed(1)} / ${(data.metrics.equipmentEnergyManagement.totalWakeTicks / 1000).toFixed(1)} equipment-s`} /><Metric label="CONTROLLED EQUIPMENT" value={Object.entries(data.metrics.equipmentEnergyManagement.devices).map(([device, energy]) => `${device}: ${energy.mode}`).join(" · ")} /></div></div>}
        <div className="panel bottleneck"><h2>Bottleneck</h2><strong>{data.metrics?.bottleneckEntity ?? "NONE"}</strong><p>Highlighted with an amber floor beacon in the factory world.</p>{data.metrics?.bottleneckEntity && <button onClick={() => navigateFactoryObject({ kind: "device", id: data.metrics!.bottleneckEntity! })}>INSPECT DEVICE →</button>}</div>
        <div className="panel events"><h2>Event stream <span>{frame.visibleEvents.length}</span></h2>{recent.map((event, index) => <div className="event" key={`${event.tick}-${event.type}-${index}`}><time>{formatTick(event.tick)}</time><span>{event.type}</span><b>{event.device ?? event.connection ?? event.transit?.resource ?? event.resource ?? ""}</b></div>)}</div>
        {data.metrics && data.metrics.lotOutputFlow.jobs > 0 && <div className="panel"><h2>Wafer probe yield</h2><div className="metrics"><Metric label="DIE OUTPUT ACTUAL / NOMINAL" value={`${data.metrics.lotOutputFlow.actualUnits} / ${data.metrics.lotOutputFlow.nominalUnits}`} accent /><Metric label="DIE OUTPUT REALIZATION" value={`${(data.metrics.lotOutputFlow.outputRatio * 100).toFixed(1)}%`} /><Metric label="DIE OUTPUT LOST" value={String(data.metrics.lotOutputFlow.lostUnits)} /></div></div>}
      </aside>
    </section>
    <footer className="timeline"><button className="play" onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button><button onClick={() => { setPlaying(false); setTick(0); }}>RESET</button><div className="time"><strong>{formatTick(tick)}</strong><input aria-label="Timeline" type="range" min={0} max={maxTick} value={tick} onChange={(event) => { setPlaying(false); setTick(Number(event.target.value)); }} /><span>{formatTick(maxTick)}</span></div><div className="speeds">{[1, 4, 16, 64].map((value) => <button className={speed === value ? "active" : ""} onClick={() => setSpeed(value)} key={value}>{value}×</button>)}</div></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
