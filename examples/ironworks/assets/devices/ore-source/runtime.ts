import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() {
    return {
      kind: "start",
      operation: "extract-iron-ore",
      durationTicks: 2000,
      consume: [],
      produce: [{ buffer: "output", resource: "iron-ore", count: 2 }],
    };
  },
} satisfies DeviceProgram;
