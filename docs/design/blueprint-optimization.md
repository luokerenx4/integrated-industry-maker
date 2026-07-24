# Blueprint synthesis and optimization loop

Status: target-rate planning, fungible-flow synthesis, project-local TypeScript synthesis strategies, bounded research, explicit comparison, and CLI evaluation loop implemented.

Related: [[docs/design/material-contracts]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/work-center-specialization]], [[docs/design/logistics]], [[docs/design/power]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-comparison]], [[docs/design/coding-agent-optimization]], [[docs/CLI]].

## Product model

Blueprint automation is treated like software development:

```text
inspect files and compiled diagnostics
  → edit Blueprint JSON
  → inm validate / analyze / plan
  → inm simulate / test
  → evaluate metrics and objective score
  → KEEP or REVERT
  → repeat
```

AI edits project files and invokes the same CLI as a human. It does not manipulate the 3D scene or receive a permissive execution path.

Before keeping an edit, `inm compare` can isolate two named Blueprint files under one World, Scenario, Objective, catalog set, and seed. It returns the exact file patch, industrial semantic changes, both capacity plans, and deterministic score/metric deltas without modifying either Blueprint or writing a run artifact. See [[docs/design/blueprint-comparison]] for the comparison contract.

For autonomous Coding Agents, `inm benchmark` lifts the same controlled comparison into a locked, weighted multi-Scenario suite. One candidate Blueprint remains the only editable program; catalogs, baseline, case contract, seeds, horizons, simulator, and evaluator are hash-locked. It emits a single aggregate score plus per-case regression and capacity gates, turning the loop into a directly reviewable file-edit/CLI-evaluate task. See [[docs/design/coding-agent-optimization]].

## Capacity planning

The Objective defines a target Resource, delivery region, steady-state rate, hard constraints, and transparent weights. A deterministic two-phase material-balance solve minimizes finite raw demand first and installed process/logistics capacity second. Each Process/Device/mode combination is a separate candidate with its effective inputs, outputs, duration, and active power. It supports alternative recipes, production modes, multiple outputs, coproduct credit, and recycle loops without dropping auxiliary material or energy costs.

The capacity plan turns that solution into required Process machines, treatment Device and agent demand, extraction rate and reserve lifetime, local connection envelopes, station fleets, rated regional power, Scenario-integrated generated/demanded/unserved energy and storage envelopes, and stable actionable gaps. Positive rated headroom does not make a temporally deficient grid ready. A local connection contributes capacity to Resource `r` only when `r` appears in its compiled exact allowlist; endpoint compatibility alone never satisfies a transport requirement. Research uses the same filter when choosing a lane to upgrade. The plan is recomputed after every accepted edit.

## Spatial synthesis

`synthesizeFactoryBlueprint()` starts with an empty Blueprint and only project-local definitions. Its regional material balance decides where upstream Processes run and which Resource crosses each boundary. It then:

1. selects compatible Process/Device/mode triples and exact multi-Resource-to-physical-port bindings;
2. sizes machines by cycle rate and physical port/lane capacity;
3. inserts treatment Devices, agent production, and separately routed graded outputs for selected modes;
4. binds finite deposits and places extractors;
5. creates exact boundary and surplus consumers;
6. realizes fan-in/fan-out as explicit filtered junction trees;
7. creates finite-fleet parallel station pairs for regional flows;
8. writes the planned Resource as an exact allowlist on every local physical edge;
9. creates one explicit loader Device and one explicit unloader Device per physical edge, jointly selecting their project-local tiers, the line tier, and supported endpoint spans;
10. globally chooses collision-free span-aware ground/raised paths;
11. jointly selects a zero-unserved-energy generator/storage bundle under the Scenario curve, then synthesizes one connected spatial power component;
12. compiles, plans, cold-start simulates, and atomically writes the Blueprint.

The generated factory has no synthetic capacity: every port, backing buffer partition, belt cell, stage, station-owned carrier, generator, and Device is ordinary compiled state. Synthesis sizes carriers from full round-trip throughput, sets the minimum station batch to the planned production accumulated over a service cycle, and writes `shortage-first` onto every generated network. Local fan-out and routes competing for one source station's home fleet therefore respond to downstream batch coverage and Objective criticality; symmetric generated junction trees may explicitly retain round-robin arbitration.

### Project-local synthesis strategy

Tracked work orders cannot be flattened into the continuous material balance above. A project may therefore declare `inm.json.synthesis.strategy` as a relative TypeScript entry inside its own directory. `inm synthesize` passes that strategy a deeply frozen, data-only view of the selected empty/minimal Blueprint, project ids, catalogs, Product Routes, World, Scenario, and Objective. The strategy must synchronously return one ordinary Blueprint plus a compact summary.

