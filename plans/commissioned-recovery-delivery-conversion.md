# Convert recovered memory-fab yield into paid delivery

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/coding-agent-optimization]], [[docs/design/design-programs]], [[docs/design/simulation-runtime]], [[docs/design/lot-derived-output]], and [[docs/design/delivery-contracts]].

## Outcome

The explicit advanced-pattern-recovery branch converts its additional recovered wafer lot into finished DRAM delivery inside the fixed lithography-interruption window, so it improves every current-best case and can be commissioned without changing Objective weights, Benchmark gates, Scenario duration, or evaluator physics.

## Context

Current Design result `bb521fa7a617b5d1643761ea18f817825ea1e708f2de9ed79ba031203bdd9626` proves that advanced recovery plus `6/3 EDD` admission:

- improves four of five locked cases;
- completes `11` wafer lots rather than `10` and scraps `1` rather than `2` under lithography interruption;
- preserves the same `7` on-time lots, hard outcomes, contract fulfillment, delivery value, and overflow;
- regresses the limiting case by `-0.429259`, led by average WIP `-0.531800`.

The extra lot already terminates successfully at wafer Probe, so front-end recovery and Probe capacity are not the missing commercial outcome. Its eight nominal known-good dies still face one-device-at-a-time packaging, physical transport, and a batched commercial or reliability screen before delivery. The fixed window ends before those dies create another paid output batch.

## Scope

### In scope

- Add a project-local TypeScript trace and bounded research loop for the exact incumbent and advanced-recovery branch.
- Attribute the recovered lot's downstream tail to exact Probe completion, packaging, final-test, and delivery event ticks.
- Search explicit Blueprint interventions using project-local equipment, connections, junctions, dispatch policies, and ordinary cost/area/power.
- If existing Blueprint choices cannot convert the recovered batch, add one explicit selectable Device operating mode with a measured cycle/power trade, refresh the catalog locks deliberately, and retain it only when a no-recovery control proves the recovered batch's marginal delivery.
- Evaluate every viable intervention through all five locked cases, seven hard-outcome guardrails, target-rate capacity readiness, positive aggregate improvement, and zero current-best case regression.
- If one intervention passes, add it to the commissioned Design provider and use the ordinary Design → Candidate → review → apply → Run chain.
- Project the causal result to both Agent-readable TypeScript/CLI evidence and human-readable Studio Design evidence through the existing shared contracts.

### Out of scope

- Extending the Scenario horizon, inventing deadline credits, changing Objective weights, rewarding scrap reduction outside the authored Objective, or weakening current-best/Benchmark gates.
- Mutating the existing qualified mode, product yields, customer contracts, failure timing, Objective/Scenario inputs, or evaluator physics to favor the candidate.
- Hidden equipment pools, abstract capacity multipliers, shared assets, JavaScript research scripts, or compatibility paths for old pre-alpha evidence.

## Acceptance

- [x] Exact event evidence identifies the recovered lot and the first downstream stage that prevents its die output from becoming delivered product.
- [x] A bounded TypeScript search compares explicit back-end Blueprint interventions against the exact incumbent and advanced branch with lossless score-component evidence.
- [x] Any commissioned winner is accepted by the locked Benchmark, passes all 35 hard-outcome thresholds, remains capacity READY, improves aggregate score, and has no current-best case regression.
- [x] Design and CLI expose the same limiting-case and Objective-component decision evidence; no projection recomputes evaluator formulas.
- [x] Blueprint, Candidate receipt, compatible Run, public project commands, focused/full tests, and browser acceptance prove the final commissioned state.

## Work

- [x] Establish from Objective causality that the extra recovered lot raises WIP without adding delivery value.
- [x] Confirm that the additional lot terminates at Probe and that the remaining physical chain is packaging → final test → delivery.
- [x] Add exact recovered-output event tracing and a bounded back-end intervention portfolio.
- [x] Evaluate explicit probe, packaging, final-test, topology, and dispatch alternatives under the complete locked authority.
- [x] Commission a passing intervention or retain precise negative evidence and revise the physical hypothesis.
- [x] Complete documentation, verification, browser, commit, and push audit.

## Findings and decisions

