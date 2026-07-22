import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Blueprint } from "./types";
import type { BlueprintBenchmarkProgress, BlueprintBenchmarkResult } from "./benchmark";
import { evaluatePreparedBlueprintBenchmark, loadBlueprintBenchmark, prepareBlueprintBenchmark } from "./benchmark";
import { createBlueprintPatch } from "./blueprint-comparison";
import { writeCandidateChangeSet, type CandidateChangeSet } from "./candidate-change-set";
import { compileFactoryProject } from "./compiler";
import {
  designProgramHash,
  designSeedSchema,
  loadDesignProgram,
  prepareDesignProgram,
  type DesignDecisionFamily,
  type DesignProgramBrief,
} from "./design-program";
import { ProjectProposalExhaustedError, ProjectStrategyResearchAgent } from "./design-proposal-provider";
import { loadFactoryProject, type LoadedFactoryProject } from "./loader";
import { analyzeProduction } from "./production-analysis";
import { planProductionCapacity } from "./capacity-plan";
import {
  applyResearchPatch,
  HeuristicResearchAgent,
  type ResearchHistoryEntry,
  type ResearchProposal,
} from "./research";
import { runUntil } from "./simulator";
import { blueprintSchema } from "./schema";
import { atomicWriteJson, ENGINE_VERSION, hashValue, pathExists, readJson, stableStringify } from "./utils";
import { analyzeFabLossProfile, type FabLossBucketId, type FabLossProfile } from "./fab-loss-analysis";

export interface DesignDriverEvidence {
  metricsHash: string;
  fabLoss: FabLossProfile | null;
}

export interface DesignRunIteration {
  iteration: number;
  strategy: string;
  decisionFamily: DesignDecisionFamily;
  hypothesis: string;
  expectedEffect?: string;
  addressedLoss?: FabLossBucketId;
  driverEvidence: DesignDriverEvidence;
  proposalHash: string;
  patch: ResearchProposal["patch"];
  candidateBlueprintHash?: string;
  previousBestScore: number;
  candidateScore?: number;
  scoreDeltaFromBest?: number;
  decision: "KEEP" | "REJECT";
  evaluation?: BlueprintBenchmarkResult;
  error?: string;
}

export interface DesignRunManifest {
  version: 1;
  status: "completed";
  engineVersion: string;
  project: string;
  program: { id: string; hash: string };
  benchmark: { id: string; contractHash: string };
  seed: DesignProgramBrief["seed"] & { evaluation: BlueprintBenchmarkResult };
  promotionBase: DesignProgramBrief["promotionBase"];
  driver: DesignProgramBrief["driver"];
  budget: { maximum: number; evaluated: number };
  iterations: DesignRunIteration[];
  best: {
    iteration: number;
    blueprintHash: string;
    promotionPatchOperations: number;
    candidateScore: number;
    scoreDelta: number;
    verdict: BlueprintBenchmarkResult["verdict"];
  };
  stopReason: "budget-exhausted" | "strategy-exhausted";
  resultHash: string;
}

export interface DesignRunResult {
  manifest: DesignRunManifest;
  bestBlueprint: Blueprint;
  artifact: { id: string; path: string; created: boolean };
}

interface DesignRunProgressBase {
  version: 1;
  sequence: number;
  program: string;
  benchmark: string;
  budget: { maximum: number };
  work: { completedSimulations: number; plannedSimulations: number };
}

export type DesignRunProgress =
  | DesignRunProgressBase & { phase: "run-started"; caseCount: number }
  | DesignRunProgressBase & {
    phase: "case-started" | "case-completed";
    evaluation: { kind: "baseline" | "seed" | "candidate"; id: string; iteration: number };
    case: BlueprintBenchmarkProgress["case"];
    baselineScore?: number;
    candidateScore?: number;
    scoreDelta?: number;
    candidateCapacityReady?: boolean;
  }
  | DesignRunProgressBase & { phase: "proposal-started"; iteration: number; driverEvidence: DesignDriverEvidence }
  | DesignRunProgressBase & { phase: "proposal-completed"; iteration: number; strategy: string; decisionFamily: DesignDecisionFamily; addressedLoss?: FabLossBucketId; driverEvidence: DesignDriverEvidence; proposalHash: string }
  | DesignRunProgressBase & {
    phase: "candidate-completed";
    iteration: number;
    strategy: string;
    decision: "KEEP" | "REJECT";
    candidateScore?: number;
    scoreDeltaFromBest?: number;
    error?: string;
  }
  | DesignRunProgressBase & { phase: "run-completed"; resultHash: string; stopReason: DesignRunManifest["stopReason"]; best: DesignRunManifest["best"] };

