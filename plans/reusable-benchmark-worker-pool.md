# Reusable Benchmark worker pool

- Status: `completed`
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

- [x] One Design operation creates at most its bounded concurrency in workers and reuses them across seed and Candidate waves.
- [x] Reuse preserves exact Benchmark results, driver traces, Design manifests/hashes, progress authority, and cancellation semantics.
- [x] CLI and Studio expose startup/reuse honestly without making operational lifecycle immutable evidence.
- [x] Same-project memory-fab Design wall time improves materially beyond the current `3.79s` median and multi-Candidate savings compound.
- [x] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [x] Measure worker startup, module-load, compile, evaluation, and idle reuse boundaries.
- [x] Add an explicit disposable Benchmark case executor and integrate it with Design operation ownership.
- [x] Prove parity, cancellation, failure cleanup, and progress semantics.
- [x] Complete real CLI/Studio measurement, full verification, commit, and push.

## Findings and decisions

- 2026-07-28 — The worker entry already remains message-capable after one result; the repeated lifecycle is parent-owned rather than a worker protocol limitation.
- 2026-07-28 — Reuse must remain operation-scoped. A global pool would retain project modules across unrelated source identities and obscure source-current development behavior.
- 2026-07-28 — Every job still reloads and compiles its exact project selection and Blueprint. Reuse retains only the already-started Bun Worker runtime; it is not Candidate, compile, or simulation caching.
- 2026-07-28 — A worker sends an explicit `ready` message. First-wave timing reports measured spawn-to-ready startup, while later waves report `warm worker`; both remain operation progress and never enter immutable evidence.
- 2026-07-28 — Any failed or cancelled wave terminates the complete pool before another wave may create replacements. This prevents late responses from an abandoned job entering later work and keeps active worker count bounded.

## Verification

- Current same-project five-case Candidate wave — median `1783.2ms`.
- Current same-project one-Candidate `back-end-die-handoff` Design — median `3.79s`.
- Fresh pre-change `back-end-die-handoff` one-Candidate Design — CLI operation `3559.8ms`, process wall `3.72s`.
- Fresh pre-change `commissioned-dram-fab` three-Candidate Design — CLI operation `6900.5ms`, process wall `7.06s`.
- Adjacent detached-HEAD/current one-Candidate comparison — old median `3684.2ms`, current median `3522.3ms` (`4.4%` faster); both produced `f928bd8affe8…`.
- Pre-warmed adjacent detached-HEAD/current three-Candidate comparison — old mean `7468.1ms`, current mean `6625.9ms` (`11.3%` faster); both produced `d8bf7367bc5c…`.
- Human CLI progress — seed cases reported five cold workers with `20–21ms` startup; Candidate cases reported the same five warm slots and completed in `1171–1281ms`.
- Browser Studio Design QA — operation `ms4u0tkc-006…` completed `15/15` with immutable result `f928bd8affe8…`; the retained last Candidate displayed `parallel ×5 · warm worker · 1161 ms`, reload recovered the same operation/result, and browser logs contained no warnings or errors.
- `bun run check:fast` — `976` documentation links, all five TypeScript projects, and `30` tests / `179` assertions passed in `11.9s`.
- `bun run test` — documentation, all five TypeScript projects, `283` tests / `3442` assertions across `21` files, and all eight Ironworks CLI fixtures passed; the serialized package suite took `314.42s`.

## Progress log

- 2026-07-28 — Proposed from the gap between Device-boundary CPU savings and end-to-end Design wall time.
- 2026-07-28 — Activated after confirming every current parallel case creates a fresh Worker and a one-/three-Candidate memory-fab Design takes `3.72s` / `7.06s` wall.
- 2026-07-28 — Implemented operation-scoped reuse, explicit ready/cold/warm timing, failure replacement, cancellation cleanup, CLI/Studio projection, and exact one-/multi-Candidate old/current comparisons.
- 2026-07-28 — Completed full repository verification, current-source Studio QA, commit, and push.

## Completion

Completed. One Design operation now owns at most its bounded parallel worker count, reuses those runtimes across its exact seed and Candidate waves, resets the complete set after failure or cancellation, and disposes it at the operation boundary. Each job still reloads and compiles its own exact project/selection/Blueprint/seed identity, so runtime reuse cannot become hidden Candidate or simulation evidence.

CLI and Studio distinguish cold startup from warm reuse. The one-Candidate comparison improved by `4.4%`; the three-Candidate comparison improved by `11.3%`, demonstrating that savings compound with the number of deliberate design iterations. Old and current executions retained identical immutable result hashes in both comparisons.

The remaining warm Candidate case spends about `1155ms` of `1237ms` in exact evaluation rather than compilation or comparison. That current post-clone, post-parallel, post-pool profile is tracked separately in [[plans/current-simulator-settle-loop-performance]].
