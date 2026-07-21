import type { BlueprintDevice, CompiledFactoryProject, DeviceAsset, IndustrialProcess, ProcessAmount, ResourceId } from "./types";
import { connectionCapacityPerMinute, maximumConnectionCapacityPerMinute } from "./logistics-capacity";
import { planResourceDemand } from "./production-demand";

export interface DeviceProductionRate {
  device: string;
  asset: string;
  process: string;
  category: string;
  cycleTicks: number;
  cyclesPerMinute: number;
  inputsPerMinute: Record<ResourceId, number>;
  outputsPerMinute: Record<ResourceId, number>;
  inputBindings: Record<ResourceId, string>;
  outputBindings: Record<ResourceId, string>;
  powerMilliWatts: number;
}

export interface RecipeOptionAnalysis {
  device: string;
  asset: string;
  process: string;
  name: string;
  category: string;
  selected: boolean;
  cycleTicks: number;
  cyclesPerMinute: number;
  inputs: ProcessAmount[];
  outputs: ProcessAmount[];
  inputBindings: Record<ResourceId, string>;
  outputBindings: Record<ResourceId, string>;
  targetOutputPerMinute: number;
}

export interface ProductionDependencyGraph {
  targetResource: ResourceId;
  rawInputsPerTarget: Record<ResourceId, number>;
  coproductSurplusPerTarget: Record<ResourceId, number>;
  steps: Array<{ device: string; process: string; cyclesPerTarget: number }>;
  dependencies: Array<{ device: string; process: string; inputs: ResourceId[]; outputs: ResourceId[] }>;
}

export interface DeviceExtractionRate {
  device: string;
  asset: string;
  resource: ResourceId;
  nodes: string[];
  cycleTicks: number;
  itemsPerCycle: number;
  itemsPerMinute: number;
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
    stage: "loader" | "line" | "unloader"; asset: string; capacity: number; durationTicks: number; stackCapacity: number;
    powerMilliWatts: number; powerGrid?: string; position?: { x: number; y: number };
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
  transportStages: Array<{ connection: string; stage: "loader" | "unloader" }>;
  generators: DevicePowerGenerationRate[];
  productionMilliWatts: number;
  ratedConsumptionMilliWatts: number;
  headroomMilliWatts: number;
}

export interface StationNetworkAnalysis {
  network: string;
  kind: "planetary" | "interstellar";
  fleetAsset: string;
  fleetSize: number;
  stations: number;
  estimatedCarrierLoad: number;
  routes: Array<{
    route: string;
    resource: ResourceId;
    from: string;
    to: string;
    fromRegion: string;
    toRegion: string;
    minimumBatch: number;
    batchCapacity: number;
    travelTicks: number;
    capacityItemsPerMinute: number;
  }>;
}

export interface ProductionDiagnostic {
  code: "material-deficit" | "material-surplus" | "input-logistics" | "output-logistics" | "power-disconnected" | "power-transport-disconnected" | "power-deficit" | "power-fuel-unfed" | "station-unmatched-demand" | "station-unmatched-supply" | "station-fleet-deficit" | "resource-unmined" | "resource-depletes-during-scenario";
  severity: "warning" | "info";
  resource?: ResourceId;
  device?: string;
  connection?: string;
  network?: string;
  message: string;
}

export interface ProductionAnalysis {
  declarativeDevices: number;
  opaqueDevices: number;
  devices: DeviceProductionRate[];
  recipeOptions: RecipeOptionAnalysis[];
  productionGraph: ProductionDependencyGraph;
  extractionDevices: DeviceExtractionRate[];
  generationDevices: DevicePowerGenerationRate[];
  resourceNodes: ResourceNodeAnalysis[];
  resources: ResourceProductionBalance[];
  connections: ConnectionRateLimit[];
  transportCells: TransportCellAnalysis[];
  stationNetworks: StationNetworkAnalysis[];
  powerGrids: PowerGridAnalysis[];
  diagnostics: ProductionDiagnostic[];
}

function bufferSupports(asset: DeviceAsset, bufferId: string, resource: ResourceId): boolean {
  const buffer = asset.buffers.find((item) => item.id === bufferId);
  return Boolean(buffer && (buffer.accepts.includes("*") || buffer.accepts.includes(resource)));
}

