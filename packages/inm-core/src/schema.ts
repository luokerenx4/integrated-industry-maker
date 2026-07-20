import { z } from "zod";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const visualColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const materialSchema = z.object({
  type: z.literal("material"), id, name: z.string().min(1),
  visual: z.object({
    shape: z.enum(["box", "sphere", "cylinder"]).optional(),
    texture: z.string().nullable().optional(), color: visualColor.nullable().optional(), icon: z.string().nullable().optional(),
  }).optional(),
  properties: z.object({ stackSize: positiveInt.optional() }).optional(),
}).strict();

const portSchema = z.object({
  id, direction: z.enum(["input", "output"]), kind: z.literal("material"),
  side: z.enum(["north", "east", "south", "west"]), offset: nonNegativeInt,
}).strict();

const behaviorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), material: id, count: positiveInt, durationTicks: positiveInt, outputCapacity: positiveInt.optional() }).strict(),
  z.object({ kind: z.literal("sink"), accepts: z.array(id).min(1) }).strict(),
  z.object({ kind: z.literal("processor"), supportedRecipes: z.array(id).min(1), inputCapacity: positiveInt, outputCapacity: positiveInt }).strict(),
  z.object({ kind: z.literal("storage"), capacity: positiveInt, accepts: z.array(z.union([id, z.literal("*")])).min(1) }).strict(),
  z.object({ kind: z.literal("transport"), capacity: positiveInt, travelTicksPerCell: positiveInt }).strict(),
  z.object({ kind: z.literal("power"), outputMilliWatts: positiveInt }).strict(),
]);

export const deviceSchema = z.object({
  type: z.literal("device"), id, name: z.string().min(1),
  geometry: z.object({
    footprint: z.object({ width: positiveInt, height: positiveInt }).strict(),
    rotatable: z.boolean(), ports: z.array(portSchema),
  }).strict(),
  behavior: behaviorSchema,
  simulation: z.object({ powerConsumptionMilliWatts: nonNegativeInt.optional() }).strict().optional(),
  economics: z.object({ buildCost: nonNegativeInt.optional() }).strict().optional(),
  visual: z.object({
    shape: z.enum(["box", "cylinder", "sphere", "plane"]).optional(), height: z.number().positive().optional(),
    texture: z.string().nullable().optional(), model: z.string().nullable().optional(), color: visualColor.nullable().optional(), label: z.string().optional(),
  }).strict().optional(),
}).strict();

const quantitySchema = z.object({ material: id, count: positiveInt }).strict();
export const recipeSchema = z.object({
  id, name: z.string().min(1), durationTicks: positiveInt,
  inputs: z.array(quantitySchema).min(1), outputs: z.array(quantitySchema).min(1),
}).strict();

const endpointSchema = z.object({ device: id, port: id }).strict();
export const blueprintSchema = z.object({
  version: z.literal(1), revision: z.string().optional(),
  bounds: z.object({ width: positiveInt, height: positiveInt }).strict(),
  devices: z.array(z.object({
    id, asset: id, position: z.object({ x: nonNegativeInt, y: nonNegativeInt }).strict(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    config: z.object({ recipe: id.optional(), accepts: z.array(id).optional() }).strict().optional(),
    policy: z.object({ dispatch: z.enum(["fifo", "round-robin"]).optional() }).strict().optional(),
  }).strict()),
  connections: z.array(z.object({
    id, from: endpointSchema, to: endpointSchema,
    transport: z.object({ deviceAsset: id }).strict(),
  }).strict()),
  policies: z.object({ dispatch: z.enum(["fifo", "round-robin"]).optional() }).strict().optional(),
}).strict();

export const scenarioSchema = z.object({
  id, name: z.string().min(1), durationTicks: positiveInt,
  initialInventories: z.record(z.record(nonNegativeInt)).optional(),
  failures: z.array(z.object({ device: id, atTick: nonNegativeInt, durationTicks: positiveInt }).strict()).optional(),
}).strict();

export const objectiveSchema = z.object({
  id, name: z.string().min(1), targetMaterial: id,
  constraints: z.object({ maxBuildCost: nonNegativeInt.optional(), maxOccupiedArea: nonNegativeInt.optional(), minProduction: nonNegativeInt.optional() }).strict().optional(),
  weights: z.object({
    throughput: z.number(), onTimeDelivery: z.number().optional(), energy: z.number(),
    buildCost: z.number(), occupiedArea: z.number(), wip: z.number(), blocked: z.number(),
  }).strict(),
}).strict();

export const manifestSchema = z.object({
  version: z.literal(1), name: z.string().min(1), defaultBlueprint: id, defaultScenario: id, defaultObjective: id,
}).strict();

export type SchemaKind = "manifest" | "material" | "device" | "recipe" | "blueprint" | "scenario" | "objective";
export const schemas = { manifest: manifestSchema, material: materialSchema, device: deviceSchema, recipe: recipeSchema, blueprint: blueprintSchema, scenario: scenarioSchema, objective: objectiveSchema } as const;
