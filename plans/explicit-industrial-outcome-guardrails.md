# Make industrial outcome guardrails explicit

- Status: `completed`
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
- Evaluate guardrails against the locked baseline and proposal without changing evaluator metrics or hiding aggregate score; absolute thresholds remain distinct from current-best score-regression budgets.
- Preserve ordered per-case metric evidence in Benchmark, Design iteration, Candidate review, and immutable artifacts.
- Project the same guardrail labels, incumbent/proposed values, budgets, violations, and decisions through CLI and Studio.
- Author memory-fab limits for the quality, scrap, completion, and delivery outcomes that should remain hard constraints in future cycles.

### Out of scope

- Rewriting Objective score weights or claiming every reported metric is a hard constraint.
- Retroactively invalidating already applied Candidate receipts or migrating historical pre-alpha Design Runs.
- Automatically selecting industrial policy on behalf of a project author.
- Optimizing the current yield loss before the new acceptance boundary is inspectable.

## Acceptance

- [x] Invalid, ambiguous, duplicate, unsupported, or incompletely case-scoped metric guardrails fail strict project loading with stable errors.
- [x] Benchmark, Design, and Candidate decisions retain exact ordered incumbent/proposal metric evidence and reject a score winner that violates one declared boundary.
- [x] CLI and Studio expose the same human-readable and machine-readable guardrail contract, violation, and next action.
- [x] The memory-fab declares intentional hard outcomes for future optimization without rewriting historical evidence, and focused plus full regression passes.

## Work

- [x] Audit the existing Benchmark acceptance, current-best Design evidence, and Candidate base/proposal evaluation boundaries.
- [x] Define the smallest strict metric vocabulary and comparison model that covers real industrial floors without arbitrary object-path evaluation.
- [x] Implement Core schema, hashing, evaluation, immutable evidence, and rejection semantics.
- [x] Add CLI/Studio projections and memory-fab authored guardrails.
- [x] Verify negative, positive, replay, historical, human, and Agent paths; complete the plan.

## Findings and decisions

- 2026-07-24 — `commissioned-release-control` proves the distinction: every case score improves and contracts remain fulfilled, while mixed-quality first-pass completion changes `9/12 → 8/12`.
- 2026-07-24 — The new contract must be explicit and project-authored. Provider heuristics may propose changes but may not invent, waive, or reinterpret hard industrial outcomes.
- 2026-07-24 — Historical receipts remain valid under their recorded contracts; INM is pre-alpha and will not add compatibility aliases or migrations.
- 2026-07-24 — Hard outcomes belong to the locked Benchmark as absolute case-specific thresholds. Current-best score budgets remain the separate relative search policy; providers receive neither authority.
- 2026-07-24 — The initial vocabulary is intentionally finite and typed: contract fulfillment, completed/on-time/pending/scrapped lots, first-pass yield, quality escapes, rework, and Route Q-time violations. Each metric has one natural minimum or maximum direction, and authored thresholds must name concrete Benchmark cases.
- 2026-07-24 — The memory-fab contract freezes six absolute guardrails over five locked cases: contract fulfillment, completed lots, first-pass yield, scrap, zero quality escapes, and complete lot release. The accepted `9/6 EDD` factory passes all 30 thresholds.
- 2026-07-24 — Historical lifecycle tests that intentionally reconstruct pre-commissioning factories remove the optional new contract and relock only their temporary project copy. The live project and all current Candidate/Design decisions remain governed by the new contract; this is test isolation, not a compatibility path.

## Verification

- `bun test packages/inm-core/src/benchmark-outcome-guardrails.test.ts` — 3 pass, including a positive-score candidate rejected with exact physical evidence.
- `bun test packages/inm-core/src/design-program.test.ts --test-name-pattern 'score winner below hard industrial outcomes'` — 1 pass.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'outcome-guarded Candidate'` — 1 pass through preview, apply, and verify with 6/6 guardrails.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — `KEEP`, six of six guardrails passed.
- Browser acceptance at `/memory-fab/experiments/greenfield-dram-design` and `/memory-fab/designs/commissioned-dram-fab` — exact 6/6 outcome cards, 30 threshold contract, and no console errors.
- `bun run test` — 215 tests, 1818 assertions, zero failures, plus eight Ironworks project fixtures.

## Progress log

- 2026-07-24 — Proposed from the completion audit of [[plans/commissioned-release-control]].
- 2026-07-24 — Activated after auditing Benchmark fixed-baseline evaluation, Design current-best evidence, Candidate re-evaluation/apply, and existing metric snapshots.
- 2026-07-24 — Implemented the strict Core contract and ordered evidence, relocked the memory-fab, projected the same result through CLI/Studio/Design, and completed full regression plus browser QA.

## Completion

Shipped one Benchmark-owned absolute industrial-outcome contract shared by Benchmark, Candidate, and Design. Humans now see exact threshold cards in Studio; Agents receive bounded summary evidence and complete Core records from the CLI. The memory-fab's current commissioned state is protected by six guardrails and 30 case thresholds before the next optimization cycle. No compatibility alias or historical artifact migration was added.
