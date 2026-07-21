# Material, recipe, port, and buffer contracts

Status: multi-input/multi-output Processes, mutually exclusive inspection dispositions, physical recipe-port binding, multi-operation work centers, setup groups, independent instance port filters, shared-buffer recipe partitions, treatment-aware contracts, and opt-in single- or multi-lot identity implemented through engine version `inm-sim/0.51.0`.

Related: [[docs/PROJECT_FORMAT]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/work-center-dispatch]], [[docs/design/lot-tracking]], [[docs/design/batch-processing]], [[docs/design/quality-flow]], [[docs/design/logistics]], [[docs/design/blueprint-optimization]].

## Scope

This document owns Resource identity, Process transformations, Device buffers and ports, per-instance accepted Resources, recipe bindings, extraction output contracts, fuel input contracts, and host validation of material actions.

Treatment grade is lot state layered onto Resource identity rather than a new Resource kind. Buffer totals and exact `(Resource, treatment level)` batches remain conserved together; see [[docs/design/material-treatment]].

An identity-preserving industrial lot is a different, opt-in layer. Resources in one tracked family represent successive route stages while a stable lot id survives transformation, transport, and delivery. Tracked quantities must enter through explicit Scenario lots and Processes must preserve their identities one-for-one; see [[docs/design/lot-tracking]].

## Layered contract model

Material acceptance is narrowed in layers; later layers may never expand earlier ones:

```text
Resource catalog
  → Device asset buffer accepts (maximum capability)
  → Blueprint Device bufferFilters (instance configuration)
  → physical Device ports
  → Blueprint Device portFilters (independent ingress/egress configuration)
  → recipe Resource-to-port binding / bound extractor Resource / configured fuels / station Resource slots
  → compiled effective port and buffer contracts
  → Blueprint connection resources (exact lane allowlist)
  → station slots, initial inventory, and runtime actions
```

Omitting `bufferFilters[buffer]` preserves the asset maximum. An explicit list narrows every path into that internal buffer; an empty list closes it. `portFilters[port]` then independently narrows one physical ingress or egress without expanding its backing buffer. An empty port list closes only that port. `*` is legal only in the asset maximum; instance filters name concrete project Resources.

## Configurable recipes

A Process is project-local source code with any number of distinct inputs and one or more outputs plus an optional equipment `setupGroup`. A production-capable Device asset declares an exact non-empty list of qualified Process ids, their supported categories, a rational speed, allowed physical `inputPorts`/`outputPorts`, one or more explicit production modes, and optionally a powered changeover envelope. Category equality is insufficient: the selected Process must appear in the equipment's qualification list. A dedicated Blueprint Device uses `recipe`; a shared work center uses `recipes` to enable one or several asset-qualified Process/mode operations. Every entry maps each Process Resource to an exact physical port. Mode-owned auxiliary Resources name their physical port in the asset; they never appear as hidden consumption. See [[docs/design/work-center-dispatch]] for ready-WIP selection and [[docs/design/equipment-changeover]] for setup state.

Compilation rejects missing, extra, unknown, duplicate-operation, wrong-direction, asset-incompatible, buffer-filtered, or port-filtered bindings. It narrows every configured production port to the union of Resources mapped by its qualified operations; unused production ports carry nothing. Connections are checked against this compiled port contract, so an unqualified route stage cannot enter a wildcard work center. Every compiled Process plan resolves ports back to host-owned buffers for execution.

When several recipe Resources resolve to one buffer, the compiler creates deterministic per-Resource capacity partitions. Each Resource receives at least one complete job quantity and the remaining capacity is divided proportionally with stable Resource-id tie breaking. Total quotas never exceed physical buffer capacity. This prevents one abundant input or coproduct from occupying the whole shared buffer and starving another required material.

## Non-recipe devices

The same instance filter applies to storage, consumers, junctions, stations, miners, and fuel generators:

- a miner is narrowed to the single Resource type of its bound deposits;
- station slots must be accepted by the station's effective buffer and compile into independent per-Resource quotas;
- a fuel generator exposes only supported fuels admitted by its effective fuel buffer;
- Scenario initial inventory must satisfy the effective contract, total buffer capacity, and any per-Resource quota;
- a splitter policy filter must be admitted by its internal buffer;
- every belt connection declares a non-empty exact Resource allowlist; each entry must exist and satisfy both endpoint port contracts;
- runtime dispatch intersects mixed source inventory with that immutable connection allowlist and reserves both total and per-Resource destination capacity.

The connection list is never inferred from endpoint compatibility. A wildcard storage buffer can feed several lanes with different intent, and the intent remains visible in the Blueprint diff. Listing several Resources deliberately creates a mixed-material lane; listing one produces a dedicated lane. The compiler rejects duplicates, unknown Resources, and entries excluded by either endpoint.

## Capacity contracts

Every compiled buffer has one total capacity inherited from its Device asset. Industrial semantics add stricter per-Resource capacities without changing the asset package. Recipe partitions reserve shared machine-buffer capacity by material; station slots compile authored `{ resource, mode, capacity }` limits onto the station buffer.

For a Resource `r`, writable capacity is the minimum of:

```text
total buffer capacity − all resident items − all inbound items
slot capacity[r] − resident r − inbound r
```

If no Resource quota exists, only the total limit applies. Inbound reservations include physical belt cargo and station-carrier cargo together. Production uses the same per-Resource check before accepting a Device action. This compiled representation deliberately generalizes beyond stations so later container partitions or fluid tanks can reuse the same runtime invariant.

## Runtime authority

Device TypeScript receives frozen buffer snapshots and a compiled Process/extraction/generation plan. It returns declarative actions. The host checks Resource existence, buffer identity, acceptance, capacity, required inputs, selected mode, exact duration, exact compiled Process amounts, and exact active power before mutation. Device code never owns inventory.

## Synthesis behavior

Blueprint synthesis writes exact filters for extractors, single-Resource junction trees, boundary/surplus consumers, and station pairs. Recipe devices rely on their exact recipe binding. Every generated local connection also writes its planned Resource as a one-item `resources` allowlist. Generated material edges therefore have machine-readable intent even when their asset buffers use `*`.

## Observability

`inm analyze` exposes both `portContracts` and `bufferContracts` for every compiled Device plus the exact Resource allowlist for every local connection. Human output shows Resource-to-port recipe bindings, each physical port's direction/backing buffer/material contract, buffer role/total capacity, and `Resource≤quota` partitions. Studio renders the same contracts in Analysis and the Device inspector.

## Source of truth

- Types/schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Compilation: `packages/inm-core/src/compiler.ts`
- Runtime enforcement: `packages/inm-core/src/simulator.ts`
- Analysis/binding: `packages/inm-core/src/production-analysis.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`

## Verification

Compiler tests cover invalid filters across recipe ports, buffers, extraction, station slots, policies, initial inventory, and connection allowlists. A shared-buffer test gives one assembler two independently configured input ports, proves the compiler partitions the backing buffer, rejects a crossed material lane, and executes production without starvation. Runtime tests also prove that a `gear`-only connection leaves coal behind. Synthesis tests require exact bindings/filters on machines, miners, stations, junctions, sinks, and every generated lane.

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "recipe bindings|buffer filter|connection Resource filter|multi-input|coproduct"
bun run inm analyze examples/ironworks
bun run inm test examples/ironworks
```

## Change checklist

- Update asset maximum, instance configuration, and effective compiled type together.
- Validate every consumer of material state, not only physical belts.
- Keep recipe alternatives consistent with current instance filters.
- Expose new contract information in JSON analysis and Studio.
- Add one rejection test and one executable transport/production test.
