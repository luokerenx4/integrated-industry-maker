# Capital-neutral Burn-in capacity boundary

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/fab-capacity-planning]], [[docs/design/equipment-energy-states]], [[docs/design/power]], and [[docs/design/logistics]].

## Outcome

Determine whether one physically operable second DRAM Burn-in rack can be powered and funded inside the unchanged `230,000` capital constraint without weakening delivery, on-time service, quality, interruption resilience, or current front-end capacity. If no evidence-backed retirement or reuse can fund the complete intervention, close the parallel-hardware branch explicitly and hand the same source-lot tail to an incumbent-rack operating hypothesis instead of relaxing the Objective or repeating rejected Candidates.

## Context

Run `107-candidate-trial-batch-coherent-burn-in-overflow` separated two questions that the prior item-level trial had conflated. Batch-coherent dispatch works: four complete eight-device source batches reached the new rack with zero source-lot commingling. The rack nevertheless started no screening jobs because its shipping grid could not supply the `384 W` active envelope. The physical proposal also cost `245,310`, exceeding the unchanged Objective limit by `15,310`.

The editable factory remains exact Run `105-simulate`, not either rejected trial. Investigation entry `post-batch-coherent-current-factory` re-pins that authority and records the structural lower bound before another hypothesis is authored.

## Scope

### In scope

- Derive the complete minimum bill of materials, installed cost, occupied area, and grid envelope for the already-proven batch-coherent parallel rack topology.
- Treat the new rack, junction, real sorter/belt lanes, and sufficient generation/storage as one physical intervention; no free equipment, hidden power, or deleted transport work.
- Inspect current Run `105`, installed-capacity analysis, Objective constraints, locked Benchmark cases, and facility/tooling contracts for genuinely replaceable or reusable capital.
- Distinguish low average utilization from safe retirement. Any offset must survive compile/capacity checks, the exact current-factory comparison, and locked service/quality/interruption evidence.
- Author at most one smallest exact offset Candidate when the survey finds a defensible bill of materials. Otherwise append an explicit bounded decision that closes this hardware branch and identifies the next incumbent-rack control boundary.
- Preserve World, twelve-lot Production Plan, Scenario, Objective, recipes, source-lot lineage, and current Blueprint authority throughout.

### Out of scope

- Raising `maxBuildCost`, deleting planned lots or demand, accepting over-budget production because delivery increases, hiding power behind a different grid without checking that grid's runtime envelope, or automatically searching equipment subsets.
- Treating static rated demand as simultaneous measured demand, treating average idle time as removable capacity, or applying a Candidate without a separate exact `KEEP`.
- Revisiting item-level round-robin, partial Burn-in batches, small-batch recipe changes, or autonomous/RL factory generation.

## Acceptance

- [x] Exact current-factory evidence and the rejected Run `107` comparison/review remain cited in one append-only Investigation chain.
- [x] The minimum parallel-rack intervention reconciles equipment, transport, power, area, and Objective capital numerically from project-owned contracts.
- [x] Every proposed capital offset is tied to its current Run use, target-rate/facility contract, and locked-case exposure; “looks idle” is not sufficient evidence.
- [x] One exact Candidate is reviewed and trialed only if a feasible offset survives the static boundary; otherwise the branch closes with a quantitative decision and no ceremonial simulation.
- [x] The resulting decision names the next human/Agent industrial hypothesis, project validation and focused/full verification pass, and the plan is archived, committed, and pushed.

## Work

