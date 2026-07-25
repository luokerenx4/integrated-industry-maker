import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() {
    return { kind: "none" };
  },
  planTransport(context) {
    return {
      capacity: 1,
      durationTicks: Math.max(1, Math.ceil(250 * context.distance / 2)),
      stackCapacity: 1,
    };
  },
} satisfies DeviceProgram;