export type DesignRunProgressHandler = (progress: DesignRunProgress) => void;
type DesignRunProgressPayload = DesignRunProgress extends infer Progress
  ? Progress extends DesignRunProgressBase ? Omit<Progress, keyof DesignRunProgressBase> : never
  : never;

export interface DesignRunSummary {
  id: string;
  path: string;
  program: string;
  benchmark: string;
  seed: DesignRunManifest["seed"]["source"];
  promotionBase: DesignRunManifest["promotionBase"];
  budget: DesignRunManifest["budget"];
  best: DesignRunManifest["best"];
  stopReason: DesignRunManifest["stopReason"];
}

export class DesignRunError extends Error {
  constructor(public readonly code: string, message: string, public readonly hashes: Record<string, string> = {}) {
    super(message);
    this.name = "DesignRunError";
  }
}

function withBlueprint(loaded: LoadedFactoryProject, blueprint: Blueprint): LoadedFactoryProject {
  return { ...loaded, blueprint };
}

function decisionFamily(strategy: string, allowed: readonly DesignDecisionFamily[]): DesignDecisionFamily {
  const family = strategy.split(":", 1)[0] as DesignDecisionFamily;
  if (!allowed.includes(family)) throw new Error(`Design proposal strategy '${strategy}' is outside the declared decision families`);
  return family;
}

function manifestHashInput(manifest: Omit<DesignRunManifest, "resultHash">): unknown {
  return manifest;
}

function validDriverEvidence(value: unknown): value is DesignDriverEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as DesignDriverEvidence;
  if (!/^[0-9a-f]{64}$/.test(evidence.metricsHash ?? "")) return false;
  if (evidence.fabLoss === null) return true;
  return evidence.fabLoss?.version === 1
    && typeof evidence.fabLoss.family === "string"
    && !Object.hasOwn(evidence.fabLoss, "run")
    && Array.isArray(evidence.fabLoss.chain)
    && Array.isArray(evidence.fabLoss.buckets)
    && evidence.fabLoss.chain.every((id) => evidence.fabLoss!.buckets.some((bucket) => bucket.id === id));
}

function validDesignRunIteration(value: unknown): value is DesignRunIteration {
  if (!value || typeof value !== "object") return false;
  const iteration = value as DesignRunIteration;
  return validDriverEvidence(iteration.driverEvidence)
    && /^[0-9a-f]{64}$/.test(iteration.proposalHash ?? "")
    && (iteration.addressedLoss === undefined
      || iteration.driverEvidence.fabLoss?.chain.includes(iteration.addressedLoss) === true);
}

async function writeDesignRunArtifact(projectDir: string, manifest: DesignRunManifest, bestBlueprint: Blueprint): Promise<DesignRunResult["artifact"]> {
  const id = manifest.resultHash;
  const path = join(projectDir, "design-runs", manifest.program.id, id);
  const manifestPath = join(path, "manifest.json");
  const blueprintPath = join(path, "best.blueprint.json");
  if (await pathExists(manifestPath)) {
    const existingManifest = await readJson(manifestPath);
    const existingBlueprint = await readJson(blueprintPath);
    if (stableStringify(existingManifest) !== stableStringify(manifest) || hashValue(existingBlueprint) !== manifest.best.blueprintHash) {
      throw new Error(`Design run artifact '${id}' conflicts with its deterministic result`);
    }
    return { id, path, created: false };
  }
  await atomicWriteJson(blueprintPath, bestBlueprint);
  await atomicWriteJson(manifestPath, manifest);
  return { id, path, created: true };
}

function designRunPath(projectDir: string, programId: string, resultHash: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(programId)) throw new DesignRunError("design.invalid-program-id", "Design Program id must use lowercase kebab-case");
  if (!/^[0-9a-f]{64}$/.test(resultHash)) throw new DesignRunError("design.invalid-run-id", "Design run id must be a SHA-256 value");
  return join(projectDir, "design-runs", programId, resultHash);
}

