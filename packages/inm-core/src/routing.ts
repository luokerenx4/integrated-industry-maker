import type { Blueprint, BlueprintConnection, BlueprintDevice, DeviceAsset, DevicePort, GridPosition, IndustrialWorld, Rotation } from "./types";

export function rotatedFootprint(asset: DeviceAsset, rotation: Rotation): { width: number; height: number } {
  const footprint = asset.geometry.footprint;
  return rotation === 90 || rotation === 270 ? { width: footprint.height, height: footprint.width } : { ...footprint };
}

export function rotatePortSide(side: DevicePort["side"], rotation: Rotation): DevicePort["side"] {
  const sides: DevicePort["side"][] = ["north", "east", "south", "west"];
  return sides[(sides.indexOf(side) + rotation / 90) % 4]!;
}

export function externalPortCell(device: BlueprintDevice, asset: DeviceAsset, portId: string): GridPosition | null {
  const port = asset.geometry.ports.find((item) => item.id === portId);
  if (!port) return null;
  const footprint = rotatedFootprint(asset, device.rotation);
  const side = rotatePortSide(port.side, device.rotation);
  if (side === "north") return { x: device.position.x + port.offset, y: device.position.y - 1 };
  if (side === "south") return { x: device.position.x + port.offset, y: device.position.y + footprint.height };
  if (side === "west") return { x: device.position.x - 1, y: device.position.y + port.offset };
  return { x: device.position.x + footprint.width, y: device.position.y + port.offset };
}

export function transportCellId(region: string, position: GridPosition): string {
  return `${region}:${position.x},${position.y}`;
}

export function findBlueprintConnectionPath(
  blueprint: Blueprint,
  world: IndustrialWorld,
  assets: Record<string, DeviceAsset>,
  connection: Pick<BlueprintConnection, "from" | "to">,
  options: { end?: GridPosition; allowEndTransportCell?: boolean } = {},
): GridPosition[] | null {
  const devices = new Map(blueprint.devices.map((device) => [device.id, device]));
  const from = devices.get(connection.from.device); const to = devices.get(connection.to.device);
  if (!from || !to || from.region !== to.region) return null;
  const fromAsset = assets[from.asset]; const toAsset = assets[to.asset];
  if (!fromAsset || !toAsset) return null;
  const start = externalPortCell(from, fromAsset, connection.from.port);
  const end = options.end ?? externalPortCell(to, toAsset, connection.to.port);
  const region = world.regions.find((item) => item.id === from.region);
  if (!start || !end || !region) return null;
  const inside = (position: GridPosition) => position.x >= 0 && position.y >= 0 && position.x < region.bounds.width && position.y < region.bounds.height;
  if (!inside(start) || !inside(end)) return null;

  const hardBlocked = new Set<string>();
  for (const device of blueprint.devices.filter((item) => item.region === from.region)) {
    const asset = assets[device.asset]; if (!asset) continue;
    const footprint = rotatedFootprint(asset, device.rotation);
    for (let y = device.position.y; y < device.position.y + footprint.height; y++) for (let x = device.position.x; x < device.position.x + footprint.width; x++) hardBlocked.add(`${x},${y}`);
  }
  for (const node of world.resourceNodes.filter((item) => item.region === from.region)) hardBlocked.add(`${node.position.x},${node.position.y}`);
  const transportBlocked = new Set<string>();
  for (const route of blueprint.connections) for (const cell of route.path ?? []) transportBlocked.add(`${cell.x},${cell.y}`);

  const key = (position: GridPosition) => `${position.x},${position.y}`;
  const startKey = key(start); const endKey = key(end);
  if (hardBlocked.has(startKey) || hardBlocked.has(endKey) || transportBlocked.has(startKey) || (transportBlocked.has(endKey) && !options.allowEndTransportCell)) return null;
  const blocked = new Set([...hardBlocked, ...transportBlocked]);
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
  return path.reverse();
}
