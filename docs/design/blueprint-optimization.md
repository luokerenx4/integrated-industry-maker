# Blueprint synthesis and optimization loop

Status: target-rate planning, full blueprint synthesis, bounded research, explicit comparison, and CLI evaluation loop implemented.

Related: [[docs/design/material-contracts]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/power]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-comparison]], [[docs/CLI]].

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

## Capacity planning

The Objective defines a target Resource, delivery region, steady-state rate, hard constraints, and transparent weights. A deterministic two-phase material-balance solve minimizes finite raw demand first and installed process/logistics capacity second. Each Process/Device/mode combination is a separate candidate with its effective inputs, outputs, duration, and active power. It supports alternative recipes, production modes, multiple outputs, coproduct credit, and recycle loops without dropping auxiliary material or energy costs.

The capacity plan turns that solution into required Process machines, treatment Device and agent demand, extraction rate and reserve lifetime, local connection envelopes, station fleets, regional power, and stable actionable gaps. A local connection contributes capacity to Resource `r` only when `r` appears in its compiled exact allowlist; endpoint compatibility alone never satisfies a transport requirement. Research uses the same filter when choosing a lane to upgrade. The plan is recomputed after every accepted edit.

## Spatial synthesis

`synthesizeFactoryBlueprint()` starts with an empty Blueprint and only project-local definitions. Its regional material balance decides where upstream Processes run and which Resource crosses each boundary. It then:

1. selects compatible Process/Device/mode triples and exact multi-Resource bindings;
2. sizes machines by cycle rate and physical port/lane capacity;
3. inserts treatment Devices, agent production, and separately routed graded outputs for selected modes;
4. binds finite deposits and places extractors;
5. creates exact boundary and surplus consumers;
6. realizes fan-in/fan-out as explicit filtered junction trees;
7. creates finite-fleet parallel station pairs for regional flows;
8. writes the planned Resource as an exact allowlist on every local physical edge;
9. jointly selects project-local loader/line/unloader tiers and supported endpoint spans per physical edge;
10. globally chooses collision-free span-aware ground/raised paths;
11. synthesizes connected spatial power coverage and capacity;
12. compiles, plans, cold-start simulates, and atomically writes the Blueprint.

The generated factory has no synthetic capacity: every port, belt cell, stage, station, carrier, generator, and Device is ordinary compiled state. Synthesis selects `shortage-first` as its factory dispatch default and writes it onto every generated shared-fleet network, so local fan-out and planetary/interstellar contention respond to downstream batch coverage and Objective criticality; symmetric generated junction trees may explicitly retain round-robin arbitration.

## Research boundary

Research proposals are RFC 6902 patches limited to Blueprint `devices`, `connections`, `logisticsNetworks`, and `policies`. Worlds, deposits, assets, Processes, Scenarios, Objectives, simulator, and evaluator are benchmark inputs and cannot be patched.

Each candidate is applied to a copy, schema-validated, compiled, simulated, scored, and written as KEEP or REVERT. Strategy keys/history prevent immediate repetition. Built-in strategies currently cover recipe selection, planned machine expansion, logistics tier upgrades, station fleet expansion, power repair, buffering, measured-utilization duplication, factory policy cycling, and independent multi-route network cycling among FIFO, round-robin, and shortage-first dispatch.

## Source of truth

- Material solvers: `packages/inm-core/src/production-demand.ts`
- Capacity plan: `packages/inm-core/src/capacity-plan.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`
- Research/patch boundary: `packages/inm-core/src/research.ts`
- Blueprint comparison: `packages/inm-core/src/blueprint-comparison.ts`
- Evaluation: `packages/inm-core/src/evaluator.ts`
- CLI orchestration: `packages/inm-cli/src/commands.ts`

## Verification

```bash
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output scratch
bun run inm validate examples/ironworks --blueprint scratch --scenario cold-start
bun run inm plan examples/ironworks --blueprint scratch --scenario cold-start
bun run inm simulate examples/ironworks --blueprint scratch --scenario cold-start
bun run inm compare examples/ironworks --from-blueprint synthesized --to-blueprint scaled-factory --world scaled --scenario cold-start --objective scaled-production --seed 42
bun run inm research examples/ironworks --iterations 3 --seed 42
```

Tests must prove both static readiness and executable material delivery. A plan marked READY without a compileable, powered, routed, non-shortage simulation is insufficient evidence.

## Known next gaps

- Richer search beyond deterministic heuristics and continuous process placement.
- Joint placement/routing/power optimization instead of staged deterministic construction.
