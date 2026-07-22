import { findCachedRun, writeRunArtifact } from "./artifacts";
import { evaluateBlueprintBenchmark, loadBlueprintBenchmark, type BlueprintBenchmarkResult } from "./benchmark";
import {
  applyCandidateChangeSet,
  loadCandidateChangeSet,
  previewCandidateChangeSet,
  type AppliedCandidateChangeSet,
  type CandidateChangeSetPreview,
} from "./candidate-change-set";
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import { analyzeProduction, type ProductionAnalysis } from "./production-analysis";
import { runUntil } from "./simulator";
import type { CompiledFactoryProject, FactoryMetrics, ProjectHashes } from "./types";

export type ProjectOperationId = "validate" | "analyze" | "plan" | "simulate" | "benchmark.evaluate" | "candidate.preview" | "candidate.apply";
export type ProjectOperationEffect = "read-only" | "creates-artifact" | "mutates-blueprint";

export interface ProjectOperationContext {
  project: { id: string; name: string; rootDir: string };
  selection: { world: string; blueprint: string; scenario: string; objective: string };
  hashes: ProjectHashes;
}

export interface ProjectOperationArtifact {
  kind: "run" | "blueprint";
  id: string;
  path: string;
  immutable: boolean;
}

export interface ProjectOperationVerification {
  id: string;
  description: string;
}

export interface ProjectOperationResult<T> {
  version: 1;
  operation: ProjectOperationId;
  effect: ProjectOperationEffect;
  status: "completed";
  durationMs: number;
  context: ProjectOperationContext;
  diagnostics: unknown[];
  artifacts: ProjectOperationArtifact[];
  writeSet: string[];
  verification: ProjectOperationVerification[];
  data: T;
}

export interface ProjectValidationResult {
  valid: true;
  project: string;
  blueprintHash: string;
  regions: number;
  resourceNodes: number;
  devices: number;
  connections: number;
  logisticsNetworks: number;
  logisticsRoutes: number;
}

export interface ProjectSimulationOperationData {
  cached: boolean;
  run: { id: string; path: string };
  resultHash: string;
  runKey: string;
  metrics: FactoryMetrics;
}

export interface CandidateApplyReview {
  proposalHash: string;
  currentCandidateHash: string;
  proposedCandidateHash: string;
}

function contextOf(project: CompiledFactoryProject): ProjectOperationContext {
  return {
    project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
    selection: { ...project.selection },
    hashes: { ...project.hashes },
  };
}

async function openOperationProject(projectDir: string, selection: ProjectSelection): Promise<CompiledFactoryProject> {
  return compileFactoryProject(await loadFactoryProject(projectDir, selection));
}

async function timed<T>(
  operation: ProjectOperationId,
  effect: ProjectOperationEffect,
  project: CompiledFactoryProject,
  startedAt: number,
  run: () => Promise<Omit<ProjectOperationResult<T>, "version" | "operation" | "effect" | "status" | "durationMs" | "context">> | Omit<ProjectOperationResult<T>, "version" | "operation" | "effect" | "status" | "durationMs" | "context">,
): Promise<ProjectOperationResult<T>> {
  const result = await run();
  return {
    version: 1,
    operation,
    effect,
    status: "completed",
    durationMs: Math.max(0, performance.now() - startedAt),
    context: contextOf(project),
    ...result,
  };
}

export async function validateProjectOperation(projectDir: string, selection: ProjectSelection = {}): Promise<ProjectOperationResult<ProjectValidationResult>> {
  const startedAt = performance.now();
  const project = await openOperationProject(projectDir, selection);
  return timed("validate", "read-only", project, startedAt, () => ({
    diagnostics: [], artifacts: [], writeSet: [],
    verification: [{ id: "analyze", description: "Inspect nominal production and industrial diagnostics for this exact selection." }],
    data: {
      valid: true,
      project: project.manifest.name,
      blueprintHash: project.hashes.blueprintHash,
      regions: Object.keys(project.regions).length,
      resourceNodes: Object.keys(project.resourceNodes).length,
      devices: Object.keys(project.devices).length,
      connections: Object.keys(project.connections).length,
      logisticsNetworks: Object.keys(project.logisticsNetworks).length,
      logisticsRoutes: Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.routes.length, 0),
    },
  }));
}

export async function analyzeProjectOperation(projectDir: string, selection: ProjectSelection = {}): Promise<ProjectOperationResult<ProductionAnalysis>> {
  const startedAt = performance.now();
  const project = await openOperationProject(projectDir, selection);
  return timed("analyze", "read-only", project, startedAt, () => {
    const analysis = analyzeProduction(project);
    return {
      diagnostics: analysis.diagnostics, artifacts: [], writeSet: [], data: analysis,
      verification: [{ id: "plan", description: "Size installed capacity against the selected Objective and Scenario." }],
    };
  });
}

