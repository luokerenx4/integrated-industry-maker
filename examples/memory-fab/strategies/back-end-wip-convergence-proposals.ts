import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const packagingLocation = "buffer:packaging-1:die-input:known-good-dram-die";

interface ReleaseVariant {
  maximumWip: number;
  reopenAtWip: number;
}

const variants: ReleaseVariant[] = [
  { maximumWip: 5, reopenAtWip: 4 },
  { maximumWip: 4, reopenAtWip: 3 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function observedAverageInventory(
  context: Readonly<ProjectProposalContext>,
  location: string,
): number | null {
  const accounting = isRecord(context.metrics.inventoryAccounting)
    ? context.metrics.inventoryAccounting
    : null;
  const locations = accounting && isRecord(accounting.locations)
    ? accounting.locations
    : null;
  const entry = locations && isRecord(locations[location])
    ? locations[location]
    : null;
  return entry && typeof entry.averageInventory === "number"
    ? entry.averageInventory
    : null;
}

function releasePatch(
  context: Readonly<ProjectProposalContext>,
  variant: ReleaseVariant,
): JsonPatchOperation[] | null {
  const release = context.blueprint.policies.lotRelease;
  if (!isRecord(release)
    || release.kind !== "conwip"
    || release.maximumWip !== 6
    || release.reopenAtWip !== 5
    || release.dispatch !== "earliest-due-date"
    || Object.keys(release).sort().join(",") !== "dispatch,kind,maximumWip,reopenAtWip") return null;
  return [
    {
      op: "replace",
      path: "/policies/lotRelease/maximumWip",
      value: variant.maximumWip,
    },
    {
      op: "replace",
      path: "/policies/lotRelease/reopenAtWip",
      value: variant.reopenAtWip,
    },
  ];
}

export default {
  apiVersion: 8,
  propose(context) {
    if (context.branch.role !== "leader") return null;
    const currentPackagingWip = observedAverageInventory(context, packagingLocation);
    if (currentPackagingWip === null || currentPackagingWip <= 0) return null;
    const variant = variants.find((item) =>
      !context.history.some((history) =>
        history.strategy === `dispatch:back-end-wip-conwip-${item.maximumWip}-${item.reopenAtWip}`));
    if (!variant) return null;
    const patch = releasePatch(context, variant);
    if (!patch) return null;
    return {
      strategy: `dispatch:back-end-wip-conwip-${variant.maximumWip}-${variant.reopenAtWip}`,
      hypothesis: `The exact driver accumulates ${currentPackagingWip.toFixed(3)} known-good dies at packaging-1 before single-piece packaging feeds the eight-item burn-in batch. Tightening the authored release wave from CONWIP 6/5 to ${variant.maximumWip}/${variant.reopenAtWip} may reduce that physical exposure without changing equipment, process physics, product mix, or dispatch identity.`,
      expectedEffect: `Reduce average inventory at ${packagingLocation}. Locked on-time service, interruption completion, delivery value, total WIP, and every current-best case remain authoritative and may reject the smaller release window.`,
      addressedObjectiveTarget: {
        component: "wip",
        location: packagingLocation,
        metric: "averageInventory",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
