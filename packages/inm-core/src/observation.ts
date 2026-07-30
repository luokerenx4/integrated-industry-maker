import type { ProjectSelection } from "./loader";
import {
  openProjectWorkbenchSnapshot,
  type ProjectWorkbenchSnapshot,
  type WorkbenchDiagnostic,
  type WorkbenchSubjectReference,
} from "./workbench";
import type { ScoreBreakdownComponent } from "./types";
import { hashValue } from "./utils";

export type FactoryObservationViewKind = "factory-overview" | "factory-focus" | "catalog-focus" | "analysis-evidence";

export interface FactoryObservationView {
  id: string;
  kind: FactoryObservationViewKind;
  label: string;
  purpose: string;
  studioRoute: string;
  required: boolean;
  subject: WorkbenchSubjectReference | null;
}

export interface FactoryObservationBrief {
  version: 4;
  id: string;
  status: "ready" | "needs-run";
  authority: "human-or-agent";
  project: ProjectWorkbenchSnapshot["project"];
  selection: {
    world: string;
    blueprint: string;
    productionPlan: string;
    scenario: string;
    objective: string;
  };
  hashes: ProjectWorkbenchSnapshot["hashes"];
  evidence: {
    state: "compatible" | "missing";
    run: null | {
      id: string;
      resultHash: string;
      score: number;
      decision: ProjectWorkbenchSnapshot["runs"][number]["decision"];
    };
    sourceLotLineage: ProjectWorkbenchSnapshot["sourceLotLineage"];
  };
  leadingDiagnostic: null | Pick<WorkbenchDiagnostic, "id" | "code" | "severity" | "message" | "subjects" | "evidence">;
  leadingObjectiveTradeoff: null | {
    component: ScoreBreakdownComponent;
    contribution: number;
    runId: string;
    subjects: WorkbenchSubjectReference[];
    summary: string;
    interpretation: "objective-accounting-not-causal-loss";
  };
  views: FactoryObservationView[];
  handoff: {
    requiredStatements: string[];
    nextStep: string;
    automationBoundary: string;
  };
}

function selectedRun(
  snapshot: ProjectWorkbenchSnapshot,
  requestedRunId?: string,
): ProjectWorkbenchSnapshot["runs"][number] | null {
  if (requestedRunId) {
    const requested = snapshot.runs.find((run) => run.id === requestedRunId);
    if (!requested) throw new Error(`Unknown immutable run '${requestedRunId}' in project '${snapshot.project.id}'`);
    if (!requested.compatible) {
      throw new Error(`Immutable run '${requestedRunId}' is not compatible with the exact selected project hashes`);
    }
    if (requested.selection.world !== snapshot.selection.world.id
      || requested.selection.blueprint !== snapshot.selection.blueprint.id
      || requested.selection.productionPlan !== snapshot.selection.productionPlan.id
      || requested.selection.scenario !== snapshot.selection.scenario.id
      || requested.selection.objective !== snapshot.selection.objective.id) {
      throw new Error(`Immutable run '${requestedRunId}' does not match the exact selected World, Blueprint, Production Plan, Scenario, and Objective`);
    }
    return requested;
  }
  return snapshot.runs.filter((run) => run.compatible
    && run.selection.world === snapshot.selection.world.id
    && run.selection.blueprint === snapshot.selection.blueprint.id
    && run.selection.productionPlan === snapshot.selection.productionPlan.id
    && run.selection.scenario === snapshot.selection.scenario.id
    && run.selection.objective === snapshot.selection.objective.id).at(-1) ?? null;
}

function withRun(route: string, runId: string | null): string {
  return runId ? `${route}?run=${encodeURIComponent(runId)}` : route;
}

function subjectView(
  projectRoute: string,
  runId: string | null,
  subject: WorkbenchSubjectReference,
): FactoryObservationView | null {
  const encoded = encodeURIComponent(subject.id);
  if (subject.kind === "device" || subject.kind === "connection") return {
    id: `focus:${subject.kind}:${subject.id}`,
    kind: "factory-focus",
    label: `Inspect ${subject.kind} ${subject.id}`,
    purpose: "Relate the measured diagnostic or Objective exposure to the exact spatial equipment or material path.",
    studioRoute: withRun(`${projectRoute}/factory/${subject.kind === "device" ? "devices" : "connections"}/${encoded}`, runId),
    required: true,
    subject: { ...subject },
  };
  if (subject.kind === "resource" || subject.kind === "process" || subject.kind === "route") return {
    id: `focus:${subject.kind}:${subject.id}`,
    kind: "catalog-focus",
    label: `Inspect ${subject.kind} ${subject.id}`,
    purpose: "Check the project-local industrial definition before attributing visible behavior to it.",
    studioRoute: `${projectRoute}/catalog/${subject.kind === "resource" ? "resources" : subject.kind === "process" ? "processes" : "routes"}/${encoded}`,
    required: true,
    subject: { ...subject },
  };
  return null;
}

