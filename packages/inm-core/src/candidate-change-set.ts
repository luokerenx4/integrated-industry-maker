import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  evaluatePreparedBlueprintBenchmark,
  loadBlueprintBenchmark,
  prepareBlueprintBenchmark,
  blueprintOutcomeMetricLabel,
  type BlueprintBenchmarkProgressHandler,
  type BlueprintBenchmarkResult,
  type BlueprintOutcomeMetric,
  type BlueprintOutcomeOperator,
} from "./benchmark";
import {
  createBenchmarkCaseExecutor,
  resolveBenchmarkCaseExecution,
  type BenchmarkCaseExecutionRequest,
} from "./benchmark-case-execution";
import { subtractScoreBreakdown, type BlueprintMetricSnapshot } from "./blueprint-comparison";
import { compileFactoryProject } from "./compiler";
import { applyResearchPatch, validateResearchPatch } from "./research";
import { blueprintSchema } from "./schema";
import { loadFactoryProject } from "./loader";
import {
  SCORE_BREAKDOWN_COMPONENTS,
  type Blueprint,
  type CompiledFactoryProject,
  type ProjectEvidenceHashes,
  type ScoreBreakdownComponent,
} from "./types";
import { atomicWriteJson, hashValue, pathExists, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const patchOperationSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  path: z.string().min(1),
  value: z.unknown().optional(),
}).strict().superRefine((operation, context) => {
  if (operation.op !== "remove" && !("value" in operation)) context.addIssue({ code: "custom", message: `${operation.op} requires value`, path: ["value"] });
});

export const candidateSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("design-run"),
    program: id,
    resultHash: hash,
    blueprintHash: hash,
  }).strict(),
  z.object({
    kind: z.literal("investigation-hypothesis"),
    project: id,
    investigation: id,
    manifestHash: hash,
    entry: id,
    entryHash: hash,
  }).strict(),
]);
export type CandidateSource = z.infer<typeof candidateSourceSchema>;

export const candidateChangeSetSchema = z.object({
  version: z.literal(1),
  id,
  name: z.string().min(1),
  benchmark: id,
  hypothesis: z.string().min(1),
  expectedEffect: z.string().min(1).optional(),
  source: candidateSourceSchema.optional(),
  baseCandidateHash: hash,
  patch: z.array(patchOperationSchema).min(1),
}).strict();

export type CandidateChangeSet = z.infer<typeof candidateChangeSetSchema>;
export type CandidatePatch = CandidateChangeSet["patch"];

export interface CandidateChangeSetSummary extends CandidateChangeSet {}

export interface CandidateInvestigationSourceEvidence {
  kind: "investigation-hypothesis";
  state: "current" | "historical";
  project: string;
  investigation: string;
  investigationName: string;
  question: string;
  manifestHash: string;
  entry: string;
  entryHash: string;
  sequence: number;
  author: "human" | "agent";
  statement: string;
  expectedEffect: string;
  evidence: string[];
  operatingContext: {
    source: "investigation-creation" | "factory-observation" | "run-comparison";
    anchorId: string;
    selection: {
      world: string;
      blueprint: string;
      scenario: string;
      objective: string;
    };
    hashes: ProjectEvidenceHashes;
    run: {
      id: string;
      resultHash: string;
    };
    diagnostic: {
      id: string;
      code: string;
    };
  };
  navigation: {
    argv: string[];
    studioRoute: string;
  };
}

export interface CandidateChangeSetPreview {
  candidate: CandidateChangeSet;
  sourceEvidence: CandidateInvestigationSourceEvidence | null;
  proposalHash: string;
  currentCandidateHash: string;
  proposedCandidateHash: string;
  currentFactory: CandidateCurrentFactoryComparison;
  revisionBrief: CandidateRevisionBrief | null;
  result: BlueprintBenchmarkResult;
}

export interface CandidateCurrentFactoryCaseComparison {
  id: string;
  name: string;
  weight: number;
  seed: number;
  durationTicks: number;
  currentScore: number;
  proposedScore: number;
  scoreDelta: number;
  scoreBreakdownDelta: BlueprintMetricSnapshot["scoreBreakdown"];
  currentMetrics: BlueprintMetricSnapshot;
  proposedMetrics: BlueprintMetricSnapshot;
  currentCapacityReady: boolean;
  proposedCapacityReady: boolean;
  currentCapacityGaps: string[];
  proposedCapacityGaps: string[];
}

