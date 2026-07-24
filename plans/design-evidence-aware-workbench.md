# Make the shared Workbench aware of current Design evidence

- Status: `active`
- Updated: `2026-07-24`
- Related design: [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/design/agent-cli-contract]], [[docs/design/operation-workbench]], and [[docs/design/fab-loss-attribution]].

## Outcome

Workbench distinguishes a Design Program that has not been evaluated from one whose exact current inputs already produced promotable, continuable, or exhausted immutable evidence, so humans and Coding Agents receive the same honest next action instead of being sent around a deterministic no-op loop.

## Context

Workbench V5 can discover the current Blueprint's aligned Program and route compatible measured loss into its read-only brief. Current memory-fab Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` then evaluated every eligible intervention, stopped `frontier-exhausted`, retained the unchanged seed, and produced zero promotion operations.

The project Overview still recommends opening the generic Program brief because the snapshot does not inspect Design Run evidence. Re-running the unchanged content-addressed Program only reuses the same result, while an operator must independently notice that the useful next engineering act is to review the exact exhausted evidence and expand or revise the project-local intervention portfolio. That breaks the shared human/AI decision loop at the point where Design has learned “these authored options are exhausted.”

## Scope

### In scope

- Add deterministic, Core-owned currentness and outcome summaries for valid project-local Design Run evidence.
- Distinguish no current evidence, promotable leader, continuable frontier, and exhausted unchanged-seed evidence without using filesystem time or hash order as fake chronology.
- Preserve quarantined invalid evidence and historical/stale runs without allowing either to become current authority.
- Make Workbench priority, exact CLI argv, typed target, Studio route, operation availability, and human summary consume the same state.
- Project the exact current memory-fab exhausted result as evidence that the intervention portfolio—not the immutable evaluator—must change before another productive search.

### Out of scope

- Automatically editing or generating the project-local TypeScript proposal provider.
- Weakening locked Benchmark outcomes, current-best case budgets, or Candidate review/apply guards.
- Inventing counterfactual causal loss quantities or treating idle-time rank as foregone output.
- Adding timestamps, browser-owned run ranking, compatibility readers, or shared Design evidence.

## Acceptance

- [ ] Core deterministically classifies every aligned Program's valid Design evidence against the current engine, Program hash, Benchmark contract, seed, and promotion base.
- [ ] A current promotable or continuable result retains its guarded Candidate or continuation path; an exhausted unchanged-seed result cannot be presented as though another identical run were new work.
- [ ] Invalid, internally valid but stale, and differently targeted runs remain inspectable but cannot become current Workbench authority.
- [ ] CLI and Studio project the same evidence state, exact read-only argv, typed target, and project-qualified deep link without recomputing priority.
- [ ] Current memory-fab Overview names the exhausted result and routes to it; its message makes the intervention-portfolio boundary explicit to both a human and an Agent.
- [ ] Documentation, focused/full tests, project validation, browser verification, Git, and remote verification pass.

## Work

- [ ] Define the current Design evidence identity, deterministic selection, summary, and Workbench V6 target contract.
- [ ] Implement Core evidence discovery, classification, operation availability, and next-action precedence.
- [ ] Project the contract through public CLI and Studio, including exact run deep links and unavailable action states.
- [ ] Update durable design documents, focused tests, current memory-fab evidence, and browser coverage.
- [ ] Complete repository/project verification, plan audit, commit, push, and remote verification.

## Findings and decisions

- 2026-07-24 — Current Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` stopped `frontier-exhausted` after four guarded rejections; its best is iteration zero with zero promotion operations. Workbench V5 nevertheless keeps recommending the generic aligned Program brief.
- 2026-07-24 — Content-addressed Design execution is deterministic, so another invocation with unchanged engine, Program, Benchmark, seed, and promotion base reuses evidence rather than creating a new search opportunity.
- 2026-07-24 — `indexDesignRuns()` already separates strict valid runs from quarantined invalid siblings, but its summaries do not expose enough current-input identity for Workbench classification. Filesystem modification time and lexicographic result-hash order are not industrial authority and will not be introduced.
- 2026-07-24 — After an exhausted unchanged-seed result, the honest safe handoff is the exact read-only run evidence plus an explicit intervention-portfolio boundary. Editing project TypeScript remains a normal Coding Agent engineering task, not a hidden effect of `inm inspect`.

## Verification

- Pending.

## Progress log

- 2026-07-24 — Plan activated immediately after shipping Workbench V5 and auditing its first complete current-factory Design handoff.

## Completion

Pending.
