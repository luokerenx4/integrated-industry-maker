import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const burnInLocation = "buffer:burn-in-1:package-input:packaged-dram-device";
const deviceId = "burn-in-1";
const commercialBatch = "screen-commercial-dram";
const commercialSmallBatch = "screen-commercial-dram-small-batch";
const performanceBatch = "screen-performance-mix";
const performanceSmallBatch = "screen-performance-mix-small-batch";

interface ScreeningVariant {
  strategy: string;
  commercialProcess: typeof commercialBatch | typeof commercialSmallBatch;
  performanceProcess: typeof performanceBatch | typeof performanceSmallBatch;
  hypothesis: (averageInventory: number) => string;
}

const variants: ScreeningVariant[] = [
  {
    strategy: "recipe:back-end-performance-small-batch",
    commercialProcess: commercialBatch,
    performanceProcess: performanceSmallBatch,
    hypothesis: (averageInventory) =>
      `The shared burn-in rack holds ${averageInventory.toFixed(3)} packaged devices on average while its eight-device reliability job accounts for the larger in-process exposure. Replacing only that job with an explicit four-device fixed Process may start high-value screening earlier while preserving the efficient eight-device commercial job.`,
  },
  {
    strategy: "recipe:back-end-commercial-small-batch",
    commercialProcess: commercialSmallBatch,
    performanceProcess: performanceBatch,
    hypothesis: (averageInventory) =>
      `The shared burn-in rack holds ${averageInventory.toFixed(3)} packaged devices on average. Replacing only the commercial job with an explicit four-device fixed Process tests whether the shorter service quantum drains residual inventory without changing the high-value reliability batch.`,
  },
  {
    strategy: "recipe:back-end-dual-small-batch",
    commercialProcess: commercialSmallBatch,
    performanceProcess: performanceSmallBatch,
    hypothesis: (averageInventory) =>
      `The shared burn-in rack holds ${averageInventory.toFixed(3)} packaged devices on average ahead of two eight-device operations. Selecting explicit four-device fixed Processes for both product families may reduce formation exposure and finish the terminal tail, at the cost of authored per-device batch overhead.`,
  },
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

function recipePatch(
  context: Readonly<ProjectProposalContext>,
  variant: ScreeningVariant,
): JsonPatchOperation[] | null {
  const deviceIndex = context.blueprint.devices.findIndex((device) => device.id === deviceId);
  const device = context.blueprint.devices[deviceIndex];
  if (!device
    || device.asset !== "dram-burn-in-rack"
    || !Array.isArray(device.recipes)
    || device.recipes.length !== 2
    || !isRecord(device.policy)
    || device.policy.recipeDispatch !== "contract-value") return null;

  const commercialIndex = device.recipes.findIndex((recipe) =>
    recipe.process === commercialBatch || recipe.process === commercialSmallBatch);
  const performanceIndex = device.recipes.findIndex((recipe) =>
    recipe.process === performanceBatch || recipe.process === performanceSmallBatch);
  if (commercialIndex < 0
    || performanceIndex < 0
    || commercialIndex === performanceIndex) return null;

  const patch: JsonPatchOperation[] = [];
  if (device.recipes[commercialIndex]!.process !== variant.commercialProcess) {
    patch.push({
      op: "replace",
      path: `/devices/${deviceIndex}/recipes/${commercialIndex}/process`,
      value: variant.commercialProcess,
    });
  }
  if (device.recipes[performanceIndex]!.process !== variant.performanceProcess) {
    patch.push({
      op: "replace",
      path: `/devices/${deviceIndex}/recipes/${performanceIndex}/process`,
      value: variant.performanceProcess,
    });
  }
  return patch.length > 0 ? patch : null;
}

export default {
  apiVersion: 10,
  propose(context) {
    if (context.branch.role !== "leader") return null;
    const currentBurnInWip = observedAverageInventory(context, burnInLocation);
    if (currentBurnInWip === null || currentBurnInWip <= 0) return null;
    const variant = variants.find((item) =>
      !context.history.some((history) => history.strategy === item.strategy));
    if (!variant) return null;
    const patch = recipePatch(context, variant);
    if (!patch) return null;
    return {
      strategy: variant.strategy,
      hypothesis: variant.hypothesis(currentBurnInWip),
      expectedEffect: `Reduce average inventory at ${burnInLocation} and the coupled packaging input while preserving locked on-time service, completion, quality, interruption behavior, and current-best case scores. The separately authored small-batch durations include fixed overhead and may reject the intervention.`,
      addressedObjectiveTarget: {
        component: "wip",
        location: burnInLocation,
        metric: "averageWipEquivalentUnits",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
