# Converge commissioned front-end input starvation

- Status: `active`
- Updated: `2026-07-24`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/blueprint-optimization]], and [[docs/design/project-boundaries]].

## Outcome

The commissioned memory fab can investigate its current leading productive-equipment input-starvation signal through an explicit project-local front-end equipment or control intervention, and the locked five-case Benchmark—not an idle-time intuition—decides whether that intervention becomes a Candidate and commissioned factory change.

## Context

Compatible Run `074-simulate` ranks input starvation first. Eight of ten active flow Devices accumulate `259.276` event-backed inter-job input-gap device-seconds inside `1189.060` device-seconds of observed production opportunity. The leading subject is `furnace-1`: twelve rapid single-lot anneal jobs leave `42.456` seconds of available inter-job input gap inside a `114.456`-second opportunity window. Inspection, deposition, both lithography bays, both etch bays, and probe expose the same pipeline-cadence pattern at lower weighted ranks.

Current Design Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` exhausts the commissioned Program after testing only three release-window variants and one inspection-maintenance variant. The unchanged seed remains leader. The project proposal portfolio contains no currently applicable physical intervention for the deposition-to-furnace cadence, so another identical invocation cannot answer whether the signal is recoverable.

Input gap is still an observed scheduling signal, not foregone output. Faster or parallel equipment may only move waiting downstream, raise capital/power/WIP, or violate service floors. Research must therefore begin from the exact commissioned Blueprint and retain the existing absolute outcomes and current-best case budgets.

## Scope

### In scope

- Add one project-local TypeScript research sweep that compares the current commissioned front-end against explicit cadence interventions under all five locked Benchmark cases.
- Test equipment changes as ordinary placed, powered, costed, visually self-contained project assets or explicit Blueprint policies; do not mutate evaluator constants or Process durations globally.
- Measure exact case score deltas, Objective component causality, hard outcome floors, capacity readiness, and the changed fab-loss chain.
- Add a deterministic project-strategy proposal only when the research establishes a credible restricted Blueprint patch and an honest `input-starvation` target.
- Preserve the resulting Design KEEP/BRANCH/REJECT evidence, Candidate boundary, compatible run, CLI/Studio projection, and documentation.

### Out of scope

- Calling all finite-campaign idle time waste or converting the starvation score into fabricated recovered output.
- Weakening the locked Benchmark, current-best regression budgets, delivery/on-time/yield/scrap/escape/release floors, or Candidate review/apply guards.
- Editing shared/global assets, sharing asset packages between projects, or introducing compatibility readers.
- Automatically commissioning a score winner that fails any absolute industrial outcome.

## Acceptance

- [ ] Research distinguishes ordinary pipeline cadence from a recoverable intervention using the exact `074-simulate` contributors and all five locked cases.
- [ ] Any new equipment/control is project-local, TypeScript-backed where executable logic is needed, powered, costed, placed, and visually self-contained.
- [ ] The Design provider can propose the researched intervention from the exact current commissioned seed with `addressedLoss: "input-starvation"` and deterministic patch evidence.
- [ ] Design records a complete current-input immutable result; promotion occurs only for a guarded leader with a non-empty exact patch.
- [ ] If commissioned, the new compatible run and Workbench report the changed physical loss chain; if rejected, the immutable negative evidence and remaining engineering boundary are explicit.
- [ ] Focused/full tests, memory-fab validation, CLI/Studio/browser parity, documentation, Git, and remote verification pass.

## Work

- [x] Build the current-case research harness and evaluate explicit cadence variants.
- [x] Select or reject the first physical intervention family from exact Benchmark and score-component evidence.
- [ ] Integrate the accepted research boundary into project assets and the Design proposal portfolio.
- [ ] Execute Design, review/apply only through the Candidate contract, and generate compatible post-change evidence when justified.
- [ ] Update durable design/project documentation, tests, browser proof, plan audit, Git, and remote state.

## Findings and decisions

- 2026-07-24 — Run `074-simulate` attributes `42.456` seconds of available inter-job input gap to `furnace-1`, followed by `59.584` seconds at inspection and `31.456` seconds at deposition. The signal spans a serial front-end cadence rather than one obviously broken transport stage.
- 2026-07-24 — The current furnace already uses the commissioned zero-wait batch/rapid policy and every lot runs the rapid single-lot Process. Repeating batch-formation or CONWIP tuning is not a new intervention.
- 2026-07-24 — Current Design evidence exhausts after `9/6`, `8/5`, and `10/7` CONWIP proposals plus four-job inspection maintenance. No currently applicable proposal changes front-end physical cadence.
- 2026-07-24 — The first controlled hypothesis is a project-local multi-chamber deposition replacement: reducing deposition service time may feed the commissioned rapid furnace more evenly, but its added capital, power, and downstream effects remain Benchmark-owned.
- 2026-07-24 — The research harness evaluates the unchanged incumbent, three costed multi-chamber ALD replacements, and two explicit agile-pulse production modes against every locked case. Each case is evaluated independently because asset-catalog changes correctly make the normal same-catalog Blueprint comparator reject the comparison.
- 2026-07-24 — All three replacement tools exceed the locked `230000` build-cost ceiling from the commissioned Blueprint's `229950` starting point, producing the expected constraint penalty. Faster deposition also shifts waiting upstream: at `2×` speed the mixed-quality total input-gap signal rises from `259276` to `263776` ticks even though furnace gaps fall from `42456` to `37956`.
- 2026-07-24 — The moderate `4/5` agile-pulse mode is Benchmark-valid and improves the weighted mean by `0.691655`, but regresses steady production by `0.375853` and facility interruption by `0.923040` against the commissioned best. The faster `2/3` mode regresses all five cases. Neither intervention is promotable under the no-current-best-regression rule, so no speculative asset, Design proposal, or factory patch is being commissioned.
- 2026-07-24 — The next credible intervention family must decouple deposition/furnace cadence without assuming that shorter service time itself is recovered output—most likely explicit local WIP staging or a capital-neutral equipment trade—not another speed-only ALD variant.

## Verification

- `bunx tsc -p examples/memory-fab/assets/tsconfig.json --noEmit`
- `bun run memory-fab:research-input-starvation`
- `bun run test` — `225 pass`, `0 fail`, `1885` assertions, followed by all eight Ironworks project scenarios.
- Studio `http://localhost:4176/` → `/memory-fab` → `/memory-fab/factory`: project selection, project load, current run, and factory projection render successfully with the current server.

## Progress log

- 2026-07-24 — Plan activated from Workbench V6's first exhausted current-Design handoff.
- 2026-07-24 — First equipment/control family researched and rejected with exact five-case evidence; plan remains active for a genuinely cadence-decoupling intervention.

## Completion

Pending.
