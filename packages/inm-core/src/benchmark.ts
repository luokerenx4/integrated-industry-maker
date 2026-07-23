import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  compareFactoryBlueprints,
  evaluateFactoryBlueprint,
  type BlueprintMetricSnapshot,
  type BlueprintSemanticChange,
  type FactoryBlueprintComparison,
  type FactoryBlueprintEvaluation,
} from "./blueprint-comparison";
import type { JsonPatchOperation } from "./artifacts";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import type { Blueprint, CompiledFactoryProject, ProjectHashes } from "./types";
import { atomicWriteJson, hashValue, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const projectHashesSchema = z.object({
  engineVersion: z.string().min(1), resourceCatalogHash: hash, processCatalogHash: hash, routeCatalogHash: hash, deviceCatalogHash: hash,
  worldHash: hash, blueprintHash: hash, scenarioHash: hash, objectiveHash: hash,
}).strict();

export const blueprintOutcomeMetricSchema = z.enum([
  "contractFulfillment",
  "completedLots",
  "onTimeLots",
  "pendingReleaseLots",
  "scrappedLots",
  "firstPassYield",
  "qualityEscapes",
  "reworkCycles",
  "queueTimeViolations",
]);

export type BlueprintOutcomeMetric = z.infer<typeof blueprintOutcomeMetricSchema>;
export type BlueprintOutcomeOperator = "minimum" | "maximum";

const outcomeMetricOperator: Record<BlueprintOutcomeMetric, BlueprintOutcomeOperator> = {
  contractFulfillment: "minimum",
  completedLots: "minimum",
  onTimeLots: "minimum",
  pendingReleaseLots: "maximum",
  scrappedLots: "maximum",
  firstPassYield: "minimum",
  qualityEscapes: "maximum",
  reworkCycles: "maximum",
  queueTimeViolations: "maximum",
};

const outcomeMetricLabel: Record<BlueprintOutcomeMetric, string> = {
  contractFulfillment: "Contract fulfillment",
  completedLots: "Completed lots",
  onTimeLots: "On-time lots",
  pendingReleaseLots: "Pending-release lots",
  scrappedLots: "Scrapped lots",
  firstPassYield: "First-pass yield",
  qualityEscapes: "Quality escapes",
  reworkCycles: "Rework cycles",
  queueTimeViolations: "Route Q-time violations",
};

const integerOutcomeMetrics = new Set<BlueprintOutcomeMetric>([
  "completedLots", "onTimeLots", "pendingReleaseLots", "scrappedLots", "qualityEscapes", "reworkCycles", "queueTimeViolations",
]);

const outcomeThresholdsSchema = z.record(z.number().finite().nonnegative()).superRefine((thresholds, context) => {
  const cases = Object.keys(thresholds);
  if (cases.length === 0) context.addIssue({ code: "custom", message: "must declare at least one operating-case threshold" });
  for (const caseId of cases) if (!/^[a-z0-9][a-z0-9-]*$/.test(caseId)) context.addIssue({
    code: "custom", path: [caseId], message: "case id must use lowercase kebab-case",
  });
});

export const blueprintOutcomeGuardrailSchema = z.object({
  id,
  metric: blueprintOutcomeMetricSchema,
  operator: z.enum(["minimum", "maximum"]),
  thresholds: outcomeThresholdsSchema,
}).strict().superRefine((guardrail, context) => {
  const expected = outcomeMetricOperator[guardrail.metric];
  if (guardrail.operator !== expected) context.addIssue({
    code: "custom",
    path: ["operator"],
    message: `${guardrail.metric} uses '${expected}' industrial direction`,
  });
  if (integerOutcomeMetrics.has(guardrail.metric)) for (const [caseId, threshold] of Object.entries(guardrail.thresholds)) {
    if (!Number.isInteger(threshold)) context.addIssue({
      code: "custom",
      path: ["thresholds", caseId],
      message: `${guardrail.metric} threshold must be an integer`,
    });
  }
});

export type BlueprintOutcomeGuardrail = z.infer<typeof blueprintOutcomeGuardrailSchema>;

export function blueprintOutcomeMetricLabel(metric: BlueprintOutcomeMetric): string {
  return outcomeMetricLabel[metric];
}

export const blueprintBenchmarkSchema = z.object({
  version: z.literal(1), id, name: z.string().min(1),
  baselineBlueprint: id, candidateBlueprint: id,
  cases: z.array(z.object({
    id, name: z.string().min(1), world: id, scenario: id, objective: id,
    seed: z.number().int().nonnegative(), weight: z.number().positive(),
  }).strict()).min(1),
  acceptance: z.object({
    minimumAggregateScoreDelta: z.number().positive().default(0.000001),
    maximumCaseScoreRegression: z.number().nonnegative().default(0),
    requireCandidateCapacityReady: z.boolean().default(false),
    outcomeGuardrails: z.array(blueprintOutcomeGuardrailSchema).min(1).optional(),
  }).strict().default({}),
  lock: z.object({ contractHash: hash, cases: z.record(projectHashesSchema) }).strict().optional(),
}).strict();

export type BlueprintBenchmarkManifest = z.infer<typeof blueprintBenchmarkSchema>;

export interface BlueprintBenchmarkCaseResult {
  id: string;
  name: string;
  weight: number;
  seed: number;
  durationTicks: number;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  scoreBreakdownDelta: BlueprintMetricSnapshot["scoreBreakdown"];
  baselineMetrics: BlueprintMetricSnapshot;
  candidateMetrics: BlueprintMetricSnapshot;
  baselineCapacityReady: boolean;
  candidateCapacityReady: boolean;
  candidateCapacityGaps: string[];
}

export interface BlueprintBenchmarkResult {
  benchmark: string;
  name: string;
  baselineBlueprint: string;
  candidateBlueprint: string;
  baselineBlueprintHash: string;
  candidateBlueprintHash: string;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  worstCaseBaselineScore: number;
  worstCaseCandidateScore: number;
  minimumCaseScoreDelta: number;
  verdict: "KEEP" | "DISCARD" | "UNCHANGED";
  accepted: boolean;
  reasons: string[];
  outcomeGuardrails?: BlueprintOutcomeGuardrailEvidence[];
  totalSimulationTicks: number;
  cases: BlueprintBenchmarkCaseResult[];
  patch: JsonPatchOperation[];
  changes: BlueprintSemanticChange[];
}

export interface BlueprintOutcomeGuardrailCaseEvidence {
  id: string;
  name: string;
  baselineValue: number;
  candidateValue: number;
  threshold: number;
  baselinePassed: boolean;
  candidatePassed: boolean;
}

export interface BlueprintOutcomeGuardrailEvidence {
  id: string;
  metric: BlueprintOutcomeMetric;
  label: string;
  operator: BlueprintOutcomeOperator;
  passed: boolean;
  cases: BlueprintOutcomeGuardrailCaseEvidence[];
}

export interface BlueprintBenchmarkSummary {
  id: string;
  name: string;
  baselineBlueprint: string;
  candidateBlueprint: string;
  locked: boolean;
  contractHash: string | null;
  cases: BlueprintBenchmarkManifest["cases"];
  acceptance: BlueprintBenchmarkManifest["acceptance"];
}

export interface BlueprintBenchmarkProgress {
  version: 1;
  phase: "baseline-case-started" | "baseline-case-completed" | "candidate-case-started" | "candidate-case-completed";
  benchmark: string;
  case: { id: string; name: string; index: number; total: number };
  evaluationId: string;
  baselineScore?: number;
  candidateScore?: number;
  scoreDelta?: number;
  candidateCapacityReady?: boolean;
}

export type BlueprintBenchmarkProgressHandler = (progress: BlueprintBenchmarkProgress) => void;

export interface PreparedBlueprintBenchmarkCase {
  manifest: BlueprintBenchmarkManifest["cases"][number];
  baseline: CompiledFactoryProject;
  evaluation: FactoryBlueprintEvaluation;
}

export interface PreparedBlueprintBenchmark {
  projectDir: string;
  manifest: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> };
  cases: PreparedBlueprintBenchmarkCase[];
}

