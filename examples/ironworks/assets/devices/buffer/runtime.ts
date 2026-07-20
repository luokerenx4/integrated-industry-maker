import type { DeviceProgram } from "@inm/core";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
} satisfies DeviceProgram;