Core executes the strategy twice and rejects nondeterministic output, schema-validates its result, compiles it, requires the same target-rate capacity plan used everywhere else, and exercises the selected Scenario before an atomic write. The strategy is project code, never a shared engine catalog or an evaluator escape hatch: it cannot alter assets, Processes, Routes, Scenario workload, Objective weights, or Benchmark locks. The generated Blueprint must explicitly own equipment qualification, lanes and sorter endpoints, reusable tooling, facility providers, maintenance, and power like any hand-authored factory.

`examples/memory-fab/strategies/reentrant-dram-fab.ts` is the first implementation. It expands `greenfield.blueprint.json` into a complete re-entrant DRAM line, then the public command proves compilation, capacity READY, physical route transitions, tracked-lot completion, and delivery under `production-window`. The same in-memory Blueprint is also valid input to the locked five-case Benchmark evaluator.

The `greenfield-dram-fab` [[docs/design/design-programs|Design Program]] composes that synthesis boundary with bounded robust search. It records the empty input hash and strategy source hash, normalizes the generated Blueprint onto the independent `generated-dram-fab` promotion target, evaluates every candidate through `greenfield-dram-design`, and requires strict zero-regression current-best Pareto preservation across all five locked cases before a candidate advances. It writes only immutable run evidence. The tuned `experiment` Blueprint is a different optimization line and is never used as the greenfield write target.

The first accepted greenfield line has crossed that boundary. Design continuation `d02580bc840c4eca68ba3c83acb77993a35805df4009f021fb73fb316102d500` promoted the exact best hash `2511191a2ddb542dce3d551ef539e278825a53362576d093cb1ff9381a8c9356` as project-local Candidate `commissioned-greenfield-dram-fab`. Candidate review applied its 74 operations to the empty commissioning site only after the unchanged five-case Benchmark returned `KEEP`; the checked-in receipt pins proposal, base, proposed, result, and per-case evidence. `generated-dram-fab` now contains that reviewed hash and is the project default. Synthesis remains available for independent authoring experiments under a new output id; it must not overwrite or impersonate the commissioned target.

Later optimization may expand the project catalog without changing the fixed evaluation contract. The commissioned continuous-metrology line adds one self-contained optional Device, then relocks only the resulting Device-catalog hash. Exact baseline and incumbent result objects remain byte-for-byte equal before and after relocking. Project-local TypeScript research jointly searches the physical asset and lot-release policy, but the public Design route still evaluates one restricted Blueprint patch through the same five cases, six absolute outcome guardrails, capacity gate, and current-best score boundary. Design Run `6ff818e82198f11bd8588d977544533a33a95684dd148dd352ed86bfea8038b5` promotes only the accepted `continuous-deep-metrology` Candidate; its reviewed four-operation patch selects the asset and `7/4 EDD` admission control. This preserves the division of authority: a project may add design options and hypotheses, while Core owns deterministic comparison and only Candidate review may move the live factory.

Catalog expansion does not imply commissioning. The later advanced-pattern-recovery study adds one Process, its single qualified Device, and one legal Route operation while leaving the selected Blueprint untouched. TypeScript research evaluates 27 bounded equipment/admission/dispatch variants against the relocked current Benchmark. Its closest `advanced-pattern-recovery + 6/3 EDD + 18 s escape` point improves aggregate score and four cases, repairs the particle-contaminated lot, and passes all six outcome guardrails plus capacity, capital, and area gates. Design Run `648dbe35b34b2fbe11a70766a73070f8cf55512da3e58cebdb0125e9db43dfc7` still refuses promotion because the timed lithography-interruption case regresses `0.429259` against a zero-regression leader boundary. The search retains the non-dominated branch, emits no Candidate, and regenerates only compatible incumbent Run evidence. This negative result is part of the optimization product: humans and Agents can inspect the physical upside and exact blocker without confusing option discovery with an authorized factory mutation.

An improving score is likewise not permission to consume a protected service outcome. Subsequent research found that servicing continuous metrology every four inspections improves all five case scores by reducing average WIP, despite adding maintenance, qualification, energy, queue time, cycle time, and late completions with no yield gain. The project responds by authoring one existing typed metric, `onTimeLots`, as a seventh hard outcome rather than changing evaluator weights or hiding the alternative. The relocked 35-threshold contract rejects that maintenance shortcut, while the advanced-recovery branch still passes every absolute outcome and remains blocked solely by its independent lithography-interruption score regression. This preserves the three distinct authorities: Objective prices acceptable trade, Benchmark declares non-negotiable industrial floors, and Design searches only inside both.

