# Spatial power design

Status: connected regional grids, renewable/fuel generation, deterministic accumulators, interruption-safe Device jobs, endpoint load, and synthesized coverage implemented.

Related: [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-optimization]].

## Scope

This document owns distributor topology, consumer coverage, generation, fuel burn, grid-local allocation, accumulators, interruption/resumption, transport endpoint power, analysis, and power synthesis.

## Grid compilation

Power is spatial and region-local. Distributor Devices within the minimum of their connection ranges form deterministic connected components. Components never cross regions. A consuming Device joins the nearest component whose distributor coverage contains its center.

Loader and unloader stages are spatial consumers at the first and last belt cells. Lines themselves do not draw endpoint power. A recipe Device contributes the active power of its selected production mode, while other Devices contribute their asset base consumption. Every compiled grid records distributors, Device members, transport stages, rated generation, rated consumption, storage members, energy capacity, and aggregate charge/discharge limits.

## Accumulator contract

A power-capable Device may declare one storage envelope:

```json
"power": {
  "consumptionMilliWatts": 0,
  "distribution": { "connectionRange": 20, "coverageRange": 20 },
  "storage": {
    "capacityMilliJoules": 3600000,
    "chargeMilliWatts": 400000,
    "dischargeMilliWatts": 400000
  }
}
```

Storage requires `power` capability and distribution, so a placed accumulator is both a spatial grid member and a topology node. One asset cannot combine generation and storage; these remain separate physical roles that optimizers can add, remove, and cost independently. Capacity, charge, and discharge are positive integers. The selected Scenario may assign startup energy by Device id through `initialEnergyMilliJoules`; the compiler rejects unknown Devices, non-storage Devices, and values above physical capacity. Omitted startup energy is zero.

## Runtime generation and allocation

Renewable output is continuously available while its Device is healthy. Fuel generation exists only during a host-validated burn job. Fuel energy and generator output deterministically derive burn duration; loading and spending are semantic events.

For every interval between scheduled events, the runtime measures a constant generation/load state. A grid deficit draws energy from healthy non-empty storage in stable Device-id order, bounded independently by each accumulator's stored energy and discharge rate. A surplus charges healthy non-full storage in the same order, bounded by headroom and charge rate. The simulator schedules an internal event at the first exact integer-tick full/depleted boundary; it therefore rebalances power when the envelope changes rather than discovering a shortage only at the next unrelated production event. Energy moves only once through `energy.storage` state mutations and is conserved in per-Device and per-grid initial, final, charged, and discharged ledgers.

Active Device jobs, persistent infrastructure, and active loader/unloader stages draw from their own compiled grid. Existing production/extraction jobs are allocated before new work and in stable Device-id order. If generation plus available discharge cannot cover an existing job, the runtime records its worked and remaining ticks, invalidates the old completion event, changes the Device to `unpowered`, and keeps its already-consumed inputs or extraction reservation. When power returns, the same job resumes for exactly its remaining ticks; it neither restarts nor consumes inputs twice. Fuel-generation jobs do not consume grid power and therefore are not paused by their own output loss. A failed Device still follows failure semantics: its active job ends, and an extraction reservation is released.

A disconnected or underpowered loader cannot advance cargo and propagates belt backpressure. Endpoint restoration remains separate from Device-job restoration because transport stages are transient infrastructure activity rather than material-transforming jobs.

## Static and measured meaning

Storage shifts energy across time; it is not steady-state generation. `productionMilliWatts` and capacity-plan headroom therefore exclude discharge capacity. A grid with negative rated headroom remains a sustained-power warning even if a large accumulator can mask it temporarily. Static analysis separately exposes each storage Device, startup energy, capacity, charge/discharge rates, and grid aggregates.

Runtime metrics expose final/capacity energy plus cumulative charged/discharged energy per grid and `unpoweredTime` per Device. `power.storage-full` and `power.storage-depleted` identify physical boundaries. `power.shortage` optionally carries worked/remaining job ticks when it pauses active work, and `power.restored` carries the remaining duration used for replay. CLI simulation, immutable reports, Blueprint comparison, and Studio consume these same values.

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
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "power|storage|restored generation|parallel lanes"
bun run inm plan examples/ironworks
bun run inm analyze examples/ironworks
bun run inm simulate examples/ironworks --seed 42
```

The accumulator tests prove continuous surplus charging, exact depletion boundaries, retained input consumption, paused progress, and exact remaining-work resumption after a timed generator failure. High-throughput synthesis uses default 20-cell connection/coverage ranges on an 80×80 world and must compile one connected grid per active region, power every consuming Device and endpoint, and emit no shortage event.

## Known next gaps

- Time-varying renewable curves and Scenario-controlled generator output.
- Grid priority tiers and deliberate brownout policies.
- Optimizer/synthesizer strategies that size accumulators from measured temporal deficits.
- Non-renewable generator selection during synthesis when fuel economics are favorable.
