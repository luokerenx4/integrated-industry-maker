export type Tick = number;
export type ResourceId = string;
export type ProcessId = string;
export type RouteId = string;
export type DeviceAssetId = string;
export type DeviceInstanceId = string;
export type ConnectionId = string;
export type BufferId = string;
export type PortId = string;

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
  /** Makes every discrete unit an identity-preserving industrial work lot. */
  tracking?: { kind: "lot"; family: string; route: RouteId };
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
  /** Recipe family retained by setup-sensitive equipment. Changing groups requires a physical changeover. */
  setupGroup?: string;
  /** Deterministic lot-quality behavior owned by the fixed Process catalog. */
  quality?:
    | {
      kind: "inspection";
      /** Latent defect classes this operation can reveal. */
      detects: string[];
      /** Alternate tracked output used while a lot remains eligible for rework. */
      rejectResource: ResourceId;
      /** Optional terminal disposition after the configured rework limit. */
      scrapResource?: ResourceId;
      /** Number of completed rework cycles permitted before scrap disposition. */
      maxReworkCycles?: number;
    }
    | {
      kind: "rework";
      /** Latent defect classes removed by one successful rework cycle. */
      repairs: string[];
    };
  durationTicks: Tick;
  inputs: ProcessAmount[];
  outputs: ProcessAmount[];
}

export interface IndustrialProcess extends IndustrialProcessManifest {
  sourceFile: string;
  contentHash: string;
}

export interface ProductRouteManifest {
  version: 1;
  type: "route";
  id: RouteId;
  name: string;
  description: string;
  family: string;
  entry: { resource: ResourceId; step: string };
  steps: Array<{
    id: string;
    name: string;
    operations: ProcessId[];
    /** Maximum elapsed time from entering this Route step until physical work starts. */
    queueTime?: { maximumTicks: Tick; violationDefects: string[] };
    transitions: Array<{
      resource: ResourceId;
      to?: string;
      terminal?: "complete" | "scrap";
    }>;
  }>;
}

export interface ProductRoute extends ProductRouteManifest {
  sourceFile: string;
  contentHash: string;
}

export type DeviceCapability = "extract" | "process" | "treat" | "store" | "transport" | "transport-junction" | "station" | "consume" | "discard" | "power";
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

export interface ProductionModeDefinition {
  id: string;
  name: string;
  /** Number of base Process cycles consumed by one Device job. */
  inputCycles: number;
  /** Number of base Process output cycles produced by one Device job. */
  outputCycles: number;
  /** Multiplier applied to Process duration after Device base speed. */
  durationMultiplier: { numerator: number; denominator: number };
  /** Multiplier applied to Device base active power. */
  powerMultiplier: { numerator: number; denominator: number };
  /** Extra project Resources consumed once per mode job through fixed physical ports. */
  auxiliaryInputs: Array<{ resource: ResourceId; count: number; port: PortId }>;
  /** Every Process input batch must have at least this treatment level. Zero accepts untreated material. */
  minimumInputTreatmentLevel: number;
}

