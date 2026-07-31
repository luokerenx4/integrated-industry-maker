# Run 114 release-admission requalification

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/lot-release-scheduling]], [[docs/design/wip-release-control]], [[docs/design/fab-loss-attribution]], [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], and [[docs/design/operator-workbench]].

## Outcome

Decide whether Run 114's commissioned no-rework operating state changes the industrial judgment on one-card CONWIP relief, then retain a current promotion-safe Candidate or an exact Run 114 decision that keeps intentional admission delay from being rediscovered as free throughput.

## Context

Workbench advances from the bounded Run 114 Probe identity question to diagnostic `fab-loss.release-admission:device:lot-release+route:dram-front-end:34cb532c12`. Six lots accumulate `162,138` controller-owned ticks and no physical-capacity delay. `dram-lot-07` leads with `62,023` ticks, is planned seventh at tick `36,000`, and is admitted twelfth at tick `98,023` by one-for-one `6/5` EDD control with `81,977` ticks of due-date slack.

The release boundary is physically simple: the project-local `lot-release` buffer at `(2, 13)` has capacity `20`, one direct `release-to-lithography` line, zero runtime wait/block/power/failure time, and no release-buffer or Resource-capacity attribution. Run 114 completes all twelve wafer routes on time, but `dram-lot-07` becomes the final eight packaged devices waiting at Burn-in after its source reaches packaging at `202.8–204.3 s`; opening admission is therefore only useful if it improves downstream service rather than moving WIP earlier.

Historical current-engine evidence for the older Run 090 facts rejected one-card `7/6` EDD because it removed `dram-lot-07`'s `63,623`-tick hold but regressed all five cases and lost one facility-interruption on-time lot. That Design evidence is now invalid against Run 114's changed Blueprint and causal hash. The selected project strategy still hard-codes the old `171,738 / 63,623` facts, so it cannot produce honest current evidence until its gate and hypothesis bind Run 114.

This is an exact requalification, not a claim that old evidence vanished. The historical boundary remains explanatory; Run 114's different causal facts must independently confirm or overturn it.

## Scope

### In scope

- Capture Run 114's exact selection, hashes, release diagnostic, causal hash, typed lot chronology, and spatial release/back-end observation in one append-only Investigation.
- Update the focused project strategy to recognize only Run 114's exact release facts and propose the same smallest `6/5 → 7/6` EDD intervention under the new operating state.
- Evaluate the proposal against the current factory and unchanged five-case Benchmark, preserving exact target reduction, WIP, delivery mix, due-date service, quality, cost/area, and current-best case evidence.
- Retain a Candidate only if earlier admission converts into factory value without a current or locked regression; otherwise record a current diagnostic-target defer/discard decision.
- Keep historical Run 090 evidence visible and explicitly distinguish requalification from causal-hash reuse.

### Out of scope

- Editing the Production Plan, due dates, lot priorities, or customer contracts.
- Autonomous policy generation, RL, unbounded CONWIP search, or treating lower controller wait as sufficient commissioning authority.
- Reopening the already bounded Probe, furnace, back-end hardware, batch, campaign, or uniform release-cadence branches without a new measured mechanism.
- Adding service-age control to one-for-one `6/5` release: with no free hard-cap card before active WIP reaches five, it cannot open the controller earlier than the existing threshold.
- Backward compatibility for pre-alpha strategy facts or evidence files.

## Acceptance

- [x] One current Investigation records exact typed and spatial Run 114 release evidence plus a falsifiable one-card hypothesis.
- [x] The focused project strategy recognizes Run 114 and one Investigation-sourced Candidate retains immutable five-case target/current-best evidence.
- [x] A human or Agent explicitly keeps, revises, defers, or discards the intervention without erasing the measured release delay or historical boundary.
- [x] CLI and Studio reopen the same decision and Workbench advances only through exact current Investigation authority.
- [x] Documentation, project validation, focused/full tests, and browser acceptance pass.

## Work

- [x] Inspect current Workbench, Program, historical boundary, exact release contributors, and Run 114 spatial factory state.
- [x] Create the Run 114 Investigation and append observation plus one-card hypothesis.
- [x] Rebind the project strategy and execute the bounded current Candidate evaluation.
- [x] Retain the exact Candidate/decision evidence and align Workbench plus durable design documentation.
- [x] Complete CLI, Studio, regression, and plan audit.

## Findings and decisions

