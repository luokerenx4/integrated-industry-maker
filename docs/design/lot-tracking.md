# Identity-preserving industrial lots

Status: explicit WIP identity, scheduled and controlled release, due-date dispatch, setup-aware queueing, fixed batch membership, quality state, Process-owned route termination, and cycle-time evaluation implemented through engine version `inm-sim/0.67.0`.

Related: [[docs/design/material-contracts]], [[docs/design/industrial-boundaries]], [[docs/design/work-center-dispatch]], [[docs/design/lot-release-scheduling]], [[docs/design/batch-processing]], [[docs/design/equipment-changeover]], [[docs/design/quality-flow]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[examples/memory-fab]], [[docs/PROJECT_FORMAT]].

## Why identity is industrial state

Fungible inventory is sufficient for ore, fuel, and many bulk intermediates. It is not sufficient for a wafer fab: a released wafer lot keeps its identity while its material state changes, revisits work centers, waits in several queues, crosses physical transport, acquires priority, and either meets or misses its due date. Inferring those facts from aggregate buffer counts loses the scheduling problem that the Blueprint optimizer is meant to solve.

A Resource opts into identity with `tracking: { kind: "lot", family }`. Different route-stage Resources use the same family. The Resource id remains the current material/process state; the family and lot id remain stable across the complete route.

## Compile-time contract

Tracked Resources must be discrete. An identity-preserving Process transforms exactly one tracked input Resource into exactly one tracked output Resource with an equal count. A production mode must preserve that equality after applying `inputCycles` and `outputCycles`. Alternatively, a Process with explicit `lotTermination` consumes one tracked input kind, produces only untracked Resources, and ends the source Route. Tracked Resources cannot be auxiliary inputs, fuels, or fungible world deposits.

Scenario work is declared through `lotReleases`, never by placing a tracked Resource count in `initialBuffers`. Every entry names a stable kebab-case id, Device, buffer, current Resource, required planned release tick, optional integer priority, and optional due tick. Compilation checks identity uniqueness, Resource tracking, physical buffer acceptance, horizon, and one-lot capacity. A Blueprint may then gate eligible identities through [[docs/design/wip-release-control]] without editing Scenario workload. See [[docs/design/lot-release-scheduling]].

## Runtime authority

`FactoryState.lots` is the identity authority. Each lot records family, current Resource and treatment level, planned/actual release and due ticks, priority, route step, status, physical location, and accumulated queue, process, and transport ticks. Before admission it is explicitly `scheduled` and occupies no factory buffer. Device buffers retain FIFO identity arrays in addition to aggregate counts. Every admitted-lot mutation updates the identity store and the existing buffer/material totals together.

The valid lifecycle is:

```text
queued buffer → transport → queued buffer → processing
             ↘                 ↑             ↓
              completed sink   └ transformed output
              scrapped on an interrupted equipment job or terminal quality disposition
```

Physical belt and station transits carry exact lot ids. A production start removes selected ids from the input buffer and holds them on the active Device job. Completion normally changes their Resource to the compiled output stage, increments the Route step, and queues the same ids in the output buffer. A terminating Process instead completes or scraps the held work order after producing its untracked outputs. A boundary consumer may still complete a tracked terminal Resource. An equipment breakdown that cancels an active job marks its held identities `scrapped` rather than leaving invisible WIP. `lot.route-terminated`, `lot.completed`, and `lot.scrapped` expose the outcomes in the immutable event stream.

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

For the Objective target Resource's tracked family, or an explicit Objective `trackedFamily`, runtime metrics report scheduled/released/pending/completed/scrapped/in-progress lots, release cadence and admission delay, on-time count, mean/p95/maximum cycle time, mean queue/process/transport time, and mean/maximum tardiness. `onTimeDelivery` becomes on-time completed lots divided by scheduled lots, so delayed admission, in-progress, and scrapped work remain in the denominator. An untracked finished-good Objective can therefore use product throughput while retaining source work-order service and quality metrics. Untracked Objectives without `trackedFamily` retain rate-attainment semantics.

Optional Objective weights `cycleTime` and `tardiness` apply penalties per mean minute. Throughput, WIP, energy, build cost, area, and blocking remain simultaneous terms, so a Coding Agent cannot improve due-date service by silently ignoring factory economics.

## Current boundary

Deterministic scheduled releases and capacity-gated admission are explicit in [[docs/design/lot-release-scheduling]]. Route identity and a declarative Route sheet are explicit. Conversion from a tracked route into fungible downstream products is modeled through [[docs/design/industrial-boundaries]]. Deterministic excursion, inspection, selective rework, scrap, yield, and quality escape are explicit; see [[docs/design/quality-flow]]. Fixed full-batch formation is explicit in [[docs/design/batch-processing]], and usage-based equipment maintenance is explicit in [[docs/design/usage-based-maintenance]]. Partial/timeout batches, chamber cleaning, sampling plans, and correlated equipment-level excursions remain later industrial layers. Sequence-dependent equipment setup is explicit in [[docs/design/equipment-changeover]].

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

The unchanged memory-fab candidate reports `UNCHANGED`. Replacing its standard final inspection recipe with the fixed deep-inspection alternative must report `KEEP` in the current Objective because the candidate eliminates one latent quality escape, even though it completes fewer lots with longer cycle time.
