# Inspection supply-path convergence

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]]

## Outcome

Reduce the commissioned memory fab's exact `inspection-1` patterned-wafer input shortage through a bounded, physically qualified main-line or return-flow intervention, or close the explored frontier with exact physical and five-case blockers. Commission only an improvement that remains safe across all five locked cases and is equally inspectable by humans and Agents.

## Context

Current Run `088-simulate` ranks `inspection-1` first with `59.584 s` of productive opportunity waiting for one `dram-wafer-lot@wafer-input` required by `inspect-final-pattern-deep`. The Resource can arrive from the ordinary `etch-l2 → etch-to-inspection` path or from the conditional `rework-1 → rework-to-inspection` return path.

The immediate main-line partition is exact:

- `41.240 s` while `etch-l2` is processing;
- `9.344 s` while `etch-l2` waits for its own patterned input;
- `9.000 s` while the etched wafer is in flight to inspection.

These states sum to the full `59.584 s`. The rework path is an alternative return source only after inspection rejects a lot; its ordinary `source-waiting-input` state must not be interpreted as a second production line that should continuously feed inspection. Only `1.021 s` of rework processing and `5.067 s` of rework return transit overlap the measured shortage, so return-flow changes remain a bounded secondary intervention.

## Scope

### In scope

- Add a project-local TypeScript research entry point for the strict current Blueprint and locked Benchmark.
- Evaluate physically explicit closed-loop etch cycle/power envelopes, downstream-deficit recovery thresholds, immediate main-line transport, rework return transport, and bounded combinations.
- Preserve latent-electrical defect prevention in every candidate that changes the commissioned layer-two etch operating mode.
- Report exact `inspection-1` shortage and the main-path `source-processing` / `source-waiting-input` / `transport-in-flight` partition for every candidate.
- Report rework-path state overlap separately so conditional return flow cannot be mistaken for ordinary supply capacity.
- Commission only through Design, Candidate preview, and apply; regenerate current Run evidence only after review.

### Out of scope

- Treating an idle or input-starved rework cell as missing continuous production.
- Adding inspection capacity to solve an inspection input shortage.
- Hiding transport distance, process power, quality prevention, maintenance, capital, or area behind a score-only multiplier.
- Weakening current-best zero-regression or any absolute industrial outcome.
- Supporting superseded Blueprint or research contracts.

## Acceptance

- [x] The TypeScript research command runs deterministically against the current commissioned Blueprint.
- [x] Every intervention conserves its exact inspection shortage across the three main-path states and reports return-flow overlap separately from the `59.584 s` reference.
- [x] Every faster etch candidate preserves the commissioned `latent-electrical` prevention contract and exposes duration/power cost.
- [x] The promotion gate requires exact inspection-shortage reduction, aggregate improvement, every current-best case, every hard outcome, and capacity readiness; no explored candidate passes it.
- [x] Machine-readable research exposes one shared addressed loss, exact technology/control change, five-case evidence, delivery trace, and rejection decision; no ineligible Candidate or Design evidence is manufactured.
- [x] Full tests, refreshed operating evidence, CLI inspection, and browser verification pass under the corrected engine contract.

## Work

- [x] Partition current inspection shortage by the ordinary etch path and conditional rework-return context.
- [x] Implement the bounded TypeScript intervention grid and deterministic evidence output.
- [x] Evaluate the five-case frontier and identify a causal zero-regression leader or exact blockers.
- [x] Integrate an eligible intervention into the project Design provider, or explicitly skip Design/Candidate creation when no intervention clears the gate.
- [x] Refresh authority, verify all public surfaces, and complete the acceptance audit.

## Findings and decisions

