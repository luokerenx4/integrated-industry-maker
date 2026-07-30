# Parallel Burn-in overflow trial

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/source-lot-product-lineage]], [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/blueprint-comparison]], and [[docs/design/development-operations]].

## Outcome

Carry the exact Run `105-simulate` source-lot tail through one explicitly costed, physically connected parallel Burn-in Candidate, locked review, immutable operating Run, quantitative and visual comparison, and explicit human/Agent disposition without changing planned memory supply or treating score as design authority.

## Context

Run `105-simulate` creates product from all twelve planned wafer lots, delivers 88 devices, and leaves exactly eight `packaged-dram-device` units from source set `[dram-lot-08]` at `burn-in-1.package-input`. The final complete batch reaches Burn-in at tick `205173`, while the incumbent remains occupied through tick `235623`; only `4377` ticks remain, below the shortest `7500`-tick screening cycle.

Investigation `source-lot-back-end-service` records that observation and hypothesis `parallel-burn-in-overflow`. The hypothesis fixes the Production Plan, release cadence, Process batch sizes, incumbent dispatch, and customer contracts. It asks whether one parallel qualified rack can recover the tail and requires explicit cost, area, energy, utilization, service, quality, and interruption evidence. It does not imply KEEP.

## Scope

### In scope

- Author one Investigation-sourced Candidate against `generated-dram-fab` and locked Benchmark `greenfield-dram-design`.
- Add exactly one qualified Burn-in rack plus the minimum real sorter/belt connections required for package input and all three product outputs.
- Preserve the twelve-lot Production Plan, release control, recipe batch sizes/modes, existing rack policy, customer contracts, quality physics, and Scenario set.
- Review the Candidate, persist one exact proposed Blueprint Run with the control seed, compare it to Run `105-simulate`, inspect the changed Factory spatially, and append the review/comparison/decision to the Investigation.
- Close the missing public boundary for that step: a reviewed Candidate must be runnable as an immutable, source-selection-pinned `TRIAL` without applying or materializing it as the editable Blueprint.

### Out of scope

- Automatic search, RL, changing release cadence, deleting planned lots, shrinking Burn-in batches, altering Objective weights/constraints, or applying a Candidate merely because its score is higher.
- Hiding infrastructure cost in a free asset, anonymous initial inventory, unconnected equipment, or a second Scenario/Objective.
- General parallel-equipment synthesis or a reusable layout optimizer.

## Acceptance

- [x] The Candidate is sourced from hypothesis `parallel-burn-in-overflow`, its patch replays from the current Benchmark base, and the proposed Blueprint compiles with one additional rack and physically complete material paths.
- [x] Locked review reports delivery, planned/released/completed/on-time lots, quality/service guards, source-lot terminal WIP, equipment/logistics cost, area, energy, utilization, and every case regression without auto-applying the change.
- [x] A new immutable Run uses the unchanged twelve-lot Production Plan, Scenario, Objective, and seed; exact comparison to Run `105-simulate` proves the sole Blueprint intervention.
- [x] Studio observation shows the added rack and its input/output paths under the proposed immutable Run with no browser errors.
- [x] The Investigation retains the Candidate review, Run comparison, and an explicit `keep`, `revise`, `defer`, or `discard` decision; the editable Blueprint changes only after a separately justified KEEP and guarded apply.
- [x] Project validation, memory-fab fixtures, targeted tests, and the full repository checkpoint pass before commit and push.

## Work

- [x] Reopen exact Run `105-simulate`, source-lot evidence, Investigation handoff, and relevant design contracts.
- [x] Design the smallest spatially valid one-rack topology and author the RFC 6902 patch.
- [x] Create and inspect the Investigation-sourced Candidate without applying it.
- [x] Run locked review and audit physical/economic/service evidence.
- [x] Add a first-class reviewed-Candidate `TRIAL` Run boundary shared by Core, CLI, Run identity, and Studio.
- [x] Persist the proposed immutable Run, compare it to `105-simulate`, and inspect both spatial views.
- [x] Append exact evidence and disposition to the Investigation.
- [x] Complete verification, archive this plan, commit, and push.

## Findings and decisions

