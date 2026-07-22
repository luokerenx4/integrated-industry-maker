# Decision loop convergence

- Status: `completed`
- Updated: `2026-07-22`
- Related design: [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]]

## Outcome

Turn project orientation and Candidate review into one shared human/AI decision loop. The workbench must distinguish design capacity from active flow risk and pending review, expose one identical structured next action through Core, CLI, API, and Studio, and advance that action through Candidate review, guarded application, and post-write verification without browser-only authority.

## Context

The current Overview correctly projects one Studio recommendation, but its single `READY` badge can appear to contradict open production-analysis warnings. Recommendation priority is implemented inside Studio, so a CLI operator receives the same facts but not the same selected task. Candidate evaluation and apply already share one Core evaluator, yet the surrounding operator task is not modeled as a cross-surface lifecycle: after opening a proposal, each operator must reconstruct review, apply, and verification steps independently.

INM remains pre-alpha. This plan replaces the current snapshot and public projections directly; it does not add compatibility aliases or preserve the Studio-only recommendation contract.

## Scope

### In scope

- Explicit capacity, flow-risk, evidence, and review status facets derived from authoritative Core facts.
- One deterministic next-action object owned by the shared workbench and projected unchanged by CLI, Studio API, and Studio UI.
- Candidate decision phases and exact follow-up actions for review, KEEP-only application, stale proposals, and post-apply verification.
- Human-readable status presentation and machine-readable `inspect --section next-action --json` output with exact argv and Studio route.
- Updated schemas/types, public help, tests, examples where required, and actual desktop/narrow browser verification.

### Out of scope

- A new optimizer or automatic Candidate authoring strategy.
- Automatic Blueprint writes, relaxed apply guards, or hiding exact hashes/effects.
- New Factory diagnostic overlays or a redesign of the 3D renderer.
- Compatibility readers for the previous workbench snapshot version.

## Acceptance

- [x] A project may report capacity ready while separately reporting flow at risk; Studio and CLI name both states without the contradictory unqualified `READY` presentation.
- [x] Core emits exactly one deterministic next action with stable identity, reason, target, effect, exact CLI argv, and project-qualified Studio route; `inspect --section next-action --json`, `inspect --section all --json`, the Studio overview API, and the visible Overview use that same object rather than recomputing it.
- [x] Candidate tasks advance through explicit proposed/review-result/apply/verified-or-stale phases using Core operation results and project authority; reloads and the two public surfaces cannot disagree about the applicable next step.
- [x] No recommendation bypasses confirmation, KEEP, proposal/base/proposed hashes, selection matching, or post-write verification.
- [x] Human output, machine help, design documentation, focused tests, full type/test gates, and desktop/390 px browser QA all pass without incidental checked-in project mutation.

## Work

- [x] Replace the V1 workbench status/recommendation projection with shared Core decision status and next-action contracts.
- [x] Project the shared contract through CLI sections/envelopes, Studio API, and the Overview without duplicate prioritization logic.
- [x] Complete Candidate decision transitions and exact review/apply/verification follow-ups across Core, CLI, and Studio.
- [x] Update public documentation, help, fixtures, and cross-surface parity tests.
- [x] Perform actual browser and full-suite verification, completion audit, commit, and push.

## Findings and decisions

- 2026-07-22 — The current `readiness.ready` value means target-rate capacity provision only; production-analysis warnings answer a different question. The UI conflict is a projection problem, not evidence that either analyzer is wrong.
- 2026-07-22 — Removed the Studio-only `operator-guidance` priority layer. Core now emits the one action and both public surfaces project it unchanged.
- 2026-07-22 — Review now creates one immutable project-local receipt while leaving the Blueprint untouched. Application remains confirmation-gated, receipt/hash/KEEP-pinned, re-evaluated, atomic, and post-write verified.
- 2026-07-22 — Candidate phase is derived from proposal, receipt, and current Blueprint hashes, so `proposed`, reviewed verdicts, `verified`, and `stale` survive process and page reloads without browser authority.

## Verification

- `bun run docs:check` — 437 documentation links resolve.
- `bun run typecheck` — Core, CLI, Studio, and both example asset packages pass.
- `bun test packages/inm-core/src/workbench.test.ts packages/inm-core/src/operation.test.ts` — 9 pass, 54 expectations.
- `bun test packages/inm-cli/src/commands.test.ts` — 11 pass, 165 expectations.
- `bun test packages/inm-studio` — 7 pass, 77 expectations.
- `bun run test` — 175 pass, 1440 expectations, plus all 8 ironworks end-to-end cases.
- Public CLI audit proved `inspect --section next-action --json` equals its sole envelope action and `inspect --section all --json` exposes capacity ready, flow at-risk, review pending, and evidence incompatible without writing `examples/memory-fab/candidate-reviews/`.
- Browser audit on the checked-in memory-fab Overview proved the same four status facets and shared action at 1024 px. A temporary self-contained project copy proved proposed → reviewed-keep → verified, explicit arm/confirmation, exact hashes, and reload persistence. The 390 × 844 breakpoint had no horizontal overflow, a 2 × 2 status grid, and a 44 px primary action; a fresh page logged no console warnings or errors.

## Progress log

- 2026-07-22 — Plan created after auditing the current workbench, Candidate evaluator, CLI section contract, Studio projection, and repository plan workflow.
- 2026-07-22 — Implemented the V2 snapshot, shared next action, immutable review receipt, CLI/API/Studio projections, and persistent Candidate transitions; focused Core, CLI, and Studio tests pass.
- 2026-07-22 — Browser-tested the complete review/apply/verified lifecycle on a temporary memory-fab copy, including deep-link reload, explicit confirmation, desktop layout, 390 px layout, and current-page console errors.

## Completion

Completed on 2026-07-22. Core now owns both the decision facets and the one next action; CLI, API, and Studio project the same contract. Candidate review evidence and phase survive reloads, guarded application ends in a verified hash state, and neither public surface owns hidden decision authority.
