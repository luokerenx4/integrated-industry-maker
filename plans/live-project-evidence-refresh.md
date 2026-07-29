# Live project evidence refresh

- Status: `proposed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]]

## Outcome

Make a running Studio discover newly committed immutable Runs, Design Runs, Candidate reviews, and operation evidence without a manual process restart, while preserving deterministic project selection and bounded request latency.

## Context

During [[plans/in-process-wip-conservation]], CLI generated compatible memory-fab Run `093-simulate` while Studio was already running. Direct navigation to `/memory-fab/factory?run=093-simulate` returned `Unknown compatible immutable run` until the managed Studio was restarted. Source-current lifecycle management correctly repaired the service, but a user or Agent should not need to understand that project evidence discovery is tied to process startup.

The existing WebSocket watcher already keeps browser sessions connected to source changes. The missing contract is narrower: a new immutable evidence directory under a project-local ignored path must invalidate only the affected project evidence index, refresh open routes safely, and never require guessing or killing a port.

## Scope

### In scope

- Identify the startup-time cache or project projection that hides newly created Runs and Design evidence.
- Add deterministic project-local invalidation for completed artifact publication.
- Refresh an open compatible route or expose one explicit stale/loading state until the new artifact is readable.
- Cover CLI-started simulation, Studio-owned Experiment completion, Design continuation, Candidate review, and a directly added completed artifact.
- Verify portless managed lifecycle, workspace project isolation, interrupted/partial artifact writes, and browser reconnect behavior.

### Out of scope

- Watching arbitrary editor changes to Blueprint source.
- Treating partial operation files as completed evidence.
- Replacing immutable evidence with a mutable live result.
- Broad filesystem polling when an exact artifact publication or bounded watcher can provide the invalidation signal.

## Acceptance

- [ ] A running Studio opens a newly completed compatible Run without restart or route error.
- [ ] Open Overview, Factory, Runs, Design, and Candidate surfaces refresh only after complete immutable evidence is readable.
- [ ] Partial, interrupted, stale-engine, and unrelated-project evidence never becomes current authority.
- [ ] Managed lifecycle retains one verified process and port; no additional service is spawned for refresh.
- [ ] CLI, Studio server, browser, type, documentation, memory-fab, and Ironworks regressions pass.

## Work

- [ ] Trace the current project/evidence index lifetime and publication boundaries.
- [ ] Design one exact invalidation and client refresh contract.
- [ ] Implement server and browser refresh with strict partial-write handling.
- [ ] Add lifecycle, project-isolation, and direct route regressions.
- [ ] Verify from a running Studio with one newly generated memory-fab Run.

## Findings and decisions

- 2026-07-29 — The managed lifecycle itself is healthy: `studio restart` replaced only the verified memory-fab process, retained port `4176`, and reported matching expected/running source hashes. The defect is evidence discovery lifetime, not port ownership.

## Verification

Pending.

## Progress log

- 2026-07-29 — Proposed from direct human/Agent Factory use after Run `093-simulate` was generated behind an already-running Studio.

## Completion

Pending.
