import type {
  Blueprint, BlueprintDevice, BlueprintLogisticsNetwork, DeviceAsset, GridPosition, IndustrialProcess, ResourceId,
} from "./types";
import type { LoadedFactoryProject } from "./loader";
import { bindProcessRecipe } from "./production-analysis";
import { externalPortCell, findBlueprintConnectionPath, rotatedFootprint } from "./routing";
import { planDeviceTransport } from "./device-runtime";

interface ProcessSelection {
  resource: ResourceId;
  process: IndustrialProcess;
  asset: DeviceAsset;
  inputs: Record<ResourceId, string>;
  outputs: Record<ResourceId, string>;
  outputPerCycle: number;
  durationTicks: number;
  requiredPerMinute: number;
  region: string;
  machines: number;
  instances: BlueprintDevice[];
}

interface Endpoint { device: string; port: string; region: string }
interface PlannedConnection { id: string; resource: ResourceId; from: Endpoint; to: Endpoint }

export interface BlueprintSynthesisResult {
  blueprint: Blueprint;
  target: { resource: ResourceId; ratePerMinute: number };
  selectedProcesses: Array<{ resource: ResourceId; process: string; asset: string; region: string; machines: number; capacityPerMachine: number }>;
  extraction: Array<{ resource: ResourceId; asset: string; region: string; machines: number; nodes: string[] }>;
  stationNetworks: Array<{ network: string; resource: ResourceId; fromRegion: string; toRegion: string; carriers: number }>;
  power: Array<{ region: string; asset: string; devices: number; generationMilliWatts: number; ratedLoadMilliWatts: number }>;
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
    if (candidatePortCells.some((candidate) => otherPortCells.some((cell) => cell.x === candidate.x && cell.y === candidate.y))) return false;
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

function bestRegionForResources(loaded: LoadedFactoryProject, resources: Set<ResourceId>, fallback: string): string {
  const candidates = loaded.world.regions.map((region) => ({
    region: region.id,
    reserve: loaded.world.resourceNodes.filter((node) => node.region === region.id && resources.has(node.resource)).reduce((sum, node) => sum + node.amount, 0),
  })).sort((a, b) => b.reserve - a.reserve || a.region.localeCompare(b.region));
  return candidates[0]?.reserve ? candidates[0].region : fallback;
}

export function synthesizeFactoryBlueprint(loaded: LoadedFactoryProject): BlueprintSynthesisResult {
  const blueprint: Blueprint = { version: 1, devices: [], connections: [], logisticsNetworks: [], policies: { dispatch: "round-robin" } };
  const targetResource = loaded.objective.targetResource;
  const targetRate = loaded.objective.targetRatePerMinute;
  const boundaryAsset = Object.values(loaded.deviceAssets).filter((asset) => asset.capabilities.includes("consume") && asset.geometry.ports.some((port) => {
    const buffer = asset.buffers.find((item) => item.id === port.buffer);
    return port.direction === "input" && Boolean(buffer && (buffer.accepts.includes("*") || buffer.accepts.includes(targetResource)));
  })).sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  if (!boundaryAsset) throw new Error(`No project-local consumer Device accepts objective Resource '${targetResource}'`);
  const finalRegion = loaded.world.regions.at(-1)!.id;
  const selections = new Map<string, ProcessSelection>();
  const rawDemand: Record<ResourceId, number> = {};

  const choose = (resource: ResourceId): Omit<ProcessSelection, "requiredPerMinute" | "region" | "machines" | "instances"> | null => {
    const candidates = Object.values(loaded.processes).flatMap((process) => {
      const output = process.outputs.find((amount) => amount.resource === resource); if (!output) return [];
      return Object.values(loaded.deviceAssets).flatMap((asset) => {
        const binding = bindProcessRecipe(asset, process); if (!binding || !asset.production) return [];
        const durationTicks = Math.max(1, Math.ceil(process.durationTicks * asset.production.speed.denominator / asset.production.speed.numerator));
        return [{ resource, process, asset, inputs: binding.inputs, outputs: binding.outputs, outputPerCycle: output.count, durationTicks }];
      });
    }).sort((a, b) => b.outputPerCycle * 60_000 / b.durationTicks - a.outputPerCycle * 60_000 / a.durationTicks
      || a.asset.economics.buildCost - b.asset.economics.buildCost || a.process.id.localeCompare(b.process.id) || a.asset.id.localeCompare(b.asset.id));
    return candidates[0] ?? null;
  };

  const expand = (resource: ResourceId, requiredPerMinute: number, visiting: Set<ResourceId>): void => {
    if (visiting.has(resource)) { add(rawDemand, resource, requiredPerMinute); return; }
    const selected = choose(resource);
    if (!selected) { add(rawDemand, resource, requiredPerMinute); return; }
    const key = `${selected.process.id}:${selected.asset.id}:${resource}`;
    const existing = selections.get(key);
    if (existing) existing.requiredPerMinute += requiredPerMinute;
    else selections.set(key, { ...selected, requiredPerMinute, region: finalRegion, machines: 0, instances: [] });
    const cycles = requiredPerMinute / selected.outputPerCycle;
    const next = new Set(visiting); next.add(resource);
    for (const input of selected.process.inputs) expand(input.resource, input.count * cycles, next);
  };
  expand(targetResource, targetRate, new Set());

  const rawDescendants = (resource: ResourceId, visiting = new Set<ResourceId>()): Set<ResourceId> => {
    if (visiting.has(resource)) return new Set([resource]);
    const selected = [...selections.values()].find((item) => item.resource === resource);
    if (!selected) return new Set([resource]);
    const next = new Set(visiting); next.add(resource);
    return new Set(selected.process.inputs.flatMap((input) => [...rawDescendants(input.resource, next)]));
  };
  for (const selection of selections.values()) {
    selection.region = selection.resource === targetResource ? finalRegion : bestRegionForResources(loaded, rawDescendants(selection.resource), finalRegion);
    const capacityPerMachine = selection.outputPerCycle * 60_000 / selection.durationTicks;
    selection.machines = Math.ceil(selection.requiredPerMinute / capacityPerMachine - 1e-9);
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

  const sink: BlueprintDevice = { id: uniqueId(blueprint, `synth-${targetResource}-sink`), asset: boundaryAsset.id, region: finalRegion, position: { x: 0, y: 0 }, rotation: 0 };
  const targetInstance = [...selections.values()].find((selection) => selection.resource === targetResource)!.instances[0]!;
  placeDevice(loaded, blueprint, sink, { x: targetInstance.position.x + 4, y: targetInstance.position.y });

  const extractionSummary: BlueprintSynthesisResult["extraction"] = [];
  const extractorEndpoints = new Map<ResourceId, Endpoint[]>();
  for (const [resource, demand] of Object.entries(rawDemand).sort(([a], [b]) => a.localeCompare(b))) {
    const consumerRegions = [...new Set([...selections.values()].filter((selection) => selection.process.inputs.some((input) => input.resource === resource)).map((selection) => selection.region))];
    const region = consumerRegions.find((candidate) => loaded.world.resourceNodes.some((node) => node.region === candidate && node.resource === resource))
      ?? bestRegionForResources(loaded, new Set([resource]), finalRegion);
    const nodes = loaded.world.resourceNodes.filter((node) => node.region === region && node.resource === resource).sort((a, b) => a.id.localeCompare(b.id));
    if (!nodes.length) throw new Error(`No finite '${resource}' resource node is available for synthesized demand`);
    const asset = Object.values(loaded.deviceAssets).filter((candidate) => candidate.extraction?.resources.includes(resource))
      .sort((a, b) => (b.extraction!.itemsPerCycle * 60_000 / b.extraction!.cycleTicks) - (a.extraction!.itemsPerCycle * 60_000 / a.extraction!.cycleTicks)
        || a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
    if (!asset?.extraction) throw new Error(`No project-local extractor Device supports Resource '${resource}'`);
    const capacity = asset.extraction.itemsPerCycle * 60_000 / asset.extraction.cycleTicks;
    const machines = Math.ceil(demand / capacity - 1e-9);
    const endpoints: Endpoint[] = [];
    const centroid = { x: nodes.reduce((sum, node) => sum + node.position.x, 0) / nodes.length, y: nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length };
    for (let index = 0; index < machines; index++) {
      const device: BlueprintDevice = {
        id: uniqueId(blueprint, `synth-${resource}-extractor-${index + 1}`), asset: asset.id, region, position: { x: 0, y: 0 }, rotation: 0,
        resourceNodes: nodes.map((node) => node.id),
      };
      const footprint = asset.geometry.footprint;
      placeDevice(loaded, blueprint, device, { x: Math.round(centroid.x - footprint.width / 2), y: Math.round(centroid.y + 1) }, (position) => {
        const center = { x: position.x + footprint.width / 2, y: position.y + footprint.height / 2 };
        return nodes.every((node) => Math.hypot(center.x - node.position.x - .5, center.y - node.position.y - .5) <= asset.extraction!.radius);
      });
      endpoints.push({ device: device.id, port: portForBuffer(asset, "output", asset.extraction.outputBuffer), region });
    }
    extractorEndpoints.set(resource, endpoints);
    extractionSummary.push({ resource, asset: asset.id, region, machines, nodes: nodes.map((node) => node.id) });
  }

  const producers = new Map<ResourceId, Endpoint[]>(); const consumers = new Map<ResourceId, Endpoint[]>();
  for (const [resource, endpoints] of extractorEndpoints) producers.set(resource, [...endpoints]);
  for (const selection of selections.values()) for (const instance of selection.instances) {
    const outputBuffer = selection.outputs[selection.resource]!;
    (producers.get(selection.resource) ?? producers.set(selection.resource, []).get(selection.resource)!).push({ device: instance.id, port: portForBuffer(selection.asset, "output", outputBuffer), region: instance.region });
    for (const input of selection.process.inputs) {
      const buffer = selection.inputs[input.resource]!;
      (consumers.get(input.resource) ?? consumers.set(input.resource, []).get(input.resource)!).push({ device: instance.id, port: portForBuffer(selection.asset, "input", buffer), region: instance.region });
    }
  }
  const sinkPort = boundaryAsset.geometry.ports.find((port) => port.direction === "input" && (boundaryAsset.buffers.find((buffer) => buffer.id === port.buffer)?.accepts.includes(targetResource) || boundaryAsset.buffers.find((buffer) => buffer.id === port.buffer)?.accepts.includes("*")))!;
  (consumers.get(targetResource) ?? consumers.set(targetResource, []).get(targetResource)!).push({ device: sink.id, port: sinkPort.id, region: finalRegion });

  const plannedConnections: PlannedConnection[] = [];
  const stationSummary: BlueprintSynthesisResult["stationNetworks"] = [];
  const junctionAsset = Object.values(loaded.deviceAssets).filter((asset) => asset.capabilities.includes("transport-junction"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  const loader = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("loader"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  const line = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("line"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  const unloader = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("unloader"))
    .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  if (!loader || !line || !unloader) throw new Error("Blueprint synthesis requires project-local loader, line, and unloader Device assets");
  const connectionFor = (planned: PlannedConnection) => ({
    id: planned.id, from: { device: planned.from.device, port: planned.from.port }, to: { device: planned.to.device, port: planned.to.port }, path: [] as GridPosition[],
    logistics: { loader: { deviceAsset: loader.id }, line: { deviceAsset: line.id }, unloader: { deviceAsset: unloader.id } },
  });
  const reserveRoutes = (plans: PlannedConnection[]): void => {
    const rows = plans.map((planned) => {
      const connection = connectionFor(planned); const paths: GridPosition[][] = [];
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
    for (const planned of plans) blueprint.connections.push({ ...connectionFor(planned), path: routed.get(planned.id)! });
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
    const chunks = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
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

    const merge = (endpoints: Endpoint[]): Endpoint => {
      if (endpoints.length === 1) return endpoints[0]!;
      if (!junctionAsset) throw new Error(`Multiple '${resource}' producers require a project-local transport-junction Device`);
      const inputs = junctionAsset.geometry.ports.filter((port) => port.direction === "input");
      const output = junctionAsset.geometry.ports.find((port) => port.direction === "output");
      if (inputs.length < 2 || !output) throw new Error(`Transport junction '${junctionAsset.id}' needs at least two inputs and one output to merge '${resource}' flows`);
      let level = [...endpoints]; const toward = centroid(targetEndpoints);
      while (level.length > 1) {
        const next: Endpoint[] = [];
        for (const group of chunks(level, inputs.length)) {
          if (group.length === 1) { next.push(group[0]!); continue; }
          const from = centroid(group);
          const junction: BlueprintDevice = { id: uniqueId(blueprint, `synth-${resource}-merge`), asset: junctionAsset.id, region, position: { x: 0, y: 0 }, rotation: 0 };
          const assigned = placeJunction(junction, { x: Math.round((from.x + toward.x * 2) / 3), y: Math.round((from.y + toward.y * 2) / 3) }, rotationForFlow(from, toward), group, [targetEndpoints[0]!]);
          group.forEach((source, index) => plannedConnections.push({ id: safeId(`synth-${resource}-${source.device}-to-${junction.id}`), resource, from: source, to: { device: junction.id, port: assigned.inputs[index]!, region } }));
          next.push({ device: junction.id, port: assigned.outputs[0]!, region });
        }
        level = next;
      }
      return level[0]!;
    };

    const split = (endpoints: Endpoint[], source: Endpoint): Endpoint => {
      if (endpoints.length === 1) return endpoints[0]!;
      if (!junctionAsset) throw new Error(`Multiple '${resource}' consumers require a project-local transport-junction Device`);
      const input = junctionAsset.geometry.ports.find((port) => port.direction === "input");
      const outputs = junctionAsset.geometry.ports.filter((port) => port.direction === "output");
      if (!input || outputs.length < 2) throw new Error(`Transport junction '${junctionAsset.id}' needs one input and at least two outputs to split '${resource}' flows`);
      let level = [...endpoints].sort((a, b) => endpointPosition(b).y - endpointPosition(a).y || endpointPosition(b).x - endpointPosition(a).x || b.device.localeCompare(a.device));
      const from = endpointPosition(source);
      while (level.length > 1) {
        const next: Endpoint[] = [];
        const groups = chunks(level, outputs.length);
        for (const group of groups) {
          if (group.length === 1) { next.push(group[0]!); continue; }
          const toward = centroid(group);
          const junction: BlueprintDevice = { id: uniqueId(blueprint, `synth-${resource}-split`), asset: junctionAsset.id, region, position: { x: 0, y: 0 }, rotation: 0, policy: { dispatch: "round-robin" } };
          const assigned = placeJunction(junction, { x: Math.round((from.x * 2 + toward.x) / 3), y: Math.round((from.y * 2 + toward.y) / 3) }, rotationForFlow(from, toward), [source], group);
          group.forEach((target, index) => plannedConnections.push({ id: safeId(`synth-${resource}-${junction.id}-to-${target.device}`), resource, from: { device: junction.id, port: assigned.outputs[index]!, region }, to: target }));
          next.push({ device: junction.id, port: assigned.inputs[0]!, region });
        }
        level = next;
      }
      return level[0]!;
    };

    const effectiveSource = merge(sourceEndpoints);
    const effectiveTarget = split(targetEndpoints, effectiveSource);
    plannedConnections.push({ id: safeId(`synth-${resource}-${effectiveSource.device}-to-${effectiveTarget.device}`), resource, from: effectiveSource, to: effectiveTarget });
    reserveRoutes(plannedConnections.slice(plannedStart));
  };

  for (const resource of [...consumers.keys()].sort()) {
    const resourceProducers = producers.get(resource) ?? []; const resourceConsumers = consumers.get(resource)!;
    for (const region of [...new Set(resourceConsumers.map((endpoint) => endpoint.region))].sort()) {
      const targets = resourceConsumers.filter((endpoint) => endpoint.region === region);
      const local = resourceProducers.filter((endpoint) => endpoint.region === region);
      if (local.length) { connectLocal(resource, local, targets); continue; }
      const sourceRegion = [...new Set(resourceProducers.map((endpoint) => endpoint.region))].sort()[0];
      if (!sourceRegion) throw new Error(`No synthesized producer exists for Resource '${resource}'`);
      const stationAsset = Object.values(loaded.deviceAssets).filter((asset) => asset.logisticsStation?.networkKinds.includes("interstellar"))
        .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
      const carrier = Object.values(loaded.deviceAssets).filter((asset) => asset.logistics?.roles.includes("carrier") && asset.logistics.carrierKinds?.includes("interstellar"))
        .sort((a, b) => a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
      if (!stationAsset?.logisticsStation || !carrier) throw new Error(`Cross-region '${resource}' flow requires project-local interstellar station and carrier assets`);
      const sourceBounds = loaded.world.regions.find((item) => item.id === sourceRegion)!.bounds;
      const supply: BlueprintDevice = { id: uniqueId(blueprint, `synth-${resource}-station-supply`), asset: stationAsset.id, region: sourceRegion, position: { x: 0, y: 0 }, rotation: 0 };
      const demand: BlueprintDevice = { id: uniqueId(blueprint, `synth-${resource}-station-demand`), asset: stationAsset.id, region, position: { x: 0, y: 0 }, rotation: 0 };
      const sourceY = Math.round(resourceProducers.filter((endpoint) => endpoint.region === sourceRegion).reduce((sum, endpoint) => sum + blueprint.devices.find((device) => device.id === endpoint.device)!.position.y, 0)
        / resourceProducers.filter((endpoint) => endpoint.region === sourceRegion).length);
      const targetY = Math.round(targets.reduce((sum, endpoint) => sum + blueprint.devices.find((device) => device.id === endpoint.device)!.position.y, 0) / targets.length);
      placeDevice(loaded, blueprint, supply, { x: sourceBounds.width - stationAsset.geometry.footprint.width - 1, y: sourceY });
      placeDevice(loaded, blueprint, demand, { x: 1, y: targetY });
      const supplyPort = stationAsset.geometry.ports.find((port) => port.direction === "input")!; const demandPort = stationAsset.geometry.ports.find((port) => port.direction === "output")!;
      connectLocal(resource, resourceProducers.filter((endpoint) => endpoint.region === sourceRegion), [{ device: supply.id, port: supplyPort.id, region: sourceRegion }]);
      connectLocal(resource, [{ device: demand.id, port: demandPort.id, region }], targets);
      const distance = Math.max(1, Math.ceil(Math.hypot(
        loaded.world.regions.find((item) => item.id === sourceRegion)!.coordinates.x - loaded.world.regions.find((item) => item.id === region)!.coordinates.x,
        loaded.world.regions.find((item) => item.id === sourceRegion)!.coordinates.y - loaded.world.regions.find((item) => item.id === region)!.coordinates.y,
        loaded.world.regions.find((item) => item.id === sourceRegion)!.coordinates.z - loaded.world.regions.find((item) => item.id === region)!.coordinates.z,
      )));
      const plan = planDeviceTransport(carrier.id, carrier.program, { apiVersion: 1, connection: `synth-${resource}-network`, stage: "carrier", distance });
      const requiredRate = [...selections.values()].reduce((sum, selection) => sum + selection.process.inputs.filter((input) => input.resource === resource).reduce((inner, input) => inner + input.count * selection.requiredPerMinute / selection.outputPerCycle, 0), 0);
      const perCarrierRate = plan.capacity * 60_000 / plan.durationTicks; const carriers = Math.max(1, Math.ceil(requiredRate / perCarrierRate - 1e-9));
      const networkId = safeId(`synth-${resource}-${sourceRegion}-to-${region}`);
      const network: BlueprintLogisticsNetwork = {
        id: networkId, kind: "interstellar", fleet: { deviceAsset: carrier.id, count: carriers },
        stations: [
          { device: supply.id, slots: [{ resource, mode: "supply", minimumBatch: 1 }] },
          { device: demand.id, slots: [{ resource, mode: "demand", minimumBatch: 1 }] },
        ],
      };
      blueprint.logisticsNetworks.push(network);
      stationSummary.push({ network: networkId, resource, fromRegion: sourceRegion, toRegion: region, carriers });
    }
  }

  const reservedConnections = new Map(blueprint.connections.map((connection) => [connection.id, connection]));
  blueprint.connections = plannedConnections.map((planned) => reservedConnections.get(planned.id)!);

  const ratedLoad: Record<string, number> = {};
  for (const device of blueprint.devices) add(ratedLoad, device.region, loaded.deviceAssets[device.asset]!.power.consumptionMilliWatts);
  for (const connection of plannedConnections) add(ratedLoad, connection.from.region, loader.power.consumptionMilliWatts + unloader.power.consumptionMilliWatts);
  const renewable = Object.values(loaded.deviceAssets).filter((asset) => asset.power.generation?.kind === "renewable" && asset.power.distribution)
    .sort((a, b) => (b.power.generation?.outputMilliWatts ?? 0) - (a.power.generation?.outputMilliWatts ?? 0) || a.economics.buildCost - b.economics.buildCost || a.id.localeCompare(b.id))[0];
  if (!renewable?.power.generation || renewable.power.generation.kind !== "renewable") throw new Error("Blueprint synthesis requires a project-local renewable power distributor");
  const powerSummary: BlueprintSynthesisResult["power"] = [];
  for (const region of loaded.world.regions) {
    const load = ratedLoad[region.id] ?? 0; const count = Math.max(1, Math.ceil(load / renewable.power.generation.outputMilliWatts));
    for (let index = 0; index < count; index++) {
      const generator: BlueprintDevice = { id: uniqueId(blueprint, `synth-${region.id}-${renewable.id}-${index + 1}`), asset: renewable.id, region: region.id, position: { x: 0, y: 0 }, rotation: 0 };
      placeDevice(loaded, blueprint, generator, { x: Math.floor(region.bounds.width * .5) + index * 3, y: 2 });
    }
    powerSummary.push({ region: region.id, asset: renewable.id, devices: count, generationMilliWatts: count * renewable.power.generation.outputMilliWatts, ratedLoadMilliWatts: load });
  }

  return {
    blueprint, target: { resource: targetResource, ratePerMinute: targetRate },
    selectedProcesses: [...selections.values()].map((selection) => ({
      resource: selection.resource, process: selection.process.id, asset: selection.asset.id, region: selection.region, machines: selection.machines,
      capacityPerMachine: selection.outputPerCycle * 60_000 / selection.durationTicks,
    })).sort((a, b) => a.process.localeCompare(b.process)),
    extraction: extractionSummary, stationNetworks: stationSummary, power: powerSummary,
  };
}
