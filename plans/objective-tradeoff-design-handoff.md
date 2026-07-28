# Objective tradeoff design handoff

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/operator-workbench]], [[docs/design/inventory-accounting]], and [[docs/design/observation-led-design]].

## Outcome

When the current realized fab-loss frontier is fully bounded, the shared Workbench must hand the human or Agent the compatible Run's dominant Objective tradeoff and exact contributors instead of falling back to a generic Run link. Memory-fab must expose its WIP score cost and back-end Resource concentration without relabeling necessary inventory as a physical loss or prescribing an automatic optimization.

## Context

Memory-fab Run `091-simulate` has current bounded dispositions for all eight positive realized-loss buckets. The existing next action therefore opens the latest Run even though the Objective score still contains a dominant `-29.8092375` WIP component. Exact inventory accounting already shows that `packaged-dram-device` and `known-good-dram-die` contain about 96% of average scored WIP, but neither CLI nor Studio connects those values to the Objective score or carries them into the observation handoff.

This is both an industrial and an experience gap: the operator has finished one evidence frontier but is not told what measured tradeoff is worth investigating next. WIP must remain an Objective accounting signal rather than a ninth causal fab-loss bucket because some inventory is necessary and its avoidable portion requires spatial and typed interpretation by a human or reasoning Agent.

## Scope

### In scope

- Add a Core-owned, compatible-Run Objective evidence projection with exact score components and WIP Resource contributors.
- Select the dominant negative Objective component as a typed review target only after capacity, Candidate, missing/incompatible evidence, and active diagnostics have been handled.
- Project the same evidence and next action through `inm inspect`, Studio Overview, and `inm observe`.
- Bind the WIP observation handoff to the exact Factory replay and top Resource catalog views while retaining human/Agent design authority.

### Out of scope

- Treating WIP or any score component as a causal fab-loss bucket.
- Automatically choosing or applying a Blueprint intervention.
- Changing Objective weights, contract value, overproduction policy, or the current memory-fab Blueprint in this framework slice.
- Optimizing Studio process/port lifecycle again; that completed work remains governed by [[docs/design/development-operations]].

## Acceptance

- [x] A compatible Workbench snapshot reconciles the complete Objective score breakdown to the immutable Run score and ranks negative components deterministically.
- [x] WIP evidence reports the exact Objective weight, score contribution, and per-Resource average/peak/final inventory plus each Resource's exact WIP score contribution.
- [x] After all current memory-fab fab-loss diagnostics are bounded, Core recommends reviewing WIP exposure rather than generically opening the Run; earlier blockers and active diagnostics retain priority.
- [x] CLI JSON/human output, Studio Overview, and the observation brief consume the same Core evidence without recomputation or causal-loss wording.
- [x] Observation remains bound to `091-simulate`, keeps `leadingDiagnostic = null`, and adds exact WIP tradeoff views for Factory plus the leading Resource definitions.
- [x] Focused tests, full `bun run test`, public `inm inspect`/`inm observe`, and a browser Factory replay verify the result.

## Work

- [x] Define and construct the Objective evidence and typed next-action contract in Core.
- [x] Extend the observation brief with a separate Objective tradeoff focus and Resource-qualified views.
- [x] Update CLI and Studio projections with score/contributor context and explicit non-causal language.
- [x] Update design/CLI documentation and executable expectations for the replaced Workbench contract.
- [x] Run the exact public and visual verification loop, then complete the acceptance audit.

## Findings and decisions

- 2026-07-29 — Run `091-simulate` scores `42.826...`; WIP contributes `-29.8092375`, larger in magnitude than build cost, area, cycle time, energy, rework, or changeovers.
- 2026-07-29 — `packaged-dram-device` averages `10.1526` items and `known-good-dram-die` averages `8.9929`; together they hold about 96% of the Objective-scored WIP.
- 2026-07-29 — The projection is named an Objective tradeoff, not a fab loss. Exact ranking is evidence for subjective design, not proof that the whole component is avoidable.
- 2026-07-29 — Above-demand delivery remains valued and is not treated as a defect; any later WIP intervention must preserve contract service, output value, and quality.
- 2026-07-29 — Workbench V11 ranks all exact score components but only creates the Objective handoff after capacity, review, evidence freshness, and active diagnostic work. Observation V2 keeps this focus separate from `leadingDiagnostic`.
- 2026-07-29 — The typed Objective target is generic across score components; WIP additionally carries Resource subjects because exact contributor accounting exists. Other components are not given invented causal subjects.

## Verification

- `bun run check:fast` passed documentation links, all TypeScript projects, and 34 short unit tests.
- Focused Core and CLI tests passed after replacing Workbench V10/Observation V1 expectations.
- `inm inspect examples/memory-fab --section objective --json` returned WIP `-29.8092375` with packaged-device and known-good-die contributors.
- `inm observe examples/memory-fab --run 091-simulate --json` returned `leadingDiagnostic: null`, the separate WIP tradeoff, and exact Factory plus two Resource routes.
- Source-current Studio restarted on managed port `4176`; browser verified the Overview recommendation, click-through to `/memory-fab/factory?run=091-simulate`, visible non-causal WIP brief, and the project-local `packaged-dram-device` Catalog dialog.
- Full `bun run test` passed: 296 tests, 3,419 expectations, and all 8 Ironworks fixtures.

## Progress log

- 2026-07-29 — Plan created after auditing the compatible Run, score decomposition, inventory accounting, bounded loss frontier, CLI, Studio, and observation contracts.
- 2026-07-29 — Core/CLI/Studio implementation, documentation, public command checks, and browser interaction verification completed; full repository checkpoint pending.
- 2026-07-29 — Full repository checkpoint passed and every acceptance item was audited.

## Completion

Workbench V11 now carries exact compatible-Run Objective evidence and advances the exhausted memory-fab loss frontier to the dominant WIP tradeoff. Observation V2 keeps that evidence separate from causal diagnostics and binds the Factory plus leading project-local Resource views. CLI and Studio expose the same score and contributor contract, with above-demand value and human/Agent design authority unchanged.
