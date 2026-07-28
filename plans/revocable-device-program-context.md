# Revocable Device program context

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/simulation-runtime]], [[docs/ARCHITECTURE]], and [[docs/design/development-operations]].

## Outcome

Reduce exact memory-fab simulation latency by replacing per-decision whole-context cloning with an invocation-scoped read-only view that still prevents project-local Device programs from mutating or retaining access to simulator-owned state.

## Context

After [[plans/parallel-benchmark-case-execution]], a representative one-Candidate memory-fab Design spends about `2.1s` in each five-case seed or Candidate wave. Baseline loading, lock checks, cache reads, proposal work, and comparison are already small.

A current 500 µs CPU profile of the five locked cases in forced-sequential mode measured `7.92s`. Native `structuredClone` consumed `2.27s` self time (`28.7%`) because `evaluateDeviceProgram()` clones the complete context on every settle pass, including Device buffers and material batches. The public type already declares the context read-only; cloning exists only to stop project code that casts away those types from changing host state.

INM is pre-alpha. This plan replaces the runtime boundary directly and does not preserve the old ability for an invalid Device program to mutate its private clone.

## Scope

### In scope

- A recursively lazy, invocation-scoped, revocable read-only view for Device evaluation.
- Immediate rejection of writes, deletion, descriptor/prototype changes, and attempts to make simulator-owned objects non-extensible.
- Revocation after decision parsing so a project program cannot retain live access across evaluations.
- Exact decision, event, state, metric, Benchmark, and immutable Design parity.
- Current CPU-profile and real memory-fab before/after measurement.

### Out of scope

- A security sandbox for trusted project code, asynchronous Device programs, or isolation from ambient clocks/network/process state.
- Changed scheduling, process selection, event semantics, locked cases, or approximate simulation.
- Autonomous proposal generation or Candidate caching.
- A compatibility path for programs that mutate their nominally read-only context.

## Acceptance

- [x] Device programs can read the complete current context and return the same declarative decisions without a whole-context clone.
- [x] Any mutation attempt fails before host state changes, and a context reference retained after evaluation is unusable.
- [x] Sequential and parallel memory-fab Benchmark/Design evidence remains exact, including immutable result hashes and driver traces.
- [x] The representative memory-fab operation and CPU profile show a material reduction in Device-boundary cost.
- [x] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [x] Re-profile the post-parallelization operation and identify the current dominant cost.
- [x] Implement and test the revocable read-only evaluation boundary.
- [x] Update durable runtime documentation and measure exact before/after parity.
- [x] Verify CLI/Studio behavior, complete the repository audit, commit, and push.

## Findings and decisions

- 2026-07-28 — A current real `back-end-die-handoff` invocation took `4.93s`; the five-case seed and Candidate waves each occupied about `2.1s`, while five baseline cache checks totaled about `0.13s`.
- 2026-07-28 — A forced-sequential `greenfield-dram-design` CPU profile measured `7.92s`; `structuredClone` was the largest self-time function at `2.27s` / `28.7%`.
- 2026-07-28 — A proxy view must be revoked after parsing the returned decision, not immediately after `evaluate()`, because a valid program may return arrays or records derived from the read-only context and the host parser must detach the accepted values.
- 2026-07-28 — The read-only boundary also wraps values exposed through property descriptors; otherwise `Object.getOwnPropertyDescriptor()` could reveal a mutable nested host object without crossing the ordinary `get` trap.
- 2026-07-28 — The final descriptor-safe CPU profile measured `6.09s`. Device-boundary total time fell from `2.29s` to `0.261s`, with revocable proxy creation and lazy view access together remaining far below the removed whole-graph clone.
- 2026-07-28 — Adjacent detached-HEAD/current runs against the same project show that a five-case parallel Candidate evaluation improved from median `2111.8ms` to `1783.2ms` (`15.6%`). The complete one-Candidate Design improved more modestly from median `3.90s` to `3.79s` because each seed/Candidate call still creates and destroys a cold worker set.

## Verification

- Before-change real `back-end-die-handoff` Design — `4.93s` wall; seed wave case timings `1.956–2.150s`, Candidate wave `1.936–2.103s`; immutable result `f928bd8affe8…`.
- Before-change forced-sequential five-case CPU profile — `7.92s`; native `structuredClone` `2.27s` self / `28.7%`, `evaluateDeviceProgram` `2.29s` total.
- After-change forced-sequential five-case CPU profile — `6.09s`; `evaluateDeviceProgram` `0.261s` total and remaining unrelated `structuredClone` work `59.3ms`.
- Detached-HEAD before/current parity — Benchmark result hash `31c8437f9b57…` and `mixed-quality` driver trace hash `e9190db07b1b…` were identical.
- Same-project adjacent parallel Candidate evaluation — old `5729004` measured `2117.6`, `2111.8`, and `2109.8ms`; current measured `1708.7`, `1825.7`, and `1783.2ms`.
- Same-project adjacent `back-end-die-handoff` Design — old `5729004` measured `3.91`, `3.90`, and `3.90s`; current measured `3.84`, `3.73`, and `3.79s`; immutable result remained `f928bd8affe8…`.
- `bun test packages/inm-core/src/device-runtime.test.ts` — complete reads and detached decisions, six mutation routes including descriptor access, and post-invocation revocation passed.
- `bun run check:fast` — documentation, every TypeScript project, and `29` tests / `175` assertions passed in `11.4s`.
- `bun test --max-concurrency=1 packages/inm-core` — `229` tests / `1717` assertions passed in `213.46s`.
- Browser Studio Design QA — current-source PID `72581`; live `parallel ×5` progress appeared, operation `ms4su9an-ef7…` completed `15/15` with result `f928bd8affe8…` and a `1504ms` final case, refresh recovered the same operation, and the browser log contained no warning or error.
- `bun run test` — documentation, five TypeScript projects, `282` tests / `3488` assertions across `21` files, and all eight Ironworks CLI fixtures passed; the package suite took `309.45s`, down from the previous `472.91s` despite two additional isolation tests.

## Progress log

- 2026-07-28 — Plan created and activated from a current real Design timing and post-parallelization CPU profile.
- 2026-07-28 — Implemented the revocable lazy view, closed ordinary and property-descriptor mutation paths, proved old/current evidence parity, and completed focused Core and real Studio verification.
- 2026-07-28 — Completed the full repository checkpoint, source-current Studio audit, commit, and push.

## Completion

Completed. Device programs now read exact simulator context through an invocation-scoped revocable view instead of cloning the complete object graph on every decision. The boundary rejects mutation and retained access while preserving exact Benchmark, driver-trace, event/state/metric, and immutable Design identities.

The forced-sequential five-case profile improved from `7.92s` to `6.09s`, Device-boundary time fell from `2.29s` to `0.261s`, and a same-project parallel Candidate wave improved by `15.6%`. The complete one-Candidate Design improved by `2.8%`; its remaining repeated cold-worker cost is tracked separately in [[plans/reusable-benchmark-worker-pool]]. The full package suite improved from `472.91s` to `309.45s`.
