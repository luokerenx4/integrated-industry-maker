import type {
  Blueprint, BlueprintDevice, BlueprintLogisticsNetwork, DeviceAsset, GridPosition, IndustrialProcess, ResourceId,
} from "./types";
import type { LoadedFactoryProject } from "./loader";
import { bindProcessRecipe } from "./production-analysis";
import { externalPortCell, findBlueprintConnectionPath, rotatedFootprint } from "./routing";
import { planDeviceTransport } from "./device-runtime";
import { optimizeSpatialResourceDemand } from "./production-demand";

interface ProcessSelection {
  resource: ResourceId;
  process: IndustrialProcess;
  asset: DeviceAsset;
  inputs: Record<ResourceId, string>;
  outputs: Record<ResourceId, string>;
  outputPerCycle: number;
  durationTicks: number;
  requiredPerMinute: number;
  requiredCyclesPerMinute: number;
  region: string;
  machines: number;
  instances: BlueprintDevice[];
}

interface Endpoint { device: string; port: string; region: string; ratePerMinute?: number }
interface PlannedConnection { id: string; resource: ResourceId; from: Endpoint; to: Endpoint; requiredPerMinute: number }

interface LogisticsPipelineSelection {
  loader: DeviceAsset;
  line: DeviceAsset;
  unloader: DeviceAsset;
  stackSize: number;
  capacityPerMinute: number;
  score: number;
}

export interface BlueprintSynthesisResult {
  blueprint: Blueprint;
  target: { resource: ResourceId; region: string; ratePerMinute: number };
  selectedProcesses: Array<{
    resource: ResourceId; process: string; asset: string; region: string; machines: number; capacityPerMachine: number;
    requiredCyclesPerMinute: number; inputsPerMinute: Record<ResourceId, number>; outputsPerMinute: Record<ResourceId, number>;
  }>;
  extraction: Array<{ resource: ResourceId; asset: string; region: string; machines: number; nodes: string[] }>;
  plannedTransports: Array<{ resource: ResourceId; fromRegion: string; toRegion: string; requiredPerMinute: number; costPerItem: number }>;
  optimization: { rawCost: number; processCost: number; logisticsCost: number };
  localLogistics: Array<{
    connection: string; resource: ResourceId; requiredPerMinute: number; capacityPerMinute: number;
    loader: string; line: string; unloader: string; stackSize: number;
  }>;
  stationNetworks: Array<{ network: string; resource: ResourceId; fromRegion: string; toRegion: string; carriers: number }>;
  power: Array<{
    region: string; asset: string; devices: number; capacityDevices: number; coverageTargets: number;
    generationMilliWatts: number; ratedLoadMilliWatts: number;
  }>;
}

function safeId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""); }
function add(target: Record<string, number>, key: string, value: number): void { target[key] = (target[key] ?? 0) + value; }

function uniqueId(blueprint: Blueprint, base: string): string {
  let id = safeId(base); let suffix = 1;
  while (blueprint.devices.some((device) => device.id === id)) id = `${safeId(base)}-${++suffix}`;
  return id;
}

function freePlacement(loaded: LoadedFactoryProject, blueprint: Blueprint, device: BlueprintDevice, position: GridPosition): boolean {
  const asset = loaded.deviceAssets[device.asset]; const region = loaded.world.regions.find((item) => item.id === device.region);
  if (!asset || !region) return false;
  const footprint = rotatedFootprint(asset, device.rotation);
  if (position.x < 0 || position.y < 0 || position.x + footprint.width > region.bounds.width || position.y + footprint.height > region.bounds.height) return false;
  const occupied = (point: GridPosition) => point.x >= position.x && point.x < position.x + footprint.width && point.y >= position.y && point.y < position.y + footprint.height;
  if (loaded.world.resourceNodes.some((node) => node.region === device.region && occupied(node.position))) return false;
  const candidate = { ...device, position };
  const candidatePortCells = asset.geometry.ports.map((port) => externalPortCell(candidate, asset, port.id)).filter((cell): cell is GridPosition => Boolean(cell));
  if (candidatePortCells.some((cell) => cell.x < 0 || cell.y < 0 || cell.x >= region.bounds.width || cell.y >= region.bounds.height
    || loaded.world.resourceNodes.some((node) => node.region === device.region && node.position.x === cell.x && node.position.y === cell.y))) return false;
  for (const other of blueprint.devices.filter((item) => item.region === device.region)) {
    const otherAsset = loaded.deviceAssets[other.asset]!; const otherFootprint = rotatedFootprint(otherAsset, other.rotation);
    if (position.x < other.position.x + otherFootprint.width && position.x + footprint.width > other.position.x
      && position.y < other.position.y + otherFootprint.height && position.y + footprint.height > other.position.y) return false;
    if (candidatePortCells.some((cell) => cell.x >= other.position.x && cell.x < other.position.x + otherFootprint.width && cell.y >= other.position.y && cell.y < other.position.y + otherFootprint.height)) return false;
    const otherPortCells = otherAsset.geometry.ports.map((port) => externalPortCell(other, otherAsset, port.id)).filter((cell): cell is GridPosition => Boolean(cell));
    if (otherPortCells.some(occupied)) return false;
    if (candidatePortCells.some((candidateCell) => otherPortCells.some((cell) => cell.x === candidateCell.x && cell.y === candidateCell.y))) return false;
  }
  return !blueprint.connections.some((connection) => {
    const source = blueprint.devices.find((item) => item.id === connection.from.device);
    return source?.region === device.region && connection.path.some(occupied);
  });
}

function placeDevice(
  loaded: LoadedFactoryProject,
  blueprint: Blueprint,
  device: BlueprintDevice,
  preferred: GridPosition,
  predicate: (position: GridPosition) => boolean = () => true,
): void {
  const region = loaded.world.regions.find((item) => item.id === device.region)!;
  const positions = Array.from({ length: region.bounds.width * region.bounds.height }, (_, index) => ({ x: index % region.bounds.width, y: Math.floor(index / region.bounds.width) }))
    .sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y) || a.y - b.y || a.x - b.x);
  const position = positions.find((candidate) => predicate(candidate) && freePlacement(loaded, blueprint, device, candidate));
  if (!position) throw new Error(`Cannot place synthesized device '${device.id}' in region '${device.region}'`);
  device.position = position; blueprint.devices.push(device);
}

function portForBuffer(asset: DeviceAsset, direction: "input" | "output", buffer: string): string {
  const port = asset.geometry.ports.find((item) => item.direction === direction && item.buffer === buffer);
  if (!port) throw new Error(`Asset '${asset.id}' has no ${direction} port for buffer '${buffer}'`);
  return port.id;
}

