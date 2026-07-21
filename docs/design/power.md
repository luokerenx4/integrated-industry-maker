# Spatial power design

Status: connected regional grids, proportional satisfaction and priority load shedding, explicit idle/active Device envelopes, sorter loads, station charging, high-speed carrier energy, Scenario-driven intermittent renewables, fuel generation, deterministic accumulators, interruption-safe Device and sorter-stage work, temporal capacity planning, measured generation/storage research, and joint synthesis implemented through engine version `inm-sim/0.48.0`.

Related: [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-optimization]].

## Scope

This document owns distributor topology, consumer coverage, generation, fuel burn, grid-local allocation, accumulators, interruption/resumption, transport endpoint power, analysis, and power synthesis.

## Grid compilation

Power is spatial and region-local. Distributor Devices within the minimum of their connection ranges form deterministic connected components. Components never cross regions. A consuming Device joins the nearest component whose distributor coverage contains its center.

Explicit loader and unloader Devices are spatial consumers at their authored first and last belt cells, after applying their sorter distances from the machine ports. They join the local grid as independent Device instances, continuously draw their idle baseline, and rise to their active total while moving cargo; the line itself does not draw endpoint power. A recipe Device contributes the active power of its selected production mode, clamped to at least the asset idle baseline. Every compiled grid records distributors, Device members (including connected sorters), transport stages, rated generation, idle consumption, rated consumption, storage members, energy capacity, and aggregate charge/discharge limits.

## Device power envelope

Every Device asset declares both values explicitly:

```json
"power": {
  "idleMilliWatts": 10000,
  "activeMilliWatts": 180000
}
```

`idleMilliWatts` is the connected standby baseline. `activeMilliWatts` is the total draw during work and already includes that baseline, so runtime demand is `idle + (active - idle)`, never `idle + active`. The compiler rejects `idle > active`; there is no legacy single-power field or migration fallback.

The Blueprint's required `policies.powerAllocation` selects either `proportional` or `priority-load-shedding`. Generated Blueprints use `proportional`, the game-style shared-grid model. Every Blueprint Device may also author `policy.powerPriority` as a non-negative integer for `priority-load-shedding`: higher priority receives finite grid power first, with stable Device id resolving equal tiers. The priority applies to the complete envelope, so an active high-priority job reserves both its standby baseline and active-minus-idle delta before lower-ranked standby loads are admitted. Omission means priority zero; there is no implicit asset class priority.

In proportional mode, each grid computes one satisfaction value as `min(1, available / requested)` in integer parts per million. Every healthy connected consumer receives that fraction: zero supply blocks it, while any positive supply allows it to start or continue at scaled speed. In priority mode, healthy members receive standby and active power in rank order. A Device whose complete envelope cannot be served becomes `unpowered`; a higher-ranked pending job or sorter stage may preempt lower-ranked active work and persistent standby infrastructure. When baseline power returns, `power.standby-restored` makes an idle Device eligible for evaluation again. Requested-demand metrics retain every unserved request in both modes.

## Accumulator contract

A power-capable Device may declare one storage envelope:

```json
"power": {
  "idleMilliWatts": 0,
  "activeMilliWatts": 0,
  "distribution": { "connectionRange": 20, "coverageRange": 20 },
  "storage": {
    "capacityMilliJoules": 3600000,
    "chargeMilliWatts": 400000,
    "dischargeMilliWatts": 400000
  }
}
```

Storage requires `power` capability and distribution, so a placed accumulator is both a spatial grid member and a topology node. One asset cannot combine generation and storage; these remain separate physical roles that optimizers can add, remove, and cost independently. Capacity, charge, and discharge are positive integers. The selected Scenario may assign startup energy by Device id through `initialEnergyMilliJoules`; the compiler rejects unknown Devices, non-storage Devices, and values above physical capacity. Omitted startup energy is zero.

## Environmental renewable profiles

Rated renewable output belongs to the Device asset; temporal availability belongs to the Scenario. A Scenario may declare piecewise-constant periodic `renewableProfiles`, each scoped to one region and optionally one Device asset. Points use integer `outputPermille` from 0 through 1000, begin at phase tick zero, remain strictly ordered before `periodTicks`, and repeat exactly.

