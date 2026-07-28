# Location-qualified WIP exposure

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/inventory-accounting]], [[docs/design/operator-workbench]], [[docs/design/observation-led-design]]

## Outcome

Make Objective-scored WIP physically actionable: every compatible simulation, immutable run, CLI inspection, and Studio workbench identifies the exact Device Buffer or transport stage where each scored Resource resides, so a human or reasoning Agent can form a minimal factory-design hypothesis from conserved evidence instead of guessing from a Resource total.

## Context

The commissioned memory fab currently reports `known-good-dram-die` and `packaged-dram-device` as the dominant WIP score contributors, but the accounting stops at Resource identity. The same total could mean healthy input coverage, blocked output, a full downstream Buffer, or in-flight transport. Those cases imply different interventions, so the existing evidence is insufficient for an observation-led design decision.

The simulator already visits every authoritative resident Buffer, local transit, and station transit once at each positive-time measurement boundary. This work can integrate location-qualified item-ticks in that same pass without adding an identity ledger or a second live-state scan.

## Scope

### In scope

- Add a strict, deterministic Objective-WIP location accounting contract for Device Buffers, local transport phases, and station routes.
- Conserve per-location average and final inventory back to the existing per-Resource and total WIP accounting.
- Project the same ranked physical locations through immutable reports, comparisons, the shared workbench, CLI, and Studio.
- Regenerate current memory-fab evidence when the result contract and engine identity change.
- Use the new evidence to state and evaluate one smallest exact back-end factory intervention.

### Out of scope

- Item age or residence-time claims for fungible inventory without identity-preserving runtime authority.
- Treating high WIP contribution as automatic evidence of waste.
- RL, black-box optimization, automatic Buffer shrinking, or an autonomous layout generator.
- Compatibility readers or migrations for pre-change immutable runs.

## Acceptance

- [x] Every scored unit is counted exactly once at a stable physical location, and the sum of per-location averages/finals reconciles with per-Resource and total Objective WIP accounting.
- [x] CLI, immutable report, shared workbench, and Studio expose the same ranked location evidence without independently recomputing industrial metrics.
- [x] Comparison evidence reports exact per-location baseline, candidate, and delta values.
- [x] Tests cover resident Buffer, local loader/line/unloader, station route, deterministic replay, and cross-surface parity.
- [x] A compatible memory-fab run plus spatial Factory replay supports one explicit back-end hypothesis and the smallest guarded intervention; the resulting decision is recorded as KEEP, revise, defer, or discard.
- [x] `bun run test` passes after current fixtures and immutable evidence are regenerated.

## Work

- [x] Audit the current inventory integration, final-state accounting, and projection boundaries.
- [x] Implement Core location identity, single-pass integration, reconciliation, and comparison evidence.
- [x] Add immutable report, workbench, CLI, and Studio projections with focused spatial handoffs.
- [x] Regenerate and observe the commissioned memory-fab evidence, then author the smallest evidence-backed intervention.
- [x] Run the locked Benchmark, compare quantitative and spatial before/after evidence, and record the human/Agent decision.
- [x] Complete documentation, fixtures, full verification, completion audit, commit, and push.

## Findings and decisions

