import type {
  CompiledConnection,
  CompiledDevice,
  CompiledFactoryProject,
  CompiledLogisticsNetwork,
  CompiledTransportCell,
  DeviceAsset,
  IndustrialProcess,
  ProductRoute,
  ProjectEvidenceHashes,
  ProjectHashes,
  ResourceAsset,
} from "./types";
import { ENGINE_VERSION, hashValue } from "./utils";

type CompiledProjectWithoutHashes = Omit<CompiledFactoryProject, "hashes">;

function processProjection(process: IndustrialProcess): unknown {
  const { sourceFile: _sourceFile, contentHash: _contentHash, description: _description, tags: _tags, ...semantic } = process;
  return semantic;
}

function resourceProjection(resource: ResourceAsset): unknown {
  const {
    assetDir: _assetDir,
    contentHash: _contentHash,
    visual: _visual,
    files: _files,
    name: _name,
    description: _description,
    tags: _tags,
    ...semantic
  } = resource;
  return semantic;
}

function routeProjection(route: ProductRoute): unknown {
  const { sourceFile: _sourceFile, contentHash: _contentHash, ...semantic } = route;
  return semantic;
}

function selectedProductionContract(device: CompiledDevice): unknown {
  const production = device.assetDef.production;
  if (!production || device.processPlans.length === 0) return undefined;
  const processIds = new Set(device.processPlans.map((plan) => plan.definition.id));
  const modeIds = new Set(device.processPlans.map((plan) => plan.mode.id));
  const setupGroups = new Set(device.processPlans.flatMap((plan) => plan.setupGroup ? [plan.setupGroup] : []));
  return {
    processes: [...processIds].sort(),
    speed: production.speed,
    modes: production.modes.filter((mode) => modeIds.has(mode.id)),
    changeover: production.changeover ? {
      transitions: production.changeover.transitions.filter((transition) =>
        setupGroups.has(transition.to) && (transition.from === null || setupGroups.has(transition.from))),
    } : undefined,
    maintenance: production.maintenance,
  };
}

function selectedTreatmentContract(device: CompiledDevice): unknown {
  if (!device.treatmentPlan || !device.assetDef.treatment) return undefined;
  return {
    inputBuffer: device.assetDef.treatment.inputBuffer,
    outputBuffer: device.assetDef.treatment.outputBuffer,
    agentBuffer: device.assetDef.treatment.agentBuffer,
    mode: device.assetDef.treatment.modes.find((mode) => mode.id === device.treatmentPlan!.mode.id),
  };
}

function deviceProjection(device: CompiledDevice): unknown {
  const asset = device.assetDef;
  return {
    id: device.id,
    asset: asset.id,
    runtime: { apiVersion: asset.runtime.apiVersion, entry: asset.runtime.entry, sourceHash: asset.runtimeSourceHash },
    capabilities: asset.capabilities,
    geometry: {
      footprint: device.footprint,
      rotatable: asset.geometry.rotatable,
      ports: device.ports,
    },
    buffers: device.buffers,
    production: selectedProductionContract(device),
    maintenanceProvider: asset.maintenanceProvider,
    toolingProvider: asset.toolingProvider,
    utilityProvider: asset.utilityProvider,
    extraction: device.extractionPlan ? {
      contract: {
        radius: asset.extraction?.radius,
        outputBuffer: asset.extraction?.outputBuffer,
        cycleTicks: asset.extraction?.cycleTicks,
        itemsPerCycle: asset.extraction?.itemsPerCycle,
      },
      plan: device.extractionPlan,
    } : undefined,
    treatment: selectedTreatmentContract(device),
    logistics: asset.logistics,
    logisticsStation: asset.logisticsStation,
    power: asset.power,
    economics: asset.economics,
    processPlans: device.processPlans.map((plan) => ({
      ...plan,
      definition: processProjection(plan.definition),
    })),
    treatmentPlan: device.treatmentPlan,
    generationPlan: device.generationPlan,
    storagePlan: device.storagePlan,
    stationEnergyPlan: device.stationEnergyPlan,
    maintenanceProviders: device.maintenanceProviders,
    qualificationProviders: device.qualificationProviders,
    powerGrid: device.powerGrid,
  };
}

