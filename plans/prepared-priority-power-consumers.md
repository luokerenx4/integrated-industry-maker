# Prepared priority power consumers

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/power]], [[docs/design/simulation-runtime]], [[plans/compiled-power-allocation-order]], and [[plans/single-pass-grid-power-observation]].

## Outcome

Make priority power arbitration visit only simulation-local Device/kind combinations that can physically become active consumers, while retaining exact live eligibility, allocation, interruption, restoration, event, Evaluation, and trace behavior.

## Context

The current post-observation memory-fab profile attributes `375` inclusive samples, or about `9%`, to `rebalanceActivePower()`. The generated fab has two grids and `62` connected Devices. Every settle pass currently visits all `62` Devices, derives all three possible consumer states, and then checks the fixed `job → station-charge → transport` kind sequence even though a Device's static role cannot change during one simulation.

The current memory fab has no station-energy Device, `34` transport endpoints, and `24` non-infrastructure Devices whose synchronous program or physical maintenance, changeover, wake, extraction, treatment, or generation behavior can own an active job. Static consumer possibility is therefore `58` ordered descriptors instead of the full `186` Device × kind combinations.

Eligibility remains live. An active job may appear, finish, fail, sleep, wake, generate, or pause; station energy and transport phase may change at any event. The prepared representation may contain only immutable Device role, connection, stage, grid, and total ordering. It must never cache whether a consumer is currently requesting power.

## Scope

### In scope

- One simulation-local ordered priority-consumer descriptor list per grid.
- Static job capability based on the same permanent exclusions as Device evaluation, while preserving generic project-local `start` decisions.
- Prepared station-charge and transport endpoint descriptors.
- Station charge-satisfaction reset through prepared station topology.
- Exact live job, generation, failure, standby, charge, transport phase, paused work, and remaining-power reads.
- Exact power priority, Device-id tie breaking, fixed kind order, events, Evaluation hashes, complete Simulation Trace hashes, Benchmark, Candidate, CLI, and Studio behavior.

### Out of scope

- Mutable eligibility caches, epochs, dirty flags, or retained power observations.
- Changes to priority-load-shedding or proportional allocation semantics.
- Memory-fab-specific shortcuts.
- Port/process lifecycle cleanup, which remains the next separate operator-experience intervention.

## Acceptance

- [x] Priority arbitration no longer scans impossible Device/kind combinations.
- [x] Prepared traversal preserves Device power rank followed by `job → station-charge → transport`.
- [x] Every allocation decision still reads mutable eligibility and demand from authoritative live state.
- [x] Focused power tests preserve exact allocation, preemption, restoration, transport, station, generation, and resumed-work behavior.
- [x] Warm five-case memory-fab evaluation and the active-power profile improve at an immediately paired measurement boundary.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Identify the current CPU boundary and immutable-versus-live state split.
- [x] Capture an immediate repeated warm five-case baseline on clean `main`.
- [x] Compile the possible priority-consumer sequence once per simulation.
- [x] Replace the superseded Device × kind scan and reuse prepared station topology.
- [x] Prove exact power behavior and five-case identity, then re-profile.
- [x] Complete full verification, commit, and push.

## Findings and decisions

- 2026-07-29 — `rebalanceActivePower()` owns `375` inclusive samples in `/tmp/inm-single-pass-grid-power.final.EmmIhF/five.cpuprofile`; `standbyPower()` and repeated role/eligibility probing remain inside that boundary.
- 2026-07-29 — Generic project-local Device programs may return a host-validated `start` decision even without a compiled Process. Job possibility therefore follows permanent Device-evaluation exclusions, not only `processPlans`.
- 2026-07-29 — The descriptor list owns only immutable topology and ordering. Job presence, fuel generation, failure, station demand, transit phase, and power satisfaction remain same-pass live reads.
- 2026-07-29 — Fifteen measured warm evaluations on clean `main` average `435.09ms`, range `364.05–543.30ms`, with exact five-case identities captured in `/tmp/inm-prepared-priority-power.before.json`.
- 2026-07-29 — The compiled generated fab has `24` possible job owners, no station-charge consumer, and `34` transport consumers: `58` prepared descriptors replace `186` repeated Device × kind checks.
- 2026-07-29 — The identical immediate measurement averages `371.98ms`, a `14.50%` reduction. All fifteen event counts, Evaluation hashes, and complete Simulation Trace hashes match.
- 2026-07-29 — The final profile reduces `rebalanceActivePower()` from `375` to `261` inclusive samples (`30.40%`) and from `271` to `166` self samples (`38.75%`).

## Verification

- Current profile: `/tmp/inm-single-pass-grid-power.final.EmmIhF/five.cpuprofile`.
- `/tmp/inm-prepared-priority-power.before.json` — three repeats of all five locked cases average `435.09ms`; `/tmp/inm-prepared-priority-power.before.time` records `9.26s` real, `11.17s` user, and `0.37s` system for warmup plus measurement.
- `/tmp/inm-prepared-priority-power.after.json` — the same fifteen evaluations average `371.98ms`, range `320.66–446.39ms`; every exact identity matches the baseline.
- `/tmp/inm-prepared-priority-power.after-profile.0YqHR0/five.cpuprofile.cpuprofile` — active arbitration falls from `375 → 261` inclusive and `271 → 166` self samples.
- Focused power suite — `12` tests and `55` expectations pass.
- `bun run check:fast` — `1048` documentation links, all TypeScript projects, `30` tests, and `179` expectations pass.
- Public CLI operation `ms51c1t6-2ecc36a1-6bc9-49b6-a57d-bdf96ed1f752` — five parallel Candidate cases, `20` progress events, Candidate `35ef45f0…`, verdict `KEEP`, score delta `117.75790545277778`, and `2,400,000` ticks complete in `1.35s` operation time.
- Source-current Studio PID `66459`, port `4176` — operation `ms51cx6r-0c085f07-e260-429d-a046-7b1d677ece6d` completes `20` progress events and returns the same Candidate, verdict, delta, and ticks in `1.22s`.
- Browser QA — the Factory replay and reconnectable Experiment workbench reload to complete current state; the workbench shows `CANDIDATE · 5/5`, `10/10`, `KEEP`, and `+117.757905`; both browser console error/warning reads are empty.
- `bun run test` — `1048` documentation links, all TypeScript projects, `286` tests with `3338` expectations, complete Studio lifecycle coverage, and all eight Ironworks fixtures pass in `192.71s`.

## Progress log

- 2026-07-29 — Activated from clean `main` at `8d3a7f7` after same-pass grid observation exposed active priority arbitration as the next bounded simulator hotspot.
- 2026-07-29 — Prepared only possible job, station-charge, and transport descriptors in exact Device/kind order, then replaced the superseded full Device × kind scan.
- 2026-07-29 — Proved exact five-case identity, material speedup, source-current CLI/Studio lifecycle, and browser-visible reconnectable completion before the full checkpoint.
- 2026-07-29 — Completed the full repository checkpoint and archived the plan for commit and push.

## Completion

Completed on `main`. Priority allocation now traverses only simulation-local possible consumer descriptors while every actual request and power decision remains live. The current memory-fab five-case loop improves by `14.50%` at the immediately paired boundary with exact industrial evidence parity.
