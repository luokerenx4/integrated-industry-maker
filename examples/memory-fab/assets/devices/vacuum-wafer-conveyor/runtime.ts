import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() {
    return { kind: "none" };
  },
  planTransport(context) {
    return {
      capacity: context.distance,
      durationTicks: Math.max(1, Math.ceil(context.distance * 100 / 2)),
      stackCapacity: 4,
    };
  },
} satisfies DeviceProgram;
