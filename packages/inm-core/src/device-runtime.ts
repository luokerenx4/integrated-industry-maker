import { pathToFileURL } from "node:url";
import type {
  DeviceProgram, DeviceProgramContext, DeviceProgramDecision, DeviceTransportContext, DeviceTransportPlan,
  ResourceBufferQuantity,
} from "./types";

export class DeviceProgramError extends Error {
  constructor(public readonly assetId: string, message: string) {
    super(`Device program '${assetId}': ${message}`);
    this.name = "DeviceProgramError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

function amounts(value: unknown, path: string): ResourceBufferQuantity[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.buffer !== "string" || typeof item.resource !== "string" || !Number.isInteger(item.count) || (item.count as number) <= 0) {
      throw new Error(`${path}/${index} must contain buffer, resource, and a positive integer count`);
    }
    return { buffer: item.buffer, resource: item.resource, count: item.count as number };
  });
}

export function parseDeviceDecision(assetId: string, value: unknown): DeviceProgramDecision {
  try {
    if (!isRecord(value) || typeof value.kind !== "string") throw new Error("evaluate() must return a decision object");
    if (value.kind === "none") return { kind: "none" };
    if (value.kind === "wait") {
      if (value.reason !== "input" && value.reason !== "output" && value.reason !== "idle") throw new Error("wait.reason must be input, output, or idle");
      return { kind: "wait", reason: value.reason };
    }
    if (value.kind === "consume") {
      const consume = amounts(value.consume, "consume");
      if (!consume.length) throw new Error("consume decision must contain at least one amount");
      return { kind: "consume", consume };
    }
    if (value.kind === "extract") {
      if (typeof value.operation !== "string" || !value.operation) throw new Error("extract.operation must be a non-empty string");
      if (typeof value.node !== "string" || !value.node) throw new Error("extract.node must be a non-empty string");
      if (!Number.isInteger(value.durationTicks) || (value.durationTicks as number) <= 0) throw new Error("extract.durationTicks must be a positive integer");
      if (!Number.isInteger(value.count) || (value.count as number) <= 0) throw new Error("extract.count must be a positive integer");
      if (value.powerMilliWatts !== undefined && (!Number.isInteger(value.powerMilliWatts) || (value.powerMilliWatts as number) < 0)) throw new Error("extract.powerMilliWatts must be a non-negative integer");
      return {
        kind: "extract", operation: value.operation, node: value.node, durationTicks: value.durationTicks as number, count: value.count as number,
        ...(value.powerMilliWatts === undefined ? {} : { powerMilliWatts: value.powerMilliWatts as number }),
      };
    }
    if (value.kind === "generate") {
      if (typeof value.operation !== "string" || !value.operation) throw new Error("generate.operation must be a non-empty string");
      if (typeof value.resource !== "string" || !value.resource) throw new Error("generate.resource must be a non-empty string");
      if (!Number.isInteger(value.durationTicks) || (value.durationTicks as number) <= 0) throw new Error("generate.durationTicks must be a positive integer");
      if (!Number.isInteger(value.count) || (value.count as number) <= 0) throw new Error("generate.count must be a positive integer");
      if (!Number.isInteger(value.outputMilliWatts) || (value.outputMilliWatts as number) <= 0) throw new Error("generate.outputMilliWatts must be a positive integer");
      return { kind: "generate", operation: value.operation, resource: value.resource, durationTicks: value.durationTicks as number, count: value.count as number, outputMilliWatts: value.outputMilliWatts as number };
    }
    if (value.kind === "start") {
      if (typeof value.operation !== "string" || !value.operation) throw new Error("start.operation must be a non-empty string");
      if (!Number.isInteger(value.durationTicks) || (value.durationTicks as number) <= 0) throw new Error("start.durationTicks must be a positive integer");
      if (value.powerMilliWatts !== undefined && (!Number.isInteger(value.powerMilliWatts) || (value.powerMilliWatts as number) < 0)) throw new Error("start.powerMilliWatts must be a non-negative integer");
      return {
        kind: "start", operation: value.operation, durationTicks: value.durationTicks as number,
        consume: amounts(value.consume, "start.consume"), produce: amounts(value.produce, "start.produce"),
        ...(value.powerMilliWatts === undefined ? {} : { powerMilliWatts: value.powerMilliWatts as number }),
      };
    }
    throw new Error(`unknown decision kind '${value.kind}'`);
  } catch (error) {
    throw new DeviceProgramError(assetId, error instanceof Error ? error.message : String(error));
  }
}

