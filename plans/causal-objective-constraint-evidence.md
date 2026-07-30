# Causal Objective constraint evidence

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/blueprint-comparison]], [[docs/design/coding-agent-optimization]], [[docs/design/experiment-workbench]], [[docs/design/agent-cli-contract]]

## Outcome

Turn every Objective constraint penalty in a Benchmark or Candidate comparison into exact evaluator-owned evidence that a human or Agent can read, compare, and navigate without reverse-engineering a million-point score component or parsing an error sentence.

## Context

The Investigation-sourced `metrology-low-power-standby-sourced` Candidate exposes the current failure clearly. Its proposed factory receives `-1,000,000` in all five locked and current-factory cases, while the useful cause is only available inside `infeasibleReason`: build cost is `230,150` against an Objective maximum of `230,000`. The same string also mixes capacity-style constraints and delivery-contract fulfillment gates.

The fixed penalty remains valid evaluator policy. The missing product behavior is causal evidence: stable constraint identity, industrial direction, measured value, threshold, signed deficit, pass/fail state, and per-case current/proposed comparison. This is evidence for a human/Agent design decision, not authority to generate or apply a repair.

## Scope

### In scope

- Replace the evaluator's sentence-only constraint result with a closed typed Objective-constraint evidence vocabulary.
- Preserve exact ordered violation evidence in Blueprint metric snapshots and therefore Benchmark/Candidate results and retained review receipts.
- Project current/proposed constraint state through CLI JSON/human output and the Studio Candidate workbench.
- Give each Candidate case a stable workbench anchor so the exact violation can be reopened without pretending an ephemeral evaluation is an immutable Factory Run.
- Regenerate the affected memory-fab Candidate evidence and record the real `230,150 / 230,000` capital overrun.

### Out of scope

- Changing the fixed constraint penalty or the authored memory-fab limits.
- Automatically suggesting, generating, ranking, or applying a repair.
- Converting ephemeral Benchmark/Candidate evaluations into immutable simulation Runs.
- Adding compatibility readers, string parsing, migrations, or aliases for the pre-alpha metric format.

## Acceptance

- [x] Core reports every authored maximum, minimum-production, and minimum-contract-fulfillment constraint as typed ordered evidence with id, label, metric, operator, actual value, threshold, deficit, and pass state.
- [x] Benchmark and Candidate current/proposed cases retain the evidence; score penalties still reconcile exactly and verdict authority does not change.
- [x] `inm candidate` human and JSON output and Studio show the same exact failing constraints, including current-to-proposed state and stable case anchors.
- [x] The memory-fab standby Candidate explicitly reports build cost `230,150`, maximum `230,000`, and excess `150` in all relevant proposed cases.
- [x] Focused tests, the public memory-fab Candidate loop, Studio visual inspection, and `bun run test` pass.

## Work

- [x] Audit evaluator scoring, Blueprint snapshots, Candidate receipts, CLI rendering, Studio projection, and the real memory-fab failure.
- [x] Define and populate typed Objective constraint evidence in Core, removing the sentence-only authority.
- [x] Carry exact constraint comparison through Benchmark/Candidate and add focused Core/CLI/Studio coverage.
- [x] Render concise human output and a stable anchored Studio constraint panel.
- [x] Regenerate real memory-fab evidence and update design/CLI documentation.
- [x] Run public-loop, visual, focused, and full verification; audit every acceptance item.

## Findings and decisions

- 2026-07-30 — `metrology-low-power-standby-sourced` does not fail an opaque dynamic condition: proposed build cost is `230,150` against `maxBuildCost: 230,000`; occupied area remains `285 / 350`. The exact `150` overrun is currently hidden behind a uniform `-1,000,000`.
- 2026-07-30 — Candidate evaluations are not immutable Factory Runs. Navigation will therefore target a stable Candidate workbench case anchor, not fabricate a `run` query for evidence that has no retained event stream.
- 2026-07-30 — Constraint evidence is evaluator output and belongs in the metric snapshot/receipt. Pre-alpha evidence will be regenerated directly; no compatibility projection from `infeasibleReason` will be added.
- 2026-07-30 — The penalty remains binary and Objective-owned. This plan improves causality and comparison only; it must not become an automatic repair heuristic.
- 2026-07-30 — Baseline evaluation cache projection is version `2`; a structurally valid pre-evidence snapshot must not silently omit Objective constraints.
- 2026-07-30 — Adding evaluator-owned metric evidence changes deterministic result identity without changing physical events. Checked-in Runs `021-simulate`, `097-simulate`, and `098-simulate` were replayed from their exact stored Blueprint and seed, while Investigation and sourced-Candidate hashes were regenerated as one strict evidence chain.

## Verification

- `bun test --max-concurrency=1 packages/inm-core/src/investigation.test.ts packages/inm-core/src/inm-core.test.ts --test-name-pattern 'Investigation|every current-engine demonstration run'` — `3` focused evidence-chain and Run-replay tests passed.
- `bun scripts/regenerate-current-run-evidence.ts` followed by `bun scripts/regenerate-candidate-constraint-evidence.ts examples/memory-fab` — regenerated exact Run/Candidate/Investigation evidence; a second invocation produced an identical binary diff.
- `bun run check:fast` — documentation links, every TypeScript project, and the short unit suite passed.
- `bun run inm validate examples/memory-fab` — the self-contained memory-fab project validated.
- `bun run inm candidate examples/memory-fab --candidate metrology-low-power-standby-sourced --review --json --progress off` plus flagless inspection of all retained Candidate receipts — fresh evaluation matched retained evidence and every receipt reopened in its expected state.
- `bun run inm investigate examples/memory-fab --investigation inspection-starvation-next-step --json` — the regenerated Investigation chain inspected as current.
- Studio route `/memory-fab/experiments/greenfield-dram-design/candidates/metrology-low-power-standby-sourced#candidate-current-constraints-steady-production` — visually verified the stable deep link, exact `229,950 → 230,150 ≤ 230,000` comparison, FAIL state, and `150` deficit without an error surface.
- `bun run test` — `324` tests and `3,566` assertions passed across Core, CLI, and Studio; all `8` public Ironworks project fixtures passed.

## Progress log

- 2026-07-30 — Plan created after reproducing the real memory-fab Candidate penalty and identifying its exact capital constraint cause.
- 2026-07-30 — Shipped typed evaluator evidence through Benchmark/Candidate snapshots, human and JSON CLI output, anchored Studio comparison, retained receipts, deterministic Run evidence, and the complete sourced Investigation chain.

## Completion

Objective constraint failure is now a first-class causal fact rather than a score inference or sentence-parsing exercise. Humans and Agents see the same exact ordered constraints, current/proposed transition, threshold, and deficit across Core, CLI, Studio, retained review receipts, and replayed Run evidence. Automatic repair and penalty-policy changes remain intentionally outside this plan.
