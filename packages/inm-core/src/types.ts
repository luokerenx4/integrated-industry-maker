export type Tick = number;
export type MaterialId = string;
export type DeviceAssetId = string;
export type DeviceInstanceId = string;
export type ConnectionId = string;

export interface MaterialVisual {
  shape?: "box" | "sphere" | "cylinder";
  texture?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface DeviceVisual {
  shape?: "box" | "cylinder" | "sphere" | "plane";
  height?: number;
  texture?: string | null;
  model?: string | null;
  color?: string | null;
  label?: string;
}

export interface MaterialAsset {
  type: "material";
  id: MaterialId;
  name: string;
  visual?: MaterialVisual;
  properties?: { stackSize?: number };
}

export type PortSide = "north" | "east" | "south" | "west";
export interface DevicePort {
  id: string;
  direction: "input" | "output";
  kind: "material";
  side: PortSide;
  offset: number;
}

export type DeviceBehavior =
  | { kind: "source"; material: MaterialId; count: number; durationTicks: Tick; outputCapacity?: number }
  | { kind: "sink"; accepts: MaterialId[] }
  | { kind: "processor"; supportedRecipes: string[]; inputCapacity: number; outputCapacity: number }
  | { kind: "storage"; capacity: number; accepts: MaterialId[] }
  | { kind: "transport"; capacity: number; travelTicksPerCell: Tick }
  | { kind: "power"; outputMilliWatts: number };

export interface DeviceAsset {
  type: "device";
  id: DeviceAssetId;
  name: string;
  geometry: {
    footprint: { width: number; height: number };
    rotatable: boolean;
    ports: DevicePort[];
  };
  behavior: DeviceBehavior;
  simulation?: { powerConsumptionMilliWatts?: number };
  economics?: { buildCost?: number };
  visual?: DeviceVisual;
}

export interface RecipeQuantity { material: MaterialId; count: number }
export interface Recipe {
  id: string;
  name: string;
  durationTicks: Tick;
  inputs: RecipeQuantity[];
  outputs: RecipeQuantity[];
}

export interface GridPosition { x: number; y: number }
export type Rotation = 0 | 90 | 180 | 270;
export interface BlueprintDevice {
  id: DeviceInstanceId;
  asset: DeviceAssetId;
  position: GridPosition;
  rotation: Rotation;
  config?: { recipe?: string; accepts?: MaterialId[] };
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
  initialInventories?: Record<DeviceInstanceId, Record<MaterialId, number>>;
  failures?: ScenarioFailure[];
}

export interface Objective {
  id: string;
  name: string;
  targetMaterial: MaterialId;
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
  name: string;
  defaultBlueprint: string;
  defaultScenario: string;
  defaultObjective: string;
}

export interface CompiledDevice extends BlueprintDevice {
  assetDef: DeviceAsset;
  footprint: { width: number; height: number };
  ports: DevicePort[];
  recipe?: Recipe;
}
export interface CompiledConnection extends BlueprintConnection {
  fromDevice: CompiledDevice;
  toDevice: CompiledDevice;
  transportAsset: DeviceAsset & { behavior: Extract<DeviceBehavior, { kind: "transport" }> };
  distance: number;
  travelTicks: Tick;
}
export interface CompiledFactoryProject {
  rootDir: string;
  manifest: InmManifest;
  materials: Record<MaterialId, MaterialAsset>;
  deviceAssets: Record<DeviceAssetId, DeviceAsset>;
  recipes: Record<string, Recipe>;
  blueprint: Blueprint;
  scenario: Scenario;
  objective: Objective;
  devices: Record<DeviceInstanceId, CompiledDevice>;
  connections: Record<ConnectionId, CompiledConnection>;
  hashes: ProjectHashes;
}

export interface ProjectHashes {
  engineVersion: string;
  materialCatalogHash: string;
  deviceCatalogHash: string;
  recipeCatalogHash: string;
  blueprintHash: string;
  scenarioHash: string;
  objectiveHash: string;
}

export type DeviceStatus = "idle" | "waiting-input" | "processing" | "blocked-output" | "unpowered" | "failed";
export interface DeviceRuntimeState {
  status: DeviceStatus;
  inventory: Record<MaterialId, number>;
  progressTicks?: number;
  activeRecipe?: string;
  startedAt?: Tick;
}
export interface MaterialTransit {
  id: string;
  material: MaterialId;
  count: number;
  from: DeviceInstanceId;
  to: DeviceInstanceId;
  departTick: Tick;
  arriveTick: Tick;
}
export interface FactoryState {
  tick: Tick;
  devices: Record<DeviceInstanceId, DeviceRuntimeState>;
  transports: Record<ConnectionId, MaterialTransit[]>;
  produced: Record<MaterialId, number>;
  consumed: Record<MaterialId, number>;
  energy: { availableMilliWatts: number; consumedMilliJoules: number };
  completedOrders: number;
}

export type FactoryEvent =
  | { type: "device.start"; tick: Tick; device: DeviceInstanceId; recipe?: string }
  | { type: "device.finish"; tick: Tick; device: DeviceInstanceId; recipe?: string; material?: MaterialId; count?: number }
  | { type: "material.depart"; tick: Tick; transit: MaterialTransit; connection: ConnectionId }
  | { type: "material.arrive"; tick: Tick; transit: MaterialTransit; connection: ConnectionId }
  | { type: "buffer.blocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "buffer.unblocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "power.shortage"; tick: Tick; device: DeviceInstanceId; requiredMilliWatts: number; availableMilliWatts: number }
  | { type: "device.breakdown"; tick: Tick; device: DeviceInstanceId }
  | { type: "device.recover"; tick: Tick; device: DeviceInstanceId }
  | { type: "sink.accepted"; tick: Tick; device: DeviceInstanceId; material: MaterialId; count: number }
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
  produced: Record<MaterialId, number>;
  consumed: Record<MaterialId, number>;
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
