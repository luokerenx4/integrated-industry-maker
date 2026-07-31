# Run 105 loss requalification

- Status: `proposed`
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

- [ ] The Run-105 `yield-quality` branch has an exact current observation and explicit human/Agent hypothesis or bounded decision.
- [ ] Any evaluated intervention has immutable current locked evidence and an explicit disposition.
- [ ] Workbench, CLI, Studio, and the owning Investigation agree on the branch and next action.
- [ ] Historical evidence remains inspectable but never suppresses a changed current diagnostic.
- [ ] Documentation, tests, and checked-in evidence describe the resulting queue honestly.

## Work

- [ ] Observe the current quality diagnostic in CLI and the run-qualified Factory view.
- [ ] Audit the historical `layer-two-particle-control` intervention against current Run-105 physics.
- [ ] Choose and record the smallest falsifiable current hypothesis or explicit bounded decision.
- [ ] Evaluate/compare when an intervention is justified.
- [ ] Verify the next Workbench handoff and archive this plan.

## Findings and decisions

- 2026-07-31 — Proposed after the inspection branch advanced correctly to `yield-quality`; Objective WIP remains downstream of seven physical branches whose historical Design authority no longer matches the current execution identity.

## Verification

- Pending.

## Progress log

- 2026-07-31 — Follow-up recorded without reusing or inferring any historical disposition.

## Completion

Pending.
