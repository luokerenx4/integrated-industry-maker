import React, { useCallback, useEffect, useState } from "react";
import type {
  IndustrialInvestigationEntry,
  IndustrialInvestigationInspection,
  IndustrialInvestigationSummary,
  InvestigationEvidenceAnchor,
  ProductionPlan,
} from "@inm/core";
import {
  followStudioOperation,
  startStudioOperation,
} from "./studio-operation-client";

class InvestigationResponseError extends Error {
  constructor(public readonly code: string | null, detail: string) {
    super(`${code ? `[${code}] ` : ""}${detail}`);
    this.name = "InvestigationResponseError";
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { code?: string; error?: string };
  if (!response.ok) {
    throw new InvestigationResponseError(
      typeof value.code === "string" ? value.code : null,
      value.error ?? `Request failed (${response.status})`,
    );
  }
  return value;
}

const apiRoot = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/investigations`;

function anchorTitle(anchor: InvestigationEvidenceAnchor): string {
  if (anchor.kind === "operating-run") return `OPERATING RUN · ${anchor.runId}`;
  if (anchor.kind === "diagnostic") return `DIAGNOSTIC · ${anchor.code}`;
  if (anchor.kind === "candidate-review") return `CANDIDATE REVIEW · ${anchor.candidateId} · ${anchor.verdict}`;
  if (anchor.kind === "factory-observation") return `FACTORY OBSERVATION · ${anchor.runId} · ${anchor.diagnostic.code}`;
  if (anchor.kind === "run-comparison") return `RUN COMPARISON · ${anchor.from.runId} → ${anchor.to.runId}`;
  return `COMMISSIONED DESIGN · ${anchor.candidateId}`;
}

function entryDetail(entry: IndustrialInvestigationEntry): string | null {
  if (entry.kind === "hypothesis") return `INTERVENTION · ${(entry.intervention ?? "blueprint").toUpperCase()} · EXPECTED · ${entry.expectedEffect}`;
  if (entry.kind === "decision") return `DISPOSITION · ${entry.disposition.toUpperCase()}`;
  return null;
}

interface ProductionPlanRevisionDraft {
  investigation: string;
  hypothesisEntry: string;
  hypothesisEntryHash: string;
  statement: string;
  expectedEffect: string;
  controlRunId: string;
  controlSeed: number;
  baseProductionPlanHash: string;
  productionPlan: ProductionPlan;
}

function ProductionPlanRevisionSession({
  projectId,
  inspection,
  onRefresh,
}: {
  projectId: string;
  inspection: IndustrialInvestigationInspection;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProductionPlanRevisionDraft | null>(null);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = inspection.handoff.productionPlanRevision;
  const api = `${apiRoot(projectId)}/${encodeURIComponent(inspection.manifest.id)}/production-plan`;

  useEffect(() => {
    if (inspection.handoff.phase !== "author-production-plan") return;
    let active = true;
    setError(null);
    void fetch(api).then((response) => responseJson<ProductionPlanRevisionDraft>(response)).then((value) => {
      if (!active) return;
      setDraft(value);
      setPlan({
        ...structuredClone(value.productionPlan),
        id: `${value.productionPlan.id}-revision`,
        name: `${value.productionPlan.name} revision`,
      });
    }).catch((nextError) => {
      if (active) setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
    return () => { active = false; };
  }, [api, inspection.handoff.phase, inspection.handoff.sourceEntry?.entryHash]);

  const setLot = (
    index: number,
    field: "releaseTick" | "dueTick" | "priority",
    value: string,
  ) => setPlan((current) => {
    if (!current) return current;
    const lotReleases = structuredClone(current.lotReleases ?? []);
    const lot = lotReleases[index];
    if (!lot) return current;
    if (field === "dueTick" || field === "priority") {
      if (value === "") delete lot[field];
      else lot[field] = Number(value);
    } else lot[field] = Number(value);
    return { ...current, lotReleases };
  });
  const setDelivery = (
    index: number,
    field: "releaseTick" | "count",
    value: string,
  ) => setPlan((current) => {
    if (!current) return current;
    const materialDeliveries = structuredClone(current.materialDeliveries ?? []);
    const delivery = materialDeliveries[index];
    if (!delivery) return current;
    delivery[field] = Number(value);
    return { ...current, materialDeliveries };
  });

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !plan) return;
    setWorking(true);
    setError(null);
    try {
      await responseJson(await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hypothesisEntry: draft.hypothesisEntry,
          productionPlan: plan,
        }),
      }));
      await onRefresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setWorking(false);
    }
  };

  const simulate = async () => {
    if (!revision) return;
    setWorking(true);
    setError(null);
    try {
      const started = await startStudioOperation(
        `/api/projects/${encodeURIComponent(projectId)}/operations/simulate`,
        {
          selection: {
            ...revision.selection,
            productionPlan: revision.result.id,
          },
          seed: revision.controlSeed,
        },
      );
      const completed = await followStudioOperation(
        projectId,
        started.operation,
        () => {},
        new AbortController().signal,
      );
      if (completed.status !== "completed") {
        throw new Error(completed.error?.message ?? `Simulation ${completed.status}`);
      }
      await onRefresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setWorking(false);
    }
  };

  if (inspection.handoff.phase === "compare-production-plan" && revision) {
    return <section className="production-plan-session ready" id="production-plan-session" data-testid="production-plan-session">
      <header><span>PRODUCTION PLAN REVISION</span><b>RUN READY</b></header>
      <div className="production-plan-session-identity">
        <strong>{revision.base.id} → {revision.result.id}</strong>
        <code>{revision.revisionHash.slice(0, 16)} · {revision.controlRunId} → {revision.interventionRunId}</code>
      </div>
      <p>The exact one-variable Run pair is ready for quantitative and visual judgment. No disposition has been inferred.</p>
      <a className="production-plan-primary" href={inspection.handoff.nextAction.studioRoute}>REVIEW EXACT COMPARISON →</a>
    </section>;
  }

  if (inspection.handoff.phase === "simulate-production-plan" && revision) {
    return <section className="production-plan-session ready" id="production-plan-session" data-testid="production-plan-session">
      <header><span>PRODUCTION PLAN REVISION</span><b>SOURCE PINNED</b></header>
      <div className="production-plan-session-identity">
        <strong>{revision.base.id} → {revision.result.id}</strong>
        <code>{revision.revisionHash.slice(0, 16)} · control {revision.controlRunId}</code>
      </div>
      <p>The authored plan is separate from the project default. Run it with the exact control seed and unchanged non-plan selection.</p>
      {error && <div className="investigation-error" role="alert">{error}</div>}
      <button className="production-plan-primary" disabled={working} onClick={() => { void simulate(); }}>
        {working ? "SIMULATING…" : "SIMULATE AUTHORED PLAN"}
      </button>
    </section>;
  }

  if (inspection.handoff.phase !== "author-production-plan") return null;
  return <section className="production-plan-session" id="production-plan-session" data-testid="production-plan-session">
    <header><span>AUTHOR PRODUCTION PLAN</span><b>HUMAN / AGENT OWNED</b></header>
    {!draft || !plan ? <p>{error ?? "Loading exact control schedule…"}</p> : <form onSubmit={(event) => { void create(event); }}>
      <div className="production-plan-source">
        <small>HYPOTHESIS · {draft.hypothesisEntry} · {draft.hypothesisEntryHash.slice(0, 12)}</small>
        <strong>{draft.statement}</strong>
        <p>Expected: {draft.expectedEffect}</p>
        <code>CONTROL {draft.controlRunId} · PLAN {draft.productionPlan.id} {draft.baseProductionPlanHash.slice(0, 12)}</code>
      </div>
      <div className="production-plan-meta">
        <label>NEW PLAN ID<input required pattern="[a-z0-9][a-z0-9-]*" value={plan.id} onChange={(event) => setPlan({ ...plan, id: event.target.value })} /></label>
        <label>NAME<input required value={plan.name} onChange={(event) => setPlan({ ...plan, name: event.target.value })} /></label>
      </div>
      <div className="production-plan-schedules">
        <section>
          <header><span>LOT RELEASES</span><b>{plan.lotReleases?.length ?? 0}</b></header>
          <div className="production-plan-table">
            <div className="production-plan-row headings"><span>LOT</span><span>RELEASE</span><span>DUE</span><span>PRIORITY</span></div>
            {(plan.lotReleases ?? []).map((lot, index) => <div className="production-plan-row" key={lot.id}>
              <code>{lot.id}</code>
              <input aria-label={`${lot.id} release tick`} type="number" min="0" step="1" value={lot.releaseTick} onChange={(event) => setLot(index, "releaseTick", event.target.value)} />
              <input aria-label={`${lot.id} due tick`} type="number" min="0" step="1" value={lot.dueTick ?? ""} onChange={(event) => setLot(index, "dueTick", event.target.value)} />
              <input aria-label={`${lot.id} priority`} type="number" step="1" value={lot.priority ?? ""} onChange={(event) => setLot(index, "priority", event.target.value)} />
            </div>)}
          </div>
        </section>
        <section>
          <header><span>MATERIAL DELIVERIES</span><b>{plan.materialDeliveries?.length ?? 0}</b></header>
          <div className="production-plan-table deliveries">
            <div className="production-plan-row headings"><span>DELIVERY</span><span>RELEASE</span><span>COUNT</span></div>
            {(plan.materialDeliveries ?? []).map((delivery, index) => <div className="production-plan-row" key={delivery.id}>
              <code>{delivery.id}</code>
              <input aria-label={`${delivery.id} release tick`} type="number" min="0" step="1" value={delivery.releaseTick} onChange={(event) => setDelivery(index, "releaseTick", event.target.value)} />
              <input aria-label={`${delivery.id} count`} type="number" min="1" step="1" value={delivery.count} onChange={(event) => setDelivery(index, "count", event.target.value)} />
            </div>)}
          </div>
        </section>
      </div>
      {error && <div className="investigation-error" role="alert">{error}</div>}
      <button className="production-plan-primary" disabled={working} type="submit">{working ? "VERIFYING…" : "CREATE SOURCE-PINNED REVISION"}</button>
    </form>}
  </section>;
}

export function InvestigationWorkbench({
  projectId,
  selectedId,
  refreshRevision,
  onSelect,
  onClose,
}: {
  projectId: string;
  selectedId: string | null;
  refreshRevision: number;
  onSelect: (investigationId: string | null) => void;
  onClose: () => void;
}) {
  const returnCandidateId = new URLSearchParams(window.location.search).get("candidate")?.trim() || null;
  const comparisonFromRunId = new URLSearchParams(window.location.search).get("from")?.trim() || null;
  const comparisonToRunId = new URLSearchParams(window.location.search).get("to")?.trim() || null;
  const returnedComparison = comparisonFromRunId && comparisonToRunId
    ? { fromRunId: comparisonFromRunId, toRunId: comparisonToRunId }
    : null;
  const requestedDisposition = new URLSearchParams(window.location.search).get("disposition");
  const suggestedDisposition = requestedDisposition === "keep"
    || requestedDisposition === "revise"
    || requestedDisposition === "discard"
    ? requestedDisposition
    : "revise";
  const [summaries, setSummaries] = useState<IndustrialInvestigationSummary[] | null>(null);
  const [inspection, setInspection] = useState<IndustrialInvestigationInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<IndustrialInvestigationEntry["kind"]>(
    returnCandidateId ? "decision" : "observation",
  );
  const returnAlreadyRecorded = Boolean(returnCandidateId && inspection?.anchors.some(({ anchor }) =>
    anchor.kind === "candidate-review" && anchor.candidateId === returnCandidateId));
  const prefillCandidateId = returnAlreadyRecorded ? null : returnCandidateId;
  const suggestedAnchorId = prefillCandidateId ? `${prefillCandidateId}-review` : "";
  const comparisonAlreadyRecorded = Boolean(returnedComparison && inspection?.anchors.some(({ anchor }) =>
    anchor.kind === "run-comparison"
    && anchor.from.runId === returnedComparison.fromRunId
    && anchor.to.runId === returnedComparison.toRunId));
  const prefillComparison = comparisonAlreadyRecorded ? null : returnedComparison;
  const suggestedComparisonAnchorId = prefillComparison
    ? `${prefillComparison.fromRunId}-to-${prefillComparison.toRunId}`
    : "";

  useEffect(() => {
    if (prefillCandidateId) setEntryKind("decision");
    else if (returnAlreadyRecorded || returnedComparison) setEntryKind("observation");
  }, [prefillCandidateId, returnAlreadyRecorded, comparisonFromRunId, comparisonToRunId]);

  useEffect(() => {
    if (prefillCandidateId || returnedComparison || !inspection) return;
    if (inspection.handoff.authorship?.kind === "investigation-entry") {
      setEntryKind(inspection.handoff.authorship.entryKind);
    }
  }, [inspection?.handoff.phase, prefillCandidateId, returnedComparison]);

  const loadList = useCallback(async () => {
    const value = await responseJson<{ investigations: IndustrialInvestigationSummary[] }>(
      await fetch(apiRoot(projectId)),
    );
    setSummaries(value.investigations);
  }, [projectId]);

  const loadSelected = useCallback(async (investigationId: string) => {
    setLoading(true);
    setError(null);
    try {
      setInspection(await responseJson<IndustrialInvestigationInspection>(
        await fetch(`${apiRoot(projectId)}/${encodeURIComponent(investigationId)}`),
      ));
    } catch (nextError) {
      setInspection(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setError(null);
    void loadList().catch((nextError) =>
      setError(nextError instanceof Error ? nextError.message : String(nextError)));
  }, [loadList, refreshRevision]);

  useEffect(() => {
    if (selectedId) void loadSelected(selectedId);
    else setInspection(null);
  }, [loadSelected, refreshRevision, selectedId]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setLoading(true);
    setError(null);
    try {
      const created = await responseJson<IndustrialInvestigationInspection>(await fetch(apiRoot(projectId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: fields.get("id"),
          name: fields.get("name"),
          question: fields.get("question"),
        }),
      }));
      form.reset();
      setCreateOpen(false);
      setInspection(created);
      await loadList();
      onSelect(created.manifest.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  const append = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inspection) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const introducedAnchorId = String(fields.get("introducedAnchorId") ?? "").trim();
    const introducedCandidateId = String(fields.get("introducedCandidateId") ?? "").trim();
    const introducedObservationId = String(fields.get("introducedObservationId") ?? "").trim();
    const introducedComparisonId = String(fields.get("introducedComparisonId") ?? "").trim();
    const introducedComparisonFrom = String(fields.get("introducedComparisonFrom") ?? "").trim();
    const introducedComparisonTo = String(fields.get("introducedComparisonTo") ?? "").trim();
    if (Boolean(introducedAnchorId) !== Boolean(introducedCandidateId)) {
      setError("An introduced Candidate review requires both its Investigation anchor id and Candidate id.");
      return;
    }
    if (introducedObservationId && (introducedAnchorId || introducedCandidateId)) {
      setError("Capture a factory observation or introduce a Candidate review in one entry, not both.");
      return;
    }
    if (Boolean(introducedComparisonId)
      !== Boolean(introducedComparisonFrom && introducedComparisonTo)) {
      setError("A Run comparison requires an evidence anchor id plus exact FROM and TO Run ids.");
      return;
    }
    if (introducedComparisonId
      && (introducedObservationId || introducedAnchorId || introducedCandidateId)) {
      setError("Capture one Run comparison, factory observation, or Candidate review per entry.");
      return;
    }
    const evidence = fields.getAll("evidence").map(String);
    if (introducedAnchorId && introducedCandidateId && !evidence.includes(introducedAnchorId)) {
      evidence.push(introducedAnchorId);
    }
    if (introducedObservationId && !evidence.includes(introducedObservationId)) {
      evidence.push(introducedObservationId);
    }
    if (introducedComparisonId && !evidence.includes(introducedComparisonId)) {
      evidence.push(introducedComparisonId);
    }
    const common = {
      id: fields.get("id"),
      author: fields.get("author"),
      kind: entryKind,
      statement: fields.get("statement"),
      evidence,
      introduceEvidence: introducedComparisonId
        ? {
          id: introducedComparisonId,
          kind: "run-comparison",
          fromRunId: introducedComparisonFrom,
          toRunId: introducedComparisonTo,
        }
        : introducedObservationId
        ? {
          id: introducedObservationId,
          kind: "factory-observation",
        }
        : introducedAnchorId && introducedCandidateId
          ? {
          id: introducedAnchorId,
          kind: "candidate-review",
          candidateId: introducedCandidateId,
        }
          : undefined,
    };
    const body = entryKind === "hypothesis"
      ? {
          ...common,
          intervention: fields.get("intervention"),
          expectedEffect: fields.get("expectedEffect"),
        }
      : entryKind === "decision"
        ? { ...common, disposition: fields.get("disposition") }
        : common;
    setLoading(true);
    setError(null);
    try {
      setInspection(await responseJson<IndustrialInvestigationInspection>(await fetch(
        `${apiRoot(projectId)}/${encodeURIComponent(inspection.manifest.id)}/entries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      )));
      form.reset();
      setEntryKind("observation");
      if (window.location.search) {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
      await loadList();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  return <div className="modal-backdrop investigation-backdrop" role="presentation"><section className="investigation-workbench" role="dialog" aria-modal="true" aria-label="Industrial investigation workbench" data-testid="investigation-workbench">
    <header className="investigation-header">
      <button className="investigation-close" onClick={onClose} aria-label="Close investigations">←</button>
      <div><span className="eyebrow">PROJECT-LOCAL REASONING</span><h1>Industrial Investigations</h1><code>{projectId}</code></div>
      <div className="investigation-authority"><i /><span>HUMAN / AGENT</span><b>APPEND-ONLY</b></div>
      <button className="investigation-new" onClick={() => setCreateOpen((value) => !value)}>
        {createOpen ? "CANCEL" : "+ NEW INVESTIGATION"}
      </button>
    </header>

    <aside className="investigation-list">
      <div className="investigation-list-title"><span>OPEN QUESTIONS</span><b>{summaries?.length ?? "—"}</b></div>
      {summaries?.map((item) => <button
        key={item.id}
        className={selectedId === item.id ? "active" : ""}
        onClick={() => onSelect(item.id)}
        data-testid={`investigation-${item.id}`}
      >
        <span>{item.entryCount.toString().padStart(2, "0")}</span>
        <strong>{item.name}</strong>
        <small>{item.question}</small>
        <code>{item.lastEntry ? `${item.lastEntry.kind} · ${item.lastEntry.author}` : "NO ENTRIES YET"}</code>
      </button>)}
      {summaries?.length === 0 && <div className="investigation-empty"><b>NO INVESTIGATION</b><p>Create a durable question from the current operating evidence.</p></div>}
      {!summaries && !error && <div className="investigation-empty"><b>READING PROJECT</b></div>}
    </aside>

    <div className="investigation-main">
      {createOpen && <form className="investigation-create" onSubmit={(event) => { void create(event); }}>
        <div><span className="eyebrow">FREEZE CURRENT EVIDENCE</span><h2>Open an industrial question</h2><p>The current compatible operating Run, leading diagnostic, and verified commissioned Design lineage become immutable anchors.</p></div>
        <label>ID<input name="id" required pattern="[a-z0-9][a-z0-9-]*" placeholder="inspection-starvation-next-step" /></label>
        <label>NAME<input name="name" required placeholder="Inspection starvation next step" /></label>
        <label className="wide">QUESTION<textarea name="question" required placeholder="Which physically distinct intervention should we test next?" /></label>
        <button disabled={loading} type="submit">{loading ? "FREEZING…" : "CREATE FROM CURRENT EVIDENCE"}</button>
      </form>}

      {!createOpen && !selectedId && <div className="investigation-welcome">
        <span className="investigation-mark">∴</span>
        <span className="eyebrow">EVIDENCE → REASONING → DECISION</span>
        <h2>Resume a question without reconstructing its history.</h2>
        <p>Select an Investigation or freeze the current project evidence into a new one. Observations, hypotheses, and decisions remain explicit and attributable.</p>
      </div>}

      {!createOpen && selectedId && loading && !inspection && <div className="investigation-welcome"><span className="eyebrow">VERIFYING EVIDENCE CHAIN</span><h2>{selectedId}</h2></div>}
      {!createOpen && error && <div className="investigation-error"><b>INVESTIGATION UNAVAILABLE</b><p>{error}</p></div>}

      {!createOpen && inspection && <div className="investigation-detail">
        <section className="investigation-brief">
          <div>
            <span className="eyebrow">{inspection.state.toUpperCase()} EVIDENCE · {inspection.manifest.authority.toUpperCase()}</span>
            <h2>{inspection.manifest.name}</h2>
            <p>{inspection.manifest.question}</p>
          </div>
          <dl>
            <div><dt>SELECTION</dt><dd>{Object.values(inspection.manifest.selection).join(" · ")}</dd></div>
            <div><dt>MANIFEST</dt><dd>{inspection.manifestHash.slice(0, 16)}</dd></div>
            <div><dt>ENTRIES</dt><dd>{inspection.entries.length}</dd></div>
          </dl>
        </section>

        <section className="investigation-next-action">
          <div>
            <span className="eyebrow">DESIGN SESSION · {inspection.handoff.phase.replaceAll("-", " ").toUpperCase()}</span>
            <h3>{inspection.handoff.nextAction.title}</h3>
            <p>{inspection.handoff.nextAction.reason}</p>
            {inspection.handoff.sourceEntry && <small data-testid="investigation-handoff-source">
              SOURCE · {String(inspection.handoff.sourceEntry.sequence).padStart(4, "0")} {inspection.handoff.sourceEntry.id} · {inspection.handoff.sourceEntry.entryHash.slice(0, 12)}
            </small>}
            {inspection.handoff.evidenceIds.length > 0 && <small data-testid="investigation-handoff-evidence">
              CITE · {inspection.handoff.evidenceIds.join(" + ")}
            </small>}
          </div>
          <div>
            <a href={inspection.handoff.nextAction.studioRoute}>{inspection.handoff.nextAction.actionLabel} →</a>
            <code>{inspection.handoff.nextAction.argv.join(" ")}</code>
            {inspection.handoff.authorship && <small>
              REQUIRED · {inspection.handoff.authorship.requiredFields.join(" · ")}
            </small>}
          </div>
        </section>

        <ProductionPlanRevisionSession
          projectId={projectId}
          inspection={inspection}
          onRefresh={() => loadSelected(inspection.manifest.id)}
        />

        <section className="investigation-anchors">
          <header><span>EVIDENCE ANCHORS</span><b>FAIL CLOSED</b></header>
          <div>{inspection.anchors.map((item) => <article key={item.anchor.id} className={item.state}>
            <span className="anchor-state"><i />{item.state.toUpperCase()}</span>
            <strong>{anchorTitle(item.anchor)}</strong>
            <p>{item.message}</p>
            <div><a href={item.navigation.studioRoute}>OPEN EVIDENCE →</a><code>{item.navigation.argv.join(" ")}</code></div>
          </article>)}</div>
        </section>

        <section className="investigation-log">
          <header><span>REASONING LOG</span><b>{inspection.entries.length} IMMUTABLE ENTRIES</b></header>
          {inspection.entries.length ? <ol>{inspection.entries.map((entry) => <li key={entry.entryHash}>
            <span>{entry.sequence.toString().padStart(4, "0")}</span>
            <div>
              <header><b>{entry.kind.toUpperCase()}</b><code>{entry.author.toUpperCase()} · {entry.entryHash.slice(0, 10)}</code></header>
              <p>{entry.statement}</p>
              {entryDetail(entry) && <strong>{entryDetail(entry)}</strong>}
              {entry.introducedAnchors.length > 0 && <small>INTRODUCED · {entry.introducedAnchors.map((anchor) => `${anchor.id}:${anchor.kind}`).join(" + ")}</small>}
              <small>{entry.evidence.length ? `EVIDENCE · ${entry.evidence.join(" + ")}` : "NO DIRECT EVIDENCE REFERENCE"}</small>
            </div>
          </li>)}</ol> : <div className="investigation-empty-log">No reasoning entry yet. Begin with a visible or measured observation.</div>}
        </section>

        {returnCandidateId && <section className="investigation-return-context" data-testid="investigation-return-context">
          <div><span className="eyebrow">{returnAlreadyRecorded ? "REVIEW ALREADY RECORDED" : "REVIEW RETURNED · EXPLICIT DECISION REQUIRED"}</span><strong>{returnCandidateId}</strong></div>
          <p>{returnAlreadyRecorded
            ? "This exact Candidate already has retained review evidence in the Investigation hash chain. The ordinary reasoning form remains available without duplicate evidence prefill."
            : "The Candidate review is immutable evidence. Candidate id, evidence anchor, and suggested disposition are prepared below; authorship and the decision statement remain yours."}</p>
        </section>}
        {returnedComparison && <section className="investigation-return-context" data-testid="investigation-comparison-context">
          <div><span className="eyebrow">{comparisonAlreadyRecorded ? "COMPARISON ALREADY RETAINED" : "EXACT RUN COMPARISON RETURNED"}</span><strong>{returnedComparison.fromRunId} → {returnedComparison.toRunId}</strong></div>
          <p>{comparisonAlreadyRecorded
            ? "This exact Run pair already exists in the append-only Investigation chain. The ordinary reasoning form remains available without duplicate evidence prefill."
            : "The comparison remains read-only until you append an authored observation. Core will derive and verify both Run identities, the deterministic comparison hash, and the TO operating context."}</p>
        </section>}

        <form
          className="investigation-entry-form"
          id="investigation-authoring"
          key={`${returnCandidateId ?? "ordinary-entry"}:${returnedComparison?.fromRunId ?? "no-from"}:${returnedComparison?.toRunId ?? "no-to"}:${returnAlreadyRecorded || comparisonAlreadyRecorded ? "recorded" : "new"}`}
          onSubmit={(event) => { void append(event); }}
        >
          <header><span>APPEND REASONING</span><b>EXPLICIT AUTHORSHIP</b></header>
          <div className="investigation-entry-grid">
            <label>ID<input name="id" required pattern="[a-z0-9][a-z0-9-]*" placeholder="inspection-input-is-empty" /></label>
            <label>AUTHOR<select name="author" defaultValue="human"><option value="human">HUMAN</option><option value="agent">AGENT</option></select></label>
            <label>KIND<select value={entryKind} onChange={(event) => setEntryKind(event.target.value as IndustrialInvestigationEntry["kind"])}><option value="observation">OBSERVATION</option><option value="hypothesis">HYPOTHESIS</option><option value="decision">DECISION</option></select></label>
            <label className="wide">STATEMENT<textarea name="statement" required placeholder="State one observable fact, testable causal claim, or explicit decision." /></label>
            {entryKind === "hypothesis" && <label>CONTROLLED INTERVENTION<select name="intervention" defaultValue="blueprint"><option value="blueprint">BLUEPRINT</option><option value="production-plan">PRODUCTION PLAN</option></select></label>}
            {entryKind === "hypothesis" && <label className="wide">EXPECTED EFFECT<textarea name="expectedEffect" required placeholder="What exact measured behavior should change if this is true?" /></label>}
            {entryKind === "decision" && <label>DISPOSITION<select name="disposition" defaultValue={prefillCandidateId ? suggestedDisposition : "keep"}><option value="keep">KEEP</option><option value="revise">REVISE</option><option value="defer">DEFER</option><option value="discard">DISCARD</option></select></label>}
            {entryKind === "observation" && <label>CAPTURE CURRENT FACTORY AS<input name="introducedObservationId" pattern="[a-z0-9][a-z0-9-]*" placeholder="post-change-factory" /></label>}
            {entryKind === "observation" && <label>CAPTURE RUN COMPARISON AS<input name="introducedComparisonId" defaultValue={suggestedComparisonAnchorId} pattern="[a-z0-9][a-z0-9-]*" placeholder="compact-cell-comparison" /></label>}
            {entryKind === "observation" && <label>FROM RUN<input name="introducedComparisonFrom" defaultValue={prefillComparison?.fromRunId ?? ""} placeholder="100-simulate" /></label>}
            {entryKind === "observation" && <label>TO RUN<input name="introducedComparisonTo" defaultValue={prefillComparison?.toRunId ?? ""} placeholder="101-simulate" /></label>}
            <label>INTRODUCE REVIEW AS<input name="introducedAnchorId" defaultValue={suggestedAnchorId} placeholder="metrology-standby-review" /></label>
            <label>REVIEWED CANDIDATE<input name="introducedCandidateId" defaultValue={prefillCandidateId ?? ""} placeholder="metrology-low-power-standby" /></label>
          </div>
          <fieldset><legend>EVIDENCE REFERENCES</legend>{inspection.anchors.map(({ anchor }) => <label key={anchor.id}><input
            type="checkbox"
            name="evidence"
            value={anchor.id}
            defaultChecked={inspection.handoff.evidenceIds.includes(anchor.id)}
          />{anchor.id}</label>)}</fieldset>
          <button disabled={loading} type="submit">{loading ? "VERIFYING…" : "APPEND TO HASH CHAIN"}</button>
        </form>
      </div>}
    </div>
  </section></div>;
}
