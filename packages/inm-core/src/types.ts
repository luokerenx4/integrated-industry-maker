export type Tick = number;
export type ResourceId = string;
export type ProcessId = string;
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
  fuel?: { energyMilliJoules: number };
  files: { visual: string };
}

export interface ResourceAsset extends ResourceAssetManifest {
  assetDir: string;
  contentHash: string;
  visual: ResourceVisual;
}

export interface ProcessAmount {
  resource: ResourceId;
  count: number;
}

export interface IndustrialProcessManifest {
  version: 1;
  id: ProcessId;
  name: string;
  description: string;
  category: string;
  tags: string[];
  durationTicks: Tick;
  inputs: ProcessAmount[];
  outputs: ProcessAmount[];
}

export interface IndustrialProcess extends IndustrialProcessManifest {
  sourceFile: string;
  contentHash: string;
}

export type DeviceCapability = "extract" | "process" | "store" | "transport" | "transport-junction" | "station" | "consume" | "power";
export type LogisticsStage = "loader" | "line" | "unloader";
export type LogisticsRole = LogisticsStage | "carrier";
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
  production?: {
    categories: string[];
    speed: { numerator: number; denominator: number };
    inputBuffers: BufferId[];
    outputBuffers: BufferId[];
  };
  extraction?: {
    resources: ResourceId[];
    radius: number;
    outputBuffer: BufferId;
    cycleTicks: Tick;
    itemsPerCycle: number;
  };
  logistics?: { roles: LogisticsRole[]; carrierKinds?: Array<"planetary" | "interstellar"> };
  logisticsStation?: { networkKinds: Array<"planetary" | "interstellar">; buffer: BufferId; slots: number };
  runtime: { apiVersion: 1; entry: string };
  power: {
    consumptionMilliWatts: number;
    generation?:
      | { kind: "renewable"; outputMilliWatts: number }
      | { kind: "fuel"; outputMilliWatts: number; fuelBuffer: BufferId; fuels: ResourceId[] };
    distribution?: { connectionRange: number; coverageRange: number };
  };
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
  process?: Readonly<{
    id: ProcessId;
    name: string;
    category: string;
    durationTicks: Tick;
    inputs: ResourceBufferQuantity[];
    outputs: ResourceBufferQuantity[];
  }>;
  extraction?: Readonly<{
    outputBuffer: BufferId;
    cycleTicks: Tick;
    itemsPerCycle: number;
    nodes: ReadonlyArray<Readonly<{ id: string; resource: ResourceId; remaining: number }>>;
  }>;
  generation?: Readonly<{
    kind: "fuel";
    outputMilliWatts: number;
    fuelBuffer: BufferId;
    fuels: ReadonlyArray<Readonly<{ resource: ResourceId; energyMilliJoules: number; durationTicks: Tick }>>;
  }>;
}

export type DeviceProgramDecision =
  | { kind: "start"; operation: string; durationTicks: Tick; consume: ResourceBufferQuantity[]; produce: ResourceBufferQuantity[]; powerMilliWatts?: number }
  | { kind: "extract"; operation: string; durationTicks: Tick; node: string; count: number; powerMilliWatts?: number }
  | { kind: "generate"; operation: string; durationTicks: Tick; resource: ResourceId; count: number; outputMilliWatts: number }
  | { kind: "consume"; consume: ResourceBufferQuantity[] }
  | { kind: "wait"; reason: "input" | "output" | "idle" }
  | { kind: "none" };

export interface DeviceTransportContext {
  apiVersion: 1;
  connection: ConnectionId;
  stage: LogisticsRole;
  distance: number;
}

export interface DeviceTransportPlan { capacity: number; durationTicks: Tick; stackCapacity: number }
export interface DeviceProgram {
  apiVersion: 1;
  validateConfig?: (config: Readonly<Record<string, unknown>>) => string[];
  evaluate: (context: Readonly<DeviceProgramContext>) => unknown;
  planTransport?: (context: Readonly<DeviceTransportContext>) => unknown;
}

