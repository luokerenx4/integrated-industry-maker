import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compileFactoryProject, hashValue, loadFactoryProject, runUntil, specializeSharedWorkCenterCandidates, stableStringify,
} from "../packages/inm-core/src/index";
import type { Blueprint, CompiledFactoryProject, FactoryMetrics } from "../packages/inm-core/src/types";

interface BenchmarkCase {
  id: string;
  world: string;
  scenario: string;
  objective: string;
  seed: number;
  weight: number;
}

interface BenchmarkDefinition {
  baselineBlueprint: string;
  candidateBlueprint: string;
  cases: BenchmarkCase[];
  acceptance: {
    minimumAggregateScoreDelta: number;
    maximumCaseScoreRegression: number;
    requireCandidateCapacityReady: boolean;
  };
}

interface PhysicalVariant {
  scope: "lithography" | "lithography+etch";
  blueprint: Blueprint;
  lithographyRank: number;
  etchRank: number | null;
  transportCells: number;
  routeLength: number;
}

interface SearchRow extends PhysicalVariant {
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  accepted: boolean;
  matchesIncumbent: boolean;
  scores: number[];
  completedLots: number[];
  onTimeLots: number[];
  changeovers: number[];
  buildCost: number;
  occupiedArea: number;
  placements: string;
}

const projectDir = resolve(import.meta.dir, "../examples/memory-fab");
const definition = JSON.parse(await readFile(join(projectDir, "benchmarks/dispatch-research.benchmark.json"), "utf8")) as BenchmarkDefinition;
const searchSeedBlueprint = "tool-search-seed";

