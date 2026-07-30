# Incumbent Burn-in service campaign

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/source-lot-product-lineage]], [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/production-plans]], [[docs/design/industrial-investigations]], and [[docs/design/observation-led-design]].

## Outcome

Make the incumbent DRAM Burn-in rack's source-batch arrival, service, changeover, and delivery chronology exact immutable evidence, then let a human or reasoning Agent author and judge one explicit finite recipe campaign against the unchanged twelve-lot factory. The engine must expose the trade between delivered device count, product-grade value, WIP, setup work, service, quality, and resilience without automatically inventing or applying a schedule.

## Context

Run `105-simulate` leaves all eight devices from source set `[dram-lot-08]` at `burn-in-1.package-input`. Existing lineage metrics prove ownership and final location but not the reusable timing chain that explains why the complete batch was not served.

Direct event inspection shows that the twelve source batches become complete at Burn-in between tick `71623` and `205173`. The rack executes `RRRCCCCCRRR` (`R = screen-performance-mix`, `C = screen-commercial-dram`), finishes eleven jobs at tick `235623`, and pays three directed setup transitions totalling `14000` ticks. A human-authored `RRRRRCCCCCCC` campaign over the same exact batch-ready ticks has an earliest process completion of `228873`: it can plausibly drain all twelve batches before the horizon, but it reduces the finished portfolio's gross delivery value from `344` to `332`. That is a real industrial trade, not a free throughput gain.

The previous plan closed additional parallel hardware under the unchanged capital and interruption-service boundary. This plan therefore stays on the existing rack and changes neither installed equipment nor planned memory supply.

## Scope

### In scope

- Extend source-lot lineage evaluation with exact per-source-set milestones for creation, downstream Resource production, resident/full-batch arrival at the final processing buffer, processing, delivery, and terminal WIP age where those facts exist.
- Project the chronology through immutable metrics/reports, structured CLI output, Observation/Workbench evidence, and the Studio global/device views without reconstructing facts from labels or browser pixels.
- Add one strict Blueprint-owned finite recipe-campaign policy that names qualified Process/mode steps and positive job counts. Runtime follows only the authored sequence, records step/job progress, and never generates or optimizes the campaign.
- Author the smallest memory-fab Candidate that changes only `burn-in-1` to the explicit five-performance/seven-commercial campaign, then run the unchanged current factory and locked Benchmark.
- Preserve exact source-lot ancestry, fixed eight-device Processes, physical changeovers, current equipment, World, Production Plan, Scenario, Objective, and all service/quality/interruption guardrails.

### Out of scope

- RL, black-box scheduling, automatic campaign generation, learned dispatch, branch-and-bound factory design, or choosing the Candidate disposition from score alone.
- Adding another Burn-in rack, removing facility redundancy, changing process durations or power physics, resizing batches, deleting lots, extending the Scenario horizon, or editing contract values.
- Treating the finite campaign as a compatibility alias for existing recipe dispatch or setup-campaign formation.

## Acceptance

- [x] Run `105` exposes a typed, deterministic source-set service chronology that directly proves the last complete batch's arrival, incumbent occupation, remaining horizon, and unserved final location.
- [x] A strict explicit recipe campaign compiles only against qualified operations, executes the authored finite sequence deterministically, preserves setup and lineage physics, and exposes progress identically to CLI and Studio.
- [x] The five-performance/seven-commercial Candidate is reviewed and trialed against the unchanged current factory and locked cases; delivery count, portfolio value, WIP, setup, on-time, quality, power, cost, and interruption evidence are compared quantitatively and visually.
- [x] One append-only Investigation chain retains the exact observation, hypothesis, Candidate review, Run comparison, and explicit human/Agent decision without applying a non-`KEEP` result.
- [x] Documentation, schemas, examples, fixtures, focused tests, full repository verification, plan archive, commit, and push all agree with the final domain boundary.

## Work

