# Capital-neutral metrology standby trial

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], [[docs/design/blueprint-comparison]], [[docs/design/coding-agent-optimization]], [[docs/design/logistics]], and [[docs/design/equipment-energy-states]].

## Outcome

Reach an exact human/Agent decision on whether a physically compact finished-goods layout can fund qualified low-power metrology standby without exceeding the memory-fab capital limit or weakening facility-interruption service, and retain the complete positive or negative result in the existing Investigation.

## Context

Current immutable Run `098-simulate` and factory-observation checkpoint `post-standby-factory` show that Blueprint `8281c50706c578b823b7d8cc3f5d4f94cef230fefbee210c8a3756a6a9a9563a` costs `229,950` against the Objective maximum of `230,000`. Both reviewed low-power metrology Candidates add `200`, fail the build-cost constraint by `150`, and reduce facility-interruption on-time lots from nine to seven.

The installed third fab-utility plant is active and the ordinarily idle second plant is deliberate interruption redundancy; removing either would confuse idle observation with dispensable capacity. The Factory replay instead shows a physically indirect finished-goods block. `commercial-to-customer` uses thirteen ground conveyor cells at `5.4%` utilization, carries all 52 commercial devices without one blocked item-tick, and visibly takes a U-shaped route from `burn-in-1` to its customer. The other output lanes share the same sparse shipping edge.

A compact layout is therefore a falsifiable way to fund the existing standby hypothesis: recover at least fifteen ordinary conveyor cells (`150` capital) by moving only terminal customer/sorter positions and rerouting their physical lines, then add the already reviewed `200`-cost metrology option. Shorter outbound travel may also recover some interruption service, but that is a hypothesis to test rather than an assumed benefit.

## Scope

### In scope

- Append one Investigation hypothesis citing `post-standby-factory` and naming the exact capital, service, spatial, and metric boundaries.
- Author one Candidate whose independent variables are the existing low-power `inspection-1` asset/policy and a compact terminal finished-goods layout; preserve all process, release, maintenance, utility, power, quality, and demand contracts.
- Require the complete proposed factory to cost no more than `230,000`, remain capacity-ready, and run all five locked `greenfield-dram-design` cases plus the current-factory comparison.
- Inspect the exact current spatial replay and proposed physical/economic comparison, then explicitly KEEP, revise, defer, or discard. Apply only a strict retained `KEEP`; otherwise preserve the negative review without moving the Blueprint or fabricating a proposed Run identity.
- Use the real review to close any material CLI/Studio gap in presenting physical semantic changes, capital recovery, Objective constraints, and per-case service to humans and Agents.

### Out of scope

- Removing utility redundancy, maintenance capacity, quality disposition, customer demand, or any industrial guardrail to manufacture capital headroom.
- Changing asset economics, Objective thresholds, Scenario failures, Benchmark limits, or simulator physics.
- Automatically searching arbitrary layouts, sweeping standby thresholds, or treating the evaluator as design authority.
- Compatibility readers or migration aliases for pre-alpha artifacts.

## Acceptance

- [x] The Investigation records the exact Run `098-simulate` spatial observation and a checkpoint-sourced compact-layout hypothesis before Candidate authoring.
- [x] The Candidate's patch is limited to `inspection-1` standby plus terminal shipping positions/endpoints/paths, and its exact proposed build cost is at most `230,000`.
- [x] The review reports capacity, typed Objective constraints, on-time lots, delivery, quality, WIP, energy, and score for all five locked cases and the exact current factory.
- [x] CLI and Studio make the physical changes and recovered-versus-spent capital legible from the same Core comparison evidence; no human or Agent must reconstruct the budget from raw JSON patches.
- [x] One explicit Investigation entry retains the reviewed verdict and evidence; only a strict KEEP may change the Blueprint and create a new compatible Run/checkpoint.
- [x] Public validation, focused tests, current-layout plus proposed-comparison visual inspection, and `bun run test` pass.

## Work

- [x] Rebind to current observation identity and inspect the finished-goods layout, transport utilization, capital constraint, and utility redundancy.
- [x] Define one bounded compact-layout-plus-standby hypothesis and its unchanged industrial boundaries.
- [x] Append the hypothesis and author the exact Candidate patch.
- [x] Evaluate all locked/current cases and inspect the proposed physical evidence without inventing an immutable replay for an unapplied Candidate.
- [x] Improve the shared comparison handoff only where the real review proves information is missing.
- [x] Retain the decision, complete verification, and audit every acceptance item.

## Findings and decisions

