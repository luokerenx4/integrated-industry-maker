# Project-discovered Studio lifecycle

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/project-boundaries]], [[docs/design/agent-cli-contract]], [[plans/low-friction-development-operations]], and [[plans/low-friction-experiment-loop]].

## Outcome

Let a human or Agent start, inspect, restart, and stop a project's managed Studio without remembering a port, while preserving strict explicit-port diagnosis and never terminating an unverified process.

## Context

The managed lifecycle correctly distinguishes a same-root Studio, another INM root, and an unknown service, but every command still defaults blindly to port `4176`. With memory-fab healthy on `4176`, the ordinary portless command for Ironworks fails with `studio.port-owned-by-other-project`. Starting Ironworks explicitly on `4177` would not solve the interaction contract: later portless `status`, `restart`, and `stop` still inspect only `4176`, so the operator must remember and repeat the port forever.

This leaves port ownership safe but port operation manual. Managed state already records the exact input root, optional workspace project, port, PID, source hash, backend, and start time below the target's ignored `.inm/studio/` directory. Portless lifecycle commands should discover that authority first. When no verified managed instance exists, portless start should use the stable default when available and otherwise select a bounded free fallback without disturbing the occupant. An explicit `--port` remains a strict request and retains current conflict behavior.

## Scope

### In scope

- Project-local discovery of exact managed Studio state across recorded ports.
- Verification of discovered state against live health PID, root, project selection, and running source hash.
- Portless start reuse or stale-source replacement of the one verified managed instance.
- Stable default-port selection and bounded fallback allocation when the default is occupied.
- Portless status, restart, and stop of the discovered managed instance.
- Exact ambiguity and exhaustion errors for multiple verified instances or no bounded free port.
- Machine-readable selected-port provenance and consistent human output.
- Explicit `--port` retaining strict existing ownership and conflict semantics.

### Out of scope

- Killing, adopting, or replacing a foreign service or another project's Studio.
- A global port daemon, cross-machine discovery, production supervision, or CI changes.
- Changing Studio routes, project asset boundaries, industrial simulation, or experiment authority.
- Retaining the superseded assumption that an omitted port means exactly `4176`.

## Acceptance

- [x] A portless start reuses the target's one verified managed Studio even when it is not on `4176`.
- [x] With another project or foreign service on `4176`, a new portless start selects a bounded free fallback and leaves the occupant untouched.
- [x] Portless status, restart, and stop rediscover the selected service without requiring `--port`.
- [x] An explicit `--port` remains strict and reports the exact existing conflict instead of silently moving.
- [x] Discovery accepts authority only when state and health agree on root, project, PID, and source hash.
- [x] Multiple verified target instances and exhausted fallback ranges fail with typed actionable errors.
- [x] CLI discovery, human output, JSON, lifecycle design documentation, and tests expose one current contract.
- [x] The real memory-fab Studio remains source-current and browser-usable after focused, fast, and full verification.

## Work

- [x] Reproduce the current portless cross-project failure on the live `4176` service.
- [x] Compile and verify project-local managed-state discovery.
- [x] Resolve portless start/status/restart/stop through discovered, default, or fallback ports.
- [x] Preserve strict explicit-port behavior and remove the hard-coded omitted-port path.
- [x] Update CLI discovery, design documentation, and lifecycle tests.
- [x] Complete live lifecycle/browser QA and the full repository checkpoint.
- [x] Commit and push the completed implementation.

## Findings and decisions

- 2026-07-29 — `inm studio start examples/ironworks --no-open --json` fails with `studio.port-owned-by-other-project` solely because omitted `--port` is parsed as explicit `4176`, which is correctly serving memory-fab.
- 2026-07-29 — Managed state already contains sufficient project-local ownership evidence. Discovery must verify that evidence against live health rather than treating a state file or listening port alone as authority.
- 2026-07-29 — Explicit ports express operator intent and remain strict. Only an omitted port may discover a target instance or allocate a fallback.
- 2026-07-29 — Portless lifecycle now reports `explicit`, `managed`, `default`, or `fallback` selection provenance. It rejects multiple live target instances and a fully occupied 24-port fallback range with typed errors.
- 2026-07-29 — Stop/restart ownership was tightened beyond port discovery: state must also retain the deterministic service label, log path, manager path, PID, and running source hash before any process-manager mutation.

## Verification

- Original live reproduction: memory-fab PID `66459` remained healthy on `4176` while the old portless Ironworks start failed with `studio.port-owned-by-other-project`.
- Focused evidence: CLI TypeScript compilation and all 10 Studio lifecycle tests pass, including cross-project fallback, foreign-listener preservation, rediscovery, strict explicit conflicts, ambiguity, exhaustion, and tampered-state refusal.
- Live lifecycle evidence: portless Ironworks start selected fallback `4177` with PID `75801`; status rediscovered it as `managed`; restart replaced it with PID `75838`; explicit `--port 4176` retained the exact conflict; portless stop released only `4177`; memory-fab PID `66459` remained untouched throughout.
- Source-current recovery: portless memory-fab start rediscovered managed `4176`, safely replaced stale PID `66459`, and left source-current PID `76029`.
- Browser QA: `/memory-fab/factory` renders the full 3D factory, delivery contracts, run-bound observation brief, evidence panels, and timeline; the in-page `REFRESH` interaction reloads the factory successfully.
- `bun run check:fast` — `1054` documentation links, every TypeScript project, `30` tests, and `179` expectations pass in `14.1s`.
- `bun run test` — `1054` documentation links, every TypeScript project, `291` tests with `3687` expectations, and all eight Ironworks fixtures pass in `221.16s`.

## Progress log

- 2026-07-29 — Activated after completing prepared priority-power traversal and auditing the remaining experiment-start lifecycle friction.
- 2026-07-29 — Implemented project-local state enumeration, target health matching, bounded allocation, strict explicit ports, machine-readable provenance, and exact stop authority.
- 2026-07-29 — Proved real two-project fallback, rediscovery, restart, strict conflict, isolated stop, source-current memory-fab recovery, and browser-visible Factory use before the full checkpoint.
- 2026-07-29 — Completed the full repository checkpoint and archived the plan for commit and push.

## Completion

Completed on `main`. Routine managed Studio operation now follows the exact project rather than a remembered port, chooses a bounded fallback without disturbing occupants, and requires complete state-plus-health ownership before any stop or replacement.
