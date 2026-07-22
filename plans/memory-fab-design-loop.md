# Memory-fab design loop

- Status: `completed`
- Updated: `2026-07-22`
- Related design: [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/design/operator-workbench]], [[docs/design/fab-capacity-planning]], [[docs/design/fab-loss-attribution]], [[docs/design/industrial-boundaries]]

## Outcome

Turn the memory-fab north star from a rich hand-authored simulation and collection of isolated research scripts into one project-local design program: an Agent or human can start from declared factory intent, obtain trustworthy causal design evidence, generate or select a feasible seed Blueprint, run a bounded robust search across allowed industrial decisions, inspect ranked immutable results, and promote one exact result into the existing Candidate review/apply lifecycle.

## Context

The engine already models re-entrant wafer lots, product routes, Q-time, setup, batching, reusable tooling, fab utilities, maintenance and qualification, quality excursions, Probe yield, packaging, product mix, energy, and multi-case Benchmark gates. The bundled project proves these mechanisms with seven locked experiments and many project-local TypeScript searches.

The missing product layer is design orchestration. A memory-fab Blueprint is still mostly hand-authored; `research` judges one Scenario and mutates the selected Blueprint as it goes; focused scripts each own a different search/result shape; and the project Overview can report capacity READY alongside nominal material warnings without explaining the realized loss chain. The system can evaluate many industrial choices, but it cannot yet receive one bounded design brief and own the complete propose → robustly evaluate → rank → review path.

INM remains pre-alpha. This plan may replace research and design contracts directly; it will not add compatibility readers or preserve parallel legacy orchestration once the shared program proves the same jobs.

## Scope

### In scope

- A strict project-local `design-programs/<id>.design.json` artifact selecting a seed policy, one locked Benchmark, a driver case, allowed decision families, and a bounded search budget.
- A Core-owned, deterministic design brief and design-run contract with exact input hashes, industrial status, proposal history, robust Benchmark evidence, best Blueprint snapshot, and immutable artifact paths.
- A public `inm design` workflow for discovery, inspection, execution, and exact-result promotion into a hash-pinned Candidate Change Set; no implicit Blueprint apply.
- Studio projection of the same programs, run evidence, ranking, decision effects, and Candidate handoff without browser-only state or prioritization.
- Route-aware fab decision evidence: capacity/loss attribution that separates process work, queue/starvation, batch formation, setup, maintenance/qualification, utility/tooling contention, failure/power, transport, and Q-time/quality consequences where the simulator owns that evidence.
- A feasible memory-fab seed-generation path that respects tracked re-entrant routes, physical tool qualification, facilities, reusable tooling, maintenance providers, explicit material lanes, and regional power rather than flattening the fab into a fungible recipe graph.
- Migration of useful project-local TypeScript searches into declared strategies or proposal providers under the shared program and retirement of superseded one-off orchestration.

### Out of scope

- Proprietary DRAM recipes, calibrated commercial fab claims, continuous geometry optimization, or nondeterministic real-world forecasting.
- Automatic application of a winning Blueprint, relaxed Benchmark locks, hidden utilization discounts, or optimizer authority over Worlds, assets, Routes, Scenarios, Objectives, or evaluator weights.
- Shared design programs or strategies across projects; every project remains self-contained and copies anything it wants to reuse.
- Compatibility aliases for the current pre-alpha research output once its replacement is complete.

## Acceptance

- [x] `examples/memory-fab` contains a strict self-contained Design Program that an Agent can discover from machine help/schema, inspect without writes, and execute with an explicit bounded budget.
- [x] One execution starts from a declared existing or synthesized seed, evaluates every proposed Blueprint through the program's locked multi-case Benchmark, and writes a replayable immutable design-run artifact without mutating the seed or candidate Blueprint.
- [x] A design run exposes deterministic proposal identity, allowed decision family, exact patch/snapshot hashes, per-case evidence, gate reasons, score/risk trade-offs, and one ranked best result; identical inputs and budget reproduce the same result hash.
- [x] Promotion creates one ordinary Candidate Change Set pinned to the current Benchmark candidate Blueprint; review, confirmation, KEEP, hash guards, atomic apply, and verified/stale state remain owned by the existing shared Candidate lifecycle.
- [x] CLI, Core, Studio API, and visible Studio surfaces project the same Design Program/run/next-action objects and effects; an Agent never needs to scrape prose and a human never needs raw JSON to understand the leading design.
- [x] Fab diagnosis explains the primary realized loss chain and named loss buckets for a completed compatible run; nominal tracked-route supply does not dominate the operator queue when stronger route/run evidence exists.
- [x] A blank or deliberately minimal memory-fab seed can be expanded into a compileable, target-rate-ready, powered and physically connected re-entrant factory, then exercised by at least one locked operating case.
- [x] Documentation, public schemas/help, focused tests, full test gates, and desktop/390 px browser QA pass without incidental mutation of checked-in projects.