function parseDesignRunManifest(value: unknown, programId: string, resultHash: string): DesignRunManifest {
  if (!value || typeof value !== "object") throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' manifest must be an object`);
  const manifest = value as DesignRunManifest;
  if (manifest.version !== 1 || manifest.status !== "completed" || manifest.program?.id !== programId || manifest.resultHash !== resultHash) {
    throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' manifest identity or completion state is invalid`);
  }
  if (!designSeedSchema.safeParse(manifest.seed?.source).success
    || !/^[0-9a-f]{64}$/.test(manifest.seed?.sourceBlueprintHash ?? "")
    || !/^[0-9a-f]{64}$/.test(manifest.seed?.blueprintHash ?? "")
    || typeof manifest.seed?.evaluation !== "object"
    || typeof manifest.promotionBase?.blueprint !== "string"
    || !/^[0-9a-f]{64}$/.test(manifest.promotionBase?.hash ?? "")
    || !Number.isInteger(manifest.best?.promotionPatchOperations)
    || manifest.best.promotionPatchOperations < 0
    || !Array.isArray(manifest.iterations)
    || manifest.iterations.some((iteration) => !validDesignRunIteration(iteration))) {
    throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' manifest seed, promotion base, or best-design evidence is invalid`);
  }
  const { resultHash: recorded, ...withoutHash } = manifest;
  if (hashValue(manifestHashInput(withoutHash)) !== recorded) throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' result hash does not match its manifest`);
  return manifest;
}

export async function loadDesignRun(projectDir: string, programId: string, resultHash: string): Promise<DesignRunResult> {
  const path = designRunPath(projectDir, programId, resultHash);
  const manifest = parseDesignRunManifest(await readJson(join(path, "manifest.json")), programId, resultHash);
  const parsedBlueprint = blueprintSchema.safeParse(await readJson(join(path, "best.blueprint.json")));
  if (!parsedBlueprint.success) throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' best Blueprint is invalid`);
  if (hashValue(parsedBlueprint.data) !== manifest.best.blueprintHash) throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' best Blueprint hash does not match its manifest`);
  return { manifest, bestBlueprint: parsedBlueprint.data, artifact: { id: resultHash, path, created: false } };
}

export async function listDesignRuns(projectDir: string, programId?: string): Promise<DesignRunSummary[]> {
  const root = join(projectDir, "design-runs");
  if (!await pathExists(root)) return [];
  const programIds = programId ? [programId] : (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name)).map((entry) => entry.name).sort();
  const summaries: DesignRunSummary[] = [];
  for (const id of programIds) {
    const programRoot = join(root, id);
    if (!await pathExists(programRoot)) continue;
    const resultIds = (await readdir(programRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[0-9a-f]{64}$/.test(entry.name)).map((entry) => entry.name).sort();
    for (const resultId of resultIds) {
      if (!await pathExists(join(programRoot, resultId, "manifest.json"))) continue;
      const run = await loadDesignRun(projectDir, id, resultId);
      summaries.push({
        id: resultId,
        path: run.artifact.path,
        program: id,
        benchmark: run.manifest.benchmark.id,
        seed: structuredClone(run.manifest.seed.source),
        promotionBase: { ...run.manifest.promotionBase },
        budget: { ...run.manifest.budget },
        best: { ...run.manifest.best },
        stopReason: run.manifest.stopReason,
      });
    }
  }
  return summaries;
}

