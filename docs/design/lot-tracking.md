# Identity-preserving industrial lots

Status: explicit WIP identity, due-date dispatch, setup-aware queueing, quality state, and cycle-time evaluation implemented through engine version `inm-sim/0.50.0`.

Related: [[docs/design/material-contracts]], [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/quality-flow]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[examples/memory-fab]], [[docs/PROJECT_FORMAT]].

## Why identity is industrial state

Fungible inventory is sufficient for ore, fuel, and many bulk intermediates. It is not sufficient for a wafer fab: a released wafer lot keeps its identity while its material state changes, revisits work centers, waits in several queues, crosses physical transport, acquires priority, and either meets or misses its due date. Inferring those facts from aggregate buffer counts loses the scheduling problem that the Blueprint optimizer is meant to solve.

A Resource opts into identity with `tracking: { kind: "lot", family }`. Different route-stage Resources use the same family. The Resource id remains the current material/process state; the family and lot id remain stable across the complete route.

## Compile-time contract

Tracked Resources must be discrete. Every Process that touches a tracked family transforms exactly one tracked input Resource into exactly one tracked output Resource with an equal count. A production mode must preserve that equality after applying `inputCycles` and `outputCycles`. Tracked Resources cannot be auxiliary inputs, fuels, or fungible world deposits.

Scenario startup WIP is declared through `initialLots`, never by placing a tracked Resource count in `initialBuffers`. Every entry names a stable kebab-case id, Device, buffer, current Resource, optional integer priority, and optional due tick. Compilation checks identity uniqueness, Resource tracking, physical buffer acceptance, total capacity, and Resource quota.

## Runtime authority

`FactoryState.lots` is the identity authority. Each lot records family, current Resource and treatment level, release/due ticks, priority, route step, status, physical location, and accumulated queue, process, and transport ticks. Device buffers retain FIFO identity arrays in addition to aggregate counts. Every lot mutation updates the identity store and the existing buffer/material totals together.

The valid lifecycle is:

```text
queued buffer → transport → queued buffer → processing
             ↘                 ↑             ↓
              completed sink   └ transformed output
              scrapped on an interrupted equipment job or terminal quality disposition
```

Physical belt and station transits carry exact lot ids. A production start removes selected ids from the input buffer and holds them on the active Device job. Completion changes their Resource to the compiled output stage, increments `routeStep`, and queues the same ids in the output buffer. A boundary consumer marks them completed. An equipment breakdown that cancels an active job marks its held identities `scrapped` rather than leaving invisible WIP. `lot.completed` and `lot.scrapped` expose both outcomes in the immutable event stream.

For every completed lot, this conservation invariant holds:

```text
completedAtTick − releasedAtTick = queueTicks + processTicks + transportTicks
```

## Blueprint scheduling surface

`policy.lotDispatch` chooses identities within one ready operation:

- `fifo`: physical buffer arrival order;
- `oldest-release`: earliest release tick;
- `earliest-due-date`: earliest finite due tick;
- `highest-priority`: largest authored lot priority.

Shared work-center `recipeDispatch` also accepts `oldest-lot`, `earliest-due-date`, and `highest-lot-priority`. These rank ready route steps by their best resident lot, while `lotDispatch` selects the exact identities consumed after an operation wins. Active jobs remain non-preemptive; stable lot ids and authored operation order resolve ties.

## Evaluation

For the Objective target Resource's tracked family, runtime metrics report released/completed/scrapped/in-progress lots, on-time count, mean/p95/maximum cycle time, mean queue/process/transport time, and mean/maximum tardiness. `onTimeDelivery` becomes on-time completed lots divided by released lots, so scrapped lots remain in the denominator. Untracked Objectives retain rate-attainment semantics.

Optional Objective weights `cycleTime` and `tardiness` apply penalties per mean minute. Throughput, WIP, energy, build cost, area, and blocking remain simultaneous terms, so a Coding Agent cannot improve due-date service by silently ignoring factory economics.

## Current boundary

Lots are released only at Scenario tick zero. Route identity is preserved, but the route itself is still represented by explicit stage Resources and Processes rather than one declarative route sheet. Deterministic excursion, inspection, selective rework, scrap, yield, and quality escape are explicit; see [[docs/design/quality-flow]]. Batch formation, dynamically timed releases, chamber cleaning, preventive maintenance, sampling plans, and correlated equipment-level excursions remain later industrial layers. Sequence-dependent equipment setup is explicit in [[docs/design/equipment-changeover]].

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

The unchanged memory-fab candidate reports `UNCHANGED`. Replacing its standard final inspection recipe with the fixed deep-inspection alternative must report `KEEP` in the current Objective because the candidate eliminates one latent quality escape, even though it completes fewer lots with longer cycle time.
