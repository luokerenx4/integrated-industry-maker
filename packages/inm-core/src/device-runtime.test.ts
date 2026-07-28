import { expect, test } from "bun:test";
import { evaluateDeviceProgram } from "./device-runtime";
import type { DeviceProgram, DeviceProgramContext } from "./types";

function context(): DeviceProgramContext {
  return {
    apiVersion: 1,
    tick: 42,
    device: { id: "tool-1", asset: "tool", config: { mode: "qualified" } },
    buffers: { input: { wafer: 2 } },
    materialBatches: { input: { wafer: { "0": 2 } } },
    process: {
      id: "etch",
      name: "Etch",
      category: "fabrication",
      durationTicks: 100,
      mode: { id: "normal", name: "Normal", inputCycles: 1, outputCycles: 1, preventsDefects: [] },
      powerMilliWatts: 500,
      inputs: [{ buffer: "input", resource: "wafer", count: 1 }],
      tooling: [],
      toolingProviders: [],
      utilities: [],
      utilityProviders: {},
      outputs: [{ buffer: "output", resource: "etched-wafer", count: 1 }],
    },
  };
}

test("Device evaluation exposes a complete read-only context and detaches its accepted decision", () => {
  const source = context();
  const program: DeviceProgram = {
    apiVersion: 1,
    evaluate(snapshot) {
      expect(snapshot.tick).toBe(42);
      expect(snapshot.device.config.mode).toBe("qualified");
      expect(snapshot.buffers.input?.wafer).toBe(2);
      expect(snapshot.materialBatches.input?.wafer?.["0"]).toBe(2);
      expect(Array.isArray(snapshot.process!.inputs)).toBeTrue();
      expect(Object.keys(snapshot.buffers)).toEqual(["input"]);
      return {
        kind: "start",
        operation: snapshot.process!.id,
        durationTicks: snapshot.process!.durationTicks,
        consume: snapshot.process!.inputs,
        produce: snapshot.process!.outputs,
        powerMilliWatts: snapshot.process!.powerMilliWatts,
      };
    },
  };

  const decision = evaluateDeviceProgram("tool", program, source);
  expect(decision).toEqual({
    kind: "start",
    operation: "etch",
    durationTicks: 100,
    consume: [{ buffer: "input", resource: "wafer", count: 1 }],
    produce: [{ buffer: "output", resource: "etched-wafer", count: 1 }],
    powerMilliWatts: 500,
  });
  expect(decision.kind === "start" && Object.getPrototypeOf(decision.consume[0]!)).toBe(Object.prototype);
});

test("Device evaluation rejects context mutation before simulator-owned state changes", () => {
  const source = context();
  const before = structuredClone(source);
  const mutations: Array<(snapshot: Readonly<DeviceProgramContext>) => void> = [
    (snapshot) => { (snapshot.device.config as Record<string, unknown>).mode = "mutated"; },
    (snapshot) => { delete (snapshot.buffers.input as Record<string, number>).wafer; },
    (snapshot) => { Object.defineProperty(snapshot.materialBatches.input!.wafer!, "0", { value: 0 }); },
    (snapshot) => { Object.setPrototypeOf(snapshot.device.config, null); },
    (snapshot) => { Object.preventExtensions(snapshot.buffers); },
    (snapshot) => {
      const input = Object.getOwnPropertyDescriptor(snapshot.buffers, "input")!.value as Record<string, number>;
      input.wafer = 0;
    },
  ];

  for (const mutate of mutations) {
    const program: DeviceProgram = {
      apiVersion: 1,
      evaluate(snapshot) {
        mutate(snapshot);
        return { kind: "none" };
      },
    };
    expect(() => evaluateDeviceProgram("tool", program, source)).toThrow("Device program context is read-only");
    expect(source).toEqual(before);
  }
});

test("Device evaluation revokes a context retained after the synchronous invocation", () => {
  const context: DeviceProgramContext = {
    apiVersion: 1,
    tick: 42,
    device: { id: "tool-1", asset: "tool", config: { mode: "qualified" } },
    buffers: { input: { wafer: 2 } },
    materialBatches: { input: { wafer: { "0": 2 } } },
  };
  let retained: Readonly<DeviceProgramContext> | undefined;
  const program: DeviceProgram = {
    apiVersion: 1,
    evaluate(snapshot) {
      retained = snapshot;
      return { kind: "none" };
    },
  };

  expect(evaluateDeviceProgram("tool", program, context)).toEqual({ kind: "none" });
  expect(() => retained!.buffers).toThrow("revoked");
});
