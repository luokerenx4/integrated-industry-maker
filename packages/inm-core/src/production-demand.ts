import type { ProcessAmount, ResourceId } from "./types";

const EPSILON = 1e-9;

export interface DemandProcessCandidate<T> {
  key: string;
  inputs: readonly ProcessAmount[];
  outputs: readonly ProcessAmount[];
  data: T;
}

export interface PlannedDemandProcess<T> {
  candidate: DemandProcessCandidate<T>;
  primaryResource: ResourceId;
  requiredCyclesPerMinute: number;
  inputsPerMinute: Record<ResourceId, number>;
  outputsPerMinute: Record<ResourceId, number>;
}

export interface ResourceDemandPlan<T> {
  processes: PlannedDemandProcess<T>[];
  rawDemandPerMinute: Record<ResourceId, number>;
  surplusPerMinute: Record<ResourceId, number>;
}

function add(target: Map<ResourceId, number>, resource: ResourceId, amount: number): void {
  const next = (target.get(resource) ?? 0) + amount;
  target.set(resource, Math.abs(next) <= EPSILON ? 0 : next);
}

function rates(amounts: readonly ProcessAmount[], cyclesPerMinute: number): Record<ResourceId, number> {
  const result: Record<ResourceId, number> = {};
  for (const amount of amounts) result[amount.resource] = (result[amount.resource] ?? 0) + amount.count * cyclesPerMinute;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Expands a material target as a balance sheet. A selected process adds all of
 * its inputs as demand and credits all of its outputs in the same operation, so
 * coproducts can satisfy sibling requirements instead of being planned twice.
 */
export function planResourceDemand<T>(
  targetResource: ResourceId,
  targetRatePerMinute: number,
  choose: (resource: ResourceId) => DemandProcessCandidate<T> | null,
): ResourceDemandPlan<T> {
  const balances = new Map<ResourceId, number>([[targetResource, targetRatePerMinute]]);
  const rawDemand = new Map<ResourceId, number>();
  const selected = new Map<string, { candidate: DemandProcessCandidate<T>; primaryResource: ResourceId; cycles: number }>();

  for (let iteration = 0; iteration < 10_000; iteration++) {
    const resource = [...balances.entries()]
      .filter(([, amount]) => amount > EPSILON)
      .map(([id]) => id)
      .sort()[0];
    if (!resource) {
      const processes = [...selected.values()].map((row): PlannedDemandProcess<T> => ({
        candidate: row.candidate,
        primaryResource: row.primaryResource,
        requiredCyclesPerMinute: row.cycles,
        inputsPerMinute: rates(row.candidate.inputs, row.cycles),
        outputsPerMinute: rates(row.candidate.outputs, row.cycles),
      })).sort((a, b) => a.candidate.key.localeCompare(b.candidate.key));
      return {
        processes,
        rawDemandPerMinute: Object.fromEntries([...rawDemand.entries()].filter(([, amount]) => amount > EPSILON).sort(([a], [b]) => a.localeCompare(b))),
        surplusPerMinute: Object.fromEntries([...balances.entries()].filter(([, amount]) => amount < -EPSILON)
          .map(([id, amount]): [ResourceId, number] => [id, -amount]).sort(([a], [b]) => a.localeCompare(b))),
      };
    }

    const required = balances.get(resource)!;
    const candidate = choose(resource);
    const output = candidate?.outputs.find((amount) => amount.resource === resource);
    if (!candidate || !output) {
      add(rawDemand, resource, required);
      balances.set(resource, 0);
      continue;
    }
    const sameResourceInput = candidate.inputs.filter((amount) => amount.resource === resource).reduce((sum, amount) => sum + amount.count, 0);
    if (output.count <= sameResourceInput) {
      throw new Error(`Process candidate '${candidate.key}' cannot satisfy net demand for '${resource}'`);
    }
    const cycles = required / output.count;
    const existing = selected.get(candidate.key);
    if (existing) existing.cycles += cycles;
    else selected.set(candidate.key, { candidate, primaryResource: resource, cycles });
    for (const amount of candidate.outputs) add(balances, amount.resource, -amount.count * cycles);
    for (const amount of candidate.inputs) add(balances, amount.resource, amount.count * cycles);
  }
  throw new Error(`Production demand expansion did not converge for target '${targetResource}'`);
}
