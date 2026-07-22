# Usage- and calendar-based equipment maintenance

Status: evaluator-owned job-count and qualification-age limits, deterministic usage drift, two-phase physical service and equipment qualification, shared skilled crews, provider-held consumables, Blueprint-authored idle-window timing, phase-local failure retry, metrics, CLI/Studio projection, and memory-fab policy research implemented through engine version `inm-sim/0.72.0`.

Related: [[docs/design/equipment-changeover]], [[docs/design/work-center-specialization]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Ownership boundary

A production Device asset may declare:

```json
"maintenance": {
  "maximumJobs": 8,
  "maximumQualificationTicks": 150000,
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

These values are physical equipment semantics. A Blueprint cannot increase either the job-count or qualification-age limit, shorten the work, or lower its power. Every Device instance owns an independent job counter and wall-clock qualification epoch, including project-local copies created by equipment specialization.

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
  "preventiveMaintenance": {
    "minimumJobs": 7,
    "minimumQualificationTicks": 130000
  }
}
```

The policy must declare at least one early threshold. `minimumJobs` cannot exceed `maximumJobs`; `minimumQualificationTicks` cannot exceed `maximumQualificationTicks`. Omitting the policy means mandatory-only maintenance. The Blueprint changes timing only; it never changes the asset's physical expiry.

## Exact runtime semantics

- Only a successfully completed declarative production job increments `jobsSinceMaintenance`. Changeovers, transport work, extraction, generation, and failed partial jobs do not.
- Qualification age is `currentTick - qualifiedAtTick`; every maintained Device begins qualified at tick zero.
- Once either `maximumJobs` or `maximumQualificationTicks` is reached, the next ready production job cannot start until maintenance completes.
- Once either authored early threshold is reached, maintenance may start when no qualified production job can start, including a material, batch-formation, campaign-hold, or output-capacity idle window. An exact internal calendar boundary wakes an otherwise idle Device without polling.
- Service consumes its fixed duration and power through the ordinary Device job and grid-allocation machinery. Completion releases its provider and records a pending qualification, but does not reset the usage counter or authorize production.
- Qualification independently acquires its declared provider crew and consumables, consumes its own fixed duration and power, and has priority over new production. Only successful qualification resets both the job counter and qualification epoch and completes the maintenance cycle.
- Service can start only when one qualified provider has every declared consumable in its physical inventory and enough free crews. Selection is deterministic by distance and Device id.
- Starting service atomically consumes the provider inventory and reserves its crews. The crew remains occupied through power-induced stretching of the maintenance job, then is released on completion or cancellation.
- If stocked providers are busy, the Device records crew blocking and crew-wait time. If no provider is stocked, it records consumable blocking and input-wait time. `device.maintenance-blocked` exposes the reason.
- Drift is selected from the counter at job start and remains attached to that active job. A later event cannot retroactively change its physical duration, power, or defect exposure.
- Drift defects pass through the same inspection, rework, scrap, and escape model as every other quality defect. Metrics count affected jobs, affected tracked lots, and newly introduced defects separately.
- An equipment breakdown cancels only the active phase. Reserved crews are released and consumed phase inputs are not refunded. Failed service restarts service after recovery. Failed qualification preserves already-completed service and retries qualification only.
- Reaching the physical limit after the final production job does not create speculative end-of-scenario work. Mandatory maintenance is a precondition of the next ready production start.

The event stream distinguishes phase-aware blocking, service start/finish/cancellation, qualification start/finish/cancellation, whole-cycle completion, and process drift. Every maintenance event carries `usage` or `calendar` trigger attribution plus the captured qualification age. Metrics retain current age, usage/calendar completion counts, pending release state, per-phase completions, cancellations, equipment time, crew-time and exact consumables, plus shared wait causes, provider assignments, peak crew use, and cumulative drift exposure.

## Memory-fab result

The synthetic [[examples/memory-fab]] assets require lithography and etch maintenance after at most eight jobs and inspection maintenance after at most five. They also expire after fixed wall-clock qualification ages: 150 seconds for lithography, 165 seconds for etch, 120 seconds for deep inspection, and 180 seconds for rapid metrology. Lithography drifts after six jobs to `5/4×` time and `11/10×` power while introducing critical-dimension defects; etch drifts to `6/5×` time and power while introducing particle contamination. Vacuum tools consume chamber-clean kits, metrology consumes calibration kits, and all service work competes for one cleanroom crew. Each serviced vacuum tool then consumes a tool-qualification wafer with equipment-qualification labor; metrology consumes a reference wafer with metrology-qualification labor before release.

The degradation curve and two-phase release bottleneck turn PM into a coupled yield, availability, inventory, power, utility-capacity, and crew-scheduling decision. The earlier sweep selected mandatory-only maintenance for lithography and etch, with opportunistic PM after four inspection jobs. After adding finite fab facilities, provider-failure interlocks, a second costed utility plant, and the end-to-end package/final-test line, the complete candidate's five-case aggregate is `94.771430`; every workload remains at least `+200.893383` above its baseline. Re-run the PM sweep after changing facility physics rather than treating its historical ranking as timeless. Once every extra PM also demands qualification capacity and competes with production infrastructure, aggressive maintenance is no longer free insurance.

The focused `calendar-maintenance-research` benchmark freezes two six-lot release waves around the qualification boundary. Baseline and candidate differ by one Blueprint policy on `lithography-1`. The TypeScript sweep ranks five windows and selects 130 seconds: both factories complete all twelve lots on time and remain capacity READY, while the candidate moves work into the idle gap, reduces mean cycle time from 97.4 to 90.9 seconds, and improves the locked score by `+3.853927`. It performs extra physical work and consumes extra service capacity; the evaluator accepts it only because the reduced blocking is worth that cost.

Run both searches with:

```bash
bun run memory-fab:research-maintenance
bun run memory-fab:research-calendar
bun run inm benchmark examples/memory-fab --benchmark calendar-maintenance-research
```

Use `--write-best` only when the top candidate clears both the aggregate and per-case gates.

## Deliberate limits

This model is deterministic usage/calendar degradation, not a reliability distribution or proprietary fab maintenance recipe. Detailed multi-step work orders inside either phase, spare-part repair/refurbishment, qualification result sampling/failure, technician travel time, sensor-driven condition monitoring, and seeded time-to-failure remain separate future layers.