## Work

- [x] Define the Design Program, design brief, and immutable design-run contracts; add Core catalog/schema validation and a first memory-fab program.
- [x] Implement bounded in-memory search over a locked Benchmark using explicit decision families; persist deterministic runs without Blueprint mutation.
- [x] Add CLI discovery/inspect/run sections and exact promotion into Candidate Change Sets, with public-binary parity tests.
- [x] Project programs, runs, ranking, and Candidate handoff through the Studio API and route-backed human workbench.
- [x] Add compatible-run fab loss attribution and route-aware diagnostic priority shared by CLI and Studio.
- [x] Extend synthesis with the first tracked re-entrant memory-fab seed path and prove compile/plan/simulate/Benchmark viability.
- [x] Migrate useful memory-fab TypeScript searches into the shared strategy/provider boundary and remove superseded orchestration.
- [x] Complete docs, examples, browser QA, full-suite audit, commit, and push.

## Findings and decisions

- 2026-07-22 — The current north star is evaluator-rich but authoring-poor: 56 placed Devices, 15 Processes, one tracked Route, seven Benchmarks, and 53 historical runs are coordinated by focused scripts rather than one design contract.
- 2026-07-22 — Design execution must use locked multi-case Benchmark evidence. The existing `research` command's single-Scenario KEEP decision is useful strategy infrastructure but cannot be the authority for a robust Design Program.
- 2026-07-22 — `evaluateBlueprintBenchmark()` already accepts an in-memory candidate Blueprint, and `HeuristicResearchAgent` already emits restricted RFC 6902 proposals. The first vertical slice can compose these authorities without temporary Blueprint writes.
- 2026-07-22 — The first program will allow an existing seed; tracked-route greenfield synthesis remains a later acceptance milestone rather than being faked by the current fungible-flow synthesizer.
- 2026-07-22 — A design run creates immutable evidence only. Selecting a result and applying it are separate promotion and Candidate-review operations.
- 2026-07-22 — V1 programs require their existing seed to equal the locked Benchmark candidate Blueprint. This keeps eventual Candidate promotion hash-pinned; greenfield synthesis will deliberately replace this restriction when it owns a complete feasible seed contract.
- 2026-07-22 — Candidate acceptance uses the complete locked Benchmark, while the named driver case only supplies proposal diagnostics and metrics. A candidate must both pass every Benchmark gate and strictly improve on the current in-memory best.
- 2026-07-22 — Completed Design Runs are reopened by content hash. Promotion rejects seed-only results, verifies current Program/Benchmark/engine/seed identity, reproduces the exact leading Blueprint as one Candidate patch, and never bypasses Candidate review/apply.
- 2026-07-22 — The full six-candidate heuristic budget produced no improvement beyond the already tuned `experiment` seed. The evaluator is behaving honestly, but the generic strategy set is not yet a sufficient memory-fab designer; project-local fab strategies remain necessary.
- 2026-07-22 — Five-case evaluation currently scales linearly with candidate count and emits no progress evidence. Safe evaluation reuse and machine-readable progress belong after the first complete vertical slice.
- 2026-07-22 — Studio Design is an explicit project-qualified surface, not browser-only orchestration. Routes address Programs and result hashes; the API delegates to Core; the UI exposes bounded execution, readiness, ranking, iteration effects, honest seed leadership, and Candidate handoff.
- 2026-07-22 — Run compatibility now requires the complete current project hash set, not just selection ids and engine version. Compatible tracked-lot evidence ranks realized losses above nominal warnings while capacity blockers retain authority.
- 2026-07-22 — Fab bucket scores deliberately overlap and only prioritize investigation; the product does not mislabel them as additive foregone output or calibrated causal recovery.
- 2026-07-22 — Tracked-route greenfield synthesis is a project-owned synchronous TypeScript strategy behind the shared `inm synthesize` contract. Core runs it twice, schema-validates, compiles, plans, exercises the selected Scenario, and writes only after the strategy returns a deterministic feasible ordinary Blueprint.
- 2026-07-22 — The empty `greenfield` memory-fab seed expands to 56 Devices and 16 explicit lanes. The four-minute locked workload releases 12 lots, completes 5, records 10 re-entrant transitions, remains capacity READY, and runs as an in-memory candidate through all five locked Benchmark cases.
- 2026-07-22 — Design Programs now accept a confined project-local proposal provider whose source participates in the Program hash. The memory-fab provider found a gate-passing 9-card/6-reopen CONWIP improvement (`+0.410863` versus the tuned seed) in its first bounded candidate.
- 2026-07-22 — Eight focused exhaustive searches moved under the self-contained memory-fab project. The obsolete generator that copied assets from ironworks was removed; checked-in assets and the project seed strategy are now the only memory-fab authoring sources.

