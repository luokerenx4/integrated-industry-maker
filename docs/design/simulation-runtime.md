# Simulation runtime and run reliability

Status: deterministic discrete-event runtime and immutable replay artifacts implemented.

Related: [[docs/design/material-contracts]], [[docs/design/logistics]], [[docs/design/power]], [[docs/design/studio-debugger]].

## Scope

This document owns time, scheduling, state mutation, Device program boundaries, failures, event semantics, metrics, hashes, and immutable runs.

## Determinism

Time is integer milliseconds. Production and transport use integer counts and integer durations. The event heap is ordered by:

```text
tick → priority → insertion sequence
```

The runtime may not depend on wall clock, frame rate, object insertion order, browser state, or unseeded randomness. `SeededRandom` is the only stochastic seam.

## State ownership

`mutateFactoryState()` is the only mutation path. Runtime state contains Device status/buffers/jobs, resource-node remaining/reserved/extracted quantities, local cargo with exact phase and cell, station cargo/fleet reservation, per-grid energy, and metrics integrals.

Device TypeScript is trusted project code but not state authority. Programs receive frozen local context and return declarative decisions: `start`, `extract`, `generate`, `consume`, `wait`, or `none`. The host validates every referenced Resource, buffer, node, count, duration, power request, and compiled plan before scheduling or mutation.

## Failures and blocking

Scenario failures are explicit timed events. Failed extraction releases reservations. Failed or unpowered infrastructure stops new work while already-departed station cargo remains in flight. Full output buffers, occupied belt cells, target capacity, and unpowered unloaders become visible blocking rather than disappearing into averaged rates.

Destination capacity is reservation-based. Every local or station transit counts as inbound from departure until arrival. Before dispatch, the runtime computes free space against both the buffer's total capacity and any compiled per-Resource quota; it subtracts resident inventory, all inbound inventory, resident inventory of the chosen Resource, and inbound inventory of that Resource. Device production applies the same two limits before a job may complete. This makes concurrent belt and carrier arrivals deterministic and prevents transient overfill without adding a second mutable reservation ledger.

## Events and metrics

Events are the shared debugger protocol for CLI, fixtures, evaluation, research, replay, and Studio. Metrics are derived from deterministic state/event integration and include throughput, delivery, energy/fuel, cost/area, utilization and wait states, WIP, belt occupancy/blocking, per-connection flow, station congestion, depletion, bottleneck, constraints, and score breakdown.

## Immutable runs

A completed run contains its Blueprint snapshot, manifest, events, final state, metrics, and report; research runs also include hypothesis and patch. Files are atomically written and `manifest.json` is last. The run key includes engine version, all input/catalog hashes, seed, duration, and event limit. `resultHash` covers the run key, ordered events, final state, and metrics.

Studio viewing never creates a run. Only explicit CLI simulation/research workflows write history.

## Source of truth

- Scheduler/simulation: `packages/inm-core/src/simulator.ts`
- State mutations: `packages/inm-core/src/state.ts`
- Events/types: `packages/inm-core/src/types.ts`
- Evaluation: `packages/inm-core/src/evaluator.ts`
- Artifacts/replay: `packages/inm-core/src/artifacts.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identical inputs|completed run|failure|blocked|deplete"
bun run inm simulate examples/ironworks --seed 42
bun run inm runs examples/ironworks
bun run test
```

Any new mutable quantity needs a state mutation operation, deterministic event ordering, serialization, metrics/replay treatment, and an identical-input replay test.
