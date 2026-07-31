# Run 110 lithography maintenance convergence

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/design-programs]], [[docs/design/industrial-investigations]], and [[docs/design/operator-workbench]].

## Outcome

Carry Run 110's exact `lithography-1` maintenance/qualification contributor through current typed and spatial observation, one bounded cadence intervention, and an explicit human/Agent industrial decision without weakening quality, service, interruption resilience, or evidence identity.

## Context

The exact furnace and Probe diagnostics are now independently dispositioned under Run 110, so Workbench advances to `fab-loss.maintenance-qualification:device:lithography-1+device:maintenance-service-1`. Eight maintenance and eight qualification completions consume `124,000` service/wait device-ticks across the factory. `lithography-1` owns the leading `34,000`: `26,000` maintenance, `8,000` qualification, zero input wait, zero crew wait, and two planned boundaries.

Program `lithography-maintenance-convergence` is aligned to the exact `device:lithography-1:maintenance-qualification.totalTicks` target and currently has no current authority. Its sole authored proposal moves the existing planned boundary from six to seven jobs. Historical Program runs are evidence, not permission to reuse their verdict under the current Run 110 identity.

## Scope

### In scope

- Bind the current Run, exact maintenance contributor, installed provider path, service chronology, drift exposure, and required Studio views.
- Reopen the existing strict Program and verify that its one proposal still matches the observed physical cause.
- Execute at most the bounded `6 → 7 jobs` cadence Candidate under the unchanged five-case Benchmark.
- Compare exact target reduction with quality, completion, on-time service, interruption, energy, WIP, cost, and spatial evidence.
- Persist the resulting current Design/Candidate or Investigation decision and advance Workbench honestly.

### Out of scope

- Automatic threshold sweeps, maintenance-policy search, or RL.
- Adding maintenance crews, consumables, duplicate lithography equipment, or unrelated transport changes.
- Relaxing the zero-regression current-best guardrail or any locked outcome threshold.
- Treating all factory maintenance time as interchangeable with the exact lithography contributor.

## Acceptance

- [x] Current typed and spatial evidence explains why `lithography-1` owns `34,000` maintenance/qualification ticks and whether one planned cycle is avoidable.
- [x] One exact `6 → 7 jobs` intervention is evaluated under all five locked cases, or the current evidence explicitly shows why it must not run.
- [x] CLI and Studio reopen the same target, Program evidence, result, and human/Agent decision without reconstructing identity from chat.
- [x] Project validation, focused tests, full `bun run test`, and browser acceptance verify the retained decision and next Workbench handoff.

## Work

- [x] Bind Workbench's current Run 110 diagnostic and exact Program target.
- [x] Inspect the service path, service chronology, drift/quality relation, and physical work cell.
- [x] Execute and judge the single bounded cadence intervention.
- [x] Persist the decision and align Workbench, CLI, Studio, docs, fixtures, and retained evidence.
- [x] Complete verification, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Workbench advances from the explicitly discarded Probe-only acceleration to the exact current `lithography-1` maintenance/qualification contributor. The aligned Program target is `device:lithography-1:maintenance-qualification.totalTicks`, direction `decrease`.
- 2026-07-31 — The project strategy is intentionally singular: change only `lithography-1.policy.preventiveMaintenance.planned.afterJobs` from `6` to `7`. It refuses to propose unless the current contributor remains exactly `34,000` ticks with two planned boundaries and zero material/crew wait.
- 2026-07-31 — Run 110 records two planned lithography stops at ticks `37,000` and `105,023`. Each uses the sole qualified provider `maintenance-service-1` for `9,000` maintenance ticks plus `4,000` qualification ticks, one `chamber-clean-kit`, and one `tool-qualification-wafer`; no consumable, crew, cancellation, or capacity wait is present. The installed provider is `28.9` cells away inside its declared range `35`, has two crews, and peaks at two concurrent assignments.
- 2026-07-31 — The asset contract permits at most eight jobs and `150,000` qualification ticks, but its first drift step begins after six jobs and can introduce `critical-dimension` defects while multiplying duration and power. The current six-job planned boundary is therefore preventive, not arbitrary. Moving it to seven deliberately exchanges one `13,000`-tick service cycle for one drift-exposed production window.
- 2026-07-31 — Current immutable Design Run `7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e` proves the local target is physically removable: `lithography-1` maintenance/qualification falls `34,000 → 17,000` ticks.
- 2026-07-31 — The same Candidate is rejected by industrial authority. Aggregate score regresses `-3.515361` against the current factory and all five cases regress. Steady and mixed operation each lose two on-time lots, quality excursion loses one, lithography interruption loses three and is limiting at `-6.031778`, and facility interruption loses two. The absolute on-time guardrail also fails in steady and facility cases.
- 2026-07-31 — Human/Agent decision: `REJECT`. Do not change the commissioned Blueprint. The evidence does not justify a threshold sweep, hidden provider capacity, or a weaker service contract; Workbench correctly retains the exhausted current Design for review and asks for a genuinely different project-local intervention before another run.

## Verification

- `bun run inm inspect examples/memory-fab --section summary --json` — current Run 110 and exact `lithography-maintenance-convergence` handoff confirmed.
- `bun run inm observe examples/memory-fab --run 110-candidate-trial-run-105-normal-particle-suppress --json` — immutable Observation `139615ad4c79fd187efba3afd6a7b406af8dbb5a43a4c1e67d1c0ba15b5f9e55` binds the exact lithography and maintenance-provider views.
- `bun run inm design examples/memory-fab --program lithography-maintenance-convergence --run --max-candidates 2 --json` — current immutable Design Run `7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e` evaluates the sole Candidate, rejects it, and exhausts the unchanged seed.
- `bun run inm inspect examples/memory-fab --section summary --json` — the Program now has one current exhausted authority addressing the exact loss target; Workbench opens that result read-only rather than offering dishonest promotion or automatic search.
- `bun run inm validate examples/memory-fab` — passes.
- `bun test packages/inm-core/src/design-program.test.ts packages/inm-cli/src/cli.test.ts packages/inm-studio/src/server.test.ts` — passes.
- `bun run test` — passes.
- Studio `/memory-fab/factory/devices/lithography-1?run=110-candidate-trial-run-105-normal-particle-suppress` and `/memory-fab/factory/devices/maintenance-service-1?run=110-candidate-trial-run-105-normal-particle-suppress` — browser acceptance confirms the installed service path, physical range, two-crew provider, maintenance contract, planned stop, and exact Observation handoff.
- Studio `/memory-fab/designs/lithography-maintenance-convergence/runs/7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e` — browser acceptance shows current versus historical identity, exact `34,000 → 17,000` target improvement, `REJECT`, limiting case, guardrail failure, exhausted frontier, and no promotable result.

## Progress log

- 2026-07-31 — Plan activated from the current Workbench V19 maintenance/qualification handoff.
- 2026-07-31 — Typed event chronology, asset drift boundary, consumable/provider ownership, and Studio spatial evidence bound to Run 110.
- 2026-07-31 — One exact cadence Candidate evaluated and rejected under the unchanged five-case authority; no factory artifact mutated.
- 2026-07-31 — Current exhausted Design retained as the shared CLI/Studio decision record and plan archived.

## Completion

Run 110's leading lithography maintenance contributor is now an explicit bounded decision rather than an open aggregate loss. One planned service cycle can be removed locally, but doing so crosses the asset's six-job drift boundary, reduces on-time service, and regresses every locked case. The unchanged six-job policy remains commissioned, the rejected current result is immutable and reopenable, and any continuation must introduce a materially different authored maintenance intervention rather than retrying the same threshold.