function positiveIntegerArgument(name: string, fallback: number): number {
  const index = Bun.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(Bun.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

const lithographyLimit = positiveIntegerArgument("--lithography-candidates", 12);
const etchLimit = positiveIntegerArgument("--etch-candidates", 12);
const writeBest = Bun.argv.includes("--write-best");

function weightedMean(values: number[]): number {
  const totalWeight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / totalWeight;
}

function blueprintProgramHash(blueprint: Blueprint): string {
  const { revision: _revision, ...program } = blueprint;
  return hashValue(program);
}

async function compileCases(blueprint: Blueprint): Promise<CompiledFactoryProject[]> {
  return Promise.all(definition.cases.map(async (item) => compileFactoryProject({
    ...await loadFactoryProject(projectDir, {
      blueprint: definition.candidateBlueprint, world: item.world, scenario: item.scenario, objective: item.objective,
    }),
    blueprint,
  })));
}

function simulate(projects: CompiledFactoryProject[]): FactoryMetrics[] {
  return projects.map((project, index) => runUntil(project, undefined, { seed: definition.cases[index]!.seed }).metrics);
}

const baselineProjects = await Promise.all(definition.cases.map((item) => loadFactoryProject(projectDir, {
  blueprint: definition.baselineBlueprint, world: item.world, scenario: item.scenario, objective: item.objective,
}).then(compileFactoryProject)));
const incumbentProjects = await Promise.all(definition.cases.map((item) => loadFactoryProject(projectDir, {
  blueprint: definition.candidateBlueprint, world: item.world, scenario: item.scenario, objective: item.objective,
}).then(compileFactoryProject)));
const baselineScores = simulate(baselineProjects).map((metrics) => metrics.finalScore);
const incumbentMetrics = simulate(incumbentProjects);
const incumbentScores = incumbentMetrics.map((metrics) => metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const incumbentBlueprintHash = blueprintProgramHash(incumbentProjects[0]!.blueprint);

const reference = compileFactoryProject(await loadFactoryProject(projectDir, {
  blueprint: searchSeedBlueprint,
  world: definition.cases[0]!.world,
  scenario: definition.cases[0]!.scenario,
  objective: definition.cases[0]!.objective,
}));
const lithographyCandidates = specializeSharedWorkCenterCandidates(reference, reference.blueprint, {
  device: "lithography-1", process: "pattern-cell-layer-2", cloneId: "lithography-2",
}, lithographyLimit);
const variants: PhysicalVariant[] = [];
for (const [lithographyIndex, lithography] of lithographyCandidates.entries()) {
  variants.push({
    scope: "lithography", blueprint: lithography.blueprint, lithographyRank: lithographyIndex + 1, etchRank: null,
    transportCells: lithography.transportCells, routeLength: lithography.routeLength,
  });
  const lithographyProject = compileFactoryProject({ ...reference, blueprint: lithography.blueprint });
  const etchCandidates = specializeSharedWorkCenterCandidates(lithographyProject, lithography.blueprint, {
    device: "etch-1", process: "etch-cell-layer-2", cloneId: "etch-2",
  }, etchLimit);
  for (const [etchIndex, etch] of etchCandidates.entries()) variants.push({
    scope: "lithography+etch", blueprint: etch.blueprint, lithographyRank: lithographyIndex + 1, etchRank: etchIndex + 1,
    transportCells: etch.transportCells, routeLength: etch.routeLength,
  });
}

const uniqueVariants = [...new Map(variants.map((variant) => [hashValue(variant.blueprint), variant])).values()];
const rows: SearchRow[] = [];
for (const variant of uniqueVariants) {
  const metrics = simulate(await compileCases(variant.blueprint));
  const scores = metrics.map((item) => item.finalScore);
  const aggregateScore = weightedMean(scores);
  const aggregateDelta = aggregateScore - incumbentAggregate;
  const minimumCaseDelta = Math.min(...scores.map((score, index) => score - baselineScores[index]!));
  const accepted = aggregateDelta >= definition.acceptance.minimumAggregateScoreDelta
    && minimumCaseDelta >= -definition.acceptance.maximumCaseScoreRegression;
  const devices = variant.blueprint.devices.filter((device) => device.id === "lithography-2" || device.id === "etch-2");
  rows.push({
    ...variant, aggregateScore, aggregateDelta, minimumCaseDelta, accepted,
    matchesIncumbent: blueprintProgramHash(variant.blueprint) === incumbentBlueprintHash, scores,
    completedLots: metrics.map((item) => item.lotFlow.completed),
    onTimeLots: metrics.map((item) => item.lotFlow.onTimeCompleted),
    changeovers: metrics.map((item) => item.equipmentSetups.totalChangeovers),
    buildCost: metrics[0]!.totalBuildCost, occupiedArea: metrics[0]!.occupiedArea,
    placements: devices.map((device) => `${device.id}@${device.position.x},${device.position.y}/${device.rotation}`).join("+"),
  });
}

rows.sort((left, right) => Number(right.accepted) - Number(left.accepted)
  || right.aggregateScore - left.aggregateScore || right.minimumCaseDelta - left.minimumCaseDelta
  || left.occupiedArea - right.occupiedArea || left.buildCost - right.buildCost
  || left.lithographyRank - right.lithographyRank || (left.etchRank ?? 0) - (right.etchRank ?? 0));

console.log(`# seed ${searchSeedBlueprint} → incumbent ${definition.candidateBlueprint} aggregate=${incumbentAggregate.toFixed(6)} · ${lithographyCandidates.length} lithography layouts · ${uniqueVariants.length} physical variants · gate=${definition.acceptance.maximumCaseScoreRegression.toFixed(3)}`);
console.log("accepted\taggregate\tdelta-vs-incumbent\tmin-case-vs-baseline\tscope\tlitho-rank\tetch-rank\tcost\tarea\ttransport-cells\troute-length\tcase-scores\tcompleted\ton-time\tchangeovers\tplacements");
for (const row of rows.slice(0, 30)) console.log([
  row.matchesIncumbent ? "MATCH" : row.accepted ? "KEEP" : "REJECT", row.aggregateScore.toFixed(6), row.aggregateDelta.toFixed(6), row.minimumCaseDelta.toFixed(6),
  row.scope, row.lithographyRank, row.etchRank ?? "-", row.buildCost, row.occupiedArea, row.transportCells, row.routeLength,
  row.scores.map((value) => value.toFixed(3)).join(","), row.completedLots.join(","), row.onTimeLots.join(","), row.changeovers.join(","), row.placements,
].join("\t"));

const best = rows[0];
if (writeBest) {
  if (!best?.accepted) throw new Error("No gate-passing physical variant was found; candidate Blueprint was not changed");
  const path = join(projectDir, "blueprints", `${definition.candidateBlueprint}.blueprint.json`);
  await writeFile(path, `${stableStringify({ ...best.blueprint, revision: "memory-fab-specialized-tools-v1" }, 2)}\n`);
  console.log(`# wrote ${path} from ${best.scope} layout ${best.lithographyRank}/${best.etchRank ?? "-"}`);
}
