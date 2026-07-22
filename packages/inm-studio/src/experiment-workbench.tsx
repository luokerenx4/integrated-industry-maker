import React, { useEffect, useMemo, useState } from "react";
import type {
  AppliedCandidateChangeSet, BlueprintBenchmarkResult, BlueprintBenchmarkSummary, CandidateChangeSet, CandidateChangeSetPreview,
} from "@inm/core";

interface BenchmarkResponse extends BlueprintBenchmarkResult { command: "benchmark" }
interface CandidatePreviewResponse extends CandidateChangeSetPreview { command: "candidate"; action: "preview" }
interface CandidateApplyResponse extends AppliedCandidateChangeSet { command: "candidate"; action: "apply" }

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new Error(`${value.code ? `[${value.code}] ` : ""}${value.error ?? `Request failed (${response.status})`}`);
  return value;
}

const signed = (value: number, digits = 3) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const shortHash = (value: string) => value.slice(0, 12);

export function ExperimentWorkbench({
  projectId, experiments, selectedId, selectedCandidateId, onSelect, onSelectCandidate, onClose,
}: {
  projectId: string;
  experiments: BlueprintBenchmarkSummary[];
  selectedId: string | null;
  selectedCandidateId: string | null;
  onSelect: (id: string) => void;
  onSelectCandidate: (id: string | null) => void;
  onClose: () => void;
}) {
  const selected = useMemo(() => experiments.find((item) => item.id === selectedId) ?? null, [experiments, selectedId]);
  const [candidates, setCandidates] = useState<CandidateChangeSet[]>([]);
  const activeCandidate = useMemo(() => candidates.find((item) => item.id === selectedCandidateId) ?? null, [candidates, selectedCandidateId]);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResponse | null>(null);
  const [candidatePreview, setCandidatePreview] = useState<CandidatePreviewResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyArmed, setApplyArmed] = useState(false);
  const [applied, setApplied] = useState<CandidateApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = candidatePreview?.result ?? benchmarkResult;

  useEffect(() => {
    if (!selectedId && experiments[0]) onSelect(experiments[0].id);
  }, [experiments, onSelect, selectedId]);
  useEffect(() => {
    setCandidates([]); setBenchmarkResult(null); setCandidatePreview(null); setApplied(null); setApplyArmed(false); setError(null);
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
    setBenchmarkResult(null); setCandidatePreview(null); setApplied(null); setApplyArmed(false); setError(null);
  }, [selectedCandidateId]);

  const run = async () => {
    if (!selected || running) return;
    setRunning(true); setError(null); setBenchmarkResult(null); setCandidatePreview(null); setApplied(null); setApplyArmed(false);
    try {
      const root = `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(selected.id)}`;
      if (activeCandidate) setCandidatePreview(await responseJson<CandidatePreviewResponse>(await fetch(
        `${root}/candidates/${encodeURIComponent(activeCandidate.id)}/preview`,
        { method: "POST", headers: { accept: "application/json" } },
      )));
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
      setApplied(response); setApplyArmed(false);
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
              {running ? "EVALUATING FIXED WORK…" : !selected.locked ? "LOCK REQUIRED" : activeCandidate ? "PREVIEW PROPOSED CHANGE" : "RUN LOCKED EVALUATION"}
            </button>
          </section>
          <section className="candidate-selector" aria-label="Candidate change sets">
            <div className="experiment-section-title"><span>REVIEW TARGET</span><b>{candidates.length} PROJECT-LOCAL PROPOSALS</b></div>
            <div className="candidate-tabs">
              <button className={!selectedCandidateId ? "selected" : ""} onClick={() => onSelectCandidate(null)}>CURRENT CANDIDATE FILE</button>
              {candidates.map((candidate) => <button className={candidate.id === selectedCandidateId ? "selected" : ""} key={candidate.id} onClick={() => onSelectCandidate(candidate.id)}>{candidate.name}<code>{candidate.id}</code></button>)}
            </div>
            {activeCandidate && <div className="candidate-hypothesis">
              <span><small>HYPOTHESIS</small>{activeCandidate.hypothesis}</span>
              <code>BASE {shortHash(activeCandidate.baseCandidateHash)}</code>
              <b>{activeCandidate.patch.length} PATCH OPS</b>
            </div>}
          </section>
          <section className="experiment-gates" aria-label="Acceptance gates">
            <span><small>AGGREGATE DELTA</small><b>≥ {signed(selected.acceptance.minimumAggregateScoreDelta, 6)}</b></span>
            <span><small>CASE REGRESSION</small><b>≤ {selected.acceptance.maximumCaseScoreRegression.toFixed(6)}</b></span>
            <span><small>CAPACITY</small><b>{selected.acceptance.requireCandidateCapacityReady ? "READY REQUIRED" : "OBSERVED"}</b></span>
            <span><small>FIXED CASES</small><b>{selected.cases.length}</b></span>
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
              {applied ? <strong className="candidate-applied">APPLIED · PROPOSAL IS NOW STALE</strong> : !applyArmed ? <button disabled={result.verdict !== "KEEP"} onClick={() => setApplyArmed(true)}>ARM BLUEPRINT WRITE</button> : <button className="confirm" disabled={applying} onClick={() => void apply()}>{applying ? "RE-EVALUATING…" : "CONFIRM ATOMIC APPLY"}</button>}
            </section>}
            {result.reasons.length > 0 && <section className="experiment-reasons"><div className="experiment-section-title"><span>GATE DECISION</span><b>{result.reasons.length} REASONS</b></div>{result.reasons.map((reason) => <p key={reason}>{reason}</p>)}</section>}
            <section className="experiment-cases">
              <div className="experiment-section-title"><span>CASE EVALUATION</span><b>{result.totalSimulationTicks.toLocaleString()} SIMULATED TICKS</b></div>
              <div className="experiment-case-head"><span>CASE</span><span>SCORE</span><span>DELTA</span><span>CAPACITY</span><span>THROUGHPUT</span><span>CONTRACTS</span></div>
              {result.cases.map((item) => <div className="experiment-case-result" key={item.id}>
                <strong>{item.name}<code>{item.id} · seed {item.seed} · ×{item.weight}</code></strong><span>{item.baselineScore.toFixed(3)} → {item.candidateScore.toFixed(3)}</span>
                <b className={item.scoreDelta >= 0 ? "positive" : "negative"}>{signed(item.scoreDelta)}</b><span>{item.candidateCapacityReady ? "READY" : `${item.candidateCapacityGaps.length} GAPS`}</span>
                <span>{item.baselineMetrics.throughputPerMinute.toFixed(2)} → {item.candidateMetrics.throughputPerMinute.toFixed(2)}</span><span>{percent(item.baselineMetrics.contractFulfillment)} → {percent(item.candidateMetrics.contractFulfillment)}</span>
              </div>)}
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
