/** Project-local compile-time contract for Device runtime.ts files. Runtime validation is owned by the INM engine. */
export interface ResourceBufferQuantity {
  buffer: string;
  resource: string;
  count: number;
}

export interface DeviceProgramContext {
  apiVersion: 1;
  tick: number;
  device: { id: string; asset: string; config: Readonly<Record<string, unknown>> };
  buffers: Readonly<Record<string, Readonly<Record<string, number>>>>;
  process?: Readonly<{
    id: string;
    name: string;
    category: string;
    durationTicks: number;
    inputs: ResourceBufferQuantity[];
    outputs: ResourceBufferQuantity[];
  }>;
  extraction?: Readonly<{
    outputBuffer: string;
    cycleTicks: number;
    itemsPerCycle: number;
    nodes: ReadonlyArray<Readonly<{ id: string; resource: string; remaining: number }>>;
  }>;
  generation?: Readonly<{
    kind: "fuel";
    outputMilliWatts: number;
    fuelBuffer: string;
    fuels: ReadonlyArray<Readonly<{ resource: string; energyMilliJoules: number; durationTicks: number }>>;
  }>;
}

export interface DeviceTransportContext {
  apiVersion: 1;
  connection: string;
  stage: "loader" | "line" | "unloader" | "carrier";
  distance: number;
}

export interface DeviceProgram {
  apiVersion: 1;
  validateConfig?: (config: Readonly<Record<string, unknown>>) => string[];
  evaluate: (context: Readonly<DeviceProgramContext>) =>
    | { kind: "start"; operation: string; durationTicks: number; consume: ResourceBufferQuantity[]; produce: ResourceBufferQuantity[]; powerMilliWatts?: number }
    | { kind: "extract"; operation: string; durationTicks: number; node: string; count: number; powerMilliWatts?: number }
    | { kind: "generate"; operation: string; durationTicks: number; resource: string; count: number; outputMilliWatts: number }
    | { kind: "consume"; consume: ResourceBufferQuantity[] }
    | { kind: "wait"; reason: "input" | "output" | "idle" }
    | { kind: "none" };
  planTransport?: (context: Readonly<DeviceTransportContext>) => { capacity: number; durationTicks: number; stackCapacity?: number };
}
