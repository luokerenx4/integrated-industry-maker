# Objective-authoritative analysis boundary

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/operator-workbench]], [[docs/design/fab-capacity-planning]], [[docs/design/blueprint-optimization]], [[docs/design/observation-led-design]], [[docs/ARCHITECTURE]].

## Outcome

Humans and Agents can inspect configured process and power envelopes without mistaking their arbitrary installed maxima for Objective demand, realized loss, or a factory-change recommendation.

## Context

The commissioned memory-fab capacity plan is `READY` with zero gaps, and compatible Run `091-simulate` overdelivers every contract. After all eight realized Fab loss buckets became bounded deferred, Workbench nevertheless promoted `dielectric-stack-lot nominal demand exceeds production by 1.786/min` as the next industrial loss.

That value is not demand. Production analysis gives every qualified operation on a shared Device an equal nominal time share, excludes rework, and subtracts independently installed operation maxima. Re-entrant tracked Routes, identity transitions, batching, exclusive product mixes, and Objective rates make the sign of that local envelope non-authoritative. The rated power row has the same simultaneous-all-devices boundary. Capacity planning already owns Objective-scaled feasibility; compatible simulation already owns realized loss.

Factory replay confirmed the mismatch rather than a dielectric supply choke: the selected Run showed `176%` total contract attainment (`88/50`), all three DRAM products over target, and `burn-in-1` as the visible bottleneck context.

## Scope

### In scope

- Keep configured operation/resource and rated-power envelopes inspectable, but label them descriptive-only.
- Remove material deficit/surplus and rated power deficit conclusions derived only from those envelopes.
- Prevent built-in research from duplicating equipment or generation because of those removed conclusions.
- Let Workbench and Observation end the exhausted realized-loss queue honestly instead of recycling a bounded or nominal pseudo-loss.
- Update Core, CLI, Studio, tests, and current design documentation together.

### Out of scope

- Changing Objective capacity planning, simulation scheduling, or the commissioned Blueprint.
- Inventing a new factory intervention before new causal evidence exists.
- Hiding the eight still-physical bounded losses or claiming they are solved.

## Acceptance

- [x] `inm analyze` still exposes configured resource and rated-power envelopes and states that they are descriptive, not Objective demand.
- [x] No `material-deficit`, `material-surplus`, or simultaneous-rated `power-deficit` diagnostic can enter Workbench, Observation, or built-in research.
- [x] Memory-fab `inm inspect` advances from eight bounded losses to the latest compatible Run, and `inm observe` does not fabricate a new leading diagnostic.
- [x] Genuine Objective capacity gaps and compatible-run Fab losses retain their existing decision authority.
- [x] Core, CLI, Studio, documentation, project fixtures, and the full repository suite pass.

## Work

- [x] Rebind exact selection, capacity plan, compatible Run, bounded dispositions, and current next action.
- [x] Inspect Factory replay and the tracked `dielectric-stack-lot` catalog definition.
- [x] Replace pseudo-diagnostic and research behavior while preserving descriptive envelopes.
- [x] Update Workbench/Observation and cross-surface projections.
- [x] Exercise public memory-fab analyze/plan/inspect/observe behavior and visually confirm Studio.
- [x] Run the full suite and complete the acceptance audit.

## Findings and decisions

- 2026-07-29 — `dielectric-stack-lot` is tracked `LOT · dram-wafer` WIP on a re-entrant Route; independent configured maxima cannot establish its required flow.
- 2026-07-29 — Capacity plan `READY / 0 gaps` and compatible Run overdelivery falsify the current “highest-priority industrial loss” label.
- 2026-07-29 — The installed envelope remains useful for catalog inspection and rough topology orientation, but its sign has no decision authority.
- 2026-07-29 — When every realized loss is bounded and no structural warning remains, Observation must present the run-qualified Factory overview without selecting a disposed loss as if it were active.
- 2026-07-29 — Studio visual verification exposed a stale managed process before it exposed a product regression. Project-discovered restart replaced it with source-current PID `32585`; the same page then showed `WARNINGS 0`, `Inspect the latest matching evidence`, and `CONFIGURED MATERIAL ENVELOPE / DESCRIPTIVE ONLY`.
- 2026-07-29 — Descriptive material differences use neutral color. Power status color follows compatible-run unserved energy when measured; simultaneous rated difference stays neutral.

## Verification

- `bun run check:fast`
- `bun test packages/inm-core/src/observation.test.ts packages/inm-core/src/workbench.test.ts packages/inm-cli/src/commands.test.ts`
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "heuristic strategies use measured"`
- `bun run inm analyze examples/memory-fab --section all --json` — `configuredEnvelope.authority = descriptive-only`; eight info diagnostics; no pseudo-deficit diagnostics.
- `bun run inm plan examples/memory-fab --json` — `ready = true`, `gapCount = 0`.
- `bun run inm inspect examples/memory-fab --section all --json` — eight dispositions retained; next action `run:091-simulate`.
- `bun run inm observe examples/memory-fab --run 091-simulate --json` — `leadingDiagnostic = null`; one run-qualified Factory overview.
- Studio `/memory-fab/analysis` — visually confirmed current next action, zero Analysis warnings, and the descriptive configured-envelope notice.
- `bun run test` — `296` tests, `3,618` expectations, and all `8` Ironworks fixture cases passed.

## Progress log

- 2026-07-29 — Plan created from exact CLI, immutable Run, Factory replay, and Resource catalog evidence.
- 2026-07-29 — Removed envelope-derived diagnostics and proposals, updated shared decision/observation behavior, and confirmed the public human/Agent projections.
- 2026-07-29 — Full repository checkpoint passed and the acceptance audit completed.

## Completion

Configured material and simultaneous-rated power envelopes remain available as neutral, explicitly descriptive topology evidence. Objective capacity planning now exclusively owns static rate adequacy, compatible simulation owns realized loss, and the built-in heuristic cannot buy equipment from envelope signs. The exhausted memory-fab loss queue ends at its latest compatible Run without fabricating a ninth diagnostic. No Blueprint, Scenario, Objective, immutable Run, or bounded disposition changed.
