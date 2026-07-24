# Make WIP accounting objective-owned and inspectable

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/inventory-accounting]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-comparison]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Humans and Coding Agents optimize the same explicitly scoped industrial WIP instead of a hidden total-inventory proxy: every Objective names its WIP Resources, simulation integrates those Resources by location, and CLI, immutable reports, comparisons, and Studio explain the score with per-Resource evidence.

## Context

Compatible memory-fab Run `071-simulate` reports a `-175.409525` WIP score component. The runtime currently sums every resident and in-flight item, so scheduled package substrates, maintenance consumables, reusable reticles, scrap, and finished DRAM temporarily waiting at a customer boundary all share one “WIP” number with wafer lots and unfinished packages. That is not a stable industrial metric and it gives both human operators and proposal Agents a misleading dominant score driver.

Memory-fab Resource tags already distinguish wafer/die/package WIP from raw/support/finished material, but tags are descriptive and a Resource may be a final product for one Objective and an intermediate for another. The scoring scope therefore belongs to the selected Objective and must be explicit rather than inferred.

## Scope

### In scope

- Require each Objective to declare an exact, duplicate-free `wipResources` list.
- Integrate resident and in-flight inventory by Resource and score only the declared subset.
- Preserve total inventory as non-scoring context and expose included/excluded per-Resource averages and peaks.
- Project the same accounting through JSON, immutable reports, Blueprint comparisons, CLI human output, Studio, and project workbench orientation.
- Update all example Objectives, relock affected benchmarks, regenerate compatible fixtures/runs, and audit the commissioned memory fab against its locked cases.

### Out of scope

- Financial inventory valuation, raw-material carrying cost, finished-goods holding cost, FIFO/LIFO costing, or ERP accounting.
- Inferring WIP from tags, topology, target reachability, or project ids.
- Changing CONWIP lot-card semantics; active tracked lots remain a separate control signal.
- Quality prevention or additional process-control equipment; the newly trustworthy score will guide that later intervention.

## Acceptance

- [x] Validation rejects missing, duplicate, or unknown Objective WIP Resources, and the public Objective schema exposes the strict contract.
- [x] The memory-fab WIP score includes wafer-lot, known-good-die, and packaged-device flow but excludes package substrate stock, maintenance/tooling inventory, scrap, and delivered products.
- [x] Immutable JSON/report, compare/benchmark evidence, CLI, workbench, and Studio expose matching average/peak per-Resource accounting without changing simulated material movement.
- [x] All locked cases are deliberately relocked, the commissioned Blueprint remains inside every industrial guardrail, and environment-free Ironworks fixtures still pass.
- [x] Type checking, documentation checks, focused tests, browser verification, and the complete regression tranche pass.

## Work

- [x] Audit Run `071-simulate` and identify the total-inventory/WIP semantic mismatch.
- [x] Choose Objective-owned exact Resource scope over tag or topology inference.
- [x] Implement schema, compiler, simulator statistics, metrics, report, comparison, workbench, CLI, and Studio projection.
- [x] Update project Objectives, design documentation, tests, locked evidence, and compatible Run.
- [x] Perform the acceptance audit and complete the plan.

## Findings and decisions

- 2026-07-24 — `wipResources` is Objective-owned because `hydrogen` is an Ironworks intermediate under one production graph but the final delivered Resource under the hydrogen Objective.
- 2026-07-24 — Total inventory remains visible but never silently contributes to the WIP score. This keeps raw/support stock diagnosable without calling it work in process.
- 2026-07-24 — Resource quantities are integrated across resident buffers, local transport, and station transport so moving WIP neither disappears nor double-counts.

## Verification

- Public schema/compiler tests reject missing, duplicate, and unknown WIP Resources; inventory integration tests prove included Resource averages sum exactly to scored WIP.
- Current memory-fab run `073-simulate` records `18.335617` average WIP, `116.939683` total inventory, `98.604067` excluded inventory, and unchanged 88-device product delivery.
- All 13 Benchmark contracts were deliberately relocked; every Ironworks case kept its expected direction, and all eight memory-fab evaluations retained their KEEP/DISCARD decisions with the greenfield contract passing all seven outcome guardrails.
- Browser verification shows the same compatible-run inventory totals and contributors in Overview and Factory as `inm inspect` / `inm simulate`.
- `docs:check`, type checking, 218 unaffected full-suite tests, and the three relocked exact-causality tests pass; together they cover all 221 repository tests and 1,801 assertions in the final tree.

## Progress log

- 2026-07-24 — Plan activated after the commissioned memory-fab score exposed unscoped inventory as its numerically dominant “WIP” component.
- 2026-07-24 — Shipped the Objective contract, per-Resource integration, all human/Agent projections, relocked evidence, compatible run, and browser/full-regression audit.

## Completion

Every Objective now owns an exact WIP Resource list. Simulation separately integrates scoped WIP, total inventory, excluded inventory, and per-Resource peaks across resident and in-flight material; only scoped WIP contributes to score. Immutable artifacts, comparison, Benchmark/Design evidence, CLI, Workbench V4, and Studio expose the same accounting. Current memory-fab evidence preserves all physical outcomes while replacing the misleading `-175.409525` total-inventory penalty with an explainable wafer/die/package WIP component.
