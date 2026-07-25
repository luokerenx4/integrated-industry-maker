# Furnace supply-path recovery

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]]

## Outcome

Add and evaluate a bounded physical intervention family that measurably reduces the commissioned memory fab's exact `furnace-1` dielectric-stack input shortage, then commission only a five-case-safe improvement with shared human and Agent evidence.

## Context

Current Run `086-simulate` attributes `42.456 s` of productive furnace opportunity to one missing `dielectric-stack-lot@batch-input` for `rapid-anneal-dielectric-stack`. Its exact immediate supply-path partition is:

- `23.800 s` (`56.1%`) while `deposition-1` is processing;
- `8.756 s` (`20.6%`) while `deposition-1` waits for etched input;
- `9.900 s` (`23.3%`) while one lot is already in flight across the four-cell deposition-to-furnace lane.

The commissioned coverage controller improves portfolio score but leaves furnace shortage at exactly `42.456 s`; changing an upstream operating signal is therefore not proof of recovering this loss. The existing project-local `memory-fab:research-input-starvation` script also assumes a single deposition recipe and now fails against the commissioned two-mode cadence Blueprint, so the human/AI research loop cannot currently test the live factory.

## Scope

### In scope

- Repair the project-local TypeScript research tool for the strict current cadence Blueprint.
- Evaluate explicit process-capacity, immediate transport, and bounded combined supply-path interventions against all five locked cases.
- Require exact mixed-quality furnace-shortage delta, per-state delta, physical cost/power/area, score, and hard-outcome evidence.
- Add only measured project-local assets or Blueprint changes to the Design intervention portfolio.
- Regenerate current Run/Design evidence if and only if a candidate is commissioned.

### Out of scope

- Reinterpret coverage-deficit time as recoverable furnace loss.
- Hide transport time, upstream etch scarcity, capital, power, or area behind an abstract speed multiplier.
- Weaken current-best zero-regression or absolute industrial guardrails.
- Add backward compatibility for superseded research assumptions or artifact contracts.

## Acceptance

- [x] `memory-fab:research-input-starvation` runs against the current commissioned Blueprint and emits deterministic typed evidence for every bounded intervention.
- [x] Every claimed furnace intervention reports its exact change from `42.456 s` total and the `source-processing` / `source-waiting-input` / `transport-in-flight` partition.
- [x] A commissioned candidate must reduce furnace shortage, improve aggregate score, preserve every current-best case, pass every hard industrial outcome, and remain capacity-ready.
- [x] CLI, Studio, Benchmark, and Design expose the same addressed loss, exact patch, case evidence, and decision; rejected interventions remain inspectable.
- [x] Full tests and browser verification pass for any commissioned current evidence.

## Work

- [x] Partition the current furnace shortage by exact immediate supply state and identify the stale research entry point.
- [x] Repair the current TypeScript research harness and add bounded process/transport/combined variants.
- [x] Evaluate the five-case frontier and select a physically causal candidate or record exact blockers.
- [x] Integrate eligible interventions into the project Design provider and durable design documentation.
- [x] Refresh authority, verify all public surfaces, and complete the acceptance audit.

## Findings and decisions

- 2026-07-25 — Current furnace shortage is exactly conserved as `23.800 s` source processing + `8.756 s` source waiting + `9.900 s` transport in flight = `42.456 s`.
- 2026-07-25 — The commissioned ten-second coverage controller leaves furnace shortage unchanged, so activation and aggregate score are insufficient causal evidence for this plan.
- 2026-07-25 — A physical intervention must name which immediate supply-state partition it can change. Process-capacity, upstream-feed, and lane-time changes remain separately visible even when a combined candidate is evaluated.
- 2026-07-25 — The existing research script's single-recipe assumption is removed rather than supported as a legacy path.
- 2026-07-25 — Multi-chamber ALD points reduce shortage but exceed the commissioned factory's remaining `50` build-cost headroom. Halving immediate lane time reduces transport in flight `9.900 → 4.950 s` but recovers only `0.450 s` total because the saved interval becomes source wait.
- 2026-07-25 — `agile-pulse-fast` at `2/3` duration and `3/2` active power with a one-item/five-second trigger is the sole tested point that both reduces furnace shortage and preserves all five current-best cases. It improves aggregate current-best score `+1.084759` and the limiting case `+0.201089`.
- 2026-07-25 — Design Run `206067de7d3566d5793d078f2db05ecbceb3b2ccdd0122ecec70b8b0d5c8a217`, Candidate `commissioned-furnace-supply-recovery`, and review `04a1b22b3d1d952c98394a838bf054e833c4c8273ac7666da2ced6d398016aac` commission Blueprint `35ef45f0eb537a5e2f7a94b40b1e41bf74fb5f13fb21d067ed996443785ed144`.
- 2026-07-25 — Run `087-simulate` records `40.456 s` furnace shortage (`22.733` processing + `7.823` source wait + `9.900` in flight), exactly `2.000 s` below the reference and with `249.276` total shortage Device-seconds.

## Verification

- `bun examples/memory-fab/strategies/research/input-starvation.ts`
- `bun run inm validate examples/memory-fab --json`
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json`
- `bun run inm test examples/memory-fab`
- `bun run typecheck`
- `bun run docs:check`
- `bun run test`
- Studio `http://localhost:4176/`: project selection, Overview, Factory, Device inspector, current Design Run, Candidate review, and Run `087-simulate` render without browser errors.

Final verification completed with `238` package tests and `2008` assertions passing, both memory-fab project tests passing, all eight Ironworks smoke scenarios passing, and the locked five-case memory-fab Benchmark accepted.

## Progress log

- 2026-07-25 — Plan created from current event-backed shortage evidence and the failed live research command.
- 2026-07-25 — Repaired strict TypeScript research, evaluated the bounded physical frontier, commissioned the sole promotion-safe loss-reducing control, and refreshed shared operating evidence.

## Completion

The live factory now invokes a physically qualified fast ALD pulse only after a five-second downstream coverage deficit. The intervention recovers measured furnace shortage, improves every locked case, preserves all hard outcomes and capacity, and is inspectable through the same hashes and causal evidence in CLI, Studio, Benchmark, Design, Candidate review, and the current Run.
