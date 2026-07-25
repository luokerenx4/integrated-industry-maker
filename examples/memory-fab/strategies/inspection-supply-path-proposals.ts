import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

interface ProposalBlueprint {
  devices: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
}

interface Candidate {
  strategy: string;
  hypothesis: string;
  expectedEffect: string;
  patch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null;
}

const etchId = "etch-l2";
const etchAsset = "closed-loop-plasma-etch-bay";
const mainConnection = "etch-to-inspection";
const reworkConnection = "rework-to-inspection";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deviceIndex(blueprint: ProposalBlueprint, id: string): number {
  return blueprint.devices.findIndex((device) => device.id === id);
}

function connectionIndex(blueprint: ProposalBlueprint, id: string): number {
  return blueprint.connections.findIndex((connection) => connection.id === id);
}

function currentEtch(blueprint: ProposalBlueprint): {
  index: number;
  device: Record<string, unknown>;
  recipe: Record<string, unknown>;
  policy: Record<string, unknown>;
} | null {
  const index = deviceIndex(blueprint, etchId);
  const device = blueprint.devices[index];
  if (!device || device.asset !== etchAsset || device.recipe !== undefined || !Array.isArray(device.recipes)
    || device.recipes.length !== 1 || !isRecord(device.recipes[0])
    || device.recipes[0].process !== "etch-cell-layer-2"
    || device.recipes[0].mode !== "closed-loop-control"
    || !isRecord(device.policy) || Object.hasOwn(device.policy, "cadenceControl")) return null;
  return { index, device, recipe: device.recipes[0], policy: device.policy };
}

function recoveryModePatch(
  blueprint: ProposalBlueprint,
  mode: "closed-loop-fast-4-5" | "closed-loop-fast-3-4",
  minimumCoverageDeficitTicks: number,
): JsonPatchOperation[] | null {
  const current = currentEtch(blueprint);
  if (!current) return null;
  return [
    {
      op: "replace",
      path: `/devices/${current.index}/recipes`,
      value: [
        structuredClone(current.recipe),
        { ...structuredClone(current.recipe), mode },
      ],
    },
    ...(Object.hasOwn(current.policy, "recipeDispatch")
      ? [{ op: "remove" as const, path: `/devices/${current.index}/policy/recipeDispatch` }]
      : []),
    {
      op: "add",
      path: `/devices/${current.index}/policy/cadenceControl`,
      value: {
        kind: "downstream-coverage-recovery",
        process: "etch-cell-layer-2",
        normalMode: "closed-loop-control",
        recoveryMode: mode,
        downstreamConnection: mainConnection,
        recoverBelowItems: 1,
        minimumCoverageDeficitTicks,
      },
    },
  ];
}

function alwaysModePatch(
  blueprint: ProposalBlueprint,
  mode: "closed-loop-fast-4-5" | "closed-loop-fast-3-4",
): JsonPatchOperation[] | null {
  const current = currentEtch(blueprint);
  if (!current) return null;
  return [{
    op: "replace",
    path: `/devices/${current.index}/recipes/0/mode`,
    value: mode,
  }];
}

function dualVacuumHandoffPatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const patches: JsonPatchOperation[] = [];
  for (const connectionId of [mainConnection, reworkConnection]) {
    const index = connectionIndex(blueprint, connectionId);
    const connection = blueprint.connections[index];
    if (!connection || !isRecord(connection.logistics) || !isRecord(connection.logistics.line)
      || connection.logistics.line.deviceAsset !== "conveyor"
      || !isRecord(connection.logistics.loader) || !isRecord(connection.logistics.unloader)
      || typeof connection.logistics.loader.device !== "string"
      || typeof connection.logistics.unloader.device !== "string") return null;
    const loaderIndex = deviceIndex(blueprint, connection.logistics.loader.device);
    const unloaderIndex = deviceIndex(blueprint, connection.logistics.unloader.device);
    if (loaderIndex < 0 || unloaderIndex < 0
      || blueprint.devices[loaderIndex]!.asset !== "sorter"
      || blueprint.devices[unloaderIndex]!.asset !== "sorter") return null;
    patches.push(
      {
        op: "replace",
        path: `/connections/${index}/logistics/line/deviceAsset`,
        value: "vacuum-wafer-conveyor",
      },
      {
        op: "replace",
        path: `/devices/${loaderIndex}/asset`,
        value: "vacuum-wafer-sorter",
      },
      {
        op: "replace",
        path: `/devices/${unloaderIndex}/asset`,
        value: "vacuum-wafer-sorter",
      },
    );
  }
  return patches;
}

