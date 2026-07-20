import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate(context) {
    const generation = context.generation;
    if (!generation) return { kind: "none" };
    const fuel = generation.fuels.find((candidate) => (context.buffers[generation.fuelBuffer]?.[candidate.resource] ?? 0) > 0);
    if (!fuel) return { kind: "wait", reason: "input" };
    return {
      kind: "generate",
      operation: `burn-${fuel.resource}`,
      durationTicks: fuel.durationTicks,
      resource: fuel.resource,
      count: 1,
      outputMilliWatts: generation.outputMilliWatts,
    };
  },
} satisfies DeviceProgram;