- 2026-07-31 — Current diagnostic causal hash is distinct from the older `171,738`-tick Run 090 boundary: Run 114 owns `162,138` control ticks and `dram-lot-07` owns `62,023`, so automatic causal requalification correctly fails closed.
- 2026-07-31 — All six delayed lots release at active WIP `5` through threshold openings; physical capacity contributes zero. EDD selects the earliest-due identity from the eligible set at each card opening; availability plus those openings produce actual later-lot order `10, 12, 11, 09, 08, 07`, leaving lot 07 last with positive slack.
- 2026-07-31 — Studio confirms `lot-release` is a capacity-20 edge buffer with one direct lithography line and no equipment loss. The downstream horizon, not the entry device, leaves lot 07 as eight final packaged WIP units at Burn-in.
- 2026-07-31 — The existing proposal provider is not current: it requires exact Run 090 totals and therefore cannot answer the Run 114 Workbench handoff until updated.
- 2026-07-31 — Candidate review `f698914ac7ec…` and Run `114 → 115` comparison `05dc81448593…` agree: `7/6` recovers exactly `62,023` controller ticks but preserves 88 deliveries, adds `2.067433` average WIP equivalent, adds `4,248.083` mean cycle ticks, shifts terminal packaged WIP from lot 07 to lot 08, and regresses every current case.
- 2026-07-31 — Facility-interruption on-time lots fall `9 → 8`, so the locked review is `DISCARD`. Entry `discard-run-114-one-card-release` explicitly retains `6/5 EDD` and suppresses only causal diagnostic `0f8f1c9a30d8…`; the physical release loss remains visible.
- 2026-07-31 — Updated provider API V10 recognizes the exact Run 114 profile. A temporary ignored Design verification result `eb00d11442f1…` generated the intended two-operation proposal, reproduced `162,138 → 100,115` controller ticks, rejected it on the same facility service guard, and exhausted the unchanged seed. Its disposable cache was removed after verification; the Investigation-sourced Candidate review and TRIAL Run are the retained authority.
- 2026-07-31 — Because the Candidate TRIAL was the newest operating checkpoint, the completed decision initially reopened as historical. Observation `resume-run-114-after-one-card-discard` re-establishes current Run 114 without deleting Run 115; Investigation inspection now reports `current` with one completed reviewed-discard Candidate cycle.
- 2026-07-31 — Shared Workbench dispositions resolve this exact discard as `current` and advance to `back-end-die-handoff` for causal target `fab-loss.transport-blocking:connection:probe-to-packaging:2f7d6b19f2`.

## Verification

- `git diff --check` — no whitespace or patch-format errors.
- `bun run inm validate examples/memory-fab --json` — project compiles with zero diagnostics.
- `bun run inm test examples/memory-fab --json` — both project tests pass (`2/2`).
- `bun run inm candidate examples/memory-fab --candidate run-114-one-card-release-window --review --progress off --section summary --json` — deterministically reproduces proposal `666decabc67a…`, immutable review `f698914ac7ec…`, and `DISCARD` across all fifteen locked/current/proposed simulations.
- `bun run inm design examples/memory-fab --program release-admission-convergence --run --max-candidates 2 --section summary --json` — temporary result `eb00d11442f1…` proposes only `6/5 → 7/6`, records the exact target reduction, rejects on facility-interruption service, and leaves the seed unchanged.
- `bun run inm investigate examples/memory-fab --investigation run-114-release-admission-requalification --section summary --json` — reports `current`, Candidate cycle `completed`, review state `reviewed-discard`, exact TRIAL/comparison/disposition identities, and latest current observation `f069afe5edb5…`.
- `bun run inm inspect examples/memory-fab --section dispositions --json` — release decision is current under causal hash `0f8f1c9a30d8…`; physical evidence remains visible and queue effect is `suppressed`.
- `bun run inm inspect examples/memory-fab --section next-action --json` — advances to `back-end-die-handoff` and exact `probe-to-packaging` transport diagnostic.
- `bun run check:fast` — documentation links, TypeScript, and the 41-test short suite pass.
- Browser acceptance at `/memory-fab/investigations/run-114-release-admission-requalification`, `/memory-fab/experiments/greenfield-dram-design/candidates/run-114-one-card-release-window`, `/memory-fab/runs?from=114-candidate-trial-run-112-dimensional-stability&to=115-candidate-trial-run-114-one-card-release-window`, and `/memory-fab/designs/back-end-die-handoff` — current Investigation, completed discard cycle, disabled Candidate write, regressed comparison, and exact next Program all render without visible error.
- `bun run test` — documentation, typecheck, `357/357` Core/CLI/Studio tests, and all eight Ironworks project tests pass. One Studio lifecycle start race failed once during the preceding run, passed its immediate focused replay, and passed in the final full run.

## Progress log

- 2026-07-31 — Plan activated from the exact Run 114 release-admission Workbench handoff after Probe identity dispatch was bounded.
- 2026-07-31 — Authored the exact Investigation/Candidate, completed locked review and Run 115 trial, recorded the discard plus current-factory continuation, and aligned durable release, loss, Investigation, Workbench, and project documentation.
- 2026-07-31 — Updated Workbench/CLI fixtures for the third current diagnostic disposition, completed browser acceptance and the final full regression boundary, and prepared the exact retained evidence set for commit.

## Completion

Run 114 independently confirms that one additional front-end card is not factory value under the commissioned no-rework flow. The project now retains the exact observation, hypothesis, Candidate review, TRIAL, comparison, discard, and returned-current operating checkpoint. The measured admission delay remains causal evidence, the historical Run-090 boundary remains inspectable, and Workbench advances to the next unsuppressed physical loss without memory evaporation.
