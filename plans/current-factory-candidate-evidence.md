# Compare every Candidate with the current factory

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/coding-agent-optimization]], [[docs/design/experiment-workbench]], [[docs/design/blueprint-comparison]], and [[docs/CLI]].

## Outcome

Every Candidate review separates locked-Benchmark compliance from the proposed patch's incremental effect on the exact current factory, so a human or Agent can judge whether an intervention improves, regresses, or trades away current industrial outcomes without mistaking an obsolete fixed baseline for the live design.

## Context

Observation of compatible memory-fab Run `092-simulate` shows a healthy commissioned factory with all twelve lots complete, 100% good yield, 83.3% first-pass yield, and no scrap or quality escapes. Its leading Objective tradeoff is instead `19.873` average scored WIP, dominated by `burn-in-1.package-input` and `packaging-1.die-input`.

The existing `back-end-wip-conwip-5-4` Candidate is pinned to that exact Blueprint and evaluates a deliberate WIP intervention. Candidate review currently returns `+120.277315`, but that number is the proposal relative to the Benchmark's original greenfield baseline. The hard-outcome rows likewise show a low historical baseline beside the proposal. Neither Core, CLI, receipt, nor Studio reports the proposal relative to the pinned current factory. The immutable Benchmark baseline remains necessary compliance authority, but it cannot answer the incremental design question.

## Scope

### In scope

- Evaluate the pinned current Blueprint under the same exact Benchmark cases when it differs from the fixed baseline.
- Preserve fixed-baseline acceptance and label it explicitly as the locked compliance result.
- Add a typed current-to-proposed aggregate, per-case, Objective-component, outcome, and capacity comparison to Candidate review evidence.
- Persist the complete dual-reference evidence in the immutable review receipt and project it identically through CLI and Studio.
- Use the memory-fab WIP Candidate to prove that the previously attractive fixed-baseline score does not conceal current-factory service regressions.

### Out of scope

- Changing Objective weights or locked Benchmark thresholds.
- Automatically choosing or applying a Candidate.
- Replacing Design Program current-best search evidence.
- Supporting pre-change review receipts; this is pre-release and stale receipt formats may be removed or regenerated.

## Acceptance

- [x] Candidate review retains the unchanged locked Benchmark verdict and complete baseline-to-proposed evidence.
- [x] When the pinned current Blueprint differs from the fixed baseline, review also returns exact current-to-proposed aggregate and ordered per-case evidence from the same case inputs and seeds.
- [x] Current-to-proposed evidence includes score/Objective components, industrial outcomes, and capacity; component deltas reconcile exactly.
- [x] CLI JSON and Studio present the two references with unambiguous labels and no independently derived industrial values.
- [x] Immutable receipts strictly require the new evidence, and apply re-evaluates the same dual-reference result before writing.
- [x] The memory-fab `back-end-wip-conwip-5-4` review makes its current-factory effects directly inspectable.
- [x] Targeted tests and the complete repository test boundary pass.

## Work

- [x] Observe Run `092-simulate` in the Factory overview and `etch-l2` focus, then reproduce the misleading Candidate review.
- [x] Add current-factory evaluation and comparison to Core Candidate review.
- [x] Update receipt schema, operation/CLI projection, and Studio Candidate workbench.
- [x] Regenerate affected checked-in Candidate evidence and document the public invariant.
- [x] Complete automated and browser verification, then audit every acceptance item.

## Findings and decisions

- 2026-07-29 — The observed layer-two excursion creates two rework cycles but no scrap, escape, or lost Probe output in the compatible run; it is real causal evidence but not the dominant current Objective tradeoff.
- 2026-07-29 — The current fixed Benchmark baseline is intentionally immutable and remains the compliance reference. The missing concept is a second, explicit comparison against the Candidate artifact's hash-pinned current Blueprint, not a relock.
- 2026-07-29 — Candidate decision authority remains human/Agent plus the authored locked gates. The new comparison supplies evidence and does not introduce autonomous acceptance policy.
- 2026-07-29 — A synthesis-seeded greenfield Candidate can start from a schema-valid commissioning shell whose locked Scenario references only become operational after the patch. Such a current Blueprint is explicitly `not-operational` / `NOT_COMPARABLE`; fixed compliance remains valid and is never substituted as incremental evidence.
- 2026-07-29 — Candidate review owns one reusable case Worker set across current and proposed waves. The proposed wave reuses warm workers while ordered deterministic evidence remains unchanged.
- 2026-07-29 — V1 review receipts were removed rather than migrated. The project retains only explicit V2 reviews for `back-end-wip-conwip-5-4` and `stable-furnace-sleep`; all older proposals are correctly stale until reviewed again.

## Verification

- `bun run check:fast` — documentation links, TypeScript, and 35 short tests passed.
- `bun run test` — 300 tests / 3235 expectations passed; all eight Ironworks project tests passed.
- `bun run inm candidate examples/memory-fab --candidate back-end-wip-conwip-5-4 --json` — strict V2 receipt recorded; locked result remains `DISCARD`, current factory is `42.782183 → 45.301593` (`+2.519409`) with a `-5.806870` worst case.
- Studio browser verification at the Candidate deep link — locked compliance and current-factory evidence render separately; current on-time service passes all cases while the proposal fails steady production, lithography interruption, and facility interruption; reload produced no new console errors.

## Progress log

- 2026-07-29 — Plan created after the observation-led memory-fab audit and direct `back-end-wip-conwip-5-4` review.
- 2026-07-29 — Core, CLI, receipt V2, Studio, docs, checked-in evidence, greenfield non-operational handling, and full verification completed.

## Completion

The Candidate review surface now answers both required questions without conflating them: locked compliance determines whether a patch may be applied, while exact current-factory evidence exposes the design tradeoff for human or Agent judgment. The memory-fab WIP proposal proves the value of the split: it reduces every case's WIP and raises aggregate score, yet materially harms service resilience and remains correctly discarded.
