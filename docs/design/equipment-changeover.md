# Sequence-dependent equipment changeover

Status: explicit setup groups, directed transition matrices, powered changeover jobs, bounded setup campaigns, setup-aware dispatch, failure cancellation, metrics, and replay implemented through engine version `inm-sim/0.71.0`.

Related: [[docs/design/work-center-dispatch]], [[docs/design/setup-campaign-control]], [[docs/design/lot-tracking]], [[docs/design/quality-flow]], [[docs/design/production-modes]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why setup is a first-class industrial job

Shared semiconductor equipment does not move freely between qualified operations. A lithography bay changes masks and recipe state; an etch chamber changes process conditions and may require preparation. Hiding that work inside every Process cycle makes sequencing irrelevant and prevents a Blueprint optimizer from trading due-date urgency against equipment stability.

INM therefore separates productive work from sequence-dependent setup. A Process may declare `setupGroup`. A production Device asset may declare `production.changeover.transitions`, a directed matrix whose rows independently own `from`, `to`, duration, and total active power. `from: null` represents commissioning from an unconfigured state. When the next ready operation has a different group from the Device's current group, the host runs that exact non-productive transition before exposing the productive operation to the Device program.

## Fixed model versus editable Blueprint

The benchmark-owned industrial model fixes:

- each Process setup group;
- every directed Device transition's duration and power;
- the Scenario's tick-zero setup state.

The Blueprint may change operation qualification, equipment count, operation order, `recipeDispatch`, and `lotDispatch`. It cannot edit setup physics. This preserves the same boundary as the autoresearch loop: the candidate is editable code, while the workload and evaluator remain fixed.

`Scenario.initialSetups` maps a Device instance to one of its qualified setup groups. Omission means physically unconfigured, so the first ready operation requires an explicit `null → target` transition. The compiler rejects initial state on a Device without changeover work and rejects groups outside that instance's qualified operations. It also rejects duplicate or self-directed rows, unknown setup groups, transition power below connected standby, and any directed edge required by the selected Blueprint qualifications but absent from the asset. There is no symmetric or default fallback.

## Runtime semantics

A changeover begins only when the target operation's complete input batch is resident and its output batch fits. The engine does not reconfigure equipment speculatively for absent WIP. It also does not consume or reserve the operation's material before setup finishes, so lots remain queued and continue accumulating queue time.

The changeover job:

- occupies the same non-preemptive Device clock as production;
- requests its declared total active power through the ordinary regional grid;
- pauses and resumes under proportional or priority load shedding like any other powered job;
- produces no material and does not increment route steps;
- atomically updates the Device setup group only on successful completion.

An equipment breakdown cancels an active changeover without changing setup state or scrapping queued lots. Recovery may start the same directed transition again. `device.changeover-start` and `device.changeover-finish` expose the selected direction, duration, and power; `device.changeover-cancelled` preserves its endpoints. All three outcomes are replayable.

## Setup-aware dispatch

`recipeDispatch: minimize-changeover` ranks ready operations already matching the current Device setup group before authored order. It does not override readiness and it does not preempt active work. `lotDispatch` remains independent, so an optimizer can keep a chamber on one recipe while applying earliest-due-date or highest-priority ordering within that recipe's WIP. Optional `policy.setupCampaign` adds bounded formation before a setup switch; see [[docs/design/setup-campaign-control]].

This separation exposes a real scheduling tradeoff. An urgency-first operation policy may improve service while increasing changeovers; a setup-minimizing operation policy may improve capacity while delaying another route step. The locked event simulation, not a static rate, decides which trade is better for the Objective.

## Metrics and evaluation

`FactoryState.devices[*].setup` records current group, completed changeover count, configured setup work ticks, and any active campaign target/deadline. `FactoryMetrics.equipmentSetups` exposes per-Device and factory changeovers, campaign holds, held ticks, lot-threshold releases, and timeout releases. Changeover work contributes to ordinary machine utilization and energy, while queued lots naturally reflect the added residence time.

An optional Objective `weights.changeovers` penalty applies once per completed changeover. Throughput, on-time delivery, cycle time, tardiness, WIP, power, cost, and area remain simultaneous terms. `inm simulate`, `inm compare`, immutable reports, and Studio expose count and setup work directly.

Fab-loss attribution does not treat the aggregate setup counter as one scheduling instruction. Every completed `null → group` transition is commissioning work; every completed `group → group` transition is recurring production changeover. The immutable event order binds each completion to the next productive `device.start` on that setup group, preserving exact target Process, Resource, lot, Route/step, timing, power, and energy without rewriting historical Run events. CLI and Studio order the resulting contributors by measured work, so Design may target a stable transition identity such as `Device + from + to + Process` rather than a mutable event tick or aggregate Device total.

## Static-analysis boundary

Per-operation rates remain exclusive no-changeover maxima. `inm analyze` shows each setup group and the Device's directed duration range and emits the shared-work-center diagnostic, but it does not pretend to derive a sequence-dependent effective rate without a schedule. Studio exposes the complete matrix on the asset and Device inspector. Event simulation is authoritative for setup-sensitive capacity.

## Memory-fab evidence

The memory-fab lithography bay uses four seconds for layer 1 → layer 2 and forty-five seconds for the reverse mask/reset cleanup. Etch uses three seconds forward and thirty-five seconds in reverse. Both shared tools begin configured for layer 1; newly placed dedicated tools commission in their selected group through explicit four- and three-second null transitions.

The focused `changeover-specialization-research` workload fixes due dates that make urgency-first shared tools cross those directed boundaries repeatedly. The shared baseline performs seven changes and 97 seconds of setup work. A candidate Blueprint purchases dedicated layer-2 lithography and etch equipment, physically splits the material lanes, and adds the facility capacity required for real concurrency. It performs five commissioning/forward changes and 21 seconds of setup work, raises completed lots from 4 to 10 and delivered devices from 24 to 56, and improves the locked score by `+51.243435`. This is a capital/layout optimization, not a scheduler exemption: every added tool, sorter, belt cell, utility plant, setup state, cost, area, power draw, maintenance contract, and qualification remains explicit.

These are synthetic timings and not a proprietary DRAM recipe. Their purpose is to make directional cleaning/setup structure executable and optimizable.

The commissioned memory-fab run `090-simulate` makes the intervention boundary concrete. Its five completed transitions contain `10.0` seconds of one-time commissioning work and `11.0` seconds of recurring burn-in changes. The leading recoverable contributor is `burn-in-1 reliability-screen → commercial-screen → screen-commercial-dram` at `8.0` seconds, `180 W`, and `1.44 MJ`; packaged screening has no tracked wafer-lot identity at this terminal fungible stage. Focused Design Run `6a7626c73bf85cace72571fcd155c631d600000416841a519829eee5e9b91c12` proved that `recipeDispatch: minimize-changeover` removes that exact contributor, but it also starves the commercial product mix: all five locked cases regress, aggregate current-best score falls `61.641258`, and delivery value loses `74` per minute. The Candidate is therefore bounded-deferred and the commissioned `contract-value` policy remains unchanged.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run inm benchmark examples/memory-fab --benchmark changeover-specialization-research
```

Tests cover matrix validation and coverage, Scenario qualification, asymmetric forward/reverse execution, setup-aware dispatch, power-accounted runtime metrics, breakdown cancellation without lot scrap, and both memory-fab optimization paths.
