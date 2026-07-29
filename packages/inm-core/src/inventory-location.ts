import type {
  BeltTransitPhase,
  BufferId,
  ConnectionId,
  DeviceInstanceId,
  ResourceId,
  WipInventoryLocationIdentity,
} from "./types";

function locationPart(value: string): string {
  return encodeURIComponent(value);
}

export function bufferInventoryLocation(
  resource: ResourceId,
  device: DeviceInstanceId,
  buffer: BufferId,
): WipInventoryLocationIdentity {
  return { kind: "buffer", resource, device, buffer };
}

export function inProcessInventoryLocation(
  resource: ResourceId,
  device: DeviceInstanceId,
  process: string,
): WipInventoryLocationIdentity {
  return { kind: "in-process", resource, device, process };
}

export function localTransitInventoryLocation(
  resource: ResourceId,
  connection: ConnectionId,
  phase: BeltTransitPhase,
): WipInventoryLocationIdentity {
  return { kind: "local-transit", resource, connection, phase };
}

export function stationTransitInventoryLocation(
  resource: ResourceId,
  network: string,
  route: string,
): WipInventoryLocationIdentity {
  return { kind: "station-transit", resource, network, route };
}

export function wipInventoryLocationId(location: WipInventoryLocationIdentity): string {
  const resource = locationPart(location.resource);
  if (location.kind === "buffer") {
    return `buffer:${locationPart(location.device)}:${locationPart(location.buffer)}:${resource}`;
  }
  if (location.kind === "in-process") {
    return `in-process:${locationPart(location.device)}:${locationPart(location.process)}:${resource}`;
  }
  if (location.kind === "local-transit") {
    return `local-transit:${locationPart(location.connection)}:${location.phase}:${resource}`;
  }
  return `station-transit:${locationPart(location.network)}:${locationPart(location.route)}:${resource}`;
}

export function describeWipInventoryLocation(location: WipInventoryLocationIdentity): string {
  if (location.kind === "buffer") return `${location.device}.${location.buffer}`;
  if (location.kind === "in-process") return `${location.device}.${location.process}`;
  if (location.kind === "local-transit") return `${location.connection}.${location.phase}`;
  return `${location.network}.${location.route}`;
}