export interface MaterialTreatmentModeDefinition {
  id: string;
  name: string;
  level: number;
  durationTicks: Tick;
  itemCount: number;
  agent: { resource: ResourceId; count: number };
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
    /** Exact project-local Processes this equipment is physically qualified to execute. */
    processes: ProcessId[];
    categories: string[];
    speed: { numerator: number; denominator: number };
    inputPorts: PortId[];
    outputPorts: PortId[];
    modes: ProductionModeDefinition[];
    /** Fixed equipment work required before executing a different Process setupGroup. */
    changeover?: { durationTicks: Tick; powerMilliWatts: number };
    /** Evaluator-owned usage limit, deterministic process drift, and fixed physical restoration work. */
    maintenance?: {
      maximumJobs: number;
      durationTicks: Tick;
      powerMilliWatts: number;
      /** Active stage is the greatest afterJobs threshold reached before a production job starts. */
      drift?: Array<{
        afterJobs: number;
        durationMultiplier: { numerator: number; denominator: number };
        powerMultiplier: { numerator: number; denominator: number };
        defects: string[];
      }>;
    };
  };
  extraction?: {
    resources: ResourceId[];
    radius: number;
    outputBuffer: BufferId;
    cycleTicks: Tick;
    itemsPerCycle: number;
  };
  treatment?: {
    inputBuffer: BufferId;
    outputBuffer: BufferId;
    agentBuffer: BufferId;
    modes: MaterialTreatmentModeDefinition[];
  };
  logistics?: {
    roles: LogisticsRole[];
    carrierKinds?: Array<"local" | "inter-zone">;
    /** Energy removed from the departing station for one carrier mission. */
    missionEnergy?: { baseMilliJoules: number; milliJoulesPerDistance: number };
    /** Optional high-speed mission envelope: faster turnaround at a higher launch-energy cost. */
    highSpeedMission?: {
      durationMultiplier: { numerator: number; denominator: number };
      energyMultiplier: { numerator: number; denominator: number };
    };
    /** Physical grid span supported when this asset is used as a loader or unloader. */
    endpointRange?: { minimum: number; maximum: number };
  };
  logisticsStation?: {
    networkKinds: Array<"local" | "inter-zone">;
    buffer: BufferId;
    slots: number;
    energyCapacityMilliJoules: number;
    maximumChargeMilliWatts: number;
  };
  runtime: { apiVersion: 1; entry: string };
  power: {
    /** Connected standby draw while the Device is not doing active work. */
    idleMilliWatts: number;
    /** Total draw while active, inclusive of the standby baseline. */
    activeMilliWatts: number;
    generation?:
      | { kind: "renewable"; outputMilliWatts: number }
      | { kind: "fuel"; outputMilliWatts: number; fuelBuffer: BufferId; fuels: ResourceId[] };
    distribution?: { connectionRange: number; coverageRange: number };
    storage?: { capacityMilliJoules: number; chargeMilliWatts: number; dischargeMilliWatts: number };
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
  /** Input-only lower bound. Omitted means any treatment level is acceptable. */
  minimumTreatmentLevel?: number;
  /** Output/transit exact level. Omitted means untreated level zero. */
  treatmentLevel?: number;
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
    mode: Readonly<{ id: string; name: string; inputCycles: number; outputCycles: number }>;
    powerMilliWatts: number;
    inputs: ResourceBufferQuantity[];
    outputs: ResourceBufferQuantity[];
  }>;
  treatment?: Readonly<{
    id: string;
    name: string;
    level: number;
    durationTicks: Tick;
    itemCount: number;
    inputBuffer: BufferId;
    outputBuffer: BufferId;
    agent: Readonly<{ buffer: BufferId; resource: ResourceId; count: number }>;
  }>;
  /** Exact buffer lots keyed by Resource then decimal treatment level. */
  materialBatches: Readonly<Record<BufferId, Readonly<Record<ResourceId, Readonly<Record<string, number>>>>>>;
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
  | { kind: "treat"; operation: string; durationTicks: Tick; resource: ResourceId; inputTreatmentLevel: number; count: number; powerMilliWatts?: number }
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
  kind: "industrial-zone";
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
export type DispatchPolicy = "fifo" | "round-robin" | "shortage-first";
export type PowerAllocationPolicy = "proportional" | "priority-load-shedding";
export type RecipeDispatchPolicy = "authored-order" | "shortest-cycle" | "highest-priority" | "minimize-changeover" | "oldest-lot" | "earliest-due-date" | "highest-lot-priority";
export type LotDispatchPolicy = "fifo" | "oldest-release" | "earliest-due-date" | "highest-priority";
export type LotReleaseDispatchPolicy = "fifo" | "earliest-due-date" | "highest-priority";
export interface ConwipReleasePolicy {
  kind: "conwip";
  /** Maximum released, non-terminal tracked lots admitted anywhere in the factory. */
  maximumWip: number;
  /** A closed controller opens again only at or below this WIP, allowing deterministic replenishment waves. */
  reopenAtWip: number;
  /** Optional service guard: a delayed eligible lot may reopen below the hard cap before the low watermark. */
  maximumReleaseDelayTicks?: Tick;
  /** Deterministic arbitration when more eligible lots exist than open WIP slots. */
  dispatch: LotReleaseDispatchPolicy;
}
export interface BlueprintRecipe {
  process: ProcessId;
  mode: string;
  /** Higher values win when recipeDispatch is highest-priority. */
  priority?: number;
  /** Exact physical port selected for each Process input Resource. */
  inputs: Record<ResourceId, PortId>;
  /** Exact physical port selected for each Process output Resource. */
  outputs: Record<ResourceId, PortId>;
}
export interface BlueprintDevice {
  id: DeviceInstanceId;
  asset: DeviceAssetId;
  region: string;
  position: GridPosition;
  rotation: Rotation;
  /** A sorter-like attachment owned by one physical connection endpoint. Its position is the belt-side anchor cell. */
  transportEndpoint?: {
    connection: ConnectionId;
    stage: "loader" | "unloader";
    distance: number;
  };
  recipe?: BlueprintRecipe;
  /** Qualified operations available to a shared industrial work center. */
  recipes?: BlueprintRecipe[];
  treatment?: { mode: string };
  /** Instance-level Resource contracts. Each entry narrows the corresponding asset buffer; an empty list disables that buffer. */
  bufferFilters?: Record<BufferId, ResourceId[]>;
  /** Instance-level ingress/egress contracts. Each entry narrows one physical port independently. */
  portFilters?: Record<PortId, ResourceId[]>;
  resourceNodes?: string[];
  config?: Record<string, unknown>;
  policy?: {
    dispatch?: DispatchPolicy;
    /** Deterministic selection among ready qualified operations. */
    recipeDispatch?: RecipeDispatchPolicy;
    /** Deterministic selection of identity-preserving lots within a ready operation. */
    lotDispatch?: LotDispatchPolicy;
    /** Setup-sensitive work-center campaign formation before switching to another recipe family. */
    setupCampaign?: {
      /** Change over early once this many identity-preserving lots are resident for the target setup group. */
      minimumReadyLots: number;
      /** Otherwise release the held changeover after this much equipment hold time. */
      maximumHoldTicks: Tick;
    };
    /** Pull fixed maintenance into an idle window after this many completed production jobs. */
    preventiveMaintenance?: { minimumJobs: number };
    /** Higher authored priority wins finite grid power; equal tiers use stable Device ids. */
    powerPriority?: number;
    /** Station-only grid draw used to recharge its carrier-launch energy buffer. */
    stationChargeMilliWatts?: number;
    /** Station-only routing policy for energy-intensive high-speed carrier missions. */
    highSpeedTransport?: { enabled: boolean; minimumDistance: number };
    inputPriority?: string;
    outputPriority?: string;
    filter?: { resource: ResourceId; outputPort: string };
  };
}
export interface BlueprintConnection {
  id: ConnectionId;
  from: { device: DeviceInstanceId; port: string };
  to: { device: DeviceInstanceId; port: string };
  /** Exact Resource allowlist for this physical lane. Runtime transport may never infer or expand it. */
  resources: ResourceId[];
  path: GridPosition[];
  /** Requested items per cargo stack. Omit to use the maximum supported by every transport stage and Resource. */
  stackSize?: number;
  logistics: {
    /** Explicit sorter Device instance attached to the source port and first path cell. */
    loader: { device: DeviceInstanceId };
    line: { deviceAsset: DeviceAssetId };
    /** Explicit sorter Device instance attached to the last path cell and target port. */
    unloader: { device: DeviceInstanceId };
  };
}
export interface BlueprintLogisticsSlot {
  resource: ResourceId;
  mode: "supply" | "demand" | "storage";
  /** Maximum resident plus inbound quantity for this Resource in the station buffer. */
  capacity: number;
  minimumBatch?: number;
  /** Higher authored priority wins the source station's finite home-fleet capacity; the network policy resolves equal tiers. */
  priority?: number;
  /** Supply mode only: inventory at or below this quantity is retained for local use. */
  supplyReserve?: number;
  /** Demand mode only: remote carriers replenish only up to this quantity. */
  demandTarget?: number;
}
export interface BlueprintLogisticsStation {
  device: DeviceInstanceId;
  /** Carrier equipment physically based at this station. A zero count is an explicit empty depot. */
  fleet: { deviceAsset: DeviceAssetId; count: number };
  slots: BlueprintLogisticsSlot[];
}
export interface BlueprintLogisticsNetwork {
  id: string;
  kind: "local" | "inter-zone";
  /** Route arbitration among station-owned fleets. Omit to inherit the Blueprint factory policy. */
  dispatch?: DispatchPolicy;
  stations: BlueprintLogisticsStation[];
}
export interface Blueprint {
  version: 1;
  revision?: string;
  devices: BlueprintDevice[];
  connections: BlueprintConnection[];
  logisticsNetworks: BlueprintLogisticsNetwork[];
  policies: {
    dispatch?: DispatchPolicy;
    powerAllocation: PowerAllocationPolicy;
    /** Omit for open-loop admission as soon as the Scenario release and physical boundary permit it. */
    lotRelease?: ConwipReleasePolicy;
  };
}

