# Simulation runtime and run reliability

Status: deterministic discrete-event runtime and immutable replay artifacts implemented.

Related: [[docs/design/material-contracts]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/work-center-dispatch]], [[docs/design/lot-tracking]], [[docs/design/lot-release-scheduling]], [[docs/design/batch-processing]], [[docs/design/equipment-changeover]], [[docs/design/reusable-production-tooling]], [[docs/design/quality-flow]], [[docs/design/logistics]], [[docs/design/power]], [[docs/design/equipment-energy-states]], [[docs/design/inventory-accounting]], [[docs/design/studio-debugger]].

## Scope

This document owns time, scheduling, state mutation, Device program boundaries, failures, event semantics, metrics, hashes, and immutable runs.

## Determinism

Time is integer milliseconds. Production and transport use integer counts and integer durations. The event heap is ordered by:

```text
tick → priority → insertion sequence
```

The runtime may not depend on wall clock, frame rate, object insertion order, browser state, or unseeded randomness. `SeededRandom` is the only stochastic seam.

Locked Benchmark cases are separate deterministic universes. Candidate cases with no shared runtime state execute in bounded workers when at least three cases are present; the host never parallelizes mutation inside one simulation. Each job reloads and compiles its exact project selection and Blueprint, evaluates one seed, and returns only its compact evaluation plus the explicitly requested invocation-local driver trace. A standalone Benchmark owns one disposable worker set for its Candidate wave. A Design operation owns one set across its seed and every Candidate wave, so later jobs reuse already-started runtimes without sharing simulation state or cached project inputs. The parent verifies returned case and Blueprint identities, compares against the prepared locked baseline, and aggregates results in manifest case order. Worker completion order, cold startup, warm reuse, and wall timing are operational facts only: they cannot change case ordering, scores, reasons, verdicts, events, metrics, Design manifests, or result hashes.

The default worker bound is the smaller of the case count, eight, and the host's available parallelism minus one. One- and two-case evaluations remain in-process because worker startup would dominate. A failed wave terminates the complete set before a later wave may create replacements; cancellation does the same and rejects without partial aggregate evidence. Normal completion always disposes the operation-owned set. Tests and internal diagnostics can explicitly select sequential or parallel execution to prove byte-identical evidence; this is not a weaker evaluation mode.

## State ownership

`mutateFactoryState()` is the only mutation path. Runtime state contains Device status/buffers/jobs, identity-preserving WIP lots and buffer queues, resource-node remaining/reserved/extracted quantities, local cargo with exact phase and cell, station cargo/fleet reservation and carrier-energy ledgers, per-Device/per-grid stored energy, and metrics integrals. Lot mutations update identity, location, elapsed-state clocks, and aggregate buffer/material counts as one authoritative transition.

Device TypeScript is trusted project code but not state authority. Programs receive a typed read-only invocation view and return declarative decisions: `start`, `treat`, `extract`, `generate`, `consume`, `wait`, or `none`. The view recursively exposes the current exact context without copying simulator buffers or material batches and rejects writes, deletion, descriptor/prototype changes, and extensibility changes. Every lazily reached root or nested view belongs to one invocation lifetime; after the host parses the synchronous decision, that whole lifetime expires and retained property reads, membership checks, own-key enumeration, descriptors, prototype/extensibility inspection, and mutation all fail. A program therefore cannot mutate host state or retain live access between invocations; casting away TypeScript readonly is an immediate runtime error rather than permission to mutate an isolated copy. For a shared work center, the host first ranks qualified operations, selects the first whose exact inputs are resident and outputs have reserved capacity, then exposes only that selected plan in `context.process`. For production and treatment, the returned action must match its selected operation, material levels, inputs, outputs, duration, and active power exactly. The host validates every referenced Resource, buffer, node, count, duration, power request, and compiled plan before scheduling or mutation. Local transport dispatch is likewise host-owned: it considers only inventory whose Resource appears in the compiled connection allowlist and whose treatment level satisfies downstream demand, even when both endpoint buffers accept a wider set.

Runtime prepares host-owned Device, Process-plan, treatment, extraction, and fuel-generation descriptions once per simulation. Every evaluation still constructs a new root with the same ordered optional keys around the current tick, buffers, material-grade ledgers, exact selected Process, and freshly observed extraction-node remainder. The invocation proxy recursively mediates prepared descriptions exactly like live state and expires as one lifetime; preparation therefore removes repeated static construction without creating a reusable program-visible context, retaining a live view, or caching mutable simulator authority.

