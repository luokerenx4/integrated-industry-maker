import { expect, test } from "bun:test";
import { evaluateDeviceProgram } from "./device-runtime";
import type { DeviceProgram, DeviceProgramContext } from "./types";

test("Device evaluation isolates simulator-owned context without a redundant deep freeze", () => {
  const context: DeviceProgramContext = {
    apiVersion: 1,
    tick: 42,
    device: { id: "tool-1", asset: "tool", config: { mode: "qualified" } },
    buffers: { input: { wafer: 2 } },
    materialBatches: { input: { wafer: { "0": 2 } } },
  };
  const before = structuredClone(context);
  const program: DeviceProgram = {
    apiVersion: 1,
    evaluate(snapshot) {
      const mutable = snapshot as unknown as {
        device: { config: Record<string, unknown> };
        buffers: Record<string, Record<string, number>>;
        materialBatches: Record<string, Record<string, Record<string, number>>>;
      };
      mutable.device.config.mode = "mutated";
      mutable.buffers.input!.wafer = 0;
      mutable.materialBatches.input!.wafer!["0"] = 0;
      return { kind: "none" };
    },
  };

  expect(evaluateDeviceProgram("tool", program, context)).toEqual({ kind: "none" });
  expect(context).toEqual(before);
});
