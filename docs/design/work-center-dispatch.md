# Shared work centers and re-entrant production

Status: multi-operation qualification plus operation-, lot-, route-slack-, contract-window-, fixed-batch-, setup-campaign-, sustained-starvation cadence-, and quality-aware deterministic ready-WIP dispatch implemented through engine version `inm-sim/0.81.0`.

Related: [[docs/design/material-contracts]], [[docs/design/production-modes]], [[docs/design/lot-tracking]], [[docs/design/batch-processing]], [[docs/design/equipment-changeover]], [[docs/design/setup-campaign-control]], [[docs/design/quality-flow]], [[docs/design/fab-capacity-planning]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Why this exists

A linear recipe machine is not enough for a semiconductor fab. One wafer route may revisit lithography, etch, deposition, cleaning, and metrology work centers many times. The scarce equipment is shared by several route steps, so dispatching one ready lot delays the others. That contention is industrial state, not logistics decoration.

INM represents each route stage as an explicit project Resource and Process. Returning material is a physical connection back to a previously visited work center. A work center qualifies several Process/mode operations on one Device instance, so every operation competes for the same runtime clock, power envelope, buffers, cost, footprint, and utilization.

## Blueprint contract

A production Device declares exactly one of:

- `recipe`: one dedicated Process/mode operation;
- `recipes`: a non-empty authored list of qualified operations.

Every entry retains the ordinary exact input/output Resource-to-port bindings and may declare an integer `priority`. Repeating the same `(Process, mode)` qualification is invalid. The compiler creates one exact plan per entry, unions every qualified Resource onto the relevant physical port, and partitions shared buffers from the maximum complete-job requirement of every qualified Resource. A work center therefore cannot accept an unqualified route stage or overfill one Resource quota merely because its asset uses wildcard buffers.

The Device policy `recipeDispatch` is required only when the author wants to override `authored-order`:

- `authored-order`: first ready operation in the `recipes` array;
- `shortest-cycle`: shortest compiled duration among ready operations, with authored order as the tie-break;
- `highest-priority`: largest recipe `priority` among ready operations, with authored order as the tie-break.
- `minimize-changeover`: an operation matching the Device's current setup group wins, then authored order resolves ties;
- `contract-value`: greatest evaluator-owned delivery contribution achievable over the remaining Scenario contract window; equal window value prefers earlier first delivery, then one-job marginal value per process tick;
- `oldest-lot`: operation containing the earliest-released tracked lot;
- `earliest-due-date`: operation containing the tracked lot with the earliest finite due tick;
- `least-slack`: operation whose most urgent tracked lot has the smallest `dueTick - currentTick - nominalRemainingRouteTicks`;
- `highest-lot-priority`: operation containing the tracked lot with the greatest authored priority.

`lotDispatch` independently chooses the exact identities consumed after an operation wins: `fifo`, `oldest-release`, `earliest-due-date`, or `highest-priority`. Operation dispatch and lot dispatch are separate because a shared work center first chooses a route step and then chooses WIP within that step. See [[docs/design/lot-tracking]].

`cadenceControl` is a separate, deliberately narrower controller for exactly two modes of one Process with identical material work. It selects the recovery mode only while resident plus in-flight coverage on one exact downstream Connection is below the authored item boundary. It cannot coexist with `recipeDispatch`, `setupCampaign`, or `batchFormation`; broader operation choice remains owned by those policies rather than an implicit priority stack.

Selection occurs only while the Device is idle. A ready operation has every exact input batch available and enough reserved output capacity. If its Process setup group differs from setup-sensitive equipment state, the host may first apply the Blueprint's bounded setup-campaign rule, then completes the asset's exact directed powered transition before material is consumed. Work is non-preemptive after start. When nothing is ready, the highest-ranked operation is still exposed to the Device program so the normal waiting-input or blocked-output state remains observable. See [[docs/design/equipment-changeover]] and [[docs/design/setup-campaign-control]].

## Runtime authority and determinism

The engine selects one compiled plan before calling the project-local TypeScript program. `context.process` still contains one operation, keeping Device programs simple. The returned `start` action must exactly match that selected plan. Stable authored indices resolve every equal rank, so no decision depends on object iteration, wall clock, or browser state.

For `least-slack`, the current operation contributes its exact compiled duration. Downstream work is the shortest complete path through the Route using immutable base Process durations; scrap exits are not completion paths. It is deliberately a nominal dispatch estimate, not a forecast of future setup, transport, batching, rework, failure, or queue delay. Every qualified operation on that Device must consume a tracked Route lot, which the compiler enforces. Undated lots rank after finite-slack lots.

For `contract-value`, the runtime projects the number of complete cycles each operation can fit before the Scenario contract window ends after the exact currently required directed setup transition. It values those projected outputs against committed demand, then uses first-completion time, one-job value rate, authored priority, and authored order as deterministic tie-breaks. This is a local equipment-capacity horizon: it assumes continuing feed for the projection, while ordinary readiness still requires the next exact material batch, tooling, utility capacity, output room, and power before physical work starts. See [[docs/design/delivery-contracts]].

The event stream records the selected Process id, production mode, and tracked lot ids in `device.start` and `device.finish`. A least-slack start additionally records the decisive lot, nominal remaining Route ticks, and computed slack, so a replay can explain the choice without recomputing live state. Cadence metrics count normal/recovery starts beside the exact control boundary. Existing utilization, waiting, blocking, power, WIP, and transport metrics measure shared-equipment contention because one Device can own only one active job; lot clocks additionally measure the scheduling consequences.

## Static analysis boundary

`inm analyze` emits one row per qualified operation. Its cycles/min value is an exclusive maximum: the rate if that operation owned the work center continuously. A `shared-work-center` diagnostic names the dispatch policy and warns that those maxima cannot run simultaneously. `inm plan` separately allocates the Objective-required device-time across the complete Process/mode-to-Device qualification matrix, so two operations cannot each borrow the same physical work center at 100%. A remaining deficit is a `toolset` gap and recommends additional qualified physical Devices. See [[docs/design/fab-capacity-planning]].

The static allocation intentionally excludes sequence-dependent setup, batch formation, maintenance, failures, utility/tooling waits, and queue policy. Locked event simulation remains the score authority for those temporal effects and for re-entrant work-center optimization.

Fixed full-batch formation, bounded setup campaigns, physical work-center specialization, and usage/calendar preventive maintenance are now executable; see [[docs/design/batch-processing]], [[docs/design/setup-campaign-control]], [[docs/design/work-center-specialization]], and [[docs/design/usage-based-maintenance]]. The next industrial layers should make that coupling richer rather than hide it: chamber cleaning consumables, repair crew/spare capacity, and stochastic-but-seeded yield.

## Memory-fab reference project

[[examples/memory-fab]] is the north-star executable example. Twelve named synthetic DRAM wafer lots with priorities and due dates travel through lithography → etch → deposition, then re-enter the layer-2 lithography and etch route before delivery. The immutable baseline shares both work centers. The kept candidate combines due-date-aware lot dispatch, quality and anneal choices, and dedicated layer-2 tools connected by an explicit elevated lane. Its locked five-case benchmark demonstrates that a Coding Agent can trade capital, area, setup isolation, route geometry, cycle time, quality, and interruption resilience by editing one Blueprint.

The commissioned route deliberately does not use one factory-wide lot rule. Project-local TypeScript research evaluates exact per-Device and grouped patches against the five-case Benchmark plus the zero-regression current-best boundary. The current retained policy changes only `lithography-l2` from FIFO to `earliest-due-date`: it leaves steady production, mixed quality, systematic quality excursion, and lithography interruption byte-for-score identical while improving facility-interruption tardiness by `0.053333`. Applying EDD to the shared layer-one lithography bay, the complete front end, or every route Device regresses the lithography-interruption score by `1.643644`, so those broader policies remain explicit negative evidence rather than defaults.

## Source of truth

- Types/schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Qualification compilation: `packages/inm-core/src/compiler.ts`
- Ready-operation selection and enforcement: `packages/inm-core/src/simulator.ts`
- Static projection: `packages/inm-core/src/production-analysis.ts`, `packages/inm-core/src/capacity-plan.ts`
- Studio projection: `packages/inm-studio/src/server.ts`, `packages/inm-studio/src/main.tsx`
- Executable project seed strategy: `examples/memory-fab/strategies/reentrant-dram-fab.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "shared work centers|identity-preserving wafer lots"
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

The unchanged candidate must report `UNCHANGED`. A temporary candidate that changes both shared bays to `recipeDispatch: earliest-due-date` and `lotDispatch: earliest-due-date` must report `KEEP`.
