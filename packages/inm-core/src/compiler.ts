import { planDeviceTransport, validateDeviceConfig } from "./device-runtime";
import type {
  BlueprintLogisticsNetwork, WorldRegion, CompiledConnection, CompiledDevice, CompiledFactoryProject, CompiledLogisticsNetwork, CompiledPowerGrid, DeviceAsset, DevicePort,
  IndustrialProcess, ProjectHashes, ResourceAsset, ValidationIssue, WorldResourceNode,
} from "./types";
import { InmValidationError } from "./types";
import type { LoadedFactoryProject } from "./loader";
import { ENGINE_VERSION, hashValue } from "./utils";

function rotatedFootprint(asset: DeviceAsset, rotation: number): { width: number; height: number } {
  const footprint = asset.geometry.footprint;
  return rotation === 90 || rotation === 270 ? { width: footprint.height, height: footprint.width } : { ...footprint };
}

function rotateSide(side: DevicePort["side"], rotation: number): DevicePort["side"] {
  const sides: DevicePort["side"][] = ["north", "east", "south", "west"];
  return sides[(sides.indexOf(side) + rotation / 90) % 4]!;
}

function validateAssets(resources: Record<string, ResourceAsset>, processes: Record<string, IndustrialProcess>, devices: Record<string, DeviceAsset>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [id, process] of Object.entries(processes)) {
    for (const side of ["inputs", "outputs"] as const) {
      const seen = new Set<string>();
      for (const [index, amount] of process[side].entries()) {
        const path = `processes/${id}.process.json/${side}/${index}/resource`;
        if (seen.has(amount.resource)) issues.push({ path, code: "process.duplicate-resource", message: `Process '${id}' lists '${amount.resource}' more than once in ${side}` });
        seen.add(amount.resource);
        if (!resources[amount.resource]) issues.push({ path, code: "reference.resource", message: `Unknown resource '${amount.resource}'` });
      }
    }
  }
  for (const [id, asset] of Object.entries(devices)) {
    const bufferIds = new Set<string>();
    for (const [index, buffer] of asset.buffers.entries()) {
      if (bufferIds.has(buffer.id)) issues.push({ path: `assets/devices/${id}/asset.json/buffers/${index}/id`, code: "asset.duplicate-buffer", message: `Duplicate buffer '${buffer.id}'` });
      bufferIds.add(buffer.id);
      for (const [resourceIndex, resource] of buffer.accepts.entries()) if (resource !== "*" && !resources[resource]) {
        issues.push({ path: `assets/devices/${id}/asset.json/buffers/${index}/accepts/${resourceIndex}`, code: "reference.resource", message: `Unknown resource '${resource}'` });
      }
    }
    const portIds = new Set<string>();
    for (const [index, port] of asset.geometry.ports.entries()) {
      if (portIds.has(port.id)) issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/id`, code: "asset.duplicate-port", message: `Duplicate port '${port.id}'` });
      portIds.add(port.id);
      const buffer = asset.buffers.find((item) => item.id === port.buffer);
      if (!buffer) issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/buffer`, code: "reference.buffer", message: `Unknown buffer '${port.buffer}'` });
      else if (port.direction === "input" && buffer.role === "output") issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/buffer`, code: "port.buffer-role", message: "Input port cannot target an output-only buffer" });
      else if (port.direction === "output" && buffer.role === "input") issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/buffer`, code: "port.buffer-role", message: "Output port cannot read an input-only buffer" });
      const edgeLength = port.side === "north" || port.side === "south" ? asset.geometry.footprint.width : asset.geometry.footprint.height;
      if (port.offset >= edgeLength) issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/offset`, code: "geometry.port-offset", message: `Port offset ${port.offset} is outside edge length ${edgeLength}` });
    }
    if (asset.production) {
      if (!asset.capabilities.includes("process")) issues.push({ path: `assets/devices/${id}/asset.json/production`, code: "capability.not-process", message: "Production specification requires process capability" });
      const input = asset.buffers.find((buffer) => buffer.id === asset.production!.inputBuffer);
      const output = asset.buffers.find((buffer) => buffer.id === asset.production!.outputBuffer);
      if (!input) issues.push({ path: `assets/devices/${id}/asset.json/production/inputBuffer`, code: "reference.buffer", message: `Unknown buffer '${asset.production.inputBuffer}'` });
      else if (input.role === "output") issues.push({ path: `assets/devices/${id}/asset.json/production/inputBuffer`, code: "production.buffer-role", message: "Production input buffer cannot be output-only" });
      if (!output) issues.push({ path: `assets/devices/${id}/asset.json/production/outputBuffer`, code: "reference.buffer", message: `Unknown buffer '${asset.production.outputBuffer}'` });
      else if (output.role === "input") issues.push({ path: `assets/devices/${id}/asset.json/production/outputBuffer`, code: "production.buffer-role", message: "Production output buffer cannot be input-only" });
    }
    if (asset.extraction) {
      if (!asset.capabilities.includes("extract")) issues.push({ path: `assets/devices/${id}/asset.json/extraction`, code: "capability.not-extract", message: "Extraction specification requires extract capability" });
      const output = asset.buffers.find((buffer) => buffer.id === asset.extraction!.outputBuffer);
      if (!output) issues.push({ path: `assets/devices/${id}/asset.json/extraction/outputBuffer`, code: "reference.buffer", message: `Unknown buffer '${asset.extraction.outputBuffer}'` });
      else if (output.role === "input") issues.push({ path: `assets/devices/${id}/asset.json/extraction/outputBuffer`, code: "extraction.buffer-role", message: "Extraction output buffer cannot be input-only" });
      const seen = new Set<string>();
      for (const [index, resource] of asset.extraction.resources.entries()) {
        if (seen.has(resource)) issues.push({ path: `assets/devices/${id}/asset.json/extraction/resources/${index}`, code: "extraction.duplicate-resource", message: `Extraction resource '${resource}' is duplicated` });
        seen.add(resource);
        if (!resources[resource]) issues.push({ path: `assets/devices/${id}/asset.json/extraction/resources/${index}`, code: "reference.resource", message: `Unknown resource '${resource}'` });
        else if (output && !output.accepts.includes("*") && !output.accepts.includes(resource)) issues.push({ path: `assets/devices/${id}/asset.json/extraction/resources/${index}`, code: "extraction.resource-contract", message: `Output buffer '${output.id}' does not accept '${resource}'` });
      }
    }
    if (asset.capabilities.includes("extract") && !asset.extraction) issues.push({ path: `assets/devices/${id}/asset.json/extraction`, code: "extraction.spec-required", message: "Extract capability requires an extraction specification" });
    if (asset.power.distribution && !asset.capabilities.includes("power")) {
      issues.push({ path: `assets/devices/${id}/asset.json/power/distribution`, code: "capability.not-power", message: "Power distribution requires power capability" });
    }
    if (asset.power.productionMilliWatts > 0 && !asset.power.distribution) {
      issues.push({ path: `assets/devices/${id}/asset.json/power/distribution`, code: "power.distribution-required", message: "Power-producing devices must declare grid connection and coverage ranges" });
    }
    if (asset.logistics && !asset.capabilities.includes("transport")) issues.push({ path: `assets/devices/${id}/asset.json/logistics`, code: "capability.not-transport", message: "Logistics roles require transport capability" });
    if (asset.logistics && new Set(asset.logistics.roles).size !== asset.logistics.roles.length) issues.push({ path: `assets/devices/${id}/asset.json/logistics/roles`, code: "logistics.duplicate-role", message: "Logistics roles must be unique" });
    if (asset.logistics?.roles.includes("carrier") && !asset.logistics.carrierKinds) issues.push({ path: `assets/devices/${id}/asset.json/logistics/carrierKinds`, code: "logistics.carrier-kinds-required", message: "Carrier role requires supported network kinds" });
    if (asset.logistics?.carrierKinds && !asset.logistics.roles.includes("carrier")) issues.push({ path: `assets/devices/${id}/asset.json/logistics/carrierKinds`, code: "logistics.carrier-role-required", message: "Carrier kinds require carrier role" });
    if (asset.capabilities.includes("transport") && !asset.logistics) issues.push({ path: `assets/devices/${id}/asset.json/logistics`, code: "logistics.roles-required", message: "Transport capability requires explicit logistics roles" });
    if (asset.capabilities.includes("transport") && !asset.program.planTransport) issues.push({ path: `assets/devices/${id}/${asset.runtime.entry}`, code: "runtime.missing-transport-hook", message: "Transport capability requires planTransport(context)" });
    if (asset.logisticsStation) {
      if (!asset.capabilities.includes("station")) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation`, code: "capability.not-station", message: "Logistics station specification requires station capability" });
      if (new Set(asset.logisticsStation.networkKinds).size !== asset.logisticsStation.networkKinds.length) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation/networkKinds`, code: "station.duplicate-kind", message: "Station network kinds must be unique" });
      const buffer = asset.buffers.find((item) => item.id === asset.logisticsStation!.buffer);
      if (!buffer) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation/buffer`, code: "reference.buffer", message: `Unknown station buffer '${asset.logisticsStation.buffer}'` });
      else if (buffer.role !== "internal") issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation/buffer`, code: "station.buffer-role", message: "Station buffer must use internal role for local input and output" });
    }
    if (asset.capabilities.includes("station") && !asset.logisticsStation) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation`, code: "station.spec-required", message: "Station capability requires logisticsStation specification" });
  }
  return issues;
}

