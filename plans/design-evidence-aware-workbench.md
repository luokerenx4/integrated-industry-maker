# Make the shared Workbench aware of current Design evidence

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/design/agent-cli-contract]], [[docs/design/operation-workbench]], and [[docs/design/fab-loss-attribution]].

## Outcome

Workbench distinguishes a Design Program that has not been evaluated from one whose exact current inputs already produced promotable, continuable, or exhausted immutable evidence, so humans and Coding Agents receive the same honest next action instead of being sent around a deterministic no-op loop.

## Context

Workbench V5 can discover the current Blueprint's aligned Program and route compatible measured loss into its read-only brief. Current memory-fab Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` then evaluated every eligible intervention, stopped `frontier-exhausted`, retained the unchanged seed, and produced zero promotion operations.

The project Overview still recommends opening the generic Program brief because the snapshot does not inspect Design Run evidence. Re-running the unchanged content-addressed Program only reuses the same result, while an operator must independently notice that the useful next engineering act is to review the exact exhausted evidence and expand or revise the project-local intervention portfolio. That breaks the shared human/AI decision loop at the point where Design has learned “these authored options are exhausted.”

## Scope

### In scope

- Add deterministic, Core-owned currentness and outcome summaries for valid project-local Design Run evidence.
- Distinguish no current evidence, promotable leader, continuable frontier, and exhausted unchanged-seed evidence without using filesystem time or hash order as fake chronology.
- Preserve quarantined invalid evidence and historical/stale runs without allowing either to become current authority.
- Make Workbench priority, exact CLI argv, typed target, Studio route, operation availability, and human summary consume the same state.
- Project the exact current memory-fab exhausted result as evidence that the intervention portfolio—not the immutable evaluator—must change before another productive search.

### Out of scope

- Automatically editing or generating the project-local TypeScript proposal provider.
- Weakening locked Benchmark outcomes, current-best case budgets, or Candidate review/apply guards.
- Inventing counterfactual causal loss quantities or treating idle-time rank as foregone output.
- Adding timestamps, browser-owned run ranking, compatibility readers, or shared Design evidence.

## Acceptance

- [x] Core deterministically classifies every aligned Program's valid Design evidence against the current engine, Program hash, Benchmark contract, seed, and promotion base.
- [x] A current promotable or continuable result retains its guarded Candidate or continuation path; an exhausted unchanged-seed result cannot be presented as though another identical run were new work.
- [x] Invalid, internally valid but stale, and differently targeted runs remain inspectable but cannot become current Workbench authority.
- [x] CLI and Studio project the same evidence state, exact read-only argv, typed target, and project-qualified deep link without recomputing priority.
- [x] Current memory-fab Overview names the exhausted result and routes to it; its message makes the intervention-portfolio boundary explicit to both a human and an Agent.
- [x] Documentation, focused/full tests, project validation, browser verification, Git, and remote verification pass.

## Work

- [x] Define the current Design evidence identity, deterministic selection, summary, and Workbench V6 target contract.
- [x] Implement Core evidence discovery, classification, operation availability, and next-action precedence.
- [x] Project the contract through public CLI and Studio, including exact run deep links and conditional action states.
- [x] Update durable design documents, focused tests, current memory-fab evidence, and browser coverage.
- [x] Complete repository/project verification, plan audit, commit, push, and remote verification.

## Findings and decisions

- 2026-07-24 — Current Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` stopped `frontier-exhausted` after four guarded rejections; its best is iteration zero with zero promotion operations. Workbench V5 nevertheless keeps recommending the generic aligned Program brief.
- 2026-07-24 — Content-addressed Design execution is deterministic, so another invocation with unchanged engine, Program, Benchmark, seed, and promotion base reuses evidence rather than creating a new search opportunity.
- 2026-07-24 — `indexDesignRuns()` already separates strict valid runs from quarantined invalid siblings, but its summaries do not expose enough current-input identity for Workbench classification. Filesystem modification time and lexicographic result-hash order are not industrial authority and will not be introduced.
- 2026-07-24 — After an exhausted unchanged-seed result, the honest safe handoff is the exact read-only run evidence plus an explicit intervention-portfolio boundary. Editing project TypeScript remains a normal Coding Agent engineering task, not a hidden effect of `inm inspect`.
- 2026-07-24 — Workbench V6 now defines currentness over engine, project, Program id/hash, Benchmark id/contract, declared seed/source hash/normalized hash, and promotion base. Current continuation leaves supersede their direct sources; authority then prefers promotable, continuable, and exhausted leaves without timestamp or hash-recency inference.
- 2026-07-24 — The local memory-fab index contains one exact current exhausted Run, two strict-valid historical Runs, and thirteen quarantined invalid siblings. Only Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` becomes authority.
- 2026-07-24 — `design.run` remains an advertised artifact capability, but its Workbench availability is conditional when current evidence already owns the next decision. Studio opens that exact authority and labels the operation `REVIEW CURRENT RUN`; it does not silently start an identical run.

## Verification

- `bun run docs:check` — 719 documentation links resolved.
- Core, CLI, and Studio TypeScript checks passed, including both project-local asset packages through the full repository gate.
- `bun test packages/inm-core/src/workbench.test.ts packages/inm-core/src/design-program.test.ts` — 14 passed, 0 failed.
- Focused public CLI inspect parity — 2 passed, 0 failed, including bounded Design evidence in the default summary.
- `bun run inm validate examples/memory-fab --json`, `bun run inm analyze examples/memory-fab --json`, and `bun run inm test examples/memory-fab --json` passed; both project scenarios passed.
- Current `inm inspect` summary and `--section next-action` both report Workbench V6, exhausted authority Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd`, exact read-only argv/route, and envelope parity.
- `bun run test` — 225 package tests passed with 1,885 assertions, followed by all eight Ironworks project scenarios; 0 failed.
- Browser verification on a clean current-source Studio process covered `/` → `/memory-fab` → the exact Design Run deep link. The Overview, conditional `REVIEW CURRENT RUN` operation, exhausted result, and new-run control rendered with no browser warning/error logs.
- Feature commit `8e07dd5` was pushed to `origin/main`, and `git ls-remote` matched the local commit exactly.

## Progress log

- 2026-07-24 — Plan activated immediately after shipping Workbench V5 and auditing its first complete current-factory Design handoff.
- 2026-07-24 — Implemented Core classification and Workbench V6, expanded strict run summaries with current-input identity, projected bounded CLI evidence and exact next-action argv, and connected Studio Overview/operation routes to immutable Design results.
- 2026-07-24 — A reported project-open failure reproduced only on the stale Studio process. Restarting port `4176` from current source restored `/` → `/memory-fab`; the refreshed page rendered the V6 exhausted handoff with no browser warnings or errors.
- 2026-07-24 — Full package/project/browser verification passed, feature commit `8e07dd5` was pushed and matched remotely, and the plan completion audit closed every acceptance item.

## Completion

Workbench now treats current Design evidence as part of the shared human/AI operating state. The same exact identity and deterministic authority rule drives Core, bounded CLI summaries, next-action argv, Studio deep links, and conditional operation copy. On the live memory-fab state, both surfaces reopen the exhausted immutable result and explicitly move further engineering work to the project-local intervention portfolio instead of encouraging an identical deterministic run.
