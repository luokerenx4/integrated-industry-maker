# Structural input-starvation evidence

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/material-treatment]], [[plans/causal-input-starvation-attribution]], [[plans/current-simulator-settle-loop-performance]], and [[plans/compiled-power-allocation-order]].

## Outcome

Detect exact material-shortage evidence changes structurally and read supply paths from a compiled incoming-connection index instead of serializing, cloning, and rescanning static topology on every Device evaluation.

## Context

After compiled power ordering, the current memory-fab profile attributes `391` sampled hits to native `JSON.stringify`; `246` of them come directly from `setProcessInputStarvation`. The runtime serializes the complete process/shortage/supply observation tree only to decide whether the same evidence is already open. When it does change, the newly built evidence is then `structuredClone`d separately into internal starvation state and the emitted event.

The same boundary also contributes `81` of the profile's `447` native `Object.values` hits by scanning every compiled connection for each missing process input, filtering by destination Device, buffer, and Resource, then sorting matching connection ids. That topology is immutable for the duration of `runUntil`.

This is a framework/API mismatch. Input-starvation evidence is an exact typed structure, not a text identity. Its values and supply state are live, while the set and order of possible incoming connections are compiled topology. The runtime should compare every typed evidence field directly, reuse one newly constructed immutable evidence tree for state and event, and obtain candidate paths from one simulation-local index.

## Scope

### In scope

- Exact structural equality for ordered `MaterialInputShortage` and `InputSupplyObservation` evidence.
- Removal of the internal JSON signature and redundant evidence clones.
- One sorted incoming-connection index keyed by destination Device, buffer, and Resource.
- Exact change/restoration event timing, ordering, payloads, fab-loss attribution, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity parity.
- Current memory-fab five-case, CLI, and Studio measurement.

### Out of scope

- Coarsening, debouncing, or suppressing real shortage-state changes.
- Caching live material quantities, transit state, endpoint status, or process readiness.
- Replacing `hashValue` serialization used for public artifact identity.
- Memory-fab-specific paths or compatibility with the superseded private string signature.

## Acceptance

- [x] Unchanged exact evidence emits no duplicate starvation transition without serializing it.
- [x] A change to any shortage or supply-observation field closes and reopens evidence at the same tick.
- [x] Supply-path discovery performs no per-query full connection scan or sort.
- [x] Emitted events and internal open-starvation state share one fresh immutable evidence tree without later mutation.
- [x] Warm five-case memory-fab evaluation materially improves at the measured starvation-evidence boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, browser, and full repository verification pass before completion.

## Work

- [x] Attribute current serialization and topology-scan costs on clean `main`.
- [x] Capture a repeated warm five-case baseline.
- [x] Implement structural equality, compiled supply-path lookup, and single evidence ownership.
- [x] Prove starvation-event behavior and exact five-case parity, then re-profile.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — Shortage and supply arrays are already deterministically ordered by buffer/Resource and connection id. Structural equality therefore preserves the current JSON identity semantics without canonicalization.
- 2026-07-29 — Only the candidate incoming connection set is static. Available quantity, matching transits, blocking, source status, and loader/unloader status must remain live.
- 2026-07-29 — The current signature is private runtime bookkeeping. It has no public schema or compatibility obligation and should be removed rather than retained beside structural evidence.
- 2026-07-29 — The first fifteen-evaluation sample contained one `851.66ms` system outlier. A second clean sample averages `551.58ms`, median `556.91ms`, range `504.70–605.48ms`; this second sample is the adjacent wall baseline.
- 2026-07-29 — Exact equality now compares every shortage scalar and every supply-observation field in deterministic array order. The private JSON signature was removed entirely.
- 2026-07-29 — Incoming connections are indexed once by destination Device, Buffer, and Resource in stable connection-id order. Snapshot construction still reads material, transit, blocking, source, and endpoint state live.
- 2026-07-29 — A newly created shortage tree is stored as the open interval and emitted directly. Runtime never mutates published evidence, so two redundant `structuredClone` boundaries had no authority or isolation role.

## Verification

- Current `500us` five-case CPU profile: native `stringify` has `391` sampled hits, `246` from `setProcessInputStarvation`; native `Object.values` has `447`, including `81` from the per-shortage connection scan.
- `/tmp/inm-structural-input-starvation-evidence.before-2.json` — three repeats of all five locked cases average `551.58ms`.
- `/tmp/inm-structural-input-starvation-evidence.after.json` — the same fifteen evaluations average `502.41ms`, median `504.04ms`, range `447.63–551.88ms`, an `8.91%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- Same `500us` CPU profile — `setProcessInputStarvation` has no `stringify` child and all `200` remaining native stringify hits belong to public `hashValue`; the former full-connection scan frame is absent. Profiled wall varied upward in this run, so only the repeated unprofiled measurement is used for the speed claim.
- `bun test packages/inm-core/src/fab-loss-analysis.test.ts --test-name-pattern "runtime material starvation" --timeout 30000` — the exact multi-input, changed-at-same-tick, restoration, and conserved-attribution test passed with `29` expectations.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "batch formation|treated material|station cargo preserves" --timeout 30000` — two matching runtime tests and `11` expectations passed.
- `bun run check:fast` — `1013` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.49s` real; operation `ms4xfthb-8fd7df09-fbcb-4f26-8164-d9cf6838fa58` completed all five cases and `2,400,000` ticks with Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `16591` — locked operation `ms4xgf8j-6f8` completed five Candidate cases and ten total evaluations in `0.86s` after a `48ms` cold-worker start. Reload recovered the same result and browser logs contained info only, with no warning or error.
- `bun run test` — `1013` documentation links, all TypeScript projects, `284` tests with `3183` expectations, and all eight Ironworks fixtures passed in `193.77s`.

## Progress log

- 2026-07-29 — Activated from the post-power-order profile on clean `main` at `a8c70ef`.
- 2026-07-29 — Replaced text-signature deduplication and repeated topology scans with exact structural comparison and a compiled incoming-connection index.
- 2026-07-29 — Proved exact fifteen-evaluation parity, completed CLI and reconnectable Studio QA, and passed the full repository checkpoint.

## Completion

Completed on `main`. Input-starvation evidence retains every exact transition and payload while runtime compares its typed structure directly and scans only relevant compiled supply paths.
