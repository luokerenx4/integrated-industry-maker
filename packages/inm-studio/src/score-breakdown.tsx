import React from "react";
import type { ScoreBreakdown, ScoreBreakdownComponent } from "@inm/core";

const LABELS: Record<ScoreBreakdownComponent, string> = {
  throughput: "Throughput",
  deliveryValue: "Delivery value",
  onTimeDelivery: "On-time delivery",
  energy: "Energy",
  electricityCost: "Electricity cost",
  buildCost: "Build cost",
  occupiedArea: "Occupied area",
  wip: "Average WIP",
  blocked: "Blocked output",
  cycleTime: "Cycle time",
  tardiness: "Tardiness",
  changeovers: "Changeovers",
  qualityEscapes: "Quality escapes",
  rework: "Rework",
  constraintPenalty: "Constraint penalty",
};
const SCORE_BREAKDOWN_COMPONENTS = Object.keys(LABELS) as ScoreBreakdownComponent[];

const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;

function leadingDriver(delta: ScoreBreakdown): ScoreBreakdownComponent | null {
  return SCORE_BREAKDOWN_COMPONENTS
    .filter((component) => Math.abs(delta[component]) > 1e-9)
    .sort((left, right) => Math.abs(delta[right]) - Math.abs(delta[left])
      || SCORE_BREAKDOWN_COMPONENTS.indexOf(left) - SCORE_BREAKDOWN_COMPONENTS.indexOf(right))[0] ?? null;
}

export function ScoreBreakdownDetails({
  baseline,
  candidate,
  delta,
  title = "OBJECTIVE SCORE COMPONENTS",
  baselineLabel = "BASELINE",
  candidateLabel = "CANDIDATE",
  testId,
}: {
  baseline: ScoreBreakdown;
  candidate: ScoreBreakdown;
  delta: ScoreBreakdown;
  title?: string;
  baselineLabel?: string;
  candidateLabel?: string;
  testId?: string;
}) {
  const leading = leadingDriver(delta);
  return <details className="score-breakdown" data-testid={testId}>
    <summary>
      <span>{title}</span>
      <b>{leading ? `LEADING · ${LABELS[leading]} ${signed(delta[leading])}` : "ALL COMPONENTS UNCHANGED"}</b>
    </summary>
    <div className="score-breakdown-head" aria-hidden="true">
      <span>COMPONENT</span><span>{baselineLabel}</span><span>{candidateLabel}</span><span>DELTA</span>
    </div>
    <div className="score-breakdown-body" role="table" aria-label={title}>
      {SCORE_BREAKDOWN_COMPONENTS.map((component) => <div role="row" key={component}>
        <strong role="rowheader">{LABELS[component]}<code>{component}</code></strong>
        <span role="cell">{baseline[component].toFixed(6)}</span>
        <span role="cell">{candidate[component].toFixed(6)}</span>
        <b role="cell" className={delta[component] > 1e-9 ? "positive" : delta[component] < -1e-9 ? "negative" : ""}>{signed(delta[component])}</b>
      </div>)}
    </div>
  </details>;
}
