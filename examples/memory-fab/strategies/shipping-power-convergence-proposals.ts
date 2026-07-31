import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "device:probe-to-packaging-unloader:power-interruption";
const shippingGrid = "grid-cleanroom-shipping-power";
const strategy = "power:prioritize-active-shipping-service";
const serviceDevices = [
  "probe-to-packaging-unloader",
  "performance-to-customer-unloader",
  "performance-to-customer-loader",
  "packaging-to-burn-in-loader",
  "commercial-to-customer-unloader",
] as const;

function activeServicePriorityPatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const indexes = serviceDevices.map((id) => blueprint.devices.findIndex((device) => device.id === id));
  if (indexes.some((index) => index < 0)) return null;
  const policies = indexes.map((index) => {
    const value = blueprint.devices[index]!.policy;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  });
  if (policies.some((policy) => (policy.powerPriority ?? 0) !== 0)) return null;
  return indexes.map((index, offset) => ({
    op: "add" as const,
    path: `/devices/${index}/policy`,
    value: { ...policies[offset], powerPriority: 1 },
  }));
}

function observesExactShippingGridInterruption(
  context: Readonly<ProjectProposalContext>,
): boolean {
  if (context.branch.role !== "leader"
    || !context.fabLoss?.chain.includes("power-interruption")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "power-interruption");
  if (!bucket) return false;
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return context.fabLoss.version === 11
    && bucket.evidence.serviceInterruptionTicks! > 0
    && bucket.evidence.attributedServiceInterruptionTicks === bucket.evidence.serviceInterruptionTicks
    && bucket.evidence.unattributedTicks === 0
    && bucket.evidence.affectedGrids === 1
    && contributor?.mechanism === "power-supply-interruption"
    && contributor.grid === shippingGrid
    && contributor.endpointStage === "unloader"
    && contributor.subjects.some((subject) =>
      subject.kind === "connection" && subject.id === "probe-to-packaging")
    && contributor.subjects.some((subject) =>
      subject.kind === "device" && subject.id === "shipping-power")
    && contributor.evidence.serviceInterruptionTicks! > 0
    && contributor.evidence.transportInterruptionTicks === contributor.evidence.serviceInterruptionTicks;
}

export default {
  apiVersion: 10,
  propose(context) {
    if (!observesExactShippingGridInterruption(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = activeServicePriorityPatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "The current shipping grid loses active sorter service while lower-value idle endpoints retain the same default tier. Giving only the five event-backed active-service endpoints priority one should move load shedding into standby context without adding generation, build cost, area, or hidden scheduling authority.",
      expectedEffect: "Reduce exact active-service interruption, led by the Probe-to-packaging unloader, while conserving total power evidence and preserving every locked delivery, quality, capital, and current-best score guardrail.",
      addressedLoss: "power-interruption",
      addressedLossTarget: {
        contributor: contributorId,
        metric: "serviceInterruptionTicks",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
