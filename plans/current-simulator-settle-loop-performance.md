# Current simulator settle-loop performance

- Status: `proposed`
- Updated: `2026-07-28`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/development-operations]], and [[plans/reusable-benchmark-worker-pool]].

## Outcome

Re-profile the current exact memory-fab simulator after Device-context and worker-lifecycle improvements, then remove the next dominant settle/event hot-path cost without changing industrial events, state, metrics, hashes, or locked decisions.

## Context

[[plans/simulator-hot-path-performance]] removed redundant Device-context freezing against an older sequential profile. [[plans/revocable-device-program-context]] later removed whole-context cloning, [[plans/parallel-benchmark-case-execution]] isolated locked cases, and [[plans/reusable-benchmark-worker-pool]] removed repeated Worker cold starts.

A current warm `back-end-die-handoff` Candidate wave now averages `1237ms` per parallel case. Parent and worker compilation use about `77ms`, comparison uses `2ms`, and exact simulation evaluation still uses `1155ms` (`93%`). The previous clone/freeze profile is no longer authoritative enough to choose the next intervention.

## Scope

### In scope

- A fresh sampled CPU/allocation profile of one representative warm memory-fab case and its five-case wave.
- Attribution to exact settle passes, event families, state projection, metrics integration, or other measured simulator paths.
- One bounded structural optimization chosen from the current profile.
- Exact event, state, metric, trace, Benchmark, and immutable Design parity.
- Current one- and multi-Candidate CLI/Studio measurement.

### Out of scope

- Approximate simulation, skipped events/cases, Candidate-result caching, relaxed locked evidence, or autonomous factory design.
- Repeating the removed deep-freeze, whole-context clone, case-serialization, or worker-cold-start interventions.
- A compatibility path for an internal hot-path representation replaced by the measured change.

## Acceptance

- [ ] A current profile names the dominant exact function/event family and allocation boundary with reproducible evidence.
- [ ] One implementation materially reduces warm memory-fab evaluation time at the measured boundary.
- [ ] Identical inputs retain byte-identical events, final state, metrics, traces, Benchmark results, and Design hashes.
- [ ] CLI and Studio retain honest progress, cancellation, and source-current operation behavior.
- [ ] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [ ] Capture current warm single-case and five-case CPU/allocation profiles.
- [ ] Select and implement the smallest structural change that addresses the measured dominant cost.
- [ ] Prove exact parity and measure adjacent old/current one- and multi-Candidate operations.
- [ ] Complete CLI/Studio QA, full verification, commit, and push.

## Findings and decisions

- 2026-07-28 — Warm worker reuse leaves evaluation at `1155ms` of `1237ms` average case duration; compile and comparison are already bounded and are not the next intervention.
- 2026-07-28 — Earlier Device clone/freeze profiles are completed historical evidence, not authority for the current simulator shape.

## Verification

- Current human/NDJSON `back-end-die-handoff` run — five warm Candidate cases averaged `1237.4ms` duration, `77.3ms` compile, `1155.4ms` evaluation, and `2.0ms` comparison.

## Progress log

- 2026-07-28 — Proposed from the post-worker-pool timing boundary.

## Completion

Complete after every acceptance item has direct evidence and the implementation is committed and pushed.
