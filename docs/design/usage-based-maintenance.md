# Usage-based equipment maintenance

Status: evaluator-owned job-count limits, fixed powered maintenance work, Blueprint-authored idle-window timing, failure cancellation, metrics, CLI/Studio projection, and memory-fab policy research implemented in `inm-sim/0.56.0`.

Related: [[docs/design/equipment-changeover]], [[docs/design/work-center-specialization]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Ownership boundary

A production Device asset may declare:

```json
"maintenance": {
  "maximumJobs": 8,
  "durationTicks": 9000,
  "powerMilliWatts": 220000
}
```

These values are physical equipment semantics. A Blueprint cannot increase the job limit, shorten the work, or lower its power. Every Device instance owns an independent counter, including project-local copies created by equipment specialization.

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
- An equipment breakdown cancels active maintenance. The counter is not reset, completed work is not credited, and the complete fixed job must be started again after recovery.
- Reaching the physical limit after the final production job does not create speculative end-of-scenario work. Mandatory maintenance is a precondition of the next ready production start.

The event stream distinguishes `device.maintenance-start`, `device.maintenance-finish`, and `device.maintenance-cancelled`. Metrics retain per-Device counters plus mandatory, opportunistic, cancelled, and completed maintenance work.

## Memory-fab result

The synthetic [[examples/memory-fab]] assets require lithography and etch maintenance after at most eight jobs and inspection maintenance after at most five. A TypeScript sweep evaluates 27 combinations across four locked workloads. The kept Blueprint starts those jobs after seven, seven, and four completed jobs respectively.

Q-time changed the optimum rather than merely adding another dashboard metric. A fresh 27-policy sweep replaced the former 7/7/4 lithography/etch/inspection policy (`30.467190`) with 7/off/3 (`31.765837`, `+1.298647`). The selected Blueprint improves on mandatory-only maintenance (`30.855063`) by `+0.910774`; against the locked baseline it raises aggregate score from `16.967452` to `31.765837`, and every case improves by at least `+12.529236`.

Run the search with:

```bash
bun run memory-fab:research-maintenance
```

Use `--write-best` only when the top candidate clears both the aggregate and per-case gates.

## Deliberate limits

This model is deterministic usage-based preventive maintenance, not a reliability distribution or proprietary fab maintenance recipe. Calendar expiry, consumable chamber cleans, maintenance crew capacity, spare-parts inventory, qualification runs, condition monitoring, and seeded time-to-failure remain separate future layers.
