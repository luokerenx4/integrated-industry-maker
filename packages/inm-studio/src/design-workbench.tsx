import React, { useEffect, useMemo, useState } from "react";
import type { CandidateChangeSet, DesignDecisionEvidence, DesignProgramBrief, DesignProgramSummary, DesignRunProgress, DesignRunResult, DesignRunSummary, ResearchPromotionBoundary } from "@inm/core";

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) throw new Error(`${value.code ? `[${value.code}] ` : ""}${value.error ?? `Request failed (${response.status})`}`);
  return value;
}

type DesignRunStreamRecord =
  | { version: 1; type: "progress"; progress: DesignRunProgress }
  | { version: 1; type: "result"; result: DesignRunResult }
  | { version: 1; type: "error"; error: { code?: string; error: string } };

async function responseDesignStream(response: Response, onProgress: (progress: DesignRunProgress) => void): Promise<DesignRunResult> {
  if (!response.ok || !response.body) return responseJson<DesignRunResult>(response);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: DesignRunResult | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const record = JSON.parse(line) as DesignRunStreamRecord;
    if (record.type === "progress") onProgress(record.progress);
    else if (record.type === "result") result = record.result;
    else throw new Error(`${record.error.code ? `[${record.error.code}] ` : ""}${record.error.error}`);
  };
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
    if (chunk.done) break;
  }
  consume(buffer);
  if (!result) throw new Error("Design stream ended without a completed result");
  return result;
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
      : evidence.basis === "current-best-case-guardrail" ? "FAILS CURRENT-BEST CASE GUARDRAIL" : "NO CURRENT-BEST IMPROVEMENT";
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

