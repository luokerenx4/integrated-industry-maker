# Make industrial outcome guardrails explicit

- Status: `proposed`
- Updated: `2026-07-24`
- Related design: [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], [[docs/design/fab-loss-attribution]]

## Outcome

Let a project declare case-scoped, evaluator-owned hard limits for industrial outcome metrics so an aggregate score improvement cannot silently cross a required quality, scrap, service, or completion boundary; Candidate, Design, CLI, and Studio must all explain the same exact pass/fail evidence.

## Context

The memory-fab `9/6 EDD` release controller validly improves every locked case score and preserves all three delivery contracts. In the default mixed-quality case it also lowers queue and release delay, but its changed lot order moves first-pass completion from `9/12` to `8/12` and scrap from three to four lots. The existing `currentBestGuardrail` is therefore working as authored: it limits per-case score regression, not every metric inside the score.

That behavior is a legitimate economic trade when the project permits it, but “zero regression” is too easy for a human or Agent to misread as “no physical KPI regressed.” Industrial optimization needs a separate explicit contract for non-negotiable outcomes instead of relying on prose, an implicit score weight, or provider discretion.

## Scope

### In scope

- Define a strict, hashed, case-scoped metric-guardrail contract with explicit metric, comparison direction, and allowed boundary.
- Evaluate guardrails against the relevant incumbent and proposal without changing evaluator metrics or hiding aggregate score.
- Preserve ordered per-case metric evidence in Benchmark, Design iteration, Candidate review, and immutable artifacts.
- Project the same guardrail labels, incumbent/proposed values, budgets, violations, and decisions through CLI and Studio.
- Author memory-fab limits for the quality, scrap, completion, and delivery outcomes that should remain hard constraints in future cycles.

### Out of scope

- Rewriting Objective score weights or claiming every reported metric is a hard constraint.
- Retroactively invalidating already applied Candidate receipts or migrating historical pre-alpha Design Runs.
- Automatically selecting industrial policy on behalf of a project author.
- Optimizing the current yield loss before the new acceptance boundary is inspectable.

## Acceptance

- [ ] Invalid, ambiguous, duplicate, unsupported, or incompletely case-scoped metric guardrails fail strict project loading with stable errors.
- [ ] Benchmark, Design, and Candidate decisions retain exact ordered incumbent/proposal metric evidence and reject a score winner that violates one declared boundary.
- [ ] CLI and Studio expose the same human-readable and machine-readable guardrail contract, violation, and next action.
- [ ] The memory-fab declares intentional hard outcomes for future optimization without rewriting historical evidence, and focused plus full regression passes.

## Work

- [ ] Audit the existing Benchmark acceptance, current-best Design evidence, and Candidate base/proposal evaluation boundaries.
- [ ] Define the smallest strict metric vocabulary and comparison model that covers real industrial floors without arbitrary object-path evaluation.
- [ ] Implement Core schema, hashing, evaluation, immutable evidence, and rejection semantics.
- [ ] Add CLI/Studio projections and memory-fab authored guardrails.
- [ ] Verify negative, positive, replay, historical, human, and Agent paths; complete the plan.

## Findings and decisions

- 2026-07-24 — `commissioned-release-control` proves the distinction: every case score improves and contracts remain fulfilled, while mixed-quality first-pass completion changes `9/12 → 8/12`.
- 2026-07-24 — The new contract must be explicit and project-authored. Provider heuristics may propose changes but may not invent, waive, or reinterpret hard industrial outcomes.
- 2026-07-24 — Historical receipts remain valid under their recorded contracts; INM is pre-alpha and will not add compatibility aliases or migrations.

## Verification

- Pending.

## Progress log

- 2026-07-24 — Proposed from the completion audit of [[plans/commissioned-release-control]].

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
