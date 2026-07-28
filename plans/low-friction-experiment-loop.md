# Low-friction experiment loop

- Status: `completed`
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
- [x] CLI and Studio report the same phase timings, cache reuse, completion artifact, failure, and cancellation semantics.
- [x] The documented daily loop avoids the `836.55s` checkpoint boundary while targeted, fast, lifecycle, operation, and full checkpoint tests retain their explicit roles.

## Work

- [x] Add source-fresh managed Studio identity, automatic verified stale replacement, and lifecycle tests.
- [x] Measure one cold/warm Benchmark and one focused Design invocation end to end; record compilation, cache, simulation, comparison, artifact, and UI overhead.
- [x] Add a bounded project-local operation registry and reconnectable Studio API for experiment/Design execution.
- [x] Project retained operation state and resume/cancel controls in Studio and equivalent operation identity in CLI output.
- [x] Update lifecycle, operation, CLI, and contributor documentation.
- [x] Complete browser lifecycle/reconnect QA, targeted checks, full checkpoint verification, commit, and push.

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
- 2026-07-28 — The lifecycle shape now lives in Core rather than Studio. CLI V2 and Studio share exact subjects, status, progress, timing, artifact, error, and cancellation fields while CLI remains an in-process invocation that does not pretend it can resume after its process exits.
- 2026-07-28 — Candidate Apply was still a long response-bound re-evaluation plus guarded write after Preview had become reconnectable. It is now a retained `candidate-apply` operation too; cancellation remains before the atomic Blueprint write boundary.
- 2026-07-28 — One CLI `SIGINT`/`SIGTERM` is cooperative and exits `130`; a second signal is immediate termination. NDJSON progress and the compact terminal error retain one operation id, stdout remains empty, and cancelled Design writes no partial immutable evidence.
- 2026-07-28 — Browser code imports the execution contract through the explicit `@inm/core/operation-execution` subpath. Importing its runtime helper through the Core aggregate entry pulled Node-only Device runtime exports into the browser build and was rejected rather than hidden behind bundler configuration.
- 2026-07-28 — Cancellation authority ends at Core's commit boundary. A final audit found that an outer post-run signal check could label an already-written Candidate/Design artifact cancelled; the registry now accepts Core completion as terminal authority and retains a late cancellation timestamp without denying the committed result.

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
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "public CLI cancellation"` — one real memory-fab Benchmark process accepted `SIGINT`, retained its id across progress/error records, returned `operation.cancelled`, exited `130`, emitted no stdout, and wrote no artifact in `0.17s`.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "current memory-fab Benchmark exposes"` — the public ten-case Benchmark path retained one execution id across `20` timed/cache-aware progress events and the completed V2 envelope in `8.18s`.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "CLI-only operator discovers"` — public Candidate preview/apply/stale-replay behavior passed with completed execution artifacts in `29.73s`.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "public Design Program workflow"` — initial Design, continuation, immutable artifact, and execution/progress identity passed `71` assertions in `71.72s`.
- `bun test packages/inm-studio/src/server.test.ts` — all `5` Studio server suites and `451` assertions passed in `84.83s`, including reconnectable Candidate Apply and the complete memory-fab Design chain.
- `bun run check:fast` — documentation, all TypeScript contracts, and `26` short tests / `167` assertions passed in `11.9s`.
- Final-audit `bun run check:fast` — documentation, all TypeScript contracts, and `27` short tests / `168` assertions passed in `12.5s`, including the late-cancellation/committed-result race.
- Live managed Studio V2 — stale PID `42007` was safely replaced by source-current PID `51594`; status reports matching source hash `4f6c6187bd03…`.
- Browser QA — `/memory-fab/factory` opened current immutable run `091-simulate`; a new `equipment-energy-research` operation showed RUNNING as `ms4q2ekq-421…`, and immediate route navigation recovered the same id as COMPLETED with its verdict.
- Pre-audit `bun run test` — documentation, all TypeScript projects, `276` tests / `2608` assertions, and all eight public Ironworks fixtures passed in `730.40s` plus fixture execution.
- Final exact-source `bun run test` — after the late-cancellation commit-boundary fix, documentation, all TypeScript projects, `277` tests / `2585` assertions, and all eight public Ironworks fixtures passed in `654.84s` plus fixture execution.
- Final managed Studio restart/status — port `4176`, PID `60036`, protocol V2, expected/running hash `e1cb7c98119b…`, source `current`.

## Progress log

- 2026-07-28 — Plan created from the real memory-fab Design checkpoint and live managed-service audit; the old V1 service was stopped cleanly before changing lifecycle identity.
- 2026-07-28 — Completed the source-current lifecycle slice. The plan remains active for measured experiment-loop profiling and reconnectable long operations.
- 2026-07-28 — Completed isolated cold/warm Benchmark and focused Design profiling. Selected the bounded project-local operation registry and reconnectable API as the next implementation slice.
- 2026-07-28 — Completed the Studio reconnect/cancel slice and real memory-fab browser QA. CLI execution identity/parity and the intentional full checkpoint remain before plan completion.
- 2026-07-28 — Completed shared Core execution identity, CLI V2 progress/success/failure projection, signal cancellation, reconnectable Candidate Apply, targeted public-binary verification, and live browser recovery. Only the intentional full repository checkpoint and saved commit remain.
- 2026-07-28 — Completed the intentional exact-source repository checkpoint with `277` tests, `2585` assertions, and eight public fixtures. All acceptance items are satisfied and the plan is complete.

## Completion

Managed Studio now binds one safe PID/port owner to the exact runtime-source fingerprint and replaces only a verified stale same-project process. Studio Benchmark, Candidate preview/apply, Design run, and continuation work are bounded project-local operations that survive navigation, recover exact progress/results, and cancel only through an explicit safe Core boundary. CLI V2 uses the same lifecycle state, timing/cache progress, terminal artifacts, errors, and cancellation semantics without depending on Studio; one signal returns `130` and no partial result.

The daily boundary remains `bun run check:fast` at roughly twelve seconds, while the full repository checkpoint is an intentional save/ship boundary. Profiling still identifies fresh deterministic simulation as more than 94% of a warm focused Design run. Reconnectability removes operator blockage without weakening candidate evaluation; any further simulator improvement should start from a separate measured plan rather than speculative caching or autonomous optimization.