export async function planProjectOperation(projectDir: string, selection: ProjectSelection = {}): Promise<ProjectOperationResult<ProductionCapacityPlan>> {
  const startedAt = performance.now();
  const project = await openOperationProject(projectDir, selection);
  return timed("plan", "read-only", project, startedAt, () => {
    const plan = planProductionCapacity(project);
    return {
      diagnostics: plan.gaps, artifacts: [], writeSet: [], data: plan,
      verification: [{ id: "simulate", description: "Measure this exact selection in the deterministic simulator." }],
    };
  });
}

export async function simulateProjectOperation(
  projectDir: string,
  selection: ProjectSelection = {},
  options: { seed?: number; untilTick?: number; maxEvents?: number } = {},
): Promise<ProjectOperationResult<ProjectSimulationOperationData>> {
  const startedAt = performance.now();
  const project = await openOperationProject(projectDir, selection);
  return timed("simulate", "creates-artifact", project, startedAt, async () => {
    const seed = options.seed ?? 0;
    const result = runUntil(project, undefined, {
      seed,
      ...(options.untilTick === undefined ? {} : { untilTick: options.untilTick }),
      ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }),
    });
    const cached = await findCachedRun(project.rootDir, result.runKey);
    const run = cached ?? await writeRunArtifact(project, result, { label: "simulate", seed, decision: "BASELINE" });
    return {
      diagnostics: [],
      artifacts: [{ kind: "run", id: run.name, path: run.path, immutable: true }],
      writeSet: cached ? [] : [`runs/${run.name}/`],
      verification: [{ id: "runs", description: "Open the immutable run and verify its result hash and measured evidence." }],
      data: { cached: Boolean(cached), run: { id: run.name, path: run.path }, resultHash: result.resultHash, runKey: result.runKey, metrics: result.metrics },
    };
  });
}

async function benchmarkProject(projectDir: string, benchmarkId: string, candidate = false): Promise<CompiledFactoryProject> {
  const benchmark = await loadBlueprintBenchmark(projectDir, benchmarkId);
  const firstCase = benchmark.cases[0]!;
  return openOperationProject(projectDir, {
    world: firstCase.world,
    blueprint: candidate ? benchmark.candidateBlueprint : benchmark.baselineBlueprint,
    scenario: firstCase.scenario,
    objective: firstCase.objective,
  });
}

export async function evaluateBenchmarkOperation(projectDir: string, benchmarkId: string): Promise<ProjectOperationResult<BlueprintBenchmarkResult>> {
  const startedAt = performance.now();
  const project = await benchmarkProject(projectDir, benchmarkId);
  return timed("benchmark.evaluate", "read-only", project, startedAt, async () => ({
    diagnostics: [], artifacts: [], writeSet: [], data: await evaluateBlueprintBenchmark(projectDir, benchmarkId),
    verification: [{ id: "candidate.preview", description: "Preview an exact Candidate Change Set against this locked Benchmark." }],
  }));
}

async function candidateProject(projectDir: string, candidateId: string): Promise<CompiledFactoryProject> {
  const candidate = await loadCandidateChangeSet(projectDir, candidateId);
  return benchmarkProject(projectDir, candidate.benchmark, true);
}

export async function previewCandidateOperation(projectDir: string, candidateId: string): Promise<ProjectOperationResult<CandidateChangeSetPreview>> {
  const startedAt = performance.now();
  const project = await candidateProject(projectDir, candidateId);
  return timed("candidate.preview", "read-only", project, startedAt, async () => ({
    diagnostics: [], artifacts: [], writeSet: [], data: await previewCandidateChangeSet(projectDir, candidateId),
    verification: [{ id: "candidate.apply", description: "Apply only after reviewing a KEEP verdict and all three pinned hashes." }],
  }));
}

export async function applyCandidateOperation(projectDir: string, candidateId: string, reviewed: CandidateApplyReview): Promise<ProjectOperationResult<AppliedCandidateChangeSet>> {
  const startedAt = performance.now();
  const project = await candidateProject(projectDir, candidateId);
  return timed("candidate.apply", "mutates-blueprint", project, startedAt, async () => {
    const applied = await applyCandidateChangeSet(projectDir, candidateId, reviewed);
    return {
      diagnostics: [],
      artifacts: [{ kind: "blueprint", id: project.selection.blueprint, path: applied.blueprintPath, immutable: false }],
      writeSet: [applied.blueprintPath],
      data: applied,
      verification: [
        { id: "candidate.preview", description: "Re-preview the proposal; the consumed base hash must now be stale." },
        { id: "benchmark.evaluate", description: "Re-evaluate the locked Benchmark from the updated project files." },
      ],
    };
  });
}
