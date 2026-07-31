# Run 112 Probe causal continuation

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], and [[docs/design/operator-workbench]].

## Outcome

Carry Run 112's canonical `probe-1` queue facts into the existing Probe Investigation so the exact Run 110 negative experiment remains usable current judgment instead of disappearing behind a new execution identity.

## Context

Workbench V20 advances to `fab-loss.queue-congestion:device:probe-1+route:dram-front-end` after the furnace supply decision. Run 112 reproduces the Run 110 contributor exactly: nine lots accumulate `21,997` queue ticks, `32.6%` of completed-lot queue time, with the same selected World, Blueprint, Production Plan, Scenario, and Objective.

Run 110 already evaluated the smallest isolated Probe intervention. A qualified five-percent cycle reduction cut the local contributor by `22.4%`, but delivered devices fell `88 → 78`, average WIP increased, and the Candidate was discarded because the faster die-arrival phase could not be absorbed by packaging, burn-in, and shipping. The old diagnostic anchor predates canonical causal hashes, so that valid evidence cannot requalify automatically.

## Scope

### In scope

- Bind Run 112 and the exact current Probe diagnostic in one hash-bearing Factory observation.
- Reinspect Probe plus its immediate incoming and outgoing connections in the Run 112 spatial replay.
- Re-evaluate the existing reviewed Candidate against Run 112 when the historical comparison cannot reproduce under the current engine.
- Carry the resulting current comparison and explicit human/Agent judgment into a bounded defer or discard decision.
- Verify that the measured loss remains visible while Workbench advances to the next unsuppressed question.

### Out of scope

- Re-running the discarded isolated Probe acceleration.
- Treating nominal belt utilization as proof that the downstream handoff is uncongested.
- Inventing an automatic Probe/downstream parameter sweep or layout optimizer.
- Broadening the decision beyond the exact `probe-1 / probe-sort-dram-standard` queue contributor.
- Backward-compatibility migration for old Investigation anchors.

## Acceptance

- [x] Run 112 typed and spatial evidence records the exact Probe queue contributor, equipment state, incoming supply, and outgoing backpressure.
- [x] The current decision cites both a current-engine immutable Candidate comparison and the Run 112 hash-bearing causal observation.
- [x] CLI and Studio show the Probe disposition as current, keep its physical loss visible, and advance to the next exact question.
- [x] Project validation, focused tests, full `bun run test`, and browser acceptance pass.

## Work

- [x] Bind Run 112 and inspect the current Factory, Probe device, incoming connection, and outgoing connection.
- [x] Re-run the already reviewed Probe Candidate against Run 112 and retain a current-engine immutable comparison.
- [x] Append the hash-bearing observation and bounded decision to the existing Investigation.
- [x] Update durable design documentation and verify CLI/Studio parity.
- [x] Complete the verification audit and archive the plan.

## Findings and decisions

- 2026-07-31 — Run 112 reproduces the exact Probe queue signal: nine lots, `21,997` queue ticks, `32.6%` of completed-lot queue time, and causal hash `f4219c65718af33d585394b9e3975143d3b5cf78c15884969e964250cf084f93`.
- 2026-07-31 — Factory replay shows `probe-1` at `40.0%` run utilization with `96.0 s` processing, `144.0 s` input wait, and zero idle, sleep, blocked-output, unpowered, or failure time. It realizes all `96 / 96` nominal die output.
- 2026-07-31 — `inspection-to-probe` delivers all twelve wafer lots at `1.3%` utilization with zero blocked item-ticks. `probe-to-packaging` delivers all 96 dies at `10.0%` utilization but accumulates `118,200` blocked item-ticks: `73,600` line contention, `36,400` endpoint capacity, `8,200` endpoint power, and zero endpoint failure.
- 2026-07-31 — These observations do not create a new local Probe mechanism. The exact prior acceleration already reduced the local queue and failed the commissioned industrial outcome; the separately tested tray handoff also eliminated its target only by adding rejected capital/energy cost. Any future branch must name a new downstream service hypothesis rather than repeat either bounded intervention.
- 2026-07-31 — The first attempted continuation correctly failed closed because historical comparison `probe-cycle-95-comparison` can no longer reproduce Run 111's persisted execution identity under the current engine. The uncommitted entry was removed rather than allowing a new claim to inherit invalid evidence. The existing reviewed Candidate will be replayed from Run 112 to create current evidence.
- 2026-07-31 — Current-engine Candidate `qualified-probe-cycle-95-run-112` retains its locked `KEEP` compliance result but regresses the exact current factory in four of five cases. In the mixed current case it changes delivered devices `88 → 78`, average equivalent WIP `49.1905 → 52.290333`, and score `0.744987 → -3.389393`.
- 2026-07-31 — Immutable TRIAL Run `113-candidate-trial-qualified-probe-cycle-95-run-112` reproduces the local Probe benefit and the factory regression. The exact old contributor falls `21,997 → 17,063` queue ticks (`-22.4%`), while the current factory loses ten delivered devices and adds `3.099833` average WIP-equivalent units.
- 2026-07-31 — Investigation entries `0006`–`0009` retain the current review decision, Run 112 causal observation, exact `112 → 113` comparison, and explicit defer judgment. Local Probe cycle/input-transport tuning is closed unless a distinct downstream service or phase-control hypothesis is named.
- 2026-07-31 — Workbench keeps both furnace input starvation and Probe queue congestion physically visible as `DEFER · SUPPRESSED · CURRENT`, then advances to `layer-two-particle-control` for the next unsuppressed yield-quality question.

## Verification

- `bun run inm observe examples/memory-fab --json` — Run 112, current selection hashes, exact Probe diagnostic, and canonical causal hash confirmed.
- Studio `/memory-fab/factory?run=112-simulate`, `/memory-fab/factory/devices/probe-1?run=112-simulate`, `/memory-fab/factory/connections/inspection-to-probe?run=112-simulate`, and `/memory-fab/factory/connections/probe-to-packaging?run=112-simulate` — typed evidence and the spatial work cell agree on the current mechanism.
- `bun run inm validate examples/memory-fab --json` and `bun run inm test examples/memory-fab --json` — project artifacts and fixtures pass.
- `bun run check:fast` — documentation, TypeScript, and short unit suite pass.
- `bun run test` — `355` package tests and all Ironworks project fixtures pass.
- Studio `http://localhost:4176/memory-fab` — source-current service, two current suppressed Investigation decisions, yield-quality next action, and zero browser warnings/errors confirmed.

## Progress log

- 2026-07-31 — Plan activated from the first current Workbench observation fallback after the furnace decision.
- 2026-07-31 — Current Candidate review, immutable TRIAL, comparison, observation, and explicit decision recorded.
- 2026-07-31 — CLI, Studio, docs, focused tests, fast checks, and the full repository regression verified.

## Completion

Run 112 now carries an independently current Probe decision. The local five-percent acceleration remains a useful negative experiment rather than a lost historical anecdote: it demonstrably reduces the cited queue but worsens current delivery and WIP. Workbench therefore suppresses that exact diagnostic without erasing it and hands the operator to the layer-two yield-quality design loop.
