# Prepared Device Program context

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[plans/revocable-device-program-context]], [[plans/shared-revocation-device-context]], and [[plans/compiled-local-dispatch-topology]].

## Outcome

Reuse immutable Device, Process, treatment, extraction, and generation descriptions while constructing a fresh invocation root around exact live simulator state, eliminating repeated static object expansion without weakening Device Program isolation.

## Context

The invocation-scoped read-only proxy removed whole-state cloning, but `tryEvaluate()` still rebuilds the complete Device Program context on every eligible settle pass. A fresh five-case memory-fab profile attributes `228` self samples to `tryEvaluate` and `77` native `copyDataProperties` samples directly to its conditional object spreads.

Only part of that context is live. Tick, buffer quantities, material-grade ledgers, selected Process identity, and extraction-node remaining quantities must reflect the current evaluation. Device identity/config and every compiled description for a particular Process plan, treatment mode, extraction operation, or fuel generator are immutable for one `runUntil`.

The correct boundary is not a retained live context and not a compatibility cache. Runtime can prepare immutable description objects once, select the exact current Process description, and create a new root object in the same property order for every invocation. The existing proxy lifetime still owns all reads and expires after host-side decision parsing.

## Scope

### In scope

- One simulation-local prepared description per Device and per compiled Process-plan object.
- A fresh root `DeviceProgramContext` for every evaluation with exact tick, buffers, material batches, and selected Process.
- Fresh extraction-node observations with current remaining quantities.
- Removal of conditional object spreads and per-call copying of Process mode/defect/static metadata.
- Exact context shape/property order, decision behavior, invocation revocation, events, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity.
- Current memory-fab five-case, CLI, and Studio measurement.

### Out of scope

- Reusing or retaining the invocation root or any live buffer/material/node view.
- Freezing, cloning, caching, or snapshotting mutable simulator state.
- Changing the Device Program API, decision parser, synchronous execution rule, or public schemas.
- Optimizing metrics integration, contract ranking, or project-specific Device code.
- Compatibility with the superseded repeated static-description construction.

## Acceptance

- [x] Every evaluation receives a fresh root containing the same ordered own keys and exact live values as before.
- [x] Process selection exposes the prepared description for that exact compiled plan, including mode-specific fields.
- [x] Extraction observations rebuild only live node remaining quantities.
- [x] Mutation rejection, descriptor safety, decision detachment, and post-invocation expiration remain intact.
- [x] The `tryEvaluate` context boundary has no native `copyDataProperties` child from conditional description spreads.
- [x] Warm five-case memory-fab evaluation materially improves at the measured Device-context boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Capture a fresh current-code CPU profile and repeated warm five-case baseline.
- [x] Prepare static descriptions and replace repeated context expansion.
- [x] Prove context shape/isolation and exact five-case parity, then re-profile.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — The fresh profile contains `4,297` samples over `5.61s`; `tryEvaluate` owns `228` self samples and its root conditional spreads own `77` native `copyDataProperties` samples.
- 2026-07-29 — Three warm repeats of all five locked cases average `478.92ms`, median `481.77ms`, range `431.92–513.02ms`.
- 2026-07-29 — Prepared descriptions remain behind the existing invocation-scoped recursive proxy. Sharing an immutable host description does not let project code retain its expired proxy or mutate its target.
- 2026-07-29 — A new root per invocation preserves exact tick/live-state membership and own-key order; optional description keys remain absent rather than present with `undefined`.
- 2026-07-29 — Process descriptions are keyed by compiled plan object rather than Process id because one work center may qualify the same Process through distinct production modes. Selection therefore resolves the exact mode-specific description without a textual alias.
- 2026-07-29 — Device identity/config, treatment, and fuel-generation descriptions are reused behind the proxy. Extraction reuses only operation/node identity and reconstructs node remainder from authoritative state on every invocation.

## Verification

- `/tmp/inm-prepared-device-program-context.before-profile.HA3rAF/five.cpuprofile` — fresh current-code five-case CPU profile.
- `/tmp/inm-prepared-device-program-context.before.json` — fifteen current-code evaluations average `478.92ms`.
- `/tmp/inm-prepared-device-program-context.after.json` — the same fifteen evaluations average `458.57ms`, median `461.53ms`, range `424.11–493.60ms`, a `4.25%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- `/tmp/inm-prepared-device-program-context.after-profile.dntjfS/five.cpuprofile` — the former `77` native `copyDataProperties` samples below `tryEvaluate` are absent; `tryEvaluate` self samples fall from `228` to `211`. The one remaining profile-wide copy sample belongs to unrelated dispatch work.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'Device Program contexts preserve' --timeout 30000` — real extraction, Process, and fuel-generation programs preserved exact root/description own keys and live extraction remainder with five expectations.
- `bun test packages/inm-core/src/device-runtime.test.ts --timeout 30000` — complete reads, decision detachment, mutation/descriptor rejection, and post-invocation expiration passed with `31` expectations.
- `bunx tsc -p packages/inm-core/tsconfig.json --noEmit` and `git diff --check` passed.
- `bun run check:fast` — `1023` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.45s` real; operation `ms4ye581-96d45849-ae2a-4431-a528-f958fd9323df` completed all five cases and `2,400,000` ticks with Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `26324` — operation `ms4yeehk-ddc7ed64-5453-433f-bd49-042f03620bf5` completed ten of ten case evaluations in `1.66s`; its terminal result remained available through the retained operation list.
- The first `bun run test` attempt passed `285` tests but hit one transient Studio lifecycle cleanup failure after restart health had already returned `200`. The exact lifecycle test immediately passed alone with `13` expectations; no simulator/context test failed.
- Repeated `bun run test` — `1023` documentation links, all TypeScript projects, `286` tests with `3154` expectations, the Studio start/reuse/status/restart/stop lifecycle, and all eight Ironworks fixtures passed in `187.47s`.

## Progress log

- 2026-07-29 — Activated against clean `main` at `ed06823` from a fresh current-code profile.
- 2026-07-29 — Prepared exact static descriptions, retained fresh live invocation roots, proved exact five-case identity, and removed the measured conditional-spread boundary.
- 2026-07-29 — Completed CLI and retained Studio operation QA, audited one non-reproducing lifecycle cleanup race, then passed a repeated full repository checkpoint and closed every acceptance item.

## Completion

Completed on `main`. Device Programs still receive a fresh, invocation-scoped root over exact live state, while repeated static Device and operation descriptions are prepared once and remain inaccessible except through the expiring read-only proxy.
