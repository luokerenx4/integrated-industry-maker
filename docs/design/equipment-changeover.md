# Sequence-dependent equipment changeover

Status: explicit setup groups, powered changeover jobs, setup-aware dispatch, failure cancellation, metrics, and replay implemented in engine version `inm-sim/0.49.0`.

Related: [[docs/design/work-center-dispatch]], [[docs/design/lot-tracking]], [[docs/design/production-modes]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why setup is a first-class industrial job

Shared semiconductor equipment does not move freely between qualified operations. A lithography bay changes masks and recipe state; an etch chamber changes process conditions and may require preparation. Hiding that work inside every Process cycle makes sequencing irrelevant and prevents a Blueprint optimizer from trading due-date urgency against equipment stability.

INM therefore separates productive work from sequence-dependent setup. A Process may declare `setupGroup`. A production Device asset may declare one fixed `production.changeover` envelope containing duration and total active power. When the next ready operation has a different group from the Device's current group, the host runs a non-productive changeover job before exposing the productive operation to the Device program.

## Fixed model versus editable Blueprint

The benchmark-owned industrial model fixes:

- each Process setup group;
- the Device asset's changeover duration and power;
- the Scenario's tick-zero setup state.

The Blueprint may change operation qualification, equipment count, operation order, `recipeDispatch`, and `lotDispatch`. It cannot edit setup physics. This preserves the same boundary as the autoresearch loop: the candidate is editable code, while the workload and evaluator remain fixed.

`Scenario.initialSetups` maps a Device instance to one of its qualified setup groups. Omission means physically unconfigured, so the first ready operation also requires changeover work. The compiler rejects initial state on a Device without a changeover envelope and rejects groups outside that instance's qualified operations.

## Runtime semantics

A changeover begins only when the target operation's complete input batch is resident and its output batch fits. The engine does not reconfigure equipment speculatively for absent WIP. It also does not consume or reserve the operation's material before setup finishes, so lots remain queued and continue accumulating queue time.

The changeover job:

- occupies the same non-preemptive Device clock as production;
- requests its declared total active power through the ordinary regional grid;
- pauses and resumes under proportional or priority load shedding like any other powered job;
- produces no material and does not increment route steps;
- atomically updates the Device setup group only on successful completion.

An equipment breakdown cancels an active changeover without changing setup state or scrapping queued lots. Recovery may start the changeover again. `device.changeover-start`, `device.changeover-finish`, and `device.changeover-cancelled` make all three outcomes replayable.

## Setup-aware dispatch

`recipeDispatch: minimize-changeover` ranks ready operations already matching the current Device setup group before authored order. It does not override readiness and it does not preempt active work. `lotDispatch` remains independent, so an optimizer can keep a chamber on one recipe while applying earliest-due-date or highest-priority ordering within that recipe's WIP.

This separation exposes a real scheduling tradeoff. An urgency-first operation policy may improve service while increasing changeovers; a setup-minimizing operation policy may improve capacity while delaying another route step. The locked event simulation, not a static rate, decides which trade is better for the Objective.

## Metrics and evaluation

`FactoryState.devices[*].setup` records current group, completed changeover count, and configured setup work ticks. `FactoryMetrics.equipmentSetups` exposes per-Device and factory totals. Changeover work contributes to ordinary machine utilization and energy, while queued lots naturally reflect the added residence time.

An optional Objective `weights.changeovers` penalty applies once per completed changeover. Throughput, on-time delivery, cycle time, tardiness, WIP, power, cost, and area remain simultaneous terms. `inm simulate`, `inm compare`, immutable reports, and Studio expose count and setup work directly.

## Static-analysis boundary

Per-operation rates remain exclusive no-changeover maxima. `inm analyze` shows setup group and changeover envelope and emits the shared-work-center diagnostic, but it does not pretend to derive a sequence-dependent effective rate without a schedule. Event simulation is authoritative for setup-sensitive capacity.

## Memory-fab evidence

The memory-fab lithography bay has separate layer-1 and layer-2 mask groups with a four-second changeover; the etch bay has separate layer recipes with a three-second changeover. Both begin configured for layer 1. The fixed benchmark demonstrates three useful points:

- authored operation order/FIFO finishes with two changeovers;
- operation-level earliest-due-date improves service but causes repeated physical reconfiguration;
- `minimize-changeover` plus lot-level earliest-due-date preserves the two-changeover schedule while reducing tardiness inside each setup campaign.

These are synthetic timings and not a proprietary DRAM recipe. Their purpose is to make the industrial scheduling structure executable and optimizable.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Tests cover setup compilation, Scenario qualification, successful changeover, setup-aware dispatch, power-accounted runtime metrics, breakdown cancellation without lot scrap, and the memory-fab optimization path.
