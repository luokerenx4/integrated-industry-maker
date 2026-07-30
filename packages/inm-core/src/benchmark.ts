import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  compareFactoryBlueprints,
  evaluateFactoryBlueprint,
  evaluateFactoryBlueprintWithTrace,
  type BlueprintMetricSnapshot,
  type BlueprintSemanticChange,
  type FactoryBlueprintComparison,
  type FactoryBlueprintEvaluation,
} from "./blueprint-comparison";
import type { JsonPatchOperation } from "./artifacts";
import {
  createBenchmarkCaseExecutor,
  resolveBenchmarkCaseExecution,
  type BenchmarkCaseExecution,
  type BenchmarkCaseExecutor,
  type BenchmarkCaseExecutionRequest,
  type BenchmarkCaseWorkerResult,
} from "./benchmark-case-execution";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import type { Blueprint, CompiledFactoryProject, ProjectEvidenceHashes, SimulationResult } from "./types";
import { projectEvidenceHashes } from "./execution-identity";
import { atomicWriteJson, ENGINE_VERSION, hashValue, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const projectHashesSchema = z.object({
  engineVersion: z.string().min(1), executionHash: hash,
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

function validCadenceControlSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const devices = (value as { devices?: unknown }).devices;
  if (!devices || typeof devices !== "object" || Array.isArray(devices)) return false;
  return Object.entries(devices).every(([device, entry]) => {
    if (!device || !entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const control = entry as Record<string, unknown>;
    const common = typeof control.process === "string" && control.process.length > 0
      && typeof control.normalMode === "string" && control.normalMode.length > 0
      && typeof control.recoveryMode === "string" && control.recoveryMode.length > 0
      && Number.isSafeInteger(control.normalJobs) && (control.normalJobs as number) >= 0
      && Number.isSafeInteger(control.recoveryJobs) && (control.recoveryJobs as number) >= 0
      && Number.isSafeInteger(control.recoveryActivations) && (control.recoveryActivations as number) >= 0;
    if (!common) return false;
    if (control.kind === "downstream-coverage-recovery") return typeof control.downstreamConnection === "string"
      && control.downstreamConnection.length > 0
      && Number.isSafeInteger(control.recoverBelowItems) && (control.recoverBelowItems as number) >= 0
      && Number.isSafeInteger(control.minimumCoverageDeficitTicks) && (control.minimumCoverageDeficitTicks as number) > 0
      && Number.isSafeInteger(control.coverageDeficitEpisodes) && (control.coverageDeficitEpisodes as number) >= 0
      && Number.isSafeInteger(control.coverageDeficitTicks) && (control.coverageDeficitTicks as number) >= 0;
    return control.kind === "input-queue-recovery"
      && typeof control.inputResource === "string" && control.inputResource.length > 0
      && Number.isSafeInteger(control.recoverAtItems) && (control.recoverAtItems as number) > 0
      && Number.isSafeInteger(control.minimumQueueTicks) && (control.minimumQueueTicks as number) > 0;
  });
}

export function hasBlueprintBenchmarkCadenceEvidence(value: unknown): value is BlueprintBenchmarkResult {
  if (!value || typeof value !== "object" || !Array.isArray((value as { cases?: unknown }).cases)) return false;
  return (value as { cases: unknown[] }).cases.every((item) => {
    if (!item || typeof item !== "object") return false;
    const benchmarkCase = item as { baselineMetrics?: { cadenceControl?: unknown }; candidateMetrics?: { cadenceControl?: unknown } };
    return validCadenceControlSnapshot(benchmarkCase.baselineMetrics?.cadenceControl)
      && validCadenceControlSnapshot(benchmarkCase.candidateMetrics?.cadenceControl);
  });
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
  version: 3;
  sequence: number;
  phase: "baseline-case-started" | "baseline-case-completed"
    | "current-case-started" | "current-case-completed"
    | "candidate-case-started" | "candidate-case-completed";
  benchmark: string;
  case: { id: string; name: string; index: number; total: number };
  work: { completed: number; total: number };
  execution: BenchmarkCaseExecution;
  evaluationId: string;
  timing: {
    durationMs?: number;
    compileMs?: number;
    cacheReadMs?: number;
    evaluationMs?: number;
    comparisonMs?: number;
    workerStartupMs?: number;
    workerReused?: boolean;
    workerSlot?: number;
  };
  baselineScore?: number;
  candidateScore?: number;
  scoreDelta?: number;
  candidateCapacityReady?: boolean;
  cached?: boolean;
}

export type BlueprintBenchmarkProgressHandler = (progress: BlueprintBenchmarkProgress) => void;

export interface BlueprintBenchmarkEvaluationOptions {
  candidateBlueprint?: Blueprint;
  onProgress?: BlueprintBenchmarkProgressHandler;
  caseExecution?: BenchmarkCaseExecutionRequest;
  caseExecutor?: BenchmarkCaseExecutor;
  traceCaseId?: string;
  onTraceCaseEvaluated?: (result: {
    case: BlueprintBenchmarkManifest["cases"][number];
    project: CompiledFactoryProject;
    simulation: SimulationResult;
  }) => void;
  evaluationId?: string;
  signal?: AbortSignal;
}

export interface PreparedBlueprintBenchmarkCase {
  manifest: BlueprintBenchmarkManifest["cases"][number];
  baseline: CompiledFactoryProject;
  evaluation: FactoryBlueprintEvaluation;
  cached: boolean;
}

export interface PreparedBlueprintBenchmark {
  projectDir: string;
  manifest: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> };
  cases: PreparedBlueprintBenchmarkCase[];
}

export interface BlueprintBenchmarkCacheStats {
  hits: number;
  misses: number;
}

const benchmarkCacheStats = new WeakMap<BlueprintBenchmarkResult, BlueprintBenchmarkCacheStats>();

export function blueprintBenchmarkCacheStats(result: BlueprintBenchmarkResult): BlueprintBenchmarkCacheStats {
  return benchmarkCacheStats.get(result) ?? { hits: 0, misses: 0 };
}

function benchmarkPath(projectDir: string, benchmarkId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(benchmarkId)) throw new Error("Benchmark id must use lowercase kebab-case");
  return join(resolve(projectDir), "benchmarks", `${benchmarkId}.benchmark.json`);
}

interface CachedBaselineEvaluation {
  version: 1;
  identityHash: string;
  evaluationHash: string;
  evaluation: FactoryBlueprintEvaluation;
}

function baselineCacheIdentity(
  manifest: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> },
  item: BlueprintBenchmarkManifest["cases"][number],
  hashes: ProjectEvidenceHashes,
): string {
  return hashValue({
    version: 1,
    engineVersion: ENGINE_VERSION,
    benchmark: manifest.id,
    contractHash: manifest.lock.contractHash,
    case: item,
    hashes,
  });
}