export async function promoteDesignRun(
  projectDir: string,
  programId: string,
  resultHash: string,
  candidateId: string,
): Promise<{ candidate: CandidateChangeSet; path: string }> {
  const program = await loadDesignProgram(projectDir, programId);
  const benchmark = await loadBlueprintBenchmark(projectDir, program.benchmark);
  const run = await loadDesignRun(projectDir, programId, resultHash);
  if (!benchmark.lock || benchmark.lock.contractHash !== run.manifest.benchmark.contractHash || await designProgramHash(projectDir, program) !== run.manifest.program.hash) {
    throw new DesignRunError("design.run-stale", `Design run '${resultHash}' no longer matches its Design Program or locked Benchmark`);
  }
  if (run.manifest.engineVersion !== ENGINE_VERSION) throw new DesignRunError("design.run-stale", `Design run '${resultHash}' used ${run.manifest.engineVersion}, not ${ENGINE_VERSION}`);
  if (run.manifest.best.verdict !== "KEEP") throw new DesignRunError(
    "design.no-accepted-design",
    `Design run '${resultHash}' has no design accepted by its locked Benchmark`,
  );
  if (run.manifest.best.promotionPatchOperations === 0) throw new DesignRunError(
    "design.no-leading-candidate",
    `Design run '${resultHash}' best Blueprint equals its promotion base`,
  );
  const driverCase = benchmark.cases.find((item) => item.id === program.driverCase)!;
  const loaded = await loadFactoryProject(projectDir, {
    world: driverCase.world,
    blueprint: benchmark.candidateBlueprint,
    scenario: driverCase.scenario,
    objective: driverCase.objective,
  });
  const currentHash = hashValue(loaded.blueprint);
  if (benchmark.candidateBlueprint !== run.manifest.promotionBase.blueprint || currentHash !== run.manifest.promotionBase.hash) throw new DesignRunError(
    "design.promotion-base-stale",
    `Design run '${resultHash}' targets ${run.manifest.promotionBase.blueprint}@${run.manifest.promotionBase.hash}, but Benchmark candidate '${benchmark.candidateBlueprint}' is ${currentHash}`,
    { expectedPromotionBaseHash: run.manifest.promotionBase.hash, currentPromotionBaseHash: currentHash },
  );
  const promotableBlueprint = structuredClone(run.bestBlueprint);
  promotableBlueprint.revision = loaded.blueprint.revision;
  const patch = createBlueprintPatch(loaded.blueprint, promotableBlueprint);
  if (patch.length !== run.manifest.best.promotionPatchOperations) throw new DesignRunError(
    "design.promotion-mismatch",
    `Design run '${resultHash}' promotion patch identity no longer matches its immutable result`,
  );
  const replayed = applyResearchPatch(loaded.blueprint, patch);
  replayed.revision = currentHash;
  if (hashValue(replayed) !== run.manifest.best.blueprintHash) throw new DesignRunError(
    "design.promotion-mismatch",
    `Design run '${resultHash}' best Blueprint cannot be reproduced as one Candidate patch from the current promotion base`,
  );
  const kept = run.manifest.iterations.filter((item) => item.decision === "KEEP");
  const candidate: CandidateChangeSet = {
    version: 1,
    id: candidateId,
    name: `${program.name} leading design`,
    benchmark: program.benchmark,
    hypothesis: kept.map((item) => item.hypothesis).join(" ") || program.description,
    expectedEffect: `Reproduce Design Run ${resultHash.slice(0, 12)}: aggregate score ${run.manifest.best.candidateScore.toFixed(6)} (${run.manifest.best.scoreDelta >= 0 ? "+" : ""}${run.manifest.best.scoreDelta.toFixed(6)} versus locked baseline) across ${benchmark.cases.length} cases.`,
    source: { kind: "design-run", program: programId, resultHash, blueprintHash: run.manifest.best.blueprintHash },
    baseCandidateHash: currentHash,
    patch,
  };
  const path = await writeCandidateChangeSet(projectDir, candidate);
  return { candidate, path };
}

