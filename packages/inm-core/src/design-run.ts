import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Blueprint } from "./types";
import type { BlueprintBenchmarkResult } from "./benchmark";
import { evaluateBlueprintBenchmark, loadBlueprintBenchmark } from "./benchmark";
import { createBlueprintPatch } from "./blueprint-comparison";
import { writeCandidateChangeSet, type CandidateChangeSet } from "./candidate-change-set";
import { compileFactoryProject } from "./compiler";
import {
  buildDesignProgramBrief,
  loadDesignProgram,
  type DesignDecisionFamily,
  type DesignProgramBrief,
} from "./design-program";
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

export interface DesignRunIteration {
  iteration: number;
  strategy: string;
  decisionFamily: DesignDecisionFamily;
  hypothesis: string;
  expectedEffect?: string;
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
  seed: { blueprint: string; hash: string; evaluation: BlueprintBenchmarkResult };
  driver: DesignProgramBrief["driver"];
  budget: { maximum: number; evaluated: number };
  iterations: DesignRunIteration[];
  best: {
    iteration: number;
    blueprintHash: string;
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

export interface DesignRunSummary {
  id: string;
  path: string;
  program: string;
  benchmark: string;
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
  if (!benchmark.lock || benchmark.lock.contractHash !== run.manifest.benchmark.contractHash || hashValue(program) !== run.manifest.program.hash) {
    throw new DesignRunError("design.run-stale", `Design run '${resultHash}' no longer matches its Design Program or locked Benchmark`);
  }
  if (run.manifest.engineVersion !== ENGINE_VERSION) throw new DesignRunError("design.run-stale", `Design run '${resultHash}' used ${run.manifest.engineVersion}, not ${ENGINE_VERSION}`);
  if (run.manifest.best.iteration === 0) throw new DesignRunError("design.no-leading-candidate", `Design run '${resultHash}' did not keep a proposal beyond its seed`);
  const driverCase = benchmark.cases.find((item) => item.id === program.driverCase)!;
  const loaded = await loadFactoryProject(projectDir, {
    world: driverCase.world,
    blueprint: program.seedBlueprint,
    scenario: driverCase.scenario,
    objective: driverCase.objective,
  });
  const currentHash = hashValue(loaded.blueprint);
  if (currentHash !== run.manifest.seed.hash) throw new DesignRunError(
    "design.seed-stale",
    `Design run '${resultHash}' targets seed ${run.manifest.seed.hash}, but Blueprint '${program.seedBlueprint}' is ${currentHash}`,
    { expectedSeedHash: run.manifest.seed.hash, currentSeedHash: currentHash },
  );
  const promotableBlueprint = structuredClone(run.bestBlueprint);
  promotableBlueprint.revision = loaded.blueprint.revision;
  const patch = createBlueprintPatch(loaded.blueprint, promotableBlueprint);
  if (!patch.length) throw new DesignRunError("design.no-leading-candidate", `Design run '${resultHash}' best Blueprint equals its seed`);
  const replayed = applyResearchPatch(loaded.blueprint, patch);
  replayed.revision = currentHash;
  if (hashValue(replayed) !== run.manifest.best.blueprintHash) throw new DesignRunError(
    "design.promotion-mismatch",
    `Design run '${resultHash}' best Blueprint cannot be reproduced as one Candidate patch from the current seed`,
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
  options: { maxCandidates?: number } = {},
): Promise<DesignRunResult> {
  const program = await loadDesignProgram(projectDir, programId);
  const brief = await buildDesignProgramBrief(projectDir, programId);
  const benchmark = await loadBlueprintBenchmark(projectDir, program.benchmark);
  const maximum = options.maxCandidates ?? program.budget.maxCandidates;
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Design candidate budget must be a positive integer");
  if (maximum > program.budget.maxCandidates) throw new Error(
    `Design candidate budget ${maximum} exceeds Program '${program.id}' maximum ${program.budget.maxCandidates}`,
  );
  const driverCase = benchmark.cases.find((item) => item.id === program.driverCase)!;
  let loaded = await loadFactoryProject(projectDir, {
    world: driverCase.world,
    blueprint: program.seedBlueprint,
    scenario: driverCase.scenario,
    objective: driverCase.objective,
  });
  let bestBlueprint = structuredClone(loaded.blueprint);
  const seedEvaluation = await evaluateBlueprintBenchmark(projectDir, program.benchmark, { candidateBlueprint: bestBlueprint });
  let bestEvaluation = seedEvaluation;
  const seedHash = hashValue(bestBlueprint);
  const iterations: DesignRunIteration[] = [];
  const agent = new HeuristicResearchAgent(program.proposal.decisionFamilies);
  let stopReason: DesignRunManifest["stopReason"] = "budget-exhausted";
  let bestIteration = 0;

  for (let iteration = 1; iteration <= maximum; iteration++) {
    const driverProject = compileFactoryProject(withBlueprint(loaded, bestBlueprint));
    const driverResult = runUntil(driverProject, undefined, { seed: driverCase.seed });
    const history: ResearchHistoryEntry[] = iterations.map((item) => ({
      iteration: item.iteration,
      strategy: item.strategy,
      hypothesis: item.hypothesis,
      decision: item.decision === "KEEP" ? "KEEP" : "REVERT",
      score: item.candidateScore ?? item.previousBestScore,
      scoreDelta: item.scoreDeltaFromBest ?? 0,
    }));
    let proposal: ResearchProposal;
    try {
      proposal = await agent.propose({
        iteration,
        project: driverProject,
        blueprint: bestBlueprint,
        metrics: driverResult.metrics,
        production: analyzeProduction(driverProject),
        capacityPlan: planProductionCapacity(driverProject),
        history,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Heuristic agent found no valid blueprint strategy")) {
        stopReason = "strategy-exhausted";
        break;
      }
      throw error;
    }
    const strategy = proposal.strategy ?? hashValue(proposal.patch);
    const family = decisionFamily(strategy, program.proposal.decisionFamilies);
    const proposalHash = hashValue({ strategy, hypothesis: proposal.hypothesis, expectedEffect: proposal.expectedEffect, patch: proposal.patch });
    const previousBestScore = bestEvaluation.candidateScore;
    try {
      const candidateBlueprint = applyResearchPatch(bestBlueprint, proposal.patch);
      // Every accumulated best remains promotable as one exact Candidate patch from
      // the declared seed; revision lineage belongs to Candidate apply, not search order.
      candidateBlueprint.revision = seedHash;
      compileFactoryProject(withBlueprint(loaded, candidateBlueprint));
      const evaluation = await evaluateBlueprintBenchmark(projectDir, program.benchmark, { candidateBlueprint });
      const scoreDeltaFromBest = evaluation.candidateScore - previousBestScore;
      const keep = evaluation.accepted && scoreDeltaFromBest > 1e-9;
      iterations.push({
        iteration,
        strategy,
        decisionFamily: family,
        hypothesis: proposal.hypothesis,
        ...(proposal.expectedEffect ? { expectedEffect: proposal.expectedEffect } : {}),
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
    } catch (error) {
      iterations.push({
        iteration,
        strategy,
        decisionFamily: family,
        hypothesis: proposal.hypothesis,
        ...(proposal.expectedEffect ? { expectedEffect: proposal.expectedEffect } : {}),
        proposalHash,
        patch: proposal.patch,
        previousBestScore,
        decision: "REJECT",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const withoutHash: Omit<DesignRunManifest, "resultHash"> = {
    version: 1,
    status: "completed",
    engineVersion: ENGINE_VERSION,
    project: brief.project.id,
    program: { id: program.id, hash: brief.program.programHash },
    benchmark: { id: benchmark.id, contractHash: benchmark.lock!.contractHash },
    seed: { blueprint: program.seedBlueprint, hash: seedHash, evaluation: seedEvaluation },
    driver: brief.driver,
    budget: { maximum, evaluated: iterations.length },
    iterations,
    best: {
      iteration: bestIteration,
      blueprintHash: hashValue(bestBlueprint),
      candidateScore: bestEvaluation.candidateScore,
      scoreDelta: bestEvaluation.scoreDelta,
      verdict: bestEvaluation.verdict,
    },
    stopReason,
  };
  const manifest: DesignRunManifest = { ...withoutHash, resultHash: hashValue(manifestHashInput(withoutHash)) };
  const artifact = await writeDesignRunArtifact(brief.project.rootDir, manifest, bestBlueprint);
  return { manifest, bestBlueprint, artifact };
}
