import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listRuns } from "./artifacts";
import { listBlueprintBenchmarks, type BlueprintBenchmarkSummary } from "./benchmark";
import { listCandidateChangeSets, type CandidateChangeSet } from "./candidate-change-set";
import { inspectCandidateDecision, type CandidateDecision, type CandidateDecisionState } from "./candidate-review";
import { listDesignPrograms, type DesignProgramSummary } from "./design-program";
import {
  indexDesignRuns,
  loadDesignRun,
  type DesignDecisionEvidence,
  type DesignRunManifest,
  type DesignRunSummary,
  type InvalidDesignRunSummary,
} from "./design-run";
import { analyzeFabLosses, type FabLossAttribution, type FabLossBucketId } from "./fab-loss-analysis";
import { planProductionCapacity, type ProductionCapacityPlan } from "./capacity-plan";
import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import { analyzeProduction, type ProductionAnalysis, type ProductionDiagnostic } from "./production-analysis";
import { blueprintSchema } from "./schema";
import {
  SCORE_BREAKDOWN_COMPONENTS,
  type CompiledFactoryProject,
  type FactoryEvent,
  type FactoryMetrics,
  type FactoryState,
  type Objective,
  type ProjectHashes,
  type ScoreBreakdown,
  type ScoreBreakdownComponent,
} from "./types";
import { ENGINE_VERSION, hashValue, readJson, stableStringify } from "./utils";
import { describeWipInventoryLocation } from "./inventory-location";
import {
  buildSelectionExecutionHash,
  projectEvidenceHashes,
  sameProjectEvidenceIdentity,
} from "./execution-identity";
import {
  classifyDesignProgramEvidence,
  verifiedDesignCommissioningIdentity,
  type WorkbenchDesignProgramEvidence,
} from "./design-evidence";
import { analyzeSourceLotServices, type SourceLotServiceAnalysis } from "./source-lot-service";
import type { IndustrialInvestigationEntry } from "./investigation";

export {
  classifyDesignProgramEvidence,
  designProgramEvidenceIdentity,
  inspectDesignProgramEvidence,
  recommendedDesignProgramEvidenceAction,
} from "./design-evidence";
export type {
  DesignProgramEvidenceAction,
  InspectedDesignProgramEvidence,
  WorkbenchDesignEvidenceIdentity,
  WorkbenchDesignEvidenceState,
  WorkbenchDesignCommissioningEvidence,
  WorkbenchDesignCommissioningIdentity,
  WorkbenchDesignProgramEvidence,
  WorkbenchDesignRunCurrentnessReason,
  WorkbenchDesignRunEvidence,
  WorkbenchDesignRunOutcome,
} from "./design-evidence";

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
  id: "validate" | "inspect" | "analyze" | "plan" | "simulate" | "synthesize" | "design.run" | "benchmark.evaluate" | "candidate.preview" | "candidate.apply";
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
  | {
    kind: "investigation";
    investigationId: string;
    phase:
      | "repair-evidence"
      | "observe-current-factory"
      | "form-hypothesis"
      | "author-candidate"
      | "review-candidate"
      | "simulate-candidate"
      | "compare-candidate"
      | "decide-candidate"
      | "author-production-plan"
      | "simulate-production-plan"
      | "compare-production-plan";
    sourceEntryId: string | null;
  }
  | { kind: "design-program"; programId: string; diagnosticId: string }
  | { kind: "design-program"; programId: string; objectiveComponent: ScoreBreakdownComponent; runId: string }
  | { kind: "design-run"; programId: string; runId: string; phase: "commissioned" | "promotable" | "continuable" | "exhausted"; diagnosticId: string }
  | { kind: "design-run"; programId: string; runId: string; phase: "commissioned" | "promotable" | "continuable" | "exhausted"; objectiveComponent: ScoreBreakdownComponent; evidenceRunId: string }
  | { kind: "objective-component"; component: ScoreBreakdownComponent; runId: string }
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

export interface WorkbenchLossDisposition {
  id: string;
  state: "bounded-deferred";
  diagnosticId: string;
  loss: FabLossBucketId;
  target: {
    contributor: string;
    metric: string;
    direction: "decrease";
    currentValue: number;
  };
  source: {
    programId: string;
    programName: string;
    programHash: string;
    benchmarkId: string;
    benchmarkContractHash: string;
    runId: string;
  };
  observed: {
    runId: string;
    resultHash: string;
  };
  evidence: {
    attemptedCandidates: number;
    improvedCandidates: number;
    rejectedCandidates: number;
    bestObservedValue: number;
    largestReduction: number;
    driverMetricsHash: string;
    decisionBases: Record<DesignDecisionEvidence["basis"], number>;
  };
  reason: string;
  invalidation: {
    summary: string;
    bindings: Array<
      | "program"
      | "benchmark"
      | "driver-selection"
      | "driver-hashes"
      | "compatible-run"
      | "loss-target"
      | "current-value"
    >;
  };
}

export interface WorkbenchObjectiveComponentEvidence {
  id: ScoreBreakdownComponent;
  contribution: number;
  role: "reward" | "penalty" | "neutral";
}

export interface WorkbenchObjectiveEvidence {
  runId: string;
  finalScore: number;
  scoreBreakdown: ScoreBreakdown;
  components: WorkbenchObjectiveComponentEvidence[];
  dominantPenalty: WorkbenchObjectiveComponentEvidence | null;
  wip: {
    equivalentUnit: string;
    weight: number;
    scoreContribution: number;
    averageRawWipInventory: number;
    averageWipEquivalentUnits: number;
    peakRawWipInventory: number;
    peakWipEquivalentUnits: number;
    resources: Array<{
      resource: string;
      equivalentUnitsPerItem: number;
      averageInventory: number;
      peakInventory: number;
      finalInventory: number;
      averageWipEquivalentUnits: number;
      peakWipEquivalentUnits: number;
      finalWipEquivalentUnits: number;
      shareOfAverageWip: number;
      scoreContribution: number;
    }>;
    locations: Array<{
      id: string;
      resource: string;
      kind: "buffer" | "in-process" | "local-transit" | "station-transit";
      physicalLocation: string;
      subject: { kind: "device" | "connection"; id: string } | null;
      equivalentUnitsPerItem: number;
      averageInventory: number;
      peakInventory: number;
      finalInventory: number;
      averageWipEquivalentUnits: number;
      peakWipEquivalentUnits: number;
      finalWipEquivalentUnits: number;
      shareOfAverageWip: number;
      scoreContribution: number;
    }>;
  };
}

