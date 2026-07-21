# Usage-based equipment maintenance

Status: evaluator-owned job-count limits, deterministic usage drift, fixed powered maintenance work, Blueprint-authored idle-window timing, failure cancellation, metrics, CLI/Studio projection, and memory-fab policy research implemented in `inm-sim/0.58.0`.

Related: [[docs/design/equipment-changeover]], [[docs/design/work-center-specialization]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Ownership boundary

A production Device asset may declare:

```json
"maintenance": {
  "maximumJobs": 8,
  "durationTicks": 9000,
  "powerMilliWatts": 220000,
  "drift": [{
    "afterJobs": 6,
    "durationMultiplier": { "numerator": 5, "denominator": 4 },
    "powerMultiplier": { "numerator": 11, "denominator": 10 },
    "defects": ["critical-dimension"]
  }]
}
```

These values are physical equipment semantics. A Blueprint cannot increase the job limit, shorten the work, or lower its power. Every Device instance owns an independent counter, including project-local copies created by equipment specialization.

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
- Drift is selected from the counter at job start and remains attached to that active job. A later event cannot retroactively change its physical duration, power, or defect exposure.
- Drift defects pass through the same inspection, rework, scrap, and escape model as every other quality defect. Metrics count affected jobs, affected tracked lots, and newly introduced defects separately.
- An equipment breakdown cancels active maintenance. The counter is not reset, completed work is not credited, and the complete fixed job must be started again after recovery.
- Reaching the physical limit after the final production job does not create speculative end-of-scenario work. Mandatory maintenance is a precondition of the next ready production start.

The event stream distinguishes `device.maintenance-start`, `device.maintenance-finish`, `device.maintenance-cancelled`, and `device.process-drift`. Metrics retain per-Device counters plus mandatory, opportunistic, cancelled, and completed maintenance work and cumulative drift exposure.

## Memory-fab result

The synthetic [[examples/memory-fab]] assets require lithography and etch maintenance after at most eight jobs and inspection maintenance after at most five. Lithography drifts after six jobs to `5/4×` time and `11/10×` power while introducing critical-dimension defects; etch drifts to `6/5×` time and power while introducing particle contamination. A TypeScript sweep evaluates 27 PM combinations across four locked workloads.

The degradation curve changes PM from pure downtime scheduling into a yield-versus-availability decision. The sweep selected lithography mandatory-only, etch PM after six jobs, and inspection PM after three. It raises the locked aggregate from `-0.522450` to `28.110498` (`+28.632949`) and every workload improves by at least `+18.031765`. The candidate still incurs four drifted jobs and two newly introduced defects per case: eliminating all exposure would cost more idle-window capacity than it returns under the current objective.

Run the search with:

```bash
bun run memory-fab:research-maintenance
```

Use `--write-best` only when the top candidate clears both the aggregate and per-case gates.

## Deliberate limits

This model is deterministic usage-based degradation, not a reliability distribution or proprietary fab maintenance recipe. Calendar expiry, consumable chamber cleans, maintenance crew capacity, spare-parts inventory, qualification runs, sensor-driven condition monitoring, and seeded time-to-failure remain separate future layers.
