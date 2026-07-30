# Objective-dominant WIP continuation

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], [[docs/design/inventory-accounting]], and [[docs/design/operator-workbench]].

## Outcome

Close the current inspection-starvation inquiry at its exact evidence boundary, then continue the commissioned memory-fab design loop in a separate current Investigation focused on the dominant Objective-equivalent WIP exposure so later humans and Agents inherit both the negative inspection result and the new question without reconstructing either from chat history.

## Context

Immutable Run `101-simulate` is current after the accepted compact inspection/rework cell. The existing `inspection-starvation-next-step` Investigation contains the complete retained lineage through Run comparison `100-simulate → 101-simulate` and now asks for a hypothesis.

The remaining inspection starvation is not inspection capacity, power, maintenance, or line congestion. Its largest interval is ordinary upstream etch processing, while the previously evaluated shared-cell vacuum intervention still requires both the four-cell main lane and sixteen-cell rework return to use matching vacuum assets. Against current build cost `229840`, that intervention adds `360` and reaches `230200`, exceeding the `230000` Objective cap by `200`.

At the same time, Run `101-simulate` exposes a much larger Objective tradeoff in equivalent WIP, led by physical locations around burn-in and packaging. That ranking identifies where to observe; it does not itself prove avoidable inventory or authorize a buffer reduction. The next inquiry must begin from those exact locations and preserve delivery, on-time service, quality, interruption resilience, and the current commissioned Blueprint until a human or reasoning Agent authors a falsifiable intervention.

## Scope

### In scope

- Append one explicit `defer` decision to the existing inspection Investigation, citing its current Run-comparison and factory evidence.
- Preserve the exact shared-cell vacuum cost calculation and the causal partition that makes another inspection-capacity or line-capacity proposal unjustified.
- Create a separate project-local Investigation for the dominant Objective-equivalent WIP exposure under Run `101-simulate`.
- Record one current typed/spatial observation that names the leading Resource locations and separates accounting contribution from causal avoidability.
- Leave the new inquiry at a human/Agent authorship boundary rather than generating a factory change automatically.

### Out of scope

- Weakening the capital limit or replaying any of the six already bounded inspection-supply proposals under a new name.
- Treating WIP ranking as fab-loss attribution, shrinking buffers without observing the physical mechanism, or authoring an autonomous optimization policy.
- Applying a Blueprint change before a separate falsifiable hypothesis and locked Candidate review exist.
- Adding compatibility behavior for previous Investigation or Run formats.

## Acceptance

- [x] The inspection Investigation ends in an exact `defer` decision whose evidence and cost arithmetic are reproducible from current project artifacts.
- [x] A separate current Investigation pins Run `101-simulate` identity and records the leading Objective-equivalent WIP locations without claiming they are automatically avoidable.
- [x] CLI inspection projects the old inquiry as complete/resume-project and the new inquiry at the correct human/Agent Design Session phase.
- [x] Project validation, focused Investigation checks, documentation checks, and the full repository checkpoint pass.

## Work

- [x] Reopen the current Investigation, Run `101-simulate`, prior inspection proposals, and Objective WIP accounting contract.
- [x] Append the bounded inspection defer decision.
- [x] Create and populate the Objective-WIP Investigation from exact current evidence.
- [x] Exercise the public CLI/Studio handoff and reconcile any fixture or documentation changes.
- [x] Complete the acceptance audit and prepare the repository checkpoint.

## Findings and decisions

- 2026-07-30 — The current shared-cell vacuum proposal is not newly feasible: twenty conveyor cells add `200` when upgraded, four sorter endpoints add `160`, and current build cost `229840 + 360 = 230200`, which exceeds the fixed cap by `200`.
- 2026-07-30 — Run `101-simulate` attributes `56.984 s` of inspection shortage primarily to upstream etch processing/cadence. Inspection itself remains only `20.7%` utilized with no capacity, power, failure, or maintenance interruption.
- 2026-07-30 — Objective-equivalent WIP is a more material score exposure than another presently unaffordable inspection transport refinement, but location rank remains observation scope rather than causal design authority.
- 2026-07-30 — Run `101-simulate` starts packaging `96` times, completes eleven fixed-eight burn-in batches, delivers `88` devices, and leaves exactly eight packaged devices at `burn-in-1.package-input`. This is evidence for an output-quantum/production-plan and service-cadence inquiry, not a buffer-capacity conclusion.
- 2026-07-30 — The tighter `5/4` CONWIP Candidate and four-device Process portfolio remain negative evidence: release suppression weakened on-time service, while the bounded small-batch options either raised target WIP or surrendered `74` delivery-value points.
- 2026-07-30 — An Investigation disposition is a subjective design-attention decision, not a diagnostic filter. The measured inspection diagnostic remains visible while the separate current WIP Investigation records why a human or Agent chose another question.

## Verification

- `bun run inm validate examples/memory-fab --json` — passed.
- `bun run inm investigate examples/memory-fab --investigation inspection-starvation-next-step --section all --json` — entry `0022`, `defer`, and `resume-project` verified.
- `bun run inm investigate examples/memory-fab --investigation back-end-wip-next-step --section all --json` — Run `101-simulate` current, historical rejected CONWIP review valid, and `form-hypothesis` verified.
- `bun run check:fast` — documentation, TypeScript, and 39 short tests passed.
- `bun test packages/inm-core/src/investigation.test.ts packages/inm-core/src/investigation-run-comparison.test.ts packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts` — 39 tests and 1,673 assertions passed.
- Managed Studio at `127.0.0.1:4176` — both Investigation routes rendered their exact phase, source entry, evidence selection, and authoring boundary; browser warnings/errors: none.
- The first ordinary `bun run test` after the fixture update reached 336/337 tests and exposed one unrelated five-second CLI timeout; its isolated rerun passed in `1.07 s`.
- Full checkpoint with the same repository scope and a ten-second test ceiling — 337 tests, 4,107 assertions, and all eight Ironworks project tests passed.

## Progress log

- 2026-07-30 — Plan created from the exact Run `101-simulate` inspection partition, retained 21-entry Investigation chain, current capital boundary, and Objective WIP tradeoff.
- 2026-07-30 — Appended inspection entry `0022` with `defer`, created `back-end-wip-next-step`, and retained Run `101-simulate` plus the historical rejected CONWIP review as the new authorship boundary.
- 2026-07-30 — CLI, Studio, project validation, focused tests, documentation, TypeScript, the 337-test repository suite, and all eight Ironworks fixtures passed; the plan is complete.

## Completion

The inspection inquiry now ends at its reproducible capital and causal boundary instead of inviting a renamed replay. A separate current WIP Investigation preserves the exact Run `101-simulate` tail shape and prior negative evidence, then stops at `form-hypothesis` so the next production-planning or service-cadence intervention remains a human/Agent design judgment.
