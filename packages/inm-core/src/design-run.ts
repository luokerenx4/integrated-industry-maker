import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { SCORE_BREAKDOWN_COMPONENTS, type Blueprint, type ScoreBreakdown } from "./types";
import type { BlueprintBenchmarkProgress, BlueprintBenchmarkResult } from "./benchmark";
import { evaluatePreparedBlueprintBenchmark, loadBlueprintBenchmark, prepareBlueprintBenchmark } from "./benchmark";
import { createBlueprintPatch, subtractScoreBreakdown } from "./blueprint-comparison";
import { writeCandidateChangeSet, type CandidateChangeSet } from "./candidate-change-set";
import { compileFactoryProject } from "./compiler";
import {
  currentBestCaseScoreRegressionLimit,
  designCurrentBestGuardrailSchema,
  designFrontierPolicySchema,
  designProgramHash,
  designSeedSchema,
  loadDesignProgram,
  prepareDesignProgram,
  type DesignCurrentBestGuardrail,
  type DesignDecisionFamily,
  type DesignFrontierPolicy,
  type DesignProgramBrief,
} from "./design-program";
import { ProjectProposalExhaustedError, ProjectStrategyResearchAgent } from "./design-proposal-provider";
import { loadFactoryProject, type LoadedFactoryProject } from "./loader";
import { analyzeProduction } from "./production-analysis";
import { planProductionCapacity } from "./capacity-plan";
import {
  applyResearchPatch,
  HeuristicResearchAgent,
  type ResearchBranchContext,
  type ResearchHistoryEntry,
  type ResearchPromotionBoundary,
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

export interface DesignCurrentBestCaseEvidence {
  id: string;
  name: string;
  previousBestScore: number;
  candidateScore: number;
  scoreDelta: number;
  previousBestScoreBreakdown: ScoreBreakdown;
  candidateScoreBreakdown: ScoreBreakdown;
  scoreBreakdownDelta: ScoreBreakdown;
  maximumScoreRegression: number | null;
  guardrailPassed: boolean;
}

export interface DesignDecisionEvidence {
  basis: "current-best-improvement" | "benchmark-gate" | "no-current-best-improvement" | "current-best-case-guardrail";
  aggregate: { previousBestScore: number; candidateScore: number; scoreDelta: number };
  cases: DesignCurrentBestCaseEvidence[];
  limitingCase: string;
  guardrail: { kind: DesignCurrentBestGuardrail["kind"]; passed: boolean; violations: string[] };
  gateReasons?: string[];
}

export type DesignSearchNodeId = "seed" | `candidate-${number}`;

export interface DesignFrontierPruneEvidence {
  nodeId: DesignSearchNodeId;
  reason: "dominated" | "capacity";
  byNodeId?: DesignSearchNodeId;
}

export interface DesignFrontierEvidence {
  parent: { nodeId: DesignSearchNodeId; role: "leader" | "alternative"; depth: number };
  candidateNodeId?: DesignSearchNodeId;
  parentScoreDelta?: number;
  outcome: "leader-promoted" | "branch-retained" | "rejected";
  reason: "leader-policy" | "pareto-frontier" | "benchmark-gate" | "parent-no-improvement" | "dominated" | "frontier-capacity" | "invalid-candidate";
  dominatedBy: DesignSearchNodeId[];
  pruned: DesignFrontierPruneEvidence[];
  leaderAfter: DesignSearchNodeId;
  alternativesAfter: DesignSearchNodeId[];
  searchOrderAfter: DesignSearchNodeId[];
  exhaustedAfter: DesignSearchNodeId[];
}

export interface DesignFrontierNodeSummary {
  nodeId: DesignSearchNodeId;
  parentNodeId?: DesignSearchNodeId;
  iteration: number;
  depth: number;
  role: "leader" | "alternative";
  searchStatus: "searchable" | "exhausted";
  blueprintHash: string;
  candidateScore: number;
  cases: Array<{ id: string; score: number }>;
}

export interface DesignSearchExhaustionEvidence {
  sequence: number;
  beforeIteration: number;
  node: { nodeId: DesignSearchNodeId; role: "leader" | "alternative"; depth: number };
  reason: "proposal-exhausted";
  searchOrderBefore: DesignSearchNodeId[];
  searchOrderAfter: DesignSearchNodeId[];
  exhaustedAfter: DesignSearchNodeId[];
  nextNodeId: DesignSearchNodeId | null;
}

export interface DesignRunIteration {
  iteration: number;
  strategy: string;
  decisionFamily: DesignDecisionFamily;
  hypothesis: string;
  expectedEffect?: string;
  addressedLoss?: FabLossBucketId;
  addressedCase?: string;
  driverEvidence: DesignDriverEvidence;
  promotionBoundary: ResearchPromotionBoundary;
  proposalHash: string;
  patch: ResearchProposal["patch"];
  candidateBlueprintHash?: string;
  decision: "KEEP" | "BRANCH" | "REJECT";
  evaluation?: BlueprintBenchmarkResult;
  decisionEvidence?: DesignDecisionEvidence;
  frontierEvidence: DesignFrontierEvidence;
  error?: string;
}

export interface DesignRunManifest {
  version: 2;
  status: "completed";
  engineVersion: string;
  project: string;
  program: { id: string; hash: string; currentBestGuardrail: DesignCurrentBestGuardrail; frontier: DesignFrontierPolicy };
  benchmark: { id: string; contractHash: string };
  seed: DesignProgramBrief["seed"] & { evaluation: BlueprintBenchmarkResult };
  promotionBase: DesignProgramBrief["promotionBase"];
  driver: DesignProgramBrief["driver"];
  continuation: null | {
    sourceResultHash: string;
    reusedIterations: number;
    reusedExhaustions: number;
    additionalCandidateBudget: number;
  };
  budget: { maximum: number; evaluated: number };
  iterations: DesignRunIteration[];
  exhaustions: DesignSearchExhaustionEvidence[];
  frontier: {
    leader: DesignSearchNodeId;
    alternatives: DesignSearchNodeId[];
    scheduler: { searchOrder: DesignSearchNodeId[]; exhausted: DesignSearchNodeId[] };
    nodes: DesignFrontierNodeSummary[];
  };
  best: {
    iteration: number;
    blueprintHash: string;
    promotionPatchOperations: number;
    candidateScore: number;
    scoreDelta: number;
    verdict: BlueprintBenchmarkResult["verdict"];
  };
  stopReason: "budget-exhausted" | "frontier-exhausted";
  resultHash: string;
}

export interface DesignRunResult {
  manifest: DesignRunManifest;
  bestBlueprint: Blueprint;
  artifact: { id: string; path: string; created: boolean };
}

interface DesignRunProgressBase {
  version: 2;
  sequence: number;
  program: string;
  benchmark: string;
  continuation: null | { sourceResultHash: string; reusedIterations: number };
  budget: { maximum: number; previousEvaluated: number; additional: number };
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
  | DesignRunProgressBase & { phase: "proposal-started"; iteration: number; branch: ResearchBranchContext; promotionBoundary: ResearchPromotionBoundary; driverEvidence: DesignDriverEvidence }
  | DesignRunProgressBase & { phase: "proposal-completed"; iteration: number; branch: ResearchBranchContext; promotionBoundary: ResearchPromotionBoundary; strategy: string; decisionFamily: DesignDecisionFamily; addressedLoss?: FabLossBucketId; addressedCase?: string; driverEvidence: DesignDriverEvidence; proposalHash: string }
  | DesignRunProgressBase & { phase: "node-exhausted"; exhaustion: DesignSearchExhaustionEvidence }
  | DesignRunProgressBase & {
    phase: "candidate-completed";
    iteration: number;
    strategy: string;
    addressedCase?: string;
    decision: "KEEP" | "BRANCH" | "REJECT";
    decisionEvidence?: DesignDecisionEvidence;
    frontierEvidence: DesignFrontierEvidence;
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
  continuation: DesignRunManifest["continuation"];
  budget: DesignRunManifest["budget"];
  best: DesignRunManifest["best"];
  stopReason: DesignRunManifest["stopReason"];
}

export interface InvalidDesignRunSummary {
  id: string;
  path: string;
  program: string;
  code: string;
  message: string;
}

export interface DesignRunEvidenceIndex {
  runs: DesignRunSummary[];
  invalidRuns: InvalidDesignRunSummary[];
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
  return evidence.fabLoss?.version === 4
    && typeof evidence.fabLoss.family === "string"
    && !Object.hasOwn(evidence.fabLoss, "run")
    && Array.isArray(evidence.fabLoss.chain)
    && Array.isArray(evidence.fabLoss.buckets)
    && evidence.fabLoss.buckets.every((bucket) => Array.isArray(bucket.contributors))
    && evidence.fabLoss.chain.every((id) => evidence.fabLoss!.buckets.some((bucket) => bucket.id === id));
}

function validScoreBreakdown(value: unknown): value is ScoreBreakdown {
  return Boolean(value) && typeof value === "object"
    && SCORE_BREAKDOWN_COMPONENTS.every((component) =>
      Number.isFinite((value as Record<string, unknown>)[component]));
}

function validDecisionEvidence(value: unknown): value is DesignDecisionEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as DesignDecisionEvidence;
  return Array.isArray(evidence.cases) && evidence.cases.length > 0
    && evidence.cases.every((item) =>
      validScoreBreakdown(item.previousBestScoreBreakdown)
      && validScoreBreakdown(item.candidateScoreBreakdown)
      && validScoreBreakdown(item.scoreBreakdownDelta));
}

function validPromotionBoundary(value: unknown): value is ResearchPromotionBoundary {
  if (!value || typeof value !== "object") return false;
  const boundary = value as ResearchPromotionBoundary;
  return Array.isArray(boundary.cases) && boundary.cases.length > 0
    && boundary.cases.every((item) =>
      validScoreBreakdown(item.leaderScoreBreakdown)
      && validScoreBreakdown(item.selectedScoreBreakdown)
      && validScoreBreakdown(item.scoreBreakdownDelta));
}

function validDesignRunIteration(value: unknown): value is DesignRunIteration {
  if (!value || typeof value !== "object") return false;
  const iteration = value as DesignRunIteration;
  return validDriverEvidence(iteration.driverEvidence)
    && validPromotionBoundary(iteration.promotionBoundary)
    && typeof iteration.frontierEvidence === "object"
    && /^[0-9a-f]{64}$/.test(iteration.proposalHash ?? "")
    && (iteration.addressedLoss === undefined
      || iteration.driverEvidence.fabLoss?.chain.includes(iteration.addressedLoss) === true)
    && (iteration.addressedCase === undefined
      || iteration.promotionBoundary.guardrail?.violations.includes(iteration.addressedCase) === true)
    && (iteration.error === undefined
      ? /^[0-9a-f]{64}$/.test(iteration.candidateBlueprintHash ?? "")
        && typeof iteration.evaluation === "object"
        && validDecisionEvidence(iteration.decisionEvidence)
      : typeof iteration.error === "string" && iteration.error.length > 0
        && iteration.decision === "REJECT"
        && iteration.candidateBlueprintHash === undefined
        && iteration.evaluation === undefined
        && iteration.decisionEvidence === undefined);
}

function currentBestDecisionEvidence(
  previousBest: BlueprintBenchmarkResult,
  candidate: BlueprintBenchmarkResult,
  policy: DesignCurrentBestGuardrail,
): DesignDecisionEvidence {
  if (previousBest.cases.length !== candidate.cases.length) throw new Error("Design current-best comparison changed locked Benchmark case count");
  const cases = candidate.cases.map((candidateCase, index): DesignCurrentBestCaseEvidence => {
    const previousCase = previousBest.cases[index]!;
    if (candidateCase.id !== previousCase.id || candidateCase.name !== previousCase.name) throw new Error(
      `Design current-best comparison changed locked Benchmark case ${index + 1}`,
    );
    const scoreDelta = candidateCase.candidateScore - previousCase.candidateScore;
    const maximumScoreRegression = currentBestCaseScoreRegressionLimit(policy, candidateCase.id);
    return {
      id: candidateCase.id,
      name: candidateCase.name,
      previousBestScore: previousCase.candidateScore,
      candidateScore: candidateCase.candidateScore,
      scoreDelta,
      previousBestScoreBreakdown: structuredClone(previousCase.candidateMetrics.scoreBreakdown),
      candidateScoreBreakdown: structuredClone(candidateCase.candidateMetrics.scoreBreakdown),
      scoreBreakdownDelta: subtractScoreBreakdown(
        previousCase.candidateMetrics.scoreBreakdown,
        candidateCase.candidateMetrics.scoreBreakdown,
      ),
      maximumScoreRegression,
      guardrailPassed: maximumScoreRegression === null || scoreDelta >= -maximumScoreRegression - 1e-9,
    };
  });
  const aggregate = {
    previousBestScore: previousBest.candidateScore,
    candidateScore: candidate.candidateScore,
    scoreDelta: candidate.candidateScore - previousBest.candidateScore,
  };
  const violations = cases.filter((item) => !item.guardrailPassed).map((item) => item.id);
  const guardrail = { kind: policy.kind, passed: violations.length === 0, violations };
  const basis: DesignDecisionEvidence["basis"] = !candidate.accepted
    ? "benchmark-gate"
    : aggregate.scoreDelta <= 1e-9
      ? "no-current-best-improvement"
      : !guardrail.passed ? "current-best-case-guardrail" : "current-best-improvement";
  const limitingCase = cases.reduce((limiting, item) => item.scoreDelta < limiting.scoreDelta ? item : limiting, cases[0]!);
  return {
    basis,
    aggregate,
    cases,
    limitingCase: limitingCase.id,
    guardrail,
    ...(basis === "benchmark-gate" ? { gateReasons: [...candidate.reasons] } : {}),
  };
}

function promotionBoundary(
  leader: DesignSearchNode,
  selected: DesignSearchNode,
  policy: DesignCurrentBestGuardrail,
): ResearchPromotionBoundary {
  const evidence = currentBestDecisionEvidence(leader.evaluation, selected.evaluation, policy);
  return {
    leaderNodeId: leader.nodeId,
    selectedNodeId: selected.nodeId,
    promotable: leader.nodeId === selected.nodeId,
    aggregate: {
      leaderScore: evidence.aggregate.previousBestScore,
      selectedScore: evidence.aggregate.candidateScore,
      scoreDelta: evidence.aggregate.scoreDelta,
    },
    cases: evidence.cases.map((item) => ({
      id: item.id,
      name: item.name,
      leaderScore: item.previousBestScore,
      selectedScore: item.candidateScore,
      scoreDelta: item.scoreDelta,
      leaderScoreBreakdown: structuredClone(item.previousBestScoreBreakdown),
      selectedScoreBreakdown: structuredClone(item.candidateScoreBreakdown),
      scoreBreakdownDelta: structuredClone(item.scoreBreakdownDelta),
      maximumScoreRegression: item.maximumScoreRegression,
      guardrailPassed: item.guardrailPassed,
    })),
    limitingCase: leader.nodeId === selected.nodeId ? null : evidence.limitingCase,
    guardrail: structuredClone(evidence.guardrail),
  };
}

interface DesignSearchNode {
  nodeId: DesignSearchNodeId;
  parentNodeId?: DesignSearchNodeId;
  iteration: number;
  depth: number;
  blueprintHash: string;
  evaluation: BlueprintBenchmarkResult;
  blueprint?: Blueprint;
  history: ResearchHistoryEntry[];
}

interface DesignFrontierState {
  leader: DesignSearchNodeId;
  searchOrder: DesignSearchNodeId[];
  exhausted: DesignSearchNodeId[];
  nodes: Map<DesignSearchNodeId, DesignSearchNode>;
}

function paretoDominates(left: BlueprintBenchmarkResult, right: BlueprintBenchmarkResult): boolean {
  if (left.cases.length !== right.cases.length) throw new Error("Design Pareto comparison changed locked Benchmark case count");
  let strictlyBetter = false;
  for (const [index, leftCase] of left.cases.entries()) {
    const rightCase = right.cases[index]!;
    if (leftCase.id !== rightCase.id) throw new Error(`Design Pareto comparison changed locked Benchmark case ${index + 1}`);
    const delta = leftCase.candidateScore - rightCase.candidateScore;
    if (delta < -1e-9) return false;
    if (delta > 1e-9) strictlyBetter = true;
  }
  return strictlyBetter;
}

function worstCaseDelta(node: DesignSearchNode, leader: DesignSearchNode): number {
  return node.evaluation.cases.reduce((worst, item, index) => {
    const leaderCase = leader.evaluation.cases[index]!;
    if (item.id !== leaderCase.id) throw new Error(`Design frontier ranking changed locked Benchmark case ${index + 1}`);
    return Math.min(worst, item.candidateScore - leaderCase.candidateScore);
  }, Number.POSITIVE_INFINITY);
}

function nodeSummary(node: DesignSearchNode, state: DesignFrontierState): DesignFrontierNodeSummary {
  return {
    nodeId: node.nodeId,
    ...(node.parentNodeId ? { parentNodeId: node.parentNodeId } : {}),
    iteration: node.iteration,
    depth: node.depth,
    role: node.nodeId === state.leader ? "leader" : "alternative",
    searchStatus: state.exhausted.includes(node.nodeId) ? "exhausted" : "searchable",
    blueprintHash: node.blueprintHash,
    candidateScore: node.evaluation.candidateScore,
    cases: node.evaluation.cases.map((item) => ({ id: item.id, score: item.candidateScore })),
  };
}

function frontierAlternatives(state: DesignFrontierState): DesignSearchNodeId[] {
  return [...state.nodes.keys()].filter((nodeId) => nodeId !== state.leader);
}

function frontierManifest(state: DesignFrontierState): DesignRunManifest["frontier"] {
  const alternatives = frontierAlternatives(state);
  const nodeOrder = [state.leader, ...alternatives];
  return {
    leader: state.leader,
    alternatives,
    scheduler: { searchOrder: [...state.searchOrder], exhausted: [...state.exhausted] },
    nodes: nodeOrder.map((nodeId) => nodeSummary(state.nodes.get(nodeId)!, state)),
  };
}

function exhaustSelectedFrontierNode(
  state: DesignFrontierState,
  sequence: number,
  beforeIteration: number,
): { state: DesignFrontierState; evidence: DesignSearchExhaustionEvidence } {
  const nodeId = state.searchOrder[0];
  if (!nodeId) throw new Error("Cannot exhaust a Design frontier with no searchable node");
  const node = state.nodes.get(nodeId)!;
  const searchOrder = state.searchOrder.slice(1);
  const exhausted = [...state.exhausted, nodeId];
  return {
    state: { ...state, searchOrder, exhausted },
    evidence: {
      sequence,
      beforeIteration,
      node: { nodeId, role: nodeId === state.leader ? "leader" : "alternative", depth: node.depth },
      reason: "proposal-exhausted",
      searchOrderBefore: [...state.searchOrder],
      searchOrderAfter: searchOrder,
      exhaustedAfter: exhausted,
      nextNodeId: searchOrder[0] ?? null,
    },
  };
}

function rejectedFrontierAttempt(
  state: DesignFrontierState,
  reason: DesignFrontierEvidence["reason"],
): { state: DesignFrontierState; evidence: DesignFrontierEvidence } {
  const parent = state.nodes.get(state.searchOrder[0]!)!;
  const searchOrder = [...state.searchOrder.slice(1), parent.nodeId];
  const next = { ...state, searchOrder };
  return {
    state: next,
    evidence: {
      parent: { nodeId: parent.nodeId, role: parent.nodeId === state.leader ? "leader" : "alternative", depth: parent.depth },
      outcome: "rejected",
      reason,
      dominatedBy: [],
      pruned: [],
      leaderAfter: state.leader,
      alternativesAfter: frontierAlternatives(next),
      searchOrderAfter: searchOrder,
      exhaustedAfter: [...state.exhausted],
    },
  };
}

function advanceDesignFrontier(
  state: DesignFrontierState,
  candidate: DesignSearchNode,
  leaderEvidence: DesignDecisionEvidence,
  policy: DesignFrontierPolicy,
): { state: DesignFrontierState; decision: DesignRunIteration["decision"]; evidence: DesignFrontierEvidence } {
  const parent = state.nodes.get(state.searchOrder[0]!)!;
  const parentScoreDelta = candidate.evaluation.candidateScore - parent.evaluation.candidateScore;
  const dominatedBy = [...state.nodes.values()]
    .filter((node) => paretoDominates(node.evaluation, candidate.evaluation))
    .map((node) => node.nodeId).sort();
  const promoted = leaderEvidence.basis === "current-best-improvement";
  const branchEligible = !promoted
    && candidate.evaluation.accepted
    && parentScoreDelta > 1e-9
    && dominatedBy.length === 0
    && policy.maximumAlternativeBranches > 0;

  if (!promoted && !branchEligible) {
    const reason: DesignFrontierEvidence["reason"] = !candidate.evaluation.accepted
      ? "benchmark-gate"
      : parentScoreDelta <= 1e-9
        ? "parent-no-improvement"
        : dominatedBy.length ? "dominated" : "frontier-capacity";
    const rejected = rejectedFrontierAttempt(state, reason);
    return {
      ...rejected,
      decision: "REJECT",
      evidence: { ...rejected.evidence, candidateNodeId: candidate.nodeId, parentScoreDelta, dominatedBy },
    };
  }

  const nodes = new Map(state.nodes);
  nodes.set(candidate.nodeId, candidate);
  let leader = state.leader;
  let searchOrder = branchEligible
    ? [candidate.nodeId, ...state.searchOrder.slice(1), parent.nodeId]
    : [...state.searchOrder.slice(1), parent.nodeId, candidate.nodeId];
  let exhausted = [...state.exhausted];
  if (promoted) leader = candidate.nodeId;
  const pruned: DesignFrontierPruneEvidence[] = [];

  for (const nodeId of [...nodes.keys()]) {
    if (nodeId === leader) continue;
    const node = nodes.get(nodeId)!;
    const dominator = [...nodes.values()]
      .filter((other) => other.nodeId !== nodeId && paretoDominates(other.evaluation, node.evaluation))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId))[0];
    if (!dominator) continue;
    nodes.delete(nodeId);
    searchOrder = searchOrder.filter((item) => item !== nodeId);
    exhausted = exhausted.filter((item) => item !== nodeId);
    pruned.push({ nodeId, reason: "dominated", byNodeId: dominator.nodeId });
  }

  const leaderNode = nodes.get(leader)!;
  const alternatives = [...nodes.values()].filter((node) => node.nodeId !== leader).sort((left, right) =>
    right.evaluation.candidateScore - left.evaluation.candidateScore
    || worstCaseDelta(right, leaderNode) - worstCaseDelta(left, leaderNode)
    || left.nodeId.localeCompare(right.nodeId));
  for (const node of alternatives.slice(policy.maximumAlternativeBranches)) {
    nodes.delete(node.nodeId);
    searchOrder = searchOrder.filter((item) => item !== node.nodeId);
    exhausted = exhausted.filter((item) => item !== node.nodeId);
    pruned.push({ nodeId: node.nodeId, reason: "capacity" });
  }

  const candidateRetained = nodes.has(candidate.nodeId);
  if (promoted) {
    searchOrder = [...searchOrder.filter((nodeId) => nodeId !== leader), leader];
  } else if (!candidateRetained) {
    searchOrder = [...searchOrder.filter((nodeId) => nodeId !== parent.nodeId), parent.nodeId];
  }
  const next: DesignFrontierState = { leader, searchOrder, exhausted, nodes };
  const decision: DesignRunIteration["decision"] = promoted ? "KEEP" : candidateRetained ? "BRANCH" : "REJECT";
  return {
    state: next,
    decision,
    evidence: {
      parent: { nodeId: parent.nodeId, role: parent.nodeId === state.leader ? "leader" : "alternative", depth: parent.depth },
      candidateNodeId: candidate.nodeId,
      parentScoreDelta,
      outcome: promoted ? "leader-promoted" : candidateRetained ? "branch-retained" : "rejected",
      reason: promoted ? "leader-policy" : candidateRetained ? "pareto-frontier" : "frontier-capacity",
      dominatedBy,
      pruned,
      leaderAfter: leader,
      alternativesAfter: frontierAlternatives(next),
      searchOrderAfter: searchOrder,
      exhaustedAfter: exhausted,
    },
  };
}

