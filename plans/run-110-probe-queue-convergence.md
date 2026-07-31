# Run 110 Probe queue convergence

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], [[docs/design/design-programs]], and [[docs/design/operator-workbench]].

## Outcome

Carry Run 110's exact `probe-1` tracked-lot queue contributor through one current, spatially observed Investigation and either a physically distinct locked intervention or an explicit bounded defer decision, without reusing the historical layer-one etch queue Program.

## Context

Workbench V19 now suppresses the independently deferred furnace input-starvation diagnostic and correctly advances to `fab-loss.queue-congestion:device:probe-1+route:dram-front-end`. The exact contributor is `device:probe-1:process-queue-wait:dram-front-end:probe-dram:probe-sort-dram-standard`: nine lots accumulate `21,997` queue ticks, `32.6%` of all completed-lot queue time, with one segment reaching `11,644` ticks.

The existing `front-end-queue-convergence` Program is qualified only for `etch-1 / etch-cell-layer-1`. Its four current interventions already form a bounded negative frontier for that different contributor. Reopening it for Probe would erase the physical identity that the strict Program contract was introduced to preserve.

## Scope

### In scope

- Bind Run 110, the exact Probe queue contributor, and required Studio views in one project-local Investigation.
- Inspect Probe equipment state, qualification, input/output topology, lot chronology, mode eligibility, and downstream handoff.
- State one falsifiable human/Agent hypothesis and the smallest physically distinct Candidate or bounded defer boundary.
- If an intervention is justified, evaluate it against the unchanged five-case Benchmark and retain exact before/after `queueTicks`, Objective, service, quality, cost, and spatial evidence.
- Keep Workbench, CLI, Studio, project fixtures, and durable design documents aligned with the resulting decision.

### Out of scope

- Reusing or widening the layer-one Etch queue Program.
- Treating all `67,553` queue ticks as one interchangeable loss.
- Automatic layout generation, RL, or an unbounded Probe parameter sweep.
- Relaxing current delivery, on-time-service, quality, cost, or current-best case guards to force a KEEP.
- Compatibility support for superseded pre-alpha Program or Investigation shapes.

## Acceptance

- [x] The Investigation binds Run 110 and the exact `probe-1 / probe-sort-dram-standard.queueTicks` contributor, with typed and spatial observation recorded.
- [x] Any Candidate is physically distinct, names the exact addressed loss target, and either improves it under the complete locked envelope or is explicitly rejected/deferred.
- [x] A human or Agent can reopen the same current question, evidence, result, and next action from both CLI and Studio without reconstructing identity from chat.
- [x] Project validation, focused tests, full `bun run test`, and browser acceptance verify the retained decision and subsequent Workbench handoff.

## Work