The commissioned input-starvation study applies the same boundary to an equipment control that is cheaper than buying capacity. Project-local TypeScript research first rejects three multi-chamber ALD replacements because the live factory has only `50` currency of build-cost headroom, and rejects an aggressive pulse regime because it moves waiting upstream. The bounded `agile-pulse` mode is then added as an ordinary ALD asset option and proposed through the commissioned Design provider with one exact `recipe.mode` patch. V5 Design Run `0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1` retains it as a Pareto branch: `+0.691655` weighted score and three improving cases are not sufficient because steady production regresses `0.375853` and facility interruption regresses `0.923040` against the zero-regression current best.

Current continuation `83adbe849e1322b171dcedb4e7df6328c2bfc49f4c1e84d23c995cadcfdfa0f0` reuses that verified branch, records it as proposal-exhausted when no honest repair applies, and evaluates only the four still-applicable seed interventions before stopping early. Inspection maintenance violates explicit service floors; all three alternate release windows lose aggregate score. The unchanged leader, empty promotion patch, and fully exhausted scheduler are the optimization result. No Candidate or live Blueprint mutation follows, while compatible Run `075-simulate` continues to prove that the expanded option catalog did not change commissioned operation.

## Research boundary

Research proposals are RFC 6902 patches limited to Blueprint `devices`, `connections`, `logisticsNetworks`, and `policies`. Worlds, deposits, assets, Processes, Scenarios, Objectives, simulator, and evaluator are benchmark inputs and cannot be patched.

Each candidate is applied to a copy, schema-validated, compiled, simulated, scored, and written as KEEP or REVERT. Strategy keys/history prevent immediate repetition. Built-in strategies currently cover recipe selection, planned machine expansion, work-center specialization, logistics tier upgrades, station fleet expansion, static power repair, measured profiled-generation expansion, measured intermittent-power storage sizing, buffering, measured-utilization duplication, factory policy cycling, and independent multi-route network cycling among FIFO, round-robin, and shortage-first dispatch. Work-center specialization extracts one qualified operation into a copied project-local tool, partitions exact Resource lanes, and ranks position/rotation with ground and elevated routes; see [[docs/design/work-center-specialization]]. Any strategy that splits, duplicates, replaces, or reroutes a physical connection rebuilds its explicit endpoint Devices so ownership, stage, position, rotation, asset tier, and distance remain one-to-one compile-time facts. Storage candidates require sufficient measured total energy and size ordinary project-local accumulator Devices against the observed contiguous deficit and peak discharge envelopes; generation candidates handle total-energy shortages and inherit the same regional Scenario profile.

## Source of truth

- Material solvers: `packages/inm-core/src/production-demand.ts`
- Capacity plan: `packages/inm-core/src/capacity-plan.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`
- Project-local synthesis boundary: `packages/inm-core/src/project-synthesis.ts`
- Research/patch boundary: `packages/inm-core/src/research.ts`
- Blueprint comparison: `packages/inm-core/src/blueprint-comparison.ts`
- Coding Agent benchmark: `packages/inm-core/src/benchmark.ts`
- Evaluation: `packages/inm-core/src/evaluator.ts`
- CLI orchestration: `packages/inm-cli/src/commands.ts`

## Verification

```bash
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output scratch
bun run inm synthesize examples/memory-fab --blueprint greenfield --scenario production-window --output scratch-dram-fab
bun run inm validate examples/memory-fab
bun run inm plan examples/memory-fab
bun run inm simulate examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design
bun run inm validate examples/ironworks --blueprint scratch --scenario cold-start
bun run inm plan examples/ironworks --blueprint scratch --scenario cold-start
bun run inm simulate examples/ironworks --blueprint scratch --scenario cold-start
bun run inm compare examples/ironworks --from-blueprint synthesized --to-blueprint scaled-factory --world scaled --scenario cold-start --objective scaled-production --seed 42
bun run inm benchmark examples/ironworks --benchmark autoresearch
bun run inm research examples/ironworks --iterations 3 --seed 42
```

Tests must prove both static readiness and executable material delivery. A plan marked READY without a compileable, powered, routed, non-shortage simulation is insufficient evidence.

## Known next gaps

- Richer search beyond deterministic heuristics and continuous process placement.
- Broader joint placement/routing/power optimization beyond the bounded work-center specialization search.
