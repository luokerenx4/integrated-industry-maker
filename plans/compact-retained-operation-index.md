# Compact retained operation index

- Status: `proposed`
- Updated: `2026-07-29`
- Related design: [[docs/design/operation-workbench]], [[docs/design/development-operations]], and [[plans/low-friction-experiment-loop]].

## Outcome

Let Studio list and reconnect retained operations from bounded lightweight lifecycle records without reading every dense Benchmark, Candidate, or Design result.

## Context

The current `.inm/operations/<id>.json` snapshot combines lifecycle state, progress history, and the complete industrial result. The memory-fab retained set occupies roughly `9–13MB`; individual Benchmark snapshots are about `360KB` and Design snapshots approach `2MB`. Listing recent operations reads and parses every complete snapshot only to discard `progressLog` and `result`.

The current live cost is measurable but secondary: listing sixteen summaries takes roughly `18–25ms`, below the synchronous simulation stall addressed by [[plans/responsive-studio-experiment-execution]]. The coupling will scale with denser evidence and should be removed before operation retention or result density grows.

## Acceptance

- [ ] Lifecycle listing reads bounded summary/state records without deserializing dense results.
- [ ] Exact operation reads still recover progress history and complete results after restart.
- [ ] Atomic completion never exposes a summary that claims an unavailable result.
- [ ] Retention removes every component of an expired operation.
- [ ] Existing pre-release combined snapshots are removed rather than supported through a compatibility path.
- [ ] Memory-fab retained-list bytes, parse time, reconnect behavior, and full verification are recorded.

## Work

- [ ] Design the state/progress/result persistence boundary.
- [ ] Replace the combined snapshot format and remove its read/write path.
- [ ] Verify active polling, completion, interruption, restart, and pruning.
- [ ] Complete real memory-fab and repository verification.

## Findings and decisions

- 2026-07-29 — Registered separately because measured retained-list parsing is not the primary experiment interaction stall.

## Verification

Pending.

## Completion

Pending.
