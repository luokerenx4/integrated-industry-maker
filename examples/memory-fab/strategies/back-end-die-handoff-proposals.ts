import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const connectionId = "probe-to-packaging";
const loaderId = "probe-to-packaging-loader";
const unloaderId = "probe-to-packaging-unloader";
const handlerAsset = "die-tray-handler";
const contributorId = "connection:probe-to-packaging:transport-line-contention";

const priorityStrategy = "logistics:priority-four-position-die-tray-handoff";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deviceIndex(
  blueprint: ProjectProposalContext["blueprint"],
  id: string,
): number {
  return blueprint.devices.findIndex((device) => device.id === id);
}

function trayHandlerPatch(
  blueprint: ProjectProposalContext["blueprint"],
  powerPriority?: number,
): JsonPatchOperation[] | null {
  const connection = blueprint.connections.find((item) => item.id === connectionId);
  if (!connection
    || !isRecord(connection.from)
    || connection.from.device !== "probe-1"
    || !isRecord(connection.to)
    || connection.to.device !== "packaging-1"
    || !Array.isArray(connection.path)
    || connection.path.length !== 2
    || !Array.isArray(connection.resources)
    || connection.resources.length !== 1
    || connection.resources[0] !== "known-good-dram-die") return null;

  const patches: JsonPatchOperation[] = [];
  for (const id of [loaderId, unloaderId]) {
    const index = deviceIndex(blueprint, id);
    const device = blueprint.devices[index];
    if (!device
      || !isRecord(device.transportEndpoint)
      || device.transportEndpoint.connection !== connectionId
      || device.transportEndpoint.distance !== 1) return null;
    if (device.asset === "sorter") {
      patches.push({
        op: "replace",
        path: `/devices/${index}/asset`,
        value: handlerAsset,
      });
    } else if (device.asset !== handlerAsset) {
      return null;
    }
    if (powerPriority !== undefined) {
      const policy = isRecord(device.policy) ? device.policy : null;
      if (policy?.powerPriority !== powerPriority) {
        patches.push({
          op: policy ? (Object.hasOwn(policy, "powerPriority") ? "replace" : "add") : "add",
          path: policy ? `/devices/${index}/policy/powerPriority` : `/devices/${index}/policy`,
          value: policy ? powerPriority : { powerPriority },
        });
      }
    }
  }
  return patches.length ? patches : null;
}

function observesExactDieHandoffBlocking(
  context: Readonly<ProjectProposalContext>,
): boolean {
  if (context.branch.role !== "leader"
    || !context.fabLoss?.chain.includes("transport-blocking")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "transport-blocking");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return bucket?.evidence.blockedConnections === 2
    && bucket.evidence.blockedItemTicks === 58_000
    && bucket.evidence.lineContentionTicks === 33_000
    && bucket.evidence.endpointCapacityTicks === 15_300
    && bucket.evidence.endpointPowerTicks === 9_700
    && bucket.evidence.endpointFailureTicks === 0
    && contributor?.mechanism === "transport-line-contention"
    && contributor.resources.length === 1
    && contributor.resources[0] === "known-good-dram-die"
    && contributor.evidence.blockedItemTicks === 46_800
    && contributor.evidence.lineContentionTicks === 27_000
    && contributor.evidence.endpointCapacityTicks === 14_000
    && contributor.evidence.endpointPowerTicks === 5_800
    && contributor.evidence.endpointFailureTicks === 0
    && contributor.evidence.deliveredItems === 96
    && contributor.evidence.capacityItemsPerMinute === 240
    && contributor.subjects.some((subject) =>
      subject.kind === "connection" && subject.id === connectionId);
}

export default {
  apiVersion: 10,
  propose(context) {
    if (!observesExactDieHandoffBlocking(context)) return null;
    const used = new Set(context.history.map((item) => item.strategy));
    if (!used.has(priorityStrategy)) {
      const patch = trayHandlerPatch(context.blueprint, 8);
      if (!patch) return null;
      return {
        strategy: priorityStrategy,
        hypothesis: "Probe releases known-good dies in batches of up to eight, while both explicit endpoints serialize them one at a time onto a two-cell line and cross an intermittently constrained shipping grid at priority zero. Four-position tray handling with priority eight at only those endpoints should reduce propagated cell occupancy, endpoint service blocking, and endpoint power interruption without adding generation or changing any Process.",
        expectedEffect: "Reduce the exact Probe-to-packaging blocked item-time through four-die endpoint stacks that survive short load-shedding intervals; the additional endpoint power, forty-unit net capital cost, displaced shipping load, delivery, and every locked-case score remain authoritative.",
        addressedLoss: "transport-blocking",
        addressedLossTarget: {
          contributor: contributorId,
          metric: "blockedItemTicks",
          direction: "decrease",
        },
        patch,
      };
    }
    return null;
  },
} satisfies ProjectProposalProvider;
