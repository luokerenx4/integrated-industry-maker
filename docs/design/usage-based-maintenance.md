# Usage-based equipment maintenance

Status: evaluator-owned job-count limits, deterministic usage drift, physical service contracts, shared skilled crews, provider-held consumables, Blueprint-authored idle-window timing, failure cancellation, metrics, CLI/Studio projection, and memory-fab policy research implemented.

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
  "drift": [{
    "afterJobs": 6,
    "durationMultiplier": { "numerator": 5, "denominator": 4 },
    "powerMultiplier": { "numerator": 11, "denominator": 10 },
    "defects": ["critical-dimension"]
  }]
}
```

These values are physical equipment semantics. A Blueprint cannot increase the job limit, shorten the work, or lower its power. Every Device instance owns an independent counter, including project-local copies created by equipment specialization.

`service` is mandatory: maintenance is never hidden work performed by the production Device alone. A placed provider is an ordinary project-local Device asset with `maintain` capability, a finite inventory buffer, skilled shared crews, and a physical service radius:

```json
{
  "capabilities": ["maintain"],
  "buffers": [{
    "id": "service-store", "role": "input", "capacity": 32,
    "accepts": ["chamber-clean-kit", "metrology-calibration-kit"]
  }],
  "maintenanceProvider": {
    "skills": ["vacuum-process", "metrology"],
    "crews": 1,
    "serviceRadius": 35,
    "inventoryBuffer": "service-store"
  }
}
```

Compilation rejects a maintained Device with no in-range provider that has the skill, total crew capacity, compatible inventory, and enough buffer capacity for the complete service kit. Providers and consumables are project-local assets; the engine does not supply a global maintenance pool.

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
- Completed maintenance resets the counter to zero. It consumes the fixed duration and power through the ordinary Device job and grid-allocation machinery.
- Service can start only when one qualified provider has every declared consumable in its physical inventory and enough free crews. Selection is deterministic by distance and Device id.
- Starting service atomically consumes the provider inventory and reserves its crews. The crew remains occupied through power-induced stretching of the maintenance job, then is released on completion or cancellation.
- If stocked providers are busy, the Device records crew blocking and crew-wait time. If no provider is stocked, it records consumable blocking and input-wait time. `device.maintenance-blocked` exposes the reason.
- Drift is selected from the counter at job start and remains attached to that active job. A later event cannot retroactively change its physical duration, power, or defect exposure.
- Drift defects pass through the same inspection, rework, scrap, and escape model as every other quality defect. Metrics count affected jobs, affected tracked lots, and newly introduced defects separately.
- An equipment breakdown cancels active maintenance. The counter is not reset, completed work is not credited, and the complete fixed job must be started again after recovery. Reserved crews are released, but consumed service kits are not refunded.
- Reaching the physical limit after the final production job does not create speculative end-of-scenario work. Mandatory maintenance is a precondition of the next ready production start.

The event stream distinguishes `device.maintenance-blocked`, `device.maintenance-start`, `device.maintenance-finish`, `device.maintenance-cancelled`, and `device.process-drift`. Metrics retain per-Device counters, wait causes, service consumption, mandatory/opportunistic/cancelled/completed work, provider assignments and peak crew use, crew-time, and cumulative drift exposure.

## Memory-fab result

The synthetic [[examples/memory-fab]] assets require lithography and etch maintenance after at most eight jobs and inspection maintenance after at most five. Lithography drifts after six jobs to `5/4×` time and `11/10×` power while introducing critical-dimension defects; etch drifts to `6/5×` time and power while introducing particle contamination. Vacuum tools consume chamber-clean kits, metrology consumes calibration kits, and every tool competes for one shared cleanroom service crew. A TypeScript sweep evaluates 27 PM combinations across four locked workloads.

The degradation curve and shared service bottleneck turn PM into a coupled yield, availability, inventory, and crew-scheduling decision. The new sweep selected PM after six jobs for both lithography and etch and after three jobs for inspection. Its locked aggregate is `-13.763165`; every workload remains at least `+18.502208` above its baseline. The candidate incurs two drifted jobs and two newly introduced defects per case. The changed optimum is useful evidence: making maintenance physical altered the best Blueprint policy.

Run the search with:

```bash
bun run memory-fab:research-maintenance
```

Use `--write-best` only when the top candidate clears both the aggregate and per-case gates.

## Deliberate limits

This model is deterministic usage-based degradation, not a reliability distribution or proprietary fab maintenance recipe. Calendar expiry, multi-stage work orders, spare-part repair/refurbishment, qualification runs, technician travel time, sensor-driven condition monitoring, and seeded time-to-failure remain separate future layers.
