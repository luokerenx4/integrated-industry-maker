import type { FabLossBucketId, JsonPatchOperation, ProjectProposalProvider } from "./runtime-api";

interface Candidate {
  strategy: string;
  hypothesis: string;
  expectedEffect: string;
  addresses: FabLossBucketId[];
  patch(blueprint: { devices: Array<Record<string, unknown>>; policies: Record<string, unknown> }): JsonPatchOperation[] | null;
}

function deviceIndex(blueprint: { devices: Array<Record<string, unknown>> }, id: string): number {
  return blueprint.devices.findIndex((device) => device.id === id);
}

function devicePolicyPatch(
  blueprint: { devices: Array<Record<string, unknown>> },
  id: string,
  policyKey: "preventiveMaintenance" | "setupCampaign",
  value: Record<string, number>,
): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, id);
  if (index < 0) return null;
  const policy = blueprint.devices[index]!.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return null;
  const current = (policy as Record<string, unknown>)[policyKey];
  if (JSON.stringify(current) === JSON.stringify(value)) return null;
  return [{
    op: Object.hasOwn(policy, policyKey) ? "replace" : "add",
    path: `/devices/${index}/policy/${policyKey}`,
    value,
  }];
}

function furnaceBatchFormationPatch(blueprint: { devices: Array<Record<string, unknown>> }): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, "furnace-1");
  if (index < 0) return null;
  const furnace = blueprint.devices[index]!;
  const policy = furnace.policy;
  const recipe = furnace.recipe;
  if (furnace.asset !== "thermal-batch-furnace"
    || !policy || typeof policy !== "object" || Array.isArray(policy)
    || !recipe || typeof recipe !== "object" || Array.isArray(recipe)
    || (recipe as Record<string, unknown>).process !== "batch-anneal-dielectric-stack"
    || furnace.recipes !== undefined) return null;
  const batchRecipe = structuredClone(recipe);
  const rapidRecipe = { ...structuredClone(recipe), process: "rapid-anneal-dielectric-stack" };
  return [
    { op: "remove", path: `/devices/${index}/recipe` },
    { op: "add", path: `/devices/${index}/recipes`, value: [batchRecipe, rapidRecipe] },
    {
      op: Object.hasOwn(policy, "batchFormation") ? "replace" : "add",
      path: `/devices/${index}/policy/batchFormation`,
      value: { preferredProcess: "batch-anneal-dielectric-stack", maximumWaitTicks: 30_000 },
    },
  ];
}

const release = (maximumWip: number, reopenAtWip: number): Candidate => ({
  strategy: `dispatch:conwip-${maximumWip}-${reopenAtWip}-edd`,
  hypothesis: `A ${maximumWip}-card CONWIP loop reopening at ${reopenAtWip} lots may reduce downstream queue and Q-time exposure without withholding the fixed twelve-lot workload.`,
  expectedEffect: "Lower peak active WIP and queue time while preserving locked-case admission service and completed product.",
  addresses: ["release-admission", "queue-starvation", "q-time"],
  patch: (blueprint) => [{
    op: Object.hasOwn(blueprint.policies, "lotRelease") ? "replace" : "add",
    path: "/policies/lotRelease",
    value: { kind: "conwip", maximumWip, reopenAtWip, maximumReleaseDelayTicks: 18_000, dispatch: "earliest-due-date" },
  }],
});