- [x] Bind the current Run 110 observation and exact Probe queue contributor.
- [x] Inspect Probe, its incoming/outgoing paths, mode contract, and per-lot wait chronology in typed and spatial evidence.
- [x] Author and evaluate one smallest distinct intervention, or record why the present evidence cannot justify one.
- [x] Persist the exact Investigation decision and align Workbench, CLI, Studio, docs, and fixtures.
- [x] Complete the verification audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Run 110 conserves all `67,553` completed-lot queue ticks. Probe owns `21,997` across nine lots and is now the leading contributor; historical Etch evidence remains valid for its own `21,500` ticks but has no authority over Probe.
- 2026-07-31 — The strict exact-target Program contract intentionally leaves no automatic Program match here. The next step is current observation, not broad provider fallback.
- 2026-07-31 — Probe processes twelve wafer lots for exactly `96,000` ticks with no idle, interruption, power, failure, or blocked-output time. `inspection-to-probe` delivers all twelve lots at `1.3%` utilization with no blocked item-time. `probe-to-packaging` carries downstream congestion, but the 128-die output buffer prevents it from becoming Probe blocked-output time. The exact queue contributor is therefore a single-server arrival burst rather than local transport shortage.
- 2026-07-31 — The smallest previously studied physical intervention became one explicit `qualified-high-throughput-95` mode: `19/20` duration and reciprocal `20/19` active power, selected only by Candidate `qualified-probe-cycle-95`. No release, dispatch, route, buffer, yield, layout, or downstream equipment field changed.
- 2026-07-31 — The TRIAL improves the exact target from `21,997` to `17,063` ticks (`-4,934`, `-22.4%`) and maximum segment from `11,644` to `6,621`, but delivered devices fall `88 → 78`, average WIP rises `49.1905 → 52.2903`, energy rises about `1.445 MJ`, and the mixed-quality current-factory score falls `4.13438`.
- 2026-07-31 — Investigation entry `discard-qualified-probe-cycle-95` rejects the isolated acceleration despite the legacy baseline-relative review's `KEEP` label. The unused mode remains a project-local catalog capability and negative boundary; the commissioned Blueprint remains unchanged. Any future Probe acceleration must be co-designed with the downstream handoff.
- 2026-07-31 — Selection-scoped identity correctly reuses Run 110 after the unused mode addition. The post-trial current observation advances Workbench to `fab-loss.maintenance-qualification`, proving the discarded branch no longer blocks the queue.
- 2026-07-31 — The new unused mode exposed a Core gap: recomputing a retained Run comparison included the mutable full catalog digest in its aggregate comparison hash even when both persisted execution identities still reproduced exactly. Investigation validation now treats the stored digest as provenance and re-verifies the immutable FROM/TO Run ids, result hashes, selected hashes, execution hashes, selection, and intervention. A new regression test proves an unused catalog option cannot invalidate an exact comparison; selecting or changing the option still changes execution identity and fails closed.

## Verification

- `bun run inm observe examples/memory-fab --run 110-candidate-trial-run-105-normal-particle-suppress --json` — current Observation V5 binds the compatible TRIAL and required Probe/Route/analysis views.
- `bun run inm inspect examples/memory-fab --section losses --json` — exact Probe contributor and conserved queue aggregate confirmed.
- `bun run inm candidate examples/memory-fab --candidate qualified-probe-cycle-95 --review --json` — immutable five-case review retained; all seven hard outcome guardrails pass, while its separate current-factory evidence reports regression.
- `bun run inm candidate examples/memory-fab --candidate qualified-probe-cycle-95 --run --seed 42 --json` — immutable Run `111-candidate-trial-qualified-probe-cycle-95` created against exact Run 110 parent evidence.
- `bun run inm compare examples/memory-fab --from-run 110-candidate-trial-run-105-normal-particle-suppress --to-run 111-candidate-trial-qualified-probe-cycle-95 --json` — exact comparison reports `REGRESSED`, `-10` delivered devices, `+3.0998` average WIP, and `-4.13438` score.
- `bun run inm simulate examples/memory-fab --seed 42 --json` — unchanged selected Blueprint reuses exact compatible Run 110 after the unused catalog addition.
- Studio `/memory-fab/investigations/run-110-probe-queue` — browser acceptance shows five immutable entries, current/historical anchor states, completed Candidate cycle, explicit `DISCARD`, and the current maintenance/qualification continuation.
- `bun run inm validate examples/memory-fab --json` — passes with no diagnostics.
- `bun run check:fast` — passes documentation links, TypeScript, and 41 focused tests / 288 assertions.
- `bun run test` — passes 354 package tests / 4,041 assertions and all eight Ironworks project fixtures.

## Progress log

- 2026-07-31 — Plan activated from Workbench V19's first exact run-qualified observation fallback.
- 2026-07-31 — Investigation created; typed and spatial Probe/connection evidence recorded.
- 2026-07-31 — One exact high-throughput Probe Candidate reviewed, trialed, compared, and explicitly discarded for downstream displacement.
- 2026-07-31 — Current factory checkpoint restored without changing the commissioned Blueprint; Studio acceptance completed.
- 2026-07-31 — Selection-scoped Run-comparison continuity repaired at the Core boundary; focused and full verification passed.

## Completion

Completed with an evidence-backed negative result. The exact local queue improvement is retained, its industrial regression is explicit, and the Workbench now continues from the unchanged commissioned factory rather than reopening the discarded Probe-only branch.
