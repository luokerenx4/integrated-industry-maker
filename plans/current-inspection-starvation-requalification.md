# Current inspection starvation requalification

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], and [[docs/design/coding-agent-optimization]].

## Outcome

Continue the current memory-fab inspection inquiry from immutable Run `099-simulate` and its complete accumulated Investigation lineage, then decide one physically distinct, falsifiable next intervention through exact five-case evidence—or retain an explicit bounded reason not to intervene—without replaying the six already evaluated inspection-supply hypotheses as though they were new.

## Context

The commissioned one-tick `closed-loop-fast-4-5` recovery controller remains installed on `etch-l2`. Earlier current evidence evaluated the complete six-item `inspection-supply-path` portfolio: that controller was the only safe KEEP; delayed or always-fast variants regressed the addressed loss or locked cases, and the shared-cell vacuum handoff violated the capital cap.

The later compact finished-goods layout changed the exact Blueprint identity and produced compatible Run `099-simulate`. It did not erase the old reasoning: Investigation `inspection-starvation-next-step` now contains eleven append-only entries, including the commissioned inspection lineage, two discarded metrology-standby attempts, the isolated compact-shipping KEEP, and a current factory checkpoint. The focused Design Program is correctly non-current under the new whole-factory identity, but its historical decisions remain the exclusion set for this inquiry.

Run `099-simulate` still ranks input starvation first. This plan begins from its exact typed and spatial evidence, distinguishes ordinary source processing, upstream starvation, and necessary transit from avoidable inspection supply loss, and refuses to manufacture a Candidate merely to refresh currentness.

## Scope

### In scope

- Reopen the exact Run `099-simulate` inspection cell, ordinary `etch-l2 → inspection-1` path, conditional rework return, and upstream `etch-l2` supply context.
- Treat all six historical focused Program strategies and both low-power metrology standby attempts as accumulated prior hypotheses.
- State one new physically distinct hypothesis only after typed and spatial observation, including its smallest exact intervention and expected measured and visual effect.
- Evaluate the intervention against the current Blueprint and all five locked cases, then append an exact KEEP, revise, defer, or discard decision to the existing Investigation.
- Preserve a bounded negative conclusion when the observed mechanism supplies no honest intervention.

### Out of scope

- Re-running the existing six-strategy Program and presenting its rows as new design reasoning.
- Adding inspection capacity to solve an inspection input shortage.
- Weakening current-best, hard-outcome, capacity, quality-prevention, capital, or on-time-service gates.
- Treating a Design Program, score rank, or generated patch as commissioning authority.
- Adding backward-compatibility behavior for older evidence formats.

## Acceptance

- [x] The plan records exact typed and spatial observations from Run `099-simulate`, including the inspection shortage partition and relevant upstream operating behavior.
- [x] The chosen hypothesis is physically distinct from every retained Design and Investigation hypothesis, or the Investigation receives an explicit evidence-backed defer entry explaining why none is presently justified.
- [x] Any Candidate is sourced from the exact new Investigation hypothesis and receives strict locked/current/proposed review before an explicit Agent KEEP, revise, defer, or discard decision.
- [x] A KEEP requires capacity READY, all Objective constraints and hard outcomes passing, no current-factory case regression, and an improved stated causal target; otherwise the Blueprint remains unchanged.
- [x] CLI, Studio, immutable artifacts, the Investigation chain, and this plan agree on the disposition.
- [x] Project validation, targeted checks, replay where applicable, and the full repository checkpoint pass before completion.

## Work