export interface CandidateCurrentFactoryOutcomeCaseComparison {
  id: string;
  name: string;
  currentValue: number;
  proposedValue: number;
  threshold: number;
  currentPassed: boolean;
  proposedPassed: boolean;
}

export interface CandidateCurrentFactoryOutcomeComparison {
  id: string;
  metric: BlueprintOutcomeMetric;
  label: string;
  operator: BlueprintOutcomeOperator;
  currentPassed: boolean;
  proposedPassed: boolean;
  cases: CandidateCurrentFactoryOutcomeCaseComparison[];
}

export interface CandidatePhysicalEconomicsSnapshot {
  totalBuildCost: number;
  equipmentBuildCost: number;
  transportEndpointBuildCost: number;
  transportLineBuildCost: number;
  occupiedArea: number;
  equipmentArea: number;
  transportCells: number;
}

export interface CandidatePhysicalEconomicsComparison {
  current: CandidatePhysicalEconomicsSnapshot;
  proposed: CandidatePhysicalEconomicsSnapshot;
  delta: CandidatePhysicalEconomicsSnapshot;
}

export interface CandidateEvaluatedCurrentFactoryComparison {
  reference: "current-factory";
  status: "evaluated";
  currentBlueprintHash: string;
  proposedBlueprintHash: string;
  currentScore: number;
  proposedScore: number;
  scoreDelta: number;
  minimumCaseScoreDelta: number;
  verdict: "IMPROVED" | "REGRESSED" | "UNCHANGED";
  /** Present on newly evaluated evidence; older immutable receipts may predate this ledger. */
  physicalEconomics?: CandidatePhysicalEconomicsComparison;
  cases: CandidateCurrentFactoryCaseComparison[];
  outcomeGuardrails?: CandidateCurrentFactoryOutcomeComparison[];
}

export interface CandidateUnavailableCurrentFactoryComparison {
  reference: "current-factory";
  status: "not-operational";
  currentBlueprintHash: string;
  proposedBlueprintHash: string;
  verdict: "NOT_COMPARABLE";
  reason: string;
}

export type CandidateCurrentFactoryComparison =
  | CandidateEvaluatedCurrentFactoryComparison
  | CandidateUnavailableCurrentFactoryComparison;

export interface CandidateRevisionGuardrailRegression {
  guardrailId: string;
  metric: BlueprintOutcomeMetric;
  label: string;
  operator: BlueprintOutcomeOperator;
  caseId: string;
  caseName: string;
  currentValue: number;
  proposedValue: number;
  threshold: number;
  deficit: number;
}

export interface CandidateRevisionCaseRegression {
  caseId: string;
  caseName: string;
  scoreDelta: number;
}

export interface CandidateRevisionScoreTradeoff {
  component: ScoreBreakdownComponent;
  scoreDelta: number;
}

export interface CandidateRevisionBrief {
  disposition: "revise-or-retire";
  decisionOwner: "human-or-agent";
  candidateId: string;
  benchmarkId: string;
  lockedVerdict: "DISCARD" | "UNCHANGED";
  currentFactoryStatus: CandidateCurrentFactoryComparison["status"];
  blockingReasons: string[];
  guardrailRegressions: CandidateRevisionGuardrailRegression[];
  caseRegressions: CandidateRevisionCaseRegression[];
  benefitsToPreserve: CandidateRevisionScoreTradeoff[];
  costsToRemove: CandidateRevisionScoreTradeoff[];
  patchPaths: string[];
}

export interface AppliedCandidateChangeSet extends CandidateChangeSetPreview {
  applied: true;
  blueprintPath: string;
}

export class CandidateChangeSetError extends Error {
  constructor(public readonly code: string, message: string, public readonly hashes: Record<string, string> = {}) {
    super(message);
    this.name = "CandidateChangeSetError";
  }
}

