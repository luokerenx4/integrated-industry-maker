import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "device:lithography-1:maintenance-qualification";
const deviceId = "lithography-1";
const strategy = "maintenance:lithography-planned-after-7";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cadencePatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const deviceIndex = blueprint.devices.findIndex((device) => device.id === deviceId);
  const device = blueprint.devices[deviceIndex];
  if (!device || device.asset !== "lithography-bay" || !isRecord(device.policy)) return null;
  const maintenance = device.policy.preventiveMaintenance;
  if (!isRecord(maintenance) || !isRecord(maintenance.planned)
    || maintenance.planned.afterJobs !== 6
    || Object.keys(maintenance.planned).length !== 1
    || Object.keys(maintenance).length !== 1) return null;
  return [{
    op: "replace",
    path: `/devices/${deviceIndex}/policy/preventiveMaintenance/planned/afterJobs`,
    value: 7,
  }];
}

function observesCurrentLithographyMaintenance(context: Readonly<ProjectProposalContext>): boolean {
  if (context.branch.role !== "leader"
    || !context.fabLoss?.chain.includes("maintenance-qualification")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "maintenance-qualification");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return contributor?.mechanism === "maintenance-qualification"
    && contributor.label === deviceId
    && contributor.subjects.some((subject) =>
      subject.kind === "device" && subject.id === "maintenance-service-1")
    && contributor.resources.includes("chamber-clean-kit")
    && contributor.resources.includes("tool-qualification-wafer")
    && contributor.evidence.totalTicks === 34_000
    && contributor.evidence.maintenanceTicks === 26_000
    && contributor.evidence.qualificationTicks === 8_000
    && contributor.evidence.inputWaitTicks === 0
    && contributor.evidence.crewWaitTicks === 0
    && contributor.evidence.plannedBoundary === 2;
}

export default {
  apiVersion: 9,
  propose(context) {
    if (!observesCurrentLithographyMaintenance(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = cadencePatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "Because lithography-1 owns 34 seconds of maintenance and qualification while its observed service path has zero input or crew wait, delaying only its planned six-job boundary to seven jobs may remove one service cycle without inventing provider capacity.",
      expectedEffect: "Reduce the exact lithography-1 maintenance/qualification contributor by one physical service and qualification cycle; any drift, quality, delivery, interruption, or current-best regression remains authoritative.",
      addressedLoss: "maintenance-qualification",
      addressedLossTarget: {
        contributor: contributorId,
        metric: "totalTicks",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
