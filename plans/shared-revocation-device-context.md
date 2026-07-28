# Shared-revocation Device context

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[docs/ARCHITECTURE]], [[plans/revocable-device-program-context]], and [[plans/contract-value-dispatch-performance]].

## Outcome

Keep every Device TypeScript invocation strictly read-only and unusable after synchronous decision parsing while replacing one native revocation handle per lazily visited object with one invocation-owned revocation state.

## Context

The earlier Device-context change correctly removed whole-context cloning and established the current semantic boundary: project code may inspect exact live state only during its synchronous invocation, may not mutate that state, and may not retain access after the host accepts a detached declarative decision.

After settle indexing and contract-dispatch snapshots, this boundary is again a measured runtime cost rather than an industrial decision cost. The current warm five-case CPU profile attributes `8.3%` total to `evaluateDeviceProgram`; native `Proxy.revocable` consumes `4.8%` self time, lazy view access another `2.6%`, and per-object revocation bookkeeping is separately visible. Every nested object reached by a Device program currently creates its own native revocable Proxy even though all of those views share exactly one lifetime.

This is a framework deficiency. Invocation lifetime is one authority boundary, but the implementation models it as many independent revocation authorities. One shared active/expired state can enforce the same boundary through all Proxy operations with less allocation and teardown work.

## Scope

### In scope

- One invocation-local active/expired state shared by every lazily created read-only Proxy.
- Active-state guards for reads, reflection, enumeration, prototype/extensibility inspection, and every mutation attempt.
- Immediate mutation rejection while active and complete context expiration after host decision parsing.
- Detached accepted decisions plus exact event, state, metric, trace, Benchmark, and immutable Design parity.
- Current memory-fab five-case, CLI, and Studio measurement.

### Out of scope

- Weakening the read-only boundary, permitting retained context reads, copying simulator state, or treating project TypeScript as industrial authority.
- An asynchronous or security-sandboxed Device runtime.
- Changed simulation scheduling, dispatch, process selection, or authored memory-fab behavior.
- Compatibility with code that depends on a native revoked-Proxy error string or mutates a nominally read-only context.

## Acceptance

- [x] A Device program can read and enumerate the full current context and return the same detached declarative decision.
- [x] Every active mutation route fails before host state changes.
- [x] Retained root and nested views reject property access, membership, enumeration, reflection, prototype/extensibility inspection, and mutation after the invocation expires.
- [x] Warm five-case memory-fab evaluation materially improves at the measured Device boundary.
- [x] Identical inputs retain exact event counts, evaluation hashes, complete traces, Benchmark results, and Design hashes.
- [x] Focused, fast, CLI, Studio, browser, and full repository verification pass before completion.

## Work

- [x] Capture the current CPU boundary and a repeated warm five-case baseline.
- [x] Replace per-object native revocation with one guarded invocation lifetime.
- [x] Expand direct boundary tests across retained root/nested read and reflection operations.
- [x] Prove exact parity, re-profile, and measure the same five cases.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — Fifteen measured warm evaluations average `550.35ms` on clean `main` at `58763d9`; all repeats retain their exact case event, Evaluation, and Simulation Trace identities.
- 2026-07-29 — The authority lifetime is the synchronous `evaluateDeviceProgram` invocation, not an individual object. Every lazy nested view must consult the same lifetime state.
- 2026-07-29 — An expired membrane must guard all Proxy reflection operations, not only ordinary property reads. Otherwise retained code could still inspect simulator-owned structure after host control resumes.
- 2026-07-29 — One invocation-local handler and active flag now guard ordinary reads, membership, own-key enumeration, descriptors, prototype/extensibility inspection, and every mutation trap. The accepted decision remains detached before the flag expires.
- 2026-07-29 — The internal boundary is named `invocationReadonlyView` and exposes `expire()`. No alias preserves the superseded per-object revocation model.

## Verification

- Current five-case CPU profile: `evaluateDeviceProgram` `8.3%` total; native `Proxy.revocable` `4.8%` self; lazy `view` self time `2.6%` across its principal frames.
- `/tmp/inm-shared-context-revocation.before.json` — three measured repeats of all five locked cases average `550.35ms`, range `494.48–635.34ms`.
- `/tmp/inm-shared-context-revocation.after.json` — the same fifteen evaluations average `538.58ms`, range `487.59–600.70ms`, a `2.14%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- Same `500us` CPU profile — `evaluateDeviceProgram` fell from `8.3%` to `5.7%`; native per-object `Proxy.revocable` at `4.8%` disappeared and ordinary Proxy creation is `0.9%`. Overall sampled duration was effectively flat (`6.51s` before, `6.56s` after), so the repeated unprofiled wall measurement, not profiler duration, is the speed claim.
- `bun test packages/inm-core/src/device-runtime.test.ts --timeout 30000` — three direct boundary tests and `31` expectations passed, including six active mutation routes and ten expired root/nested operations.
- `bun run check:fast` — `995` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.57s` real; operation `ms4vrbgk-4cef9525-3b2e-4271-b3ea-e548cba5aabb` completed all five cases with Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `99463` — locked operation `ms4vtbvb-a3a` completed five Candidate cases and ten total evaluations in `0.90s` after a `20ms` cold-worker start. Reload recovered the same result and browser logs contained info only, with no warning or error.
- `bun run test` — `995` documentation links, all TypeScript projects, `283` tests with `3556` expectations, and all eight Ironworks fixtures passed in `270.91s`.

## Progress log

- 2026-07-29 — Activated from the post-contract-snapshot profile on clean `main` at `58763d9`.
- 2026-07-29 — Replaced per-object native revocation handles with one guarded invocation lifetime and expanded direct retained-view coverage.
- 2026-07-29 — Proved exact five-case parity, completed CLI and reconnectable Studio QA, and passed the full repository checkpoint.

## Completion

Completed on `main`. Device programs retain the same exact synchronous read-only authority, but one invocation now expires the complete lazy view graph without allocating and tearing down one native revocation authority per visited object.