export async function resolveCandidateInvestigationSource(
  projectDir: string,
  candidate: CandidateChangeSet,
): Promise<CandidateInvestigationSourceEvidence | null> {
  if (candidate.source?.kind !== "investigation-hypothesis") return null;
  try {
    const { resolveIndustrialInvestigationHypothesisSource } = await import("./investigation");
    return await resolveIndustrialInvestigationHypothesisSource(projectDir, candidate.source, {
      hypothesis: candidate.hypothesis,
      expectedEffect: candidate.expectedEffect,
    });
  } catch (error) {
    if (error instanceof CandidateChangeSetError) throw error;
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "investigation.source-unavailable";
    throw new CandidateChangeSetError(
      "candidate.investigation-source-invalid",
      `Candidate '${candidate.id}' cannot resolve its Investigation hypothesis: [${code}] ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function candidatePath(projectDir: string, candidateId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(candidateId)) throw new CandidateChangeSetError("candidate.invalid-id", "Candidate id must use lowercase kebab-case");
  return join(resolve(projectDir), "candidates", `${candidateId}.candidate.json`);
}

function parseCandidateChangeSet(value: unknown, candidateId: string): CandidateChangeSet {
  const parsed = candidateChangeSetSchema.safeParse(value);
  if (!parsed.success) throw new CandidateChangeSetError(
    "candidate.invalid",
    `Invalid candidate change set '${candidateId}': ${parsed.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
  );
  if (parsed.data.id !== candidateId) throw new CandidateChangeSetError("candidate.id-mismatch", `Candidate id '${parsed.data.id}' must match filename '${candidateId}'`);
  return parsed.data;
}

export async function loadCandidateChangeSet(projectDir: string, candidateId: string): Promise<CandidateChangeSet> {
  return parseCandidateChangeSet(await readJson(candidatePath(projectDir, candidateId)), candidateId);
}

export async function writeCandidateChangeSet(projectDir: string, candidate: CandidateChangeSet): Promise<string> {
  const parsed = parseCandidateChangeSet(candidate, candidate.id);
  validateResearchPatch(parsed.patch);
  const path = candidatePath(projectDir, parsed.id);
  if (await pathExists(path)) throw new CandidateChangeSetError("candidate.exists", `Candidate change set '${parsed.id}' already exists`);
  await atomicWriteJson(path, parsed);
  return path;
}

export async function listCandidateChangeSets(projectDir: string, benchmarkId?: string): Promise<CandidateChangeSetSummary[]> {
  const directory = join(resolve(projectDir), "candidates");
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const ids = files.filter((file) => file.endsWith(".candidate.json"))
    .map((file) => file.slice(0, -".candidate.json".length)).sort();
  const candidates = await Promise.all(ids.map((candidateId) => loadCandidateChangeSet(projectDir, candidateId)));
  return candidates.filter((candidate) => !benchmarkId || candidate.benchmark === benchmarkId);
}

export interface CandidateEvaluationOptions {
  onProgress?: BlueprintBenchmarkProgressHandler;
  signal?: AbortSignal;
  caseExecution?: BenchmarkCaseExecutionRequest;
}

function remapCandidateProgress(
  handler: BlueprintBenchmarkProgressHandler | undefined,
  phase: "baseline" | "current" | "candidate",
  caseCount: number,
  includeCurrent: boolean,
): BlueprintBenchmarkProgressHandler | undefined {
  if (!handler) return undefined;
  const waveCount = includeCurrent ? 3 : 2;
  return (progress) => {
    if (phase === "baseline") {
      handler({ ...progress, work: { ...progress.work, total: caseCount * waveCount } });
      return;
    }
    const isCompleted = progress.phase.endsWith("completed");
    const additionalCases = phase === "candidate" && includeCurrent ? caseCount : 0;
    handler({
      ...progress,
      sequence: progress.sequence + additionalCases * 2,
      phase: `${phase}-case-${isCompleted ? "completed" : "started"}`,
      work: {
        completed: progress.work.completed + additionalCases,
        total: caseCount * waveCount,
      },
    });
  };
}

function outcomePasses(operator: BlueprintOutcomeOperator, value: number, threshold: number): boolean {
  return operator === "minimum" ? value >= threshold - 1e-9 : value <= threshold + 1e-9;
}

function currentFactoryOutcomeComparison(
  current: BlueprintBenchmarkResult,
  proposed: BlueprintBenchmarkResult,
): CandidateCurrentFactoryOutcomeComparison[] | undefined {
  if (!proposed.outcomeGuardrails) return undefined;
  const currentCases = new Map(current.cases.map((item) => [item.id, item]));
  return proposed.outcomeGuardrails.map((guardrail) => {
    const cases = guardrail.cases.map((item) => {
      const currentCase = currentCases.get(item.id);
      if (!currentCase) throw new Error(`Current-factory evaluation omitted Benchmark case '${item.id}'`);
      const currentValue = currentCase.candidateMetrics[guardrail.metric];
      return {
        id: item.id,
        name: item.name,
        currentValue,
        proposedValue: item.candidateValue,
        threshold: item.threshold,
        currentPassed: outcomePasses(guardrail.operator, currentValue, item.threshold),
        proposedPassed: item.candidatePassed,
      };
    });
    return {
      id: guardrail.id,
      metric: guardrail.metric,
      label: blueprintOutcomeMetricLabel(guardrail.metric),
      operator: guardrail.operator,
      currentPassed: cases.every((item) => item.currentPassed),
      proposedPassed: cases.every((item) => item.proposedPassed),
      cases,
    };
  });
}

function physicalEconomics(project: CompiledFactoryProject): CandidatePhysicalEconomicsSnapshot {
  let equipmentBuildCost = 0;
  let transportEndpointBuildCost = 0;
  let equipmentArea = 0;
  for (const device of Object.values(project.devices)) {
    if (device.transportEndpoint) transportEndpointBuildCost += device.assetDef.economics.buildCost;
    else {
      equipmentBuildCost += device.assetDef.economics.buildCost;
      equipmentArea += device.footprint.width * device.footprint.height;
    }
  }
  const transportCells = Object.values(project.transportCells);
  const transportLineBuildCost = transportCells.reduce(
    (sum, cell) => sum + cell.asset.economics.buildCost,
    0,
  );
  return {
    totalBuildCost: equipmentBuildCost + transportEndpointBuildCost + transportLineBuildCost,
    equipmentBuildCost,
    transportEndpointBuildCost,
    transportLineBuildCost,
    occupiedArea: equipmentArea + transportCells.length,
    equipmentArea,
    transportCells: transportCells.length,
  };
}

function comparePhysicalEconomics(
  current: CompiledFactoryProject,
  proposed: CompiledFactoryProject,
): CandidatePhysicalEconomicsComparison {
  const currentSnapshot = physicalEconomics(current);
  const proposedSnapshot = physicalEconomics(proposed);
  const delta: CandidatePhysicalEconomicsSnapshot = {
    totalBuildCost: proposedSnapshot.totalBuildCost - currentSnapshot.totalBuildCost,
    equipmentBuildCost: proposedSnapshot.equipmentBuildCost - currentSnapshot.equipmentBuildCost,
    transportEndpointBuildCost: proposedSnapshot.transportEndpointBuildCost - currentSnapshot.transportEndpointBuildCost,
    transportLineBuildCost: proposedSnapshot.transportLineBuildCost - currentSnapshot.transportLineBuildCost,
    occupiedArea: proposedSnapshot.occupiedArea - currentSnapshot.occupiedArea,
    equipmentArea: proposedSnapshot.equipmentArea - currentSnapshot.equipmentArea,
    transportCells: proposedSnapshot.transportCells - currentSnapshot.transportCells,
  };
  return { current: currentSnapshot, proposed: proposedSnapshot, delta };
}

function compareWithCurrentFactory(
  current: BlueprintBenchmarkResult,
  proposed: BlueprintBenchmarkResult,
  currentProject: CompiledFactoryProject,
  proposedProject: CompiledFactoryProject,
): CandidateCurrentFactoryComparison {
  const currentCases = new Map(current.cases.map((item) => [item.id, item]));
  const cases = proposed.cases.map((item): CandidateCurrentFactoryCaseComparison => {
    const currentCase = currentCases.get(item.id);
    if (!currentCase) throw new Error(`Current-factory evaluation omitted Benchmark case '${item.id}'`);
    const scoreDelta = item.candidateScore - currentCase.candidateScore;
    const scoreBreakdownDelta = subtractScoreBreakdown(
      currentCase.candidateMetrics.scoreBreakdown,
      item.candidateMetrics.scoreBreakdown,
    );
    const componentDelta = Object.values(scoreBreakdownDelta).reduce((sum, value) => sum + value, 0);
    if (Math.abs(componentDelta - scoreDelta) > 1e-8) throw new Error(
      `Current-factory score components for case '${item.id}' total ${componentDelta}, not ${scoreDelta}`,
    );
    return {
      id: item.id,
      name: item.name,
      weight: item.weight,
      seed: item.seed,
      durationTicks: item.durationTicks,
      currentScore: currentCase.candidateScore,
      proposedScore: item.candidateScore,
      scoreDelta,
      scoreBreakdownDelta,
      currentMetrics: currentCase.candidateMetrics,
      proposedMetrics: item.candidateMetrics,
      currentCapacityReady: currentCase.candidateCapacityReady,
      proposedCapacityReady: item.candidateCapacityReady,
      currentCapacityGaps: currentCase.candidateCapacityGaps,
      proposedCapacityGaps: item.candidateCapacityGaps,
    };
  });
  const scoreDelta = proposed.candidateScore - current.candidateScore;
  const physicalEconomics = comparePhysicalEconomics(currentProject, proposedProject);
  if (cases.some((item) =>
    item.currentMetrics.totalBuildCost !== physicalEconomics.current.totalBuildCost
    || item.proposedMetrics.totalBuildCost !== physicalEconomics.proposed.totalBuildCost
    || item.currentMetrics.occupiedArea !== physicalEconomics.current.occupiedArea
    || item.proposedMetrics.occupiedArea !== physicalEconomics.proposed.occupiedArea)) {
    throw new Error("Current-factory physical economics disagree with evaluator-owned case metrics");
  }
  return {
    reference: "current-factory",
    status: "evaluated",
    currentBlueprintHash: current.candidateBlueprintHash,
    proposedBlueprintHash: proposed.candidateBlueprintHash,
    currentScore: current.candidateScore,
    proposedScore: proposed.candidateScore,
    scoreDelta,
    minimumCaseScoreDelta: Math.min(...cases.map((item) => item.scoreDelta)),
    verdict: Math.abs(scoreDelta) <= 1e-9 ? "UNCHANGED" : scoreDelta > 0 ? "IMPROVED" : "REGRESSED",
    physicalEconomics,
    cases,
    ...(proposed.outcomeGuardrails
      ? { outcomeGuardrails: currentFactoryOutcomeComparison(current, proposed) }
      : {}),
  };
}

export function deriveCandidateRevisionBrief(
  candidate: CandidateChangeSet,
  result: BlueprintBenchmarkResult,
  currentFactory: CandidateCurrentFactoryComparison,
): CandidateRevisionBrief | null {
  if (result.verdict === "KEEP") return null;
  const guardrailRegressions = currentFactory.status === "evaluated"
    ? (currentFactory.outcomeGuardrails ?? []).flatMap((guardrail) =>
        guardrail.cases
          .filter((item) => item.currentPassed && !item.proposedPassed)
          .map((item): CandidateRevisionGuardrailRegression => ({
            guardrailId: guardrail.id,
            metric: guardrail.metric,
            label: guardrail.label,
            operator: guardrail.operator,
            caseId: item.id,
            caseName: item.name,
            currentValue: item.currentValue,
            proposedValue: item.proposedValue,
            threshold: item.threshold,
            deficit: guardrail.operator === "minimum"
              ? item.threshold - item.proposedValue
              : item.proposedValue - item.threshold,
          })))
    : [];
  const caseRegressions = currentFactory.status === "evaluated"
    ? currentFactory.cases
        .filter((item) => item.scoreDelta < -1e-9)
        .map((item) => ({ caseId: item.id, caseName: item.name, scoreDelta: item.scoreDelta }))
    : [];
  const scoreTradeoffs = currentFactory.status === "evaluated"
    ? (() => {
        const totalWeight = currentFactory.cases.reduce((sum, item) => sum + item.weight, 0);
        return SCORE_BREAKDOWN_COMPONENTS.map((component): CandidateRevisionScoreTradeoff => ({
          component,
          scoreDelta: currentFactory.cases.reduce(
            (sum, item) => sum + item.scoreBreakdownDelta[component] * item.weight,
            0,
          ) / totalWeight,
        }));
      })()
    : [];
  const byMagnitude = (left: CandidateRevisionScoreTradeoff, right: CandidateRevisionScoreTradeoff) =>
    Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta)
    || SCORE_BREAKDOWN_COMPONENTS.indexOf(left.component) - SCORE_BREAKDOWN_COMPONENTS.indexOf(right.component);
  return {
    disposition: "revise-or-retire",
    decisionOwner: "human-or-agent",
    candidateId: candidate.id,
    benchmarkId: candidate.benchmark,
    lockedVerdict: result.verdict,
    currentFactoryStatus: currentFactory.status,
    blockingReasons: [...result.reasons],
    guardrailRegressions,
    caseRegressions,
    benefitsToPreserve: scoreTradeoffs.filter((item) => item.scoreDelta > 1e-9).sort(byMagnitude),
    costsToRemove: scoreTradeoffs.filter((item) => item.scoreDelta < -1e-9).sort(byMagnitude),
    patchPaths: [...new Set(candidate.patch.map((operation) => operation.path))],
  };
}

export async function prepareCandidateChangeSet(
  projectDir: string,
  candidateId: string,
  options: CandidateEvaluationOptions = {},
): Promise<CandidateChangeSetPreview & {
  proposedBlueprint: Blueprint;
  blueprintPath: string;
  operationProject: CompiledFactoryProject;
}> {
  const candidate = await loadCandidateChangeSet(projectDir, candidateId);
  const sourceEvidence = await resolveCandidateInvestigationSource(projectDir, candidate);
  const benchmark = await loadBlueprintBenchmark(projectDir, candidate.benchmark);
  const firstCase = benchmark.cases[0]!;
  const loaded = await loadFactoryProject(projectDir, {
    world: firstCase.world,
    blueprint: benchmark.candidateBlueprint,
    scenario: firstCase.scenario,
    objective: firstCase.objective,
  });
  const currentCandidateHash = hashValue(loaded.blueprint);
  if (candidate.baseCandidateHash !== currentCandidateHash) throw new CandidateChangeSetError(
    "candidate.stale-base",
    `Candidate change set '${candidate.id}' targets ${candidate.baseCandidateHash}, but Blueprint '${benchmark.candidateBlueprint}' is ${currentCandidateHash}`,
    { expectedBaseHash: candidate.baseCandidateHash, currentCandidateHash },
  );
  let patched: Blueprint;
  try { patched = applyResearchPatch(loaded.blueprint, candidate.patch); }
  catch (error) {
    throw new CandidateChangeSetError("candidate.invalid-patch", `Candidate change set '${candidate.id}' has an invalid patch: ${error instanceof Error ? error.message : String(error)}`);
  }
  patched.revision = currentCandidateHash;
  const parsedBlueprint = blueprintSchema.safeParse(patched);
  if (!parsedBlueprint.success) throw new CandidateChangeSetError(
    "candidate.invalid-blueprint",
    `Candidate change set '${candidate.id}' produces an invalid Blueprint: ${parsedBlueprint.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
  );
  const proposedBlueprint = parsedBlueprint.data;
  const proposedCandidateHash = hashValue(proposedBlueprint);
  let operationProject: CompiledFactoryProject;
  let result: BlueprintBenchmarkResult;
  let currentFactory: CandidateCurrentFactoryComparison;
  try {
    // A generative Candidate may start from a schema-valid commissioning site
    // whose Scenario references only become valid after this exact patch.
    operationProject = compileFactoryProject({ ...loaded, blueprint: proposedBlueprint });
    let currentFactoryUnavailableReason: string | undefined;
    let currentOperationProject: CompiledFactoryProject | undefined;
    try {
      currentOperationProject = compileFactoryProject(loaded);
    } catch (error) {
      currentFactoryUnavailableReason = error instanceof Error ? error.message : String(error);
    }
    const includeCurrent = currentFactoryUnavailableReason === undefined;
    const execution = resolveBenchmarkCaseExecution(benchmark.cases.length, options.caseExecution);
    const caseExecutor = execution.mode === "sequential" ? undefined : createBenchmarkCaseExecutor(execution);
    try {
      const prepared = await prepareBlueprintBenchmark(projectDir, candidate.benchmark, {
        onProgress: remapCandidateProgress(options.onProgress, "baseline", benchmark.cases.length, includeCurrent),
        evaluationId: `candidate:${candidate.id}`,
        signal: options.signal,
        caseExecution: options.caseExecution,
        caseExecutor,
      });
      const currentResult = includeCurrent
        ? await evaluatePreparedBlueprintBenchmark(prepared, {
            candidateBlueprint: loaded.blueprint,
            evaluationId: `candidate:${candidate.id}:current`,
            onProgress: remapCandidateProgress(options.onProgress, "current", benchmark.cases.length, true),
            signal: options.signal,
            caseExecution: options.caseExecution,
            caseExecutor,
          })
        : undefined;
      result = await evaluatePreparedBlueprintBenchmark(prepared, {
        candidateBlueprint: proposedBlueprint,
        evaluationId: `candidate:${candidate.id}`,
        onProgress: remapCandidateProgress(options.onProgress, "candidate", benchmark.cases.length, includeCurrent),
        signal: options.signal,
        caseExecution: options.caseExecution,
        caseExecutor,
      });
      currentFactory = currentResult
        ? compareWithCurrentFactory(currentResult, result, currentOperationProject!, operationProject)
        : {
            reference: "current-factory",
            status: "not-operational",
            currentBlueprintHash: currentCandidateHash,
            proposedBlueprintHash: proposedCandidateHash,
            verdict: "NOT_COMPARABLE",
            reason: currentFactoryUnavailableReason!,
          };
    } finally {
      caseExecutor?.dispose();
    }
  }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new CandidateChangeSetError("candidate.evaluation-failed", `Candidate change set '${candidate.id}' could not be evaluated: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    candidate,
    sourceEvidence,
    proposalHash: hashValue(candidate),
    currentCandidateHash,
    proposedCandidateHash,
    currentFactory,
    revisionBrief: deriveCandidateRevisionBrief(candidate, result, currentFactory),
    proposedBlueprint,
    operationProject,
    result,
    blueprintPath: join(loaded.rootDir, "blueprints", `${benchmark.candidateBlueprint}.blueprint.json`),
  };
}

export async function previewCandidateChangeSet(
  projectDir: string,
  candidateId: string,
  options: CandidateEvaluationOptions = {},
): Promise<CandidateChangeSetPreview> {
  const { proposedBlueprint: _, blueprintPath: __, operationProject: ___, ...preview } = await prepareCandidateChangeSet(projectDir, candidateId, options);
  return preview;
}

export async function applyCandidateChangeSet(
  projectDir: string,
  candidateId: string,
  reviewed: { proposalHash: string; currentCandidateHash: string; proposedCandidateHash: string },
  options: CandidateEvaluationOptions = {},
): Promise<AppliedCandidateChangeSet> {
  const prepared = await prepareCandidateChangeSet(projectDir, candidateId, options);
  if (reviewed.proposalHash !== prepared.proposalHash) throw new CandidateChangeSetError(
    "candidate.review-proposal-mismatch",
    `Reviewed proposal hash ${reviewed.proposalHash} does not match current proposal hash ${prepared.proposalHash}`,
    { reviewedProposalHash: reviewed.proposalHash, currentProposalHash: prepared.proposalHash },
  );
  if (reviewed.currentCandidateHash !== prepared.currentCandidateHash) throw new CandidateChangeSetError(
    "candidate.review-base-mismatch",
    `Reviewed base hash ${reviewed.currentCandidateHash} does not match current candidate hash ${prepared.currentCandidateHash}`,
    { reviewedBaseHash: reviewed.currentCandidateHash, currentCandidateHash: prepared.currentCandidateHash },
  );
  if (reviewed.proposedCandidateHash !== prepared.proposedCandidateHash) throw new CandidateChangeSetError(
    "candidate.review-proposal-mismatch",
    `Reviewed proposed hash ${reviewed.proposedCandidateHash} does not match evaluated proposed hash ${prepared.proposedCandidateHash}`,
    { reviewedProposedHash: reviewed.proposedCandidateHash, evaluatedProposedHash: prepared.proposedCandidateHash },
  );
  if (prepared.result.verdict !== "KEEP") throw new CandidateChangeSetError(
    "candidate.not-accepted",
    `Candidate change set '${candidateId}' cannot be applied because its locked Benchmark verdict is ${prepared.result.verdict}`,
  );
  options.signal?.throwIfAborted();
  const latestBlueprintHash = hashValue(await readJson(prepared.blueprintPath));
  if (latestBlueprintHash !== prepared.currentCandidateHash) throw new CandidateChangeSetError(
    "candidate.write-conflict",
    `Candidate Blueprint changed after evaluation: expected ${prepared.currentCandidateHash}, found ${latestBlueprintHash}`,
    { expectedCandidateHash: prepared.currentCandidateHash, currentCandidateHash: latestBlueprintHash },
  );
  const latestProposal = await loadCandidateChangeSet(projectDir, candidateId);
  if (hashValue(latestProposal) !== hashValue(prepared.candidate)) throw new CandidateChangeSetError(
    "candidate.proposal-conflict",
    `Candidate change set '${candidateId}' changed after evaluation; review it again`,
  );
  options.signal?.throwIfAborted();
  await atomicWriteJson(prepared.blueprintPath, prepared.proposedBlueprint);
  const { proposedBlueprint: _, operationProject: __, ...result } = prepared;
  return { ...result, applied: true };
}