## Failures and blocking

Scenario failures are explicit timed events. Failed extraction releases reservations. Failed or unpowered infrastructure stops new work while already-departed station cargo remains in flight. Full output buffers, occupied belt cells, target capacity, unpowered endpoints, and failed endpoints become visible blocking rather than disappearing into averaged rates. Every blocked local transit stores one immediate typed cause (`line-contention`, `endpoint-capacity`, `endpoint-power`, or `endpoint-failure`) and one stage (`line`, `loader`, or `unloader`). Clearing the block clears all three fields together; integrating a blocked transit without its cause and stage is a runtime invariant violation.

Destination capacity is reservation-based. Every local or station transit counts as inbound from departure until arrival. Before dispatch, the runtime computes free space against both the buffer's total capacity and any compiled per-Resource quota; it subtracts resident inventory, all inbound inventory, resident inventory of the chosen Resource, and inbound inventory of that Resource. Device production applies the same two limits before a job may complete. This makes concurrent belt and carrier arrivals deterministic and prevents transient overfill without adding a second mutable reservation ledger.

Local `shortage-first` dispatch derives its ordering from that authoritative state instead of maintaining a second demand ledger. For every eligible connection Resource, `(resident + inbound) / coverageUnit` measures downstream coverage. Coverage units are exact Process input batches, one fuel or Objective unit, or generic buffer capacity. Lower coverage wins; equal coverage prefers the Process output nearer the Objective dependency root, then the existing rotated cursor preserves deterministic fairness. A Device's explicit output priority and a target Device's explicit input priority rank above this dynamic order. The runtime uses the same comparison both across outgoing connections and among several Resources sharing one connection.

Station dispatch adds inventory policy without adding hidden state. Dispatchable supply is `resident − supplyReserve`; remote destination space is `demandTarget − resident − all inbound cargo`, further intersected with the normal buffer and Resource quota. Counting local inbound cargo gives local belts first claim on the replenishment headroom without applying the remote target to their own dispatch. When a source station's finite home fleet cannot serve every eligible route, the scheduler chooses higher authored demand priority, then higher authored supply priority. Within that explicit tier, network FIFO uses stable route ids, round-robin rotates after departure, and shortage-first compares destination resident plus inbound cargo against the compiled downstream coverage batch and Objective depth before using the same rotated cursor for exact ties. A full or sufficiently covered high-ranked target automatically exposes the next eligible route. Departure creates both cargo transit and a carrier mission; cargo arrives after one compiled leg, changes the mission to returning, and only the later `logistics.return` releases that carrier for another departure.

Station charging is also authoritative state. Grid-delivered energy enters only through a `station.energy` mutation, and a route removes its complete mission cost from the source station exactly once at departure. An energy-starved route remains blocked without reserving cargo or fleet capacity. The scheduler derives the next mission-ready and full-buffer ticks from integer energy rates, making identical inputs independent of polling frequency.

Power changes checkpoint work rather than canceling it. A production, extraction, or treatment job carries its nominal duration, full-speed-equivalent worked and remaining ticks, the tick at which its current powered segment resumed, and current satisfaction. In proportional mode, a generation, storage, or load boundary invalidates the old completion generation and reschedules from exact remaining work divided by the new grid fraction. In priority-load-shedding mode, rejected work pauses at zero and later resumes for its exact remainder. Inputs remain consumed, extraction inventory remains reserved, reusable production tooling remains reserved, and no output appears early. Explicit sorter loading/unloading uses the same checkpoint rule for its current phase; passive belt travel is not power-scaled. See [[docs/design/power]] and [[docs/design/reusable-production-tooling]].

## Events and metrics

`resource.belt-blocked` carries the same required immediate cause and stage as live transit state; `resource.belt-unblocked` closes that interval. Per-connection metrics retain a complete cause/stage blocked-item-time partition, and the four immediate-cause totals must sum exactly to `blockedItemTicks`.

