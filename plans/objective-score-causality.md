# Expose objective score causality across Benchmark and Design

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/blueprint-comparison]], [[docs/design/coding-agent-optimization]], [[docs/design/design-programs]], [[docs/design/experiment-workbench]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Every locked Benchmark case and current-best Design decision carries the exact evaluator-owned Objective score breakdown for both compared Blueprints plus a component delta whose sum equals the reported score delta. CLI, Studio, and project-local proposal providers receive the same evidence, so a human or Agent can identify which priced industrial terms cause a KEEP, BRANCH, or REJECT without reverse-engineering Objective weights.

## Context

The current advanced-pattern-recovery branch exposes a real explainability gap. In the lithography-interruption case it:

- completes `11` lots instead of `10`;
- scraps `1` lot instead of `2`;
- preserves the same `7` on-time lots, contracts, delivery value, and hard outcomes;
- reduces mean cycle time `74.834 → 72.658 s` and tardiness `4.027 → 3.411 s`;
- nevertheless regresses the Objective score by `0.429259`.

The cause is deterministic but absent from `BlueprintMetricSnapshot`, Benchmark case JSON, Design current-best evidence, and both workbenches. Manual evaluation of the authored weights gives WIP `-0.531800`, energy `-0.006040`, capital `-0.005000`, cycle time `+0.072546`, and tardiness `+0.041035`; all other components are unchanged. The additional recovered lot stays in the system long enough to increase average WIP but does not become additional delivered product inside the fixed window.

Factory metrics already contain `scoreBreakdown`; the comparison layer drops it. This makes the evaluator correct but its decision causality unnecessarily opaque.

## Scope

### In scope

- Preserve the evaluator's ordered `ScoreBreakdown` in every Blueprint metric snapshot and produce an exact component delta.
- Require component sums to reproduce baseline score, candidate score, and score delta within deterministic tolerance.
- Add leader/candidate component evidence to each Design current-best case and to the proposal-time promotion boundary received by project-local TypeScript strategies.
- Expose score components through Benchmark and Design JSON sections without a second calculation path.
- Add progressive-disclosure score-driver views to the Studio Experiment and Design workbenches, including the exact limiting-case contributors.
- Add compact human CLI score-driver output while keeping structured JSON lossless.
- Regenerate one current memory-fab Design result under the new evidence contract and confirm the advanced-recovery lithography blocker is explained by the exact component deltas above.
- Update focused/full tests and durable design documentation.

### Out of scope

- Changing Objective weights, Benchmark gates, Scenario timing, evaluator formulas, Blueprint, catalog physics, or current Run evidence.
- Rewarding completed or scrapped lots outside the currently authored Objective; the purpose is to expose the existing authority before deciding whether a later intervention or Objective revision is warranted.
- Hiding zero or unfavorable components from machine-readable evidence.
- Compatibility aliases or migration logic for pre-alpha cached Design Runs and review receipts.
- Shared assets or non-TypeScript repository scripts.

## Acceptance

- [x] Core snapshots and deltas expose all Objective components in evaluator order, and their sums exactly reconcile with reported scores.
- [x] Benchmark CLI cases/all JSON and human output expose baseline, candidate, and delta components for each case.
- [x] Design current-best evidence and proposal boundaries expose leader, candidate, and delta components for every case.
- [x] Studio Experiment cases and Design iterations provide accessible progressive-disclosure score drivers sourced from the same Core evidence.
- [x] A fresh memory-fab Design result explains the advanced-recovery lithography regression as WIP-led while leaving its seven hard outcomes, branch decision, Blueprint, and Run unchanged.
- [x] Focused tests, memory-fab public commands, documentation/type checks, full repository regression, and browser acceptance pass.

## Work

- [x] Audit the advanced-recovery blocker against exact case metrics and authored Objective weights.
- [x] Confirm the comparison layer currently drops evaluator-owned `scoreBreakdown`.
- [x] Extend Core comparison, Benchmark, Design decision, and proposal-boundary evidence.
- [x] Project the evidence through CLI and both Studio workbenches.
- [x] Generate current memory-fab evidence and complete the verification/acceptance audit.

## Findings and decisions

- 2026-07-24 — The locked evaluator is internally consistent: `-0.531800 - 0.006040 - 0.005000 + 0.072546 + 0.041035 = -0.429259`.
- 2026-07-24 — The limiting term is average WIP, not quality, completion, on-time service, cycle time, tardiness, or physical capacity. The recovered lot survives longer but its output does not reach an additional paid delivery inside the interruption window.
- 2026-07-24 — Score causality belongs to shared Core evidence. CLI and Studio must project it rather than recomputing Objective formulas independently.
- 2026-07-24 — Score components are normalized from JavaScript `-0` to `0` at the comparison boundary. JSON serialization otherwise changes the value's deep-equality identity and breaks strict immutable Design Run reopen even though the numerical score is unchanged.
- 2026-07-24 — Runtime Studio imports only the score types; its browser-safe label table owns presentation order. Importing the Core runtime constant pulled Node-only modules into the browser bundle.
- 2026-07-24 — Fresh Design result `bb521fa7a617b5d1643761ea18f817825ea1e708f2de9ed79ba031203bdd9626` retains advanced recovery as `BRANCH` and makes the exact WIP-led blocker visible to the provider, CLI, and Studio.

## Verification

- `bun test packages/inm-core/src/benchmark-outcome-guardrails.test.ts --test-name-pattern "advanced recovery exposes"` — 1 pass, 9 assertions.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — 11 pass, 53 assertions.
- `bun test packages/inm-cli/src/commands.test.ts` — 16 pass, 269 assertions.
- `bun test packages/inm-studio/src/server.test.ts` — 3 pass, 113 assertions.
- `bun run inm validate examples/memory-fab --json` — current Blueprint `b62ff5ab7587e1519011b0397513efc865ed8e0d3ba2739c9cb3619312e30438` valid.
- `bun run inm plan examples/memory-fab --json`, `bun run inm analyze examples/memory-fab --json`, and `bun run inm test examples/memory-fab --json` — public project commands pass; project tests 2/2.
- `bun run docs:check`, `bun run typecheck`, and `git diff --check` — pass.
- `bun run test` — 220 pass, 0 fail, 1837 assertions; Ironworks project tests 8/8.
- Browser acceptance on Studio port `4176` — fresh Design result opens as the sole valid current evidence; the limiting-case details expose all 15 leader/candidate/delta rows with WIP `-0.531800`; the Experiment workbench executes and expands the same component table; no console warnings or errors; final route restored to `/memory-fab/factory`.

## Progress log

- 2026-07-24 — Plan created from the current advanced-recovery Pareto blocker and cross-surface evidence audit.
- 2026-07-24 — Implemented shared Core evidence, TypeScript provider contract, CLI projections, and Studio progressive-disclosure tables.
- 2026-07-24 — Regenerated current Design evidence, fixed browser-bundle and negative-zero serialization boundaries found during acceptance, and completed focused/full regression.

## Completion

Objective score causality is now one shared, reconciled evidence contract across Benchmark, Design, project-local TypeScript providers, CLI, and Studio. The current memory-fab blocker is no longer opaque: advanced recovery saves one additional lot but leaves it in WIP rather than converting it to paid delivery inside the fixed interruption window. No Objective, Benchmark gate, Blueprint, catalog physics, or current Run changed.
