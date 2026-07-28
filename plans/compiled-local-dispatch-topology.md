# Compiled local-dispatch topology

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/logistics]], [[docs/design/simulation-runtime]], [[plans/current-simulator-settle-loop-performance]], and [[plans/structural-input-starvation-evidence]].

## Outcome

Reuse one simulation-local view of static local-logistics sources, outgoing connections, and authored port priority instead of rebuilding those collections on every settle pass, while preserving exact live deterministic dispatch.

## Context

After structural input-starvation evidence, a fresh five-case memory-fab CPU profile attributes `130` sampled hits—the largest native collection-call family—to `Object.values(project.connections)` inside `dispatch()`. Every settle pass rebuilds the sorted source Device set, scans the complete connection table once per source, sorts each outgoing group by id, and scans the table again after a departure only to recover the same outgoing count.

Those values are immutable for one `runUntil`: connection ownership, stable connection id order, effective policy, source output-priority port, destination input-priority membership, and outgoing count. Inventory, material grade, inbound reservations, endpoint/device status, power, dispatch cursor, and shortage coverage are live authority and must still be evaluated at each dispatch boundary.

This is a framework boundary rather than a memory-fab special case. Static authored topology should be prepared once for the simulation; dynamic policy ranking should operate over that stable view. No compatibility path is needed for the superseded repeated reconstruction.

## Scope

### In scope

- One deterministic simulation-local dispatch-source index with connection-id-ordered outgoing groups.
- Precomputed static FIFO output-priority order and destination input-priority membership.
- Live round-robin rotation and shortage-first Resource/coverage ranking over the indexed groups.
- Removal of per-dispatch whole-connection enumeration, filtering, id sorting, and departure-time recounting.
- Exact event ordering, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity parity.
- Current memory-fab five-case, CLI, and Studio measurement.

### Out of scope

- Caching inventory, in-flight quantities, free capacity, treatment grades, power, failures, or endpoint status.
- Changing FIFO, round-robin, shortage-first, input-priority, output-priority, or junction-filter semantics.
- Station-network dispatch, belt-cell occupancy, metrics integration, or public schemas.
- Memory-fab-specific branches or compatibility with the superseded reconstruction path.

## Acceptance

- [x] Local dispatch performs no whole-connection enumeration, per-source filtering/id sort, or departure-time outgoing recount inside `dispatch()`.
- [x] FIFO retains authored port priority then stable connection-id order.
- [x] Round-robin and shortage-first retain live cursor rotation, eligibility, Resource ranking, coverage, Objective depth, and stable tie behavior.
- [x] Destination input priority remains a stable partition above source-local policy order.
- [x] Warm five-case memory-fab evaluation materially improves at the measured local-dispatch boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Capture a fresh current-code CPU profile and repeated warm five-case baseline.
- [x] Implement the simulation-local topology view and remove superseded reconstruction.
- [x] Prove policy behavior and exact five-case parity, then re-profile.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — The fresh profile contains `4,596` samples over `5.96s`; `dispatch()` owns `102` self samples and its static source/outgoing reconstruction owns `130` native `Object.values` samples plus `15` native sort samples.
- 2026-07-29 — Three warm repeats of all five locked cases average `497.83ms`, median `500.74ms`, range `442.54–526.19ms`. Event, Evaluation, and complete Trace identities are stable within every case.
- 2026-07-29 — Only topology and authored priority membership are static. A compiled view must not become a second material-demand or runtime-state ledger.
- 2026-07-29 — The prepared view shares the same connection-id-ordered arrays with input-starvation lookup, groups them once by source, and precomputes effective policy plus authored port-priority membership. Runtime continues to rotate and rank those exact connections from current state.
- 2026-07-29 — The prior input-priority behavior had no focused test. A direct three-source test now proves that prioritized destinations form a stable leading partition while the remaining source order is retained.

## Verification

- `/tmp/inm-compiled-local-dispatch-topology.before-profile.0GZf1J/five.cpuprofile` — fresh current-code five-case CPU profile.
- `/tmp/inm-compiled-local-dispatch-topology.before.json` — fifteen current-code evaluations average `497.83ms`.
- `/tmp/inm-compiled-local-dispatch-topology.after.json` — the same fifteen evaluations average `478.38ms`, median `481.12ms`, range `419.26–534.10ms`, a `3.91%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- `/tmp/inm-compiled-local-dispatch-topology.after-profile.Oulc4s/five.cpuprofile` — the former `130`-sample static connection enumeration is absent; `dispatch()` self samples fall from `102` to `84`, with only live shortage-first ranking sorts remaining.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'input priority stably partitions|shortage-first dispatch|explicit output priority|splitter policies' --timeout 30000` — five policy tests and eight expectations passed.
- `bunx tsc -p packages/inm-core/tsconfig.json --noEmit` and `git diff --check` passed.
- `bun run check:fast` — `1018` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.43s` real; operation `ms4xwy3h-209d6f1d-f34a-46e9-89b3-95548d4ee948` completed all five cases and `2,400,000` ticks with Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `21266` — operation `ms4xxkwq-1dec00b7-24e3-469c-8ae5-c8ee06f5511f` completed ten of ten case evaluations in `1.25s`; its terminal result remained available through the retained operation list.
- `bun run test` — `1018` documentation links, all TypeScript projects, `285` tests with `3164` expectations, and all eight Ironworks fixtures passed in `192.66s`.

## Progress log

- 2026-07-29 — Activated against clean `main` at `c924109` from a fresh current-code profile rather than the preceding round's attribution.
- 2026-07-29 — Replaced repeated topology reconstruction with a simulation-local source view, proved exact five-case identity, and re-profiled the intended boundary.
- 2026-07-29 — Completed CLI and retained Studio operation QA, passed the full repository checkpoint, and closed every acceptance item.

## Completion

Completed on `main`. Local logistics now prepares static source topology and authored priority once per simulation while every material, capacity, power, cursor, and shortage decision remains live and exact.