function baselineCachePath(projectDir: string, benchmarkId: string, caseId: string, identityHash: string): string {
  return join(resolve(projectDir), ".inm", "cache", "benchmark-baselines", benchmarkId, caseId, `${identityHash}.json`);
}

async function readCachedBaselineEvaluation(
  projectDir: string,
  manifest: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> },
  item: BlueprintBenchmarkManifest["cases"][number],
  baseline: CompiledFactoryProject,
): Promise<FactoryBlueprintEvaluation | null> {
  const identityHash = baselineCacheIdentity(manifest, item, projectEvidenceHashes(baseline.hashes));
  try {
    const cached = await readJson(baselineCachePath(projectDir, manifest.id, item.id, identityHash)) as Partial<CachedBaselineEvaluation>;
    if (cached.version !== 1 || cached.identityHash !== identityHash || !cached.evaluation
      || cached.evaluation.blueprintHash !== baseline.hashes.blueprintHash
      || cached.evaluationHash !== hashValue(cached.evaluation)) return null;
    return cached.evaluation;
  } catch {
    return null;
  }
}

async function writeCachedBaselineEvaluation(
  projectDir: string,
  manifest: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> },
  item: BlueprintBenchmarkManifest["cases"][number],
  baseline: CompiledFactoryProject,
  evaluation: FactoryBlueprintEvaluation,
): Promise<void> {
  const identityHash = baselineCacheIdentity(manifest, item, projectEvidenceHashes(baseline.hashes));
  await atomicWriteJson(baselineCachePath(projectDir, manifest.id, item.id, identityHash), {
    version: 1,
    identityHash,
    evaluationHash: hashValue(evaluation),
    evaluation,
  } satisfies CachedBaselineEvaluation);
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
  const cases: Record<string, ProjectEvidenceHashes> = {};
  for (const item of manifest.cases) {
    const baseline = await openSelectedProject(projectDir, {
      world: item.world, blueprint: manifest.baselineBlueprint, scenario: item.scenario, objective: item.objective,
    });
    cases[item.id] = projectEvidenceHashes(baseline.hashes);
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

function assertLockedHashes(benchmarkId: string, caseId: string, expected: ProjectEvidenceHashes, actual: ProjectEvidenceHashes): void {
  for (const key of Object.keys(expected) as Array<keyof ProjectEvidenceHashes>) if (expected[key] !== actual[key]) {
    throw new Error(`Blueprint benchmark '${benchmarkId}' fixed input drifted in case '${caseId}': ${key} ${expected[key]} → ${actual[key]}`);
  }
}

export async function evaluateBlueprintBenchmark(
  projectDir: string,
  benchmarkId: string,
  options: BlueprintBenchmarkEvaluationOptions = {},
): Promise<BlueprintBenchmarkResult> {
  const manifest = await loadBlueprintBenchmark(projectDir, benchmarkId);
  assertBenchmarkLock(manifest, benchmarkId);
  const execution = resolveBenchmarkCaseExecution(manifest.cases.length, options.caseExecution);
  const caseExecutor = options.caseExecutor
    ?? (execution.mode === "sequential" ? undefined : createBenchmarkCaseExecutor(execution));
  const ownedExecutor = options.caseExecutor ? undefined : caseExecutor;
  try {
    const prepared = await prepareLoadedBlueprintBenchmark(projectDir, manifest, {
      onProgress: options.onProgress,
      evaluationId: options.evaluationId ?? "evaluation",
      signal: options.signal,
      caseExecution: options.caseExecution,
      caseExecutor,
    });
    return await evaluatePreparedBlueprintBenchmark(prepared, { ...options, caseExecutor });
  } finally {
    ownedExecutor?.dispose();
  }
}

export async function prepareBlueprintBenchmark(
  projectDir: string,
  benchmarkId: string,
  options: Pick<BlueprintBenchmarkEvaluationOptions, "onProgress" | "evaluationId" | "signal" | "caseExecution" | "caseExecutor"> = {},
): Promise<PreparedBlueprintBenchmark> {
  const manifest = await loadBlueprintBenchmark(projectDir, benchmarkId);
  assertBenchmarkLock(manifest, benchmarkId);
  const execution = resolveBenchmarkCaseExecution(manifest.cases.length, options.caseExecution);
  const caseExecutor = options.caseExecutor
    ?? (execution.mode === "sequential" ? undefined : createBenchmarkCaseExecutor(execution));
  const ownedExecutor = options.caseExecutor ? undefined : caseExecutor;
  try {
    return await prepareLoadedBlueprintBenchmark(projectDir, manifest, { ...options, caseExecutor });
  } finally {
    ownedExecutor?.dispose();
  }
}

async function prepareLoadedBlueprintBenchmark(
  projectDir: string,
  manifest: BlueprintBenchmarkManifest & { lock: NonNullable<BlueprintBenchmarkManifest["lock"]> },
  options: Pick<BlueprintBenchmarkEvaluationOptions, "onProgress" | "evaluationId" | "signal" | "caseExecution" | "caseExecutor">,
): Promise<PreparedBlueprintBenchmark> {
  const evaluationId = options.evaluationId ?? "evaluation";
  const execution = resolveBenchmarkCaseExecution(manifest.cases.length, options.caseExecution);
  if (options.caseExecutor && (
    options.caseExecutor.execution.mode !== execution.mode
    || options.caseExecutor.execution.concurrency !== execution.concurrency
  )) throw new Error(
    `Benchmark case executor ${options.caseExecutor.execution.mode} ×${options.caseExecutor.execution.concurrency}`
    + ` does not match requested ${execution.mode} ×${execution.concurrency}`,
  );
  const cases = new Array<PreparedBlueprintBenchmarkCase>(manifest.cases.length);
  const deferredTimings = new Array<BlueprintBenchmarkProgress["timing"]>(manifest.cases.length);
  const pending: Array<{
    index: number;
    item: BlueprintBenchmarkManifest["cases"][number];
    baseline: CompiledFactoryProject;
    compileMs: number;
    cacheReadMs: number;
  }> = [];
  let sequence = 0;
  let completed = 0;
  const emitCompleted = (
    index: number,
    evaluation: FactoryBlueprintEvaluation,
    cached: boolean,
    timing: BlueprintBenchmarkProgress["timing"],
  ) => {
    const item = manifest.cases[index]!;
    completed++;
    options.onProgress?.({
      version: 3,
      sequence: ++sequence,
      phase: "baseline-case-completed",
      benchmark: manifest.id,
      case: { id: item.id, name: item.name, index: index + 1, total: manifest.cases.length },
      work: { completed, total: manifest.cases.length * 2 },
      execution,
      evaluationId,
      timing,
      baselineScore: evaluation.metrics.score,
      cached,
    });
  };
  for (const [index, item] of manifest.cases.entries()) {
    options.signal?.throwIfAborted();
    const caseIdentity = { id: item.id, name: item.name, index: index + 1, total: manifest.cases.length };
    const caseStartedAt = performance.now();
    options.onProgress?.({
      version: 3,
      sequence: ++sequence,
      phase: "baseline-case-started",
      benchmark: manifest.id,
      case: caseIdentity,
      work: { completed, total: manifest.cases.length * 2 },
      execution,
      evaluationId,
      timing: {},
    });
    const compileStartedAt = performance.now();
    const baseline = await openSelectedProject(projectDir, {
      world: item.world, blueprint: manifest.baselineBlueprint, scenario: item.scenario, objective: item.objective,
    });
    const compileMs = performance.now() - compileStartedAt;
    assertLockedHashes(manifest.id, item.id, manifest.lock.cases[item.id]!, projectEvidenceHashes(baseline.hashes));
    const cacheStartedAt = performance.now();
    const cachedEvaluation = await readCachedBaselineEvaluation(projectDir, manifest, item, baseline);
    const cacheReadMs = performance.now() - cacheStartedAt;
    const cached = cachedEvaluation !== null;
    if (cachedEvaluation) {
      cases[index] = { manifest: item, baseline, evaluation: cachedEvaluation, cached };
      const timing = {
        durationMs: performance.now() - caseStartedAt,
        compileMs,
        cacheReadMs,
        evaluationMs: 0,
      };
      if (execution.mode === "sequential") emitCompleted(index, cachedEvaluation, cached, timing);
      else deferredTimings[index] = timing;
      continue;
    }
    if (execution.mode !== "sequential") {
      pending.push({ index, item, baseline, compileMs, cacheReadMs });
      continue;
    }
    const evaluationStartedAt = performance.now();
    const evaluation = evaluateFactoryBlueprint(baseline, manifest.baselineBlueprint, item.seed);
    const evaluationMs = performance.now() - evaluationStartedAt;
    await writeCachedBaselineEvaluation(projectDir, manifest, item, baseline, evaluation);
    options.signal?.throwIfAborted();
    cases[index] = { manifest: item, baseline, evaluation, cached };
    emitCompleted(index, evaluation, cached, {
      durationMs: performance.now() - caseStartedAt,
      compileMs,
      cacheReadMs,
      evaluationMs,
    });
  }
  if (pending.length) {
    const caseExecutor = options.caseExecutor ?? createBenchmarkCaseExecutor(execution);
    const ownedExecutor = options.caseExecutor ? undefined : caseExecutor;
    let results: BenchmarkCaseWorkerResult[];
    try {
      results = await caseExecutor.execute(pending.map(({ item, baseline }) => ({
        id: item.id,
        projectDir: resolve(projectDir),
        selection: { world: item.world, scenario: item.scenario, objective: item.objective },
        blueprintName: manifest.baselineBlueprint,
        blueprint: structuredClone(baseline.blueprint),
        seed: item.seed,
        includeTrace: false,
      })), { signal: options.signal });
    } finally {
      ownedExecutor?.dispose();
    }
    for (const [pendingIndex, result] of results.entries()) {
      options.signal?.throwIfAborted();
      const item = pending[pendingIndex]!;
      if (result.id !== item.item.id) throw new Error(
        `Benchmark worker returned baseline case '${result.id}' for '${item.item.id}'`,
      );
      if (result.evaluation.blueprintHash !== item.baseline.hashes.blueprintHash) throw new Error(
        `Benchmark worker baseline case '${result.id}' evaluated Blueprint ${result.evaluation.blueprintHash}, not ${item.baseline.hashes.blueprintHash}`,
      );
      const cacheWriteStartedAt = performance.now();
      await writeCachedBaselineEvaluation(projectDir, manifest, item.item, item.baseline, result.evaluation);
      const cacheWriteMs = performance.now() - cacheWriteStartedAt;
      cases[item.index] = {
        manifest: item.item,
        baseline: item.baseline,
        evaluation: result.evaluation,
        cached: false,
      };
      deferredTimings[item.index] = {
        durationMs: item.compileMs + item.cacheReadMs + result.timing.durationMs + cacheWriteMs,
        compileMs: item.compileMs + result.timing.compileMs,
        cacheReadMs: item.cacheReadMs,
        evaluationMs: result.timing.evaluationMs,
        workerStartupMs: result.timing.workerStartupMs,
        workerReused: result.timing.workerReused,
        workerSlot: result.timing.workerSlot,
      };
    }
  }
  if (execution.mode !== "sequential") for (const [index, item] of cases.entries()) {
    options.signal?.throwIfAborted();
    emitCompleted(index, item.evaluation, item.cached, deferredTimings[index]!);
  }
  return { projectDir: resolve(projectDir), manifest, cases };
}

export async function evaluatePreparedBlueprintBenchmark(
  prepared: PreparedBlueprintBenchmark,
  options: BlueprintBenchmarkEvaluationOptions = {},
): Promise<BlueprintBenchmarkResult> {
  const { manifest, projectDir } = prepared;
  const evaluationId = options.evaluationId ?? "evaluation";
  const execution = resolveBenchmarkCaseExecution(prepared.cases.length, options.caseExecution);
  if (options.caseExecutor && (
    options.caseExecutor.execution.mode !== execution.mode
    || options.caseExecutor.execution.concurrency !== execution.concurrency
  )) throw new Error(
    `Benchmark case executor ${options.caseExecutor.execution.mode} ×${options.caseExecutor.execution.concurrency}`
    + ` does not match requested ${execution.mode} ×${execution.concurrency}`,
  );
  if (options.onTraceCaseEvaluated && !options.traceCaseId) throw new Error("Benchmark trace callback requires one exact traceCaseId");
  if (options.traceCaseId && !prepared.cases.some((item) => item.manifest.id === options.traceCaseId)) {
    throw new Error(`Benchmark trace case '${options.traceCaseId}' is not part of '${manifest.id}'`);
  }
  const comparisons: FactoryBlueprintComparison[] = [];
  const cases: BlueprintBenchmarkCaseResult[] = [];
  let weightedBaseline = 0; let weightedCandidate = 0; let totalWeight = 0; let totalSimulationTicks = 0;
  let progressSequence = prepared.cases.length * 2;
  const emitStarted = (index: number) => {
    const item = prepared.cases[index]!.manifest;
    const caseIdentity = { id: item.id, name: item.name, index: index + 1, total: prepared.cases.length };
    options.onProgress?.({
      version: 3,
      sequence: ++progressSequence,
      phase: "candidate-case-started",
      benchmark: manifest.id,
      case: caseIdentity,
      work: { completed: prepared.cases.length, total: prepared.cases.length * 2 },
      execution,
      evaluationId,
      timing: {},
    });
  };
  const recordCase = (
    index: number,
    candidate: CompiledFactoryProject,
    candidateEvaluation: FactoryBlueprintEvaluation,
    timing: {
      durationMs: number;
      compileMs: number;
      evaluationMs: number;
      workerStartupMs?: number;
      workerReused?: boolean;
      workerSlot?: number;
    },
  ) => {
    const preparedCase = prepared.cases[index]!;
    const item = preparedCase.manifest;
    const caseIdentity = { id: item.id, name: item.name, index: index + 1, total: prepared.cases.length };
    const comparisonStartedAt = performance.now();
    const comparison = compareFactoryBlueprints(preparedCase.baseline, candidate, {
      seed: item.seed,
      fromLabel: manifest.baselineBlueprint,
      toLabel: manifest.candidateBlueprint,
      beforeEvaluation: preparedCase.evaluation,
      afterEvaluation: candidateEvaluation,
    });
    const comparisonMs = performance.now() - comparisonStartedAt;
    options.signal?.throwIfAborted();
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
      version: 3,
      sequence: ++progressSequence,
      phase: "candidate-case-completed",
      benchmark: manifest.id,
      case: caseIdentity,
      work: { completed: prepared.cases.length + index + 1, total: prepared.cases.length * 2 },
      execution,
      evaluationId,
      timing: {
        durationMs: timing.durationMs + comparisonMs,
        compileMs: timing.compileMs,
        evaluationMs: timing.evaluationMs,
        comparisonMs,
        ...(timing.workerStartupMs === undefined ? {} : { workerStartupMs: timing.workerStartupMs }),
        ...(timing.workerReused === undefined ? {} : { workerReused: timing.workerReused }),
        ...(timing.workerSlot === undefined ? {} : { workerSlot: timing.workerSlot }),
      },
      baselineScore: comparison.from.metrics.score,
      candidateScore: comparison.to.metrics.score,
      scoreDelta: comparison.delta.score,
      candidateCapacityReady: comparison.to.capacityPlan.ready,
    });
  };

  if (execution.mode === "sequential") {
    for (const [index, preparedCase] of prepared.cases.entries()) {
      options.signal?.throwIfAborted();
      emitStarted(index);
      const item = preparedCase.manifest;
      const selection = { world: item.world, scenario: item.scenario, objective: item.objective };
      const caseStartedAt = performance.now();
      const compileStartedAt = performance.now();
      const candidate = await openSelectedProject(projectDir, { ...selection, blueprint: manifest.candidateBlueprint }, options.candidateBlueprint);
      const compileMs = performance.now() - compileStartedAt;
      const evaluationStartedAt = performance.now();
      const candidateTrace = evaluateFactoryBlueprintWithTrace(candidate, manifest.candidateBlueprint, item.seed);
      const evaluationMs = performance.now() - evaluationStartedAt;
      if (item.id === options.traceCaseId) options.onTraceCaseEvaluated?.({
        case: item,
        project: candidate,
        simulation: candidateTrace.simulation,
      });
      options.signal?.throwIfAborted();
      recordCase(index, candidate, candidateTrace.evaluation, {
        durationMs: performance.now() - caseStartedAt,
        compileMs,
        evaluationMs,
      });
    }
  } else {
    const candidates: CompiledFactoryProject[] = [];
    const parentCompileMs: number[] = [];
    for (const preparedCase of prepared.cases) {
      options.signal?.throwIfAborted();
      const item = preparedCase.manifest;
      const compileStartedAt = performance.now();
      candidates.push(await openSelectedProject(projectDir, {
        world: item.world,
        scenario: item.scenario,
        objective: item.objective,
        blueprint: manifest.candidateBlueprint,
      }, options.candidateBlueprint));
      parentCompileMs.push(performance.now() - compileStartedAt);
    }
    const jobs = prepared.cases.map((preparedCase, index) => {
      const item = preparedCase.manifest;
      return {
        id: item.id,
        projectDir,
        selection: { world: item.world, scenario: item.scenario, objective: item.objective },
        blueprintName: manifest.candidateBlueprint,
        blueprint: structuredClone(candidates[index]!.blueprint),
        seed: item.seed,
        includeTrace: item.id === options.traceCaseId,
      };
    });
    const caseExecutor = options.caseExecutor ?? createBenchmarkCaseExecutor(execution);
    const ownedExecutor = options.caseExecutor ? undefined : caseExecutor;
    let workerResults: BenchmarkCaseWorkerResult[];
    try {
      workerResults = await caseExecutor.execute(jobs, {
        signal: options.signal,
        onStarted: (_job, index) => emitStarted(index),
      });
    } finally {
      ownedExecutor?.dispose();
    }
    for (const [index, result] of workerResults.entries()) {
      options.signal?.throwIfAborted();
      const preparedCase = prepared.cases[index]!;
      const candidate = candidates[index]!;
      if (result.id !== preparedCase.manifest.id) throw new Error(
        `Benchmark worker returned case '${result.id}' for '${preparedCase.manifest.id}'`,
      );
      if (result.evaluation.blueprintHash !== candidate.hashes.blueprintHash) throw new Error(
        `Benchmark worker case '${result.id}' evaluated Blueprint ${result.evaluation.blueprintHash}, not ${candidate.hashes.blueprintHash}`,
      );
      if (preparedCase.manifest.id === options.traceCaseId) {
        if (!result.simulation) throw new Error(`Benchmark worker omitted requested trace for case '${result.id}'`);
        options.onTraceCaseEvaluated?.({ case: preparedCase.manifest, project: candidate, simulation: result.simulation });
      }
      recordCase(index, candidate, result.evaluation, {
        durationMs: parentCompileMs[index]! + result.timing.durationMs,
        compileMs: parentCompileMs[index]! + result.timing.compileMs,
        evaluationMs: result.timing.evaluationMs,
        workerStartupMs: result.timing.workerStartupMs,
        workerReused: result.timing.workerReused,
        workerSlot: result.timing.workerSlot,
      });
    }
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
  const result: BlueprintBenchmarkResult = {
    benchmark: manifest.id, name: manifest.name,
    baselineBlueprint: manifest.baselineBlueprint, candidateBlueprint: manifest.candidateBlueprint,
    baselineBlueprintHash: comparisons[0]!.from.blueprintHash, candidateBlueprintHash: comparisons[0]!.to.blueprintHash,
    baselineScore, candidateScore, scoreDelta, worstCaseBaselineScore, worstCaseCandidateScore, minimumCaseScoreDelta,
    verdict: Math.abs(scoreDelta) <= 1e-9 ? "UNCHANGED" : accepted ? "KEEP" : "DISCARD",
    accepted, reasons, ...(outcomeGuardrails ? { outcomeGuardrails } : {}), totalSimulationTicks, cases,
    patch: comparisons[0]!.patch, changes: comparisons[0]!.changes,
  };
  benchmarkCacheStats.set(result, {
    hits: prepared.cases.filter((item) => item.cached).length,
    misses: prepared.cases.filter((item) => !item.cached).length,
  });
  return result;
}
