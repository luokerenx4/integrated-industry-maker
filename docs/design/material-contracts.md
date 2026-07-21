# Material, recipe, and buffer contracts

Status: implemented through engine version `inm-sim/0.26.0`.

Related: [[docs/PROJECT_FORMAT]], [[docs/design/logistics]], [[docs/design/blueprint-optimization]].

## Scope

This document owns Resource identity, Process transformations, Device buffers and ports, per-instance accepted Resources, recipe bindings, extraction output contracts, fuel input contracts, and host validation of material actions.

## Layered contract model

Material acceptance is narrowed in layers; later layers may never expand earlier ones:

```text
Resource catalog
  → Device asset buffer accepts (maximum capability)
  → Blueprint Device bufferFilters (instance configuration)
  → recipe binding / bound extractor Resource / configured fuels
  → compiled effective buffer contract
  → connections, station slots, initial inventory, and runtime actions
```

Omitting `bufferFilters[buffer]` preserves the asset maximum. An explicit list narrows it. An empty list closes the buffer. `*` is legal only in the asset maximum; an instance filter names concrete project Resources.

## Configurable recipes

A Process is project-local source code with any number of distinct inputs and one or more outputs. A production-capable Device asset declares supported Process categories, a rational speed, and allowed input/output buffers. Each Blueprint Device instance selects one Process and explicitly maps every Process Resource to a physical buffer.

Compilation rejects missing, extra, unknown, wrong-role, asset-incompatible, or instance-filtered bindings. It then narrows every production buffer to the exact Resources mapped there; unused recipe buffers accept nothing. One generic assembler asset can therefore represent many recipes without runtime conditionals or a global recipe database.

## Non-recipe devices

The same instance filter applies to storage, consumers, junctions, stations, miners, and fuel generators:

- a miner is narrowed to the single Resource type of its bound deposits;
- station slots must be accepted by the station's effective buffer;
- a fuel generator exposes only supported fuels admitted by its effective fuel buffer;
- Scenario initial inventory must satisfy the effective contract;
- a splitter policy filter must be admitted by its internal buffer;
- a belt connection compiles only the intersection of source and target contracts;
- runtime dispatch skips mixed cargo not accepted by the target.

## Runtime authority

Device TypeScript receives frozen buffer snapshots and a compiled Process/extraction/generation plan. It returns declarative actions. The host checks Resource existence, buffer identity, acceptance, capacity, required inputs, and exact compiled Process amounts before mutation. Device code never owns inventory.

## Synthesis behavior

Blueprint synthesis writes exact filters for extractors, single-Resource junction trees, boundary/surplus consumers, and station pairs. Recipe devices rely on their exact recipe binding. Generated material edges therefore have machine-readable intent even when their asset buffers use `*`.

## Observability

`inm analyze` exposes `bufferContracts` for every compiled Device. Human output lists buffer role, capacity, and accepted Resources. Studio shows the same table and labels 3D Devices with compiled material names.

## Source of truth

- Types/schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Compilation: `packages/inm-core/src/compiler.ts`
- Runtime enforcement: `packages/inm-core/src/simulator.ts`
- Analysis/binding: `packages/inm-core/src/production-analysis.ts`
- Synthesis: `packages/inm-core/src/synthesis.ts`

## Verification

Compiler tests cover invalid filters across recipes, extraction, station slots, policies, and initial inventory. Runtime tests put coal and gear on one source buffer and prove that a gear-only target receives only gear. Synthesis tests require exact filters on miners, stations, junctions, and sinks.

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "buffer filter|multi-input|coproduct"
bun run inm analyze examples/ironworks
bun run inm test examples/ironworks
```

## Change checklist

- Update asset maximum, instance configuration, and effective compiled type together.
- Validate every consumer of material state, not only physical belts.
- Keep recipe alternatives consistent with current instance filters.
- Expose new contract information in JSON analysis and Studio.
- Add one rejection test and one executable transport/production test.
