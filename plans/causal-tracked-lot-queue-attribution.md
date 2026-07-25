# Causal tracked-lot queue attribution

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/lot-tracking]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], and [[docs/design/studio-debugger]].

## Outcome

Partition the tracked-lot queue signal into exact conserved process-input and transport-dispatch waits so the memory-fab Workbench sends humans and Agents to the equipment or connection that actually held a tracked lot, never to an unrelated high-utilization downstream Device.

## Context

Current compatible Run `089-simulate` reports `5,513.833` mean queue ticks over twelve completed wafer lots, or `66,166` total ticks. Workbench currently attaches that bucket to evaluator-wide bottleneck context `burn-in-1`. The wafer Route terminates at Probe, so the burn-in rack processes only ordinary packaged devices and cannot own any tracked-wafer queue interval.

An event replay of the same immutable Run conserves all `66,166` queue ticks through actual lot locations: `etch-1` owns `21,500`, `probe-1` owns `17,210`, `etch-l2` owns `11,333`, `lithography-l2` owns `7,544`, `deposition-1` owns `6,000`, and `inspection-1` owns `2,579`. Transport-dispatch waits are structurally observable at lot-bearing `resource.depart` events and happen to be zero in this Run. The current recommendation is therefore not merely imprecise; it crosses the tracked/untracked industrial boundary and directs optimization at the wrong subsystem.

## Scope

### In scope

- Reconstruct every completed target lot's queued intervals from immutable release, Device, Route, and lot-bearing transport events.
- Group positive intervals by exact process Device or connection, Route step, Process, Resource, and lot identities.
- Require contributor ticks to conserve the evaluator-owned completed-lot queue total exactly.
- Replace generic bottleneck subjects and prose with the leading causal contributor on Core, CLI, Studio, and Workbench next-action surfaces.
- Keep evaluator-wide bottleneck utilization as separate operating context rather than queue ownership.

### Out of scope

- Changing queue, cycle-time, WIP, delivery, or Objective scoring.
- Claiming a counterfactual throughput recovery from observed waiting alone.
- Optimizing etch, Probe, transport, or release policy before the corrected current work queue selects an intervention.
- Relabeling necessary transit or equipment input starvation as queue time.
- Supporting old loss-profile or Workbench projection versions during pre-alpha development.

## Acceptance

- [x] Queue contributors sum exactly to `meanQueueTimeTicks × completedLots`, with no unattributed completed-lot ticks.
- [x] Current memory-fab evidence identifies `etch-1 / etch-cell-layer-1` as the leading queue contributor and excludes `burn-in-1` from queue subjects and contributors.
- [x] CLI and Studio expose the same ordered Device/connection, Route step, Process, Resource, lots, segments, ticks, and share evidence.
- [x] The shared next action uses the corrected diagnostic identity, subject, reason, argv, and Studio route without changing the physical Run.
- [x] Core, CLI, Studio, project fixtures, documentation, browser acceptance, and complete repository regression pass.

## Work

- [x] Reproduce the current mismatch and conserve all queue ticks through an independent event replay.
- [x] Add strict source-neutral queue attribution and replace the generic bottleneck projection.
- [x] Project exact contributors through CLI, Studio, Workbench, and tests.
- [x] Update durable design documentation and current memory-fab narrative.
- [x] Complete public-loop verification, browser acceptance, regression, commit, and push.

## Findings and decisions

- 2026-07-25 — The current queue bucket score is evaluator-owned and correct; only its investigation subject is wrong. `burn-in-1` is the factory-wide utilization context, while all scored queue time belongs to completed tracked wafer lots upstream of Probe termination.
- 2026-07-25 — Current events provide a complete partition without simulation changes: release or Device finish opens a queued interval, lot-bearing transport departure closes transport-dispatch wait, arrival opens process-input wait, and Device start closes it. Route transitions retain exact Route/step identity.
- 2026-07-25 — Attribution will retain only completed target lots because `lotFlow.meanQueueTimeTicks` has that exact evaluator denominator. In-progress or scrapped lot waiting must not leak into the contributor total.
- 2026-07-25 — Positive contributor time is causal location evidence, not proof that adding capacity at the leading Device will improve the locked factory. The corrected next step may require a focused Design plan after this attribution plan completes.
- 2026-07-25 — The profile contract advances to V8 and Workbench to V10. Pre-alpha compatibility is intentionally absent, so the two bounded focused decisions were reissued from unchanged project inputs as current V8 Runs `26972cba3dccdc953c0b0845ac33d12143ef7b3ce6dddf427cba40386d1e0e4d` and `47e469f0d22b4d25ff46d89376dfacf1ce70e55f72a5d98743ac7347eafd11a7`; the old V7 artifacts were removed.

## Verification

- Independent immutable-event replay of Run `089-simulate` — `66,166 / 66,166` completed-lot queue ticks attributed; leading contributors `etch-1 21,500`, `probe-1 17,210`, `etch-l2 11,333`.
- Focused Core and Workbench tests — `16` passed, including exact conservation, causal subjects, and bounded-decision continuity.
- Focused CLI parity tests — `2` passed, including structured and human queue evidence plus explicit rejection of superseded V7 Design evidence.
- Studio server regression — `5` passed, including project-open and shared Design evidence contracts.
- In-app browser acceptance — `/` opens the self-contained project, `/memory-fab` renders two current V8 dispositions and the exact queue panel, both focused Design evidence routes reopen, the broad queue handoff opens, and the console reports zero errors.
- `bun run test` — documentation links and TypeScript checks pass; `244` package tests pass with `0` failures; all eight Ironworks public project cases pass.
- `git diff --check` — passed.

## Progress log

- 2026-07-25 — Plan activated after the shared queue next action incorrectly selected an untracked downstream burn-in rack.
- 2026-07-25 — V8 evidence, Workbench V10, CLI/Studio parity, current focused Design artifacts, browser acceptance, and complete regression closed the attribution milestone.

## Completion

Completed on `2026-07-25`. Run `089-simulate` is unchanged, but every shared human/Agent surface now conserves its `66,166` completed-lot queue ticks at actual wafer-lot locations. The active queue correctly points to `etch-1 / etch-cell-layer-1`; `burn-in-1` remains utilization context only. Current V8 focused Design authority preserves both earlier bounded decisions without carrying a compatibility reader.
