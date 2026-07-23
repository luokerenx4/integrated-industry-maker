# Interruption-aware campaign repair

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/setup-campaign-control]], [[docs/design/equipment-changeover]], and [[docs/design/fab-loss-attribution]].

## Outcome

When a lithography setup-campaign alternative improves ordinary memory-fab operation but narrowly regresses the locked lithography-interruption case, Design can propose and robustly evaluate an explicit campaign-policy refinement against that exact blocker rather than exhausting the branch.

## Context

The first complete seven-candidate greenfield run retains `candidate-6`, which adds the authored `minimumReadyLots: 3` / `maximumHoldTicks: 12000` lithography campaign. Relative to leader `candidate-4`, it improves aggregate score by `0.455784`, steady production and mixed quality by `0.348263` each, quality excursion by `0.290519`, and facility interruption by `1.619328`. Its only blocker is a `0.054667` regression in `lithography-interruption` under the unchanged zero-regression guardrail.

The branch then honestly becomes search-exhausted because the current project portfolio has no proposal annotated for that case. The project already owns setup-campaign physics, exact policy controls, a focused campaign research grid, interruption Scenarios, and immutable promotion-boundary evidence. The next industrial question is therefore whether a less aggressive ready-lot or hold threshold preserves the ordinary gain while bounding interruption exposure—not whether to relax the evaluator.

## Scope

### In scope

- Use the existing focused campaign search to identify a small deterministic refinement portfolio around the retained `3 / 12000` policy.
- Let the project proposal provider recognize an existing campaign policy and declare `addressedCase: lithography-interruption` for an eligible repair.
- Evaluate the repair through the unchanged locked five-case Benchmark and record promotion, continued branch retention, or rejection.
- Preserve matching Core, CLI, and Studio blocker/repair evidence in a new real greenfield Design Run.

### Out of scope

- Relaxing the zero-regression guardrail or changing interruption timing, Objective weights, equipment physics, or Benchmark locks.
- Adding a second lithography bay or redesigning physical material topology before policy refinement is measured.
- Generic automated parameter optimization across every Blueprint field.
- Reactivating nodes that were already exhausted under an earlier leader boundary.

## Acceptance

- [x] Focused evidence explains which campaign thresholds are defensible repair candidates and why.
- [x] A blocked campaign alternative selects a deterministic repair naming the exact current `lithography-interruption` case.
- [x] The repair consumes one ordinary Candidate budget and the unchanged Benchmark decides its result.
- [x] CLI and Studio expose the before-blocker, repair target, after-decision, and resulting scheduler state consistently.
- [x] A real greenfield run records the campaign repair outcome without changing any evaluator-owned input.
- [x] Provider, Core, CLI, Studio, documentation, and full regression pass.

## Work

- [x] Audit the campaign research grid and the retained alternative's five-case metrics.
- [x] Add the bounded project-local campaign repair portfolio and provider selection rule.
- [x] Update deterministic run expectations plus CLI/Studio evidence tests.
- [x] Generate real memory-fab evidence, run full regression, and audit completion.

## Findings and decisions

- 2026-07-23 — The retained campaign is already profitable in aggregate and in four locked cases; its single `-0.054667` interruption regression is an exact refinement boundary, not justification for weakening the Program guardrail.
- 2026-07-23 — Policy refinement precedes redundant equipment in this plan because it uses existing industrial controls and can be rejected cheaply by the unchanged Benchmark before topology expansion is considered.
- 2026-07-23 — A `minimumReadyLots: 3` grid over `maximumHoldTicks` `0`, `250`, `500`, `750`, `1000`, `1500`, `2000`, `2500`, and `3000` found that every positive hold still regresses `lithography-interruption`; `3 / 0` is the sole promotable refinement, with zero score change in four cases and `+1.707292` in `facility-interruption` relative to the current leader.
- 2026-07-23 — `maximumHoldTicks: 0` is an explicit no-wait campaign escape, not a claim that the ordinary setup reduction survives. It retains setup-aware selection but forbids voluntary waiting for compatible lots; only the unchanged five-case Benchmark may promote it.

## Verification

- `bun examples/memory-fab/strategies/research/campaign-repair.ts --program greenfield-dram-fab --run-id 1628f3a52f31ff6d670f3e844315fa73d5232d8000a7b09c09974aa47f832263 --min-lots 3 --max-lots 3 --holds 0 --json` — reports `PROMOTE`, aggregate `+0.243899`, case deltas `0, 0, 0, 0, +1.707292`, and no guardrail violation.
- `bun run inm validate examples/memory-fab`, `bun run inm analyze examples/memory-fab`, and `bun run inm test examples/memory-fab` — public project loop passes; both memory-fab fixtures pass.
- `bun run test` — documentation links, all TypeScript projects, Core, CLI, Studio, and Ironworks fixtures pass: 190 tests and 1666 assertions.
- Studio's public run API independently executed all seven candidates and reopened the resulting hash. Manual inspection at `/memory-fab/designs/greenfield-dram-fab/runs/59dca3faf587091dacb20f28bfb4b5020fd5b6d4ce4af718f335bb0b92383562` confirmed both repair targets, the exact pre-repair blocker, candidate 7 as searchable leader, candidate 6 as searchable alternative, and no browser console errors.

## Progress log

- 2026-07-23 — Proposed from `candidate-6` in Design Run `ebb1a45fe61db1f5e20924d40d6b48df0933a672be1a834c7f4707352f904f78` after node-local exhaustion scheduling exposed the next exact blocker.
- 2026-07-23 — Activated to measure campaign refinements directly from the immutable `candidate-4` leader before adding any repair to the Design portfolio.
- 2026-07-23 — Added a project-local TypeScript research command that reloads the immutable leader and locked Benchmark, checks score drift, and reports aggregate, per-case, changeover, and hold evidence for a bounded policy grid.
- 2026-07-23 — A clean clone can reconstruct the research incumbent with a current-source four-candidate run (`1628f3a52f31ff6d670f3e844315fa73d5232d8000a7b09c09974aa47f832263`) instead of depending on an untracked historical artifact.
- 2026-07-23 — Design Run `59dca3faf587091dacb20f28bfb4b5020fd5b6d4ce4af718f335bb0b92383562` evaluates the repair as candidate 7. The unchanged Benchmark promotes it to score `-242.199221` (`+37.971590` from seed); candidate 6 remains a searchable non-dominated alternative and only candidate 3 is exhausted.
- 2026-07-23 — Core, CLI, and Studio server evidence now agree on candidate 6's exact pre-repair blocker, candidate 7's `addressedCase`, KEEP decision, and final two-searchable-node scheduler state.

## Completion

Commit `b5e87fc` ships the project-local no-wait campaign repair, its typed research command, exact provider selection, Core/CLI/Studio evidence, current design documentation, and deterministic regression coverage. The locked five-case Benchmark and zero-regression policy remain unchanged. Candidate 6 intentionally remains searchable frontier evidence after candidate 7 is promoted; any further branch expansion belongs in a separately indexed plan.
