import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "device:burn-in-1:production-changeover:reliability-screen:commercial-screen:screen-commercial-dram";
const deviceId = "burn-in-1";
const targetProcess = "screen-commercial-dram";
const inputResource = "packaged-dram-device";
const outputResource = "commercial-dram-device";
const strategy = "dispatch:burn-in-minimize-changeover";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function burnInDispatchPatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const index = blueprint.devices.findIndex((device) => device.id === deviceId);
  const device = blueprint.devices[index];
  if (!device
    || device.asset !== "dram-burn-in-rack"
    || !Array.isArray(device.recipes)
    || device.recipes.length !== 2
    || device.recipes[0]?.process !== "screen-commercial-dram"
    || device.recipes[1]?.process !== "screen-performance-mix"
    || !isRecord(device.policy)
    || device.policy.recipeDispatch !== "contract-value") return null;
  return [{
    op: "replace",
    path: `/devices/${index}/policy/recipeDispatch`,
    value: "minimize-changeover",
  }];
}

function observesExactBurnInTransition(
  context: Readonly<ProjectProposalContext>,
): boolean {
  if (context.branch.role !== "leader"
    || !context.fabLoss?.chain.includes("setup-campaign")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "setup-campaign");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return bucket?.evidence.setupTicks === 21_000
    && bucket.evidence.commissioningSetupTicks === 10_000
    && bucket.evidence.productionChangeoverTicks === 11_000
    && bucket.evidence.campaignHoldTicks === 0
    && contributor?.mechanism === "equipment-production-changeover"
    && contributor.setupFrom === "reliability-screen"
    && contributor.setupTo === "commercial-screen"
    && contributor.releaseCause === null
    && contributor.processes.length === 1
    && contributor.processes[0] === targetProcess
    && contributor.resources.includes(inputResource)
    && contributor.resources.includes(outputResource)
    && contributor.subjects.some((subject) => subject.kind === "device" && subject.id === deviceId)
    && contributor.evidence.setupTicks === 8_000
    && contributor.evidence.powerMilliWatts === 180_000
    && contributor.evidence.energyMilliJoules === 1_440_000;
}

export default {
  apiVersion: 7,
  propose(context) {
    if (!observesExactBurnInTransition(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = burnInDispatchPatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "The shared burn-in rack changes from reliability screening to commercial screening only after three high-value mixed jobs. Preferring the already configured setup group should finish resident reliability work before switching, reducing the exact eight-second production transition without altering equipment, recipes, workload, or setup physics.",
      expectedEffect: "Reduce or remove the exact reliability-to-commercial setupTicks contributor. The locked delivery portfolio, case scores, completion timing, and any new reverse transition remain authoritative and may reject the sequencing change.",
      addressedLoss: "setup-campaign",
      addressedLossTarget: {
        contributor: contributorId,
        metric: "setupTicks",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
