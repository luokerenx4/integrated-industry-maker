# Isolated compact shipping trial

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], [[docs/design/blueprint-comparison]], [[docs/design/experiment-workbench]], and [[docs/design/logistics]].

## Outcome

Determine the independent causal effect of compacting the memory-fab finished-goods customer edge, carrying the retained geometry from the rejected combined standby proposal into one exact layout-only Candidate without rediscovering or smuggling back the rejected metrology substitution.

## Context

Investigation `inspection-starvation-next-step` retains Candidate `compact-shipping-metrology-standby` as an exact `DISCARD`: sixteen fewer transport cells recovered `160` build cost, but the qualified low-power inspection substitution reduced facility-interruption on-time lots from nine to seven and regressed all five current-factory cases.

That decision explicitly preserved the compact terminal geometry as a separable hypothesis. The current Blueprint remains `8281c50706c578b823b7d8cc3f5d4f94cef230fefbee210c8a3756a6a9a9563a`, and Run `098-simulate` plus checkpoint `post-standby-factory` remain its exact operating authority.

## Scope

### In scope

- Append one new Investigation hypothesis that cites both the exact rejected review and current factory observation.
- Author one Candidate containing only the retained customer positions/rotations, unloader positions/rotations, and three compact terminal connection paths.
- Require fixed-baseline `KEEP`, capacity READY, every hard outcome passing, every Objective constraint passing, and non-negative current-factory score delta in each of the five locked cases.
- Apply only if all those strict conditions hold. A merely aggregate improvement or Benchmark-permitted small current-case regression is insufficient.
- After a strict KEEP, retain the review decision, apply atomically, simulate one new immutable current Run, and capture a new factory-observation checkpoint into the same Investigation.

### Out of scope

- Any equipment, process, recipe, policy, release, utility, power, quality, maintenance, demand, Scenario, Objective, or Benchmark change.
- Restoring the rejected low-power metrology asset or idle-energy policy.
- Automatic layout search or treating cost reduction alone as design authority.
- Compatibility migrations for pre-release artifacts.

## Acceptance

- [x] The new hypothesis explicitly derives from the exact discarded review instead of restating the old idea from memory.
- [x] The Candidate contains exactly the thirteen terminal-layout operations and reduces unique transport cells by sixteen with no equipment/facility or sorter-endpoint cost change.
- [x] Locked compliance is KEEP; every current-factory case has non-negative score delta, capacity READY, all Objective constraints passing, and no hard-outcome regression.
- [x] One explicit Investigation decision attaches the immutable review before any possible Blueprint mutation.
- [x] If kept, the applied Blueprint equals the reviewed proposed hash, one new compatible Run exists, and a new factory-observation checkpoint makes earlier evidence historical without erasing it. If rejected, the Blueprint and Run authority remain unchanged.
- [x] CLI/Studio inspection, public project validation, focused tests, `bun run check:fast`, and `bun run test` pass.

## Work

- [x] Reopen the current Investigation, exact rejected review, and unchanged Blueprint identity.
- [x] Append the isolated hypothesis and create the layout-only Candidate.
- [x] Evaluate locked/current evidence and audit every strict retention condition.
- [x] Retain the decision; apply, simulate, and capture a new checkpoint only for strict KEEP.
- [x] Complete visual and repository verification, then audit every acceptance item.

## Findings and decisions