export interface ScenarioFailure { device: DeviceInstanceId; atTick: Tick; durationTicks: Tick }
export interface ScenarioGeneratorProfile {
  /** Environmental scope. Every matching renewable Device, including later Blueprint additions, uses this curve. */
  region: string;
  asset?: DeviceAssetId;
  /** The piecewise-constant curve repeats after this many ticks. */
  periodTicks: Tick;
  /** Integer output fraction of the Device's rated renewable output. The first point must start at tick zero. */
  points: Array<{ atTick: Tick; outputPermille: number }>;
}
export interface Scenario {
  id: string;
  name: string;
  durationTicks: Tick;
  initialBuffers?: Record<DeviceInstanceId, Record<BufferId, Record<ResourceId, number>>>;
  /** Scenario-owned identity-preserving lot availability schedule. Tracked Resources may not appear in initialBuffers. */
  lotReleases?: Array<{
    id: string;
    device: DeviceInstanceId;
    buffer: BufferId;
    resource: ResourceId;
    releaseTick: Tick;
    priority?: number;
    dueTick?: Tick;
  }>;
  /** Scenario-owned setup state at tick zero for setup-sensitive production Devices. */
  initialSetups?: Record<DeviceInstanceId, string>;
  /** Fixed, deterministic process excursions applied once to named lots when the matching operation completes. */
  qualityExcursions?: Array<{
    id: string;
    process: ProcessId;
    lot: string;
    defects: string[];
  }>;
  /** Treated subsets of initialBuffers. Undeclared remainder is untreated level zero. */
  initialTreatments?: Array<{ device: DeviceInstanceId; buffer: BufferId; resource: ResourceId; level: number; count: number }>;
  initialEnergyMilliJoules?: Record<DeviceInstanceId, number>;
  /** Scenario-owned intermittent output curves for renewable generators. */
  renewableProfiles?: ScenarioGeneratorProfile[];
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
    /** Penalty per minute of mean completed-lot cycle time. */
    cycleTime?: number;
    /** Penalty per minute of mean completed-lot tardiness. */
    tardiness?: number;
    /** Penalty per completed equipment changeover. */
    changeovers?: number;
    /** Penalty per target lot that escapes delivery with a latent defect. */
    qualityEscapes?: number;
    /** Penalty per completed rework cycle. */
    rework?: number;
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
export interface CompiledDevicePort extends DevicePort {
  /** Effective Resource contract after asset, buffer, instance-port, and recipe narrowing. */
  accepts: ResourceId[] | ["*"];
}
export interface CompiledDevice extends BlueprintDevice {
  assetDef: DeviceAsset;
  footprint: { width: number; height: number };
  ports: CompiledDevicePort[];
  buffers: Record<BufferId, CompiledDeviceBuffer>;
  processPlan?: {
    definition: IndustrialProcess;
    mode: ProductionModeDefinition;
    durationTicks: Tick;
    powerMilliWatts: number;
    inputs: ResourceBufferQuantity[];
    outputs: ResourceBufferQuantity[];
    priority: number;
    /** Identity-preserving input/output pairs. Counts are always equal. */
    lotTransfers: Array<{ family: string; input: ResourceBufferQuantity; output: ResourceBufferQuantity }>;
    quality?:
      | {
        kind: "inspection";
        detects: string[];
        passOutput: ResourceBufferQuantity;
        rejectOutput: ResourceBufferQuantity;
        scrapOutput?: ResourceBufferQuantity;
        maxReworkCycles: number;
      }
      | { kind: "rework"; repairs: string[] };
    setupGroup?: string;
    changeoverDurationTicks?: Tick;
    changeoverPowerMilliWatts?: number;
  };
  /** One entry per qualified operation. A singleton also appears as processPlan. */
  processPlans: Array<NonNullable<CompiledDevice["processPlan"]>>;
  treatmentPlan?: {
    mode: MaterialTreatmentModeDefinition;
    inputBuffer: BufferId;
    outputBuffer: BufferId;
    agentBuffer: BufferId;
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
  storagePlan?: { capacityMilliJoules: number; chargeMilliWatts: number; dischargeMilliWatts: number };
  stationEnergyPlan?: { capacityMilliJoules: number; chargeMilliWatts: number };
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
    /** Present for loader/unloader; the line is represented by transport cells. */
    device?: CompiledDevice;
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
  supplyReserve: number;
  demandTarget: number;
  supplyPriority: number;
  demandPriority: number;
  minimumBatch: number;
  distance: number;
  carrierCapacity: number;
  carrierAsset: DeviceAssetId;
  fleetSize: number;
  /** Effective batch capacity after intersecting carrier and both station slots. */
  capacity: number;
  standardTravelTicks: Tick;
  standardRoundTripTicks: Tick;
  standardMissionEnergyMilliJoules: number;
  travelTicks: Tick;
  roundTripTicks: Tick;
  missionEnergyMilliJoules: number;
  highSpeed?: {
    enabled: boolean;
    travelTicks: Tick;
    roundTripTicks: Tick;
    missionEnergyMilliJoules: number;
  };
}
export interface CompiledLogisticsNetwork {
  id: string;
  kind: "local" | "inter-zone";
  dispatchPolicy: DispatchPolicy;
  fleets: Array<{ station: DeviceInstanceId; region: string; asset: DeviceAsset; count: number }>;
  stations: BlueprintLogisticsStation[];
  routes: CompiledLogisticsRoute[];
}
export interface CompiledPowerGrid {
  id: string;
  region: string;
  distributors: DeviceInstanceId[];
  members: DeviceInstanceId[];
  transportStages: Array<{ connection: ConnectionId; stage: "loader" | "unloader"; device: DeviceInstanceId }>;
  productionMilliWatts: number;
  idleConsumptionMilliWatts: number;
  ratedConsumptionMilliWatts: number;
  storageDevices: DeviceInstanceId[];
  storageCapacityMilliJoules: number;
  storageChargeMilliWatts: number;
  storageDischargeMilliWatts: number;
}
export interface CompiledFactoryProject {
  rootDir: string;
  selection: { world: string; blueprint: string; scenario: string; objective: string };
  manifest: InmManifest;
  resources: Record<ResourceId, ResourceAsset>;
  processes: Record<ProcessId, IndustrialProcess>;
  routes: Record<RouteId, ProductRoute>;
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
  routeCatalogHash: string;
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
  remainingTicks: Tick;
  workedTicks: Tick;
  resumedAt: Tick;
  /** Full-speed work multiplier currently assigned by the grid, in parts per million. */
  powerSatisfactionPpm: number;
  powerMilliWatts: number;
  produce: ResourceBufferQuantity[];
  extraction?: { node: string; count: number };
  generationMilliWatts?: number;
  fuel?: { resource: ResourceId; count: number; energyMilliJoules: number };
  treatment?: { resource: ResourceId; fromLevel: number; toLevel: number; count: number; agentResource: ResourceId; agentCount: number };
  lotTransfers?: Array<{ lotIds: string[]; output: ResourceBufferQuantity }>;
  changeover?: { from: string | null; to: string };
  /** Marks evaluator-owned equipment maintenance rather than a material-processing job. */
  maintenance?: { cause: "mandatory" | "opportunistic" };
  /** Only successfully completed jobs with this marker consume the maintenance usage budget. */
  production?: true;
  /** Evaluator-owned wear state captured when this production job started. */
  equipmentDrift?: {
    afterJobs: number;
    jobsSinceMaintenance: number;
    durationMultiplier: { numerator: number; denominator: number };
    powerMultiplier: { numerator: number; denominator: number };
    defects: string[];
  };
  quality?:
    | { kind: "inspection"; lotIds: string[]; detectedDefects: string[]; result: "pass" | "reject" | "scrap" }
    | { kind: "rework"; lotIds: string[]; repairs: string[] };
}
export type WorkLotStatus = "scheduled" | "queued" | "processing" | "transport" | "completed" | "scrapped";
export type LotReleaseBlockReason = "buffer-capacity" | "resource-capacity" | "conwip-limit";
export interface WorkLot {
  id: string;
  family: string;
  resource: ResourceId;
  treatmentLevel: number;
  priority: number;
  plannedReleaseTick: Tick;
  releasedAtTick?: Tick;
  releaseWait: {
    reason: LotReleaseBlockReason | null;
    sinceTick: Tick;
    ticks: Record<LotReleaseBlockReason, Tick>;
    encountered: LotReleaseBlockReason[];
  };
  dueTick?: Tick;
  route: {
    id: RouteId;
    step: string | null;
    completedSteps: number;
    visits: Record<string, number>;
    reentrantTransitions: number;
    stepEnteredAtTick: Tick | null;
    queue: Record<string, { starts: number; totalTicks: Tick; maximumTicks: Tick; violations: number }>;
    queueTimeViolations: number;
    terminal: "complete" | "scrap" | null;
  };
  quality: {
    defects: string[];
    appliedExcursions: string[];
    inspections: number;
    passes: number;
    rejections: number;
    scrapDispositions: number;
    reworkCycles: number;
  };
  status: WorkLotStatus;
  statusSinceTick: Tick;
  queueTicks: Tick;
  processTicks: Tick;
  transportTicks: Tick;
  location:
    | { kind: "release"; device: DeviceInstanceId; buffer: BufferId }
    | { kind: "buffer"; device: DeviceInstanceId; buffer: BufferId }
    | { kind: "device"; device: DeviceInstanceId }
    | { kind: "transit"; transit: string }
    | { kind: "completed"; device: DeviceInstanceId }
    | { kind: "scrapped"; device: DeviceInstanceId; reason: string };
  completedAtTick?: Tick;
}
export interface DeviceRuntimeState {
  status: DeviceStatus;
  /** Whether this Device currently receives its connected standby baseline. */
  idlePowered: boolean;
  buffers: Record<BufferId, Record<ResourceId, number>>;
  /** Authoritative lot breakdown; its per-Resource sum always equals buffers. */
  materialBatches: Record<BufferId, Record<ResourceId, Record<string, number>>>;
  /** FIFO-preserving identities for Resources whose tracking kind is lot. */
  lotIds: Record<BufferId, Record<ResourceId, string[]>>;
  setup?: {
    group: string | null;
    changeovers: number;
    setupTicks: Tick;
    campaignHolds: number;
    campaignHoldTicks: Tick;
    campaignMinimumLotReleases: number;
    campaignMaximumHoldReleases: number;
    campaign?: { targetGroup: string; sinceTick: Tick; deadlineTick: Tick };
  };
  maintenance?: {
    jobsSinceMaintenance: number;
    completed: number;
    mandatory: number;
    opportunistic: number;
    cancelled: number;
    maintenanceTicks: Tick;
    driftedJobs: number;
    driftedLots: number;
    driftDefects: number;
  };
  progressTicks?: number;
  activeJob?: ActiveDeviceJob;
  energyStorage?: { capacityMilliJoules: number; storedMilliJoules: number; initialMilliJoules: number; chargedMilliJoules: number; dischargedMilliJoules: number };
  stationEnergy?: {
    capacityMilliJoules: number;
    storedMilliJoules: number;
    initialMilliJoules: number;
    chargedMilliJoules: number;
    spentMilliJoules: number;
    chargeSatisfactionPpm: number;
  };
}
export interface ResourceTransit {
  id: string;
  resource: ResourceId;
  count: number;
  treatmentLevel: number;
  lotIds?: string[];
  from: DeviceInstanceId;
  fromBuffer: BufferId;
  to: DeviceInstanceId;
  toBuffer: BufferId;
  departTick: Tick;
  arriveTick: Tick;
  logisticsRoute?: string;
  highSpeed?: boolean;
}
export interface CarrierMission {
  id: string;
  network: string;
  route: string;
  homeStation: DeviceInstanceId;
  carrierAsset: DeviceAssetId;
  phase: "outbound" | "returning";
  departTick: Tick;
  cargoArriveTick: Tick;
  returnTick: Tick;
  highSpeed?: boolean;
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
  lots: Record<string, WorkLot>;
  lotReleaseControl: { open: boolean };
  resourceNodes: Record<string, { remaining: number; reserved: number; extracted: number }>;
  transports: Record<ConnectionId, BeltTransit[]>;
  logisticsTransports: Record<string, ResourceTransit[]>;
  logisticsMissions: Record<string, CarrierMission[]>;
  produced: Record<ResourceId, number>;
  consumed: Record<ResourceId, number>;
  energy: {
    availableMilliWatts: number;
    consumedMilliJoules: number;
    grids: Record<string, {
      availableMilliWatts: number;
      satisfactionPpm: number;
      consumedMilliJoules: number;
      storedMilliJoules: number;
      storageCapacityMilliJoules: number;
      chargedMilliJoules: number;
      dischargedMilliJoules: number;
    }>;
    fuelConsumed: Record<ResourceId, number>;
  };
  completedOrders: number;
  highSpeedMissions: number;
  carrierMissions: number;
  carrierReturns: number;
  materialTreatment: {
    treated: Record<ResourceId, Record<string, number>>;
    agentsConsumed: Record<ResourceId, number>;
  };
}

export type FactoryEvent =
  | { type: "lot.released"; tick: Tick; device: DeviceInstanceId; buffer: BufferId; lot: string; family: string; resource: ResourceId; plannedReleaseTick: Tick; releaseDelayTicks: Tick; releaseControl: "open-loop" | "conwip"; activeWipBeforeRelease: number }
  | { type: "lot.release-blocked"; tick: Tick; device: DeviceInstanceId; buffer: BufferId; lot: string; reason: LotReleaseBlockReason; activeWip: number; maximumWip: number | null }
  | { type: "lot.release-control-opened"; tick: Tick; activeWip: number; reopenAtWip: number; maximumWip: number; cause: "reopen-threshold" | "maximum-release-delay" }
  | { type: "lot.release-control-closed"; tick: Tick; activeWip: number; reopenAtWip: number; maximumWip: number }
  | { type: "lot.route-advanced"; tick: Tick; device: DeviceInstanceId; lot: string; route: RouteId; fromStep: string; process: ProcessId; outputResource: ResourceId; toStep: string | null; terminal: "complete" | "scrap" | null; visit: number; reentrant: boolean }
  | { type: "lot.queue-time-violation"; tick: Tick; device: DeviceInstanceId; lot: string; route: RouteId; step: string; process: ProcessId; queueTicks: Tick; maximumTicks: Tick; defects: string[] }
  | { type: "device.changeover-start"; tick: Tick; device: DeviceInstanceId; from: string | null; to: string; durationTicks: Tick }
  | { type: "device.changeover-finish"; tick: Tick; device: DeviceInstanceId; from: string | null; to: string; durationTicks: Tick }
  | { type: "device.changeover-cancelled"; tick: Tick; device: DeviceInstanceId; from: string | null; to: string; reason: "equipment-breakdown" }
  | { type: "device.maintenance-start"; tick: Tick; device: DeviceInstanceId; cause: "mandatory" | "opportunistic"; jobsSinceMaintenance: number; durationTicks: Tick }
  | { type: "device.maintenance-finish"; tick: Tick; device: DeviceInstanceId; cause: "mandatory" | "opportunistic"; jobsSinceMaintenance: number; durationTicks: Tick }
  | { type: "device.maintenance-cancelled"; tick: Tick; device: DeviceInstanceId; cause: "mandatory" | "opportunistic"; jobsSinceMaintenance: number; reason: "equipment-breakdown" }
  | { type: "device.process-drift"; tick: Tick; device: DeviceInstanceId; process: ProcessId; lotIds: string[]; afterJobs: number; jobsSinceMaintenance: number; durationTicks: Tick; powerMilliWatts: number; defects: string[] }
  | { type: "device.campaign-held"; tick: Tick; device: DeviceInstanceId; from: string; to: string; readyLots: number; minimumReadyLots: number; deadlineTick: Tick }
  | { type: "device.campaign-released"; tick: Tick; device: DeviceInstanceId; from: string; to: string; readyLots: number; heldTicks: Tick; cause: "minimum-ready-lots" | "maximum-hold" }
  | { type: "device.start"; tick: Tick; device: DeviceInstanceId; operation: string; durationTicks: Tick; lotIds?: string[] }
  | { type: "device.finish"; tick: Tick; device: DeviceInstanceId; operation: string; produced: ResourceBufferQuantity[]; lotIds?: string[] }
  | { type: "transport.stage-start"; tick: Tick; device: DeviceInstanceId; connection: ConnectionId; stage: "loader" | "unloader"; transitId: string; durationTicks: Tick }
  | { type: "transport.stage-finish"; tick: Tick; device: DeviceInstanceId; connection: ConnectionId; stage: "loader" | "unloader"; transitId: string }
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
  | { type: "logistics.return"; tick: Tick; mission: CarrierMission; network: string; route: string }
  | { type: "logistics.energy-shortage"; tick: Tick; device: DeviceInstanceId; network: string; route: string; requiredMilliJoules: number; storedMilliJoules: number }
  | { type: "logistics.energy-spent"; tick: Tick; device: DeviceInstanceId; network: string; route: string; energyMilliJoules: number; storedMilliJoules: number }
  | { type: "logistics.energy-full"; tick: Tick; device: DeviceInstanceId; grid: string; storedMilliJoules: number }
  | { type: "resource.consumed"; tick: Tick; device: DeviceInstanceId; resource: ResourceId; count: number; lotIds?: string[] }
  | { type: "lot.completed"; tick: Tick; device: DeviceInstanceId; lot: string; family: string; resource: ResourceId; cycleTicks: Tick; tardinessTicks: Tick }
  | { type: "lot.quality-excursion"; tick: Tick; device: DeviceInstanceId; lot: string; process: ProcessId; excursion: string; defects: string[] }
  | { type: "lot.inspected"; tick: Tick; device: DeviceInstanceId; lot: string; process: ProcessId; result: "pass" | "reject" | "scrap"; detectedDefects: string[]; reworkCycles: number }
  | { type: "lot.reworked"; tick: Tick; device: DeviceInstanceId; lot: string; process: ProcessId; repairedDefects: string[]; remainingDefects: string[]; reworkCycles: number }
  | { type: "lot.scrapped"; tick: Tick; device: DeviceInstanceId; lot: string; family: string; resource: ResourceId; reason: "equipment-breakdown" | "quality-rejection" }
  | { type: "material.treated"; tick: Tick; device: DeviceInstanceId; resource: ResourceId; count: number; fromLevel: number; toLevel: number; agentResource: ResourceId; agentCount: number }
  | { type: "buffer.blocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "buffer.unblocked"; tick: Tick; device: DeviceInstanceId }
  | { type: "power.shortage"; tick: Tick; device: DeviceInstanceId; grid: string | null; requiredMilliWatts: number; availableMilliWatts: number; remainingTicks?: Tick; workedTicks?: Tick }
  | { type: "power.standby-restored"; tick: Tick; device: DeviceInstanceId; grid: string }
  | { type: "transport.power-shortage"; tick: Tick; device: DeviceInstanceId; connection: ConnectionId; stage: "loader" | "unloader"; grid: string | null; requiredMilliWatts: number; availableMilliWatts: number }
  | { type: "transport.power-restored"; tick: Tick; device: DeviceInstanceId; connection: ConnectionId; stage: "loader" | "unloader"; grid: string }
  | { type: "power.fuel-loaded"; tick: Tick; device: DeviceInstanceId; grid: string; resource: ResourceId; count: number; energyMilliJoules: number; durationTicks: Tick }
  | { type: "power.fuel-spent"; tick: Tick; device: DeviceInstanceId; grid: string; resource: ResourceId; count: number }
  | { type: "power.generation-changed"; tick: Tick; device: DeviceInstanceId; grid: string; ratedMilliWatts: number; outputMilliWatts: number; outputPermille: number }
  | { type: "power.satisfaction-changed"; tick: Tick; grid: string; demandMilliWatts: number; availableMilliWatts: number; satisfactionPpm: number }
  | { type: "power.storage-full"; tick: Tick; device: DeviceInstanceId; grid: string; storedMilliJoules: number }
  | { type: "power.storage-depleted"; tick: Tick; device: DeviceInstanceId; grid: string }
  | { type: "power.restored"; tick: Tick; device: DeviceInstanceId; grid: string; remainingTicks: Tick }
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
  cycleTime: number;
  tardiness: number;
  changeovers: number;
  qualityEscapes: number;
  rework: number;
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
  lotFlow: {
    family: string | null;
    scheduled: number;
    released: number;
    pendingRelease: number;
    completed: number;
    scrapped: number;
    onTimeCompleted: number;
    inProgress: number;
    meanCycleTimeTicks: number;
    p95CycleTimeTicks: number;
    maximumCycleTimeTicks: number;
    meanQueueTimeTicks: number;
    meanProcessTimeTicks: number;
    meanTransportTimeTicks: number;
    meanTardinessTicks: number;
    maximumTardinessTicks: number;
  };
  routeFlow: Record<RouteId, {
    family: string;
    scheduled: number;
    completed: number;
    scrapped: number;
    inProgress: number;
    transitions: number;
    reentrantTransitions: number;
    queueTimeViolations: number;
    violatedLots: number;
    steps: Record<string, {
      visits: number;
      starts: number;
      activeLots: number;
      meanQueueTicks: Tick;
      maximumQueueTicks: Tick;
      queueTimeMaximumTicks: Tick | null;
      queueTimeViolations: number;
    }>;
  }>;
  releaseFlow: {
    scheduled: number;
    released: number;
    pending: number;
    plannedSpanTicks: number;
    actualSpanTicks: number;
    meanPlannedIntervalTicks: number;
    meanActualIntervalTicks: number;
    meanReleaseDelayTicks: number;
    maximumReleaseDelayTicks: number;
    control: "open-loop" | "conwip";
    maximumWip: number | null;
    reopenAtWip: number | null;
    maximumReleaseDelayPolicyTicks: Tick | null;
    dispatch: LotReleaseDispatchPolicy | null;
    peakActiveLots: number;
    capacityBlockedLots: number;
    capacityBlockedTicks: Tick;
    controlBlockedLots: number;
    controlBlockedTicks: Tick;
    serviceLevelOpenings: number;
  };
  qualityFlow: {
    inspectedLots: number;
    totalInspections: number;
    passedInspections: number;
    rejectedInspections: number;
    scrapDispositions: number;
    reworkedLots: number;
    totalReworkCycles: number;
    defectFreeCompleted: number;
    firstPassCompleted: number;
    escapedDefects: number;
    activeDefects: number;
    goodYield: number;
    firstPassYield: number;
  };
  batchFlow: {
    batchOperations: number;
    jobs: number;
    lots: number;
    averageLotsPerJob: number;
    meanQueueWaitTicksPerLot: number;
    operations: Record<string, {
      device: string;
      process: string;
      mode: string;
      expectedLotsPerJob: number;
      jobs: number;
      lots: number;
      averageLotsPerJob: number;
      maximumLotsPerJob: number;
      meanQueueWaitTicksPerLot: number;
    }>;
  };
  energyConsumedMilliJoules: number;
  energyStorage: Record<string, {
    initialMilliJoules: number;
    storedMilliJoules: number;
    capacityMilliJoules: number;
    chargedMilliJoules: number;
    dischargedMilliJoules: number;
  }>;
  stationEnergy: Record<string, {
    initialMilliJoules: number;
    storedMilliJoules: number;
    capacityMilliJoules: number;
    chargedMilliJoules: number;
    spentMilliJoules: number;
    configuredChargeMilliWatts: number;
  }>;
  powerGrids: Record<string, {
    generatedMilliJoules: number;
    demandMilliJoules: number;
    servedMilliJoules: number;
    unservedMilliJoules: number;
    curtailedMilliJoules: number;
    peakGenerationMilliWatts: number;
    peakDemandMilliWatts: number;
    peakDeficitMilliWatts: number;
    peakSurplusMilliWatts: number;
    averageSatisfactionPpm: number;
    minimumSatisfactionPpm: number;
    /** Largest contiguous raw energy deficit observed between renewable-surplus intervals. */
    requiredStorageCapacityMilliJoules: number;
  }>;
  fuelConsumed: Record<ResourceId, number>;
  highSpeedMissions: number;
  carrierMissions: number;
  carrierReturns: number;
  /** Keyed by `<network>:<station>` because one physical station may participate in several networks. */
  stationFleets: Record<string, {
    network: string;
    station: DeviceInstanceId;
    carrierAsset: DeviceAssetId;
    configuredCarriers: number;
    activeMissions: number;
    completedReturns: number;
    utilization: number;
  }>;
  materialTreatment: {
    treated: Record<ResourceId, Record<string, number>>;
    agentsConsumed: Record<ResourceId, number>;
  };
  equipmentSetups: {
    totalChangeovers: number;
    totalSetupTicks: Tick;
    totalCampaignHolds: number;
    totalCampaignHoldTicks: Tick;
    campaignMinimumLotReleases: number;
    campaignMaximumHoldReleases: number;
    devices: Record<DeviceInstanceId, {
      group: string | null;
      changeovers: number;
      setupTicks: Tick;
      campaignHolds: number;
      campaignHoldTicks: Tick;
      campaignMinimumLotReleases: number;
      campaignMaximumHoldReleases: number;
      campaign?: { targetGroup: string; sinceTick: Tick; deadlineTick: Tick };
    }>;
  };
  equipmentMaintenance: {
    totalCompleted: number;
    totalMandatory: number;
    totalOpportunistic: number;
    totalCancelled: number;
    totalMaintenanceTicks: Tick;
    totalDriftedJobs: number;
    totalDriftedLots: number;
    totalDriftDefects: number;
    devices: Record<DeviceInstanceId, {
      jobsSinceMaintenance: number;
      completed: number;
      mandatory: number;
      opportunistic: number;
      cancelled: number;
      maintenanceTicks: Tick;
      driftedJobs: number;
      driftedLots: number;
      driftDefects: number;
    }>;
  };
  totalBuildCost: number;
  occupiedArea: number;
  machineUtilization: Record<DeviceInstanceId, number>;
  idleTime: Record<DeviceInstanceId, Tick>;
  waitingInputTime: Record<DeviceInstanceId, Tick>;
  blockedOutputTime: Record<DeviceInstanceId, Tick>;
  unpoweredTime: Record<DeviceInstanceId, Tick>;
  failedTime: Record<DeviceInstanceId, Tick>;
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
