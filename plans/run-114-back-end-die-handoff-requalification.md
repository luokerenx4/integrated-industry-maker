# Run 114 back-end die handoff requalification

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/logistics]], [[docs/design/fab-loss-attribution]], [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/design-programs]], and [[docs/design/operator-workbench]].

## Outcome

Decide whether the explicit prioritized four-die tray handoff can turn Run 114's current Probe-to-packaging blocking into factory value, retain the exact current result as Investigation-owned evidence, and advance the shared Workbench without rediscovering the obsolete Run 091 conclusion.

## Context

Current compatible Run `114-candidate-trial-run-112-dimensional-stability` ranks transport blocking fourth after three exact Investigation dispositions. Connection `probe-to-packaging` still delivers all `96` known-good dies at `10%` nominal utilization, but accumulates `118,200` blocked item-ticks: `73,600` line contention, `36,400` endpoint capacity, `8,200` endpoint power, and no endpoint failure. Across the factory, three connections now total `218,601` blocked item-ticks.

The existing `back-end-die-handoff` Program encodes a deliberate four-position tray plus endpoint priority-eight intervention, but its provider is pinned to obsolete Run 091 facts and all twelve retained Design Runs are invalid under the current execution contract. The historical result—that local blocking can reach zero while explicit capital/energy costs fail a uniform zero-regression guard—remains useful context, not current authority.

## Scope

### In scope

- Bind Run 114's exact transport diagnostic, current hashes, causal partition, source-lot outcome, and spatial Probe/packaging work cell.
- Create an append-only Investigation for current observation, hypothesis, Candidate evidence, comparison, and explicit KEEP/revise/defer/discard judgment.
- Requalify only the existing explicit prioritized four-die tray intervention through the unchanged five-case locked Benchmark and current-factory TRIAL Run.
- Preserve the old invalid Design evidence as history while making the new current identity inspectable through CLI and Studio.
- Advance the shared Workbench to the next non-dispositioned diagnostic after an explicit decision.

### Out of scope

- Generic transport-semantic changes, implicit logistics, automatic layout generation, or black-box search.
- Weakening the uniform zero-regression guard, Objective limits, service gates, or locked operating cases.
- Reopening the bounded Probe-cycle, Probe identity-order, release-card, or old unprioritized tray variants.
- Applying a Candidate unless current locked and current-factory evidence proves it is industrially preferable.

## Acceptance

- [x] The Investigation records exact Run 114 structured and spatial evidence before any proposal and links one falsifiable tray-handoff hypothesis to it.
- [x] The locked evaluation names the exact `connection:probe-to-packaging:transport-line-contention.blockedItemTicks` target and exposes every five-case score and hard guard.
- [x] A current Candidate TRIAL and immutable Run comparison expose transport, delivery, WIP, cycle, service, quality, cost, energy, and terminal source-lot effects.
- [x] An explicit human/Agent decision preserves the measured loss, expires with its bound identity, and deterministically advances CLI and Studio to the same next action.
- [x] Project validation, focused tests, CLI parity, Studio visual acceptance, documentation checks, and the deliberate full checkpoint pass.

## Work

- [x] Re-bind the current Workbench, compatible Run, loss contributor, Program state, and historical boundary.
- [x] Observe the Run 114 Factory overview and focused Probe-to-packaging work cell; record the Investigation observation and hypothesis.
- [x] Update the TypeScript proposal guard to current exact evidence and evaluate one locked Candidate.
- [x] Freeze a reviewed Candidate, create its parent-bound TRIAL Run, compare it to Run 114, and record an explicit decision.
- [x] Verify Workbench/CLI/Studio parity, update durable design and project documentation, and complete all checks.
- [x] Audit acceptance, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Run 114 retains the same exact `probe-to-packaging` contributor seen in Run 112: `118,200` blocked item-ticks (`73,600 / 36,400 / 8,200 / 0`) while delivering all `96` dies. The broader bucket changed because downstream customer lines now contribute too; the focused Program remains aligned to the Probe handoff rather than the aggregate bucket.
- 2026-07-31 — Old Design authority `f380b7f17083…` and its siblings are invalid under `inm-sim/0.93.1`. Their negative result constrains the hypothesis but cannot disposition the current diagnostic.
- 2026-07-31 — The two endpoints are spatially adjacent to Probe and Packaging. Packaging receives all 96 dies and waits 96 seconds for material without its own power, failure, or output blockage; Burn-in retains the terminal eight-device lot-07 WIP boundary. This makes downstream service, not local lane smoothness, the required value test.
- 2026-07-31 — Locked evaluation `743ed04e5b8c…` reduces the exact `118,200`-tick contributor to zero. The immutable review is Benchmark `KEEP`, yet its current-factory section is `REGRESSED`: every current case loses score only through added build cost and energy.
- 2026-07-31 — TRIAL Run `116-candidate-trial-run-114-prioritized-four-die-tra` preserves 88 deliveries, `22/min` throughput, `59,598.5`-tick mean cycle, and `49.1905` average WIP, while adding 40 build cost, `18,099.5 mJ` energy, and `62,789` unpowered Device-ticks. Human/Agent decision `discard-prioritized-four-die-tray` retains the sorter endpoints.
- 2026-07-31 — The exact transport diagnostic remains visible but is suppressed only for the bound current identity. Workbench now selects `shipping-power-convergence` for the substrate-receiving shipping-grid interruption.

## Verification

- `bun run inm inspect examples/memory-fab --section all --json` — current Workbench selects `back-end-die-handoff` for diagnostic `fab-loss.transport-blocking:connection:probe-to-packaging:2f7d6b19f2`.
- `bun run inm observe examples/memory-fab --json` — binds Run `114-candidate-trial-run-112-dimensional-stability`, result `89c183540d7a…`, causal hash `6347c9c8dd6f…`, and exact immutable Studio routes.
- `bun run inm design examples/memory-fab --program back-end-die-handoff --run --max-candidates 1 --progress ndjson --json` — evaluated one exact current proposal; target `118,200 → 0`, no current-best improvement, every current case regressed.
- `bun run inm candidate examples/memory-fab --candidate run-114-prioritized-four-die-tray --review --progress ndjson --json` — retained review result `86bcb3ec67ec…`; locked verdict `KEEP`, current-factory verdict `REGRESSED`, all seven outcome guards pass.
- `bun run inm compare examples/memory-fab --from-run 114-candidate-trial-run-112-dimensional-stability --to-run 116-candidate-trial-run-114-prioritized-four-die-tra --section all --json` — exact intervention-only comparison and immutable evidence anchor `6726adad828d…`.
- `bun run inm inspect examples/memory-fab --section all --json` — four current Investigation dispositions suppress only their exact diagnostics and select `shipping-power-convergence` for `fab-loss.power-interruption:…:362efbc16e`.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts --test-name-pattern "focused back-end handoff"` — pass.
- `bun run docs:check`, `bun run inm validate examples/memory-fab --json`, `bun run inm test examples/memory-fab --json`, `bun run check:fast`, and `bun run test` — pass.

## Progress log

- 2026-07-31 — Plan created after exact current reorientation and historical-authority audit.
- 2026-07-31 — Current spatial observation, exact hypothesis, locked evaluation, reviewed Candidate, parent-bound TRIAL, comparison, discard decision, and resumed factory checkpoint completed.
- 2026-07-31 — CLI/Studio parity, durable docs, full checks, and pushed checkpoint completed.

## Completion

Completed. The explicit tray removes local blocking but adds cost, energy, and power exposure without changing factory outcomes, so Run 114 retains its sorter endpoints and the Workbench advances to shipping-power convergence.