## Verification

- `bun run docs:check` — 466 documentation double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, and both project asset packages pass.
- `bun test packages/inm-core/src/design-program.test.ts` — 4 tests and 24 expectations pass: strict/read-only brief, invalid contract rejection, deterministic execution/reopen/reuse, seed-only promotion refusal, exact leading-result Candidate replay, and byte-identical seed.
- `bun test packages/inm-cli/src/commands.test.ts` — 13 public-binary tests and 192 expectations pass, including Design list/brief/run/reopen and structured compatible-run loss attribution.
- `bun test packages/inm-core/src/workbench.test.ts` — 6 tests and 42 expectations pass, including exact run hash compatibility, deterministic memory-fab loss ranking, priority above nominal analysis, and read purity.
- `bun test packages/inm-studio/src/routes.test.ts` — 4 route reconstruction tests and 23 expectations pass, including Design Program and Design Run deep links.
- `bun test packages/inm-studio/src/server.test.ts` — 2 server tests and 65 expectations pass, including real memory-fab Design list/brief/execute/reopen/no-leader-promotion behavior and byte-identical seed.
- Browser QA at desktop and 390 px — `memory-fab/designs/integrated-dram-fab/runs/843724d…` loads without console warnings/errors; the project provider is visible, the improving `KEEP` result ranks first, and the 390 px viewport has no horizontal overflow.
- `bun test packages/inm-core/src/project-synthesis.test.ts` — deterministic empty-site generation, compile, capacity READY, operating Scenario, re-entry, delivery, and five-case Benchmark viability pass.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — project-local provider is deterministic, returns one allowed confined patch, and produces a compileable Blueprint.
- Public `inm design ... --run --max-candidates 1` on an isolated memory-fab copy — provider proposal `dispatch:conwip-9-6-edd` passes all locked gates and improves aggregate candidate score by `+0.410863`.
- `bun run memory-fab:research-qtime --json` — moved project-local focused research entry executes successfully against all five Benchmark cases.
- `bun run test` — documentation, TypeScript, 186 Core/CLI/Studio tests with 1,532 expectations, and all eight Ironworks project tests pass.

## Progress log

- 2026-07-22 — Plan created after auditing the memory-fab workbench, current compatible evidence, static warnings, generic synthesis, single-Scenario research loop, locked Benchmark evaluator, and Candidate decision lifecycle.
- 2026-07-22 — Added the strict project-local Design Program schema/catalog/brief, `integrated-dram-fab` fixture, decision-family-constrained heuristic search, locked-Benchmark KEEP rule, content-addressed immutable design runs, and public CLI discovery/inspect/run workflow.
- 2026-07-22 — Added verified hash-addressed Design Run listing/reopen, exact winner-to-Candidate promotion, stable no-leader refusal, public CLI next actions, and Core/public-binary parity coverage.
- 2026-07-22 — Added the Studio Design control room, project-qualified Design APIs and routes, desktop/390 px industrial layout, real UI execution/ranking verification, and route/server tests.
- 2026-07-22 — Added V3 compatible-run fab loss attribution, full-hash evidence gating, named loss buckets, Core-owned diagnostic priority, `inspect --section losses`, Studio selection/run parity, and a visible Realized Fab Loss Chain.
- 2026-07-22 — Added the project strategy synthesis boundary, deterministic memory-fab greenfield generator, empty seed, compile/plan/Scenario/Benchmark proof, and public CLI reporting.
- 2026-07-22 — Added deterministic project-local Design proposal providers, migrated memory-fab to its own provider, moved all focused research tools into the project, and removed the cross-project regeneration script.
- 2026-07-22 — Proved the project provider with immutable run `843724d…`, exposed its contract in Studio, completed desktop/390 px browser QA, passed the full suite, and closed the plan.

## Completion

Completed on 2026-07-22. Memory-fab now owns its greenfield synthesis strategy, proposal provider, focused research tools, locked multi-case design evaluation, immutable result evidence, and human/AI review surfaces without borrowing another project's assets.
