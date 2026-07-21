import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate() { return { kind: "none" }; },
} satisfies DeviceProgram;
