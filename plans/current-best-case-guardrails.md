# Current-best operating-case guardrails

- Status: `proposed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], and [[docs/design/blueprint-optimization]].

## Outcome

A Design Program can state an explicit robustness budget for regressions against the evolving current best, and every KEEP or REJECT proves both aggregate improvement and compliance with that per-operating-case policy across CLI and Studio.

## Context

Current-best decision evidence makes an important trade visible but does not govern it. Greenfield DRAM iteration 3 improves the aggregate score and is therefore kept, while the `facility-interruption` case regresses by `-3.915879` against the previous best. The locked Benchmark still accepts it because its gates correctly compare against the fixed baseline.

That separation is useful, but an industrial optimizer should not silently decide how much resilience it may trade for average improvement. A project may want strict Pareto preservation, a uniform regression budget, or explicit case-specific tolerances. The policy must be authored and hash-pinned with the Design Program rather than hidden in a strategy or UI.

## Scope

### In scope

- Define one project-authored current-best case guardrail contract without changing fixed-baseline Benchmark semantics.
- Evaluate aggregate improvement and per-case regression budgets as distinct deterministic decision conditions.
- Record exact guardrail results in immutable decision evidence and project concise explanations through CLI and Studio.
- Apply and verify an explicit policy on the greenfield memory-fab Design Program using a regenerated real run.

### Out of scope

- Automatically inventing acceptable industrial risk tolerances.
- Replacing the locked Benchmark, its baseline gates, or its aggregate Objective.
- Maintaining compatibility with pre-contract Design Programs or Design Runs.
- Searching or retaining a multi-candidate Pareto frontier in one Design run.

## Acceptance

- [ ] A Design Program explicitly declares whether current-best case regressions are unrestricted, uniformly budgeted, or case-specific; the effective policy participates in program and result identity.
- [ ] KEEP requires locked-gate acceptance, positive aggregate current-best improvement, and compliance with the declared case guardrails, with each failed condition distinguishable in immutable evidence.
- [ ] CLI and Studio expose the same failed case, actual regression, and allowed budget without recomputing policy behavior.
- [ ] A real greenfield DRAM rerun demonstrates the selected policy against the observed `facility-interruption` tradeoff and remains replayable.
- [ ] Core, CLI, Studio, project fixtures, documentation checks, and full regression pass.

## Work

- [ ] Audit current locked gates, Design identity hashing, and iteration-3/downstream score effects before selecting the greenfield policy.
- [ ] Define and validate the current-best case guardrail schema and immutable evidence.
- [ ] Integrate the policy into KEEP lineage validation, progress, CLI, and Studio.
- [ ] Author the greenfield DRAM policy and regenerate its Design evidence.
- [ ] Complete cross-surface tests, documentation, full regression, and acceptance audit.

## Findings and decisions

- 2026-07-23 — Fixed-baseline Benchmark gates and evolving-current-best guardrails are separate authorities: the first protects the original industrial contract, while the second governs what the search may trade away after each KEEP.
- 2026-07-23 — The real six-iteration run provides the first concrete policy question: iteration 3 gains aggregate score while losing `3.915879` in the facility-interruption case. No tolerance is assumed until its downstream effects are replayed.

## Verification

- Pending.

## Progress log

- 2026-07-23 — Proposed from the exact per-case regression newly exposed by [[plans/current-best-decision-evidence]].

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