- [x] Reopen exact Run `105`, Run `107`, Candidate review, grid evidence, Objective limits, and project-owned asset costs.
- [x] Append the post-trial current-factory checkpoint to the continuing Investigation.
- [x] Reconcile the minimum powered parallel-rack bill of materials and identify every possible capital-offset class.
- [x] Inspect runtime, capacity, facility, tooling, maintenance, and locked-case evidence for those offset classes.
- [x] Author and evaluate one defensible Candidate, or record a bounded infeasibility decision and pivot.
- [x] Complete verification, archive this plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Current Run `105` uses Blueprint `16ca367007ed`, delivers `88`, completes all twelve lots on time, and costs `229,840`; only `160` remains below Objective `maxBuildCost: 230000`.
- 2026-07-31 — The proven batch-coherent fan-out adds `15,470`: one `dram-burn-in-rack` costs `14,000`, leaving `1,470` in explicit junction, sorter, and line infrastructure. Its rejected Candidate contains no added generation.
- 2026-07-31 — One project-local wind turbine costs `1,400` and supplies `600 W`. Adding it to the proven topology raises the minimum intervention to `16,870`, so an unchanged-Objective Candidate must safely retire or reuse at least `16,710` of current installed capital.
- 2026-07-31 — The current shipping grid is already rated `616 W` against `600 W`; Run `105` measures a `10 W` peak deficit, `0.255 MJ` unserved energy, and `0.114 MJ` required storage while still serving the incumbent rack. Run `107` raises the grid to `1,038 W` rated demand, and Studio shows the new rack at `NO POWER` with a `35 → 384 W` envelope and zero output. One extra turbine would cover the revised rated deficit with `162 W` headroom, but its cost must remain explicit.
- 2026-07-31 — Reassigning a current front-end turbine is not free capacity. The main grid's Run `105` peak is `2,722.5 W` against `3,000 W`; removing one `600 W` generator would leave at least `322.5 W` peak deficit before any topology change, while its static installed envelope is already rated `896 W` above generation.
- 2026-07-31 — The ordinary operational entry is already `inm session`, backed by source-current `studio start/status/restart/stop`. A live session automatically replaced the stale manager on port `4177` and opened Investigation entry `0009` at `form-hypothesis`; a second `inm dev` alias would add surface area without removing work.
- 2026-07-31 — Run `105` assigns `36` utility allocations to `fab-utility-plant-1`, none to the installed standby `plant-2`, and `60` to `plant-3`. Each plant independently owns the exact authored `6 high-vacuum / 2 hazardous-exhaust` capacity envelope. Reticle tooling remains fully allocated and maintenance peaks at two crews, so neither is a defensible funding offset.
- 2026-07-31 — Retiring `plant-2` and `plant-3` recovers `18,000`, enough to add the complete `16,870` overflow intervention while retaining the Scenario-addressed `plant-1`. Candidate `preserve-failure-target-utility-funded-overflow` therefore tests the narrow feasible capital boundary at `228,710`, not a hand-waved idle-equipment deletion.
- 2026-07-31 — Locked review `de002b559fa5` returns `DISCARD`: the current-factory score improves, but `facility-interruption` falls from nine to five on-time lots and violates `preserve-on-time-service`. Other locked cases also lose service: mixed demand `12→11`, quality excursion `12→10`, and lithography maintenance `9→8`.
- 2026-07-31 — Immutable Run `108-candidate-trial-preserve-failure-target-utility-` isolates the nominal effect. Delivery rises `88→96`, final WIP falls `8→0`, commingled jobs remain zero, and the shipping grid supplies a measured `1,013.5 W` peak from `1,200 W` with no deficit. The cost of concentrating facility service is already visible before failure: utility input wait rises `0→22.166 s` across ten blocks, mean queue time rises `5.600→10.571 s`, and on-time lots fall `12→11`.
- 2026-07-31 — Investigation decision `close-capital-neutral-overflow-hardware` (`fac7c61bb0a9`) discards and closes parallel Burn-in hardware under the unchanged capital and service boundary. The next bounded industrial hypothesis stays on the incumbent rack and examines release/operating timing against the exact tail; it must not add another rack, weaken utility resilience, or revisit item-level dispatch.

## Verification

- `bun run inm analyze examples/memory-fab --json --section power` — current two-grid installed envelopes and exact project identity inspected.
- `bun run inm session examples/memory-fab --investigation source-lot-back-end-service --no-open --json` — source-current lifecycle converged and returned the exact Investigation handoff.
- Investigation entry `0009-post-batch-coherent-current-factory` — immutable current Run `105` observation appended with entry hash `54307fbef2b7`.
- Candidate review `preserve-failure-target-utility-funded-overflow/de002b559fa5…` — exact 22-operation capital-offset proposal reviewed `DISCARD`; immutable review result `0d17cf9d32b5…`.
- Run `108-candidate-trial-preserve-failure-target-utility-` — immutable trial result `428722d748dd…`; Studio visually confirmed complete `batch-coherent · process · 8/batch` transport, powered operation, 96 delivered, zero final WIP, and the measured facility wait.
- Investigation entries `0013-utility-funded-overflow-trial` and `0014-close-capital-neutral-overflow-hardware` — exact Run comparison and explicit final disposition appended through the public CLI.
- `bun run inm validate examples/memory-fab --json` — current editable factory remains valid at Blueprint `16ca367007ed`.
- `bun run inm test examples/memory-fab --json` — both memory-fab project fixtures pass.
- `bun run check:fast` — 1,354 documentation links, all TypeScript projects, and 41 short tests pass.
- Focused `workbench`, Studio lifecycle, session-recovery, and synthesis tests pass. Full repository verification originally reached `348/350`; both failures were fixed-duration timeout noise under the loaded serial suite. After assigning Studio requests and synthesis work the existing 15-second startup budget, the complete serial repository suite passes `350/350` plus all eight Ironworks fixtures.

## Progress log

- 2026-07-31 — Plan opened from the completed batch-coherent dispatch trial. The parallel hardware question is now constrained by explicit power and capital rather than item-routing ambiguity.
- 2026-07-31 — A first offset draft attempted to remove the idle `plant-1`, but the locked failure Scenario names that exact asset. The invalid unreviewed draft was discarded, and the revised Candidate retained `plant-1` while removing the identical second and third plants so interruption evidence remained executable.
- 2026-07-31 — Run `108`, the locked review, visual replay, and the append-only decision converge on the same boundary: nominal throughput can be bought inside capital, but only by deleting the resilience that the Objective explicitly protects.

## Completion

Completed on 2026-07-31. The complete parallel Burn-in branch is quantitatively bounded and explicitly discarded under the unchanged capital and service contract. Its nominal upside remains preserved as immutable evidence rather than applied to the factory. The continuing human/Agent design frontier moves to incumbent-rack temporal control.
