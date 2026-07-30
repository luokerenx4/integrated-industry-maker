# Resilient Studio source adoption

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/development-operations]], [[plans/frictionless-industrial-design-cycle]], [[plans/live-project-evidence-refresh]], and [[plans/evidence-backed-metrology-standby-investigation]].

## Outcome

Keep the project-owned Studio supervisor alive when a newly adopted source revision fails to compile, preserve the last exact failure as visible lifecycle evidence, and automatically retry when source changes again so an ordinary edit cannot strand humans or Agents on a dead port.

## Context

While visually verifying the Investigation continuation UI, the running Studio detected a new source identity, stopped its stale child, and attempted replacement. The replacement hit a transient TypeScript compile error. Both child and supervisor then exited. Fixing the source was insufficient because no owner remained to observe the next source identity; the user-facing result was `ERR_CONNECTION_REFUSED` until a fresh `inm session` recreated the manager/server pair.

This is not a CI problem and not an industrial-model problem. It is a local development control-loop failure: an expected intermediate edit state tears down the feedback surface that should report and recover from it.

## Scope

### In scope

- Preserve one project-owned supervisor across child startup, compile, and source-adoption failures.
- Keep the last healthy child until a replacement is ready when the runtime permits atomic handoff; otherwise expose the bounded unavailable state without losing manager ownership.
- Record the attempted source hash, failure phase, stable error summary, and retry state in project-local lifecycle status.
- Retry on the next source-identity change and allow explicit `studio restart`/`session` to force an immediate retry.
- Project the same degraded/recovering/current state through `studio status`, `session`, logs, and Studio's health surface.
- Add deterministic process-level tests for fail, remain supervised, edit, recover, and stop.

### Out of scope

- Hiding compile errors, serving a mismatched source as current, infinite rapid restart loops, CI redesign, or broad replacement of the existing project-owned lifecycle.

## Acceptance

- [x] A replacement child compile failure does not terminate the verified project supervisor.
- [x] Status names the attempted source, last healthy/running source, failure phase, bounded error, and whether retry is waiting for source change or explicitly requested.
- [x] A subsequent valid source edit converges to one current child on the same managed port without another manual start command.
- [x] Repeated identical failures do not busy-loop or leak child processes, ports, lock files, or stale ownership.
- [x] Explicit restart, stop, and session retain their current non-destructive project/port guarantees.
- [x] Process-level tests, targeted CLI/Studio tests, a real fail/fix recovery exercise, and the full checkpoint pass.

## Findings and decisions

- 2026-07-30 — The observed failure occurred after correct stale-source detection and child teardown. The missing contract is supervisor survival plus retry, not more port discovery.
- 2026-07-30 — A compile failure is actionable development state. It should remain inspectable instead of becoming an unexplained refused connection.
- 2026-07-30 — Adoption is now two-phase. The supervisor bundles both server and browser entries in memory before terminating the serving child; a syntax/import failure therefore leaves the exact last healthy server and port available.
- 2026-07-30 — Lifecycle protocol V5 owns strict supervisor state: phase, attempted hash, serving child PID, generation, retry trigger, and optional timestamped preflight/startup failure. No compatibility reader is retained for pre-release V4 state.
- 2026-07-30 — A failed hash is retried only after a distinct source identity or one explicit `SIGUSR1` request from `start`/`session`. An already healthy child that exits for an unrelated reason remains a fatal visible crash rather than an automatic loop.
- 2026-07-30 — Studio polls its own health and renders a bounded source-adoption notice. Humans keep the last healthy workbench and see why new source is paused; Agents receive the same record from health/status or stable `session.studio-degraded`.
- 2026-07-30 — The whole preflight/handoff/readiness interval is serialized. Saves observed during that interval schedule one follow-up reconciliation; a preflighted hash that is no longer latest is skipped before child teardown, preventing concurrent adoption, redundant handoffs, and port races.
- 2026-07-30 — Manager-only state is owned by a one-second heartbeat with a five-second validity window. A live but reused PID cannot turn an abandoned state file into authority over an unrelated process.

## Verification

- Reproduction evidence: a transient duplicate `anchorIds` declaration caused the source-adopted child to fail compilation; the supervisor exited and required an ordinary `inm session` recovery on managed port `4176`.
- Process regression: `failed source adoption keeps the supervisor and last healthy server alive until a valid edit recovers` proves unchanged manager/server PIDs during preflight failure, exact degraded projection, one failure without a busy loop, explicit session retry/error, next-hash recovery, and one bounded child replacement.
- `rapid source edits serialize adoption and skip a superseded handoff` proves a delayed intermediate hash never tears down the child, concurrent saves converge to the latest hash, and only one replacement generation is started.
- `stale manager heartbeat cannot claim or terminate an unrelated reused PID` proves abandoned project state is not process authority.
- Targeted lifecycle/Studio verification: 27 tests / 1,146 assertions across lifecycle, server routes, evidence refresh, and watch protocol. Fast checks also pass 35 tests / 221 assertions.
- Final real memory-fab exercise on port `4176`: source-current manager `57501` and server `57503` served `23a988a154c7…`; invalid source `958ebb52a17d…` preserved both PIDs and HTTP health while recording `main.tsx:3711:42 · Unexpected ;`; reverting the edit restored `current` with the same manager, child, port, and generation, without a lifecycle command.
- Final full checkpoint: documentation and all TypeScript projects pass; 321 tests / 3,517 assertions pass across Core, CLI, and Studio; all eight Ironworks fixtures pass.
- A validation-only Benchmark loader test received an explicit 15-second budget after one full-suite filesystem cleanup run crossed its implicit five-second boundary; the isolated test completed in 281 ms and the repeated complete checkpoint passed.

## Completion

Complete when an invalid intermediate source can temporarily degrade Studio without destroying its project-owned control loop, and the next valid edit recovers the same session automatically with exact status evidence.
