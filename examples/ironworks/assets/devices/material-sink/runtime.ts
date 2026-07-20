import type { DeviceProgram } from "@inm/core";

export default {
  apiVersion: 1,
  evaluate(context) {
    if ((context.buffers.input?.gear ?? 0) < 1) return { kind: "wait", reason: "input" };
    return { kind: "consume", consume: [{ buffer: "input", resource: "gear", count: 1 }] };
  },
} satisfies DeviceProgram;
