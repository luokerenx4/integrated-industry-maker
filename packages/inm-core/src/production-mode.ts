import type {
  DeviceAsset, IndustrialProcess, ProcessAmount, ProductionModeDefinition, ResourceBufferQuantity, ResourceId,
} from "./types";

function mergeProcessAmounts(amounts: ProcessAmount[]): ProcessAmount[] {
  const totals: Record<ResourceId, number> = {};
  for (const amount of amounts) totals[amount.resource] = (totals[amount.resource] ?? 0) + amount.count;
  return Object.entries(totals).sort(([left], [right]) => left.localeCompare(right)).map(([resource, count]) => ({ resource, count }));
}

function mergeBufferAmounts(amounts: ResourceBufferQuantity[]): ResourceBufferQuantity[] {
  const totals = new Map<string, ResourceBufferQuantity>();
  for (const amount of amounts) {
    const key = `${amount.buffer}\0${amount.resource}\0${amount.minimumTreatmentLevel ?? "any"}\0${amount.treatmentLevel ?? 0}`;
    const existing = totals.get(key);
    if (existing) existing.count += amount.count;
    else totals.set(key, { ...amount });
  }
  return [...totals.values()].sort((left, right) => left.buffer.localeCompare(right.buffer) || left.resource.localeCompare(right.resource));
}

export function effectiveProductionAmounts(process: IndustrialProcess, mode: ProductionModeDefinition): { inputs: ProcessAmount[]; outputs: ProcessAmount[] } {
  return {
    inputs: mergeProcessAmounts([
      ...process.inputs.map((amount) => ({ resource: amount.resource, count: amount.count * mode.inputCycles })),
      ...mode.auxiliaryInputs.map((amount) => ({ resource: amount.resource, count: amount.count })),
    ]),
    outputs: mergeProcessAmounts(process.outputs.map((amount) => ({ resource: amount.resource, count: amount.count * mode.outputCycles }))),
  };
}

export function compileProductionAmounts(
  process: IndustrialProcess,
  mode: ProductionModeDefinition,
  bindings: { inputs: Record<ResourceId, string>; outputs: Record<ResourceId, string> },
): { inputs: ResourceBufferQuantity[]; outputs: ResourceBufferQuantity[] } {
  return {
    inputs: mergeBufferAmounts([
      ...process.inputs.map((amount) => ({
        buffer: bindings.inputs[amount.resource]!, resource: amount.resource, count: amount.count * mode.inputCycles,
        minimumTreatmentLevel: mode.minimumInputTreatmentLevel,
      })),
      ...mode.auxiliaryInputs.map((amount) => ({ buffer: amount.buffer, resource: amount.resource, count: amount.count })),
    ]),
    outputs: mergeBufferAmounts(process.outputs.map((amount) => ({ buffer: bindings.outputs[amount.resource]!, resource: amount.resource, count: amount.count * mode.outputCycles, treatmentLevel: 0 }))),
  };
}

export function productionDurationTicks(process: IndustrialProcess, asset: DeviceAsset, mode: ProductionModeDefinition): number {
  return Math.max(1, Math.ceil(process.durationTicks
    * asset.production!.speed.denominator / asset.production!.speed.numerator
    * mode.durationMultiplier.numerator / mode.durationMultiplier.denominator));
}

export function productionPowerMilliWatts(asset: DeviceAsset, mode: ProductionModeDefinition): number {
  return Math.ceil(asset.power.consumptionMilliWatts * mode.powerMultiplier.numerator / mode.powerMultiplier.denominator);
}
