# Compiled power-allocation order

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/power]], [[docs/design/simulation-runtime]], [[plans/current-simulator-settle-loop-performance]], and [[plans/allocation-free-material-grade-queries]].

## Outcome

Allocate Device standby and dynamic active power from one simulation-local Device/kind order instead of rebuilding and sorting equivalent collections during every settle pass.

## Context

The current post-material-ledger memory-fab profile exposes priority power allocation as the next framework hot path. `refreshStandbyPower` appears under a `9.3%` settle frame and contributes the largest share of native sorting: `sort` attributes `248` samples to it, `map` another `54`, `Object.values` `35`, and `filter` `30`. `comparePowerRank` is `2.3%` total and is called almost entirely from native sorting.

The industrial state that decides whether a Device receives power is dynamic: generation, storage, failure, sleep mode, active work, and remaining capacity must be read live. Grid membership, Device identity, and authored `powerPriority` are immutable within one compiled simulation. Nevertheless, `refreshStandbyPower` currently maps every grid member id back to its Device and sorts that static set on every settle iteration. It also rebuilds, filters, and sorts the disconnected Device set every time.

This is a framework representation mismatch. `runUntil` already builds `devicesByPowerGrid` and `powerRankedDevicesByGrid`; both standby allocation and active-consumer arbitration should consume that exact precompiled Device order while retaining live reads for every mutable power decision. Active consumer membership remains dynamic, but its sort key is only the static Device rank followed by the fixed lexical kind order `job → station-charge → transport`.

## Scope

### In scope

- One simulation-local standby allocation order per grid for both priority and proportional modes.
- One deterministic disconnected-Device order.
- Allocation-free priority traversal of live job, station-charge, and transport consumers in the exact existing Device/kind order.
- Exact live standby requirement, active delta, failure, sleep, generation, storage, status, event, and scheduling behavior.
- Exact power priority, Device-id tie breaking, event ordering, metrics, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity parity.
- Current memory-fab five-case, CLI, and Studio measurement.

### Out of scope

- Changing priority-load-shedding or proportional allocation semantics.
- Caching active-consumer membership, mutable power totals, or allocation results.
- Memory-fab-specific power shortcuts or compatibility aliases for the superseded repeated collection build.

## Acceptance

- [x] Standby refresh performs no per-settle grid-member mapping or priority sorting.
- [x] Disconnected Device traversal is precomputed once and remains Device-id deterministic.
- [x] Active arbitration creates and sorts no per-settle consumer descriptor array while preserving Device rank and lexical kind order.
- [x] Priority and proportional power tests retain exact allocation, preemption, restoration, event, and energy behavior.
- [x] Warm five-case memory-fab evaluation materially improves at the measured power-allocation boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, browser, and full repository verification pass before completion.

## Work

- [x] Identify the current CPU boundary and its immutable-versus-live state split.
- [x] Capture a repeated warm five-case baseline on clean `main`.
- [x] Compile standby and disconnected Device orders once per simulation.
- [x] Traverse dynamic active consumers through compiled Device rank and fixed kind rank.
- [x] Prove exact power semantics and five-case parity, then re-profile the same workload.
- [x] Complete CLI/Studio QA and full verification.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — Grid membership, Device id, and authored priority cannot change inside `runUntil`; generation, storage, failure, sleep, active work, and satisfaction remain live state and must not be cached.
- 2026-07-29 — Priority mode uses descending authored priority and Device id as the stable tie break. Proportional mode retains Device-id order even though allocation is shared, preserving exact event order.
- 2026-07-29 — Active consumer membership remains live, but its total order is the Cartesian ordering of immutable Device rank and the fixed lexical kind rank. Iterating that order preserves the old comparator without materializing descriptors.
- 2026-07-29 — Fifteen measured warm evaluations on clean `main` at `9d0e86b` average `528.06ms`, range `464.63–614.12ms`.
- 2026-07-29 — Standby refresh now traverses a precompiled mode-appropriate grid order and one precomputed disconnected order. Dynamic priority arbitration scans live eligibility through pre-ranked Devices and `job → station-charge → transport` without constructing consumer descriptors.
- 2026-07-29 — The runtime invariant is recorded in [[docs/design/power]]: only membership and total ordering are compiled; mutable generation, storage, failure, sleep, job, charging, and transport state remain live.

## Verification

- Current `500us` five-case CPU profile: `refreshStandbyPower` appears under a `9.3%` settle frame; native `sort` attributes `248` samples, `map` `54`, `Object.values` `35`, and `filter` `30` to standby refresh. `comparePowerRank` is `2.3%` total.
- `/tmp/inm-compiled-standby-power-order.before.json` — three repeats of all five locked cases average `528.06ms`.
- `/tmp/inm-compiled-power-allocation-order.after.json` — the same fifteen evaluations average `466.29ms`, range `420.70–543.55ms`, an `11.70%` reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- Same `500us` CPU profile — `comparePowerRank` fell from `179` sampled hits to `2`, native `sort` from `221` to `119`, and `refreshStandbyPower` from `218` to `128`. Overall sampled duration fell from `6.18s` to `5.41s`; the repeated unprofiled wall measurement remains the speed claim.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "standby allocation|power priority|equal-priority active consumers|sorter power priority|proportional grid satisfaction|active draw includes standby|restored generation|station charging" --timeout 30000` — `12` focused tests and `55` expectations passed.
- `bun run check:fast` — `1006` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.38s` real; operation `ms4wyysp-c96bd627-c13d-4527-9df0-a601a39b016c` completed all five cases and `2,400,000` ticks with Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `11527` — locked operation `ms4wzy54-4b1` completed five Candidate cases and ten total evaluations in `0.81s` after an `18ms` cold-worker start. Reload recovered the same result and browser logs contained info only, with no warning or error.
- `bun run test` — `1006` documentation links, all TypeScript projects, `284` tests with `3134` expectations, and all eight Ironworks fixtures passed in `189.33s`.

## Progress log

- 2026-07-29 — Activated from the post-material-ledger profile on clean `main` at `9d0e86b`.
- 2026-07-29 — Reused compiled grid order for standby allocation, then replaced dynamic active-consumer projection/sort with exact ordered live traversal.
- 2026-07-29 — Proved exact fifteen-evaluation parity, completed CLI and reconnectable Studio QA, and passed the full repository checkpoint.

## Completion

Completed on `main`. Priority and proportional allocation retain their exact industrial semantics while settle traverses compiled Device/kind order and reads only mutable eligibility and power state live.
