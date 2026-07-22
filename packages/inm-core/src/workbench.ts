import { listRuns } from "./artifacts";
import { listBlueprintBenchmarks, type BlueprintBenchmarkSummary } from "./benchmark";
import { listCandidateChangeSets } from "./candidate-change-set";
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import { analyzeProduction, type ProductionAnalysis, type ProductionDiagnostic } from "./production-analysis";
import type { CompiledFactoryProject, ProjectHashes } from "./types";
import { ENGINE_VERSION, hashValue } from "./utils";

export type WorkbenchDiagnosticSeverity = "blocking" | "warning" | "info";
export type WorkbenchSubjectKind =
  | "project"
  | "region"
  | "resource"
  | "process"
  | "device"
  | "connection"
  | "network"
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
    source: "capacity-plan" | "production-analysis";
    summary: string;
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

export interface ProjectWorkbenchSnapshot {
  version: 1;
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
  readiness: {
    ready: boolean;
    gapCount: number;
    gapsByKind: Partial<Record<ProductionCapacityPlan["gaps"][number]["kind"], number>>;
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
  }>;
  diagnostics: WorkbenchDiagnostic[];
  operations: WorkbenchOperationDescriptor[];
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

function projectDiagnostics(project: CompiledFactoryProject, analysis: ProductionAnalysis, capacity: ProductionCapacityPlan): WorkbenchDiagnostic[] {
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
  return [...blocking, ...advisory].sort((left, right) =>
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

function operationDescriptors(experiments: BlueprintBenchmarkSummary[], candidateCount: number): WorkbenchOperationDescriptor[] {
  const lockedExperiments = experiments.filter((experiment) => experiment.locked).length;
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
      id: "candidate.preview", label: "Preview Candidate Change Set", description: "Evaluate an exact project-local Blueprint patch without writing it.",
      effect: "read-only", selectionAware: false, requiresConfirmation: false, writeSet: [], guards: ["base-candidate-hash", "locked-benchmark"],
      availability: conditionalWhen(candidateCount > 0, "Select a Candidate whose base hash and Benchmark lock still match.", "No Candidate Change Set is available."),
    },
    {
      id: "candidate.apply", label: "Apply Candidate Change Set", description: "Re-evaluate and atomically apply one reviewed KEEP proposal.",
      effect: "mutates-blueprint", selectionAware: false, requiresConfirmation: true, writeSet: ["blueprints/<benchmark-candidate>.blueprint.json"],
      guards: ["reviewed-proposal-hash", "base-candidate-hash", "proposed-candidate-hash", "keep-verdict"],
      availability: conditionalWhen(candidateCount > 0, "Preview must produce a reviewed KEEP result with matching hashes.", "No Candidate Change Set is available."),
    },
  ];
}

export async function buildProjectWorkbenchSnapshot(project: CompiledFactoryProject): Promise<ProjectWorkbenchSnapshot> {
  const analysis = analyzeProduction(project);
  const capacity = planProductionCapacity(project);
  const [runs, experiments, candidates] = await Promise.all([
    listRuns(project.rootDir),
    listBlueprintBenchmarks(project.rootDir),
    listCandidateChangeSets(project.rootDir),
  ]);
  const gapsByKind: ProjectWorkbenchSnapshot["readiness"]["gapsByKind"] = {};
  for (const gap of capacity.gaps) gapsByKind[gap.kind] = (gapsByKind[gap.kind] ?? 0) + 1;
  const deliveryContracts = project.objective.deliveryContracts?.map((contract) => ({
    id: contract.id, resource: contract.resource, region: contract.region, demandPerMinute: contract.demandPerMinute,
  })) ?? [{
    id: "primary", resource: project.objective.targetResource, region: project.objective.targetRegion,
    demandPerMinute: project.objective.targetRatePerMinute,
  }];
  const logisticsRoutes = Object.values(project.logisticsNetworks).reduce((sum, network) => sum + network.routes.length, 0);
  return {
    version: 1,
    project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
    selection: {
      world: { id: project.selection.world, name: project.world.name },
      blueprint: { id: project.selection.blueprint, name: project.selection.blueprint },
      scenario: { id: project.selection.scenario, name: project.scenario.name, durationTicks: project.scenario.durationTicks },
      objective: { id: project.selection.objective, name: project.objective.name },
    },
    hashes: { ...project.hashes },
    objective: {
      targetResource: project.objective.targetResource,
      targetRegion: project.objective.targetRegion,
      targetRatePerMinute: project.objective.targetRatePerMinute,
      deliveryContracts,
    },
    readiness: { ready: capacity.ready, gapCount: capacity.gaps.length, gapsByKind },
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
    runs: runs.map((run) => ({
      id: run.name,
      score: run.score,
      decision: run.manifest.decision,
      resultHash: run.manifest.resultHash,
      engineVersion: run.manifest.engineVersion,
      compatible: run.manifest.engineVersion === ENGINE_VERSION,
      selection: { ...run.manifest.selection },
    })),
    experiments: experiments.map((experiment) => ({
      ...experiment,
      cases: experiment.cases.map((item) => ({ ...item })),
      acceptance: { ...experiment.acceptance },
    })),
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      benchmark: candidate.benchmark,
      hypothesis: candidate.hypothesis,
      ...(candidate.expectedEffect ? { expectedEffect: candidate.expectedEffect } : {}),
      baseCandidateHash: candidate.baseCandidateHash,
      patchOperations: candidate.patch.length,
    })),
    diagnostics: projectDiagnostics(project, analysis, capacity),
    operations: operationDescriptors(experiments, candidates.length),
  };
}

export async function openProjectWorkbenchSnapshot(projectDir: string, selection: ProjectSelection = {}): Promise<ProjectWorkbenchSnapshot> {
  return buildProjectWorkbenchSnapshot(compileFactoryProject(await loadFactoryProject(projectDir, selection)));
}
