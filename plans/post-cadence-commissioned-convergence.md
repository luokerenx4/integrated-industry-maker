# Converge the commissioned fab after cadence control

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/design-programs]], [[docs/design/production-modes]], [[docs/design/work-center-dispatch]], and [[docs/design/operator-workbench]].

## Outcome

The exact commissioned memory fab after sustained-starvation cadence control can continue its bounded optimization loop from current evidence: remaining input gaps are either converted into a promotion-safe improvement through an explicit industrial intervention or retained as an exact non-actionable boundary, with the same causal decision visible to humans and Agents.

## Context

Compatible run `078-simulate` completes all `12/12` scheduled lots, satisfies the static capacity plan, and overfulfills the value-weighted portfolio, but still ranks productive-equipment input starvation first at signal `0.217643`. Eight of ten active flow Devices accumulate `257.876 s` of event-backed input gaps inside `1184.860 s` of observed opportunity; `furnace-1` leads with `42.456 s` across twelve jobs.

The newly commissioned ALD controller already debounces transient coverage and uses only two recovery jobs. Its exact proposal is therefore exhausted on the live Blueprint. The existing project provider can still offer release, batch-formation, dispatch, maintenance, and physical-capacity interventions, but their old historical outcomes cannot authorize a decision against the new Blueprint and engine identity.

## Scope

### In scope

- Run a fresh immutable commissioned Design frontier from Blueprint `dea38a4fd312432e153a9de79ddc7de6dc9c44286c08759b0f9f700e446ea71d` and locked Benchmark `greenfield-dram-design`.
- Audit each remaining intervention against exact per-case score, hard outcomes, current-best zero-regression, and measured loss causality.
- If the existing portfolio exhausts without a useful leader, add a physically explicit project-local TypeScript intervention derived from the remaining furnace/deposition/inspection gap evidence.
- Preserve the strict separation between useful idle headroom, batch companion waiting, unavailable equipment time, and event-backed inter-job starvation.
- Expose any new policy and measured activation through shared Core evidence, CLI, and Studio.
- Commission only a non-empty, reviewed `KEEP` Candidate and regenerate one compatible operating run.

### Out of scope

- Weakening the five locked cases, current-best zero-regression, or absolute industrial outcomes.
- Treating idle time alone as proof of lost output.
- Changing evaluator weights to make a proposal win.
- Reintroducing compatibility for historical evidence.

## Acceptance

- [x] A fresh Design Run evaluates the current live Blueprint rather than reopening historical cadence evidence.
- [x] Remaining input-gap causality is tied to an explicit intervention or an exact bounded blocker; no repeated or no-op proposal is presented as progress.
- [x] Any leader improves every current-best locked case and passes every hard industrial outcome with a non-empty promotion patch.
- [x] Human Studio and Agent CLI expose the same intervention, per-case decision, and relevant measured operating evidence.
- [x] Project validation, memory-fab tests, focused tests, full regression, browser acceptance, documentation, Git, and remote verification pass.

## Work

- [x] Execute and inspect the fresh commissioned frontier.
- [x] Repair the project proposal portfolio if the current frontier cannot act on the measured loss.
- [x] Review, commission, and simulate only a promotion-safe leader, or retain the exact blocker.
- [x] Verify both operator surfaces and complete the repository workflow.

## Findings and decisions

- 2026-07-24 — Static capacity is ready and all twelve tracked lots complete, so the remaining `input-starvation` bucket is an optimization signal, not evidence of unmet demand. Candidate value must be proven through Objective and service outcomes rather than assumed from fewer idle ticks.
- 2026-07-24 — The current ALD cadence proposal is intentionally non-repeatable on the commissioned Blueprint. A fresh frontier must diversify into another physical/control decision instead of rewriting the same recipe pair.
- 2026-07-24 — Fresh Design Run `fb2f83859df5c22beec4f378ea93ffae4a99756b8ffe3ba94d777cfa975a36d6` evaluates four eligible current-Blueprint proposals and exhausts the seed. `9/6`, `8/5`, and `10/7` CONWIP controls regress every current-best case; inspection maintenance improves steady and mixed operation but regresses quality and both interruption cases. The promotion patch remains empty.
- 2026-07-24 — Project-local TypeScript research sweeps furnace companion waits of `0, 0.5, 1, 1.5, 2, 3, 5, 7, 10, 15 s`. The best nonzero wait, `1.5 s`, reduces mixed-quality furnace starvation from `42.456 s` to `30.956 s` but still regresses aggregate score `-0.573198` and the limiting case `-1.521422`.
- 2026-07-24 — No wait below `15 s` forms a three-lot batch; it only adds timeout holds. At `15 s`, two full batches process six lots, but aggregate score regresses `-11.925941`, the limiting case regresses `-13.218667`, and hard outcomes fail. Remaining furnace idle is therefore necessary service headroom under the current release wave, not a free utilization win.
- 2026-07-24 — No Candidate is commissioned. Studio and CLI both identify the current run as `EXHAUSTED`, list the same four rejections, and explicitly state that there is nothing honest to promote.

## Verification

- `bun examples/memory-fab/strategies/research/furnace-batch-wait.ts` — ten deterministic wait points across five locked cases; no promotable point.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 7 --json` — immutable frontier `fb2f83859df5c22beec4f378ea93ffae4a99756b8ffe3ba94d777cfa975a36d6`, `4/7`, `frontier-exhausted`, zero promotion operations.
- `bun run typecheck`
- `bun run inm test examples/memory-fab` — two project tests passed.
- Core completed without assertion failures in the repository-wide run. A saturated-host pass then hit only elapsed-time limits in four CLI tests; each passed cold, and the complete CLI package rerun passed `19/19` with `303` expectations.
- `bun test --max-concurrency=1 packages/inm-studio` — `16 pass`, `0 fail`, `160` expectations.
- `bun run inm test examples/ironworks` — eight project tests passed.
- Browser acceptance at `/memory-fab/designs/commissioned-dram-fab/runs/fb2f83859df5c22beec4f378ea93ffae4a99756b8ffe3ba94d777cfa975a36d6` showed `SEARCH EXHAUSTED`, the same four `REJECT` decisions, the zero-promotion explanation, and no warning/error console messages.
- Documentation, Git, and remote verification are recorded by the completion commit.

## Progress log

- 2026-07-24 — Plan activated from compatible run `078-simulate`, the current Workbench handoff, and the exhausted live cadence intervention.
- 2026-07-24 — Preserved the exhausted current frontier, added a typed furnace batch-wait research portfolio, and rejected utilization-only tuning with exact five-case evidence.
- 2026-07-24 — Verified the exhausted decision through CLI, Studio, browser, project tests, and package regressions.

## Completion

Completed on 2026-07-24. The current fab remains unchanged: every tested attempt to suppress its remaining furnace input gaps trades away locked service or current-best score, so the repository retains the exact blocker and directs the next Design cycle to a genuinely different intervention portfolio.
