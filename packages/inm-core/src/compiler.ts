import type {
  CompiledConnection, CompiledDevice, CompiledFactoryProject, DeviceAsset, DevicePort,
  MaterialAsset, ProjectHashes, Recipe, ValidationIssue,
} from "./types";
import { InmValidationError } from "./types";
import type { LoadedFactoryProject } from "./loader";
import { ENGINE_VERSION, hashValue } from "./utils";

function rotatedFootprint(asset: DeviceAsset, rotation: number): { width: number; height: number } {
  const footprint = asset.geometry.footprint;
  return rotation === 90 || rotation === 270
    ? { width: footprint.height, height: footprint.width }
    : { ...footprint };
}

function rotateSide(side: DevicePort["side"], rotation: number): DevicePort["side"] {
  const sides: DevicePort["side"][] = ["north", "east", "south", "west"];
  return sides[(sides.indexOf(side) + rotation / 90) % 4]!;
}

function validateCatalog(materials: Record<string, MaterialAsset>, devices: Record<string, DeviceAsset>, recipes: Record<string, Recipe>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const materialRef = (id: string, path: string) => {
    if (!materials[id]) issues.push({ path, code: "reference.material", message: `Unknown material '${id}'` });
  };
  for (const [id, recipe] of Object.entries(recipes)) {
    recipe.inputs.forEach((item, index) => materialRef(item.material, `recipes/${id}/inputs/${index}/material`));
    recipe.outputs.forEach((item, index) => materialRef(item.material, `recipes/${id}/outputs/${index}/material`));
  }
  for (const [id, device] of Object.entries(devices)) {
    const behavior = device.behavior;
    if (behavior.kind === "source") materialRef(behavior.material, `devices/${id}/behavior/material`);
    if (behavior.kind === "sink") behavior.accepts.forEach((item, index) => materialRef(item, `devices/${id}/behavior/accepts/${index}`));
    if (behavior.kind === "storage") behavior.accepts.filter((item) => item !== "*").forEach((item, index) => materialRef(item, `devices/${id}/behavior/accepts/${index}`));
    if (behavior.kind === "processor") behavior.supportedRecipes.forEach((recipe, index) => {
      if (!recipes[recipe]) issues.push({ path: `devices/${id}/behavior/supportedRecipes/${index}`, code: "reference.recipe", message: `Unknown recipe '${recipe}'` });
    });
    const portIds = new Set<string>();
    device.geometry.ports.forEach((port, index) => {
      if (portIds.has(port.id)) issues.push({ path: `devices/${id}/geometry/ports/${index}/id`, code: "geometry.duplicate-port", message: `Duplicate port '${port.id}'` });
      portIds.add(port.id);
      const edgeLength = port.side === "north" || port.side === "south" ? device.geometry.footprint.width : device.geometry.footprint.height;
      if (port.offset >= edgeLength) issues.push({ path: `devices/${id}/geometry/ports/${index}/offset`, code: "geometry.port-offset", message: `Port offset ${port.offset} is outside edge length ${edgeLength}` });
    });
  }
  return issues;
}

export function compileFactoryProject(loaded: LoadedFactoryProject): CompiledFactoryProject {
  const issues = validateCatalog(loaded.materials, loaded.deviceAssets, loaded.recipes);
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
    let recipe: Recipe | undefined;
    if (instance.config?.recipe) {
      recipe = loaded.recipes[instance.config.recipe];
      if (!recipe) issues.push({ path: `${path}/config/recipe`, code: "reference.recipe", message: `Unknown recipe '${instance.config.recipe}'` });
      else if (asset.behavior.kind !== "processor" || !asset.behavior.supportedRecipes.includes(recipe.id)) {
        issues.push({ path: `${path}/config/recipe`, code: "behavior.unsupported-recipe", message: `Device '${instance.asset}' does not support recipe '${recipe.id}'` });
      }
    } else if (asset.behavior.kind === "processor") {
      issues.push({ path: `${path}/config/recipe`, code: "behavior.missing-recipe", message: "Processor instance requires config.recipe" });
    }
    for (const [acceptIndex, material] of (instance.config?.accepts ?? []).entries()) {
      if (!loaded.materials[material]) issues.push({ path: `${path}/config/accepts/${acceptIndex}`, code: "reference.material", message: `Unknown material '${material}'` });
    }
    devices[instance.id] = {
      ...instance, assetDef: asset, footprint, recipe,
      ports: asset.geometry.ports.map((port) => ({ ...port, side: rotateSide(port.side, instance.rotation) })),
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
    else if (transport.behavior.kind !== "transport") issues.push({ path: `${path}/transport/deviceAsset`, code: "behavior.not-transport", message: `Device '${transport.id}' is not a transport` });
    if (!from || !to || !transport || transport.behavior.kind !== "transport") continue;
    const fromPort = from.ports.find((port) => port.id === connection.from.port);
    const toPort = to.ports.find((port) => port.id === connection.to.port);
    if (!fromPort) issues.push({ path: `${path}/from/port`, code: "reference.port", message: `Unknown port '${connection.from.port}' on '${from.id}'` });
    if (!toPort) issues.push({ path: `${path}/to/port`, code: "reference.port", message: `Unknown port '${connection.to.port}' on '${to.id}'` });
    if (fromPort && fromPort.direction !== "output") issues.push({ path: `${path}/from/port`, code: "port.direction", message: "Connection must start at an output port" });
    if (toPort && toPort.direction !== "input") issues.push({ path: `${path}/to/port`, code: "port.direction", message: "Connection must end at an input port" });
    if (fromPort && toPort && fromPort.kind !== toPort.kind) issues.push({ path, code: "port.kind", message: `Incompatible port kinds '${fromPort.kind}' and '${toPort.kind}'` });
    const distance = Math.max(1, Math.abs(from.position.x - to.position.x) + Math.abs(from.position.y - to.position.y));
    connections[connection.id] = { ...connection, fromDevice: from, toDevice: to, transportAsset: transport as CompiledConnection["transportAsset"], distance, travelTicks: distance * transport.behavior.travelTicksPerCell };
  }

  if (!loaded.materials[loaded.objective.targetMaterial]) issues.push({ path: "objective/targetMaterial", code: "reference.material", message: `Unknown target material '${loaded.objective.targetMaterial}'` });
  for (const [deviceId, inventory] of Object.entries(loaded.scenario.initialInventories ?? {})) {
    if (!devices[deviceId]) issues.push({ path: `scenario/initialInventories/${deviceId}`, code: "reference.device-instance", message: `Unknown device instance '${deviceId}'` });
    for (const material of Object.keys(inventory)) if (!loaded.materials[material]) issues.push({ path: `scenario/initialInventories/${deviceId}/${material}`, code: "reference.material", message: `Unknown material '${material}'` });
  }
  for (const [index, failure] of (loaded.scenario.failures ?? []).entries()) if (!devices[failure.device]) issues.push({ path: `scenario/failures/${index}/device`, code: "reference.device-instance", message: `Unknown device instance '${failure.device}'` });
  if (issues.length) throw new InmValidationError(issues);

  const hashes: ProjectHashes = {
    engineVersion: ENGINE_VERSION,
    materialCatalogHash: hashValue(loaded.materials), deviceCatalogHash: hashValue(loaded.deviceAssets), recipeCatalogHash: hashValue(loaded.recipes),
    blueprintHash: hashValue(loaded.blueprint), scenarioHash: hashValue(loaded.scenario), objectiveHash: hashValue(loaded.objective),
  };
  return { ...loaded, devices, connections, hashes };
}
