# Current-best operating-case guardrails

- Status: `active`
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

- [x] A Design Program explicitly declares whether current-best case regressions are unrestricted, uniformly budgeted, or case-specific; the effective policy participates in program and result identity.
- [x] KEEP requires locked-gate acceptance, positive aggregate current-best improvement, and compliance with the declared case guardrails, with each failed condition distinguishable in immutable evidence.
- [x] CLI and Studio expose the same failed case, actual regression, and allowed budget without recomputing policy behavior.
- [x] A real greenfield DRAM rerun demonstrates the selected policy against the observed `facility-interruption` tradeoff and remains replayable.
- [x] Core, CLI, Studio, project fixtures, documentation checks, and full regression pass.

## Work

- [x] Audit current locked gates, Design identity hashing, and iteration-3/downstream score effects before selecting the greenfield policy.
- [x] Define and validate the current-best case guardrail schema and immutable evidence.
- [x] Integrate the policy into KEEP lineage validation, progress, CLI, and Studio.
- [x] Author the greenfield DRAM policy and regenerate its Design evidence.
- [x] Complete cross-surface tests, documentation, full regression, and acceptance audit.

## Findings and decisions

- 2026-07-23 — Fixed-baseline Benchmark gates and evolving-current-best guardrails are separate authorities: the first protects the original industrial contract, while the second governs what the search may trade away after each KEEP.
- 2026-07-23 — The real six-iteration run provides the first concrete policy question: iteration 3 gains aggregate score while losing `3.915879` in the facility-interruption case. No tolerance is assumed until its downstream effects are replayed.
- 2026-07-23 — The authored Design Program is already included in `programHash`, while the Benchmark lock owns only fixed-baseline acceptance. The guardrail therefore belongs in the Program and must also be copied into each immutable run for standalone replay.
- 2026-07-23 — Greenfield and integrated memory-fab Programs will start with uniform zero regression: a KEEP must Pareto-improve or preserve every locked operating case. This is a declared robustness stance rather than an invented numerical risk tolerance; unrestricted and exact case-specific policies remain available for projects that deliberately choose them.
- 2026-07-23 — Strict Pareto preservation changes the search lineage productively. Iteration 3 is rejected despite aggregate `+7.827836` because `facility-interruption` loses `3.915879`; the unchanged incumbent then exposes setup campaign loss and iteration 4 finds an all-case-preserving `+5.990173` improvement.
- 2026-07-23 — A non-positive aggregate remains the primary decision basis even if it also violates case guardrails; the complete evidence still records every violation. This keeps the decision explanation ordered without hiding machine-readable failed conditions.

## Verification

- Core Design Program tests passed 56 assertions, covering required strict schema, unrestricted/uniform/case-specific policies, exact case coverage, zero-regression rejection, deterministic rerun, immutable reopening, and Candidate promotion.
- Focused CLI Design workflow passed 32 assertions, including machine and human projection of `facility-interruption -3.915879` against allowed regression `0.000000`.
- Focused Studio and CLI server projection passed 54 assertions before full regression; the final full suite re-exercised both public surfaces.
- Real six-candidate `greenfield-dram-fab` result `873696e2ed46e12ff8c5fe7cab4129c32646d3201590a8b24d90f8fa00daaebd` retained iteration 4 at `-246.416302`, `+33.754509` versus the locked baseline, with every KEEP preserving all five current-best cases.
- Studio API returned the copied zero-regression policy and exact iteration-3 evidence. The route-backed page showed both the policy and guardrail REJECT reason at 677 px with document width equal to viewport width and no browser warnings or errors.
- `bun run docs:check` resolved 511 documentation links and `bun run typecheck` passed Core, CLI, Studio, and both example asset projects.
- `bun run inm test examples/memory-fab` passed both project fixtures.
- `bun run test` passed 187 tests and 1607 assertions with zero failures, then passed all eight Ironworks project fixtures.

## Progress log

- 2026-07-23 — Proposed from the exact per-case regression newly exposed by [[plans/current-best-decision-evidence]].
- 2026-07-23 — Activated after separating fixed-baseline gates from current-best policy, confirming Program identity coverage, and selecting explicit zero-regression Pareto preservation for the memory-fab north star.
- 2026-07-23 — Implemented three strict policy forms, policy-governed immutable lineage, shared CLI/Studio evidence, and zero-regression memory-fab Programs; regenerated and visually verified the six-candidate Design result before full regression.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
