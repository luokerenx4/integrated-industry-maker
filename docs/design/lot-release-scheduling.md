# Scheduled lot release and fab starts

Status: Scenario-owned lot availability times, explicit pre-release state, capacity-gated fab admission, release events, cadence/delay metrics, and locked benchmark coverage implemented through engine version `inm-sim/0.52.0`.

Related: [[docs/design/lot-tracking]], [[docs/design/batch-processing]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why release time is industrial state

A wafer fab is not initialized as one pile of work-in-process. Wafer starts arrive over time from a production plan, demand wave, qualification campaign, or upstream boundary. Their cadence changes batch formation, queue age, setup decisions, WIP, cycle time, and due-date service even when the physical Blueprint is unchanged.

INM therefore separates planned work from factory inventory. A scheduled lot exists as identity and fixed benchmark workload, but it does not occupy a Device buffer, count as in-fab WIP, or accumulate queue time before admission.

## Scenario contract

Tracked work enters through `Scenario.lotReleases`:

```json
{
  "id": "dram-lot-04",
  "device": "lot-release",
  "buffer": "storage",
  "resource": "blank-dram-wafer-lot",
  "releaseTick": 18000,
  "priority": 1,
  "dueTick": 210000
}
```

`releaseTick` is required and absolute within the Scenario. `dueTick`, when present, cannot precede it. Compilation validates identity uniqueness, tracked Resource family, Device/buffer compatibility, one-lot capacity, release horizon, and every quality-excursion reference. Tracked Resources remain illegal in `initialBuffers`.

This is a clean replacement for the former tick-zero-only `initialLots` field. There is no compatibility alias in the pre-alpha format.

## Runtime contract

Every declaration creates a `scheduled` `WorkLot` with `plannedReleaseTick`, no buffer inventory, and a release-boundary location. At its planned tick it becomes eligible for admission. Admission is atomic only when the destination buffer and Resource quota can hold one more lot, including already reserved inbound cargo.

If the boundary is full, the lot remains scheduled outside the fab and is retried after later deterministic state changes. On admission the engine records the actual `releasedAtTick`, changes the lot to `queued`, inserts its identity and material count together, and emits `lot.released` with planned tick and measured delay. Several lots at one tick are considered as one release wave before ordinary factory settling.

Cycle accounting starts at actual admission:

```text
completedAtTick − releasedAtTick = queueTicks + processTicks + transportTicks
```

Planned-to-actual release delay remains separate, so an overloaded entry boundary cannot masquerade as internal queue time.

## Evaluation and Coding Agent boundary

`releaseFlow` reports scheduled, released, pending, planned/actual span, mean planned/actual interval, and mean/maximum admission delay. CLI simulation, locked benchmark cases, immutable reports, Blueprint comparisons, and Studio show the same values.

For tracked Objectives, on-time attainment uses all scheduled lots as its denominator. A Blueprint is therefore penalized when it cannot admit planned work before the horizon; withholding release cannot improve the score. Yield metrics use actually released lots, while WIP excludes work still outside the fab.

The release schedule is Scenario-owned fixed workload, not editable Blueprint code. A Coding Agent changes equipment, Process selection, topology, buffers, and dispatch against the same release waves in every comparison. This mirrors autoresearch: tests own the workload; the candidate owns only the program under test.

## Memory-fab benchmark

The memory-fab schedules twelve named lots six seconds apart across a sixty-six-second start window. This is long enough to change shared-tool dispatch and fixed-batch behavior while keeping all work inside the four-minute evaluation horizon. The four locked operating conditions reuse the same start plan and vary quality workload or equipment availability.

## Current boundary

The current model supports deterministic availability times and capacity-gated admission. It does not yet model release windows, target-WIP controllers, CONWIP/kanban policies, campaign starts, order cancellation, split/merge genealogy, or a Blueprint-authored release controller. Those are future control layers; they should consume this explicit scheduled state rather than mutate Scenario files.

## Verification

```bash
bun run inm validate examples/memory-fab
bun run inm simulate examples/memory-fab --blueprint baseline
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run inm test examples/memory-fab
```

