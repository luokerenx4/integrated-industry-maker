# Production Plan Run comparison loop

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/production-plans]], [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], and [[docs/design/blueprint-comparison]].

## Outcome

Carry one human/Agent-authored memory-fab Production Plan hypothesis from the current `back-end-wip-next-step` Investigation through a separately selected immutable Run, an exact Run comparison that identifies Production Plan as the sole intervention, and an append-only decision that preserves both the measured score and the industrial judgment.

## Context

Run `102-simulate` proves that the explicit `production-window` plan schedules and completes twelve wafer lots, packages 96 devices, finishes eleven fixed-eight burn-in batches, delivers 88 devices, and leaves eight packaged devices queued at `burn-in-1`. The current Investigation is source-current and asks for a production-planning, cadence, or back-end service intervention.

Production Plans are now independently selected and hash-identified, but immutable Run comparison still assumes that only the Blueprint may differ. It therefore rejects the exact before/after evidence required to test a plan intervention. Treating a Production Plan as a Blueprint Candidate would also invent the wrong apply semantics: plans are selected alternatives, not commissioned factory mutations.

The first bounded hypothesis deliberately tests an eleven-lot horizon-aligned plan. It may improve WIP while preserving the currently observed 88 deliveries, but it also removes one scheduled lot. The comparison must expose that tradeoff so a human or Agent can reject horizon truncation even if the Objective score rises.

## Scope

### In scope

- Generalize immutable Run comparison to accept exactly one controlled intervention kind: `blueprint` or `production-plan`.
- Preserve strict equality for catalogs, World, Scenario, Objective, seed, duration, and every non-intervention artifact.
- Project a typed intervention identity, generic JSON patch, Production Plan semantic changes, and complete metric/guardrail deltas through Core, CLI, Studio, and Investigation anchors.
- Author and simulate one self-contained eleven-lot memory-fab Production Plan without changing the project default.
- Append the hypothesis, comparison-backed observation, and explicit industrial decision to `back-end-wip-next-step`.

### Out of scope

- Automatic Production Plan generation, search, ranking, or recommendation.
- Recasting Blueprint Candidates or Design Programs as generic plan optimizers.
- Applying or promoting a Production Plan over another plan.
- Treating a higher score as authority to remove scheduled production.
- Broad lifecycle work not exercised by this exact design session.

## Acceptance

- [x] Run comparison accepts two exact complete Runs when Production Plan is the only changed execution input and rejects zero or multiple controlled variables.
- [x] The comparison names the intervention kind and FROM/TO ids and hashes; its patch and semantic changes describe lot releases and material deliveries rather than Blueprint entities.
- [x] CLI JSON/human output and Studio show the same intervention identity plus scheduled, released, completed, delivered, WIP, service, and quality tradeoffs.
- [x] Investigation comparison anchors retain and re-verify a Production Plan intervention without weakening existing Blueprint comparison evidence.
- [x] The eleven-lot experiment is a separately selected immutable Run; the project default and current twelve-lot Run remain intact.
- [x] The Investigation records authored hypothesis, observed comparison, and explicit decision without automatic judgment.
- [x] Targeted tests, both public project fixture suites, `bun run check:fast`, full `bun run test`, and browser verification pass.

## Work

- [x] Audit current Production Plan identity, Run comparison, Investigation, CLI, Studio, and lifecycle boundaries.
- [x] Implement typed controlled-variable Run comparison and Production Plan semantic diff.
- [x] Update CLI, Studio, Investigation verification, schemas, and design documents.
- [x] Record the hypothesis, author the plan, simulate, compare, and append the evidence-backed decision.
- [x] Exercise the public session and browser paths; fix only observed workflow friction.
- [x] Complete the acceptance audit, full verification, and plan archive.

## Findings and decisions

