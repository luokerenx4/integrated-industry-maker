# In-process WIP conservation

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/inventory-accounting]], [[docs/design/observation-led-design]], [[docs/design/design-programs]], [[docs/design/simulation-runtime]]

## Outcome

Keep material physically loaded into an active production job inside total inventory and Objective-scored WIP, with one exact in-process location that humans, Agents, Design Programs, CLI, and Studio can inspect and target.

## Context

Compatible memory-fab Run `092-simulate` reports `19.872825` average scored WIP, led by `9.781316666666667` packaged devices in `burn-in-1.package-input` and `7.965816666666667` known-good dies in `packaging-1.die-input`. Run-qualified Factory observation shows that this is not a simple capacity shortage: `packaging-1` runs at 60% utilization while waiting 96 seconds for two 24 items/min input lanes, and `burn-in-1` is the reported bottleneck while running at 68.3% utilization, idling 76 seconds, forming fixed eight-device batches, and sharing two product programs across three changeovers.

The same observation exposed a more fundamental accounting gap. Process inputs leave Device buffers when a job starts but outputs do not enter a buffer until it finishes. During that interval the material is absent from both total inventory and Objective WIP. For the current burn-in rack alone, roughly `8 × 68.3% = 5.47` packaged devices are loaded on average but missing from the reported WIP. A slower or longer batch can therefore appear to reduce WIP merely by holding more material inside an active job.

The falsifiable hypothesis is that conserving exact active-job inputs will raise current memory-fab WIP by the amount physically loaded in production, expose `burn-in-1` and `packaging-1` in-process locations, and prevent buffer-to-process transfers from masquerading as Objective improvement without changing throughput, delivery, quality, timing, or physical execution.

## Scope

### In scope

- Retain the exact input quantities loaded by each active material-processing job.
- Include those inputs in deterministic total inventory, Objective WIP, Resource accounting, physical-location accounting, peaks, and final boundary state.
- Add a stable `in-process` inventory-location identity qualified by Device, Process, and Resource.
- Preserve that location through comparison, immutable run evidence, Objective-focused Design targets, CLI, Workbench, observation, and Studio projections.
- Advance the engine contract, relock memory-fab Benchmarks, create current compatible operating evidence, and rebuild the affected Objective-focused Design authority.

### Out of scope

- Changing Process duration, batch size, transport speed, dispatch, release control, or factory layout.
- Treating loaded fuel, completed delivery consumption, maintenance consumables, or scrapped material as production WIP.
- Choosing the eventual back-end cadence intervention before conserved evidence exists.

## Acceptance

- [x] Active production inputs remain present in total inventory and Objective WIP until job completion or cancellation, with exact Resource conservation and no double count.
- [x] Every loaded Objective Resource appears at `in-process:<device>:<process>:<resource>` and average, peak, and final location totals reconcile with Resource and WIP totals.
- [x] Objective-focused Design can address an exact in-process location and its causal replay uses the same value exposed by CLI and Studio.
- [x] The regenerated memory-fab run changes inventory/WIP evidence but preserves the same physical production, delivery, timing, quality, and equipment behavior.
- [x] Current CLI observation and Studio Factory views expose the regenerated in-process memory-fab evidence without console or route errors.
- [x] Full tests, type checking, documentation links, memory-fab project tests, and ironworks regression tests pass.

## Work

- [x] Extend active-job state and inventory-location types with exact production inputs and in-process identity.
- [x] Integrate live and final-boundary accounting with strict conservation tests.
- [x] Update shared formatting/projection, public design documentation, and targeted CLI/Studio tests.
- [x] Advance engine evidence, relock Benchmarks, regenerate the current memory-fab run and Objective Design authority, then observe both shared surfaces.
- [x] Complete the final verification and evidence audit.

## Findings and decisions

- 2026-07-29 — Run `092-simulate` and its run-qualified Factory views were observed before intervention. `packaging-1` is cadence-limited rather than capacity-limited; `burn-in-1` combines fixed batch formation, product-mix sharing, and setup work. No equipment or policy change is justified until active material is conserved.
- 2026-07-29 — In-process identity is Device + Process + Resource. Buffer identity is intentionally omitted after loading because the material is physically inside the work center, while duplicate inputs of one Resource into one job should aggregate at that physical location.
- 2026-07-29 — Only material-processing inputs belong to this accounting. Fuel burn, terminal consumption, maintenance service inputs, tooling reservations, and utilities retain their existing explicit ledgers and semantics.
- 2026-07-29 — Current Run `093-simulate` preserves 88 delivered devices and `22/min` throughput while average total inventory changes `116.16841666666667 → 124.73002083333333`, Objective WIP changes `19.872825 → 27.834429166666666`, and final score changes `42.826105841666674 → 30.88369959166667`. The difference is exact newly conserved process inventory, not changed production behavior.
- 2026-07-29 — Exact back-end in-process evidence is `3.75` average packaged devices in `burn-in-1.screen-performance-mix`, `1.25` in `burn-in-1.screen-commercial-dram`, and `0.6` known-good die in `packaging-1.package-known-good-dram`. Objective-focused Design replay reads the same `0.6` location value before and after an intervention that does not alter packaging active time, correctly recording no fabricated causal improvement.
- 2026-07-29 — Direct Studio verification exposed two presentation defects introduced by the new identity: in-process rows rendered as `UNDEFINED.UNDEFINED` and collided on one React key. Both now use the exact Process id. A later reload produced no new browser error logs.
- 2026-07-29 — An already-running Studio had to be restarted before it discovered newly generated ignored Run `093-simulate`. That experience gap is deliberately separated into [[plans/live-project-evidence-refresh]] rather than hidden inside inventory semantics.

## Verification

- `bun run test` — 304 tests passed, including TypeScript type checking, 1,119 documentation links, all shared Core/CLI/Studio suites, and the complete Ironworks project regression.
- `bun run inm test examples/memory-fab` — both self-contained memory-fab project tests passed.
- `bun run inm observe examples/memory-fab --json` — compatible evidence is Run `093-simulate`, result `271291ee264f0685996949362662418854d09642eb0c3479f849cde41ab5f3d1`, score `30.88369959166667`, WIP contribution `-41.75164375`, with exact burn-in and packaging Device views.
- `bun run inm studio status examples/memory-fab --json` — managed Studio is running on `4176`, source state `current`, engine `inm-sim/0.88.0`.
- In-app Factory verification at `/memory-fab/factory?run=093-simulate` — route loaded Run `093-simulate`; rendered `27.83 / 124.73`, `BURN-IN-1.SCREEN-PERFORMANCE-MIX`, `BURN-IN-1.SCREEN-COMMERCIAL-DRAM`, and `PACKAGING-1.PACKAGE-KNOWN-GOOD-DRAM`; the final reload added no error-level browser log.

## Progress log

- 2026-07-29 — Plan created from structured `inm observe` evidence and direct run-qualified observation of `burn-in-1` and `packaging-1`.
- 2026-07-29 — Active production and treatment jobs now retain exact material inputs; live and final inventory accounting integrate them under strict in-process identities.
- 2026-07-29 — Engine advanced to `inm-sim/0.88.0`; memory-fab and Ironworks Benchmarks were relocked; current Run and Design authorities were rebuilt.
- 2026-07-29 — CLI, Workbench, Design replay, immutable artifacts, Studio Factory presentation, public documentation, and full regression verification were aligned to the conserved contract.

## Completion

Completed on 2026-07-29. Material loaded into active factory work is now conserved, scored, inspectable, and targetable across every human and Agent surface without changing physical factory execution.
