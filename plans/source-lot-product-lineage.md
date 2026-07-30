# Source-lot product lineage

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/source-lot-product-lineage]], [[docs/design/lot-derived-output]], [[docs/design/lot-tracking]], [[docs/design/inventory-accounting]], [[docs/design/simulation-runtime]], and [[docs/design/industrial-investigations]].

## Outcome

Let a human or reasoning Agent trace every explicitly lineage-bearing product from its terminating wafer lot through downstream processing, transport, resident and in-process WIP, and delivery, so a fixed-horizon memory-fab tail identifies the exact source lot ancestry and physical blocker before anyone authors a factory intervention.

## Context

Run `102-simulate` completes all twelve tracked wafer lots and realizes all `96` nominal known-good dies, yet ends with `8` packaged devices resident at `burn-in-1.package-input`. The Factory replay correctly shows burn-in as the bottleneck and the leading Objective-equivalent WIP location, but `burn-in-1.lotIds.package-input` is empty because tracked-lot identity intentionally terminates at Probe and the fungible die output carries no separate ancestry.

That boundary makes the current Investigation unable to distinguish the final product batch by source wafer lot, follow it through packaging, or state whether the tail is a specific late lot, a commingled batch, or anonymous inventory. Adding burn-in capacity before restoring this identity would turn an observable accounting exposure into an invented causal claim.

## Scope

### In scope

- Add an explicit Resource contract for fungible material that must retain source-lot lineage after a lot-terminating output conversion.
- Retain deterministic, conserved source-lot ancestry through Device buffers, active jobs, local and station transit, downstream production, and terminal consumption without turning fungible product into Route-tracked WIP.
- Fail compilation or runtime invariants when lineage-bearing quantity lacks ancestry, duplicates quantity, or crosses an unsupported source.
- Add evaluator-owned per-lot creation, delivery, commingling, and final physical-location evidence to immutable Runs.
- Expose the same lineage evidence through reports, CLI inspection/observation, Studio Factory inspection, and Investigation anchors.
- Regenerate current memory-fab evidence and use the exact terminal lineage to author the next bounded back-end hypothesis.

### Out of scope

- Serial-number identity for every individual die or packaged device.
- Inferring source lots for Resources that do not explicitly opt into lineage.
- Treating ancestry as a Route, due-date, CONWIP, quality-disposition, or automatic optimization authority.
- Guessing how a commingled Process partitions individual outputs; a mixed job retains the complete sorted source-lot set.
- Commissioning a back-end factory change before lineage evidence identifies a falsifiable intervention.

## Acceptance

- [x] A lineage-bearing Resource can enter runtime only from an exact terminating lot output or a downstream Process that consumed exact lineage-bearing input.
- [x] Source-lot ancestry remains quantity-conserved across resident buffers, active jobs, local/station transport, downstream transformation, failure, and delivery.
- [x] Immutable metrics and reports identify created, delivered, commingled, and final-WIP quantities by exact source-lot set and physical location.
- [x] CLI and Studio project the same Run-qualified lineage, and Studio makes the final burn-in input batch inspectable without reconstructing NDJSON.
- [x] The current memory-fab Investigation records which exact source lot set owns the eight-device tail and forms its next hypothesis from that evidence.
- [x] Targeted conservation/replay tests, both public project fixtures, `bun run check:fast`, full `bun run test`, and browser verification pass.

## Work

- [x] Audit Run `102-simulate`, Probe termination, final Factory replay, and the existing identity discontinuity.
- [x] Define strict Resource, state, transit, active-job, event, and evaluator lineage contracts.
- [x] Implement conserved runtime lineage and fail-closed compilation.
- [x] Project immutable lineage through report, CLI, Workbench, Studio, and Investigation evidence.
- [x] Regenerate memory-fab current evidence and carry the exact tail into the next authored hypothesis.
- [x] Complete acceptance audit, full verification, plan archive, commit, and push.

## Findings and decisions

- 2026-07-31 — Run `102-simulate` does not contain an unfinished tracked wafer lot: all `12/12` lots complete Probe, including `dram-lot-12` at tick `119856`. The unfinished industrial object is eight anonymous `packaged-dram-device` at `burn-in-1.package-input` at tick `240000`.
- 2026-07-31 — Studio shows burn-in idle at the final boundary, requires batches of eight, and ranks its package input as the leading Objective-WIP location, but it cannot name the resident batch ancestry. This is an evidence-model gap before it is a capacity decision.
- 2026-07-31 — Lineage will be an explicit Resource contract and conservative causal ancestry, not full serial tracking. When a downstream job consumes several source lots, every output records the complete commingled source set instead of fabricating a one-to-one partition.
- 2026-07-31 — Run `105-simulate` proves the tail is the complete source set `[dram-lot-08]`. Lot 08 completes Probe last at tick `163879`; its eighth package reaches burn-in at tick `205173`; the incumbent remains occupied until tick `235623`, leaving `4377` ticks against the shortest `7500`-tick screen. Later-authored lot 12 was already delivered, so plan order is not product-tail identity.
- 2026-07-31 — The old `back-end-wip-next-step` chain correctly degrades because its Run `102 → 103` and `102 → 104` comparison anchors cannot reproduce the new execution identity. No compatibility layer or false reinterpretation was added. New Investigation `source-lot-back-end-service` begins at exact Run `105-simulate`, retaining the old files as history without inheriting invalid evidence.
- 2026-07-31 — Hypothesis `parallel-burn-in-overflow` tests a second explicitly costed full-batch service path. It holds Production Plan, global cadence, batch sizes, incumbent dispatch, and customer contracts fixed, and requires recovered lot-08 delivery to be judged beside cost, area, energy, utilization, service, quality, and interruption evidence.

## Verification

- `bun run docs:check` — pass, `1329` links.
- `bun run typecheck` — pass.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "source-lot product lineage"` — pass.
- `bun run inm validate examples/memory-fab --json` — pass with zero diagnostics.
- `bun run inm observe examples/memory-fab --run 105-simulate --json` — exact Run-qualified source-lot lineage present.
- `bun run check:fast` — pass.
- `bun run inm test examples/ironworks --json` — `8/8` fixtures pass.
- `bun run inm test examples/memory-fab --json` — `2/2` fixtures pass.
- `bun run test` — `346` repository tests and `3782` assertions pass; the included Ironworks fixture reports `8/8`.
- Browser verification at `/memory-fab/factory/devices/burn-in-1?run=105-simulate` — global `12` source lots, `88 / 8` delivered/final WIP, `0` commingled jobs; selected Device shows `8× packaged-dram-device`, `package-input`, source `dram-lot-08`.
- `git diff --check` — pass.

## Progress log

- 2026-07-31 — Plan created and indexed after exact CLI, immutable Run, final-state, event-stream, and Studio Factory observation.
- 2026-07-31 — Strict lineage contracts implemented across compile, state, runtime, evaluator, artifacts, CLI, Workbench, Observation, and Studio; current memory-fab evidence regenerated as Run `105-simulate`.
- 2026-07-31 — Created current Investigation `source-lot-back-end-service`, appended exact lot-08 observation, and formed the bounded parallel-service hypothesis without commissioning it.
- 2026-07-31 — Regenerated both projects' Benchmark locks, checked in current-engine memory-fab Run `105-simulate` and Ironworks Run `023-simulate`, migrated current-evidence fixtures, and completed full verification.

## Completion

Completed on 2026-07-31. Source-lot ancestry is now a strict opt-in product contract with conserved physical state, immutable evaluator evidence, CLI/Observation/Workbench/Studio parity, current replay artifacts, and a source-qualified next industrial hypothesis. No factory change was commissioned.
