# Single-pass Design evidence

- Status: `active`
- Updated: `2026-07-28`
- Related design: [[docs/design/design-programs]], [[docs/design/experiment-workbench]], [[docs/design/development-operations]], [[docs/design/fab-loss-attribution]], and [[docs/design/simulation-runtime]].

## Outcome

Make one Design candidate case produce both locked Benchmark scoring and causal driver-loss evidence in a single deterministic simulation, while making CLI and Studio report honest case work, cache reuse, and timings.

## Context

The current memory-fab Design loop evaluates every seed and Candidate across the locked Benchmark, but then separately replays the same driver case to recover events for fab-loss attribution. It may replay the selected parent again before the next proposal. The extra work is not represented by a case-start/completion pair, even though the progress counter calls it a simulation.

A warm one-Candidate `burn-in-changeover-convergence` run took `18,930 ms`. It emitted 15 Benchmark case pairs but reported `16/16 simulations`: five baseline cases, five seed cases, five Candidate cases, plus one invisible Candidate driver replay. The seed driver was also replayed before proposal generation. Scoring and causal evidence should be two projections of one exact simulation result, not two executions.

INM is pre-alpha. This plan replaces the misleading progress fields directly and adds no compatibility aliases.

## Scope

### In scope

- Retain one ephemeral exact `SimulationResult` for a selected Candidate case while Benchmark evaluation is in progress.
- Derive seed, parent, and Candidate driver-loss evidence from the already evaluated locked driver case.
- Fall back to an explicit replay only when continuing historical evidence that lacks a retained runtime trace.
- Replace Design progress's misleading simulation counter with exact completed/planned case evaluations.
- Project per-case duration, phase timings, and baseline cache reuse through CLI and Studio.
- Measure a real one-Candidate memory-fab Design before and after with immutable result parity.

### Out of scope

- Candidate-result caching, skipped locked cases, approximate simulation, or changed industrial semantics.
- Parallel case workers, simulator event changes, Objective changes, or autonomous proposal generation.
- Optimizing the next `probe-to-packaging` transport intervention in the same change.

## Acceptance

- [x] A fresh loss-targeted Design performs no separate seed, parent, or Candidate driver replay beyond its locked Benchmark case evaluations.
- [x] Causal loss evidence, Candidate verdict, immutable result hash, events, and metrics remain exact.
- [x] CLI and Studio show identical honest case progress, cache reuse, and elapsed timing without calling cached work a simulation.
- [x] The representative one-Candidate memory-fab run is materially faster than the recorded `18,930 ms` baseline.
- [ ] Focused tests, a real Design run, browser observation, full verification, commit, and push pass.

## Work

- [x] Audit and measure the current Benchmark/Design execution and progress paths.
- [x] Add a single-pass case-result projection at the Benchmark boundary.
- [x] Reuse driver evidence across seed, Candidate, and retained frontier nodes.
- [x] Replace Design progress fields and update CLI, Studio, tests, and durable design docs.
- [ ] Measure, visually verify, complete all gates, commit, and push.

## Findings and decisions

- 2026-07-28 — Baseline caching already removes fixed simulation work; the remaining duplicate is loss-attribution replay of a case that Candidate scoring just executed.
- 2026-07-28 — A warm one-Candidate burn-in run took `18,930 ms`, emitted 15 visible case evaluations, and reported 16 simulations because one Candidate driver replay was invisible.
- 2026-07-28 — The Benchmark result intentionally stores compact metrics, not events. Single-pass causality therefore belongs to an ephemeral evaluation callback; full simulation traces must not enter immutable Benchmark or Design artifacts.
- 2026-07-28 — The first post-change run took `15,900 ms`, reported exactly `15/15` case evaluations, emitted no replay, and reproduced immutable result `197c4310560a…` byte-for-byte. The six-Candidate inspection frontier fell from the earlier `81.19 s` focused run to `63.25 s`.
- 2026-07-28 — Browser observation found that Studio's latest-event state made completed timing too fleeting to read. Studio now retains the latest completed case beside the currently running case; the real page showed `LAST SEED · quality-excursion · simulated · 1610 ms` while the next case evaluated.
- 2026-07-28 — Final verification exposed one contract distinction: semantic progress phases, identities, and work counts are deterministic, while cache hits and elapsed timings are execution-local diagnostics. Tests and durable docs now compare and promise only the deterministic skeleton.

## Verification

- Pre-change real run: `burn-in-changeover-convergence`, one Candidate, warm baseline cache — `18,930 ms`, 15 visible case evaluations, misleading `16/16 simulations`.
- Post-change real run: identical Program/Candidate/cache — `15,900 ms`, exact result `197c4310560a…`, existing artifact reused, 15 timed case evaluations, zero driver replays.
- `bun test packages/inm-core/src/design-program.test.ts --test-name-pattern "inspection supply Design"` — passed in `63.25 s`; six exact loss-target decisions preserved the existing immutable artifact id with 40 case evaluations and zero replay.
- Public CLI and Studio Design integration tests — passed in `76.61 s` and `71.88 s`; V3 progress, timing/cache projection, and explicit continuation replay were exercised.
- `bun run check:fast` — documentation links, all TypeScript surfaces, and 19 short unit tests passed.
- Managed Studio restarted on port `4176` as PID `85254`. Real browser ran the burn-in Program, showed persistent previous-case timing beside current work, completed `15/15 CASES`, and logged no console warnings or errors.
- `bun run test` — 265 package tests and 2,243 assertions passed in `691.36 s`; all eight Ironworks project tests then passed.

## Progress log

- 2026-07-28 — Plan created from real full-checkpoint and one-Candidate Design timing evidence.
- 2026-07-28 — Implemented single-pass driver trace projection, Design progress V3, exact continuation replay visibility, and persistent Studio timing after browser-led correction.
- 2026-07-28 — Corrected the deterministic-versus-operational progress contract, passed every final gate, and prepared the checkpoint for `main`.

## Completion

Complete this section after the implementation checkpoint is committed and pushed.
