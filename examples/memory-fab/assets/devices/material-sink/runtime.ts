import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate(context) {
    const resource = Object.keys(context.buffers.input ?? {}).sort().find((id) => (context.buffers.input?.[id] ?? 0) > 0);
    if (!resource) return { kind: "wait", reason: "input" };
    return { kind: "consume", consume: [{ buffer: "input", resource, count: 1 }] };
  },
} satisfies DeviceProgram;
