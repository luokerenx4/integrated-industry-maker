# Operator interaction refinement

- Status: `completed`
- Updated: `2026-07-22`
- Related design: [[docs/design/operator-workbench]], [[docs/design/studio-debugger]], [[docs/design/operation-workbench]]

## Outcome

Make the first thirty seconds inside a project decisive. A human operator should immediately understand the requested industrial outcome, whether the selected Blueprint is ready, why the project needs attention, and the single best next action. Supporting context and advanced operations remain available without competing with that primary decision.

## Context

The shared workbench already exposes the right facts, routes, and operations, but the Overview presents most of them with similar visual weight. The operator must infer a workflow from separate readiness, diagnostic, evidence, Candidate, and operation panels. Route-backed dialogs also lack one consistent close/Escape rule, copy controls provide no acknowledgement, and the compact header compresses navigation too aggressively on narrow screens.

This plan changes only Studio interaction and presentation. Core remains the authority for readiness, diagnostics, operation effects, hashes, and evidence; the UI may prioritize those facts but must not create a second diagnosis engine.

## Scope

### In scope

- A deterministic, snapshot-derived recommended next action with an explanation and direct action.
- Clear separation between the primary operator brief, active work queue, recent evidence, and advanced operations.
- Predictable stable-link navigation and route-backed dialog close/Escape behavior.
- Visible feedback for copied CLI commands and refreshed operation results.
- Desktop and narrow-screen hierarchy, navigation, and overflow refinement.

### Out of scope

- New industrial analysis, optimizer, Blueprint editor, or Core operation.
- Automatic Blueprint mutation or automatic Candidate application.
- Redesigning the 3D factory renderer, experiment evaluator, or asset detail model.

## Acceptance

- [x] The Overview names exactly one recommended next action, explains why it is recommended from shared snapshot facts, and reaches the exact diagnostic, Candidate, run, or operation in one deliberate click.
- [x] Readiness, effective selection, highest-priority issues, delivery contracts, latest immutable evidence, and review queue remain visible without giving every available Core operation equal first-screen weight.
- [x] Advanced operations are progressively disclosed, retain effect/scope/guard/CLI detail, and copy controls visibly acknowledge success.
- [x] Header navigation uses stable destinations, and close, Escape, browser back, reload, and Factory selection clearing preserve route/UI agreement.
- [x] At 390 px and desktop widths, the project identity and all primary destinations remain usable with no horizontal page overflow or one-column context sprawl.
- [x] Studio tests, type checking, documentation checks, and actual browser QA pass without mutating checked-in project files.

## Work

- [x] Derive and test the contextual operator recommendation as a pure Studio projection of the Core snapshot.
- [x] Refactor the Overview hierarchy and advanced-operation disclosure.
- [x] Unify route-backed navigation, close/Escape behavior, and copy feedback.
- [x] Refine responsive header, selection context, panels, and result presentation.
- [x] Update design documentation and complete HTTP/browser/full-suite verification.
- [x] Final completion audit, commit, and push.

## Findings and decisions

- 2026-07-22 — The missing interaction layer is prioritization, not another data source: Core already provides readiness, ordered diagnostics, runs, experiments, Candidates, and operation descriptors.
- 2026-07-22 — A recommendation is a deterministic UI projection only. It may choose among existing subjects/routes/operations but may not alter diagnostic severity or infer new industrial truth.
- 2026-07-22 — The stale cached Factory page demonstrated the failure mode of equal-weight density, but it is not evidence about the current Overview implementation.
- 2026-07-22 — The recommendation requires an immutable run whose complete selection matches the effective World, Blueprint, Scenario, and Objective; a merely recent run is not evidence for the active brief.
- 2026-07-22 — Route-backed surfaces remember one same-project origin. Their explicit close/Escape action replaces the surface with that origin, while ordinary browser back remains normal route history.
- 2026-07-22 — Primary narrow-screen controls use a 44 px minimum hit area. The six destinations remain simultaneously visible at 390 px, so the compact header preserves orientation without a hidden navigation mode.

## Verification

- `bun test packages/inm-studio` — 12 passed, 0 failed, including all recommendation branches, the concrete memory-fab Candidate recommendation, stable routes, same-project overlay origins, Factory selection, HTTP parity, and read purity.
- `bun run docs:check` — 432 repository double-links resolve.
- Latest served assets at `http://localhost:4176` contain the operator recommendation, compact selection disclosure, actual-write wording, and responsive navigation rules; the Overview API selects `baseline`, reports readiness, and exposes `stable-furnace-sleep`.
- `bun run test` — 178 passed, 0 failed, 1420 assertions across nine files; all eight public Ironworks fixtures passed.
- Actual browser QA at 1024 × 768 and 390 × 844 — one recommendation rendered; recommendation opened `stable-furnace-sleep` in one click; explicit close and Escape restored `/memory-fab`; browser back restored the originating view; Candidate reload preserved the deep route and dialog; Factory device deep-link and Escape clearing agreed with the URL.
- Responsive browser measurements — zero horizontal page overflow; all six primary navigation targets remained visible at 44 px high; the recommendation action measured 44 px high; Overview context panels occupied the 370 px content width rather than creating nested horizontal or narrow multi-column layouts.

## Progress log

- 2026-07-22 — Audited current Overview, header, operation result, route state, and responsive rules; plan created and registered.
- 2026-07-22 — Implemented and tested deterministic recommendation priority, one-click targets, compact context disclosure, progressive operation disclosure, stable navigation links, actual-write wording, copy acknowledgement, and route-synchronized close/Escape behavior.
- 2026-07-22 — Focused Studio and full repository gates passed. The running server exposes the latest API/assets; browser QA remains the only open acceptance evidence.
- 2026-07-22 — Completed desktop and 390 px browser QA, fixed the two sub-44 px narrow-screen hit areas found during measurement, and verified deep-link reload, browser back, explicit close, Escape, and Factory selection clearing.

## Completion

Completed on 2026-07-22. The project Overview now acts as a prioritized operator brief over shared Core facts, while advanced controls, evidence, and stable route-backed detail remain available without competing with the next decision.
