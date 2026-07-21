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

type CampaignScope = "lithography-1" | "etch-1" | "both";

interface SearchRow {
  scope: CampaignScope;
  minimumReadyLots: number;
  maximumHoldTicks: number;
  maximumWip: number | null;
  reopenAtWip: number | null;
  aggregateScore: number;
  aggregateDelta: number;
  minimumCaseDelta: number;
  accepted: boolean;
  active: boolean;
  scores: number[];
  onTimeLots: number[];
  changeovers: number[];
  campaignHolds: number[];
  campaignHoldTicks: number[];
}

const projectDir = resolve(import.meta.dir, "../examples/memory-fab");
const definition = JSON.parse(await readFile(join(projectDir, "benchmarks/dispatch-research.benchmark.json"), "utf8")) as BenchmarkDefinition;

function integerArgument(name: string, fallback: number, minimum = 0): number {
  const index = Bun.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(Bun.argv[index + 1]);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

function optionalIntegerArgument(name: string, minimum = 0): number | null {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? null : integerArgument(name, minimum, minimum);
}

function stringArgument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

const minimumLots = integerArgument("--min-lots", 2, 1);
const maximumLots = integerArgument("--max-lots", 6, 1);
if (minimumLots > maximumLots) throw new Error("--min-lots cannot exceed --max-lots");
const readyLotThresholds = Array.from({ length: maximumLots - minimumLots + 1 }, (_, index) => minimumLots + index);
const holdTicks = (stringArgument("--holds") ?? "1000,2000,3000,6000,12000,18000,24000,36000")
  .split(",").map((value) => Number(value));
if (!holdTicks.length || holdTicks.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("--holds must be comma-separated non-negative integer ticks");
const requestedScope = stringArgument("--scope") as CampaignScope | undefined;
const allScopes: CampaignScope[] = ["lithography-1", "etch-1", "both"];
if (requestedScope && !allScopes.includes(requestedScope)) throw new Error("--scope must be lithography-1, etch-1, or both");
const scopes = requestedScope ? [requestedScope] : allScopes;
const maximumWip = optionalIntegerArgument("--maximum-wip", 1);
const reopenAtWip = optionalIntegerArgument("--reopen-at-wip", 0);
if ((maximumWip === null) !== (reopenAtWip === null)) throw new Error("--maximum-wip and --reopen-at-wip must be supplied together");
if (maximumWip !== null && reopenAtWip! >= maximumWip) throw new Error("--reopen-at-wip must be below --maximum-wip");
const releaseDispatch = (stringArgument("--release-dispatch") ?? "fifo") as LotReleaseDispatchPolicy;
if (!["fifo", "earliest-due-date", "highest-priority"].includes(releaseDispatch)) throw new Error("Unknown --release-dispatch");

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
const incumbentScores = candidateProjects.map((project, index) => runUntil(project, undefined, { seed: definition.cases[index]!.seed }).metrics.finalScore);
const incumbentAggregate = weightedMean(incumbentScores);
const rows: SearchRow[] = [];

function evaluatePolicy(scope: CampaignScope, minimumReadyLots: number, maximumHoldTicks: number): SearchRow {
  const results = candidateProjects.map((project, index) => {
    for (const id of ["lithography-1", "etch-1"] as const) {
      const device = project.devices[id];
      if (!device) throw new Error(`Campaign search requires ${id}`);
      const { setupCampaign: _previousCampaign, ...policy } = device.policy ?? {};
      const selected = scope === "both" || scope === id;
      device.policy = {
        ...policy,
        ...(selected ? { setupCampaign: { minimumReadyLots, maximumHoldTicks } } : {}),
      };
    }
    if (maximumWip === null) delete project.blueprint.policies.lotRelease;
    else project.blueprint.policies.lotRelease = {
      kind: "conwip", maximumWip, reopenAtWip: reopenAtWip!, dispatch: releaseDispatch,
    };
    return runUntil(project, undefined, { seed: definition.cases[index]!.seed }).metrics;
  });
  const scores = results.map((metrics) => metrics.finalScore);
  const aggregateScore = weightedMean(scores);
  const aggregateDelta = aggregateScore - incumbentAggregate;
  const minimumCaseDelta = Math.min(...scores.map((score, index) => score - baselineScores[index]!));
  return {
    scope, minimumReadyLots, maximumHoldTicks, maximumWip, reopenAtWip,
    aggregateScore, aggregateDelta, minimumCaseDelta,
    accepted: aggregateDelta >= definition.acceptance.minimumAggregateScoreDelta
      && minimumCaseDelta >= -definition.acceptance.maximumCaseScoreRegression,
    active: results.some((metrics) => metrics.equipmentSetups.totalCampaignHolds > 0),
    scores,
    onTimeLots: results.map((metrics) => metrics.lotFlow.onTimeCompleted),
    changeovers: results.map((metrics) => metrics.equipmentSetups.totalChangeovers),
    campaignHolds: results.map((metrics) => metrics.equipmentSetups.totalCampaignHolds),
    campaignHoldTicks: results.map((metrics) => metrics.equipmentSetups.totalCampaignHoldTicks),
  };
}

for (const scope of scopes) for (const minimumReadyLots of readyLotThresholds) for (const maximumHoldTicks of holdTicks) {
  rows.push(evaluatePolicy(scope, minimumReadyLots, maximumHoldTicks));
  Bun.gc(true);
}

const ranked = rows.filter((row) => row.active).sort((left, right) => Number(right.accepted) - Number(left.accepted)
  || right.aggregateScore - left.aggregateScore
  || right.minimumCaseDelta - left.minimumCaseDelta
  || left.scope.localeCompare(right.scope)
  || left.minimumReadyLots - right.minimumReadyLots
  || left.maximumHoldTicks - right.maximumHoldTicks);

console.log(`# incumbent ${definition.candidateBlueprint} aggregate=${incumbentAggregate.toFixed(6)} · case gate remains relative to locked ${definition.baselineBlueprint} · ${rows.length} policies evaluated · ${ranked.length} active · release=${maximumWip === null ? "open-loop" : `CONWIP ${maximumWip}/${reopenAtWip}/${releaseDispatch}`}`);
console.log("accepted\taggregate\tdelta-vs-incumbent\tmin-case-vs-baseline\tscope\tmin-ready-lots\tmax-hold-s\tcase-scores\ton-time-lots\tchangeovers\tcampaign-holds\tcampaign-hold-s");
for (const row of ranked.slice(0, 30)) console.log([
  row.accepted ? "KEEP" : "REJECT",
  row.aggregateScore.toFixed(6), row.aggregateDelta.toFixed(6), row.minimumCaseDelta.toFixed(6),
  row.scope, row.minimumReadyLots, (row.maximumHoldTicks / 1000).toFixed(3),
  row.scores.map((value) => value.toFixed(3)).join(","),
  row.onTimeLots.join(","), row.changeovers.join(","), row.campaignHolds.join(","),
  row.campaignHoldTicks.map((value) => (value / 1000).toFixed(3)).join(","),
].join("\t"));
