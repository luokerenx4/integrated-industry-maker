import type { BlueprintDevice, CompiledFactoryProject, DeviceAsset, DispatchPolicy, IndustrialProcess, PowerAllocationPolicy, ProcessAmount, ResourceId } from "./types";
import {
  connectionDispatchProfiles, effectiveDispatchPolicy, resourceCriticalDepth, stationRouteDispatchProfile,
  type ConnectionDispatchProfile, type StationDispatchProfile,
} from "./dispatch-priority";
import { connectionCapacityPerMinute, maximumConnectionCapacityPerMinute } from "./logistics-capacity";
import { optimizeResourceDemand } from "./production-demand";
import { effectiveProductionAmounts, productionDurationTicks, productionPowerMilliWatts } from "./production-mode";
import { plannedProductionAmounts } from "./material-treatment";

export interface DeviceProductionRate {
  device: string;
  asset: string;
  process: string;
  mode: string;
  inputCycles: number;
  outputCycles: number;
  minimumInputTreatmentLevel: number;
  category: string;
  cycleTicks: number;
  cyclesPerMinute: number;
  inputsPerMinute: Record<ResourceId, number>;
  outputsPerMinute: Record<ResourceId, number>;
  inputPorts: Record<ResourceId, string>;
  outputPorts: Record<ResourceId, string>;
  powerPriority: number;
  idlePowerMilliWatts: number;
  powerMilliWatts: number;
  setupGroup?: string;
  changeoverDurationTicks?: number;
  changeoverPowerMilliWatts?: number;
  maintenanceMaximumJobs?: number;
  maintenanceDurationTicks?: number;
  maintenancePowerMilliWatts?: number;
  preventiveMaintenanceMinimumJobs?: number;
}

export interface RecipeOptionAnalysis {
  device: string;
  asset: string;
  process: string;
  mode: string;
  modeName: string;
  minimumInputTreatmentLevel: number;
  name: string;
  category: string;
  selected: boolean;
  cycleTicks: number;
  cyclesPerMinute: number;
  inputs: ProcessAmount[];
  outputs: ProcessAmount[];
  inputPorts: Record<ResourceId, string>;
  outputPorts: Record<ResourceId, string>;
  targetOutputPerMinute: number;
  powerPriority: number;
  idlePowerMilliWatts: number;
  powerMilliWatts: number;
}

export interface ProductionDependencyGraph {
  targetResource: ResourceId;
  rawInputsPerTarget: Record<ResourceId, number>;
  coproductSurplusPerTarget: Record<ResourceId, number>;
  steps: Array<{ device: string; process: string; mode: string; cyclesPerTarget: number }>;
  dependencies: Array<{ device: string; process: string; mode: string; inputs: ResourceId[]; outputs: ResourceId[] }>;
}

export interface DeviceExtractionRate {
  device: string;
  asset: string;
  resource: ResourceId;
  nodes: string[];
  cycleTicks: number;
  itemsPerCycle: number;
  itemsPerMinute: number;
  powerPriority: number;
  idlePowerMilliWatts: number;
  powerMilliWatts: number;
}

export interface DeviceTreatmentRate {
  device: string;
  asset: string;
  mode: string;
  level: number;
  itemCount: number;
  cycleTicks: number;
  itemsPerMinute: number;
  inputBuffer: string;
  outputBuffer: string;
  agentBuffer: string;
  agentResource: ResourceId;
  agentPerCycle: number;
  agentPerMinute: number;
  powerPriority: number;
  idlePowerMilliWatts: number;
  powerMilliWatts: number;
}

export interface DevicePowerGenerationRate {
  device: string;
  asset: string;
  region: string;
  kind: "renewable" | "fuel";
  outputMilliWatts: number;
  fuelBuffer?: string;
  fuelResource?: ResourceId;
  fuelPerMinute?: number;
  burnTicks?: number;
}

export interface DevicePowerStorageRate {
  device: string;
  asset: string;
  region: string;
  capacityMilliJoules: number;
  initialMilliJoules: number;
  chargeMilliWatts: number;
  dischargeMilliWatts: number;
}

export interface ResourceNodeAnalysis {
  node: string;
  region: string;
  resource: ResourceId;
  amount: number;
  miners: string[];
  nominalSharePerMinute: number;
  estimatedDepletionMinutes: number | null;
}

export interface ResourceProductionBalance {
  resource: ResourceId;
  producedPerMinute: number;
  consumedPerMinute: number;
  netPerMinute: number;
  hasBoundarySupply: boolean;
  hasBoundaryDemand: boolean;
}

export interface ConnectionRateLimit {
  connection: string;
  from: string;
  to: string;
  resources: ResourceId[];
  dispatchPolicy: DispatchPolicy;
  dispatchProfiles: ConnectionDispatchProfile[];
  capacityItemsPerMinute: number;
  capacityByResource: Record<ResourceId, number>;
  stackSizeByResource: Record<ResourceId, number>;
  maxStackSize: number;
  travelTicks: number;
  dispatchIntervalTicks: number;
  pathCells: number;
  sharedCells: number;
  maxLevel: number;
  stages: Array<{
    stage: "loader" | "line" | "unloader"; asset: string; distance: number; capacity: number; durationTicks: number; stackCapacity: number;
    device?: string; powerPriority: number; idlePowerMilliWatts: number; powerMilliWatts: number; powerGrid?: string; position?: { x: number; y: number };
  }>;
}

export interface TransportCellAnalysis {
  cell: string;
  region: string;
  position: { x: number; y: number; level?: number };
  asset: string;
  connections: string[];
  output: { kind: "cell"; cell: string } | { kind: "port"; device: string; port: string };
  travelTicks: number;
  capacityStacksPerMinute: number;
}

export interface PowerGridAnalysis {
  grid: string;
  region: string;
  distributors: string[];
  members: string[];
  transportStages: Array<{ connection: string; stage: "loader" | "unloader"; device: string }>;
  generators: DevicePowerGenerationRate[];
  storageDevices: DevicePowerStorageRate[];
  productionMilliWatts: number;
  idleConsumptionMilliWatts: number;
  ratedConsumptionMilliWatts: number;
  headroomMilliWatts: number;
  storageCapacityMilliJoules: number;
  initialStoredMilliJoules: number;
  storageChargeMilliWatts: number;
  storageDischargeMilliWatts: number;
}

