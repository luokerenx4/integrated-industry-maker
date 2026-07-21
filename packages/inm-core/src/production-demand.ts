import type { ProcessAmount, ResourceId } from "./types";

const EPSILON = 1e-9;
const PLAN_EPSILON = 1e-7;

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
  rawCost: number;
  processCost: number;
}

export interface ResourceDemandOptimization<T> {
  targetResource: ResourceId;
  targetRatePerMinute: number;
  candidates: readonly DemandProcessCandidate<T>[];
  rawResources: readonly ResourceId[];
  candidateCost?: (candidate: DemandProcessCandidate<T>) => number;
  rawResourceCost?: (resource: ResourceId) => number;
}

function add(target: Map<ResourceId, number>, resource: ResourceId, amount: number): void {
  const next = (target.get(resource) ?? 0) + amount;
  target.set(resource, Math.abs(next) <= EPSILON ? 0 : next);
}

function normalize(value: number): number {
  const normalized = Math.round(value * 1e9) / 1e9;
  return Math.abs(normalized) <= EPSILON ? 0 : normalized;
}

function rates(amounts: readonly ProcessAmount[], cyclesPerMinute: number): Record<ResourceId, number> {
  const result: Record<ResourceId, number> = {};
  for (const amount of amounts) result[amount.resource] = (result[amount.resource] ?? 0) + amount.count * cyclesPerMinute;
  return Object.fromEntries(Object.entries(result).map(([resource, amount]): [ResourceId, number] => [resource, normalize(amount)]).sort(([a], [b]) => a.localeCompare(b)));
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
        rawCost: [...rawDemand.values()].reduce((sum, amount) => sum + amount, 0),
        processCost: [...selected.values()].reduce((sum, row) => sum + row.cycles, 0),
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

interface LinearSolution { objective: number; variables: number[] }

/** Two-phase simplex for max(c·x), A·x <= b, x >= 0. */
function solveLinearProgram(a: number[][], b: number[], c: number[]): LinearSolution | null {
  const m = b.length; const n = c.length;
  const basis = Array.from({ length: m }, (_, index) => n + index);
  const nonBasis = [...Array.from({ length: n }, (_, index) => index), -1];
  const tableau = Array.from({ length: m + 2 }, () => Array<number>(n + 2).fill(0));
  for (let row = 0; row < m; row++) for (let column = 0; column < n; column++) tableau[row]![column] = a[row]![column]!;
  for (let row = 0; row < m; row++) { tableau[row]![n] = -1; tableau[row]![n + 1] = b[row]!; }
  for (let column = 0; column < n; column++) tableau[m]![column] = -c[column]!;
  nonBasis[n] = -1; tableau[m + 1]![n] = 1;

  const pivot = (row: number, column: number): void => {
    const inverse = 1 / tableau[row]![column]!;
    for (let other = 0; other < m + 2; other++) if (other !== row) for (let index = 0; index < n + 2; index++) if (index !== column) {
      tableau[other]![index] = tableau[other]![index]! - tableau[row]![index]! * tableau[other]![column]! * inverse;
    }
    for (let index = 0; index < n + 2; index++) if (index !== column) tableau[row]![index] = tableau[row]![index]! * inverse;
    for (let other = 0; other < m + 2; other++) if (other !== row) tableau[other]![column] = tableau[other]![column]! * -inverse;
    tableau[row]![column] = inverse;
    [basis[row], nonBasis[column]] = [nonBasis[column]!, basis[row]!];
  };
  const simplex = (phase: 1 | 2): boolean => {
    const objectiveRow = phase === 1 ? m + 1 : m;
    while (true) {
      let column = -1;
      for (let candidate = 0; candidate <= n; candidate++) {
        if (phase === 2 && nonBasis[candidate] === -1) continue;
        if (column === -1 || tableau[objectiveRow]![candidate]! < tableau[objectiveRow]![column]! - EPSILON
          || (Math.abs(tableau[objectiveRow]![candidate]! - tableau[objectiveRow]![column]!) <= EPSILON && nonBasis[candidate]! < nonBasis[column]!)) column = candidate;
      }
      if (tableau[objectiveRow]![column]! >= -EPSILON) return true;
      let row = -1;
      for (let candidate = 0; candidate < m; candidate++) {
        if (tableau[candidate]![column]! <= EPSILON) continue;
        const ratio = tableau[candidate]![n + 1]! / tableau[candidate]![column]!;
        const bestRatio = row === -1 ? 0 : tableau[row]![n + 1]! / tableau[row]![column]!;
        if (row === -1 || ratio < bestRatio - EPSILON || (Math.abs(ratio - bestRatio) <= EPSILON && basis[candidate]! < basis[row]!)) row = candidate;
      }
      if (row === -1) return false;
      pivot(row, column);
    }
  };

  let row = 0;
  for (let candidate = 1; candidate < m; candidate++) if (tableau[candidate]![n + 1]! < tableau[row]![n + 1]!) row = candidate;
  if (tableau[row]![n + 1]! < -EPSILON) {
    pivot(row, n);
    if (!simplex(1) || tableau[m + 1]![n + 1]! < -EPSILON) return null;
    if (Math.abs(tableau[m + 1]![n + 1]!) > EPSILON) return null;
    const artificialRow = basis.indexOf(-1);
    if (artificialRow >= 0) {
      let column = 0;
      for (let candidate = 1; candidate <= n; candidate++) if (Math.abs(tableau[artificialRow]![candidate]!) > Math.abs(tableau[artificialRow]![column]!) + EPSILON
        || (Math.abs(Math.abs(tableau[artificialRow]![candidate]!) - Math.abs(tableau[artificialRow]![column]!)) <= EPSILON && nonBasis[candidate]! < nonBasis[column]!)) column = candidate;
      if (Math.abs(tableau[artificialRow]![column]!) > EPSILON) pivot(artificialRow, column);
    }
  }
  if (!simplex(2)) throw new Error("Production mix optimization is unbounded");
  const variables = Array<number>(n).fill(0);
  for (let index = 0; index < m; index++) if (basis[index]! < n) variables[basis[index]!] = tableau[index]![n + 1]!;
  return { objective: tableau[m]![n + 1]!, variables };
}

/**
 * Finds a globally balanced continuous process mix. Raw-resource use is
 * minimized first; among equally raw-efficient solutions, installed process
 * capacity is minimized. This supports alternative recipes and cyclic
 * coproduct chains that cannot be represented by recursive tree expansion.
 */
export function optimizeResourceDemand<T>(options: ResourceDemandOptimization<T>): ResourceDemandPlan<T> {
  const candidates = [...new Map(options.candidates.map((candidate) => [candidate.key, candidate])).values()].sort((a, b) => a.key.localeCompare(b.key));
  const rawResources = [...new Set(options.rawResources)].sort();
  const resources = [...new Set([
    options.targetResource, ...rawResources,
    ...candidates.flatMap((candidate) => [...candidate.inputs, ...candidate.outputs].map((amount) => amount.resource)),
  ])].sort();
  const variableCount = candidates.length + rawResources.length;
  const matrix = resources.map((resource) => [
    ...candidates.map((candidate) => candidate.inputs.filter((amount) => amount.resource === resource).reduce((sum, amount) => sum + amount.count, 0)
      - candidate.outputs.filter((amount) => amount.resource === resource).reduce((sum, amount) => sum + amount.count, 0)),
    ...rawResources.map((raw) => raw === resource ? -1 : 0),
  ]);
  const bounds = resources.map((resource) => resource === options.targetResource ? -options.targetRatePerMinute : 0);
  const rawWeights = rawResources.map((resource) => Math.max(EPSILON, options.rawResourceCost?.(resource) ?? 1));
  const rawObjective = [...candidates.map(() => 0), ...rawWeights.map((weight) => -weight)];
  const rawSolution = solveLinearProgram(matrix, bounds, rawObjective);
  if (!rawSolution) throw new Error(`No feasible production mix can satisfy ${options.targetRatePerMinute} '${options.targetResource}'/min`);
  const rawCost = -rawSolution.objective;
  const candidateCosts = candidates.map((candidate) => Math.max(EPSILON, options.candidateCost?.(candidate) ?? 1));
  const costMatrix = [...matrix, [...candidates.map(() => 0), ...rawWeights]];
  const costBounds = [...bounds, rawCost + EPSILON];
  const processObjective = [...candidateCosts.map((cost) => -cost), ...rawWeights.map((weight) => -weight * 1e-6)];
  const solution = solveLinearProgram(costMatrix, costBounds, processObjective) ?? rawSolution;

  const processRows = candidates.map((candidate, index) => ({ candidate, cycles: normalize(solution.variables[index] ?? 0) })).filter((row) => row.cycles > PLAN_EPSILON);
  const rawDemandPerMinute = Object.fromEntries(rawResources.map((resource, index): [ResourceId, number] => [resource, normalize(solution.variables[candidates.length + index] ?? 0)])
    .filter(([, amount]) => amount > PLAN_EPSILON));
  const balances = new Map(resources.map((resource): [ResourceId, number] => [resource, rawDemandPerMinute[resource] ?? 0]));
  for (const row of processRows) {
    for (const amount of row.candidate.outputs) add(balances, amount.resource, amount.count * row.cycles);
    for (const amount of row.candidate.inputs) add(balances, amount.resource, -amount.count * row.cycles);
  }
  add(balances, options.targetResource, -options.targetRatePerMinute);
  return {
    processes: processRows.map((row): PlannedDemandProcess<T> => {
      const primary = row.candidate.outputs.some((amount) => amount.resource === options.targetResource)
        ? options.targetResource : [...row.candidate.outputs].sort((a, b) => a.resource.localeCompare(b.resource))[0]!.resource;
      return {
        candidate: row.candidate, primaryResource: primary, requiredCyclesPerMinute: row.cycles,
        inputsPerMinute: rates(row.candidate.inputs, row.cycles), outputsPerMinute: rates(row.candidate.outputs, row.cycles),
      };
    }),
    rawDemandPerMinute,
    surplusPerMinute: Object.fromEntries([...balances.entries()].filter(([, amount]) => amount > PLAN_EPSILON)
      .map(([resource, amount]): [ResourceId, number] => [resource, normalize(amount)]).sort(([a], [b]) => a.localeCompare(b))),
    rawCost: normalize(rawCost),
    processCost: processRows.reduce((sum, row) => sum + row.cycles * (options.candidateCost?.(row.candidate) ?? 1), 0),
  };
}
