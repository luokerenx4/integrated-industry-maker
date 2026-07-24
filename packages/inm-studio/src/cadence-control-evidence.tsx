import React from "react";
import type { BlueprintMetricSnapshot } from "@inm/core";

type CadenceControl = BlueprintMetricSnapshot["cadenceControl"]["devices"][string];

function ControlState({ label, control }: { label: string; control: CadenceControl | undefined }) {
  return <span className={control ? "active" : "off"}>
    <small>{label}</small>
    {control
      ? <>
        <b>{control.normalJobs} NORMAL · {control.recoveryJobs} RECOVERY · {control.recoveryActivations} ACTIVATIONS</b>
        <code>{control.normalMode} / {control.recoveryMode}</code>
        <em>RECOVER AFTER {(control.minimumStarvationTicks / 1000).toFixed(1)}S BELOW {control.recoverBelowItems} · {control.downstreamConnection}</em>
        <code>{control.starvationEpisodes} STARVATION EPISODES · {(control.starvationTicks / 1000).toFixed(1)}S</code>
      </>
      : <b>OFF</b>}
  </span>;
}

export function CadenceControlEvidence({
  baseline, candidate, title = "CADENCE CONTROL EVIDENCE", testId,
}: {
  baseline: BlueprintMetricSnapshot["cadenceControl"];
  candidate: BlueprintMetricSnapshot["cadenceControl"];
  title?: string;
  testId?: string;
}) {
  const devices = [...new Set([...Object.keys(baseline.devices), ...Object.keys(candidate.devices)])].sort();
  if (!devices.length) return null;
  return <details className="cadence-control-evidence" data-testid={testId}>
    <summary><span>{title}</span><b>{devices.length} CONTROLLED DEVICE{devices.length === 1 ? "" : "S"}</b></summary>
    <div>{devices.map((device) => {
      const before = baseline.devices[device];
      const after = candidate.devices[device];
      const policy = after ?? before!;
      return <article key={device}>
        <header><strong>{device}</strong><code>{policy.process}</code></header>
        <div>
          <ControlState label="BASELINE" control={before}/>
          <i>→</i>
          <ControlState label="CANDIDATE" control={after}/>
        </div>
      </article>;
    })}</div>
  </details>;
}
