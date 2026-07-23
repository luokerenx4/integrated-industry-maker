# Make input-starvation attribution opportunity-window aware

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/operator-workbench]], and [[docs/design/design-programs]].

## Outcome

Humans and Agents investigate only event-backed, potentially avoidable inter-job input gaps in the commissioned memory fab; normal pipeline warm-up, completed-order drain, and separately measured equipment unavailability no longer masquerade as the highest-ranked industrial loss.

## Context

Compatible run `065-simulate` currently ranks input starvation first from `1,617.0` raw Device-seconds across eleven active productive Devices and names `packaging-1`. The run, however, releases a finite twelve-lot campaign over 66 seconds and reaches twelve terminal dispositions before a 240-second Scenario ends. `waitingInputTime` therefore includes every downstream Device's pre-arrival warm-up and post-final-job drain.

The bucket exposes no contributor that can distinguish those boundary periods from a repairable flow gap. Its current score can direct both the workbench next action and the project-local Design proposal provider, so this is an optimization-control defect rather than cosmetic wording.

## Scope

### In scope

- Derive input-starvation opportunity windows from immutable `device.start` / `device.finish` evidence without re-running the factory.
- Count only gaps between completed productive jobs and a later productive start on the same Device.
- Exclude event-backed maintenance/qualification, changeover, failure, power, output-blocking, tooling/facility, campaign, batch, and sleep/wake intervals that already belong to other loss buckets.
- Retain raw input-wait and boundary-idle evidence so the corrected measure is auditable rather than silently discarded.
- Emit ordered Device contributors with jobs, opportunity span, inter-job gap, excluded unavailability, starvation time, utilization, and Process identities.
- Project the same contributor rows through machine JSON, human CLI, Studio, workbench diagnostics, and Design proposal context.

### Out of scope

- Changing simulation state, `FactoryMetrics`, immutable Run result hashes, or the industrial evaluator score.
- Claiming counterfactual recovered output from an observed time gap.
- Treating a Device with only one observed job as starved, or counting time before its first start and after its last finish.
- Adding compatibility aliases or preserving the incorrect ranking for historical UI expectations.
- Automatically applying a Blueprint intervention before the corrected evidence identifies one.

## Acceptance

- [x] Run `065-simulate` no longer ranks the 1,617 Device-seconds of boundary-heavy raw waiting as its primary loss or names packaging from that aggregate.
- [x] The input-starvation bucket reports exact opportunity, excluded-unavailability, inter-job starvation, boundary-wait, and ordered Device-contributor evidence.
- [x] A controlled event fixture proves warm-up/drain, maintenance, changeover, failure, blocking, and single-job Devices do not create false starvation while a real between-job input gap does.
- [x] CLI text, CLI JSON, Studio, workbench next action, and Design provider receive the same corrected profile without parsing prose.
- [x] Current runs remain hash-compatible and immutable; Core/CLI/Studio tests, project validation, documentation checks, and full regression pass.

## Work

- [x] Implement event-backed opportunity-window and unavailable-interval attribution in Core.
- [x] Replace aggregate starvation scoring and add ordered contributors plus regression fixtures.
- [x] Add human CLI and Studio contributor projections with machine parity tests.
- [x] Update long-lived design documentation and current memory-fab expectations.
- [x] Verify current/energy factory evidence, browser presentation, and the full repository regression.

## Findings and decisions

- 2026-07-23 — In run `065-simulate`, raw productive input wait is `1,617,000` ticks. The ten flow Devices contribute `275,000` inter-job gap ticks, of which `94,000` overlap other event-backed unavailability, leaving `181,000` ranked starvation ticks.
- 2026-07-23 — Burn-in's apparent `80,000` raw input-wait ticks contain no input gap between jobs after its `8,000` changeover interval is excluded. Ranking it as underfed would ask the optimizer to repair work that did not occur.
- 2026-07-23 — The correction can be projected from existing immutable events and metrics, so it must not invalidate Run hashes or require re-simulation.
- 2026-07-23 — Utilization remains a contributor-selection weight, not the starvation denominator. The bucket score will be the measured starvation share of summed productive opportunity windows.
- 2026-07-23 — Current run `065-simulate` now ranks `yield-quality → queue-congestion → q-time → input-starvation → maintenance-qualification`. Its input bucket scores `181,000 / 1,133,000 = 0.159753`; `probe-1` leads with `50,000` starvation ticks across nine jobs rather than packaging's campaign-boundary idle.
- 2026-07-23 — Energy run `066-simulate` remains legitimately input-starvation-led at `1,455,500 / 2,605,500 = 0.558626`, showing that the correction removes false boundary dominance without suppressing a real underfeeding case.

## Verification

- `bun test packages/inm-core/src/fab-loss-analysis.test.ts` — controlled opportunity/unavailability fixture passes.
- Focused Core workbench, Design-provider, and CLI contributor-parity tests pass.
- `bun run typecheck` — Core, CLI, Studio, and both example asset packages pass.
- `bun run docs:check` — all 619 documentation links resolve.
- `bun run inm validate examples/memory-fab --json` — valid, 62 Devices and 17 physical links.
- `bun run inm inspect examples/memory-fab --section next-action --json` — exact Core action follows `yield-quality` from immutable run `065-simulate`.
- `bun run inm inspect examples/memory-fab --section losses --json` — exact current opportunity-window evidence and eight ordered contributors.
- Studio `/memory-fab` — current run, corrected chain, five input-gap contributor cards, Q-time contributor, and no console errors verified in the in-app browser.
- `bun run test` — 210 Core/CLI/Studio tests pass with 1,787 assertions; all eight Ironworks example cases pass; checked-in memory-fab Run hashes replay exactly.

## Progress log

- 2026-07-23 — Plan activated after the post-environment north-star audit found the shared next action was driven by finite-campaign boundary idle rather than actionable flow evidence.
- 2026-07-23 — Implemented Core attribution, CLI and Studio projections, controlled fixtures, current/energy regressions, and long-lived documentation; browser acceptance passed against the restarted Studio.

## Completion

Shipped opportunity-window-aware input-starvation attribution across Core, CLI, Studio, compatible-run diagnostics, and Design evidence. The commissioned memory fab now follows verified yield as its highest-ranked current signal while retaining exact ranked input-gap contributors, and the energy experiment remains honestly starvation-led. Existing Run artifacts and execution hashes remain unchanged.
