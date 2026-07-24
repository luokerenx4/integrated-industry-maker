# Converge commissioned front-end input starvation

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/blueprint-optimization]], and [[docs/design/project-boundaries]].

## Outcome

The commissioned memory fab can investigate its current leading productive-equipment input-starvation signal through an explicit project-local front-end equipment or control intervention, and the locked five-case Benchmark—not an idle-time intuition—decides whether that intervention becomes a Candidate and commissioned factory change.

## Context

Compatible Run `075-simulate` reproduces the `074-simulate` operating result under the expanded Device catalog and ranks input starvation first. Eight of ten active flow Devices accumulate `259.276` event-backed inter-job input-gap device-seconds inside `1189.060` device-seconds of observed production opportunity. The leading subject is `furnace-1`: twelve rapid single-lot anneal jobs leave `42.456` seconds of available inter-job input gap inside a `114.456`-second opportunity window. Inspection, deposition, both lithography bays, both etch bays, and probe expose the same pipeline-cadence pattern at lower weighted ranks.

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

- [x] Research distinguishes ordinary pipeline cadence from a recoverable intervention using the exact `074-simulate` contributors and all five locked cases.
- [x] Any new equipment/control is project-local, TypeScript-backed where executable logic is needed, powered, costed, placed, and visually self-contained.
- [x] The Design provider can propose the researched intervention from the exact current commissioned seed with `addressedLoss: "input-starvation"` and deterministic patch evidence.
- [x] Design records a complete current-input immutable result; promotion occurs only for a guarded leader with a non-empty exact patch.
- [x] If commissioned, the new compatible run and Workbench report the changed physical loss chain; if rejected, the immutable negative evidence and remaining engineering boundary are explicit.
- [x] Focused/full tests, memory-fab validation, CLI/Studio/browser parity, documentation, Git, and remote verification pass.

## Work

- [x] Build the current-case research harness and evaluate explicit cadence variants.
- [x] Select or reject the first physical intervention family from exact Benchmark and score-component evidence.
- [x] Integrate the accepted research boundary into project assets and the Design proposal portfolio.
- [x] Execute Design, review/apply only through the Candidate contract, and generate compatible post-change evidence when justified.
- [x] Update durable design/project documentation, tests, browser proof, plan audit, Git, and remote state.

## Findings and decisions

- 2026-07-24 — Run `074-simulate` attributes `42.456` seconds of available inter-job input gap to `furnace-1`, followed by `59.584` seconds at inspection and `31.456` seconds at deposition. The signal spans a serial front-end cadence rather than one obviously broken transport stage.
- 2026-07-24 — The current furnace already uses the commissioned zero-wait batch/rapid policy and every lot runs the rapid single-lot Process. Repeating batch-formation or CONWIP tuning is not a new intervention.
- 2026-07-24 — Current Design evidence exhausts after `9/6`, `8/5`, and `10/7` CONWIP proposals plus four-job inspection maintenance. No currently applicable proposal changes front-end physical cadence.
- 2026-07-24 — The first controlled hypothesis is a project-local multi-chamber deposition replacement: reducing deposition service time may feed the commissioned rapid furnace more evenly, but its added capital, power, and downstream effects remain Benchmark-owned.
- 2026-07-24 — The research harness evaluates the unchanged incumbent, three costed multi-chamber ALD replacements, and two explicit agile-pulse production modes against every locked case. Each case is evaluated independently because asset-catalog changes correctly make the normal same-catalog Blueprint comparator reject the comparison.
- 2026-07-24 — All three replacement tools exceed the locked `230000` build-cost ceiling from the commissioned Blueprint's `229950` starting point, producing the expected constraint penalty. Faster deposition also shifts waiting upstream: at `2×` speed the mixed-quality total input-gap signal rises from `259276` to `263776` ticks even though furnace gaps fall from `42456` to `37956`.
- 2026-07-24 — The moderate `4/5` agile-pulse mode is Benchmark-valid and improves the weighted mean by `0.691655`, but regresses steady production by `0.375853` and facility interruption by `0.923040` against the commissioned best. The faster `2/3` mode regresses all five cases. The moderate option is credible enough to expose in the project asset catalog and Design portfolio, but not to commission.
- 2026-07-24 — An extra passive buffer is not the missing intervention: both the ALD output and furnace input already provide 24-lot physical buffers, while another `300`-cost Device would exceed the factory's remaining `50` build-cost headroom. A future cadence intervention must change physical process coupling or make a capital-neutral trade rather than duplicate storage.
- 2026-07-24 — `ald-deposition-bay` now declares `agile-pulse` as an unselected `4/5`-duration, `5/4`-power option. The commissioned provider emits one deterministic `/devices/<deposition>/recipe/mode` patch and labels it `addressedLoss: "input-starvation"`.
- 2026-07-24 — Immutable Design Run `1ae93e2ca28cb6bf2fd7c26ff808103e71ddb935b91540bc187bb6d2cbbe38bf` evaluates the mode under all five locked cases and retains it as a non-dominated `BRANCH`. Three cases improve, but steady production (`-0.375853`) and facility interruption (`-0.923040`) fail the uniform current-best boundary. The unchanged seed remains leader, the promotion patch is empty, and no Candidate is emitted.
- 2026-07-24 — The proposal is scoped to the commissioned configuration: continuous metrology, advanced rework, dedicated layer-two tools, N+2 utilities, dual service crew, high-throughput value dispatch, and `6/3` CONWIP must all be present. This prevents an in-situ operating control from perturbing the separate greenfield build search.
- 2026-07-24 — Compatible Run `075-simulate` preserves the commissioned `qualified` mode and reproduces score `28.748269`, 12/12 completed lots, 192% contract fulfillment, build cost `229950`, and the same measured loss chain under the new catalog hash.

