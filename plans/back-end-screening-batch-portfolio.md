# Back-end screening batch portfolio

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/batch-processing]], [[docs/design/observation-led-design]], [[examples/memory-fab]].

## Outcome

Give the exhausted memory-fab WIP Design Program a physically explicit burn-in batch-size portfolio that can reduce the two dominant back-end inventory exposures without buying the result through late delivery or hidden Process resizing.

## Context

Compatible Run `093-simulate` scores `27.834` average WIP at `-41.752`; `burn-in-1.package-input` and `packaging-1.die-input` contribute the leading physical exposure. Typed observation and the Factory replay both locate material stacks along the packaging-to-burn-in work cell, while the Device inspector identifies `burn-in-1` as a shared two-operation work center running fixed eight-device jobs.

The current Program only tries CONWIP `5/4` and `4/3`. Those interventions reduce packaging-input WIP but leave burn-in-input WIP unchanged and fail the locked on-time-service guardrail. The next bounded hypothesis must therefore change back-end service structure rather than merely suppressing front-end release.

## Scope

### In scope

- Add explicit project-local four-device commercial and performance-mix screening Processes with fixed timing, inputs, and outputs.
- Qualify those Processes on the existing burn-in asset without changing the commissioned Blueprint until a guarded Candidate is promoted.
- Expand `back-end-wip-convergence` into recipe alternatives for commercial-only, performance-only, and combined small-batch screening.
- Evaluate the alternatives against the exact Objective target and all five locked Benchmark cases.
- Update project and batch-processing guidance with the observed result and retained boundary.

### Out of scope

- Implicitly resizing a running batch, partial Process completion, or weakening the on-time-service guardrail.
- Adding a second burn-in rack, changing factory power capacity, or redesigning the packaging cell in this plan.
- General-purpose automated factory generation or autonomous optimization.

## Acceptance

- [x] The project validates with both new fixed Processes qualified but unused by the commissioned Blueprint.
- [x] Design evaluates three distinct recipe interventions against `burn-in-1.package-input` and reports exact target deltas plus locked-case decisions.
- [x] Only a zero-regression leader may become a reviewable Candidate; otherwise the bounded rejection evidence remains authoritative.
- [x] CLI, Studio project evidence, project tests, docs checks, and the full repository suite remain green.

## Work

- [x] Author and validate the two project-local fixed small-batch Processes.
- [x] Replace the exhausted release-only proposal provider with the three-recipe intervention portfolio.
- [x] Run the current Design Program and inspect target, service, and promotion evidence.
- [x] Commission a safe winner or retain the exact bounded blocker; refresh current Run and Workbench evidence.
- [x] Update durable docs and complete the regression audit.

## Findings and decisions

- 2026-07-29 — Run `093-simulate` reports `9.781` average packaged-device inventory at the burn-in input and `7.966` average known-good-die inventory at the packaging input; together they account for about 71% of the Objective WIP penalty.
- 2026-07-29 — CONWIP `5/4` lowers packaging-input average inventory from `7.966` to `3.764` but leaves burn-in-input inventory at `9.781` and loses on-time lots in steady-production, lithography-interruption, and facility-interruption.
- 2026-07-29 — Factory replay at roughly `157s` visibly shows material stacks through the packaging/burn-in work cell. The burn-in inspector reports one shared rack, two fixed eight-device operations, `68.3%` run utilization, and `14s` across three changeovers; the next experiment therefore targets batch service structure before capital duplication.
- 2026-07-29 — Small batches will be separate immutable Processes. The plan will not reinterpret the existing eight-device Process as a variable or partial batch.
- 2026-07-29 — Design Run `d9f46615a929e19893e8b4c2eb102242cf1c66c930e6ca156564021d7059f840` rejects all three alternatives. Performance-only and dual-small-batch bindings worsen the targeted burn-in inventory to `15.557` and `16.182`; commercial-only lowers it to `0.973` but loses `74` points of delivery value and regresses the leader by about `55.065`.
- 2026-07-29 — No Candidate is emitted and the commissioned Blueprint remains unchanged. Run `094-simulate` re-establishes source-current factory evidence with the original `30.884` score, `27.834` average WIP, and 88 delivered devices.
- 2026-07-29 — Adding unused qualified Process options changes project-wide catalog hashes and makes unrelated prior Design authority stale. This is an operational evidence-compatibility problem, not a reason to weaken or silently reuse strict evidence; it will be handled in a separate indexed plan.
- 2026-07-29 — Continuation Run `1accbacf475e36bf6998654102dc5d23f51a123eb3028a3157a4e8d4be9a2bfd` reuses the complete three-candidate prefix and records the provider frontier as exhausted without another Candidate evaluation.

## Verification

- `bun run inm validate examples/memory-fab --json`
- `bun test packages/inm-core/src/design-program.test.ts packages/inm-core/src/design-proposal-provider.test.ts`
- `bun run memory-fab:relock-benchmarks`
- `bun run inm design examples/memory-fab --program back-end-wip-convergence --run --max-candidates 3 --progress human --json`
- `bun run inm design examples/memory-fab --program back-end-wip-convergence --run-id d9f46615a929e19893e8b4c2eb102242cf1c66c930e6ca156564021d7059f840 --continue --max-candidates 1 --progress human --json`
- `bun run inm simulate examples/memory-fab --json`
- `bun run test` — 308 tests, 3289 assertions, 1129 documentation links, and 8 Ironworks scenarios passed.
- `bun run inm test examples/memory-fab` — batch-formation and re-entrant inspection/rework scenarios passed.
- Studio manual check — `/memory-fab/factory?run=094-simulate` loaded the current Run and Objective evidence from the already-running managed service.

## Progress log

- 2026-07-29 — Plan created after typed and spatial observation of compatible Run `093-simulate`.
- 2026-07-29 — Authored two fixed small-batch Processes, relocked the intentional catalog change, and completed the three-candidate locked Design Run.
- 2026-07-29 — Retained the bounded negative result, refreshed current Run `094-simulate`, and updated durable project and batch semantics.
- 2026-07-29 — Confirmed frontier exhaustion, completed full regression, and verified the current Factory route in the running Studio.

## Completion

The project now retains two explicit four-device screening Processes and immutable evidence that none of the three bounded bindings is safe at the commissioned operating point. The existing eight-device recipes remain commissioned, Run `094-simulate` is current, and Studio exposes the result without restart. Selection-scoped evidence compatibility is intentionally deferred to a separately indexed plan because the project-wide catalog hash currently invalidates unrelated Design authority when an unused option is added.
