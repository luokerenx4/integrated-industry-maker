import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "lot:dram-lot-07:release-admission";
const strategy = "dispatch:conwip-7-6-edd";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneCardPatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const release = blueprint.policies.lotRelease;
  if (!isRecord(release)
    || release.kind !== "conwip"
    || release.maximumWip !== 6
    || release.reopenAtWip !== 5
    || release.dispatch !== "earliest-due-date"
    || Object.hasOwn(release, "serviceLevelAfterTicks")
    || Object.keys(release).sort().join(",") !== "dispatch,kind,maximumWip,reopenAtWip") return null;
  return [
    {
      op: "replace",
      path: "/policies/lotRelease/maximumWip",
      value: 7,
    },
    {
      op: "replace",
      path: "/policies/lotRelease/reopenAtWip",
      value: 6,
    },
  ];
}

function observesExactReleaseWait(context: Readonly<ProjectProposalContext>): boolean {
  if (context.branch.role !== "leader"
    || !context.fabLoss?.chain.includes("release-admission")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "release-admission");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return bucket?.evidence.controlBlockedTicks === 171_738
    && bucket.evidence.capacityBlockedTicks === 0
    && bucket.evidence.maximumWip === 6
    && bucket.evidence.reopenAtWip === 5
    && contributor?.mechanism === "release-admission-wait"
    && contributor.route === "dram-front-end"
    && contributor.resources.length === 1
    && contributor.resources[0] === "blank-dram-wafer-lot"
    && contributor.lots.length === 1
    && contributor.lots[0] === "dram-lot-07"
    && contributor.subjects.some((subject) =>
      subject.kind === "device" && subject.id === "lot-release")
    && contributor.evidence.totalTicks === 63_623
    && contributor.evidence.controlBlockedTicks === 63_623
    && contributor.evidence.bufferCapacityTicks === 0
    && contributor.evidence.resourceCapacityTicks === 0
    && contributor.evidence.plannedReleaseTick === 36_000
    && contributor.evidence.actualReleaseTick === 99_623
    && contributor.evidence.dueTick === 180_000
    && contributor.evidence.priority === 5
    && contributor.evidence.releaseOrdinal === 12
    && contributor.evidence.activeWipBeforeRelease === 5
    && contributor.evidence.maximumWip === 6
    && contributor.evidence.reopenAtWip === 5
    && contributor.evidence.serviceProtected === 0;
}

export default {
  apiVersion: 9,
  propose(context) {
    if (!observesExactReleaseWait(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = oneCardPatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "dram-lot-07 owns 63.623 seconds of pure CONWIP wait and enters last despite arriving seventh; adding exactly one hard card while preserving one-for-one EDD replenishment may admit the middle-priority wave earlier without changing workload or inventing a physical-capacity problem.",
      expectedEffect: "Reduce the exact dram-lot-07 release-admission contributor and total controller wait; extra WIP, setup, quality, due-date service, interruption behavior, and every current-best case remain authoritative.",
      addressedLoss: "release-admission",
      addressedLossTarget: {
        contributor: contributorId,
        metric: "totalTicks",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