For a productive Process Device, runtime readiness also owns explicit `device.input-starved` and `device.input-restored` intervals. A starvation snapshot names every simultaneously missing Process input with its Resource, target Buffer, required/resident/missing count, minimum treatment level, and every immediate authored local supply connection. Each supply observation retains source Device/Buffer inventory and status, matching in-flight quantity, loader/unloader Device and status, and one direct state such as source processing, source empty, transport in flight, endpoint unpowered/failed, transport blocked, or no local supply. A changed snapshot closes the preceding interval and opens the next at the same deterministic tick. Tooling, utilities, maintenance, campaigns, qualification, power, and output capacity close material starvation because their independent events own those waits. These events describe only the immediate state the runtime can prove; they never recursively invent a graph-wide root cause.

The possible incoming connection set and its stable id order are compiled topology. Snapshot construction reads that index while resolving resident material, matching transit, blocking, source, and endpoint state live. An open snapshot is unchanged only when its Process and every ordered shortage/supply field are structurally equal; no textual signature, coarse debounce, or cached live observation may stand in for that comparison. One newly constructed evidence tree is retained by the open interval and its immutable event because runtime never mutates shortage evidence after publication.

The shortage Process is resolved through the same authored scheduling policy as execution, including recipe dispatch, cadence control, setup campaigns, and batch formation. A zero-wait fixed-batch policy therefore reports its smaller qualified fallback while the preferred complete batch is unavailable, even before the first fallback lot arrives. If exactly the reported missing material becomes resident without another state change, that same Process becomes executable. A positive batch-formation hold remains independent unavailability and does not become material starvation. This invariant prevents diagnostic evidence from naming a preferred three-lot Process when runtime will actually admit a one-lot fallback.

Events are the shared debugger protocol for CLI, fixtures, evaluation, research, replay, and Studio. Lot-bearing Device and transport events carry exact ids, production `device.start`/`device.finish` events carry the selected mode, and `lot.completed` records cycle time and tardiness. Setup-sensitive Devices emit changeover start/finish/cancellation with exact groups and duration. Maintenance events carry exact usage/calendar trigger attribution and qualification age through service, qualification, cancellation, and final release. Reusable tooling emits blocking, acquisition, and outcome-aware release events; quality flow emits exact excursion, inspection disposition, selective repair, and scrap events; a lot-terminating variable-output job emits `lot.output-profile` with nominal and realized output; material treatment emits exact source/target levels and agent consumption; power boundary events record renewable output, satisfaction changes, accumulator full/depleted transitions, and exact hard-shortage restoration; station-energy events record blocked missions, departure spending, and full buffers. Metrics are derived from deterministic state/event integration and include lot completion/service/cycle/queue/process/transport/tardiness, good/first-pass yield, inspection/rework/scrap/escape outcomes, nominal/actual/lost lot-derived output, adaptive cadence normal/recovery jobs, equipment changeovers/setup work, maintenance usage/calendar triggers and qualification age, tooling allocation/occupancy/wait, treated quantities by `Resource@level`, treatment agents, throughput, delivery, generated/requested/served/unserved/curtailed grid energy, average/minimum satisfaction, peak power and contiguous deficit envelopes, fuel/storage, station initial/charged/spent/final energy, per-Device unpowered time, cost/area, utilization and wait states, Objective-scoped WIP plus total/per-Resource inventory, belt occupancy/blocking, per-connection flow, station congestion, depletion, bottleneck, constraints, and score breakdown. See [[docs/design/inventory-accounting]].

Every positive-time metric boundary reads inventory, local transit, station cargo, and carrier missions directly from the one authoritative state. Stable iteration topology and Objective membership are prepared once, but live collections are observed once per boundary into disposable counters and a disposable Resource grouping. Inventory, transport, blocking, and congestion integrals therefore share one exact observation without adding mutable shadow state or weakening metric resolution.

## Immutable runs

A completed run contains its Blueprint snapshot, manifest, events, final state, metrics, and report; research runs also include hypothesis and patch. Files are atomically written and `manifest.json` is last. The run key includes engine version, all input/catalog hashes, seed, duration, and event limit. `resultHash` covers the run key, ordered events, final state, and metrics.

Studio viewing never creates a run. Only explicit CLI simulation/research workflows write history.

## Source of truth

- Scheduler/simulation: `packages/inm-core/src/simulator.ts`
- Device program isolation and decision parsing: `packages/inm-core/src/device-runtime.ts`
- Bounded case workers and operation-scoped reuse: `packages/inm-core/src/benchmark-case-execution.ts`
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