const candidates: Candidate[] = [
  release(9, 6),
  release(8, 5),
  release(10, 7),
  {
    strategy: "maintenance:lithography-jobs-6",
    hypothesis: "Pulling lithography maintenance forward after six completed jobs may prevent the qualified bay from entering its defect-producing drift interval during the fixed twelve-lot campaign.",
    expectedEffect: "Reduce latent critical-dimension defects and qualification disruption while retaining the shared re-entrant toolset.",
    addresses: ["yield-quality", "maintenance-qualification"],
    patch: (blueprint) => devicePolicyPatch(blueprint, "lithography-1", "preventiveMaintenance", { minimumJobs: 6 }),
  },
  {
    strategy: "maintenance:inspection-jobs-4",
    hypothesis: "Pulling inspection maintenance forward after four jobs may keep disposition capacity qualified through rework recirculation and the final release wave.",
    expectedEffect: "Reduce quality-disposition interruption without changing inspection or rework physics.",
    addresses: ["yield-quality", "maintenance-qualification"],
    patch: (blueprint) => devicePolicyPatch(blueprint, "inspection-1", "preventiveMaintenance", { minimumJobs: 4 }),
  },
  {
    strategy: "batch-formation:furnace-flex-30000",
    hypothesis: "Qualifying rapid single-lot anneal as a thirty-second fallback may reduce companion-arrival wait while preserving efficient full furnace batches whenever three lots become ready together.",
    expectedEffect: "Reduce measured batch queue delay in ordinary production, while allowing the locked interruption cases to reject excess single-lot furnace work.",
    addresses: ["batch-formation"],
    patch: furnaceBatchFormationPatch,
  },
  {
    strategy: "setup-campaign:lithography-3-12000",
    hypothesis: "Holding lithography changeover until three compatible ready lots accumulate, with a twelve-thousand-tick escape, may avoid repeated long returns from layer two to layer one without starving the re-entrant route.",
    expectedEffect: "Reduce changeover work and energy while bounding campaign-induced lot hold time.",
    addresses: ["setup-campaign"],
    patch: (blueprint) => devicePolicyPatch(blueprint, "lithography-1", "setupCampaign", { minimumReadyLots: 3, maximumHoldTicks: 12_000 }),
  },
  {
    strategy: "dispatch:inspection-earliest-due-date",
    hypothesis: "Earliest-due-date inspection may prioritize lots with the least remaining contract slack after the re-entrant front end.",
    expectedEffect: "Reduce final-inspection tardiness without changing equipment or quality physics.",
    addresses: ["q-time", "queue-starvation"],
    patch: (blueprint) => {
      const index = deviceIndex(blueprint, "inspection-1");
      return index < 0 ? null : [{ op: "replace", path: `/devices/${index}/policy/lotDispatch`, value: "earliest-due-date" }];
    },
  },
  {
    strategy: "power:furnace-idle-sleep-30000",
    hypothesis: "Putting the rapid-anneal furnace into its asset-owned sleep state after thirty idle seconds may reduce metered energy without delaying the dense release wave.",
    expectedEffect: "Lower electricity and idle energy while preserving completion, Q-time, and capacity gates.",
    addresses: [],
    patch: (blueprint) => {
      const index = deviceIndex(blueprint, "furnace-1");
      if (index < 0) return null;
      const policy = blueprint.devices[index]!.policy as Record<string, unknown> | undefined;
      return [{ op: policy && Object.hasOwn(policy, "idleEnergy") ? "replace" : "add", path: `/devices/${index}/policy/idleEnergy`, value: { sleepAfterTicks: 30_000 } }];
    },
  },
  {
    strategy: "dispatch:probe-highest-priority",
    hypothesis: "Highest-priority probe dispatch may protect the evaluator-owned priority and due-date portfolio after inline quality disposition.",
    expectedEffect: "Improve weighted delivery service without changing Probe yield or downstream capacity.",
    addresses: ["q-time", "queue-starvation"],
    patch: (blueprint) => {
      const index = deviceIndex(blueprint, "probe-1");
      return index < 0 ? null : [{ op: "replace", path: `/devices/${index}/policy/lotDispatch`, value: "highest-priority" }];
    },
  },
];

export default {
  apiVersion: 3,
  propose(context) {
    const used = new Set(context.history.map((item) => item.strategy));
    const lossChain = context.fabLoss?.chain ?? [];
    const attempts = new Map<FabLossBucketId, number>();
    for (const item of context.history) {
      if (item.addressedLoss) attempts.set(item.addressedLoss, (attempts.get(item.addressedLoss) ?? 0) + 1);
    }
    const ranked = lossChain.length
      ? candidates.map((candidate, index) => {
        const targets = lossChain.filter((loss) => candidate.addresses.includes(loss)).sort((left, right) =>
          (attempts.get(left) ?? 0) - (attempts.get(right) ?? 0)
          || lossChain.indexOf(left) - lossChain.indexOf(right));
        const addressedLoss = targets[0];
        return { candidate, index, addressedLoss, attempts: addressedLoss ? attempts.get(addressedLoss) ?? 0 : 0 };
      }).filter((item) => item.addressedLoss).sort((left, right) =>
        left.attempts - right.attempts
        || lossChain.indexOf(left.addressedLoss!) - lossChain.indexOf(right.addressedLoss!)
        || left.index - right.index)
      : candidates.map((candidate, index) => ({ candidate, index, addressedLoss: undefined }));
    for (const { candidate, addressedLoss } of ranked) {
      if (used.has(candidate.strategy)) continue;
      const patch = candidate.patch(context.blueprint);
      if (!patch) continue;
      return {
        strategy: candidate.strategy,
        hypothesis: candidate.hypothesis,
        expectedEffect: candidate.expectedEffect,
        ...(addressedLoss ? { addressedLoss } : {}),
        patch,
      };
    }
    return null;
  },
} satisfies ProjectProposalProvider;
