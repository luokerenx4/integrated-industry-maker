# Low-friction experiment loop

- Status: `active`
- Updated: `2026-07-28`
- Related design: [[docs/design/development-operations]], [[docs/design/operation-workbench]], [[docs/design/studio-debugger]], and [[docs/design/agent-cli-contract]].

## Outcome

Make the ordinary memory-fab loop—start current Studio, author one intervention, run or continue one experiment, observe progress, reopen evidence, and choose the next action—predictable and interruption-tolerant without asking a human or Agent to manage ports, guess whether a frontend bundle is stale, or wait on an opaque request.

## Context

The first operations plan established safe PID/port ownership and a twelve-second local confidence boundary, but the real design loop still exposes two distinct sources of friction.

First, lifecycle health proves only that the service, input root, project, PID, and engine version match. It does not bind the running server to the repository source that built its frontend and API. `studio start` can therefore idempotently reuse a same-project process whose Studio/Core source is stale, turning a valid occupied port into confusing old behavior.

Second, a full checkpoint currently takes `836.55s`; individual Design end-to-end tests take roughly `80–102s`. CLI and Studio expose case progress, but Studio still owns long work inside one response stream. Navigation, refresh, or a client disconnect can cancel or orphan the operator's sense of the run even though immutable completion is the real product boundary. Daily design work needs a short, reconnectable experiment path; the fourteen-minute repository checkpoint remains intentional only when saving or shipping a broad change.

This plan improves execution and feedback. It does not automate design judgment or weaken locked industrial authority.

## Scope

### In scope

- Bind managed Studio health and state to a deterministic runtime-source fingerprint.
- Make `studio status` distinguish current and stale source, and make same-project `studio start` safely replace a verified stale managed instance.
- Profile the cold and warm memory-fab experiment/Design loop by phase and select the next measured bottleneck.
- Give Studio long-running experiment and Design operations a reconnectable operation identity, retained progress/result state, and explicit cancellation independent of one page response.
- Preserve one shared operation/result contract for CLI and Studio while keeping CLI usable without a browser.
- Document the intended daily, checkpoint, and failure-recovery paths.

### Out of scope

- Parallelizing deterministic simulation before profiling proves it is the limiting safe intervention.
- Caching Candidate decisions, weakening fresh candidate simulation, or hiding locked-case work.
- CI provider redesign, deployment, or autonomous factory optimization.
- Killing unknown port occupants or adopting process ownership based only on a PID.

## Acceptance

- [x] `inm studio start` either serves current source or reports an exact safe blocker; it never silently reuses a stale same-project bundle.
- [x] `inm studio status` and `/api/health` expose the same current/stale source identity for humans and Agents.
- [x] A Studio experiment or Design operation can be left, refreshed, and reopened without losing its operation identity, completed progress, or immutable result.
- [ ] CLI and Studio report the same phase timings, cache reuse, completion artifact, failure, and cancellation semantics.
- [ ] The documented daily loop avoids the `836.55s` checkpoint boundary while targeted, fast, lifecycle, operation, and full checkpoint tests retain their explicit roles.

## Work

- [x] Add source-fresh managed Studio identity, automatic verified stale replacement, and lifecycle tests.
- [x] Measure one cold/warm Benchmark and one focused Design invocation end to end; record compilation, cache, simulation, comparison, artifact, and UI overhead.
- [x] Add a bounded project-local operation registry and reconnectable Studio API for experiment/Design execution.
- [ ] Project retained operation state and resume/cancel controls in Studio and equivalent operation identity in CLI output. Studio is complete; CLI identity remains.
- [x] Update lifecycle, operation, CLI, and contributor documentation.
- [ ] Complete browser lifecycle/reconnect QA, targeted checks, full checkpoint verification, commit, and push.

## Findings and decisions

- 2026-07-28 — Full repository verification passes `266` tests and `2249` assertions plus eight public fixtures, but costs `836.55s`. It is a checkpoint boundary, not the interaction budget for one industrial hypothesis.
- 2026-07-28 — The live port `4176` process reported project, PID, engine, and start time but no source/build identity. It had remained healthy across substantial Studio/Core edits, so successful health and current behavior were observably different facts.
- 2026-07-28 — Source freshness is the first slice because it removes stale-bundle and occupied-port ambiguity without changing industrial semantics or long-operation architecture.
- 2026-07-28 — Protocol V2 binds health and ignored lifecycle state to one SHA-256 over package/lock identity and non-test Core, CLI, and Studio runtime source. `status` reports expected/running identity; `start` reuses only a current process and automatically replaces stale source only when the root, project, PID, and prior source hash all match managed state.
- 2026-07-28 — A clean `equipment-energy-research` Benchmark took `3.05s` wall / `2.994s` operation cold and `1.54s` wall / `1.479s` operation warm. Warm baseline work fell from `1.526s` evaluation to zero; the fresh Candidate still spent `1.351s` evaluating versus `30ms` compiling and `1.8ms` comparing.
- 2026-07-28 — A focused one-Candidate `back-end-die-handoff` Design took `22.34s` cold and `16.61s` warm across fifteen cases. Exact warm baseline reuse covered five cases; the remaining case evaluations consumed `15.752s`, while compilation consumed `0.480s`, comparison `23ms`, and cache reads `2ms`. Simulation is more than `94%` of the warm wall boundary; bundling, JSON, and cache I/O are not the next bottleneck.
- 2026-07-28 — The next intervention is reconnectability, not unsafe Candidate-result caching or speculative simulator parallelism. A five-Candidate Program can legitimately require roughly a minute, but it must not require one uninterrupted browser request or operator attention for that minute.
- 2026-07-28 — Studio now owns Benchmark, Candidate preview, Design run, and continuation work by project-local operation id. Ignored snapshots retain up to `256` Core progress events plus result/error, explicitly cancel at a safe case boundary, mark unfinished work interrupted after server restart, and retain only the newest `16` terminal operations per project.
- 2026-07-28 — Recovery discovery must not transfer every retained result. The first implementation made `/operations` a `1,792,711`-byte payload after three real operations; lightweight summaries reduced it to `1,458` bytes, and one hard Experiment navigation reached its recovered result in `1.52s`.
- 2026-07-28 — Operation ordering uses a monotonic `createdOrder`, not wall-clock milliseconds plus random UUID. This makes “recover newest exact subject” deterministic when several requests start inside one millisecond.

