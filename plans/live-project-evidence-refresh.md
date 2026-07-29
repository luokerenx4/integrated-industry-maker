# Live project evidence refresh

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]]

## Outcome

Make a running managed Studio adopt current runtime source and discover newly completed immutable Runs, Design Runs, Candidate reviews, and operation evidence on its existing project URL and port, without a manual process restart, while preserving deterministic project selection and bounded request latency.

## Context

During [[plans/in-process-wip-conservation]], CLI generated compatible memory-fab Run `093-simulate` after the engine advanced to `inm-sim/0.88.0` while an older Studio process was still running. Direct navigation to `/memory-fab/factory?run=093-simulate` returned `Unknown compatible immutable run` until the managed Studio was restarted. Source-current lifecycle management correctly repaired the service, but a user or Agent should not need to diagnose source identity or restart a port after ordinary development.

The existing WebSocket watcher already keeps browser sessions connected to ordinary project-source changes, and Studio API loaders scan evidence from disk per request. Two contracts are missing: the watcher suppresses every `runs/` event rather than publishing only the completed manifest boundary, and the managed service has no supervisor that replaces a stale runtime while preserving its URL. Both must close together so a browser can reconnect, compare source identity, reload its current bundle, and then read only complete current-engine evidence.

## Scope

### In scope

- Identify the startup-time cache or project projection that hides newly created Runs and Design evidence.
- Add deterministic project-local invalidation for completed Run, Design Run, and Candidate review publication.
- Supervise the managed Studio runtime so source changes replace only its verified child process on the same port.
- Carry source identity over the WebSocket handshake so an attached browser reloads after a supervised replacement.
- Refresh an open compatible route or expose one explicit stale/loading state until the new artifact is readable.
- Cover CLI-started simulation, Studio-owned Experiment completion, Design continuation, Candidate review, and a directly added completed artifact.
- Verify portless managed lifecycle, workspace project isolation, interrupted/partial artifact writes, and browser reconnect behavior.

### Out of scope

- Watching arbitrary editor changes to Blueprint source.
- Treating partial operation files as completed evidence.
- Replacing immutable evidence with a mutable live result.
- Broad filesystem polling when an exact artifact publication or bounded watcher can provide the invalidation signal.
- Hot-reloading mutable server modules inside one Bun process.

## Acceptance

- [x] A running managed Studio adopts changed runtime source on the same project URL and port without a lifecycle command, extra process instance, or route error.
- [x] A running Studio opens a newly completed compatible Run without manual restart or route error.
- [x] Open Overview, Factory, Runs, Design, and Candidate surfaces refresh only after complete immutable evidence is readable.
- [x] Partial, interrupted, stale-engine, and unrelated-project evidence never becomes current authority.
- [x] Managed lifecycle retains one verified process and port; no additional service is spawned for refresh.
- [x] CLI, Studio server, browser, type, documentation, memory-fab, and Ironworks regressions pass.

## Work

- [x] Trace the current project/evidence index lifetime and publication boundaries.
- [x] Design one exact invalidation and client refresh contract.
- [x] Implement server and browser refresh with strict partial-write handling.
- [x] Add lifecycle, project-isolation, and direct route regressions.
- [x] Verify from a running Studio with one newly generated memory-fab Run.

## Findings and decisions

- 2026-07-29 — The managed lifecycle itself is healthy: `studio restart` replaced only the verified memory-fab process, retained port `4176`, and reported matching expected/running source hashes. The defect is evidence discovery lifetime, not port ownership.
- 2026-07-29 — Studio does not retain a startup-time Run or Design index: `loadStudioData()`, Workbench, and Design endpoints scan disk on every request. The exact evidence defect is watcher policy—every `runs/` event is suppressed, while Design and Candidate directories can currently publish noisy intermediate refreshes.
- 2026-07-29 — The observed `093-simulate` route failure was specifically a stale runtime boundary: the older server's `ENGINE_VERSION` correctly rejected the new-engine Run. A completed-artifact watcher alone would not repair that case. Managed source supervision and browser source-hash handoff are therefore part of the same experience contract.

## Verification

- `bun run test` — 308 tests, 3,292 assertions, 1,125 documentation links, all repository TypeScript projects, and all eight public Ironworks scenarios passed.
- Targeted watcher coverage proves strict source readiness, project-qualified workspace events, complete Run publication, exact direct Run reopening, and silence for an invalid partial manifest.
- Targeted lifecycle coverage proves a managed source hash change replaces the child server while retaining its supervisor and port.
- A temporary self-contained memory-fab was opened at `/memory-fab/factory` before it had evidence. Publishing `000-simulate` exposed the new-directory watcher race and drove the bounded-retry fix. After automatic source replacement recovered that Run, publishing `001-simulate` changed the still-open Factory from one to two Runs without manual refresh, preserved its exact `000-simulate` route, and opened the direct `001-simulate` route without an error.
- During that browser session, a real Studio source edit retained manager PID `40600`, replaced server PID `40604` with `41457` on port `4197`, and caused the connected page to reload onto the new bundle and recover its exact Factory route.
- The developer memory-fab service was migrated from the verified protocol-V2 launchd entry to protocol V3 on port `4176`. Subsequent implementation edits retained manager PID `45941`, automatically replaced the server with PID `48966`, and now report current source hash `c71c1a41545c`.

## Progress log

- 2026-07-29 — Proposed from direct human/Agent Factory use after Run `093-simulate` was generated behind an already-running Studio.
- 2026-07-29 — Activated after tracing per-request evidence loading, completion-marker publication, current WebSocket behavior, and managed source ownership.
- 2026-07-29 — Implemented the managed supervisor, source-hash WebSocket handshake, project-qualified completion events, settled manifest probes, no-store client delivery, and route-preserving refresh. Targeted type, watcher, direct-Run, partial-write, and same-port source-adoption regressions pass.
- 2026-07-29 — Real browser verification found a new-directory watcher race that short simulations did not expose. Completion probes now retry for a strict bounded window and publish each immutable evidence identity once.
- 2026-07-29 — Completed after full regression, temporary memory-fab browser verification, and migration of the active developer Studio to the supervised protocol.

## Completion

Managed Studio now owns one stable project URL while treating server source and immutable project evidence as two explicit lifecycles. Source changes replace the verified child and reload attached clients by identity; project changes refresh only their owning surface after Core can reopen the complete artifact. Humans and Agents can therefore keep a Factory or Experiment route open while CLI and Studio work publish evidence, without diagnosing stale bundles, restarting a remembered port, or observing half-written authority.
