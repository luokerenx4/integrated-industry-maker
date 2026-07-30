# Resilient Studio source adoption

- Status: `proposed`
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

- [ ] A replacement child compile failure does not terminate the verified project supervisor.
- [ ] Status names the attempted source, last healthy/running source, failure phase, bounded error, and whether retry is waiting for source change or explicitly requested.
- [ ] A subsequent valid source edit converges to one current child on the same managed port without another manual start command.
- [ ] Repeated identical failures do not busy-loop or leak child processes, ports, lock files, or stale ownership.
- [ ] Explicit restart, stop, and session retain their current non-destructive project/port guarantees.
- [ ] Process-level tests, targeted CLI/Studio tests, a real fail/fix recovery exercise, and the full checkpoint pass.

## Findings and decisions

- 2026-07-30 — The observed failure occurred after correct stale-source detection and child teardown. The missing contract is supervisor survival plus retry, not more port discovery.
- 2026-07-30 — A compile failure is actionable development state. It should remain inspectable instead of becoming an unexplained refused connection.

## Verification

- Reproduction evidence: a transient duplicate `anchorIds` declaration caused the source-adopted child to fail compilation; the supervisor exited and required an ordinary `inm session` recovery on managed port `4176`.

## Completion

Complete when an invalid intermediate source can temporarily degrade Studio without destroying its project-owned control loop, and the next valid edit recovers the same session automatically with exact status evidence.