- 2026-07-29 — Active-job inputs remain outside inventory because current accounting consumes them at job start; this plan preserves that existing semantic boundary.
- 2026-07-29 — Location exposure applies only to Objective-owned WIP Resources. Complete per-Resource accounting remains available for excluded inventory, while avoiding a large location table for raw, support, scrap, and finished stock that cannot affect the WIP score.
- 2026-07-29 — Local transport is separated into loader, line, and unloader locations; station transit is qualified by network and route. Stable IDs describe physical accounting locations, not transient item identities.
- 2026-07-29 — Per-location peaks are individually exact but are not additive because locations can peak at different ticks. Average and final quantities are the conservation boundaries.
- 2026-07-29 — Fungible Buffer inventory has no residence identity, so this work will not invent item-age metrics.
- 2026-07-29 — Run `092-simulate` under `inm-sim/0.87.0` conserves `19.873` average scored WIP. `burn-in-1.package-input` holds `9.781` average packaged devices and `packaging-1.die-input` holds `7.966` average known-good dies; every individual local transport stage is below `0.25`.
- 2026-07-29 — Spatial replay showed `packaging-1` at 60% utilization with 96 seconds of input wait and 40/min installed process capacity between measured 24/min inbound/outbound lanes. It packages all 96 available dies. `burn-in-1` is the displayed bottleneck at 68.3% utilization, consumes fixed batches of eight, and retains one final batch of eight packaged devices. The evidence supports a cadence/release experiment, not another sorter intervention.
- 2026-07-29 — Smallest hypothesis: reduce commissioned lot CONWIP from maximum/reopen `6/5` to `5/4`. Expected effect is less terminal back-end batch exposure without changing equipment or Buffer capacity. Promotion guards are unchanged 12/12 lot completion, 88 delivered devices, contract mix/value, on-time service, quality, and all locked cases; otherwise discard.
- 2026-07-29 — Production-window comparison improved score `42.826 → 47.125` and average WIP `19.873 → 15.877` with unchanged 88-device delivery. Location deltas falsified the terminal-batch part of the hypothesis: `burn-in-1.package-input` stayed exactly `9.781`, while `packaging-1.die-input` fell `7.966 → 3.764`.
- 2026-07-29 — Locked five-case Candidate review `cacad0436501eebec66c3c498a0b4edb06b9d399161935a3135207ea0155f91e` is `DISCARD`. On-time lots regressed below guards in steady production (`11 < 12`), lithography interruption (`6 < 7`), and facility interruption (`7 < 9`). The change delays release under adversity instead of improving back-end physical capability and will not be applied.
- 2026-07-29 — Advancing the result contract to `inm-sim/0.87.0` deliberately makes pre-0.87 Design Runs historical. Current Workbench and CLI tests require the compatible `092-simulate` run for physical evidence and do not revive old Design authority through a compatibility reader.

## Verification

- `bun run check:fast` — passed: 1,088 documentation links, all TypeScript projects, and 35 short tests / 209 assertions.
- `bun run test` — passed: 298 package tests / 3,188 assertions plus all eight Ironworks project fixtures.
- `bun run inm observe examples/memory-fab --run 092-simulate --json` — returned compatible Run `092-simulate`, the leading input-starvation diagnostic, the separate WIP Objective tradeoff, and exact Factory focus routes for `burn-in-1` and `packaging-1`.
- Run-qualified Factory replay inspected at `burn-in-1` and `packaging-1`; visible equipment state, utilization, batch behavior, and measured lanes matched the Core-owned location evidence recorded above.
- Candidate review `cacad0436501eebec66c3c498a0b4edb06b9d399161935a3135207ea0155f91e` evaluated all five locked cases and recorded `DISCARD`; the commissioned Blueprint remained unchanged.

## Progress log

- 2026-07-29 — Plan created and current Resource-only WIP evidence audited.
- 2026-07-29 — Core/CLI/Studio location evidence implemented, engine advanced to `inm-sim/0.87.0`, Benchmarks relocked, and compatible Run `092-simulate` created and observed in the spatial Factory replay.
- 2026-07-29 — Authored and reviewed the exact `6/5 → 5/4` CONWIP Candidate; retained its immutable `DISCARD` evidence and left the commissioned Blueprint unchanged.
- 2026-07-29 — Updated strict current-evidence tests, completed full verification, and closed the plan without adding backward compatibility.

## Completion

Objective-scored WIP now remains conserved from the simulator's authoritative state through immutable evidence, comparisons, CLI, shared Workbench, and Studio, while identifying the exact Buffer or transport stage that owns each contribution. The first resulting intervention was deliberately rejected by locked industrial service guards, demonstrating that the new evidence supports human/Agent judgment without becoming an automatic optimizer.
