# Objective-owned inventory accounting

Status: explicit Resource-scoped WIP integration, resident/transit/in-process physical conservation, score semantics, immutable evidence, comparison, CLI, workbench, and Studio projection implemented.

Related: [[docs/design/simulation-runtime]], [[docs/design/lot-tracking]], [[docs/design/industrial-boundaries]], [[docs/design/blueprint-comparison]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], [[docs/PROJECT_FORMAT]], and [[docs/CLI]].

## Why WIP is not total inventory

An industrial factory can simultaneously hold raw purchases, identity-preserving work lots, unfinished fungible product, maintenance consumables, reusable tooling, scrap, and finished goods waiting at a delivery boundary. Summing all of them and labeling the result “WIP” makes a stocking decision look like a cycle-time decision and can dominate an optimization score for the wrong reason.

The role is also Objective-dependent. Ironworks `hydrogen` is an intermediate in the general process graph but a delivered product under the hydrogen Objective. Descriptive Resource tags and graph reachability therefore cannot authoritatively decide whether a Resource is scored as work in process.

## Authored contract

Every Objective declares `wipResources`, an exact duplicate-free list of project Resource ids. The list may be empty. Missing, duplicate, and unknown entries are invalid; there is no inferred default or compatibility reader.

The selected Objective is fixed evaluator input. A Blueprint Candidate cannot edit its WIP scope, and Blueprint comparison and locked Benchmarks already require identical Objective hashes. This prevents an optimizer from improving its score by redefining accounting.

Memory-fab includes every released wafer-stage Resource plus known-good die and packaged devices. It excludes scheduled package substrates, maintenance and qualification consumables, reusable reticles, scrap disposition, and three delivered DRAM grades.

## Runtime integration

At every deterministic measurement boundary, Core groups inventory by Resource across:

- all resident Device buffers;
- material physically loaded into active production and treatment jobs;
- local loader, belt, and unloader transit;
- station-network cargo in flight.

Each physical item appears in exactly one of those locations. Moving material therefore does not disappear from inventory and is not counted twice. For every observed Resource, the runtime integrates item-ticks, records peak quantity, and captures final quantity. It separately records total inventory and the sum whose Resource ids occur in `Objective.wipResources`.

For every Resource in that Objective scope, Core simultaneously integrates one stable physical location identity:

- `buffer:<device>:<buffer>:<resource>` for resident Device inventory;
- `in-process:<device>:<process>:<resource>` for material loaded into an active production or treatment job;
- `local-transit:<connection>:<loading|belt|unloading>:<resource>` for explicit sorter and line stages;
- `station-transit:<network>:<route>:<resource>` for loaded station cargo.

The Resource remains an explicit field on every location record; the id is a stable serialization and comparison key, not a parsing API or an item identity. Multiple fungible items at one physical location aggregate into that one location quantity. Once a job loads material, its source Buffer is no longer part of the physical identity; duplicate inputs of one Resource aggregate under the Device and Process that now hold them. Core records locations only for Objective WIP Resources because excluded raw, support, scrap, and finished inventory cannot affect the WIP score and remains completely accounted by Resource.

An active material-processing job retains the exact compiled inputs it removed from buffers. Those quantities remain in total inventory and, when their Resource belongs to `Objective.wipResources`, in Objective WIP until the job completes or is cancelled. Completion atomically removes the input-state location and exposes the configured outputs; a paused or unpowered job keeps its material and remains present at the final measurement boundary. Extraction reserves, generator fuel, terminal delivery/discard, maintenance consumables, reusable tooling, and facility utilities retain their separate physical ledgers and do not become production in-process inventory.

The boundary observation is read-only and disposable. Core traverses each resident Buffer and active material job, local transit, and station cargo collection once, groups its exact current contents into one boundary-local Resource projection, and consumes that projection once for total, WIP, area, and peak integration. The same local-transit pass integrates belt occupancy, connection occupancy, sorter-stage activity, and typed blocking causes; the same carrier-mission pass integrates congestion and fleet busy area. Stable Device, Buffer, connection, network, fleet, and Objective-WIP membership is prepared once per simulation, while every quantity, phase, status, and cause is read live from `FactoryState`. There is no cached mutable inventory or metrics shadow ledger.

