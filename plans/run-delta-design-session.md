# Run delta design session

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/development-operations]], [[docs/design/agent-cli-contract]], [[docs/design/operation-workbench]], [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], and [[docs/design/simulation-runtime]].

## Outcome

Let a human or Agent enter one reliable project session and answer “what did this factory intervention actually change?” from an exact comparison of two compatible immutable Runs, without reconstructing ports, process state, metric deltas, spatial edits, or evidence lineage by hand.

## Context

The compact inspection/rework intervention is now commissioned as Run `101-simulate` against Run `100-simulate`. The evidence proves a useful but nuanced result: the physical loop loses ten belt cells and one second of conditional travel, build cost and area fall, inspection starvation loses exactly one second from its main-source-waiting overlap, and the leading queue contributor changes from `etch-1` to `probe-1`. All of those facts exist, but they currently require separate Candidate review, Run observation, loss inspection, spatial Studio views, and manual arithmetic.

That reconstruction cost works against cumulative evidence. A later human or Agent should be able to reopen the two identities and see the exact causal delta, including unchanged guardrails and newly exposed constraints, rather than rediscovering why the Blueprint changed.

The full checkpoint also observed one transient `session.studio-degraded` result while the verified project-owned supervisor was adopting current source; an immediate focused rerun passed. The managed lifecycle reports the truth correctly, but ordinary session entry can still leak a short recovery transition to the operator. This plan treats bounded verified recovery as part of the same reliable design session, not as port archaeology the operator must solve.

## Scope

### In scope

- Define one Core-owned Run comparison contract pinned to exact project, execution, Blueprint, Scenario, Objective, seed, engine, and result identities.
- Reject incompatible Runs explicitly; never compare unrelated evidence because timestamps happen to be adjacent.
- Compare Blueprint semantics and spatial topology together with score components, delivery, quality, service, WIP, cycle, energy, cost, area, capacity, losses, and leading contributor changes.
- Preserve zero and unchanged industrial guardrails so improvements cannot hide a surrendered outcome.
- Expose the same comparison through CLI JSON/human output and a route-backed Studio view reachable from the current Workbench and Run surfaces.
- Let default project session entry wait through one bounded, verified project-owned source recovery and return exact lifecycle evidence if convergence fails.
- Use Run `100-simulate → 101-simulate` as the north-star acceptance fixture.

### Out of scope

- Ranking or generating factory changes autonomously.
- Treating the newest timestamp as evidence compatibility or silently choosing a historical baseline with different execution identity.
- Comparing incomplete operations, mutable live simulator state, or raw event files without immutable Run authority.
- Weakening Candidate review, locked cases, Objective constraints, or human/Agent decision ownership.
- Keeping compatibility aliases for superseded pre-release output contracts.

## Acceptance

- [x] One shared comparison proves exact FROM/TO identities and either rejects incompatibility or emits a deterministic typed delta.
- [x] Run `100-simulate → 101-simulate` explains the compact-cell semantic/spatial change, one-second starvation reduction, score/cost/area/movement deltas, unchanged delivery and quality, and the `etch-1 → probe-1` queue-leader transition.
- [x] Human output emphasizes industrial meaning and unchanged guardrails; Agent JSON exposes the same evidence without prose parsing.
- [x] Studio can open the exact comparison from current project/Run context, retain both Run ids in the URL, and focus changed Devices or Connections without inventing browser authority.
- [x] A verified transient source recovery does not make ordinary session entry fail immediately; bounded non-convergence remains an explicit typed error and never affects foreign listeners.
- [x] Documentation, schemas, fixtures, focused lifecycle/comparison tests, real memory-fab browser QA, and the full repository checkpoint pass.

## Work

