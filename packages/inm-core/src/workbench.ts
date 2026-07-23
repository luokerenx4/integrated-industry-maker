import { join } from "node:path";
import { listRuns } from "./artifacts";
import { listBlueprintBenchmarks, type BlueprintBenchmarkSummary } from "./benchmark";
import { listCandidateChangeSets } from "./candidate-change-set";
import { inspectCandidateDecision, type CandidateDecisionState } from "./candidate-review";
import { analyzeFabLosses, type FabLossAttribution } from "./fab-loss-analysis";
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import { analyzeProduction, type ProductionAnalysis, type ProductionDiagnostic } from "./production-analysis";
import type { CompiledFactoryProject, FactoryMetrics, ProjectHashes } from "./types";
import { ENGINE_VERSION, hashValue, readJson, stableStringify } from "./utils";

export type WorkbenchDiagnosticSeverity = "blocking" | "warning" | "info";
export type WorkbenchSubjectKind =
  | "project"
  | "region"
  | "resource"
  | "process"
  | "device"
  | "connection"
  | "network"
  | "route"
  | "capacity-gap";

export interface WorkbenchSubjectReference {
  kind: WorkbenchSubjectKind;
  id: string;
}

export interface WorkbenchDiagnostic {
  id: string;
  code: string;
  severity: WorkbenchDiagnosticSeverity;
  priority: number;
  subjects: WorkbenchSubjectReference[];
  message: string;
  evidence: {
    source: "capacity-plan" | "production-analysis" | "compatible-run";
    summary: string;
    runId?: string;
  };
  actionIds: WorkbenchOperationDescriptor["id"][];
}

export type WorkbenchOperationEffect = "read-only" | "creates-artifact" | "mutates-blueprint";

export interface WorkbenchOperationDescriptor {
  id: "validate" | "inspect" | "analyze" | "plan" | "simulate" | "synthesize" | "benchmark.evaluate" | "candidate.preview" | "candidate.apply";
  label: string;
  description: string;
  effect: WorkbenchOperationEffect;
  selectionAware: boolean;
  requiresConfirmation: boolean;
  writeSet: string[];
  guards: string[];
  availability: {
    state: "available" | "conditional" | "unavailable";
    reasons: string[];
  };
}

export type WorkbenchNextActionTarget =
  | { kind: "diagnostic"; diagnosticId: string }
  | { kind: "candidate"; benchmarkId: string; candidateId: string; phase: CandidateDecisionState }
  | { kind: "operation"; operationId: "analyze" | "simulate" }
  | { kind: "run"; runId: string };

export interface WorkbenchNextAction {
  id: string;
  tone: "blocking" | "review" | "evidence" | "attention" | "ready";
  title: string;
  reason: string;
  actionLabel: string;
  effect: "read-only" | "creates-artifact" | "mutates-project";
  requiresConfirmation: boolean;
  argv: string[];
  studioRoute: string;
  target: WorkbenchNextActionTarget;
}

