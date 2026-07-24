# Commission in-situ quality control

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/quality-flow]], [[docs/design/production-modes]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], and [[docs/design/experiment-workbench]].

## Outcome

The exact commissioned memory fab can buy and configure a physically costed production mode that prevents named fixed quality-excursion defects during layer-two etch, while humans and Coding Agents can audit the authored challenge, prevented defects, residual defects, equipment mode, economic trade, and locked commissioning decision from the same evidence.

## Context

Compatible run `073-simulate` ranks `yield-quality` first. The fixed production Scenario applies critical-dimension, particle-contamination, and latent-electrical excursions to three named lots at `etch-cell-layer-2`. Advanced recovery repairs the first two classes, but latent electrical damage persists; the run records `9/12` first-pass lots, three reworks, one scrap, zero escapes, and 88 delivered devices.

Current quality physics supports detection and repair only after defects exist. An optimizer can choose deeper inspection or richer rework, but it cannot purchase fault detection, endpoint control, chamber matching, or another explicit in-process prevention capability. Adding an alternate Process id would also evade the Process-scoped Scenario challenge instead of solving it. The fixed excursion must remain evaluator-owned and visible even when a Blueprint-selected mode prevents part of its physical consequence.

## Scope

### In scope

- Let a Device production mode declare exact defect classes it prevents for fixed Scenario excursions completed in that mode.
- Preserve every authored excursion and record applied versus prevented defect classes as immutable events and metrics.
- Project prevention capability and measured prevention through analysis, comparison/report evidence, CLI, Workbench loss attribution, and Studio Device inspection.
- Add a self-contained, higher-cost closed-loop plasma-etch Device and evaluate one exact layer-two recipe-mode intervention against the locked five-case memory-fab Benchmark.
- Commission only a reviewed zero-regression winner and regenerate one compatible current run.

### Out of scope

- Editing, weakening, or deleting Scenario quality excursions.
- Random yield, probabilistic defect rates, statistical process-control estimation, defect severity, or proprietary semiconductor process claims.
- Letting Process renaming avoid a Route- or Scenario-owned quality challenge.
- Shared assets, implicit project-id behavior, or backward-compatible mode readers.

## Acceptance

- [x] Schema/compiler tests reject duplicate or malformed prevention declarations and expose the active contract.
- [x] A fixed excursion remains visibly authored while the selected mode deterministically partitions its defect classes into prevented and applied sets.
- [x] Immutable events, metrics, loss attribution, reports/comparisons, CLI, Workbench, and Studio agree on prevention capability and outcome.
- [x] The memory-fab intervention is explicitly costed and its five locked cases decide KEEP/BRANCH/REJECT without changing evaluator inputs.
- [x] Only a reviewed zero-regression winner may update `generated-dram-fab`; the resulting compatible run and next action reopen identically for humans and Agents.
- [x] Documentation checks, type checking, focused/full tests, project validation, and browser verification pass.

## Work

- [x] Define the active mode-level prevention contract and durable quality semantics.
- [x] Implement compiler/runtime events, metrics, loss attribution, report/comparison, and human/AI projections.
- [x] Add the project-local closed-loop etch asset and a bounded candidate/evaluation path.
- [x] Review and commission only if the locked Benchmark permits it; otherwise preserve exact branch/rejection evidence.
- [x] Complete regression, browser, plan, Git, and remote verification.

## Findings and decisions

- 2026-07-24 — `073-simulate` attributes all remaining quality loss to the fixed layer-two etch challenge: three authored excursion lots, two repaired classes, one persistent latent-electrical scrap, and no equipment-drift defects.
- 2026-07-24 — Prevention belongs to the selected production mode rather than a replacement Process. The Scenario continues to name the same Process and lot, so the candidate cannot evade its fixed workload by inventing a new recipe id.
- 2026-07-24 — Mode prevention is exact and deterministic. Its duration, power, auxiliary inputs, supporting asset, and purchase cost remain ordinary authored industrial tradeoffs rather than a hidden yield scalar.
- 2026-07-24 — The first deliberately expensive/slower closed-loop envelope proved the Benchmark boundary by losing capital and service. The accepted asset instead costs `12,050` versus `12,000`, draws `282 W` in its selected mode versus `280 W`, preserves cycle time, and reduces standby power from `30 W` to `20 W`.
- 2026-07-24 — Candidate `closed-loop-layer-two-etch` changes exactly the `etch-l2` Device asset and selected mode. All five current-best cases are non-regressing: ordinary steady and facility-interruption cases gain only the standby-energy saving; mixed, quality-stress, and lithography-interruption cases each recover the exact lots whose latent-electrical damage is prevented.
- 2026-07-24 — Immutable review `b57802197eca94e2238013b2ead200e2f39436ae43ebdf1ec944bedca1dfc2d0` records `KEEP` before guarded application. No evaluator-owned World, Scenario, Objective, Benchmark case, or outcome guardrail changed.
- 2026-07-24 — Compatible run `074-simulate` completes `12/12` lots, delivers 96 devices, records ten first-pass and two reworked lots, and has zero scrap or escape. It retains three authored defect instances, prevents one, and applies two; input starvation now ranks ahead of residual yield loss.

## Verification

Focused coverage:

```bash
bun test packages/inm-core/src/workbench.test.ts --test-name-pattern "memory-fab workbench|non-KEEP Candidate"
bun test packages/inm-core/src/design-proposal-provider.test.ts --test-name-pattern "current commissioned fab"
bun test packages/inm-core/src/benchmark-outcome-guardrails.test.ts --test-name-pattern "memory-fab on-time|advanced recovery"
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "every checked-in demonstration run"
bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "current memory-fab Benchmark|public inspect gives Agents|CLI-only operator"
```

Final gates:

```bash
bun run docs:check
bun run typecheck
bun test --max-concurrency=1 packages/inm-core packages/inm-cli packages/inm-studio
bun run inm test examples/ironworks
bun run inm test examples/memory-fab
```

Browser verification reopens `/memory-fab` with compatible evidence `074-simulate`, opens `/memory-fab/factory` with `PREVENTED / AUTHORED DEFECTS = 1 / 3`, and opens the project Catalog entry for the placed `closed-loop-plasma-etch-bay`, where `closed-loop-control` visibly prevents `latent-electrical` at `6/5` power. No browser error log is emitted.

## Progress log

- 2026-07-24 — Plan activated from current Workbench V4 evidence after the Objective-owned WIP correction left fixed layer-two quality excursions as the highest-ranked loss.
- 2026-07-24 — Added a strict required `preventsDefects` field to production modes, immutable authored/prevented/applied excursion evidence, shared quality-control metrics, and projections for Core analysis, comparison/reporting, CLI, Workbench, and Studio.
- 2026-07-24 — Authored a self-contained TypeScript-backed closed-loop etch asset with project-local PBR maps, evaluated several industrial envelopes, and retained the smallest five-case zero-regression design.
- 2026-07-24 — Reviewed and applied the two-operation Candidate through the guarded public operation, then generated current immutable run `074-simulate` and regenerated/relocked affected demonstration evidence.

## Completion

Completed 2026-07-24. The strict mode contract, immutable prevention evidence, self-contained equipment asset, reviewed Candidate, commissioned Blueprint, and compatible run are in place. All 223 Core/CLI/Studio tests pass, both example projects pass their authored test suites, documentation and TypeScript checks pass, and the reopened Studio projects the same `074-simulate` evidence to human and Agent surfaces.