The scope is environmental rather than instance-specific. Every matching renewable Device in the Blueprint—including a Device later added by research—receives the same curve, so optimization cannot evade wind or solar conditions by inventing an unprofiled instance. Overlapping scopes for one compiled Device are rejected. Profile boundaries are scheduled events, and `power.generation-changed` records rated and current output for replay.

## Runtime generation and allocation

Renewable output follows its selected Scenario profile while its Device is healthy; without a matching profile it remains at rated output. Fuel generation exists only during a host-validated burn job. Fuel energy and generator output deterministically derive burn duration; loading and spending are semantic events.

For every interval between scheduled events, the runtime measures a constant generation/load state. A grid deficit draws energy from healthy non-empty storage in stable Device-id order, bounded independently by each accumulator's stored energy and discharge rate. A surplus charges healthy non-full storage in the same order, bounded by headroom and charge rate. The simulator schedules an internal event at the first exact integer-tick full/depleted boundary; it therefore rebalances power when the envelope changes rather than discovering a shortage only at the next unrelated production event. Energy moves only once through `energy.storage` state mutations and is conserved in per-Device and per-grid initial, final, charged, and discharged ledgers.

Idle baselines, active Device jobs, persistent infrastructure, and active loader/unloader stages draw from their own compiled grid. In proportional mode, every satisfaction change first checkpoints full-speed-equivalent work already completed, invalidates the old completion event, and schedules a new exact completion from the remaining work at the new fraction. Production, extraction, and treatment therefore slow and recover without restarting or consuming inputs twice. In priority mode, allocation uses authored `powerPriority` and then stable Device id across both standby and active deltas. Rejected work is checkpointed, paused as `unpowered`, and resumed for exactly its remaining ticks when capacity returns. Fuel-generation jobs do not consume grid power and therefore are not paused by their own output loss. A failed Device still follows failure semantics: its active job ends, and an extraction reservation is released.

Station carrier charging is a dynamic grid load separate from the station's idle envelope. A Blueprint explicitly chooses the charge request up to the asset maximum. Proportional grids deliver the current satisfaction fraction; priority grids allocate the complete request using the station Device's `powerPriority`. Delivered energy fills a station-local buffer until full, and carrier missions remove an exact distance-dependent amount at source departure. High-speed line haul shortens the fleet turnaround by applying the carrier's duration multiplier while increasing that same one-time source cost by its energy multiplier. The scheduler wakes when the buffer first reaches a waiting mission cost or its physical capacity, so charging does not depend on unrelated factory events.

A disconnected or zero-supply loader cannot advance cargo and propagates belt backpressure. Proportional satisfaction stretches powered loading and unloading duration with the same checkpoint/reschedule rule as production; the passive belt-travel phase stays at nominal speed. Priority preemption and failure preserve the exact remaining stage duration, so restoration resumes the same transit rather than restarting it. Endpoint restoration remains separate from Device-job restoration because transport stages are transient infrastructure activity rather than material-transforming jobs.

## Static and measured meaning

Storage shifts energy across time; it is not steady-state generation. `productionMilliWatts` and capacity-plan headroom therefore exclude discharge capacity. A grid with negative rated headroom remains a sustained-power warning even if a large accumulator can mask it temporarily. Static analysis separately exposes each storage Device, startup energy, capacity, charge/discharge rates, and grid aggregates.

The target-rate capacity plan adds a temporal design envelope without pretending that rated power is actual availability. It holds the Objective-derived regional load constant, integrates every matching Scenario renewable curve and configured generator across the full duration, then applies configured startup energy, capacity, charge power, and discharge power. A region is not power-ready when this envelope leaves energy unserved, even if rated headroom is positive. The plan reports generated/demanded/unserved/curtailed energy and the largest contiguous storage requirement as deterministic CLI/agent input.

Runtime metrics expose final/capacity energy plus cumulative charged/discharged energy per grid and `unpoweredTime` per Device. They also integrate generated, requested, served, unserved, and curtailed energy, peak generation/demand/deficit/surplus power, the largest contiguous raw deficit-energy episode, and average/minimum grid satisfaction. Requested demand retains a Device's rejected power request while it is unpowered, so shortage cannot disappear from measurement merely because work slowed or could not start.

