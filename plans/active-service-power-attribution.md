# Active-service power attribution

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/power]], [[docs/design/fab-loss-attribution]], [[docs/design/operator-workbench]]

## Outcome

Make power-interruption loss identify production service that was actually delayed by lost power while retaining standby shedding as exact operating context, so humans and Agents continue memory-fab design from a causally useful target instead of spending capital on idle infrastructure.

## Context

Run 114 currently reports `621,287` Device-ticks without power and ranks the substrate-receiving loader and unloader first at `165,377` ticks each. Both Devices have zero active-job and zero transport-shortage events; their connection still delivers `96/96` units with no blocking. The current fab-loss bucket therefore turns harmless standby load shedding into the leading design handoff.

The same immutable Run contains `96,950` ticks of measured active transport-service interruption. That evidence should lead the loss ranking, while the remaining `524,337` standby ticks remain visible for grid-operating context and future resilience judgment.

## Scope

### In scope

- Partition each Device's exact unpowered duration into active job interruption, active transport interruption, and standby/context duration.
- Rank and score `power-interruption` by active service interruption rather than total unpowered duration.
- Preserve total and standby duration in Core evidence and expose the distinction consistently through CLI, Studio, documentation, and tests.
- Requalify the current memory-fab Workbench handoff and project-local power Design Program against the corrected causal identity.
- Carry one bounded, human/Agent-authored Run 114 power hypothesis through current evidence and an explicit decision if the corrected evidence supports an intervention.

### Out of scope

- Autonomous factory generation, RL, or automatic selection of a preferred factory design.
- Hiding standby power shedding or treating it as universally harmless.
- Backward-compatible parsing or migration of pre-alpha fab-loss evidence.
- Redesigning grid dispatch, storage, or generator physics without new causal evidence.

## Acceptance

- [x] Power evidence conserves every Device's total unpowered duration as active-job plus active-transport plus standby/context duration, including open intervals at the Run boundary.
- [x] Run 114 reports `96,950` active service-interruption ticks and `524,337` standby/context ticks; the Probe-to-packaging unloader leads at `43,600` active transport ticks, while both substrate endpoints remain visible with zero service interruption.
- [x] Workbench loss score, target metric, causal identity, summaries, and next action use active service interruption rather than standby shedding.
- [x] CLI and Studio present the same service-versus-standby evidence and preserve exact source links into the factory.
- [x] The current shipping power Design Program rejects obsolete total-unpowered evidence and binds to the corrected Run 114 target.
- [x] One bounded Run 114 hypothesis is either evaluated and explicitly kept/discarded/deferred, or the corrected evidence records why no intervention is currently justified.
- [x] Core, CLI, Studio, project, documentation, and full repository verification pass.

## Work

- [x] Observe the current Run 114 power and affected transport paths in the Factory replay and retain the causal baseline.
- [x] Implement exact active-service interval attribution and update the fab-loss contract/version.
- [x] Update Workbench, CLI, Studio, tests, and lasting design documentation.
- [x] Rebind the memory-fab shipping power Program to current exact evidence.
- [x] Run and disposition one bounded hypothesis when justified by the corrected service evidence.
- [x] Audit verification, mark the plan complete, commit, and push the checkpoint.

## Findings and decisions

- 2026-07-31 — Total unpowered duration is useful grid context but not sufficient realized factory loss. Only intervals that overlap an active Process job or active transport service contribute to this loss bucket.
- 2026-07-31 — Standby shedding remains first-class evidence rather than being deleted; the semantic correction changes ranking and action authority, not the underlying Run record.
- 2026-07-31 — Run 114's two leading total-duration contributors are idle substrate endpoints with intact `96/96` delivery, so the obsolete `unpoweredTicks` target must not be requalified by exact-number coincidence.
- 2026-07-31 — Browser verification confirms the substrate lane has `96/96` delivery, zero blocked item-ticks, and zero endpoint-power blocking; Probe-to-packaging has `96/96` delivery, `118,200` blocked item-ticks, and `8,200` endpoint-power ticks.
- 2026-07-31 — Fab-loss V11 makes power rank seventh (`0.006515`) behind setup and maintenance; Workbench correctly advances to `burn-in-changeover-convergence` instead of preserving the obsolete power handoff.
- 2026-07-31 — Design Run `ca81059567f32d8d929df3c0ad6cc1b427579f9a749597467ddb322820cdf427` tests P1 on the five observed service-bearing endpoints. The target improves `43,600 → 600` ticks, but aggregate service interruption only improves `96,950 → 82,434`, all five cases regress, and the exact decision is `REJECT / frontier-exhausted`.

## Verification

- `bun run test` — 1,469 documentation links, all TypeScript projects, 359 Core/CLI/Studio tests with 4,512 expectations, and all eight Ironworks project fixtures passed.
- `bun run inm design examples/memory-fab --program shipping-power-convergence --run --progress human --json` — retained exact Design Run `ca81059567f32d8d929df3c0ad6cc1b427579f9a749597467ddb322820cdf427`; one Candidate evaluated, exact target improved, all five locked cases regressed, decision `REJECT`, stop `frontier-exhausted`.
- `bun run inm inspect examples/memory-fab --section all --json` — Fab-loss V11 chain ends `setup-campaign → maintenance-qualification → power-interruption`; power evidence is `96,950` service + `524,337` standby = `621,287` total and next action is `burn-in-changeover-convergence`.
- In-app Studio at `/memory-fab/analysis` — visually verified the active-service/standby contributor rows, Probe-to-packaging leading subject, and Burn-in next action.

## Progress log

- 2026-07-31 — Plan created from exact Run 114 power events and connection outcomes.
- 2026-07-31 — Core, CLI, and Studio now expose the conserved active-service/standby partition; Studio visually verified the corrected leading endpoint and current next action.
- 2026-07-31 — Capital-neutral shipping priority hypothesis evaluated and rejected; selected Blueprint remains unchanged.

## Completion

Fab-loss V11 now preserves total grid-denial evidence while giving action authority only to measured interruption of active jobs or transport service. Run 114 no longer routes humans or Agents toward idle substrate endpoints; the exact capital-neutral priority hypothesis is retained as rejected evidence, the commissioned Blueprint remains unchanged, and the shared queue advances to the higher-ranked Burn-in setup question.