export interface ProjectWorkbenchSnapshot {
  version: 17;
  project: {
    id: string;
    name: string;
    rootDir: string;
  };
  selection: {
    world: { id: string; name: string };
    blueprint: { id: string; name: string };
    productionPlan: { id: string; name: string };
    scenario: { id: string; name: string; durationTicks: number };
    objective: { id: string; name: string };
  };
  hashes: ProjectHashes;
  objective: {
    targetResource: string;
    targetRegion: string;
    targetRatePerMinute: number;
    wipAccounting: Objective["wipAccounting"];
    deliveryContracts: Array<{
      id: string;
      resource: string;
      region: string;
      demandPerMinute: number;
    }>;
  };
  inventoryAccounting: (FactoryMetrics["inventoryAccounting"] & { runId: string }) | null;
  sourceLotLineage: (FactoryMetrics["sourceLotLineage"] & { runId: string }) | null;
  sourceLotServices: SourceLotServiceAnalysis[];
  objectiveEvidence: WorkbenchObjectiveEvidence | null;
  status: {
    capacity: {
      state: "ready" | "blocked";
      gapCount: number;
      gapsByKind: Partial<Record<ProductionCapacityPlan["gaps"][number]["kind"], number>>;
    };
    flow: { state: "clear" | "at-risk"; warningCount: number; infoCount: number };
    evidence: { state: "current" | "missing" | "incompatible"; runId: string | null };
    review: {
      state: "clear" | "pending" | "stale";
      pendingCount: number;
      disposedCount: number;
      staleCount: number;
      verifiedCount: number;
    };
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
    designPrograms: number;
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
    decision: "BASELINE" | "TRIAL" | "KEEP" | "REVERT";
    resultHash: string;
    engineVersion: string;
    compatible: boolean;
    selection: { world: string; blueprint: string; productionPlan?: string; scenario: string; objective: string };
  }>;
  experiments: BlueprintBenchmarkSummary[];
  designPrograms: Array<{
    id: string;
    name: string;
    description: string;
    benchmark: string;
    seed: DesignProgramSummary["seed"];
    focus: DesignProgramSummary["focus"];
    driverCase: string;
    currentBestGuardrail: DesignProgramSummary["currentBestGuardrail"];
    frontier: DesignProgramSummary["frontier"];
    budget: DesignProgramSummary["budget"];
    locked: boolean;
    promotionTarget: string;
    alignment: {
      state: "aligned" | "not-aligned";
      reasons: Array<"unlocked-benchmark" | "synthesis-seed" | "seed-blueprint-mismatch" | "promotion-target-mismatch">;
    };
    evidence: WorkbenchDesignProgramEvidence;
  }>;
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
      error?: { code: string; message: string };
    };
    investigationDisposition: null | {
      investigationId: string;
      entryId: string;
      entryHash: string;
      sequence: number;
      author: "human" | "agent";
      disposition: "keep" | "revise" | "defer" | "discard";
      statement: string;
      reviewAnchorId: string;
      reviewResultHash: string;
    };
  }>;
  diagnostics: WorkbenchDiagnostic[];
  lossAttribution: FabLossAttribution | null;
  lossDispositions: WorkbenchLossDisposition[];
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

