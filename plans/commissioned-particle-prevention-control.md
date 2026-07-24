# Commission particle-prevention control

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/quality-flow]], [[docs/design/production-modes]], [[docs/design/design-programs]], and [[docs/design/experiment-workbench]].

## Outcome

The exact commissioned memory fab can evaluate a physically explicit layer-two etch mode that prevents the remaining fixed particle-contamination excursion before it creates rework, while humans and Coding Agents can audit its equipment capability, power/cycle trade, exact Blueprint change, locked five-case decision, and either commissioned or rejected operating evidence.

## Context

Compatible run `080-simulate` completes all twelve lots with no scrap or escape, but only ten lots pass first inspection. The fixed `etch-cell-layer-2` challenge still applies critical-dimension and particle-contamination defects; advanced recovery repairs both after they consume inspection, transport, rework, and re-inspection capacity. The selected `closed-loop-control` mode prevents only latent-electrical damage.

This is a useful next industrial optimization because it removes one measured quality mechanism instead of weakening the Scenario or hiding rework inside a scalar. The existing mode contract already supports exact prevention and ordinary power/time pricing, so engine semantics should not expand unless research proves a missing contract.

## Scope

### In scope

- Add a project-local, higher-power and/or longer-cycle layer-two operating mode that prevents exactly `latent-electrical` and `particle-contamination`.
- Search bounded industrial envelopes from TypeScript against the unchanged locked five-case Benchmark and current-best guardrails.
- Expose the option through the existing catalog, analysis, Candidate, Design, CLI, and Studio contracts.
- Commission only a reviewed five-case zero-regression winner; otherwise preserve the selected `closed-loop-control`, record exact rejection evidence, and regenerate compatible evidence only because the project-local catalog identity changed.
- Recheck the project launcher and `/memory-fab/factory` cold path during final browser verification.

### Out of scope

- Preventing `critical-dimension`, editing Scenario excursions, changing Objective or Benchmark thresholds, or adding probabilistic yield.
- Adding a hidden quality multiplier, alternate Process id, evaluator exception, or backward-compatible reader.
- Reworking release cadence, route dispatch, logistics, or unrelated historical Candidate state.

## Acceptance

- [x] The catalog and evaluated Blueprint patch make particle prevention an explicit production-mode option with visible power and duration costs.
- [x] TypeScript research records every tested envelope and the exact five-case deltas/guardrails against the current commissioned Blueprint.
- [x] A Candidate is created and applied only if every locked current-best case is non-regressing and all hard outcomes pass.
- [x] Immutable Design evidence visibly preserves all authored defects while partitioning prevented versus applied instances and reducing verified rework; compatible evidence retains the existing selected mode when the option is rejected.
- [x] `inm inspect`, Candidate/Design evidence, Studio catalog/Factory, and exact CLI reproduction agree.
- [x] Documentation checks, type checking, focused/full tests, both project fixtures, browser verification, Git commit, and push pass.

## Work

- [x] Reproduce the reported project-open path and audit current quality evidence and available equipment contract.
- [x] Author the bounded TypeScript particle-prevention research and catalog option.
- [x] Run the locked Benchmark, record the decision, and create/apply a guarded Candidate only if eligible.
- [x] Regenerate compatible immutable evidence and update durable quality documentation and shared tests where required.
- [x] Complete CLI/Studio/browser parity, full regression, plan audit, commit, and push.

## Findings and decisions

- 2026-07-25 — The launcher-to-`/memory-fab` path loads successfully on current `main`; the reported project-open error is not reproducible after a fresh navigation, so it remains a final cold-path regression check rather than a speculative code change.
- 2026-07-25 — `080-simulate` attributes two repaired lots to fixed critical-dimension and particle-contamination defects at `etch-l2`; selected closed-loop control already prevents the third latent-electrical defect.
- 2026-07-25 — The strict production-mode contract already carries exact duration, power, and prevention capability through compilation, runtime, immutable metrics, CLI, and Studio. This plan will first use that contract rather than adding engine-global quality behavior.
- 2026-07-25 — The zero-extra-energy diagnostic upper bound reduces mixed-quality rework from two cycles to one and gains `1.567062`, but regresses quality excursion by `-0.152471` and lithography interruption by `-1.534427`. Therefore the coupling is scheduling/flow, not merely energy price, and no tested envelope is promotable.
- 2026-07-25 — `13/10` active power is the smallest explicitly costed production envelope. It retains the option in the project catalog for future system-level combinations, but its exact current-factory patch cannot lead under the uniform zero-regression guardrail.
- 2026-07-25 — Adding a project-local mode changes catalog identity even when the commissioned Blueprint does not select it. Locked Benchmarks and one compatible current run therefore need fresh hashes; this is evidence maintenance, not commissioning.
- 2026-07-25 — Design Run `5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9` retains the one-operation mode switch as an exhausted Pareto branch: aggregate `+0.178083`, mixed-quality `+1.560012`, but steady `-0.007050`, quality-excursion `-0.159521`, lithography-interruption `-1.541477`, and facility-interruption `-0.005875`. No Candidate is authorized.

## Verification

- `bun run memory-fab:research-particle-prevention` — seven envelopes across five locked cases; no promotable row.
- Design Run `5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9` — five evaluated proposals, exhausted frontier, unchanged seed leader, particle option retained as one-operation `BRANCH`.
- `bun run inm simulate examples/memory-fab --json` — compatible `081-simulate`, score `28.756599`, 12/12 complete, 11 on time, two rework cycles, zero scrap/escape, and `3 authored / 1 prevented / 2 applied`.
- Focused `design-proposal-provider` and Workbench tests pass.
- Studio cold path opens `/` → `/memory-fab`; Factory reports `081-simulate` and `1 / 3` prevention; Catalog shows `closed-loop-control` at `6/5` power and `particle-suppression` at `13/10`; the Design deep link shows the exact `BRANCH`, four violations, and no promotion action.
- `bun run test` — documentation and all TypeScript packages pass; 234 Core/CLI/Studio tests and 1,961 assertions pass; all eight Ironworks fixtures pass.
- `bun run inm test examples/memory-fab --json` — both authored memory-fab fixtures pass.

## Progress log

- 2026-07-25 — Plan activated from compatible `080-simulate` evidence after the current project launcher was reopened successfully.
- 2026-07-25 — Added the project-local mode and bounded TypeScript sweep, relocked catalog-dependent Benchmarks, retained the exact non-promotable branch in Design, regenerated compatible run `081-simulate`, and completed CLI/Studio parity checks.
- 2026-07-25 — Replayed every checked-in run, passed the full serial repository and both project suites, and completed the acceptance audit without commissioning the unsafe branch.

## Completion

Completed 2026-07-25. The memory-fab catalog now contains an explicit, costed particle-suppression technology, the project-local TypeScript research and immutable Design evidence prove both its local quality gain and its four-case system regression, and no Candidate or Blueprint mutation bypasses the zero-regression boundary. Compatible run `081-simulate`, CLI, Studio, documentation, and the complete test suite all retain `closed-loop-control` as the commissioned operating mode.