- 2026-07-30 — The source decision is Investigation entry `discard-compact-shipping-metrology-standby`, hash `a16879789c67`, whose exact review anchor proves the combined proposal's geometry/capital benefit and metrology/service failure separately.
- 2026-07-30 — Current authority remains Blueprint `8281c50706`, Run `098-simulate`, result `19fd034abbecc`, and factory-observation checkpoint `post-standby-factory`.
- 2026-07-30 — Hypothesis entry `isolate-compact-shipping-geometry` (`4aff4fe334c4`) cites both that rejected receipt and checkpoint. Candidate `compact-finished-goods-shipping` contains exactly thirteen position, rotation, and path operations; it does not touch the rejected `/devices/6` metrology substitution.
- 2026-07-30 — Receipt `55c08df7cea5` records locked `KEEP` at `+169.459037` and current-factory `IMPROVED` at `+0.807825`. Ordered current-case deltas are `+0.807808`, `+0.807802`, `+0.807827`, `+0.807772`, and `+0.807940`; every case is capacity READY with all Objective constraints and all seven hard outcomes passing.
- 2026-07-30 — The evaluator-owned physical ledger isolates `-16` transport cells, `-160` transport-line/total capital, and `-16` occupied area with zero equipment, equipment-area, or sorter-endpoint change. Decision entry `keep-compact-finished-goods-shipping` (`bd3078506ecd`) attached that receipt before apply.
- 2026-07-30 — Apply produced the reviewed proposed Blueprint `d08a18730326`. Immutable Run `099-simulate` pins result `c43d94a65947` and execution `8d6c5b121d4b`; it delivers all `88` devices, completes `12/12` lots on time, costs `229,790`, and occupies `269` cells. Checkpoint `compact-shipping-factory` makes the Investigation current while all earlier valid evidence remains historical.
- 2026-07-30 — The three customer paths are visually and structurally two cells each. Full-run causal telemetry additionally shows an event-phase ripple that the first visual shorthand missed: commercial records `600` blocked item-ticks and performance `99,801`, while automotive is absent from positive blocking contributors. Entry `correct-compact-shipping-transport-observation` (`c06db27f8f55`) appends the correction instead of rewriting the inaccurate earlier observation. This does not invalidate KEEP's stricter capacity, constraint, service, or five-case score guards; it remains exact operating evidence for a later shipping-power/transport hypothesis.

## Verification

- `bun run inm candidate examples/memory-fab --candidate compact-finished-goods-shipping --review --progress human` — immutable strict KEEP review across locked/current/proposed waves.
- `bun run inm candidate examples/memory-fab --candidate compact-finished-goods-shipping --apply --progress human` — exact reviewed proposal applied atomically as `d08a18730326`.
- `bun run inm simulate examples/memory-fab --json` — immutable compatible Run `099-simulate`, result `c43d94a65947`.
- `bun run inm inspect examples/memory-fab --section candidates --json` — Candidate is `verified` `KEEP`, thirteen operations, current hash equals reviewed proposal.
- `bun run inm investigate examples/memory-fab --investigation inspection-starvation-next-step --section all --json` — Investigation is current through eleven append-only entries; new review/checkpoint anchors are current and earlier valid anchors are historical.
- `bun run inm observe examples/memory-fab --run 099-simulate --json` — exact compatible Run and new `fab-loss.input-starvation:…:6fa5414a2b` diagnostic produce run-qualified Factory views.
- Studio `/memory-fab/factory?run=099-simulate` and the three focused customer-connection views — current replay opens without error and shows three compact two-cell lanes.
- `bun run inm validate examples/memory-fab --json` — current Blueprint `d08a18730326`, 62 Devices, 17 connections, no diagnostics.
- `bun run inm test examples/memory-fab` — both project fixtures pass.
- `bun test packages/inm-core/src/workbench.test.ts -t "memory-fab workbench discovers project-local routes, experiments, and candidates"` — 1 test / 35 assertions pass against Run `099-simulate`.
- `bun run check:fast` — documentation (1,226 links), TypeScript, and 35 tests / 221 assertions pass.
- `bun run test` — 325 tests / 4,444 assertions and all eight Ironworks project fixtures pass; immutable demonstration Run replay includes `099-simulate`.

## Progress log

- 2026-07-30 — Plan created directly from the retained negative decision's separable compact-geometry handoff.
- 2026-07-30 — Layout-only proposal passed the stricter gate, was commissioned, and advanced the Investigation through an exact compatible operating checkpoint.
- 2026-07-30 — Post-apply workbench regression refreshed exact Run-owned inventory and loss attribution; a discrepancy between visual shorthand and full-run transport telemetry was retained through a new correction entry.
- 2026-07-30 — Final audit passed every acceptance item. Current-surface tests bind Run `099-simulate`; dedicated historical fixtures explicitly restore Run `098-simulate` and remove the later Candidate/Run before proving its commissioned Design lineage remains reproducible.

## Completion

Complete when the isolated geometry has an immutable review and explicit human/Agent disposition, the Blueprint moves only under the stricter current-factory conditions above, and any resulting operating evidence advances through a new exact Run/checkpoint rather than invalidating or overwriting the reasoning chain.

Completed on 2026-07-30 with reviewed Blueprint `d08a18730326`, immutable Run `099-simulate`, current checkpoint `compact-shipping-factory`, and append-only correction `c06db27f8f55`.
