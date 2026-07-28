# Compiled contract commitment sources

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/delivery-contracts]], [[docs/design/work-center-dispatch]], and [[plans/contract-value-dispatch-performance]].

## Outcome

Build each exact contract-value dispatch snapshot from compiled Resource-specific Buffer, active-output, local-transit, and station-transit sources instead of rescanning an entire region during every Device evaluation.

## Context

[[plans/contract-value-dispatch-performance]] correctly established one delivery-commitment snapshot per synchronous contract-value Device evaluation. The current post-hot-path profile nevertheless attributes `415` inclusive samples to `captureContractCommitments()`, including `375` self samples.

The remaining cost is source discovery, not mutable industrial state. The generated memory fab has three delivery-contract Resources in `cleanroom`. Only six Buffers can hold those Resources, one Device can have them in an active job, and three local connections can carry them toward customers. The current snapshot instead walks all `62` regional Devices, all `39` Buffers, every active job, every local connection, and every Resource in the three-item contract list.

Which Buffers accept a contract Resource, which Devices can produce it, and which transport paths can carry it into the contract region are compiled project facts. Their quantities, active jobs, and transit contents remain live `FactoryState`. Core should prepare the former once and read the latter exactly at each existing invocation boundary.

## Scope

### In scope

- One simulation-local contract-commitment source index per Objective delivery region.
- Resource-specific resident Buffer sources.
- Devices whose compiled work can place a contract Resource in an active job output.
- Local connections and station networks that can carry a contract Resource into the target region.
- An allocation-light invocation-local commitment snapshot with exact delivered, resident, active-output, and in-transit quantities.
- Exact recipe ranking, readiness, events, state, Evaluation, complete Simulation Trace, Benchmark, and Candidate identity.
- Current memory-fab five-case, CLI, Studio, and repository verification.

### Out of scope

- Cross-Device or cross-tick commitment caching.
- A mutable delivery/reservation ledger or incremental invalidation protocol.
- Changing contract value, shortfall, delivery-window, or recipe-dispatch semantics.
- Project-specific ids, approximate counts, compatibility paths, or autonomous optimization.

## Acceptance

- [x] Snapshot source discovery performs no full regional Device/Buffer or global connection/network scan.
- [x] Every commitment quantity is still read from exact live state at the existing Device-evaluation boundary.
- [x] Delivered, resident, active-output, local-transit, and station-transit quantities retain complete coverage without double counting.
- [x] Warm five-case memory-fab evaluation materially improves at the measured commitment boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Capture the current profile, topology counts, and repeated warm five-case baseline.
- [x] Compile exact per-region contract commitment sources.
- [x] Replace broad snapshot discovery and prove coverage/identity.
- [x] Re-profile and complete CLI/Studio QA.
- [x] Pass the full repository checkpoint, commit, and push.

## Findings and decisions

- 2026-07-29 — The current `500us` five-case profile attributes `415` inclusive samples to `captureContractCommitments()`, of which `375` are self time.
- 2026-07-29 — Generated memory-fab contract snapshots currently scan `62` cleanroom Devices and `39` Buffers for three Resources, although only six Buffers, one possible active-output Device, and three local connections can contribute.
- 2026-07-29 — The source index is immutable topology only. Snapshot quantities remain invocation-local observations of `FactoryState` and `SimulationStats`.
- 2026-07-29 — Fifteen warm current-code evaluations average `425.79ms`, median `426.04ms`, range `398.38–458.57ms`.
- 2026-07-29 — A Device can contribute active output only through one of its own compiled Buffers. Indexing Devices with a matching exact or wildcard Buffer therefore covers every valid active job without rediscovering Process variants at runtime.
- 2026-07-29 — Local connection and station-network membership is compiled from Resource allowlists and inbound routes. Live transit destination and Resource checks remain at observation time, so multi-route station networks retain exact regional attribution.
- 2026-07-29 — The invocation snapshot is now a Resource-keyed plain record. Region remains fixed by the contract-value Device, removing per-read composite keys and per-invocation `Map`/`Set` construction without widening snapshot lifetime.

## Verification

- `/tmp/inm-compiled-contract-commitment-sources.before.json` — fifteen current-code evaluations and exact identity baseline.
- `/tmp/inm-single-pass-runtime-measurement.final-profile.Qtuvo7/five.cpuprofile` — current committed five-case profile.
- `/tmp/inm-compiled-contract-commitment-sources.after.json` — the same fifteen evaluations average `420.59ms`, median `421.84ms`, range `370.01–465.33ms`, a `1.22%` wall reduction. Every paired event count, Evaluation hash, and complete Simulation Trace hash is identical.
- `/tmp/inm-compiled-contract-commitment-sources.after-profile.PsnHbw/five.cpuprofile` — `captureContractCommitments()` falls from `415` inclusive samples to `53` (`87.23%`); its broad scan and per-invocation `Map`, `Set`, and callback children are absent. `tryEvaluate()` falls from `3,421` to `3,028` inclusive samples, and sampled five-case wall time falls from `5.55s` to `5.25s`.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'identity-preserving wafer lots|identical inputs and seed' --timeout 30000` — contract-window/in-flight behavior and deterministic replay passed with `179` expectations.
- `bun run check:fast` — `1032` documentation links, all TypeScript projects, and `30` tests with `179` expectations passed.
- `/usr/bin/time -p bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `1.54s` real; all five cases and `2,400,000` ticks retained Candidate hash `35ef45f0...`, verdict `KEEP`, and score delta `117.75790545277778`.
- Source-current Studio PID `37569` — operation `ms4zk82r-dd8ab3c4-e8f0-4dc5-bff4-1474c0144c34` completed ten of ten case evaluations in `1.27s` with the same Candidate identity and verdict.
- `bun run test` — `1032` documentation links, all TypeScript projects, `286` tests with `3380` expectations, the complete Studio lifecycle, and all eight Ironworks fixtures passed in `197.35s`.

## Progress log

- 2026-07-29 — Activated against clean `main` at `d11495c` after the runtime-measurement pass exposed source discovery as the next bounded cost.
- 2026-07-29 — Compiled exact contract Resource sources, removed broad snapshot discovery, preserved five-case identity, and completed CLI/Studio/full-repository verification.

## Completion

Completed on `main`. Contract-value scheduling still observes a fresh exact commitment snapshot for every eligible Device evaluation, but it now reads only compiled possible sources of contracted Resources and owns no cached quantity or invalidation state.
