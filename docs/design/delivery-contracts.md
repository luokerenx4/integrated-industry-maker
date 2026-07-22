# Delivery contracts

Status: evaluator-owned multi-product demand floors, joint capacity planning, and Blueprint marginal-value dispatch implemented in `inm-sim/0.67.0`.

Related: [[docs/design/industrial-boundaries]], [[docs/design/fab-capacity-planning]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

## Boundary

A factory Objective may declare several delivery contracts. Each contract binds one untracked product Resource to one customer region and fixes four economic terms outside the editable Blueprint: demand per minute, unit value, shortfall penalty, and an optional minimum-fulfillment gate. A product Resource belongs to at most one contract so delivery is never valued twice.

Demand is a service floor, not a production ceiling. Over a Scenario duration, contract value is:

```text
delivered × valuePerItem
  − max(0, demand − delivered) × shortfallPenaltyPerItem
```

All delivered units therefore remain valuable. Delivery below demand loses product value and pays the extra shortage penalty; delivery above demand is reported separately as overflow but still earns product value. Demand attainment may exceed 100%. This is important for shortage markets such as memory: the optimizer should not idle a productive line merely because the nominal order floor has been covered.

`minimumFulfillment` remains a hard service gate and is evaluated against delivered/demand. `weights.deliveryValue` applies to aggregate net contract value per simulated minute. Ordinary throughput, work-order service, quality, WIP, energy, capital, and area remain independent Objective terms.

## Planning and runtime

`inm plan` treats all contract demand floors as one material-balance problem. Alternative recipes and fixed coproduct ratios are solved jointly, so one reliability-screen cycle can satisfy commercial, performance, and automotive demand without being counted three times. The plan proves nominal floor capacity; it does not cap runtime output.

A qualified work center may set `policy.recipeDispatch` to `contract-value`. For each ready Process the simulator estimates marginal contract value per equipment tick:

```text
all output × unit value
  + output still below committed demand × avoided shortfall penalty
```

Committed demand includes delivery, local buffers, inbound transport, and active-job output. This prevents a scheduler from repeatedly choosing a shortage product whose already-started work will fill the gap. Once all floors are covered, dispatch continues with the most valuable feasible product mix rather than stopping.

The policy lives in the Blueprint; contracts and evaluation live in the locked harness. A Coding Agent can therefore change production control without changing its exam.

## DRAM north-star model

The memory-fab project turns qualified wafer lots into a realized count of known-good dies at Probe, packages each die, and then selects between commercial screen and extended reliability/speed-bin programs. Three contracts represent commercial, performance, and automotive grades. Their timing, yields, and values are synthetic, but the abstraction deliberately separates:

- identity-preserving wafer work-order flow;
- terminating wafer-Probe yield conversion;
- die-by-die packaging;
- fungible product grading;
- customer demand floors and shortage economics;
- equipment-time competition among test programs.

This boundary is the first useful real-industry optimization problem: adding capacity, changing routing, or changing test dispatch can improve the same locked portfolio score, while the CLI exposes exactly why.

## Verification

```bash
bun run inm plan examples/memory-fab --blueprint experiment
bun run inm simulate examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Tests must cover coproduct balance, above-demand valuation, shortage penalties, hard fulfillment gates, in-flight commitment accounting, and benchmark lock drift.
