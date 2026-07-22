import type { JsonPatchOperation, ProjectProposalProvider } from "./runtime-api";

interface Candidate {
  strategy: string;
  hypothesis: string;
  expectedEffect: string;
  patch(blueprint: { devices: Array<Record<string, unknown>>; policies: Record<string, unknown> }): JsonPatchOperation[] | null;
}

function deviceIndex(blueprint: { devices: Array<Record<string, unknown>> }, id: string): number {
  return blueprint.devices.findIndex((device) => device.id === id);
}

const release = (maximumWip: number, reopenAtWip: number): Candidate => ({
  strategy: `dispatch:conwip-${maximumWip}-${reopenAtWip}-edd`,
  hypothesis: `A ${maximumWip}-card CONWIP loop reopening at ${reopenAtWip} lots may reduce downstream queue and Q-time exposure without withholding the fixed twelve-lot workload.`,
  expectedEffect: "Lower peak active WIP and queue time while preserving locked-case admission service and completed product.",
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
    strategy: "dispatch:inspection-earliest-due-date",
    hypothesis: "Earliest-due-date inspection may prioritize lots with the least remaining contract slack after the re-entrant front end.",
    expectedEffect: "Reduce final-inspection tardiness without changing equipment or quality physics.",
    patch: (blueprint) => {
      const index = deviceIndex(blueprint, "inspection-1");
      return index < 0 ? null : [{ op: "replace", path: `/devices/${index}/policy/lotDispatch`, value: "earliest-due-date" }];
    },
  },
  {
    strategy: "power:furnace-idle-sleep-30000",
    hypothesis: "Putting the rapid-anneal furnace into its asset-owned sleep state after thirty idle seconds may reduce metered energy without delaying the dense release wave.",
    expectedEffect: "Lower electricity and idle energy while preserving completion, Q-time, and capacity gates.",
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
    patch: (blueprint) => {
      const index = deviceIndex(blueprint, "probe-1");
      return index < 0 ? null : [{ op: "replace", path: `/devices/${index}/policy/lotDispatch`, value: "highest-priority" }];
    },
  },
];

export default {
  apiVersion: 1,
  propose(context) {
    const used = new Set(context.history.map((item) => item.strategy));
    for (const candidate of candidates) {
      if (used.has(candidate.strategy)) continue;
      const patch = candidate.patch(context.blueprint);
      if (!patch) continue;
      return { strategy: candidate.strategy, hypothesis: candidate.hypothesis, expectedEffect: candidate.expectedEffect, patch };
    }
    return null;
  },
} satisfies ProjectProposalProvider;
