import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { Billboard, Clone, Grid, Html, Line, OrbitControls, RoundedBox, Text, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import "./styles.css";

type Status = "idle" | "waiting-input" | "processing" | "blocked-output" | "unpowered" | "failed";
type AssetKind = "devices" | "resources" | "processes";

interface Visual {
  shape?: string;
  height?: number;
  color?: string | null;
  label?: string;
  texture?: string | null;
  model?: string | null;
  icon?: string | null;
}

interface ProjectSummary {
  id: string;
  name: string;
  isDefault: boolean;
  resourceAssets: number;
  deviceAssets: number;
  processes: number;
  deviceInstances: number;
  connections: number;
  logisticsNetworks: number;
  runs: number;
  regions: number;
  resourceNodes: number;
}

interface ProjectIndex {
  name: string;
  workspace: boolean;
  projects: ProjectSummary[];
}

interface Device {
  id: string;
  assetId: string;
  name: string;
  region: string;
  capabilities: string[];
  position: { x: number; y: number };
  rotation: number;
  footprint: { width: number; height: number };
  visual: Visual;
  recipe?: { process: string; inputs: Array<{ resource: string; buffer: string; count: number }>; outputs: Array<{ resource: string; buffer: string; count: number }> };
}

interface DeviceCatalogAsset {
  type: "device";
  id: string;
  name: string;
  description: string;
  tags: string[];
  capabilities: string[];
  geometry: {
    footprint: { width: number; height: number };
    rotatable: boolean;
    ports: Array<{ id: string; direction: "input" | "output"; side: string; buffer: string }>;
  };
  buffers: Array<{ id: string; role: string; capacity: number; accepts: string[] }>;
  production?: { categories: string[]; speed: { numerator: number; denominator: number }; inputBuffers: string[]; outputBuffers: string[] };
  extraction?: { resources: string[]; radius: number; outputBuffer: string; cycleTicks: number; itemsPerCycle: number };
  logistics?: { roles: Array<"loader" | "line" | "unloader" | "carrier">; carrierKinds?: Array<"planetary" | "interstellar"> };
  logisticsStation?: { networkKinds: Array<"planetary" | "interstellar">; buffer: string; slots: number };
  runtime: { apiVersion: 1; entry: string };
  power: {
    consumptionMilliWatts: number;
    generation?: { kind: "renewable"; outputMilliWatts: number } | { kind: "fuel"; outputMilliWatts: number; fuelBuffer: string; fuels: string[] };
    distribution?: { connectionRange: number; coverageRange: number };
  };
  economics: { buildCost: number };
  visual: Visual;
  contentHash: string;
  instanceCount: number;
  fleetCount: number;
}

interface ResourceCatalogAsset {
  type: "resource";
  id: string;
  name: string;
  description: string;
  tags: string[];
  unit: { kind: "discrete" | "continuous"; symbol: string; precision: number };
  transport: { stackSize: number };
  fuel?: { energyMilliJoules: number };
  visual: Visual;
  contentHash: string;
}

interface ProcessCatalogAsset {
  type: "process";
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  durationTicks: number;
  inputs: Array<{ resource: string; count: number }>;
  outputs: Array<{ resource: string; count: number }>;
  contentHash: string;
}

interface FactoryEvent {
  type: string;
  tick: number;
  device?: string;
  durationTicks?: number;
  resource?: string;
  node?: string;
  count?: number;
  remaining?: number;
  transit?: { id: string; resource: string; count: number; departTick: number; arriveTick: number };
  connection?: string;
  cell?: string | null;
  cellIndex?: number;
  waitingFor?: string;
  stage?: "loader" | "unloader";
  grid?: string | null;
  requiredMilliWatts?: number;
  availableMilliWatts?: number;
  network?: string;
  route?: string;
}

interface Metrics {
  finalScore: number;
  throughputPerMinute: number;
  energyConsumedMilliJoules: number;
  fuelConsumed: Record<string, number>;
  totalBuildCost: number;
  occupiedArea: number;
  averageWip: number;
  averageBeltItems: number;
  averageBlockedBeltItems: number;
  peakBeltItems: number;
  beltCellUtilization: number;
  transportStageUtilization: Record<string, { loader: number; unloader: number }>;
  transportFlows: Record<string, {
    departedItems: number; deliveredItems: number; departedByResource: Record<string, number>; deliveredByResource: Record<string, number>;
    departedItemsPerMinute: number; deliveredItemsPerMinute: number; capacityItemsPerMinute: number; utilization: number;
    averageInFlightItems: number; blockedItemTicks: number; blockedFraction: number;
  }>;
  transportEnergyConsumedMilliJoules: number;
  bottleneckEntity: string | null;
  consumed: Record<string, number>;
  extracted: Record<string, number>;
  resourceNodes: Record<string, { initial: number; remaining: number; reserved: number; extracted: number; depleted: boolean }>;
  scoreBreakdown: Record<string, number>;
}

interface IndustrialAnalysis {
  declarativeDevices: number;
  opaqueDevices: number;
  devices: Array<{
    device: string; asset: string; process: string; category: string; cycleTicks: number; cyclesPerMinute: number;
    inputsPerMinute: Record<string, number>; outputsPerMinute: Record<string, number>;
    inputBindings: Record<string, string>; outputBindings: Record<string, string>; powerMilliWatts: number;
  }>;
  recipeOptions: Array<{
    device: string; asset: string; process: string; name: string; category: string; selected: boolean;
    cycleTicks: number; cyclesPerMinute: number; inputs: Array<{ resource: string; count: number }>; outputs: Array<{ resource: string; count: number }>;
    inputBindings: Record<string, string>; outputBindings: Record<string, string>; targetOutputPerMinute: number;
  }>;
  productionGraph: {
    targetResource: string; rawInputsPerTarget: Record<string, number>;
    steps: Array<{ device: string; process: string; cyclesPerTarget: number }>;
    dependencies: Array<{ device: string; process: string; inputs: string[]; outputs: string[] }>;
  };
  extractionDevices: Array<{ device: string; asset: string; resource: string; nodes: string[]; cycleTicks: number; itemsPerCycle: number; itemsPerMinute: number; powerMilliWatts: number }>;
  generationDevices: Array<{ device: string; asset: string; region: string; kind: "renewable" | "fuel"; outputMilliWatts: number; fuelBuffer?: string; fuelResource?: string; fuelPerMinute?: number; burnTicks?: number }>;
  resourceNodes: Array<{ node: string; region: string; resource: string; amount: number; miners: string[]; nominalSharePerMinute: number; estimatedDepletionMinutes: number | null }>;
  resources: Array<{ resource: string; producedPerMinute: number; consumedPerMinute: number; netPerMinute: number; hasBoundarySupply: boolean; hasBoundaryDemand: boolean }>;
  connections: Array<{
    connection: string; from: string; to: string; capacityItemsPerMinute: number; travelTicks: number; dispatchIntervalTicks: number; pathCells: number; sharedCells: number;
    stages: Array<{ stage: "loader" | "line" | "unloader"; asset: string; capacity: number; durationTicks: number; powerMilliWatts: number; powerGrid?: string; position?: { x: number; y: number } }>;
  }>;
  transportCells: Array<{ cell: string; region: string; position: { x: number; y: number }; asset: string; connections: string[]; output: { kind: "cell"; cell: string } | { kind: "port"; device: string; port: string }; travelTicks: number; capacityItemsPerMinute: number }>;
  powerGrids: Array<{ grid: string; region: string; distributors: string[]; members: string[]; transportStages: Array<{ connection: string; stage: "loader" | "unloader" }>; generators: IndustrialAnalysis["generationDevices"]; productionMilliWatts: number; ratedConsumptionMilliWatts: number; headroomMilliWatts: number }>;
  stationNetworks: Array<{
    network: string; kind: "planetary" | "interstellar"; fleetAsset: string; fleetSize: number; stations: number; estimatedCarrierLoad: number;
    routes: Array<{ route: string; resource: string; from: string; to: string; fromRegion: string; toRegion: string; minimumBatch: number; batchCapacity: number; travelTicks: number; capacityItemsPerMinute: number }>;
  }>;
  diagnostics: Array<{ code: string; severity: "warning" | "info"; resource?: string; device?: string; connection?: string; message: string }>;
}

interface CapacityPlan {
  targetResource: string; targetRatePerMinute: number; scenarioMinutes: number; targetItemsForScenario: number; ready: boolean;
  processes: Array<{
    resource: string; process: string; asset: string; templateDevice: string; requiredOutputPerMinute: number; requiredCyclesPerMinute: number;
    inputsPerMinute: Record<string, number>; capacityPerMachine: number; configuredMachines: number; configuredCapacityPerMinute: number;
    requiredMachines: number; additionalMachines: number; region: string; powerMilliWattsPerMachine: number;
  }>;
  rawResources: Array<{
    resource: string; processDemandPerMinute: number; infrastructureDemandPerMinute: number; totalDemandPerMinute: number;
    configuredExtractors: number; configuredExtractionPerMinute: number; extractionDeficitPerMinute: number; additionalExtractors: number;
    finiteReserve: number; lifetimeMinutes: number | null; scenarioDemand: number; reserveAfterScenario: number;
  }>;
  transport: Array<{ direction: "input" | "output"; process: string; resource: string; devices: string[]; connections: string[]; requiredItemsPerMinute: number; configuredCapacityPerMinute: number; capacityDeficitPerMinute: number }>;
  stationNetworks: Array<{ network: string; resource: string; routes: string[]; requiredItemsPerMinute: number; perCarrierItemsPerMinute: number; requiredCarriers: number; configuredCarriers: number; additionalCarriers: number }>;
  power: Array<{ region: string; requiredMilliWatts: number; configuredGenerationMilliWatts: number; headroomMilliWatts: number }>;
  gaps: Array<{ kind: string; entity: string; message: string }>;
}

interface StudioData {
  projectId: string;
  name: string;
  blueprintHash: string;
  bounds: { width: number; height: number };
  regions: Array<{
    id: string; name: string; kind: "site" | "planet" | "orbit";
    coordinates: { x: number; y: number; z: number };
    bounds: { width: number; height: number };
    offset: { x: number; y: number };
  }>;
  resourceNodes: Array<{ id: string; region: string; resource: string; amount: number; remaining: number; position: { x: number; y: number } }>;
  devices: Device[];
  connections: Array<{
    id: string;
    fromDevice: string;
    toDevice: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    points: Array<{ x: number; y: number }>;
    endpoints: Array<{ stage: "loader" | "unloader"; asset: string; from: { x: number; y: number }; to: { x: number; y: number }; position: { x: number; y: number }; powerMilliWatts: number; powerGrid: string | null }>;
  }>;
  logisticsRoutes: Array<{
    id: string; network: string; resource: string; fromDevice: string; toDevice: string;
    from: { x: number; y: number }; to: { x: number; y: number };
  }>;
  resources: Record<string, { visual?: Visual }>;
  analysis: IndustrialAnalysis;
  capacityPlan: CapacityPlan;
  assets: { devices: DeviceCatalogAsset[]; resources: ResourceCatalogAsset[]; processes: ProcessCatalogAsset[] };
  events: FactoryEvent[];
  metrics: Metrics | null;
  selectedRun: string | null;
  runs: Array<{ name: string; score: number; decision: string; resultHash: string }>;
}

interface DeviceFrame { status: Status; progress: number }
interface TransitFrame { id: string; material: string; progress: number; path: string; kind: "belt" | "station"; position?: { x: number; y: number }; blocked?: boolean }

const STATUS_COLORS: Record<Status, string> = {
  idle: "#64748b",
  "waiting-input": "#818cf8",
  processing: "#22d3a7",
  "blocked-output": "#f59e0b",
  unpowered: "#a855f7",
  failed: "#ef4444",
};
const STATUS_LABELS: Record<Status, string> = {
  idle: "IDLE",
  "waiting-input": "WAITING",
  processing: "RUNNING",
  "blocked-output": "BLOCKED",
  unpowered: "NO POWER",
  failed: "FAILED",
};

const formatTick = (tick: number) => `${(tick / 1000).toFixed(1)}s`;
const projectPath = (projectId: string) => `/${encodeURIComponent(projectId)}`;
const fileUrl = (projectId: string, path: string) => `/api/projects/${encodeURIComponent(projectId)}/files/${path.split("/").map(encodeURIComponent).join("/")}`;

function routeProjectId(): string | null {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  try { return decodeURIComponent(segments[0]!); }
  catch { return null; }
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status})`);
  return value;
}

function buildFrame(data: StudioData, tick: number): { devices: Record<string, DeviceFrame>; transits: TransitFrame[]; endpointPower: Record<string, boolean>; visibleEvents: FactoryEvent[] } {
  const devices = Object.fromEntries(data.devices.map((device) => [device.id, { status: "idle" as Status, progress: 0 }]));
  const endpointPower = Object.fromEntries(data.connections.flatMap((connection) => connection.endpoints.map((endpoint) => [`${connection.id}:${endpoint.stage}`, Boolean(endpoint.powerGrid)])));
  const starts = new Map<string, number>();
  const transits = new Map<string, TransitFrame>();
  const visibleEvents: FactoryEvent[] = [];
  for (const event of data.events) {
    if (event.tick > tick) break;
    visibleEvents.push(event);
    if (event.device && event.type === "device.start") {
      devices[event.device] = { status: "processing", progress: 0 };
      starts.set(event.device, event.tick);
    } else if (event.device && (event.type === "device.finish" || event.type === "device.recover" || event.type === "buffer.unblocked")) {
      devices[event.device] = { status: "idle", progress: 0 };
      starts.delete(event.device);
    } else if (event.device && event.type === "buffer.blocked") devices[event.device] = { status: "blocked-output", progress: 0 };
    else if (event.device && event.type === "power.shortage") devices[event.device] = { status: "unpowered", progress: 0 };
    else if (event.device && event.type === "device.breakdown") devices[event.device] = { status: "failed", progress: 0 };
    else if (event.type === "transport.power-shortage" && event.connection && event.stage) endpointPower[`${event.connection}:${event.stage}`] = false;
    else if (event.type === "transport.power-restored" && event.connection && event.stage) endpointPower[`${event.connection}:${event.stage}`] = true;
    else if (event.type === "resource.depart" && event.transit && event.connection) {
      const connection = data.connections.find((item) => item.id === event.connection)!;
      transits.set(event.transit.id, { id: event.transit.id, material: event.transit.resource, progress: 0, path: event.connection, kind: "belt", position: connection.points[0] });
    } else if (event.type === "resource.belt-position" && event.transit && event.connection && event.cellIndex !== undefined) {
      const transit = transits.get(event.transit.id); const connection = data.connections.find((item) => item.id === event.connection);
      if (transit && connection) { transit.position = connection.points[event.cellIndex + 1]; transit.progress = (event.cellIndex + 1) / (connection.points.length - 1); transit.blocked = false; }
    } else if (event.type === "resource.belt-blocked" && event.transit) {
      const transit = transits.get(event.transit.id); if (transit) transit.blocked = true;
    } else if (event.type === "resource.belt-unblocked" && event.transit) {
      const transit = transits.get(event.transit.id); if (transit) transit.blocked = false;
    } else if (event.type === "resource.unload-start" && event.transit && event.connection) {
      const transit = transits.get(event.transit.id); const connection = data.connections.find((item) => item.id === event.connection);
      if (transit && connection) { transit.position = connection.points.at(-1); transit.progress = 1; transit.blocked = false; }
    } else if (event.type === "resource.arrive" && event.transit) transits.delete(event.transit.id);
    else if (event.type === "logistics.depart" && event.transit && event.route) {
      transits.set(event.transit.id, { id: event.transit.id, material: event.transit.resource, progress: 0, path: event.route, kind: "station" });
    } else if (event.type === "logistics.arrive" && event.transit) transits.delete(event.transit.id);
  }
  for (const device of data.devices) {
    const start = starts.get(device.id);
    const startEvent = data.events.findLast((event) => event.type === "device.start" && event.device === device.id && event.tick <= tick);
    if (start !== undefined && devices[device.id]?.status === "processing") {
      devices[device.id]!.progress = Math.min(1, (tick - start) / Math.max(1, startEvent?.durationTicks ?? 1));
    }
  }
  for (const transit of transits.values()) {
    if (transit.kind === "station") {
      const depart = data.events.findLast((event) => event.type === "logistics.depart" && event.transit?.id === transit.id)?.transit;
      if (depart) transit.progress = Math.max(0, Math.min(1, (tick - depart.departTick) / Math.max(1, depart.arriveTick - depart.departTick)));
    }
  }
  return { devices, transits: [...transits.values()], endpointPower, visibleEvents };
}

function pointAlongPath(points: Array<{ x: number; y: number }>, progress: number): { x: number; y: number } {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const ratio = length ? remaining / length : 0;
      return { x: THREE.MathUtils.lerp(points[index]!.x, points[index + 1]!.x, ratio), y: THREE.MathUtils.lerp(points[index]!.y, points[index + 1]!.y, ratio) };
    }
    remaining -= length;
  }
  return points.at(-1)!;
}

function FactoryTexture({ projectId, path, color, processing }: { projectId: string; path: string; color: string; processing: boolean }) {
  const texture = useTexture(fileUrl(projectId, path));
  texture.colorSpace = THREE.SRGBColorSpace;
  return <meshStandardMaterial map={texture} color={color} metalness={.32} roughness={.48} emissive={color} emissiveIntensity={processing ? .16 : .02} />;
}

function PrimitiveMaterial({ projectId, texture, color, processing }: { projectId: string; texture?: string | null; color: string; processing: boolean }) {
  return texture
    ? <FactoryTexture projectId={projectId} path={texture} color={color} processing={processing} />
    : <meshStandardMaterial color={color} metalness={.45} roughness={.38} emissive={color} emissiveIntensity={processing ? .22 : .03} />;
}

function FactoryModel({ projectId, path, footprint, height }: { projectId: string; path: string; footprint: Device["footprint"]; height: number }) {
  const gltf = useGLTF(fileUrl(projectId, path));
  const scale = Math.min(footprint.width, footprint.height, height);
  return <Clone object={gltf.scene} scale={scale} castShadow receiveShadow />;
}

function DeviceBody({ projectId, device, height, color, processing }: { projectId: string; device: Device; height: number; color: string; processing: boolean }) {
  if (device.visual.model) return <FactoryModel projectId={projectId} path={device.visual.model} footprint={device.footprint} height={height} />;
  const material = <PrimitiveMaterial projectId={projectId} texture={device.visual.texture} color={color} processing={processing} />;
  if (device.visual.shape === "cylinder") return <mesh castShadow receiveShadow><cylinderGeometry args={[device.footprint.width * .42, device.footprint.width * .48, height, 32]} />{material}</mesh>;
  if (device.visual.shape === "sphere") return <mesh castShadow receiveShadow><sphereGeometry args={[Math.min(device.footprint.width, device.footprint.height, height) * .48, 32, 24]} />{material}</mesh>;
  if (device.visual.shape === "plane") return <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow><boxGeometry args={[device.footprint.width * .88, device.footprint.height * .88, .12]} />{material}</mesh>;
  return <RoundedBox args={[device.footprint.width * .88, height, device.footprint.height * .88]} radius={.12} smoothness={4} castShadow receiveShadow>{material}</RoundedBox>;
}

function FactoryDevice({ projectId, device, frame, bottleneck }: { projectId: string; device: Device; frame: DeviceFrame; bottleneck: boolean }) {
  const height = device.visual.height ?? 1.25;
  const baseColor = device.visual.color ?? "#475569";
  const color = frame.status === "idle" ? baseColor : STATUS_COLORS[frame.status];
  const position: [number, number, number] = [device.position.x + device.footprint.width / 2, height / 2, device.position.y + device.footprint.height / 2];
  return <group position={position} rotation={[0, -device.rotation * Math.PI / 180, 0]}>
    {bottleneck && <mesh position={[0, .03 - height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[Math.max(device.footprint.width, device.footprint.height) * .7, Math.max(device.footprint.width, device.footprint.height) * .88, 48]} /><meshBasicMaterial color="#ffcf5c" transparent opacity={.8} /></mesh>}
    <DeviceBody projectId={projectId} device={device} height={height} color={color} processing={frame.status === "processing"} />
    <mesh position={[0, height / 2 + .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[device.footprint.width * .65 * frame.progress, .08]} /><meshBasicMaterial color="#d8fff4" /></mesh>
    <Billboard position={[0, height / 2 + .55, 0]}><Text fontSize={.28} color="#eef9ff" anchorY="bottom" outlineWidth={.015} outlineColor="#071117">{device.visual.label ?? device.name}</Text><Text position={[0, -.24, 0]} fontSize={.13} color={STATUS_COLORS[frame.status]}>{STATUS_LABELS[frame.status]}</Text>{device.recipe && <Text position={[0, -.42, 0]} fontSize={.1} color="#9dd9d0">{device.recipe.process}</Text>}</Billboard>
  </group>;
}

function ResourceDeposit({ data, node, remaining }: { data: StudioData; node: StudioData["resourceNodes"][number]; remaining: number }) {
  const fraction = remaining / node.amount;
  const color = data.resources[node.resource]?.visual?.color ?? "#a8784f";
  const scale = .18 + .48 * Math.cbrt(Math.max(0, fraction));
  return <group position={[node.position.x + .5, scale * .55, node.position.y + .5]}>
    <mesh scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={remaining ? .08 : 0} roughness={.72} metalness={.34} transparent opacity={remaining ? .95 : .18} />
    </mesh>
    <Billboard position={[0, scale + .25, 0]}><Text fontSize={.15} color={remaining ? "#d9edf0" : "#6d7d80"}>{node.id} · {remaining}/{node.amount}</Text></Billboard>
  </group>;
}

function FactoryWorld({ data, tick }: { data: StudioData; tick: number }) {
  const frame = useMemo(() => buildFrame(data, tick), [data, tick]);
  const nodeRemaining = useMemo(() => {
    const remaining = Object.fromEntries(data.resourceNodes.map((node) => [node.id, node.amount]));
    for (const event of data.events) if (event.tick <= tick && event.type === "resource.extracted" && event.node && event.count) remaining[event.node] = Math.max(0, remaining[event.node]! - event.count);
    return remaining;
  }, [data, tick]);
  return <>
    <color attach="background" args={["#071014"]} />
    <fog attach="fog" args={["#071014", 30, 72]} />
    <hemisphereLight args={["#bcecff", "#102026", 1.15]} />
    <directionalLight position={[12, 24, 8]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} />
    {data.regions.map((region) => <group key={region.id}>
      <Grid args={[region.bounds.width, region.bounds.height]} position={[region.offset.x + region.bounds.width / 2, 0, region.offset.y + region.bounds.height / 2]} cellSize={1} cellThickness={.55} cellColor="#24414a" sectionSize={4} sectionThickness={1.1} sectionColor={region.kind === "planet" ? "#397080" : "#67578a"} fadeDistance={70} infiniteGrid={false} />
      <mesh position={[region.offset.x + region.bounds.width / 2, -.04, region.offset.y + region.bounds.height / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[region.bounds.width, region.bounds.height]} /><meshStandardMaterial color={region.kind === "planet" ? "#0b1a20" : "#151525"} roughness={.92} metalness={.08} /></mesh>
      <Billboard position={[region.offset.x + 1, .75, region.offset.y + 1]}><Text fontSize={.38} color="#9edce7" anchorX="left" anchorY="bottom" outlineWidth={.02} outlineColor="#071014">{region.name.toUpperCase()}</Text><Text position={[0, -.28, 0]} fontSize={.14} color="#5f8992" anchorX="left">{region.kind.toUpperCase()} · {region.id}</Text></Billboard>
    </group>)}
    {data.resourceNodes.map((node) => <ResourceDeposit key={node.id} data={data} node={node} remaining={nodeRemaining[node.id] ?? node.amount} />)}
    {data.connections.map((connection) => <Line key={connection.id} points={connection.points.map((point) => [point.x, .16, point.y])} color="#4f7680" lineWidth={3} transparent opacity={.9} />)}
    {data.connections.flatMap((connection) => connection.endpoints.map((endpoint) => { const powered = frame.endpointPower[`${connection.id}:${endpoint.stage}`]; return <group key={`${connection.id}-${endpoint.stage}`}>
      <Line points={[[endpoint.from.x, .28, endpoint.from.y], [endpoint.to.x, .28, endpoint.to.y]]} color={powered ? endpoint.stage === "loader" ? "#f5b84b" : "#5dd7ff" : "#ff5d68"} lineWidth={2.5} />
      <mesh position={[endpoint.position.x, .3, endpoint.position.y]} rotation={[0, Math.atan2(endpoint.to.x - endpoint.from.x, endpoint.to.y - endpoint.from.y), 0]} castShadow>
        <boxGeometry args={[.16, .16, .48]} /><meshStandardMaterial color={powered ? endpoint.stage === "loader" ? "#f5b84b" : "#5dd7ff" : "#ff5d68"} metalness={.65} roughness={.28} emissiveIntensity={powered ? .35 : 1} emissive={powered ? endpoint.stage === "loader" ? "#7d4a08" : "#0d607b" : "#8b1420"} />
      </mesh>
    </group>; }))}
    {data.logisticsRoutes.map((route) => <Line key={route.id} points={[[route.from.x, .32, route.from.y], [route.to.x, .32, route.to.y]]} color="#55c9df" lineWidth={1.5} dashed dashScale={2.4} dashSize={.45} gapSize={.28} transparent opacity={.7} />)}
    {data.devices.map((device) => <FactoryDevice key={device.id} projectId={data.projectId} device={device} frame={frame.devices[device.id] ?? { status: "idle", progress: 0 }} bottleneck={data.metrics?.bottleneckEntity === device.id} />)}
    {frame.transits.map((transit) => {
      const connection = [...data.connections, ...data.logisticsRoutes].find((item) => item.id === transit.path)!;
      const position = transit.position ?? ("points" in connection ? pointAlongPath(connection.points, transit.progress) : pointAlongPath([connection.from, connection.to], transit.progress));
      const x = position.x;
      const z = position.y;
      const resource = data.resources[transit.material];
      const color = resource?.visual?.color ?? "#d7f3ff";
      return <mesh key={transit.id} position={[x, transit.blocked ? .52 : .42, z]} castShadow>
        {resource?.visual?.shape === "box" ? <boxGeometry args={[.28, .28, .28]} /> : resource?.visual?.shape === "cylinder" ? <cylinderGeometry args={[.17, .17, .22, 16]} /> : <sphereGeometry args={[.16, 16, 16]} />}
        {resource?.visual?.texture ? <FactoryTexture projectId={data.projectId} path={resource.visual.texture} color={color} processing /> : <meshStandardMaterial color={color} emissive={transit.blocked ? "#ff7b49" : color} emissiveIntensity={transit.blocked ? 1.2 : .55} />}
      </mesh>;
    })}
    <OrbitControls makeDefault target={[data.bounds.width / 2, 0, data.bounds.height / 2]} minDistance={8} maxDistance={70} maxPolarAngle={Math.PI * .47} />
  </>;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function AssetGlyph({ projectId, asset }: { projectId: string; asset: DeviceCatalogAsset | ResourceCatalogAsset | ProcessCatalogAsset }) {
  if (asset.type === "process") return <span className="asset-glyph process">ƒ</span>;
  if (asset.visual.icon) return <img className="asset-icon-image" src={fileUrl(projectId, asset.visual.icon)} alt="" />;
  return <span className={`asset-glyph ${asset.visual.shape ?? "box"}`} style={{ "--asset-color": asset.visual.color ?? "#4f7f86" } as React.CSSProperties} />;
}

function AssetBrowser({ data, onClose }: { data: StudioData; onClose: () => void }) {
  const [kind, setKind] = useState<AssetKind>("devices");
  const items: Array<DeviceCatalogAsset | ResourceCatalogAsset | ProcessCatalogAsset> = kind === "devices" ? data.assets.devices : kind === "resources" ? data.assets.resources : data.assets.processes;
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const selected = items.find((asset) => asset.id === selectedId) ?? items[0];

  useEffect(() => { setSelectedId(items[0]?.id ?? ""); }, [kind]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="asset-browser" role="dialog" aria-modal="true" aria-label="Project assets">
      <header className="asset-browser-header">
        <div><span className="eyebrow">PROJECT CATALOG</span><h2>{data.name}</h2><p>Self-contained · {data.assets.devices.length} devices · {data.assets.resources.length} resources · {data.assets.processes.length} processes</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close asset browser">×</button>
      </header>
      <div className="asset-browser-body">
        <nav className="asset-kinds" aria-label="Asset categories">
          <button className={kind === "devices" ? "active" : ""} onClick={() => setKind("devices")}><span>DEVICE</span><b>{data.assets.devices.length}</b></button>
          <button className={kind === "resources" ? "active" : ""} onClick={() => setKind("resources")}><span>RESOURCE</span><b>{data.assets.resources.length}</b></button>
          <button className={kind === "processes" ? "active" : ""} onClick={() => setKind("processes")}><span>PROCESS</span><b>{data.assets.processes.length}</b></button>
        </nav>
        <div className="asset-list" role="listbox" aria-label={kind}>
          <div className="asset-list-title">{kind.toUpperCase()} <span>{items.length}</span></div>
          {items.map((asset) => <button key={asset.id} role="option" aria-selected={selected?.id === asset.id} className={selected?.id === asset.id ? "selected" : ""} onClick={() => setSelectedId(asset.id)}>
            <AssetGlyph projectId={data.projectId} asset={asset} />
            <span><strong>{asset.name}</strong><small>{asset.id}</small></span>
            {asset.type === "device" && <em>{asset.fleetCount ? `${asset.fleetCount} fleet` : `${asset.instanceCount}×`}</em>}
          </button>)}
        </div>
        <article className="asset-detail">
          {selected && <>
            <div className="asset-hero"><AssetGlyph projectId={data.projectId} asset={selected} /><div><span className="asset-type">{selected.type}</span><h3>{selected.name}</h3><code>{selected.id}</code></div></div>
            <p className="asset-description">{selected.description}</p>
            <div className="tag-row">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            {selected.type === "device" ? <>
              <div className="detail-grid">
                <div><label>FOOTPRINT</label><strong>{selected.geometry.footprint.width} × {selected.geometry.footprint.height}</strong></div>
                <div><label>PLACED</label><strong>{selected.instanceCount}</strong></div>
                {selected.fleetCount > 0 && <div><label>FLEET UNITS</label><strong>{selected.fleetCount}</strong></div>}
                <div><label>BUILD COST</label><strong>{selected.economics.buildCost.toLocaleString()}</strong></div>
                <div><label>POWER</label><strong>{(selected.power.consumptionMilliWatts / 1000).toFixed(0)} W</strong></div>
              </div>
              <section className="asset-section"><h4>Capabilities</h4><div className="capability-row">{selected.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></section>
              {selected.production && <section className="asset-section"><h4>Recipe support</h4><div className="asset-table"><div><b>{selected.production.categories.join(", ")}</b><strong>{selected.production.inputBuffers.join(" + ")} → {selected.production.outputBuffers.join(" + ")}</strong><span>speed</span><code>{selected.production.speed.numerator}/{selected.production.speed.denominator}×</code></div></div></section>}
              {selected.extraction && <section className="asset-section"><h4>Extraction</h4><div className="asset-table"><div><b>{selected.extraction.resources.join(", ")}</b><strong>{selected.extraction.itemsPerCycle} / {selected.extraction.cycleTicks}ms</strong><span>radius</span><code>{selected.extraction.radius} cells</code></div></div></section>}
              {selected.logistics && <section className="asset-section"><h4>Logistics roles</h4><div className="capability-row">{selected.logistics.roles.map((role) => <span key={role}>{role}</span>)}</div></section>}
              {selected.logistics?.carrierKinds && <section className="asset-section"><h4>Carrier networks</h4><div className="capability-row">{selected.logistics.carrierKinds.map((kind) => <span key={kind}>{kind}</span>)}</div></section>}
              {selected.logisticsStation && <section className="asset-section"><h4>Station specification</h4><div className="asset-table"><div><b>{selected.logisticsStation.networkKinds.join(", ")}</b><strong>{selected.logisticsStation.slots} slots</strong><span>buffer</span><code>{selected.logisticsStation.buffer}</code></div></div></section>}
              {selected.power.generation && <section className="asset-section"><h4>Power generation</h4><div className="asset-table"><div><b>{selected.power.generation.kind}</b><strong>{(selected.power.generation.outputMilliWatts / 1000).toFixed(0)} W</strong><span>{selected.power.generation.kind === "fuel" ? selected.power.generation.fuels.join(", ") : "continuous"}</span><code>{selected.power.generation.kind === "fuel" ? selected.power.generation.fuelBuffer : "renewable"}</code></div></div></section>}
              {selected.power.distribution && <section className="asset-section"><h4>Power distribution</h4><div className="asset-table"><div><b>grid reach</b><strong>{selected.power.distribution.connectionRange} cells</strong><span>coverage</span><code>{selected.power.distribution.coverageRange} cells</code></div></div></section>}
              <section className="asset-section"><h4>Ports</h4><div className="asset-table">{selected.geometry.ports.map((port) => <div key={port.id}><b className={port.direction}>{port.direction === "input" ? "IN" : "OUT"}</b><strong>{port.id}</strong><span>{port.side}</span><code>{port.buffer}</code></div>)}</div></section>
              <section className="asset-section"><h4>Buffers</h4><div className="asset-table">{selected.buffers.map((buffer) => <div key={buffer.id}><b>{buffer.role}</b><strong>{buffer.id}</strong><span>cap {buffer.capacity}</span><code>{buffer.accepts.join(", ")}</code></div>)}</div></section>
              <section className="asset-section compact"><h4>Runtime</h4><code>{selected.runtime.entry}</code></section>
            </> : selected.type === "resource" ? <>
              <div className="detail-grid">
                <div><label>UNIT</label><strong>{selected.unit.symbol}</strong></div>
                <div><label>KIND</label><strong>{selected.unit.kind}</strong></div>
                <div><label>PRECISION</label><strong>{selected.unit.precision}</strong></div>
                <div><label>STACK SIZE</label><strong>{selected.transport.stackSize}</strong></div>
                {selected.fuel && <div><label>FUEL ENERGY</label><strong>{(selected.fuel.energyMilliJoules / 1e6).toFixed(1)} MJ</strong></div>}
              </div>
              <section className="asset-section"><h4>Presentation</h4><div className="asset-table"><div><b>shape</b><strong>{selected.visual.shape}</strong><span>color</span><code>{selected.visual.color ?? "default"}</code></div></div></section>
            </> : <>
              <div className="detail-grid">
                <div><label>CATEGORY</label><strong>{selected.category}</strong></div>
                <div><label>CYCLE</label><strong>{(selected.durationTicks / 1000).toFixed(2)} s</strong></div>
                <div><label>INPUT STREAMS</label><strong>{selected.inputs.length}</strong></div>
                <div><label>OUTPUT STREAMS</label><strong>{selected.outputs.length}</strong></div>
              </div>
              <section className="asset-section"><h4>Material transformation</h4><div className="process-flow"><div><label>INPUT</label>{selected.inputs.map((amount) => <span key={amount.resource}><b>{amount.count}×</b> {amount.resource}</span>)}</div><i>→</i><div><label>OUTPUT</label>{selected.outputs.map((amount) => <span key={amount.resource}><b>{amount.count}×</b> {amount.resource}</span>)}</div></div></section>
            </>}
            <div className="asset-hash"><label>CONTENT HASH</label><code>{selected.contentHash}</code></div>
          </>}
        </article>
      </div>
    </section>
  </div>;
}

function AnalysisBrowser({ data, onClose }: { data: StudioData; onClose: () => void }) {
  const analysis = data.analysis;
  const plan = data.capacityPlan;
  const warningCount = analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="analysis-browser" role="dialog" aria-modal="true" aria-label="Industrial analysis">
      <header className="analysis-header">
        <div><span className="eyebrow">COMPILED INDUSTRIAL MODEL</span><h2>{data.name}</h2><p>Nominal design envelope + measured selected-run flow</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close industrial analysis">×</button>
      </header>
      <div className="analysis-summary">
        <Metric label="DECLARATIVE DEVICES" value={String(analysis.declarativeDevices)} accent />
        <Metric label="MATERIAL STREAMS" value={String(analysis.resources.length)} />
        <Metric label="LOGISTICS LINKS" value={String(analysis.connections.length)} />
        <Metric label="STATION NETS" value={String(analysis.stationNetworks.length)} />
        <Metric label="POWER GRIDS" value={String(analysis.powerGrids.length)} />
        <Metric label="WARNINGS" value={String(warningCount)} />
      </div>
      <div className="analysis-body">
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>TARGET-RATE CAPACITY PLAN</span><b>{plan.ready ? "READY" : `${plan.gaps.length} GAPS`} · {plan.targetRatePerMinute.toFixed(2)} {plan.targetResource.toUpperCase()}/MIN</b></div>
          <div className="pipeline-list">{plan.processes.map((process) => <div className="pipeline-card" key={`${process.process}-${process.resource}`}>
            <div className="pipeline-head"><span><strong>{process.process}</strong><small>{process.region} · {process.asset} · {Object.entries(process.inputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")} → {process.requiredOutputPerMinute.toFixed(2)} {process.resource}/min</small></span><b>{process.configuredMachines} / {process.requiredMachines} MACHINES</b></div>
            <footer><span>CAPACITY {process.configuredCapacityPerMinute.toFixed(2)} / {process.requiredOutputPerMinute.toFixed(2)}/MIN</span><span>{process.additionalMachines ? `ADD ${process.additionalMachines} ${process.asset.toUpperCase()}` : "CAPACITY READY"}</span><span>{(process.powerMilliWattsPerMachine / 1000).toFixed(0)} W / MACHINE</span></footer>
          </div>)}</div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>RAW RESOURCE</span><span>NEED / MIN</span><span>EXTRACTION</span><span>RESERVE AFTER RUN</span></div>{plan.rawResources.map((resource) => <div key={resource.resource}>
            <strong>{resource.resource}</strong><span>{resource.totalDemandPerMinute.toFixed(3)}</span><span>{resource.configuredExtractionPerMinute.toFixed(3)}</span><b className={resource.reserveAfterScenario < 0 ? "negative" : "positive"}>{resource.reserveAfterScenario.toFixed(3)}</b><small>{resource.lifetimeMinutes === null ? "∞" : `${resource.lifetimeMinutes.toFixed(2)} min lifetime`}</small>
          </div>)}</div>
          <div className="diagnostic-list">{plan.gaps.length ? plan.gaps.map((gap) => <div className="warning" key={`${gap.kind}-${gap.entity}`}><i>!</i><span><code>{gap.kind}</code><p>{gap.message}</p></span></div>) : <div className="diagnostics-clear"><i>✓</i><span>TARGET RATE IS FULLY PROVISIONED</span></div>}</div>
        </section>
        <section className="analysis-section material-analysis">
          <div className="analysis-section-title"><span>FINITE RESOURCE NODES</span><b>WORLD INPUT</b></div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>NODE</span><span>AMOUNT</span><span>MINERS</span><span>DEPLETION</span></div>{analysis.resourceNodes.map((node) => <div key={node.node}>
            <strong>{node.node}</strong><span>{node.amount} {node.resource}</span><span>{node.miners.join(", ") || "none"}</span><b>{node.estimatedDepletionMinutes === null ? "—" : `${node.estimatedDepletionMinutes.toFixed(2)}m`}</b><small>{node.region}</small>
          </div>)}</div>
        </section>
        <section className="analysis-section material-analysis">
          <div className="analysis-section-title"><span>MATERIAL BALANCE</span><b>ITEMS / MIN</b></div>
          <div className="analysis-table analysis-material-table"><div className="analysis-table-head"><span>RESOURCE</span><span>PRODUCE</span><span>CONSUME</span><span>NET</span></div>{analysis.resources.map((resource) => <div key={resource.resource}>
            <strong>{resource.resource}</strong><span>{resource.producedPerMinute.toFixed(3)}</span><span>{resource.consumedPerMinute.toFixed(3)}</span><b className={resource.netPerMinute < 0 ? "negative" : resource.netPerMinute > 0 ? "positive" : ""}>{resource.netPerMinute.toFixed(3)}</b>
            <small>{resource.hasBoundarySupply ? "SUPPLY" : ""}{resource.hasBoundarySupply && resource.hasBoundaryDemand ? " · " : ""}{resource.hasBoundaryDemand ? "DEMAND" : ""}</small>
          </div>)}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>CONFIGURED RECIPES</span><b>RESOURCE → BUFFER</b></div>
          <div className="pipeline-list">{analysis.devices.map((device) => <div className="pipeline-card" key={device.device}>
            <div className="pipeline-head"><span><strong>{device.device}</strong><small>{device.asset} · {device.process}</small></span><b>{device.cyclesPerMinute.toFixed(2)} cycles/min</b></div>
            <div className="pipeline-stages"><span><small>inputs</small><strong>{Object.entries(device.inputBindings).map(([resource, buffer]) => `${resource} → ${buffer}`).join(" + ") || "none"}</strong><code>{Object.entries(device.inputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")}</code></span><i>⇒</i><span><small>outputs</small><strong>{Object.entries(device.outputBindings).map(([resource, buffer]) => `${resource} → ${buffer}`).join(" + ")}</strong><code>{Object.entries(device.outputsPerMinute).map(([resource, rate]) => `${rate.toFixed(2)} ${resource}/min`).join(" + ")}</code></span></div>
            <footer><span>CYCLE {device.cycleTicks}ms</span><span>{(device.powerMilliWatts / 1000).toFixed(0)} W</span></footer>
          </div>)}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>PRODUCTION GRAPH</span><b>PER 1 {analysis.productionGraph.targetResource.toUpperCase()}</b></div>
          <div className="pipeline-list"><div className="pipeline-card">
            <div className="pipeline-head"><span><strong>{analysis.productionGraph.targetResource}</strong><small>selected recipe dependency chain</small></span><b>{Object.entries(analysis.productionGraph.rawInputsPerTarget).map(([resource, amount]) => `${amount.toFixed(2)} ${resource}`).join(" + ")}</b></div>
            <div className="pipeline-stages">{analysis.productionGraph.steps.map((step, index) => <React.Fragment key={step.device}><span><small>{step.device}</small><strong>{step.process}</strong><code>{step.cyclesPerTarget.toFixed(2)} cycles / target</code></span>{index < analysis.productionGraph.steps.length - 1 && <i>→</i>}</React.Fragment>)}</div>
          </div></div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>RECIPE ALTERNATIVES</span><b>AUTO-PATCH CANDIDATES</b></div>
          <div className="pipeline-list">{analysis.recipeOptions.filter((option) => !option.selected).map((option) => <div className="pipeline-card" key={`${option.device}-${option.process}`}>
            <div className="pipeline-head"><span><strong>{option.process}</strong><small>{option.device} · {option.name}</small></span><b>{option.targetOutputPerMinute.toFixed(2)} {analysis.productionGraph.targetResource}/min</b></div>
            <div className="pipeline-stages"><span><small>inputs</small><strong>{Object.entries(option.inputBindings).map(([resource, buffer]) => `${resource} → ${buffer}`).join(" + ")}</strong><code>{option.inputs.map((amount) => `${amount.count} ${amount.resource}`).join(" + ")}</code></span><i>⇒</i><span><small>outputs</small><strong>{Object.entries(option.outputBindings).map(([resource, buffer]) => `${resource} → ${buffer}`).join(" + ")}</strong><code>{option.outputs.map((amount) => `${amount.count} ${amount.resource}`).join(" + ")}</code></span></div>
          </div>)}</div>
        </section>
        <section className="analysis-section diagnostics-analysis">
          <div className="analysis-section-title"><span>DIAGNOSTICS</span><b>{analysis.diagnostics.length}</b></div>
          <div className="diagnostic-list">{analysis.diagnostics.length ? analysis.diagnostics.map((diagnostic, index) => <div className={diagnostic.severity} key={`${diagnostic.code}-${index}`}><i>{diagnostic.severity === "warning" ? "!" : "·"}</i><span><code>{diagnostic.code}</code><p>{diagnostic.message}</p></span></div>) : <div className="diagnostics-clear"><i>✓</i><span>NO STATIC WARNINGS</span></div>}</div>
        </section>
        <section className="analysis-section logistics-analysis">
          <div className="analysis-section-title"><span>LOGISTICS PIPELINES</span><b>LOADER → LINE → UNLOADER</b></div>
          <div className="pipeline-list">{analysis.connections.map((connection) => {
            const flow = data.metrics?.transportFlows[connection.connection];
            const mix = flow ? Object.entries(flow.deliveredByResource).map(([resource, count]) => `${count} ${resource}`).join(" + ") : "";
            return <div className="pipeline-card" key={connection.connection}>
              <div className="pipeline-head"><span><strong>{connection.connection}</strong><small>{connection.from} → {connection.to}{mix ? ` · ${mix}` : ""}</small></span><b>{flow ? `${flow.deliveredItemsPerMinute.toFixed(1)} / ` : ""}{connection.capacityItemsPerMinute.toFixed(1)} /min</b></div>
              <div className="pipeline-stages">{connection.stages.map((stage, index) => <React.Fragment key={stage.stage}><span><small>{stage.stage}</small><strong>{stage.asset}</strong><code>{stage.capacity} / {stage.durationTicks}ms{stage.powerMilliWatts ? ` · ${(stage.powerMilliWatts / 1000).toFixed(1)}W · ${stage.powerGrid ?? "NO GRID"}` : ""}</code></span>{index < connection.stages.length - 1 && <i>→</i>}</React.Fragment>)}</div>
              <footer><span>{flow ? `MEASURED ${(flow.utilization * 100).toFixed(1)}% · ${flow.blockedItemTicks} BLOCKED ITEM-TICKS` : `DISPATCH ${connection.dispatchIntervalTicks}ms`}</span><span>LATENCY {connection.travelTicks}ms</span><span>PATH {connection.pathCells} CELLS{connection.sharedCells ? ` · ${connection.sharedCells} SHARED` : ""}</span></footer>
            </div>;
          })}</div>
        </section>
        <section className="analysis-section station-analysis">
          <div className="analysis-section-title"><span>STATION NETWORKS</span><b>SUPPLY → SHARED FLEET → DEMAND</b></div>
          <div className="station-network-list">{analysis.stationNetworks.length ? analysis.stationNetworks.map((network) => <div className="station-network-card" key={network.network}>
            <div className="pipeline-head"><span><strong>{network.network}</strong><small>{network.kind} · {network.stations} stations · load {network.estimatedCarrierLoad.toFixed(2)}</small></span><b>{network.fleetSize}× {network.fleetAsset}</b></div>
            <div className="station-route-list">{network.routes.length ? network.routes.map((route) => <div key={route.route}><span><b>{route.resource}</b><small>{route.from}@{route.fromRegion} → {route.to}@{route.toRegion}</small></span><code>{route.minimumBatch}-{route.batchCapacity} / {route.travelTicks}ms</code></div>) : <small>NO MATCHED ROUTES</small>}</div>
          </div>) : <div className="diagnostics-clear"><i>·</i><span>NO STATION NETWORK</span></div>}</div>
        </section>
        <section className="analysis-section power-analysis">
          <div className="analysis-section-title"><span>POWER GRIDS</span><b>RATED ENVELOPE</b></div>
          <div className="power-grid-list">{analysis.powerGrids.length ? analysis.powerGrids.map((grid) => {
            const utilization = grid.productionMilliWatts ? Math.min(100, grid.ratedConsumptionMilliWatts / grid.productionMilliWatts * 100) : 100;
            return <div className="power-grid-card" key={grid.grid}><div><strong>{grid.grid}</strong><code>{grid.region} · {grid.generators.map((generator) => `${generator.device} (${generator.kind}${generator.fuelResource ? `, ${generator.fuelPerMinute!.toFixed(2)} ${generator.fuelResource}/min` : ""})`).join(", ")}</code></div><span><b>{(grid.productionMilliWatts / 1000).toFixed(0)} W</b><small>RATED GEN</small></span><span><b>{(grid.ratedConsumptionMilliWatts / 1000).toFixed(0)} W</b><small>RATED LOAD</small></span><span className={grid.headroomMilliWatts < 0 ? "negative" : "positive"}><b>{(grid.headroomMilliWatts / 1000).toFixed(0)} W</b><small>HEADROOM</small></span><div className="power-bar"><i style={{ width: `${utilization}%` }} /></div><footer>{grid.members.length} DEVICES · {grid.transportStages.length} POWERED TRANSPORT STAGES</footer></div>;
          }) : <div className="diagnostics-clear"><i>!</i><span>NO POWER GRID</span></div>}</div>
        </section>
      </div>
    </section>
  </div>;
}

function ProjectLauncher({ index, onOpen }: { index: ProjectIndex; onOpen: (projectId: string) => void }) {
  return <div className="launcher-shell">
    <header className="launcher-header"><div className="brand"><div className="mark">INM</div><div><h1>Integrated Industry Maker</h1><p>PROJECT WORKSPACE</p></div></div><span className="engine-status"><i /> ENGINE READY</span></header>
    <section className="launcher-content">
      <div className="launcher-intro"><span className="eyebrow">{index.workspace ? "ENGINE WORKSPACE" : "STANDALONE PROJECT"}</span><h2>{index.name}</h2><p>Choose a self-contained industrial project. Its route, assets, runs, and simulation state remain isolated from every other project.</p></div>
      {index.projects.length ? <div className="project-grid">{index.projects.map((project) => <button className="project-card" key={project.id} onClick={() => onOpen(project.id)}>
        <div className="project-card-top"><span className="project-monogram">{project.name.slice(0, 2).toUpperCase()}</span>{project.isDefault && <em>DEFAULT</em>}</div>
        <div className="project-diagram" aria-hidden="true"><i /><i /><i /><span /><span /></div>
        <h3>{project.name}</h3><code>/{project.id}</code>
        <div className="project-stats"><span><b>{project.deviceInstances}</b> devices</span><span><b>{project.resourceNodes}</b> deposits</span><span><b>{project.connections}</b> local links</span><span><b>{project.logisticsNetworks}</b> station nets</span><span><b>{project.deviceAssets + project.resourceAssets + project.processes}</b> catalog</span><span><b>{project.runs}</b> runs</span></div>
        <div className="project-card-footer"><span>{project.regions} {project.regions === 1 ? "REGION" : "REGIONS"}</span><strong>OPEN PROJECT →</strong></div>
      </button>)}</div> : <div className="empty-projects"><span>NO PROJECTS</span><p>Create one with <code>inm project create</code>, then refresh this page.</p></div>}
    </section>
    <footer className="launcher-footer"><span>INM PRE-ALPHA</span><span>PROJECTS ARE SELF-CONTAINED</span></footer>
  </div>;
}

function ProjectLoading({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  return <div className="route-state"><div className="route-mark">INM</div><span>OPENING PROJECT</span><strong>{projectId}</strong><div className="loading-bar"><i /></div><button onClick={onBack}>← PROJECTS</button></div>;
}

function App() {
  const [routeProject, setRouteProject] = useState<string | null>(() => routeProjectId());
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [data, setData] = useState<StudioData | null>(null);
  const [run, setRun] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const runRef = useRef<string | null>(null);
  const projectRef = useRef<string | null>(routeProject);
  const requestSequence = useRef(0);

  const loadIndex = useCallback(async () => {
    try { setIndex(await responseJson<ProjectIndex>(await fetch("/api/projects"))); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  }, []);

  const loadProject = useCallback(async (projectId: string, selectedRun?: string | null) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const query = selectedRun ? `?run=${encodeURIComponent(selectedRun)}` : "";
      const next = await responseJson<StudioData>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/data${query}`));
      if (sequence !== requestSequence.current) return;
      setData(next);
      setRun(next.selectedRun);
      runRef.current = next.selectedRun;
      projectRef.current = next.projectId;
      setTick(0);
      setPlaying(false);
    } catch (nextError) {
      if (sequence === requestSequence.current) setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const navigateProject = useCallback((projectId: string | null) => {
    window.history.pushState({}, "", projectId ? projectPath(projectId) : "/");
    projectRef.current = projectId;
    runRef.current = null;
    setRouteProject(projectId);
    setAssetsOpen(false);
    setAnalysisOpen(false);
    setError(null);
    if (!projectId) {
      requestSequence.current += 1;
      setData(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadIndex(); }, [loadIndex]);
  useEffect(() => {
    const popstate = () => {
      const projectId = routeProjectId();
      projectRef.current = projectId;
      setRouteProject(projectId);
      setAssetsOpen(false);
      setAnalysisOpen(false);
      if (!projectId) setData(null);
    };
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  }, []);
  useEffect(() => {
    if (routeProject) void loadProject(routeProject);
  }, [routeProject, loadProject]);
  useEffect(() => {
    const source = new EventSource("/api/watch");
    source.onmessage = (event) => {
      if (event.data !== "refresh") return;
      void loadIndex();
      if (projectRef.current) void loadProject(projectRef.current, runRef.current);
    };
    return () => source.close();
  }, [loadIndex, loadProject]);
  useEffect(() => {
    document.title = data ? `${data.name} · INM Studio` : index ? `${index.name} · INM Studio` : "INM Studio";
  }, [data, index]);

  const maxTick = data?.events.at(-1)?.tick ?? 0;
  useEffect(() => {
    if (!playing || !data) return;
    let animation = 0;
    let previous = performance.now();
    const step = (now: number) => {
      const delta = now - previous;
      previous = now;
      setTick((value) => {
        const next = Math.min(maxTick, value + delta * speed);
        if (next >= maxTick) setPlaying(false);
        return next;
      });
      animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animation);
  }, [playing, speed, maxTick, data]);

  if (!routeProject) {
    if (!index && !error) return <div className="loading">DISCOVERING PROJECTS…</div>;
    if (error && !index) return <div className="route-state error-state"><span>WORKSPACE ERROR</span><strong>{error}</strong><button onClick={() => window.location.reload()}>RETRY</button></div>;
    return <ProjectLauncher index={index!} onOpen={(projectId) => navigateProject(projectId)} />;
  }
  if (!data && loading) return <ProjectLoading projectId={routeProject} onBack={() => navigateProject(null)} />;
  if (!data || error) return <div className="route-state error-state"><div className="route-mark">!</div><span>PROJECT UNAVAILABLE</span><strong>{error ?? routeProject}</strong><button onClick={() => navigateProject(null)}>← PROJECTS</button></div>;

  const frame = buildFrame(data, tick);
  const recent = frame.visibleEvents.slice(-8).reverse();
  const selectedRun = data.runs.find((item) => item.name === run);

  return <main className={loading ? "syncing" : ""}>
    <header className="project-header">
      <div className="header-project">
        <button className="back-button" onClick={() => navigateProject(null)} aria-label="Back to projects">←</button>
        <div className="mark">INM</div>
        <div><div className="breadcrumb"><span>{index?.name ?? "WORKSPACE"}</span><b>/</b><code>{data.projectId}</code></div><h1>{data.name}</h1></div>
      </div>
      <div className="header-tools">
        <span className="project-local"><i /> PROJECT LOCAL</span>
        <span className="hash">BP {data.blueprintHash.slice(0, 10)}</span>
        <button className="analysis-button" onClick={() => { setAssetsOpen(false); setAnalysisOpen(true); }}>ANALYSIS <b>{data.analysis.diagnostics.length}</b></button>
        <button className="assets-button" onClick={() => { setAnalysisOpen(false); setAssetsOpen(true); }}>CATALOG <b>{data.assets.devices.length + data.assets.resources.length + data.assets.processes.length}</b></button>
        <button onClick={() => void loadProject(data.projectId, run)}>{loading ? "SYNCING" : "REFRESH"}</button>
      </div>
    </header>
    <section className="workspace">
      <div className="viewport">
        <Canvas shadows camera={{ position: [data.bounds.width / 2, 32, data.bounds.height * 1.75], fov: 42, near: .1, far: 200 }} dpr={[1, 1.75]}><Suspense fallback={<Html center>Loading world…</Html>}><FactoryWorld data={data} tick={tick} /></Suspense></Canvas>
        <div className="viewport-title"><span className="live-dot" /> FACTORY SYSTEM <b>{data.regions.length} REGIONS</b></div>
        <div className="scene-stats"><span><b>{data.regions.length}</b> REGIONS</span><span><b>{data.devices.length}</b> MACHINES</span><span><b>{data.resourceNodes.length}</b> DEPOSITS</span><span><b>{data.connections.length}</b> LOCAL LINKS</span><span><b>{data.analysis.stationNetworks.length}</b> STATION NETS</span><span><b>{data.assets.processes.length}</b> PROCESSES</span></div>
        <div className="legend">{Object.entries(STATUS_COLORS).map(([status, color]) => <span key={status}><i style={{ background: color }} />{status}</span>)}</div>
      </div>
      <aside>
        <div className="panel run-panel"><label>EXPERIMENT RUN</label><select value={run ?? ""} onChange={(event) => void loadProject(data.projectId, event.target.value)}>{data.runs.map((item) => <option key={item.name} value={item.name}>{item.decision} · {item.name} · {item.score.toFixed(1)}</option>)}</select>{selectedRun && <div className={`decision ${selectedRun.decision.toLowerCase()}`}>{selectedRun.decision}</div>}</div>
        <div className="panel"><h2>Performance</h2><div className="metrics"><Metric label="SCORE" value={data.metrics?.finalScore.toFixed(2) ?? "—"} accent /><Metric label="THROUGHPUT / MIN" value={data.metrics?.throughputPerMinute.toFixed(2) ?? "—"} /><Metric label="BELT UTILIZATION" value={data.metrics ? `${(data.metrics.beltCellUtilization * 100).toFixed(1)}%` : "—"} /><Metric label="BLOCKED BELT ITEMS" value={data.metrics?.averageBlockedBeltItems.toFixed(2) ?? "—"} /><Metric label="PEAK BELT ITEMS" value={String(data.metrics?.peakBeltItems ?? "—")} /><Metric label="SORTER ENERGY" value={`${((data.metrics?.transportEnergyConsumedMilliJoules ?? 0) / 1e6).toFixed(2)} MJ`} /><Metric label="ENERGY" value={`${((data.metrics?.energyConsumedMilliJoules ?? 0) / 1e6).toFixed(1)} MJ`} /><Metric label="FUEL BURNED" value={data.metrics ? Object.entries(data.metrics.fuelConsumed).map(([resource, count]) => `${count} ${resource}`).join(", ") || "0" : "—"} /><Metric label="BUILD COST" value={(data.metrics?.totalBuildCost ?? 0).toLocaleString()} /><Metric label="AREA" value={`${data.metrics?.occupiedArea ?? 0} cells`} /></div></div>
        <div className="panel bottleneck"><h2>Bottleneck</h2><strong>{data.metrics?.bottleneckEntity ?? "NONE"}</strong><p>Highlighted with an amber floor beacon in the factory world.</p></div>
        <div className="panel events"><h2>Event stream <span>{frame.visibleEvents.length}</span></h2>{recent.map((event, index) => <div className="event" key={`${event.tick}-${event.type}-${index}`}><time>{formatTick(event.tick)}</time><span>{event.type}</span><b>{event.device ?? event.connection ?? event.transit?.resource ?? event.resource ?? ""}</b></div>)}</div>
      </aside>
    </section>
    <footer className="timeline"><button className="play" onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ" : "▶"}</button><button onClick={() => { setPlaying(false); setTick(0); }}>RESET</button><div className="time"><strong>{formatTick(tick)}</strong><input aria-label="Timeline" type="range" min={0} max={maxTick} value={tick} onChange={(event) => { setPlaying(false); setTick(Number(event.target.value)); }} /><span>{formatTick(maxTick)}</span></div><div className="speeds">{[1, 4, 16, 64].map((value) => <button className={speed === value ? "active" : ""} onClick={() => setSpeed(value)} key={value}>{value}×</button>)}</div></footer>
    {assetsOpen && <AssetBrowser data={data} onClose={() => setAssetsOpen(false)} />}
    {analysisOpen && <AnalysisBrowser data={data} onClose={() => setAnalysisOpen(false)} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
