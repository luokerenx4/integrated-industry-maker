import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate(context) {
    const process = context.process;
    if (!process) return { kind: "wait", reason: "idle" };
    if (process.inputs.some((amount) => (context.buffers[amount.buffer]?.[amount.resource] ?? 0) < amount.count)) return { kind: "wait", reason: "input" };
    return {
      kind: "start",
      operation: process.id,
      durationTicks: process.durationTicks,
      consume: [...process.inputs],
      produce: [...process.outputs],
    };
  },
} satisfies DeviceProgram;