- 2026-07-24 — Front-end recovery is not the remaining failure: `completedLots` rises from `10` to `11`, and lot completion occurs at Probe. The missing value lies after lot termination in the die/package/final-test chain.
- 2026-07-24 — Existing fixed back-end physics require 8 seconds of Probe per wafer, 1.5 seconds per packaged device, then an eight-device final-test batch taking 12 seconds commercial or 30 seconds reliability plus an exact setup transition.
- 2026-07-24 — Exact trace shows the recovered lot adds eight known-good dies and eight packaged devices, but final delivery is unchanged because the single burn-in rack finishes the same schedule in both branches and ends with 16 packaged devices queued instead of eight.
- 2026-07-24 — Parallel Probe and burn-in equipment are ineligible under the locked Objective: they exceed the 230,000 build-cost ceiling, and the second burn-in rack also exceeds the 350-cell occupied-area ceiling.
- 2026-07-24 — The commissioned burn-in rack is continuously occupied from its first setup through the horizon. A delivery-converting intervention must therefore change qualified processing capacity rather than only downstream transport or dispatch.
- 2026-07-24 — An unlocked deterministic frontier probe compared qualified burn-in modes at 75%, 66.7%, 60%, and 50% duration with reciprocal active-power multipliers. The 66.7% / 150% point is the first one where recovery delivers exactly eight more devices than its no-recovery mode control; more aggressive points regress because peak-power contention changes the product mix.
- 2026-07-24 — Adding a selectable equipment mode changes the project-local Device catalog, which is correctly rejected by the existing Benchmark lock. The catalog extension therefore requires an explicit lock refresh before authoritative evaluation; baseline Blueprints do not select the new mode.
- 2026-07-24 — The locked search accepts the combined recovery and high-throughput mode by `+31.898170` aggregate with a positive `+28.515780` minimum case delta. Under lithography interruption it delivers `88` devices versus `80` for the no-recovery mode control and `63` for the original incumbent.
- 2026-07-24 — Design Run `717685836f91415906efd543742891007fc955f063bcf765348e090cf17e9bad` independently reproduces the bounded winner and promotes a seven-operation `KEEP`; Candidate `recovered-output-high-throughput` and review `6a00aae7ec10fde190a015a759bd0676be3988e39ead8be648ad4167266214ac` guard the commissioned write.

## Verification

- `bun run memory-fab:research-recovery-delivery -- --json` — reproduces the `070-simulate` incumbent, exact `dram-lot-08` recovery trace, bounded rejected alternatives, and three locked `KEEP` modes; the combined winner remains `+31.898170` aggregate / `+28.515780` minimum-case.
- Design Run `717685836f91415906efd543742891007fc955f063bcf765348e090cf17e9bad` — one-candidate `KEEP`, five positive current-best case deltas, all seven outcome guardrails, and capacity READY.
- Candidate `recovered-output-high-throughput` / review `6a00aae7ec10fde190a015a759bd0676be3988e39ead8be648ad4167266214ac` — reviewed `KEEP` and verified applied Blueprint hash `5f2852b5c09a5fe68e7ab1a32a52cc401742146caaf51fb8a672ada8a89882fd`.
- Run `071-simulate` — result `55c0fc81926f176cc37bd5cf39983db5191b0b2dd29782692668d4a8a090c3c3`, 88 delivered devices, portfolio net value 288, demand attainment 1.76, build cost 229,900, and occupied area 285.
- Browser acceptance at `/memory-fab/factory`, `/memory-fab/runs`, and `/memory-fab/designs` — replay advances, `071-simulate` is current, and Design ranks `717685…` first with shared score evidence and no application console error.
- `bun run test` — 673 documentation links, TypeScript checks, 220 tests / 1,837 assertions, and all eight Ironworks fixtures pass.
- `git diff --check` — clean.

## Progress log

- 2026-07-24 — Plan created from the exact WIP-led score breakdown and downstream process audit.
- 2026-07-24 — Added the TypeScript `memory-fab:research-recovery-delivery` trace/search, rejected unaffordable duplicate equipment and destructive dispatch, and identified the two-thirds-cycle / 150%-power operating point.
- 2026-07-24 — Refreshed all memory-fab catalog locks explicitly, accepted the combined winner in all five cases, applied it through Design and Candidate review, and created compatible Run `071-simulate`.

## Completion

The recovered lithography-interruption lot now becomes eight marginal paid devices through an explicit high-power operating choice on the existing final-test rack. The intervention is fully commissioned through locked Design and Candidate authority without changing the Scenario, Objective, evaluator, product yields, or capital/area ceilings.
