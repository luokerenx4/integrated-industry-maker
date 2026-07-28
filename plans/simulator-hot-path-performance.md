# Simulator hot-path performance

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/experiment-workbench]], [[docs/design/development-operations]].

## Outcome

Reduce fresh memory-fab Candidate evaluation time through measured simulator work, while preserving exact deterministic events, metrics, hashes, and locked Benchmark verdicts.

## Context

[[plans/observable-benchmark-execution]] measured a warm five-case `dispatch-research` evaluation at 6731 ms. Candidate simulation consumed 6407 ms while compilation, cache access, and comparison together consumed about 270 ms. The next useful question is therefore which simulator event families and state transitions own that time, followed by whether a local hot-path change or isolated case concurrency has the best risk-adjusted payoff.

## Scope

### In scope

- Development-only profiling that attributes simulator CPU cost without entering authored or immutable evidence.
- Representative one-case and five-case memory-fab workloads.
- A measured hot-path optimization or isolated multi-case execution strategy.
- Exact before/after result, event, metric, and hash parity.

### Out of scope

- Approximate simulation, skipped locked cases, changed tick/event semantics, or Candidate result caching.
- Autonomous factory-design policy.
- Timing fields in immutable results.

## Acceptance

- [x] Profiling identifies the dominant simulator functions or event families on the current five-case warm workload.
- [x] One bounded implementation reduces representative warm Candidate evaluation time materially.
- [x] Determinism, result hashes, metrics, events, and Benchmark verdicts remain exact.
- [x] Full verification and before/after measurements are recorded.

## Work

- [x] Establish reproducible profiler and Benchmark fixtures.
- [x] Attribute wall time and allocation pressure to simulator paths.
- [x] Choose and implement one bounded intervention.
- [x] Prove semantic parity and measure the result.

## Findings and decisions

- 2026-07-28 — Begin with simulator attribution; compilation, cache, comparison, and Studio serialization are already bounded below 5% of the warm five-case operation.
- 2026-07-28 — A 500 µs Bun CPU profile of warm `dispatch-research` measured 6.64 s and attributed 2.19 s total to `evaluateDeviceProgram`; `structuredClone` used 1.51 s self time while deep-freeze traversal appeared through `freezeDeep`, `Object.freeze`, `Object.values`, and `Object.entries`.
- 2026-07-28 — `structuredClone` is the host-state isolation boundary. Removing the second deep-freeze traversal leaves project code unable to mutate simulator state, preserves the typed readonly API and host validation, and avoids changing event or scheduling semantics.
- 2026-07-28 — Three post-change warm five-case operations measured 5195, 5328, and 5175 ms versus the 6602 ms profiled baseline and earlier 6731 ms warm observation. The complete pre/post `BlueprintBenchmarkResult` compared byte-for-byte equal after stable JSON projection.

## Verification

- Bun CPU profile at 500 µs — pre-change warm `dispatch-research` measured 6.64 s with `evaluateDeviceProgram` at 2.19 s total and deep-freeze traversal visible across native object operations.
- Three unprofiled warm `dispatch-research` operations — 5195, 5328, and 5175 ms after the change.
- Stable pre/post `BlueprintBenchmarkResult` JSON — byte-for-byte identical.
- `bun test packages/inm-core/src/device-runtime.test.ts` — a program that mutates its received nested config, buffers, and material batches leaves the simulator-owned context unchanged.
- `bun run check:fast` — documentation, all TypeScript projects, and short unit suite passed.
- `bun run test` — 253 package tests / 2154 assertions and all 8 ironworks fixtures passed, including identical-input events/state/metrics/hash and checked-in immutable run replay.

## Progress log

- 2026-07-28 — Proposed from the measured observable Benchmark execution work.
- 2026-07-28 — Activated after the observable execution checkpoint was committed and pushed.
- 2026-07-28 — Implemented detached-snapshot evaluation without redundant deep freeze and added a direct host-state isolation regression test.

## Completion

Completed on 2026-07-28. Detached Device context isolation now performs one object-graph copy instead of clone plus deep freeze, reducing the measured warm five-case operation by approximately 20–23% without changing industrial evidence.
