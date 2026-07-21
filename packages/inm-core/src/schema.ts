import { z } from "zod";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const visualColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const relativeAssetFile = z.string().min(1).refine((value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."), "must be a relative path inside the asset directory");
const runtimeEntry = relativeAssetFile.refine((value) => value.endsWith(".ts"), "device runtime entry must be a TypeScript file");
const relativeDirectory = z.string().min(1).refine((value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."), "must be a relative directory inside the workspace");

export const resourceVisualSchema = z.object({
  shape: z.enum(["box", "sphere", "cylinder"]),
  texture: relativeAssetFile.nullable(),
  color: visualColor.nullable(),
  icon: relativeAssetFile.nullable(),
}).strict();

export const deviceVisualSchema = z.object({
  shape: z.enum(["box", "cylinder", "sphere", "plane"]),
  height: z.number().positive(),
  texture: relativeAssetFile.nullable(),
  model: relativeAssetFile.nullable(),
  color: visualColor.nullable(),
  label: z.string(),
}).strict();

export const resourceAssetSchema = z.object({
  assetVersion: z.literal(1), type: z.literal("resource"), id, name: z.string().min(1), description: z.string(), tags: z.array(id),
  unit: z.object({ kind: z.enum(["discrete", "continuous"]), symbol: z.string().min(1), precision: nonNegativeInt }).strict(),
  transport: z.object({ stackSize: positiveInt }).strict(),
  fuel: z.object({ energyMilliJoules: positiveInt }).strict().optional(),
  files: z.object({ visual: relativeAssetFile }).strict(),
}).strict();

const processAmountSchema = z.object({ resource: id, count: positiveInt }).strict();
export const processSchema = z.object({
  version: z.literal(1), id, name: z.string().min(1), description: z.string(), category: id, tags: z.array(id),
  durationTicks: positiveInt, inputs: z.array(processAmountSchema), outputs: z.array(processAmountSchema).min(1),
}).strict();

const portSchema = z.object({
  id, direction: z.enum(["input", "output"]), kind: z.literal("resource"),
  side: z.enum(["north", "east", "south", "west"]), offset: nonNegativeInt, buffer: id,
}).strict();

const bufferSchema = z.object({
  id, role: z.enum(["input", "output", "internal"]), capacity: positiveInt,
  accepts: z.array(z.union([id, z.literal("*")])).min(1),
}).strict();

export const deviceAssetSchema = z.object({
  assetVersion: z.literal(1), type: z.literal("device"), id, name: z.string().min(1), description: z.string(), tags: z.array(id),
  capabilities: z.array(z.enum(["extract", "process", "treat", "store", "transport", "transport-junction", "station", "consume", "power"])).min(1),
  geometry: z.object({
    footprint: z.object({ width: positiveInt, height: positiveInt }).strict(),
    rotatable: z.boolean(), ports: z.array(portSchema),
  }).strict(),
  buffers: z.array(bufferSchema),
  production: z.object({
    categories: z.array(id).min(1),
    speed: z.object({ numerator: positiveInt, denominator: positiveInt }).strict(),
    inputPorts: z.array(id).min(1), outputPorts: z.array(id).min(1),
    modes: z.array(z.object({
      id, name: z.string().min(1), inputCycles: positiveInt, outputCycles: positiveInt,
      durationMultiplier: z.object({ numerator: positiveInt, denominator: positiveInt }).strict(),
      powerMultiplier: z.object({ numerator: positiveInt, denominator: positiveInt }).strict(),
      auxiliaryInputs: z.array(z.object({ resource: id, count: positiveInt, port: id }).strict()),
      minimumInputTreatmentLevel: nonNegativeInt,
    }).strict()).min(1),
  }).strict().optional(),
  extraction: z.object({
    resources: z.array(id).min(1), radius: positiveInt, outputBuffer: id,
    cycleTicks: positiveInt, itemsPerCycle: positiveInt,
  }).strict().optional(),
  treatment: z.object({
    inputBuffer: id, outputBuffer: id, agentBuffer: id,
    modes: z.array(z.object({
      id, name: z.string().min(1), level: positiveInt, durationTicks: positiveInt, itemCount: positiveInt,
      agent: z.object({ resource: id, count: positiveInt }).strict(),
    }).strict()).min(1),
  }).strict().optional(),
  logistics: z.object({
    roles: z.array(z.enum(["loader", "line", "unloader", "carrier"])).min(1),
    carrierKinds: z.array(z.enum(["local", "inter-zone"])).min(1).optional(),
    missionEnergy: z.object({ baseMilliJoules: nonNegativeInt, milliJoulesPerDistance: nonNegativeInt }).strict().optional(),
    highSpeedMission: z.object({
      durationMultiplier: z.object({ numerator: positiveInt, denominator: positiveInt }).strict(),
      energyMultiplier: z.object({ numerator: positiveInt, denominator: positiveInt }).strict(),
    }).strict().optional(),
    endpointRange: z.object({ minimum: positiveInt, maximum: positiveInt }).strict().optional(),
  }).strict().optional(),
  logisticsStation: z.object({
    networkKinds: z.array(z.enum(["local", "inter-zone"])).min(1), buffer: id, slots: positiveInt,
    energyCapacityMilliJoules: positiveInt, maximumChargeMilliWatts: positiveInt,
  }).strict().optional(),
  runtime: z.object({ apiVersion: z.literal(1), entry: runtimeEntry }).strict(),
  power: z.object({
    idleMilliWatts: nonNegativeInt,
    activeMilliWatts: nonNegativeInt,
    generation: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("renewable"), outputMilliWatts: positiveInt }).strict(),
      z.object({ kind: z.literal("fuel"), outputMilliWatts: positiveInt, fuelBuffer: id, fuels: z.array(id).min(1) }).strict(),
    ]).optional(),
    distribution: z.object({ connectionRange: positiveInt, coverageRange: positiveInt }).strict().optional(),
    storage: z.object({ capacityMilliJoules: positiveInt, chargeMilliWatts: positiveInt, dischargeMilliWatts: positiveInt }).strict().optional(),
  }).strict(),
  economics: z.object({ buildCost: nonNegativeInt }).strict(),
  files: z.object({ visual: relativeAssetFile }).strict(),
}).strict();

