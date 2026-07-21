# Simulation runtime and run reliability

Status: deterministic discrete-event runtime and immutable replay artifacts implemented.

Related: [[docs/design/material-contracts]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/power]], [[docs/design/studio-debugger]].

## Scope

This document owns time, scheduling, state mutation, Device program boundaries, failures, event semantics, metrics, hashes, and immutable runs.

## Determinism

Time is integer milliseconds. Production and transport use integer counts and integer durations. The event heap is ordered by:

```text
tick → priority → insertion sequence
```

The runtime may not depend on wall clock, frame rate, object insertion order, browser state, or unseeded randomness. `SeededRandom` is the only stochastic seam.

## State ownership

`mutateFactoryState()` is the only mutation path. Runtime state contains Device status/buffers/jobs, resource-node remaining/reserved/extracted quantities, local cargo with exact phase and cell, station cargo/fleet reservation and carrier-energy ledgers, per-Device/per-grid stored energy, and metrics integrals.

Device TypeScript is trusted project code but not state authority. Programs receive frozen local context and return declarative decisions: `start`, `treat`, `extract`, `generate`, `consume`, `wait`, or `none`. For production and treatment, the context carries the selected mode and complete job plan; the returned action must match its operation, material levels, inputs, outputs, duration, and active power exactly. The host validates every referenced Resource, buffer, node, count, duration, power request, and compiled plan before scheduling or mutation. Local transport dispatch is likewise host-owned: it considers only inventory whose Resource appears in the compiled connection allowlist and whose treatment level satisfies downstream demand, even when both endpoint buffers accept a wider set.

## Failures and blocking

Scenario failures are explicit timed events. Failed extraction releases reservations. Failed or unpowered infrastructure stops new work while already-departed station cargo remains in flight. Full output buffers, occupied belt cells, target capacity, and unpowered unloaders become visible blocking rather than disappearing into averaged rates.

Destination capacity is reservation-based. Every local or station transit counts as inbound from departure until arrival. Before dispatch, the runtime computes free space against both the buffer's total capacity and any compiled per-Resource quota; it subtracts resident inventory, all inbound inventory, resident inventory of the chosen Resource, and inbound inventory of that Resource. Device production applies the same two limits before a job may complete. This makes concurrent belt and carrier arrivals deterministic and prevents transient overfill without adding a second mutable reservation ledger.

Local `shortage-first` dispatch derives its ordering from that authoritative state instead of maintaining a second demand ledger. For every eligible connection Resource, `(resident + inbound) / coverageUnit` measures downstream coverage. Coverage units are exact Process input batches, one fuel or Objective unit, or generic buffer capacity. Lower coverage wins; equal coverage prefers the Process output nearer the Objective dependency root, then the existing rotated cursor preserves deterministic fairness. A Device's explicit output priority and a target Device's explicit input priority rank above this dynamic order. The runtime uses the same comparison both across outgoing connections and among several Resources sharing one connection.

Station dispatch adds inventory policy without adding hidden state. Dispatchable supply is `resident − supplyReserve`; remote destination space is `demandTarget − resident − all inbound cargo`, further intersected with the normal buffer and Resource quota. Counting local inbound cargo gives local belts first claim on the replenishment headroom without applying the remote target to their own dispatch. When a source station's finite home fleet cannot serve every eligible route, the scheduler chooses higher authored demand priority, then higher authored supply priority. Within that explicit tier, network FIFO uses stable route ids, round-robin rotates after departure, and shortage-first compares destination resident plus inbound cargo against the compiled downstream coverage batch and Objective depth before using the same rotated cursor for exact ties. A full or sufficiently covered high-ranked target automatically exposes the next eligible route. Departure creates both cargo transit and a carrier mission; cargo arrives after one compiled leg, changes the mission to returning, and only the later `logistics.return` releases that carrier for another departure.

Station charging is also authoritative state. Grid-delivered energy enters only through a `station.energy` mutation, and a route removes its complete mission cost from the source station exactly once at departure. An energy-starved route remains blocked without reserving cargo or fleet capacity. The scheduler derives the next mission-ready and full-buffer ticks from integer energy rates, making identical inputs independent of polling frequency.

Power changes checkpoint work rather than canceling it. A production, extraction, or treatment job carries its nominal duration, full-speed-equivalent worked and remaining ticks, the tick at which its current powered segment resumed, and current satisfaction. In proportional mode, a generation, storage, or load boundary invalidates the old completion generation and reschedules from exact remaining work divided by the new grid fraction. In priority-load-shedding mode, rejected work pauses at zero and later resumes for its exact remainder. Inputs remain consumed, extraction inventory remains reserved, and no output appears early. Explicit sorter loading/unloading uses the same checkpoint rule for its current phase; passive belt travel is not power-scaled. See [[docs/design/power]].

## Events and metrics

Events are the shared debugger protocol for CLI, fixtures, evaluation, research, replay, and Studio. Material treatment emits exact source/target levels and agent consumption; power boundary events record renewable output, satisfaction changes, accumulator full/depleted transitions, and exact hard-shortage restoration; station-energy events record blocked missions, departure spending, and full buffers. Metrics are derived from deterministic state/event integration and include treated quantities by `Resource@level`, treatment agents, throughput, delivery, generated/requested/served/unserved/curtailed grid energy, average/minimum satisfaction, peak power and contiguous deficit envelopes, fuel/storage, station initial/charged/spent/final energy, per-Device unpowered time, cost/area, utilization and wait states, WIP, belt occupancy/blocking, per-connection flow, station congestion, depletion, bottleneck, constraints, and score breakdown.

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
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identical inputs|completed run|failure|blocked|deplete|storage|restored generation"
bun run inm simulate examples/ironworks --seed 42
bun run inm runs examples/ironworks
bun run test
```

Any new mutable quantity needs a state mutation operation, deterministic event ordering, serialization, metrics/replay treatment, and an identical-input replay test.
