import type {
  JsonPatchOperation,
  ProjectProposalContext,
  ProjectProposalProvider,
} from "./runtime-api";

const contributorId = "quality:quality-excursion:dram-front-end:etch-cell-layer-2:etch-l2:etch-cell-layer-2";
const strategy = "recipe:particle-suppression-layer-two-etch";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function currentParticleControlPatch(
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
    || cadenceControl.normalMode !== "closed-loop-control"
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
      value: "particle-suppression",
    },
    {
      op: "replace",
      path: `/devices/${deviceIndex}/recipes/${normalRecipeIndex}/mode`,
      value: "particle-suppression",
    },
  ];
}

function observesCurrentParticleExcursion(context: Readonly<ProjectProposalContext>): boolean {
  if (context.branch.role !== "leader" || !context.fabLoss?.chain.includes("yield-quality")) return false;
  const bucket = context.fabLoss.buckets.find((item) => item.id === "yield-quality");
  const contributor = bucket?.contributors.find((item) => item.id === contributorId);
  return contributor?.mechanism === "quality-excursion"
    && contributor.route === "dram-front-end"
    && contributor.step === "etch-cell-layer-2"
    && contributor.processes.length === 1
    && contributor.processes[0] === "etch-cell-layer-2"
    && contributor.subjects.some((subject) => subject.kind === "device" && subject.id === "etch-l2")
    && typeof contributor.evidence.introducedDefectInstances === "number"
    && contributor.evidence.introducedDefectInstances > 0;
}

export default {
  apiVersion: 8,
  propose(context) {
    if (!observesCurrentParticleExcursion(context)
      || context.history.some((item) => item.strategy === strategy)) return null;
    const patch = currentParticleControlPatch(context.blueprint);
    if (!patch) return null;
    return {
      strategy,
      hypothesis: "Selecting the catalogued layer-two particle-suppression mode can prevent the observed particle-contamination instance before inspection and rework.",
      expectedEffect: "Reduce exact etch-origin introduced defect instances while charging the mode's authored 13/10 active-power envelope across every locked case.",
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