export interface GridPosition { x: number; y: number; level?: number }
export interface WorldPosition { x: number; y: number; z: number }
export interface WorldRegion {
  id: string;
  name: string;
  kind: "site" | "planet" | "orbit";
  coordinates: WorldPosition;
  bounds: { width: number; height: number };
}
export interface WorldResourceNode {
  id: string;
  region: string;
  resource: ResourceId;
  position: GridPosition;
  amount: number;
}
export interface IndustrialWorld {
  version: 1;
  id: string;
  name: string;
  regions: WorldRegion[];
  resourceNodes: WorldResourceNode[];
}
export type Rotation = 0 | 90 | 180 | 270;
export interface BlueprintDevice {
  id: DeviceInstanceId;
  asset: DeviceAssetId;
  region: string;
  position: GridPosition;
  rotation: Rotation;
  recipe?: {
    process: ProcessId;
    inputs: Record<ResourceId, BufferId>;
    outputs: Record<ResourceId, BufferId>;
  };
  /** Instance-level Resource contracts. Each entry narrows the corresponding asset buffer; an empty list disables that buffer. */
  bufferFilters?: Record<BufferId, ResourceId[]>;
  resourceNodes?: string[];
  config?: Record<string, unknown>;
  policy?: {
    dispatch?: "fifo" | "round-robin";
    inputPriority?: string;
    outputPriority?: string;
    filter?: { resource: ResourceId; outputPort: string };
  };
}
export interface BlueprintConnection {
  id: ConnectionId;
  from: { device: DeviceInstanceId; port: string };
  to: { device: DeviceInstanceId; port: string };
  path: GridPosition[];
  /** Requested items per cargo stack. Omit to use the maximum supported by every transport stage and Resource. */
  stackSize?: number;
  logistics: {
    loader: { deviceAsset: DeviceAssetId };
    line: { deviceAsset: DeviceAssetId };
    unloader: { deviceAsset: DeviceAssetId };
  };
}
export interface BlueprintLogisticsSlot {
  resource: ResourceId;
  mode: "supply" | "demand" | "storage";
  /** Maximum resident plus inbound quantity for this Resource in the station buffer. */
  capacity: number;
  minimumBatch?: number;
}
export interface BlueprintLogisticsStation {
  device: DeviceInstanceId;
  slots: BlueprintLogisticsSlot[];
}
export interface BlueprintLogisticsNetwork {
  id: string;
  kind: "planetary" | "interstellar";
  fleet: { deviceAsset: DeviceAssetId; count: number };
  stations: BlueprintLogisticsStation[];
}
export interface Blueprint {
  version: 1;
  revision?: string;
  devices: BlueprintDevice[];
  connections: BlueprintConnection[];
  logisticsNetworks: BlueprintLogisticsNetwork[];
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
  targetRegion: string;
  targetRatePerMinute: number;
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
  defaultWorld: string;
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

export interface CompiledDeviceBuffer extends DeviceBufferDefinition {
  /** Optional Resource-specific quotas, compiled from semantics such as station slots. */
  resourceCapacities?: Record<ResourceId, number>;
}
export interface CompiledDevice extends BlueprintDevice {
  assetDef: DeviceAsset;
  footprint: { width: number; height: number };
  ports: DevicePort[];
  buffers: Record<BufferId, CompiledDeviceBuffer>;
  processPlan?: {
    definition: IndustrialProcess;
    durationTicks: Tick;
    inputs: ResourceBufferQuantity[];
    outputs: ResourceBufferQuantity[];
  };
  extractionPlan?: {
    nodes: WorldResourceNode[];
    outputBuffer: BufferId;
    cycleTicks: Tick;
    itemsPerCycle: number;
  };
  generationPlan?:
    | { kind: "renewable"; outputMilliWatts: number }
    | { kind: "fuel"; outputMilliWatts: number; fuelBuffer: BufferId; fuels: Array<{ resource: ResourceId; energyMilliJoules: number; durationTicks: Tick }> };
  powerGrid?: string;
}
export interface CompiledConnection extends BlueprintConnection {
  fromDevice: CompiledDevice;
  toDevice: CompiledDevice;
  fromPort: DevicePort;
  toPort: DevicePort;
  logisticsStages: Array<{
    stage: LogisticsStage;
    asset: DeviceAsset;
    distance: number;
    capacity: number;
    durationTicks: Tick;
    stackCapacity: number;
    region?: string;
    position?: GridPosition;
    powerGrid?: string;
  }>;
  distance: number;
  transportCells: string[];
  stackSizeByResource: Record<ResourceId, number>;
  maxStackSize: number;
  loaderDispatchIntervalTicks: Tick;
  lineDispatchIntervalTicks: Tick;
  lineCellTravelTicks: Tick;
  unloaderDispatchIntervalTicks: Tick;
  capacity: number;
  travelTicks: Tick;
  dispatchIntervalTicks: Tick;
}
export interface CompiledTransportCell {
  id: string;
  region: string;
  position: GridPosition;
  asset: DeviceAsset;
  connections: ConnectionId[];
  output: { kind: "cell"; cell: string } | { kind: "port"; device: DeviceInstanceId; port: string };
  dispatchIntervalTicks: Tick;
  travelTicks: Tick;
}
export interface CompiledLogisticsRoute {
  id: string;
  network: string;
  resource: ResourceId;
  from: DeviceInstanceId;
  to: DeviceInstanceId;
  fromRegion: string;
  toRegion: string;
  fromBuffer: BufferId;
  toBuffer: BufferId;
  fromSlotCapacity: number;
  toSlotCapacity: number;
  minimumBatch: number;
  distance: number;
  carrierCapacity: number;
  /** Effective batch capacity after intersecting carrier and both station slots. */
  capacity: number;
  travelTicks: Tick;
}
export interface CompiledLogisticsNetwork {
  id: string;
  kind: "planetary" | "interstellar";
  fleetAsset: DeviceAsset;
  fleetSize: number;
  stations: BlueprintLogisticsStation[];
  routes: CompiledLogisticsRoute[];
}
export interface CompiledPowerGrid {
  id: string;
  region: string;
  distributors: DeviceInstanceId[];
  members: DeviceInstanceId[];
  transportStages: Array<{ connection: ConnectionId; stage: "loader" | "unloader" }>;
  productionMilliWatts: number;
  ratedConsumptionMilliWatts: number;
}
export interface CompiledFactoryProject {
  rootDir: string;
  manifest: InmManifest;
  resources: Record<ResourceId, ResourceAsset>;
  processes: Record<ProcessId, IndustrialProcess>;
  deviceAssets: Record<DeviceAssetId, DeviceAsset>;
  world: IndustrialWorld;
  blueprint: Blueprint;
  scenario: Scenario;
  objective: Objective;
  regions: Record<string, WorldRegion>;
  resourceNodes: Record<string, WorldResourceNode>;
  devices: Record<DeviceInstanceId, CompiledDevice>;
  connections: Record<ConnectionId, CompiledConnection>;
  transportCells: Record<string, CompiledTransportCell>;
  logisticsNetworks: Record<string, CompiledLogisticsNetwork>;
  powerGrids: Record<string, CompiledPowerGrid>;
  hashes: ProjectHashes;
}

export interface ProjectHashes {
  engineVersion: string;
  resourceCatalogHash: string;
  processCatalogHash: string;
  deviceCatalogHash: string;
  worldHash: string;
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
  extraction?: { node: string; count: number };
  generationMilliWatts?: number;
  fuel?: { resource: ResourceId; count: number; energyMilliJoules: number };
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
  logisticsRoute?: string;
}
export type BeltTransitPhase = "loading" | "belt" | "unloading";
export interface BeltTransit extends ResourceTransit {
  phase: BeltTransitPhase;
  /** -1 while the item is in a loader or unloader; otherwise indexes connection.transportCells. */
  cellIndex: number;
  readyTick: Tick;
  blockedBy?: string;
}
export interface FactoryState {
  tick: Tick;
  devices: Record<DeviceInstanceId, DeviceRuntimeState>;
  resourceNodes: Record<string, { remaining: number; reserved: number; extracted: number }>;
  transports: Record<ConnectionId, BeltTransit[]>;
  logisticsTransports: Record<string, ResourceTransit[]>;
  produced: Record<ResourceId, number>;
  consumed: Record<ResourceId, number>;
  energy: {
    availableMilliWatts: number;
    consumedMilliJoules: number;
    grids: Record<string, { availableMilliWatts: number; consumedMilliJoules: number }>;
    fuelConsumed: Record<ResourceId, number>;
  };
  completedOrders: number;
}

export type FactoryEvent =
  | { type: "device.start"; tick: Tick; device: DeviceInstanceId; operation: string; durationTicks: Tick }
  | { type: "device.finish"; tick: Tick; device: DeviceInstanceId; operation: string; produced: ResourceBufferQuantity[] }
  | { type: "resource.extracted"; tick: Tick; device: DeviceInstanceId; node: string; resource: ResourceId; count: number; remaining: number }
  | { type: "resource.depleted"; tick: Tick; node: string; resource: ResourceId }
  | { type: "resource.depart"; tick: Tick; transit: ResourceTransit; connection: ConnectionId }
  | { type: "resource.belt-position"; tick: Tick; transit: BeltTransit; connection: ConnectionId; cell: string; cellIndex: number }
  | { type: "resource.belt-blocked"; tick: Tick; transit: BeltTransit; connection: ConnectionId; cell: string | null; waitingFor: string }
  | { type: "resource.belt-unblocked"; tick: Tick; transit: BeltTransit; connection: ConnectionId }
  | { type: "resource.unload-start"; tick: Tick; transit: BeltTransit; connection: ConnectionId }
  | { type: "resource.arrive"; tick: Tick; transit: ResourceTransit; connection: ConnectionId }
  | { type: "logistics.depart"; tick: Tick; transit: ResourceTransit; network: string; route: string }
  | { type: "logistics.arrive"; tick: Tick; transit: ResourceTransit; network: string; route: string }
  | { type: "resource.consumed"; tick: Tick; device: DeviceInstanceId; resource: ResourceId; count: number }
  | { type: "buffer.blocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "buffer.unblocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "power.shortage"; tick: Tick; device: DeviceInstanceId; grid: string | null; requiredMilliWatts: number; availableMilliWatts: number }
  | { type: "transport.power-shortage"; tick: Tick; connection: ConnectionId; stage: "loader" | "unloader"; grid: string | null; requiredMilliWatts: number; availableMilliWatts: number }
  | { type: "transport.power-restored"; tick: Tick; connection: ConnectionId; stage: "loader" | "unloader"; grid: string }
  | { type: "power.fuel-loaded"; tick: Tick; device: DeviceInstanceId; grid: string; resource: ResourceId; count: number; energyMilliJoules: number; durationTicks: Tick }
  | { type: "power.fuel-spent"; tick: Tick; device: DeviceInstanceId; grid: string; resource: ResourceId; count: number }
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
  extracted: Record<ResourceId, number>;
  resourceNodes: Record<string, { initial: number; remaining: number; reserved: number; extracted: number; depleted: boolean }>;
  throughputPerMinute: number;
  completedOrders: number;
  onTimeDelivery: number;
  energyConsumedMilliJoules: number;
  fuelConsumed: Record<ResourceId, number>;
  totalBuildCost: number;
  occupiedArea: number;
  machineUtilization: Record<DeviceInstanceId, number>;
  idleTime: Record<DeviceInstanceId, Tick>;
  waitingInputTime: Record<DeviceInstanceId, Tick>;
  blockedOutputTime: Record<DeviceInstanceId, Tick>;
  averageWip: number;
  averageBeltItems: number;
  averageBlockedBeltItems: number;
  peakBeltItems: number;
  beltCellUtilization: number;
  transportStageUtilization: Record<ConnectionId, { loader: number; unloader: number }>;
  transportFlows: Record<ConnectionId, {
    departedItems: number;
    deliveredItems: number;
    departedByResource: Record<ResourceId, number>;
    deliveredByResource: Record<ResourceId, number>;
    departedItemsPerMinute: number;
    deliveredItemsPerMinute: number;
    capacityItemsPerMinute: number;
    utilization: number;
    averageInFlightItems: number;
    blockedItemTicks: Tick;
    blockedFraction: number;
  }>;
  transportEnergyConsumedMilliJoules: number;
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
