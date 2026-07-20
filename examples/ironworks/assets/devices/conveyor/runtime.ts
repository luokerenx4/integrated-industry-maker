import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport(context) {
    return { capacity: 4, durationTicks: context.distance * 100 };
  },
} satisfies DeviceProgram;
