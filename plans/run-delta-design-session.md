# Run delta design session

- Status: `active`
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

- [ ] One shared comparison proves exact FROM/TO identities and either rejects incompatibility or emits a deterministic typed delta.
- [ ] Run `100-simulate → 101-simulate` explains the compact-cell semantic/spatial change, one-second starvation reduction, score/cost/area/movement deltas, unchanged delivery and quality, and the `etch-1 → probe-1` queue-leader transition.
- [ ] Human output emphasizes industrial meaning and unchanged guardrails; Agent JSON exposes the same evidence without prose parsing.
- [ ] Studio can open the exact comparison from current project/Run context, retain both Run ids in the URL, and focus changed Devices or Connections without inventing browser authority.
- [ ] A verified transient source recovery does not make ordinary session entry fail immediately; bounded non-convergence remains an explicit typed error and never affects foreign listeners.
- [ ] Documentation, schemas, fixtures, focused lifecycle/comparison tests, real memory-fab browser QA, and the full repository checkpoint pass.

## Work

- [ ] Audit current Run, comparison, observation, Workbench, route, and lifecycle contracts; record the smallest shared comparison boundary.
- [ ] Implement the strict Core Run delta schema and exact compatibility gate.
- [ ] Project the delta through CLI, Workbench next actions, and a stable Studio comparison route.
- [ ] Close the verified source-recovery timing gap without hiding persistent degradation.
- [ ] Verify Run `100-simulate → 101-simulate`, update lasting design contracts, complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-30 — The first north-star fixture must preserve both improvement and constraint emergence. `probe-1` becoming the queue leader is not automatically a regression or the next optimization target; it is a changed observation that the human or Agent must interpret.
- 2026-07-30 — Compatibility is an explicit identity relation, not “previous Run” recency. Convenience may suggest a compatible predecessor, but the comparison contract always carries both exact ids.
- 2026-07-30 — Session recovery may wait only on a verified project-owned supervisor already converging on the caller's exact source. Unknown listeners, ambiguous ownership, failed preflight, and bounded timeout remain visible errors.

## Verification

Pending.

## Progress log

- 2026-07-30 — Plan created from commissioned Runs `100-simulate` and `101-simulate`, their append-only Investigation chain, the real multi-surface reconstruction cost, and one full-checkpoint source-adoption timing observation.

## Completion

Pending.