const candidates: Candidate[] = [
  {
    strategy: "recipe:closed-loop-fast-4-5-after-1-tick",
    hypothesis: "A qualified four-fifths etch cycle can enter after one simulation tick when the physical inspection lane has no resident or in-flight wafer.",
    expectedEffect: "Remove two seconds of measured inspection input shortage while preserving latent-electrical prevention and charging three-halves active power.",
    patch: (blueprint) => recoveryModePatch(blueprint, "closed-loop-fast-4-5", 1),
  },
  {
    strategy: "recipe:closed-loop-fast-4-5-after-2000",
    hypothesis: "A two-second persistence threshold may reserve the faster four-fifths etch cycle for sustained inspection deficit rather than brief handoff gaps.",
    expectedEffect: "Remove the bounded sustained portion of inspection shortage with lower fast-mode exposure and unchanged quality prevention.",
    patch: (blueprint) => recoveryModePatch(blueprint, "closed-loop-fast-4-5", 2_000),
  },
  {
    strategy: "recipe:closed-loop-fast-3-4-after-2000",
    hypothesis: "A qualified three-quarters etch cycle after two seconds of persistent inspection deficit may trade additional active power for a stronger closed-loop recovery pulse.",
    expectedEffect: "Reduce sustained inspection starvation through explicit eight-fifths active power without relaxing latent-electrical prevention.",
    patch: (blueprint) => recoveryModePatch(blueprint, "closed-loop-fast-3-4", 2_000),
  },
  {
    strategy: "recipe:closed-loop-fast-4-5-always",
    hypothesis: "Running every layer-two lot through the qualified four-fifths closed-loop mode tests whether simple cycle compression is preferable to a recovery controller.",
    expectedEffect: "Remove two seconds of inspection starvation while exposing the complete energy and WIP cost across every locked case.",
    patch: (blueprint) => alwaysModePatch(blueprint, "closed-loop-fast-4-5"),
  },
  {
    strategy: "recipe:closed-loop-fast-3-4-always",
    hypothesis: "Running every layer-two lot through the qualified three-quarters closed-loop mode bounds the strongest process-cycle repair in the current catalog.",
    expectedEffect: "Remove two and a half seconds of inspection starvation while retaining exact quality prevention and full five-case cost authority.",
    patch: (blueprint) => alwaysModePatch(blueprint, "closed-loop-fast-3-4"),
  },
  {
    strategy: "logistics:vacuum-dual-wafer-handoff",
    hypothesis: "The main etched-wafer lane and conditional rework return share one physical cell, so both must use the same faster vacuum-compatible line and endpoints.",
    expectedEffect: "Remove 1.75 seconds of inspection shortage through an explicit dual-path transport upgrade whose capital, power, and area remain visible.",
    patch: dualVacuumHandoffPatch,
  },
];

function targetsCurrentInspectionLoss(context: Readonly<ProjectProposalContext>): boolean {
  const primary = context.fabLoss?.primary;
  return primary?.id === "input-starvation"
    && primary.subjects.some((subject) => subject.kind === "device" && subject.id === "inspection-1")
    && primary.subjects.some((subject) => subject.kind === "device" && subject.id === etchId)
    && primary.subjects.some((subject) => subject.kind === "connection" && subject.id === mainConnection);
}

export default {
  apiVersion: 7,
  propose(context) {
    if (context.branch.role !== "leader" || !targetsCurrentInspectionLoss(context)) return null;
    const used = new Set(context.history.map((item) => item.strategy));
    for (const candidate of candidates) {
      if (used.has(candidate.strategy)) continue;
      const patch = candidate.patch(context.blueprint);
      if (!patch) continue;
      return {
        strategy: candidate.strategy,
        hypothesis: candidate.hypothesis,
        expectedEffect: candidate.expectedEffect,
        addressedLoss: "input-starvation",
        addressedLossTarget: {
          contributor: "device:inspection-1:material-input-shortage",
          metric: "starvationTicks",
          direction: "decrease",
        },
        patch,
      };
    }
    return null;
  },
} satisfies ProjectProposalProvider;