const regionSchema = z.object({
  id, name: z.string().min(1), kind: z.literal("industrial-zone"),
  coordinates: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }).strict(),
  bounds: z.object({ width: positiveInt, height: positiveInt }).strict(),
}).strict();

export const worldSchema = z.object({
  version: z.literal(1), id, name: z.string().min(1),
  regions: z.array(regionSchema).min(1),
  resourceNodes: z.array(z.object({
    id, region: id, resource: id,
    position: z.object({ x: nonNegativeInt, y: nonNegativeInt }).strict(),
    amount: positiveInt,
  }).strict()),
}).strict();

export const blueprintSchema = z.object({
  version: z.literal(1), revision: z.string().optional(),
  devices: z.array(z.object({
    id, asset: id, region: id, position: z.object({ x: nonNegativeInt, y: nonNegativeInt }).strict(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    transportEndpoint: z.object({
      connection: id, stage: z.enum(["loader", "unloader"]), distance: positiveInt,
    }).strict().optional(),
    recipe: z.object({
      process: id, mode: id,
      inputs: z.record(id),
      outputs: z.record(id),
    }).strict().optional(),
    treatment: z.object({ mode: id }).strict().optional(),
    bufferFilters: z.record(z.array(id)).optional(),
    portFilters: z.record(z.array(id)).optional(),
    resourceNodes: z.array(id).min(1).optional(),
    config: z.record(z.unknown()).optional(),
    policy: z.object({
      dispatch: z.enum(["fifo", "round-robin", "shortage-first"]).optional(),
      powerPriority: nonNegativeInt.optional(),
      stationChargeMilliWatts: nonNegativeInt.optional(),
      highSpeedTransport: z.object({ enabled: z.boolean(), minimumDistance: nonNegativeInt }).strict().optional(),
      inputPriority: id.optional(),
      outputPriority: id.optional(),
      filter: z.object({ resource: id, outputPort: id }).strict().optional(),
    }).strict().optional(),
  }).strict()),
  connections: z.array(z.object({
    id, from: z.object({ device: id, port: id }).strict(), to: z.object({ device: id, port: id }).strict(),
    resources: z.array(id).min(1),
    path: z.array(z.object({ x: nonNegativeInt, y: nonNegativeInt, level: nonNegativeInt.optional() }).strict()).min(1),
    stackSize: positiveInt.optional(),
    logistics: z.object({
      loader: z.object({ device: id }).strict(),
      line: z.object({ deviceAsset: id }).strict(),
      unloader: z.object({ device: id }).strict(),
    }).strict(),
  }).strict()),
  logisticsNetworks: z.array(z.object({
    id, kind: z.enum(["local", "inter-zone"]), dispatch: z.enum(["fifo", "round-robin", "shortage-first"]).optional(),
    stations: z.array(z.object({
      device: id,
      fleet: z.object({ deviceAsset: id, count: nonNegativeInt }).strict(),
      slots: z.array(z.object({
        resource: id, mode: z.enum(["supply", "demand", "storage"]), capacity: positiveInt,
        minimumBatch: positiveInt.optional(), priority: nonNegativeInt.optional(), supplyReserve: nonNegativeInt.optional(), demandTarget: positiveInt.optional(),
      }).strict()),
    }).strict()).min(2),
  }).strict()),
  policies: z.object({
    dispatch: z.enum(["fifo", "round-robin", "shortage-first"]).optional(),
    powerAllocation: z.enum(["proportional", "priority-load-shedding"]),
  }).strict(),
}).strict();

export const scenarioSchema = z.object({
  id, name: z.string().min(1), durationTicks: positiveInt,
  initialBuffers: z.record(z.record(z.record(nonNegativeInt))).optional(),
  initialTreatments: z.array(z.object({
    device: id, buffer: id, resource: id, level: positiveInt, count: positiveInt,
  }).strict()).optional(),
  initialEnergyMilliJoules: z.record(nonNegativeInt).optional(),
  renewableProfiles: z.array(z.object({
    region: id,
    asset: id.optional(),
    periodTicks: positiveInt,
    points: z.array(z.object({
      atTick: nonNegativeInt,
      outputPermille: z.number().int().min(0).max(1000),
    }).strict()).min(1),
  }).strict()).optional(),
  failures: z.array(z.object({ device: id, atTick: nonNegativeInt, durationTicks: positiveInt }).strict()).optional(),
}).strict();

export const objectiveSchema = z.object({
  id, name: z.string().min(1), targetResource: id, targetRegion: id, targetRatePerMinute: z.number().positive(),
  constraints: z.object({ maxBuildCost: nonNegativeInt.optional(), maxOccupiedArea: nonNegativeInt.optional(), minProduction: nonNegativeInt.optional() }).strict().optional(),
  weights: z.object({
    throughput: z.number(), onTimeDelivery: z.number().optional(), energy: z.number(),
    buildCost: z.number(), occupiedArea: z.number(), wip: z.number(), blocked: z.number(),
  }).strict(),
}).strict();

export const manifestSchema = z.object({
  version: z.literal(1), id, name: z.string().min(1), defaultWorld: id, defaultBlueprint: id, defaultScenario: id, defaultObjective: id,
}).strict();

export const workspaceSchema = z.object({
  version: z.literal(1), name: z.string().min(1), projectsDirectory: relativeDirectory, defaultProject: id.nullable(),
}).strict();

export type SchemaKind = "manifest" | "workspace" | "resource-asset" | "resource-visual" | "process" | "device-asset" | "device-visual" | "world" | "blueprint" | "scenario" | "objective";
export const schemas = {
  manifest: manifestSchema,
  workspace: workspaceSchema,
  "resource-asset": resourceAssetSchema,
  "resource-visual": resourceVisualSchema,
  process: processSchema,
  "device-asset": deviceAssetSchema,
  "device-visual": deviceVisualSchema,
  world: worldSchema,
  blueprint: blueprintSchema,
  scenario: scenarioSchema,
  objective: objectiveSchema,
} as const;
