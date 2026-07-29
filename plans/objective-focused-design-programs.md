# Objective-focused Design Programs

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/observation-led-design]]

## Outcome

When compatible factory losses are bounded but a measured Objective penalty remains dominant, a human or Agent can enter an exact project-local Design Program for that Objective component and its physical exposure locations, evaluate explicit TypeScript proposals through the locked Benchmark, and receive the same causal before/after evidence in Core, CLI, and Studio.

## Context

Current memory-fab Run `092-simulate` scores `42.826105841666674`. After current evidence bounded the eight realized fab-loss branches, Workbench correctly exposes WIP as the dominant Objective tradeoff: `19.872825` average scored WIP contributes `-29.8092375`; `burn-in-1.package-input` averages `9.781316666666667` packaged devices and `packaging-1.die-input` averages `7.965816666666667` known-good dies.

Factory replay shows a single-piece packaging operation feeding an eight-item burn-in batch. Packaging waits for input for `96.0s`; burn-in is the reported bottleneck but is idle for `76.0s`. This supports a falsifiable cadence/release hypothesis, not a conclusion that all measured WIP is avoidable.

The current framework stops at observation. `DesignProgramFocus` can name only `broad` or fab-loss buckets, project proposals can claim only a fab-loss contributor or a blocked Benchmark case, and Workbench cannot align an Objective tradeoff with a bounded Program. Humans and Agents therefore lose the same evidence-backed Design loop precisely when all loss branches have been handled.

The existing reviewed `back-end-wip-conwip-5-4` Candidate proves the intervention is non-trivial: it improves current-factory WIP score by about `+5.02` but fails on-time guardrails in three cases. The new Program must preserve this tradeoff rather than auto-apply a lower-WIP policy.

## Scope

### In scope

- Add an Objective-focused Design Program contract with an exact score component and optional exact WIP inventory locations.
- Let a project proposal name one exact Objective target and require measured driver-case improvement before it can be kept or branched.
- Route Workbench to a matching current Objective Program only after active compatible-run losses are bounded.
- Add a self-contained memory-fab back-end WIP Program with explicit TypeScript proposals and locked Benchmark evaluation.
- Project the focus and causal evidence consistently in CLI and Studio.

### Out of scope

- Treating Objective accounting as an automatically diagnosed causal loss.
- Automatic layout generation, RL, black-box search, or automatic Blueprint application.
- Weakening current-best case budgets or locked industrial outcome guardrails.
- Adding generic buffer-control or new equipment semantics before the bounded WIP evidence proves they are needed.

## Acceptance

- [x] `focus.kind = "objective"` validates an exact Objective component; WIP focus may bind unique exact inventory-location ids and non-WIP focus cannot claim WIP locations.
- [x] A proposal may bind one exact Objective target; Core records before, after, delta, and improvement from driver metrics and rejects a non-improving target before frontier promotion.
- [x] After all active memory-fab losses are bounded, CLI and Studio recommend `back-end-wip-convergence` for Run `092-simulate` instead of ending at a generic WIP observation.
- [x] The memory-fab Program evaluates explicit release/cadence hypotheses against the locked five-case Benchmark and preserves exact guardrail rejection evidence.
- [x] CLI and Studio render Objective focus and causal target evidence without relabeling it as a fab loss.
- [x] Affected Core, CLI, Studio, project fixtures, docs, and full repository tests pass.

## Work

- [x] Observe the current Run, advance catalog-current loss evidence, and establish the exact WIP frontier.
- [x] Extend the Design Program and project proposal contracts.
- [x] Add Core causal validation, Workbench selection, and cross-surface projection.
- [x] Add and execute the memory-fab back-end WIP Program.
- [x] Update durable design documentation and complete the acceptance audit.

## Findings and decisions

- 2026-07-29 — Revalidating seven historicalized loss branches took about twenty seconds total after simulator/worker improvements. Runtime is no longer the main blocker at this frontier; the missing Objective-to-Design handoff is.
- 2026-07-29 — Quality suppression reduced exact introduced defect instances from `2` to `1` but lost about `0.452` aggregate points against the current factory. The current unchanged seed correctly remains authoritative.
- 2026-07-29 — WIP location identity, not only the aggregate `wip` component, is required to prevent an Objective-focused proposal from claiming an unrelated inventory reduction.
- 2026-07-29 — Objective focus remains descriptive alignment. Only an explicit project proposal may assert causality, and Core must verify its exact target before normal locked-Benchmark promotion rules apply.
- 2026-07-29 — Five-card/four-card reopening reduces packaging die-input average inventory from `7.965816666666667` to `3.764483333333333`, but the locked service gate rejects it.
- 2026-07-29 — Four-card/three-card reopening reduces the same exact location to `2.5047`, but regresses mixed-quality, quality-excursion, and lithography-interruption guardrails. Lower WIP is therefore preserved as a measured benefit, not promoted as an acceptable factory.
- 2026-07-29 — Current Objective authority is exhausted Run `3484a814504c8161140b963d174ea18e2fd963b3acdab6a37bebc36ceb995742`; the unchanged seed remains the leader.

## Verification

- `bun run typecheck`
- `bun test` — `304 pass`, `0 fail`, `3262 expect()` calls
- `bun run docs:check` — `1113` documentation links resolved
- `bun run inm test examples/ironworks` — `8/8` end-to-end example cases passed
- Real memory-fab API V8 loss-chain regeneration: all eight compatible-run loss branches are current bounded dispositions.
- `inm inspect examples/memory-fab --section next-action --json` routes to the exact exhausted Objective Design Run for `back-end-wip-convergence`.
- Studio restarted through the managed lifecycle at `http://localhost:4176`; browser inspection confirmed Objective focus, two physical exposure locations, both exact target deltas, locked-gate reasons, and no promotable accepted design.

## Progress log

- 2026-07-29 — Plan created after current Run observation, device-level Factory inspection, and full current loss-frontier revalidation.
- 2026-07-29 — Provider API V8, Core replay authority, CLI/Studio projection, Workbench routing, memory-fab Program, docs, current evidence, and verification completed.

## Completion

The loss-to-Objective handoff is complete. Humans and Agents now enter the same exact WIP-focused Program, see whether each authored intervention moves its claimed physical exposure, and still rely on the locked five-case Benchmark plus explicit review for factory judgment.
