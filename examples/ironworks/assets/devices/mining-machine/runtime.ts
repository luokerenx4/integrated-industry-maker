import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate(context) {
    const extraction = context.extraction;
    if (!extraction) return { kind: "none" };
    const node = extraction.nodes.find((candidate) => candidate.remaining > 0);
    if (!node) return { kind: "wait", reason: "input" };
    return {
      kind: "extract",
      operation: `extract-${node.resource}`,
      durationTicks: extraction.cycleTicks,
      node: node.id,
      count: Math.min(extraction.itemsPerCycle, node.remaining),
    };
  },
} satisfies DeviceProgram;
