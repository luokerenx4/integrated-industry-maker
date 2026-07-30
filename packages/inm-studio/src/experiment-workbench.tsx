import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppliedCandidateChangeSet, BlueprintBenchmarkProgress, BlueprintBenchmarkResult, BlueprintBenchmarkSummary, CandidateChangeSet, CandidateChangeSetPreview, CandidateDecisionState, CandidateInvestigationSourceEvidence, IndustrialInvestigationInspection,
} from "@inm/core";
import { CadenceControlEvidence } from "./cadence-control-evidence";
import { ScoreBreakdownDetails } from "./score-breakdown";
import { ObjectiveConstraintComparison } from "./objective-constraint-evidence";
import { cancelStudioOperation, followStudioOperation, listStudioOperations, readStudioOperation, startStudioOperation } from "./studio-operation-client";
import { isTerminalOperationExecution, type OperationExecutionSnapshot } from "@inm/core/operation-execution";

interface BenchmarkResponse extends BlueprintBenchmarkResult { command: "benchmark"; baselineCache: { hits: number; misses: number } }
interface CandidatePreviewResponse extends CandidateChangeSetPreview { command: "candidate"; action: "preview"; decisionState?: CandidateDecisionState }
interface CandidateApplyResponse extends AppliedCandidateChangeSet { command: "candidate"; action: "apply"; decisionState?: CandidateDecisionState }
interface CandidateReviewResponse {
  state: CandidateDecisionState;
  sourceEvidence: CandidateInvestigationSourceEvidence | null;
  error: { code: string; message: string } | null;
  review: CandidatePreviewResponse | null;
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new Error(`${value.code ? `[${value.code}] ` : ""}${value.error ?? `Request failed (${response.status})`}`);
  return value;
}

const signed = (value: number, digits = 3) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const shortHash = (value: string) => value.slice(0, 12);
const outcomeValue = (metric: string, value: number) => metric === "contractFulfillment" || metric === "firstPassYield"
  ? percent(value)
  : Number.isInteger(value) ? String(value) : value.toFixed(3);