export async function runDesignProgram(
  projectDir: string,
  programId: string,
  options: { maxCandidates?: number; onProgress?: DesignRunProgressHandler } = {},
): Promise<DesignRunResult> {
  const prepared = await prepareDesignProgram(projectDir, programId);
  const program = prepared.manifest;
  const brief = prepared.brief;
  const maximum = options.maxCandidates ?? program.budget.maxCandidates;
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Design candidate budget must be a positive integer");
  if (maximum > program.budget.maxCandidates) throw new Error(
    `Design candidate budget ${maximum} exceeds Program '${program.id}' maximum ${program.budget.maxCandidates}`,
  );
  const benchmark = prepared.benchmark;
  let sequence = 0;
  let completedSimulations = 0;
  const plannedSimulations = benchmark.cases.length * (maximum + 2);
  const progressBase = (): DesignRunProgressBase => ({
    version: 1,
    sequence: ++sequence,
    program: program.id,
    benchmark: benchmark.id,
    budget: { maximum },
    work: { completedSimulations, plannedSimulations },
  });
  const emit = (progress: DesignRunProgressPayload) => {
    options.onProgress?.({ ...progressBase(), ...progress } as DesignRunProgress);
  };
  const benchmarkProgress = (kind: "baseline" | "seed" | "candidate", iteration: number) => (progress: BlueprintBenchmarkProgress) => {
    if (progress.phase.endsWith("completed")) completedSimulations++;
    emit({
      phase: progress.phase.endsWith("started") ? "case-started" : "case-completed",
      evaluation: { kind, id: progress.evaluationId, iteration },
      case: progress.case,
      ...(progress.baselineScore === undefined ? {} : { baselineScore: progress.baselineScore }),
      ...(progress.candidateScore === undefined ? {} : { candidateScore: progress.candidateScore }),
      ...(progress.scoreDelta === undefined ? {} : { scoreDelta: progress.scoreDelta }),
      ...(progress.candidateCapacityReady === undefined ? {} : { candidateCapacityReady: progress.candidateCapacityReady }),
    });
  };
  emit({ phase: "run-started", caseCount: benchmark.cases.length });
  const preparedBenchmark = await prepareBlueprintBenchmark(projectDir, program.benchmark, {
    evaluationId: "baseline",
    onProgress: benchmarkProgress("baseline", 0),
  });
  const driverCase = prepared.driverCase;
  let loaded = prepared.loaded;
  let bestBlueprint = structuredClone(prepared.seedBlueprint);
  const seedEvaluation = await evaluatePreparedBlueprintBenchmark(preparedBenchmark, {
    candidateBlueprint: bestBlueprint,
    evaluationId: "seed",
    onProgress: benchmarkProgress("seed", 0),
  });
  let bestEvaluation = seedEvaluation;
  const seedHash = hashValue(bestBlueprint);
  if (seedHash !== brief.seed.blueprintHash) throw new Error(`Design Program '${program.id}' resolved inconsistent seed identities`);
  const iterations: DesignRunIteration[] = [];
  const agent = program.proposal.kind === "project-strategy"
    ? new ProjectStrategyResearchAgent(projectDir, program.proposal.entry)
    : new HeuristicResearchAgent(program.proposal.decisionFamilies);
  let stopReason: DesignRunManifest["stopReason"] = "budget-exhausted";
  let bestIteration = 0;

  for (let iteration = 1; iteration <= maximum; iteration++) {
    const driverProject = compileFactoryProject(withBlueprint(loaded, bestBlueprint));
    const driverResult = runUntil(driverProject, undefined, { seed: driverCase.seed });
    const driverEvidence: DesignDriverEvidence = {
      metricsHash: hashValue(driverResult.metrics),
      fabLoss: analyzeFabLossProfile(driverResult.metrics, driverProject.scenario.durationTicks),
    };
    const history: ResearchHistoryEntry[] = iterations.map((item) => ({
      iteration: item.iteration,
      strategy: item.strategy,
      hypothesis: item.hypothesis,
      ...(item.addressedLoss ? { addressedLoss: item.addressedLoss } : {}),
      decision: item.decision === "KEEP" ? "KEEP" : "REVERT",
      score: item.candidateScore ?? item.previousBestScore,
      scoreDelta: item.scoreDeltaFromBest ?? 0,
    }));
    let proposal: ResearchProposal;
    emit({ phase: "proposal-started", iteration, driverEvidence });
    try {
      proposal = await agent.propose({
        iteration,
        project: driverProject,
        blueprint: bestBlueprint,
        metrics: driverResult.metrics,
        fabLoss: driverEvidence.fabLoss,
        production: analyzeProduction(driverProject),
        capacityPlan: planProductionCapacity(driverProject),
        history,
      });
    } catch (error) {
      if (error instanceof ProjectProposalExhaustedError
        || (error instanceof Error && error.message.startsWith("Heuristic agent found no valid blueprint strategy"))) {
        stopReason = "strategy-exhausted";
        break;
      }
      throw error;
    }
    const strategy = proposal.strategy ?? hashValue(proposal.patch);
    const family = decisionFamily(strategy, program.proposal.decisionFamilies);
    const proposalHash = hashValue({ strategy, hypothesis: proposal.hypothesis, expectedEffect: proposal.expectedEffect, addressedLoss: proposal.addressedLoss, patch: proposal.patch });
    emit({ phase: "proposal-completed", iteration, strategy, decisionFamily: family, ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}), driverEvidence, proposalHash });
    const previousBestScore = bestEvaluation.candidateScore;
    try {
      const candidateBlueprint = applyResearchPatch(bestBlueprint, proposal.patch);
      // Every accumulated best remains promotable as one exact Candidate patch from
      // the declared seed; revision lineage belongs to Candidate apply, not search order.
      candidateBlueprint.revision = brief.promotionBase.hash;
      compileFactoryProject(withBlueprint(loaded, candidateBlueprint));
      const evaluation = await evaluatePreparedBlueprintBenchmark(preparedBenchmark, {
        candidateBlueprint,
        evaluationId: `candidate-${iteration}`,
        onProgress: benchmarkProgress("candidate", iteration),
      });
      const scoreDeltaFromBest = evaluation.candidateScore - previousBestScore;
      const keep = evaluation.accepted && scoreDeltaFromBest > 1e-9;
      iterations.push({
        iteration,
        strategy,
        decisionFamily: family,
        hypothesis: proposal.hypothesis,
        ...(proposal.expectedEffect ? { expectedEffect: proposal.expectedEffect } : {}),
        ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}),
        driverEvidence,
        proposalHash,
        patch: proposal.patch,
        candidateBlueprintHash: hashValue(candidateBlueprint),
        previousBestScore,
        candidateScore: evaluation.candidateScore,
        scoreDeltaFromBest,
        decision: keep ? "KEEP" : "REJECT",
        evaluation,
      });
      if (keep) {
        bestBlueprint = candidateBlueprint;
        bestEvaluation = evaluation;
        bestIteration = iteration;
        loaded = withBlueprint(loaded, bestBlueprint);
      }
      emit({
        phase: "candidate-completed",
        iteration,
        strategy,
        decision: keep ? "KEEP" : "REJECT",
        candidateScore: evaluation.candidateScore,
        scoreDeltaFromBest,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      iterations.push({
        iteration,
        strategy,
        decisionFamily: family,
        hypothesis: proposal.hypothesis,
        ...(proposal.expectedEffect ? { expectedEffect: proposal.expectedEffect } : {}),
        ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}),
        driverEvidence,
        proposalHash,
        patch: proposal.patch,
        previousBestScore,
        decision: "REJECT",
        error: message,
      });
      emit({ phase: "candidate-completed", iteration, strategy, decision: "REJECT", error: message });
    }
  }

  const withoutHash: Omit<DesignRunManifest, "resultHash"> = {
    version: 1,
    status: "completed",
    engineVersion: ENGINE_VERSION,
    project: brief.project.id,
    program: { id: program.id, hash: brief.program.programHash },
    benchmark: { id: benchmark.id, contractHash: benchmark.lock!.contractHash },
    seed: { ...structuredClone(brief.seed), evaluation: seedEvaluation },
    promotionBase: { ...brief.promotionBase },
    driver: brief.driver,
    budget: { maximum, evaluated: iterations.length },
    iterations,
    best: {
      iteration: bestIteration,
      blueprintHash: hashValue(bestBlueprint),
      promotionPatchOperations: (() => {
        const promotable = structuredClone(bestBlueprint);
        promotable.revision = prepared.promotionBaseBlueprint.revision;
        return createBlueprintPatch(prepared.promotionBaseBlueprint, promotable).length;
      })(),
      candidateScore: bestEvaluation.candidateScore,
      scoreDelta: bestEvaluation.scoreDelta,
      verdict: bestEvaluation.verdict,
    },
    stopReason,
  };
  const manifest: DesignRunManifest = { ...withoutHash, resultHash: hashValue(manifestHashInput(withoutHash)) };
  const artifact = await writeDesignRunArtifact(brief.project.rootDir, manifest, bestBlueprint);
  emit({ phase: "run-completed", resultHash: manifest.resultHash, stopReason: manifest.stopReason, best: manifest.best });
  return { manifest, bestBlueprint, artifact };
}
