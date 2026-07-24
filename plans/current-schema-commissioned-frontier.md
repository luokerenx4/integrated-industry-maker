# Rebuild the current-contract commissioned frontier

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/operator-workbench]], and [[docs/design/blueprint-optimization]].

## Outcome

The exact commissioned memory fab has a useful current-contract Design frontier that preserves the verified V5 loss evidence, retires or repairs the retained ALD branch honestly, explores bounded interventions from the unchanged leader, and gives humans and Agents the same immutable next decision.

## Context

Fab-loss V5 correctly removed necessary transit from ranked transport loss, but strict pre-alpha loading excludes all seventeen earlier V4 Design artifacts from authority. Current Run `0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1` restores current evidence for only one `recipe:agile-pulse-deposition` Candidate. It retains that Candidate as a non-promotable alternative and stops at its explicit `1/1` budget while both the alternative and unchanged leader remain searchable.

The Workbench correctly points humans and Agents at this exact continuation. Following that handoff is now necessary to distinguish a real current optimization frontier from a technically valid but one-Candidate evidence stub. The locked five-case Benchmark, absolute outcome guardrails, zero current-best regression policy, and guarded Candidate boundary remain authoritative.

## Scope

### In scope

- Continue the exact V5 run with one bounded invocation using the Program's authored maximum additional Candidate budget.
- Preserve and expose branch exhaustion, repair attempts, leader proposals, Objective-component causality, and the final searchable/exhausted frontier.
- Promote, review, apply, and resimulate only if a non-empty leader patch passes every locked guard; otherwise preserve the negative result without mutating the factory.
- Keep CLI, Studio, Workbench next action, immutable artifacts, and durable design documentation aligned.

### Out of scope

- Reading, migrating, or granting authority to V4 Design artifacts.
- Weakening the Benchmark, outcome floors, zero-regression current-best guardrail, or Candidate review/apply boundary.
- Adding a speculative intervention merely to consume the budget.
- Treating input-gap ranking as guaranteed recovered output.

## Acceptance

- [x] The continuation verifies and reuses Run `0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1` without mutating it.
- [x] Every new Candidate or zero-budget node exhaustion records an exact current V5 loss/case target and deterministic frontier transition.
- [x] The commissioned Blueprint changes only if a guarded promotable leader is emitted, reviewed, and applied through the Candidate lifecycle.
- [x] CLI and Studio reopen the same final immutable authority and expose the same next action or honest exhaustion boundary.
- [x] Project validation, public inspect/design/test loops, focused tests, full tests, browser verification, Git, and remote verification pass; a new simulation is intentionally omitted because engine, Blueprint, Scenario, and selected operation are unchanged.

## Work

- [x] Audit the current V5 evidence, Workbench handoff, provider portfolio, and strict invalid-artifact boundary.
- [x] Execute one maximum-bounded continuation and inspect every exhaustion, proposal, decision, and frontier transition.
- [x] Commission a guarded winner when one exists, or preserve an immutable negative frontier without factory mutation.
- [x] Update current design truth, Workbench/CLI/Studio expectations, and checked-in artifacts.
- [x] Complete public/full/browser verification, acceptance audit, Git, and remote state.

## Findings and decisions

- 2026-07-24 — Current authority is a strict V5 `1/1` run with one searchable ALD alternative and the unchanged searchable leader; seventeen V4 artifacts remain visible but invalid and will not be migrated.
- 2026-07-24 — The next bounded action is the product's own shared continuation handoff, using at most the Program-authored seven new Candidate evaluations.
- 2026-07-24 — Continuation `83adbe849e1322b171dcedb4e7df6328c2bfc49f4c1e84d23c995cadcfdfa0f0` reuses the ALD iteration, records the branch as proposal-exhausted, rejects inspection maintenance plus `9/6`, `8/5`, and `10/7` EDD variants, then stops `frontier-exhausted` after five cumulative Candidates.
- 2026-07-24 — Inspection maintenance improves aggregate score `+0.521585` but misses mixed-quality and facility on-time floors and regresses facility score `-1.252566`. The three release variants lower aggregate score by `5.224782`, `3.215934`, and `4.234519`; none justify a factory mutation.
- 2026-07-24 — The additional budget is a ceiling rather than a work quota: the run closes after 25 actual simulations instead of the 40-capped plan once both nodes have no eligible project-local proposal.

## Verification

- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run-id 0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1 --continue --max-candidates 7 --progress ndjson --json --section all` — continuation `83adbe849e1322b171dcedb4e7df6328c2bfc49f4c1e84d23c995cadcfdfa0f0`; one reused plus four new Candidates, two deterministic node exhaustions, `frontier-exhausted`, unchanged leader, zero promotion operations, 25 actual simulations.
- `bun run inm validate examples/memory-fab --json`
- `bun run inm analyze examples/memory-fab --json --section summary`
- `bun run inm plan examples/memory-fab --json --section summary` — `ready: true`.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run-id 83adbe849e1322b171dcedb4e7df6328c2bfc49f4c1e84d23c995cadcfdfa0f0 --json --section summary` — strict reopen proves direct continuation identity, `5/8` cumulative budget, exhausted frontier, and empty promotion patch.
- `bun run inm inspect examples/memory-fab --json --section next-action` — exact exhausted `design-run` target, read-only argv, and project-qualified Studio route.
- `bun run inm test examples/memory-fab` — both memory-fab fixtures pass.
- `bun test packages/inm-cli/src/commands.test.ts -t "public inspect gives Agents and humans the same exhausted memory-fab Design authority" --max-concurrency=1` — `1 pass`, `0 fail`.
- `bun test packages/inm-core/src/workbench.test.ts --max-concurrency=1` — `7 pass`, `0 fail`.
- `bunx tsc -p packages/inm-cli/tsconfig.json --noEmit`
- `bun run docs:check` — `735` documentation double-links resolve.
- `bun run test` — `229 pass`, `0 fail`, `1902` assertions, followed by all eight Ironworks project scenarios.
- Studio deep-link `/memory-fab/designs/commissioned-dram-fab/runs/83adbe849e1322b171dcedb4e7df6328c2bfc49f4c1e84d23c995cadcfdfa0f0` — exact continued source/result, two exhausted frontier nodes, two exhaustion records, five decisions, zero Continue controls, no browser console errors.

## Progress log

- 2026-07-24 — Plan activated from the current Workbench `REVIEW CONTINUATION` handoff.
- 2026-07-24 — Current immutable frontier rebuilt and found honestly exhausted; validation and shared-surface verification are in progress.
- 2026-07-24 — CLI, Studio, focused, full, project, documentation, and browser gates pass; plan completed with the factory intentionally unchanged.

## Completion

Current V5 Design authority now contains the complete applicable commissioned frontier rather than a one-Candidate evidence stub. It preserves the ALD trade as an exhausted alternative, rejects inspection maintenance and all three remaining release variants with exact case, service, and Objective-component evidence, exhausts the unchanged leader without consuming unused budget, and emits no Candidate. Humans and Agents reopen the same hash and receive the same instruction to expand the project-local intervention portfolio; the commissioned Blueprint and compatible Run `075-simulate` remain unchanged.
