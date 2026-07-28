# Single-pass grid power observation

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/power]], [[docs/design/simulation-runtime]], [[plans/single-pass-runtime-measurement]], and [[plans/compiled-power-allocation-order]].

## Outcome

Observe each grid's exact generation, active demand, requested demand, and transport share once per deterministic measurement or power-boundary decision instead of independently rescanning the same live Device and transport state for every derived value.

## Context

The current five-case memory-fab profile attributes `705` inclusive samples, or about `15.2%`, to `measureUntil()`. Its power section separately calls `generationPower()`, `activePower()`, `requestedPower()`, and active/requested transport-power helpers for the same grid at the same immutable interval boundary. Those helpers repeatedly traverse the same grid members and endpoint stages.

`nextPowerBoundaryDelay()` then owns another `158` inclusive samples and reconstructs sorted healthy storage and station-charging collections before deriving its next exact full, empty, or mission-energy boundary.

This is not independent industrial work. Generation state, standby eligibility, active jobs, station charge, transport phase, and blocked transport requests can be read together into one fresh observation. Storage and station membership/order are compiled topology; health, stored energy, charge satisfaction, and load remain live.

The host is currently under unrelated CPU-intensive workloads, so the unprofiled baseline is recorded with both wall and process CPU time and will be compared only against an immediately repeated identical boundary. Three warm five-case waves on clean `main` at `5f6710b` average `2207.84ms` wall and `2455.61ms` process CPU under that load.

## Scope

### In scope

- One fresh exact grid-power observation at each measurement and next-boundary call.
- Single-pass generation, served active load, requested load, active transport load, and requested transport load.
- Prepared stable storage and station-energy Device order.
- Exact priority and proportional semantics, storage transfer, transport energy, electricity tariffs, scheduling, events, metrics, Evaluation, and complete Simulation Trace.
- Current memory-fab five-case, CLI, Studio, and repository verification.

### Out of scope

- Cross-call power caching, mutation epochs, dirty flags, or invalidation state.
- Changing allocation, storage, charging, tariff, or measurement semantics.
- Skipping deterministic metric intervals or power boundaries.
- The separate active-power arbitration and Device Program invocation hot paths.
- Compatibility retention for the superseded repeated observation helpers.

## Acceptance

- [x] One measurement boundary derives every grid and transport power value from one fresh live traversal.
- [x] Power-boundary delay reuses prepared topology and one same-state observation.
- [x] The observation contains no retained authority and needs no invalidation.
- [x] Focused power tests preserve exact allocation, energy, tariff, storage, transport, and boundary behavior.
- [x] The measured observation boundary and warm five-case runtime materially improve.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Capture the current profile, topology, repeated warm baseline, and exact five-case identities.
- [x] Prepare stable storage/station topology and implement one live grid observation.
- [x] Replace repeated metric/boundary scans and remove superseded helpers.
- [x] Prove exact power behavior and five-case identity, then re-profile.
- [x] Complete CLI/Studio/full verification, commit, and push.

## Findings and decisions

- 2026-07-29 — `measureUntil()` owns `705` inclusive samples and `nextPowerBoundaryDelay()` owns `158` in `/tmp/inm-next-simulator-inline.jWvDh9/five.cpuprofile`.
- 2026-07-29 — The generated memory fab has two grids, `62` connected Devices, `34` transport endpoints, no storage, and no station-energy Device. Generic observation still repeatedly traverses every possible collection even when a particular grid has no member of a kind.
- 2026-07-29 — A grid observation is a same-call value object derived only from live authoritative state. It must never survive a mutation or become a second power ledger.
- 2026-07-29 — Current exact identities are `7,883 / 7,990 / 8,116 / 7,864 / 7,047` events for the five manifest-ordered cases, with their Evaluation and complete Simulation Trace hashes recorded before implementation.
- 2026-07-29 — Metric observation needs active, requested, and both transport-share values. Boundary scheduling needs only generation plus the selected allocation mode's load; its scoped call deliberately omits unused counterfactual and breakdown work.
- 2026-07-29 — The same immediate three-wave boundary falls to `1937.76ms` wall and `2166.10ms` process CPU, improvements of `12.23%` and `11.79%` respectively, while every exact identity remains unchanged.
- 2026-07-29 — The final profile reduces `measureUntil()` from `705` to `486` inclusive samples (`31.06%`). `nextPowerBoundaryDelay()` remains neutral at `158 → 156`; it no longer rebuilds storage/station collections and does not pay for the measurement-only fields.

## Verification

- `/tmp/inm-next-simulator-inline.jWvDh9/five.cpuprofile` — current sequential five-case `500us` CPU profile.
- Warm direct five-case baseline on `5f6710b` — three waves average `2207.84ms` wall and `2455.61ms` process CPU under unrelated host load.
- `/tmp/inm-single-pass-grid-power.final.EmmIhF/five.cpuprofile` — `measureUntil()` falls `705 → 486` inclusive samples; total samples fall `4,643 → 4,187` and sampled duration `3264.11 → 2932.27ms`.
- Warm direct five-case changed-code measurement — three immediate waves average `1937.76ms` wall and `2166.10ms` process CPU; all five event counts, Evaluation hashes, and complete Simulation Trace hashes match the baseline exactly.
- Focused power suite — `20` allocation, storage, transport, station, and Benchmark tests with `88` expectations pass.
- Focused proportional/storage repeat — `7` tests with `33` expectations pass after prepared proportional traversal.
- `bun run check:fast` — `1043` documentation links, all TypeScript projects, `30` tests, and `179` expectations pass.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — public CLI completes all five cases and `2,400,000` ticks in `2.41s` wall under host load with Candidate `35ef45f0…`, `KEEP`, and score delta `117.75790545277778`.
- Initial source-current Studio operation `ms50qr95-d8433105-737f-4354-9906-3948d09977b5` retains `20` progress events, completes `10/10` evaluations and `2,400,000` ticks in `2014.30ms`, and returns the same Candidate, verdict, and score delta.
- `bun run test` — `1043` documentation links, all TypeScript projects, `286` tests with `3557` expectations, complete Studio lifecycle coverage, and all eight Ironworks fixtures pass in `249.65s`.
- Final source-current Studio PID `56800`, port `4176`, source hash `a34ed5c3…` — operation `ms50yum7-ee81be7e-ec6d-48f5-ba99-4a38cd330579` completes all `20` progress events and returns the same Candidate, `KEEP`, score delta, and `2,400,000` ticks under severe unrelated host contention.

## Progress log

- 2026-07-29 — Activated from clean `main` at `5f6710b` after the current profile exposed repeated same-state power observation as the next bounded framework cost.
- 2026-07-29 — Combined same-boundary grid reads, removed superseded transport-load projection helpers, and preserved exact five-case evidence before public-surface verification.
- 2026-07-29 — Completed the public CLI/Studio loop and full repository checkpoint with every acceptance item proven.

## Completion

Runtime now derives every interval power metric from one fresh per-grid live observation and computes the next physical storage/charging boundary from the same scoped mechanism without evaluating unused fields. Stable membership/order is prepared once; no live power state is cached. The five-case memory-fab loop improves by about `12%` at both wall and process-CPU boundaries while retaining exact industrial evidence.