- [x] Audit current Run, comparison, observation, Workbench, route, and lifecycle contracts; record the smallest shared comparison boundary.
- [x] Implement the strict Core Run delta schema and exact compatibility gate.
- [x] Project the delta through CLI, Workbench next actions, and a stable Studio comparison route.
- [x] Close the verified source-recovery timing gap without hiding persistent degradation.
- [x] Verify Run `100-simulate → 101-simulate`, update lasting design contracts, complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-30 — The first north-star fixture must preserve both improvement and constraint emergence. `probe-1` becoming the queue leader is not automatically a regression or the next optimization target; it is a changed observation that the human or Agent must interpret.
- 2026-07-30 — Compatibility is an explicit identity relation, not “previous Run” recency. Convenience may suggest a compatible predecessor, but the comparison contract always carries both exact ids.
- 2026-07-30 — Session recovery may wait only on a verified project-owned supervisor already converging on the caller's exact source. Unknown listeners, ambiguous ownership, failed preflight, and bounded timeout remain visible errors.
- 2026-07-30 — A historical Run's Blueprint must be compiled from its own immutable `blueprint.json`, not from the current project Blueprint with the same authored id. Run `100-simulate` and Run `101-simulate` each reproduce their persisted execution hash against current selected catalogs; the non-Blueprint comparison context is then exactly equal.
- 2026-07-30 — Comparison verifies each Run's `resultHash` directly from its persisted run key, ordered events, final state, and metrics. It reads existing evidence and does not replay simulation merely to recover trust.
- 2026-07-30 — Browser QA exposed that the Factory data path used a Run's frozen Blueprint while the observation path rebuilt current project state. Historical Workbench opening now verifies both saved result identity and selected execution identity before producing the observation brief.
- 2026-07-30 — Full-checkpoint failures came from integration fixtures repeatedly copying or rebuilding the whole memory-fab history, not from industrial result divergence. Observation tests now share one immutable Workbench snapshot; two copy-heavy tests retain only the exact Run, Design, and review evidence they exercise.

## Verification

- `bun test packages/inm-core/src/run-comparison.test.ts`
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "compare command explains"`
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts --test-name-pattern "project session waits"`
- `bun test packages/inm-studio/src/routes.test.ts packages/inm-studio/src/server.test.ts --test-name-pattern "Run comparison"`
- `bun test packages/inm-core/src/observation.test.ts`
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "public investigate"`
- Browser QA: opened `/memory-fab/runs?from=100-simulate&to=101-simulate`, verified exact identities, score/cost/area/movement, unchanged delivery/quality/capacity constraints, six semantic changes, 32 patch operations, one-second starvation reduction, and `etch-1 → probe-1` queue-leader transition.
- Browser QA: followed the same changed sorter into exact `?run=100-simulate` and `?run=101-simulate` Factory routes; verified Blueprint hashes `6b8b0ce24a… → 16ca367007…`, position `26,21 → 21,21`, selected inspector, and separately bound observation result hashes.
- `bun run docs:check` — 1250 double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, Ironworks assets, and memory-fab assets pass.
- `bun run test` — 333 tests, 4628 assertions, and all Ironworks project tests pass.

## Progress log

- 2026-07-30 — Plan created from commissioned Runs `100-simulate` and `101-simulate`, their append-only Investigation chain, the real multi-surface reconstruction cost, and one full-checkpoint source-adoption timing observation.
- 2026-07-30 — Completed the contract audit and introduced the first strict Core comparison for exact Run identities, semantic/spatial Blueprint changes, evaluator deltas, loss-chain transitions, and stable Factory navigation.
- 2026-07-30 — Added identical human/Agent CLI projections, stable Run-pair Studio routing, a comparison workbench, exact frozen-Run Factory/observation projection, and bounded verified Session recovery.
- 2026-07-30 — Completed API, CLI, route, lifecycle, full browser, documentation, and repository checkpoint verification; reduced two unrelated integration-fixture hot spots uncovered by the full run.

## Completion

Humans and Agents can now compare two compatible immutable Runs through one Core authority, CLI command, or copied Studio route; reopen either historical factory without current-Blueprint substitution; preserve unchanged industrial guardrails beside improvements; and enter a project Session through bounded exact-source recovery instead of transient port/source archaeology.
