import type {
  CompiledFactoryProject, DeviceStatus, FactoryEvent, FactoryMetrics, GridPosition, ResourceTransit,
} from "./types";

export interface FactorySceneModel {
  tick: number;
  bounds: { width: number; height: number };
  regions: Array<{ id: string; name: string; kind: string; bounds: { width: number; height: number }; offset: GridPosition }>;
  devices: Record<string, {
    assetId: string; region: string; position: GridPosition; rotation: number; footprint: { width: number; height: number };
    visual: Record<string, unknown>; runtimeStatus: DeviceStatus; progress?: number; bottleneck?: boolean;
  }>;
  resourcesInTransit: Array<{
    id: string; resourceId: string; count: number; treatmentLevel: number; from: GridPosition; to: GridPosition; path: GridPosition[]; position: GridPosition; progress: number; blocked?: boolean; visual?: Record<string, unknown>;
  }>;
  /** Active sorter work keyed by explicit endpoint Device; retained through failure/power pauses for deterministic replay. */
  transportStageJobs: Record<string, string[]>;
  connections: Array<{ id: string; from: GridPosition; to: GridPosition; path: GridPosition[]; kind: "physical" | "station"; blocked?: boolean }>;
  metrics: FactoryMetrics | null;
}

const center = (position: GridPosition, footprint: { width: number; height: number }): GridPosition => ({ x: position.x + footprint.width / 2, y: position.y + footprint.height / 2 });

function layoutRegions(project: CompiledFactoryProject): FactorySceneModel["regions"] {
  let x = 0;
  return project.world.regions.map((region) => {
    const layout = { id: region.id, name: region.name, kind: region.kind, bounds: { ...region.bounds }, offset: { x, y: 0 } };
    x += region.bounds.width + 8;
    return layout;
  });
}

export function createFactorySceneModel(project: CompiledFactoryProject, metrics: FactoryMetrics | null = null): FactorySceneModel {
  const regions = layoutRegions(project);
  const offsets = new Map(regions.map((region) => [region.id, region.offset]));
  const worldPosition = (device: CompiledFactoryProject["devices"][string]): GridPosition => {
    const offset = offsets.get(device.region)!;
    return { x: device.position.x + offset.x, y: device.position.y + offset.y };
  };
  const devices = Object.fromEntries(Object.values(project.devices).map((device) => [device.id, {
    assetId: device.asset, region: device.region, position: worldPosition(device), rotation: device.rotation, footprint: { ...device.footprint },
    visual: { ...(device.assetDef.visual ?? {}) }, runtimeStatus: "idle" as DeviceStatus,
    ...(metrics?.bottleneckEntity === device.id ? { bottleneck: true } : {}),
  }]));
  const connections: FactorySceneModel["connections"] = [
    ...Object.values(project.connections).map((connection) => ({
      id: connection.id, from: center(worldPosition(connection.fromDevice), connection.fromDevice.footprint),
      to: center(worldPosition(connection.toDevice), connection.toDevice.footprint),
      path: connection.path.map((cell) => ({ x: cell.x + offsets.get(connection.fromDevice.region)!.x + .5, y: cell.y + offsets.get(connection.fromDevice.region)!.y + .5, level: cell.level ?? 0 })), kind: "physical" as const,
    })),
    ...Object.values(project.logisticsNetworks).flatMap((network) => network.routes.map((route) => ({
      id: route.id,
      from: center(worldPosition(project.devices[route.from]!), project.devices[route.from]!.footprint),
      to: center(worldPosition(project.devices[route.to]!), project.devices[route.to]!.footprint),
      path: [],
      kind: "station" as const,
    }))),
  ];
  const bounds = {
    width: regions.reduce((max, region) => Math.max(max, region.offset.x + region.bounds.width), 0),
    height: regions.reduce((max, region) => Math.max(max, region.offset.y + region.bounds.height), 0),
  };
  const transportStageJobs = Object.fromEntries(Object.keys(devices).map((id) => [id, [] as string[]]));
  return { tick: 0, bounds, regions, devices, resourcesInTransit: [], transportStageJobs, connections, metrics };
}

