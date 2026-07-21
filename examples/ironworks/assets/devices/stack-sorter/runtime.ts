import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport(context) {
    return { capacity: 2, durationTicks: 250 * context.distance, stackCapacity: 4 };
  },
} satisfies DeviceProgram;
