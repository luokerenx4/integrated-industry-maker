# Low-friction development operations

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/development-operations]], [[docs/design/studio-debugger]], [[docs/design/agent-cli-contract]].

## Outcome

Make the ordinary INM development loop predictable enough that a human or Agent can start, inspect, reuse, restart, and stop Studio without process archaeology, and can run a fast local confidence check without waiting for the full repository checkpoint.

## Context

Studio currently delegates to one foreground Bun child. It has no identity endpoint, managed lifecycle, port ownership diagnosis, or durable logs. Tool-owned shells may reap descendants, while an old server can remain on a desired port and continue serving a stale frontend bundle. The repository also exposes only one full `test` script, so a small UI or CLI iteration pays for documentation, every TypeScript project, package tests, and an example fixture boundary at once.

This work improves execution and feedback. It does not replace human or Agent industrial judgment with autonomous search; memory-fab design remains an evidence-led review loop.

## Scope

### In scope

- A typed `inm studio start|status|restart|stop` lifecycle with project-root identity, health checks, port-conflict diagnosis, managed logs, and machine-readable status.
- A foreground server mode for tests and direct debugging.
- A small, explicit fast-check boundary for daily TypeScript/package iteration, while preserving full `bun run test` as the merge/checkpoint boundary.
- Public CLI discovery, documentation, tests, and operator guidance for the new behavior.

### Out of scope

- Killing an unknown process merely because it occupies the requested port.
- CI provider configuration, deployment, production supervision, or cross-machine orchestration.
- Industrial model, simulation semantics, Benchmark policy, or autonomous factory-design changes.
- Changing simulator algorithms or caching Candidate decisions; only exact fixed-baseline duplicate work belongs to this operational slice.

## Acceptance

- [x] A user can start Studio once, rerun start idempotently, inspect exact project/URL/PID/log state, restart onto current source, and stop it without finding or killing processes manually.
- [x] Occupied ports distinguish a matching INM Studio, another INM Studio project, and an unknown service; commands never terminate an unverified service.
- [x] CLI help/JSON discovery, Studio health data, and human output expose one consistent lifecycle contract.
- [x] `bun run check:fast` gives a materially shorter local signal, while targeted lifecycle tests and the full `bun run test` protect the checkpoint boundary.

## Work

- [x] Audit the current Studio process, port, bundle, and repository verification lifecycle.
- [x] Add the Studio identity/health contract and typed lifecycle controller.
- [x] Replace the public CLI launch grammar and capability descriptor; add lifecycle tests.
- [x] Add and measure the fast-check boundary without weakening the full test command.
- [x] Update design/CLI/contributor documentation and replace the ad-hoc live service with the managed command.
- [x] Reuse only hash-exact locked baseline evaluations across experiment processes and expose cache hits/misses on CLI and Studio.
- [x] Run an actual start/status/idempotent-start/restart/stop/start browser-ready lifecycle and the complete verification boundary.

## Findings and decisions

- 2026-07-28 — The current `inm studio` owns only a foreground child; the active port 4176 instance had to be submitted manually to `launchctl` because tool-session descendants were reaped.
- 2026-07-28 — Server startup bundles the frontend once. Project file watching refreshes data but cannot make a long-lived server pick up changed Studio source, so explicit restart is part of correctness rather than convenience.
- 2026-07-28 — Lifecycle identity will be verified over HTTP before reuse or termination. Port occupancy alone is never authority to kill a process.
- 2026-07-28 — Managed background execution is an operator convenience; `serve` remains the direct foreground primitive used by tests and debugging.
- 2026-07-28 — The first proposed fast suite accidentally included long memory-fab guardrail simulations and took 59.1 seconds. Removing that integration file left the same docs/type/unit boundary at 12.1 seconds; the heavy evaluator remains in the full checkpoint.
- 2026-07-28 — Profiling confirmed every standalone Benchmark repeated its immutable baseline cases. The cache therefore binds the complete lock/engine/case identity and leaves candidate simulations and decisions fresh.
- 2026-07-28 — On `equipment-energy-research`, the cold operation took 3427 ms / 3.50 s wall with one baseline miss; the identical warm operation took 1763 ms / 1.83 s wall with one hit, while scores, verdict, reasons, hashes, and simulated ticks remained identical.

## Verification

- `bun run check:fast` — passed in 11.9 seconds: documentation, all TypeScript projects, and 18 short unit tests.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts` — 4 passed, including discovery, lifecycle, foreign service, and cross-project safety.
- `bun test packages/inm-studio/src/server.test.ts packages/inm-cli/src/studio-lifecycle.test.ts` — 8 passed before the final full boundary.
- Actual macOS lifecycle on port 4176 — start PID 31115, status, idempotent reuse, restart PID 31126, later final-source restart PID 37144, and exact `/api/health` identity all passed.
- Actual browser reload of `/memory-fab/factory` — complete Factory workbench loaded and browser console contained no errors or warnings.
- `equipment-energy-research` cold/warm — 3427/1763 ms operation duration and 3.50/1.83 s wall with identical industrial result.
- `bun run test` — 250 tests, 2130 assertions, 0 failures, followed by 8 passing public Ironworks fixtures.

## Progress log

- 2026-07-28 — Plan created and current process/test bottlenecks audited.
- 2026-07-28 — Implemented health identity, managed lifecycle, safe port diagnosis, project-local logs/state, explicit CLI discovery, and the 12.1-second fast check.
- 2026-07-28 — Replaced the manually submitted port 4176 process with the managed memory-fab service and proved start/status/reuse/restart against the real macOS backend.
- 2026-07-28 — Completed browser QA, measured baseline reuse, corrected `.inm` test isolation, and passed the full checkpoint.

## Completion

Shipped an explicit managed Studio lifecycle, health/ownership protocol, safe port diagnosis, local logs, current-source restart, a 12-second fast boundary, and exact fixed-baseline Benchmark reuse without caching Candidate decisions. The live memory-fab Studio is running under the new manager on port 4176. Case-level progress and deeper Candidate-evaluator profiling continue separately in [[plans/observable-benchmark-execution]].