function assignJunctionPorts(
  loaded: LoadedFactoryProject,
  blueprint: Blueprint,
  junction: BlueprintDevice,
  portIds: string[],
  endpoints: Endpoint[],
): string[] {
  if (portIds.length < endpoints.length) throw new Error(`Junction '${junction.id}' does not have enough ports`);
  const endpointCells = endpoints.map((endpoint) => {
    const device = blueprint.devices.find((candidate) => candidate.id === endpoint.device)!;
    return externalPortCell(device, loaded.deviceAssets[device.asset]!, endpoint.port)!;
  });
  const portCells = new Map(portIds.map((port) => [port, externalPortCell(junction, loaded.deviceAssets[junction.asset]!, port)!]));
  let best: { ports: string[]; distance: number; maximumDistance: number; key: string } | undefined;
  const visit = (index: number, remaining: string[], selected: string[], distance: number, maximumDistance: number): void => {
    if (index === endpoints.length) {
      const key = selected.join("\0");
      if (!best || distance < best.distance || (distance === best.distance && maximumDistance < best.maximumDistance)
        || (distance === best.distance && maximumDistance === best.maximumDistance && key < best.key)) best = { ports: [...selected], distance, maximumDistance, key };
      return;
    }
    for (const port of remaining) {
      const portCell = portCells.get(port)!; const endpointCell = endpointCells[index]!;
      const junctionPort = loaded.deviceAssets[junction.asset]!.geometry.ports.find((candidate) => candidate.id === port)!;
      const endpoint = endpoints[index]!;
      const reachable = findBlueprintConnectionPath(blueprint, loaded.world, loaded.deviceAssets, junctionPort.direction === "input"
        ? { from: { device: endpoint.device, port: endpoint.port }, to: { device: junction.id, port } }
        : { from: { device: junction.id, port }, to: { device: endpoint.device, port: endpoint.port } })
        ?? findBlueprintConnectionPath(blueprint, loaded.world, loaded.deviceAssets, junctionPort.direction === "input"
          ? { from: { device: endpoint.device, port: endpoint.port }, to: { device: junction.id, port } }
          : { from: { device: junction.id, port }, to: { device: endpoint.device, port: endpoint.port } }, { elevated: true });
      if (!reachable) continue;
      const portDistance = Math.abs(portCell.x - endpointCell.x) + Math.abs(portCell.y - endpointCell.y);
      visit(index + 1, remaining.filter((candidate) => candidate !== port), [...selected, port], distance + portDistance, Math.max(maximumDistance, portDistance));
    }
  };
  visit(0, portIds, [], 0, 0);
  if (!best) throw new Error(`Junction '${junction.id}' cannot expose ${endpoints.length} independently reachable ports in its synthesized placement`);
  return best.ports;
}