function benchmarkPath(projectDir: string, benchmarkId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(benchmarkId)) throw new Error("Benchmark id must use lowercase kebab-case");
  return join(resolve(projectDir), "benchmarks", `${benchmarkId}.benchmark.json`);
}

function benchmarkContract(manifest: BlueprintBenchmarkManifest): unknown {
  return {
    version: manifest.version, id: manifest.id, name: manifest.name,
    baselineBlueprint: manifest.baselineBlueprint, candidateBlueprint: manifest.candidateBlueprint,
    cases: manifest.cases, acceptance: manifest.acceptance,
  };
}

async function openSelectedProject(projectDir: string, selection: ProjectSelection, blueprint?: Blueprint) {
  const loaded = await loadFactoryProject(projectDir, selection);
  return compileFactoryProject(blueprint ? { ...loaded, blueprint } : loaded);
}

function parseBlueprintBenchmark(value: unknown, benchmarkId: string): BlueprintBenchmarkManifest {
  const parsed = blueprintBenchmarkSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Blueprint benchmark '${benchmarkId}': ${parsed.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`);
  if (parsed.data.id !== benchmarkId) throw new Error(`Benchmark id '${parsed.data.id}' must match filename '${benchmarkId}'`);
  if (parsed.data.baselineBlueprint === parsed.data.candidateBlueprint) throw new Error(`Blueprint benchmark '${benchmarkId}' must keep baseline and candidate files separate`);
  const ids = new Set<string>();
  for (const item of parsed.data.cases) {
    if (ids.has(item.id)) throw new Error(`Blueprint benchmark '${benchmarkId}' repeats case id '${item.id}'`);
    ids.add(item.id);
  }
  const guardrailIds = new Set<string>();
  const guardedMetricCases = new Set<string>();
  for (const guardrail of parsed.data.acceptance.outcomeGuardrails ?? []) {
    if (guardrailIds.has(guardrail.id)) throw new Error(`Blueprint benchmark '${benchmarkId}' repeats outcome guardrail id '${guardrail.id}'`);
    guardrailIds.add(guardrail.id);
    for (const caseId of Object.keys(guardrail.thresholds)) {
      if (!ids.has(caseId)) throw new Error(`Blueprint benchmark '${benchmarkId}' outcome guardrail '${guardrail.id}' names unknown case '${caseId}'`);
      const metricCase = `${guardrail.metric}:${caseId}`;
      if (guardedMetricCases.has(metricCase)) throw new Error(
        `Blueprint benchmark '${benchmarkId}' guards outcome metric '${guardrail.metric}' more than once for case '${caseId}'`,
      );
      guardedMetricCases.add(metricCase);
    }
  }
  return parsed.data;
}

export async function loadBlueprintBenchmark(projectDir: string, benchmarkId: string): Promise<BlueprintBenchmarkManifest> {
  return parseBlueprintBenchmark(await readJson(benchmarkPath(projectDir, benchmarkId)), benchmarkId);
}

export async function listBlueprintBenchmarks(projectDir: string): Promise<BlueprintBenchmarkSummary[]> {
  const directory = join(resolve(projectDir), "benchmarks");
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const ids = files.filter((file) => file.endsWith(".benchmark.json"))
    .map((file) => file.slice(0, -".benchmark.json".length)).sort();
  return Promise.all(ids.map(async (benchmarkId) => {
    const manifest = await loadBlueprintBenchmark(projectDir, benchmarkId);
    return {
      id: manifest.id,
      name: manifest.name,
      baselineBlueprint: manifest.baselineBlueprint,
      candidateBlueprint: manifest.candidateBlueprint,
      locked: Boolean(manifest.lock),
      contractHash: manifest.lock?.contractHash ?? null,
      cases: manifest.cases.map((item) => ({ ...item })),
      acceptance: structuredClone(manifest.acceptance),
    };
  }));
}

export async function lockBlueprintBenchmark(projectDir: string, benchmarkId: string): Promise<BlueprintBenchmarkManifest> {
  const source = await readJson(benchmarkPath(projectDir, benchmarkId)) as Record<string, unknown>;
  const manifest = parseBlueprintBenchmark(Object.fromEntries(Object.entries(source).filter(([key]) => key !== "lock")), benchmarkId);
  const cases: Record<string, ProjectHashes> = {};
  for (const item of manifest.cases) {
    const baseline = await openSelectedProject(projectDir, {
      world: item.world, blueprint: manifest.baselineBlueprint, scenario: item.scenario, objective: item.objective,
    });
    cases[item.id] = baseline.hashes;
  }
  const locked: BlueprintBenchmarkManifest = {
    ...manifest,
    lock: { contractHash: hashValue(benchmarkContract(manifest)), cases },
  };
  await atomicWriteJson(benchmarkPath(projectDir, benchmarkId), locked);
  return locked;
}

function assertBenchmarkLock(manifest: BlueprintBenchmarkManifest, benchmarkId: string): asserts manifest is BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> } {
  if (!manifest.lock) throw new Error(`Blueprint benchmark '${benchmarkId}' is unlocked; run inm benchmark <path> --benchmark ${benchmarkId} --lock`);
  const contractHash = hashValue(benchmarkContract(manifest));
  if (manifest.lock.contractHash !== contractHash) throw new Error(`Blueprint benchmark '${benchmarkId}' contract changed after locking; review it and run --lock explicitly`);
  const expectedCaseIds = [...manifest.cases.map((item) => item.id)].sort();
  const lockedCaseIds = Object.keys(manifest.lock.cases).sort();
  if (hashValue(expectedCaseIds) !== hashValue(lockedCaseIds)) throw new Error(`Blueprint benchmark '${benchmarkId}' case set differs from its lock`);
}

function assertLockedHashes(benchmarkId: string, caseId: string, expected: ProjectHashes, actual: ProjectHashes): void {
  for (const key of Object.keys(expected) as Array<keyof ProjectHashes>) if (expected[key] !== actual[key]) {
    throw new Error(`Blueprint benchmark '${benchmarkId}' fixed input drifted in case '${caseId}': ${key} ${expected[key]} → ${actual[key]}`);
  }
}

export async function evaluateBlueprintBenchmark(
  projectDir: string,
  benchmarkId: string,
  options: { candidateBlueprint?: Blueprint; onProgress?: BlueprintBenchmarkProgressHandler; evaluationId?: string } = {},
): Promise<BlueprintBenchmarkResult> {
  const prepared = await prepareBlueprintBenchmark(projectDir, benchmarkId, {
    onProgress: options.onProgress,
    evaluationId: options.evaluationId ?? "evaluation",
  });
  return evaluatePreparedBlueprintBenchmark(prepared, options);
}

export async function prepareBlueprintBenchmark(
  projectDir: string,
  benchmarkId: string,
  options: { onProgress?: BlueprintBenchmarkProgressHandler; evaluationId?: string } = {},
): Promise<PreparedBlueprintBenchmark> {
  const manifest = await loadBlueprintBenchmark(projectDir, benchmarkId);
  assertBenchmarkLock(manifest, benchmarkId);
  const evaluationId = options.evaluationId ?? "evaluation";
  const cases: PreparedBlueprintBenchmarkCase[] = [];
  for (const [index, item] of manifest.cases.entries()) {
    const caseIdentity = { id: item.id, name: item.name, index: index + 1, total: manifest.cases.length };
    options.onProgress?.({ version: 1, phase: "baseline-case-started", benchmark: manifest.id, case: caseIdentity, evaluationId });
    const baseline = await openSelectedProject(projectDir, {
      world: item.world, blueprint: manifest.baselineBlueprint, scenario: item.scenario, objective: item.objective,
    });
    assertLockedHashes(benchmarkId, item.id, manifest.lock.cases[item.id]!, baseline.hashes);
    const evaluation = evaluateFactoryBlueprint(baseline, manifest.baselineBlueprint, item.seed);
    cases.push({ manifest: item, baseline, evaluation });
    options.onProgress?.({
      version: 1,
      phase: "baseline-case-completed",
      benchmark: manifest.id,
      case: caseIdentity,
      evaluationId,
      baselineScore: evaluation.metrics.score,
    });
  }
  return { projectDir: resolve(projectDir), manifest, cases };
}

export async function evaluatePreparedBlueprintBenchmark(
  prepared: PreparedBlueprintBenchmark,
  options: { candidateBlueprint?: Blueprint; onProgress?: BlueprintBenchmarkProgressHandler; evaluationId?: string } = {},
): Promise<BlueprintBenchmarkResult> {
  const { manifest, projectDir } = prepared;
  const evaluationId = options.evaluationId ?? "evaluation";
  const comparisons: FactoryBlueprintComparison[] = [];
  const cases: BlueprintBenchmarkCaseResult[] = [];
  let weightedBaseline = 0; let weightedCandidate = 0; let totalWeight = 0; let totalSimulationTicks = 0;
  for (const [index, preparedCase] of prepared.cases.entries()) {
    const item = preparedCase.manifest;
    const caseIdentity = { id: item.id, name: item.name, index: index + 1, total: prepared.cases.length };
    options.onProgress?.({ version: 1, phase: "candidate-case-started", benchmark: manifest.id, case: caseIdentity, evaluationId });
    const selection = { world: item.world, scenario: item.scenario, objective: item.objective };
    const candidate = await openSelectedProject(projectDir, { ...selection, blueprint: manifest.candidateBlueprint }, options.candidateBlueprint);
    const comparison = compareFactoryBlueprints(preparedCase.baseline, candidate, {
      seed: item.seed,
      fromLabel: manifest.baselineBlueprint,
      toLabel: manifest.candidateBlueprint,
      beforeEvaluation: preparedCase.evaluation,
    });
    comparisons.push(comparison);
    weightedBaseline += comparison.from.metrics.score * item.weight;
    weightedCandidate += comparison.to.metrics.score * item.weight;
    totalWeight += item.weight;
    totalSimulationTicks += preparedCase.baseline.scenario.durationTicks * 2;
    cases.push({
      id: item.id, name: item.name, weight: item.weight, seed: item.seed, durationTicks: preparedCase.baseline.scenario.durationTicks,
      baselineScore: comparison.from.metrics.score, candidateScore: comparison.to.metrics.score, scoreDelta: comparison.delta.score,
      scoreBreakdownDelta: comparison.delta.scoreBreakdown,
      baselineMetrics: comparison.from.metrics, candidateMetrics: comparison.to.metrics,
      baselineCapacityReady: comparison.from.capacityPlan.ready, candidateCapacityReady: comparison.to.capacityPlan.ready,
      candidateCapacityGaps: comparison.to.capacityPlan.gaps.map((gap) => `[${gap.kind}] ${gap.message}`),
    });
    options.onProgress?.({
      version: 1,
      phase: "candidate-case-completed",
      benchmark: manifest.id,
      case: caseIdentity,
      evaluationId,
      baselineScore: comparison.from.metrics.score,
      candidateScore: comparison.to.metrics.score,
      scoreDelta: comparison.delta.score,
      candidateCapacityReady: comparison.to.capacityPlan.ready,
    });
  }
  const baselineScore = weightedBaseline / totalWeight; const candidateScore = weightedCandidate / totalWeight;
  const scoreDelta = candidateScore - baselineScore; const reasons: string[] = [];
  const worstCaseBaselineScore = Math.min(...cases.map((item) => item.baselineScore));
  const worstCaseCandidateScore = Math.min(...cases.map((item) => item.candidateScore));
  const minimumCaseScoreDelta = Math.min(...cases.map((item) => item.scoreDelta));
  const outcomeGuardrails = manifest.acceptance.outcomeGuardrails?.map((guardrail): BlueprintOutcomeGuardrailEvidence => {
    const evidenceCases = cases.filter((item) => guardrail.thresholds[item.id] !== undefined).map((item) => {
      const threshold = guardrail.thresholds[item.id]!;
      const baselineValue = item.baselineMetrics[guardrail.metric];
      const candidateValue = item.candidateMetrics[guardrail.metric];
      const passes = (value: number) => guardrail.operator === "minimum"
        ? value >= threshold - 1e-9
        : value <= threshold + 1e-9;
      return {
        id: item.id,
        name: item.name,
        baselineValue,
        candidateValue,
        threshold,
        baselinePassed: passes(baselineValue),
        candidatePassed: passes(candidateValue),
      };
    });
    return {
      id: guardrail.id,
      metric: guardrail.metric,
      label: blueprintOutcomeMetricLabel(guardrail.metric),
      operator: guardrail.operator,
      passed: evidenceCases.every((item) => item.candidatePassed),
      cases: evidenceCases,
    };
  });
  if (scoreDelta + 1e-12 < manifest.acceptance.minimumAggregateScoreDelta) reasons.push(
    `aggregate score delta ${scoreDelta.toFixed(6)} is below required ${manifest.acceptance.minimumAggregateScoreDelta.toFixed(6)}`,
  );
  for (const item of cases) if (item.scoreDelta < -manifest.acceptance.maximumCaseScoreRegression - 1e-9) reasons.push(
    `case '${item.id}' regressed by ${(-item.scoreDelta).toFixed(6)}, above allowed ${manifest.acceptance.maximumCaseScoreRegression.toFixed(6)}`,
  );
  if (manifest.acceptance.requireCandidateCapacityReady) for (const item of cases) if (!item.candidateCapacityReady) reasons.push(
    `case '${item.id}' has ${item.candidateCapacityGaps.length} target-rate capacity gap(s)`,
  );
  for (const guardrail of outcomeGuardrails ?? []) for (const item of guardrail.cases) if (!item.candidatePassed) reasons.push(
    `outcome guardrail '${guardrail.id}' failed in case '${item.id}': ${guardrail.metric} ${item.candidateValue.toFixed(6)} must be ${guardrail.operator === "minimum" ? ">=" : "<="} ${item.threshold.toFixed(6)}`,
  );
  const accepted = reasons.length === 0;
  return {
    benchmark: manifest.id, name: manifest.name,
    baselineBlueprint: manifest.baselineBlueprint, candidateBlueprint: manifest.candidateBlueprint,
    baselineBlueprintHash: comparisons[0]!.from.blueprintHash, candidateBlueprintHash: comparisons[0]!.to.blueprintHash,
    baselineScore, candidateScore, scoreDelta, worstCaseBaselineScore, worstCaseCandidateScore, minimumCaseScoreDelta,
    verdict: Math.abs(scoreDelta) <= 1e-9 ? "UNCHANGED" : accepted ? "KEEP" : "DISCARD",
    accepted, reasons, ...(outcomeGuardrails ? { outcomeGuardrails } : {}), totalSimulationTicks, cases,
    patch: comparisons[0]!.patch, changes: comparisons[0]!.changes,
  };
}
