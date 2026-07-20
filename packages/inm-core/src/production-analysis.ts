import type { CompiledFactoryProject, ResourceId } from "./types";

export interface DeviceProductionRate {
  device: string;
  asset: string;
  process: string;
  category: string;
  cycleTicks: number;
  cyclesPerMinute: number;
  inputsPerMinute: Record<ResourceId, number>;
  outputsPerMinute: Record<ResourceId, number>;
  powerMilliWatts: number;
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
  travelTicks: number;
}

export interface ProductionDiagnostic {
  code: "material-deficit" | "material-surplus" | "input-logistics" | "output-logistics";
  severity: "warning" | "info";
  resource?: ResourceId;
  device?: string;
  message: string;
}

export interface ProductionAnalysis {
  declarativeDevices: number;
  opaqueDevices: number;
  devices: DeviceProductionRate[];
  resources: ResourceProductionBalance[];
  connections: ConnectionRateLimit[];
  diagnostics: ProductionDiagnostic[];
}

function add(target: Record<string, number>, resource: string, value: number): void {
  target[resource] = (target[resource] ?? 0) + value;
}

function declaredBoundaryResources(project: CompiledFactoryProject, capability: "produce" | "consume"): Set<ResourceId> {
  const resources = new Set<ResourceId>();
  for (const device of Object.values(project.devices)) {
    if (device.processPlan || !device.assetDef.capabilities.includes(capability)) continue;
    const direction = capability === "produce" ? "output" : "input";
    for (const port of device.ports.filter((item) => item.direction === direction)) {
      for (const resource of device.buffers[port.buffer]!.accepts) if (resource !== "*") resources.add(resource);
    }
  }
  return resources;
}

export function analyzeProduction(project: CompiledFactoryProject): ProductionAnalysis {
  const devices: DeviceProductionRate[] = [];
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
      powerMilliWatts: device.assetDef.power.consumptionMilliWatts,
    });
  }

  const boundarySupply = declaredBoundaryResources(project, "produce");
  const boundaryDemand = declaredBoundaryResources(project, "consume");
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
    capacityItemsPerMinute: connection.capacity * 60_000 / connection.travelTicks,
    travelTicks: connection.travelTicks,
  }));

  const diagnostics: ProductionDiagnostic[] = [];
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

  for (const device of Object.values(project.devices)) {
    if (!device.processPlan) continue;
    for (const [resource, demand] of Object.entries(devices.find((item) => item.device === device.id)!.inputsPerMinute)) {
      const inbound = Object.values(project.connections).filter((connection) => connection.to.device === device.id && (connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes("*") || connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes(resource)));
      const capacity = inbound.reduce((sum, connection) => sum + connection.capacity * 60_000 / connection.travelTicks, 0);
      if (capacity + 1e-9 < demand) diagnostics.push({ code: "input-logistics", severity: "warning", resource, device: device.id, message: `${device.id} needs ${demand.toFixed(3)} ${resource}/min but inbound links carry at most ${capacity.toFixed(3)}/min` });
    }
    for (const [resource, supply] of Object.entries(devices.find((item) => item.device === device.id)!.outputsPerMinute)) {
      const outbound = Object.values(project.connections).filter((connection) => connection.from.device === device.id && (connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes("*") || connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes(resource)));
      const capacity = outbound.reduce((sum, connection) => sum + connection.capacity * 60_000 / connection.travelTicks, 0);
      if (capacity + 1e-9 < supply) diagnostics.push({ code: "output-logistics", severity: "warning", resource, device: device.id, message: `${device.id} produces ${supply.toFixed(3)} ${resource}/min but outbound links carry at most ${capacity.toFixed(3)}/min` });
    }
  }

  return {
    declarativeDevices: devices.length,
    opaqueDevices: Object.keys(project.devices).length - devices.length,
    devices,
    resources,
    connections,
    diagnostics,
  };
}
