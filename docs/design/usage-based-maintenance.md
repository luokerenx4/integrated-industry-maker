# Usage-based equipment maintenance

Status: evaluator-owned job-count limits, deterministic usage drift, two-phase physical service and equipment qualification, shared skilled crews, provider-held consumables, Blueprint-authored idle-window timing, phase-local failure retry, metrics, CLI/Studio projection, and memory-fab policy research implemented.

Related: [[docs/design/equipment-changeover]], [[docs/design/work-center-specialization]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Ownership boundary

A production Device asset may declare:

```json
"maintenance": {
  "maximumJobs": 8,
  "durationTicks": 9000,
  "powerMilliWatts": 220000,
  "service": {
    "skill": "vacuum-process",
    "crews": 1,
    "inputs": [{ "resource": "chamber-clean-kit", "count": 1 }]
  },
  "qualification": {
    "durationTicks": 4000,
    "powerMilliWatts": 260000,
    "service": {
      "skill": "equipment-qualification",
      "crews": 1,
      "inputs": [{ "resource": "tool-qualification-wafer", "count": 1 }]
    }
  },
  "drift": [{
    "afterJobs": 6,
    "durationMultiplier": { "numerator": 5, "denominator": 4 },
    "powerMultiplier": { "numerator": 11, "denominator": 10 },
    "defects": ["critical-dimension"]
  }]
}
```

These values are physical equipment semantics. A Blueprint cannot increase the job limit, shorten the work, or lower its power. Every Device instance owns an independent counter, including project-local copies created by equipment specialization.

`service` and `qualification` are mandatory: maintenance is never hidden work performed by the production Device alone, and completed service never grants production authorization by itself. A placed provider is an ordinary project-local Device asset with `maintain` capability, a finite inventory buffer, skilled shared crews, and a physical service radius:

```json
{
  "capabilities": ["maintain"],
  "buffers": [{
    "id": "service-store", "role": "input", "capacity": 32,
    "accepts": ["chamber-clean-kit", "metrology-calibration-kit", "tool-qualification-wafer"]
  }],
  "maintenanceProvider": {
    "skills": ["vacuum-process", "metrology", "equipment-qualification"],
    "crews": 1,
    "serviceRadius": 35,
    "inventoryBuffer": "service-store"
  }
}
```

Compilation independently resolves the service and qualification contracts. It rejects a maintained Device when either phase has no in-range provider with the required skill, crew capacity, compatible inventory, and enough buffer capacity for the complete phase kit. One provider may cover both phases, or separate maintenance and equipment-engineering providers may cover them. Providers and consumables are project-local assets; the engine supplies no global pool.

`drift` is an ordered physical degradation curve. Immediately before a production job starts, the evaluator selects the last stage whose `afterJobs` threshold has been reached. Exact rational multipliers increase that job's duration and power, and declared defects are applied to its tracked lots when it completes. Stages must be strictly increasing, have a real effect, occur before `maximumJobs`, never improve or reverse an earlier multiplier, and retain all defect classes introduced by earlier stages. The compiler reserves grid capacity for the maximum declared drift power.

The optional Blueprint policy only selects an earlier trigger:

```json
"policy": {
  "preventiveMaintenance": { "minimumJobs": 7 }
}
```

`minimumJobs` must be positive and no greater than the asset's `maximumJobs`. Omitting the policy means mandatory-only maintenance.

## Exact runtime semantics

- Only a successfully completed declarative production job increments `jobsSinceMaintenance`. Changeovers, transport work, extraction, generation, and failed partial jobs do not.
- Once the counter reaches `maximumJobs`, the next ready production job cannot start until maintenance completes.
- Once the counter reaches the Blueprint `minimumJobs`, maintenance may start when no qualified production job can start, including a material, batch-formation, campaign-hold, or output-capacity idle window.
- Service consumes its fixed duration and power through the ordinary Device job and grid-allocation machinery. Completion releases its provider and records a pending qualification, but does not reset the usage counter or authorize production.
- Qualification independently acquires its declared provider crew and consumables, consumes its own fixed duration and power, and has priority over new production. Only successful qualification resets the counter to zero and completes the maintenance cycle.
- Service can start only when one qualified provider has every declared consumable in its physical inventory and enough free crews. Selection is deterministic by distance and Device id.
- Starting service atomically consumes the provider inventory and reserves its crews. The crew remains occupied through power-induced stretching of the maintenance job, then is released on completion or cancellation.
- If stocked providers are busy, the Device records crew blocking and crew-wait time. If no provider is stocked, it records consumable blocking and input-wait time. `device.maintenance-blocked` exposes the reason.
- Drift is selected from the counter at job start and remains attached to that active job. A later event cannot retroactively change its physical duration, power, or defect exposure.
- Drift defects pass through the same inspection, rework, scrap, and escape model as every other quality defect. Metrics count affected jobs, affected tracked lots, and newly introduced defects separately.
- An equipment breakdown cancels only the active phase. Reserved crews are released and consumed phase inputs are not refunded. Failed service restarts service after recovery. Failed qualification preserves already-completed service and retries qualification only.
- Reaching the physical limit after the final production job does not create speculative end-of-scenario work. Mandatory maintenance is a precondition of the next ready production start.

The event stream distinguishes phase-aware blocking, service start/finish/cancellation, qualification start/finish/cancellation, whole-cycle completion, and process drift. Metrics retain pending release state, per-phase completions, cancellations, equipment time, crew-time and exact consumables, plus shared wait causes, provider assignments, peak crew use, and cumulative drift exposure.

## Memory-fab result

The synthetic [[examples/memory-fab]] assets require lithography and etch maintenance after at most eight jobs and inspection maintenance after at most five. Lithography drifts after six jobs to `5/4×` time and `11/10×` power while introducing critical-dimension defects; etch drifts to `6/5×` time and power while introducing particle contamination. Vacuum tools consume chamber-clean kits, metrology consumes calibration kits, and all service work competes for one cleanroom crew. Each serviced vacuum tool then consumes a tool-qualification wafer with equipment-qualification labor; metrology consumes a reference wafer with metrology-qualification labor before release. A TypeScript sweep evaluates 27 PM combinations across four locked workloads.

The degradation curve and two-phase release bottleneck turn PM into a coupled yield, availability, inventory, power, and crew-scheduling decision. The new sweep selected mandatory-only maintenance for lithography and etch, with opportunistic PM after four inspection jobs. Its locked aggregate is `-62.598938`; every workload remains at least `+26.248400` above its baseline. The candidate accepts eight drifted jobs and four newly introduced defects per case. This changed optimum is useful evidence: once every extra PM also demands qualification capacity, aggressive maintenance is no longer free insurance.

Run the search with:

```bash
bun run memory-fab:research-maintenance
```

Use `--write-best` only when the top candidate clears both the aggregate and per-case gates.

## Deliberate limits

This model is deterministic usage-based degradation, not a reliability distribution or proprietary fab maintenance recipe. Calendar expiry, detailed multi-step work orders inside either phase, spare-part repair/refurbishment, qualification result sampling/failure, technician travel time, sensor-driven condition monitoring, and seeded time-to-failure remain separate future layers.
