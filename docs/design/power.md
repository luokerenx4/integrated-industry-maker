# Spatial power design

Status: connected regional grids, renewable/fuel generation, endpoint load, and synthesized coverage implemented.

Related: [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-optimization]].

## Scope

This document owns distributor topology, consumer coverage, generation, fuel burn, grid-local allocation, transport endpoint power, analysis, and power synthesis.

## Grid compilation

Power is spatial and region-local. Distributor Devices within the minimum of their connection ranges form deterministic connected components. Components never cross regions. A consuming Device joins the nearest component whose distributor coverage contains its center.

Loader and unloader stages are spatial consumers at the first and last belt cells. Lines themselves do not draw endpoint power. A recipe Device contributes the active power of its selected production mode, while other Devices contribute their asset base consumption. Every compiled grid records distributors, Device members, transport stages, rated generation, and rated consumption.

## Runtime generation and allocation

Renewable output is continuously available while its Device is healthy. Fuel generation exists only during a host-validated burn job. Fuel energy and generator output deterministically derive burn duration; loading and spending are semantic events.

Active Device jobs, persistent infrastructure, and active loader/unloader stages draw from their own compiled grid. A disconnected or underpowered endpoint cannot advance cargo and propagates belt backpressure. Shortage/restoration events identify the Device or connection stage and grid.

## Synthesis

Power synthesis runs after machinery and belt routing because endpoint cells are part of the load geometry.

1. Enumerate consuming Device centers and powered loader/unloader cells per region.
2. Place the first renewable distributor within coverage of the first deterministic target.
3. For each uncovered target, place connected bridge distributors that reduce target distance.
4. Continue until every target is covered by one connected regional component.
5. Compute required capacity from net generation and add connected distributors until rated demand is met.

The result reports actual distributor count, minimum capacity count, coverage target count, gross generation, and rated load. Extra Devices beyond the capacity minimum are explicit spatial infrastructure, not hidden watts.

## Source of truth

- Asset power schema and types: `packages/inm-core/src/schema.ts`, `packages/inm-core/src/types.ts`
- Component/coverage compilation: `packages/inm-core/src/compiler.ts`
- Allocation and events: `packages/inm-core/src/simulator.ts`
- Analysis and planning: `packages/inm-core/src/production-analysis.ts`, `packages/inm-core/src/capacity-plan.ts`
- Spatial synthesis: `packages/inm-core/src/synthesis.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "power|parallel lanes"
bun run inm plan examples/ironworks
bun run inm simulate examples/ironworks --blueprint synthesized --scenario cold-start
```

High-throughput synthesis uses default 20-cell connection/coverage ranges on an 80×80 world and must compile one connected grid per active region, power every consuming Device and endpoint, and emit no shortage event.

## Known next gaps

- Accumulators, charge/discharge priority, and time-varying renewable output.
- Grid priority tiers and deliberate brownout policies.
- Non-renewable generator selection during synthesis when fuel economics are favorable.