function progressLabel(progress: DesignRunProgress): { title: string; detail: string } {
  if (progress.phase === "run-started") return { title: "PREPARING LOCKED BASELINE", detail: `${progress.caseCount} operating cases · ${progress.work.plannedSimulations} planned simulations` };
  if (progress.phase === "case-started" || progress.phase === "case-completed") return {
    title: `${progress.evaluation.kind.toUpperCase()} · CASE ${progress.case.index}/${progress.case.total}`,
    detail: `${progress.case.id} · ${progress.phase === "case-started" ? "simulating" : `complete${progress.candidateScore === undefined ? "" : ` · score ${progress.candidateScore.toFixed(6)}`}`}`,
  };
  if (progress.phase === "proposal-started") return {
    title: `DIAGNOSING ITERATION ${progress.iteration}`,
    detail: `${progress.branch.role.toUpperCase()} ${progress.branch.nodeId} · ${promotionBoundaryDetail(progress.promotionBoundary)} · ${progress.driverEvidence.fabLoss?.chain.join(" → ") ?? "No tracked fab loss in the driver simulation"}`,
  };
  if (progress.phase === "proposal-completed") return {
    title: `PROPOSAL ${progress.iteration} READY`,
    detail: `${progress.branch.nodeId} → ${progress.strategy}${progress.addressedCase ? ` · repairs ${progress.addressedCase}` : progress.addressedLoss ? ` · addresses ${progress.addressedLoss}` : ""}`,
  };
  if (progress.phase === "node-exhausted") return {
    title: `${progress.exhaustion.node.nodeId.toUpperCase()} SEARCH EXHAUSTED`,
    detail: `${progress.exhaustion.node.role.toUpperCase()} retained in the Pareto frontier · next ${progress.exhaustion.nextNodeId ?? "no searchable node"}`,
  };
  if (progress.phase === "candidate-completed") return { title: `ITERATION ${progress.iteration} · ${progress.decision}`, detail: !progress.decisionEvidence ? progress.error ?? progress.strategy : `${progress.frontierEvidence.parent.nodeId} → ${progress.frontierEvidence.outcome}${progress.addressedCase ? ` · repaired ${progress.addressedCase}` : ""} · leader ${signed(progress.decisionEvidence.aggregate.scoreDelta)} · ${decisionDetail(progress.decisionEvidence)}` };
  if (progress.phase === "run-completed") return { title: "IMMUTABLE RESULT READY", detail: `${shortHash(progress.resultHash)} · best iteration ${progress.best.iteration}` };
  return { title: "DESIGN RUNNING", detail: progress.phase };
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
  const [selectedRun, setSelectedRun] = useState<DesignRunResult | null>(null);
  const [budget, setBudget] = useState(1);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<DesignRunProgress | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [promoted, setPromoted] = useState<CandidateChangeSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedRunPromotable = selectedRun?.manifest.best.verdict === "KEEP"
    && selectedRun.manifest.best.promotionPatchOperations > 0;

  useEffect(() => {
    if (!selectedProgramId && programs[0]) onSelectProgram(programs[0].id);
  }, [onSelectProgram, programs, selectedProgramId]);

  const loadProgram = async (programId: string) => {
    const value = await responseJson<{ brief: DesignProgramBrief; runs: DesignRunSummary[] }>(await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(programId)}`,
    ));
    setBrief(value.brief);
    setRuns(value.runs.sort((left, right) => right.best.candidateScore - left.best.candidateScore || left.id.localeCompare(right.id)));
    setBudget(Math.min(1, value.brief.program.budget.maxCandidates));
  };

  useEffect(() => {
    setBrief(null); setRuns([]); setSelectedRun(null); setPromoted(null); setRunProgress(null); setError(null);
    if (!selectedProgramId) return;
    let active = true;
    void loadProgram(selectedProgramId).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, selectedProgramId]);

  useEffect(() => {
    setSelectedRun(null); setPromoted(null); setError(null);
    if (!selectedProgramId || !selectedRunId) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(selectedProgramId)}/runs/${encodeURIComponent(selectedRunId)}`)
      .then((response) => responseJson<DesignRunResult>(response)).then((value) => {
        if (!active) return;
        setSelectedRun(value);
        setCandidateId(`${selectedProgramId}-${selectedRunId.slice(0, 8)}`);
      }).catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    return () => { active = false; };
  }, [projectId, selectedProgramId, selectedRunId]);

  const run = async () => {
    if (!selectedProgram || running) return;
    setRunning(true); setRunProgress(null); setError(null); setPromoted(null);
    try {
      const result = await responseDesignStream(await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(selectedProgram.id)}/run`,
        { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ maxCandidates: budget }) },
      ), setRunProgress);
      await loadProgram(selectedProgram.id);
      onSelectRun(result.manifest.resultHash);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
    finally { setRunning(false); }
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
          <strong>{program.name}</strong><code>{program.id}</code><span>{program.budget.maxCandidates} MAX · {program.frontier.maximumAlternativeBranches} ALT · {program.locked ? "LOCKED" : "UNLOCKED"}</span>
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
            <div className="design-seed"><small>LOCKED BENCHMARK</small><strong>{brief.benchmark.id}</strong><span>{brief.benchmark.cases} operating cases</span><i>CURRENT-BEST GUARDRAIL</i><strong>{guardrailDetail(selectedProgram).title}</strong><span>{guardrailDetail(selectedProgram).detail}</span><i>PARETO FRONTIER</i><strong>1 LEADER + {selectedProgram.frontier.maximumAlternativeBranches} ALTERNATIVE</strong><span>only the policy-compliant leader is promotable</span><i>{selectedProgram.seed.kind === "synthesis" ? "GENERATED FROM" : "AUTHORED SEED"}</i><strong>{selectedProgram.seed.kind === "synthesis" ? selectedProgram.seed.inputBlueprint : selectedProgram.seed.blueprint}</strong><span>{brief.seed.synthesis?.method ?? "Blueprint"} · {shortHash(brief.seed.blueprintHash)}</span><i>WILL UPDATE</i><strong>{brief.promotionBase.blueprint}</strong><span>{shortHash(brief.promotionBase.hash)} · driver {brief.driver.case.id}</span></div>
            <div className="design-run-control"><label>PROPOSAL BUDGET <b>{budget}</b></label><input type="range" min="1" max={selectedProgram.budget.maxCandidates} value={budget} onChange={(event) => setBudget(Number(event.target.value))}/><button data-testid="run-design" disabled={running || !selectedProgram.locked} onClick={() => void run()}>{running && runProgress ? `RUNNING ${runProgress.work.completedSimulations}/${runProgress.work.plannedSimulations}` : running ? "STARTING…" : `RUN ${budget} CANDIDATE${budget === 1 ? "" : "S"}`}</button></div>
          </section>
          {running && runProgress && <section className="design-live-progress" aria-live="polite" data-testid="design-progress"><div><span>SHARED CORE PROGRESS</span><strong>{progressLabel(runProgress).title}</strong><code>{progressLabel(runProgress).detail}</code></div><div><b>{runProgress.work.completedSimulations}/{runProgress.work.plannedSimulations}</b><small>SIMULATIONS</small><progress value={runProgress.work.completedSimulations} max={runProgress.work.plannedSimulations}/></div></section>}
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
            <div className="design-section-title"><span>IMMUTABLE RESULT RANKING</span><b>{runs.length} RUNS</b></div>
            {runs.length ? runs.map((runSummary, index) => <button key={runSummary.id} className={runSummary.id === selectedRunId ? "selected" : ""} data-testid={`design-run-${runSummary.id}`} onClick={() => onSelectRun(runSummary.id)}>
              <em>#{index + 1}</em><span><strong>{shortHash(runSummary.id)}</strong><code>{runSummary.budget.evaluated}/{runSummary.budget.maximum} evaluated · {runSummary.stopReason}</code></span><b>{runSummary.best.candidateScore.toFixed(6)}<small>{signed(runSummary.best.scoreDelta)} VS BASELINE</small></b><i className={runSummary.best.iteration > 0 ? "leading" : "seed"}>{runSummary.best.iteration > 0 ? `ITERATION ${runSummary.best.iteration}` : runSummary.seed.kind === "synthesis" ? "GENERATED SEED" : "SEED LEADS"}</i>
            </button>) : <div className="design-empty compact">NO DESIGN EVIDENCE YET · RUN A BOUNDED SEARCH</div>}
          </section>
          {selectedRun && <section className="design-result" data-testid="design-result">
            <header><div><span className="eyebrow">SELECTED RESULT</span><h3>{shortHash(selectedRun.manifest.resultHash)}</h3><code>BLUEPRINT {shortHash(selectedRun.manifest.best.blueprintHash)}</code></div><strong>{selectedRun.manifest.best.candidateScore.toFixed(6)}<small>{signed(selectedRun.manifest.best.scoreDelta)} VS LOCKED BASELINE</small></strong></header>
            <div className="design-frontier" data-testid="design-frontier"><div className="design-section-title"><span>FINAL PARETO FRONTIER</span><b>{selectedRun.manifest.frontier.scheduler.searchOrder[0] ? `NEXT ${selectedRun.manifest.frontier.scheduler.searchOrder[0]}` : "SEARCH EXHAUSTED"}</b></div><div>{selectedRun.manifest.frontier.nodes.map((node) => <article key={node.nodeId} className={`${node.role} ${node.searchStatus}`}><small>{node.role === "leader" ? "PROMOTABLE LEADER" : "EXPLORATORY · NOT PROMOTABLE"} · {node.searchStatus.toUpperCase()}</small><strong>{node.nodeId}</strong><code>{node.parentNodeId ? `FROM ${node.parentNodeId}` : "ROOT"} · DEPTH {node.depth}</code><b>{node.candidateScore.toFixed(6)}</b><span>{shortHash(node.blueprintHash)}</span></article>)}</div></div>
            {selectedRun.manifest.exhaustions.length > 0 && <div className="design-exhaustions" data-testid="design-exhaustions"><div className="design-section-title"><span>SEARCH EXHAUSTION</span><b>{selectedRun.manifest.exhaustions.length} RETIRED</b></div>{selectedRun.manifest.exhaustions.map((exhaustion) => <div key={exhaustion.sequence}><b>X{String(exhaustion.sequence).padStart(2, "0")}</b><strong>{exhaustion.node.nodeId}</strong><span>{exhaustion.node.role.toUpperCase()} · BEFORE ITERATION {exhaustion.beforeIteration}</span><code>NEXT {exhaustion.nextNodeId ?? "NONE"}</code></div>)}</div>}
            <div className="design-iterations"><div className="design-iteration-head"><span>#</span><span>DECISION</span><span>LOSS / CASE → FAMILY / STRATEGY</span><span>SCORE EFFECT</span></div>{selectedRun.manifest.iterations.map((iteration) => <div key={iteration.iteration}><b>{iteration.iteration}</b><i className={iteration.decision.toLowerCase()}>{iteration.decision}</i><span><strong data-testid={iteration.addressedCase ? "design-repair-target" : undefined}>{iteration.addressedCase ? `REPAIRS ${iteration.addressedCase}` : iteration.addressedLoss ? `ADDRESSES ${iteration.addressedLoss}` : "NO EXPLICIT TARGET"} · {iteration.decisionFamily}</strong><code>{iteration.strategy}</code><small>BEFORE {promotionBoundaryDetail(iteration.promotionBoundary)}</small><small>FROM {iteration.frontierEvidence.parent.role.toUpperCase()} {iteration.frontierEvidence.parent.nodeId} → {iteration.frontierEvidence.outcome.toUpperCase()}{iteration.frontierEvidence.pruned.length ? ` · PRUNED ${iteration.frontierEvidence.pruned.map((item) => item.nodeId).join(", ")}` : ""}</small><small>OBSERVED {iteration.driverEvidence.fabLoss?.chain.join(" → ") ?? "no tracked fab loss"}</small>{iteration.decisionEvidence && <small>{decisionDetail(iteration.decisionEvidence)}</small>}<small>{iteration.hypothesis}</small></span><em>{!iteration.decisionEvidence ? "INVALID" : signed(iteration.decisionEvidence.aggregate.scoreDelta)}</em></div>)}</div>
            {selectedRunPromotable ? <div className="design-promotion"><div><small>CANDIDATE HANDOFF</small><strong>Freeze this accepted design for ordinary review</strong><span>Promotion creates a hash-pinned Candidate against {selectedRun.manifest.promotionBase.blueprint}. It does not apply the Blueprint.</span></div>{promoted ? <button className="promoted" onClick={() => onCandidate(promoted.benchmark, promoted.id)}>OPEN {promoted.id} →</button> : <><input aria-label="Candidate id" value={candidateId} onChange={(event) => setCandidateId(event.target.value)} pattern="[a-z0-9][a-z0-9-]*"/><button data-testid="promote-design" disabled={promoting || !candidateId} onClick={() => void promote()}>{promoting ? "VERIFYING…" : "CREATE CANDIDATE"}</button></>}</div>
              : <div className="design-no-leader"><strong>NO PROMOTABLE ACCEPTED DESIGN</strong><span>The best result either failed a locked gate or equals its promotion base. There is nothing honest to promote.</span></div>}
          </section>}
        </>}
      </div>
    </section>
  </div>;
}
