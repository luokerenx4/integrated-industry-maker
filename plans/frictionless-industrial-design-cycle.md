# Frictionless industrial design cycle

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/operation-workbench]], [[docs/design/studio-debugger]], and [[docs/design/agent-cli-contract]].

## Outcome

Make the ordinary human/Agent industrial design cycle—start the project, run one exact Experiment or Design operation, inspect its progress and result, edit source, and repeat—trustworthy and fast enough that nobody needs to diagnose ports, guess process ownership, or rerun work because the interface lost completed evidence.

## Context

Earlier operations plans added a managed Studio, source-current restart, reconnectable operations, lightweight Experiment routes, and a one-command session. Those mechanisms improved isolated timings, but the assembled daily experience still fails the operator.

A current audit found one healthy supervisor/server pair on port `4176`; `studio status` completes in `0.07s`, a focused Experiment in `0.53s`, and a five-case Experiment in `0.88s`. The human surface nevertheless loses the newly completed operation and its result immediately after briefly showing `RUNNING`; even a reload does not reconnect it although the complete operation remains readable through the API. The Studio log also contains hundreds of context-free repeated startup banners, so normal source adoption and abnormal restart behavior are indistinguishable.

The next work must treat perceived reliability and recovery as product correctness. A fast evaluator hidden behind disappearing state and opaque lifecycle output is not a fast design loop.

## Scope

### In scope

- Preserve and reconnect exact Experiment and Design operation progress/results across project refreshes, source adoption, navigation, and reload.
- Give the managed supervisor lifecycle structured timestamps, generations, restart causes, child identities, and bounded useful logs.
- Make one default lifecycle/session command diagnose and safely repair project-owned stale state, dead children, and reusable ports without touching unknown listeners.
- Measure the complete cold and warm human/Agent loop rather than only evaluator internals, and remove the next evidence-backed wait or ambiguity.
- Keep CLI and Studio projections on the same operation and lifecycle authority.

### Out of scope

- Relaxing locked cases, caching Candidate decisions, approximating simulation, or replacing subjective human/Agent design judgment with autonomous optimization.
- Killing unknown port occupants or adopting ownership from a PID, port, or state file alone.
- Changing industrial simulation semantics, factory layout, or the selection-scoped evidence contract paused in [[plans/selection-scoped-evidence-identity]].
- Treating the full repository checkpoint as an interactive command.

## Acceptance

- [x] A newly started Experiment remains visibly running and then visibly completed with its exact result; project refresh, navigation, and reload reconnect the same operation instead of clearing it.
- [x] A Design operation receives the same refresh/reconnect guarantee and never requires an uninterrupted page.
- [x] Managed lifecycle output and logs distinguish initial start, intentional source adoption, unexpected child exit, manual restart, stop, and ownership conflict with timestamps and exact identities.
- [x] Repeated default start/session commands converge on one healthy project service and one discoverable URL; recoverable project-owned stale state is repaired automatically while unknown listeners remain untouched.
- [x] The ordinary cold and warm design cycle has recorded end-to-end timings and actionable failure output on both human and JSON surfaces.
- [x] Targeted, fast, browser, process-leak, and full repository verification pass.

## Work

- [x] Reproduce the complete current lifecycle and Experiment path; record process, port, evaluator, page, and recovery behavior.
- [x] Add regression coverage and fix refresh-stable operation recovery in Experiment and Design workbenches.
- [x] Add structured supervisor lifecycle events and project-owned recovery diagnostics.
- [x] Consolidate the default session/start/iterate path and remove the next measured coordination delay.
- [x] Update lasting development-operations and CLI contracts, run the complete verification audit, commit, push, and leave one healthy current Studio.

## Findings and decisions