function transportAssetProjection(asset: DeviceAsset): unknown {
  return {
    id: asset.id,
    runtime: { apiVersion: asset.runtime.apiVersion, entry: asset.runtime.entry, sourceHash: asset.runtimeSourceHash },
    capabilities: asset.capabilities,
    geometry: asset.geometry,
    buffers: asset.buffers,
    logistics: asset.logistics,
    power: asset.power,
    economics: asset.economics,
  };
}

function connectionProjection(connection: CompiledConnection): unknown {
  return {
    id: connection.id,
    logisticsStages: connection.logisticsStages.map((stage) => ({
      stage: stage.stage,
      asset: transportAssetProjection(stage.asset),
      distance: stage.distance,
      capacity: stage.capacity,
      durationTicks: stage.durationTicks,
      stackCapacity: stage.stackCapacity,
      region: stage.region,
      position: stage.position,
      powerGrid: stage.powerGrid,
      device: stage.device?.id,
    })),
    distance: connection.distance,
    transportCells: connection.transportCells,
    stackSizeByResource: connection.stackSizeByResource,
    maxStackSize: connection.maxStackSize,
    loaderDispatchIntervalTicks: connection.loaderDispatchIntervalTicks,
    lineDispatchIntervalTicks: connection.lineDispatchIntervalTicks,
    lineCellTravelTicks: connection.lineCellTravelTicks,
    unloaderDispatchIntervalTicks: connection.unloaderDispatchIntervalTicks,
    capacity: connection.capacity,
    travelTicks: connection.travelTicks,
    dispatchIntervalTicks: connection.dispatchIntervalTicks,
  };
}

function transportCellProjection(cell: CompiledTransportCell): unknown {
  return {
    id: cell.id,
    region: cell.region,
    position: cell.position,
    asset: transportAssetProjection(cell.asset),
    connections: cell.connections,
    output: cell.output,
    dispatchIntervalTicks: cell.dispatchIntervalTicks,
    travelTicks: cell.travelTicks,
  };
}

function networkProjection(network: CompiledLogisticsNetwork): unknown {
  return {
    id: network.id,
    kind: network.kind,
    dispatchPolicy: network.dispatchPolicy,
    fleets: network.fleets.map((fleet) => ({
      station: fleet.station,
      region: fleet.region,
      asset: transportAssetProjection(fleet.asset),
      count: fleet.count,
    })),
    stations: network.stations,
    routes: network.routes,
  };
}

function collectSelectedResources(project: CompiledProjectWithoutHashes, processes: IndustrialProcess[]): Set<string> {
  const ids = new Set<string>();
  const addAmounts = (amounts: ReadonlyArray<{ resource: string }>) =>
    amounts.forEach((amount) => ids.add(amount.resource));
  for (const process of processes) {
    addAmounts(process.inputs);
    addAmounts(process.outputs);
    addAmounts(process.tooling ?? []);
    if (process.quality?.kind === "inspection") {
      ids.add(process.quality.rejectResource);
      if (process.quality.scrapResource) ids.add(process.quality.scrapResource);
    }
  }
  for (const node of Object.values(project.resourceNodes)) ids.add(node.resource);
  for (const device of Object.values(project.devices)) {
    for (const buffer of Object.values(device.buffers)) {
      for (const resource of buffer.accepts) if (resource !== "*") ids.add(resource);
    }
    for (const plan of device.processPlans) {
      addAmounts(plan.inputs);
      addAmounts(plan.outputs);
      addAmounts(plan.tooling);
    }
    for (const node of device.extractionPlan?.nodes ?? []) ids.add(node.resource);
    for (const fuel of device.generationPlan?.kind === "fuel" ? device.generationPlan.fuels : []) ids.add(fuel.resource);
    if (device.treatmentPlan) ids.add(device.treatmentPlan.mode.agent.resource);
  }
  for (const connection of Object.values(project.connections)) {
    for (const resource of connection.resources) ids.add(resource);
  }
  for (const network of Object.values(project.logisticsNetworks)) {
    for (const route of network.routes) ids.add(route.resource);
  }
  for (const buffers of Object.values(project.scenario.initialBuffers ?? {})) {
    for (const quantities of Object.values(buffers)) {
      for (const resource of Object.keys(quantities)) ids.add(resource);
    }
  }
  for (const release of project.scenario.lotReleases ?? []) ids.add(release.resource);
  for (const delivery of project.scenario.materialDeliveries ?? []) ids.add(delivery.resource);
  for (const treatment of project.scenario.initialTreatments ?? []) ids.add(treatment.resource);
  ids.add(project.objective.targetResource);
  for (const resource of project.objective.wipResources) ids.add(resource);
  for (const contract of project.objective.deliveryContracts ?? []) ids.add(contract.resource);
  return ids;
}