`power.storage-full` and `power.storage-depleted` identify accumulator boundaries. `logistics.energy-full`, `logistics.energy-shortage`, and `logistics.energy-spent` expose station carrier-energy boundaries and mission cost. `power.satisfaction-changed` records grid demand, available power, and the new parts-per-million fraction. In priority mode, `power.shortage` covers rejected standby or active demand and optionally carries worked/remaining job ticks, `power.standby-restored` records standby recovery, `power.restored` carries the remaining active duration used for replay, and `transport.power-shortage` / `transport.power-restored` expose exact endpoint interruption. `power.generation-changed` exposes environmental boundaries. CLI simulation, immutable reports, Blueprint comparison, research, and Studio consume these same values; analysis displays allocation mode and every Device/logistics-stage priority.

## Measured storage research

The bounded research agent distinguishes energy creation from time shifting. It proposes storage only when the measured Scenario generated enough total energy (including Scenario startup storage) but temporal charge capacity, energy capacity, or discharge power still left demand unserved. It evaluates every project-local storage asset and sizes a connected bundle against:

- the largest contiguous deficit-energy envelope;
- peak deficit power;
- project-local charge-rate limits, verified by bounded re-simulation of increasing Device counts.

The proposal adds ordinary spatial Device instances near the affected grid and still passes through compile, simulation, score, and KEEP/REVERT. If total generated energy is insufficient, storage is not presented as a false repair; generation expansion remains a separate strategy.

Measured generation research handles that separate case. It evaluates project-local renewable assets under the same regional Scenario profile, estimates the energy shortfall, places connected generator candidates, and boundedly re-simulates increasing counts until the affected grid reaches zero unserved energy. Newly placed generators inherit the environmental curve by region/asset, so the strategy cannot manufacture constant output.

## Synthesis

Power synthesis runs after machinery and belt routing because endpoint cells are part of the load geometry.

1. Enumerate consuming Device centers and explicit powered loader/unloader Device cells per region.
2. Place the first renewable distributor within coverage of the first deterministic target.
3. For each uncovered target, place connected bridge distributors that reduce target distance.
4. Continue until every target is covered by one connected regional component.
5. Integrate the selected Scenario curve against the constant design load from an empty cold start.
6. Enumerate connected generator counts and project-local storage assets/counts, enforcing energy capacity and charge/discharge power at every profile interval.
7. Choose the lowest-build-cost feasible generator/storage bundle, then place every Device into the same spatial component.

The result reports actual distributor count, rated minimum, coverage target count, storage asset/count, gross generation/load, whether a profile applied, and generated/demanded/unserved Scenario energy. Extra Devices beyond the rated minimum and all storage are explicit spatial infrastructure, not hidden watts. If no empty-cold-start bundle can serve the curve, synthesis fails instead of writing a rated-only Blueprint.

## Source of truth

- Asset power schema and types: `packages/inm-core/src/schema.ts`, `packages/inm-core/src/types.ts`
- Component/coverage compilation: `packages/inm-core/src/compiler.ts`
- Allocation and events: `packages/inm-core/src/simulator.ts`
- Analysis and planning: `packages/inm-core/src/production-analysis.ts`, `packages/inm-core/src/capacity-plan.ts`
- Temporal envelope solver: `packages/inm-core/src/power-envelope.ts`
- Spatial synthesis: `packages/inm-core/src/synthesis.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "power|storage|restored generation|parallel lanes"
bun run inm plan examples/ironworks
bun run inm analyze examples/ironworks
bun run inm simulate examples/ironworks --seed 42
```

The power tests prove idle energy while waiting, active totals without double-counting standby, proportional production slowdown across a mid-job generation boundary, proportional explicit-sorter loading/unloading with unchanged belt travel, authored priority overriding Device-id order, critical-job reservation, explicit sorter preemption and exact resumption, sorter standby energy, continuous surplus charging, exact depletion boundaries, retained input consumption, periodic renewable wakeups, integrated deficit envelopes, measured generation/storage research, and Scenario-ready synthesis. The `power-priority` coding-agent benchmark proves that changing only the critical assembler and sorter policies turns a stopped line into accepted delivery under a locked hard-allocation grid. The `power-satisfaction` benchmark proves that adding generation improves the same physical line under proportional allocation.

## Known next gaps

- Joint measured generator-plus-storage research bundles for grids that need both changes at once.
- Non-renewable generator selection during synthesis when fuel economics are favorable.
- Joint allocation planning for several routes competing for one station's charging budget.
- Carrier range, fuel or charging consumption, road/rail capacity, and technology-dependent high-speed service economics.