export interface ProjectWorkbenchSnapshot {
  version: 3;
  project: {
    id: string;
    name: string;
    rootDir: string;
  };
  selection: {
    world: { id: string; name: string };
    blueprint: { id: string; name: string };
    scenario: { id: string; name: string; durationTicks: number };
    objective: { id: string; name: string };
  };
  hashes: ProjectHashes;
  objective: {
    targetResource: string;
    targetRegion: string;
    targetRatePerMinute: number;
    deliveryContracts: Array<{
      id: string;
      resource: string;
      region: string;
      demandPerMinute: number;
    }>;
  };
  status: {
    capacity: {
      state: "ready" | "blocked";
      gapCount: number;
      gapsByKind: Partial<Record<ProductionCapacityPlan["gaps"][number]["kind"], number>>;
    };
    flow: { state: "clear" | "at-risk"; warningCount: number; infoCount: number };
    evidence: { state: "current" | "missing" | "incompatible"; runId: string | null };
    review: { state: "clear" | "pending" | "stale"; pendingCount: number; staleCount: number; verifiedCount: number };
  };
  counts: {
    regions: number;
    resourceNodes: number;
    resourceAssets: number;
    processes: number;
    routes: number;
    deviceAssets: number;
    deviceInstances: number;
    connections: number;
    transportCells: number;
    logisticsNetworks: number;
    logisticsRoutes: number;
    powerGrids: number;
    runs: number;
    experiments: number;
    candidates: number;
  };
  catalog: {
    resources: Array<{ id: string; name: string; unit: { kind: "discrete" | "continuous"; symbol: string; precision: number }; tags: string[] }>;
    processes: Array<{ id: string; name: string; category: string; tags: string[] }>;
    routes: Array<{ id: string; name: string; family: string; tags: string[] }>;
    devices: Array<{ id: string; name: string; tags: string[]; capabilities: string[] }>;
  };
  runs: Array<{
    id: string;
    score: number;
    decision: "BASELINE" | "KEEP" | "REVERT";
    resultHash: string;
    engineVersion: string;
    compatible: boolean;
    selection: { world: string; blueprint: string; scenario: string; objective: string };
  }>;
  experiments: BlueprintBenchmarkSummary[];
  candidates: Array<{
    id: string;
    name: string;
    benchmark: string;
    hypothesis: string;
    expectedEffect?: string;
    baseCandidateHash: string;
    patchOperations: number;
    decision: {
      state: CandidateDecisionState;
      proposalHash: string;
      currentCandidateHash: string;
      proposedCandidateHash?: string;
      verdict?: "KEEP" | "DISCARD" | "UNCHANGED";
      resultHash?: string;
    };
  }>;
  diagnostics: WorkbenchDiagnostic[];
  lossAttribution: FabLossAttribution | null;
  operations: WorkbenchOperationDescriptor[];
  nextAction: WorkbenchNextAction;
}