- 2026-07-31 — The control rack is a `3×3`, `14,000`-cost Device with `35 W` idle / `240 W` active draw, three product outputs, and the same two `agile-screening-5-8` full-batch recipes. The trial must include its real transport endpoints rather than cloning only the processor.
- 2026-07-31 — Blueprint ports are runtime-buffer boundaries and the compiler permits several distinct physical connections to the same Resource port. The first candidate will test a minimally invasive parallel branch before introducing junction infrastructure not demanded by the hypothesis.
- 2026-07-31 — The compiled minimum honest topology is one adjacent rotated rack at `(10,23)`, one explicit `2×2` powered round-robin input junction at `(6,25)`, ten new sorter endpoints, and five new/rewritten physical lanes. The three output branches terminate at the existing customer Devices, so the Candidate does not add delivery sinks or customer buffer capacity. Its non-endpoint equipment delta is `14,600` build cost and `13` occupied cells before belts and sorters.
- 2026-07-31 — Candidate `parallel-burn-in-overflow` contains the exact deterministic 19-operation topology patch, is pinned to hypothesis entry hash `5426374add7c`, current Blueprint hash `16ca367007ed`, and locked Benchmark `greenfield-dram-design`; it remains unapplied.
- 2026-07-31 — Locked review `5b43f0820696` is `DISCARD`. Total build cost rises from `229,840` to `245,310` (`+15,470`, `15,310` over the Objective maximum) and occupied area from `259` to `319`. More importantly, the generated round-robin input junction fragments full batches: steady target production falls from `88` to `64`, while lithography/facility interruption contract fulfillment falls to `0.80`/`0.96` against the `1.12` guard. This is not yet the intended overflow dispatch and must not be applied.
- 2026-07-31 — The public workflow has no way to freeze a reviewed but unapplied Candidate under the exact Investigation operating selection. Applying a `DISCARD` is correctly forbidden, while hand-materializing a second editable Blueprint would lose Candidate/review identity. The trial therefore adds a reviewed-Candidate simulation boundary whose Run freezes the patch, hypothesis, proposal hash, review result hash/verdict, source Run parent, and proposed Blueprint without mutating project selection.
- 2026-07-31 — `inm candidate --run` now creates or reuses an immutable `TRIAL` only after a current review. Run `106-candidate-trial-parallel-burn-in-overflow` pins proposal `5b43f0820696`, review result `66d35a80d2b1`/`DISCARD`, parent `105-simulate`, unchanged production-window selection and seed `42`, proposed Blueprint `178dac4be6ad`, and result `9d2680cc170c`; a second invocation reuses the same Run with an empty write set.
- 2026-07-31 — Exact Run comparison reports delivery `88 → 64`, final WIP equivalent `+10.339367`, build cost `+15,470`, occupied area `+60`, unchanged `12/12/12` scheduled/released/completed and on-time lots, zero scrap/escapes, and score `-1,000,040.286963`. Source-lot evidence shows eight four-device half-batches stranded at the overflow rack and four commingled Burn-in jobs.
- 2026-07-31 — Studio loaded the `TRIAL` Run directly, rendered the added rack, powered input junction, sorter/belt topology, `32` exact final source-lot WIP units, `4` commingled jobs, `245,310` build cost, and `319` occupied cells. The focused rack inspector showed its two unchanged eight-device recipes, real four-port connections, `14,000` rack cost, and all eight four-device tails; browser warning/error log was empty.
- 2026-07-31 — Investigation entries `parallel-burn-in-overflow-trial` and `parallel-burn-in-overflow-revise` retain comparison hash `db2ebd3f3994`, exact Candidate review anchor, and an authored `revise` disposition. The editable `generated-dram-fab` remains at base hash `16ca367007ed`.

## Verification

- `bun run check:fast` — passed: documentation links, TypeScript, and 41-test short suite.
- `bun run inm validate examples/memory-fab --json` — passed for current `generated-dram-fab` hash `16ca367007ed`.
- `bun run inm test examples/memory-fab --json` — passed both deterministic memory-fab fixtures.
- `bun test packages/inm-core/src/workbench.test.ts --test-name-pattern 'memory-fab workbench discovers'` — passed with the retained reviewed-discard Candidate in the public workbench index.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts --test-name-pattern 'exact phase-aware Investigation'` — passed with the four-entry historical Investigation and current-factory observation handoff.
- `bun run test` — passed: 349 package tests, 0 failures, plus all 8 Ironworks project fixtures.
- Manual Studio review — opened immutable Run `106-candidate-trial-parallel-burn-in-overflow`, inspected the overview and focused `burn-in-overflow-1`, confirmed the explicit junction/rack/connection geometry and exact half-batch source-lot WIP, and observed zero browser warnings or errors.

## Progress log

- 2026-07-31 — Activated from current Investigation phase `author-candidate` after Studio lifecycle convergence was committed as `6d912f6`.
- 2026-07-31 — Replayed the authored patch against Core's compiled `parallelizeWorkCenter` result before creating the immutable Investigation-sourced Candidate.
- 2026-07-31 — Recorded the five-case locked `DISCARD` review and converted the missing unapplied-trial boundary into an explicit product requirement rather than bypassing Candidate governance.
- 2026-07-31 — Reopened Run `106` in Studio overview and focused `burn-in-overflow-1`; confirmed physical topology and half-batch WIP visually with no browser errors before appending comparison and decision evidence.

## Completion

Completed on 2026-07-31. The unapplied parallel rack trial is retained as reviewed `DISCARD`/Investigation `revise` evidence, the editable Blueprint remains unchanged, and the next intervention belongs to a separate batch-coherent dispatch plan.
