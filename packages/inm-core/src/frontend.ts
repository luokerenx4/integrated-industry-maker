import type {
  CompiledFactoryProject, DeviceStatus, FactoryEvent, FactoryMetrics, GridPosition, ResourceTransit,
} from "./types";

export interface FactorySceneModel {
  tick: number;
  bounds: { width: number; height: number };
  devices: Record<string, {
    assetId: string; position: GridPosition; rotation: number; footprint: { width: number; height: number };
    visual: Record<string, unknown>; runtimeStatus: DeviceStatus; progress?: number; bottleneck?: boolean;
  }>;
  resourcesInTransit: Array<{
    id: string; resourceId: string; count: number; from: GridPosition; to: GridPosition; progress: number; visual?: Record<string, unknown>;
  }>;
  connections: Array<{ id: string; from: GridPosition; to: GridPosition; kind: "physical" | "station"; blocked?: boolean }>;
  metrics: FactoryMetrics | null;
}

const center = (position: GridPosition, footprint: { width: number; height: number }): GridPosition => ({ x: position.x + footprint.width / 2, y: position.y + footprint.height / 2 });

export function createFactorySceneModel(project: CompiledFactoryProject, metrics: FactoryMetrics | null = null): FactorySceneModel {
  const devices = Object.fromEntries(Object.values(project.devices).map((device) => [device.id, {
    assetId: device.asset, position: { ...device.position }, rotation: device.rotation, footprint: { ...device.footprint },
    visual: { ...(device.assetDef.visual ?? {}) }, runtimeStatus: "idle" as DeviceStatus,
    ...(metrics?.bottleneckEntity === device.id ? { bottleneck: true } : {}),
  }]));
  const connections: FactorySceneModel["connections"] = [
    ...Object.values(project.connections).map((connection) => ({
      id: connection.id, from: center(connection.fromDevice.position, connection.fromDevice.footprint),
      to: center(connection.toDevice.position, connection.toDevice.footprint), kind: "physical" as const,
    })),
    ...Object.values(project.logisticsNetworks).flatMap((network) => network.routes.map((route) => ({
      id: route.id,
      from: center(project.devices[route.from]!.position, project.devices[route.from]!.footprint),
      to: center(project.devices[route.to]!.position, project.devices[route.to]!.footprint),
      kind: "station" as const,
    }))),
  ];
  return { tick: 0, bounds: { ...project.blueprint.bounds }, devices, resourcesInTransit: [], connections, metrics };
}

export function reduceFactoryEvent(model: FactorySceneModel, event: FactoryEvent, project: CompiledFactoryProject): FactorySceneModel {
  const next = structuredClone(model); next.tick = event.tick;
  if (event.type === "device.start") next.devices[event.device]!.runtimeStatus = "processing";
  else if (event.type === "device.finish" || event.type === "device.recover") next.devices[event.device]!.runtimeStatus = "idle";
  else if (event.type === "buffer.blocked") next.devices[event.device]!.runtimeStatus = "blocked-output";
  else if (event.type === "buffer.unblocked") next.devices[event.device]!.runtimeStatus = "idle";
  else if (event.type === "power.shortage") next.devices[event.device]!.runtimeStatus = "unpowered";
  else if (event.type === "device.breakdown") next.devices[event.device]!.runtimeStatus = "failed";
  else if (event.type === "resource.depart") {
    const connection = project.connections[event.connection]!;
    next.resourcesInTransit.push({
      id: event.transit.id, resourceId: event.transit.resource, count: event.transit.count,
      from: center(connection.fromDevice.position, connection.fromDevice.footprint), to: center(connection.toDevice.position, connection.toDevice.footprint),
      progress: 0, visual: { ...(project.resources[event.transit.resource]?.visual ?? {}) },
    });
  } else if (event.type === "logistics.depart") {
    const route = project.logisticsNetworks[event.network]!.routes.find((item) => item.id === event.route)!;
    next.resourcesInTransit.push({
      id: event.transit.id, resourceId: event.transit.resource, count: event.transit.count,
      from: center(project.devices[route.from]!.position, project.devices[route.from]!.footprint),
      to: center(project.devices[route.to]!.position, project.devices[route.to]!.footprint),
      progress: 0, visual: { ...(project.resources[event.transit.resource]?.visual ?? {}) },
    });
  } else if (event.type === "resource.arrive" || event.type === "logistics.arrive") next.resourcesInTransit = next.resourcesInTransit.filter((transit) => transit.id !== event.transit.id);
  for (const transit of next.resourcesInTransit) {
    const sourceEvent = model.resourcesInTransit.find((item) => item.id === transit.id);
    if (sourceEvent) transit.progress = sourceEvent.progress;
  }
  return next;
}

export function replayFactoryEvents(project: CompiledFactoryProject, events: FactoryEvent[], throughTick = Number.MAX_SAFE_INTEGER, metrics: FactoryMetrics | null = null): FactorySceneModel {
  let model = createFactorySceneModel(project, metrics);
  const departed = new Map<string, ResourceTransit>();
  for (const event of events) {
    if (event.tick > throughTick) break;
    model = reduceFactoryEvent(model, event, project);
    if (event.type === "resource.depart" || event.type === "logistics.depart") departed.set(event.transit.id, event.transit);
  }
  model.tick = Math.min(throughTick, events.at(-1)?.tick ?? 0);
  for (const transit of model.resourcesInTransit) {
    const timing = departed.get(transit.id);
    if (timing) transit.progress = Math.max(0, Math.min(1, (model.tick - timing.departTick) / Math.max(1, timing.arriveTick - timing.departTick)));
  }
  return model;
}
