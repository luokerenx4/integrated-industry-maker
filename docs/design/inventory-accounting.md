# Objective-owned inventory accounting

Status: explicit Objective-owned equivalent-unit WIP integration, raw resident/transit/in-process physical conservation, score semantics, immutable evidence, comparison, CLI, workbench, and Studio projection implemented.

Related: [[docs/design/simulation-runtime]], [[docs/design/lot-tracking]], [[docs/design/industrial-boundaries]], [[docs/design/blueprint-comparison]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], [[docs/PROJECT_FORMAT]], and [[docs/CLI]].

## Why WIP is not total inventory

An industrial factory can simultaneously hold raw purchases, identity-preserving work lots, unfinished fungible product, maintenance consumables, reusable tooling, scrap, and finished goods waiting at a delivery boundary. Summing all of them and labeling the result “WIP” makes a stocking decision look like a cycle-time decision and can dominate an optimization score for the wrong reason.

The role is also Objective-dependent. Ironworks `hydrogen` is an intermediate in the general process graph but a delivered product under the hydrogen Objective. Descriptive Resource tags and graph reachability therefore cannot authoritatively decide whether a Resource is scored as work in process.

## Authored contract

Every Objective declares `wipAccounting.unit` and an exact duplicate-free `wipAccounting.resources` list. Each entry binds one project Resource id to a positive `equivalentUnitsPerItem`. The list may be empty. Missing, duplicate, unknown, zero, and negative entries are invalid; the removed `wipResources` shape has no compatibility reader.

The selected Objective is fixed evaluator input. A Blueprint Candidate cannot edit its WIP scope, and Blueprint comparison and locked Benchmarks already require identical Objective hashes. This prevents an optimizer from improving its score by redefining accounting.

Memory-fab uses `dram-device-equivalent`: every wafer-stage lot represents eight units, while known-good die and packaged devices represent one. This keeps conserved material dimensionally stable when Probe expands one wafer lot into eight die. It excludes scheduled package substrates, maintenance and qualification consumables, reusable reticles, scrap disposition, and three delivered DRAM grades.

## Runtime integration

At every deterministic measurement boundary, Core groups inventory by Resource across:

- all resident Device buffers;
- material physically loaded into active production and treatment jobs;
- local loader, belt, and unloader transit;
- station-network cargo in flight.

Each physical item appears in exactly one of those locations. Moving material therefore does not disappear from inventory and is not counted twice. For every observed Resource, the runtime integrates raw item-ticks, records raw peak quantity, and captures raw final quantity. For Objective WIP Resources it simultaneously multiplies each boundary observation by the fixed Objective factor and integrates equivalent-unit WIP. Total and excluded inventory remain raw physical item counts.

For every Resource in that Objective scope, Core simultaneously integrates one stable physical location identity:

- `buffer:<device>:<buffer>:<resource>` for resident Device inventory;
- `in-process:<device>:<process>:<resource>` for material loaded into an active production or treatment job;
- `local-transit:<connection>:<loading|belt|unloading>:<resource>` for explicit sorter and line stages;
- `station-transit:<network>:<route>:<resource>` for loaded station cargo.

The Resource remains an explicit field on every location record; the id is a stable serialization and comparison key, not a parsing API or an item identity. Multiple fungible items at one physical location aggregate into that one location quantity. Once a job loads material, its source Buffer is no longer part of the physical identity; duplicate inputs of one Resource aggregate under the Device and Process that now hold them. Core records locations only for Objective WIP Resources because excluded raw, support, scrap, and finished inventory cannot affect the WIP score and remains completely accounted by Resource.

An active material-processing job retains the exact compiled inputs it removed from buffers. Those quantities remain in total inventory and, when their Resource belongs to `Objective.wipAccounting.resources`, in Objective WIP until the job completes or is cancelled. Completion atomically removes the input-state location and exposes the configured outputs; a paused or unpowered job keeps its material and remains present at the final measurement boundary. Extraction reserves, generator fuel, terminal delivery/discard, maintenance consumables, reusable tooling, and facility utilities retain their separate physical ledgers and do not become production in-process inventory.

The boundary observation is read-only and disposable. Core traverses each resident Buffer and active material job, local transit, and station cargo collection once, groups its exact current contents into one boundary-local Resource projection, and consumes that projection once for total, WIP, area, and peak integration. The same local-transit pass integrates belt occupancy, connection occupancy, sorter-stage activity, and typed blocking causes; the same carrier-mission pass integrates congestion and fleet busy area. Stable Device, Buffer, connection, network, fleet, and Objective-WIP membership is prepared once per simulation, while every quantity, phase, status, and cause is read live from `FactoryState`. There is no cached mutable inventory or metrics shadow ledger.