export interface StationNetworkAnalysis {
  network: string;
  kind: "local" | "inter-zone";
  dispatchPolicy: DispatchPolicy;
  fleets: Array<{ station: string; region: string; carrierAsset: string; count: number; estimatedLoad: number }>;
  stations: number;
  estimatedCarrierLoad: number;
  stationEnergy: Array<{ device: string; region: string; capacityMilliJoules: number; chargeMilliWatts: number }>;
  routes: Array<{
    route: string;
    resource: ResourceId;
    from: string;
    to: string;
    fromRegion: string;
    toRegion: string;
    fromSlotCapacity: number;
    toSlotCapacity: number;
    supplyReserve: number;
    demandTarget: number;
    supplyPriority: number;
    demandPriority: number;
    minimumBatch: number;
    carrierBatchCapacity: number;
    carrierAsset: string;
    fleetSize: number;
    batchCapacity: number;
    standardTravelTicks: number;
    standardRoundTripTicks: number;
    standardMissionEnergyMilliJoules: number;
    travelTicks: number;
    roundTripTicks: number;
    missionEnergyMilliJoules: number;
    highSpeed: { enabled: boolean; travelTicks: number; roundTripTicks: number; missionEnergyMilliJoules: number } | null;
    capacityItemsPerMinute: number;
    energyLimitedItemsPerMinute: number;
    dispatchProfile: StationDispatchProfile;
  }>;
}

export interface ProductionDiagnostic {
  code: "material-deficit" | "material-surplus" | "input-logistics" | "output-logistics" | "treatment-input-unfed" | "treatment-agent-unfed" | "power-disconnected" | "power-transport-disconnected" | "power-deficit" | "power-fuel-unfed" | "station-unmatched-demand" | "station-unmatched-supply" | "station-fleet-deficit" | "station-energy-deficit" | "resource-unmined" | "resource-depletes-during-scenario" | "shared-work-center" | "lot-release-schedule" | "lot-release-control" | "batch-process" | "quality-inspection" | "quality-rework" | "quality-escape-risk";
  severity: "warning" | "info";
  resource?: ResourceId;
  device?: string;
  connection?: string;
  network?: string;
  message: string;
}

export interface ProductionAnalysis {
  powerAllocation: PowerAllocationPolicy;
  declarativeDevices: number;
  opaqueDevices: number;
  devices: DeviceProductionRate[];
  bufferContracts: Array<{
    device: string; asset: string;
    buffers: Array<{ buffer: string; role: string; capacity: number; accepts: ResourceId[] | ["*"]; resourceCapacities?: Record<ResourceId, number> }>;
  }>;
  portContracts: Array<{
    device: string; asset: string;
    ports: Array<{ port: string; direction: "input" | "output"; buffer: string; accepts: ResourceId[] | ["*"] }>;
  }>;
  recipeOptions: RecipeOptionAnalysis[];
  productionGraph: ProductionDependencyGraph;
  extractionDevices: DeviceExtractionRate[];
  treatmentDevices: DeviceTreatmentRate[];
  generationDevices: DevicePowerGenerationRate[];
  storageDevices: DevicePowerStorageRate[];
  resourceNodes: ResourceNodeAnalysis[];
  resources: ResourceProductionBalance[];
  connections: ConnectionRateLimit[];
  transportCells: TransportCellAnalysis[];
  stationNetworks: StationNetworkAnalysis[];
  powerGrids: PowerGridAnalysis[];
  diagnostics: ProductionDiagnostic[];
}

function portSupports(
  asset: DeviceAsset,
  portId: string,
  resource: ResourceId,
  bufferFilters?: BlueprintDevice["bufferFilters"],
  portFilters?: BlueprintDevice["portFilters"],
): boolean {
  const port = asset.geometry.ports.find((item) => item.id === portId);
  const buffer = port ? asset.buffers.find((item) => item.id === port.buffer) : undefined;
  if (!buffer || (!buffer.accepts.includes("*") && !buffer.accepts.includes(resource))) return false;
  const configuredBuffer = bufferFilters?.[buffer.id];
  const configuredPort = portFilters?.[portId];
  return (!configuredBuffer || configuredBuffer.includes(resource)) && (!configuredPort || configuredPort.includes(resource));
}

export function bindProcessPorts(
  asset: DeviceAsset,
  process: IndustrialProcess,
  preferred?: BlueprintDevice["recipe"],
  bufferFilters?: BlueprintDevice["bufferFilters"],
  portFilters?: BlueprintDevice["portFilters"],
): { inputs: Record<ResourceId, string>; outputs: Record<ResourceId, string> } | null {
  const production = asset.production;
  if (!production || !production.categories.includes(process.category) || !production.processes.includes(process.id)) return null;
  const bind = (amounts: ProcessAmount[], allowed: string[], preferredBindings: Record<ResourceId, string> | undefined) => {
    const bindings: Record<ResourceId, string> = {};
    const used = new Set<string>();
    for (const amount of amounts) {
      const preferredPort = preferredBindings?.[amount.resource];
      const candidates = allowed.filter((port) => portSupports(asset, port, amount.resource, bufferFilters, portFilters))
        .sort((a, b) => Number(used.has(a)) - Number(used.has(b)) || a.localeCompare(b));
      const port = preferredPort && candidates.includes(preferredPort) ? preferredPort : candidates[0];
      if (!port) return null;
      bindings[amount.resource] = port;
      used.add(port);
    }
    return bindings;
  };
  const inputs = bind(process.inputs, production.inputPorts, preferred?.inputs);
  const outputAmounts = process.quality?.kind === "inspection"
    ? [
      ...process.outputs,
      { resource: process.quality.rejectResource, count: process.outputs[0]!.count },
      ...(process.quality.scrapResource
        ? [{ resource: process.quality.scrapResource, count: process.outputs[0]!.count }]
        : []),
    ]
    : process.outputs;
  const outputs = bind(outputAmounts, production.outputPorts, preferred?.outputs);
  return inputs && outputs ? { inputs, outputs } : null;
}

