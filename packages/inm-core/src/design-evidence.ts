import { buildDesignProgramBrief, type DesignProgramBrief } from "./design-program";
import {
  listCandidateChangeSets,
  type CandidateChangeSet,
} from "./candidate-change-set";
import {
  inspectCandidateDecision,
  type CandidateDecision,
} from "./candidate-review";
import {
  indexDesignRuns,
  type DesignRunSummary,
  type InvalidDesignRunSummary,
} from "./design-run";
import type { FabLossBucketId } from "./fab-loss-analysis";
import { stableStringify } from "./utils";

export type WorkbenchDesignRunCurrentnessReason =
  | "engine-version-mismatch"
  | "project-mismatch"
  | "program-mismatch"
  | "program-hash-mismatch"
  | "benchmark-mismatch"
  | "benchmark-contract-mismatch"
  | "seed-source-mismatch"
  | "seed-source-hash-mismatch"
  | "seed-blueprint-hash-mismatch"
  | "driver-selection-mismatch"
  | "driver-hashes-mismatch"
  | "promotion-base-mismatch";

export type WorkbenchDesignEvidenceState = "not-applicable" | "missing" | "commissioned" | "promotable" | "continuable" | "exhausted";
export type WorkbenchDesignRunOutcome = "promotable" | "continuable" | "exhausted";

export interface WorkbenchDesignCommissioningIdentity {
  candidateId: string;
  benchmark: string;
  program: string;
  runId: string;
  sourceBlueprintHash: string;
  baseBlueprintHash: string;
  appliedBlueprintHash: string;
  proposalHash: string;
  reviewResultHash: string;
}

export interface WorkbenchDesignCommissioningEvidence extends WorkbenchDesignCommissioningIdentity {}

export interface WorkbenchDesignEvidenceIdentity {
  engineVersion: string;
  project: string;
  program: { id: string; hash: string };
  benchmark: { id: string; contractHash: string };
  seed: { source: DesignRunSummary["seed"]["source"]; sourceBlueprintHash: string; blueprintHash: string };
  driver: DesignRunSummary["driver"];
  promotionBase: DesignRunSummary["promotionBase"];
}

export interface WorkbenchDesignRunEvidence {
  id: string;
  currentness: {
    state: "current" | "commissioned" | "historical";
    reasons: WorkbenchDesignRunCurrentnessReason[];
    commissioning?: WorkbenchDesignCommissioningEvidence;
  };
  outcome: WorkbenchDesignRunOutcome;
  continuation: DesignRunSummary["continuation"];
  budget: DesignRunSummary["budget"];
  best: DesignRunSummary["best"];
  stopReason: DesignRunSummary["stopReason"];
}

export interface WorkbenchDesignProgramEvidence {
  state: WorkbenchDesignEvidenceState;
  authorityRunId: string | null;
  authorityAddressedLosses: FabLossBucketId[];
  currentRuns: number;
  commissionedRuns: number;
  historicalRuns: number;
  invalidRuns: number;
  runs: WorkbenchDesignRunEvidence[];
  invalid: Array<Pick<InvalidDesignRunSummary, "id" | "code" | "message">>;
}

export type DesignProgramEvidenceAction =
  | { kind: "run"; effect: "creates-artifact"; runId: null }
  | { kind: "open"; effect: "read-only"; runId: string }
  | { kind: "continue"; effect: "creates-artifact"; runId: string }
  | { kind: "promote"; effect: "creates-artifact"; runId: string };

export interface InspectedDesignProgramEvidence {
  brief: DesignProgramBrief;
  runs: DesignRunSummary[];
  invalidRuns: InvalidDesignRunSummary[];
  evidence: WorkbenchDesignProgramEvidence;
  action: DesignProgramEvidenceAction;
}

export function verifiedDesignCommissioningIdentity(
  candidate: CandidateChangeSet,
  decision: CandidateDecision,
): WorkbenchDesignCommissioningIdentity | null {
  if (!candidate.source
    || candidate.source.kind !== "design-run"
    || decision.state !== "verified"
    || decision.verdict !== "KEEP"
    || !decision.proposedCandidateHash
    || !decision.resultHash
    || candidate.source.blueprintHash !== decision.proposedCandidateHash
    || decision.currentCandidateHash !== decision.proposedCandidateHash) return null;
  return {
    candidateId: candidate.id,
    benchmark: candidate.benchmark,
    program: candidate.source.program,
    runId: candidate.source.resultHash,
    sourceBlueprintHash: candidate.source.blueprintHash,
    baseBlueprintHash: candidate.baseCandidateHash,
    appliedBlueprintHash: decision.proposedCandidateHash,
    proposalHash: decision.proposalHash,
    reviewResultHash: decision.resultHash,
  };
}

