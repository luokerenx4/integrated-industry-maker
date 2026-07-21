import type { Blueprint, BlueprintConnection, BlueprintDevice, DeviceAsset, DevicePort, GridPosition, IndustrialWorld, Rotation } from "./types";

export function rotatedFootprint(asset: DeviceAsset, rotation: Rotation): { width: number; height: number } {
  const footprint = asset.geometry.footprint;
  return rotation === 90 || rotation === 270 ? { width: footprint.height, height: footprint.width } : { ...footprint };
}

export function rotatePortSide(side: DevicePort["side"], rotation: Rotation): DevicePort["side"] {
  const sides: DevicePort["side"][] = ["north", "east", "south", "west"];
  return sides[(sides.indexOf(side) + rotation / 90) % 4]!;
}

export function transportEndpointRotation(stage: "loader" | "unloader", machinePortSide: DevicePort["side"]): Rotation {
  const flowSide: DevicePort["side"] = stage === "loader"
    ? machinePortSide
    : ({ north: "south", east: "west", south: "north", west: "east" } as const)[machinePortSide];
  return ({ east: 0, south: 90, west: 180, north: 270 } as const)[flowSide];
}

export function externalPortCell(device: BlueprintDevice, asset: DeviceAsset, portId: string): GridPosition | null {
  return externalPortCellAtDistance(device, asset, portId, 1);
}

export function externalPortCellAtDistance(device: BlueprintDevice, asset: DeviceAsset, portId: string, distance: number): GridPosition | null {
  const port = asset.geometry.ports.find((item) => item.id === portId);
  if (!port) return null;
  const footprint = rotatedFootprint(asset, device.rotation);
  const side = rotatePortSide(port.side, device.rotation);
  if (side === "north") return { x: device.position.x + port.offset, y: device.position.y - distance };
  if (side === "south") return { x: device.position.x + port.offset, y: device.position.y + footprint.height - 1 + distance };
  if (side === "west") return { x: device.position.x - distance, y: device.position.y + port.offset };
  return { x: device.position.x + footprint.width - 1 + distance, y: device.position.y + port.offset };
}

export function transportCellId(region: string, position: GridPosition): string {
  return `${region}:${position.x},${position.y}${position.level ? `@${position.level}` : ""}`;
}

