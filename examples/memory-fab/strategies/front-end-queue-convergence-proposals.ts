import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "device:etch-1:process-queue-wait:dram-front-end:etch-cell-layer-1:etch-cell-layer-1";
const deviceId = "etch-1";
const processId = "etch-cell-layer-1";
const inputResource = "patterned-cell-l1-lot";

interface Candidate {
  strategy: string;
  hypothesis: string;
  expectedEffect: string;
  patch(blueprint: ProjectProposalContext["blueprint"]): JsonPatchOperation[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function currentEtch(blueprint: ProjectProposalContext["blueprint"]): {
  index: number;
  device: Record<string, unknown>;
  recipe: Record<string, unknown>;
  policy: Record<string, unknown>;
} | null {
  const index = blueprint.devices.findIndex((device) => device.id === deviceId);
  const device = blueprint.devices[index];
  if (!device || device.asset !== "plasma-etch-bay" || device.recipe !== undefined
    || !Array.isArray(device.recipes) || device.recipes.length !== 1
    || !isRecord(device.recipes[0]) || device.recipes[0].process !== processId
    || device.recipes[0].mode !== "qualified" || !isRecord(device.policy)
    || Object.hasOwn(device.policy, "cadenceControl")) return null;
  return { index, device, recipe: device.recipes[0], policy: device.policy };
}

function releasePatch(
  blueprint: ProjectProposalContext["blueprint"],
  reopenAtWip: number,
): JsonPatchOperation[] | null {
  const release = blueprint.policies.lotRelease;
  if (!isRecord(release) || release.kind !== "conwip"
    || release.maximumWip !== 6 || release.reopenAtWip !== 5
    || release.dispatch !== "earliest-due-date") return null;
  return [{
    op: "replace",
    path: "/policies/lotRelease/reopenAtWip",
    value: reopenAtWip,
  }];
}

function alwaysOptimizedPatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const current = currentEtch(blueprint);
  if (!current) return null;
  return [{
    op: "replace",
    path: `/devices/${current.index}/recipes/0/mode`,
    value: "queue-cycle-optimized-19-20",
  }];
}

function inputQueueRecoveryPatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const current = currentEtch(blueprint);
  if (!current) return null;
  return [
    {
      op: "replace",
      path: `/devices/${current.index}/recipes`,
      value: [
        structuredClone(current.recipe),
        { ...structuredClone(current.recipe), mode: "queue-high-rate-4-5" },
      ],
    },
    ...(Object.hasOwn(current.policy, "recipeDispatch")
      ? [{ op: "remove" as const, path: `/devices/${current.index}/policy/recipeDispatch` }]
      : []),
    {
      op: "add",
      path: `/devices/${current.index}/policy/cadenceControl`,
      value: {
        kind: "input-queue-recovery",
        process: processId,
        normalMode: "qualified",
        recoveryMode: "queue-high-rate-4-5",
        inputResource,
        recoverAtItems: 1,
        minimumQueueTicks: 5_000,
      },
    },
  ];
}

function releaseAndCyclePatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const release = releasePatch(blueprint, 4);
  const cycle = alwaysOptimizedPatch(blueprint);
  return release && cycle ? [...release, ...cycle] : null;
}

const candidates: Candidate[] = [
  {
    strategy: "dispatch:conwip-reopen-6-4",
    hypothesis: "Keeping the six-lot admission ceiling while reopening only after WIP falls to four may reduce the exact layer-one etch queue without pretending that lower factory release is free.",
    expectedEffect: "Reduce the exact etch-1 queue contributor while preserving the unchanged maximum WIP and exposing service-delay consequences in every locked case.",
    patch: (blueprint) => releasePatch(blueprint, 4),
  },
  {
    strategy: "recipe:input-queue-high-rate-after-5s",
    hypothesis: "The qualified four-fifths layer-one etch mode can activate only when one resident patterned lot has already waited five seconds.",
    expectedEffect: "Reduce the exact resident input queue through measured local pressure while retaining normal qualified operation outside that boundary.",
    patch: inputQueueRecoveryPatch,
  },
  {
    strategy: "recipe:endpoint-cycle-optimized-19-20",
    hypothesis: "A qualified endpoint-controlled layer-one recipe can remove five percent of deterministic over-etch time at unchanged active power.",
    expectedEffect: "Reduce one second from the exact layer-one queue while exposing downstream WIP timing across all five locked cases.",
    patch: alwaysOptimizedPatch,
  },
  {
    strategy: "recipe:conwip-6-4+endpoint-19-20",
    hypothesis: "The gentler six/four release hysteresis and five-percent endpoint cycle compression may jointly remove queue time without lowering the maximum admitted WIP.",
    expectedEffect: "Test the strongest bounded exact-queue reduction from the individually explicit release and process controls.",
    patch: releaseAndCyclePatch,
  },
];

function observesExactQueue(context: Readonly<ProjectProposalContext>): boolean {
  if (context.branch.role !== "leader" || !context.fabLoss?.chain.includes("queue-congestion")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "queue-congestion");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return contributor?.mechanism === "process-queue-wait"
    && contributor.route === "dram-front-end"
    && contributor.step === "etch-cell-layer-1"
    && contributor.processes.length === 1
    && contributor.processes[0] === processId
    && contributor.resources.length === 1
    && contributor.resources[0] === inputResource
    && contributor.subjects.some((subject) => subject.kind === "device" && subject.id === deviceId)
    && typeof contributor.evidence.queueTicks === "number"
    && contributor.evidence.queueTicks > 0;
}

export default {
  apiVersion: 8,
  propose(context) {
    if (!observesExactQueue(context)) return null;
    const used = new Set(context.history.map((item) => item.strategy));
    for (const candidate of candidates) {
      if (used.has(candidate.strategy)) continue;
      const patch = candidate.patch(context.blueprint);
      if (!patch) continue;
      return {
        strategy: candidate.strategy,
        hypothesis: candidate.hypothesis,
        expectedEffect: candidate.expectedEffect,
        addressedLoss: "queue-congestion",
        addressedLossTarget: {
          contributor: contributorId,
          metric: "queueTicks",
          direction: "decrease",
        },
        patch,
      };
    }
    return null;
  },
} satisfies ProjectProposalProvider;
