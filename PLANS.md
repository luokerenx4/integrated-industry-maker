# INM work plans

This file is the repository-level index of planned and completed engineering work. Detailed plans live in `plans/`; long-lived system intent and current invariants live in `docs/design/`.

## Status model

- `proposed`: the outcome is understood, but work has not started.
- `active`: implementation is in progress and this plan is the current coordination record.
- `paused`: work is intentionally stopped and the reason is recorded in the plan.
- `completed`: every acceptance item is satisfied and verification evidence is recorded.
- `superseded`: the plan will not be completed because another linked plan replaced it.

## Active plans

There are no active plans.

## Proposed plans

There are no proposed plans.

## Paused plans

There are no paused plans.

## Completed plans

| Plan | Outcome | Updated |
| --- | --- | --- |
| [[plans/immutable-design-run-continuation]] | Continue a budget-exhausted Design frontier into a new immutable run without re-evaluating or mutating its accepted evidence prefix. | 2026-07-23 |
| [[plans/interruption-aware-campaign-repair]] | Refine a profitable lithography setup campaign against its exact interruption-case blocker without weakening the locked five-case contract. | 2026-07-23 |
| [[plans/frontier-node-exhaustion-scheduling]] | Retire only a proposal-exhausted Pareto node from active scheduling while preserving its evidence and continuing other branches. | 2026-07-23 |
| [[plans/promotion-blocker-guided-branch-repair]] | Expose exact leader-relative promotion blockers before proposal generation and repair the retained memory-fab branch with explicit facility resilience. | 2026-07-23 |
| [[plans/pareto-branch-design-search]] | Retain and explore bounded non-dominated Design branches without weakening the policy-compliant promotable leader. | 2026-07-23 |
| [[plans/current-best-case-guardrails]] | Make current-best per-case regression budgets explicit and enforceable in robust Design decisions across CLI and Studio. | 2026-07-23 |
| [[plans/current-best-decision-evidence]] | Explain every Design KEEP or REJECT with exact aggregate and per-case deltas against the current best on both CLI and Studio. | 2026-07-23 |
| [[plans/batch-formation-design-intervention]] | Let memory-fab Design investigate and benchmark an explicit batch-formation intervention when that loss emerges from an improved fab. | 2026-07-23 |
| [[plans/loss-intervention-portfolio]] | Diversify memory-fab Design across measured loss targets and turn existing maintenance and setup controls into benchmarked Candidates. | 2026-07-23 |
| [[plans/loss-guided-design]] | Make each memory-fab Design iteration explain its measured loss chain and require the project strategy to target one measured loss. | 2026-07-23 |
| [[plans/generative-design-seed]] | Join project-local memory-fab synthesis, locked robust optimization, immutable evidence, and guarded Candidate handoff in one Design Program. | 2026-07-23 |
| [[plans/observable-design-execution]] | Make long-running memory-fab design search observable to humans and Agents while safely reusing locked baseline evaluation. | 2026-07-23 |
| [[plans/memory-fab-design-loop]] | Turn the memory-fab north star from a hand-authored evaluation fixture into a project-local generate, diagnose, search, and review loop. | 2026-07-22 |
| [[plans/decision-loop-convergence]] | Make capacity, flow risk, review state, and the next Candidate decision one shared human/AI operating loop. | 2026-07-22 |
| [[plans/operator-interaction-refinement]] | Turn the project Overview into a decisive operator brief with one contextual next action, progressive disclosure, and predictable route-backed interaction. | 2026-07-22 |
| [[plans/human-ai-workbench]] | Give humans and Coding Agents two task-appropriate projections of one inspectable, hash-pinned industrial operating surface. | 2026-07-22 |
| [[plans/candidate-change-set-workbench]] | Make experiment candidates reviewable and safely applicable as exact Blueprint change sets in both CLI and Studio. | 2026-07-22 |

## Superseded plans

There are no superseded plans.

## Working rules

1. Create a plan for work that crosses packages or public surfaces, changes a domain model, contains meaningful unknowns, or needs more than one implementation step. Small, local fixes do not need ceremonial plans.
2. Copy [[plans/_template]], give the file a stable kebab-case name, and add it to the matching status section here before implementation begins.
3. Keep the plan current while working. Record newly discovered constraints and decisions when they affect the route, and update checkboxes as evidence is produced rather than reconstructing progress at the end.
4. A plan coordinates a change; it does not own lasting system truth. When work changes an invariant or public contract, update the relevant `docs/design/` document in the same change.
5. Mark a plan `completed` only after every acceptance item is satisfied and its verification section contains the commands, tests, or manual checks that prove it. Move its index entry here but keep the plan file as a concise execution record.
6. Mark a plan `superseded` only when it links to the replacement plan and explains why the original outcome is no longer being pursued.
7. Use ISO dates (`YYYY-MM-DD`) and repository-root-relative double-links so `bun run docs:check` can verify every reference.

The planning workflow itself is part of [[docs/design/documentation-system]].
