# Batch-formation Design intervention

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/batch-processing]], and [[docs/design/coding-agent-optimization]].

## Outcome

When `batch-formation` emerges in an improved memory-fab loss chain, Design can investigate at least one explicit Blueprint-owned batch or recipe intervention through the complete locked Benchmark and preserve the resulting evidence for both CLI Agents and Studio operators.

## Context

The completed loss-intervention portfolio keeps CONWIP, lithography preventive maintenance, a tighter CONWIP loop, and lithography setup campaigning. Its iteration-four best improves the greenfield seed by `+35.817909`, after which the driver chain becomes `queue-starvation → yield-quality → batch-formation → q-time → setup-campaign`.

The simulator and Blueprint already model preferred fixed batches, bounded tail draining, and alternative rapid single-lot anneal Processes. The Design provider has no candidate annotated for `batch-formation`, so it cannot tell whether the new signal should be addressed through formation policy, recipe qualification, or deliberately left alone because robust cases reject the trade. The intervention must be derived from current-best measurements and locked probes rather than copied blindly from the focused batch fixture.

## Scope

### In scope

- Measure the improved greenfield best's batch holds, timeout releases, furnace work, Route Q-time, and locked-case sensitivity.
- Inventory the exact Blueprint-owned batch-formation and qualified-recipe controls available on that best.
- Add a deterministic project-local candidate only if a locked probe establishes a credible intervention and honest `batch-formation` target.
- Preserve the resulting proposal, KEEP/REJECT evidence, and human/AI projection through the existing Design Run contract.

### Out of scope

- Adding new batch simulation physics or changing the fixed workload to make a candidate win.
- Treating a ranked batch signal as proof that smaller batches are automatically better.
- Bypassing the locked Benchmark or automatic Candidate review/apply boundary.

## Acceptance

- [x] Current-best evidence identifies the concrete source of batch-formation loss and the controllable Blueprint boundary.
- [x] Any added candidate has a measured rationale, compiles only when its required furnace/recipe surface exists, and declares `batch-formation` only while that bucket is observed.
- [x] Complete locked-case evaluation records an honest KEEP or REJECT without weakening gates; absence of a robust improvement is an acceptable investigated result.
- [x] CLI and Studio expose the same immutable iteration evidence, and focused plus full regression pass.

## Work

- [x] Reopen the iteration-four best and measure batch-specific driver evidence.
- [x] Probe discrete policy and recipe alternatives against the locked Benchmark.
- [x] Implement only the evidence-backed candidate and any required decision-family contract.
- [x] Update design documentation, fixtures, and cross-surface tests.
- [x] Run real Design and full regression; audit acceptance before completion.

## Findings and decisions

- 2026-07-23 — The signal appears only after four earlier interventions are kept. Investigation must start from immutable result `2496fac121df9f160ef612db708f0f157ed437aae569093f0ba4e4173cd8a649`, not the original seed.
- 2026-07-23 — The best driver runs three full three-lot furnace jobs with no formation-policy holds or timeouts. Its `40.178 s/lot` batch wait is companion-arrival queueing, not a stranded tail; nine lots cross the furnace while three remain elsewhere in the Route.
- 2026-07-23 — Rapid single-lot anneal removes reported batch wait but regresses the complete five-case aggregate and loses about `12.31` points versus iteration 4 under lithography interruption. Reducing one driver signal is not sufficient evidence to KEEP.
- 2026-07-23 — Across bounded dual-recipe waits, thirty seconds is the least-regressive choice. From exact iteration 3 it reduces driver batch wait to `7 s/lot` and improves steady, mixed-quality, and quality-excursion cases by about `+0.2943` each, but loses about `12.60` in lithography interruption and `1.61` aggregate. Design should evaluate and preserve this honest REJECT before continuing to setup control.

## Verification

- Exact iteration-four driver replay — three full three-lot furnace jobs, nine furnace lots, `40.177778 s/lot` mean batch queue wait, zero explicit formation holds/timeouts, six completed lots, and six lots still elsewhere in the Route.
- Read-only discrete locked probes — rapid-only plus dual-recipe waits from 12–60 seconds were evaluated from exact iteration 3 and iteration 4 states. Thirty seconds was least-regressive: `7 s/lot` driver batch wait and about `+0.2943` in three ordinary/quality cases, but about `-12.5969` versus iteration 3 under lithography interruption and `-1.612859` aggregate.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — deterministic target diversification now proposes the compileable batch candidate before setup, then continues after its recorded REVERT.
- `bun test packages/inm-core/src/design-program.test.ts --test-name-pattern '^a synthesis-seeded'` — exact five-round Design runs twice deterministically; iteration 4 targets batch formation and REJECTs, iteration 5 targets setup and KEEPs, immutable reopening and Candidate promotion remain exact.
- Real six-round `greenfield-dram-fab` execution — immutable result `0680bb01a58f3fe85a0bed16cc94541f21d000b642c915972eff2189b2a3bd3a`; decisions `KEEP, KEEP, KEEP, REJECT, KEEP, REJECT`; the rejected batch experiment leaves the final best unchanged at `+35.81790937301585` over seed.
- `inm design ... --run-id 0680bb... --section iterations --json` and the running Studio API return the same ordered loss target, strategy, and decision records.
- `bun run test` — 187 tests / 1591 assertions, 499 resolved documentation links, all TypeScript projects, and 8 Ironworks fixtures pass.
- `bun run inm test examples/memory-fab` — both tracked-route memory-fab fixtures pass.

## Progress log

- 2026-07-23 — Proposed from the first new unserved loss bucket exposed by the completed diversified portfolio; no implementation started.
- 2026-07-23 — Activated after exact-best driver replay and read-only discrete locked probes identified the thirty-second dual-recipe candidate and its expected robust rejection.
- 2026-07-23 — Batch decision family, guarded three-operation furnace patch, project portfolio ordering, five-round deterministic integration proof, documentation, and real six-round evidence implemented; all acceptance items audited.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
