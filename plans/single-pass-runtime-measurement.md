# Single-pass runtime measurement

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]] and [[docs/design/inventory-accounting]].

## Outcome

Observe authoritative inventory, local transport, and station-mission state once per deterministic measurement boundary so long memory-fab experiments spend less time rebuilding equivalent metric projections without changing industrial evidence.

## Context

Core calls `measureUntil()` before every positive-time internal event and once at the requested horizon. The current implementation first rebuilds complete Resource inventory, then traverses that projection three times for total, WIP, and per-Resource integration. It independently expands local transits for belt occupancy and blocking, traverses every connection again for stage and cause metrics, and repeatedly filters station missions by fleet.

The five locked memory-fab cases contain roughly eight thousand public events each, so repeated read-only projection is paid throughout every Candidate evaluation. A fresh `500us` profile attributes `202` self samples to `inventoryByResource()` and `186` to `measureUntil()`, before native `values`, `entries`, `flatIntoArray`, and `filter` children.

The runtime must keep one authoritative mutable state. This work may compile immutable iteration order and combine observation, but it must not add a cached inventory, reservation, congestion, or mission ledger that could drift from `FactoryState`.

## Scope

### In scope

- One simulation-local WIP Resource set and immutable iteration/count metadata.
- One authoritative observation pass over resident buffers, local transits, station cargo, and carrier missions at each positive-time measurement boundary.
- Exact inventory, WIP, belt, connection, station, blocking-cause, and stage-area integration.
- Exact events, final state, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity.
- Current memory-fab five-case, CLI, Studio, and repository verification.

### Out of scope

- A second mutable inventory, demand, reservation, congestion, or mission ledger.
- Changing measurement boundaries, metric schemas, scoring, event ordering, or industrial behavior.
- Approximate sampling, coarser metric resolution, compatibility behavior, or project-specific shortcuts.
- Optimizing power integration or unrelated settle-loop work.

## Acceptance

- [x] Every physical item remains counted exactly once across resident Device buffers, local transit, and station cargo.
- [x] Total, Objective-scoped WIP, per-Resource inventory, belt, connection, station, and blocking metrics remain exactly identical.
- [x] Each live collection is traversed at most once for the metric families owned by this plan at one measurement boundary.
- [x] No new mutable state ledger or invalidation path is introduced.
- [x] Warm five-case memory-fab evaluation materially improves at the measured observation boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Capture a fresh current-code CPU profile and repeated warm five-case baseline.
- [x] Replace repeated metric projections with one authoritative state observation.
- [x] Prove metric conservation and exact five-case identity, then re-profile.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — Fifteen warm current-code evaluations average `462.52ms`, median `468.28ms`, range `417.43–493.41ms`.
- 2026-07-29 — A fresh `500us` five-case profile contains `8,977` samples over `5.99s`; `inventoryByResource()` owns `202` self samples and `measureUntil()` owns `186`, excluding their native traversal/allocation children.
- 2026-07-29 — Compiled ids may define stable traversal order, but every count and status is read from current `FactoryState` at the exact boundary.
- 2026-07-29 — Inventory remains a boundary-local projection. It is constructed once, consumed once for all Resource integrals, and then discarded.
- 2026-07-29 — The local-transit pass now integrates inventory, belt items/cells, connection item occupancy, loader/unloader activity, and typed blocking causes together. The carrier-mission pass updates fleet counts and busy area together before static fleet capacity produces congestion.
- 2026-07-29 — The final profile attributes `1,210` inclusive samples to `measureUntil()`, down from `1,534` (`21.12%`). Its prior `inventoryByResource`, native `Object.values`, `flat`, and `reduce` children are absent.

## Verification

- `/tmp/inm-single-pass-runtime-measurement.before.json` — fifteen current-code memory-fab evaluations and their exact identity baseline.
- `/tmp/inm-single-pass-runtime-measurement.before-profile.wLYxvn/five.cpuprofile` — fresh current-code five-case CPU profile.
- `/tmp/inm-single-pass-runtime-measurement.after.json` — the same fifteen evaluations average `445.97ms`, median `442.43ms`, range `416.40–489.04ms`, a `3.58%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- `/tmp/inm-single-pass-runtime-measurement.final-profile.Qtuvo7/five.cpuprofile` — `measureUntil()` inclusive samples fall from `1,534` to `1,210`; the removed repeated inventory/transport projection children remain absent.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'identity-preserving wafer lots|station networks batch resources' --timeout 30000` — Objective inventory accounting and station fleet utilization passed with `188` expectations.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'stack-capable sorters|slow unloading|belt-end waits|station networks batch resources' --timeout 30000` — stack occupancy, propagated blocking, typed causes, and fleet integration passed with `41` expectations.
- `bun run check:fast` — `1026` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.41s` real; all five cases and `2,400,000` ticks retained Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `33138` — operation `ms4z2nzh-57d2790a-2ed8-4e0a-894b-0b3c2d68895d` completed ten of ten case evaluations in `1.22s` with the same Candidate identity and verdict.
- `bun run test` — `1026` documentation links, all TypeScript projects, `286` tests with `3219` expectations, the complete Studio lifecycle, and all eight Ironworks fixtures passed in `191.46s`.

## Progress log

- 2026-07-29 — Activated against clean `main` at `aa905b5`; measured repeated inventory, transit, and mission observation as the next bounded framework cost.
- 2026-07-29 — Combined exact inventory and transport integration, preserved locked five-case identity, completed CLI/Studio QA, and passed the full repository checkpoint.

## Completion

Completed on `main`. Each positive-time metric boundary now derives inventory, local-transport, and carrier-mission evidence through one disposable observation of authoritative state. Static iteration topology and Objective membership are prepared once, while live industrial quantities remain uncached and exact.