`FactoryMetrics.inventoryAccounting` contains:

- average and peak total inventory;
- average and peak scored WIP;
- average excluded inventory;
- deterministic per-Resource `includedInWip`, average, peak, and final quantities.
- deterministic per-location Resource, kind, physical identity, average, peak, and final quantities for scored WIP.

The sum of location averages equals `averageWip`; the locations for one Resource equal that Resource's average; and final location quantities conserve to final scored Resource inventory. Per-location peaks are exact observations but are not additive because different locations can peak at different ticks.

`FactoryMetrics.averageWip` is the same scoped average retained as the direct score input. `scoreBreakdown.wip` is exactly `-averageWip × Objective.weights.wip`.

This is inventory accounting, not lot-card control. CONWIP still counts released non-terminal tracked lot identities; it neither counts downstream fungible units nor reads the Objective WIP list. In-process inventory records exact inputs loaded at job start; it does not infer quantity from utilization, duration, nominal output, or a descriptive Process graph. This prevents a slower batch or paused job from appearing to improve WIP merely because its inputs left a Buffer.

## Shared evidence

Immutable run `metrics.json` owns the complete machine-readable accounting. `report.md` prints the summary plus Resource and physical-location tables. Compare/Benchmark snapshots preserve the complete baseline/candidate tables and exact per-Resource and per-location deltas.

`inm simulate` human output lists scored Resources and their leading physical locations; its bounded JSON summary retains the complete accounting object. `inm inspect` exposes the authored scope even without a run and, when a hash-compatible run exists, projects the same accounting plus a separate Objective tradeoff view through the V12 workbench. That view reconciles the complete score breakdown, identifies the dominant negative component, and converts each included Resource and location's exact average inventory through the immutable Objective WIP weight. Studio Overview links selectable Buffer and in-process Device locations and local connections directly into the same immutable Factory replay; Factory renders the ranked location values without recomputation. Station-route locations remain exact typed evidence even when the current spatial selection contract has no network-route object focus.

Total inventory remains visible so excluded raw, support, scrap, and finished stock can be diagnosed. It never silently contributes to the WIP score.

The tradeoff projection is not fab-loss attribution. Necessary queue stock, batch companions, protected service inventory, and output awaiting the next physical cadence may all contribute to WIP. Ranking their accounting contribution tells a human or reasoning Agent where to observe; it does not declare the quantity avoidable or authorize an automatic buffer reduction.

Memory-fab Run `093-simulate` is the first current `inm-sim/0.88.0` operating evidence under this contract. Relative to physically identical Run `092-simulate`, delivered output remains `88`, throughput remains `22/min`, and every production, delivery, quality, timing, and equipment event is unchanged. Conserving loaded production inputs raises average total inventory from `116.16841666666667` to `124.73002083333333`, average Objective WIP from `19.872825` to `27.834429166666666`, and changes the WIP score contribution from `-29.8092375` to `-41.75164375`. Exact newly visible back-end locations include `3.75` average packaged devices in `burn-in-1.screen-performance-mix`, `1.25` in `burn-in-1.screen-commercial-dram`, and `0.6` known-good die in `packaging-1.package-known-good-dram`.

## Source of truth

- Objective type and strict schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Semantic validation: `packages/inm-core/src/compiler.ts`
- Deterministic integration: `packages/inm-core/src/simulator.ts`
- Metrics and score: `packages/inm-core/src/evaluator.ts`
- Immutable report: `packages/inm-core/src/artifacts.ts`
- Comparison evidence: `packages/inm-core/src/blueprint-comparison.ts`
- Shared workbench: `packages/inm-core/src/workbench.ts`
- Human/Agent and Studio projection: `packages/inm-cli/src/commands.ts`, `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove strict Objective validation, resident/in-process/in-flight continuity, paused-job and final-boundary conservation, local loader/line/unloader and station-route accounting, exact equality between the included per-Resource and per-location average sums and `averageWip`, final-location conservation, exclusion of project support/raw/finished Resources, score-component reconciliation, comparison deltas, workbench parity, immutable report projection, and deterministic replay.
