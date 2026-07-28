# Current simulator settle-loop performance

- Status: `completed`
- Updated: `2026-07-29`
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

- [x] A current profile names the dominant exact function/event family and allocation boundary with reproducible evidence.
- [x] One implementation materially reduces warm memory-fab evaluation time at the measured boundary.
- [x] Identical inputs retain byte-identical events, final state, metrics, traces, Benchmark results, and Design hashes.
- [x] CLI and Studio retain honest progress, cancellation, and source-current operation behavior.
- [x] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [x] Capture current warm single-case and five-case CPU/allocation profiles.
- [x] Select and implement the smallest structural change that addresses the measured dominant cost.
- [x] Prove exact parity and measure adjacent old/current one- and multi-Candidate operations.
- [x] Complete CLI/Studio QA, full verification, commit, and push.

## Findings and decisions

- 2026-07-28 — Warm worker reuse leaves evaluation at `1155ms` of `1237ms` average case duration; compile and comparison are already bounded and are not the next intervention.
- 2026-07-28 — Earlier Device clone/freeze profiles are completed historical evidence, not authority for the current simulator shape.
- 2026-07-29 — A `500us` sampled five-case profile spent `31.6%` under `settle`; native `Object.values` and `Object.entries` alone consumed `12.0%` and `11.7%`. `availablePower` accounted for `11.1%`, including `generationPower` at `9.0%` and `storageDischargePower` at `3.2%`; `activePower` accounted for `8.4%`.
- 2026-07-29 — The measured allocation boundary was repeated creation, filtering, and sorting of immutable Device, power-grid, and sorter-stage collections inside settle and power queries. The change therefore builds invocation-local static indexes once per simulation while continuing to read every mutable runtime status, job, energy level, and transit live. It does not cache dynamic power or industrial decisions.
- 2026-07-29 — The same five-case profile after indexing reduced `availablePower` from `11.1%` to `0.8%`, `generationPower` from `9.0%` to `0.5%`, native `Object.entries` from `11.7%` to `3.3%`, and sampled wall duration from `5.80s` to `4.10s`.

## Verification

- Current human/NDJSON `back-end-die-handoff` run — five warm Candidate cases averaged `1237.4ms` duration, `77.3ms` compile, `1155.4ms` evaluation, and `2.0ms` comparison.
- `bun scripts/profile-benchmark-simulator.ts examples/memory-fab greenfield-dram-design --all-cases --warmup 1 --repeat 1` — before indexing, five current-code cases averaged `1087.65ms`; after indexing they averaged `710.74ms`, a `34.65%` reduction.
- The same before/after run retained every per-case event count plus identical stable Evaluation and complete Simulation Trace hashes: `steady-production` `177d186e` / `fb587637`, `mixed-quality` `be9cc8ff` / `e9190db0`, `quality-excursion` `5e728363` / `4a4ad978`, `lithography-interruption` `2626fd90` / `e39f723c`, and `facility-interruption` `dff88b3e` / `73b25037`.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — completed the exact five-case CLI Benchmark with `KEEP` in `1.70s`.
- Source-current Studio on port `4176` completed the same locked Candidate wave as reconnectable operation `ms4uu0ru-0dd` in `1.03s` with `5/5` Candidate cases and `10/10` total evaluations. Reload restored the completed operation, and browser console inspection reported no warnings or errors.
- `bun run check:fast` — documentation, TypeScript, and 30-test short suite passed.
- `bun run test` — documentation and all TypeScript projects passed; `283` tests with `3473` assertions and all `8` Ironworks fixtures passed in `232.21s`.

## Progress log

- 2026-07-28 — Proposed from the post-worker-pool timing boundary.
- 2026-07-29 — Activated against clean `main` at `a0c186b`; begin with a fresh current-code profile rather than an older optimization hypothesis.
- 2026-07-29 — Added a reusable TypeScript profiling entry point and implemented static simulator invocation indexes; focused parity, fast checks, CLI, and Studio browser QA pass. Full repository verification remains.
- 2026-07-29 — Completed full repository verification and closed the plan with exact industrial evidence unchanged.

## Completion

Complete after every acceptance item has direct evidence and the implementation is committed and pushed.