- [x] Specify and implement generic source-set service chronology in Core evaluation and public types.
- [x] Add immutable report, CLI/Observation, Workbench, and Studio projections with focused replay tests.
- [x] Specify and implement strict finite recipe-campaign schema, compilation, runtime state/events/metrics, and deterministic tests.
- [x] Append the current chronology observation and authored incumbent-rack campaign hypothesis.
- [x] Create, review, trial, compare, and visually inspect the bounded memory-fab Candidate.
- [x] Record the explicit disposition, complete verification, archive this plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Run `105` source batches become complete at `burn-in-1.package-input` at ticks `71623, 83623, 95623, 107623, 119773, 133173, 145173, 157173, 169173, 181173, 193173, 205173`.
- 2026-07-31 — The actual rack sequence is `RRRCCCCCRRR`: six `18.750 s` performance-mix jobs, five `7.500 s` commercial jobs, and `14.000 s` of initial/directed setup. It delivers `88` devices worth `344` and leaves source lot `08` unserved.
- 2026-07-31 — Enumerating only the author-proposed two-operation sequence over the immutable ready ticks establishes the falsifiable campaign boundary: six performance plus six commercial batches cannot finish before the horizon (`240123` before outbound travel), while five performance plus seven commercial batches can finish processing at `228873` but lowers gross product value to `332`.
- 2026-07-31 — Core now owns strict finite `recipeCampaign` execution: every step names one qualified Process/mode and positive successful-job count; the Device waits rather than skipping, interrupted work does not advance, ordinary physical setup and lineage remain active, and the Device stops after the final job.
- 2026-07-31 — Trial Run `109-candidate-trial-incumbent-five-performance-seven` completes the exact `5R → 7C` campaign at tick `228873`. It delivers `96` instead of `88`, clears the eight-device tail, reduces Burn-in changeovers `3 → 2`, setup `14.0 → 11.0 s`, and energy by about `1.701 MJ`, while preserving `12/12` on-time lots, zero scrap/escape, cost `229840`, and area `259`.
- 2026-07-31 — The same Run loses gross portfolio value `344 → 332`, raises average Objective-equivalent WIP `49.1905 → 51.3613`, and regresses score `0.198410 → -5.549238` (`Δ -5.747647`). The locked historical Benchmark remains `KEEP` by `+164.608542`, but the current-factory comparison is `REGRESSED` by `-5.501245` aggregate and loses every locked case. Investigation entry `discard-incumbent-five-seven-campaign` therefore retires this exact schedule without applying it.
- 2026-07-31 — Workbench V17 projects an exact Candidate-linked Investigation disposition back into project orientation. A current non-keep decision suppresses stale pending/apply advice, while changed review identity or an invalid chain suppresses nothing. Memory-fab now reports `0` pending and `4` Investigation-disposed Candidate reviews.
- 2026-07-31 — Browser verification on Run `109` confirmed the finite campaign and both source-service panels in the Factory and Burn-in inspector with no console errors. Dense 14/96-event work-center timelines now use collapsed progressive disclosure rather than flooding the ordinary analysis surface.

## Verification

```bash
bun run typecheck
bun run docs:check
bun test packages/inm-core/src/workbench.test.ts packages/inm-core/src/run-comparison.test.ts packages/inm-cli/src/studio-lifecycle.test.ts packages/inm-studio/src/server.test.ts
bun run inm inspect examples/memory-fab --section source-lot-service --json
bun run inm candidate examples/memory-fab --candidate incumbent-five-performance-seven-commercial
bun run inm compare examples/memory-fab --from-run 105-simulate --to-run 109-candidate-trial-incumbent-five-performance-seven
bun run test
```

- Full repository result: `352` tests passed, `0` failed, all eight Ironworks project checks passed.
- Run `105` Burn-in service analysis: `93b87b1949dea24903070c3576bcce8b6fe4fc8fa44d9da3f7377738a47ff01f`.
- Run `109` result: `fecbe4692476682d010e07116e53afb376a127b4fd33f942194ec3260772bfe5`.
- Visual result: `http://localhost:4177/memory-fab/factory?run=109-candidate-trial-incumbent-five-performance-seven` and the `burn-in-1` inspector both rendered the exact campaign/service evidence with collapsed timelines and no browser console errors.

## Progress log

- 2026-07-31 — Plan opened from the explicit discard of capital-neutral parallel hardware. The continuing intervention is incumbent-rack temporal service, not new capacity.
- 2026-07-31 — The bounded campaign was implemented, trialed, and explicitly discarded. Its negative result remains reusable exact evidence rather than an unapplied Candidate that reappears as work.

## Completion

Completed 2026-07-31. INM can now preserve source-set service chronology and execute a human/Agent-authored finite equipment campaign without inventing a schedule. The first incumbent Burn-in campaign disproved its own current-factory value and was retained as an explicit negative decision; no Blueprint was applied.
