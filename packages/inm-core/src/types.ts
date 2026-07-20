export type Tick = number;
export type ResourceId = string;
export type DeviceAssetId = string;
export type DeviceInstanceId = string;
export type ConnectionId = string;
export type BufferId = string;

export interface ResourceVisual {
  shape: "box" | "sphere" | "cylinder";
  texture: string | null;
  color: string | null;
  icon: string | null;
}

export interface DeviceVisual {
  shape: "box" | "cylinder" | "sphere" | "plane";
  height: number;
  texture: string | null;
  model: string | null;
  color: string | null;
  label: string;
}

export interface ResourceAssetManifest {
  assetVersion: 1;
  type: "resource";
  id: ResourceId;
  name: string;
  description: string;
  tags: string[];
  unit: { kind: "discrete" | "continuous"; symbol: string; precision: number };
  transport: { stackSize: number };
  files: { visual: string };
}

export interface ResourceAsset extends ResourceAssetManifest {
  assetDir: string;
  contentHash: string;
  visual: ResourceVisual;
}

export type DeviceCapability = "produce" | "process" | "store" | "transport" | "consume" | "power";
export type PortSide = "north" | "east" | "south" | "west";
export interface DevicePort {
  id: string;
  direction: "input" | "output";
  kind: "resource";
  side: PortSide;
  offset: number;
  buffer: BufferId;
}

export interface DeviceBufferDefinition {
  id: BufferId;
  role: "input" | "output" | "internal";
  capacity: number;
  accepts: Array<ResourceId | "*">;
}

export interface DeviceAssetManifest {
  assetVersion: 1;
  type: "device";
  id: DeviceAssetId;
  name: string;
  description: string;
  tags: string[];
  capabilities: DeviceCapability[];
  geometry: {
    footprint: { width: number; height: number };
    rotatable: boolean;
    ports: DevicePort[];
  };
  buffers: DeviceBufferDefinition[];
  runtime: { apiVersion: 1; entry: string };
  power: { consumptionMilliWatts: number; productionMilliWatts: number };
  economics: { buildCost: number };
  files: { visual: string };
}

export interface DeviceAsset extends DeviceAssetManifest {
  assetDir: string;
  contentHash: string;
  visual: DeviceVisual;
  runtimeSourceHash: string;
  program: DeviceProgram;
}

export interface ResourceBufferQuantity {
  buffer: BufferId;
  resource: ResourceId;
  count: number;
}

export interface DeviceProgramContext {
  apiVersion: 1;
  tick: Tick;
  device: { id: DeviceInstanceId; asset: DeviceAssetId; config: Readonly<Record<string, unknown>> };
  buffers: Readonly<Record<BufferId, Readonly<Record<ResourceId, number>>>>;
}

export type DeviceProgramDecision =
  | { kind: "start"; operation: string; durationTicks: Tick; consume: ResourceBufferQuantity[]; produce: ResourceBufferQuantity[]; powerMilliWatts?: number }
  | { kind: "consume"; consume: ResourceBufferQuantity[] }
  | { kind: "wait"; reason: "input" | "output" | "idle" }
  | { kind: "none" };

export interface DeviceTransportContext {
  apiVersion: 1;
  connection: ConnectionId;
  distance: number;
}

export interface DeviceTransportPlan { capacity: number; durationTicks: Tick }
export interface DeviceProgram {
  apiVersion: 1;
  validateConfig?: (config: Readonly<Record<string, unknown>>) => string[];
  evaluate: (context: Readonly<DeviceProgramContext>) => unknown;
  planTransport?: (context: Readonly<DeviceTransportContext>) => unknown;
}

export interface GridPosition { x: number; y: number }
export type Rotation = 0 | 90 | 180 | 270;
export interface BlueprintDevice {
  id: DeviceInstanceId;
  asset: DeviceAssetId;
  position: GridPosition;
  rotation: Rotation;
  config?: Record<string, unknown>;
  policy?: { dispatch?: "fifo" | "round-robin" };
}
export interface BlueprintConnection {
  id: ConnectionId;
  from: { device: DeviceInstanceId; port: string };
  to: { device: DeviceInstanceId; port: string };
  transport: { deviceAsset: DeviceAssetId };
}
export interface Blueprint {
  version: 1;
  revision?: string;
  bounds: { width: number; height: number };
  devices: BlueprintDevice[];
  connections: BlueprintConnection[];
  policies?: { dispatch?: "fifo" | "round-robin" };
}

export interface ScenarioFailure { device: DeviceInstanceId; atTick: Tick; durationTicks: Tick }
export interface Scenario {
  id: string;
  name: string;
  durationTicks: Tick;
  initialBuffers?: Record<DeviceInstanceId, Record<BufferId, Record<ResourceId, number>>>;
  failures?: ScenarioFailure[];
}

export interface Objective {
  id: string;
  name: string;
  targetResource: ResourceId;
  constraints?: { maxBuildCost?: number; maxOccupiedArea?: number; minProduction?: number };
  weights: {
    throughput: number;
    onTimeDelivery?: number;
    energy: number;
    buildCost: number;
    occupiedArea: number;
    wip: number;
    blocked: number;
  };
}