export function buildFactoryObservationBrief(
  snapshot: ProjectWorkbenchSnapshot,
  requestedRunId?: string,
): FactoryObservationBrief {
  const run = selectedRun(snapshot, requestedRunId);
  const projectRoute = `/${encodeURIComponent(snapshot.project.id)}`;
  const nextDiagnosticId = "diagnosticId" in snapshot.nextAction.target
    ? snapshot.nextAction.target.diagnosticId
    : null;
  const disposedDiagnosticIds = new Set(
    snapshot.lossDispositions.map((disposition) => disposition.diagnosticId),
  );
  const leadingDiagnostic = (nextDiagnosticId
    ? snapshot.diagnostics.find((diagnostic) => diagnostic.id === nextDiagnosticId)
    : null)
    ?? snapshot.diagnostics.find((diagnostic) =>
      diagnostic.evidence.source === "compatible-run"
      && !disposedDiagnosticIds.has(diagnostic.id))
    ?? snapshot.diagnostics.find((diagnostic) =>
      diagnostic.severity !== "info"
      && !disposedDiagnosticIds.has(diagnostic.id))
    ?? null;
  const objectiveEvidence = snapshot.objectiveEvidence;
  const objectiveTarget = objectiveEvidence !== null
    && objectiveEvidence.runId === run?.id
    ? objectiveEvidence
    : null;
  const objectiveSubjects: WorkbenchSubjectReference[] = objectiveTarget?.dominantPenalty?.id === "wip"
    ? objectiveTarget.wip.locations
      .flatMap((location) => location.subject ? [{ ...location.subject }] : [])
      .filter((subject, index, subjects) => subjects.findIndex((item) =>
        item.kind === subject.kind && item.id === subject.id) === index)
      .slice(0, 2)
    : [];
  const leadingObjectiveTradeoff = objectiveTarget?.dominantPenalty ? {
    component: objectiveTarget.dominantPenalty.id,
    contribution: objectiveTarget.dominantPenalty.contribution,
    runId: objectiveTarget.runId,
    subjects: objectiveSubjects,
    summary: objectiveTarget.dominantPenalty.id === "wip"
      ? `${objectiveTarget.wip.averageWipEquivalentUnits.toFixed(3)} average ${objectiveTarget.wip.equivalentUnit} (${objectiveTarget.wip.averageRawWipInventory.toFixed(3)} raw WIP items) contributes ${objectiveTarget.wip.scoreContribution.toFixed(3)} to the exact Objective score; leading equivalent exposure is ${objectiveTarget.wip.locations.slice(0, 2).map((location) => `${location.averageWipEquivalentUnits.toFixed(3)} at ${location.physicalLocation}`).join(" and ")}.`
      : `${objectiveTarget.dominantPenalty.id} contributes ${objectiveTarget.dominantPenalty.contribution.toFixed(3)} to the exact Objective score.`,
    interpretation: "objective-accounting-not-causal-loss" as const,
  } : null;
  const focusSubjects = [
    ...(leadingDiagnostic?.subjects.slice(0, 3) ?? []),
    ...(leadingObjectiveTradeoff?.subjects ?? []),
  ];
  const focusViews = [...new Map(focusSubjects
    .map((subject) => subjectView(projectRoute, run?.id ?? null, subject))
    .filter((view): view is FactoryObservationView => view !== null)
    .map((view) => [view.id, view])).values()].slice(0, 5);
  const views: FactoryObservationView[] = [
    {
      id: "factory-overview",
      kind: "factory-overview",
      label: "Observe the complete factory replay",
      purpose: run
        ? "Inspect spatial flow, operating state, congestion, idle equipment, and the relationship between regions across the immutable run."
        : "Inspect the authored static layout; simulate before making claims about runtime behavior.",
      studioRoute: withRun(`${projectRoute}/factory`, run?.id ?? null),
      required: true,
      subject: null,
    },
    ...focusViews,
    ...(leadingDiagnostic ? [{
      id: `evidence:${leadingDiagnostic.id}`,
      kind: "analysis-evidence" as const,
      label: "Read the leading structured evidence",
      purpose: "Compare the visual interpretation with Core-owned diagnostics instead of inferring quantities from pixels.",
      studioRoute: `${projectRoute}/analysis/diagnostics/${encodeURIComponent(leadingDiagnostic.id)}`,
      required: true,
      subject: null,
    }] : []),
  ];
  const identity = {
    version: 1 as const,
    project: snapshot.project.id,
    selection: {
      world: snapshot.selection.world.id,
      blueprint: snapshot.selection.blueprint.id,
      productionPlan: snapshot.selection.productionPlan.id,
      scenario: snapshot.selection.scenario.id,
      objective: snapshot.selection.objective.id,
    },
    hashes: snapshot.hashes,
    run: run ? { id: run.id, resultHash: run.resultHash } : null,
    diagnostic: leadingDiagnostic?.id ?? null,
    objectiveTradeoff: leadingObjectiveTradeoff
      ? { component: leadingObjectiveTradeoff.component, runId: leadingObjectiveTradeoff.runId, subjects: leadingObjectiveTradeoff.subjects }
      : null,
    views: views.map((view) => ({ id: view.id, route: view.studioRoute })),
  };
  return {
    version: 4,
    id: hashValue(identity),
    status: run ? "ready" : "needs-run",
    authority: "human-or-agent",
    project: { ...snapshot.project },
    selection: identity.selection,
    hashes: { ...snapshot.hashes },
    evidence: {
      state: run ? "compatible" : "missing",
      run: run ? { id: run.id, resultHash: run.resultHash, score: run.score, decision: run.decision } : null,
      sourceLotLineage: run && snapshot.sourceLotLineage?.runId === run.id
        ? structuredClone(snapshot.sourceLotLineage)
        : null,
    },
    leadingDiagnostic: leadingDiagnostic ? {
      id: leadingDiagnostic.id,
      code: leadingDiagnostic.code,
      severity: leadingDiagnostic.severity,
      message: leadingDiagnostic.message,
      subjects: leadingDiagnostic.subjects.map((subject) => ({ ...subject })),
      evidence: { ...leadingDiagnostic.evidence },
    } : null,
    leadingObjectiveTradeoff,
    views,
    handoff: {
      requiredStatements: [
        "What spatial or operating behavior was visible in the exact run-qualified views?",
        leadingDiagnostic && leadingObjectiveTradeoff
          ? "How does that behavior relate—or not relate—to the leading structured diagnostic and the separately measured Objective tradeoff?"
          : leadingDiagnostic
            ? "How does that behavior relate—or not relate—to the leading structured diagnostic?"
            : leadingObjectiveTradeoff
              ? "Which part of the Objective tradeoff appears avoidable, and which part is necessary industrial inventory?"
              : "What visible behavior, if any, justifies opening a new causal investigation after the current bounded loss frontier?",
        "What falsifiable industrial hypothesis and smallest exact intervention should be tested?",
        "Which metrics, locked cases, and visible behavior must improve or remain unchanged?",
      ],
      nextStep: run
        ? leadingDiagnostic
          ? "Choose one explicit diagnostic or Objective-tradeoff hypothesis, author one deliberate Blueprint or Candidate intervention, then simulate, Benchmark, and visually compare before deciding."
          : leadingObjectiveTradeoff
            ? "Use the Objective tradeoff and Resource-qualified views to author a bounded hypothesis; preserve valued output, service, and quality while testing whether the exposure can fall."
            : "Review the compatible Run and bounded loss frontier; open a new intervention only when spatial or typed evidence supports a falsifiable hypothesis."
        : "Create compatible immutable simulation evidence before making a runtime design hypothesis.",
      automationBoundary: "Computation may compile, simulate, measure, compare, and rank bounded authored alternatives; a human or reasoning Agent owns interpretation and design judgment.",
    },
  };
}

export async function openFactoryObservationBrief(
  projectDir: string,
  selection: ProjectSelection = {},
  requestedRunId?: string,
): Promise<FactoryObservationBrief> {
  return buildFactoryObservationBrief(await openProjectWorkbenchSnapshot(projectDir, selection), requestedRunId);
}
