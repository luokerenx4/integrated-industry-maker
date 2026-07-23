# Converge commissioned memory-fab yield

- Status: `completed`
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

- [x] Immutable before/after evidence improves first-pass yield, reduces rework, or reduces scrap through an identified causal mechanism.
- [x] The accepted factory keeps performance `12/12`, automotive `6/6`, portfolio net value at least `+144`, capacity `READY`, and zero regression in every locked case.
- [x] A bounded commissioned Design run records the intervention and exact five-case evidence; only a reviewed `KEEP` Candidate may update the Blueprint.
- [x] CLI and Studio reopen the same current run, quality attribution, Design provenance, Candidate receipt, and next action after restart.
- [x] Focused tests, project fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [x] Audit run `057-simulate` defect provenance and identify the first independently actionable quality cause.
- [x] Correct or extend Core quality evidence if the current run cannot expose that cause without inference.
- [x] Select or add a bounded project-local TypeScript intervention and evaluate it through `commissioned-dram-fab`.
- [x] Review and apply only a non-regressing winner; regenerate the immutable current run and compare quality, delivery, flow, energy, and value.
- [x] Update durable design documentation and both human/AI projections.
- [x] Run the completion audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-23 — This plan starts from verified inspected-lot evidence: `5/12` first-pass, 6 reworked, and 2 scrapped. Completion-derived throughput ratios are not accepted as yield.
- 2026-07-23 — Etch is the current throughput bottleneck, but bottleneck rank alone does not prove etch causes the recorded defects. The first task is provenance, not a preselected equipment upgrade.
- 2026-07-23 — Immutable events show `etch-1` introducing particle contamination into lots 07, 08, 09, 10, 11, and 12 after its sixth and seventh jobs. The run records 8 equipment-drift defect instances total, 6 from etch; both scrapped lots passed through that etch drift interval. The first intervention is therefore six-job etch maintenance, not an inspection scheduling proxy.
- 2026-07-23 — The exact five-case Design evaluation rejected six-job etch maintenance. It reduced mixed-quality drift defects `8 → 5` and rework cycles `6 → 5`, but completed only 5 lots instead of 6 and regressed ordinary, quality, and facility cases. Single-tool maintenance timing cannot trade away commissioned delivery.
- 2026-07-23 — Dedicated layer-two etch without deep inspection exposed a second mechanism: added completion capacity let latent-electrical lots escape standard inspection and regressed the quality cases. The accepted intervention must couple routed etch capacity and physical service with deep final-pattern inspection rather than treating any one control as a universal yield scalar.
- 2026-07-23 — `specialize:etch-layer-two-quality-cell` improves all five current-best cases. In the mixed case it preserves 6 completions, reduces rework cycles `6 → 5`, scrap `2 → 1`, and drift defects `8 → 2`, eliminates escapes, and raises portfolio net value `+144 → +164`.

## Verification

- Immutable rejected Design Run `5b3e7ca92a209c8bc5d0ff86894eb7db3d90f368bb3b8ddfcc845a1968667072` preserves the single-tool maintenance counterexample.
- Immutable accepted Design Run `effced617779ef8988476294a349f80aec3a79c9824cd052b8fc75b9d4912e16` records aggregate current-best delta `+16.308290` and positive deltas in all five cases.
- Candidate `dedicated-etch-quality-cell`, review receipt `d5bbbae23fefc51fdefc4e5ba6636baae6f1e182b28c2fddec333b763bb69687`, and current Blueprint hash `9af27defc6f17385e8d242c272de40878a84d4405a10ebe165076fc9560121b5` close the guarded apply boundary.
- Current run `058-simulate` reopens with result hash `e01e800f01f44b61b51e37b58bfe7e9156802324238ed0f0b5971c4a11c04cf2`, commercial `27/32`, performance `12/12`, automotive `6/6`, portfolio net value `+164`, 5 rework cycles, 1 scrap, no escape, and 2 drift defects.
- `bun run inm validate examples/memory-fab --json` passed with 62 Devices and 17 connections.
- `bun run inm plan examples/memory-fab --json` returned capacity `READY` with zero gaps.
- `bun run inm test examples/memory-fab --json` passed both project assertions.
- Focused workbench/provider tests passed 15/15; targeted Design and CLI Candidate tests passed.
- `bun run test` passed 196 tests and 1772 assertions, followed by all 8 Ironworks project tests; `bun run docs:check` resolved 581 links.
- Browser verification reopened Overview, Factory, Candidate, and Design deep links against Studio port 4176. All showed current run `058-simulate`, the same quality evidence and verified receipt, current Blueprint `9af27defc6f1`, and Q-time as the next action; no browser console errors were recorded.

## Progress log

- 2026-07-23 — Proposed by the completion audit of [[plans/commissioned-fab-convergence-loop]].
- 2026-07-23 — Activated against exact current Blueprint `969e01284b0d2d74b4f8a032ae2364c40f2023707d77335a258ec3358124e205`; first action is to prove defect provenance from immutable run evidence before selecting an intervention.
- 2026-07-23 — Fab Loss Profile now names the highest-contributing drift Device and exact aggregate drift counts; project proposal ranking prefers an intervention whose physical subject matches that evidence.
- 2026-07-23 — Immutable Design Run `5b3e7ca92a209c8bc5d0ff86894eb7db3d90f368bb3b8ddfcc845a1968667072` records the rejected first intervention. A project-local TypeScript sweep now compares earlier maintenance thresholds and explicit layer-two etch specialization against the same zero-regression current-best boundary.
- 2026-07-23 — The sweep found a zero-regression coupled intervention. Design Run `effced617779ef8988476294a349f80aec3a79c9824cd052b8fc75b9d4912e16` promoted it through a 27-operation Candidate; reviewed apply produced Blueprint `9af27defc6f17385e8d242c272de40878a84d4405a10ebe165076fc9560121b5`.
- 2026-07-23 — Public CLI, Studio, focused tests, project tests, documentation checks, type checking, and the 196-test full regression passed. Implementation was committed as `659f12d`; the next measured constraint is indexed separately in [[plans/commissioned-q-time-convergence]].

## Completion

Commit `659f12d` ships physical drift-subject attribution, subject-aware proposal priority, the project-local TypeScript yield sweep, a routed dedicated layer-two etch bay, five-job etch service, deep final-pattern inspection, immutable Design/Candidate/review evidence, current Blueprint and run projections, and human/AI parity updates.

The intervention removes etch drift from the current run, reduces rework and scrap, increases commercial delivery and portfolio value, and preserves every high-value and locked-case guard. Route Q-time is now the leading measured constraint; its distinct anneal-batch and inspection-maintenance mechanisms are intentionally deferred to separately indexed [[plans/commissioned-q-time-convergence]] rather than left as unchecked work here.