export function bindProcessRecipe(
  asset: DeviceAsset,
  process: IndustrialProcess,
  preferred?: BlueprintDevice["recipe"],
): { inputs: Record<ResourceId, string>; outputs: Record<ResourceId, string> } | null {
  const production = asset.production;
  if (!production || !production.categories.includes(process.category)) return null;
  const bind = (amounts: ProcessAmount[], allowed: string[], preferredBindings: Record<ResourceId, string> | undefined) => {
    const bindings: Record<ResourceId, string> = {};
    const used = new Set<string>();
    for (const amount of amounts) {
      const preferredBuffer = preferredBindings?.[amount.resource];
      const candidates = allowed.filter((buffer) => bufferSupports(asset, buffer, amount.resource))
        .sort((a, b) => Number(used.has(a)) - Number(used.has(b)) || a.localeCompare(b));
      const buffer = preferredBuffer && candidates.includes(preferredBuffer) ? preferredBuffer : candidates[0];
      if (!buffer) return null;
      bindings[amount.resource] = buffer;
      used.add(buffer);
    }
    return bindings;
  };
  const inputs = bind(process.inputs, production.inputBuffers, preferred?.inputs);
  const outputs = bind(process.outputs, production.outputBuffers, preferred?.outputs);
  return inputs && outputs ? { inputs, outputs } : null;
}

function buildProductionGraph(project: CompiledFactoryProject, devices: DeviceProductionRate[]): ProductionDependencyGraph {
  const plan = planResourceDemand(project.objective.targetResource, 1, (resource) => {
    const producer = devices.filter((device) => (device.outputsPerMinute[resource] ?? 0) > 0)
      .sort((a, b) => (b.outputsPerMinute[resource] ?? 0) - (a.outputsPerMinute[resource] ?? 0) || a.device.localeCompare(b.device))[0];
    const processPlan = producer ? project.devices[producer.device]?.processPlan : undefined;
    if (!producer || !processPlan) return null;
    return {
      key: producer.device,
      inputs: processPlan.definition.inputs,
      outputs: processPlan.definition.outputs,
      data: { producer, processPlan },
    };
  });
  return {
    targetResource: project.objective.targetResource,
    rawInputsPerTarget: plan.rawDemandPerMinute,
    coproductSurplusPerTarget: plan.surplusPerMinute,
    steps: plan.processes.map((row) => ({
      device: row.candidate.data.producer.device,
      process: row.candidate.data.processPlan.definition.id,
      cyclesPerTarget: row.requiredCyclesPerMinute,
    })).sort((a, b) => a.device.localeCompare(b.device)),
    dependencies: devices.map((device) => ({
      device: device.device, process: device.process,
      inputs: Object.keys(device.inputBindings).sort(), outputs: Object.keys(device.outputBindings).sort(),
    })),
  };
}

function add(target: Record<string, number>, resource: string, value: number): void {
  target[resource] = (target[resource] ?? 0) + value;
}

