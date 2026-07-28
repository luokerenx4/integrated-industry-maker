# Reusable Benchmark worker pool

- Status: `proposed`
- Updated: `2026-07-28`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/design-programs]], and [[docs/design/development-operations]].

## Outcome

Keep one bounded isolated worker set alive for the seed and every Candidate wave inside a single Benchmark/Design operation so humans and Agents do not repeatedly pay worker startup, module loading, and cold runtime costs.

## Context

[[plans/parallel-benchmark-case-execution]] reduced one-Candidate Design latency by running independent locked cases concurrently. [[plans/revocable-device-program-context]] then reduced a same-project five-case Candidate wave from median `2111.8ms` to `1783.2ms`, but the complete Design improved only from median `3.90s` to `3.79s`.

`executeBenchmarkCaseWorkers()` currently constructs and terminates one Worker per case on every call. A one-Candidate Design invokes it once for the seed and once for the Candidate; a longer Design repeats that cold wave for every iteration. The worker protocol already accepts multiple messages, but Core has no operation-scoped executor lifecycle.

## Scope

### In scope

- One bounded operation-scoped worker pool shared across prepared seed and Candidate evaluations.
- Exact per-job project/selection/Blueprint/seed identity and manifest-ordered aggregation.
- Pool-wide cancellation, worker failure replacement or terminal failure, and guaranteed final disposal.
- Honest progress/timing that separates startup from case compile/evaluation.
- Same-project one- and multi-Candidate memory-fab before/after measurement.

### Out of scope

- Cross-operation/global worker reuse, distributed workers, or parallel mutation inside one simulation.
- Candidate-result caching, approximate evaluation, proposal automation, or weakened locked cases.
- Compatibility with the current internal one-call worker lifecycle.

## Acceptance

- [ ] One Design operation creates at most its bounded concurrency in workers and reuses them across seed and Candidate waves.
- [ ] Reuse preserves exact Benchmark results, driver traces, Design manifests/hashes, progress authority, and cancellation semantics.
- [ ] CLI and Studio expose startup/reuse honestly without making operational lifecycle immutable evidence.
- [ ] Same-project memory-fab Design wall time improves materially beyond the current `3.79s` median and multi-Candidate savings compound.
- [ ] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [ ] Measure worker startup, module-load, compile, evaluation, and idle reuse boundaries.
- [ ] Add an explicit disposable Benchmark case executor and integrate it with Design operation ownership.
- [ ] Prove parity, cancellation, failure cleanup, and progress semantics.
- [ ] Complete real CLI/Studio measurement, full verification, commit, and push.

## Findings and decisions

- 2026-07-28 — The worker entry already remains message-capable after one result; the repeated lifecycle is parent-owned rather than a worker protocol limitation.
- 2026-07-28 — Reuse must remain operation-scoped. A global pool would retain project modules across unrelated source identities and obscure source-current development behavior.

## Verification

- Current same-project five-case Candidate wave — median `1783.2ms`.
- Current same-project one-Candidate `back-end-die-handoff` Design — median `3.79s`.

## Progress log

- 2026-07-28 — Proposed from the gap between Device-boundary CPU savings and end-to-end Design wall time.

## Completion

Complete after every acceptance item has direct evidence and the implementation is committed and pushed.