export async function listVerifiedDesignCommissionings(
  projectDir: string,
  programId?: string,
): Promise<WorkbenchDesignCommissioningIdentity[]> {
  const candidates = await listCandidateChangeSets(projectDir);
  const relevant = candidates.filter((candidate) =>
    candidate.source?.kind === "design-run"
    && (!programId || candidate.source.program === programId));
  const decisions = await Promise.all(relevant.map((candidate) => inspectCandidateDecision(projectDir, candidate.id)));
  return relevant.flatMap((candidate, index) => {
    const identity = verifiedDesignCommissioningIdentity(candidate, decisions[index]!);
    return identity ? [identity] : [];
  }).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}

export function designProgramEvidenceIdentity(brief: DesignProgramBrief): WorkbenchDesignEvidenceIdentity {
  return {
    engineVersion: brief.driver.hashes.engineVersion,
    project: brief.project.id,
    program: { id: brief.program.id, hash: brief.program.programHash },
    benchmark: { id: brief.benchmark.id, contractHash: brief.benchmark.contractHash },
    seed: {
      source: structuredClone(brief.seed.source),
      sourceBlueprintHash: brief.seed.sourceBlueprintHash,
      blueprintHash: brief.seed.blueprintHash,
    },
    driver: {
      selection: { ...brief.driver.selection },
      hashes: { ...brief.driver.hashes },
    },
    promotionBase: { ...brief.promotionBase },
  };
}

function designRunOutcome(run: DesignRunSummary): WorkbenchDesignRunOutcome {
  if (run.best.verdict === "KEEP" && run.best.promotionPatchOperations > 0) return "promotable";
  return run.stopReason === "budget-exhausted" ? "continuable" : "exhausted";
}

function designRunCurrentness(identity: WorkbenchDesignEvidenceIdentity, run: DesignRunSummary): WorkbenchDesignRunCurrentnessReason[] {
  const reasons: WorkbenchDesignRunCurrentnessReason[] = [];
  if (run.engineVersion !== identity.engineVersion) reasons.push("engine-version-mismatch");
  if (run.project !== identity.project) reasons.push("project-mismatch");
  if (run.program !== identity.program.id) reasons.push("program-mismatch");
  if (run.programHash !== identity.program.hash) reasons.push("program-hash-mismatch");
  if (run.benchmark !== identity.benchmark.id) reasons.push("benchmark-mismatch");
  if (run.benchmarkContractHash !== identity.benchmark.contractHash) reasons.push("benchmark-contract-mismatch");
  if (stableStringify(run.seed.source) !== stableStringify(identity.seed.source)) reasons.push("seed-source-mismatch");
  if (run.seed.sourceBlueprintHash !== identity.seed.sourceBlueprintHash) reasons.push("seed-source-hash-mismatch");
  if (run.seed.blueprintHash !== identity.seed.blueprintHash) reasons.push("seed-blueprint-hash-mismatch");
  if (stableStringify(run.driver.selection) !== stableStringify(identity.driver.selection)) reasons.push("driver-selection-mismatch");
  if (stableStringify(run.driver.hashes) !== stableStringify(identity.driver.hashes)) reasons.push("driver-hashes-mismatch");
  if (stableStringify(run.promotionBase) !== stableStringify(identity.promotionBase)) reasons.push("promotion-base-mismatch");
  return reasons;
}

function commissionedDesignRun(
  identity: WorkbenchDesignEvidenceIdentity,
  run: DesignRunSummary,
  reasons: WorkbenchDesignRunCurrentnessReason[],
  commissionings: WorkbenchDesignCommissioningIdentity[],
): WorkbenchDesignCommissioningEvidence | null {
  const allowedReasons = new Set<WorkbenchDesignRunCurrentnessReason>([
    "seed-source-hash-mismatch",
    "seed-blueprint-hash-mismatch",
    "driver-hashes-mismatch",
    "promotion-base-mismatch",
  ]);
  if (!reasons.length || reasons.some((reason) => !allowedReasons.has(reason))) return null;
  if (run.best.verdict !== "KEEP" || run.best.promotionPatchOperations <= 0) return null;
  if (run.driver.hashes.engineVersion !== identity.driver.hashes.engineVersion
    || run.driver.hashes.worldHash !== identity.driver.hashes.worldHash
    || run.driver.hashes.productionPlanHash !== identity.driver.hashes.productionPlanHash
    || run.driver.hashes.scenarioHash !== identity.driver.hashes.scenarioHash
    || run.driver.hashes.objectiveHash !== identity.driver.hashes.objectiveHash) return null;
  const matches = commissionings.filter((commissioning) =>
    commissioning.program === identity.program.id
    && commissioning.runId === run.id
    && commissioning.benchmark === identity.benchmark.id
    && commissioning.sourceBlueprintHash === run.best.blueprintHash
    && commissioning.sourceBlueprintHash === commissioning.appliedBlueprintHash
    && commissioning.baseBlueprintHash === run.promotionBase.hash
    && commissioning.appliedBlueprintHash === identity.promotionBase.hash
    && run.promotionBase.blueprint === identity.promotionBase.blueprint);
  return matches.length === 1 ? { ...matches[0]! } : null;
}