function centerDistance(left: CompiledDevice, right: CompiledDevice): number {
  const lx = left.position.x + left.footprint.width / 2; const ly = left.position.y + left.footprint.height / 2;
  const rx = right.position.x + right.footprint.width / 2; const ry = right.position.y + right.footprint.height / 2;
  return Math.hypot(lx - rx, ly - ry);
}

function compilePowerGrids(devices: Record<string, CompiledDevice>): Record<string, CompiledPowerGrid> {
  const distributors = Object.values(devices).filter((device) => device.assetDef.power.distribution).sort((a, b) => a.id.localeCompare(b.id));
  const parent = new Map(distributors.map((device) => [device.id, device.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return current;
    const root = find(current); parent.set(id, root); return root;
  };
  const union = (left: string, right: string): void => {
    const a = find(left); const b = find(right);
    if (a === b) return;
    if (a.localeCompare(b) < 0) parent.set(b, a); else parent.set(a, b);
  };
  for (let i = 0; i < distributors.length; i++) for (let j = i + 1; j < distributors.length; j++) {
    const left = distributors[i]!; const right = distributors[j]!;
    if (left.region !== right.region) continue;
    const reach = Math.min(left.assetDef.power.distribution!.connectionRange, right.assetDef.power.distribution!.connectionRange);
    if (centerDistance(left, right) <= reach) union(left.id, right.id);
  }

  const components = new Map<string, CompiledDevice[]>();
  for (const distributor of distributors) {
    const members = components.get(find(distributor.id)) ?? [];
    members.push(distributor); components.set(find(distributor.id), members);
  }
  const grids: Record<string, CompiledPowerGrid> = {};
  const gridDistributors = [...components.values()].map((members) => {
    members.sort((a, b) => a.id.localeCompare(b.id));
    const region = members[0]!.region;
    const id = `grid-${region}-${members[0]!.id}`;
    grids[id] = { id, region, distributors: members.map((device) => device.id), members: [], productionMilliWatts: 0, ratedConsumptionMilliWatts: 0 };
    return { id, members };
  }).sort((a, b) => a.id.localeCompare(b.id));

  for (const device of Object.values(devices).sort((a, b) => a.id.localeCompare(b.id))) {
    const candidates = gridDistributors.flatMap((grid) => {
      if (grids[grid.id]!.region !== device.region) return [];
      const distances = grid.members.map((distributor) => ({
        distributor,
        distance: centerDistance(device, distributor),
      })).filter((candidate) => candidate.distance <= candidate.distributor.assetDef.power.distribution!.coverageRange);
      if (!distances.length) return [];
      distances.sort((a, b) => a.distance - b.distance || a.distributor.id.localeCompare(b.distributor.id));
      return [{ grid: grid.id, distance: distances[0]!.distance }];
    }).sort((a, b) => a.distance - b.distance || a.grid.localeCompare(b.grid));
    if (!candidates.length) continue;
    const grid = grids[candidates[0]!.grid]!;
    device.powerGrid = grid.id;
    grid.members.push(device.id);
    grid.productionMilliWatts += device.assetDef.power.productionMilliWatts;
    grid.ratedConsumptionMilliWatts += device.assetDef.power.consumptionMilliWatts;
  }
  return grids;
}

function compileLogisticsNetworks(
  definitions: BlueprintLogisticsNetwork[], devices: Record<string, CompiledDevice>, assets: Record<string, DeviceAsset>,
  resources: Record<string, ResourceAsset>, regions: Record<string, WorldRegion>, issues: ValidationIssue[],
): Record<string, CompiledLogisticsNetwork> {
  const networks: Record<string, CompiledLogisticsNetwork> = {};
  const ids = new Set<string>();
  for (const [networkIndex, definition] of definitions.entries()) {
    const path = `blueprint/logisticsNetworks/${networkIndex}`;
    if (ids.has(definition.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate logistics network '${definition.id}'` });
    ids.add(definition.id);
    const fleetAsset = assets[definition.fleet.deviceAsset];
    if (!fleetAsset) issues.push({ path: `${path}/fleet/deviceAsset`, code: "reference.device", message: `Unknown carrier asset '${definition.fleet.deviceAsset}'` });
    else if (!fleetAsset.logistics?.roles.includes("carrier") || !fleetAsset.logistics.carrierKinds?.includes(definition.kind)) {
      issues.push({ path: `${path}/fleet/deviceAsset`, code: "logistics.carrier-kind", message: `Device '${fleetAsset.id}' cannot carry '${definition.kind}' station traffic` });
    }
    const stationIds = new Set<string>();
    const validStations: Array<{ definition: BlueprintLogisticsNetwork["stations"][number]; device: CompiledDevice; buffer: string }> = [];
    for (const [stationIndex, station] of definition.stations.entries()) {
      const stationPath = `${path}/stations/${stationIndex}`;
      if (stationIds.has(station.device)) issues.push({ path: `${stationPath}/device`, code: "station.duplicate-device", message: `Station '${station.device}' is listed more than once` });
      stationIds.add(station.device);
      const device = devices[station.device];
      if (!device) { issues.push({ path: `${stationPath}/device`, code: "reference.device-instance", message: `Unknown station device '${station.device}'` }); continue; }
      if (!regions[device.region]) continue;
      const spec = device.assetDef.logisticsStation;
      if (!spec || !spec.networkKinds.includes(definition.kind)) { issues.push({ path: `${stationPath}/device`, code: "station.network-kind", message: `Device '${station.device}' does not support '${definition.kind}' logistics` }); continue; }
      if (station.slots.length > spec.slots) issues.push({ path: `${stationPath}/slots`, code: "station.slot-capacity", message: `Station '${station.device}' exposes ${spec.slots} slots but configures ${station.slots.length}` });
      const slotResources = new Set<string>();
      for (const [slotIndex, slot] of station.slots.entries()) {
        const slotPath = `${stationPath}/slots/${slotIndex}`;
        if (slotResources.has(slot.resource)) issues.push({ path: `${slotPath}/resource`, code: "station.duplicate-resource", message: `Station '${station.device}' configures '${slot.resource}' more than once` });
        slotResources.add(slot.resource);
        if (!resources[slot.resource]) issues.push({ path: `${slotPath}/resource`, code: "reference.resource", message: `Unknown resource '${slot.resource}'` });
        const buffer = device.buffers[spec.buffer];
        if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(slot.resource)) issues.push({ path: `${slotPath}/resource`, code: "station.resource-contract", message: `Station buffer '${spec.buffer}' does not accept '${slot.resource}'` });
      }
      validStations.push({ definition: station, device, buffer: spec.buffer });
    }
    const stationRegions = new Set(validStations.map((station) => station.device.region));
    if (definition.kind === "planetary" && stationRegions.size > 1) issues.push({ path: `${path}/stations`, code: "station.planetary-cross-region", message: `Planetary network '${definition.id}' cannot cross regions` });
    if (definition.kind === "interstellar" && stationRegions.size < 2) issues.push({ path: `${path}/stations`, code: "station.interstellar-single-region", message: `Interstellar network '${definition.id}' must include stations in at least two regions` });
    if (!fleetAsset?.logistics?.roles.includes("carrier") || !fleetAsset.logistics.carrierKinds?.includes(definition.kind)) continue;
    const routes: CompiledLogisticsNetwork["routes"] = [];
    for (const supply of validStations) for (const supplySlot of supply.definition.slots.filter((slot) => slot.mode === "supply")) {
      for (const demand of validStations) for (const demandSlot of demand.definition.slots.filter((slot) => slot.mode === "demand" && slot.resource === supplySlot.resource)) {
        if (supply.device.id === demand.device.id) continue;
        const crossesRegions = supply.device.region !== demand.device.region;
        if ((definition.kind === "planetary" && crossesRegions) || (definition.kind === "interstellar" && !crossesRegions)) continue;
        const id = `${definition.id}:${supplySlot.resource}:${supply.device.id}->${demand.device.id}`;
        const supplyRegion = regions[supply.device.region]!;
        const demandRegion = regions[demand.device.region]!;
        const distance = Math.max(1,
          Math.abs(supplyRegion.coordinates.x + supply.device.position.x - demandRegion.coordinates.x - demand.device.position.x)
          + Math.abs(supplyRegion.coordinates.y - demandRegion.coordinates.y)
          + Math.abs(supplyRegion.coordinates.z + supply.device.position.y - demandRegion.coordinates.z - demand.device.position.y),
        );
        const plan = planDeviceTransport(fleetAsset.id, fleetAsset.program, { apiVersion: 1, connection: id, stage: "carrier", distance });
        const minimumBatch = Math.max(supplySlot.minimumBatch ?? 1, demandSlot.minimumBatch ?? 1);
        if (minimumBatch > plan.capacity) issues.push({ path, code: "station.minimum-batch", message: `Route '${id}' minimum batch ${minimumBatch} exceeds carrier capacity ${plan.capacity}` });
        routes.push({ id, network: definition.id, resource: supplySlot.resource, from: supply.device.id, to: demand.device.id, fromRegion: supply.device.region, toRegion: demand.device.region, fromBuffer: supply.buffer, toBuffer: demand.buffer, minimumBatch, distance, capacity: plan.capacity, travelTicks: plan.durationTicks });
      }
    }
    networks[definition.id] = { id: definition.id, kind: definition.kind, fleetAsset, fleetSize: definition.fleet.count, stations: structuredClone(definition.stations), routes };
  }
  return networks;
}

export function compileFactoryProject(loaded: LoadedFactoryProject): CompiledFactoryProject {
  const issues = validateAssets(loaded.resources, loaded.processes, loaded.deviceAssets);
  const regions: Record<string, WorldRegion> = {};
  for (const [index, region] of loaded.world.regions.entries()) {
    if (regions[region.id]) issues.push({ path: `world/regions/${index}/id`, code: "reference.duplicate", message: `Duplicate region '${region.id}'` });
    regions[region.id] = structuredClone(region);
  }
  const resourceNodes: Record<string, WorldResourceNode> = {};
  for (const [index, node] of loaded.world.resourceNodes.entries()) {
    const path = `world/resourceNodes/${index}`;
    if (resourceNodes[node.id]) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate resource node '${node.id}'` });
    resourceNodes[node.id] = structuredClone(node);
    const region = regions[node.region];
    if (!region) issues.push({ path: `${path}/region`, code: "reference.region", message: `Unknown region '${node.region}'` });
    else if (node.position.x >= region.bounds.width || node.position.y >= region.bounds.height) issues.push({ path: `${path}/position`, code: "geometry.out-of-bounds", message: `Resource node '${node.id}' is outside region '${node.region}' bounds` });
    if (!loaded.resources[node.resource]) issues.push({ path: `${path}/resource`, code: "reference.resource", message: `Unknown resource '${node.resource}'` });
  }
  const devices: Record<string, CompiledDevice> = {};
  const ids = new Set<string>();
  for (const [index, instance] of loaded.blueprint.devices.entries()) {
    const path = `blueprints/${loaded.manifest.defaultBlueprint}/devices/${index}`;
    if (ids.has(instance.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate device instance '${instance.id}'` });
    ids.add(instance.id);
    const asset = loaded.deviceAssets[instance.asset];
    if (!asset) { issues.push({ path: `${path}/asset`, code: "reference.device", message: `Unknown device asset '${instance.asset}'` }); continue; }
    const region = regions[instance.region];
    if (!region) issues.push({ path: `${path}/region`, code: "reference.region", message: `Unknown region '${instance.region}'` });
    if (!asset.geometry.rotatable && instance.rotation !== 0) issues.push({ path: `${path}/rotation`, code: "geometry.rotation", message: `Device '${instance.asset}' is not rotatable` });
    const footprint = rotatedFootprint(asset, instance.rotation);
    if (region && (instance.position.x + footprint.width > region.bounds.width || instance.position.y + footprint.height > region.bounds.height)) {
      issues.push({ path: `${path}/position`, code: "geometry.out-of-bounds", message: `Footprint ${footprint.width}x${footprint.height} at (${instance.position.x},${instance.position.y}) exceeds region '${region.id}' ${region.bounds.width}x${region.bounds.height} bounds` });
    }
    for (const message of validateDeviceConfig(asset.id, asset.program, instance.config ?? {})) {
      issues.push({ path: `${path}/config`, code: "runtime.invalid-config", message });
    }
    let processPlan: CompiledDevice["processPlan"];
    let extractionPlan: CompiledDevice["extractionPlan"];
    if (instance.process) {
      const definition = loaded.processes[instance.process];
      if (!definition) issues.push({ path: `${path}/process`, code: "reference.process", message: `Unknown process '${instance.process}'` });
      if (!asset.production) issues.push({ path: `${path}/process`, code: "production.unsupported", message: `Device asset '${asset.id}' does not support declarative processes` });
      if (definition && asset.production) {
        if (!asset.production.categories.includes(definition.category)) {
          issues.push({ path: `${path}/process`, code: "production.category", message: `Device '${asset.id}' does not support process category '${definition.category}'` });
        }
        const inputBuffer = asset.buffers.find((buffer) => buffer.id === asset.production!.inputBuffer);
        const outputBuffer = asset.buffers.find((buffer) => buffer.id === asset.production!.outputBuffer);
        if (inputBuffer) for (const amount of definition.inputs) if (!inputBuffer.accepts.includes("*") && !inputBuffer.accepts.includes(amount.resource)) {
          issues.push({ path: `${path}/process`, code: "production.input-contract", message: `Input buffer '${inputBuffer.id}' does not accept '${amount.resource}' required by '${definition.id}'` });
        }
        if (outputBuffer) for (const amount of definition.outputs) if (!outputBuffer.accepts.includes("*") && !outputBuffer.accepts.includes(amount.resource)) {
          issues.push({ path: `${path}/process`, code: "production.output-contract", message: `Output buffer '${outputBuffer.id}' does not accept '${amount.resource}' produced by '${definition.id}'` });
        }
        if (asset.production.categories.includes(definition.category) && inputBuffer && outputBuffer) {
          processPlan = {
            definition,
            durationTicks: Math.max(1, Math.ceil(definition.durationTicks * asset.production.speed.denominator / asset.production.speed.numerator)),
            inputs: definition.inputs.map((amount) => ({ buffer: inputBuffer.id, ...amount })),
            outputs: definition.outputs.map((amount) => ({ buffer: outputBuffer.id, ...amount })),
          };
        }
      }
    } else if (asset.production) {
      issues.push({ path: `${path}/process`, code: "production.process-required", message: `Device asset '${asset.id}' requires a blueprint process binding` });
    }
    if (asset.extraction) {
      if (!instance.resourceNodes?.length) issues.push({ path: `${path}/resourceNodes`, code: "extraction.nodes-required", message: `Extractor '${instance.id}' must bind at least one world resource node` });
      const nodes: WorldResourceNode[] = [];
      const seenNodes = new Set<string>();
      for (const [nodeIndex, nodeId] of (instance.resourceNodes ?? []).entries()) {
        const nodePath = `${path}/resourceNodes/${nodeIndex}`;
        if (seenNodes.has(nodeId)) issues.push({ path: nodePath, code: "extraction.duplicate-node", message: `Resource node '${nodeId}' is bound more than once` });
        seenNodes.add(nodeId);
        const node = resourceNodes[nodeId];
        if (!node) { issues.push({ path: nodePath, code: "reference.resource-node", message: `Unknown resource node '${nodeId}'` }); continue; }
        if (node.region !== instance.region) issues.push({ path: nodePath, code: "extraction.cross-region", message: `Extractor '${instance.id}' cannot bind node '${nodeId}' in region '${node.region}'` });
        if (!asset.extraction.resources.includes(node.resource)) issues.push({ path: nodePath, code: "extraction.resource-unsupported", message: `Extractor '${asset.id}' cannot extract '${node.resource}'` });
        const centerX = instance.position.x + footprint.width / 2;
        const centerY = instance.position.y + footprint.height / 2;
        const distance = Math.hypot(centerX - node.position.x - 0.5, centerY - node.position.y - 0.5);
        if (distance > asset.extraction.radius) issues.push({ path: nodePath, code: "extraction.out-of-range", message: `Resource node '${nodeId}' is ${distance.toFixed(3)} cells away, beyond radius ${asset.extraction.radius}` });
        nodes.push(node);
      }
      if (new Set(nodes.map((node) => node.resource)).size > 1) issues.push({ path: `${path}/resourceNodes`, code: "extraction.mixed-resource", message: `Extractor '${instance.id}' may bind only one resource type at a time` });
      extractionPlan = { nodes, outputBuffer: asset.extraction.outputBuffer, cycleTicks: asset.extraction.cycleTicks, itemsPerCycle: asset.extraction.itemsPerCycle };
    } else if (instance.resourceNodes) {
      issues.push({ path: `${path}/resourceNodes`, code: "extraction.unsupported", message: `Device asset '${asset.id}' cannot bind world resource nodes` });
    }
    devices[instance.id] = {
      ...instance, assetDef: asset, footprint,
      ports: asset.geometry.ports.map((port) => ({ ...port, side: rotateSide(port.side, instance.rotation) })),
      buffers: Object.fromEntries(asset.buffers.map((buffer) => [buffer.id, buffer])),
      ...(processPlan ? { processPlan } : {}),
      ...(extractionPlan ? { extractionPlan } : {}),
    };
  }

  const placed = Object.values(devices).sort((a, b) => a.id.localeCompare(b.id));
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
    const left = placed[a]!; const right = placed[b]!;
    const overlap = left.region === right.region && left.position.x < right.position.x + right.footprint.width && left.position.x + left.footprint.width > right.position.x
      && left.position.y < right.position.y + right.footprint.height && left.position.y + left.footprint.height > right.position.y;
    if (overlap) issues.push({ path: "blueprint/devices", code: "geometry.overlap", message: `Devices '${left.id}' and '${right.id}' overlap` });
  }

  const powerGrids = compilePowerGrids(devices);

  const connections: Record<string, CompiledConnection> = {};
  const connectionIds = new Set<string>();
  for (const [index, connection] of loaded.blueprint.connections.entries()) {
    const path = `blueprint/connections/${index}`;
    if (connectionIds.has(connection.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate connection '${connection.id}'` });
    connectionIds.add(connection.id);
    const from = devices[connection.from.device]; const to = devices[connection.to.device];
    if (!from) issues.push({ path: `${path}/from/device`, code: "reference.device-instance", message: `Unknown device instance '${connection.from.device}'` });
    if (!to) issues.push({ path: `${path}/to/device`, code: "reference.device-instance", message: `Unknown device instance '${connection.to.device}'` });
    const stageDefinitions = (["loader", "line", "unloader"] as const).map((stage) => ({ stage, deviceAsset: connection.logistics[stage].deviceAsset }));
    const stageAssets = stageDefinitions.map(({ stage, deviceAsset }) => {
      const asset = loaded.deviceAssets[deviceAsset];
      if (!asset) issues.push({ path: `${path}/logistics/${stage}/deviceAsset`, code: "reference.device", message: `Unknown logistics asset '${deviceAsset}'` });
      else if (!asset.capabilities.includes("transport") || !asset.logistics?.roles.includes(stage)) issues.push({ path: `${path}/logistics/${stage}/deviceAsset`, code: "logistics.stage-role", message: `Device '${asset.id}' cannot serve as logistics ${stage}` });
      return asset;
    });
    if (!from || !to || stageAssets.some((asset, stageIndex) => !asset?.capabilities.includes("transport") || !asset.logistics?.roles.includes(stageDefinitions[stageIndex]!.stage))) continue;
    if (from.region !== to.region) { issues.push({ path, code: "connection.cross-region", message: `Physical connection '${connection.id}' cannot cross from '${from.region}' to '${to.region}'` }); continue; }
    const fromPort = from.ports.find((port) => port.id === connection.from.port);
    const toPort = to.ports.find((port) => port.id === connection.to.port);
    if (!fromPort) issues.push({ path: `${path}/from/port`, code: "reference.port", message: `Unknown port '${connection.from.port}' on '${from.id}'` });
    if (!toPort) issues.push({ path: `${path}/to/port`, code: "reference.port", message: `Unknown port '${connection.to.port}' on '${to.id}'` });
    if (!fromPort || !toPort) continue;
    if (fromPort.direction !== "output") issues.push({ path: `${path}/from/port`, code: "port.direction", message: "Connection must start at an output port" });
    if (toPort.direction !== "input") issues.push({ path: `${path}/to/port`, code: "port.direction", message: "Connection must end at an input port" });
    if (fromPort.kind !== toPort.kind) issues.push({ path, code: "port.kind", message: `Incompatible port kinds '${fromPort.kind}' and '${toPort.kind}'` });
    const sourceResources = from.buffers[fromPort.buffer]?.accepts ?? [];
    const targetResources = to.buffers[toPort.buffer]?.accepts ?? [];
    if (!sourceResources.includes("*") && !targetResources.includes("*") && !sourceResources.some((resource) => targetResources.includes(resource))) {
      issues.push({ path, code: "port.resource-contract", message: `Connection '${connection.id}' has no resource accepted by both endpoint buffers` });
    }
    const distance = Math.max(1, Math.abs(from.position.x - to.position.x) + Math.abs(from.position.y - to.position.y));
    const logisticsStages = stageDefinitions.map(({ stage }, stageIndex) => {
      const asset = stageAssets[stageIndex]!;
      const stageDistance = stage === "line" ? distance : 1;
      const plan = planDeviceTransport(asset.id, asset.program, { apiVersion: 1, connection: connection.id, stage, distance: stageDistance });
      return { stage, asset, distance: stageDistance, capacity: plan.capacity, durationTicks: plan.durationTicks };
    });
    const capacity = logisticsStages.reduce((sum, stage) => sum + stage.capacity, 0);
    const travelTicks = logisticsStages.reduce((sum, stage) => sum + stage.durationTicks, 0);
    const dispatchIntervalTicks = Math.max(...logisticsStages.map((stage) => Math.ceil(stage.durationTicks / stage.capacity)));
    connections[connection.id] = { ...connection, fromDevice: from, toDevice: to, fromPort, toPort, logisticsStages, distance, capacity, travelTicks, dispatchIntervalTicks };
  }

  const logisticsNetworks = compileLogisticsNetworks(loaded.blueprint.logisticsNetworks, devices, loaded.deviceAssets, loaded.resources, regions, issues);

  if (!loaded.resources[loaded.objective.targetResource]) issues.push({ path: "objective/targetResource", code: "reference.resource", message: `Unknown target resource '${loaded.objective.targetResource}'` });
  for (const [deviceId, buffers] of Object.entries(loaded.scenario.initialBuffers ?? {})) {
    const device = devices[deviceId];
    if (!device) { issues.push({ path: `scenario/initialBuffers/${deviceId}`, code: "reference.device-instance", message: `Unknown device instance '${deviceId}'` }); continue; }
    for (const [bufferId, inventory] of Object.entries(buffers)) {
      const buffer = device.buffers[bufferId];
      if (!buffer) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}`, code: "reference.buffer", message: `Unknown buffer '${bufferId}'` });
      for (const resource of Object.keys(inventory)) {
        if (!loaded.resources[resource]) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}/${resource}`, code: "reference.resource", message: `Unknown resource '${resource}'` });
        else if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(resource)) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}/${resource}`, code: "buffer.resource-contract", message: `Buffer '${bufferId}' does not accept '${resource}'` });
      }
      if (buffer && Object.values(inventory).reduce((sum, count) => sum + count, 0) > buffer.capacity) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}`, code: "buffer.capacity", message: `Initial quantity exceeds buffer capacity ${buffer.capacity}` });
    }
  }
  for (const [index, failure] of (loaded.scenario.failures ?? []).entries()) if (!devices[failure.device]) issues.push({ path: `scenario/failures/${index}/device`, code: "reference.device-instance", message: `Unknown device instance '${failure.device}'` });
  if (issues.length) throw new InmValidationError(issues);

  const hashes: ProjectHashes = {
    engineVersion: ENGINE_VERSION,
    resourceCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.resources).map(([id, asset]) => [id, asset.contentHash]))),
    processCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.processes).map(([id, process]) => [id, process.contentHash]))),
    deviceCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.deviceAssets).map(([id, asset]) => [id, asset.contentHash]))),
    worldHash: hashValue(loaded.world),
    blueprintHash: hashValue(loaded.blueprint), scenarioHash: hashValue(loaded.scenario), objectiveHash: hashValue(loaded.objective),
  };
  return { ...loaded, regions, resourceNodes, devices, connections, logisticsNetworks, powerGrids, hashes };
}
