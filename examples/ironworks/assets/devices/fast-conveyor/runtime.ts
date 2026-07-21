import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport(context) {
    return { capacity: context.distance, durationTicks: context.distance * 50, stackCapacity: 4 };
  },
} satisfies DeviceProgram;
