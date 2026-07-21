import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate(context) {
    const treatment = context.treatment;
    if (!treatment) return { kind: "wait", reason: "idle" };
    const candidates = Object.entries(context.materialBatches[treatment.inputBuffer] ?? {})
      .flatMap(([resource, levels]) => Object.entries(levels).map(([level, count]) => ({ resource, level: Number(level), count })))
      .filter((batch) => batch.level < treatment.level && batch.count >= treatment.itemCount)
      .sort((left, right) => left.level - right.level || left.resource.localeCompare(right.resource));
    const batch = candidates[0];
    const agentCount = context.buffers[treatment.agent.buffer]?.[treatment.agent.resource] ?? 0;
    if (!batch || agentCount < treatment.agent.count) return { kind: "wait", reason: "input" };
    return {
      kind: "treat",
      operation: treatment.id,
      durationTicks: treatment.durationTicks,
      resource: batch.resource,
      inputTreatmentLevel: batch.level,
      count: treatment.itemCount,
    };
  },
} satisfies DeviceProgram;