- 2026-07-29 — Current port `4176` has exactly one managed supervisor and one server child. The first problem is not listener count at rest; it is weak lifecycle explanation and unreliable UI state across refresh.
- 2026-07-29 — `studio status` measured `0.07s`, direct Experiment navigation `0.19s`, focused evaluation `0.53s`, and a five-case evaluation `0.88s`. Evaluator latency is no longer the dominant failure in these paths.
- 2026-07-29 — After starting the five-case `dispatch-research` operation, Studio briefly showed `RUNNING`, then removed the operation, progress, and result. Operation `ms5j3ccv-756…` remained complete and readable through the API, proving presentation/recovery loss rather than simulation failure.
- 2026-07-29 — `ExperimentWorkbench` resets operation/result state when `refreshRevision` changes, while its retained-operation recovery effect does not depend on that revision. Any project refresh after completion can therefore erase valid visible evidence until another route identity changes.
- 2026-07-29 — The managed log currently appends only the server's four-line startup banner. Hundreds of identical entries provide no timestamp, source generation, restart reason, or distinction between normal source adoption and a crash loop.
- 2026-07-29 — The previous source identity was false after changing supervisor code: the old manager replaced only its child, while the new child recomputed the complete hash and advertised the whole service as current. Protocol V4 now carries separate server and manager hashes; default `start`/`session` fully replaces a verified stale manager.
- 2026-07-29 — One real V4 source adoption reported `server CURRENT / manager STALE`, retained the same port, and recorded the exact generation transition. A normal portless `start` then replaced the complete pair and returned both identities to `CURRENT`.
- 2026-07-29 — A fresh manager rotates the prior session to `studio.previous.log`. The live log fell from 292 opaque lines to three structured lifecycle records while preserving the earlier session for diagnosis.
- 2026-07-29 — Direct Design still loaded the `2.98 MB` Factory payload and `301 KB` Overview behind its workbench. A focused Design route now uses the `10.3 KB` Program catalog plus exact selected-program evidence; browser readiness fell from about `3.4s` to `107ms`.

## Verification

- Baseline `bun run inm studio status examples/memory-fab --json` — `0.07s`; one current supervisor/server pair on managed port `4176`.
- Baseline focused `equipment-energy-research` — operation `ms5j0rrf-c00…` completed in `531ms`.
- Baseline five-case browser `dispatch-research` — operation `ms5j3ccv-756…` completed in `876ms`; Studio cleared it on completion and failed to recover it on reload while the API retained the complete result.
- Fixed five-case browser `dispatch-research` — operation `ms5j7w6l-520…` stayed visible through completion and reload with the same retained id and result.
- V4 lifecycle suite — `13` tests / `85` assertions passed, including source adoption, stale-manager truth, complete convergence, port fallback/exhaustion, tampered ownership, foreign listeners, and structured logs.
- `bun run check:fast` — documentation, all TypeScript projects, and `35` short tests / `209` assertions passed in `32.0s`.
- Focused memory-fab Studio Design contract — `887` assertions passed in `15.7s`.
- Lightweight Design browser route — ready in `107ms`, with no Overview or Factory navigation/data mounted behind the workbench.
- `bun run test` — documentation and all TypeScript projects passed; `308` tests / `3945` assertions and all `8` public Ironworks fixtures passed in `342.21s`.

## Progress log

- 2026-07-29 — Activated at the user's direction; [[plans/selection-scoped-evidence-identity]] paused before implementation.
- 2026-07-29 — Completed the first process, port, CLI, API, and browser audit and reproduced a completed-operation disappearance on the ordinary human path.
- 2026-07-29 — Fixed refresh-stable Experiment/Design recovery, introduced honest server/manager identity and structured rotated logs, proved default lifecycle convergence, and removed full-project hydration from direct Design routes.

## Completion

Completed on 2026-07-29. Experiment and Design operations now survive project refresh and exact-route reload, managed lifecycle V4 reports honest server/manager source identity, default commands safely converge a stale verified manager, active logs are structured and rotated, and direct Design routes no longer hydrate the Factory or Overview before becoming usable. The previously paused evidence-identity work resumes in [[plans/selection-scoped-evidence-identity]].