export function findBlueprintConnectionPath(
  blueprint: Blueprint,
  world: IndustrialWorld,
  assets: Record<string, DeviceAsset>,
  connection: Pick<BlueprintConnection, "from" | "to">,
  options: {
    end?: GridPosition;
    allowEndTransportCell?: boolean;
    blockedCells?: GridPosition[];
    elevated?: boolean;
    endpointDistances?: { loader: number; unloader: number };
  } = {},
): GridPosition[] | null {
  const devices = new Map(blueprint.devices.map((device) => [device.id, device]));
  const from = devices.get(connection.from.device); const to = devices.get(connection.to.device);
  if (!from || !to || from.region !== to.region) return null;
  const fromAsset = assets[from.asset]; const toAsset = assets[to.asset];
  if (!fromAsset || !toAsset) return null;
  const endpointLogistics = (connection as Partial<BlueprintConnection>).logistics;
  const loaderDevice = endpointLogistics ? devices.get(endpointLogistics.loader.device) : undefined;
  const unloaderDevice = endpointLogistics ? devices.get(endpointLogistics.unloader.device) : undefined;
  const loaderDistance = options.endpointDistances?.loader ?? loaderDevice?.transportEndpoint?.distance ?? 1;
  const unloaderDistance = options.endpointDistances?.unloader ?? unloaderDevice?.transportEndpoint?.distance ?? 1;
  const start = externalPortCellAtDistance(from, fromAsset, connection.from.port, loaderDistance);
  const end = options.end ?? externalPortCellAtDistance(to, toAsset, connection.to.port, unloaderDistance);
  const region = world.regions.find((item) => item.id === from.region);
  if (!start || !end || !region) return null;
  const inside = (position: GridPosition) => position.x >= 0 && position.y >= 0 && position.x < region.bounds.width && position.y < region.bounds.height;
  if (!inside(start) || !inside(end)) return null;
  const portLead = (cell: GridPosition, side: DevicePort["side"]): GridPosition[] => {
    const direction = side === "north" ? { x: 0, y: -1 } : side === "south" ? { x: 0, y: 1 } : side === "west" ? { x: -1, y: 0 } : { x: 1, y: 0 };
    return Array.from({ length: 3 }, (_, distance) => ({ x: cell.x + direction.x * distance, y: cell.y + direction.y * distance }));
  };

  const hardBlocked = new Set<string>(); const solidBlocked = new Set<string>();
  for (const device of blueprint.devices.filter((item) => item.region === from.region && !item.transportEndpoint)) {
    const asset = assets[device.asset]; if (!asset) continue;
    const footprint = rotatedFootprint(asset, device.rotation);
    for (let y = device.position.y; y < device.position.y + footprint.height; y++) for (let x = device.position.x; x < device.position.x + footprint.width; x++) {
      hardBlocked.add(`${x},${y}`); solidBlocked.add(`${x},${y}`);
    }
    for (const port of options.elevated ? [] : asset.geometry.ports) {
      const cell = externalPortCell(device, asset, port.id);
      if (cell) for (const clearance of portLead(cell, rotatePortSide(port.side, device.rotation))) hardBlocked.add(`${clearance.x},${clearance.y}`);
    }
  }
  for (const node of world.resourceNodes.filter((item) => item.region === from.region)) {
    hardBlocked.add(`${node.position.x},${node.position.y}`); solidBlocked.add(`${node.position.x},${node.position.y}`);
  }
  const transportBlocked = new Set<string>(); const groundTransportBlocked = new Set<string>();
  for (const route of blueprint.connections) {
    const routeSource = devices.get(route.from.device);
    if (routeSource?.region !== from.region) continue;
    for (const cell of route.path ?? []) {
      if ((cell.level ?? 0) === 0) groundTransportBlocked.add(`${cell.x},${cell.y}`);
      if ((cell.level ?? 0) === (options.elevated ? 1 : 0)) transportBlocked.add(`${cell.x},${cell.y}`);
    }
  }

  const key = (position: GridPosition) => `${position.x},${position.y}`;
  const startKey = key(start); const endKey = key(end);
  const fromPort = fromAsset.geometry.ports.find((port) => port.id === connection.from.port)!;
  const toPort = toAsset.geometry.ports.find((port) => port.id === connection.to.port)!;
  for (const clearance of portLead(start, rotatePortSide(fromPort.side, from.rotation))) hardBlocked.delete(key(clearance));
  for (const clearance of portLead(end, rotatePortSide(toPort.side, to.rotation))) hardBlocked.delete(key(clearance));
  for (const cell of solidBlocked) hardBlocked.add(cell);
  if (hardBlocked.has(startKey) || hardBlocked.has(endKey) || groundTransportBlocked.has(startKey)
    || (groundTransportBlocked.has(endKey) && !options.allowEndTransportCell)) return null;
  const blocked = new Set([...hardBlocked, ...transportBlocked]);
  for (const cell of options.blockedCells ?? []) blocked.add(key(cell));
  blocked.delete(startKey); blocked.delete(endKey);
  if (options.allowEndTransportCell) blocked.delete(endKey);
  const queue: GridPosition[] = [start];
  const previous = new Map<string, string | null>([[startKey, null]]);
  const positions = new Map<string, GridPosition>([[startKey, start]]);
  while (queue.length) {
    const current = queue.shift()!;
    if (key(current) === endKey) break;
    const neighbors = [
      { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
    ].filter(inside).sort((a, b) => Math.abs(a.x - end.x) + Math.abs(a.y - end.y) - Math.abs(b.x - end.x) - Math.abs(b.y - end.y) || a.y - b.y || a.x - b.x);
    for (const neighbor of neighbors) {
      const neighborKey = key(neighbor);
      if (previous.has(neighborKey) || blocked.has(neighborKey)) continue;
      previous.set(neighborKey, key(current)); positions.set(neighborKey, neighbor); queue.push(neighbor);
    }
  }
  if (!previous.has(endKey)) return null;
  const path: GridPosition[] = [];
  for (let cursor: string | null = endKey; cursor !== null; cursor = previous.get(cursor) ?? null) path.push(positions.get(cursor)!);
  const result = path.reverse();
  return options.elevated && result.length > 2 ? result.map((position, index) => ({ ...position, level: index === 0 || index === result.length - 1 ? 0 : 1 })) : result;
}