export function reduceFactoryEvent(model: FactorySceneModel, event: FactoryEvent, project: CompiledFactoryProject): FactorySceneModel {
  const next = structuredClone(model); next.tick = event.tick;
  if (event.type === "device.start") next.devices[event.device]!.runtimeStatus = "processing";
  else if (event.type === "device.maintenance-start") next.devices[event.device]!.runtimeStatus = "processing";
  else if (event.type === "device.maintenance-finish") next.devices[event.device]!.runtimeStatus = "idle";
  else if (event.type === "device.finish") next.devices[event.device]!.runtimeStatus = "idle";
  else if (event.type === "device.recover") next.devices[event.device]!.runtimeStatus = next.transportStageJobs[event.device]?.length ? "processing" : "idle";
  else if (event.type === "buffer.blocked") next.devices[event.device]!.runtimeStatus = "blocked-output";
  else if (event.type === "buffer.unblocked") next.devices[event.device]!.runtimeStatus = "idle";
  else if (event.type === "power.shortage") next.devices[event.device]!.runtimeStatus = "unpowered";
  else if (event.type === "power.standby-restored") next.devices[event.device]!.runtimeStatus = "idle";
  else if (event.type === "power.restored") next.devices[event.device]!.runtimeStatus = "processing";
  else if (event.type === "device.breakdown") next.devices[event.device]!.runtimeStatus = "failed";
  else if (event.type === "transport.power-shortage") next.devices[event.device]!.runtimeStatus = "unpowered";
  else if (event.type === "transport.power-restored") next.devices[event.device]!.runtimeStatus = next.transportStageJobs[event.device]?.length ? "processing" : "idle";
  else if (event.type === "transport.stage-start") {
    const jobs = next.transportStageJobs[event.device] ??= [];
    if (!jobs.includes(event.transitId)) jobs.push(event.transitId);
    next.devices[event.device]!.runtimeStatus = "processing";
  } else if (event.type === "transport.stage-finish") {
    const jobs = next.transportStageJobs[event.device] ??= [];
    next.transportStageJobs[event.device] = jobs.filter((id) => id !== event.transitId);
    if (next.devices[event.device]!.runtimeStatus !== "failed" && next.devices[event.device]!.runtimeStatus !== "unpowered") {
      next.devices[event.device]!.runtimeStatus = next.transportStageJobs[event.device]!.length ? "processing" : "idle";
    }
  }
  else if (event.type === "resource.depart") {
    const connection = project.connections[event.connection]!;
    const from = next.devices[connection.from.device]!; const to = next.devices[connection.to.device]!;
    next.resourcesInTransit.push({
      id: event.transit.id, resourceId: event.transit.resource, count: event.transit.count, treatmentLevel: event.transit.treatmentLevel,
      from: center(from.position, from.footprint), to: center(to.position, to.footprint),
      path: next.connections.find((item) => item.id === event.connection)!.path,
      position: center(from.position, from.footprint), progress: 0, visual: { ...(project.resources[event.transit.resource]?.visual ?? {}) },
    });
  } else if (event.type === "logistics.depart") {
    const route = project.logisticsNetworks[event.network]!.routes.find((item) => item.id === event.route)!;
    const from = next.devices[route.from]!; const to = next.devices[route.to]!;
    next.resourcesInTransit.push({
      id: event.transit.id, resourceId: event.transit.resource, count: event.transit.count, treatmentLevel: event.transit.treatmentLevel,
      from: center(from.position, from.footprint),
      to: center(to.position, to.footprint),
      path: [],
      position: center(from.position, from.footprint), progress: 0, visual: { ...(project.resources[event.transit.resource]?.visual ?? {}) },
    });
  } else if (event.type === "resource.belt-position") {
    const transit = next.resourcesInTransit.find((item) => item.id === event.transit.id);
    if (transit) {
      transit.position = transit.path[event.cellIndex]!;
      transit.progress = (event.cellIndex + 1) / (transit.path.length + 1);
      transit.blocked = false;
    }
  } else if (event.type === "resource.belt-blocked") {
    const transit = next.resourcesInTransit.find((item) => item.id === event.transit.id);
    if (transit) transit.blocked = true;
  } else if (event.type === "resource.belt-unblocked") {
    const transit = next.resourcesInTransit.find((item) => item.id === event.transit.id);
    if (transit) transit.blocked = false;
  } else if (event.type === "resource.unload-start") {
    const transit = next.resourcesInTransit.find((item) => item.id === event.transit.id);
    if (transit) { transit.position = { ...transit.to }; transit.progress = 1; transit.blocked = false; }
  } else if (event.type === "resource.arrive" || event.type === "logistics.arrive") next.resourcesInTransit = next.resourcesInTransit.filter((transit) => transit.id !== event.transit.id);
  return next;
}

export function replayFactoryEvents(project: CompiledFactoryProject, events: FactoryEvent[], throughTick = Number.MAX_SAFE_INTEGER, metrics: FactoryMetrics | null = null): FactorySceneModel {
  let model = createFactorySceneModel(project, metrics);
  const departed = new Map<string, ResourceTransit>();
  for (const event of events) {
    if (event.tick > throughTick) break;
    model = reduceFactoryEvent(model, event, project);
    if (event.type === "logistics.depart") departed.set(event.transit.id, event.transit);
  }
  model.tick = Math.min(throughTick, events.at(-1)?.tick ?? 0);
  for (const transit of model.resourcesInTransit) {
    const timing = departed.get(transit.id);
    if (timing) {
      transit.progress = Math.max(0, Math.min(1, (model.tick - timing.departTick) / Math.max(1, timing.arriveTick - timing.departTick)));
      transit.position = { x: transit.from.x + (transit.to.x - transit.from.x) * transit.progress, y: transit.from.y + (transit.to.y - transit.from.y) * transit.progress };
    }
  }
  return model;
}
