import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  validateConfig(config) {
    return config.operation === "gear" ? [] : ["operation must be 'gear'"];
  },
  evaluate(context) {
    if ((context.buffers.input?.["iron-plate"] ?? 0) < 2) return { kind: "wait", reason: "input" };
    return {
      kind: "start",
      operation: "gear",
      durationTicks: 3000,
      consume: [{ buffer: "input", resource: "iron-plate", count: 2 }],
      produce: [{ buffer: "output", resource: "gear", count: 1 }],
    };
  },
} satisfies DeviceProgram;
