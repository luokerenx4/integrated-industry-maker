import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compileFactoryProject,
  loadFactoryProject,
  runUntil,
  specializeSharedWorkCenterCandidates,
} from "../../../../packages/inm-core/src/index";
import type { Blueprint, FactoryMetrics } from "../../../../packages/inm-core/src/types";

interface BenchmarkCase {
  id: string;
  world: string;
  scenario: string;
  objective: string;
  seed: number;
  weight: number;
}

interface BenchmarkDefinition {
  cases: BenchmarkCase[];
}

interface Variant {
  strategy: string;
  blueprint: Blueprint;
}

interface ResultRow {
  strategy: string;
  aggregateDelta: number;
  minimumCaseDelta: number;
  guardrailPassed: boolean;
  caseDeltas: number[];
  metrics: FactoryMetrics[];
}

const projectDir = resolve(import.meta.dir, "../..");
const definition = JSON.parse(
  await readFile(join(projectDir, "benchmarks/greenfield-dram-design.benchmark.json"), "utf8"),
) as BenchmarkDefinition;
const incumbentBlueprint = "generated-dram-fab";

function positiveIntegerArgument(name: string, fallback: number): number {
  const index = Bun.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(Bun.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

const layoutLimit = positiveIntegerArgument("--layout-candidates", 8);
const deepOnly = Bun.argv.includes("--deep-only");
const totalWeight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
const weightedMean = (values: number[]) =>
  values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / totalWeight;

async function simulate(blueprint: Blueprint): Promise<FactoryMetrics[]> {
  return Promise.all(definition.cases.map(async (item) => {
    const loaded = await loadFactoryProject(projectDir, {
      blueprint: incumbentBlueprint,
      world: item.world,
      scenario: item.scenario,
      objective: item.objective,
    });
    return runUntil(compileFactoryProject({ ...loaded, blueprint }), undefined, { seed: item.seed }).metrics;
  }));
}

function withEtchMaintenance(blueprint: Blueprint, opportunisticAfterJobs: number): Blueprint {
  const candidate = structuredClone(blueprint);
  for (const device of candidate.devices.filter((item) => item.id === "etch-1" || item.id === "etch-l2")) {
    device.policy = {
      ...device.policy,
      preventiveMaintenance: { opportunistic: { afterJobs: opportunisticAfterJobs } },
    };
  }
  return candidate;
}

function withDeepInspection(blueprint: Blueprint): Blueprint {
  const candidate = structuredClone(blueprint);
  const inspection = candidate.devices.find((device) => device.id === "inspection-1");
  if (!inspection?.recipe) throw new Error("inspection-1 has no configured recipe");
  inspection.recipe.process = "inspect-final-pattern-deep";
  return candidate;
}

const incumbentSource = await loadFactoryProject(projectDir, {
  blueprint: incumbentBlueprint,
  world: definition.cases[0]!.world,
  scenario: definition.cases[0]!.scenario,
  objective: definition.cases[0]!.objective,
});
const incumbent = compileFactoryProject(incumbentSource);
const incumbentMetrics = await simulate(incumbent.blueprint);
const incumbentScores = incumbentMetrics.map((metrics) => metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const variants: Variant[] = [];

for (const opportunisticAfterJobs of [4, 5, 6, 7]) variants.push({
  strategy: `maintenance:etch-jobs-${opportunisticAfterJobs}`,
  blueprint: withEtchMaintenance(incumbent.blueprint, opportunisticAfterJobs),
});
variants.push({
  strategy: "inspection:deep-final-pattern",
  blueprint: withDeepInspection(incumbent.blueprint),
});

const specialized = specializeSharedWorkCenterCandidates(incumbent, incumbent.blueprint, {
  device: "etch-1",
  process: "etch-cell-layer-2",
  cloneId: "etch-l2",
}, layoutLimit);
for (const [index, layout] of specialized.entries()) {
  variants.push({ strategy: `specialize:etch-layer-two-layout-${index + 1}`, blueprint: layout.blueprint });
  variants.push({
    strategy: `specialize:etch-layer-two-layout-${index + 1}+deep-inspection`,
    blueprint: withDeepInspection(layout.blueprint),
  });
  for (const opportunisticAfterJobs of [5, 6]) variants.push({
    strategy: `specialize:etch-layer-two-layout-${index + 1}+maintenance-${opportunisticAfterJobs}`,
    blueprint: withEtchMaintenance(layout.blueprint, opportunisticAfterJobs),
  });
  for (const opportunisticAfterJobs of [5, 6]) variants.push({
    strategy: `specialize:etch-layer-two-layout-${index + 1}+maintenance-${opportunisticAfterJobs}+deep-inspection`,
    blueprint: withDeepInspection(withEtchMaintenance(layout.blueprint, opportunisticAfterJobs)),
  });
}

const rows: ResultRow[] = [];
const selectedVariants = deepOnly
  ? variants.filter((variant) => variant.strategy.includes("deep-inspection") || variant.strategy === "inspection:deep-final-pattern")
  : variants;
for (const variant of selectedVariants) {
  const metrics = await simulate(variant.blueprint);
  const scores = metrics.map((item) => item.finalScore);
  const caseDeltas = scores.map((score, index) => score - incumbentScores[index]!);
  rows.push({
    strategy: variant.strategy,
    aggregateDelta: weightedMean(scores) - incumbentAggregate,
    minimumCaseDelta: Math.min(...caseDeltas),
    guardrailPassed: caseDeltas.every((delta) => delta >= -1e-9),
    caseDeltas,
    metrics,
  });
}

rows.sort((left, right) =>
  Number(right.guardrailPassed) - Number(left.guardrailPassed)
  || right.aggregateDelta - left.aggregateDelta
  || right.minimumCaseDelta - left.minimumCaseDelta
  || left.strategy.localeCompare(right.strategy));

console.log(`# commissioned yield search · incumbent aggregate=${incumbentAggregate.toFixed(6)} · ${selectedVariants.length} physical/policy variants · zero-regression current-best gate`);
console.log("verdict\tstrategy\taggregate-delta\tminimum-case-delta\tcase-deltas\tmixed-fpy\tmixed-rework\tmixed-scrap\tmixed-drift\tmixed-completed\tmixed-net-value\tcost\tarea");
for (const row of rows) {
  const mixed = row.metrics[definition.cases.findIndex((item) => item.id === "mixed-quality")]!;
  console.log([
    row.guardrailPassed && row.aggregateDelta > 1e-9 ? "KEEP" : "REJECT",
    row.strategy,
    row.aggregateDelta.toFixed(6),
    row.minimumCaseDelta.toFixed(6),
    row.caseDeltas.map((value) => value.toFixed(3)).join(","),
    mixed.qualityFlow.firstPassYield.toFixed(3),
    mixed.qualityFlow.totalReworkCycles,
    mixed.qualityFlow.scrapDispositions,
    mixed.equipmentMaintenance.totalDriftDefects,
    mixed.lotFlow.completed,
    mixed.deliveryPortfolio.netValue.toFixed(3),
    mixed.totalBuildCost,
    mixed.occupiedArea,
  ].join("\t"));
}
