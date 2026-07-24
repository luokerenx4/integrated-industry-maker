# Coverage-deficit cadence contract

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/production-modes]], [[docs/design/work-center-dispatch]], [[docs/design/fab-loss-attribution]], [[docs/design/agent-cli-contract]], [[docs/PROJECT_FORMAT]]

## Outcome

Make predictive downstream coverage pressure and event-backed equipment input starvation two explicitly different industrial signals across the Blueprint contract, runtime metrics, CLI, Studio, and memory-fab evidence.

## Context

The commissioned ALD cadence controller observes destination-buffer inventory plus exact in-flight cargo before selecting its next non-preemptive job. In compatible run `085-simulate`, that coverage stays below one item for `198.3 s`, while the batch furnace accumulates only `42.456 s` of event-backed material-input shortage. The controller can therefore observe pressure while the furnace is still processing, and its interval can also extend through finite-campaign drain.

The predictive behavior is useful: waiting until the furnace is already input-starved would often select the recovery mode too late. The defect is semantic. The current public names `downstream-starvation-recovery`, `minimumStarvationTicks`, `starvationEpisodes`, and `starvationTicks` let humans and Agents mistake an inventory-coverage trigger for measured productive-equipment loss.

## Scope

### In scope

- Rename the strict current cadence policy to downstream coverage recovery and rename its debounce and observed metrics to coverage-deficit terms.
- Keep the exact resident-plus-in-flight boundary, deterministic timer, and non-preemptive job-selection behavior unchanged.
- Project the same exact coverage-deficit evidence through Benchmark, Design, CLI, Studio, current examples, and project-local TypeScript research.
- Preserve event-backed material input starvation as the only source of actual Device shortage duration and contributors.

### Out of scope

- Change the cadence threshold, debounce, selected modes, or physical memory-fab outcome.
- Claim that every coverage-deficit tick is recoverable factory loss.
- Rewrite content-addressed historical Candidate reviews solely to make old evidence current.
- Add aliases, migration logic, or backward-compatible parsing for the superseded cadence names.

## Acceptance

- [x] The current Blueprint/schema/runtime contract uses `downstream-coverage-recovery`, `minimumCoverageDeficitTicks`, `coverageDeficitEpisodes`, and `coverageDeficitTicks`, with no compatibility alias for the old cadence names.
- [x] CLI and Studio describe the signal as coverage deficit or coverage pressure and retain exact policy boundary, mode-job, activation, episode, and duration parity.
- [x] Material-input starvation evidence remains separately named, event-backed, and unchanged in meaning.
- [x] The five locked memory-fab cases retain the commissioned industrial outcomes and deterministic mode-selection behavior after current evidence is regenerated.
- [x] Full tests and browser verification pass against the strict current contract.

## Work

- [x] Audit current cadence timer semantics against event-backed furnace shortage evidence.
- [x] Rename Core types, schema, runtime state, metrics, validation, and tests without aliases.
- [x] Update CLI, Studio, project-local TypeScript APIs/research, current Blueprint/Candidate, and design documentation.
- [x] Relock affected Benchmarks and regenerate current immutable Run/Design evidence under the bumped engine version.
- [x] Complete focused, full-suite, CLI, and browser verification.

## Findings and decisions

- 2026-07-25 — Run `085-simulate` reports `198300` cadence-observed ticks but only `42456` event-backed furnace shortage ticks; the two quantities are not interchangeable.
- 2026-07-25 — Recovery selection must remain predictive. Requiring downstream `waiting-input` would move the decision after the shortage has already begun and can miss the useful upstream job-selection window.
- 2026-07-25 — `coverage deficit` is the exact public term because the runtime predicate is `resident destination items + exact incoming items < recoverBelowItems`; `material input starvation` remains reserved for event-backed productive opportunity loss.
- 2026-07-25 — This is a strict early-development contract migration. Historical content-addressed evidence may remain historical; active artifacts and regenerated authority must use only the current names.
- 2026-07-25 — The strict schema rejects the removed `downstream-starvation-recovery` and `minimumStarvationTicks` fields; no parsing or metrics alias was added.
- 2026-07-25 — The complete five-case cadence sweep retained the exact commissioned mode counts and case scores. The ten-second policy remains promotion-safe; steady, mixed-quality, and quality-excursion use `10/2`, lithography interruption uses `10/2`, and facility interruption uses `11/1` normal/recovery jobs.
- 2026-07-25 — Run `086-simulate` retains 87 valued deliveries, net value `342`, 12/12 completed lots, score `40.83351093666666`, `42.456 s` furnace material shortage, and `8 / 198.300 s` separately named ALD coverage-deficit evidence.
- 2026-07-25 — Design Run `459e984f034242d3ddf807592cbd312aa636db0dd066afd3b7305ef74503d137` rebuilds strict current authority, evaluates the same four bounded candidates, stops `frontier-exhausted`, and retains the unchanged commissioned Blueprint.

## Verification

- `bun run typecheck`
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'cadence control'`
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'cadence'`
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern 'cadence'`
- `bun run memory-fab:relock-benchmarks`
- `bun run ironworks:relock-benchmarks`
- `bun run memory-fab:research-adaptive-cadence`
- `bun run inm simulate examples/memory-fab --blueprint generated-dram-fab --world cleanroom --scenario production-window --objective dram-output --seed 42`
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 7 --json`
- `bun run inm inspect examples/memory-fab --blueprint generated-dram-fab --world cleanroom --scenario production-window --objective dram-output`
- `bun run test` — 238 package tests / 2008 expectations plus all 8 Ironworks project tests passed.
- Browser: `/memory-fab/factory/devices/deposition-1` showed the strict coverage-deficit boundary, activation, and duration labels with no old starvation label; `/memory-fab` showed separate event-backed material-input shortage and current Run/Design evidence with no console errors.

## Progress log

- 2026-07-25 — Plan created after comparing the current cadence timer with exact material-shortage attribution.
- 2026-07-25 — Strict contract migration, Benchmark relock, Run regeneration, and Design authority rebuild completed; final full-suite and browser verification remain.
- 2026-07-25 — Full repository and browser verification passed; plan completed.

## Completion

Shipped the strict coverage-deficit cadence contract through Core, CLI, Studio, project TypeScript, current Blueprint/Candidate, locked Benchmarks, immutable Run/Design authority, and durable design documentation. The predictive controller behavior and commissioned industrial outcomes are unchanged, while actual material starvation remains separately event-backed. A future physical improvement should be planned as a new exact input-path intervention rather than folded into this semantic contract change.
