# Converge commissioned memory-fab yield

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/quality-flow]], [[docs/design/design-programs]], [[docs/design/delivery-contracts]], and [[docs/design/experiment-workbench]].

## Outcome

The exact commissioned memory factory reduces verified rework and scrap through a causal physical or process-quality intervention, while preserving its fulfilled performance and automotive contracts, portfolio value, capacity readiness, and every locked operating case.

## Context

Run `057-simulate` exposes the constraint that earlier flow limits hid. All 12 tracked lots now reach inspection, but only 5 pass first inspection, 6 enter rework, and 2 ultimately scrap. The run still delivers performance `12/12` and automotive `6/6`, delivers commercial `22/32`, produces portfolio net value `+144`, and remains capacity `READY`.

This work must distinguish quality physics from scheduling correlation. Dispatch, maintenance, metrology, recipe, tooling, or equipment changes may affect yield, but a proposal must claim `yield-quality` only when the simulator and immutable evidence establish that causal route. A better delivery score with unchanged defect outcomes is not a yield intervention.

## Scope

### In scope

- Attribute first-pass failures, rework, and scrap to exact lot, operation, equipment, recipe, and defect evidence available in the current run.
- Add project-local TypeScript intervention primitives only where the measured cause lacks an honest existing control.
- Evaluate a bounded commissioned Design portfolio from exact Blueprint `969e01284b0d2d74b4f8a032ae2364c40f2023707d77335a258ec3358124e205`.
- Preserve performance `12/12`, automotive `6/6`, portfolio net value at least `+144`, capacity `READY`, and zero current-best regression across all five Benchmark cases.
- Project the same loss attribution, Design evidence, Candidate review, and next action through CLI and Studio.

### Out of scope

- Weakening latent-defect scenarios, inspection rules, delivery demand, Objective weights, or current-best guardrails.
- Inventing a direct “yield bonus” that bypasses equipment, recipe, tooling, process, or inspection behavior.
- Treating higher throughput or lower queue time as proof of better quality.
- Shared project assets, backward-compatibility adapters, or migration aliases.

## Acceptance

- [ ] Immutable before/after evidence improves first-pass yield, reduces rework, or reduces scrap through an identified causal mechanism.
- [ ] The accepted factory keeps performance `12/12`, automotive `6/6`, portfolio net value at least `+144`, capacity `READY`, and zero regression in every locked case.
- [ ] A bounded commissioned Design run records the intervention and exact five-case evidence; only a reviewed `KEEP` Candidate may update the Blueprint.
- [ ] CLI and Studio reopen the same current run, quality attribution, Design provenance, Candidate receipt, and next action after restart.
- [ ] Focused tests, project fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [x] Audit run `057-simulate` defect provenance and identify the first independently actionable quality cause.
- [ ] Correct or extend Core quality evidence if the current run cannot expose that cause without inference.
- [ ] Select or add a bounded project-local TypeScript intervention and evaluate it through `commissioned-dram-fab`.
- [ ] Review and apply only a non-regressing winner; regenerate the immutable current run and compare quality, delivery, flow, energy, and value.
- [ ] Update durable design documentation and both human/AI projections.
- [ ] Run the completion audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-23 — This plan starts from verified inspected-lot evidence: `5/12` first-pass, 6 reworked, and 2 scrapped. Completion-derived throughput ratios are not accepted as yield.
- 2026-07-23 — Etch is the current throughput bottleneck, but bottleneck rank alone does not prove etch causes the recorded defects. The first task is provenance, not a preselected equipment upgrade.
- 2026-07-23 — Immutable events show `etch-1` introducing particle contamination into lots 07, 08, 09, 10, 11, and 12 after its sixth and seventh jobs. The run records 8 equipment-drift defect instances total, 6 from etch; both scrapped lots passed through that etch drift interval. The first intervention is therefore six-job etch maintenance, not an inspection scheduling proxy.
- 2026-07-23 — The exact five-case Design evaluation rejected six-job etch maintenance. It reduced mixed-quality drift defects `8 → 5` and rework cycles `6 → 5`, but completed only 5 lots instead of 6 and regressed ordinary, quality, and facility cases. Single-tool maintenance timing cannot trade away commissioned delivery.

## Verification

Pending.

## Progress log

- 2026-07-23 — Proposed by the completion audit of [[plans/commissioned-fab-convergence-loop]].
- 2026-07-23 — Activated against exact current Blueprint `969e01284b0d2d74b4f8a032ae2364c40f2023707d77335a258ec3358124e205`; first action is to prove defect provenance from immutable run evidence before selecting an intervention.
- 2026-07-23 — Fab Loss Profile now names the highest-contributing drift Device and exact aggregate drift counts; project proposal ranking prefers an intervention whose physical subject matches that evidence.
- 2026-07-23 — Immutable Design Run `5b3e7ca92a209c8bc5d0ff86894eb7db3d90f368bb3b8ddfcc845a1968667072` records the rejected first intervention. A project-local TypeScript sweep now compares earlier maintenance thresholds and explicit layer-two etch specialization against the same zero-regression current-best boundary.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