export interface InmManifest {
  version: 1;
  id: string;
  name: string;
  defaultBlueprint: string;
  defaultScenario: string;
  defaultObjective: string;
}

export interface InmWorkspaceManifest {
  version: 1;
  name: string;
  projectsDirectory: string;
  defaultProject: string | null;
}

export interface WorkspaceProjectSummary {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
}

export interface CompiledDevice extends BlueprintDevice {
  assetDef: DeviceAsset;
  footprint: { width: number; height: number };
  ports: DevicePort[];
  buffers: Record<BufferId, DeviceBufferDefinition>;
}
export interface CompiledConnection extends BlueprintConnection {
  fromDevice: CompiledDevice;
  toDevice: CompiledDevice;
  fromPort: DevicePort;
  toPort: DevicePort;
  transportAsset: DeviceAsset;
  distance: number;
  capacity: number;
  travelTicks: Tick;
}
export interface CompiledFactoryProject {
  rootDir: string;
  manifest: InmManifest;
  resources: Record<ResourceId, ResourceAsset>;
  deviceAssets: Record<DeviceAssetId, DeviceAsset>;
  blueprint: Blueprint;
  scenario: Scenario;
  objective: Objective;
  devices: Record<DeviceInstanceId, CompiledDevice>;
  connections: Record<ConnectionId, CompiledConnection>;
  hashes: ProjectHashes;
}

export interface ProjectHashes {
  engineVersion: string;
  resourceCatalogHash: string;
  deviceCatalogHash: string;
  blueprintHash: string;
  scenarioHash: string;
  objectiveHash: string;
}

export type DeviceStatus = "idle" | "waiting-input" | "processing" | "blocked-output" | "unpowered" | "failed";
export interface ActiveDeviceJob {
  operation: string;
  startedAt: Tick;
  durationTicks: Tick;
  powerMilliWatts: number;
  produce: ResourceBufferQuantity[];
}
export interface DeviceRuntimeState {
  status: DeviceStatus;
  buffers: Record<BufferId, Record<ResourceId, number>>;
  progressTicks?: number;
  activeJob?: ActiveDeviceJob;
}
export interface ResourceTransit {
  id: string;
  resource: ResourceId;
  count: number;
  from: DeviceInstanceId;
  fromBuffer: BufferId;
  to: DeviceInstanceId;
  toBuffer: BufferId;
  departTick: Tick;
  arriveTick: Tick;
}
export interface FactoryState {
  tick: Tick;
  devices: Record<DeviceInstanceId, DeviceRuntimeState>;
  transports: Record<ConnectionId, ResourceTransit[]>;
  produced: Record<ResourceId, number>;
  consumed: Record<ResourceId, number>;
  energy: { availableMilliWatts: number; consumedMilliJoules: number };
  completedOrders: number;
}

export type FactoryEvent =
  | { type: "device.start"; tick: Tick; device: DeviceInstanceId; operation: string; durationTicks: Tick }
  | { type: "device.finish"; tick: Tick; device: DeviceInstanceId; operation: string; produced: ResourceBufferQuantity[] }
  | { type: "resource.depart"; tick: Tick; transit: ResourceTransit; connection: ConnectionId }
  | { type: "resource.arrive"; tick: Tick; transit: ResourceTransit; connection: ConnectionId }
  | { type: "resource.consumed"; tick: Tick; device: DeviceInstanceId; resource: ResourceId; count: number }
  | { type: "buffer.blocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "buffer.unblocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "power.shortage"; tick: Tick; device: DeviceInstanceId; requiredMilliWatts: number; availableMilliWatts: number }
  | { type: "device.breakdown"; tick: Tick; device: DeviceInstanceId }
  | { type: "device.recover"; tick: Tick; device: DeviceInstanceId }
  | { type: "simulation.completed"; tick: Tick; reason: "until-tick" | "max-events" | "infeasible" };

export interface ScoreBreakdown {
  throughput: number;
  onTimeDelivery: number;
  energy: number;
  buildCost: number;
  occupiedArea: number;
  wip: number;
  blocked: number;
  constraintPenalty: number;
}
export interface FactoryMetrics {
  produced: Record<ResourceId, number>;
  consumed: Record<ResourceId, number>;
  throughputPerMinute: number;
  completedOrders: number;
  onTimeDelivery: number;
  energyConsumedMilliJoules: number;
  totalBuildCost: number;
  occupiedArea: number;
  machineUtilization: Record<DeviceInstanceId, number>;
  idleTime: Record<DeviceInstanceId, Tick>;
  waitingInputTime: Record<DeviceInstanceId, Tick>;
  blockedOutputTime: Record<DeviceInstanceId, Tick>;
  averageWip: number;
  transportCongestion: number;
  bottleneckEntity: DeviceInstanceId | null;
  infeasibleReason: string | null;
  scoreBreakdown: ScoreBreakdown;
  finalScore: number;
}
export interface SimulationResult {
  state: FactoryState;
  events: FactoryEvent[];
  metrics: FactoryMetrics;
  resultHash: string;
  runKey: string;
}

export interface ValidationIssue { path: string; code: string; message: string }
export class InmValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "InmValidationError";
  }
}
