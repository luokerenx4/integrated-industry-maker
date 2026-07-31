import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "quality:quality-excursion:dram-front-end:etch-cell-layer-2:etch-l2:etch-cell-layer-2:critical-dimension";
const strategy = "recipe:dimensional-stability-layer-two-etch";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dimensionalStabilityPatch(
  blueprint: ProjectProposalContext["blueprint"],
): JsonPatchOperation[] | null {
  const deviceIndex = blueprint.devices.findIndex((device) => device.id === "etch-l2");
  const device = blueprint.devices[deviceIndex];
  const policy = isRecord(device?.policy) ? device.policy : null;
  const cadenceControl = policy?.cadenceControl;
  if (!device
    || device.asset !== "closed-loop-plasma-etch-bay"
    || device.recipe !== undefined
    || !Array.isArray(device.recipes)
    || device.recipes.length !== 2
    || !isRecord(cadenceControl)
    || cadenceControl.kind !== "downstream-coverage-recovery"
    || cadenceControl.process !== "etch-cell-layer-2"
    || cadenceControl.normalMode !== "particle-suppression"
    || cadenceControl.recoveryMode !== "closed-loop-fast-4-5") return null;
  const normalRecipeIndex = device.recipes.findIndex((recipe) =>
    isRecord(recipe)
    && recipe.process === cadenceControl.process
    && recipe.mode === cadenceControl.normalMode);
  const recoveryRecipe = device.recipes.find((recipe) =>
    isRecord(recipe)
    && recipe.process === cadenceControl.process
    && recipe.mode === cadenceControl.recoveryMode);
  if (normalRecipeIndex < 0 || !recoveryRecipe) return null;
  return [
    {
      op: "replace",
      path: `/devices/${deviceIndex}/policy/cadenceControl/normalMode`,
      value: "dimensional-stability",
    },
    {
      op: "replace",
      path: `/devices/${deviceIndex}/recipes/${normalRecipeIndex}/mode`,
      value: "dimensional-stability",
    },
  ];
}

function observesResidualDimensionalExcursion(context: Readonly<ProjectProposalContext>): boolean {
  if (context.branch.role !== "leader" || !context.fabLoss?.chain.includes("yield-quality")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "yield-quality");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return contributor?.mechanism === "quality-excursion"
    && contributor.route === "dram-front-end"
    && contributor.step === "etch-cell-layer-2"
    && contributor.processes.length === 1
    && contributor.processes[0] === "etch-cell-layer-2"
    && contributor.defects.length === 1
    && contributor.defects[0] === "critical-dimension"
    && contributor.subjects.some((subject) => subject.kind === "device" && subject.id === "etch-l2")
    && typeof contributor.evidence.introducedDefectInstances === "number"
    && contributor.evidence.introducedDefectInstances > 0;
}

export default {
  apiVersion: 10,
  propose(context) {
    if (!observesResidualDimensionalExcursion(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = dimensionalStabilityPatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "Running normal layer-two etch with the installed tool's dimensional-stability control can prevent the residual critical-dimension excursion without changing cadence or recovery policy.",
      expectedEffect: "Reduce the exact critical-dimension origin from one instance to zero while preserving particle and latent-electrical prevention and charging the authored 3/2 active-power envelope in every locked case.",
      addressedLoss: "yield-quality",
      addressedLossTarget: {
        contributor: contributorId,
        metric: "introducedDefectInstances",
        direction: "decrease",
      },
      patch,
    };
  },
} satisfies ProjectProposalProvider;
