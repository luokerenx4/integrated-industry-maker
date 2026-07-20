import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport(context) {
    return { capacity: 10, durationTicks: 1000 + context.distance * 200 };
  },
} satisfies DeviceProgram;
