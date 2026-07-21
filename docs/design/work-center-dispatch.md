# Shared work centers and re-entrant production

Status: multi-operation qualification plus operation-, lot-, setup-, and quality-aware deterministic ready-WIP dispatch implemented through engine version `inm-sim/0.50.0`.

Related: [[docs/design/material-contracts]], [[docs/design/production-modes]], [[docs/design/lot-tracking]], [[docs/design/equipment-changeover]], [[docs/design/quality-flow]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

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
- `oldest-lot`: operation containing the earliest-released tracked lot;
- `earliest-due-date`: operation containing the tracked lot with the earliest finite due tick;
- `highest-lot-priority`: operation containing the tracked lot with the greatest authored priority.

`lotDispatch` independently chooses the exact identities consumed after an operation wins: `fifo`, `oldest-release`, `earliest-due-date`, or `highest-priority`. Operation dispatch and lot dispatch are separate because a shared work center first chooses a route step and then chooses WIP within that step. See [[docs/design/lot-tracking]].

Selection occurs only while the Device is idle. A ready operation has every exact input batch available and enough reserved output capacity. If its Process setup group differs from setup-sensitive equipment state, the host completes the fixed powered changeover before material is consumed. Work is non-preemptive after start. When nothing is ready, the highest-ranked operation is still exposed to the Device program so the normal waiting-input or blocked-output state remains observable. See [[docs/design/equipment-changeover]].

## Runtime authority and determinism

The engine selects one compiled plan before calling the project-local TypeScript program. `context.process` still contains one operation, keeping Device programs simple. The returned `start` action must exactly match that selected plan. Stable authored indices resolve every equal rank, so no decision depends on object iteration, wall clock, or browser state.

The event stream records the selected Process id and tracked lot ids in `device.start` and `device.finish`. Existing utilization, waiting, blocking, power, WIP, and transport metrics measure shared-equipment contention because one Device can own only one active job; lot clocks additionally measure the scheduling consequences.

## Static analysis boundary

`inm analyze` emits one row per qualified operation. Its cycles/min value is an exclusive maximum: the rate if that operation owned the work center continuously. A `shared-work-center` diagnostic names the dispatch policy and warns that those maxima cannot run simultaneously. Material-balance and capacity planning enumerate every qualified operation, but the first implementation does not yet solve a coupled allocation variable across all operations on one physical Device. Locked event simulation is therefore the score authority for re-entrant work-center optimization.

The next industrial layers should make that coupling richer rather than hide it: minimum/maximum batch formation, chamber cleaning consumables, qualification expiry, preventive maintenance and breakdown repair, stochastic-but-seeded yield, inspection, scrap, and rework routes.

## Memory-fab reference project

[[examples/memory-fab]] is the north-star executable example. Twelve named synthetic DRAM wafer lots with priorities and due dates travel through lithography → etch → deposition, return to the same lithography bay, then return to the same etch bay before delivery. Both shared bays begin with authored operation order and FIFO lot order. Its locked `dispatch-research` benchmark proves that changing both policies to earliest-due-date eliminates measured tardiness and improves cycle time in the same fixed three-minute window without editing assets, Processes, Scenario, Objective, or evaluator.

## Source of truth

- Types/schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Qualification compilation: `packages/inm-core/src/compiler.ts`
- Ready-operation selection and enforcement: `packages/inm-core/src/simulator.ts`
- Static projection: `packages/inm-core/src/production-analysis.ts`, `packages/inm-core/src/capacity-plan.ts`
- Studio projection: `packages/inm-studio/src/server.ts`, `packages/inm-studio/src/main.tsx`
- Executable project generator: `scripts/regenerate-memory-fab.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "shared work centers|identity-preserving wafer lots"
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

The unchanged candidate must report `UNCHANGED`. A temporary candidate that changes both shared bays to `recipeDispatch: earliest-due-date` and `lotDispatch: earliest-due-date` must report `KEEP`.