- 2026-07-31 — A Production Plan is a selected alternative, not a Blueprint Candidate to apply. Its experiment is preserved by plan hash, immutable Runs, and an append-only Investigation chain.
- 2026-07-31 — Run `102-simulate` completed all twelve wafer lots but only eleven eight-device burn-in batches before the 240-second horizon; the remaining eight packaged devices make an eleven-lot plan a useful test of score-versus-production-intent judgment.
- 2026-07-31 — The first intervention is intentionally bounded negative-or-ambiguous evidence. Removing a scheduled lot cannot become an automatic KEEP merely because present-horizon WIP improves.
- 2026-07-31 — Run comparison must declare exactly one controlled artifact. Blueprint comparisons retain Production Plan identity; Production Plan comparisons retain Blueprint identity. Zero or two changed artifacts fail closed.
- 2026-07-31 — Hypothesis intervention kind is explicit authored data. A Production Plan hypothesis yields `author-production-plan`, and Candidate creation rejects it rather than guessing from prose.
- 2026-07-31 — Run `103-simulate` proves the deceptive boundary: score `+7.193077` and average WIP `-4.732567` with the same 88 delivered devices, but scheduled, released, completed, and on-time lots each fall by one. The Investigation records `DISCARD` and then rebinds current Run `102-simulate`.
- 2026-07-31 — Browser inspection found that a green `IMPROVED` badge visually overclaimed a score verdict. Studio now says `SCORE IMPROVED` and shows an amber `PRODUCTION INTENT REDUCED` callout whenever a Production Plan comparison loses scheduled, released, completed, on-time, or delivered production.
- 2026-07-31 — The first browser pass also encountered duplicate managed Studio instances on ports 4176 and 4177. The temporary 4177 instance was stopped; the user-facing 4176 child remained source-current. Broader lifecycle remediation stays outside this bounded plan.

## Verification

- `bun run typecheck`
- `bun test packages/inm-core/src/run-comparison.test.ts packages/inm-core/src/investigation.test.ts packages/inm-core/src/investigation-run-comparison.test.ts --max-concurrency=1` — 8 pass.
- `bun test packages/inm-studio/src/server.test.ts --max-concurrency=1` — 10 pass.
- `bun test packages/inm-cli/src/commands.test.ts --max-concurrency=1` — 25 pass.
- `bun run check:fast` — 41 short tests plus documentation and TypeScript pass.
- `bun run inm test examples/memory-fab` — 2/2 fixtures pass.
- `bun run inm test examples/ironworks` — 8/8 fixtures pass.
- `inm validate` and `inm plan` for `eleven-lot-burn-in-horizon` — valid and capacity-ready.
- `inm compare examples/memory-fab --from-run 102-simulate --to-run 103-simulate` — exact Production Plan intervention with three semantic changes and four patch operations.
- Browser: `/memory-fab/runs?from=102-simulate&to=103-simulate` shows exact plan identity, `12/12 → 11/11`, `88 → 88`, `49.191 → 44.458`, the production-intent warning, and no console warning/error.
- Browser: Run `102-simulate`, Run `103-simulate`, and `back-end-wip-next-step` reopen with exact evidence, six-entry reasoning chain, current twelve-lot handoff, and no console warning/error.
- `bun run test` — 342 tests pass across 29 files; the command's public Ironworks fixture phase also passes 8/8.
- `git diff --check` and `bun run docs:check` — pass.

## Progress log

- 2026-07-31 — Plan created and indexed after current-state audit.
- 2026-07-31 — Core/CLI/Studio comparison contract implemented and targeted tests passed.
- 2026-07-31 — Eleven-lot plan, immutable Run `103-simulate`, comparison observation, explicit discard, and current Run `102-simulate` resumption appended.
- 2026-07-31 — Browser QA completed; observed score-authority visual friction fixed and reverified.
- 2026-07-31 — Full regression and final acceptance audit completed; plan archived.

## Completion

Production Plan is now a first-class controlled Run intervention across Core, CLI, Studio, and Investigation evidence. The first retained memory-fab experiment demonstrates why score cannot replace industrial judgment: the eleven-lot horizon improves the numeric score and WIP but removes one scheduled, released, completed, and on-time lot, so the Investigation explicitly discards it and resumes the intact twelve-lot baseline.
