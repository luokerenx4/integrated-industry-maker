import type { ProjectWorkbenchSnapshot } from "@inm/core";

export type OperatorRecommendationTarget =
  | { kind: "diagnostic"; diagnosticId: string }
  | { kind: "candidate"; benchmarkId: string; candidateId: string }
  | { kind: "operation"; operationId: "analyze" | "simulate" }
  | { kind: "run"; runId: string };

export interface OperatorRecommendation {
  id: string;
  tone: "blocking" | "review" | "evidence" | "attention" | "ready";
  title: string;
  reason: string;
  actionLabel: string;
  target: OperatorRecommendationTarget;
}

export type OperatorGuidanceSnapshot = Pick<
  ProjectWorkbenchSnapshot,
  "selection" | "readiness" | "diagnostics" | "candidates" | "runs" | "operations"
>;

function selectedRun(snapshot: OperatorGuidanceSnapshot) {
  const selection = snapshot.selection;
  return snapshot.runs.filter((run) => run.selection.world === selection.world.id
    && run.selection.blueprint === selection.blueprint.id
    && run.selection.scenario === selection.scenario.id
    && run.selection.objective === selection.objective.id).at(-1);
}

function operationAvailable(snapshot: OperatorGuidanceSnapshot, operationId: "analyze" | "simulate"): boolean {
  return snapshot.operations.some((operation) => operation.id === operationId && operation.availability.state === "available");
}

export function recommendOperatorAction(snapshot: OperatorGuidanceSnapshot): OperatorRecommendation {
  const blocking = snapshot.diagnostics.find((diagnostic) => diagnostic.severity === "blocking");
  if (blocking) return {
    id: `diagnostic:${blocking.id}`,
    tone: "blocking",
    title: "Resolve the first capacity blocker",
    reason: blocking.message,
    actionLabel: "INSPECT BLOCKER",
    target: { kind: "diagnostic", diagnosticId: blocking.id },
  };

  const candidate = snapshot.candidates[0];
  if (candidate) return {
    id: `candidate:${candidate.id}`,
    tone: "review",
    title: `Review ${candidate.name}`,
    reason: candidate.expectedEffect ?? candidate.hypothesis,
    actionLabel: "REVIEW PROPOSAL",
    target: { kind: "candidate", benchmarkId: candidate.benchmark, candidateId: candidate.id },
  };

  const run = selectedRun(snapshot);
  if ((!run || !run.compatible) && operationAvailable(snapshot, "simulate")) return {
    id: "operation:simulate",
    tone: "evidence",
    title: run ? "Refresh incompatible run evidence" : "Measure the current selection",
    reason: run
      ? `The latest matching run used ${run.engineVersion}; create evidence with ${snapshot.selection.blueprint.id} and the current engine.`
      : `No immutable run matches ${snapshot.selection.blueprint.id} / ${snapshot.selection.scenario.id} / ${snapshot.selection.objective.id}.`,
    actionLabel: "RUN SIMULATION",
    target: { kind: "operation", operationId: "simulate" },
  };

  const warning = snapshot.diagnostics.find((diagnostic) => diagnostic.severity === "warning");
  if (warning) return {
    id: `diagnostic:${warning.id}`,
    tone: "attention",
    title: "Inspect the highest-priority warning",
    reason: warning.message,
    actionLabel: "FOLLOW EVIDENCE",
    target: { kind: "diagnostic", diagnosticId: warning.id },
  };

  if (run) return {
    id: `run:${run.id}`,
    tone: "ready",
    title: "Inspect the latest matching evidence",
    reason: `${run.id} measured ${snapshot.selection.blueprint.id} with score ${run.score.toFixed(3)} and a ${run.decision} decision.`,
    actionLabel: "OPEN RUN",
    target: { kind: "run", runId: run.id },
  };

  return {
    id: "operation:analyze",
    tone: "evidence",
    title: "Establish the nominal industrial picture",
    reason: "Run shared Core analysis for the effective project selection before making a design decision.",
    actionLabel: "RUN ANALYSIS",
    target: { kind: "operation", operationId: operationAvailable(snapshot, "analyze") ? "analyze" : "simulate" },
  };
}