export function ExperimentWorkbench({
  projectId, experiments, selectedId, selectedCandidateId, refreshRevision, onSelect, onSelectCandidate, onDesignSource, onInvestigationSource, onClose,
}: {
  projectId: string;
  experiments: BlueprintBenchmarkSummary[];
  selectedId: string | null;
  selectedCandidateId: string | null;
  refreshRevision: number;
  onSelect: (id: string) => void;
  onSelectCandidate: (id: string | null) => void;
  onDesignSource: (programId: string, runId: string) => void;
  onInvestigationSource: (investigationId: string, returnCandidateId?: string, disposition?: "keep" | "revise" | "discard") => void;
  onClose: () => void;
}) {
  const selected = useMemo(() => experiments.find((item) => item.id === selectedId) ?? null, [experiments, selectedId]);
  const [candidates, setCandidates] = useState<CandidateChangeSet[]>([]);
  const activeCandidate = useMemo(() => candidates.find((item) => item.id === selectedCandidateId) ?? null, [candidates, selectedCandidateId]);
  const designSource = activeCandidate?.source?.kind === "design-run" ? activeCandidate.source : null;
  const investigationSource = activeCandidate?.source?.kind === "investigation-hypothesis"
    ? activeCandidate.source
    : null;
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResponse | null>(null);
  const [candidatePreview, setCandidatePreview] = useState<CandidatePreviewResponse | null>(null);
  const [decisionState, setDecisionState] = useState<CandidateDecisionState | null>(null);
  const [sourceEvidence, setSourceEvidence] = useState<CandidateInvestigationSourceEvidence | null>(null);
  const [recordedInvestigationAnchor, setRecordedInvestigationAnchor] = useState<string | null | false>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BlueprintBenchmarkProgress | null>(null);
  const [activeOperation, setActiveOperation] = useState<OperationExecutionSnapshot<BenchmarkResponse | CandidatePreviewResponse | CandidateApplyResponse> | null>(null);
  const pollAbort = useRef<AbortController | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyArmed, setApplyArmed] = useState(false);
  const [applied, setApplied] = useState<CandidateApplyResponse | null>(null);
  const [sourceAvailable, setSourceAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = candidatePreview?.result ?? benchmarkResult;

  useEffect(() => {
    if (!selectedId && experiments[0]) onSelect(experiments[0].id);
  }, [experiments, onSelect, selectedId]);
  useEffect(() => {
    pollAbort.current?.abort();
    setRunning(false); setActiveOperation(null); setCandidates([]); setBenchmarkResult(null); setCandidatePreview(null); setDecisionState(null); setSourceEvidence(null); setApplied(null); setApplyArmed(false); setProgress(null); setError(null);
    if (!selectedId) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selectedId)}/candidates`)
      .then((response) => responseJson<{ candidates: CandidateChangeSet[] }>(response)).then((value) => {
      if (!active) return;
      setCandidates(value.candidates);
    }).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, refreshRevision, selectedId]);
  useEffect(() => {
    setBenchmarkResult(null); setCandidatePreview(null); setDecisionState(null); setSourceEvidence(null); setRecordedInvestigationAnchor(null); setApplied(null); setApplyArmed(false); setProgress(null); setError(null);
    if (!selectedId || !selectedCandidateId) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selectedId)}/candidates/${encodeURIComponent(selectedCandidateId)}/review`)
      .then((response) => responseJson<CandidateReviewResponse>(response)).then((value) => {
        if (!active) return;
        setDecisionState(value.state);
        setSourceEvidence(value.sourceEvidence);
        setCandidatePreview(value.review);
        if (value.error) setError(`[${value.error.code}] ${value.error.message}`);
      }).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, refreshRevision, selectedCandidateId, selectedId]);
  useEffect(() => {
    setRecordedInvestigationAnchor(null);
    if (!candidatePreview?.sourceEvidence) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/investigations/${encodeURIComponent(candidatePreview.sourceEvidence.investigation)}`)
      .then((response) => responseJson<IndustrialInvestigationInspection>(response))
      .then((investigation) => {
        if (!active) return;
        const exact = investigation.entries
          .flatMap((entry) => entry.introducedAnchors)
          .find((anchor) =>
            anchor.candidateId === candidatePreview.candidate.id
            && anchor.proposalHash === candidatePreview.proposalHash);
        setRecordedInvestigationAnchor(exact?.id ?? false);
      })
      .catch(() => { if (active) setRecordedInvestigationAnchor(false); });
    return () => { active = false; };
  }, [candidatePreview, projectId, refreshRevision]);
  useEffect(() => {
    setSourceAvailable(null);
    if (activeCandidate?.source?.kind !== "design-run") return;
    let active = true;
    const source = activeCandidate.source;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(source.program)}/runs/${encodeURIComponent(source.resultHash)}`)
      .then((response) => { if (active) setSourceAvailable(response.ok); })
      .catch(() => { if (active) setSourceAvailable(false); });
    return () => { active = false; };
  }, [activeCandidate, projectId, refreshRevision]);

  const applyOperationSnapshot = (snapshot: OperationExecutionSnapshot<BenchmarkResponse | CandidatePreviewResponse | CandidateApplyResponse>) => {
    setActiveOperation(snapshot);
    setRunning(!isTerminalOperationExecution(snapshot.status));
    setApplying(snapshot.kind === "candidate-apply" && !isTerminalOperationExecution(snapshot.status));
    if (snapshot.progress && "benchmark" in snapshot.progress) setProgress(snapshot.progress as BlueprintBenchmarkProgress);
    if (snapshot.status === "completed" && snapshot.result) {
      if (snapshot.kind === "benchmark") setBenchmarkResult(snapshot.result as BenchmarkResponse);
      else if (snapshot.kind === "candidate-apply") {
        const appliedResult = snapshot.result as CandidateApplyResponse;
        setApplied(appliedResult);
        setDecisionState(appliedResult.decisionState ?? "verified");
        setApplyArmed(false);
      } else {
        const reviewed = snapshot.result as CandidatePreviewResponse;
        setCandidatePreview(reviewed);
        setSourceEvidence(reviewed.sourceEvidence);
        setDecisionState(reviewed.decisionState ?? `reviewed-${reviewed.result.verdict.toLowerCase()}` as CandidateDecisionState);
      }
    } else if (snapshot.status === "failed" || snapshot.status === "interrupted") {
      setError(`${snapshot.error?.code ? `[${snapshot.error.code}] ` : ""}${snapshot.error?.message ?? "Operation failed"}`);
    }
  };

  const follow = async (initial: OperationExecutionSnapshot<BenchmarkResponse | CandidatePreviewResponse | CandidateApplyResponse>) => {
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
    if (!selectedId) return;
    const abort = new AbortController();
    pollAbort.current = abort;
    void listStudioOperations(projectId).then(async (operations) => {
      if (abort.signal.aborted) return;
      const operation = operations.find((item) => selectedCandidateId
        ? (item.subject.kind === "candidate-preview" || item.subject.kind === "candidate-apply")
          && item.subject.benchmarkId === selectedId && item.subject.candidateId === selectedCandidateId
        : item.kind === "benchmark" && item.subject.kind === "benchmark" && item.subject.benchmarkId === selectedId);
      if (!operation) return;
      const snapshot = await readStudioOperation<BenchmarkResponse | CandidatePreviewResponse | CandidateApplyResponse>(projectId, operation.id);
      await followStudioOperation(projectId, snapshot, applyOperationSnapshot, abort.signal);
    }).catch((nextError) => {
      if (!abort.signal.aborted) setError(nextError instanceof Error ? nextError.message : String(nextError));
    }).finally(() => {
      if (pollAbort.current === abort) pollAbort.current = null;
    });
    return () => abort.abort();
  }, [projectId, refreshRevision, selectedCandidateId, selectedId]);
  useEffect(() => () => pollAbort.current?.abort(), []);

  const run = async () => {
    if (!selected || running) return;
    setRunning(true); setProgress(null); setError(null); setBenchmarkResult(null); setCandidatePreview(null); setApplied(null); setApplyArmed(false);
    try {
      const root = `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selected.id)}`;
      if (activeCandidate) {
        const started = await startStudioOperation<CandidatePreviewResponse>(
          `${root}/candidates/${encodeURIComponent(activeCandidate.id)}/preview`,
        );
        await follow(started.operation);
      }
      else {
        const started = await startStudioOperation<BenchmarkResponse>(`${root}/run`);
        await follow(started.operation);
      }
    } catch (nextError) {
      if (!(nextError instanceof DOMException && nextError.name === "AbortError")) setError(nextError instanceof Error ? nextError.message : String(nextError));
      setRunning(false);
    }
  };

  const cancelRun = async () => {
    if (!activeOperation || isTerminalOperationExecution(activeOperation.status)) return;
    try {
      applyOperationSnapshot(await cancelStudioOperation(projectId, activeOperation.id) as OperationExecutionSnapshot<BenchmarkResponse | CandidatePreviewResponse | CandidateApplyResponse>);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const apply = async () => {
    if (!selected || !activeCandidate || !candidatePreview || applying || candidatePreview.result.verdict !== "KEEP") return;
    setApplying(true); setError(null);
    try {
      const started = await startStudioOperation<CandidateApplyResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selected.id)}/candidates/${encodeURIComponent(activeCandidate.id)}/apply`,
        {
          proposalHash: candidatePreview.proposalHash,
          currentCandidateHash: candidatePreview.currentCandidateHash,
          proposedCandidateHash: candidatePreview.proposedCandidateHash,
        },
      );
      await follow(started.operation);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally { setApplying(false); }
  };

  return <div className="modal-backdrop experiment-backdrop" role="presentation">
    <section className="experiment-workbench" role="dialog" aria-modal="true" aria-label="Experiment workbench" data-testid="experiment-workbench">
      <header className="experiment-header">
        <div><span className="eyebrow">SHARED HUMAN + AI WORKBENCH</span><h2>Blueprint experiments</h2><p>Same locked evaluator as <code>inm benchmark --json</code></p></div>
        <button className="icon-button" aria-label="Close experiment workbench" onClick={onClose}>×</button>
      </header>
      <aside className="experiment-list" aria-label="Project experiments">
        <div className="experiment-list-title"><span>PROJECT PROGRAMS</span><b>{experiments.length}</b></div>
        {experiments.map((experiment) => <button key={experiment.id} className={experiment.id === selectedId ? "selected" : ""} data-testid={`experiment-${experiment.id}`} onClick={() => onSelect(experiment.id)}>
          <strong>{experiment.name}</strong><code>{experiment.id}</code><span>{experiment.cases.length} CASES · {experiment.locked ? "LOCKED" : "UNLOCKED"}</span>
        </button>)}
        {!experiments.length && <div className="experiment-empty">NO BENCHMARKS<br/><code>benchmarks/*.benchmark.json</code></div>}
      </aside>
      <div className="experiment-body">
        {!selected && experiments.length > 0 && <div className="experiment-empty large">UNKNOWN EXPERIMENT<br/><code>{selectedId}</code></div>}
        {!selected && !experiments.length && <div className="experiment-empty large">THIS PROJECT HAS NO LOCKED EXPERIMENT PROGRAMS</div>}
        {selected && <>
          <section className="experiment-contract">
            <div><span className="eyebrow">LOCKED CONTRACT</span><h3>{selected.name}</h3><code>{selected.id}</code></div>
            <div className="experiment-blueprints"><span><small>BASELINE</small><strong>{selected.baselineBlueprint}</strong></span><i>→</i><span><small>EDITABLE CANDIDATE</small><strong>{selected.candidateBlueprint}</strong></span></div>
            <button className="experiment-run" disabled={running || !selected.locked} onClick={() => void run()} data-testid="run-experiment">
              {running && progress ? `${progress.work.completed}/${progress.work.total} · ${progress.case.id}` : running ? "PREPARING FIXED WORK…" : !selected.locked ? "LOCK REQUIRED" : activeCandidate ? candidatePreview ? "RE-RUN RECORDED REVIEW" : "REVIEW PROPOSED CHANGE" : "RUN LOCKED EVALUATION"}
            </button>
          </section>
          {activeOperation && <section className={`experiment-live-progress ${activeOperation.status}`} aria-live="polite" data-testid="experiment-progress">
            <div>
              <small>RECONNECTABLE OPERATION · {activeOperation.status.toUpperCase()}</small>
              <strong>{progress ? `${progress.phase.startsWith("baseline") ? "LOCKED BASELINE" : progress.phase.startsWith("current") ? "CURRENT FACTORY" : "PROPOSED FACTORY"} · ${progress.case.index}/${progress.case.total}` : activeOperation.status === "completed" ? "IMMUTABLE RESULT RETAINED" : "PREPARING LOCKED CONTRACT"}</strong>
              <code>OP {shortHash(activeOperation.id)} · {progress ? `${progress.case.name} · ${progress.case.id}` : selected.id}</code>
              <span>{progress ? progress.phase.endsWith("completed") ? `${progress.cached ? "REUSED" : "EVALUATED"}${progress.execution.mode === "isolated" ? " · ISOLATED WORKER" : progress.execution.mode === "parallel" ? ` · PARALLEL ×${progress.execution.concurrency}` : ""}${progress.timing.workerReused === undefined ? "" : progress.timing.workerReused ? " · WARM WORKER" : ` · COLD WORKER · ${(progress.timing.workerStartupMs ?? 0).toFixed(0)}ms STARTUP`} · ${((progress.timing.durationMs ?? 0) / 1000).toFixed(2)}s` : `RUNNING EXACT LOCKED CASE${progress.execution.mode === "isolated" ? " · ISOLATED WORKER" : progress.execution.mode === "parallel" ? ` · PARALLEL ×${progress.execution.concurrency}` : ""}` : activeOperation.error?.message ?? "LOADING PROJECT-LOCAL CASES"}</span>
            </div>
            <div><b>{progress ? `${progress.work.completed}/${progress.work.total}` : `0/${selected.cases.length * 2}`}</b><small>CASE EVALUATIONS</small><progress value={progress?.work.completed ?? 0} max={progress?.work.total ?? selected.cases.length * 2}/></div>
            {!isTerminalOperationExecution(activeOperation.status) && <button onClick={() => void cancelRun()} disabled={activeOperation.cancelRequestedAt !== null} data-testid="cancel-experiment">{activeOperation.cancelRequestedAt ? "CANCELLING…" : "CANCEL"}</button>}
          </section>}
          <section className="candidate-selector" aria-label="Candidate change sets">
            <div className="experiment-section-title"><span>REVIEW TARGET</span><b>{candidates.length} PROJECT-LOCAL PROPOSALS</b></div>
            <div className="candidate-tabs">
              <button className={!selectedCandidateId ? "selected" : ""} onClick={() => onSelectCandidate(null)}>CURRENT CANDIDATE FILE</button>
              {candidates.map((candidate) => <button className={candidate.id === selectedCandidateId ? "selected" : ""} key={candidate.id} data-testid={`candidate-${candidate.id}`} onClick={() => onSelectCandidate(candidate.id)}>{candidate.name}<code>{candidate.id}</code></button>)}
            </div>
            {activeCandidate && <div className="candidate-hypothesis">
              <span><small>HYPOTHESIS</small>{activeCandidate.hypothesis}</span>
              <code>BASE {shortHash(activeCandidate.baseCandidateHash)}</code>
              <b>{decisionState ? decisionState.toUpperCase() : "LOADING STATE"} · {activeCandidate.patch.length} PATCH OPS</b>
            </div>}
            {designSource && <button
              className="candidate-source"
              data-testid="candidate-design-source"
              disabled={!sourceAvailable}
              onClick={() => onDesignSource(designSource.program, designSource.resultHash)}
            >
              <span><small>IMMUTABLE DESIGN SOURCE</small><strong>{designSource.program}</strong></span>
              <code>RUN {shortHash(designSource.resultHash)} · BLUEPRINT {shortHash(designSource.blueprintHash)}</code>
              <b>{sourceAvailable === null ? "CHECKING LOCAL EVIDENCE…" : sourceAvailable ? "OPEN DESIGN EVIDENCE →" : "IDENTITY RETAINED · RUN CACHE NOT LOCAL"}</b>
            </button>}
            {investigationSource && <button
              className="candidate-source investigation-candidate-source"
              data-testid="candidate-investigation-source"
              disabled={!sourceEvidence}
              onClick={() => onInvestigationSource(investigationSource.investigation)}
            >
              <span><small>IMMUTABLE INVESTIGATION SOURCE</small><strong>{sourceEvidence?.investigationName ?? investigationSource.investigation}</strong></span>
              <code>HYPOTHESIS {investigationSource.entry} · {shortHash(investigationSource.entryHash)}</code>
              <b>{sourceEvidence ? `${sourceEvidence.state.toUpperCase()} · OPEN REASONING →` : decisionState === "invalid" ? "SOURCE INVALID" : "VERIFYING HASH CHAIN…"}</b>
            </button>}
            {candidatePreview?.sourceEvidence && recordedInvestigationAnchor === false && <button
              className="candidate-source candidate-return-source"
              data-testid="candidate-return-investigation"
              onClick={() => onInvestigationSource(
                candidatePreview.sourceEvidence!.investigation,
                candidatePreview.candidate.id,
                candidatePreview.result.verdict === "KEEP"
                  ? "keep"
                  : candidatePreview.result.verdict === "DISCARD"
                    ? "discard"
                    : "revise",
              )}
            >
              <span><small>EXPLICIT DISPOSITION REQUIRED</small><strong>Return immutable review to Investigation</strong></span>
              <code>{candidatePreview.candidate.id} · {candidatePreview.result.verdict}</code>
              <b>RECORD HUMAN / AGENT DECISION →</b>
            </button>}
            {candidatePreview?.sourceEvidence && typeof recordedInvestigationAnchor === "string" && <div
              className="candidate-source candidate-return-source candidate-return-recorded"
              data-testid="candidate-investigation-recorded"
            >
              <span><small>INVESTIGATION DISPOSITION</small><strong>Exact review already recorded</strong></span>
              <code>{recordedInvestigationAnchor}</code>
              <b>HASH-CHAIN EVIDENCE RETAINED</b>
            </div>}
          </section>
          <section className="experiment-gates" aria-label="Acceptance gates">
            <span><small>AGGREGATE DELTA</small><b>≥ {signed(selected.acceptance.minimumAggregateScoreDelta, 6)}</b></span>
            <span><small>CASE REGRESSION</small><b>≤ {selected.acceptance.maximumCaseScoreRegression.toFixed(6)}</b></span>
            <span><small>CAPACITY</small><b>{selected.acceptance.requireCandidateCapacityReady ? "READY REQUIRED" : "OBSERVED"}</b></span>
            <span><small>FIXED CASES</small><b>{selected.cases.length}</b></span>
            <span><small>HARD OUTCOMES</small><b>{selected.acceptance.outcomeGuardrails?.length ?? 0} ABSOLUTE</b></span>
          </section>
          {error && <div className="experiment-error" role="alert"><strong>EVALUATION FAILED</strong><span>{error}</span></div>}
          {!result && !error && <section className="experiment-program">
            <div className="experiment-section-title"><span>FIXED OPERATING ENVELOPE</span><b>SCENARIO + OBJECTIVE + SEED</b></div>
            {selected.cases.map((item) => <div className="experiment-case-contract" key={item.id}><strong>{item.name}<code>{item.id}</code></strong><span>{item.world}</span><span>{item.scenario}</span><span>{item.objective}</span><span>SEED {item.seed}</span><b>×{item.weight}</b></div>)}
          </section>}
          {result && <div className="experiment-result" data-testid="experiment-result">
            <section className={`experiment-verdict ${result.verdict.toLowerCase()}`} aria-label={`Verdict ${result.verdict}`}>
              <div><small>{candidatePreview ? "LOCKED COMPLIANCE" : "VERDICT"}</small><strong>{result.verdict}</strong></div>
              <span><small>LOCKED BASELINE</small><b>{result.baselineScore.toFixed(6)}</b></span><i>→</i>
              <span><small>PROPOSED FACTORY</small><b>{result.candidateScore.toFixed(6)}</b></span>
              <span className="experiment-delta"><small>LOCKED DELTA</small><b>{signed(result.scoreDelta, 6)}</b></span>
            </section>
            {candidatePreview && <section className="candidate-review" aria-label="Candidate application">
              <div><small>REVIEWED HASHES</small><code>PROPOSAL {shortHash(candidatePreview.proposalHash)} · BLUEPRINT {shortHash(candidatePreview.currentCandidateHash)} → {shortHash(candidatePreview.proposedCandidateHash)}</code></div>
              {decisionState === "verified" || applied ? <strong className="candidate-applied" data-testid="candidate-applied">VERIFIED · BLUEPRINT MATCHES REVIEWED KEEP HASH</strong>
                : decisionState === "stale" ? <strong className="candidate-applied stale" data-testid="candidate-stale">STALE · BLUEPRINT MOVED BEYOND THIS REVIEW</strong>
                  : !applyArmed ? <button data-testid="arm-candidate-apply" disabled={result.verdict !== "KEEP"} onClick={() => setApplyArmed(true)}>ARM BLUEPRINT WRITE</button>
                    : <button className="confirm" data-testid="confirm-candidate-apply" disabled={applying} onClick={() => void apply()}>{applying ? "RE-EVALUATING…" : "CONFIRM ATOMIC APPLY"}</button>}
            </section>}
            {candidatePreview && <section className="experiment-cases candidate-current-factory" aria-label="Current factory impact" data-testid="candidate-current-factory">
              <div className="experiment-section-title"><span>CURRENT FACTORY IMPACT</span><b>{candidatePreview.currentFactory.status === "evaluated" ? `${candidatePreview.currentFactory.verdict} · ${signed(candidatePreview.currentFactory.scoreDelta, 6)}` : "NOT OPERATIONAL"}</b></div>
              {candidatePreview.currentFactory.status === "not-operational" ? <section className="experiment-error">
                <strong>NOT COMPARABLE</strong>
                <span>The pinned current Blueprint is a commissioning shell, not an operating factory. Locked compliance remains valid.</span>
                <code>{candidatePreview.currentFactory.reason}</code>
              </section> : <>
              <section className={`experiment-verdict ${candidatePreview.currentFactory.verdict.toLowerCase()}`}>
                <div><small>INCREMENTAL EFFECT</small><strong>{candidatePreview.currentFactory.verdict}</strong></div>
                <span><small>CURRENT FACTORY</small><b>{candidatePreview.currentFactory.currentScore.toFixed(6)}</b></span><i>→</i>
                <span><small>PROPOSED FACTORY</small><b>{candidatePreview.currentFactory.proposedScore.toFixed(6)}</b></span>
                <span className="experiment-delta"><small>CURRENT DELTA</small><b>{signed(candidatePreview.currentFactory.scoreDelta, 6)}</b></span>
              </section>
              <div className="experiment-case-head"><span>CASE</span><span>SCORE</span><span>DELTA</span><span>CAPACITY</span><span>WIP</span><span>ON TIME</span></div>
              {candidatePreview.currentFactory.cases.map((item) => <article className="experiment-case-evidence" id={`candidate-current-case-${item.id}`} key={item.id}>
                <div className="experiment-case-result" data-testid={`candidate-current-case-${item.id}`}>
                  <strong>{item.name}<code>{item.id} · seed {item.seed} · ×{item.weight}</code></strong>
                  <span>{item.currentScore.toFixed(3)} → {item.proposedScore.toFixed(3)}</span>
                  <b className={item.scoreDelta >= 0 ? "positive" : "negative"}>{signed(item.scoreDelta)}</b>
                  <span>{item.proposedCapacityReady ? "READY" : `${item.proposedCapacityGaps.length} GAPS`}</span>
                  <span>{item.currentMetrics.averageWipEquivalentUnits.toFixed(2)} → {item.proposedMetrics.averageWipEquivalentUnits.toFixed(2)}</span>
                  <span>{item.currentMetrics.onTimeLots} → {item.proposedMetrics.onTimeLots}</span>
                </div>
                <ScoreBreakdownDetails
                  baseline={item.currentMetrics.scoreBreakdown}
                  candidate={item.proposedMetrics.scoreBreakdown}
                  delta={item.scoreBreakdownDelta}
                  testId={`candidate-current-score-breakdown-${item.id}`}
                />
                <ObjectiveConstraintComparison
                  baseline={item.currentMetrics.objectiveConstraints}
                  candidate={item.proposedMetrics.objectiveConstraints}
                  baselineLabel="CURRENT"
                  candidateLabel="PROPOSED"
                  anchorId={`candidate-current-constraints-${item.id}`}
                  testId={`candidate-current-constraints-${item.id}`}
                />
              </article>)}
              {candidatePreview.currentFactory.outcomeGuardrails && <section className="experiment-outcomes" data-testid="candidate-current-outcomes">
                <div className="experiment-section-title"><span>CURRENT → PROPOSED HARD OUTCOMES</span><b>EXACT SAME THRESHOLDS</b></div>
                {candidatePreview.currentFactory.outcomeGuardrails.map((guardrail) => <article className={guardrail.proposedPassed ? "passed" : "failed"} key={guardrail.id}>
                  <header><span><small>{guardrail.metric}</small><strong>{guardrail.label}</strong><code>{guardrail.id}</code></span><b>{guardrail.currentPassed ? "PASS" : "FAIL"} → {guardrail.proposedPassed ? "PASS" : "FAIL"}</b></header>
                  <div>{guardrail.cases.map((item) => <span className={item.proposedPassed ? "passed" : "failed"} key={item.id}>
                    <small>{item.id}</small><strong>{outcomeValue(guardrail.metric, item.currentValue)} → {outcomeValue(guardrail.metric, item.proposedValue)}</strong>
                    <code>{guardrail.operator === "minimum" ? "≥" : "≤"} {outcomeValue(guardrail.metric, item.threshold)}</code><b>{item.proposedPassed ? "PASS" : "FAIL"}</b>
                  </span>)}</div>
                </article>)}
              </section>}
              </>}
            </section>}
            {candidatePreview?.revisionBrief && <section className="candidate-revision" aria-label="Candidate revision handoff" data-testid="candidate-revision-brief">
              <div className="experiment-section-title">
                <span>REVISION HANDOFF</span>
                <b>HUMAN / AGENT DECISION</b>
              </div>
              <header>
                <strong>REVISE OR RETIRE</strong>
                <span>Preserve proven benefits, remove measured regressions, then author a new immutable Candidate hypothesis.</span>
              </header>
              {candidatePreview.revisionBrief.guardrailRegressions.length > 0 && <div className="candidate-revision-list">
                <small>BLOCKING CURRENT-FACTORY OUTCOMES</small>
                {candidatePreview.revisionBrief.guardrailRegressions.map((item) => <article key={`${item.guardrailId}:${item.caseId}`}>
                  <strong>{item.caseName}<code>{item.caseId}</code></strong>
                  <span>{item.label}</span>
                  <b>{outcomeValue(item.metric, item.currentValue)} → {outcomeValue(item.metric, item.proposedValue)}</b>
                  <code>{item.operator === "minimum" ? "≥" : "≤"} {outcomeValue(item.metric, item.threshold)}</code>
                </article>)}
              </div>}
              {candidatePreview.revisionBrief.caseRegressions.length > 0 && <div className="candidate-revision-cases">
                <small>REGRESSING CASES</small>
                {candidatePreview.revisionBrief.caseRegressions.map((item) => <span key={item.caseId}>
                  <code>{item.caseId}</code><b>{signed(item.scoreDelta, 6)}</b>
                </span>)}
              </div>}
              <div className="candidate-revision-tradeoffs">
                <span><small>PRESERVE</small>{candidatePreview.revisionBrief.benefitsToPreserve.map((item) => <code key={item.component}>{item.component} {signed(item.scoreDelta, 6)}</code>)}</span>
                <span><small>REMOVE</small>{candidatePreview.revisionBrief.costsToRemove.map((item) => <code key={item.component}>{item.component} {signed(item.scoreDelta, 6)}</code>)}</span>
              </div>
              <div className="candidate-revision-patch">
                <small>AUTHORED PATCH SURFACE</small>
                {candidatePreview.revisionBrief.patchPaths.map((path) => <code key={path}>{path}</code>)}
              </div>
              <a href={`/${encodeURIComponent(projectId)}/factory`}>OBSERVE CURRENT FACTORY</a>
            </section>}
            {result.reasons.length > 0 && <section className="experiment-reasons"><div className="experiment-section-title"><span>GATE DECISION</span><b>{result.reasons.length} REASONS</b></div>{result.reasons.map((reason) => <p key={reason}>{reason}</p>)}</section>}
            {result.outcomeGuardrails && <section className="experiment-outcomes" data-testid="outcome-guardrails">
              <div className="experiment-section-title"><span>HARD INDUSTRIAL OUTCOMES</span><b>{result.outcomeGuardrails.filter((guardrail) => guardrail.passed).length}/{result.outcomeGuardrails.length} PASSED</b></div>
              {result.outcomeGuardrails.map((guardrail) => <article className={guardrail.passed ? "passed" : "failed"} key={guardrail.id} data-testid={`outcome-guardrail-${guardrail.id}`}>
                <header><span><small>{guardrail.metric}</small><strong>{guardrail.label}</strong><code>{guardrail.id}</code></span><b>{guardrail.passed ? "PASS" : "FAIL"}</b></header>
                <div>{guardrail.cases.map((item) => <span className={item.candidatePassed ? "passed" : "failed"} key={item.id}>
                  <small>{item.id}</small><strong>{outcomeValue(guardrail.metric, item.baselineValue)} → {outcomeValue(guardrail.metric, item.candidateValue)}</strong>
                  <code>{guardrail.operator === "minimum" ? "≥" : "≤"} {outcomeValue(guardrail.metric, item.threshold)}</code><b>{item.candidatePassed ? "PASS" : "FAIL"}</b>
                </span>)}</div>
              </article>)}
            </section>}
            <section className="experiment-cases">
              <div className="experiment-section-title"><span>CASE EVALUATION</span><b>{result.totalSimulationTicks.toLocaleString()} SIMULATED TICKS{benchmarkResult ? ` · BASELINE ${benchmarkResult.baselineCache.hits}/${result.cases.length} REUSED` : ""}</b></div>
              <div className="experiment-case-head"><span>CASE</span><span>SCORE</span><span>DELTA</span><span>CAPACITY</span><span>THROUGHPUT</span><span>CONTRACTS</span></div>
              {result.cases.map((item) => <article className="experiment-case-evidence" id={`candidate-locked-case-${item.id}`} key={item.id}>
                <div className="experiment-case-result" data-testid={`experiment-case-${item.id}`}>
                  <strong>{item.name}<code>{item.id} · seed {item.seed} · ×{item.weight}</code></strong><span>{item.baselineScore.toFixed(3)} → {item.candidateScore.toFixed(3)}</span>
                  <b className={item.scoreDelta >= 0 ? "positive" : "negative"}>{signed(item.scoreDelta)}</b><span>{item.candidateCapacityReady ? "READY" : `${item.candidateCapacityGaps.length} GAPS`}</span>
                  <span>{item.baselineMetrics.throughputPerMinute.toFixed(2)} → {item.candidateMetrics.throughputPerMinute.toFixed(2)}</span><span>{percent(item.baselineMetrics.contractFulfillment)} → {percent(item.candidateMetrics.contractFulfillment)}</span>
                </div>
                <ScoreBreakdownDetails
                  baseline={item.baselineMetrics.scoreBreakdown}
                  candidate={item.candidateMetrics.scoreBreakdown}
                  delta={item.scoreBreakdownDelta}
                  testId={`experiment-score-breakdown-${item.id}`}
                />
                <ObjectiveConstraintComparison
                  baseline={item.baselineMetrics.objectiveConstraints}
                  candidate={item.candidateMetrics.objectiveConstraints}
                  anchorId={`candidate-locked-constraints-${item.id}`}
                  testId={`candidate-locked-constraints-${item.id}`}
                />
                <CadenceControlEvidence
                  baseline={item.baselineMetrics.cadenceControl}
                  candidate={item.candidateMetrics.cadenceControl}
                  testId={`experiment-cadence-control-${item.id}`}
                />
              </article>)}
            </section>
            {activeCandidate && <section className="candidate-patch">
              <div className="experiment-section-title"><span>AUTHORED RFC 6902 PATCH</span><b>{activeCandidate.patch.length} OPERATIONS</b></div>
              {activeCandidate.patch.map((operation, index) => <div key={`${operation.path}-${index}`}><b>{operation.op.toUpperCase()}</b><code>{operation.path}</code><pre>{operation.op === "remove" ? "" : JSON.stringify(operation.value)}</pre></div>)}
            </section>}
            <section className="experiment-change-set">
              <div className="experiment-section-title"><span>SEMANTIC BLUEPRINT CHANGE SET</span><b>{result.patch.length} PATCH OPS · {result.changes.length} SEMANTIC CHANGES</b></div>
              {result.changes.map((change) => <div key={`${change.kind}-${change.id}-${change.action}`}><span className={change.action}>{change.action.toUpperCase()}</span><strong>{change.kind} · {change.id}</strong><code>{change.fields.join(" · ") || "entity"}</code></div>)}
              {!result.changes.length && <div className="experiment-no-changes">CANDIDATE IS SEMANTICALLY IDENTICAL TO BASELINE</div>}
            </section>
          </div>}
        </>}
      </div>
    </section>
  </div>;
}
