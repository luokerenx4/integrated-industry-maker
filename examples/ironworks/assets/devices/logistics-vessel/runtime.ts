import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport(context) {
    return { capacity: 20, durationTicks: 5000 + context.distance * 80 };
  },
} satisfies DeviceProgram;
