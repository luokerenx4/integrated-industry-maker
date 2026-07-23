# Frontier node exhaustion scheduling

- Status: `active`
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

- [x] A selected node can become search-exhausted while remaining leader or alternative evidence.
- [x] Another active node continues without consuming budget for the exhausted proposal attempt.
- [x] Immutable replay rejects altered exhaustion order, node status, next selection, or stop reason.
- [x] CLI and Studio distinguish retained, promotable, searchable, and exhausted state.
- [x] The greenfield run continues from repaired `candidate-4` after `candidate-3` exhausts its facility repair portfolio.
- [x] Core, CLI, Studio, documentation, and full regression pass.

## Work

- [x] Define frontier membership versus scheduler-state invariants.
- [x] Implement node-local exhaustion and immutable replay.
- [x] Project progress and final status through CLI and Studio.
- [x] Exercise the real memory-fab continuation and run full regression.

## Findings and decisions

- 2026-07-23 — The first successful branch repair proves that non-dominated and still-searchable are not synonyms: the unrepaired parent remains an honest cost/resilience tradeoff after its only eligible repair is used.
- 2026-07-23 — Exhaustion is a scheduler event, not a rejected Candidate. It records the exact node and next queue state, performs no Benchmark simulation, and leaves the global evaluation counter unchanged.
- 2026-07-23 — Final Frontier evidence now owns one retained-node graph plus a separate scheduler projection. A node summary explicitly says `searchable` or `exhausted`; pruning may still remove an exhausted node when a later Candidate dominates it.
- 2026-07-23 — The real seven-candidate greenfield search exhausts `candidate-3` before iteration 5, continues the repaired `candidate-4`, retains then exhausts `candidate-6` before iteration 7, and still evaluates the complete 7/7 budget.

## Verification

- `bun test packages/inm-core/src/design-program.test.ts` passes four tests and 74 assertions, including zero-budget global exhaustion, real 7/7 continuation, deterministic repetition, and altered exhaustion order/node status/next node/stop reason rejection.
- `bun test packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts` passes 16 tests and 301 assertions over Agent progress, human output, final scheduler state, and Studio API parity.
- Real result `ebb1a45fe61db1f5e20924d40d6b48df0933a672be1a834c7f4707352f904f78` evaluates 7/7 candidates, records two zero-budget alternative exhaustions, retains exhausted `candidate-6`, leaves leader `candidate-4` searchable, and reopens through the public CLI.
- Manual in-app Studio verification shows matching searchable/exhausted Frontier cards, the two-entry exhaustion ledger, the correct next node, and no console errors.
- `bun run test` passes 189 tests and 1,644 assertions across documentation, types, Core, CLI, Studio, and the Ironworks public project fixtures.
- `bun run inm test examples/memory-fab` passes the bounded batch-formation and re-entrant DRAM scenarios.
- `bun run docs:check`, `bun run typecheck`, and `git diff --check` pass.

## Progress log

- 2026-07-23 — Proposed from the 4/7 `strategy-exhausted` terminal state of the first successful greenfield branch repair.
- 2026-07-23 — Activated after the promotion-boundary repair contract and its real greenfield evidence were committed to `main`.
- 2026-07-23 — Implemented node-local scheduler retirement, replay validation, CLI/Studio projection, and real 7/7 memory-fab continuation; full regression and completion audit remain.
- 2026-07-23 — Passed the full repository and public memory-fab regressions, reopened the real immutable run through CLI, and visually verified matching Studio evidence.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