function uniqueSubjects(subjects: WorkbenchSubjectReference[]): WorkbenchSubjectReference[] {
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    const key = `${subject.kind}:${subject.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function analysisSubjects(projectId: string, diagnostic: ProductionDiagnostic): WorkbenchSubjectReference[] {
  const subjects = uniqueSubjects([
    ...(diagnostic.device ? [{ kind: "device" as const, id: diagnostic.device }] : []),
    ...(diagnostic.connection ? [{ kind: "connection" as const, id: diagnostic.connection }] : []),
    ...(diagnostic.network ? [{ kind: "network" as const, id: diagnostic.network }] : []),
    ...(diagnostic.resource ? [{ kind: "resource" as const, id: diagnostic.resource }] : []),
  ]);
  return subjects.length ? subjects : [{ kind: "project", id: projectId }];
}

function capacitySubject(gap: ProductionCapacityPlan["gaps"][number]): WorkbenchSubjectReference {
  if (gap.kind === "process" || gap.kind === "treatment") return { kind: "process", id: gap.entity };
  if (gap.kind === "extraction" || gap.kind === "reserve") return { kind: "resource", id: gap.entity };
  if (gap.kind === "station") return { kind: "network", id: gap.entity };
  if (gap.kind === "power") return { kind: "region", id: gap.entity };
  return { kind: "capacity-gap", id: gap.entity };
}

function diagnosticId(code: string, subjects: WorkbenchSubjectReference[], summary: string): string {
  const subjectKey = subjects.map((subject) => `${subject.kind}:${subject.id}`).join("+");
  return `${code}:${subjectKey}:${hashValue(summary).slice(0, 10)}`;
}

function projectDiagnostics(project: CompiledFactoryProject, analysis: ProductionAnalysis, capacity: ProductionCapacityPlan, lossAttribution: FabLossAttribution | null): WorkbenchDiagnostic[] {
  const blocking = capacity.gaps.map((gap): WorkbenchDiagnostic => {
    const subjects = [capacitySubject(gap)];
    const code = `capacity.${gap.kind}`;
    return {
      id: diagnosticId(code, subjects, gap.message),
      code,
      severity: "blocking",
      priority: 100,
      subjects,
      message: gap.message,
      evidence: { source: "capacity-plan", summary: gap.message },
      actionIds: ["plan", "analyze"],
    };
  });
  const advisory = analysis.diagnostics.map((diagnostic): WorkbenchDiagnostic => {
    const subjects = analysisSubjects(project.manifest.id, diagnostic);
    const code = `analysis.${diagnostic.code}`;
    return {
      id: diagnosticId(code, subjects, diagnostic.message),
      code,
      severity: diagnostic.severity,
      priority: diagnostic.severity === "warning" ? 60 : 20,
      subjects,
      message: diagnostic.message,
      evidence: { source: "production-analysis", summary: diagnostic.message },
      actionIds: diagnostic.severity === "warning" ? ["analyze", "plan"] : ["analyze"],
    };
  });
  const realized = (lossAttribution?.buckets ?? []).slice(0, 5).map((bucket, index): WorkbenchDiagnostic => {
    const subjects = bucket.subjects.length ? bucket.subjects.map((subject) => subject.kind === "project"
      ? { kind: "project" as const, id: project.manifest.id }
      : { ...subject }) : [{ kind: "project" as const, id: project.manifest.id }];
    const code = `fab-loss.${bucket.id}`;
    const message = `${bucket.label} is ranked ${index + 1} in compatible run ${lossAttribution!.run.id} (signal ${bucket.score.toFixed(4)}). ${bucket.summary}`;
    return {
      id: diagnosticId(code, subjects, message),
      code,
      severity: bucket.score >= 0.01 ? "warning" : "info",
      priority: 90 - index,
      subjects,
      message,
      evidence: { source: "compatible-run", summary: bucket.summary, runId: lossAttribution!.run.id },
      actionIds: ["simulate", "analyze"],
    };
  });
  return [...blocking, ...realized, ...advisory].sort((left, right) =>
    right.priority - left.priority
    || left.code.localeCompare(right.code)
    || left.id.localeCompare(right.id));
}

function unavailableWhen(condition: boolean, reason: string): WorkbenchOperationDescriptor["availability"] {
  return condition ? { state: "available", reasons: [] } : { state: "unavailable", reasons: [reason] };
}

function conditionalWhen(condition: boolean, conditionSummary: string, unavailableReason: string): WorkbenchOperationDescriptor["availability"] {
  return condition ? { state: "conditional", reasons: [conditionSummary] } : { state: "unavailable", reasons: [unavailableReason] };
}

function operationDescriptors(experiments: BlueprintBenchmarkSummary[], candidates: ProjectWorkbenchSnapshot["candidates"]): WorkbenchOperationDescriptor[] {
  const lockedExperiments = experiments.filter((experiment) => experiment.locked).length;
  const reviewable = candidates.some((candidate) => candidate.decision.state === "proposed" || candidate.decision.state.startsWith("reviewed-"));
  const applicable = candidates.some((candidate) => candidate.decision.state === "reviewed-keep");
  return [
    {
      id: "validate", label: "Validate project", description: "Parse, resolve, and compile the selected industrial project.",
      effect: "read-only", selectionAware: true, requiresConfirmation: false, writeSet: [], guards: [], availability: { state: "available", reasons: [] },
    },
    {
      id: "inspect", label: "Inspect project", description: "Read this shared project workbench snapshot.",
      effect: "read-only", selectionAware: true, requiresConfirmation: false, writeSet: [], guards: [], availability: { state: "available", reasons: [] },
    },
    {
      id: "analyze", label: "Analyze production", description: "Inspect nominal production, contracts, logistics, and power diagnostics.",
      effect: "read-only", selectionAware: true, requiresConfirmation: false, writeSet: [], guards: [], availability: { state: "available", reasons: [] },
    },
    {
      id: "plan", label: "Plan target capacity", description: "Size the selected Blueprint against its Objective and Scenario envelope.",
      effect: "read-only", selectionAware: true, requiresConfirmation: false, writeSet: [], guards: [], availability: { state: "available", reasons: [] },
    },
    {
      id: "simulate", label: "Simulate selected Blueprint", description: "Run deterministic simulation and write one immutable run artifact.",
      effect: "creates-artifact", selectionAware: true, requiresConfirmation: false, writeSet: ["runs/<generated>/"], guards: ["immutable-run-directory"], availability: { state: "available", reasons: [] },
    },
    {
      id: "synthesize", label: "Synthesize Blueprint", description: "Generate a new Blueprint id from project-local assets and the selected Objective.",
      effect: "creates-artifact", selectionAware: true, requiresConfirmation: false, writeSet: ["blueprints/<output>.blueprint.json"], guards: ["new-output-id"], availability: { state: "available", reasons: [] },
    },
    {
      id: "benchmark.evaluate", label: "Evaluate Benchmark", description: "Evaluate a candidate Blueprint against a locked multi-case Benchmark without writing project state.",
      effect: "read-only", selectionAware: false, requiresConfirmation: false, writeSet: [], guards: ["locked-benchmark"],
      availability: unavailableWhen(lockedExperiments > 0, "No locked Blueprint Benchmark is available."),
    },
    {
      id: "candidate.preview", label: "Review Candidate Change Set", description: "Evaluate an exact project-local Blueprint patch and record immutable review evidence.",
      effect: "creates-artifact", selectionAware: false, requiresConfirmation: false, writeSet: ["candidate-reviews/<candidate>/<proposal-hash>.review.json"], guards: ["base-candidate-hash", "locked-benchmark", "deterministic-review-receipt"],
      availability: conditionalWhen(reviewable, "Select a current Candidate whose base hash and Benchmark lock still match.", "No current Candidate Change Set is available for review."),
    },
    {
      id: "candidate.apply", label: "Apply Candidate Change Set", description: "Re-evaluate and atomically apply one reviewed KEEP proposal.",
      effect: "mutates-blueprint", selectionAware: false, requiresConfirmation: true, writeSet: ["blueprints/<benchmark-candidate>.blueprint.json"],
      guards: ["immutable-review-receipt", "reviewed-proposal-hash", "base-candidate-hash", "proposed-candidate-hash", "keep-verdict", "post-write-hash"],
      availability: conditionalWhen(applicable, "A recorded KEEP review with matching proposal, base, and proposed hashes is ready for confirmation.", "No Candidate has a current recorded KEEP review."),
    },
  ];
}

function matchingRun(
  selection: ProjectWorkbenchSnapshot["selection"],
  runs: ProjectWorkbenchSnapshot["runs"],
): ProjectWorkbenchSnapshot["runs"][number] | undefined {
  return runs.filter((run) => run.selection.world === selection.world.id
    && run.selection.blueprint === selection.blueprint.id
    && run.selection.scenario === selection.scenario.id
    && run.selection.objective === selection.objective.id).at(-1);
}

function selectionArgv(selection: ProjectWorkbenchSnapshot["selection"]): string[] {
  return [
    "--world", selection.world.id,
    "--blueprint", selection.blueprint.id,
    "--scenario", selection.scenario.id,
    "--objective", selection.objective.id,
  ];
}

function buildNextAction(context: Pick<ProjectWorkbenchSnapshot, "project" | "selection" | "diagnostics" | "candidates" | "runs" | "operations">): WorkbenchNextAction {
  const projectRoute = `/${encodeURIComponent(context.project.id)}`;
  const blocking = context.diagnostics.find((diagnostic) => diagnostic.severity === "blocking");
  if (blocking) return {
    id: `diagnostic:${blocking.id}`,
    tone: "blocking",
    title: "Resolve the first capacity blocker",
    reason: blocking.message,
    actionLabel: "INSPECT BLOCKER",
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "plan", context.project.rootDir, ...selectionArgv(context.selection), "--section", "gaps", "--json"],
    studioRoute: `${projectRoute}/analysis/diagnostics/${encodeURIComponent(blocking.id)}`,
    target: { kind: "diagnostic", diagnosticId: blocking.id },
  };

  const candidate = context.candidates.find((item) => item.decision.state === "reviewed-keep")
    ?? context.candidates.find((item) => item.decision.state === "proposed");
  if (candidate) {
    const route = `${projectRoute}/experiments/${encodeURIComponent(candidate.benchmark)}/candidates/${encodeURIComponent(candidate.id)}`;
    const target = { kind: "candidate" as const, benchmarkId: candidate.benchmark, candidateId: candidate.id, phase: candidate.decision.state };
    if (candidate.decision.state === "proposed") return {
      id: `candidate.review:${candidate.id}`,
      tone: "review",
      title: `Review ${candidate.name}`,
      reason: candidate.expectedEffect ?? candidate.hypothesis,
      actionLabel: "REVIEW PROPOSAL",
      effect: "creates-artifact",
      requiresConfirmation: false,
      argv: ["inm", "candidate", context.project.rootDir, "--candidate", candidate.id, "--json"],
      studioRoute: route,
      target,
    };
    if (candidate.decision.state === "reviewed-keep") return {
      id: `candidate.apply:${candidate.id}`,
      tone: "review",
      title: `Apply reviewed ${candidate.name}`,
      reason: "The immutable review recorded KEEP; application will re-evaluate every guard and verify the exact proposed Blueprint hash.",
      actionLabel: "APPLY REVIEWED CHANGE",
      effect: "mutates-project",
      requiresConfirmation: true,
      argv: ["inm", "candidate", context.project.rootDir, "--candidate", candidate.id, "--apply", "--json"],
      studioRoute: route,
      target,
    };
  }

  const run = matchingRun(context.selection, context.runs);
  const simulation = context.operations.find((operation) => operation.id === "simulate");
  if ((!run || !run.compatible) && simulation?.availability.state === "available") return {
    id: "operation:simulate",
    tone: "evidence",
    title: run ? "Refresh incompatible run evidence" : "Measure the current selection",
    reason: run
      ? `The latest matching run used ${run.engineVersion}; create evidence with ${context.selection.blueprint.id} and the current engine.`
      : `No immutable run matches ${context.selection.blueprint.id} / ${context.selection.scenario.id} / ${context.selection.objective.id}.`,
    actionLabel: "RUN SIMULATION",
    effect: "creates-artifact",
    requiresConfirmation: false,
    argv: ["inm", "simulate", context.project.rootDir, ...selectionArgv(context.selection), "--json"],
    studioRoute: projectRoute,
    target: { kind: "operation", operationId: "simulate" },
  };

  const warning = context.diagnostics.find((diagnostic) => diagnostic.severity === "warning");
  if (warning) return {
    id: `diagnostic:${warning.id}`,
    tone: "attention",
    title: "Inspect the highest-priority flow risk",
    reason: warning.message,
    actionLabel: "FOLLOW EVIDENCE",
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "analyze", context.project.rootDir, ...selectionArgv(context.selection), "--section", "diagnostics", "--json"],
    studioRoute: `${projectRoute}/analysis/diagnostics/${encodeURIComponent(warning.id)}`,
    target: { kind: "diagnostic", diagnosticId: warning.id },
  };

  if (run) return {
    id: `run:${run.id}`,
    tone: "ready",
    title: "Inspect the latest matching evidence",
    reason: `${run.id} measured ${context.selection.blueprint.id} with score ${run.score.toFixed(3)} and a ${run.decision} decision.`,
    actionLabel: "OPEN RUN",
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "runs", context.project.rootDir, "--json"],
    studioRoute: `${projectRoute}/runs`,
    target: { kind: "run", runId: run.id },
  };

  return {
    id: "operation:analyze",
    tone: "evidence",
    title: "Establish the nominal industrial picture",
    reason: "Run shared Core analysis for the effective project selection before making a design decision.",
    actionLabel: "RUN ANALYSIS",
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "analyze", context.project.rootDir, ...selectionArgv(context.selection), "--json"],
    studioRoute: projectRoute,
    target: { kind: "operation", operationId: "analyze" },
  };
}

export async function buildProjectWorkbenchSnapshot(project: CompiledFactoryProject): Promise<ProjectWorkbenchSnapshot> {
  const analysis = analyzeProduction(project);
  const capacity = planProductionCapacity(project);
  const [runs, experiments, candidates] = await Promise.all([
    listRuns(project.rootDir),
    listBlueprintBenchmarks(project.rootDir),
    listCandidateChangeSets(project.rootDir),
  ]);
  const decisions = await Promise.all(candidates.map((candidate) => inspectCandidateDecision(project.rootDir, candidate.id)));
  const gapsByKind: ProjectWorkbenchSnapshot["status"]["capacity"]["gapsByKind"] = {};
  for (const gap of capacity.gaps) gapsByKind[gap.kind] = (gapsByKind[gap.kind] ?? 0) + 1;
  const deliveryContracts = project.objective.deliveryContracts?.map((contract) => ({
    id: contract.id, resource: contract.resource, region: contract.region, demandPerMinute: contract.demandPerMinute,
  })) ?? [{
    id: "primary", resource: project.objective.targetResource, region: project.objective.targetRegion,
    demandPerMinute: project.objective.targetRatePerMinute,
  }];
  const logisticsRoutes = Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.routes.length, 0);
  const selection: ProjectWorkbenchSnapshot["selection"] = {
      world: { id: project.selection.world, name: project.world.name },
      blueprint: { id: project.selection.blueprint, name: project.selection.blueprint },
      scenario: { id: project.selection.scenario, name: project.scenario.name, durationTicks: project.scenario.durationTicks },
      objective: { id: project.selection.objective, name: project.objective.name },
  };
  const runSummaries: ProjectWorkbenchSnapshot["runs"] = runs.map((run) => ({
    id: run.name,
    score: run.score,
    decision: run.manifest.decision,
    resultHash: run.manifest.resultHash,
    engineVersion: run.manifest.engineVersion,
    compatible: run.manifest.engineVersion === ENGINE_VERSION && stableStringify(run.manifest.hashes) === stableStringify(project.hashes),
    selection: { ...run.manifest.selection },
  }));
  const candidateSummaries: ProjectWorkbenchSnapshot["candidates"] = candidates.map((candidate, index) => {
    const decision = decisions[index]!;
    return {
      id: candidate.id,
      name: candidate.name,
      benchmark: candidate.benchmark,
      hypothesis: candidate.hypothesis,
      ...(candidate.expectedEffect ? { expectedEffect: candidate.expectedEffect } : {}),
      baseCandidateHash: candidate.baseCandidateHash,
      patchOperations: candidate.patch.length,
      decision: {
        state: decision.state,
        proposalHash: decision.proposalHash,
        currentCandidateHash: decision.currentCandidateHash,
        ...(decision.proposedCandidateHash ? { proposedCandidateHash: decision.proposedCandidateHash } : {}),
        ...(decision.verdict ? { verdict: decision.verdict } : {}),
        ...(decision.resultHash ? { resultHash: decision.resultHash } : {}),
      },
    };
  });
  const currentRun = matchingRun(selection, runSummaries);
  const currentArtifact = currentRun?.compatible ? runs.find((run) => run.name === currentRun.id) : undefined;
  const lossAttribution = currentArtifact && Object.keys(project.routes).length
    ? analyzeFabLosses(await readJson(join(currentArtifact.path, "metrics.json")) as FactoryMetrics, project.scenario.durationTicks, { id: currentArtifact.name, resultHash: currentArtifact.manifest.resultHash }, project)
    : null;
  const diagnostics = projectDiagnostics(project, analysis, capacity, lossAttribution);
  const operations = operationDescriptors(experiments, candidateSummaries);
  const flowWarnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const flowInfo = diagnostics.filter((diagnostic) => diagnostic.severity === "info").length;
  const pendingReviews = candidateSummaries.filter((candidate) =>
    candidate.decision.state === "proposed" || candidate.decision.state === "reviewed-keep").length;
  const staleReviews = candidateSummaries.filter((candidate) => candidate.decision.state === "stale").length;
  const verifiedReviews = candidateSummaries.filter((candidate) => candidate.decision.state === "verified").length;
  const snapshot = {
    version: 3 as const,
    project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
    selection,
    hashes: { ...project.hashes },
    objective: {
      targetResource: project.objective.targetResource,
      targetRegion: project.objective.targetRegion,
      targetRatePerMinute: project.objective.targetRatePerMinute,
      deliveryContracts,
    },
    status: {
      capacity: { state: capacity.ready ? "ready" as const : "blocked" as const, gapCount: capacity.gaps.length, gapsByKind },
      flow: { state: flowWarnings ? "at-risk" as const : "clear" as const, warningCount: flowWarnings, infoCount: flowInfo },
      evidence: { state: !currentRun ? "missing" as const : currentRun.compatible ? "current" as const : "incompatible" as const, runId: currentRun?.id ?? null },
      review: {
        state: pendingReviews ? "pending" as const : staleReviews ? "stale" as const : "clear" as const,
        pendingCount: pendingReviews,
        staleCount: staleReviews,
        verifiedCount: verifiedReviews,
      },
    },
    counts: {
      regions: Object.keys(project.regions).length,
      resourceNodes: Object.keys(project.resourceNodes).length,
      resourceAssets: Object.keys(project.resources).length,
      processes: Object.keys(project.processes).length,
      routes: Object.keys(project.routes).length,
      deviceAssets: Object.keys(project.deviceAssets).length,
      deviceInstances: Object.keys(project.devices).length,
      connections: Object.keys(project.connections).length,
      transportCells: Object.keys(project.transportCells).length,
      logisticsNetworks: Object.keys(project.logisticsNetworks).length,
      logisticsRoutes,
      powerGrids: Object.keys(project.powerGrids).length,
      runs: runs.length,
      experiments: experiments.length,
      candidates: candidates.length,
    },
    catalog: {
      resources: Object.values(project.resources).map((asset) => ({ id: asset.id, name: asset.name, unit: { ...asset.unit }, tags: [...asset.tags] })).sort((a, b) => a.id.localeCompare(b.id)),
      processes: Object.values(project.processes).map((process) => ({ id: process.id, name: process.name, category: process.category, tags: [...process.tags] })).sort((a, b) => a.id.localeCompare(b.id)),
      routes: Object.values(project.routes).map((route) => ({ id: route.id, name: route.name, family: route.family, tags: [route.family, "product-route"] })).sort((a, b) => a.id.localeCompare(b.id)),
      devices: Object.values(project.deviceAssets).map((asset) => ({ id: asset.id, name: asset.name, tags: [...asset.tags], capabilities: [...asset.capabilities] })).sort((a, b) => a.id.localeCompare(b.id)),
    },
    runs: runSummaries,
    experiments: experiments.map((experiment) => ({
      ...experiment,
      cases: experiment.cases.map((item) => ({ ...item })),
      acceptance: { ...experiment.acceptance },
    })),
    candidates: candidateSummaries,
    diagnostics,
    lossAttribution,
    operations,
  } satisfies Omit<ProjectWorkbenchSnapshot, "nextAction">;
  return { ...snapshot, nextAction: buildNextAction(snapshot) };
}

export async function openProjectWorkbenchSnapshot(projectDir: string, selection: ProjectSelection = {}): Promise<ProjectWorkbenchSnapshot> {
  return buildProjectWorkbenchSnapshot(compileFactoryProject(await loadFactoryProject(projectDir, selection)));
}
