# Loss intervention portfolio

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/equipment-changeover]], [[docs/design/quality-flow]], and [[docs/design/coding-agent-optimization]].

## Outcome

Memory-fab Design uses its accumulated experiment history to explore distinct measured loss targets, including existing preventive-maintenance and setup-campaign controls, so a bounded multi-round run produces an inspectable portfolio of causally motivated Candidates instead of exhausting small variations of one intervention family.

## Context

The completed loss-guided Design loop derives a Core-owned loss chain before every proposal and requires the project strategy to name one observed target. Its first greenfield improvement is a nine-card CONWIP policy. After that KEEP, the driver still reports Route Q-time, yield/quality, queue starvation, setup campaign, and maintenance/qualification losses.

The proposal provider currently sees strategy names and KEEP/REVERT decisions but not the loss each earlier proposal targeted. It therefore ranks every unused candidate from the current chain alone and tries all authored CONWIP variants before considering a different industrial lever. This is deterministic but does not use the experimental history as a portfolio: repeated attempts against one bucket crowd out other high-ranked, intervenable losses within the six-candidate budget.

The Blueprint model already owns explicit `preventiveMaintenance` and `setupCampaign` policy controls. Read-only locked-benchmark probes against the current greenfield best found that lithography maintenance at six jobs improves aggregate score by about `+3.5737`, while a lithography campaign of three ready lots with a twelve-thousand-tick hold improves it by about `+5.9902`; both satisfy the locked case-regression gate. These are evidence-backed additions rather than new fab physics.

## Scope

### In scope

- Preserve each proposal's measured `addressedLoss` in research history supplied to later iterations.
- Rank project-local candidates by prior attempts against their eligible current loss targets, then by current loss-chain position and stable authored order.
- Add explicit decision families and memory-fab candidates for lithography preventive maintenance, inspection preventive maintenance, and lithography setup campaigns.
- Keep Core-owned loss evidence, complete locked Benchmark evaluation, and strictly positive improvement as the only KEEP authority.
- Show and verify a real multi-round human/AI-visible Design history containing distinct loss targets.

### Out of scope

- Inferring causal success from a declared target without Benchmark evidence.
- Adding new maintenance, yield, or changeover simulation physics.
- Searching continuous policy spaces or tuning thresholds online; the project owns a small researched discrete portfolio.
- Applying the final promotion Candidate automatically or bypassing operator review.

## Acceptance

- [x] Every prior Design attempt supplies its recorded observed `addressedLoss` to the next project proposal invocation without allowing project code to rewrite Core evidence.
- [x] Candidate selection deterministically prefers the least-attempted eligible measured target, breaking ties by current loss rank and authored order, and never repeats a used strategy.
- [x] The memory-fab provider can propose valid maintenance and setup-campaign patches only when the required Device and policy surface exist, using declared decision families.
- [x] A real greenfield multi-round Design run retains the CONWIP KEEP and evaluates distinct observed loss targets with complete locked-case evidence.
- [x] CLI machine output and Studio data expose the same ordered target history already stored in the immutable Design Run.
- [x] Focused provider/Core tests, documentation checks, memory-fab fixtures, real-run verification, and the complete repository suite pass.

## Work

- [x] Measure the post-CONWIP driver loss chain and probe existing Blueprint controls against the locked Benchmark.
- [x] Extend research history and the project proposal-provider contract with the immutable addressed-loss target.
- [x] Implement target-diversified ranking and maintenance/setup candidates in the self-contained memory-fab project.
- [x] Declare the new decision families and update design/reference documentation and tests.
- [x] Run focused and full regression plus a real multi-round Design execution; audit every acceptance item.

## Findings and decisions

- 2026-07-23 — After the nine-card CONWIP KEEP, the driver chain remains `q-time → yield-quality → queue-starvation → setup-campaign → maintenance-qualification`; diversification must use this current evidence rather than a static round number.
- 2026-07-23 — Locked probes against that best found lithography `minimumJobs: 6` at about `+3.5737`, inspection `minimumJobs: 4` at about `+0.7589`, and lithography setup campaign `minimumReadyLots: 3, maximumHoldTicks: 12000` at about `+5.9902` aggregate score. Lithography specialization regressed one locked case and is not added.
- 2026-07-23 — Attempt counts, not KEEP counts, drive diversification. A rejected intervention is still evidence that its target has already consumed one bounded search slot.
- 2026-07-23 — Target diversity is secondary to observation: a candidate is eligible only for a loss currently present in the Core-derived chain.

## Verification

- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — three tests prove deterministic first selection, history-driven `q-time → yield-quality → queue-starvation → setup-campaign` diversification, and rejection of missing/fabricated Core loss targets.
- `bun test packages/inm-core/src/design-program.test.ts --test-name-pattern '^a synthesis-seeded'` — the complete synthesis-seeded two-round proof passes; iteration 2 receives prior target history, proposes `maintenance:lithography-jobs-6` against `yield-quality`, clears all five locked cases, and is kept.
- `bun run docs:check` — 493 repository double-links resolve.
- `bun run inm validate examples/memory-fab` and `bun run inm test examples/memory-fab` — project validation and both tracked-route fixtures pass.
- Real six-round `greenfield-dram-fab` execution — immutable result `2496fac121df9f160ef612db708f0f157ed437aae569093f0ba4e4173cd8a649`; target sequence `q-time → yield-quality → queue-starvation → setup-campaign → queue-starvation → yield-quality`; decisions `KEEP, KEEP, KEEP, KEEP, REJECT, REJECT`; best iteration 4 improves the seed by `+35.81790937301585` across the locked five-case Benchmark.
- `inm design ... --run-id 2496fac... --section iterations --json` and the running Studio API return the same six ordered strategy, target, and decision records.
- `bun run test` — 187 tests / 1585 assertions, documentation, all TypeScript projects, and 8 Ironworks fixtures pass.

## Progress log

- 2026-07-23 — Plan created and activated from post-CONWIP driver evidence and read-only locked-benchmark probes.
- 2026-07-23 — Provider API V3, addressed-loss history, target-diversified ranking, maintenance/setup decision families, project candidates, tests, and design documentation implemented.
- 2026-07-23 — Acceptance audited against focused tests, complete regression, project fixtures, CLI/Studio parity, and real six-round result `2496fac121df`; stale pre-V3 result `e7c9c08e5272` moved recoverably to the system Trash.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