export function parseTransportPlan(assetId: string, value: unknown): DeviceTransportPlan {
  if (!isRecord(value) || !Number.isInteger(value.capacity) || (value.capacity as number) <= 0 || !Number.isInteger(value.durationTicks) || (value.durationTicks as number) <= 0) {
    throw new DeviceProgramError(assetId, "planTransport() must return positive integer capacity and durationTicks");
  }
  if (value.stackCapacity !== undefined && (!Number.isInteger(value.stackCapacity) || (value.stackCapacity as number) <= 0)) {
    throw new DeviceProgramError(assetId, "planTransport().stackCapacity must be a positive integer");
  }
  return { capacity: value.capacity as number, durationTicks: value.durationTicks as number, stackCapacity: (value.stackCapacity as number | undefined) ?? 1 };
}

function assertSynchronous(assetId: string, value: unknown, hook: string): unknown {
  if (value && typeof (value as PromiseLike<unknown>).then === "function") throw new DeviceProgramError(assetId, `${hook}() must be synchronous and deterministic`);
  return value;
}

export function evaluateDeviceProgram(assetId: string, program: DeviceProgram, context: DeviceProgramContext): DeviceProgramDecision {
  try {
    const value = assertSynchronous(assetId, program.evaluate(freezeDeep(structuredClone(context))), "evaluate");
    return parseDeviceDecision(assetId, value);
  } catch (error) {
    if (error instanceof DeviceProgramError) throw error;
    throw new DeviceProgramError(assetId, `evaluate() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function planDeviceTransport(assetId: string, program: DeviceProgram, context: DeviceTransportContext): DeviceTransportPlan {
  if (!program.planTransport) throw new DeviceProgramError(assetId, "transport-capable asset must export planTransport()");
  try {
    const value = assertSynchronous(assetId, program.planTransport(freezeDeep(structuredClone(context))), "planTransport");
    return parseTransportPlan(assetId, value);
  } catch (error) {
    if (error instanceof DeviceProgramError) throw error;
    throw new DeviceProgramError(assetId, `planTransport() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateDeviceConfig(assetId: string, program: DeviceProgram, config: Record<string, unknown>): string[] {
  if (!program.validateConfig) return [];
  try {
    const value = assertSynchronous(assetId, program.validateConfig(freezeDeep(structuredClone(config))), "validateConfig");
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new DeviceProgramError(assetId, "validateConfig() must return an array of strings");
    return value as string[];
  } catch (error) {
    if (error instanceof DeviceProgramError) throw error;
    throw new DeviceProgramError(assetId, `validateConfig() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function importDeviceProgram(assetId: string, entryPath: string, contentHash: string): Promise<DeviceProgram> {
  let module: Record<string, unknown>;
  try {
    module = await import(`${pathToFileURL(entryPath).href}?asset=${contentHash}`) as Record<string, unknown>;
  } catch (error) {
    throw new DeviceProgramError(assetId, `cannot load runtime entry: ${error instanceof Error ? error.message : String(error)}`);
  }
  const program = module.default;
  if (!isRecord(program) || program.apiVersion !== 1 || typeof program.evaluate !== "function") {
    throw new DeviceProgramError(assetId, "default export must define apiVersion: 1 and evaluate(context)");
  }
  if (program.validateConfig !== undefined && typeof program.validateConfig !== "function") throw new DeviceProgramError(assetId, "validateConfig must be a function");
  if (program.planTransport !== undefined && typeof program.planTransport !== "function") throw new DeviceProgramError(assetId, "planTransport must be a function");
  return program as unknown as DeviceProgram;
}