## Verification

- `bunx tsc -p examples/memory-fab/assets/tsconfig.json --noEmit`
- `bun run memory-fab:research-input-starvation`
- `bun test packages/inm-core/src/design-proposal-provider.test.ts --max-concurrency=1` — `12 pass`, `0 fail`.
- `bun run memory-fab:relock-benchmarks` — all eight project Benchmarks relocked; the `greenfield-dram-design` contract hash remains `28cd57cf25ec01ad98a827a562d009ded14530ecb928131d895c1d44614d3b83`.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json --section summary` — current `generated-dram-fab` remains `KEEP`, score `29.321159`, with all seven outcome guardrails passing.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 1 --progress off --json --section summary` — immutable Run `1ae93e2ca28cb6bf2fd7c26ff808103e71ddb935b91540bc187bb6d2cbbe38bf`, one `BRANCH`, unchanged leader, zero promotion operations.
- `bun run inm simulate examples/memory-fab --json --section summary` — compatible Run `075-simulate`, score `28.748269`, 192% contract fulfillment, result hash `c466c41253495de971d5d2b6e6d169043ed0095651ad6c2bb7cd3bf08ebfee10`.
- `bun run test` — `226 pass`, `0 fail`, `1888` assertions, followed by all eight Ironworks project scenarios.
- Studio `http://localhost:4176/` → `/memory-fab` → `/memory-fab/designs/commissioned-dram-fab/runs/1ae93e2ca28cb6bf2fd7c26ff808103e71ddb935b91540bc187bb6d2cbbe38bf` → `/memory-fab/catalog`: project selection and load succeed; Workbench selects `075-simulate`; Design renders the exact `BRANCH` evidence; the project asset browser exposes `Agile pulse deposition` as `4/5 time · 5/4 power`.

## Progress log

- 2026-07-24 — Plan activated from Workbench V6's first exhausted current-Design handoff.
- 2026-07-24 — First equipment/control family researched and rejected with exact five-case evidence; plan remains active for a genuinely cadence-decoupling intervention.
- 2026-07-24 — The bounded ALD option is now first-class project state, formally proposed, retained only as a non-promotable Pareto branch, and reflected in compatible operating evidence.
- 2026-07-24 — Full CLI, Studio, browser, benchmark, replay, and project regression gates passed; the plan is complete without commissioning a factory mutation.

## Completion

The commissioned memory fab now has an explicit, project-local ALD cadence option and a deterministic Design proposal that can investigate it from the exact live configuration. Locked evidence retains the option only as an exploratory Pareto branch: three cases improve, but steady production and facility interruption regress, so the current seed remains leader, the promotion patch stays empty, and no Candidate or commissioned Blueprint change is produced. Humans can inspect the same boundary in Studio while Agents can reproduce it through the CLI and immutable artifacts.
