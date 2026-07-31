import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "device:substrate-receiving-to-packaging-loader:power-interruption";
const shippingGrid = "grid-cleanroom-shipping-power";
const strategy = "generation:shipping-grid-second-wind-turbine";

function secondTurbinePatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const shippingPower = blueprint.devices.find((device) => device.id === "shipping-power");
  if (!shippingPower
    || shippingPower.asset !== "wind-turbine"
    || shippingPower.region !== "cleanroom"
    || blueprint.devices.some((device) => device.id === "shipping-power-redundant")) return null;
  return [{
    op: "add",
    path: "/devices/-",
    value: {
      id: "shipping-power-redundant",
      asset: "wind-turbine",
      region: "cleanroom",
      position: { x: 4, y: 30 },
      rotation: 0,
    },
  }];
}

function observesExactShippingGridInterruption(
  context: Readonly<ProjectProposalContext>,
): boolean {
  if (context.branch.role !== "leader"
    || !context.fabLoss?.chain.includes("power-interruption")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "power-interruption");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return bucket?.evidence.unpoweredTicks === 552_076
    && bucket.evidence.attributedTicks === 552_076
    && bucket.evidence.unattributedTicks === 0
    && bucket.evidence.affectedGrids === 1
    && contributor?.mechanism === "power-supply-interruption"
    && contributor.grid === shippingGrid
    && contributor.endpointStage === "loader"
    && contributor.subjects.some((subject) =>
      subject.kind === "connection" && subject.id === "substrate-receiving-to-packaging")
    && contributor.subjects.some((subject) =>
      subject.kind === "device" && subject.id === "shipping-power")
    && contributor.evidence.unpoweredTicks === 163_777
    && contributor.evidence.gridUnservedMilliJoules === 149_450
    && contributor.evidence.gridPeakDeficitMilliWatts === 7_000
    && contributor.evidence.gridRequiredStorageCapacityMilliJoules === 21_225;
}

export default {
  apiVersion: 10,
  propose(context) {
    if (!observesExactShippingGridInterruption(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = secondTurbinePatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "Every measured unpowered tick belongs to the 600 W shipping grid, led by a substrate-lane loader on a grid with a 7 W peak deficit. One additional authored turbine should remove the exact endpoint interruption without changing the process route, workload, dispatch, or Scenario.",
      expectedEffect: "Reduce the leading Device power-interruption contributor and shipping-grid unserved energy; the turbine's build/area cost, renewable cases, delivery service, and all current-best case scores remain authoritative.",
      addressedLoss: "power-interruption",
      addressedLossTarget: {
        contributor: contributorId,
        metric: "unpoweredTicks",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
