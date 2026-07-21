# Blueprint synthesis and optimization loop

Status: target-rate planning, full blueprint synthesis, bounded research, explicit comparison, and CLI evaluation loop implemented.

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

## Research boundary

Research proposals are RFC 6902 patches limited to Blueprint `devices`, `connections`, `logisticsNetworks`, and `policies`. Worlds, deposits, assets, Processes, Scenarios, Objectives, simulator, and evaluator are benchmark inputs and cannot be patched.

Each candidate is applied to a copy, schema-validated, compiled, simulated, scored, and written as KEEP or REVERT. Strategy keys/history prevent immediate repetition. Built-in strategies currently cover recipe selection, planned machine expansion, work-center specialization, logistics tier upgrades, station fleet expansion, static power repair, measured profiled-generation expansion, measured intermittent-power storage sizing, buffering, measured-utilization duplication, factory policy cycling, and independent multi-route network cycling among FIFO, round-robin, and shortage-first dispatch. Work-center specialization extracts one qualified operation into a copied project-local tool, partitions exact Resource lanes, and ranks position/rotation with ground and elevated routes; see [[docs/design/work-center-specialization]]. Any strategy that splits, duplicates, replaces, or reroutes a physical connection rebuilds its explicit endpoint Devices so ownership, stage, position, rotation, asset tier, and distance remain one-to-one compile-time facts. Storage candidates require sufficient measured total energy and size ordinary project-local accumulator Devices against the observed contiguous deficit and peak discharge envelopes; generation candidates handle total-energy shortages and inherit the same regional Scenario profile.

## Source of truth

- Material solvers: `packages/inm-core/src/production-demand.ts`
- Capacity plan: `packages/inm-core/src/capacity-plan.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`
- Research/patch boundary: `packages/inm-core/src/research.ts`
- Blueprint comparison: `packages/inm-core/src/blueprint-comparison.ts`
- Coding Agent benchmark: `packages/inm-core/src/benchmark.ts`
- Evaluation: `packages/inm-core/src/evaluator.ts`
- CLI orchestration: `packages/inm-cli/src/commands.ts`

## Verification

```bash
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output scratch
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
