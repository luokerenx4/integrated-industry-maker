import { resolve } from "node:path";
import {
  currentBestCaseScoreRegressionLimit,
  evaluatePreparedBlueprintBenchmark,
  loadDesignRun,
  prepareBlueprintBenchmark,
  stableStringify,
  type Blueprint,
  type BlueprintBenchmarkResult,
  type DesignCurrentBestGuardrail,
} from "../../../../packages/inm-core/src/index";

interface SearchRow {
  minimumReadyLots: number;
  maximumHoldTicks: number;
  decision: "PROMOTE" | "BRANCH" | "REJECT";
  aggregateScore: number;
  aggregateDelta: number;
  limitingCase: string;
  minimumCaseDelta: number;
  guardrailPassed: boolean;
  violations: string[];
  fixedBenchmarkAccepted: boolean;
  caseScores: number[];
  caseDeltas: number[];
  onTimeLots: number[];
  changeovers: number[];
  campaignHolds: number[];
  campaignHoldTicks: number[];
}

function stringArgument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

function requiredArgument(name: string): string {
  const value = stringArgument(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerArgument(name: string, fallback: number, minimum = 0): number {
  const value = stringArgument(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return parsed;
}

function policyBlueprint(source: Blueprint, deviceId: string, minimumReadyLots: number, maximumHoldTicks: number): Blueprint {
  const blueprint = structuredClone(source);
  const device = blueprint.devices.find((item) => item.id === deviceId);
  if (!device) throw new Error(`Campaign repair requires Device '${deviceId}'`);
  device.policy = {
    ...device.policy,
    setupCampaign: { minimumReadyLots, maximumHoldTicks },
  };
  return blueprint;
}

function evaluateRow(
  evaluation: BlueprintBenchmarkResult,
  incumbent: BlueprintBenchmarkResult,
  guardrail: DesignCurrentBestGuardrail,
  minimumReadyLots: number,
  maximumHoldTicks: number,
): SearchRow {
  const caseDeltas = evaluation.cases.map((item, index) => item.candidateScore - incumbent.cases[index]!.candidateScore);
  const violations = evaluation.cases.filter((item, index) => {
    const limit = currentBestCaseScoreRegressionLimit(guardrail, item.id);
    return limit !== null && caseDeltas[index]! < -limit - 1e-9;
  }).map((item) => item.id);
  const aggregateDelta = evaluation.candidateScore - incumbent.candidateScore;
  const limitingIndex = caseDeltas.reduce((best, value, index) => value < caseDeltas[best]! ? index : best, 0);
  const decision: SearchRow["decision"] = evaluation.accepted && aggregateDelta > 1e-9 && violations.length === 0
    ? "PROMOTE"
    : evaluation.accepted && aggregateDelta > 1e-9 ? "BRANCH" : "REJECT";
  return {
    minimumReadyLots,
    maximumHoldTicks,
    decision,
    aggregateScore: evaluation.candidateScore,
    aggregateDelta,
    limitingCase: evaluation.cases[limitingIndex]!.id,
    minimumCaseDelta: caseDeltas[limitingIndex]!,
    guardrailPassed: violations.length === 0,
    violations,
    fixedBenchmarkAccepted: evaluation.accepted,
    caseScores: evaluation.cases.map((item) => item.candidateScore),
    caseDeltas,
    onTimeLots: evaluation.cases.map((item) => item.candidateMetrics.onTimeLots),
    changeovers: evaluation.cases.map((item) => item.candidateMetrics.totalChangeovers),
    campaignHolds: evaluation.cases.map((item) => item.candidateMetrics.totalCampaignHolds),
    campaignHoldTicks: evaluation.cases.map((item) => item.candidateMetrics.totalCampaignHoldTicks),
  };
}

const projectDir = resolve(import.meta.dir, "../..");
const programId = requiredArgument("--program");
const runId = requiredArgument("--run-id");
const deviceId = stringArgument("--device") ?? "lithography-1";
const minimumLots = integerArgument("--min-lots", 2, 1);
const maximumLots = integerArgument("--max-lots", 4, 1);
if (minimumLots > maximumLots) throw new Error("--min-lots cannot exceed --max-lots");
const readyLotThresholds = Array.from({ length: maximumLots - minimumLots + 1 }, (_, index) => minimumLots + index);
const holdTicks = (stringArgument("--holds") ?? "0,1000,3000,6000,9000,12000")
  .split(",").map((value) => Number(value));
if (!holdTicks.length || holdTicks.some((value) => !Number.isInteger(value) || value < 0)) {
  throw new Error("--holds must be comma-separated non-negative integer ticks");
}

const run = await loadDesignRun(projectDir, programId, runId);
const prepared = await prepareBlueprintBenchmark(projectDir, run.manifest.benchmark.id, { evaluationId: "campaign-repair-baseline" });
const incumbent = await evaluatePreparedBlueprintBenchmark(prepared, {
  candidateBlueprint: run.bestBlueprint,
  evaluationId: "campaign-repair-incumbent",
});
if (Math.abs(incumbent.candidateScore - run.manifest.best.candidateScore) > 1e-9) {
  throw new Error(`Design Run leader score drifted: ${run.manifest.best.candidateScore} → ${incumbent.candidateScore}`);
}

const rows: SearchRow[] = [];
for (const minimumReadyLots of readyLotThresholds) for (const maximumHoldTicks of holdTicks) {
  const evaluation = await evaluatePreparedBlueprintBenchmark(prepared, {
    candidateBlueprint: policyBlueprint(run.bestBlueprint, deviceId, minimumReadyLots, maximumHoldTicks),
    evaluationId: `campaign-${minimumReadyLots}-${maximumHoldTicks}`,
  });
  rows.push(evaluateRow(evaluation, incumbent, run.manifest.program.currentBestGuardrail, minimumReadyLots, maximumHoldTicks));
  Bun.gc(true);
}

const decisionRank = { PROMOTE: 0, BRANCH: 1, REJECT: 2 } as const;
rows.sort((left, right) => decisionRank[left.decision] - decisionRank[right.decision]
  || right.aggregateDelta - left.aggregateDelta
  || right.minimumCaseDelta - left.minimumCaseDelta
  || left.minimumReadyLots - right.minimumReadyLots
  || left.maximumHoldTicks - right.maximumHoldTicks);

const result = {
  version: 1,
  program: programId,
  run: runId,
  benchmark: run.manifest.benchmark,
  incumbent: { nodeId: run.manifest.frontier.leader, score: incumbent.candidateScore, blueprintHash: run.manifest.best.blueprintHash },
  device: deviceId,
  guardrail: run.manifest.program.currentBestGuardrail,
  cases: incumbent.cases.map((item) => ({ id: item.id, name: item.name, score: item.candidateScore })),
  rows,
};

if (Bun.argv.includes("--json")) console.log(stableStringify(result, 2));
else {
  console.log(`# ${programId}/${runId.slice(0, 12)} · incumbent ${run.manifest.frontier.leader}=${incumbent.candidateScore.toFixed(6)} · ${rows.length} policies · ${deviceId}`);
  console.log("decision\taggregate\tdelta-vs-leader\tlimiting-case\tmin-case-delta\tviolations\tmin-ready-lots\tmax-hold-s\tcase-deltas\ton-time-lots\tchangeovers\tcampaign-holds\tcampaign-hold-s");
  for (const row of rows) console.log([
    row.decision,
    row.aggregateScore.toFixed(6),
    row.aggregateDelta.toFixed(6),
    row.limitingCase,
    row.minimumCaseDelta.toFixed(6),
    row.violations.join(",") || "-",
    row.minimumReadyLots,
    (row.maximumHoldTicks / 1000).toFixed(3),
    row.caseDeltas.map((value) => value.toFixed(6)).join(","),
    row.onTimeLots.join(","),
    row.changeovers.join(","),
    row.campaignHolds.join(","),
    row.campaignHoldTicks.map((value) => (value / 1000).toFixed(3)).join(","),
  ].join("\t"));
}
