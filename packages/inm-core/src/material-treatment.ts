import type {
  DeviceAsset, IndustrialProcess, MaterialTreatmentModeDefinition, ProcessAmount, ProductionModeDefinition, ResourceId,
} from "./types";
import { effectiveProductionAmounts } from "./production-mode";

export interface MaterialTreatmentSelection {
  asset: DeviceAsset;
  mode: MaterialTreatmentModeDefinition;
}

export function selectMaterialTreatment(
  assets: Record<string, DeviceAsset>,
  minimumLevel: number,
): MaterialTreatmentSelection | null {
  if (minimumLevel <= 0) return null;
  return Object.values(assets).flatMap((asset) => (asset.treatment?.modes ?? [])
    .filter((mode) => mode.level >= minimumLevel)
    .map((mode) => ({ asset, mode })))
    .sort((left, right) => left.mode.level - right.mode.level
      || (left.mode.agent.count / left.mode.itemCount) - (right.mode.agent.count / right.mode.itemCount)
      || (left.asset.economics.buildCost / left.mode.itemCount) - (right.asset.economics.buildCost / right.mode.itemCount)
      || left.asset.id.localeCompare(right.asset.id) || left.mode.id.localeCompare(right.mode.id))[0] ?? null;
}

function mergeAmounts(amounts: ProcessAmount[]): ProcessAmount[] {
  const totals: Record<ResourceId, number> = {};
  for (const amount of amounts) totals[amount.resource] = (totals[amount.resource] ?? 0) + amount.count;
  return Object.entries(totals).sort(([left], [right]) => left.localeCompare(right)).map(([resource, count]) => ({ resource, count }));
}

/** Material balance for one configured production job, including the upstream agent needed to treat every Process input. */
export function plannedProductionAmounts(
  process: IndustrialProcess,
  productionMode: ProductionModeDefinition,
  assets: Record<string, DeviceAsset>,
): {
  inputs: ProcessAmount[];
  outputs: ProcessAmount[];
  treatment: MaterialTreatmentSelection | null;
  treatedInputs: ProcessAmount[];
  agentInput: ProcessAmount | null;
} {
  const base = effectiveProductionAmounts(process, productionMode);
  const treatment = selectMaterialTreatment(assets, productionMode.minimumInputTreatmentLevel);
  if (productionMode.minimumInputTreatmentLevel > 0 && !treatment) {
    throw new Error(`No project-local treatment mode reaches level ${productionMode.minimumInputTreatmentLevel} required by '${productionMode.id}'`);
  }
  const treatedInputs = process.inputs.map((amount) => ({ resource: amount.resource, count: amount.count * productionMode.inputCycles }));
  const agentInput = treatment ? {
    resource: treatment.mode.agent.resource,
    count: treatedInputs.reduce((sum, amount) => sum + amount.count, 0) * treatment.mode.agent.count / treatment.mode.itemCount,
  } : null;
  return {
    inputs: mergeAmounts([...base.inputs, ...(agentInput ? [agentInput] : [])]),
    outputs: base.outputs,
    treatment,
    treatedInputs,
    agentInput,
  };
}