function buildProductionGraph(project: CompiledFactoryProject, devices: DeviceProductionRate[]): ProductionDependencyGraph {
  const candidates = devices.flatMap((producer) => {
    const processPlan = project.devices[producer.device]?.processPlans.find((plan) => plan.definition.id === producer.process && plan.mode.id === producer.mode);
    if (processPlan?.definition.quality?.kind === "rework") return [];
    const amounts = processPlan ? plannedProductionAmounts(processPlan.definition, processPlan.mode, project.deviceAssets) : undefined;
    return processPlan ? [{
      key: `${producer.device}:${producer.process}:${producer.mode}`,
      inputs: amounts!.inputs,
      outputs: amounts!.outputs,
      data: { producer, processPlan },
    }] : [];
  });
  const producedResources = new Set(candidates.flatMap((candidate) => candidate.outputs.map((output) => output.resource)));
  const inputResources = new Set(candidates.flatMap((candidate) => candidate.inputs.map((input) => input.resource)));
  const rawResources = Object.keys(project.resources).filter((resource) => Object.values(project.resourceNodes).some((node) => node.resource === resource)
    || (inputResources.has(resource) && !producedResources.has(resource)));
  const plan = optimizeResourceDemand({
    targetResource: project.objective.targetResource, targetRatePerMinute: 1, candidates, rawResources,
    candidateCost: (candidate) => candidate.data.processPlan.durationTicks,
  });
  return {
    targetResource: project.objective.targetResource,
    rawInputsPerTarget: plan.rawDemandPerMinute,
    coproductSurplusPerTarget: plan.surplusPerMinute,
    steps: plan.processes.map((row) => ({
      device: row.candidate.data.producer.device,
      process: row.candidate.data.processPlan.definition.id,
      mode: row.candidate.data.processPlan.mode.id,
      cyclesPerTarget: row.requiredCyclesPerMinute,
    })).sort((a, b) => a.device.localeCompare(b.device)),
    dependencies: devices.map((device) => ({
      device: device.device, process: device.process, mode: device.mode,
      inputs: Object.keys(device.inputPorts).sort(), outputs: Object.keys(device.outputPorts).sort(),
    })),
  };
}

function add(target: Record<string, number>, resource: string, value: number): void {
  target[resource] = (target[resource] ?? 0) + value;
}

function declaredBoundaryResources(project: CompiledFactoryProject): Set<ResourceId> {
  const resources = new Set<ResourceId>();
  for (const device of Object.values(project.devices)) {
    if (device.processPlans.length || !device.assetDef.capabilities.includes("consume")) continue;
    for (const port of device.ports.filter((item) => item.direction === "input")) {
      for (const resource of device.buffers[port.buffer]!.accepts) if (resource !== "*") resources.add(resource);
    }
    for (const connection of Object.values(project.connections).filter((item) => item.to.device === device.id)) {
      for (const resource of Object.keys(connection.stackSizeByResource)) resources.add(resource);
    }
  }
  return resources;
}

