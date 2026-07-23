# Interruption-aware campaign repair

- Status: `proposed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/equipment-changeover]], and [[docs/design/fab-loss-attribution]].

## Outcome

When a lithography setup-campaign alternative improves ordinary memory-fab operation but narrowly regresses the locked lithography-interruption case, Design can propose and robustly evaluate an explicit campaign-policy refinement against that exact blocker rather than exhausting the branch.

## Context

The first complete seven-candidate greenfield run retains `candidate-6`, which adds the authored `minimumReadyLots: 3` / `maximumHoldTicks: 12000` lithography campaign. Relative to leader `candidate-4`, it improves aggregate score by `0.455784`, steady production and mixed quality by `0.348263` each, quality excursion by `0.290519`, and facility interruption by `1.619328`. Its only blocker is a `0.054667` regression in `lithography-interruption` under the unchanged zero-regression guardrail.

The branch then honestly becomes search-exhausted because the current project portfolio has no proposal annotated for that case. The project already owns setup-campaign physics, exact policy controls, a focused campaign research grid, interruption Scenarios, and immutable promotion-boundary evidence. The next industrial question is therefore whether a less aggressive ready-lot or hold threshold preserves the ordinary gain while bounding interruption exposure—not whether to relax the evaluator.

## Scope

### In scope

- Use the existing focused campaign search to identify a small deterministic refinement portfolio around the retained `3 / 12000` policy.
- Let the project proposal provider recognize an existing campaign policy and declare `addressedCase: lithography-interruption` for an eligible repair.
- Evaluate the repair through the unchanged locked five-case Benchmark and record promotion, continued branch retention, or rejection.
- Preserve matching Core, CLI, and Studio blocker/repair evidence in a new real greenfield Design Run.

### Out of scope

- Relaxing the zero-regression guardrail or changing interruption timing, Objective weights, equipment physics, or Benchmark locks.
- Adding a second lithography bay or redesigning physical material topology before policy refinement is measured.
- Generic automated parameter optimization across every Blueprint field.
- Reactivating nodes that were already exhausted under an earlier leader boundary.

## Acceptance

- [ ] Focused evidence explains which campaign thresholds are defensible repair candidates and why.
- [ ] A blocked campaign alternative selects a deterministic repair naming the exact current `lithography-interruption` case.
- [ ] The repair consumes one ordinary Candidate budget and the unchanged Benchmark decides its result.
- [ ] CLI and Studio expose the before-blocker, repair target, after-decision, and resulting scheduler state consistently.
- [ ] A real greenfield run records the campaign repair outcome without changing any evaluator-owned input.
- [ ] Provider, Core, CLI, Studio, documentation, and full regression pass.

## Work

- [ ] Audit the campaign research grid and the retained alternative's five-case metrics.
- [ ] Add the bounded project-local campaign repair portfolio and provider selection rule.
- [ ] Update deterministic run expectations plus CLI/Studio evidence tests.
- [ ] Generate real memory-fab evidence, run full regression, and audit completion.

## Findings and decisions

- 2026-07-23 — The retained campaign is already profitable in aggregate and in four locked cases; its single `-0.054667` interruption regression is an exact refinement boundary, not justification for weakening the Program guardrail.
- 2026-07-23 — Policy refinement precedes redundant equipment in this plan because it uses existing industrial controls and can be rejected cheaply by the unchanged Benchmark before topology expansion is considered.

## Verification

- Pending.

## Progress log

- 2026-07-23 — Proposed from `candidate-6` in Design Run `ebb1a45fe61db1f5e20924d40d6b48df0933a672be1a834c7f4707352f904f78` after node-local exhaustion scheduling exposed the next exact blocker.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
