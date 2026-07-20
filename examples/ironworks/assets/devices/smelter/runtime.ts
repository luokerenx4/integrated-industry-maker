import type { DeviceProgram } from "@inm/core";

export default {
  apiVersion: 1,
  validateConfig(config) {
    return config.operation === "iron-plate" ? [] : ["operation must be 'iron-plate'"];
  },
  evaluate(context) {
    if ((context.buffers.input?.["iron-ore"] ?? 0) < 2) return { kind: "wait", reason: "input" };
    return {
      kind: "start",
      operation: "iron-plate",
      durationTicks: 4000,
      consume: [{ buffer: "input", resource: "iron-ore", count: 2 }],
      produce: [{ buffer: "output", resource: "iron-plate", count: 1 }],
    };
  },
} satisfies DeviceProgram;