export function analyzeProduction(project: CompiledFactoryProject): ProductionAnalysis {
  const devices: DeviceProductionRate[] = [];
  const extractionDevices: DeviceExtractionRate[] = [];
  const treatmentDevices: DeviceTreatmentRate[] = [];
  const generationDevices: DevicePowerGenerationRate[] = [];
  const storageDevices: DevicePowerStorageRate[] = [];
  const produced: Record<ResourceId, number> = {};
  const consumed: Record<ResourceId, number> = {};
  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [planIndex, processPlan] of device.processPlans.entries()) {
      const cyclesPerMinute = 60_000 / processPlan.durationTicks;
      const nominalShare = 1 / device.processPlans.length;
      const contributesToNominalBalance = processPlan.definition.quality?.kind !== "rework";
      const inputsPerMinute: Record<ResourceId, number> = {};
      const outputsPerMinute: Record<ResourceId, number> = {};
      for (const amount of processPlan.inputs) {
        add(inputsPerMinute, amount.resource, amount.count * cyclesPerMinute);
        if (contributesToNominalBalance) add(consumed, amount.resource, amount.count * cyclesPerMinute * nominalShare);
      }
      for (const amount of processPlan.outputs) {
        add(outputsPerMinute, amount.resource, amount.count * cyclesPerMinute);
        if (contributesToNominalBalance) add(produced, amount.resource, amount.count * cyclesPerMinute * nominalShare);
      }
      const authoredRecipe = (device.recipes ?? (device.recipe ? [device.recipe] : []))[planIndex];
      devices.push({
        device: device.id,
        asset: device.asset,
        process: processPlan.definition.id,
        mode: processPlan.mode.id,
        inputCycles: processPlan.mode.inputCycles,
        outputCycles: processPlan.mode.outputCycles,
        minimumInputTreatmentLevel: processPlan.mode.minimumInputTreatmentLevel,
        category: processPlan.definition.category,
        cycleTicks: processPlan.durationTicks,
        cyclesPerMinute,
        inputsPerMinute,
        outputsPerMinute,
        inputPorts: {
          ...(authoredRecipe?.inputs ?? {}),
          ...Object.fromEntries(processPlan.mode.auxiliaryInputs.map((input) => [input.resource, input.port])),
        },
        outputPorts: { ...(authoredRecipe?.outputs ?? {}) },
        powerPriority: device.policy?.powerPriority ?? 0,
        idlePowerMilliWatts: device.assetDef.power.idleMilliWatts,
        powerMilliWatts: processPlan.powerMilliWatts,
        ...(processPlan.setupGroup ? { setupGroup: processPlan.setupGroup } : {}),
        ...(processPlan.changeoverDurationTicks === undefined ? {} : { changeoverDurationTicks: processPlan.changeoverDurationTicks }),
        ...(processPlan.changeoverPowerMilliWatts === undefined ? {} : { changeoverPowerMilliWatts: processPlan.changeoverPowerMilliWatts }),
        ...(device.assetDef.production?.maintenance ? {
          maintenanceMaximumJobs: device.assetDef.production.maintenance.maximumJobs,
          maintenanceDurationTicks: device.assetDef.production.maintenance.durationTicks,
          maintenancePowerMilliWatts: device.assetDef.production.maintenance.powerMilliWatts,
        } : {}),
        ...(device.policy?.preventiveMaintenance ? {
          preventiveMaintenanceMinimumJobs: device.policy.preventiveMaintenance.minimumJobs,
        } : {}),
      });
    }
  }
  const recipeOptions: RecipeOptionAnalysis[] = Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id)).flatMap((device) => {
    if (!device.assetDef.production) return [];
    return Object.values(project.processes).sort((a, b) => a.id.localeCompare(b.id)).flatMap((process) => device.assetDef.production!.modes.flatMap((mode) => {
      const bindings = bindProcessPorts(device.assetDef, process, device.recipe, device.bufferFilters, device.portFilters);
      if (!bindings) return [];
      if (mode.auxiliaryInputs.some((input) => !portSupports(device.assetDef, input.port, input.resource, device.bufferFilters, device.portFilters))) return [];
      if (mode.auxiliaryInputs.some((input) => bindings.inputs[input.resource] !== undefined && bindings.inputs[input.resource] !== input.port)) return [];
      const amounts = effectiveProductionAmounts(process, mode);
      const cycleTicks = productionDurationTicks(process, device.assetDef, mode);
      const cyclesPerMinute = 60_000 / cycleTicks;
      const targetOutput = amounts.outputs.find((amount) => amount.resource === project.objective.targetResource)?.count ?? 0;
      const inputPorts = { ...bindings.inputs };
      for (const input of mode.auxiliaryInputs) inputPorts[input.resource] = input.port;
      return [{
        device: device.id, asset: device.asset, process: process.id, mode: mode.id, modeName: mode.name,
        minimumInputTreatmentLevel: mode.minimumInputTreatmentLevel, name: process.name, category: process.category,
        selected: device.processPlans.some((plan) => plan.definition.id === process.id && plan.mode.id === mode.id), cycleTicks, cyclesPerMinute,
        inputs: amounts.inputs, outputs: amounts.outputs,
        inputPorts, outputPorts: bindings.outputs,
        targetOutputPerMinute: targetOutput * cyclesPerMinute, powerPriority: device.policy?.powerPriority ?? 0,
        idlePowerMilliWatts: device.assetDef.power.idleMilliWatts,
        powerMilliWatts: productionPowerMilliWatts(device.assetDef, mode),
      }];
    }));
  });
  const productionGraph = buildProductionGraph(project, devices);
  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    const plan = device.treatmentPlan;
    if (!plan) continue;
    const cyclesPerMinute = 60_000 / plan.mode.durationTicks;
    const agentPerMinute = plan.mode.agent.count * cyclesPerMinute;
    treatmentDevices.push({
      device: device.id, asset: device.asset, mode: plan.mode.id, level: plan.mode.level,
      itemCount: plan.mode.itemCount, cycleTicks: plan.mode.durationTicks, itemsPerMinute: plan.mode.itemCount * cyclesPerMinute,
      inputBuffer: plan.inputBuffer, outputBuffer: plan.outputBuffer, agentBuffer: plan.agentBuffer,
      agentResource: plan.mode.agent.resource, agentPerCycle: plan.mode.agent.count, agentPerMinute,
      powerPriority: device.policy?.powerPriority ?? 0,
      idlePowerMilliWatts: device.assetDef.power.idleMilliWatts,
      powerMilliWatts: device.assetDef.power.activeMilliWatts,
    });
    add(consumed, plan.mode.agent.resource, agentPerMinute);
  }
  const bufferContracts: ProductionAnalysis["bufferContracts"] = Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id)).map((device) => ({
    device: device.id, asset: device.asset,
    buffers: Object.values(device.buffers).sort((a, b) => a.id.localeCompare(b.id)).map((buffer) => ({
      buffer: buffer.id, role: buffer.role, capacity: buffer.capacity, accepts: [...buffer.accepts] as ResourceId[] | ["*"],
      ...(buffer.resourceCapacities ? { resourceCapacities: { ...buffer.resourceCapacities } } : {}),
    })),
  }));
  const portContracts: ProductionAnalysis["portContracts"] = Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id)).map((device) => ({
    device: device.id, asset: device.asset,
    ports: [...device.ports].sort((a, b) => a.id.localeCompare(b.id)).map((port) => ({
      port: port.id, direction: port.direction, buffer: port.buffer, accepts: [...port.accepts] as ResourceId[] | ["*"],
    })),
  }));

  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    const plan = device.generationPlan;
    if (!plan) continue;
    if (plan.kind === "renewable") {
      generationDevices.push({ device: device.id, asset: device.asset, region: device.region, kind: plan.kind, outputMilliWatts: plan.outputMilliWatts });
      continue;
    }
    const fuel = plan.fuels[0]!;
    const fuelPerMinute = 60_000 / fuel.durationTicks;
    add(consumed, fuel.resource, fuelPerMinute);
    generationDevices.push({
      device: device.id, asset: device.asset, region: device.region, kind: plan.kind,
      outputMilliWatts: plan.outputMilliWatts, fuelBuffer: plan.fuelBuffer,
      fuelResource: fuel.resource, fuelPerMinute, burnTicks: fuel.durationTicks,
    });
  }

  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    const plan = device.storagePlan;
    if (!plan) continue;
    storageDevices.push({
      device: device.id, asset: device.asset, region: device.region,
      capacityMilliJoules: plan.capacityMilliJoules,
      initialMilliJoules: project.scenario.initialEnergyMilliJoules?.[device.id] ?? 0,
      chargeMilliWatts: plan.chargeMilliWatts,
      dischargeMilliWatts: plan.dischargeMilliWatts,
    });
  }

  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!device.extractionPlan || !device.extractionPlan.nodes.length) continue;
    const resource = device.extractionPlan.nodes[0]!.resource;
    const itemsPerMinute = device.extractionPlan.itemsPerCycle * 60_000 / device.extractionPlan.cycleTicks;
    add(produced, resource, itemsPerMinute);
    extractionDevices.push({
      device: device.id, asset: device.asset, resource,
      nodes: device.extractionPlan.nodes.map((node) => node.id),
      cycleTicks: device.extractionPlan.cycleTicks,
      itemsPerCycle: device.extractionPlan.itemsPerCycle,
      itemsPerMinute,
      powerPriority: device.policy?.powerPriority ?? 0,
      idlePowerMilliWatts: device.assetDef.power.idleMilliWatts,
      powerMilliWatts: device.assetDef.power.activeMilliWatts,
    });
  }

  const boundarySupply = new Set<ResourceId>();
  const boundaryDemand = declaredBoundaryResources(project);
  const resourceIds = [...new Set([...Object.keys(produced), ...Object.keys(consumed)])].sort();
  const resources = resourceIds.map((resource) => ({
    resource,
    producedPerMinute: produced[resource] ?? 0,
    consumedPerMinute: consumed[resource] ?? 0,
    netPerMinute: (produced[resource] ?? 0) - (consumed[resource] ?? 0),
    hasBoundarySupply: boundarySupply.has(resource),
    hasBoundaryDemand: boundaryDemand.has(resource),
  }));

  const criticalDepths = resourceCriticalDepth(project);
  const connections = Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id)).map((connection) => ({
    connection: connection.id,
    from: connection.from.device,
    to: connection.to.device,
    resources: [...connection.resources],
    dispatchPolicy: effectiveDispatchPolicy(project, connection),
    dispatchProfiles: connectionDispatchProfiles(project, connection, criticalDepths),
    capacityItemsPerMinute: maximumConnectionCapacityPerMinute(connection),
    capacityByResource: Object.fromEntries(Object.keys(connection.stackSizeByResource).map((resource) => [resource, connectionCapacityPerMinute(connection, resource)])),
    stackSizeByResource: { ...connection.stackSizeByResource }, maxStackSize: connection.maxStackSize,
    travelTicks: connection.travelTicks,
    dispatchIntervalTicks: connection.dispatchIntervalTicks,
    pathCells: connection.path.length,
    maxLevel: Math.max(0, ...connection.path.map((cell) => cell.level ?? 0)),
    sharedCells: connection.transportCells.filter((cell) => project.transportCells[cell]!.connections.length > 1).length,
    stages: connection.logisticsStages.map((stage) => ({
      stage: stage.stage, asset: stage.asset.id, distance: stage.distance, capacity: stage.capacity, durationTicks: stage.durationTicks, stackCapacity: stage.stackCapacity,
      powerPriority: stage.device?.policy?.powerPriority ?? 0,
      idlePowerMilliWatts: stage.asset.power.idleMilliWatts, powerMilliWatts: stage.asset.power.activeMilliWatts,
      ...(stage.device ? { device: stage.device.id } : {}),
      ...(stage.powerGrid ? { powerGrid: stage.powerGrid } : {}), ...(stage.position ? { position: { ...stage.position } } : {}),
    })),
  }));
  const transportCells = Object.values(project.transportCells).sort((a, b) => a.id.localeCompare(b.id)).map((cell) => ({
    cell: cell.id, region: cell.region, position: { ...cell.position }, asset: cell.asset.id,
    connections: [...cell.connections], output: structuredClone(cell.output), travelTicks: cell.travelTicks,
    capacityStacksPerMinute: 60_000 / cell.dispatchIntervalTicks,
  }));

  const deviceRates = new Map<string, { inputsPerMinute: Record<ResourceId, number>; outputsPerMinute: Record<ResourceId, number> }>();
  for (const rate of devices) {
    const aggregate = deviceRates.get(rate.device) ?? { inputsPerMinute: {}, outputsPerMinute: {} };
    for (const [resource, value] of Object.entries(rate.inputsPerMinute)) aggregate.inputsPerMinute[resource] = Math.max(aggregate.inputsPerMinute[resource] ?? 0, value);
    for (const [resource, value] of Object.entries(rate.outputsPerMinute)) aggregate.outputsPerMinute[resource] = Math.max(aggregate.outputsPerMinute[resource] ?? 0, value);
    deviceRates.set(rate.device, aggregate);
  }
  const stationNetworks: StationNetworkAnalysis[] = Object.values(project.logisticsNetworks).sort((a, b) => a.id.localeCompare(b.id)).map((network) => {
    const routeRows = network.routes.map((route) => ({
      route: route.id,
      resource: route.resource,
      from: route.from,
      to: route.to,
      fromRegion: route.fromRegion,
      toRegion: route.toRegion,
      fromSlotCapacity: route.fromSlotCapacity,
      toSlotCapacity: route.toSlotCapacity,
      supplyReserve: route.supplyReserve,
      demandTarget: route.demandTarget,
      supplyPriority: route.supplyPriority,
      demandPriority: route.demandPriority,
      minimumBatch: route.minimumBatch,
      carrierBatchCapacity: route.carrierCapacity,
      carrierAsset: route.carrierAsset,
      fleetSize: route.fleetSize,
      batchCapacity: route.capacity,
      standardTravelTicks: route.standardTravelTicks,
      standardRoundTripTicks: route.standardRoundTripTicks,
      standardMissionEnergyMilliJoules: route.standardMissionEnergyMilliJoules,
      travelTicks: route.travelTicks,
      roundTripTicks: route.roundTripTicks,
      missionEnergyMilliJoules: route.missionEnergyMilliJoules,
      highSpeed: route.highSpeed ? { ...route.highSpeed } : null,
      capacityItemsPerMinute: route.capacity * 60_000 / route.roundTripTicks,
      energyLimitedItemsPerMinute: project.devices[route.from]!.stationEnergyPlan!.chargeMilliWatts * 60 / route.missionEnergyMilliJoules * route.capacity,
      dispatchProfile: stationRouteDispatchProfile(project, route, criticalDepths),
    }));
    const fleetLoads: Record<string, number> = {};
    for (const station of network.stations) for (const slot of station.slots.filter((item) => item.mode === "demand")) {
      const matchingRoutes = routeRows.filter((route) => route.to === station.device && route.resource === slot.resource);
      const bestRoute = [...matchingRoutes].sort((a, b) => b.capacityItemsPerMinute - a.capacityItemsPerMinute || a.route.localeCompare(b.route))[0];
      const bestCarrierRate = bestRoute?.capacityItemsPerMinute ?? 0;
      const downstreamDemand = Object.values(project.connections)
        .filter((connection) => connection.from.device === station.device && connection.resources.includes(slot.resource))
        .reduce((sum, connection) => sum + (deviceRates.get(connection.to.device)?.inputsPerMinute[slot.resource] ?? 0), 0);
      if (bestRoute && bestCarrierRate > 0 && downstreamDemand > 0) fleetLoads[bestRoute.from] = (fleetLoads[bestRoute.from] ?? 0) + downstreamDemand / bestCarrierRate;
    }
    const fleets = network.fleets.map((fleet) => ({
      station: fleet.station, region: fleet.region, carrierAsset: fleet.asset.id, count: fleet.count, estimatedLoad: fleetLoads[fleet.station] ?? 0,
    })).sort((a, b) => a.station.localeCompare(b.station));
    const estimatedCarrierLoad = fleets.reduce((sum, fleet) => sum + fleet.estimatedLoad, 0);
    return {
      network: network.id,
      kind: network.kind,
      dispatchPolicy: network.dispatchPolicy,
      fleets,
      stations: network.stations.length,
      estimatedCarrierLoad,
      stationEnergy: network.stations.map((station) => {
        const device = project.devices[station.device]!;
        return {
          device: device.id,
          region: device.region,
          capacityMilliJoules: device.stationEnergyPlan!.capacityMilliJoules,
          chargeMilliWatts: device.stationEnergyPlan!.chargeMilliWatts,
        };
      }).sort((a, b) => a.device.localeCompare(b.device)),
      routes: routeRows,
    };
  });

  const powerGrids = Object.values(project.powerGrids).sort((a, b) => a.id.localeCompare(b.id)).map((grid) => ({
    grid: grid.id,
    region: grid.region,
    distributors: [...grid.distributors],
    members: [...grid.members],
    transportStages: structuredClone(grid.transportStages),
    generators: generationDevices.filter((device) => grid.members.includes(device.device)),
    storageDevices: storageDevices.filter((device) => grid.storageDevices.includes(device.device)),
    productionMilliWatts: grid.productionMilliWatts,
    idleConsumptionMilliWatts: grid.idleConsumptionMilliWatts,
    ratedConsumptionMilliWatts: grid.ratedConsumptionMilliWatts,
    headroomMilliWatts: grid.productionMilliWatts - grid.ratedConsumptionMilliWatts,
    storageCapacityMilliJoules: grid.storageCapacityMilliJoules,
    initialStoredMilliJoules: grid.storageDevices.reduce((sum, id) => sum + (project.scenario.initialEnergyMilliJoules?.[id] ?? 0), 0),
    storageChargeMilliWatts: grid.storageChargeMilliWatts,
    storageDischargeMilliWatts: grid.storageDischargeMilliWatts,
  }));

  const diagnostics: ProductionDiagnostic[] = [];
  for (const device of Object.values(project.devices).filter((item) => item.processPlans.length > 1).sort((a, b) => a.id.localeCompare(b.id))) {
    diagnostics.push({
      code: "shared-work-center", severity: "info", device: device.id,
      message: `${device.id} shares one physical capacity envelope across ${device.processPlans.length} qualified operations using ${device.policy?.recipeDispatch ?? "authored-order"} operation / ${device.policy?.lotDispatch ?? "fifo"} lot dispatch${device.assetDef.production?.changeover ? ` with ${device.assetDef.production.changeover.durationTicks} ms sequence-dependent changeovers` : ""}${device.policy?.setupCampaign ? ` and setup campaigns of ${device.policy.setupCampaign.minimumReadyLots} ready lots / ${(device.policy.setupCampaign.maximumHoldTicks / 1000).toFixed(3)} s maximum hold` : ""}; per-operation rates are exclusive maxima`,
    });
  }
  const releaseTicks = (project.scenario.lotReleases ?? []).map((lot) => lot.releaseTick).sort((a, b) => a - b);
  if (releaseTicks.length) {
    const releaseIntervals = releaseTicks.slice(1).map((tick, index) => tick - releaseTicks[index]!);
    const meanReleaseInterval = releaseIntervals.length ? releaseIntervals.reduce((sum, ticks) => sum + ticks, 0) / releaseIntervals.length : 0;
    diagnostics.push({
      code: "lot-release-schedule", severity: "info",
      message: `${releaseTicks.length} identity-preserving lots are scheduled across ${releaseTicks.at(-1)! - releaseTicks[0]!} ms with ${meanReleaseInterval.toFixed(1)} ms mean planned interval; admission remains buffer-capacity gated`,
    });
    const control = project.blueprint.policies.lotRelease;
    diagnostics.push({
      code: "lot-release-control", severity: "info",
      message: control
        ? `Blueprint uses CONWIP admission with maximum ${control.maximumWip} active lots, reopening at ${control.reopenAtWip}${control.maximumReleaseDelayTicks === undefined ? "" : ` or after ${control.maximumReleaseDelayTicks} ms release delay`}, and ${control.dispatch} eligible-lot dispatch`
        : "Blueprint uses open-loop lot admission; every eligible lot enters as soon as the physical release boundary has capacity",
    });
  }
  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) for (const plan of device.processPlans) {
    const lotsPerJob = plan.lotTransfers.reduce((sum, transfer) => sum + transfer.input.count, 0);
    if (lotsPerJob <= 1) continue;
    diagnostics.push({
      code: "batch-process", severity: "info", device: device.id,
      message: `${device.id}/${plan.definition.id} requires ${lotsPerJob} identity-preserving lots before one ${plan.durationTicks} ms batch job can start`,
    });
  }
  const selectedInspectionPlans = Object.values(project.devices).flatMap((device) => device.processPlans
    .filter((plan) => plan.quality?.kind === "inspection").map((plan) => ({ device, plan, quality: plan.quality! })));
  for (const { device, plan, quality } of selectedInspectionPlans) if (quality.kind === "inspection") diagnostics.push({
    code: "quality-inspection", severity: "info", device: device.id,
    message: `${device.id}/${plan.definition.id} detects ${quality.detects.join(", ")} and routes failed lots to ${quality.rejectOutput.resource}${quality.scrapOutput ? `, then ${quality.scrapOutput.resource} after ${quality.maxReworkCycles} rework cycle(s)` : ""}`,
  });
  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) for (const plan of device.processPlans) {
    if (plan.quality?.kind !== "rework") continue;
    diagnostics.push({
      code: "quality-rework", severity: "info", device: device.id,
      message: `${device.id}/${plan.definition.id} repairs ${plan.quality.repairs.join(", ")} while preserving lot identity; all other latent defects remain`,
    });
  }
  const detectableDefects = new Set(selectedInspectionPlans.flatMap(({ quality }) => quality.kind === "inspection" ? quality.detects : []));
  for (const defect of [...new Set((project.scenario.qualityExcursions ?? []).flatMap((excursion) => excursion.defects))].sort()) {
    if (detectableDefects.has(defect)) continue;
    diagnostics.push({
      code: "quality-escape-risk", severity: "warning",
      message: `Fixed Scenario introduces '${defect}', but no selected inspection operation detects it; a target lot can escape with latent quality loss`,
    });
  }
  const hasTreatmentSource = (device: string, buffer: string, resource: ResourceId, minimumLevel: number, visited = new Set<string>()): boolean => {
    const key = `${device}\0${buffer}\0${resource}`;
    if (visited.has(key)) return false;
    visited.add(key);
    if ((project.scenario.initialTreatments ?? []).some((initial) => initial.device === device && initial.buffer === buffer
      && initial.resource === resource && initial.level >= minimumLevel && initial.count > 0)) return true;
    const inboundConnections = Object.values(project.connections).filter((connection) => connection.to.device === device
      && connection.toPort.buffer === buffer && connection.resources.includes(resource));
    for (const connection of inboundConnections) {
      const source = connection.fromDevice;
      if (source.treatmentPlan?.outputBuffer === connection.fromPort.buffer && source.treatmentPlan.mode.level >= minimumLevel) return true;
      if (hasTreatmentSource(source.id, connection.fromPort.buffer, resource, minimumLevel, visited)) return true;
    }
    const inboundRoutes = Object.values(project.logisticsNetworks).flatMap((network) => network.routes)
      .filter((route) => route.to === device && route.toBuffer === buffer && route.resource === resource);
    return inboundRoutes.some((route) => hasTreatmentSource(route.from, route.fromBuffer, resource, minimumLevel, visited));
  };
  const resourceNodes: ResourceNodeAnalysis[] = Object.values(project.resourceNodes).sort((a, b) => a.id.localeCompare(b.id)).map((node) => {
    const miners = extractionDevices.filter((device) => device.nodes.includes(node.id));
    const nominalSharePerMinute = miners.reduce((sum, miner) => sum + miner.itemsPerMinute / miner.nodes.length, 0);
    return {
      node: node.id, region: node.region, resource: node.resource, amount: node.amount,
      miners: miners.map((miner) => miner.device), nominalSharePerMinute,
      estimatedDepletionMinutes: nominalSharePerMinute > 0 ? node.amount / nominalSharePerMinute : null,
    };
  });
  for (const node of resourceNodes) {
    if (!node.miners.length) diagnostics.push({ code: "resource-unmined", severity: "info", resource: node.resource, message: `${node.node} contains ${node.amount} ${node.resource} in ${node.region} but has no bound extractor` });
    else if (node.estimatedDepletionMinutes !== null && node.estimatedDepletionMinutes * 60_000 < project.scenario.durationTicks) diagnostics.push({ code: "resource-depletes-during-scenario", severity: "warning", resource: node.resource, message: `${node.node} is estimated to deplete after ${node.estimatedDepletionMinutes.toFixed(3)} min, before the ${(project.scenario.durationTicks / 60_000).toFixed(3)} min scenario ends` });
  }
  for (const balance of resources) {
    if (balance.netPerMinute < -1e-9 && !balance.hasBoundarySupply) diagnostics.push({
      code: "material-deficit", severity: "warning", resource: balance.resource,
      message: `${balance.resource} nominal demand exceeds production by ${(-balance.netPerMinute).toFixed(3)}/min`,
    });
    if (balance.netPerMinute > 1e-9 && !balance.hasBoundaryDemand) diagnostics.push({
      code: "material-surplus", severity: "info", resource: balance.resource,
      message: `${balance.resource} has ${balance.netPerMinute.toFixed(3)}/min nominal surplus without a declared boundary consumer`,
    });
  }

  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    for (const plan of device.processPlans) for (const input of plan.inputs) {
      const minimumLevel = input.minimumTreatmentLevel ?? 0;
      if (minimumLevel > 0 && !hasTreatmentSource(device.id, input.buffer, input.resource, minimumLevel)) diagnostics.push({
        code: "treatment-input-unfed", severity: "warning", resource: input.resource, device: device.id,
        message: `${device.id} mode ${plan.mode.id} requires ${input.resource}@${minimumLevel}+ in ${input.buffer}, but no upstream treatment path can supply it`,
      });
    }
    const treatment = device.treatmentPlan;
    if (!treatment) continue;
    const materialInbound = Object.values(project.connections).some((connection) => connection.to.device === device.id
      && connection.toPort.buffer === treatment.inputBuffer);
    const initialMaterial = Object.values(project.scenario.initialBuffers?.[device.id]?.[treatment.inputBuffer] ?? {}).reduce((sum, count) => sum + count, 0);
    if (!materialInbound && initialMaterial <= 0) diagnostics.push({
      code: "treatment-input-unfed", severity: "warning", device: device.id,
      message: `${device.id} treatment input ${treatment.inputBuffer} has no inbound material link or startup inventory`,
    });
    const agentInbound = Object.values(project.connections).some((connection) => connection.to.device === device.id
      && connection.toPort.buffer === treatment.agentBuffer && connection.resources.includes(treatment.mode.agent.resource));
    const initialAgent = project.scenario.initialBuffers?.[device.id]?.[treatment.agentBuffer]?.[treatment.mode.agent.resource] ?? 0;
    if (!agentInbound && initialAgent <= 0) diagnostics.push({
      code: "treatment-agent-unfed", severity: "warning", resource: treatment.mode.agent.resource, device: device.id,
      message: `${device.id} requires ${treatment.mode.agent.resource} in ${treatment.agentBuffer} but has no inbound agent link or startup inventory`,
    });
  }

  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!device.transportEndpoint && device.assetDef.power.activeMilliWatts > 0 && !device.powerGrid) diagnostics.push({
      code: "power-disconnected", severity: "warning", device: device.id,
      message: `${device.id} requires power but is outside every distribution grid`,
    });
  }
  for (const connection of Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id))) for (const stage of connection.logisticsStages) {
    if (stage.stage === "line" || stage.asset.power.activeMilliWatts <= 0 || stage.powerGrid) continue;
    diagnostics.push({
      code: "power-transport-disconnected", severity: "warning", connection: connection.id,
      device: stage.device?.id,
      message: `${stage.device?.id ?? `${connection.id}.${stage.stage}`} (${stage.asset.id}) requires power but its endpoint is outside every distribution grid`,
    });
  }
  for (const grid of powerGrids) if (grid.headroomMilliWatts < 0) diagnostics.push({
    code: "power-deficit", severity: "warning",
    message: `${grid.grid} rated demand exceeds generation by ${(-grid.headroomMilliWatts / 1000).toFixed(3)} W`,
  });
  for (const generator of generationDevices.filter((device) => device.kind === "fuel")) {
    const inbound = Object.values(project.connections).some((connection) => connection.to.device === generator.device
      && connection.toPort.buffer === generator.fuelBuffer && connection.resources.includes(generator.fuelResource!));
    const initialFuel = Object.values(project.scenario.initialBuffers?.[generator.device]?.[generator.fuelBuffer ?? ""] ?? {}).reduce((sum, count) => sum + count, 0);
    if (!inbound && initialFuel <= 0) diagnostics.push({
      code: "power-fuel-unfed", severity: "warning", resource: generator.fuelResource, device: generator.device,
      message: `${generator.device} requires ${generator.fuelResource} in ${generator.fuelBuffer} but has no inbound fuel link or scenario startup fuel`,
    });
  }

  for (const network of Object.values(project.logisticsNetworks).sort((a, b) => a.id.localeCompare(b.id))) {
    for (const station of network.stations) for (const slot of station.slots) {
      if (slot.mode === "demand" && !network.routes.some((route) => route.to === station.device && route.resource === slot.resource)) diagnostics.push({
        code: "station-unmatched-demand", severity: "warning", resource: slot.resource, device: station.device, network: network.id,
        message: `${station.device} demands ${slot.resource} on ${network.id}, but the network has no matching supplier`,
      });
      if (slot.mode === "supply" && !network.routes.some((route) => route.from === station.device && route.resource === slot.resource)) diagnostics.push({
        code: "station-unmatched-supply", severity: "info", resource: slot.resource, device: station.device, network: network.id,
        message: `${station.device} supplies ${slot.resource} on ${network.id}, but the network has no matching demander`,
      });
    }
  }
  for (const network of stationNetworks) for (const fleet of network.fleets) if (fleet.estimatedLoad > fleet.count + 1e-9) diagnostics.push({
    code: "station-fleet-deficit", severity: "warning", network: network.network, device: fleet.station,
    message: `${fleet.station} needs about ${fleet.estimatedLoad.toFixed(2)} station-owned ${fleet.carrierAsset} carriers for ${network.network} but configures ${fleet.count}`,
  });
  for (const network of stationNetworks) for (const route of network.routes) {
    const downstreamDemand = Object.values(project.connections).filter((connection) => connection.from.device === route.to && connection.resources.includes(route.resource))
      .reduce((sum, connection) => sum + (deviceRates.get(connection.to.device)?.inputsPerMinute[route.resource] ?? 0), 0);
    if (downstreamDemand > route.energyLimitedItemsPerMinute + 1e-9) diagnostics.push({
      code: "station-energy-deficit", severity: "warning", network: network.network, device: route.from, resource: route.resource,
      message: `${route.from} charging limits ${network.network} to ${route.energyLimitedItemsPerMinute.toFixed(3)} ${route.resource}/min for ${downstreamDemand.toFixed(3)}/min downstream demand`,
    });
  }

  for (const device of Object.values(project.devices)) {
    if (!device.processPlans.length) continue;
    const rates = deviceRates.get(device.id)!;
    for (const [resource, demand] of Object.entries(rates.inputsPerMinute)) {
      const inbound = Object.values(project.connections).filter((connection) => connection.to.device === device.id && connection.resources.includes(resource)
        && (connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes("*") || connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes(resource)));
      const capacity = inbound.reduce((sum, connection) => sum + connectionCapacityPerMinute(connection, resource), 0);
      if (capacity + 1e-9 < demand) diagnostics.push({ code: "input-logistics", severity: "warning", resource, device: device.id, message: `${device.id} needs ${demand.toFixed(3)} ${resource}/min but inbound links carry at most ${capacity.toFixed(3)}/min` });
    }
    for (const [resource, supply] of Object.entries(rates.outputsPerMinute)) {
      const outbound = Object.values(project.connections).filter((connection) => connection.from.device === device.id && connection.resources.includes(resource)
        && (connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes("*") || connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes(resource)));
      const capacity = outbound.reduce((sum, connection) => sum + connectionCapacityPerMinute(connection, resource), 0);
      if (capacity + 1e-9 < supply) diagnostics.push({ code: "output-logistics", severity: "warning", resource, device: device.id, message: `${device.id} produces ${supply.toFixed(3)} ${resource}/min but outbound links carry at most ${capacity.toFixed(3)}/min` });
    }
  }

  const declarativeDeviceIds = new Set([
    ...devices.map((device) => device.device), ...extractionDevices.map((device) => device.device),
    ...generationDevices.map((device) => device.device), ...storageDevices.map((device) => device.device),
  ]);
  return {
    powerAllocation: project.blueprint.policies.powerAllocation,
    declarativeDevices: declarativeDeviceIds.size,
    opaqueDevices: Object.keys(project.devices).length - declarativeDeviceIds.size,
    devices, bufferContracts, portContracts, recipeOptions, productionGraph, extractionDevices, treatmentDevices, generationDevices, storageDevices, resourceNodes,
    resources,
    connections,
    transportCells,
    stationNetworks,
    powerGrids,
    diagnostics,
  };
}
