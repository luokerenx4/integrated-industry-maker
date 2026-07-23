import React, { useEffect, useMemo, useState } from "react";
import type {
  AppliedCandidateChangeSet, BlueprintBenchmarkResult, BlueprintBenchmarkSummary, CandidateChangeSet, CandidateChangeSetPreview, CandidateDecisionState,
} from "@inm/core";
import { ScoreBreakdownDetails } from "./score-breakdown";

interface BenchmarkResponse extends BlueprintBenchmarkResult { command: "benchmark" }
interface CandidatePreviewResponse extends CandidateChangeSetPreview { command: "candidate"; action: "preview"; decisionState?: CandidateDecisionState }
interface CandidateApplyResponse extends AppliedCandidateChangeSet { command: "candidate"; action: "apply"; decisionState?: CandidateDecisionState }
interface CandidateReviewResponse { state: CandidateDecisionState; review: CandidatePreviewResponse | null }

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
  projectId, experiments, selectedId, selectedCandidateId, onSelect, onSelectCandidate, onDesignSource, onClose,
}: {
  projectId: string;
  experiments: BlueprintBenchmarkSummary[];
  selectedId: string | null;
  selectedCandidateId: string | null;
  onSelect: (id: string) => void;
  onSelectCandidate: (id: string | null) => void;
  onDesignSource: (programId: string, runId: string) => void;
  onClose: () => void;
}) {
  const selected = useMemo(() => experiments.find((item) => item.id === selectedId) ?? null, [experiments, selectedId]);
  const [candidates, setCandidates] = useState<CandidateChangeSet[]>([]);
  const activeCandidate = useMemo(() => candidates.find((item) => item.id === selectedCandidateId) ?? null, [candidates, selectedCandidateId]);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResponse | null>(null);
  const [candidatePreview, setCandidatePreview] = useState<CandidatePreviewResponse | null>(null);
  const [decisionState, setDecisionState] = useState<CandidateDecisionState | null>(null);
  const [running, setRunning] = useState(false);
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
    setCandidates([]); setBenchmarkResult(null); setCandidatePreview(null); setDecisionState(null); setApplied(null); setApplyArmed(false); setError(null);
    if (!selectedId) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selectedId)}/candidates`)
      .then((response) => responseJson<{ candidates: CandidateChangeSet[] }>(response)).then((value) => {
      if (!active) return;
      setCandidates(value.candidates);
    }).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, selectedId]);
  useEffect(() => {
    setBenchmarkResult(null); setCandidatePreview(null); setDecisionState(null); setApplied(null); setApplyArmed(false); setError(null);
    if (!selectedId || !selectedCandidateId) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selectedId)}/candidates/${encodeURIComponent(selectedCandidateId)}/review`)
      .then((response) => responseJson<CandidateReviewResponse>(response)).then((value) => {
        if (!active) return;
        setDecisionState(value.state);
        setCandidatePreview(value.review);
      }).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, selectedCandidateId, selectedId]);
  useEffect(() => {
    setSourceAvailable(null);
    if (!activeCandidate?.source) return;
    let active = true;
    const source = activeCandidate.source;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(source.program)}/runs/${encodeURIComponent(source.resultHash)}`)
      .then((response) => { if (active) setSourceAvailable(response.ok); })
      .catch(() => { if (active) setSourceAvailable(false); });
    return () => { active = false; };
  }, [activeCandidate, projectId]);

  const run = async () => {
    if (!selected || running) return;
    setRunning(true); setError(null); setBenchmarkResult(null); setCandidatePreview(null); setApplied(null); setApplyArmed(false);
    try {
      const root = `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selected.id)}`;
      if (activeCandidate) {
        const reviewed = await responseJson<CandidatePreviewResponse>(await fetch(
          `${root}/candidates/${encodeURIComponent(activeCandidate.id)}/preview`,
          { method: "POST", headers: { accept: "application/json" } },
        ));
        setCandidatePreview(reviewed);
        setDecisionState(reviewed.decisionState ?? `reviewed-${reviewed.result.verdict.toLowerCase()}` as CandidateDecisionState);
      }
      else setBenchmarkResult(await responseJson<BenchmarkResponse>(await fetch(
        `${root}/run`, { method: "POST", headers: { accept: "application/json" } },
      )));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally { setRunning(false); }
  };

  const apply = async () => {
    if (!selected || !activeCandidate || !candidatePreview || applying || candidatePreview.result.verdict !== "KEEP") return;
    setApplying(true); setError(null);
    try {
      const response = await responseJson<CandidateApplyResponse>(await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selected.id)}/candidates/${encodeURIComponent(activeCandidate.id)}/apply`,
        {
          method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({
            proposalHash: candidatePreview.proposalHash,
            currentCandidateHash: candidatePreview.currentCandidateHash,
            proposedCandidateHash: candidatePreview.proposedCandidateHash,
          }),
        },
      ));
      setApplied(response); setDecisionState(response.decisionState ?? "verified"); setApplyArmed(false);
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
              {running ? "EVALUATING FIXED WORK…" : !selected.locked ? "LOCK REQUIRED" : activeCandidate ? candidatePreview ? "RE-RUN RECORDED REVIEW" : "REVIEW PROPOSED CHANGE" : "RUN LOCKED EVALUATION"}
            </button>
          </section>
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
            {activeCandidate?.source && <button
              className="candidate-source"
              data-testid="candidate-design-source"
              disabled={!sourceAvailable}
              onClick={() => onDesignSource(activeCandidate.source!.program, activeCandidate.source!.resultHash)}
            >
              <span><small>IMMUTABLE DESIGN SOURCE</small><strong>{activeCandidate.source.program}</strong></span>
              <code>RUN {shortHash(activeCandidate.source.resultHash)} · BLUEPRINT {shortHash(activeCandidate.source.blueprintHash)}</code>
              <b>{sourceAvailable === null ? "CHECKING LOCAL EVIDENCE…" : sourceAvailable ? "OPEN DESIGN EVIDENCE →" : "IDENTITY RETAINED · RUN CACHE NOT LOCAL"}</b>
            </button>}
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
              <div><small>VERDICT</small><strong>{result.verdict}</strong></div>
              <span><small>BASELINE</small><b>{result.baselineScore.toFixed(6)}</b></span><i>→</i>
              <span><small>CANDIDATE</small><b>{result.candidateScore.toFixed(6)}</b></span>
              <span className="experiment-delta"><small>SCORE DELTA</small><b>{signed(result.scoreDelta, 6)}</b></span>
            </section>
            {candidatePreview && <section className="candidate-review" aria-label="Candidate application">
              <div><small>REVIEWED HASHES</small><code>PROPOSAL {shortHash(candidatePreview.proposalHash)} · BLUEPRINT {shortHash(candidatePreview.currentCandidateHash)} → {shortHash(candidatePreview.proposedCandidateHash)}</code></div>
              {decisionState === "verified" || applied ? <strong className="candidate-applied" data-testid="candidate-applied">VERIFIED · BLUEPRINT MATCHES REVIEWED KEEP HASH</strong>
                : decisionState === "stale" ? <strong className="candidate-applied stale" data-testid="candidate-stale">STALE · BLUEPRINT MOVED BEYOND THIS REVIEW</strong>
                  : !applyArmed ? <button data-testid="arm-candidate-apply" disabled={result.verdict !== "KEEP"} onClick={() => setApplyArmed(true)}>ARM BLUEPRINT WRITE</button>
                    : <button className="confirm" data-testid="confirm-candidate-apply" disabled={applying} onClick={() => void apply()}>{applying ? "RE-EVALUATING…" : "CONFIRM ATOMIC APPLY"}</button>}
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
              <div className="experiment-section-title"><span>CASE EVALUATION</span><b>{result.totalSimulationTicks.toLocaleString()} SIMULATED TICKS</b></div>
              <div className="experiment-case-head"><span>CASE</span><span>SCORE</span><span>DELTA</span><span>CAPACITY</span><span>THROUGHPUT</span><span>CONTRACTS</span></div>
              {result.cases.map((item) => <article className="experiment-case-evidence" key={item.id}>
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
