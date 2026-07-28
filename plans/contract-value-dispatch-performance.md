# Contract-value dispatch performance

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/delivery-contracts]], [[docs/design/work-center-dispatch]], and [[plans/current-simulator-settle-loop-performance]].

## Outcome

Evaluate each contract-value Device against one exact same-state delivery-commitment snapshot so industrial recipe choice remains deterministic and evidence-identical without repeatedly scanning every Device, buffer, active output, and transit inside sort comparisons and readiness checks.

## Context

Static settle and power indexes reduced warm five-case memory-fab evaluation from `1087.65ms` to `710.74ms`. The resulting current profile moved the next dominant measured cost into `selectCampaignProcessPlan` (`18.6%`) and `selectProcessPlan` (`16.3%`).

The expensive branch is narrower than those totals suggest: `contract-value` ranking calls `contractWindowContribution` for both sides of each comparison, and each contribution independently calls `contractCommitted`. The five-case profile attributes `14.7%` to the contract-value sort line, `7.8%` to buffered commitment scanning, and `5.5%` to active-output scanning. The same exact commitment value is recomputed several times while no material state can change.

This is a framework deficiency, not a memory-fab-specific shortcut. Contract-value dispatch needs an explicit evaluation boundary: every ranking key and readiness check in one synchronous Device evaluation must share the same authoritative factory state.

## Scope

### In scope

- One invocation-local snapshot of delivered, buffered, in-transit, and active-output commitment for Objective delivery contracts.
- Reuse of that snapshot through contract-window ranking, material readiness, tooling/utility blocking checks, production readiness, and changeover eligibility in the same Device evaluation.
- Exact ordering, event, state, metric, trace, Benchmark, and immutable Design parity.
- Current memory-fab single-case, five-case, CLI, and Studio measurement.

### Out of scope

- Cross-tick or cross-Device caching, approximate commitment values, skipped readiness checks, or relaxed locked evidence.
- Changing the meaning or weights of contract-value dispatch.
- Autonomous factory design or a memory-fab-only special case.
- Compatibility aliases for replaced internal function signatures.

## Acceptance

- [x] The current profile and call boundary are recorded with reproducible evidence.
- [x] One Device evaluation computes each relevant contract commitment from one exact factory-state snapshot.
- [x] Warm five-case memory-fab evaluation materially improves at the measured contract-dispatch boundary.
- [x] Identical inputs retain byte-identical events, final state, metrics, traces, Benchmark results, and Design hashes.
- [x] CLI and Studio retain honest, reconnectable, source-current operation behavior.
- [x] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [x] Capture the current baseline and exact contract-dispatch call evidence.
- [x] Implement and thread the invocation-local commitment snapshot through Device selection.
- [x] Prove exact parity and re-profile the same single and five cases.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — The snapshot boundary is one synchronous `tryEvaluate(Device)` call. Campaign and cadence bookkeeping may change inside that call, but delivered material, buffers, transits, and active job outputs do not change before the production decision is returned.
- 2026-07-29 — The snapshot remains a derived read model. Simulator mutations and final industrial authority continue to live only in `FactoryState`, events, and metrics.
- 2026-07-29 — Static Device, buffer, connection, logistics-network, and region delivery-resource indexes keep snapshot construction allocation-light without introducing cross-Device or cross-tick cache invalidation.
- 2026-07-29 — Only Devices authored with `contract-value` dispatch capture the snapshot. Other dispatch modes retain their prior path and cost.

## Verification

- Warm five-case evaluation: `699.75ms` before and `611.22ms` after, a `12.65%` reduction at the same input and measurement boundary.
- Same five-case CPU profile: `7.32s` before and `6.51s` after. `selectCampaignProcessPlan` fell from `18.6%` to `5.0%`, `selectProcessPlan` from `16.3%` to `3.1%`, and the prior `14.7%` repeated contract-value sort hot line disappeared from the dominant boundary.
- Exact parity: all five event counts, evaluation hashes, and complete trace hashes are identical before and after.
- `bun test packages/inm-core/src/inm-core.test.ts --timeout 30000`
- `bun run check:fast` — documentation, TypeScript, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — completed in `1.62s`; all five cases retained Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Studio source-current locked evaluation at `http://127.0.0.1:4176` — operation `ms4vbh8d-d0e` evaluated ten seed/Candidate cases in `0.93s` after a `20ms` cold-worker start; reload recovered the result and the browser console had no warnings or errors.
- `bun run test` — documentation and TypeScript checks, `283` tests with `3169` expectations, and all eight Ironworks fixtures passed in `209.75s`.

## Progress log

- 2026-07-29 — Activated from the post-settle-index profile on clean `main` at `e360b5a`.
- 2026-07-29 — Replaced repeated same-state scans with one exact invocation-local contract commitment snapshot and proved identical locked evidence.
- 2026-07-29 — Completed CLI, Studio recovery, browser-console, focused, fast, and full repository verification.

## Completion

Completed on `main` after exact evidence parity, measured runtime reduction, CLI/Studio recovery checks, and full repository verification.