## Verification

- Baseline `bun run check:fast` — `12.6s`.
- Baseline `bun run test` — `266` tests, `2249` assertions, `0` failures in `836.55s`; eight public Ironworks fixtures passed.
- Baseline live `studio status` — port `4176`, PID `85254`, start time `2026-07-28T11:08:12.441Z`, protocol V1, no source identity.
- `bun run typecheck` — passed after adding the shared source-identity contract.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts` — `5` passed in `1.79s`, including current reuse, explicit stale status, verified stale replacement, another-project refusal, and foreign-service refusal.
- `bun run check:fast` — `19` tests and `153` assertions passed with documentation and all repository TypeScript contracts in `13.4s`.
- Live managed `studio start`/`status`/`GET /api/health` — port `4176`, PID `32735`, protocol V2, expected/running hash `f3d300993d48…`, source `current`.
- Browser QA — `/memory-fab/factory` loaded current Blueprint `35ef45f0eb`, immutable run `091-simulate`, `28` machines, `34` sorters, and the run-bound observation/evidence panels.
- Isolated cold/warm `equipment-energy-research` profile — `3.05s` / `1.54s` wall; warm Candidate evaluation remained `1.351s` and dominated its phase.
- Isolated cold/warm one-Candidate `back-end-die-handoff` Design profile — `22.34s` / `16.61s` wall; warm run reused five fixed baselines and spent `15.752s` evaluating the ten fresh current/candidate cases.
- `bun run check:fast` — documentation, all TypeScript contracts, and `23` short tests / `163` assertions passed in `12.7s`; the fast suite now includes registry persistence, deduplication, cancellation, restart interruption, ordering, and retention.
- `bun test packages/inm-core/src/design-program.test.ts --test-name-pattern "honours cancellation"` — cancellation was observed after one exact case in `1.55s`, rejected with `AbortError`, and wrote no partial Design Run.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern "opening a project without runs"` — `91` assertions passed in `0.78s`, covering reconnectable Benchmark/Candidate operations, lightweight list summaries, exact result reopening, and stale-review failure.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern "Studio exposes the same memory-fab Design Program"` — `310` assertions passed in `72.82s` across a seven-Candidate run, continuation, operation progress recovery, immutable reopen, and guarded promotion.
- `bun test packages/inm-studio/src/server.test.ts` — all `5` Studio server suites and `464` assertions passed in `89.40s`, including cadence evidence, WebSocket refresh, read-only project behavior, reconnectable operations, and the complete memory-fab Design chain.
- Live Benchmark recovery — operation `ms4ovg4z-40b…` completed independently with four retained progress events and `DISCARD`; a newly opened Experiment route recovered the same id and full result.
- Live Design cancellation — operation `ms4oxptr-7e6…` was recovered in Studio at `21/45`, explicitly cancelled, stopped at `24/45`, retained `58` progress events, returned no result, and displayed `studio.operation-cancelled`.
- Live managed Studio — port `4176`, PID `42007`, source `current`; `/operations` is `1,458` bytes and recovered Experiment navigation completed in approximately `1.52s`.

## Progress log

- 2026-07-28 — Plan created from the real memory-fab Design checkpoint and live managed-service audit; the old V1 service was stopped cleanly before changing lifecycle identity.
- 2026-07-28 — Completed the source-current lifecycle slice. The plan remains active for measured experiment-loop profiling and reconnectable long operations.
- 2026-07-28 — Completed isolated cold/warm Benchmark and focused Design profiling. Selected the bounded project-local operation registry and reconnectable API as the next implementation slice.
- 2026-07-28 — Completed the Studio reconnect/cancel slice and real memory-fab browser QA. CLI execution identity/parity and the intentional full checkpoint remain before plan completion.

## Completion

Complete this section only when status becomes `completed`. Record the source-fresh lifecycle behavior, measured experiment-loop timing, reconnect/cancel semantics, verification evidence, and any measured performance follow-up that deserves a separate plan.