function declaredBoundaryResources(project: CompiledFactoryProject): Set<ResourceId> {
  const resources = new Set<ResourceId>();
  for (const device of Object.values(project.devices)) {
    if (device.processPlan || !device.assetDef.capabilities.includes("consume")) continue;
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
  const generationDevices: DevicePowerGenerationRate[] = [];
  const produced: Record<ResourceId, number> = {};
  const consumed: Record<ResourceId, number> = {};
  for (const device of Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!device.processPlan) continue;
    const cyclesPerMinute = 60_000 / device.processPlan.durationTicks;
    const inputsPerMinute: Record<ResourceId, number> = {};
    const outputsPerMinute: Record<ResourceId, number> = {};
    for (const amount of device.processPlan.inputs) {
      add(inputsPerMinute, amount.resource, amount.count * cyclesPerMinute);
      add(consumed, amount.resource, amount.count * cyclesPerMinute);
    }
    for (const amount of device.processPlan.outputs) {
      add(outputsPerMinute, amount.resource, amount.count * cyclesPerMinute);
      add(produced, amount.resource, amount.count * cyclesPerMinute);
    }
    devices.push({
      device: device.id,
      asset: device.asset,
      process: device.processPlan.definition.id,
      category: device.processPlan.definition.category,
      cycleTicks: device.processPlan.durationTicks,
      cyclesPerMinute,
      inputsPerMinute,
      outputsPerMinute,
      inputBindings: Object.fromEntries(device.processPlan.inputs.map((amount) => [amount.resource, amount.buffer])),
      outputBindings: Object.fromEntries(device.processPlan.outputs.map((amount) => [amount.resource, amount.buffer])),
      powerMilliWatts: device.assetDef.power.consumptionMilliWatts,
    });
  }
  const recipeOptions: RecipeOptionAnalysis[] = Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id)).flatMap((device) => {
    if (!device.assetDef.production) return [];
    return Object.values(project.processes).sort((a, b) => a.id.localeCompare(b.id)).flatMap((process) => {
      const bindings = bindProcessRecipe(device.assetDef, process, device.recipe);
      if (!bindings) return [];
      const cycleTicks = Math.max(1, Math.ceil(process.durationTicks * device.assetDef.production!.speed.denominator / device.assetDef.production!.speed.numerator));
      const cyclesPerMinute = 60_000 / cycleTicks;
      const targetOutput = process.outputs.find((amount) => amount.resource === project.objective.targetResource)?.count ?? 0;
      return [{
        device: device.id, asset: device.asset, process: process.id, name: process.name, category: process.category,
        selected: device.processPlan?.definition.id === process.id, cycleTicks, cyclesPerMinute,
        inputs: structuredClone(process.inputs), outputs: structuredClone(process.outputs),
        inputBindings: bindings.inputs, outputBindings: bindings.outputs,
        targetOutputPerMinute: targetOutput * cyclesPerMinute,
      }];
    });
  });
  const productionGraph = buildProductionGraph(project, devices);

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
      powerMilliWatts: device.assetDef.power.consumptionMilliWatts,
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

  const connections = Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id)).map((connection) => ({
    connection: connection.id,
    from: connection.from.device,
    to: connection.to.device,
    capacityItemsPerMinute: maximumConnectionCapacityPerMinute(connection),
    capacityByResource: Object.fromEntries(Object.keys(connection.stackSizeByResource).map((resource) => [resource, connectionCapacityPerMinute(connection, resource)])),
    stackSizeByResource: { ...connection.stackSizeByResource }, maxStackSize: connection.maxStackSize,
    travelTicks: connection.travelTicks,
    dispatchIntervalTicks: connection.dispatchIntervalTicks,
    pathCells: connection.path.length,
    maxLevel: Math.max(0, ...connection.path.map((cell) => cell.level ?? 0)),
    sharedCells: connection.transportCells.filter((cell) => project.transportCells[cell]!.connections.length > 1).length,
    stages: connection.logisticsStages.map((stage) => ({
      stage: stage.stage, asset: stage.asset.id, capacity: stage.capacity, durationTicks: stage.durationTicks, stackCapacity: stage.stackCapacity,
      powerMilliWatts: stage.asset.power.consumptionMilliWatts,
      ...(stage.powerGrid ? { powerGrid: stage.powerGrid } : {}), ...(stage.position ? { position: { ...stage.position } } : {}),
    })),
  }));
  const transportCells = Object.values(project.transportCells).sort((a, b) => a.id.localeCompare(b.id)).map((cell) => ({
    cell: cell.id, region: cell.region, position: { ...cell.position }, asset: cell.asset.id,
    connections: [...cell.connections], output: structuredClone(cell.output), travelTicks: cell.travelTicks,
    capacityStacksPerMinute: 60_000 / cell.dispatchIntervalTicks,
  }));

  const deviceRates = new Map(devices.map((device) => [device.device, device]));
  const stationNetworks: StationNetworkAnalysis[] = Object.values(project.logisticsNetworks).sort((a, b) => a.id.localeCompare(b.id)).map((network) => {
    const routeRows = network.routes.map((route) => ({
      route: route.id,
      resource: route.resource,
      from: route.from,
      to: route.to,
      fromRegion: route.fromRegion,
      toRegion: route.toRegion,
      minimumBatch: route.minimumBatch,
      batchCapacity: route.capacity,
      travelTicks: route.travelTicks,
      capacityItemsPerMinute: route.capacity * 60_000 / route.travelTicks,
    }));
    let estimatedCarrierLoad = 0;
    for (const station of network.stations) for (const slot of station.slots.filter((item) => item.mode === "demand")) {
      const matchingRoutes = routeRows.filter((route) => route.to === station.device && route.resource === slot.resource);
      const bestCarrierRate = Math.max(0, ...matchingRoutes.map((route) => route.capacityItemsPerMinute));
      const downstreamDemand = Object.values(project.connections)
        .filter((connection) => connection.from.device === station.device)
        .reduce((sum, connection) => sum + (deviceRates.get(connection.to.device)?.inputsPerMinute[slot.resource] ?? 0), 0);
      if (bestCarrierRate > 0 && downstreamDemand > 0) estimatedCarrierLoad += downstreamDemand / bestCarrierRate;
    }
    return {
      network: network.id,
      kind: network.kind,
      fleetAsset: network.fleetAsset.id,
      fleetSize: network.fleetSize,
      stations: network.stations.length,
      estimatedCarrierLoad,
      routes: routeRows,
    };
  });

  const powerGrids = Object.values(project.powerGrids).sort((a, b) => a.id.localeCompare(b.id)).map((grid) => ({
    grid: grid.id,
    region: grid.region,
    distributors: [...grid.distributors],
    members: [...grid.members],
    transportStages: structuredClone(grid.transportStages),
    generators: generationDevices.filter((device) => grid.distributors.includes(device.device)),
    productionMilliWatts: grid.productionMilliWatts,
    ratedConsumptionMilliWatts: grid.ratedConsumptionMilliWatts,
    headroomMilliWatts: grid.productionMilliWatts - grid.ratedConsumptionMilliWatts,
  }));

  const diagnostics: ProductionDiagnostic[] = [];
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
    if (device.assetDef.power.consumptionMilliWatts > 0 && !device.powerGrid) diagnostics.push({
      code: "power-disconnected", severity: "warning", device: device.id,
      message: `${device.id} requires power but is outside every distribution grid`,
    });
  }
  for (const connection of Object.values(project.connections).sort((a, b) => a.id.localeCompare(b.id))) for (const stage of connection.logisticsStages) {
    if (stage.stage === "line" || stage.asset.power.consumptionMilliWatts <= 0 || stage.powerGrid) continue;
    diagnostics.push({
      code: "power-transport-disconnected", severity: "warning", connection: connection.id,
      message: `${connection.id}.${stage.stage} (${stage.asset.id}) requires power but its endpoint is outside every distribution grid`,
    });
  }
  for (const grid of powerGrids) if (grid.headroomMilliWatts < 0) diagnostics.push({
    code: "power-deficit", severity: "warning",
    message: `${grid.grid} rated demand exceeds generation by ${(-grid.headroomMilliWatts / 1000).toFixed(3)} W`,
  });
  for (const generator of generationDevices.filter((device) => device.kind === "fuel")) {
    const inbound = Object.values(project.connections).some((connection) => connection.to.device === generator.device && connection.toPort.buffer === generator.fuelBuffer);
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
  for (const network of stationNetworks) if (network.estimatedCarrierLoad > network.fleetSize + 1e-9) diagnostics.push({
    code: "station-fleet-deficit", severity: "warning", network: network.network,
    message: `${network.network} needs about ${network.estimatedCarrierLoad.toFixed(2)} carriers for its directly connected process demand but configures ${network.fleetSize}`,
  });

  for (const device of Object.values(project.devices)) {
    if (!device.processPlan) continue;
    for (const [resource, demand] of Object.entries(devices.find((item) => item.device === device.id)!.inputsPerMinute)) {
      const inbound = Object.values(project.connections).filter((connection) => connection.to.device === device.id && (connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes("*") || connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes(resource)));
      const capacity = inbound.reduce((sum, connection) => sum + connectionCapacityPerMinute(connection, resource), 0);
      if (capacity + 1e-9 < demand) diagnostics.push({ code: "input-logistics", severity: "warning", resource, device: device.id, message: `${device.id} needs ${demand.toFixed(3)} ${resource}/min but inbound links carry at most ${capacity.toFixed(3)}/min` });
    }
    for (const [resource, supply] of Object.entries(devices.find((item) => item.device === device.id)!.outputsPerMinute)) {
      const outbound = Object.values(project.connections).filter((connection) => connection.from.device === device.id && (connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes("*") || connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes(resource)));
      const capacity = outbound.reduce((sum, connection) => sum + connectionCapacityPerMinute(connection, resource), 0);
      if (capacity + 1e-9 < supply) diagnostics.push({ code: "output-logistics", severity: "warning", resource, device: device.id, message: `${device.id} produces ${supply.toFixed(3)} ${resource}/min but outbound links carry at most ${capacity.toFixed(3)}/min` });
    }
  }

  const declarativeDeviceIds = new Set([...devices.map((device) => device.device), ...extractionDevices.map((device) => device.device), ...generationDevices.map((device) => device.device)]);
  return {
    declarativeDevices: declarativeDeviceIds.size,
    opaqueDevices: Object.keys(project.devices).length - declarativeDeviceIds.size,
    devices, recipeOptions, productionGraph, extractionDevices, generationDevices, resourceNodes,
    resources,
    connections,
    transportCells,
    stationNetworks,
    powerGrids,
    diagnostics,
  };
}
