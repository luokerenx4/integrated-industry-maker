import { planDeviceTransport, validateDeviceConfig } from "./device-runtime";
import type {
  CompiledConnection, CompiledDevice, CompiledFactoryProject, DeviceAsset, DevicePort,
  IndustrialProcess, ProjectHashes, ResourceAsset, ValidationIssue,
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
    if (asset.capabilities.includes("transport") && !asset.program.planTransport) issues.push({ path: `assets/devices/${id}/${asset.runtime.entry}`, code: "runtime.missing-transport-hook", message: "Transport capability requires planTransport(context)" });
  }
  return issues;
}

export function compileFactoryProject(loaded: LoadedFactoryProject): CompiledFactoryProject {
  const issues = validateAssets(loaded.resources, loaded.processes, loaded.deviceAssets);
  const devices: Record<string, CompiledDevice> = {};
  const ids = new Set<string>();
  for (const [index, instance] of loaded.blueprint.devices.entries()) {
    const path = `blueprints/${loaded.manifest.defaultBlueprint}/devices/${index}`;
    if (ids.has(instance.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate device instance '${instance.id}'` });
    ids.add(instance.id);
    const asset = loaded.deviceAssets[instance.asset];
    if (!asset) { issues.push({ path: `${path}/asset`, code: "reference.device", message: `Unknown device asset '${instance.asset}'` }); continue; }
    if (!asset.geometry.rotatable && instance.rotation !== 0) issues.push({ path: `${path}/rotation`, code: "geometry.rotation", message: `Device '${instance.asset}' is not rotatable` });
    const footprint = rotatedFootprint(asset, instance.rotation);
    if (instance.position.x + footprint.width > loaded.blueprint.bounds.width || instance.position.y + footprint.height > loaded.blueprint.bounds.height) {
      issues.push({ path: `${path}/position`, code: "geometry.out-of-bounds", message: `Footprint ${footprint.width}x${footprint.height} at (${instance.position.x},${instance.position.y}) exceeds ${loaded.blueprint.bounds.width}x${loaded.blueprint.bounds.height} bounds` });
    }
    for (const message of validateDeviceConfig(asset.id, asset.program, instance.config ?? {})) {
      issues.push({ path: `${path}/config`, code: "runtime.invalid-config", message });
    }
    let processPlan: CompiledDevice["processPlan"];
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
    devices[instance.id] = {
      ...instance, assetDef: asset, footprint,
      ports: asset.geometry.ports.map((port) => ({ ...port, side: rotateSide(port.side, instance.rotation) })),
      buffers: Object.fromEntries(asset.buffers.map((buffer) => [buffer.id, buffer])),
      ...(processPlan ? { processPlan } : {}),
    };
  }

  const placed = Object.values(devices).sort((a, b) => a.id.localeCompare(b.id));
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
    const left = placed[a]!; const right = placed[b]!;
    const overlap = left.position.x < right.position.x + right.footprint.width && left.position.x + left.footprint.width > right.position.x
      && left.position.y < right.position.y + right.footprint.height && left.position.y + left.footprint.height > right.position.y;
    if (overlap) issues.push({ path: "blueprint/devices", code: "geometry.overlap", message: `Devices '${left.id}' and '${right.id}' overlap` });
  }

  const connections: Record<string, CompiledConnection> = {};
  const connectionIds = new Set<string>();
  for (const [index, connection] of loaded.blueprint.connections.entries()) {
    const path = `blueprint/connections/${index}`;
    if (connectionIds.has(connection.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate connection '${connection.id}'` });
    connectionIds.add(connection.id);
    const from = devices[connection.from.device]; const to = devices[connection.to.device];
    if (!from) issues.push({ path: `${path}/from/device`, code: "reference.device-instance", message: `Unknown device instance '${connection.from.device}'` });
    if (!to) issues.push({ path: `${path}/to/device`, code: "reference.device-instance", message: `Unknown device instance '${connection.to.device}'` });
    const transport = loaded.deviceAssets[connection.transport.deviceAsset];
    if (!transport) issues.push({ path: `${path}/transport/deviceAsset`, code: "reference.device", message: `Unknown transport asset '${connection.transport.deviceAsset}'` });
    else if (!transport.capabilities.includes("transport")) issues.push({ path: `${path}/transport/deviceAsset`, code: "capability.not-transport", message: `Device '${transport.id}' does not declare transport capability` });
    if (!from || !to || !transport || !transport.capabilities.includes("transport")) continue;
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
    const plan = planDeviceTransport(transport.id, transport.program, { apiVersion: 1, connection: connection.id, distance });
    connections[connection.id] = { ...connection, fromDevice: from, toDevice: to, fromPort, toPort, transportAsset: transport, distance, capacity: plan.capacity, travelTicks: plan.durationTicks };
  }

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
    blueprintHash: hashValue(loaded.blueprint), scenarioHash: hashValue(loaded.scenario), objectiveHash: hashValue(loaded.objective),
  };
  return { ...loaded, devices, connections, hashes };
}
