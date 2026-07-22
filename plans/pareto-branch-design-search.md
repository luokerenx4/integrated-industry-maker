# Pareto-branch Design search

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/blueprint-optimization]], and [[docs/design/agent-cli-contract]].

## Outcome

A bounded Design run can retain and explore deterministic non-dominated alternative Blueprint branches while preserving one policy-compliant promotable leader, so an industrially useful tradeoff is not forgotten merely because it cannot immediately replace the current best.

## Context

Current-best case guardrails correctly reject greenfield iteration 3: it improves aggregate score by `7.827836` and improves four cases, but regresses `facility-interruption` by `3.915879`. The linear search then continues from iteration 2 and finds a safe setup-campaign improvement. That is honest and robust, but iteration 3's Blueprint disappears as an explorable state.

Some industrial improvements are compositional. A branch may temporarily trade one case, then a later maintenance, capacity, or resilience intervention may repair that case and produce a design that dominates the current leader. A single incumbent cannot discover this path, while simply weakening the guardrail would hide rather than manage the risk. The search needs a small explicit frontier, deterministic pruning, and visible lineage.

## Scope

### In scope

- Define a project-authored bound for retained alternative branches and deterministic Pareto dominance/pruning over locked case scores.
- Keep one current policy-compliant leader distinct from non-promotable exploratory branches.
- Let proposal generation target an explicit branch with branch-local Blueprint, driver evidence, and history.
- Record branch creation, continuation, pruning, rejoin, and final leader identity in immutable Design evidence.
- Project the same branch graph and next search choice through CLI and Studio, then exercise it on the greenfield memory-fab tradeoff.

### Out of scope

- Unbounded search, stochastic branch selection, or parallel execution scheduling.
- Allowing a non-guardrail-compliant branch to be promoted directly.
- Changing fixed-baseline Benchmark gates, Objective weights, or current-best guardrail meaning.
- Inventing new Blueprint mutations solely to make the frontier test pass.

## Acceptance

- [x] A Design Program bounds retained branches, and Program/result identity covers the effective frontier policy.
- [x] Dominance, tie-breaking, pruning, and branch selection are deterministic and independently verifiable from immutable per-case evidence.
- [x] A candidate that fails only the leader's case guardrail may be retained as a non-promotable branch, while invalid or fixed-gate-failing candidates cannot enter the frontier.
- [x] Proposal providers receive one explicit branch-local context; branch history never conflates mutations evaluated from different Blueprints.
- [x] CLI and Studio show the same branch lineage, leader, pruning reason, and promotion boundary without reconstructing graph state.
- [x] A real greenfield DRAM run explores the iteration-3 tradeoff branch and records whether it rejoins, remains non-dominated, or is pruned.
- [x] Core, CLI, Studio, project fixtures, documentation checks, and full regression pass.

## Work

- [x] Audit provider assumptions, immutable manifest shape, budget accounting, and the current six-candidate score vectors.
- [x] Define bounded frontier policy, dominance semantics, branch ids, and deterministic selection/pruning.
- [x] Implement branch-local Core execution and lineage validation without changing promotion authority.
- [x] Extend the project proposal-provider context and memory-fab strategy only where branch identity requires it.
- [x] Project and test the branch graph in CLI and Studio.
- [x] Regenerate real Design evidence, run full regression, and audit acceptance.

## Findings and decisions

- 2026-07-23 — Guardrail failure and Pareto domination are different facts. Greenfield iteration 3 fails replacement policy but is non-dominated by its incumbent because it improves four cases and loses one.
- 2026-07-23 — The frontier must never blur promotion authority: only the single Program-policy-compliant leader may become a Candidate, even when exploratory branches are retained.
- 2026-07-23 — A Program owns `maximumAlternativeBranches`; the bound excludes the one leader, participates in Program identity, and may be zero when linear search is intentional.
- 2026-07-23 — Search states are immutable nodes (`seed` or `candidate-N`). Every proposal names one parent node and receives only that node's lineage-local history. Candidate evaluation count remains the one global budget.
- 2026-07-23 — A non-leader candidate may enter the frontier only after fixed Benchmark gates pass, its aggregate score improves on its parent, and no current frontier node Pareto-dominates its locked per-case score vector. Leader promotion still requires the existing aggregate and current-best case-guardrail decision.
- 2026-07-23 — Selection is a deterministic queue. A newly retained alternative is explored next; a rejected parent rotates to the back; after leader promotion, alternatives precede the new leader. Dominated nodes are pruned first, then excess alternatives by aggregate score, worst case delta to the leader, and node id.
- 2026-07-23 — The real six-candidate greenfield run promotes `candidate-5` as the only policy-compliant leader and retains `candidate-6`, descended from the iteration-3 tradeoff, as the one non-promotable alternative after capacity-pruning its parent `candidate-3`.
- 2026-07-23 — Invalid immutable evidence remains fail-closed: both direct reopening and run listing reject a manifest whose deterministic frontier replay disagrees, even if its outer result hash is recomputed.

## Verification

- `bun run inm validate examples/memory-fab` passes and resolves the current project identities.
- Reopening result `199c4f6479594057619baf305eed786854109080ab37e237a3bfa0c5ad5e8cf6` with `inm design --section frontier --json` strictly validates the artifact and returns leader `candidate-5`, alternative `candidate-6`, and selection order `candidate-6`, `candidate-5`.
- `bun test packages/inm-studio/src/server.test.ts` passes with 77 assertions over the shared Design contract.
- `bun test packages/inm-core/src/design-program.test.ts` passes the deterministic double-run, tampered-frontier rejection, and exact Candidate handoff path with 61 assertions.
- `bun run test` passes 187 tests and 1,617 assertions across Core, CLI, Studio, documentation, type checking, and the Ironworks public project fixtures.
- `bun run inm test examples/memory-fab` passes both the bounded batch-formation and re-entrant DRAM project scenarios.
- `bun run typecheck`, `bun run docs:check`, and `git diff --check` pass.
- Manual in-app Studio verification confirms the same leader and alternative cards, two explicit `BRANCH` decisions, all six parent lineages, and no visible error.

## Progress log

- 2026-07-23 — Proposed from the first exact positive-aggregate, non-dominated tradeoff rejected by [[plans/current-best-case-guardrails]].
- 2026-07-23 — Activated after auditing the single-incumbent runner, global provider history, immutable validation path, six-candidate budget, and greenfield score vectors.
- 2026-07-23 — Implemented bounded frontier execution and validation, provider API V4 branch context, immutable lineage evidence, and matching CLI/Studio projections; verified the real greenfield frontier before full regression.
- 2026-07-23 — Completed after deterministic tamper testing, full repository regression, public memory-fab testing, and manual Studio parity verification.

## Completion

Shipped bounded deterministic Pareto exploration in implementation commit `c0f34ff`: one policy-compliant promotable leader, branch-local proposal context, non-dominated alternatives, immutable replay validation, fail-closed artifact loading, and matching CLI/Studio lineage. The real greenfield DRAM run preserves the iteration-3 tradeoff through `candidate-6` while retaining `candidate-5` as the promotion authority. No required follow-up remains in this plan.