function validDesignDecisionSequence(manifest: DesignRunManifest): boolean {
  let state: DesignFrontierState = {
    leader: "seed",
    searchOrder: ["seed"],
    exhausted: [],
    nodes: new Map([["seed", {
      nodeId: "seed",
      iteration: 0,
      depth: 0,
      blueprintHash: manifest.seed.blueprintHash,
      evaluation: manifest.seed.evaluation,
      history: [],
    }]]),
  };
  try {
    let exhaustionIndex = 0;
    for (const [iterationIndex, iteration] of manifest.iterations.entries()) {
      if (iteration.iteration !== iterationIndex + 1) return false;
      while (manifest.exhaustions[exhaustionIndex]?.beforeIteration === iteration.iteration) {
        const expected = exhaustSelectedFrontierNode(state, exhaustionIndex + 1, iteration.iteration);
        if (stableStringify(manifest.exhaustions[exhaustionIndex]) !== stableStringify(expected.evidence)) return false;
        state = expected.state;
        exhaustionIndex++;
      }
      if (manifest.exhaustions[exhaustionIndex] && manifest.exhaustions[exhaustionIndex]!.beforeIteration < iteration.iteration) return false;
      const parentId = state.searchOrder[0];
      if (!parentId) return false;
      const parent = state.nodes.get(parentId)!;
      const leader = state.nodes.get(state.leader)!;
      const expectedPromotionBoundary = promotionBoundary(leader, parent, manifest.program.currentBestGuardrail);
      if (stableStringify(iteration.promotionBoundary) !== stableStringify(expectedPromotionBoundary)) return false;
      if (iteration.error !== undefined) {
        const rejected = rejectedFrontierAttempt(state, "invalid-candidate");
        if (iteration.decision !== "REJECT" || stableStringify(iteration.frontierEvidence) !== stableStringify(rejected.evidence)) return false;
        state = rejected.state;
        continue;
      }
      if (!iteration.evaluation || !iteration.decisionEvidence || !iteration.candidateBlueprintHash) return false;
      const expectedDecision = currentBestDecisionEvidence(leader.evaluation, iteration.evaluation, manifest.program.currentBestGuardrail);
      if (stableStringify(iteration.decisionEvidence) !== stableStringify(expectedDecision)) return false;
      const candidate: DesignSearchNode = {
        nodeId: `candidate-${iteration.iteration}`,
        parentNodeId: parent.nodeId,
        iteration: iteration.iteration,
        depth: parent.depth + 1,
        blueprintHash: iteration.candidateBlueprintHash,
        evaluation: iteration.evaluation,
        history: [],
      };
      const advanced = advanceDesignFrontier(state, candidate, expectedDecision, manifest.program.frontier);
      if (iteration.decision !== advanced.decision || stableStringify(iteration.frontierEvidence) !== stableStringify(advanced.evidence)) return false;
      state = advanced.state;
    }
    while (exhaustionIndex < manifest.exhaustions.length) {
      const expected = exhaustSelectedFrontierNode(state, exhaustionIndex + 1, manifest.iterations.length + 1);
      if (stableStringify(manifest.exhaustions[exhaustionIndex]) !== stableStringify(expected.evidence)) return false;
      state = expected.state;
      exhaustionIndex++;
    }
  } catch { return false; }
  const leader = state.nodes.get(state.leader)!;
  const continuationValid = manifest.continuation === null
    ? true
    : typeof manifest.continuation === "object"
      && /^[0-9a-f]{64}$/.test(manifest.continuation.sourceResultHash)
      && Number.isInteger(manifest.continuation.reusedIterations) && manifest.continuation.reusedIterations > 0
      && Number.isInteger(manifest.continuation.reusedExhaustions) && manifest.continuation.reusedExhaustions >= 0
      && Number.isInteger(manifest.continuation.additionalCandidateBudget) && manifest.continuation.additionalCandidateBudget > 0
      && manifest.continuation.reusedIterations < manifest.budget.maximum
      && manifest.continuation.reusedIterations + manifest.continuation.additionalCandidateBudget === manifest.budget.maximum
      && manifest.continuation.reusedIterations <= manifest.iterations.length
      && manifest.continuation.reusedExhaustions <= manifest.exhaustions.length;
  return continuationValid
    && stableStringify(manifest.frontier) === stableStringify(frontierManifest(state))
    && manifest.budget.evaluated === manifest.iterations.length
    && manifest.budget.evaluated <= manifest.budget.maximum
    && (manifest.stopReason === "budget-exhausted"
      ? manifest.budget.evaluated === manifest.budget.maximum && state.searchOrder.length > 0
      : manifest.budget.evaluated < manifest.budget.maximum && state.searchOrder.length === 0)
    && manifest.best.iteration === leader.iteration
    && manifest.best.blueprintHash === leader.blueprintHash
    && manifest.best.candidateScore === leader.evaluation.candidateScore
    && manifest.best.scoreDelta === leader.evaluation.scoreDelta
    && manifest.best.verdict === leader.evaluation.verdict;
}

