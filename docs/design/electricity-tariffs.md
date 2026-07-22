# Electricity tariff evaluation

Status: Scenario-owned regional time-of-use prices, simultaneous metered peak demand, Objective scoring, CLI/report/Studio projection, and memory-fab Blueprint research implemented through `inm-sim/0.74.0`.

Related: [[docs/design/power]], [[docs/design/equipment-energy-states]], [[docs/design/coding-agent-optimization]], [[docs/design/simulation-runtime]], [[docs/PROJECT_FORMAT]].

## Ownership boundary

Electricity economics belong to the fixed Scenario and evaluator, not the editable Blueprint. A tariff names one region, a repeating piecewise-constant energy-price curve, and a peak-demand rate. The candidate may change equipment count, sleep control, scheduling, storage, generation, or topology, but cannot rewrite the market used to judge those choices. This preserves the file → CLI → evaluator → keep/discard loop.

Each region has at most one tariff. Price points start at tick zero, are strictly increasing, and repeat at `periodTicks`. Prices use integer micro-currency per kWh; demand rates use integer micro-currency per kW. One kWh equals 3,600,000,000 mJ.

## Runtime measurement

The simulator integrates actual served plant energy over every constant-load interval and splits intervals at exact tariff boundaries. It sums simultaneous delivered power across every compiled grid in a region before updating that region's peak. Unserved requested load is not billed as demand.

The demand charge is `regional peak kW × demand rate` once per simulation run. It is intentionally a run-horizon benchmark charge, not an implicit monthly billing calendar. A future procurement layer may model billing periods, utility imports, onsite-generation settlement, fuel, carbon, and net metering. The current contract is gross internal plant-load valuation so those concerns are not silently conflated.

Metrics expose regional consumed energy, energy charge, peak demand, demand charge, and total cost. `power.electricity-price-changed` records the initial price and each actual price transition. CLI simulation, comparison, benchmarks, immutable reports, and Studio project the same evaluator-owned values. `weights.electricityCost` applies a score penalty in currency units; physical `weights.energy` remains independent.

## Memory-fab proof

`equipment-energy-research` freezes two six-lot waves and a four-period cleanroom tariff. The furnace asset owns hot-standby, sleep, and wake physics; the candidate changes exactly `policy.idleEnergy.sleepAfterTicks`. `bun run memory-fab:research-energy` performs a bounded TypeScript threshold search, and the locked benchmark accepts only a capacity-ready, per-case-gate-passing cost reduction.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "time-of-use electricity|sleep"
bun run inm benchmark examples/memory-fab --benchmark equipment-energy-research
bun run memory-fab:research-energy
```

Tests must cover exact price boundaries, regional simultaneous peak aggregation, served-versus-requested demand under shortage, schema/compiler rejection, score accounting, one-file Blueprint comparison, and every public projection.
