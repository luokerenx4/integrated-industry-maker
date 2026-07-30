import React, { useEffect } from "react";
import type { ObjectiveConstraintEvidence } from "@inm/core";

function constraintValue(constraint: ObjectiveConstraintEvidence, value: number): string {
  if (constraint.unit === "ratio") return `${(value * 100).toFixed(1)}%`;
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(6);
}

export function ObjectiveConstraintComparison({
  baseline,
  candidate,
  baselineLabel = "BASELINE",
  candidateLabel = "CANDIDATE",
  anchorId,
  testId,
}: {
  baseline: ObjectiveConstraintEvidence[];
  candidate: ObjectiveConstraintEvidence[];
  baselineLabel?: string;
  candidateLabel?: string;
  anchorId: string;
  testId?: string;
}) {
  useEffect(() => {
    if (window.location.hash !== `#${anchorId}`) return;
    document.getElementById(anchorId)?.scrollIntoView({ block: "start" });
  }, [anchorId]);

  if (!baseline.length && !candidate.length) return null;
  const before = new Map(baseline.map((constraint) => [constraint.id, constraint]));
  const after = new Map(candidate.map((constraint) => [constraint.id, constraint]));
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  const pairs = ids.map((id) => {
    const left = before.get(id);
    const right = after.get(id);
    if (!left || !right) throw new Error(`Objective constraint '${id}' is not present on both comparison sides`);
    return { left, right };
  });
  const failing = pairs.filter(({ left, right }) => !left.passed || !right.passed).length;

  return <details
    className={`objective-constraints${failing ? " failed" : ""}`}
    id={anchorId}
    open={failing > 0}
    data-testid={testId}
  >
    <summary>
      <span>OBJECTIVE CONSTRAINTS</span>
      <b>{failing ? `${failing} ACTIVE FAILURE${failing === 1 ? "" : "S"}` : `${pairs.length}/${pairs.length} PASS`}</b>
    </summary>
    <div className="objective-constraint-head" aria-hidden="true">
      <span>CONSTRAINT</span><span>{baselineLabel}</span><span>{candidateLabel}</span><span>BOUNDARY</span>
    </div>
    <div className="objective-constraint-body" role="table" aria-label="Objective constraint comparison">
      {pairs.map(({ left, right }) => <div
        role="row"
        className={!right.passed ? "failed" : !left.passed ? "recovered" : "passed"}
        key={right.id}
      >
        <strong role="rowheader">
          {right.label}
          <code>{right.id}</code>
        </strong>
        <span role="cell"><b>{left.passed ? "PASS" : "FAIL"}</b>{constraintValue(left, left.actual)}</span>
        <span role="cell"><b>{right.passed ? "PASS" : "FAIL"}</b>{constraintValue(right, right.actual)}</span>
        <span role="cell">
          <code>{right.operator === "minimum" ? "≥" : "≤"} {constraintValue(right, right.threshold)}</code>
          {!right.passed && <small>DEFICIT {constraintValue(right, right.deficit)}</small>}
        </span>
      </div>)}
    </div>
  </details>;
}
