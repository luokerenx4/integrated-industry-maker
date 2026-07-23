# Trace verified yield loss to defect origins

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/lot-tracking]], [[docs/design/product-routes]], [[docs/design/operator-workbench]], and [[docs/design/design-programs]].

## Outcome

Humans and Agents can follow every ranked verified-yield contributor from an event-backed defect origin through inspection, rework, persistence, scrap, or escape, so the memory-fab optimization loop targets the responsible Process, Device, Route step, or Q-time exposure instead of stopping at a project-level bad-lot count.

## Context

Opportunity-window correction makes `yield-quality` the current run `065-simulate` primary signal: nine of twelve inspected lots pass first inspection, three enter rework, and three are eventually scrapped. The bucket currently exposes no contributors when equipment drift is zero and therefore names only project `dram-wafer`.

The immutable event stream already proves two different mechanisms. Authored layer-two etch excursions introduce critical-dimension, particle-contamination, and latent-electrical defects. Critical dimension is repaired on lot `03`, but its delayed second inspection crosses Q-time and introduces a new particle-contamination defect; particle and latent-electrical defects on lots `08` and `11` persist because the selected rework Process repairs only critical dimension. All three lots are then explicitly scrapped. Collapsing these paths into one count hides both a Process-quality intervention and a queue/service intervention.

## Scope

### In scope

- Group `lot.quality-excursion`, `device.process-drift`, and defect-bearing `lot.queue-time-violation` events into deterministic origin contributors.
- Follow contributor lots and defect classes through later inspection, rework, scrap, and output-profile events without rerunning or mutating the factory.
- Retain exact origin mechanism, Process, Route/step when known, physical Device, defect classes, lot identities, and outcome counts.
- Rank contributors by observed terminal harm, persistence, rework, and introduced evidence without claiming exclusive counterfactual causality.
- Project the same structured contributor contract through workbench diagnostics, CLI text/JSON, Studio, and Design proposal context.

### Out of scope

- Changing fixed Scenario excursions, rework coverage, inspection policy, Blueprint topology, evaluator score, or accepted factory behavior in this attribution change.
- Pretending duplicate defect-origin events are an additive decomposition of lost output.
- Inferring a defect source when no introducing event exists.
- Adding compatibility readers or preserving project-only subject selection in pre-alpha UI expectations.
- Automatically applying an intervention before the corrected evidence is available to the locked Design loop.

## Acceptance

- [x] Run `065-simulate` exposes a leading layer-two etch excursion contributor with three introduced/reworked lots, one repaired lot, two persistent lots, and two quality scraps.
- [x] The same run separately exposes the final-inspection Q-time particle contributor that scraps repaired lot `03`.
- [x] Equipment-drift, authored-excursion, and Q-time-origin fixtures prove exact lot/defect outcome tracing, deterministic grouping, and honest overlap boundaries.
- [x] CLI text, CLI JSON, Studio, workbench next action, and Design provider receive the same contributors without parsing prose or raw NDJSON.
- [x] Existing runs remain hash-compatible and immutable; Core/CLI/Studio tests, project validation, docs, browser acceptance, and full regression pass.

## Work

- [x] Define the shared defect-origin contributor contract and implement event-chain analysis in Core.
- [x] Replace yield project-only attribution with ranked source contributors and exact regression fixtures.
- [x] Add human CLI and Studio contributor projections plus machine-parity tests.
- [x] Update long-lived design documentation and current/historical memory-fab expectations.
- [x] Verify current and quality-stress evidence, browser presentation, and full repository regression.

## Findings and decisions

- 2026-07-23 — Current run `065-simulate` has zero equipment-drift defects; the three initial rejects originate in explicit `etch-cell-layer-2` Scenario excursions, not an unobserved generic yield rate.
- 2026-07-23 — `rework-final-pattern` repairs only `critical-dimension`. It repairs lot `03`; particle contamination on lot `08` and latent electrical damage on lot `11` remain after their one permitted rework.
- 2026-07-23 — Lot `03` waits `80,800` ticks for its second final inspection against a `35,000`-tick limit. That violation introduces particle contamination after its original defect was repaired, and the subsequent inspection scraps it.
- 2026-07-23 — Contributors describe observed origin-to-outcome chains and may overlap if multiple events introduce the same defect into one lot. The bucket caveat remains the non-additivity boundary.
- 2026-07-23 — A contributor retains each lot/defect pair's earliest observed introduction tick rather than one coarse lot timestamp, preventing a later origin from claiming an earlier inspection outcome.
- 2026-07-23 — A Process-only fallback names a Route step only when the Process maps uniquely; same-tick `lot.route-advanced` evidence remains the exact path for re-entrant or shared operations.
- 2026-07-23 — Drift aggregate fields are explicitly named `leadingDriftDeviceLots` and `leadingDriftDeviceDefects`; they no longer imply that the drift Device is necessarily the bucket's leading contributor subject.

## Verification

- `bun run test` — 211 package tests and 1,798 assertions passed; every checked-in demonstration run replayed to its recorded result hash; all eight Ironworks project tests passed.
- `bun run typecheck` — Core, CLI, Studio, and both example TypeScript asset packages passed on the final source state.
- `bun run docs:check` — all 625 documentation double-links resolve.
- `git diff --check` — passed.
- `bun run inm inspect examples/memory-fab` — human output identifies the two exact quality-origin chains in current compatible run `065-simulate`.
- `bun run inm inspect examples/memory-fab --section losses --json` — machine output identifies `etch-l2` plus `dram-front-end` as the leading subjects and retains both contributors' exact lot, defect, and outcome evidence.
- Local quality-stress run `067-simulate` — six authored excursion lots produce four persistent quality scraps while four final-inspection Q-time defects independently produce four scraps, preserving contributor overlap rather than summing it.
- Browser acceptance at `/memory-fab` — Project Overview renders both quality-origin cards with singular/plural-safe evidence labels; `FOLLOW EVIDENCE` opens the route-backed Analysis overlay focused on the exact yield diagnostic.

## Progress log

- 2026-07-23 — Plan activated after opportunity-window correction exposed verified yield as the commissioned memory fab's true next loss but left no actionable contributor below the project aggregate.
- 2026-07-23 — Core, CLI, Studio, workbench, Design-provider expectations, and long-lived documentation now share the same structured quality-origin contributors. Browser acceptance confirmed that `FOLLOW EVIDENCE` opens the focused Analysis overlay while preserving its route-backed deep link.
- 2026-07-23 — Full repository regression, final-state typecheck, docs validation, CLI parity, and browser acceptance passed; plan completed.

## Completion

Verified yield is no longer a project-level dead end. Humans and Agents receive the same ranked defect-origin chains from Core through CLI, Studio, workbench next action, and Design context, while immutable runs and evaluator scoring remain unchanged.