- 2026-07-30 — Run `098-simulate`, result `19fd034abbecc9dff1a2d7c67d3cf1e2f0c2ab56c3445e39b6b1e0c4b36decbc`, remains the exact current observation authority.
- 2026-07-30 — `commercial-to-customer` carries 52 items over thirteen cells at `5.4%` utilization with zero blocked item-ticks; the replay visibly confirms a long U-shaped terminal route rather than a production bottleneck.
- 2026-07-30 — `fab-utility-plant-2` has no ordinary-run allocations, but facility-interruption explicitly trips plant 1 and previous commissioned evidence installed redundant utility capacity. Ordinary idleness is not authority to remove resilience.
- 2026-07-30 — The intervention must save at least fifteen `10`-cost conveyor cells before adding the `200`-cost standby asset, leaving the complete proposed factory at or below the unchanged `230,000` limit.
- 2026-07-30 — Candidate `compact-shipping-metrology-standby` contains fifteen authored operations: the qualified standby substitution plus terminal customer/sorter placement and three two-cell output paths. The three terminal lines fall from 22 to 6 cells without changing any process, utility, demand, quality, release, or resilience contract.
- 2026-07-30 — The Core-owned physical ledger proves `229,950 → 229,990` total build cost: equipment/facilities `+200`, sorter endpoints `+0`, transport lines `-160`, occupied area `-16`, equipment footprint `+0`, and unique transport cells `-16`. The unchanged `230,000` Objective boundary passes with `10` headroom.
- 2026-07-30 — Capacity remains READY and every Objective constraint passes, but every current-factory case regresses. The decisive hard failure is facility-interruption on-time lots `9 → 7` against `≥ 9`; first-pass yield also falls `0.833 → 0.667` while only touching its exact lower boundary.
- 2026-07-30 — Decision: `DISCARD` the combined Candidate and do not move Blueprint `8281c50706`. The compact terminal geometry remains a separately testable future hypothesis; it is not authority to smuggle the rejected standby substitution into the factory.
- 2026-07-30 — Core now owns one reconciled `physicalEconomics` comparison; CLI and Studio project the same equipment/facility, sorter, line, area, cell, total-capital, Objective-boundary, and headroom evidence. Existing immutable reviews that predate the ledger remain readable without invented historical values.

## Verification

- `bun run inm observe examples/memory-fab --json` — compatible Run `098-simulate`, Blueprint `8281c50706`, exact observation brief `bfe2339c3a55`.
- Studio `/memory-fab/factory?run=098-simulate`, `/memory-fab/factory/devices/burn-in-1?run=098-simulate`, and `/memory-fab/factory/connections/commercial-to-customer?run=098-simulate` — visually inspected the shipping edge, shared output equipment, and thirteen-cell commercial route.
- `bun run inm candidate examples/memory-fab --candidate compact-shipping-metrology-standby --review --progress human` — immutable `DISCARD` review recorded; exact capital ledger and all five locked/current comparisons printed.
- `bun run inm candidate examples/memory-fab --candidate compact-shipping-metrology-standby --json` — `reviewed-discard`; `229,950 → 229,990`, transport `1,090 → 930`, and facility-interruption on-time lots `9 → 7`.
- `bun run inm investigate ... --entry discard-compact-shipping-metrology-standby --attach-candidate compact-shipping-metrology-standby` — sequence 7 decision `a16879789c67` cites the current factory observation and introduces exact review anchor `compact-shipping-metrology-standby-review`.
- Studio `/memory-fab/experiments/greenfield-dram-design/candidates/compact-shipping-metrology-standby` — visually verified the reviewed disposition, current/proposed capital ledger, six physical breakdown rows, `10 HEADROOM`, all five cases, and the `9 → 7` hard failure. An older pre-ledger Candidate review and `/memory-fab/investigations/inspection-starvation-next-step` also opened without error.
- `bun test packages/inm-core/src/workbench.test.ts -t "memory-fab workbench discovers project-local routes, experiments, and candidates"` — passed with the new reviewed Candidate in the project index.
- `bun run check:fast` — 1,220 documentation links, all TypeScript projects, and 35 tests / 221 assertions passed.
- `bun run inm validate examples/memory-fab --json` — unchanged Blueprint `8281c50706`, 62 Devices, 17 connections, no diagnostics.
- `bun run inm test examples/memory-fab` — both memory-fab fixtures passed.
- `bun run test` — 325 tests / 4,287 assertions and all eight Ironworks fixtures passed.

## Progress log

- 2026-07-30 — Plan created from the retained post-standby capital/service boundary and direct spatial inspection of the exact current Factory replay.
- 2026-07-30 — Authored the checkpoint-sourced compact-shipping Candidate and used its first review to expose the missing physical-capital comparison surface.
- 2026-07-30 — Added the reconciled Core ledger, projected it through CLI and Studio, and retained the exact negative review as an Investigation decision.
- 2026-07-30 — Completed visual, public-project, focused, fast, and full-repository verification; no Candidate was applied and no new Run was fabricated.

## Completion

Completed with an exact negative answer. The existing Investigation now contains the layout-funded standby hypothesis, immutable five-case/current-factory review, and explicit `DISCARD` decision; shared Core/CLI/Studio evidence explains the complete physical-capital trade, and the current Blueprint remains unchanged because the proposal did not earn KEEP.