`FactoryMetrics.inventoryAccounting` contains:

- the named Objective equivalent unit;
- average and peak total raw inventory;
- average and peak raw WIP inventory;
- average and peak WIP equivalent units;
- average excluded raw inventory;
- deterministic per-Resource inclusion, factor, raw average/peak/final, and equivalent average/peak/final quantities;
- deterministic per-location Resource, kind, physical identity, factor, raw average/peak/final, and equivalent average/peak/final quantities.

Raw location averages reconcile to `averageRawWipInventory`; equivalent location averages reconcile to `averageWipEquivalentUnits`. The locations for one Resource reconcile to both of that Resource's projections, and final raw and equivalent location quantities conserve to their Resource totals. Per-location peaks are exact observations but are not additive because different locations can peak at different ticks.

`FactoryMetrics.averageWipEquivalentUnits` is the direct score input. `scoreBreakdown.wip` is exactly `-averageWipEquivalentUnits × Objective.weights.wip`.

This is inventory accounting, not lot-card control. CONWIP still counts released non-terminal tracked lot identities; it neither counts downstream fungible units nor reads the Objective WIP contract. In-process inventory records exact inputs loaded at job start; it does not infer quantity from utilization, duration, nominal output, or a descriptive Process graph. Factors are never inferred from Process yields, topology, price, or Resource tags because alternate routes, variable yield, coproducts, and Objective role make those inferences operating-point dependent.

## Shared evidence

Immutable run `metrics.json` owns the complete machine-readable accounting. `report.md` prints the summary plus Resource and physical-location tables. Compare/Benchmark snapshots preserve the complete baseline/candidate tables and exact per-Resource and per-location deltas.

`inm simulate` human output lists equivalent and raw WIP for scored Resources and their leading physical locations; its bounded JSON summary retains the complete accounting object. `inm inspect` exposes the authored unit/factors even without a run and, when a hash-compatible run exists, projects the same accounting plus a separate Objective tradeoff view through the V12 workbench. That view reconciles the complete score breakdown, ranks Resources and locations by equivalent contribution, and keeps raw item counts beside them. Studio Overview links selectable Buffer and in-process Device locations and local connections directly into the same immutable Factory replay; Factory renders the ranked equivalent and raw values without recomputation. Station-route locations remain exact typed evidence even when the current spatial selection contract has no network-route object focus.

Total inventory remains visible so excluded raw, support, scrap, and finished stock can be diagnosed. It never silently contributes to the WIP score.

The tradeoff projection is not fab-loss attribution. Necessary queue stock, batch companions, protected service inventory, and output awaiting the next physical cadence may all contribute to WIP. Ranking their accounting contribution tells a human or reasoning Agent where to observe; it does not declare the quantity avoidable or authorize an automatic buffer reduction.

Memory-fab Run `097-simulate` is the first `inm-sim/0.90.0` evidence under equivalent-unit accounting. It is physically identical to raw-count Run `096-simulate`: delivery remains `88`, throughput remains `22/min`, raw average WIP remains `27.834429166666666`, and average total raw inventory remains `124.73002083333333`. Correct normalization reports `49.457166666666666` average and `88` peak `dram-device-equivalent`; the WIP contribution changes from the dimensionally invalid `-41.75164375` to `-74.18575`, and final score from `30.88369959166667` to `-1.5504066583333294`. The change is measurement correction, not a factory regression.

Current Design Run `803e348a6c6d…` re-evaluates the three fixed small-batch back-end proposals against the relocked five-case Benchmark. All three remain rejected. The commercial small-batch variant reduces its addressed burn-in input location from `9.781316666666667` to `0.9729166666666667` equivalents but does not improve the complete current-best Objective; the performance and dual variants increase their addressed location. This is current bounded evidence rather than a conclusion inherited from the old metric.

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

Tests must prove strict Objective validation, rejection of the removed shape, resident/in-process/in-flight continuity, paused-job and final-boundary conservation, unit-expanding-stage equivalent conservation with separately changing raw counts, local loader/line/unloader and station-route accounting, raw and equivalent per-Resource/per-location reconciliation, final-location conservation, exclusion of project support/raw/finished Resources, score-component reconciliation, comparison deltas, Workbench/CLI/Studio parity, immutable report projection, and deterministic replay.
