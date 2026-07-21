# Logistics design

Status: explicit sorter Devices, physical local logistics, and treatment-aware dispatch implemented in `inm-sim/0.39.0`.

Related: [[docs/design/material-contracts]], [[docs/design/material-treatment]], [[docs/design/power]], [[docs/design/simulation-runtime]].

## Scope

This document owns local material movement, sorter/line stages, belt cells and levels, congestion, junction policies, planetary/interstellar station routes, and finite carrier fleets.

## Local connection model

Each Blueprint connection owns one source port, one target port, a non-empty exact Resource allowlist, an explicit ordered grid path, a requested stack size, references to one loader Device and one unloader Device, and one project-local line asset:

```text
source buffer → loader → concrete belt cells → unloader → target buffer
```

The Resource allowlist is authored state, not a cache of endpoint compatibility. Compilation resolves every listed Resource against the project catalog and both effective endpoint buffer contracts, rejects duplicates or incompatible entries, and computes stack/capacity limits only for the declared set. Runtime dispatch considers source inventory only when its Resource appears in that list. Multiple listed Resources intentionally share the lane; independent single-Resource lanes remain explicit even when both ends are wildcard buffers.

Loader and unloader distance is an explicit positive value on each sorter's `transportEndpoint` binding. A sorter asset that supports either endpoint role declares `logistics.endpointRange = { minimum, maximum }`; the compiler rejects a selected span outside that range. Line distance equals routed belt-cell count. Each stage's actual distance is passed to its TypeScript `planTransport()`, so a project-local sorter can lose trips/min with reach while a future tier can implement a different distance curve. The compiler intersects stage stack limits with the Resource asset's stack limit and computes independent stage clocks.

There is no implicit or inline sorter in the file format. Each endpoint is a stable Blueprint Device with asset, region, belt-side position, cargo-flow rotation, owning connection, stage, and distance. It must be referenced exactly once by that same connection and stage. A topology edit that moves or splits a belt must create/rebind the endpoint Devices together with the connection path. This makes physical ownership, tier changes, power, layout, and throughput consequences reviewable in one JSON diff.

## Geometry and occupancy

- Paths begin/end at the level-0 belt cells exactly the configured loader/unloader distance from real ports.
- Steps are cardinal and change at most one transport level.
- Machine footprints, deposits, bounds, and same-level self-intersections are obstacles; sorter attachments overlay their owned first/last belt cells.
- One belt cell holds at most one cargo stack, regardless of item count in that stack.
- Same-direction shared suffixes are legal and share bandwidth; divergence from a shared cell requires a junction Device.
- Raised cells are separate occupancy from ground cells at the same `(x, y)`.

The cells between a machine edge and a farther belt endpoint belong to the sorter arm, not the line, and therefore do not create hidden belt slots or line build cost. The explicit sorter Device is anchored at that first or last belt cell and the Studio arm spans the exact geometry back to its machine port. Endpoint power is assigned to the sorter Device at the selected belt cell, matching the place where the transport stage joins the regional grid.

Cargo progresses through `loading`, `belt`, and `unloading` phases. A busy cell or unloader produces explicit backpressure rather than an approximate throughput penalty.

## Local dispatch policy

Every Blueprint has one default local dispatch policy, and a source Device may override it. `fifo` uses stable connection and Resource ids. `round-robin` rotates eligible outgoing connections after each successful departure. `shortage-first` makes the physical network demand-aware without adding a hidden mutable controller.

For each eligible `(connection, Resource)` pair, the runtime divides destination resident plus already-inbound inventory by a compiled coverage unit:

- a Process input uses its exact configured input batch;
- a fuel input and Objective consumer use one unit;
- a generic buffer uses its per-Resource quota or total buffer capacity.

Lower coverage dispatches first. Equal coverage prefers a destination closer to the selected Objective in the compiled production dependency graph; zero means the destination Process directly produces the target Resource, while `null` is outside that graph. Exact ties retain the deterministic round-robin cursor. The same ordering chooses between several Resources sharing one authored connection, so a mixed lane does not continually load an already-covered material while another accepted material is empty.

For a Process input with a minimum treatment level, only resident and inbound lots at or above that level count toward coverage. Dispatch likewise chooses only eligible source lots and records the selected exact level on cargo. Level state survives every belt cell, station departure, and arrival; see [[docs/design/material-treatment]].

An explicit source `outputPriority` or destination `inputPriority` remains an operator override above automatic shortage ordering. A junction Resource filter remains absolute. Capacity, power, allowlists, filters, and destination reservations still decide eligibility before any policy can rank a candidate.

## Junctions

A transport-junction is a real powered Device with an internal buffer and multiple ports. It uses the same FIFO, round-robin, or shortage-first policy as any source Device; input/output port priorities and a Resource-to-output filter are instance policies. Synthesis creates deterministic merge/split trees, assigns single-use physical ports, conserves planned rate on every edge, writes an exact Resource filter on every junction, and may retain round-robin on symmetric generated trees even when the factory default is shortage-first.

## Synthesis and parallel capacity

A physical port and local lane may not exceed the best project-local pipeline capacity. When demand is higher, synthesis creates more processor/extractor/consumer endpoints, independently routed lanes, and parallel station pairs. It never reports one fictional over-capacity trunk.

