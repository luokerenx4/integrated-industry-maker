# Run 105 loss requalification

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/operator-workbench]], [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], and [[docs/design/fab-loss-attribution]].

## Outcome

Requalify the remaining Run `105-simulate` physical-loss branches under the current `inm-sim/0.92.0` execution contract, beginning with `yield-quality`, so the shared Workbench advances from exact current evidence rather than inheriting historical Design dispositions or jumping prematurely to Objective WIP.

## Context

Investigation `current-inspection-starvation-boundary` now explicitly defers the exact current inspection input-starvation diagnostic. The shared next action correctly advances to `yield-quality` and Program `layer-two-particle-control`.

The other historical Design frontiers remain useful hypothesis history, but their older engine/driver identities no longer authorize current queue suppression. Each branch needs an exact Run-105 observation and a human/Agent judgment: reuse a physically relevant bounded intervention only after current locked evaluation, formulate a distinct hypothesis, or record an explicit targeted decision with a falsifiable reopen boundary.

## Scope

### In scope

- Start from the current `yield-quality` diagnostic and exact `etch-l2` contributor.
- Inspect typed and spatial Run-105 evidence before proposing or dispositioning a branch.
- Reuse historical Design evidence as context only, never current authority.
- Preserve explicit human/Agent hypothesis and judgment for each branch.
- Let exact Workbench identity determine whether the next action remains physical loss or reaches Objective WIP.

### Out of scope

- Bulk-copying old dispositions onto Run `105`.
- Automatically deciding branches from rank, score, or historical verdict.
- Skipping current physical losses to optimize WIP directly.
- Weakening locked Benchmark or identity guards to make old evidence current.

## Acceptance

- [x] The Run-105 `yield-quality` branch has an exact current observation and explicit human/Agent hypothesis or bounded decision.
- [x] Any evaluated intervention has immutable current locked evidence and an explicit disposition.
- [x] Workbench, CLI, Studio, and the owning Investigation agree on the branch and next action.
- [x] Historical evidence remains inspectable but never suppresses a changed current diagnostic.
- [x] Documentation, tests, and checked-in evidence describe the resulting queue honestly.

## Work

- [x] Observe the current quality diagnostic in CLI and the run-qualified Factory view.
- [x] Audit the historical `layer-two-particle-control` intervention against current Run-105 physics.
- [x] Choose and record the smallest falsifiable current hypothesis or explicit bounded decision.
- [x] Evaluate/compare when an intervention is justified.
- [x] Verify the next Workbench handoff and archive this plan.

## Findings and decisions

- 2026-07-31 — Proposed after the inspection branch advanced correctly to `yield-quality`; Objective WIP remains downstream of seven physical branches whose historical Design authority no longer matches the current execution identity.
- 2026-07-31 — Run `105-simulate` completes all twelve lots with `100%` good yield, `83.3%` first-pass yield, two repaired lots, zero scrap, zero escape, and zero lost die output. The exact quality contributor is the fixed `etch-cell-layer-2` excursion on `dram-lot-03` and `dram-lot-08`; current mode control prevents one of three authored defect instances and applies two. This is real rework exposure, not lost terminal memory.
- 2026-07-31 — Spatial observation at `/memory-fab/factory/devices/etch-l2?run=105-simulate` shows the existing `etch-l2` cell at `31.7%` utilization, `164.0 s` waiting for input, zero blocked/unpowered/failed time, twelve complete utility allocations, no drift, and four normal versus eight recovery-mode jobs. The cell has no capacity or local transport symptom that justifies duplicate equipment.
- 2026-07-31 — Historical `layer-two-particle-control` evidence is engine `0.86–0.87`, old Program/Benchmark/seed/promotion identity, and therefore context only. The current strategy still proposes the physically relevant catalogued `particle-suppression` mode, but its one-operation patch changes the recipe while leaving `policy.cadenceControl.normalMode = closed-loop-control`; current compilation requires exactly one configured normal and recovery recipe, so the historical patch shape is no longer a valid current intervention.
- 2026-07-31 — Current hypothesis: use `particle-suppression` only for the cadence controller's normal layer-two jobs, retaining `closed-loop-fast-4-5` as shortage recovery. The smallest valid intervention changes both the configured recipe mode and `cadenceControl.normalMode`. It should reduce exact etch-origin defect instances while charging the `13/10` active-power envelope on normal jobs; delivery, on-time service, capacity readiness, escapes, scrap, WIP, and every locked current-best case must remain non-regressed.
- 2026-07-31 — Investigation `run-105-layer-two-quality` now owns the exact Run-105 observation and hypothesis. Candidate `run-105-normal-particle-suppression` binds the two-operation patch to that immutable hypothesis and passes all seven locked outcome guardrails.
- 2026-07-31 — Exact comparison `105-simulate → 110-candidate-trial-run-105-normal-particle-suppress` raises first-pass yield `83.3% → 91.7%`, prevents `2/3` authored defects instead of `1/3`, removes one rework cycle, shortens mean transport by `0.233 s`, and improves the mixed-quality score by `0.546577`. Output, service, capacity, WIP, cost, area, scrap, and escapes remain unchanged. Three non-target cases pay only `0.001175–0.003525` energy-score regressions while lithography interruption improves by `2.284085`.
- 2026-07-31 — Agent decision `keep-normal-particle-suppression` explicitly accepts that measured tradeoff. The Candidate is applied and verified at Blueprint hash `1e1211d6be36…`; the owning Investigation is current and complete, and the shared Workbench advances to Run 110 `input-starvation` through `inspection-supply-path`.
- 2026-07-31 — Applying a decided Candidate exposed a Candidate-cycle identity bug: the verified current Blueprint hash equals the review's proposed hash rather than its base hash. Review-anchor matching now recognizes that exact verified state, preserving the existing disposition instead of requesting a duplicate decision.

## Verification

- Focused proposal-provider test passes against the Run-105 two-recipe cadence contract.
- Focused Investigation Candidate-cycle test passes before and after exact Candidate application.
- Candidate locked review completed `15/15` cases with `7/7` outcome guardrails passing.
- Immutable Run comparison verdict is `IMPROVED`; Studio spatial replay confirms unchanged layout/capacity and `2/3` in-situ prevention.
- `inm investigate` reports Candidate cycle `completed`, decision state `verified`, and phase `resume-project`.
- `inm inspect` reports current Run 110 evidence and next action `inspection-supply-path`.
- Repository verification passes: 1,397 documentation links, all TypeScript projects, 353 Core/CLI/Studio tests, and all eight Ironworks project tests.

## Progress log

- 2026-07-31 — Follow-up recorded without reusing or inferring any historical disposition.
- 2026-07-31 — Plan activated from the exact Workbench handoff to Run-105 `yield-quality`; beginning with CLI and run-qualified spatial observation before choosing any intervention.
- 2026-07-31 — Completed the required structured and spatial observation. The existing proposal intent remains falsifiable, but its patch must be repaired to the current cadence-control contract before locked evaluation.
- 2026-07-31 — Recorded the observation, hypothesis, exact Candidate review, trial comparison, and explicit KEEP disposition; applied the verified Blueprint and corrected post-apply Candidate-cycle identity.

## Completion

Completed. The Run-105 quality branch is requalified through explicit human/Agent reasoning and exact current evidence. Its accepted intervention is now the selected Blueprint, and the authoritative queue continues from Run 110 rather than historical Design rank.
