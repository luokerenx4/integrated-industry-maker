# Logistics design

Status: physical local logistics, stacking, junctions, and finite station fleets implemented.

Related: [[docs/design/material-contracts]], [[docs/design/power]], [[docs/design/simulation-runtime]].

## Scope

This document owns local material movement, sorter/line stages, belt cells and levels, congestion, junction policies, planetary/interstellar station routes, and finite carrier fleets.

## Local connection model

Each Blueprint connection owns one source port, one target port, an explicit ordered grid path, a requested stack size, and three project-local transport assets:

```text
source buffer → loader → concrete belt cells → unloader → target buffer
```

Loader and unloader distance is one endpoint hop. Line distance equals routed cell count. Each asset's TypeScript `planTransport()` returns cargo capacity, duration, and stack capacity. The compiler intersects stage stack limits with the Resource asset's stack limit and computes independent stage clocks.

## Geometry and occupancy

- Paths begin/end at the exterior level-0 cells of real ports.
- Steps are cardinal and change at most one transport level.
- Device footprints, deposits, bounds, and same-level self-intersections are obstacles.
- One belt cell holds at most one cargo stack, regardless of item count in that stack.
- Same-direction shared suffixes are legal and share bandwidth; divergence from a shared cell requires a junction Device.
- Raised cells are separate occupancy from ground cells at the same `(x, y)`.

Cargo progresses through `loading`, `belt`, and `unloading` phases. A busy cell or unloader produces explicit backpressure rather than an approximate throughput penalty.

## Junctions

A transport-junction is a real powered Device with an internal buffer and multiple ports. Dispatch may be FIFO or round-robin; input/output port priorities and a Resource-to-output filter are instance policies. Synthesis creates deterministic merge/split trees, assigns single-use physical ports, conserves planned rate on every edge, and writes an exact Resource filter on every junction.

## Parallel capacity

A physical port and local lane may not exceed the best project-local pipeline capacity. When demand is higher, synthesis creates more processor/extractor/consumer endpoints, independently routed lanes, and parallel station pairs. It never reports one fictional over-capacity trunk.

## Station logistics

A station asset declares supported network kinds, one internal buffer, and slot count. A Blueprint network configures station Resource slots as supply, demand, or storage and owns a finite fleet of compatible carrier Devices.

- Planetary routes remain within one region.
- Interstellar routes cross regions.
- World plus local coordinates determine route distance.
- Carrier `planTransport()` determines batch capacity and travel time.
- A departing batch reserves a fleet member until arrival.
- All routes in a network share that fleet.
- Power/failure gates departures; in-flight cargo remains explicit.

## Telemetry

Every connection records departed/delivered Resource mix, items/min, stack-aware capacity, utilization, average in-flight inventory, loader/unloader utilization, blocked item-ticks, and transport energy. Station analysis records matched routes, batch range, carrier load, and deficits.

## Source of truth

- Geometry/routing: `packages/inm-core/src/routing.ts`
- Compilation: `packages/inm-core/src/compiler.ts`
- Runtime: `packages/inm-core/src/simulator.ts`
- Capacity/analysis: `packages/inm-core/src/capacity-plan.ts`, `packages/inm-core/src/production-analysis.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "transport|belt|stack|junction|station|parallel lanes"
bun run inm analyze examples/ironworks
bun run inm simulate examples/ironworks --blueprint stacked-cargo --scenario stacked-cargo --objective stacked-cargo
```

Any logistics change must test nominal capacity and event-level physical movement, including a blocked or shared path when relevant.

## Known next gaps

- Dedicated vertical lift/elevator semantics beyond level-changing routed cells.
- More DSP-like station slot capacities and local/remote demand priorities.
- Explicit sorter reach geometry and distance-dependent endpoint placement.
