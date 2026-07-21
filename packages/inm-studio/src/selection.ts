export type StudioSelection = { kind: "device" | "connection"; id: string };

export interface SelectableStudioScene {
  devices: Array<{ id: string }>;
  connections: Array<{ id: string; fromDevice: string; toDevice: string; endpointDevices?: string[] }>;
}

export function normalizeStudioSelection(scene: SelectableStudioScene, selection: StudioSelection | null): StudioSelection | null {
  if (!selection) return null;
  const collection = selection.kind === "device" ? scene.devices : scene.connections;
  return collection.some((item) => item.id === selection.id) ? selection : null;
}

export function selectStudioObject(current: StudioSelection | null, next: StudioSelection): StudioSelection | null {
  return current?.kind === next.kind && current.id === next.id ? null : next;
}

export function connectedSceneObjects(scene: SelectableStudioScene, deviceId: string): StudioSelection[] {
  return scene.connections
    .filter((connection) => connection.fromDevice === deviceId || connection.toDevice === deviceId || connection.endpointDevices?.includes(deviceId))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((connection) => ({ kind: "connection", id: connection.id }));
}