- [x] Inspect current typed loss, Device, connection, objective, and historical intervention evidence.
- [x] Inspect the exact Run `099-simulate` Factory overview and focused inspection supply-path views.
- [x] Append one current observation and one falsifiable hypothesis—or a bounded defer decision—to the existing Investigation.
- [x] Author and review the smallest exact Candidate only when the observation justifies it.
- [x] Apply and simulate only a strict KEEP; otherwise retain the unchanged Blueprint and exact negative evidence.
- [x] Reconcile public surfaces and fixtures, run the full checkpoint, complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-30 — The installed `etch-l2` cadence controller already implements the historical one-tick `closed-loop-fast-4-5` KEEP. The remaining five Program strategies and both metrology standby attempts are prior evidence, not a fresh proposal queue.
- 2026-07-30 — Compact finished-goods geometry changed the exact whole-factory Blueprint identity but did not invalidate the semantic value of the append-only inspection hypothesis history. Current safety must be requalified; old ideas must not be renamed and rediscovered.
- 2026-07-30 — Run `099-simulate` attributes `58.584 s` of eligible input starvation to `inspection-1` and `29.456 s` to `etch-l2`. The ordinary `etch-l2 → inspection-1` lane is uncongested at `3/240 items/min`, while the physically distinct seven-cell `lithography-l2 → etch-l2` handoff costs `1.2 s` per lot despite carrying only `12` lots with zero blocked ticks.
- 2026-07-30 — Investigation entries `0012` and `0013` preserve that observation and the exact hypothesis: upgrade only connection `lithography-to-etch-lithography-l2` to `vacuum-wafer-conveyor` plus two `vacuum-wafer-sorter` endpoints, retaining its route geometry, every Process, and all downstream lanes.
- 2026-07-30 — Strict Candidate review `02c473999aa9…` returns KEEP. Every current-factory case improves by `+0.156266` to `+0.187909` score, each loses `0.10–0.12` Objective-equivalent WIP, capacity remains READY, all locked outcomes and Objective constraints pass, and the exact intervention costs `150` additional capital without consuming area.
- 2026-07-30 — Investigation entry `0014` records the Agent KEEP before apply. The commissioned Blueprint is `6b8b0ce24a75…`; immutable Run `100-simulate` and Investigation entry `0015` make the post-change operating evidence current.
- 2026-07-30 — The measured effect is smaller than the theoretical transport-state envelope and remains explicit: the handoff falls `1.2 → 0.6 s`, factory mean lot movement falls `9.000 → 8.433 s`, total input starvation falls `249.826 → 245.026 device-s`, and both `etch-l2` and `inspection-1` shortage fall by `0.600 s`. Objective-equivalent WIP falls `49.2905 → 49.1905` and score improves `-0.462856 → -0.306590`; raw WIP rises `27.988596 → 28.039358`, so this KEEP is not misreported as an across-the-board inventory reduction.
- 2026-07-30 — Delivery remains `88`, all `12/12` lots complete on time, good yield remains `100%`, `10/12` lots pass first time, two are repaired, and no lot scraps or escapes. The modest causal gain, guardrail preservation, and low capital use justify KEEP without implying that inspection supply starvation is solved.

## Verification

- `bun run inm observe examples/memory-fab --run 099-simulate --json`
- Studio Factory overview plus focused Run `099-simulate` views for `inspection-1`, `etch-to-inspection`, `etch-l2`, and `lithography-to-etch-lithography-l2`.
- `bun run inm candidate examples/memory-fab --candidate vacuum-lithography-etch-handoff --review --progress human --json`
- `bun run inm candidate examples/memory-fab --candidate vacuum-lithography-etch-handoff --apply --progress human --json`
- `bun run inm validate examples/memory-fab --json`
- `bun run inm analyze examples/memory-fab --json`
- `bun run inm plan examples/memory-fab --json`
- `bun run inm simulate examples/memory-fab --json` — retained Run `100-simulate`, result `5302c842062c…`.
- `bun run inm observe examples/memory-fab --run 100-simulate --json`
- Studio focused Run `100-simulate` view for `lithography-to-etch-lithography-l2`, confirming the same seven-cell route, `600 ms` transit, `480 items/min` installed capacity, `12` deliveries, and zero blocked ticks.
- Affected current-surface, historical-fixture, Observation, locked-guardrail, and exact simulator-timing tests pass.
- `bun run check:fast`
- `bun run test` — `325` repository tests / `3937` assertions pass, followed by all `8` Ironworks end-to-end scenarios.

## Progress log

- 2026-07-30 — Plan created from current Run `099-simulate`, the eleven-entry Investigation chain, the installed etch controller, and the retained focused Design history.
- 2026-07-30 — Appended observation, falsifiable hypothesis, KEEP decision, and post-change observation as Investigation entries `0012–0015`.
- 2026-07-30 — Reviewed and applied `vacuum-lithography-etch-handoff`; generated current immutable Run `100-simulate`.
- 2026-07-30 — Reconciled Core, CLI, Studio, Observation, guardrail, and simulator-timing fixtures to exact Run `100-simulate` evidence and passed the full repository checkpoint.

## Completion

Completed. The existing Investigation now carries the prior six-strategy frontier, discarded standby hypotheses, compact-shipping change, new upstream handoff hypothesis, strict review disposition, and current operating result as one append-only chain. The current factory keeps the vacuum handoff because exact five-case and Run `100-simulate` evidence prove a small causal inspection-supply improvement without weakening delivery, quality, capacity, or Objective constraints.