function rebuildDesignFrontierState(
  manifest: DesignRunManifest,
  seedBlueprint: Blueprint,
  loaded: LoadedFactoryProject,
): DesignFrontierState {
  const seedHash = hashValue(seedBlueprint);
  if (seedHash !== manifest.seed.blueprintHash) throw new DesignRunError(
    "design.continuation-diverged",
    `Design run '${manifest.resultHash}' seed Blueprint no longer matches its recorded hash`,
    { expectedSeedHash: manifest.seed.blueprintHash, currentSeedHash: seedHash },
  );
  let state: DesignFrontierState = {
    leader: "seed",
    searchOrder: ["seed"],
    exhausted: [],
    nodes: new Map([["seed", {
      nodeId: "seed",
      iteration: 0,
      depth: 0,
      blueprintHash: seedHash,
      evaluation: manifest.seed.evaluation,
      blueprint: structuredClone(seedBlueprint),
      history: [],
    }]]),
  };
  let exhaustionIndex = 0;
  for (const iteration of manifest.iterations) {
    while (manifest.exhaustions[exhaustionIndex]?.beforeIteration === iteration.iteration) {
      const exhausted = exhaustSelectedFrontierNode(state, exhaustionIndex + 1, iteration.iteration);
      if (stableStringify(exhausted.evidence) !== stableStringify(manifest.exhaustions[exhaustionIndex])) throw new DesignRunError(
        "design.continuation-diverged",
        `Design run '${manifest.resultHash}' exhaustion ${exhaustionIndex + 1} cannot be reconstructed`,
      );
      state = exhausted.state;
      exhaustionIndex++;
    }
    const parent = state.nodes.get(state.searchOrder[0]!);
    if (!parent?.blueprint) throw new DesignRunError(
      "design.continuation-diverged",
      `Design run '${manifest.resultHash}' iteration ${iteration.iteration} has no reconstructable parent Blueprint`,
    );
    if (iteration.error !== undefined) {
      parent.history.push({
        iteration: iteration.iteration,
        strategy: iteration.strategy,
        hypothesis: iteration.hypothesis,
        ...(iteration.addressedLoss ? { addressedLoss: iteration.addressedLoss } : {}),
        ...(iteration.addressedCase ? { addressedCase: iteration.addressedCase } : {}),
        decision: "REVERT",
        score: parent.evaluation.candidateScore,
        scoreDelta: 0,
      });
      state = rejectedFrontierAttempt(state, "invalid-candidate").state;
      continue;
    }
    const candidateBlueprint = applyResearchPatch(parent.blueprint, iteration.patch);
    candidateBlueprint.revision = manifest.promotionBase.hash;
    compileFactoryProject(withBlueprint(loaded, candidateBlueprint));
    const candidateHash = hashValue(candidateBlueprint);
    if (candidateHash !== iteration.candidateBlueprintHash) throw new DesignRunError(
      "design.continuation-diverged",
      `Design run '${manifest.resultHash}' iteration ${iteration.iteration} Blueprint cannot be reconstructed`,
      { expectedCandidateHash: iteration.candidateBlueprintHash!, reconstructedCandidateHash: candidateHash },
    );
    const candidate: DesignSearchNode = {
      nodeId: `candidate-${iteration.iteration}`,
      parentNodeId: parent.nodeId,
      iteration: iteration.iteration,
      depth: parent.depth + 1,
      blueprintHash: candidateHash,
      evaluation: iteration.evaluation!,
      blueprint: candidateBlueprint,
      history: [],
    };
    const advanced = advanceDesignFrontier(state, candidate, iteration.decisionEvidence!, manifest.program.frontier);
    if (advanced.decision !== iteration.decision || stableStringify(advanced.evidence) !== stableStringify(iteration.frontierEvidence)) throw new DesignRunError(
      "design.continuation-diverged",
      `Design run '${manifest.resultHash}' iteration ${iteration.iteration} frontier cannot be reconstructed`,
    );
    parent.history.push({
      iteration: iteration.iteration,
      strategy: iteration.strategy,
      hypothesis: iteration.hypothesis,
      ...(iteration.addressedLoss ? { addressedLoss: iteration.addressedLoss } : {}),
      ...(iteration.addressedCase ? { addressedCase: iteration.addressedCase } : {}),
      decision: advanced.decision === "KEEP" ? "KEEP" : advanced.decision === "BRANCH" ? "BRANCH" : "REVERT",
      score: iteration.evaluation!.candidateScore,
      scoreDelta: iteration.evaluation!.candidateScore - parent.evaluation.candidateScore,
    });
    candidate.history = structuredClone(parent.history);
    state = advanced.state;
  }
  while (exhaustionIndex < manifest.exhaustions.length) {
    const exhausted = exhaustSelectedFrontierNode(state, exhaustionIndex + 1, manifest.iterations.length + 1);
    if (stableStringify(exhausted.evidence) !== stableStringify(manifest.exhaustions[exhaustionIndex])) throw new DesignRunError(
      "design.continuation-diverged",
      `Design run '${manifest.resultHash}' exhaustion ${exhaustionIndex + 1} cannot be reconstructed`,
    );
    state = exhausted.state;
    exhaustionIndex++;
  }
  if (stableStringify(frontierManifest(state)) !== stableStringify(manifest.frontier)) throw new DesignRunError(
    "design.continuation-diverged",
    `Design run '${manifest.resultHash}' final frontier cannot be reconstructed`,
  );
  return state;
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
  if (manifest.version !== 2 || manifest.status !== "completed" || manifest.program?.id !== programId || manifest.resultHash !== resultHash) {
    throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' manifest identity or completion state is invalid`);
  }
  if (!designCurrentBestGuardrailSchema.safeParse(manifest.program?.currentBestGuardrail).success
    || !designFrontierPolicySchema.safeParse(manifest.program?.frontier).success
    || !designSeedSchema.safeParse(manifest.seed?.source).success
    || !/^[0-9a-f]{64}$/.test(manifest.seed?.sourceBlueprintHash ?? "")
    || !/^[0-9a-f]{64}$/.test(manifest.seed?.blueprintHash ?? "")
    || typeof manifest.seed?.evaluation !== "object"
    || typeof manifest.promotionBase?.blueprint !== "string"
    || !/^[0-9a-f]{64}$/.test(manifest.promotionBase?.hash ?? "")
    || !Number.isInteger(manifest.best?.promotionPatchOperations)
    || manifest.best.promotionPatchOperations < 0
    || !Number.isInteger(manifest.budget?.maximum) || manifest.budget.maximum < 1
    || !Number.isInteger(manifest.budget?.evaluated) || manifest.budget.evaluated < 0
    || !Array.isArray(manifest.iterations) || !Array.isArray(manifest.exhaustions)
    || !manifest.frontier || !Array.isArray(manifest.frontier.nodes)
    || !Array.isArray(manifest.frontier.alternatives)
    || !Array.isArray(manifest.frontier.scheduler?.searchOrder) || !Array.isArray(manifest.frontier.scheduler?.exhausted)
    || (manifest.stopReason !== "budget-exhausted" && manifest.stopReason !== "frontier-exhausted")) {
    throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' manifest structure is invalid`);
  }
  if (manifest.iterations.some((iteration) => !validDesignRunIteration(iteration))) {
    throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' contains invalid Candidate evidence`);
  }
  if (!validDesignDecisionSequence(manifest)) {
    throw new DesignRunError("design.invalid-run", `Design run '${resultHash}' decision or frontier sequence is invalid`);
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
  if (manifest.continuation) {
    let source: DesignRunResult;
    try {
      source = await loadDesignRun(projectDir, programId, manifest.continuation.sourceResultHash);
    } catch (error) {
      throw new DesignRunError(
        "design.invalid-run",
        `Design run '${resultHash}' continuation source '${manifest.continuation.sourceResultHash}' is unavailable or invalid`,
      );
    }
    const lineageMatches = source.manifest.stopReason === "budget-exhausted"
      && source.manifest.frontier.scheduler.searchOrder.length > 0
      && source.manifest.budget.maximum === manifest.continuation.reusedIterations
      && source.manifest.budget.evaluated === manifest.continuation.reusedIterations
      && source.manifest.iterations.length === manifest.continuation.reusedIterations
      && source.manifest.exhaustions.length === manifest.continuation.reusedExhaustions
      && manifest.budget.maximum === source.manifest.budget.maximum + manifest.continuation.additionalCandidateBudget
      && stableStringify(manifest.iterations.slice(0, manifest.continuation.reusedIterations)) === stableStringify(source.manifest.iterations)
      && stableStringify(manifest.exhaustions.slice(0, manifest.continuation.reusedExhaustions)) === stableStringify(source.manifest.exhaustions)
      && stableStringify(manifest.program) === stableStringify(source.manifest.program)
      && stableStringify(manifest.benchmark) === stableStringify(source.manifest.benchmark)
      && stableStringify(manifest.seed) === stableStringify(source.manifest.seed)
      && stableStringify(manifest.promotionBase) === stableStringify(source.manifest.promotionBase)
      && stableStringify(manifest.driver) === stableStringify(source.manifest.driver);
    if (!lineageMatches) throw new DesignRunError(
      "design.invalid-run",
      `Design run '${resultHash}' does not contain an exact continuation prefix from '${source.manifest.resultHash}'`,
    );
  }
  return { manifest, bestBlueprint: parsedBlueprint.data, artifact: { id: resultHash, path, created: false } };
}

export async function indexDesignRuns(projectDir: string, programId?: string): Promise<DesignRunEvidenceIndex> {
  const root = join(projectDir, "design-runs");
  if (!await pathExists(root)) return { runs: [], invalidRuns: [] };
  const programIds = programId ? [programId] : (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name)).map((entry) => entry.name).sort();
  const runs: DesignRunSummary[] = [];
  const invalidRuns: InvalidDesignRunSummary[] = [];
  for (const id of programIds) {
    const programRoot = join(root, id);
    if (!await pathExists(programRoot)) continue;
    const resultIds = (await readdir(programRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[0-9a-f]{64}$/.test(entry.name)).map((entry) => entry.name).sort();
    for (const resultId of resultIds) {
      if (!await pathExists(join(programRoot, resultId, "manifest.json"))) continue;
      const path = join(programRoot, resultId);
      try {
        const run = await loadDesignRun(projectDir, id, resultId);
        runs.push({
          id: resultId,
          path: run.artifact.path,
          program: id,
          benchmark: run.manifest.benchmark.id,
          seed: structuredClone(run.manifest.seed.source),
          promotionBase: { ...run.manifest.promotionBase },
          continuation: structuredClone(run.manifest.continuation),
          budget: { ...run.manifest.budget },
          best: { ...run.manifest.best },
          stopReason: run.manifest.stopReason,
        });
      } catch (error) {
        invalidRuns.push({
          id: resultId,
          path,
          program: id,
          code: error instanceof DesignRunError ? error.code : "design.run-unreadable",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return { runs, invalidRuns };
}

export async function listDesignRuns(projectDir: string, programId?: string): Promise<DesignRunSummary[]> {
  return (await indexDesignRuns(projectDir, programId)).runs;
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
  options: { maxCandidates?: number; continueFrom?: string; onProgress?: DesignRunProgressHandler } = {},
): Promise<DesignRunResult> {
  const prepared = await prepareDesignProgram(projectDir, programId);
  const program = prepared.manifest;
  const brief = prepared.brief;
  const additionalMaximum = options.maxCandidates ?? program.budget.maxCandidates;
  if (!Number.isInteger(additionalMaximum) || additionalMaximum < 1) throw new Error("Design candidate budget must be a positive integer");
  if (additionalMaximum > program.budget.maxCandidates) throw new Error(
    `Design candidate budget ${additionalMaximum} exceeds Program '${program.id}' per-run maximum ${program.budget.maxCandidates}`,
  );
  const benchmark = prepared.benchmark;
  const source = options.continueFrom ? await loadDesignRun(projectDir, programId, options.continueFrom) : null;
  if (source) {
    if (source.manifest.stopReason !== "budget-exhausted" || !source.manifest.frontier.scheduler.searchOrder.length) throw new DesignRunError(
      "design.continuation-unavailable",
      `Design run '${source.manifest.resultHash}' has no budget-exhausted searchable frontier to continue`,
    );
    if (source.manifest.engineVersion !== ENGINE_VERSION
      || source.manifest.project !== brief.project.id
      || source.manifest.program.hash !== brief.program.programHash
      || source.manifest.benchmark.contractHash !== benchmark.lock!.contractHash
      || source.manifest.seed.blueprintHash !== brief.seed.blueprintHash
      || source.manifest.promotionBase.blueprint !== brief.promotionBase.blueprint
      || source.manifest.promotionBase.hash !== brief.promotionBase.hash
      || stableStringify(source.manifest.driver) !== stableStringify(brief.driver)) throw new DesignRunError(
        "design.continuation-stale",
        `Design run '${source.manifest.resultHash}' no longer matches the current engine, Program, Benchmark, seed, driver, or promotion base`,
      );
  }
  const previousEvaluated = source?.manifest.budget.evaluated ?? 0;
  const maximum = (source?.manifest.budget.maximum ?? 0) + additionalMaximum;
  let sequence = 0;
  let completedSimulations = 0;
  let plannedSimulations = benchmark.cases.length * (additionalMaximum + (source ? 1 : 2));
  const progressBase = (): DesignRunProgressBase => ({
    version: 2,
    sequence: ++sequence,
    program: program.id,
    benchmark: benchmark.id,
    continuation: source ? { sourceResultHash: source.manifest.resultHash, reusedIterations: source.manifest.iterations.length } : null,
    budget: { maximum, previousEvaluated, additional: additionalMaximum },
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
  const loaded = prepared.loaded;
  const seedBlueprint = structuredClone(prepared.seedBlueprint);
  const seedEvaluation = source?.manifest.seed.evaluation ?? await evaluatePreparedBlueprintBenchmark(preparedBenchmark, {
      candidateBlueprint: seedBlueprint,
      evaluationId: "seed",
      onProgress: benchmarkProgress("seed", 0),
    });
  const seedHash = hashValue(seedBlueprint);
  if (seedHash !== brief.seed.blueprintHash) throw new Error(`Design Program '${program.id}' resolved inconsistent seed identities`);
  const iterations: DesignRunIteration[] = source ? structuredClone(source.manifest.iterations) : [];
  const exhaustions: DesignSearchExhaustionEvidence[] = source ? structuredClone(source.manifest.exhaustions) : [];
  const projectAgent = program.proposal.kind === "project-strategy"
    ? new ProjectStrategyResearchAgent(projectDir, program.proposal.entry) : null;
  const heuristicAgent = program.proposal.kind === "heuristic"
    ? new HeuristicResearchAgent(program.proposal.decisionFamilies) : null;
  let stopReason: DesignRunManifest["stopReason"] = "budget-exhausted";
  let frontierState: DesignFrontierState;
  if (source) {
    try {
      frontierState = rebuildDesignFrontierState(source.manifest, seedBlueprint, loaded);
    } catch (error) {
      if (error instanceof DesignRunError) throw error;
      throw new DesignRunError(
        "design.continuation-diverged",
        `Design run '${source.manifest.resultHash}' cannot be reconstructed against the current project: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    frontierState = {
      leader: "seed",
      searchOrder: ["seed"],
      exhausted: [],
      nodes: new Map([["seed", {
        nodeId: "seed",
        iteration: 0,
        depth: 0,
        blueprintHash: seedHash,
        evaluation: seedEvaluation,
        blueprint: seedBlueprint,
        history: [],
      }]]),
    };
  }

  while (iterations.length < maximum) {
    const iteration = iterations.length + 1;
    const selectedNodeId = frontierState.searchOrder[0];
    if (!selectedNodeId) {
      stopReason = "frontier-exhausted";
      break;
    }
    const parent = frontierState.nodes.get(selectedNodeId)!;
    const leader = frontierState.nodes.get(frontierState.leader)!;
    const driverProject = compileFactoryProject(withBlueprint(loaded, parent.blueprint!));
    const driverResult = runUntil(driverProject, undefined, { seed: driverCase.seed });
    const driverEvidence: DesignDriverEvidence = {
      metricsHash: hashValue(driverResult.metrics),
      fabLoss: analyzeFabLossProfile(driverResult.metrics, driverProject.scenario.durationTicks, driverProject, driverResult.events),
    };
    const history = structuredClone(parent.history);
    const branch: ResearchBranchContext = {
      nodeId: parent.nodeId,
      ...(parent.parentNodeId ? { parentNodeId: parent.parentNodeId } : {}),
      role: parent.nodeId === frontierState.leader ? "leader" : "alternative",
      depth: parent.depth,
      leaderNodeId: frontierState.leader,
    };
    const selectedPromotionBoundary = promotionBoundary(leader, parent, program.currentBestGuardrail);
    let proposal: ResearchProposal;
    emit({ phase: "proposal-started", iteration, branch, promotionBoundary: selectedPromotionBoundary, driverEvidence });
    try {
      const input = {
        iteration,
        project: driverProject,
        blueprint: parent.blueprint!,
        metrics: driverResult.metrics,
        fabLoss: driverEvidence.fabLoss,
        production: analyzeProduction(driverProject),
        capacityPlan: planProductionCapacity(driverProject),
        history,
      };
      proposal = projectAgent
        ? await projectAgent.propose({ ...input, branch, promotionBoundary: selectedPromotionBoundary })
        : await heuristicAgent!.propose(input);
    } catch (error) {
      if (error instanceof ProjectProposalExhaustedError
        || (error instanceof Error && error.message.startsWith("Heuristic agent found no valid blueprint strategy"))) {
        const exhausted = exhaustSelectedFrontierNode(frontierState, exhaustions.length + 1, iteration);
        frontierState = exhausted.state;
        exhaustions.push(exhausted.evidence);
        emit({ phase: "node-exhausted", exhaustion: exhausted.evidence });
        if (!frontierState.searchOrder.length) stopReason = "frontier-exhausted";
        continue;
      }
      throw error;
    }
    const strategy = proposal.strategy ?? hashValue(proposal.patch);
    const family = decisionFamily(strategy, program.proposal.decisionFamilies);
    const proposalHash = hashValue({ strategy, hypothesis: proposal.hypothesis, expectedEffect: proposal.expectedEffect, addressedLoss: proposal.addressedLoss, addressedCase: proposal.addressedCase, patch: proposal.patch });
    emit({ phase: "proposal-completed", iteration, branch, promotionBoundary: selectedPromotionBoundary, strategy, decisionFamily: family, ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}), ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}), driverEvidence, proposalHash });
    try {
      const candidateBlueprint = applyResearchPatch(parent.blueprint!, proposal.patch);
      // Every accumulated best remains promotable as one exact Candidate patch from
      // the declared seed; revision lineage belongs to Candidate apply, not search order.
      candidateBlueprint.revision = brief.promotionBase.hash;
      compileFactoryProject(withBlueprint(loaded, candidateBlueprint));
      const evaluation = await evaluatePreparedBlueprintBenchmark(preparedBenchmark, {
        candidateBlueprint,
        evaluationId: `candidate-${iteration}`,
        onProgress: benchmarkProgress("candidate", iteration),
      });
      const decisionEvidence = currentBestDecisionEvidence(leader.evaluation, evaluation, program.currentBestGuardrail);
      const candidateNode: DesignSearchNode = {
        nodeId: `candidate-${iteration}`,
        parentNodeId: parent.nodeId,
        iteration,
        depth: parent.depth + 1,
        blueprintHash: hashValue(candidateBlueprint),
        evaluation,
        blueprint: candidateBlueprint,
        history: [],
      };
      const advanced = advanceDesignFrontier(frontierState, candidateNode, decisionEvidence, program.frontier);
      const historyEntry: ResearchHistoryEntry = {
        iteration,
        strategy,
        hypothesis: proposal.hypothesis,
        ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}),
        ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}),
        decision: advanced.decision === "KEEP" ? "KEEP" : advanced.decision === "BRANCH" ? "BRANCH" : "REVERT",
        score: evaluation.candidateScore,
        scoreDelta: evaluation.candidateScore - parent.evaluation.candidateScore,
      };
      parent.history.push(historyEntry);
      candidateNode.history = structuredClone(parent.history);
      iterations.push({
        iteration,
        strategy,
        decisionFamily: family,
        hypothesis: proposal.hypothesis,
        ...(proposal.expectedEffect ? { expectedEffect: proposal.expectedEffect } : {}),
        ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}),
        ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}),
        driverEvidence,
        promotionBoundary: selectedPromotionBoundary,
        proposalHash,
        patch: proposal.patch,
        candidateBlueprintHash: candidateNode.blueprintHash,
        decision: advanced.decision,
        evaluation,
        decisionEvidence,
        frontierEvidence: advanced.evidence,
      });
      frontierState = advanced.state;
      emit({
        phase: "candidate-completed",
        iteration,
        strategy,
        ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}),
        decision: advanced.decision,
        decisionEvidence,
        frontierEvidence: advanced.evidence,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rejected = rejectedFrontierAttempt(frontierState, "invalid-candidate");
      parent.history.push({
        iteration,
        strategy,
        hypothesis: proposal.hypothesis,
        ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}),
        ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}),
        decision: "REVERT",
        score: parent.evaluation.candidateScore,
        scoreDelta: 0,
      });
      iterations.push({
        iteration,
        strategy,
        decisionFamily: family,
        hypothesis: proposal.hypothesis,
        ...(proposal.expectedEffect ? { expectedEffect: proposal.expectedEffect } : {}),
        ...(proposal.addressedLoss ? { addressedLoss: proposal.addressedLoss } : {}),
        ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}),
        driverEvidence,
        promotionBoundary: selectedPromotionBoundary,
        proposalHash,
        patch: proposal.patch,
        decision: "REJECT",
        frontierEvidence: rejected.evidence,
        error: message,
      });
      frontierState = rejected.state;
      emit({ phase: "candidate-completed", iteration, strategy, ...(proposal.addressedCase ? { addressedCase: proposal.addressedCase } : {}), decision: "REJECT", frontierEvidence: rejected.evidence, error: message });
    }
  }

  const bestNode = frontierState.nodes.get(frontierState.leader)!;
  const bestBlueprint = bestNode.blueprint!;
  const bestEvaluation = bestNode.evaluation;

  const withoutHash: Omit<DesignRunManifest, "resultHash"> = {
    version: 2,
    status: "completed",
    engineVersion: ENGINE_VERSION,
    project: brief.project.id,
    program: { id: program.id, hash: brief.program.programHash, currentBestGuardrail: structuredClone(program.currentBestGuardrail), frontier: { ...program.frontier } },
    benchmark: { id: benchmark.id, contractHash: benchmark.lock!.contractHash },
    seed: { ...structuredClone(brief.seed), evaluation: seedEvaluation },
    promotionBase: { ...brief.promotionBase },
    driver: brief.driver,
    continuation: source ? {
      sourceResultHash: source.manifest.resultHash,
      reusedIterations: source.manifest.iterations.length,
      reusedExhaustions: source.manifest.exhaustions.length,
      additionalCandidateBudget: additionalMaximum,
    } : null,
    budget: { maximum, evaluated: iterations.length },
    iterations,
    exhaustions,
    frontier: frontierManifest(frontierState),
    best: {
      iteration: bestNode.iteration,
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
  plannedSimulations = completedSimulations;
  emit({ phase: "run-completed", resultHash: manifest.resultHash, stopReason: manifest.stopReason, best: manifest.best });
  return { manifest, bestBlueprint, artifact };
}

export async function continueDesignRun(
  projectDir: string,
  programId: string,
  sourceResultHash: string,
  options: { maxCandidates?: number; onProgress?: DesignRunProgressHandler } = {},
): Promise<DesignRunResult> {
  return runDesignProgram(projectDir, programId, { ...options, continueFrom: sourceResultHash });
}