function selectedCatalogProjection(project: CompiledProjectWithoutHashes): {
  resources: Record<string, unknown>;
  processes: Record<string, unknown>;
  routes: Record<string, unknown>;
} {
  const selectedProcesses = [...new Map(
    Object.values(project.devices).flatMap((device) =>
      device.processPlans.map((plan) => [plan.definition.id, plan.definition] as const)),
  ).values()].sort((left, right) => left.id.localeCompare(right.id));
  const resourceIds = collectSelectedResources(project, selectedProcesses);
  const routeIds = new Set<string>();
  for (const resourceId of resourceIds) {
    const route = project.resources[resourceId]?.tracking?.route;
    if (route) routeIds.add(route);
  }
  for (const routeId of routeIds) {
    const route = project.routes[routeId];
    if (!route) continue;
    resourceIds.add(route.entry.resource);
    for (const step of route.steps) {
      for (const transition of step.transitions) resourceIds.add(transition.resource);
    }
  }
  return {
    resources: Object.fromEntries([...resourceIds].sort().map((id) => [id, resourceProjection(project.resources[id]!) ])),
    processes: Object.fromEntries(selectedProcesses.map((process) => [process.id, processProjection(process)])),
    routes: Object.fromEntries([...routeIds].sort().map((id) => [id, routeProjection(project.routes[id]!) ])),
  };
}

/** Build the identity of the exact compiled selection, excluding unused catalog inventory and presentation. */
export function buildSelectionExecutionHash(project: CompiledProjectWithoutHashes): string {
  const catalogs = selectedCatalogProjection(project);
  const { revision: _revision, ...executionBlueprint } = project.blueprint;
  return hashValue({
    version: 1,
    engineVersion: ENGINE_VERSION,
    selection: project.selection,
    catalogs,
    world: project.world,
    blueprint: executionBlueprint,
    scenario: project.scenario,
    objective: project.objective,
    devices: Object.fromEntries(Object.entries(project.devices).map(([id, device]) => [id, deviceProjection(device)])),
    connections: Object.fromEntries(Object.entries(project.connections).map(([id, connection]) => [id, connectionProjection(connection)])),
    transportCells: Object.fromEntries(Object.entries(project.transportCells).map(([id, cell]) => [id, transportCellProjection(cell)])),
    logisticsNetworks: Object.fromEntries(Object.entries(project.logisticsNetworks).map(([id, network]) => [id, networkProjection(network)])),
    powerGrids: project.powerGrids,
  });
}

export function projectEvidenceHashes(hashes: ProjectHashes): ProjectEvidenceHashes {
  return {
    engineVersion: hashes.engineVersion,
    executionHash: hashes.executionHash,
    worldHash: hashes.worldHash,
    blueprintHash: hashes.blueprintHash,
    scenarioHash: hashes.scenarioHash,
    objectiveHash: hashes.objectiveHash,
  };
}

export function sameProjectEvidenceIdentity(
  left: Pick<ProjectHashes, "engineVersion" | "executionHash">,
  right: Pick<ProjectHashes, "engineVersion" | "executionHash">,
): boolean {
  return left.engineVersion === right.engineVersion && left.executionHash === right.executionHash;
}
