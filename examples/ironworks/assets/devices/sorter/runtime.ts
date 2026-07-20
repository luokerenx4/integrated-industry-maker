import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport() {
    return { capacity: 1, durationTicks: 250 };
  },
} satisfies DeviceProgram;
