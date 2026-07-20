import type { DeviceProgram } from "@inm/core";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
  planTransport(context) {
    return { capacity: 4, durationTicks: context.distance * 100 };
  },
} satisfies DeviceProgram;