export function classifyDesignProgramEvidence(
  identity: WorkbenchDesignEvidenceIdentity,
  runs: DesignRunSummary[],
  invalidRuns: InvalidDesignRunSummary[],
  commissionings: WorkbenchDesignCommissioningIdentity[] = [],
): WorkbenchDesignProgramEvidence {
  const projected = runs.map((run): WorkbenchDesignRunEvidence => {
    const reasons = designRunCurrentness(identity, run);
    const commissioning = commissionedDesignRun(identity, run, reasons, commissionings);
    return {
      id: run.id,
      currentness: commissioning
        ? { state: "commissioned", reasons, commissioning }
        : { state: reasons.length ? "historical" : "current", reasons },
      outcome: designRunOutcome(run),
      continuation: structuredClone(run.continuation),
      budget: { ...run.budget },
      best: { ...run.best },
      stopReason: run.stopReason,
    };
  }).sort((left, right) =>
    (left.currentness.state === "current" ? 0 : left.currentness.state === "commissioned" ? 1 : 2)
    - (right.currentness.state === "current" ? 0 : right.currentness.state === "commissioned" ? 1 : 2)
    || left.id.localeCompare(right.id));
  const current = projected.filter((run) => run.currentness.state === "current");
  const commissioned = projected.filter((run) => run.currentness.state === "commissioned");
  const authorityPool = current.length ? current : commissioned;
  const continuedSources = new Set(authorityPool.flatMap((run) => run.continuation ? [run.continuation.sourceResultHash] : []));
  const leaves = authorityPool.filter((run) => !continuedSources.has(run.id));
  const authority = [...(leaves.length ? leaves : authorityPool)].sort((left, right) => {
    const rank = (outcome: WorkbenchDesignRunOutcome) => outcome === "promotable" ? 0 : outcome === "continuable" ? 1 : 2;
    return rank(left.outcome) - rank(right.outcome)
      || right.budget.evaluated - left.budget.evaluated
      || right.best.candidateScore - left.best.candidateScore
      || left.id.localeCompare(right.id);
  })[0] ?? null;
  return {
    state: authority?.currentness.state === "commissioned" ? "commissioned" : authority?.outcome ?? "missing",
    authorityRunId: authority?.id ?? null,
    authorityAddressedLosses: [],
    currentRuns: current.length,
    commissionedRuns: commissioned.length,
    historicalRuns: projected.length - current.length - commissioned.length,
    invalidRuns: invalidRuns.length,
    runs: projected,
    invalid: invalidRuns.map(({ id, code, message }) => ({ id, code, message })).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function recommendedDesignProgramEvidenceAction(evidence: WorkbenchDesignProgramEvidence): DesignProgramEvidenceAction {
  if (!evidence.authorityRunId || evidence.state === "missing" || evidence.state === "not-applicable") {
    return { kind: "run", effect: "creates-artifact", runId: null };
  }
  if (evidence.state === "promotable") return { kind: "promote", effect: "creates-artifact", runId: evidence.authorityRunId };
  if (evidence.state === "continuable") return { kind: "continue", effect: "creates-artifact", runId: evidence.authorityRunId };
  return { kind: "open", effect: "read-only", runId: evidence.authorityRunId };
}

export async function inspectDesignProgramEvidence(
  projectDir: string,
  programId: string,
): Promise<InspectedDesignProgramEvidence> {
  const [brief, indexed, commissionings] = await Promise.all([
    buildDesignProgramBrief(projectDir, programId),
    indexDesignRuns(projectDir, programId),
    listVerifiedDesignCommissionings(projectDir, programId),
  ]);
  const evidence = classifyDesignProgramEvidence(designProgramEvidenceIdentity(brief), indexed.runs, indexed.invalidRuns, commissionings);
  return {
    brief,
    ...indexed,
    evidence,
    action: recommendedDesignProgramEvidenceAction(evidence),
  };
}
