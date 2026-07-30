# WIP equivalent-unit accounting

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/inventory-accounting]], [[docs/design/observation-led-design]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/PROJECT_FORMAT]].

## Outcome

Humans and Agents can compare work in process across Resources with different physical unit sizes using an explicit Objective-owned equivalent-unit contract, while every surface still exposes the underlying raw item counts and exact physical locations.

## Context

Compatible memory-fab Run `096-simulate` reports `27.834` average WIP and a `-41.752` score contribution. The two leading raw locations are `9.781` packaged devices at `burn-in-1.package-input` and `7.966` known-good dies at `packaging-1.die-input`. Run-qualified Factory observation shows one 68.3%-utilized shared burn-in rack and one 60%-utilized packaging cell along the same short work cell; earlier CONWIP, small-batch, changeover, endpoint, and generation interventions already have exact bounded rejection evidence.

The current Objective contract is only `wipResources: ResourceId[]`. Runtime therefore sums heterogeneous item counts directly. In memory-fab, one `qualified-dram-wafer-lot` becomes eight `known-good-dram-die` at Probe. Keeping that physical material upstream scores as one WIP unit; executing the stage scores the same material as eight. A design can therefore appear to improve WIP merely by delaying a unit-expanding transformation, even when material content, service exposure, and factory state do not improve.

The north-star optimization loop cannot accumulate trustworthy conclusions on top of a stage-dependent measurement. WIP scope and equivalence remain Objective-owned because the same Resource may play different commercial roles under different Objectives.

## Scope

### In scope

- Replace the unweighted `wipResources` list with an explicit Objective-owned Resource/equivalent-unit contract; there is no compatibility reader.
- Preserve raw average, peak, and final physical counts per Resource and location.
- Integrate, reconcile, score, compare, and rank weighted WIP equivalent units across buffers, in-process material, local transit, and station transit.
- Project the contract and both raw/equivalent evidence consistently through immutable Runs, Benchmark/Design evidence, CLI, Workbench, Studio, schemas, and reports.
- Author memory-fab wafer-stage Resources as eight device-equivalents per lot and die/package Resources as one.
- Rebuild current locked and immutable evidence under the changed Objective and engine identity.

### Out of scope

- Inferring equivalence from graph topology, Process yields, Resource tags, price, or the selected Blueprint.
- Treating equivalent units as a causal loss or automatically applying a factory change.
- Changing lot-release CONWIP cards, process physics, output yield, delivery contracts, or the commissioned Blueprint.
- Reusing pre-change Objective or Run evidence.

## Acceptance

- [x] The Objective schema requires one unique positive equivalent-unit factor for every scored WIP Resource and rejects the removed `wipResources` shape.
- [x] A unit-expanding Process cannot improve or worsen equivalent WIP merely by moving conserved material across a stage; raw physical counts remain separately inspectable.
- [x] Score breakdown, per-Resource contribution, per-location contribution, Objective Design targets, CLI, and Studio all reconcile to the same equivalent-unit total.
- [x] Memory-fab explicitly scores each wafer-stage lot as eight device-equivalents and each known-good die or packaged device as one.
- [x] Run-qualified observation and the next Design handoff use rebuilt current evidence rather than pre-change memory.
- [x] Core, CLI, Studio, schemas, both example projects, replay, docs, and the full repository suite pass.

## Work

- [x] Add failing contract, conservation, score, Workbench, CLI, and Studio tests for weighted heterogeneous WIP.
- [x] Replace the Objective format and compile-time validation.
- [x] Implement raw-count plus equivalent-unit runtime integration and evaluator reconciliation.
- [x] Update comparison, Design targeting, operation/CLI contracts, Studio presentation, and reports.
- [x] Migrate every Objective and the memory-fab north-star factors.
- [x] Relock Benchmarks, rebuild exact current evidence, observe the changed tradeoff, and audit every acceptance item.

## Findings and decisions

- 2026-07-30 — `inm observe` bound exact authority to Run `096-simulate`, result `be06ff3c330b…`, execution `ba0719035bfa…`, and Objective WIP contribution `-41.752`.
- 2026-07-30 — Factory overview visibly concentrates back-end material between packaging and burn-in. The burn-in inspector reports one 3×3 shared rack, 68.3% utilization, 76.0 seconds idle, two fixed eight-device operations, and three changes / 14.0 seconds. Packaging reports 60.0% utilization, 96.0 seconds input wait, one-die jobs, and 24/min realized flow on each adjacent material connection.
- 2026-07-30 — A read-only priority experiment eliminates selected feeder endpoint power interruption but does not reduce equivalent physical exposure: feeder priority raises raw WIP to `29.202`, completion priority leaves total WIP unchanged, and combined priority only redistributes the two leading buffers. The next step is therefore measurement correctness, not another power-priority Candidate.
- 2026-07-30 — The Objective will own explicit factors. Core must not infer them from nominal Process output because yield, coproducts, alternate routes, and Objective role make that inference operating-point dependent.
- 2026-07-30 — Raw item counts remain evidence. Equivalent units are an additional authoritative accounting projection used for cross-stage aggregation and Objective score, not a replacement for physical inventory.
- 2026-07-30 — The strict replacement contract is `wipAccounting: { unit, resources: [{ resource, equivalentUnitsPerItem }] }`; the removed list has no compatibility reader. Engine identity advanced to `inm-sim/0.90.0`.
- 2026-07-30 — Current immutable Run `097-simulate`, result `9ac909d8e7db…`, preserves the commissioned factory's `88` delivered devices and `22.000/min` throughput while reporting `27.834` average raw WIP items as `49.457` average `dram-device-equivalent`; its WIP contribution is `-74.186`.
- 2026-07-30 — Current Design Run `803e348a6c6d…` re-evaluates the back-end small-batch portfolio under exact equivalent WIP. Its three Candidates do not improve the complete current-best boundary, so the Program remains honestly `continuable` rather than inheriting pre-change evidence.
- 2026-07-30 — The corrected metric changes greenfield search ordering: the guarded seven-Candidate run promotes `setup-campaign:lithography-3-12000` at iteration 7 and retains the facility branch as bounded exhausted evidence. Tests and Studio now expose that current deterministic result.

## Verification

- `bun run test` — `313 pass`, `0 fail`, `3760 expect()` calls; documentation links, TypeScript packages, Core/CLI/Studio, and all eight Ironworks example tests pass.
- `bun run inm validate examples/memory-fab --json` — valid, zero diagnostics.
- `bun run inm validate examples/ironworks --json` — valid, zero diagnostics.
- Current-engine immutable Run replay is covered by the repository artifact suite; Run `097-simulate` and Run `021-simulate` reproduce their recorded result hashes.
- Studio restarted source-current on managed port `4176`. Browser audit of `/memory-fab/factory?run=097-simulate` and the `packaging-1` focus route confirmed the current Run, score, equivalent/raw summary, per-Resource factors, physical exposure locations, and device inspector render without an error surface.

## Progress log

- 2026-07-30 — Plan created from typed Run `096-simulate` observation, direct Factory/device inspection, and a bounded read-only feeder-priority experiment.
- 2026-07-30 — Replaced the Objective contract, implemented dual raw/equivalent integration and reconciliation, migrated every projection and example Objective, and relocked Benchmarks.
- 2026-07-30 — Rebuilt current immutable Run and Design evidence, regenerated reports, completed the Studio visual audit, and passed full verification.

## Completion

Completed 2026-07-30. The new Objective contract, runtime accounting, human/Agent projections, memory-fab evidence, visual audit, and full verification agree on one explicit device-equivalent WIP boundary while preserving raw physical inventory.