async function readFactoryEvents(path: string): Promise<FactoryEvent[]> {
  const source = await readFile(path, "utf8");
  return source.split("\n").filter(Boolean).map((line) => JSON.parse(line) as FactoryEvent);
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
  const realized = (lossAttribution?.buckets ?? []).map((bucket, index): WorkbenchDiagnostic => {
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
      actionIds: ["simulate", "analyze", "design.run"],
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

const emptyDecisionBases = (): WorkbenchLossDisposition["evidence"]["decisionBases"] => ({
  "current-best-improvement": 0,
  "benchmark-gate": 0,
  "no-current-best-improvement": 0,
  "current-best-case-guardrail": 0,
  "addressed-loss-not-improved": 0,
  "addressed-objective-not-improved": 0,
});

export function deriveWorkbenchLossDisposition(
  program: Pick<DesignProgramSummary, "id" | "name" | "benchmark" | "programHash"> & {
    benchmarkContractHash: string;
    authorityRunId: string;
  },
  manifest: DesignRunManifest,
  context: Pick<ProjectWorkbenchSnapshot, "project" | "selection" | "hashes" | "diagnostics" | "lossAttribution">,
): WorkbenchLossDisposition | null {
  if (!context.lossAttribution
    || program.authorityRunId !== manifest.resultHash
    || manifest.project !== context.project.id
    || manifest.engineVersion !== context.hashes.engineVersion
    || manifest.program.id !== program.id
    || manifest.program.hash !== program.programHash
    || manifest.benchmark.id !== program.benchmark
    || manifest.benchmark.contractHash !== program.benchmarkContractHash
    || manifest.seed.sourceBlueprintHash !== context.hashes.blueprintHash
    || manifest.promotionBase.hash !== context.hashes.blueprintHash
    || stableStringify(manifest.driver.selection) !== stableStringify({
      world: context.selection.world.id,
      blueprint: context.selection.blueprint.id,
      scenario: context.selection.scenario.id,
      objective: context.selection.objective.id,
    })
    || stableStringify(manifest.driver.hashes) !== stableStringify(projectEvidenceHashes({
      ...context.hashes,
      blueprintHash: manifest.seed.blueprintHash,
    }))
    || manifest.stopReason !== "frontier-exhausted"
    || manifest.budget.evaluated <= 0
    || manifest.iterations.length !== manifest.budget.evaluated
    || manifest.best.iteration !== 0
    || manifest.best.promotionPatchOperations !== 0
    || manifest.best.verdict !== "KEEP"
    || manifest.best.blueprintHash !== manifest.seed.blueprintHash
    || manifest.frontier.leader !== "seed"
    || manifest.frontier.alternatives.length !== 0
    || manifest.frontier.scheduler.searchOrder.length !== 0
    || stableStringify(manifest.frontier.scheduler.exhausted) !== stableStringify(["seed"])
    || manifest.frontier.nodes.length !== 1
    || manifest.frontier.nodes[0]?.nodeId !== "seed"
    || manifest.frontier.nodes[0].role !== "leader"
    || manifest.frontier.nodes[0].depth !== 0
    || manifest.frontier.nodes[0].searchStatus !== "exhausted"
    || manifest.exhaustions.length !== 1
    || manifest.exhaustions[0]?.node.nodeId !== "seed"
    || manifest.exhaustions[0].reason !== "proposal-exhausted"
    || manifest.exhaustions[0].searchOrderAfter.length !== 0
    || stableStringify(manifest.exhaustions[0].exhaustedAfter) !== stableStringify(["seed"])
    || manifest.exhaustions[0].nextNodeId !== null) return null;

  const first = manifest.iterations[0]!;
  if (!first.addressedLoss || !first.addressedLossTarget || !first.lossTargetEvidence) return null;
  const loss = first.addressedLoss;
  const target = first.addressedLossTarget;
  const currentBucket = context.lossAttribution.buckets.find((bucket) => bucket.id === loss);
  const currentContributor = currentBucket?.contributors.find((contributor) => contributor.id === target.contributor);
  const currentValue = currentContributor?.evidence[target.metric];
  const diagnostic = context.diagnostics.find((item) =>
    item.code === `fab-loss.${loss}`
    && item.evidence.source === "compatible-run"
    && item.evidence.runId === context.lossAttribution!.run.id);
  const driverMetricsHash = first.driverEvidence.metricsHash;
  const driverLossProfile = first.driverEvidence.fabLoss;
  if (!diagnostic
    || target.direction !== "decrease"
    || typeof currentValue !== "number"
    || !Number.isFinite(currentValue)
    || !driverMetricsHash
    || !driverLossProfile) return null;

  const exactIterations = manifest.iterations.every((iteration) =>
    iteration.error === undefined
    && iteration.decision === "REJECT"
    && iteration.evaluation !== undefined
    && iteration.decisionEvidence !== undefined
    && iteration.decisionEvidence.basis !== "addressed-loss-not-improved"
    && iteration.addressedLoss === loss
    && stableStringify(iteration.addressedLossTarget) === stableStringify(target)
    && iteration.driverEvidence.metricsHash === driverMetricsHash
    && stableStringify(iteration.driverEvidence.fabLoss) === stableStringify(driverLossProfile)
    && iteration.driverEvidence.fabLoss?.buckets
      .find((bucket) => bucket.id === loss)?.contributors
      .find((contributor) => contributor.id === target.contributor)?.evidence[target.metric] === currentValue
    && iteration.lossTargetEvidence !== undefined
    && stableStringify(iteration.lossTargetEvidence.target) === stableStringify(target)
    && iteration.lossTargetEvidence.before === currentValue
    && iteration.lossTargetEvidence.improved
    && iteration.lossTargetEvidence.after < currentValue
    && iteration.lossTargetEvidence.delta === iteration.lossTargetEvidence.after - currentValue
    && iteration.frontierEvidence.outcome === "rejected"
    && iteration.frontierEvidence.leaderAfter === "seed"
    && iteration.frontierEvidence.alternativesAfter.length === 0);
  if (!exactIterations) return null;

  const decisionBases = emptyDecisionBases();
  for (const iteration of manifest.iterations) decisionBases[iteration.decisionEvidence!.basis] += 1;
  const bestObservedValue = Math.min(...manifest.iterations.map((iteration) => iteration.lossTargetEvidence!.after));
  const largestReduction = currentValue - bestObservedValue;
  const bindings: WorkbenchLossDisposition["invalidation"]["bindings"] = [
    "program",
    "benchmark",
    "driver-selection",
    "driver-hashes",
    "compatible-run",
    "loss-target",
    "current-value",
  ];
  return {
    id: `bounded-deferred:${hashValue({
      diagnosticId: diagnostic.id,
      program: program.id,
      run: manifest.resultHash,
      observed: context.lossAttribution.run,
      loss,
      target,
      currentValue,
    })}`,
    state: "bounded-deferred",
    diagnosticId: diagnostic.id,
    loss,
    target: { ...target, currentValue },
    source: {
      programId: program.id,
      programName: program.name,
      programHash: program.programHash,
      benchmarkId: program.benchmark,
      benchmarkContractHash: program.benchmarkContractHash,
      runId: manifest.resultHash,
    },
    observed: { runId: context.lossAttribution.run.id, resultHash: context.lossAttribution.run.resultHash },
    evidence: {
      attemptedCandidates: manifest.iterations.length,
      improvedCandidates: manifest.iterations.length,
      rejectedCandidates: manifest.iterations.length,
      bestObservedValue,
      largestReduction,
      driverMetricsHash,
      decisionBases,
    },
    reason: `${manifest.iterations.length}/${manifest.iterations.length} bounded Candidates reduced ${target.contributor}.${target.metric} from ${currentValue}, but every Candidate was rejected by the locked industrial authority and the unchanged seed frontier is exhausted.`,
    invalidation: {
      summary: "Deferred only while the exact Program, Benchmark, driver selection and hashes, compatible run, loss target, and current observed value remain unchanged.",
      bindings,
    },
  };
}

function operationDescriptors(
  experiments: BlueprintBenchmarkSummary[],
  candidates: ProjectWorkbenchSnapshot["candidates"],
  designPrograms: ProjectWorkbenchSnapshot["designPrograms"],
): WorkbenchOperationDescriptor[] {
  const lockedExperiments = experiments.filter((experiment) => experiment.locked).length;
  const reviewable = candidates.some((candidate) => candidate.decision.state === "proposed" || candidate.decision.state.startsWith("reviewed-"));
  const applicable = candidates.some((candidate) =>
    candidate.decision.state === "reviewed-keep"
      && (!candidate.investigationDisposition
        || candidate.investigationDisposition.disposition === "keep"));
  const alignedDesign = designPrograms.find((program) => program.alignment.state === "aligned");
  const designAvailability: WorkbenchOperationDescriptor["availability"] = !designPrograms.some((program) => program.locked)
    ? { state: "unavailable", reasons: ["No locked project-local Design Program is available."] }
    : alignedDesign?.evidence.state === "promotable"
      ? { state: "conditional", reasons: ["The aligned Design Program already has a current promotable leader; review that immutable run before starting another."] }
      : alignedDesign?.evidence.state === "continuable"
        ? { state: "conditional", reasons: ["The aligned Design Program has a current searchable frontier; continue that immutable run instead of restarting it."] }
        : alignedDesign?.evidence.state === "commissioned"
          ? { state: "conditional", reasons: ["The aligned Design Program's accepted leader is already the current Blueprint through a verified Candidate; review that lineage before authoring additional interventions."] }
        : alignedDesign?.evidence.state === "exhausted"
          ? { state: "conditional", reasons: ["The aligned Design Program has exhausted its current intervention portfolio; change its Program inputs before rerunning."] }
          : { state: "available", reasons: [] };
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
      id: "design.run", label: "Run bounded Design Program", description: "Diagnose one project-local seed and evaluate bounded proposals against its locked multi-case Benchmark.",
      effect: "creates-artifact", selectionAware: false, requiresConfirmation: false,
      writeSet: ["design-runs/<program>/<result-hash>/"],
      guards: ["locked-benchmark", "current-program-hash", "bounded-candidate-budget", "immutable-design-run"],
      availability: designAvailability,
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
  const matching = runs.filter((run) => run.selection.world === selection.world.id
    && run.selection.blueprint === selection.blueprint.id
    && run.selection.productionPlan === selection.productionPlan.id
    && run.selection.scenario === selection.scenario.id
    && run.selection.objective === selection.objective.id);
  return matching.filter((run) => run.compatible).at(-1) ?? matching.at(-1);
}

function selectionArgv(selection: ProjectWorkbenchSnapshot["selection"]): string[] {
  return [
    "--world", selection.world.id,
    "--blueprint", selection.blueprint.id,
    "--production-plan", selection.productionPlan.id,
    "--scenario", selection.scenario.id,
    "--objective", selection.objective.id,
  ];
}

export function buildWorkbenchNextAction(context: Pick<ProjectWorkbenchSnapshot, "project" | "selection" | "diagnostics" | "candidates" | "runs" | "operations" | "designPrograms" | "lossDispositions" | "objectiveEvidence">): WorkbenchNextAction {
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

  const candidate = context.candidates.find((item) =>
    item.decision.state === "reviewed-keep"
      && (!item.investigationDisposition
        || item.investigationDisposition.disposition === "keep"))
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
      : `No immutable run matches ${context.selection.blueprint.id} / ${context.selection.productionPlan.id} / ${context.selection.scenario.id} / ${context.selection.objective.id}.`,
    actionLabel: "RUN SIMULATION",
    effect: "creates-artifact",
    requiresConfirmation: false,
    argv: ["inm", "simulate", context.project.rootDir, ...selectionArgv(context.selection), "--json"],
    studioRoute: projectRoute,
    target: { kind: "operation", operationId: "simulate" },
  };

  const disposedDiagnosticIds = new Set(context.lossDispositions.map((disposition) => disposition.diagnosticId));
  const warning = context.diagnostics.find((diagnostic) =>
    diagnostic.severity === "warning" && !disposedDiagnosticIds.has(diagnostic.id));
  const selectedLoss = warning?.code.startsWith("fab-loss.")
    ? warning.code.slice("fab-loss.".length) as FabLossBucketId
    : null;
  const designEvidencePriority = (program: ProjectWorkbenchSnapshot["designPrograms"][number]): number => {
    if (program.evidence.state === "promotable") return 0;
    const addressesSelectedLoss = selectedLoss !== null
      && program.evidence.authorityAddressedLosses.includes(selectedLoss);
    const focusesSelectedLoss = selectedLoss !== null
      && program.focus.kind === "losses"
      && program.focus.losses.includes(selectedLoss);
    if (addressesSelectedLoss && program.evidence.state === "continuable") return 1;
    if (addressesSelectedLoss && program.evidence.state === "commissioned") return 2;
    if (addressesSelectedLoss && program.evidence.state === "exhausted") return 3;
    if (focusesSelectedLoss && program.evidence.state === "missing") return 4;
    if (program.focus.kind === "broad" && program.evidence.state === "missing") return 5;
    if (program.evidence.state === "continuable") return 6;
    if (program.evidence.state === "commissioned") return 7;
    if (program.evidence.state === "exhausted") return 8;
    if (program.evidence.state === "missing") return 9;
    return 10;
  };
  const alignedProgram = context.designPrograms
    .filter((program) => program.alignment.state === "aligned")
    .sort((left, right) =>
      designEvidencePriority(left) - designEvidencePriority(right)
      || left.id.localeCompare(right.id))[0];
  const designAuthority = alignedProgram?.evidence.authorityRunId
    ? alignedProgram.evidence.runs.find((run) => run.id === alignedProgram.evidence.authorityRunId)
    : null;
  if (warning?.evidence.source === "compatible-run" && alignedProgram && designAuthority) {
    const phase = designAuthority.currentness.state === "commissioned" ? "commissioned" : designAuthority.outcome;
    const commissioning = designAuthority.currentness.commissioning;
    const title = phase === "commissioned"
      ? `Continue from the commissioned ${alignedProgram.name} lineage`
      : phase === "promotable"
      ? `Review the current Design leader from ${alignedProgram.name}`
      : phase === "continuable"
        ? `Continue the current ${alignedProgram.name} frontier`
        : `Expand ${alignedProgram.name}'s intervention portfolio`;
    const next = phase === "commissioned"
      ? `Design Run ${designAuthority.id} produced the current Blueprint through verified Candidate ${commissioning!.candidateId}; reopen its complete accepted and rejected evidence before adding a physically distinct intervention.`
      : phase === "promotable"
      ? `Current Design Run ${designAuthority.id} has a guarded leader with ${designAuthority.best.promotionPatchOperations} promotion operations. Review its immutable evidence before creating a Candidate.`
      : phase === "continuable"
        ? `Current Design Run ${designAuthority.id} stopped at its ${designAuthority.budget.evaluated}/${designAuthority.budget.maximum} Candidate budget with searchable frontier evidence. Reopen that exact result before choosing an additional bounded budget.`
        : `Current Design Run ${designAuthority.id} evaluated ${designAuthority.budget.evaluated} Candidates, exhausted every eligible intervention, and retained ${designAuthority.best.promotionPatchOperations ? "a changed leader" : "the unchanged seed"}. Review the exact rejections and change the project-local intervention portfolio before rerunning.`;
    return {
      id: `design.run.inspect:${alignedProgram.id}:${designAuthority.id}:${warning.id}`,
      tone: phase === "promotable" ? "review" : "attention",
      title,
      reason: `${warning.message} ${next}`,
      actionLabel: phase === "commissioned" ? "REVIEW COMMISSIONED LINEAGE" : phase === "promotable" ? "REVIEW DESIGN LEADER" : phase === "continuable" ? "REVIEW CONTINUATION" : "REVIEW EXHAUSTED DESIGN",
      effect: "read-only",
      requiresConfirmation: false,
      argv: ["inm", "design", context.project.rootDir, "--program", alignedProgram.id, "--run-id", designAuthority.id, "--json"],
      studioRoute: `${projectRoute}/designs/${encodeURIComponent(alignedProgram.id)}/runs/${designAuthority.id}`,
      target: { kind: "design-run", programId: alignedProgram.id, runId: designAuthority.id, phase, diagnosticId: warning.id },
    };
  }
  if (warning?.evidence.source === "compatible-run" && alignedProgram) return {
    id: `design.inspect:${alignedProgram.id}:${warning.id}`,
    tone: "attention",
    title: `Investigate the leading loss with ${alignedProgram.name}`,
    reason: `${warning.message} Open the aligned Design Program brief before choosing whether to create bounded locked-case evidence.`,
    actionLabel: "OPEN DESIGN LOOP",
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "design", context.project.rootDir, "--program", alignedProgram.id, "--json"],
    studioRoute: `${projectRoute}/designs/${encodeURIComponent(alignedProgram.id)}`,
    target: { kind: "design-program", programId: alignedProgram.id, diagnosticId: warning.id },
  };
  if (warning) return {
    id: `diagnostic:${warning.id}`,
    tone: "attention",
    title: "Inspect the highest-priority structural risk",
    reason: warning.message,
    actionLabel: "FOLLOW EVIDENCE",
    effect: "read-only",
    requiresConfirmation: false,
    argv: ["inm", "analyze", context.project.rootDir, ...selectionArgv(context.selection), "--section", "diagnostics", "--json"],
    studioRoute: `${projectRoute}/analysis/diagnostics/${encodeURIComponent(warning.id)}`,
    target: { kind: "diagnostic", diagnosticId: warning.id },
  };

  const objectivePenalty = context.objectiveEvidence?.dominantPenalty;
  if (objectivePenalty) {
    const runId = context.objectiveEvidence!.runId;
    const wip = objectivePenalty.id === "wip" ? context.objectiveEvidence!.wip : null;
    const currentWipLocations = new Set(wip?.locations.map((location) => location.id) ?? []);
    const objectiveProgram = context.designPrograms
      .filter((program) =>
        program.alignment.state === "aligned"
        && program.focus.kind === "objective"
        && program.focus.component === objectivePenalty.id
        && (!program.focus.locations || program.focus.locations.every((location) => currentWipLocations.has(location))))
      .sort((left, right) => {
        const priority = (program: ProjectWorkbenchSnapshot["designPrograms"][number]): number =>
          program.evidence.state === "promotable" ? 0
            : program.evidence.state === "continuable" ? 1
              : program.evidence.state === "commissioned" ? 2
                : program.evidence.state === "exhausted" ? 3
                  : program.evidence.state === "missing" ? 4
                    : 5;
        return priority(left) - priority(right) || left.id.localeCompare(right.id);
      })[0];
    const objectiveAuthority = objectiveProgram?.evidence.authorityRunId
      ? objectiveProgram.evidence.runs.find((item) => item.id === objectiveProgram.evidence.authorityRunId)
      : null;
    if (objectiveProgram && objectiveAuthority) {
      const phase = objectiveAuthority.currentness.state === "commissioned" ? "commissioned" : objectiveAuthority.outcome;
      const commissioning = objectiveAuthority.currentness.commissioning;
      const title = phase === "commissioned"
        ? `Continue from the commissioned ${objectiveProgram.name} lineage`
        : phase === "promotable"
        ? `Review the current Objective Design leader from ${objectiveProgram.name}`
        : phase === "continuable"
          ? `Continue the current ${objectiveProgram.name} frontier`
          : `Expand ${objectiveProgram.name}'s intervention portfolio`;
      const next = phase === "commissioned"
        ? `Design Run ${objectiveAuthority.id} produced the current Blueprint through verified Candidate ${commissioning!.candidateId}; its exact Objective evidence remains the accumulated design handoff.`
        : phase === "promotable"
        ? `Current Design Run ${objectiveAuthority.id} has a guarded leader with ${objectiveAuthority.best.promotionPatchOperations} promotion operations. Review its exact Objective target evidence before creating a Candidate.`
        : phase === "continuable"
          ? `Current Design Run ${objectiveAuthority.id} stopped at its ${objectiveAuthority.budget.evaluated}/${objectiveAuthority.budget.maximum} Candidate budget with searchable frontier evidence.`
          : `Current Design Run ${objectiveAuthority.id} exhausted its explicit Objective intervention portfolio and retained ${objectiveAuthority.best.promotionPatchOperations ? "a changed leader" : "the unchanged seed"}.`;
      return {
        id: `design.run.objective:${objectiveProgram.id}:${objectiveAuthority.id}:${objectivePenalty.id}:${runId}`,
        tone: phase === "promotable" ? "review" : "attention",
        title,
        reason: `${objectivePenalty.id} contributes ${objectivePenalty.contribution.toFixed(3)} to Run ${runId}. ${next}`,
        actionLabel: phase === "commissioned" ? "REVIEW COMMISSIONED LINEAGE" : phase === "promotable" ? "REVIEW DESIGN LEADER" : phase === "continuable" ? "REVIEW CONTINUATION" : "REVIEW OBJECTIVE DESIGN",
        effect: "read-only",
        requiresConfirmation: false,
        argv: ["inm", "design", context.project.rootDir, "--program", objectiveProgram.id, "--run-id", objectiveAuthority.id, "--json"],
        studioRoute: `${projectRoute}/designs/${encodeURIComponent(objectiveProgram.id)}/runs/${objectiveAuthority.id}`,
        target: {
          kind: "design-run",
          programId: objectiveProgram.id,
          runId: objectiveAuthority.id,
          phase,
          objectiveComponent: objectivePenalty.id,
          evidenceRunId: runId,
        },
      };
    }
    if (objectiveProgram) return {
      id: `design.objective:${objectiveProgram.id}:${objectivePenalty.id}:${runId}`,
      tone: "attention",
      title: `Investigate ${objectivePenalty.id} with ${objectiveProgram.name}`,
      reason: `${objectivePenalty.id} contributes ${objectivePenalty.contribution.toFixed(3)} to Run ${runId}. Open the exact Objective-focused Program before choosing whether to create locked evidence.`,
      actionLabel: "OPEN OBJECTIVE DESIGN",
      effect: "read-only",
      requiresConfirmation: false,
      argv: ["inm", "design", context.project.rootDir, "--program", objectiveProgram.id, "--json"],
      studioRoute: `${projectRoute}/designs/${encodeURIComponent(objectiveProgram.id)}`,
      target: { kind: "design-program", programId: objectiveProgram.id, objectiveComponent: objectivePenalty.id, runId },
    };
    const leadingResources = wip?.resources.slice(0, 2) ?? [];
    return {
      id: `objective-component:${objectivePenalty.id}:${runId}`,
      tone: "evidence",
      title: `Review the dominant Objective tradeoff: ${objectivePenalty.id}`,
      reason: wip
        ? `WIP contributes ${objectivePenalty.contribution.toFixed(3)} to the exact Run score. ${leadingResources.map((resource) => `${resource.resource} averages ${resource.averageWipEquivalentUnits.toFixed(2)} equivalent units (${resource.averageInventory.toFixed(2)} raw items)`).join(" and ")}. This is Objective accounting evidence, not proof that the inventory is avoidable.`
        : `${objectivePenalty.id} contributes ${objectivePenalty.contribution.toFixed(3)} to the exact Run score. Review its measured context before authoring a bounded intervention.`,
      actionLabel: "OBSERVE TRADEOFF",
      effect: "read-only",
      requiresConfirmation: false,
      argv: ["inm", "observe", context.project.rootDir, ...selectionArgv(context.selection), "--run", runId, "--json"],
      studioRoute: `${projectRoute}/factory?run=${encodeURIComponent(runId)}`,
      target: { kind: "objective-component", component: objectivePenalty.id, runId },
    };
  }

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

function buildWorkbenchObjectiveEvidence(
  project: CompiledFactoryProject,
  runId: string,
  metrics: FactoryMetrics,
): WorkbenchObjectiveEvidence {
  const components = SCORE_BREAKDOWN_COMPONENTS
    .map((id): WorkbenchObjectiveComponentEvidence => ({
      id,
      contribution: metrics.scoreBreakdown[id],
      role: metrics.scoreBreakdown[id] > 0 ? "reward" : metrics.scoreBreakdown[id] < 0 ? "penalty" : "neutral",
    }))
    .sort((left, right) =>
      Math.abs(right.contribution) - Math.abs(left.contribution)
      || SCORE_BREAKDOWN_COMPONENTS.indexOf(left.id) - SCORE_BREAKDOWN_COMPONENTS.indexOf(right.id));
  const dominantPenalty = components
    .filter((component) => component.role === "penalty")
    .sort((left, right) =>
      left.contribution - right.contribution
      || SCORE_BREAKDOWN_COMPONENTS.indexOf(left.id) - SCORE_BREAKDOWN_COMPONENTS.indexOf(right.id))[0] ?? null;
  const wipWeight = project.objective.weights.wip;
  const wipResources = Object.entries(metrics.inventoryAccounting.resources)
    .filter(([, accounting]) => accounting.includedInWip && accounting.averageWipEquivalentUnits > 0)
    .map(([resource, accounting]) => ({
      resource,
      equivalentUnitsPerItem: accounting.wipEquivalentUnitsPerItem!,
      averageInventory: accounting.averageInventory,
      peakInventory: accounting.peakInventory,
      finalInventory: accounting.finalInventory,
      averageWipEquivalentUnits: accounting.averageWipEquivalentUnits,
      peakWipEquivalentUnits: accounting.peakWipEquivalentUnits,
      finalWipEquivalentUnits: accounting.finalWipEquivalentUnits,
      shareOfAverageWip: metrics.inventoryAccounting.averageWipEquivalentUnits > 0
        ? accounting.averageWipEquivalentUnits / metrics.inventoryAccounting.averageWipEquivalentUnits
        : 0,
      scoreContribution: -accounting.averageWipEquivalentUnits * wipWeight,
    }))
    .sort((left, right) =>
      right.averageWipEquivalentUnits - left.averageWipEquivalentUnits || left.resource.localeCompare(right.resource));
  const wipLocations = Object.entries(metrics.inventoryAccounting.locations)
    .filter(([, accounting]) => accounting.averageWipEquivalentUnits > 0)
    .map(([id, accounting]) => ({
      id,
      resource: accounting.resource,
      kind: accounting.kind,
      physicalLocation: describeWipInventoryLocation(accounting),
      subject: accounting.kind === "buffer" || accounting.kind === "in-process"
        ? { kind: "device" as const, id: accounting.device }
        : accounting.kind === "local-transit"
          ? { kind: "connection" as const, id: accounting.connection }
          : null,
      equivalentUnitsPerItem: accounting.equivalentUnitsPerItem,
      averageInventory: accounting.averageInventory,
      peakInventory: accounting.peakInventory,
      finalInventory: accounting.finalInventory,
      averageWipEquivalentUnits: accounting.averageWipEquivalentUnits,
      peakWipEquivalentUnits: accounting.peakWipEquivalentUnits,
      finalWipEquivalentUnits: accounting.finalWipEquivalentUnits,
      shareOfAverageWip: metrics.inventoryAccounting.averageWipEquivalentUnits > 0
        ? accounting.averageWipEquivalentUnits / metrics.inventoryAccounting.averageWipEquivalentUnits
        : 0,
      scoreContribution: -accounting.averageWipEquivalentUnits * wipWeight,
    }))
    .sort((left, right) =>
      right.averageWipEquivalentUnits - left.averageWipEquivalentUnits || left.id.localeCompare(right.id));
  return {
    runId,
    finalScore: metrics.finalScore,
    scoreBreakdown: structuredClone(metrics.scoreBreakdown),
    components,
    dominantPenalty: dominantPenalty ? { ...dominantPenalty } : null,
    wip: {
      equivalentUnit: metrics.inventoryAccounting.wipEquivalentUnit,
      weight: wipWeight,
      scoreContribution: metrics.scoreBreakdown.wip,
      averageRawWipInventory: metrics.inventoryAccounting.averageRawWipInventory,
      averageWipEquivalentUnits: metrics.inventoryAccounting.averageWipEquivalentUnits,
      peakRawWipInventory: metrics.inventoryAccounting.peakRawWipInventory,
      peakWipEquivalentUnits: metrics.inventoryAccounting.peakWipEquivalentUnits,
      resources: wipResources,
      locations: wipLocations,
    },
  };
}

async function currentInvestigationDisposition(
  candidate: CandidateChangeSet,
  decision: CandidateDecision,
  entriesForInvestigation: (investigationId: string) => Promise<IndustrialInvestigationEntry[]>,
): Promise<ProjectWorkbenchSnapshot["candidates"][number]["investigationDisposition"]> {
  if (candidate.source?.kind !== "investigation-hypothesis"
    || !decision.resultHash
    || !decision.proposedCandidateHash
    || !decision.verdict) return null;
  try {
    // Investigation owns the verified append-only chain. Keep this import
    // deferred because Investigation itself uses Workbench to resolve new
    // factory-observation anchors.
    const entries = await entriesForInvestigation(candidate.source.investigation);
    const reviewAnchors = new Map<string, {
      candidateId: string;
      proposalHash: string;
      currentCandidateHash: string;
      proposedCandidateHash: string;
      reviewResultHash: string;
      verdict: "KEEP" | "DISCARD" | "UNCHANGED";
    }>();
    let resolved: ProjectWorkbenchSnapshot["candidates"][number]["investigationDisposition"] = null;
    for (const entry of entries) {
      for (const anchor of entry.introducedAnchors) {
        if (anchor.kind === "candidate-review") reviewAnchors.set(anchor.id, anchor);
      }
      if (entry.kind !== "decision") continue;
      const reviewAnchorId = entry.evidence.find((anchorId) => {
        const anchor = reviewAnchors.get(anchorId);
        return anchor?.candidateId === candidate.id
          && anchor.proposalHash === decision.proposalHash
          && anchor.currentCandidateHash === decision.currentCandidateHash
          && anchor.proposedCandidateHash === decision.proposedCandidateHash
          && anchor.reviewResultHash === decision.resultHash
          && anchor.verdict === decision.verdict;
      });
      if (!reviewAnchorId) continue;
      resolved = {
        investigationId: candidate.source.investigation,
        entryId: entry.id,
        entryHash: entry.entryHash,
        sequence: entry.sequence,
        author: entry.author,
        disposition: entry.disposition,
        statement: entry.statement,
        reviewAnchorId,
        reviewResultHash: decision.resultHash,
      };
    }
    return resolved;
  } catch {
    // Invalid or unavailable reasoning evidence must never suppress a
    // Candidate action. Investigation inspection will expose the exact repair.
    return null;
  }
}

export async function buildProjectWorkbenchSnapshot(project: CompiledFactoryProject): Promise<ProjectWorkbenchSnapshot> {
  const analysis = analyzeProduction(project);
  const capacity = planProductionCapacity(project);
  const [runs, experiments, candidates, programs] = await Promise.all([
    listRuns(project.rootDir),
    listBlueprintBenchmarks(project.rootDir),
    listCandidateChangeSets(project.rootDir),
    listDesignPrograms(project.rootDir),
  ]);
  const decisions = await Promise.all(candidates.map((candidate) => inspectCandidateDecision(project.rootDir, candidate.id)));
  const investigationEntries = new Map<string, Promise<IndustrialInvestigationEntry[]>>();
  const entriesForInvestigation = (investigationId: string): Promise<IndustrialInvestigationEntry[]> => {
    const existing = investigationEntries.get(investigationId);
    if (existing) return existing;
    const loading = import("./investigation").then(({ listIndustrialInvestigationEntries }) =>
      listIndustrialInvestigationEntries(project.rootDir, investigationId));
    investigationEntries.set(investigationId, loading);
    return loading;
  };
  const investigationDispositions = await Promise.all(candidates.map((candidate, index) =>
    currentInvestigationDisposition(candidate, decisions[index]!, entriesForInvestigation)));
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
      productionPlan: { id: project.selection.productionPlan, name: project.productionPlan.name },
      scenario: { id: project.selection.scenario, name: project.scenario.name, durationTicks: project.scenario.durationTicks },
      objective: { id: project.selection.objective, name: project.objective.name },
  };
  const runSummaries: ProjectWorkbenchSnapshot["runs"] = runs.map((run) => ({
    id: run.name,
    score: run.score,
    decision: run.manifest.decision,
    resultHash: run.manifest.resultHash,
    engineVersion: run.manifest.engineVersion,
    compatible: run.manifest.engineVersion === ENGINE_VERSION
      && sameProjectEvidenceIdentity(run.manifest.hashes, project.hashes),
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
        ...(decision.error ? { error: { ...decision.error } } : {}),
      },
      investigationDisposition: investigationDispositions[index] ?? null,
    };
  });
  const designCommissionings = candidates.flatMap((candidate, index) => {
    const commissioning = verifiedDesignCommissioningIdentity(candidate, decisions[index]!);
    return commissioning ? [commissioning] : [];
  });
  const experimentsById = new Map(experiments.map((experiment) => [experiment.id, experiment]));
  const classifiedDesignPrograms: ProjectWorkbenchSnapshot["designPrograms"] = await Promise.all(programs.map(async (program) => {
    const benchmark = experimentsById.get(program.benchmark)!;
    const promotionTarget = benchmark.candidateBlueprint;
    const reasons: ProjectWorkbenchSnapshot["designPrograms"][number]["alignment"]["reasons"] = [];
    if (!program.locked) reasons.push("unlocked-benchmark");
    if (program.seed.kind === "synthesis") reasons.push("synthesis-seed");
    else if (program.seed.blueprint !== selection.blueprint.id) reasons.push("seed-blueprint-mismatch");
    if (promotionTarget !== selection.blueprint.id) reasons.push("promotion-target-mismatch");
    let evidence: WorkbenchDesignProgramEvidence = {
      state: "not-applicable",
      authorityRunId: null,
      authorityAddressedLosses: [],
      currentRuns: 0,
      commissionedRuns: 0,
      historicalRuns: 0,
      invalidRuns: 0,
      runs: [],
      invalid: [],
    };
    if (!reasons.length && benchmark.contractHash) {
      const normalizedSeed = structuredClone(project.blueprint);
      normalizedSeed.revision = project.hashes.blueprintHash;
      const { hashes: _hashes, ...compiledSelection } = project;
      const normalizedExecutionHash = buildSelectionExecutionHash({
        ...compiledSelection,
        blueprint: normalizedSeed,
      });
      const indexed = await indexDesignRuns(project.rootDir, program.id);
      evidence = classifyDesignProgramEvidence({
        engineVersion: ENGINE_VERSION,
        project: project.manifest.id,
        program: { id: program.id, hash: program.programHash },
        benchmark: { id: benchmark.id, contractHash: benchmark.contractHash },
        seed: {
          source: structuredClone(program.seed),
          sourceBlueprintHash: project.hashes.blueprintHash,
          blueprintHash: hashValue(normalizedSeed),
        },
        driver: {
          selection: {
            world: selection.world.id,
            blueprint: selection.blueprint.id,
            productionPlan: selection.productionPlan.id,
            scenario: selection.scenario.id,
            objective: selection.objective.id,
          },
          hashes: projectEvidenceHashes({
            ...project.hashes,
            executionHash: normalizedExecutionHash,
            blueprintHash: hashValue(normalizedSeed),
          }),
        },
        promotionBase: { blueprint: promotionTarget, hash: project.hashes.blueprintHash },
      }, indexed.runs, indexed.invalidRuns, designCommissionings);
    }
    return {
      id: program.id,
      name: program.name,
      description: program.description,
      benchmark: program.benchmark,
      seed: structuredClone(program.seed),
      focus: structuredClone(program.focus),
      driverCase: program.driverCase,
      currentBestGuardrail: structuredClone(program.currentBestGuardrail),
      frontier: { ...program.frontier },
      budget: { ...program.budget },
      locked: program.locked,
      promotionTarget,
      alignment: { state: reasons.length ? "not-aligned" : "aligned", reasons },
      evidence,
    };
  }));
  const currentRun = matchingRun(selection, runSummaries);
  const currentArtifact = currentRun?.compatible ? runs.find((run) => run.name === currentRun.id) : undefined;
  const [currentMetrics, currentEvents, currentState] = currentArtifact
    ? await Promise.all([
      readJson(join(currentArtifact.path, "metrics.json")) as Promise<FactoryMetrics>,
      readFactoryEvents(join(currentArtifact.path, "events.ndjson")),
      readJson(join(currentArtifact.path, "final-state.json")) as Promise<FactoryState>,
    ])
    : [null, null, null];
  const lossAttribution = currentArtifact && Object.keys(project.routes).length
    ? analyzeFabLosses(
      currentMetrics!,
      project.scenario.durationTicks,
      { id: currentArtifact.name, resultHash: currentArtifact.manifest.resultHash },
      project,
      currentEvents!,
    )
    : null;
  const sourceLotServices = currentArtifact && currentMetrics && currentEvents && currentState
    ? analyzeSourceLotServices(project, currentEvents, currentMetrics, {
      id: currentArtifact.name,
      resultHash: currentArtifact.manifest.resultHash,
      endTick: currentState.tick,
    })
    : [];
  const diagnostics = projectDiagnostics(project, analysis, capacity, lossAttribution);
  const designProgramsWithDispositions = await Promise.all(classifiedDesignPrograms.map(async (projectedProgram) => {
    const sourceProgram = programs.find((program) => program.id === projectedProgram.id)!;
    const benchmark = experimentsById.get(projectedProgram.benchmark)!;
    const authorityRunId = projectedProgram.evidence.authorityRunId;
    if (projectedProgram.alignment.state !== "aligned" || !authorityRunId || !benchmark.contractHash) {
      return { program: projectedProgram, disposition: null };
    }
    const authority = await loadDesignRun(project.rootDir, projectedProgram.id, authorityRunId);
    const authorityAddressedLosses = [...new Set(authority.manifest.iterations.flatMap((iteration) =>
      iteration.addressedLoss ? [iteration.addressedLoss] : []))].sort();
    const disposition = deriveWorkbenchLossDisposition({
      id: sourceProgram.id,
      name: sourceProgram.name,
      benchmark: sourceProgram.benchmark,
      programHash: sourceProgram.programHash,
      benchmarkContractHash: benchmark.contractHash,
      authorityRunId,
    }, authority.manifest, {
      project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
      selection,
      hashes: project.hashes,
      diagnostics,
      lossAttribution,
    });
    return {
      program: {
        ...projectedProgram,
        evidence: { ...projectedProgram.evidence, authorityAddressedLosses },
      },
      disposition,
    };
  }));
  const designPrograms = designProgramsWithDispositions.map((item) => item.program);
  const lossDispositions = designProgramsWithDispositions.flatMap((item) =>
    item.disposition ? [item.disposition] : []).sort((left, right) =>
    left.diagnosticId.localeCompare(right.diagnosticId) || left.id.localeCompare(right.id));
  const operations = operationDescriptors(experiments, candidateSummaries, designPrograms);
  const flowWarnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const flowInfo = diagnostics.filter((diagnostic) => diagnostic.severity === "info").length;
  const pendingReviews = candidateSummaries.filter((candidate) =>
    candidate.decision.state === "proposed"
      || (candidate.decision.state === "reviewed-keep"
        && (!candidate.investigationDisposition
          || candidate.investigationDisposition.disposition === "keep"))).length;
  const disposedReviews = candidateSummaries.filter((candidate) =>
    candidate.investigationDisposition
      && candidate.investigationDisposition.disposition !== "keep").length;
  const staleReviews = candidateSummaries.filter((candidate) => candidate.decision.state === "stale").length;
  const verifiedReviews = candidateSummaries.filter((candidate) => candidate.decision.state === "verified").length;
  const snapshot = {
    version: 17 as const,
    project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
    selection,
    hashes: { ...project.hashes },
    objective: {
      targetResource: project.objective.targetResource,
      targetRegion: project.objective.targetRegion,
      targetRatePerMinute: project.objective.targetRatePerMinute,
      wipAccounting: structuredClone(project.objective.wipAccounting),
      deliveryContracts,
    },
    inventoryAccounting: currentMetrics
      ? { ...structuredClone(currentMetrics.inventoryAccounting), runId: currentArtifact!.name }
      : null,
    sourceLotLineage: currentMetrics
      ? { ...structuredClone(currentMetrics.sourceLotLineage), runId: currentArtifact!.name }
      : null,
    sourceLotServices,
    objectiveEvidence: currentMetrics
      ? buildWorkbenchObjectiveEvidence(project, currentArtifact!.name, currentMetrics)
      : null,
    status: {
      capacity: { state: capacity.ready ? "ready" as const : "blocked" as const, gapCount: capacity.gaps.length, gapsByKind },
      flow: { state: flowWarnings ? "at-risk" as const : "clear" as const, warningCount: flowWarnings, infoCount: flowInfo },
      evidence: { state: !currentRun ? "missing" as const : currentRun.compatible ? "current" as const : "incompatible" as const, runId: currentRun?.id ?? null },
      review: {
        state: pendingReviews ? "pending" as const : staleReviews ? "stale" as const : "clear" as const,
        pendingCount: pendingReviews,
        disposedCount: disposedReviews,
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
      designPrograms: designPrograms.length,
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
    designPrograms,
    candidates: candidateSummaries,
    diagnostics,
    lossAttribution,
    lossDispositions,
    operations,
  } satisfies Omit<ProjectWorkbenchSnapshot, "nextAction">;
  return { ...snapshot, nextAction: buildWorkbenchNextAction(snapshot) };
}

export async function openProjectWorkbenchSnapshot(projectDir: string, selection: ProjectSelection = {}): Promise<ProjectWorkbenchSnapshot> {
  return buildProjectWorkbenchSnapshot(compileFactoryProject(await loadFactoryProject(projectDir, selection)));
}

export async function openRunProjectWorkbenchSnapshot(
  projectDir: string,
  runId: string,
): Promise<ProjectWorkbenchSnapshot> {
  const run = (await listRuns(projectDir)).find((item) => item.name === runId);
  if (!run) throw new Error(`Unknown immutable run '${runId}'`);
  const blueprint = blueprintSchema.parse(await readJson(join(run.path, "blueprint.json")));
  const metrics = await readJson(join(run.path, "metrics.json")) as FactoryMetrics;
  const state = await readJson(join(run.path, "final-state.json")) as FactoryState;
  const events = await readFactoryEvents(join(run.path, "events.ndjson"));
  const resultHash = hashValue({ runKey: run.manifest.runKey, events, state, metrics });
  if (resultHash !== run.manifest.resultHash) {
    throw new Error(`Immutable run '${runId}' result hash does not match its saved events, final state, and metrics`);
  }
  const loaded = await loadFactoryProject(projectDir, run.manifest.selection);
  const project = compileFactoryProject({ ...loaded, blueprint });
  if (!sameProjectEvidenceIdentity(run.manifest.hashes, project.hashes)) {
    throw new Error(`Immutable run '${runId}' is not compatible with its exact saved Blueprint and selected project hashes`);
  }
  return buildProjectWorkbenchSnapshot(project);
}