export function synthesizeFactoryBlueprint(loaded: LoadedFactoryProject): BlueprintSynthesisResult {
  const blueprint: Blueprint = { version: 1, devices: [], connections: [], logisticsNetworks: [], policies: { dispatch: "round-robin" } };
  const targetResource = loaded.objective.targetResource;
  const targetRate = loaded.objective.targetRatePerMinute;
  const consumerAssetFor = (resource: ResourceId) => Object.values(loaded.deviceAssets).filter((asset) => asset.capabilities.includes("consume") && asset.geometry.ports.some((port) => {
    const buffer = asset.buffers.find((item) => item.id === port.buffer);
    return port.direction === "input" && Boolean(buffer && (buffer.accepts.includes("*") || buffer.accepts.includes(resource)));
  })).sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  const filtersForResource = (asset: DeviceAsset, resource: ResourceId, bufferIds = asset.geometry.ports.map((port) => port.buffer)): NonNullable<BlueprintDevice["bufferFilters"]> =>
    Object.fromEntries([...new Set(bufferIds)].filter((bufferId) => {
      const buffer = asset.buffers.find((item) => item.id === bufferId);
      return buffer?.accepts.includes("*") || buffer?.accepts.includes(resource);
    }).map((bufferId) => [bufferId, [resource]]));
  const boundaryAsset = consumerAssetFor(targetResource);
  if (!boundaryAsset) throw new Error(`No project-local consumer Device accepts objective Resource '${targetResource}'`);
  const finalRegion = loaded.objective.targetRegion;
  if (!loaded.world.regions.some((region) => region.id === finalRegion)) throw new Error(`Objective target region '${finalRegion}' is not present in world '${loaded.world.id}'`);
  const loaders = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("loader"));
  const lines = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("line"));
  const unloaders = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("unloader"));
  if (!loaders.length || !lines.length || !unloaders.length) throw new Error("Blueprint synthesis requires project-local loader, line, and unloader Device assets");
  const pipelineOptions = (resource: ResourceId, distance: number, connection: string): LogisticsPipelineSelection[] => {
    const resourceStackSize = loaded.resources[resource]!.transport.stackSize;
    return loaders.flatMap((loader) => lines.flatMap((line) => unloaders.flatMap((unloader) => {
      const loaderPlan = planDeviceTransport(loader.id, loader.program, { apiVersion: 1, connection, stage: "loader", distance: 1 });
      const linePlan = planDeviceTransport(line.id, line.program, { apiVersion: 1, connection, stage: "line", distance });
      const unloaderPlan = planDeviceTransport(unloader.id, unloader.program, { apiVersion: 1, connection, stage: "unloader", distance: 1 });
      if (linePlan.capacity !== distance) return [];
      const dispatchInterval = Math.max(
        Math.ceil(loaderPlan.durationTicks / loaderPlan.capacity),
        Math.ceil(linePlan.durationTicks / linePlan.capacity),
        Math.ceil(unloaderPlan.durationTicks / unloaderPlan.capacity),
      );
      const stackSize = Math.min(resourceStackSize, loaderPlan.stackCapacity, linePlan.stackCapacity, unloaderPlan.stackCapacity);
      const capacityPerMinute = stackSize * 60_000 / dispatchInterval;
      const buildCost = loader.economics.buildCost + line.economics.buildCost * distance + unloader.economics.buildCost;
      const endpointPowerWatts = (loader.power.consumptionMilliWatts + unloader.power.consumptionMilliWatts) / 1_000;
      const score = buildCost * Math.max(.001, loaded.objective.weights.buildCost)
        + endpointPowerWatts * Math.max(.001, loaded.objective.weights.energy);
      return [{ loader, line, unloader, stackSize, capacityPerMinute, score }];
    }))).sort((a, b) => a.score - b.score || a.capacityPerMinute - b.capacityPerMinute
      || a.loader.id.localeCompare(b.loader.id) || a.line.id.localeCompare(b.line.id) || a.unloader.id.localeCompare(b.unloader.id));
  };
  const maximumLocalCapacity = (resource: ResourceId): number => {
    const capacities = pipelineOptions(resource, 1, `synth-${resource}-capacity`).map((selection) => selection.capacityPerMinute);
    if (!capacities.length) throw new Error(`No project-local logistics pipeline supports Resource '${resource}'`);
    return Math.max(...capacities);
  };
  const baseProcessCandidates = Object.values(loaded.processes).flatMap((process) => Object.values(loaded.deviceAssets).flatMap((asset) => {
    const binding = bindProcessRecipe(asset, process); if (!binding || !asset.production) return [];
    const durationTicks = Math.max(1, Math.ceil(process.durationTicks * asset.production.speed.denominator / asset.production.speed.numerator));
    const primary = [...process.outputs].sort((a, b) => a.resource.localeCompare(b.resource))[0]!;
    const selected: Omit<ProcessSelection, "requiredPerMinute" | "requiredCyclesPerMinute" | "region" | "machines" | "instances"> = {
      resource: primary.resource, process, asset, inputs: binding.inputs, outputs: binding.outputs,
      outputPerCycle: primary.count, durationTicks,
    };
    return [{
      key: `${selected.process.id}:${selected.asset.id}`,
      inputs: selected.process.inputs,
      outputs: selected.process.outputs,
      data: selected,
    }];
  })).sort((a, b) => a.key.localeCompare(b.key));
  const regions = loaded.world.regions.map((region) => region.id);
  const processCandidates = regions.flatMap((region) => baseProcessCandidates.filter((candidate) => region === finalRegion
    || !candidate.outputs.some((output) => output.resource === targetResource))
    .map((candidate) => ({ ...candidate, key: `${candidate.key}:${region}`, region })));
  const scenarioMinutes = loaded.scenario.durationTicks / 60_000;
  const rawSources = loaded.world.regions.flatMap((region) => Object.keys(loaded.resources).flatMap((resource) => {
    const reserve = loaded.world.resourceNodes.filter((node) => node.region === region.id && node.resource === resource).reduce((sum, node) => sum + node.amount, 0);
    const globalReserve = loaded.world.resourceNodes.filter((node) => node.resource === resource).reduce((sum, node) => sum + node.amount, 0);
    return reserve > 0 ? [{ resource, region: region.id, capacityPerMinute: reserve / scenarioMinutes, cost: 1 + targetRate / globalReserve }] : [];
  }));
  const canCrossRegions = Object.values(loaded.deviceAssets).some((asset) => asset.logisticsStation?.networkKinds.includes("interstellar"))
    && Object.values(loaded.deviceAssets).some((asset) => asset.logistics?.roles.includes("carrier") && asset.logistics.carrierKinds?.includes("interstellar"));
  const transportOptions = canCrossRegions ? Object.keys(loaded.resources).flatMap((resource) => loaded.world.regions.flatMap((from) => loaded.world.regions
    .filter((to) => to.id !== from.id).map((to) => ({
      resource, fromRegion: from.id, toRegion: to.id,
      costPerItem: Math.max(1, Math.hypot(from.coordinates.x - to.coordinates.x, from.coordinates.y - to.coordinates.y, from.coordinates.z - to.coordinates.z)),
    })))) : [];
  const demandPlan = optimizeSpatialResourceDemand({
    targetResource, targetRatePerMinute: targetRate, targetRegion: finalRegion, regions, candidates: processCandidates, rawSources, transports: transportOptions,
    candidateCost: (candidate) => {
      const continuousMachines = candidate.data.durationTicks / 60_000;
      return continuousMachines * (candidate.data.asset.economics.buildCost * Math.max(.001, loaded.objective.weights.buildCost)
        + candidate.data.asset.power.consumptionMilliWatts / 1_000 * Math.max(.001, loaded.objective.weights.energy));
    },
  });
  const selections = new Map(demandPlan.processes.map((row) => {
    const selected = row.candidate.data;
    const output = selected.process.outputs.find((amount) => amount.resource === row.primaryResource)!;
    const selection: ProcessSelection = {
      ...selected, resource: row.primaryResource, outputPerCycle: output.count,
      requiredPerMinute: row.outputsPerMinute[row.primaryResource]!, requiredCyclesPerMinute: row.requiredCyclesPerMinute,
      region: row.region, machines: 0, instances: [],
    };
    return [row.candidate.key, selection] as const;
  }));
  for (const selection of selections.values()) {
    const cyclesPerMachine = 60_000 / selection.durationTicks;
    const productionMachines = Math.ceil(selection.requiredCyclesPerMinute / cyclesPerMachine - 1e-9);
    const transportMachines = Math.max(1, ...[...selection.process.inputs, ...selection.process.outputs].map((amount) =>
      Math.ceil(amount.count * selection.requiredCyclesPerMinute / maximumLocalCapacity(amount.resource) - 1e-9)));
    selection.machines = Math.max(productionMachines, transportMachines);
    const region = loaded.world.regions.find((item) => item.id === selection.region)!;
    for (let index = 0; index < selection.machines; index++) {
      const device: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${selection.process.id}-${index + 1}`), asset: selection.asset.id, region: selection.region,
        position: { x: 0, y: 0 }, rotation: 0,
        recipe: { process: selection.process.id, inputs: { ...selection.inputs }, outputs: { ...selection.outputs } },
      };
      placeDevice(loaded, blueprint, device, selection.resource === targetResource
        ? { x: Math.floor(region.bounds.width * .35), y: Math.floor(region.bounds.height * .3) + index * 6 }
        : { x: Math.floor(region.bounds.width * .4), y: Math.floor(region.bounds.height * .34) + index * 6 });
      selection.instances.push(device);
    }
  }

  const sinkEndpoints = new Map<ResourceId, Endpoint[]>();
  const addSinks = (resource: ResourceId, region: string, near: BlueprintDevice, ratePerMinute: number, suffix = "sink"): void => {
    const asset = consumerAssetFor(resource);
    if (!asset) throw new Error(`No project-local consumer Device accepts surplus Resource '${resource}'`);
    const port = asset.geometry.ports.find((item) => item.direction === "input" && (asset.buffers.find((buffer) => buffer.id === item.buffer)?.accepts.includes(resource)
      || asset.buffers.find((buffer) => buffer.id === item.buffer)?.accepts.includes("*")))!;
    const sinkCount = Math.max(1, Math.ceil(ratePerMinute / maximumLocalCapacity(resource) - 1e-9));
    for (let index = 0; index < sinkCount; index++) {
      const sink: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-${suffix}${sinkCount > 1 ? `-${index + 1}` : ""}`), asset: asset.id, region,
        position: { x: 0, y: 0 }, rotation: 0, bufferFilters: filtersForResource(asset, resource, [port.buffer]),
      };
      placeDevice(loaded, blueprint, sink, { x: near.position.x + 4, y: near.position.y + (suffix === "sink" ? 0 : 5) + index * 4 });
      (sinkEndpoints.get(resource) ?? sinkEndpoints.set(resource, []).get(resource)!).push({
        device: sink.id, port: port.id, region, ratePerMinute: ratePerMinute / sinkCount,
      });
    }
  };
  const targetSelection = [...selections.values()].find((selection) => selection.process.outputs.some((output) => output.resource === targetResource));
  const targetInstance = targetSelection?.instances[0];
  if (!targetInstance) throw new Error(`Objective Resource '${targetResource}' must be produced by a project-local process`);
  addSinks(targetResource, finalRegion, targetInstance, targetRate);
  for (const surplus of demandPlan.surplus) {
    const producing = [...selections.values()].filter((selection) => selection.region === surplus.region
      && selection.process.outputs.some((output) => output.resource === surplus.resource));
    const near = producing[0]?.instances[0];
    if (near) addSinks(surplus.resource, surplus.region, near, surplus.perMinute, "surplus-sink");
  }

  const extractionSummary: BlueprintSynthesisResult["extraction"] = [];
  const extractorEndpoints = new Map<ResourceId, Endpoint[]>();
  for (const source of [...demandPlan.rawSources].sort((a, b) => a.region.localeCompare(b.region) || a.resource.localeCompare(b.resource))) {
    const { resource, region } = source; const demand = source.requiredPerMinute;
    const nodes = loaded.world.resourceNodes.filter((node) => node.region === region && node.resource === resource).sort((a, b) => a.id.localeCompare(b.id));
    if (!nodes.length) throw new Error(`No finite '${resource}' resource node is available for synthesized demand`);
    const asset = Object.values(loaded.deviceAssets).filter((candidate) => candidate.extraction?.resources.includes(resource))
      .sort((a, b) => (b.extraction!.itemsPerCycle * 60_000 / b.extraction!.cycleTicks) - (a.extraction!.itemsPerCycle * 60_000 / a.extraction!.cycleTicks)
        || a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
    if (!asset?.extraction) throw new Error(`No project-local extractor Device supports Resource '${resource}'`);
    const capacity = asset.extraction.itemsPerCycle * 60_000 / asset.extraction.cycleTicks;
    const machines = Math.max(
      Math.ceil(demand / capacity - 1e-9),
      Math.ceil(demand / maximumLocalCapacity(resource) - 1e-9),
    );
    const endpoints: Endpoint[] = [];
    const centroid = { x: nodes.reduce((sum, node) => sum + node.position.x, 0) / nodes.length, y: nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length };
    for (let index = 0; index < machines; index++) {
      const device: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-extractor-${index + 1}`), asset: asset.id, region, position: { x: 0, y: 0 }, rotation: 0,
        resourceNodes: nodes.map((node) => node.id), bufferFilters: filtersForResource(asset, resource, [asset.extraction.outputBuffer]),
      };
      const footprint = asset.geometry.footprint;
      placeDevice(loaded, blueprint, device, { x: Math.round(centroid.x - footprint.width / 2), y: Math.round(centroid.y + 1) }, (position) => {
        const center = { x: position.x + footprint.width / 2, y: position.y + footprint.height / 2 };
        return nodes.every((node) => Math.hypot(center.x - node.position.x - .5, center.y - node.position.y - .5) <= asset.extraction!.radius);
      });
      endpoints.push({ device: device.id, port: portForBuffer(asset, "output", asset.extraction.outputBuffer), region, ratePerMinute: demand / machines });
    }
    extractorEndpoints.set(resource, [...(extractorEndpoints.get(resource) ?? []), ...endpoints]);
    extractionSummary.push({ resource, asset: asset.id, region, machines, nodes: nodes.map((node) => node.id) });
  }

  const producers = new Map<ResourceId, Endpoint[]>(); const consumers = new Map<ResourceId, Endpoint[]>();
  for (const [resource, endpoints] of extractorEndpoints) producers.set(resource, [...endpoints]);
  for (const selection of selections.values()) for (const instance of selection.instances) {
    for (const output of selection.process.outputs) {
      const outputBuffer = selection.outputs[output.resource]!;
      (producers.get(output.resource) ?? producers.set(output.resource, []).get(output.resource)!).push({
        device: instance.id, port: portForBuffer(selection.asset, "output", outputBuffer), region: instance.region,
        ratePerMinute: output.count * selection.requiredCyclesPerMinute / selection.machines,
      });
    }
    for (const input of selection.process.inputs) {
      const buffer = selection.inputs[input.resource]!;
      (consumers.get(input.resource) ?? consumers.set(input.resource, []).get(input.resource)!).push({
        device: instance.id, port: portForBuffer(selection.asset, "input", buffer), region: instance.region,
        ratePerMinute: input.count * selection.requiredCyclesPerMinute / selection.machines,
      });
    }
  }
  for (const [resource, endpoints] of sinkEndpoints) {
    const targets = consumers.get(resource) ?? [];
    consumers.set(resource, [...targets, ...endpoints]);
  }

  const plannedConnections: PlannedConnection[] = [];
  const stationSummary: BlueprintSynthesisResult["stationNetworks"] = [];
  const junctionAsset = Object.values(loaded.deviceAssets).filter((asset) => asset.capabilities.includes("transport-junction"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  const pipelineFor = (planned: PlannedConnection, distance: number): LogisticsPipelineSelection => {
    const selections = pipelineOptions(planned.resource, distance, planned.id)
      .filter((selection) => selection.capacityPerMinute + 1e-9 >= planned.requiredPerMinute)
      .map((selection) => ({
        ...selection,
        score: (selection.loader.economics.buildCost + selection.line.economics.buildCost * distance + selection.unloader.economics.buildCost)
          * Math.max(.001, loaded.objective.weights.buildCost)
          + (selection.loader.power.consumptionMilliWatts + selection.unloader.power.consumptionMilliWatts) / 1_000
          * planned.requiredPerMinute / selection.capacityPerMinute * Math.max(.001, loaded.objective.weights.energy),
      }))
      .sort((a, b) => a.score - b.score || a.capacityPerMinute - b.capacityPerMinute
        || a.loader.id.localeCompare(b.loader.id) || a.line.id.localeCompare(b.line.id) || a.unloader.id.localeCompare(b.unloader.id));
    if (!selections[0]) {
      throw new Error(`No project-local logistics pipeline can carry ${planned.requiredPerMinute.toFixed(3)} '${planned.resource}'/min on connection '${planned.id}'`);
    }
    return selections[0];
  };
  const selectedPipelines = new Map<string, LogisticsPipelineSelection>();
  const connectionFor = (planned: PlannedConnection, distance: number) => {
    const pipeline = pipelineFor(planned, distance);
    return {
      id: planned.id, from: { device: planned.from.device, port: planned.from.port }, to: { device: planned.to.device, port: planned.to.port }, path: [] as GridPosition[],
      stackSize: pipeline.stackSize,
      logistics: { loader: { deviceAsset: pipeline.loader.id }, line: { deviceAsset: pipeline.line.id }, unloader: { deviceAsset: pipeline.unloader.id } },
    };
  };
  const reserveRoutes = (plans: PlannedConnection[]): void => {
    const rows = plans.map((planned) => {
      const connection = connectionFor(planned, 1); const paths: GridPosition[][] = [];
      const pathKeys = new Set<string>();
      for (const elevated of [false, true]) {
        const blockerKeys = new Set<string>([""]); const blockerQueue: GridPosition[][] = [[]]; let attempts = 0;
        while (blockerQueue.length && paths.length < 64 && attempts++ < 1_024) {
          const blockedCells = blockerQueue.shift()!;
          const path = findBlueprintConnectionPath(blueprint, loaded.world, loaded.deviceAssets, connection, { blockedCells, elevated });
          if (!path) continue;
          const pathKey = path.map((cell) => `${cell.x},${cell.y}@${cell.level ?? 0}`).join(";");
          if (!pathKeys.has(pathKey)) { pathKeys.add(pathKey); paths.push(path); }
          if (blockedCells.length >= 4) continue;
          for (const cell of path.slice(1, -1)) {
            const next = [...blockedCells, cell].sort((a, b) => a.y - b.y || a.x - b.x);
            const key = next.map((item) => `${item.x},${item.y}`).join(";");
            if (!blockerKeys.has(key)) { blockerKeys.add(key); blockerQueue.push(next); }
          }
        }
      }
      if (!paths.length) throw new Error(`No physical route exists for synthesized ${planned.resource} connection '${planned.id}'`);
      paths.sort((a, b) => Math.max(...a.map((cell) => cell.level ?? 0)) - Math.max(...b.map((cell) => cell.level ?? 0))
        || a.length - b.length || a.map((cell) => `${cell.x},${cell.y}@${cell.level ?? 0}`).join(";").localeCompare(b.map((cell) => `${cell.x},${cell.y}@${cell.level ?? 0}`).join(";")));
      return { planned, paths };
    }).sort((a, b) => a.paths.length - b.paths.length || a.planned.id.localeCompare(b.planned.id));
    const routed = new Map<string, GridPosition[]>(); const occupied = new Set<string>(); let explored = 0;
    const select = (index: number): boolean => {
      if (index === rows.length) return true;
      if (explored++ > 500_000) return false;
      const row = rows[index]!; const regionId = row.planned.from.region;
      for (const path of row.paths) {
        const cells = path.map((cell) => `${regionId}:${cell.x},${cell.y}@${cell.level ?? 0}`);
        if (cells.some((cell) => occupied.has(cell))) continue;
        cells.forEach((cell) => occupied.add(cell)); routed.set(row.planned.id, path);
        if (select(index + 1)) return true;
        routed.delete(row.planned.id); cells.forEach((cell) => occupied.delete(cell));
      }
      return false;
    };
    if (!select(0)) throw new Error(`Cannot find a conflict-free belt layout for ${plans.length} synthesized '${plans[0]?.resource ?? "material"}' flows after exploring ${explored} route combinations`);
    for (const planned of plans) {
      const path = routed.get(planned.id)!; const pipeline = pipelineFor(planned, path.length);
      selectedPipelines.set(planned.id, pipeline);
      blueprint.connections.push({ ...connectionFor(planned, path.length), path });
    }
  };
  const connectLocal = (resource: ResourceId, sourceEndpoints: Endpoint[], targetEndpoints: Endpoint[]): void => {
    const plannedStart = plannedConnections.length;
    if (!sourceEndpoints.length || !targetEndpoints.length) throw new Error(`Cannot connect synthesized '${resource}' flow without both producer and consumer`);
    const region = sourceEndpoints[0]!.region;
    if (sourceEndpoints.some((endpoint) => endpoint.region !== region) || targetEndpoints.some((endpoint) => endpoint.region !== region)) throw new Error(`Local synthesized '${resource}' flow crosses regions`);
    const endpointPosition = (endpoint: Endpoint): GridPosition => blueprint.devices.find((device) => device.id === endpoint.device)!.position;
    const centroid = (endpoints: Endpoint[]): GridPosition => ({
      x: Math.round(endpoints.reduce((sum, endpoint) => sum + endpointPosition(endpoint).x, 0) / endpoints.length),
      y: Math.round(endpoints.reduce((sum, endpoint) => sum + endpointPosition(endpoint).y, 0) / endpoints.length),
    });
    const rotationForFlow = (from: GridPosition, to: GridPosition): BlueprintDevice["rotation"] => {
      const dx = to.x - from.x; const dy = to.y - from.y;
      if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 90 : 270;
      return dx >= 0 ? 0 : 180;
    };
    const partitions = <T>(items: T[], maximumGroups: number): T[][] => {
      const count = Math.min(items.length, maximumGroups);
      return Array.from({ length: count }, (_, index) => items.slice(
        Math.floor(index * items.length / count),
        Math.floor((index + 1) * items.length / count),
      ));
    };
    const chunks = <T>(items: T[], size: number): T[][] => Array.from(
      { length: Math.ceil(items.length / size) },
      (_, index) => items.slice(index * size, (index + 1) * size),
    );
    const placeJunction = (
      junction: BlueprintDevice,
      preferred: GridPosition,
      preferredRotation: BlueprintDevice["rotation"],
      incoming: Endpoint[],
      outgoing: Endpoint[],
    ): { inputs: string[]; outputs: string[] } => {
      const regionDef = loaded.world.regions.find((item) => item.id === region)!;
      const rotations: BlueprintDevice["rotation"][] = loaded.deviceAssets[junction.asset]!.geometry.rotatable
        ? ([preferredRotation, 0, 90, 180, 270] as BlueprintDevice["rotation"][]).filter((rotation, index, values) => values.indexOf(rotation) === index)
        : [0];
      const positions = Array.from({ length: regionDef.bounds.width * regionDef.bounds.height }, (_, index) => ({ x: index % regionDef.bounds.width, y: Math.floor(index / regionDef.bounds.width) }))
        .sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y) || a.y - b.y || a.x - b.x);
      const inputPorts = loaded.deviceAssets[junction.asset]!.geometry.ports.filter((port) => port.direction === "input").map((port) => port.id);
      const outputPorts = loaded.deviceAssets[junction.asset]!.geometry.ports.filter((port) => port.direction === "output").map((port) => port.id);
      for (const position of positions) for (const rotation of rotations) {
        junction.position = position; junction.rotation = rotation;
        if (!freePlacement(loaded, blueprint, junction, position)) continue;
        blueprint.devices.push(junction);
        try {
          const inputs = assignJunctionPorts(loaded, blueprint, junction, inputPorts, incoming);
          const outputs = assignJunctionPorts(loaded, blueprint, junction, outputPorts, outgoing);
          return { inputs, outputs };
        } catch {
          blueprint.devices.pop();
        }
      }
      const routes = blueprint.connections.map((connection) => `${connection.id}[${connection.path.map((cell) => `${cell.x},${cell.y}@${cell.level ?? 0}`).join(";")}]`).join(", ");
      throw new Error(`Cannot place a routable synthesized junction '${junction.id}' for ${incoming.length} incoming and ${outgoing.length} outgoing '${resource}' flows; reserved routes: ${routes || "none"}`);
    };

    const uniqueConnectionId = (base: string): string => {
      const root = safeId(base); let id = root; let suffix = 1;
      while (plannedConnections.some((connection) => connection.id === id)) id = `${root}-${++suffix}`;
      return id;
    };
    const connectOne = (from: Endpoint, to: Endpoint, requiredPerMinute: number): void => {
      plannedConnections.push({ id: uniqueConnectionId(`synth-${resource}-${from.device}-to-${to.device}`), resource, from, to, requiredPerMinute });
    };
    const sourceRates = sourceEndpoints.map((endpoint) => endpoint.ratePerMinute ?? 0).sort((a, b) => a - b);
    const targetRates = targetEndpoints.map((endpoint) => endpoint.ratePerMinute ?? 0).sort((a, b) => a - b);
    const directlyPairable = sourceEndpoints.length === targetEndpoints.length && sourceEndpoints.length > 1
      && sourceRates.every((rate, index) => Math.abs(rate - targetRates[index]!) <= 1e-6);
    if (directlyPairable) {
      let pairedTargets: Endpoint[];
      if (sourceEndpoints.length <= 8) {
        let best: { targets: Endpoint[]; cost: number; key: string } | undefined;
        const visit = (index: number, remaining: Endpoint[], selected: Endpoint[], cost: number): void => {
          if (index === sourceEndpoints.length) {
            const key = selected.map((endpoint) => `${endpoint.device}:${endpoint.port}`).join("|");
            if (!best || cost < best.cost || (cost === best.cost && key < best.key)) best = { targets: [...selected], cost, key };
            return;
          }
          const source = sourceEndpoints[index]!; const sourcePosition = endpointPosition(source);
          for (const target of remaining) {
            if (Math.abs((source.ratePerMinute ?? 0) - (target.ratePerMinute ?? 0)) > 1e-6) continue;
            const targetPosition = endpointPosition(target);
            const distance = Math.abs(sourcePosition.x - targetPosition.x) + Math.abs(sourcePosition.y - targetPosition.y);
            visit(index + 1, remaining.filter((candidate) => candidate !== target), [...selected, target], cost + distance);
          }
        };
        visit(0, [...targetEndpoints], [], 0);
        pairedTargets = best!.targets;
      } else {
        const remaining = [...targetEndpoints];
        pairedTargets = sourceEndpoints.map((source) => {
          const sourcePosition = endpointPosition(source);
          const target = remaining.filter((candidate) => Math.abs((source.ratePerMinute ?? 0) - (candidate.ratePerMinute ?? 0)) <= 1e-6)
            .sort((a, b) => {
              const aPosition = endpointPosition(a); const bPosition = endpointPosition(b);
              return (Math.abs(sourcePosition.x - aPosition.x) + Math.abs(sourcePosition.y - aPosition.y))
                - (Math.abs(sourcePosition.x - bPosition.x) + Math.abs(sourcePosition.y - bPosition.y))
                || a.device.localeCompare(b.device) || a.port.localeCompare(b.port);
            })[0]!;
          remaining.splice(remaining.indexOf(target), 1);
          return target;
        });
      }
      sourceEndpoints.forEach((source, index) => connectOne(source, pairedTargets[index]!, source.ratePerMinute ?? 0));
      reserveRoutes(plannedConnections.slice(plannedStart));
      return;
    }
    if (targetEndpoints.length === 1) {
      let level = [...sourceEndpoints]; const toward = centroid(targetEndpoints);
      if (level.length > 1) {
        if (!junctionAsset) throw new Error(`Multiple '${resource}' producers require a project-local transport-junction Device`);
        const inputs = junctionAsset.geometry.ports.filter((port) => port.direction === "input");
        const output = junctionAsset.geometry.ports.find((port) => port.direction === "output");
        if (inputs.length < 2 || !output) throw new Error(`Transport junction '${junctionAsset.id}' needs at least two inputs and one output to merge '${resource}' flows`);
        while (level.length > 1) {
          const next: Endpoint[] = [];
          for (const group of chunks(level, inputs.length)) {
            if (group.length === 1) { next.push(group[0]!); continue; }
            const from = centroid(group);
            const junction: BlueprintDevice = {
              id: uniqueId(blueprint, `synth-${resource}-merge`), asset: junctionAsset.id, region, position: { x: 0, y: 0 }, rotation: 0,
              bufferFilters: filtersForResource(junctionAsset, resource),
            };
            const assigned = placeJunction(junction, { x: Math.round((from.x + toward.x * 2) / 3), y: Math.round((from.y + toward.y * 2) / 3) }, rotationForFlow(from, toward), group, targetEndpoints);
            group.forEach((source, index) => connectOne(source, {
              device: junction.id, port: assigned.inputs[index]!, region, ratePerMinute: source.ratePerMinute,
            }, source.ratePerMinute ?? 0));
            next.push({
              device: junction.id, port: assigned.outputs[0]!, region,
              ratePerMinute: group.reduce((sum, endpoint) => sum + (endpoint.ratePerMinute ?? 0), 0),
            });
          }
          level = next;
        }
      }
      connectOne(level[0]!, targetEndpoints[0]!, targetEndpoints[0]!.ratePerMinute ?? 0);
      reserveRoutes(plannedConnections.slice(plannedStart));
      return;
    }
    if (sourceEndpoints.length === 1) {
      let level = [...targetEndpoints].sort((a, b) => endpointPosition(b).y - endpointPosition(a).y || endpointPosition(b).x - endpointPosition(a).x || b.device.localeCompare(a.device));
      const source = sourceEndpoints[0]!; const from = endpointPosition(source);
      if (!junctionAsset) throw new Error(`Multiple '${resource}' consumers require a project-local transport-junction Device`);
      const input = junctionAsset.geometry.ports.find((port) => port.direction === "input");
      const outputs = junctionAsset.geometry.ports.filter((port) => port.direction === "output");
      if (!input || outputs.length < 2) throw new Error(`Transport junction '${junctionAsset.id}' needs one input and at least two outputs to split '${resource}' flows`);
      while (level.length > 1) {
        const next: Endpoint[] = [];
        for (const group of chunks(level, outputs.length)) {
          if (group.length === 1) { next.push(group[0]!); continue; }
          const toward = centroid(group);
          const junction: BlueprintDevice = {
            id: uniqueId(blueprint, `synth-${resource}-split`), asset: junctionAsset.id, region, position: { x: 0, y: 0 }, rotation: 0,
            bufferFilters: filtersForResource(junctionAsset, resource), policy: { dispatch: "round-robin" },
          };
          const assigned = placeJunction(junction, { x: Math.round((from.x * 2 + toward.x) / 3), y: Math.round((from.y * 2 + toward.y) / 3) }, rotationForFlow(from, toward), [source], group);
          group.forEach((target, index) => connectOne({
            device: junction.id, port: assigned.outputs[index]!, region, ratePerMinute: target.ratePerMinute,
          }, target, target.ratePerMinute ?? 0));
          next.push({
            device: junction.id, port: assigned.inputs[0]!, region,
            ratePerMinute: group.reduce((sum, endpoint) => sum + (endpoint.ratePerMinute ?? 0), 0),
          });
        }
        level = next;
      }
      connectOne(source, level[0]!, source.ratePerMinute ?? 0);
      reserveRoutes(plannedConnections.slice(plannedStart));
      return;
    }
    interface FlowLane { id: string; source: Endpoint; target: Endpoint; ratePerMinute: number; sourceLeaf?: Endpoint; targetLeaf?: Endpoint }
    const sourceRows = sourceEndpoints.map((endpoint) => ({ endpoint, remaining: endpoint.ratePerMinute ?? 0 }))
      .sort((a, b) => a.endpoint.device.localeCompare(b.endpoint.device) || a.endpoint.port.localeCompare(b.endpoint.port));
    const targetRows = targetEndpoints.map((endpoint) => ({ endpoint, remaining: endpoint.ratePerMinute ?? 0 }))
      .sort((a, b) => a.endpoint.device.localeCompare(b.endpoint.device) || a.endpoint.port.localeCompare(b.endpoint.port));
    const sourceTotal = sourceRows.reduce((sum, row) => sum + row.remaining, 0);
    const targetTotal = targetRows.reduce((sum, row) => sum + row.remaining, 0);
    if (Math.abs(sourceTotal - targetTotal) > 1e-6) throw new Error(`Synthesized '${resource}' flow is not conserved in region '${region}': ${sourceTotal} produced versus ${targetTotal} consumed`);
    const lanes: FlowLane[] = [];
    for (const source of sourceRows) while (source.remaining > 1e-6) {
      const sourcePosition = endpointPosition(source.endpoint);
      const target = targetRows.filter((row) => row.remaining > 1e-6).sort((a, b) => {
        const aPosition = endpointPosition(a.endpoint); const bPosition = endpointPosition(b.endpoint);
        const aSelf = Number(a.endpoint.device === source.endpoint.device); const bSelf = Number(b.endpoint.device === source.endpoint.device);
        const aDistance = Math.abs(sourcePosition.x - aPosition.x) + Math.abs(sourcePosition.y - aPosition.y);
        const bDistance = Math.abs(sourcePosition.x - bPosition.x) + Math.abs(sourcePosition.y - bPosition.y);
        return aSelf - bSelf || aDistance - bDistance || a.endpoint.device.localeCompare(b.endpoint.device) || a.endpoint.port.localeCompare(b.endpoint.port);
      })[0];
      if (!target) throw new Error(`Synthesized '${resource}' flow exhausted consumers before producers in region '${region}'`);
      const ratePerMinute = Math.min(source.remaining, target.remaining);
      lanes.push({ id: `${resource}-lane-${lanes.length + 1}`, source: source.endpoint, target: target.endpoint, ratePerMinute });
      source.remaining -= ratePerMinute; target.remaining -= ratePerMinute;
    }
    if (targetRows.some((row) => row.remaining > 1e-6)) throw new Error(`Synthesized '${resource}' flow exhausted producers before consumers in region '${region}'`);

    const exposeMergeLeaves = (target: Endpoint, groupedLanes: FlowLane[]): void => {
      if (groupedLanes.length === 1) { groupedLanes[0]!.targetLeaf = target; return; }
      if (!junctionAsset) throw new Error(`Multiple '${resource}' producers require a project-local transport-junction Device`);
      const inputPorts = junctionAsset.geometry.ports.filter((port) => port.direction === "input");
      const outputPort = junctionAsset.geometry.ports.find((port) => port.direction === "output");
      if (inputPorts.length < 2 || !outputPort) throw new Error(`Transport junction '${junctionAsset.id}' needs at least two inputs and one output to merge '${resource}' flows`);
      const groups = partitions(groupedLanes, inputPorts.length);
      const incomingHints = groups.map((group) => group[0]!.source);
      const from = centroid(incomingHints); const toward = endpointPosition(target);
      const junction: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-merge`), asset: junctionAsset.id, region, position: { x: 0, y: 0 }, rotation: 0,
        bufferFilters: filtersForResource(junctionAsset, resource),
      };
      const assigned = placeJunction(junction, { x: Math.round((from.x + toward.x * 2) / 3), y: Math.round((from.y + toward.y * 2) / 3) }, rotationForFlow(from, toward), incomingHints, [target]);
      const ratePerMinute = groupedLanes.reduce((sum, lane) => sum + lane.ratePerMinute, 0);
      plannedConnections.push({
        id: uniqueConnectionId(`synth-${resource}-${junction.id}-to-${target.device}`), resource,
        from: { device: junction.id, port: assigned.outputs[0]!, region, ratePerMinute }, to: target, requiredPerMinute: ratePerMinute,
      });
      groups.forEach((group, index) => exposeMergeLeaves({
        device: junction.id, port: assigned.inputs[index]!, region,
        ratePerMinute: group.reduce((sum, lane) => sum + lane.ratePerMinute, 0),
      }, group));
    };
    for (const target of targetEndpoints) exposeMergeLeaves(target, lanes.filter((lane) => lane.target === target));

    const exposeSplitLeaves = (source: Endpoint, groupedLanes: FlowLane[]): void => {
      if (groupedLanes.length === 1) { groupedLanes[0]!.sourceLeaf = source; return; }
      if (!junctionAsset) throw new Error(`Multiple '${resource}' consumers require a project-local transport-junction Device`);
      const inputPort = junctionAsset.geometry.ports.find((port) => port.direction === "input");
      const outputPorts = junctionAsset.geometry.ports.filter((port) => port.direction === "output");
      if (!inputPort || outputPorts.length < 2) throw new Error(`Transport junction '${junctionAsset.id}' needs one input and at least two outputs to split '${resource}' flows`);
      const groups = partitions(groupedLanes, outputPorts.length);
      const outgoingHints = groups.map((group) => group[0]!.targetLeaf!);
      const from = endpointPosition(source); const toward = centroid(outgoingHints);
      const junction: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-split`), asset: junctionAsset.id, region, position: { x: 0, y: 0 }, rotation: 0,
        bufferFilters: filtersForResource(junctionAsset, resource), policy: { dispatch: "round-robin" },
      };
      const assigned = placeJunction(junction, { x: Math.round((from.x * 2 + toward.x) / 3), y: Math.round((from.y * 2 + toward.y) / 3) }, rotationForFlow(from, toward), [source], outgoingHints);
      const ratePerMinute = groupedLanes.reduce((sum, lane) => sum + lane.ratePerMinute, 0);
      plannedConnections.push({
        id: uniqueConnectionId(`synth-${resource}-${source.device}-to-${junction.id}`), resource, from: source,
        to: { device: junction.id, port: assigned.inputs[0]!, region, ratePerMinute }, requiredPerMinute: ratePerMinute,
      });
      groups.forEach((group, index) => exposeSplitLeaves({
        device: junction.id, port: assigned.outputs[index]!, region,
        ratePerMinute: group.reduce((sum, lane) => sum + lane.ratePerMinute, 0),
      }, group));
    };
    for (const source of sourceEndpoints) exposeSplitLeaves(source, lanes.filter((lane) => lane.source === source));
    for (const lane of lanes) plannedConnections.push({
      id: uniqueConnectionId(`synth-${lane.id}-${lane.sourceLeaf!.device}-to-${lane.targetLeaf!.device}`), resource,
      from: lane.sourceLeaf!, to: lane.targetLeaf!, requiredPerMinute: lane.ratePerMinute,
    });
    reserveRoutes(plannedConnections.slice(plannedStart));
  };

  const stationAsset = Object.values(loaded.deviceAssets).filter((asset) => asset.logisticsStation?.networkKinds.includes("interstellar"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  const carrier = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("carrier") && asset.logistics.carrierKinds?.includes("interstellar"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  for (const transport of demandPlan.transports) {
    const { resource, fromRegion: sourceRegion, toRegion: targetRegion, requiredPerMinute: requiredRate } = transport;
    if (!stationAsset?.logisticsStation || !carrier) throw new Error(`Cross-region '${resource}' flow requires project-local interstellar station and carrier assets`);
    const sourceRegionDef = loaded.world.regions.find((item) => item.id === sourceRegion)!;
    const targetRegionDef = loaded.world.regions.find((item) => item.id === targetRegion)!;
    const preferredY = (region: string, endpoints: Endpoint[]): number => {
      const matching = endpoints.filter((endpoint) => endpoint.region === region);
      if (!matching.length) return Math.floor(loaded.world.regions.find((item) => item.id === region)!.bounds.height / 2);
      return Math.round(matching.reduce((sum, endpoint) => sum + blueprint.devices.find((device) => device.id === endpoint.device)!.position.y, 0) / matching.length);
    };
    const supplyPort = stationAsset.geometry.ports.find((port) => port.direction === "input")!;
    const demandPort = stationAsset.geometry.ports.find((port) => port.direction === "output")!;
    const distance = Math.max(1, Math.ceil(Math.hypot(
      sourceRegionDef.coordinates.x - targetRegionDef.coordinates.x,
      sourceRegionDef.coordinates.y - targetRegionDef.coordinates.y,
      sourceRegionDef.coordinates.z - targetRegionDef.coordinates.z,
    )));
    const stationPairs = Math.max(1, Math.ceil(requiredRate / maximumLocalCapacity(resource) - 1e-9));
    for (let index = 0; index < stationPairs; index++) {
      const laneRate = requiredRate / stationPairs;
      const stationFilters = filtersForResource(stationAsset, resource, [stationAsset.logisticsStation.buffer]);
      const supply: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-${sourceRegion}-station-supply-${index + 1}`), asset: stationAsset.id, region: sourceRegion,
        position: { x: 0, y: 0 }, rotation: 0, bufferFilters: structuredClone(stationFilters),
      };
      const demand: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-${targetRegion}-station-demand-${index + 1}`), asset: stationAsset.id, region: targetRegion,
        position: { x: 0, y: 0 }, rotation: 0, bufferFilters: structuredClone(stationFilters),
      };
      placeDevice(loaded, blueprint, supply, {
        x: sourceRegionDef.bounds.width - stationAsset.geometry.footprint.width - 1,
        y: preferredY(sourceRegion, producers.get(resource) ?? []) + index * 4,
      });
      placeDevice(loaded, blueprint, demand, { x: 1, y: preferredY(targetRegion, consumers.get(resource) ?? []) + index * 4 });
      (consumers.get(resource) ?? consumers.set(resource, []).get(resource)!).push({
        device: supply.id, port: supplyPort.id, region: sourceRegion, ratePerMinute: laneRate,
      });
      (producers.get(resource) ?? producers.set(resource, []).get(resource)!).push({
        device: demand.id, port: demandPort.id, region: targetRegion, ratePerMinute: laneRate,
      });
      const networkId = safeId(`synth-${resource}-${sourceRegion}-to-${targetRegion}-lane-${index + 1}`);
      const plan = planDeviceTransport(carrier.id, carrier.program, { apiVersion: 1, connection: networkId, stage: "carrier", distance });
      const perCarrierRate = plan.capacity * 60_000 / plan.durationTicks;
      const carriers = Math.max(1, Math.ceil(laneRate / perCarrierRate - 1e-9));
      const network: BlueprintLogisticsNetwork = {
        id: networkId, kind: "interstellar", fleet: { deviceAsset: carrier.id, count: carriers },
        stations: [
          { device: supply.id, slots: [{ resource, mode: "supply", minimumBatch: 1 }] },
          { device: demand.id, slots: [{ resource, mode: "demand", minimumBatch: 1 }] },
        ],
      };
      blueprint.logisticsNetworks.push(network);
      stationSummary.push({ network: networkId, resource, fromRegion: sourceRegion, toRegion: targetRegion, carriers });
    }
  }

  const routedResources = [...new Set([...producers.keys(), ...consumers.keys()])]
    .sort((a, b) => Number(a === targetResource) - Number(b === targetResource) || a.localeCompare(b));
  for (const resource of routedResources) {
    const resourceProducers = producers.get(resource) ?? []; const resourceConsumers = consumers.get(resource) ?? [];
    const routedRegions = [...new Set([...resourceProducers, ...resourceConsumers].map((endpoint) => endpoint.region))].sort();
    for (const region of routedRegions) {
      const localSources = resourceProducers.filter((endpoint) => endpoint.region === region);
      const localTargets = resourceConsumers.filter((endpoint) => endpoint.region === region);
      if (!localSources.length || !localTargets.length) throw new Error(`Spatial plan leaves unroutable '${resource}' flow in region '${region}'`);
      connectLocal(resource, localSources, localTargets);
    }
  }

  const reservedConnections = new Map(blueprint.connections.map((connection) => [connection.id, connection]));
  blueprint.connections = plannedConnections.map((planned) => reservedConnections.get(planned.id)!);

  const ratedLoad: Record<string, number> = {};
  for (const device of blueprint.devices) add(ratedLoad, device.region, loaded.deviceAssets[device.asset]!.power.consumptionMilliWatts);
  for (const connection of plannedConnections) {
    const pipeline = selectedPipelines.get(connection.id)!;
    add(ratedLoad, connection.from.region, pipeline.loader.power.consumptionMilliWatts + pipeline.unloader.power.consumptionMilliWatts);
  }
  const renewable = Object.values(loaded.deviceAssets).filter((asset) => asset.power.generation?.kind === "renewable" && asset.power.distribution
    && asset.power.generation.outputMilliWatts > asset.power.consumptionMilliWatts)
    .sort((a, b) => (b.power.generation?.outputMilliWatts ?? 0) - (a.power.generation?.outputMilliWatts ?? 0) || a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  if (!renewable?.power.generation || renewable.power.generation.kind !== "renewable") throw new Error("Blueprint synthesis requires a project-local renewable power distributor");
  const powerSummary: BlueprintSynthesisResult["power"] = [];
  for (const region of loaded.world.regions) {
    const load = ratedLoad[region.id] ?? 0;
    const distribution = renewable.power.distribution!;
    const generatorFootprint = rotatedFootprint(renewable, 0);
    const deviceCenter = (device: BlueprintDevice): { x: number; y: number } => {
      const footprint = rotatedFootprint(loaded.deviceAssets[device.asset]!, device.rotation);
      return { x: device.position.x + footprint.width / 2, y: device.position.y + footprint.height / 2 };
    };
    const generatorCenter = (position: GridPosition): { x: number; y: number } => ({
      x: position.x + generatorFootprint.width / 2, y: position.y + generatorFootprint.height / 2,
    });
    const targets = blueprint.devices.filter((device) => device.region === region.id
      && loaded.deviceAssets[device.asset]!.power.consumptionMilliWatts > 0)
      .map((device) => ({ id: device.id, point: deviceCenter(device) }));
    for (const connection of plannedConnections.filter((item) => item.from.region === region.id)) {
      const physical = blueprint.connections.find((item) => item.id === connection.id)!;
      const pipeline = selectedPipelines.get(connection.id)!;
      if (pipeline.loader.power.consumptionMilliWatts > 0) {
        const cell = physical.path[0]!;
        targets.push({ id: `${connection.id}.loader`, point: { x: cell.x + .5, y: cell.y + .5 } });
      }
      if (pipeline.unloader.power.consumptionMilliWatts > 0) {
        const cell = physical.path.at(-1)!;
        targets.push({ id: `${connection.id}.unloader`, point: { x: cell.x + .5, y: cell.y + .5 } });
      }
    }
    targets.sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y || a.id.localeCompare(b.id));
    const uniqueTargets = targets.filter((target, index) => targets.findIndex((candidate) => candidate.point.x === target.point.x && candidate.point.y === target.point.y) === index);
    const distributors: BlueprintDevice[] = [];
    const addDistributor = (
      preferredCenter: { x: number; y: number },
      predicate: (center: { x: number; y: number }) => boolean,
    ): void => {
      const generator: BlueprintDevice = { id: uniqueId(blueprint, `synth-${region.id}-${renewable.id}-${distributors.length + 1}`), asset: renewable.id, region: region.id, position: { x: 0, y: 0 }, rotation: 0 };
      placeDevice(loaded, blueprint, generator, {
        x: Math.round(preferredCenter.x - generatorFootprint.width / 2),
        y: Math.round(preferredCenter.y - generatorFootprint.height / 2),
      }, (position) => predicate(generatorCenter(position)));
      distributors.push(generator);
    };
    const covered = (point: { x: number; y: number }): boolean => distributors.some((device) => {
      const center = deviceCenter(device);
      return Math.hypot(center.x - point.x, center.y - point.y) <= distribution.coverageRange + 1e-9;
    });
    for (const target of uniqueTargets) {
      let attempts = 0;
      while (!covered(target.point)) {
        if (attempts++ > region.bounds.width * region.bounds.height) throw new Error(`Cannot connect synthesized power coverage to '${target.id}' in region '${region.id}'`);
        if (!distributors.length) {
          addDistributor(target.point, (center) => Math.hypot(center.x - target.point.x, center.y - target.point.y) <= distribution.coverageRange + 1e-9);
          continue;
        }
        const nearest = distributors.map((device) => ({ device, center: deviceCenter(device) }))
          .map((entry) => ({ ...entry, distance: Math.hypot(entry.center.x - target.point.x, entry.center.y - target.point.y) }))
          .sort((a, b) => a.distance - b.distance || a.device.id.localeCompare(b.device.id))[0]!;
        const move = Math.min(Math.max(.5, distribution.connectionRange - .5), Math.max(.5, nearest.distance - distribution.coverageRange + .5));
        const ratio = move / nearest.distance;
        const preferred = {
          x: nearest.center.x + (target.point.x - nearest.center.x) * ratio,
          y: nearest.center.y + (target.point.y - nearest.center.y) * ratio,
        };
        addDistributor(preferred, (center) => distributors.some((device) => {
          const existing = deviceCenter(device);
          return Math.hypot(existing.x - center.x, existing.y - center.y) <= distribution.connectionRange + 1e-9;
        }) && Math.hypot(center.x - target.point.x, center.y - target.point.y) < nearest.distance - 1e-9);
      }
    }
    const netGeneration = renewable.power.generation.outputMilliWatts - renewable.power.consumptionMilliWatts;
    const capacityDevices = load > 0 ? Math.ceil(load / netGeneration - 1e-9) : 0;
    const loadCenter = uniqueTargets.length ? {
      x: uniqueTargets.reduce((sum, target) => sum + target.point.x, 0) / uniqueTargets.length,
      y: uniqueTargets.reduce((sum, target) => sum + target.point.y, 0) / uniqueTargets.length,
    } : { x: region.bounds.width / 2, y: region.bounds.height / 2 };
    while (distributors.length < capacityDevices) {
      addDistributor(loadCenter, (center) => !distributors.length || distributors.some((device) => {
        const existing = deviceCenter(device);
        return Math.hypot(existing.x - center.x, existing.y - center.y) <= distribution.connectionRange + 1e-9;
      }));
    }
    powerSummary.push({
      region: region.id, asset: renewable.id, devices: distributors.length, capacityDevices, coverageTargets: uniqueTargets.length,
      generationMilliWatts: distributors.length * renewable.power.generation.outputMilliWatts, ratedLoadMilliWatts: load,
    });
  }

  return {
    blueprint, target: { resource: targetResource, region: finalRegion, ratePerMinute: targetRate },
    selectedProcesses: [...selections.values()].map((selection) => ({
      resource: selection.resource, process: selection.process.id, asset: selection.asset.id, region: selection.region, machines: selection.machines,
      capacityPerMachine: selection.outputPerCycle * 60_000 / selection.durationTicks,
      requiredCyclesPerMinute: selection.requiredCyclesPerMinute,
      inputsPerMinute: Object.fromEntries(selection.process.inputs.map((input) => [input.resource, input.count * selection.requiredCyclesPerMinute])),
      outputsPerMinute: Object.fromEntries(selection.process.outputs.map((output) => [output.resource, output.count * selection.requiredCyclesPerMinute])),
    })).sort((a, b) => a.process.localeCompare(b.process)),
    extraction: extractionSummary,
    plannedTransports: demandPlan.transports.map(({ resource, fromRegion, toRegion, requiredPerMinute, costPerItem }) => ({ resource, fromRegion, toRegion, requiredPerMinute, costPerItem })),
    optimization: { rawCost: demandPlan.rawCost, processCost: demandPlan.processCost, logisticsCost: demandPlan.logisticsCost },
    localLogistics: plannedConnections.map((connection) => {
      const pipeline = selectedPipelines.get(connection.id)!;
      return {
        connection: connection.id, resource: connection.resource, requiredPerMinute: connection.requiredPerMinute,
        capacityPerMinute: pipeline.capacityPerMinute, loader: pipeline.loader.id, line: pipeline.line.id,
        unloader: pipeline.unloader.id, stackSize: pipeline.stackSize,
      };
    }),
    stationNetworks: stationSummary, power: powerSummary,
  };
}
