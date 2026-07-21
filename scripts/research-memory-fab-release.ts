import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { openFactoryProject, runUntil } from "../packages/inm-core/src/index";
import type { CompiledFactoryProject, LotReleaseDispatchPolicy } from "../packages/inm-core/src/types";

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
  acceptance: { minimumAggregateScoreDelta: number; maximumCaseScoreRegression: number };
}

interface SearchRow {
  maximumWip: number;
  reopenAtWip: number;
  dispatch: LotReleaseDispatchPolicy;
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  accepted: boolean;
  active: boolean;
  scores: number[];
  averageWip: number[];
  releaseDelayTicks: number[];
}

const projectDir = resolve(import.meta.dir, "../examples/memory-fab");
const definition = JSON.parse(await readFile(join(projectDir, "benchmarks/dispatch-research.benchmark.json"), "utf8")) as BenchmarkDefinition;
function numericArgument(name: string, fallback: number): number {
  const index = Bun.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(Bun.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

const minimumCap = numericArgument("--min-cap", 3);
const maximumCap = numericArgument("--max-cap", 12);
if (minimumCap > maximumCap) throw new Error("--min-cap cannot exceed --max-cap");
const maximumCaps = Array.from({ length: maximumCap - minimumCap + 1 }, (_, index) => index + minimumCap);
const dispatchPolicies: LotReleaseDispatchPolicy[] = ["fifo", "earliest-due-date", "highest-priority"];

async function projectsFor(blueprint: string): Promise<CompiledFactoryProject[]> {
  return Promise.all(definition.cases.map((item) => openFactoryProject(projectDir, {
    blueprint, world: item.world, scenario: item.scenario, objective: item.objective,
  })));
}

function weightedMean(values: number[]): number {
  const totalWeight = definition.cases.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, value, index) => sum + value * definition.cases[index]!.weight, 0) / totalWeight;
}

const baselineProjects = await projectsFor(definition.baselineBlueprint);
const candidateProjects = await projectsFor(definition.candidateBlueprint);
const baselineScores = baselineProjects.map((project, index) => runUntil(project, undefined, { seed: definition.cases[index]!.seed }).metrics.finalScore);
for (const project of candidateProjects) delete project.blueprint.policies.lotRelease;
const incumbentScores = candidateProjects.map((project, index) => runUntil(project, undefined, { seed: definition.cases[index]!.seed }).metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const rows: SearchRow[] = [];

function evaluatePolicy(maximumWip: number, reopenAtWip: number, dispatch: LotReleaseDispatchPolicy): SearchRow {
  const results = candidateProjects.map((project, index) => {
    project.blueprint.policies.lotRelease = { kind: "conwip", maximumWip, reopenAtWip, dispatch };
    return runUntil(project, undefined, { seed: definition.cases[index]!.seed }).metrics;
  });
  const scores = results.map((metrics) => metrics.finalScore);
  const aggregateScore = weightedMean(scores);
  const caseDeltas = scores.map((score, index) => score - baselineScores[index]!);
  const aggregateDelta = aggregateScore - incumbentAggregate;
  const minimumCaseDelta = Math.min(...caseDeltas);
  return {
    maximumWip, reopenAtWip, dispatch, aggregateScore, aggregateDelta, minimumCaseDelta,
    accepted: aggregateDelta >= definition.acceptance.minimumAggregateScoreDelta
      && minimumCaseDelta >= -definition.acceptance.maximumCaseScoreRegression,
    active: results.some((metrics) => metrics.releaseFlow.controlBlockedLots > 0),
    scores, averageWip: results.map((metrics) => metrics.averageWip),
    releaseDelayTicks: results.map((metrics) => metrics.releaseFlow.meanReleaseDelayTicks),
  };
}

for (const maximumWip of maximumCaps) {
  for (let reopenAtWip = 0; reopenAtWip < maximumWip; reopenAtWip++) {
    for (const dispatch of dispatchPolicies) {
      rows.push(evaluatePolicy(maximumWip, reopenAtWip, dispatch));
      Bun.gc(true);
    }
  }
}

const ranked = rows.filter((row) => row.active).sort((left, right) => Number(right.accepted) - Number(left.accepted)
  || right.aggregateScore - left.aggregateScore
  || right.minimumCaseDelta - left.minimumCaseDelta
  || left.maximumWip - right.maximumWip
  || left.reopenAtWip - right.reopenAtWip
  || left.dispatch.localeCompare(right.dispatch));

console.log(`# incumbent ${definition.candidateBlueprint} aggregate=${incumbentAggregate.toFixed(6)} · case gate remains relative to locked ${definition.baselineBlueprint} · ${rows.length} policies evaluated · ${ranked.length} active`);
console.log("accepted\taggregate\tdelta-vs-incumbent\tmin-case-vs-baseline\tmax-wip\treopen\tdispatch\tcase-scores\tcase-average-wip\tcase-delay-s");
for (const row of ranked.slice(0, 30)) console.log([
  row.accepted ? "KEEP" : "REJECT",
  row.aggregateScore.toFixed(6), row.aggregateDelta.toFixed(6), row.minimumCaseDelta.toFixed(6),
  row.maximumWip, row.reopenAtWip, row.dispatch,
  row.scores.map((value) => value.toFixed(3)).join(","),
  row.averageWip.map((value) => value.toFixed(3)).join(","),
  row.releaseDelayTicks.map((value) => (value / 1000).toFixed(3)).join(","),
].join("\t"));