For each planned local flow, synthesis writes a one-Resource lane allowlist and selects `shortage-first` as the factory default, then enumerates every supported loader/unloader span together with ground and raised belt routes. It executes the candidate endpoint and line runtimes at their actual distances, rejects candidates below required items/min, scores project-local build and energy cost, and globally reserves a conflict-free set of belt cells. A longer sorter arm may remove belt cells and improve compactness, but its distance-dependent cycle can force a faster or stacked tier; the selected Resource, distances, and assets are written into the generated Blueprint and synthesis report.

## Station logistics

A station asset declares supported network kinds, one internal backing buffer, and a maximum slot count. A Blueprint network configures each Resource slot with a supply, demand, or storage mode, an independent positive capacity, and an optional minimum dispatch batch. Supply and demand slots may also configure an integer priority plus an inventory policy. The slot capacity contract is instance state even when the same station participates in several networks; shared-fleet dispatch policy is network-local and falls back to the Blueprint factory policy when omitted.

The compiler collects slots globally by station instance before compiling local connections. For each station:

- one Resource occupies one logical slot across all networks;
- repeated declarations of that Resource must use the same capacity;
- the unique Resource count may not exceed the asset's slot count;
- the sum of unique slot capacities may not exceed the backing buffer's total capacity;
- configured Resources must satisfy the asset maximum and explicit instance `bufferFilters`;
- the compiled backing buffer accepts exactly the configured slot Resources and stores a quota for each one;
- a minimum batch may not exceed its slot capacity or carrier cargo capacity.

Supply and demand inventory policies deliberately distinguish local belt traffic from station traffic:

- `supplyReserve` is the stock floor retained at a supply station. Carriers may remove only resident inventory above that floor, while local output belts may continue consuming it.
- `demandTarget` is the remote replenishment ceiling. Remote dispatch treats resident and all already-inbound cargo as occupying that target, while local input belts themselves may still fill the slot to its full capacity.
- `priority` is non-negative. Finite fleet dispatch chooses the highest demand priority first, then the highest supply priority; the network policy resolves routes tied on both.
- Storage slots have no dispatch policy. They hold inventory without advertising supply or demand.

After explicit demand and supply priorities, the network's `dispatch` policy resolves equal-tier contention:

- `fifo` keeps stable route-id order until a route becomes ineligible;
- `round-robin` advances the route cursor after every departure;
- `shortage-first` compares destination resident plus every local/station inbound unit in downstream coverage units, then uses Objective critical depth and the rotated cursor as tie-breakers.

Station coverage follows the same compiled signal as local dispatch. For a demand station with outgoing local lanes, the engine recursively follows same-Resource connections through same-buffer junctions and pass-through storage until it reaches the real target contracts, deduplicates converged leaves, and sums one simultaneous downstream round: exact Process input batches, fuel/Objective units, or terminal buffer capacity. A station feeding an assembler that consumes two iron plates per job therefore has a two-plate coverage unit even if the station slot holds 400. When no local downstream contract exists, `demandTarget` is the fallback coverage unit. This lets a finite planetary or interstellar fleet distinguish productive shortage from a merely large warehouse while keeping authored priorities authoritative.

The effective route batch capacity is the minimum of carrier capacity, `slot capacity − supplyReserve`, and `demandTarget`. Static capacity planning uses the same value, so a small replenishment target cannot masquerade as full carrier throughput.

The backing buffer therefore has two simultaneous limits: the asset-level total capacity and the slot-level capacity for the particular Resource. Resident inventory plus all inbound local and station cargo counts against both. Local belt dispatch, station dispatch, Scenario initial inventory, and Device-produced output reserve the same quota. This prevents a full or in-flight Resource from borrowing another slot's capacity and prevents local belts from overfilling a station while a carrier is in transit.

- Planetary routes remain within one region.
- Interstellar routes cross regions.
- World plus local coordinates determine route distance.
- Carrier `planTransport()` determines batch capacity and travel time.
- Effective route batch capacity includes the source reserve and destination target; planning and analysis use this effective value.
- A departing batch reserves a fleet member and destination Resource quota until arrival.
- All routes in a network share that fleet.
- Power/failure gates departures; in-flight cargo remains explicit.

## Telemetry

Every connection reports its authored Resource allowlist, effective dispatch policy, compiled target kind/coverage unit/critical depth for every allowed Resource, plus each stage's physical distance and duration, departed/delivered Resource mix, items/min, stack-aware capacity, utilization, average in-flight inventory, loader/unloader utilization, blocked item-ticks, and transport energy. Station analysis records the effective network dispatch policy and, for every matched route, source/destination slot capacities, reserve/target policy, demand/supply priority, downstream connections, target kind, coverage batch, Objective depth, effective carrier batch range, load, and deficits. Buffer-contract analysis exposes the same per-Resource quotas used by the simulator.

## Source of truth

- Geometry/routing: `packages/inm-core/src/routing.ts`
- Compilation: `packages/inm-core/src/compiler.ts`
- Dispatch profiles: `packages/inm-core/src/dispatch-priority.ts`
- Runtime: `packages/inm-core/src/simulator.ts`
- Capacity/analysis: `packages/inm-core/src/capacity-plan.ts`, `packages/inm-core/src/production-analysis.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "transport|belt|connection Resource filter|sorter span|endpoint reach|stack|junction|station|parallel lanes|shortage-first|output priority"
bun run inm analyze examples/ironworks
bun run inm simulate examples/ironworks --blueprint stacked-cargo --scenario stacked-cargo --objective stacked-cargo
```

Any logistics change must test nominal capacity and event-level physical movement, including a blocked or shared path when relevant.

## Known next gaps

- Dedicated vertical lift/elevator semantics beyond level-changing routed cells.
