# Frontier node exhaustion scheduling

- Status: `proposed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]] and [[docs/design/agent-cli-contract]].

## Outcome

Exhausting the eligible proposal portfolio for one retained Pareto node retires only that node from active scheduling, while other searchable leaders or alternatives continue under the same global candidate budget and the exhausted node remains visible as honest non-dominated evidence.

## Context

The first promotion-blocker-guided greenfield repair succeeds at iteration 4 and promotes `candidate-4`. Its parent `candidate-3` remains non-dominated because it avoids the redundant plant's ordinary cost while accepting facility risk, so deterministic promotion ordering selects that alternative again. The branch-local provider correctly remembers that its sole facility repair has already been tried and returns exhausted. Current Core treats that local result as run-wide `strategy-exhausted`, stopping at 4/7 candidates even though the new leader has unused ordinary loss interventions.

Frontier membership, promotion authority, and search eligibility are therefore three different states. Removing the exhausted node from the Pareto evidence would be dishonest; repeatedly selecting it or stopping every sibling is equally wrong.

## Scope

### In scope

- Define immutable active/exhausted search state separately from retained frontier membership and leader role.
- Continue deterministic selection after one node-local provider exhaustion without consuming candidate-evaluation budget.
- Record exhaustion order, reason, final node status, and next searchable node in replayable run evidence and progress.
- Project the same state through CLI and Studio, including an honest globally exhausted terminal condition.

### Out of scope

- Parallel proposal generation or candidate evaluation.
- Reopening a completed run for mutation.
- Dropping a non-dominated node merely because its current provider has no remaining proposal.
- Changing Pareto dominance, promotion guardrails, or provider repair semantics.

## Acceptance

- [ ] A selected node can become search-exhausted while remaining leader or alternative evidence.
- [ ] Another active node continues without consuming budget for the exhausted proposal attempt.
- [ ] Immutable replay rejects altered exhaustion order, node status, next selection, or stop reason.
- [ ] CLI and Studio distinguish retained, promotable, searchable, and exhausted state.
- [ ] The greenfield run continues from repaired `candidate-4` after `candidate-3` exhausts its facility repair portfolio.
- [ ] Core, CLI, Studio, documentation, and full regression pass.

## Work

- [ ] Define frontier membership versus scheduler-state invariants.
- [ ] Implement node-local exhaustion and immutable replay.
- [ ] Project progress and final status through CLI and Studio.
- [ ] Exercise the real memory-fab continuation and run full regression.

## Findings and decisions

- 2026-07-23 — The first successful branch repair proves that non-dominated and still-searchable are not synonyms: the unrepaired parent remains an honest cost/resilience tradeoff after its only eligible repair is used.

## Verification

- Pending.

## Progress log

- 2026-07-23 — Proposed from the 4/7 `strategy-exhausted` terminal state of the first successful greenfield branch repair.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
