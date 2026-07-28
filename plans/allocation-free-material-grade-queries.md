# Allocation-free material-grade queries

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/material-treatment]], [[docs/design/simulation-runtime]], [[plans/shared-revocation-device-context]], and [[plans/current-simulator-settle-loop-performance]].

## Outcome

Read and consume exact graded material directly from the authoritative `materialBatches` ledger without rebuilding, filtering, and sorting a temporary level array for every availability, dispatch, and readiness query.

## Context

After Device-context and contract-dispatch improvements, the current memory-fab profile exposes graded-material lookup as a framework hot path. `materialLevels` contributes `2.3%` total, `materialQuantity` `2.8%`, and `sourceTreatmentLevel` `1.9%`, with additional direct `materialLevels` frames. These totals overlap, but together they identify one repeated boundary rather than unrelated work.

Every query currently performs `Object.entries → map → filter → sort` over the same sparse `level → count` record. Most callers need only one of three answers: the sum at or above a minimum level, the lowest eligible level, or the count at one exact level. Only untracked-material consumption needs to visit multiple levels, and its invariant is simply lowest eligible level first.

This is a model/API mismatch inside the simulator. The authoritative representation is already an exact level ledger, but the only local read abstraction materializes a sorted projection even when no caller needs it. The replacement should express the actual graded-inventory operations directly and retain live-state authority without introducing caches or invalidation.

## Scope

### In scope

- Allocation-free quantity-at-or-above, lowest-eligible-level, and exact-level-count queries over `materialBatches`.
- Lowest-eligible-first untracked-material consumption without a temporary sorted level array.
- Exact local-belt, station, treatment, production-readiness, and shortage behavior.
- Exact event, state, metric, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity parity.
- Current memory-fab five-case, CLI, and Studio measurement.

### Out of scope

- Caching mutable material quantities, changing the `materialBatches` state shape, or making aggregate buffers authoritative over grade ledgers.
- Changed grade eligibility, downgrade behavior, transport selection, or treatment semantics.
- A compatibility alias for the removed generic `materialLevels` projection.
- Autonomous factory-design changes or memory-fab-specific shortcuts.

## Acceptance

- [x] Quantity and source-level queries read the live authoritative grade ledger without array allocation or sorting.
- [x] Exact-level dispatch and treatment checks use direct ledger lookup.
- [x] Multi-level consumption still takes the lowest eligible grade first and conserves aggregate and per-level quantities.
- [x] Warm five-case memory-fab evaluation materially improves at the measured grade-query boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, browser, and full repository verification pass before completion.

## Work

- [x] Capture the current grade-query CPU boundary and a repeated warm five-case baseline.
- [x] Replace the generic sorted projection with exact query operations.
- [x] Prove lowest-grade-first conservation through focused treatment and runtime tests.
- [x] Prove five-case parity, re-profile, and measure the same workload.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — A fresh fifteen-evaluation warm baseline on clean `main` at `c2f2a5a` averages `577.94ms`, range `519.19–656.64ms`.
- 2026-07-29 — The grade ledger remains the sole authority. This plan removes transient projections; it does not add a second material counter or a cache that must be synchronized with `mutateFactoryState`.
- 2026-07-29 — Lowest-eligible selection must compare numeric levels explicitly rather than relying on JavaScript property enumeration order.
- 2026-07-29 — Exact-level dispatch and treatment checks now read one ledger key. Minimum-level quantity and source selection scan the sparse live record without sorting, while untracked consumption repeatedly selects and removes the numeric lowest eligible grade.
- 2026-07-29 — The generic `materialLevels` projection was removed rather than retained as a compatibility alias. The runtime design invariant now lives in [[docs/design/material-treatment]].

## Verification

- Current `500us` five-case CPU profile: `materialLevels` `2.3%` total, `materialQuantity` `2.8%`, `sourceTreatmentLevel` `1.9%`, plus additional direct projection frames.
- `/tmp/inm-material-grade-queries.before.json` — three repeats of all five locked cases average `577.94ms`.
- `/tmp/inm-material-grade-queries.after.json` — the same fifteen evaluations average `532.42ms`, range `480.82–629.62ms`, a `7.88%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- Same `500us` CPU profile — `materialLevels` disappeared; `materialQuantity` fell from `2.8%` total to about `0.3%`, and `sourceTreatmentLevel` from `1.9%` to about `0.4%`. Direct `materialLedger` lookup is `0.4%`. Sampled duration fell from `6.56s` to `6.18s`, while the repeated unprofiled wall measurement remains the speed claim.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "productive mode|treated material|station cargo preserves" --timeout 30000` — three focused tests and `16` expectations passed, including exact multi-grade lowest-first remainder.
- `bun run check:fast` — `1000` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.45s` real; operation `ms4wdrei-ff6517ae-406a-43b7-bb06-018c18af434b` completed all five cases with Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `5025` — locked operation `ms4wefpe-80c` completed five Candidate cases and ten total evaluations in `0.85s` after a `22ms` cold-worker start. Reload recovered the same result and browser logs contained info only, with no warning or error.
- `bun run test` — `1000` documentation links, all TypeScript projects, `283` tests with `3117` expectations, and all eight Ironworks fixtures passed in `199.36s`.

## Progress log

- 2026-07-29 — Activated from the post-shared-context profile on clean `main` at `c2f2a5a`.
- 2026-07-29 — Replaced the generic sorted projection with live quantity, exact-level, and numeric lowest-eligible ledger operations.
- 2026-07-29 — Proved exact fifteen-evaluation parity, completed CLI and reconnectable Studio QA, and passed the full repository checkpoint.

## Completion

Completed on `main`. Graded-material availability, dispatch, readiness, and consumption now operate directly on the authoritative sparse ledger without rebuilding sorted arrays, while preserving exact lowest-eligible semantics and immutable evidence identity.
