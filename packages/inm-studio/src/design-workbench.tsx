import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BlueprintBenchmarkProgress, CandidateChangeSet, DesignDecisionEvidence, DesignProgramBrief, DesignProgramSummary, DesignRunProgress, DesignRunResult, DesignRunSummary, InvalidDesignRunSummary, ResearchPromotionBoundary } from "@inm/core";
import { CadenceControlEvidence } from "./cadence-control-evidence";
import { ScoreBreakdownDetails } from "./score-breakdown";
import { cancelStudioOperation, followStudioOperation, listStudioOperations, readStudioOperation, startStudioOperation } from "./studio-operation-client";
import { isTerminalOperationExecution, type OperationExecutionSnapshot } from "@inm/core/operation-execution";

class DesignResponseError extends Error {
  constructor(public readonly code: string | null, public readonly detail: string) {
    super(`${code ? `[${code}] ` : ""}${detail}`);
    this.name = "DesignResponseError";
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new DesignResponseError(
    typeof value.code === "string" ? value.code : null,
    value.error ?? `Request failed (${response.status})`,
  );
  return value;
}

export interface DesignRunSelectionIssue {
  runId: string;
  code: string;
  message: string;
}

export function designRunSelectionIssue(code: string | null, message: string, runId: string): DesignRunSelectionIssue | null {
  if (code !== "design.invalid-run" && code !== "design.run-not-found") return null;
  return { runId, code, message };
}

function scoreDriverCase(evidence: DesignDecisionEvidence) {
  const target = evidence.guardrail.violations[0] ?? evidence.limitingCase;
  return evidence.cases.find((item) => item.id === target) ?? evidence.cases[0]!;
}

const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;
const shortHash = (value: string) => value.slice(0, 12);

function decisionDetail(evidence: DesignDecisionEvidence): string {
  const limiting = evidence.cases.find((item) => item.id === evidence.limitingCase)!;
  const violation = evidence.guardrail.violations.length
    ? evidence.cases.find((item) => item.id === evidence.guardrail.violations[0])!
    : null;
  const basis = evidence.basis === "current-best-improvement"
    ? "IMPROVES CURRENT BEST"
    : evidence.basis === "benchmark-gate"
      ? "FAILS LOCKED GATE"
      : evidence.basis === "current-best-case-guardrail"
        ? "FAILS CURRENT-BEST CASE GUARDRAIL"
        : evidence.basis === "addressed-loss-not-improved"
          ? "DOES NOT IMPROVE ADDRESSED LOSS"
          : "NO CURRENT-BEST IMPROVEMENT";
  const gate = evidence.gateReasons?.[0] ? ` · ${evidence.gateReasons[0]}` : "";
  if (evidence.basis === "current-best-case-guardrail" && violation) return `${basis} · ${violation.id} ${signed(violation.scoreDelta)} · ALLOWED REGRESSION ${violation.maximumScoreRegression!.toFixed(6)}`;
  return `${basis}${gate} · LIMITING ${limiting.id} ${signed(limiting.scoreDelta)}`;
}

function promotionBoundaryDetail(boundary: ResearchPromotionBoundary): string {
  if (boundary.promotable) return "PROMOTION-READY LEADER";
  const blocker = boundary.cases.find((item) => item.id === boundary.guardrail.violations[0]);
  if (blocker) return `BLOCKED BY ${blocker.id} ${signed(blocker.scoreDelta)} · ALLOWED ${blocker.maximumScoreRegression!.toFixed(6)}`;
  return `ALTERNATIVE VS LEADER ${signed(boundary.aggregate.scoreDelta)}`;
}

function guardrailDetail(program: DesignProgramSummary): { title: string; detail: string } {
  const policy = program.currentBestGuardrail;
  if (policy.kind === "unrestricted") return { title: "UNRESTRICTED", detail: "aggregate improvement may trade operating cases" };
  if (policy.kind === "uniform") return { title: `MAX ${policy.maximumCaseScoreRegression.toFixed(6)}`, detail: "regression per current-best case" };
  return { title: `${Object.keys(policy.maximumCaseScoreRegression).length} CASE BUDGETS`, detail: "explicit current-best regression limits" };
}

function caseExecutionLabel(execution: BlueprintBenchmarkProgress["execution"]): string {
  if (execution.mode === "isolated") return " · isolated worker";
  return execution.mode === "parallel" ? ` · parallel ×${execution.concurrency}` : "";
}

function progressLabel(progress: DesignRunProgress): { title: string; detail: string } {
  if (progress.phase === "run-started") return progress.continuation
    ? { title: "REBUILDING VERIFIED FRONTIER", detail: `${shortHash(progress.continuation.sourceResultHash)} · ${progress.continuation.reusedIterations} reused iterations · ${progress.budget.additional} new candidates` }
    : { title: "PREPARING LOCKED BASELINE", detail: `${progress.caseCount} operating cases · ${progress.work.plannedCases} planned case evaluations` };
  if (progress.phase === "case-started" || progress.phase === "case-completed") return {
    title: `${progress.evaluation.kind.toUpperCase()} · CASE ${progress.case.index}/${progress.case.total}`,
    detail: `${progress.case.id} · ${progress.phase === "case-started"
      ? `evaluating${caseExecutionLabel(progress.execution)}`
      : `complete${progress.cached ? " · reused" : ""}${caseExecutionLabel(progress.execution)}${progress.timing.workerReused === undefined ? "" : progress.timing.workerReused ? ` · warm worker #${(progress.timing.workerSlot ?? 0) + 1}` : ` · cold worker #${(progress.timing.workerSlot ?? 0) + 1} · ${(progress.timing.workerStartupMs ?? 0).toFixed(0)} ms startup`}${progress.timing.durationMs === undefined ? "" : ` · ${progress.timing.durationMs.toFixed(0)} ms`}${progress.candidateScore === undefined ? "" : ` · score ${progress.candidateScore.toFixed(6)}`}`}`,
  };
  if (progress.phase === "driver-replay-started" || progress.phase === "driver-replay-completed") return {
    title: "RECOVERING HISTORICAL DRIVER TRACE",
    detail: `${progress.nodeId} · ${progress.case.id}${progress.phase === "driver-replay-completed" ? ` · ${progress.durationMs.toFixed(0)} ms` : ""}`,
  };
  if (progress.phase === "proposal-started") return {
    title: `DIAGNOSING ITERATION ${progress.iteration}`,
    detail: `${progress.branch.role.toUpperCase()} ${progress.branch.nodeId} · ${promotionBoundaryDetail(progress.promotionBoundary)} · ${progress.driverEvidence.fabLoss?.chain.join(" → ") ?? "No tracked fab loss in the driver simulation"}`,
  };
  if (progress.phase === "proposal-completed") return {
    title: `PROPOSAL ${progress.iteration} READY`,
    detail: `${progress.branch.nodeId} → ${progress.strategy}${progress.addressedCase ? ` · repairs ${progress.addressedCase}` : progress.addressedLoss ? ` · addresses ${progress.addressedLoss}` : ""}`,
  };
  if (progress.phase === "loss-target-completed") return {
    title: `CAUSAL TARGET ${progress.lossTargetEvidence.improved ? "IMPROVED" : "NOT IMPROVED"}`,
    detail: `${progress.lossTargetEvidence.target.contributor}.${progress.lossTargetEvidence.target.metric} · ${progress.lossTargetEvidence.before} → ${progress.lossTargetEvidence.after} · Δ ${signed(progress.lossTargetEvidence.delta)}`,
  };
  if (progress.phase === "node-exhausted") return {
    title: `${progress.exhaustion.node.nodeId.toUpperCase()} SEARCH EXHAUSTED`,
    detail: `${progress.exhaustion.node.role.toUpperCase()} retained in the Pareto frontier · next ${progress.exhaustion.nextNodeId ?? "no searchable node"}`,
  };
  if (progress.phase === "candidate-completed") return { title: `ITERATION ${progress.iteration} · ${progress.decision}`, detail: !progress.decisionEvidence ? progress.error ?? progress.strategy : `${progress.frontierEvidence.parent.nodeId} → ${progress.frontierEvidence.outcome}${progress.addressedCase ? ` · repaired ${progress.addressedCase}` : ""} · leader ${signed(progress.decisionEvidence.aggregate.scoreDelta)} · ${decisionDetail(progress.decisionEvidence)}` };
  if (progress.phase === "run-completed") return { title: "IMMUTABLE RESULT READY", detail: `${shortHash(progress.resultHash)} · best iteration ${progress.best.iteration}` };
  return { title: "DESIGN RUNNING", detail: progress.phase };
}

type CompletedDesignCaseProgress = DesignRunProgress & { phase: "case-completed" };

export function latestCompletedDesignCase(
  progressLog: OperationExecutionSnapshot["progressLog"],
): CompletedDesignCaseProgress | null {
  for (let index = progressLog.length - 1; index >= 0; index--) {
    const progress = progressLog[index];
    if (progress && "program" in progress && progress.phase === "case-completed") {
      return progress as CompletedDesignCaseProgress;
    }
  }
  return null;
}

function completedCaseLabel(progress: CompletedDesignCaseProgress): string {
  return `LAST ${progress.evaluation.kind.toUpperCase()} · ${progress.case.id} · ${progress.cached ? "reused" : "simulated"}${caseExecutionLabel(progress.execution)}${progress.timing.workerReused === undefined ? "" : progress.timing.workerReused ? " · warm worker" : ` · cold worker · ${(progress.timing.workerStartupMs ?? 0).toFixed(0)} ms startup`}${progress.timing.durationMs === undefined ? "" : ` · ${progress.timing.durationMs.toFixed(0)} ms`}`;
}

export function DesignWorkbench({
  projectId, programs, selectedProgramId, selectedRunId, onSelectProgram, onSelectRun, onCandidate, onClose,
}: {
  projectId: string;
  programs: DesignProgramSummary[];
  selectedProgramId: string | null;
  selectedRunId: string | null;
  onSelectProgram: (id: string) => void;
  onSelectRun: (id: string | null) => void;
  onCandidate: (benchmarkId: string, candidateId: string) => void;
  onClose: () => void;
}) {
  const selectedProgram = useMemo(() => programs.find((item) => item.id === selectedProgramId) ?? null, [programs, selectedProgramId]);
  const [brief, setBrief] = useState<DesignProgramBrief | null>(null);
  const [runs, setRuns] = useState<DesignRunSummary[]>([]);
  const [invalidRuns, setInvalidRuns] = useState<InvalidDesignRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<DesignRunResult | null>(null);
  const [selectedRunIssue, setSelectedRunIssue] = useState<DesignRunSelectionIssue | null>(null);
  const [budget, setBudget] = useState(1);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<DesignRunProgress | null>(null);
  const [lastCompletedCase, setLastCompletedCase] = useState<CompletedDesignCaseProgress | null>(null);
  const [activeOperation, setActiveOperation] = useState<OperationExecutionSnapshot<DesignRunResult> | null>(null);
  const pollAbort = useRef<AbortController | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [promoted, setPromoted] = useState<CandidateChangeSet | null>(null);
  const [commissionedCandidate, setCommissionedCandidate] = useState<CandidateChangeSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedBestEvaluation = useMemo(() => {
    if (!selectedRun) return null;
    if (selectedRun.manifest.best.iteration === 0) return selectedRun.manifest.seed.evaluation;
    return selectedRun.manifest.iterations.find((item) =>
      item.iteration === selectedRun.manifest.best.iteration)?.evaluation ?? null;
  }, [selectedRun]);
  const selectedRunAccepted = selectedRun?.manifest.best.verdict === "KEEP"
    && selectedRun.manifest.best.promotionPatchOperations > 0;
  const selectedRunBaseCurrent = Boolean(brief && selectedRun
    && brief.promotionBase.blueprint === selectedRun.manifest.promotionBase.blueprint
    && brief.promotionBase.hash === selectedRun.manifest.promotionBase.hash);
  const selectedRunAlreadyCommissioned = Boolean(brief && selectedRun && selectedRunAccepted
    && brief.promotionBase.blueprint === selectedRun.manifest.promotionBase.blueprint
    && brief.promotionBase.hash === selectedRun.manifest.best.blueprintHash);
  const selectedRunPromotable = selectedRunAccepted && selectedRunBaseCurrent;
  const selectedRunContinuable = selectedRun?.manifest.stopReason === "budget-exhausted"
    && selectedRun.manifest.frontier.scheduler.searchOrder.length > 0
    && selectedRunBaseCurrent;

  useEffect(() => {
    if (!selectedProgramId && programs[0]) onSelectProgram(programs[0].id);
  }, [onSelectProgram, programs, selectedProgramId]);

  const loadProgram = async (programId: string) => {
    const value = await responseJson<{ brief: DesignProgramBrief; runs: DesignRunSummary[]; invalidRuns: InvalidDesignRunSummary[] }>(await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(programId)}`,
    ));
    setBrief(value.brief);
    setRuns(value.runs.sort((left, right) => right.best.candidateScore - left.best.candidateScore
      || right.budget.evaluated - left.budget.evaluated
      || left.id.localeCompare(right.id)));
    setInvalidRuns(value.invalidRuns);
    setBudget(Math.min(1, value.brief.program.budget.maxCandidates));
  };

  useEffect(() => {
    pollAbort.current?.abort();
    setRunning(false); setActiveOperation(null); setBrief(null); setRuns([]); setInvalidRuns([]); setSelectedRun(null); setSelectedRunIssue(null); setPromoted(null); setCommissionedCandidate(null); setRunProgress(null); setLastCompletedCase(null); setError(null);
    if (!selectedProgramId) return;
    let active = true;
    void loadProgram(selectedProgramId).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, selectedProgramId]);

  useEffect(() => {
    setSelectedRun(null); setSelectedRunIssue(null); setPromoted(null); setCommissionedCandidate(null); setError(null);
    if (!selectedProgramId || !selectedRunId) return;
    let active = true;
    void (async () => {
      try {
        const value = await responseJson<DesignRunResult>(await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(selectedProgramId)}/runs/${encodeURIComponent(selectedRunId)}`,
        ));
        if (!active) return;
        setSelectedRun(value);
        setCandidateId(`${selectedProgramId}-${selectedRunId.slice(0, 8)}`);
        if (!selectedProgram) return;
        const candidates = await responseJson<{ candidates: CandidateChangeSet[] }>(await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selectedProgram.benchmark)}/candidates`,
        ));
        if (!active) return;
        setCommissionedCandidate(candidates.candidates.find((candidate) => candidate.source?.program === selectedProgramId
          && candidate.source.resultHash === selectedRunId
          && candidate.source.blueprintHash === value.manifest.best.blueprintHash) ?? null);
      } catch (nextError) {
        if (!active) return;
        const message = nextError instanceof Error ? nextError.message : String(nextError);
        const issue = designRunSelectionIssue(
          nextError instanceof DesignResponseError ? nextError.code : null,
          nextError instanceof DesignResponseError ? nextError.detail : message,
          selectedRunId,
        );
        if (issue) setSelectedRunIssue(issue);
        else setError(message);
      }
    })();
    return () => { active = false; };
  }, [projectId, selectedProgram, selectedProgramId, selectedRunId]);

  const recordRunProgress = (progress: DesignRunProgress) => {
    setRunProgress(progress);
    if (progress.phase === "case-completed") setLastCompletedCase(progress as CompletedDesignCaseProgress);
  };

  const applyOperationSnapshot = (snapshot: OperationExecutionSnapshot<DesignRunResult>) => {
    setActiveOperation(snapshot);
    setRunning(!isTerminalOperationExecution(snapshot.status));
    const retainedCompletedCase = latestCompletedDesignCase(snapshot.progressLog);
    if (retainedCompletedCase) setLastCompletedCase(retainedCompletedCase);
    if (snapshot.progress && "program" in snapshot.progress) recordRunProgress(snapshot.progress as DesignRunProgress);
    if (snapshot.status === "completed" && snapshot.result) {
      setSelectedRun(snapshot.result);
      setCandidateId(`${snapshot.result.manifest.program.id}-${snapshot.result.manifest.resultHash.slice(0, 8)}`);
      void loadProgram(snapshot.result.manifest.program.id);
      if (selectedRunId !== snapshot.result.manifest.resultHash) onSelectRun(snapshot.result.manifest.resultHash);
    } else if (snapshot.status === "failed" || snapshot.status === "interrupted") {
      setError(`${snapshot.error?.code ? `[${snapshot.error.code}] ` : ""}${snapshot.error?.message ?? "Design operation failed"}`);
    }
  };

  const follow = async (initial: OperationExecutionSnapshot<DesignRunResult>) => {
    pollAbort.current?.abort();
    const abort = new AbortController();
    pollAbort.current = abort;
    try {
      await followStudioOperation(projectId, initial, applyOperationSnapshot, abort.signal);
    } catch (nextError) {
      if (!(nextError instanceof DOMException && nextError.name === "AbortError")) setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      if (pollAbort.current === abort) pollAbort.current = null;
    }
  };

  useEffect(() => {
    pollAbort.current?.abort();
    setRunning(false); setActiveOperation(null);
    if (!selectedProgramId) return;
    const abort = new AbortController();
    pollAbort.current = abort;
    void listStudioOperations(projectId).then(async (operations) => {
      if (abort.signal.aborted) return;
      const operation = operations.find((item) =>
        (item.subject.kind === "design-run" || item.subject.kind === "design-continue")
        && item.subject.programId === selectedProgramId);
      if (!operation) return;
      const snapshot = await readStudioOperation<DesignRunResult>(projectId, operation.id);
      await followStudioOperation(projectId, snapshot, applyOperationSnapshot, abort.signal);
    }).catch((nextError) => {
      if (!abort.signal.aborted) setError(nextError instanceof Error ? nextError.message : String(nextError));
    }).finally(() => {
      if (pollAbort.current === abort) pollAbort.current = null;
    });
    return () => abort.abort();
  }, [projectId, selectedProgramId]);
  useEffect(() => () => pollAbort.current?.abort(), []);

  const run = async () => {
    if (!selectedProgram || running) return;
    setRunning(true); setRunProgress(null); setLastCompletedCase(null); setError(null); setPromoted(null);
    try {
      const started = await startStudioOperation<DesignRunResult>(
        `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(selectedProgram.id)}/run`,
        { maxCandidates: budget },
      );
      await follow(started.operation);
    } catch (nextError) {
      setRunning(false);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const continueRun = async () => {
    if (!selectedProgram || !selectedRun || !selectedRunContinuable || running) return;
    setRunning(true); setRunProgress(null); setLastCompletedCase(null); setError(null); setPromoted(null);
    try {
      const started = await startStudioOperation<DesignRunResult>(
        `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(selectedProgram.id)}/runs/${encodeURIComponent(selectedRun.manifest.resultHash)}/continue`,
        { maxCandidates: budget },
      );
      await follow(started.operation);
    } catch (nextError) {
      setRunning(false);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const cancelRun = async () => {
    if (!activeOperation || isTerminalOperationExecution(activeOperation.status)) return;
    try {
      applyOperationSnapshot(await cancelStudioOperation(projectId, activeOperation.id) as OperationExecutionSnapshot<DesignRunResult>);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const promote = async () => {
    if (!selectedProgram || !selectedRun || !candidateId || promoting) return;
    setPromoting(true); setError(null);
    try {
      const result = await responseJson<{ candidate: CandidateChangeSet }>(await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(selectedProgram.id)}/runs/${encodeURIComponent(selectedRun.manifest.resultHash)}/promote`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateId }) },
      ));
      setPromoted(result.candidate);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
    finally { setPromoting(false); }
  };

  return <div className="modal-backdrop design-backdrop" role="presentation">
    <section className="design-workbench" role="dialog" aria-modal="true" aria-label="Factory design workbench" data-testid="design-workbench">
      <header className="design-header">
        <div><span className="eyebrow">HUMAN + AI DESIGN LOOP</span><h2>Factory design programs</h2><p>Bounded proposals · locked multi-case evidence · explicit Candidate handoff</p></div>
        <button className="icon-button" aria-label="Close design workbench" onClick={onClose}>×</button>
      </header>
      <aside className="design-program-list" aria-label="Project Design Programs">
        <div className="design-list-title"><span>PROJECT-LOCAL PROGRAMS</span><b>{programs.length}</b></div>
        {programs.map((program) => <button key={program.id} className={program.id === selectedProgramId ? "selected" : ""} data-testid={`design-program-${program.id}`} onClick={() => onSelectProgram(program.id)}>
          <strong>{program.name}</strong><code>{program.id}</code><span>{program.focus.kind === "broad" ? "BROAD" : program.focus.losses.join(" + ")} · {program.budget.maxCandidates} MAX · {program.frontier.maximumAlternativeBranches} ALT · {program.locked ? "LOCKED" : "UNLOCKED"}</span>
        </button>)}
        {!programs.length && <div className="design-empty">NO DESIGN PROGRAMS<br/><code>design-programs/*.design.json</code></div>}
      </aside>
      <div className="design-body">
        {!selectedProgram && !programs.length && <div className="design-empty large">THIS PROJECT HAS NO DESIGN PROGRAM</div>}
        {!selectedProgram && programs.length > 0 && <div className="design-empty large">UNKNOWN DESIGN PROGRAM<br/><code>{selectedProgramId}</code></div>}
        {selectedProgram && !brief && error && <div className="design-error" role="alert"><strong>DESIGN PROGRAM FAILED TO LOAD</strong><span>{error}</span></div>}
        {selectedProgram && brief && <>
          <section className="design-contract">
            <div><span className="eyebrow">DESIGN CONTRACT</span><h3>{selectedProgram.name}</h3><p>{selectedProgram.description}</p><code>{selectedProgram.id} · {shortHash(selectedProgram.programHash)}</code></div>
            <div className="design-seed"><small>LOCKED BENCHMARK</small><strong>{brief.benchmark.id}</strong><span>{brief.benchmark.cases} operating cases</span><i>PROGRAM FOCUS</i><strong>{selectedProgram.focus.kind === "broad" ? "BROAD INDUSTRIAL SEARCH" : selectedProgram.focus.losses.join(" + ")}</strong><span>{selectedProgram.focus.kind === "broad" ? "eligible for any measured loss" : "preferred for matching Workbench diagnostics"}</span><i>HARD INDUSTRIAL OUTCOMES</i><strong>{brief.benchmark.acceptance.outcomeGuardrails?.length ?? 0} ABSOLUTE GUARDRAILS</strong><span>{brief.benchmark.acceptance.outcomeGuardrails?.reduce((total, guardrail) => total + Object.keys(guardrail.thresholds).length, 0) ?? 0} case thresholds · Benchmark-owned</span><i>CURRENT-BEST GUARDRAIL</i><strong>{guardrailDetail(selectedProgram).title}</strong><span>{guardrailDetail(selectedProgram).detail}</span><i>PARETO FRONTIER</i><strong>1 LEADER + {selectedProgram.frontier.maximumAlternativeBranches} ALTERNATIVE</strong><span>only the policy-compliant leader is promotable</span><i>{selectedProgram.seed.kind === "synthesis" ? "GENERATED FROM" : "AUTHORED SEED"}</i><strong>{selectedProgram.seed.kind === "synthesis" ? selectedProgram.seed.inputBlueprint : selectedProgram.seed.blueprint}</strong><span>{brief.seed.synthesis?.method ?? "Blueprint"} · {shortHash(brief.seed.blueprintHash)}</span><i>CURRENT PROMOTION TARGET</i><strong>{brief.promotionBase.blueprint}</strong><span>{shortHash(brief.promotionBase.hash)} · driver {brief.driver.case.id}</span></div>
            <div className="design-run-control"><label>NEW / ADDITIONAL BUDGET <b>{budget}</b></label><input type="range" min="1" max={selectedProgram.budget.maxCandidates} value={budget} onChange={(event) => setBudget(Number(event.target.value))}/><button data-testid="run-design" disabled={running || !selectedProgram.locked} onClick={() => void run()}>{running && runProgress ? `RUNNING ${runProgress.work.completedCases}/${runProgress.work.plannedCases}` : running ? "STARTING…" : `NEW RUN · ${budget} CANDIDATE${budget === 1 ? "" : "S"}`}</button></div>
          </section>
          {activeOperation && <section className={`design-live-progress ${activeOperation.status}`} aria-live="polite" data-testid="design-progress"><div><span>RECONNECTABLE OPERATION · {activeOperation.status.toUpperCase()}</span><strong>{runProgress ? progressLabel(runProgress).title : activeOperation.status === "completed" ? "IMMUTABLE RESULT RETAINED" : "PREPARING DESIGN CONTRACT"}</strong><code>OP {shortHash(activeOperation.id)} · {runProgress ? progressLabel(runProgress).detail : selectedProgram.id}</code>{lastCompletedCase && runProgress?.phase !== "case-completed" && <code data-testid="design-last-completed-case">{completedCaseLabel(lastCompletedCase)}</code>}{activeOperation.error && <code>{activeOperation.error.code} · {activeOperation.error.message}</code>}</div><div><b>{runProgress ? `${runProgress.work.completedCases}/${runProgress.work.plannedCases}` : "0/—"}</b><small>CASES</small><progress value={runProgress?.work.completedCases ?? 0} max={runProgress?.work.plannedCases ?? 1}/></div>{!isTerminalOperationExecution(activeOperation.status) && <button onClick={() => void cancelRun()} disabled={activeOperation.cancelRequestedAt !== null} data-testid="cancel-design">{activeOperation.cancelRequestedAt ? "CANCELLING…" : "CANCEL"}</button>}</section>}
          <section className="design-families"><span>PROPOSAL PROVIDER</span><div><code>{selectedProgram.proposal.kind}</code>{selectedProgram.proposal.kind === "project-strategy" && <code>{selectedProgram.proposal.entry}</code>}</div></section>
          <section className="design-readiness">
            <span><small>CAPACITY</small><b className={brief.staticEvidence.capacity.state}>{brief.staticEvidence.capacity.state.toUpperCase()}</b><em>{brief.staticEvidence.capacity.gapCount} gaps</em></span>
            <span><small>FLOW SIGNALS</small><b>{brief.staticEvidence.flow.warningCount}</b><em>warnings</em></span>
            <span><small>INDUSTRIAL DEVICES</small><b>{brief.staticEvidence.devices.declarative}/{brief.staticEvidence.devices.total}</b><em>declarative</em></span>
            <span><small>TOPOLOGY</small><b>{brief.staticEvidence.topology.trackedRoutes}</b><em>tracked routes</em></span>
          </section>
          <section className="design-families"><span>ALLOWED DECISIONS</span><div>{selectedProgram.proposal.decisionFamilies.map((family) => <code key={family}>{family}</code>)}</div></section>
          {error && <div className="design-error" role="alert"><strong>DESIGN OPERATION FAILED</strong><span>{error}</span></div>}
          <section className="design-ranking">
            <div className="design-section-title"><span>IMMUTABLE RESULT RANKING</span><b>{runs.length} VALID · {invalidRuns.length} EXCLUDED</b></div>
            {runs.length ? runs.map((runSummary, index) => <button key={runSummary.id} className={runSummary.id === selectedRunId ? "selected" : ""} data-testid={`design-run-${runSummary.id}`} onClick={() => onSelectRun(runSummary.id)}>
              <em>#{index + 1}</em><span><strong>{shortHash(runSummary.id)}</strong><code>{runSummary.budget.evaluated}/{runSummary.budget.maximum} evaluated · {runSummary.stopReason}{runSummary.continuation ? ` · from ${shortHash(runSummary.continuation.sourceResultHash)}` : ""}</code></span><b>{runSummary.best.candidateScore.toFixed(6)}<small>{signed(runSummary.best.scoreDelta)} VS BASELINE</small></b><i className={runSummary.best.iteration > 0 ? "leading" : "seed"}>{runSummary.continuation ? `CONTINUED · +${runSummary.continuation.additionalCandidateBudget}` : runSummary.best.iteration > 0 ? `ITERATION ${runSummary.best.iteration}` : runSummary.seed.source.kind === "synthesis" ? "GENERATED SEED" : "SEED LEADS"}</i>
            </button>) : <div className="design-empty compact">NO DESIGN EVIDENCE YET · RUN A BOUNDED SEARCH</div>}
          </section>
          {invalidRuns.length > 0 && <details className="design-invalid-runs" data-testid="invalid-design-runs">
            <summary><span>INVALID EVIDENCE EXCLUDED FROM AUTHORITY</span><b>{invalidRuns.length}</b></summary>
            <div>{invalidRuns.map((run) => <article key={`${run.program}:${run.id}`}>
              <code>{shortHash(run.id)}</code><strong>{run.code}</strong><span>{run.message}</span>
            </article>)}</div>
          </details>}
          {selectedRunIssue && <section className="design-run-issue" data-testid="design-run-issue" role="status">
            <div>
              <small>HISTORICAL RESULT EXCLUDED</small>
              <strong>THIS RUN IS NOT CURRENT EVIDENCE</strong>
              <code>{selectedRunIssue.runId}</code>
              <span>{selectedRunIssue.code} · {selectedRunIssue.message}</span>
              <p>The copied route remains intact, but this result cannot enter ranking, continuation, or promotion. The Design Program and its current valid evidence remain usable.</p>
            </div>
            <button data-testid="open-current-design-run" onClick={() => onSelectRun(runs[0]?.id ?? null)}>
              {runs.length > 0 ? "OPEN CURRENT RESULT →" : "BACK TO PROGRAM →"}
            </button>
          </section>}
          {selectedRun && <section className="design-result" data-testid="design-result">
            <header><div><span className="eyebrow">SELECTED RESULT</span><h3>{shortHash(selectedRun.manifest.resultHash)}</h3><code>BLUEPRINT {shortHash(selectedRun.manifest.best.blueprintHash)}</code>{selectedRun.manifest.continuation && <code>CONTINUED FROM {shortHash(selectedRun.manifest.continuation.sourceResultHash)} · REUSED {selectedRun.manifest.continuation.reusedIterations} · +{selectedRun.manifest.continuation.additionalCandidateBudget}</code>}</div><strong>{selectedRun.manifest.best.candidateScore.toFixed(6)}<small>{signed(selectedRun.manifest.best.scoreDelta)} VS LOCKED BASELINE</small></strong></header>
            {selectedRunContinuable && <div className="design-continuation"><div><small>SEARCHABLE FRONTIER RETAINED</small><strong>Continue this exact immutable evidence chain</strong><span>Reuses {selectedRun.manifest.iterations.length} verified iterations, starts from {selectedRun.manifest.frontier.scheduler.searchOrder[0]}, and evaluates only up to {budget} new candidate{budget === 1 ? "" : "s"}. The selected source run remains unchanged.</span></div><button data-testid="continue-design" disabled={running} onClick={() => void continueRun()}>{running ? "CONTINUING…" : `CONTINUE · +${budget} CANDIDATE${budget === 1 ? "" : "S"}`}</button></div>}
            <div className="design-frontier" data-testid="design-frontier"><div className="design-section-title"><span>FINAL PARETO FRONTIER</span><b>{selectedRun.manifest.frontier.scheduler.searchOrder[0] ? `NEXT ${selectedRun.manifest.frontier.scheduler.searchOrder[0]}` : "SEARCH EXHAUSTED"}</b></div><div>{selectedRun.manifest.frontier.nodes.map((node) => <article key={node.nodeId} className={`${node.role} ${node.searchStatus}`}><small>{node.role === "leader" ? "PROMOTABLE LEADER" : "EXPLORATORY · NOT PROMOTABLE"} · {node.searchStatus.toUpperCase()}</small><strong>{node.nodeId}</strong><code>{node.parentNodeId ? `FROM ${node.parentNodeId}` : "ROOT"} · DEPTH {node.depth}</code><b>{node.candidateScore.toFixed(6)}</b><span>{shortHash(node.blueprintHash)}</span></article>)}</div></div>
            {selectedBestEvaluation && <section className="design-cadence-evidence" data-testid="design-leader-cadence-control">
              <div className="design-section-title"><span>FINAL LEADER CONTROL EVIDENCE</span><b>LOCKED CASE ACTIVATION</b></div>
              {selectedBestEvaluation.cases.some((item) =>
                Object.keys(item.baselineMetrics.cadenceControl.devices).length > 0
                || Object.keys(item.candidateMetrics.cadenceControl.devices).length > 0)
                ? selectedBestEvaluation.cases.map((item) => <CadenceControlEvidence
                  key={item.id}
                  baseline={item.baselineMetrics.cadenceControl}
                  candidate={item.candidateMetrics.cadenceControl}
                  title={item.id.toUpperCase()}
                  testId={`design-leader-cadence-${item.id}`}
                />)
                : <div className="design-cadence-empty">NO CADENCE CONTROLLER IS CONFIGURED IN THE FINAL LEADER</div>}
            </section>}
            {selectedRun.manifest.exhaustions.length > 0 && <div className="design-exhaustions" data-testid="design-exhaustions"><div className="design-section-title"><span>SEARCH EXHAUSTION</span><b>{selectedRun.manifest.exhaustions.length} RETIRED</b></div>{selectedRun.manifest.exhaustions.map((exhaustion) => <div key={exhaustion.sequence}><b>X{String(exhaustion.sequence).padStart(2, "0")}</b><strong>{exhaustion.node.nodeId}</strong><span>{exhaustion.node.role.toUpperCase()} · BEFORE ITERATION {exhaustion.beforeIteration}</span><code>NEXT {exhaustion.nextNodeId ?? "NONE"}</code></div>)}</div>}
            <div className="design-iterations"><div className="design-iteration-head"><span>#</span><span>DECISION</span><span>LOSS / CASE → FAMILY / STRATEGY</span><span>SCORE EFFECT</span></div>{selectedRun.manifest.iterations.map((iteration) => <div key={iteration.iteration}><b>{iteration.iteration}</b><i className={iteration.decision.toLowerCase()}>{iteration.decision}</i><div className="design-iteration-evidence"><strong data-testid={iteration.addressedCase ? "design-repair-target" : undefined}>{iteration.addressedCase ? `REPAIRS ${iteration.addressedCase}` : iteration.addressedLoss ? `ADDRESSES ${iteration.addressedLoss}` : "NO EXPLICIT TARGET"} · {iteration.decisionFamily}</strong><code>{iteration.strategy}</code><small>BEFORE {promotionBoundaryDetail(iteration.promotionBoundary)}</small><small>FROM {iteration.frontierEvidence.parent.role.toUpperCase()} {iteration.frontierEvidence.parent.nodeId} → {iteration.frontierEvidence.outcome.toUpperCase()}{iteration.frontierEvidence.pruned.length ? ` · PRUNED ${iteration.frontierEvidence.pruned.map((item) => item.nodeId).join(", ")}` : ""}</small><small>OBSERVED {iteration.driverEvidence.fabLoss?.chain.join(" → ") ?? "no tracked fab loss"}</small>{iteration.lossTargetEvidence && <small data-testid="design-loss-target">CAUSAL TARGET {iteration.lossTargetEvidence.target.contributor}.{iteration.lossTargetEvidence.target.metric} · {iteration.lossTargetEvidence.before} → {iteration.lossTargetEvidence.after} · Δ {signed(iteration.lossTargetEvidence.delta)} · {iteration.lossTargetEvidence.improved ? "IMPROVED" : "NOT IMPROVED"}</small>}{iteration.decisionEvidence && <><small>{decisionDetail(iteration.decisionEvidence)}</small><ScoreBreakdownDetails
              baseline={scoreDriverCase(iteration.decisionEvidence).previousBestScoreBreakdown}
              candidate={scoreDriverCase(iteration.decisionEvidence).candidateScoreBreakdown}
              delta={scoreDriverCase(iteration.decisionEvidence).scoreBreakdownDelta}
              title={`${scoreDriverCase(iteration.decisionEvidence).id.toUpperCase()} SCORE DRIVERS`}
              baselineLabel="LEADER"
              candidateLabel="CANDIDATE"
              testId={`design-score-breakdown-${iteration.iteration}`}
            />{iteration.evaluation?.cases.map((item) => <CadenceControlEvidence
              key={item.id}
              baseline={item.baselineMetrics.cadenceControl}
              candidate={item.candidateMetrics.cadenceControl}
              title={`${item.id.toUpperCase()} CONTROL ACTIVATION`}
              testId={`design-iteration-${iteration.iteration}-cadence-${item.id}`}
            />)}</>}<small>{iteration.hypothesis}</small></div><em>{!iteration.decisionEvidence ? "INVALID" : signed(iteration.decisionEvidence.aggregate.scoreDelta)}</em></div>)}</div>
            {selectedRunAlreadyCommissioned ? <div className="design-commissioned" data-testid="design-commissioned">
              <div><small>COMMISSIONING COMPLETE</small><strong>THIS DESIGN IS THE CURRENT FACTORY</strong><span>{selectedRun.manifest.promotionBase.blueprint} matches immutable leader {shortHash(selectedRun.manifest.best.blueprintHash)}. Re-promotion and continuation are intentionally unavailable after the target moved.</span></div>
              {commissionedCandidate
                ? <button onClick={() => onCandidate(commissionedCandidate.benchmark, commissionedCandidate.id)}>OPEN VERIFIED CANDIDATE →</button>
                : <code>NO MATCHING PROJECT-LOCAL CANDIDATE RECORD</code>}
            </div>
              : selectedRunPromotable ? <div className="design-promotion"><div><small>CANDIDATE HANDOFF</small><strong>Freeze this accepted design for ordinary review</strong><span>Promotion creates a hash-pinned Candidate against {selectedRun.manifest.promotionBase.blueprint}. It does not apply the Blueprint.</span></div>{promoted ? <button className="promoted" onClick={() => onCandidate(promoted.benchmark, promoted.id)}>OPEN {promoted.id} →</button> : <><input aria-label="Candidate id" value={candidateId} onChange={(event) => setCandidateId(event.target.value)} pattern="[a-z0-9][a-z0-9-]*"/><button data-testid="promote-design" disabled={promoting || !candidateId} onClick={() => void promote()}>{promoting ? "VERIFYING…" : "CREATE CANDIDATE"}</button></>}</div>
                : selectedRunAccepted && !selectedRunBaseCurrent
                  ? <div className="design-no-leader moved" data-testid="design-promotion-base-moved"><strong>PROMOTION BASE MOVED</strong><span>This immutable run targets {shortHash(selectedRun.manifest.promotionBase.hash)}, while the current target is {brief ? shortHash(brief.promotionBase.hash) : "unavailable"}. It remains evidence, but cannot honestly be continued or promoted.</span></div>
                  : <div className="design-no-leader"><strong>NO PROMOTABLE ACCEPTED DESIGN</strong><span>The best result either failed a locked gate or equals its promotion base. There is nothing honest to promote.</span></div>}
          </section>}
        </>}
      </div>
    </section>
  </div>;
}
