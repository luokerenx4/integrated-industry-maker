# Pareto-branch Design search

- Status: `proposed`
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

- [ ] A Design Program bounds retained branches, and Program/result identity covers the effective frontier policy.
- [ ] Dominance, tie-breaking, pruning, and branch selection are deterministic and independently verifiable from immutable per-case evidence.
- [ ] A candidate that fails only the leader's case guardrail may be retained as a non-promotable branch, while invalid or fixed-gate-failing candidates cannot enter the frontier.
- [ ] Proposal providers receive one explicit branch-local context; branch history never conflates mutations evaluated from different Blueprints.
- [ ] CLI and Studio show the same branch lineage, leader, pruning reason, and promotion boundary without reconstructing graph state.
- [ ] A real greenfield DRAM run explores the iteration-3 tradeoff branch and records whether it rejoins, remains non-dominated, or is pruned.
- [ ] Core, CLI, Studio, project fixtures, documentation checks, and full regression pass.

## Work

- [ ] Audit provider assumptions, immutable manifest shape, budget accounting, and the current six-candidate score vectors.
- [ ] Define bounded frontier policy, dominance semantics, branch ids, and deterministic selection/pruning.
- [ ] Implement branch-local Core execution and lineage validation without changing promotion authority.
- [ ] Extend the project proposal-provider context and memory-fab strategy only where branch identity requires it.
- [ ] Project and test the branch graph in CLI and Studio.
- [ ] Regenerate real Design evidence, run full regression, and audit acceptance.

## Findings and decisions

- 2026-07-23 — Guardrail failure and Pareto domination are different facts. Greenfield iteration 3 fails replacement policy but is non-dominated by its incumbent because it improves four cases and loses one.
- 2026-07-23 — The frontier must never blur promotion authority: only the single Program-policy-compliant leader may become a Candidate, even when exploratory branches are retained.

## Verification

- Pending.

## Progress log

- 2026-07-23 — Proposed from the first exact positive-aggregate, non-dominated tradeoff rejected by [[plans/current-best-case-guardrails]].

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