- 2026-07-25 — The ordinary supply path alone partitions all `59.584 s`: `41.240 s` source processing + `9.344 s` source waiting + `9.000 s` transport in flight.
- 2026-07-25 — The return path is conditional on rejected lots. Its overlapping `1.021 s` processing and `5.067 s` transit are reported as context and bounded secondary opportunity, not additive missing supply.
- 2026-07-25 — A useful etch intervention must preserve `closed-loop-control`'s latent-electrical prevention while changing measured cycle time or a downstream-deficit controller.
- 2026-07-25 — Cadence control is intentionally exclusive with `recipeDispatch`; the research patch removes the redundant authored-order field and retains independent lot dispatch. EDD and highest-priority lot selection are byte-for-outcome neutral because only one eligible lot is resident at each contested layer-two etch start.
- 2026-07-25 — The main and rework inspection Connections share physical cell `cleanroom:18,19`. One shared cell cannot use mixed line assets, so a legal faster lane must upgrade both paths. The smallest explicit dual vacuum handoff adds `400` build cost to a factory with only `50` headroom and fails the locked `230000` cap even though it cuts inspection shortage by `1.750 s`.
- 2026-07-25 — The first research pass against historical Run `087-simulate` exposed a Core scheduling defect rather than a Blueprint defect. Faster etch moved a long final-test batch to `221.223 s`; it finished at `239.973 s`, but the existing `contract-value` horizon ignored its customer-lane travel and lost all eight outputs after the Scenario boundary. `packages/inm-core/src/simulator.ts` now values each contracted coproduct only when productive work plus its direct compiled loader/line/unloader travel can reach a consuming Device in time, and suppresses zero-window fallback work.
- 2026-07-25 — With the corrected contract window, the incumbent and every feasible etch mode deliver the same `88` products and `344` net value. The exact product-loss regression disappears rather than being hidden by a compensating Blueprint patch.
- 2026-07-25 — Always-on `3/4` closed-loop etch is the strongest local shortage repair (`-2.500 s`) but loses `0.490607` aggregate score and has a `-0.824300` limiting-case regression. The milder zero-threshold `4/5` mode repairs `2.000 s` but still regresses all five current-best cases; its mixed-quality score loses `0.264202`, chiefly from extra WIP. The `2 s` threshold reduces shortage by `0.667 s` but still has a `-0.232447` limiting-case regression.
- 2026-07-25 — Slower activation thresholds and more aggressive modes can improve aggregate score (`+0.020026` to `+0.142728`) but increase the addressed inspection shortage by `0.333–0.999 s` and regress at least one locked case. No candidate simultaneously reduces the addressed loss, improves aggregate score, and preserves every current-best case.
- 2026-07-25 — No Design or Candidate is created. This is an intentional negative frontier, not an incomplete promotion.

## Verification

- `bun run memory-fab:research-inspection-starvation` — 24 deterministic interventions evaluated against Run `088-simulate`; zero candidates cleared the loss, aggregate, zero-regression, hard-outcome, and capital gate.
- `bun run inm simulate examples/memory-fab` — wrote current `inm-sim/0.86.0` Run `088-simulate`, result hash `2a75b425780c16ccb677f8a83498bbeff10b702ff16f5f44ad08c83e72933e17`, with 88 delivered products and portfolio net value `344`.
- `bun run inm inspect examples/memory-fab --section losses --json` — selected current Run `088-simulate` and reproduced `inspection-1`'s exact `59.584 s` partition.
- `bun run inm test examples/memory-fab` — both project-local industrial tests pass.
- `bun run test` — documentation and every TypeScript package pass; 238 package tests / 2,007 assertions pass, followed by all eight Ironworks project tests.
- Browser verification at `http://localhost:4176/`, `/memory-fab`, and `/memory-fab/factory` — project selection, current `088-simulate` authority, Factory scene, delivery portfolio, and route-backed navigation render successfully after the Studio restart.

## Progress log

- 2026-07-25 — Plan created from Run `087-simulate` V7 causal input-state evidence; current `inm-sim/0.86.0` Run `088-simulate` reproduces the exact inspection partition under corrected contract-window scheduling.
- 2026-07-25 — Added `memory-fab:research-inspection-starvation`, a strict TypeScript grid covering qualified etch recovery/always modes, local lot dispatch, the physically legal dual-lane transport upgrade, and exact product/contract timing.
- 2026-07-25 — Corrected contract-window scheduling to include direct physical delivery travel and locked the no-ghost-tail invariant in the DRAM runtime regression.
- 2026-07-25 — Re-ran the complete five-case frontier after the Core correction; no intervention is promotion-safe.
- 2026-07-25 — Refreshed compatible memory-fab and Ironworks Runs, passed the complete repository suite, and verified the restarted Studio in-browser.

## Completion

The inspection supply-path frontier is closed for the present commissioned Blueprint. Core contract-value dispatch now respects direct customer-lane travel and refuses zero-value tail work; current Run `088-simulate` is authoritative; all explored physical etch, dispatch, and transport interventions are either score-regressive, case-regressive, loss-regressive, or over the locked capital bound. No Design or Candidate was manufactured from an ineligible result.
