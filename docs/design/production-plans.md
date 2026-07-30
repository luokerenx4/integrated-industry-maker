# Production plans

Status: active implementation contract.

Related: [[docs/design/lot-release-scheduling]], [[docs/design/fab-capacity-planning]], [[docs/design/delivery-contracts]], [[docs/ARCHITECTURE]], [[docs/design/industrial-investigations]], [[docs/design/project-boundaries]], [[docs/PROJECT_FORMAT]], and [[docs/CLI]].

## Purpose

A Production Plan is the project-local declaration of work the factory intends to admit during one simulated horizon. It is authored by a human or reasoning Agent and judged by compilation, simulation, Objective evaluation, and locked Benchmarks.

It is not a schedule produced by Core, an optimization result, a Blueprint policy, an Objective, or evidence that the plan will succeed.

## Authority boundary

The five selected industrial inputs have different owners:

- World: industrial geography and finite natural supply;
- Blueprint: installed equipment, topology, qualification, buffers, and operating policy;
- Production Plan: named tracked-lot availability and purchased-material deliveries;
- Scenario: time horizon, starting condition, tariffs, failures, and fixed operating/quality disturbances;
- Objective: value, demand/service floors, constraints, and score accounting.

Changing one must not silently rewrite another. In particular, a plan cannot relax demand, remove a Scenario failure, edit a quality excursion, or change a Device dispatch policy.

## Project format

Every project owns:

```text
production-plans/
  <id>.production-plan.json
```

The strict V1 artifact owns:

- stable `id` and human-readable `name`;
- `lotReleases`: identity, physical release boundary, tracked Resource, planned tick, optional priority, and optional due tick;
- `materialDeliveries`: identity, physical receiving boundary, Resource, quantity, and planned tick.

The project manifest requires `defaultProductionPlan`. Ordinary project selection may override it with `productionPlan`; the public CLI flag is `--production-plan`.

Scenario no longer accepts `lotReleases` or `materialDeliveries`. There is no pre-release fallback, alias, or migration behavior.

## Execution and evidence identity

Compilation validates a selected plan against the selected Blueprint, Scenario horizon, Resource catalog, Route contracts, and Scenario quality-excursion lot references. The plan receives an independent `productionPlanHash`.

The selection-scoped execution hash includes the exact plan selection and semantic content. Immutable Runs, Benchmark locks, Design/Investigation evidence, CLI context, and Studio projections carry the plan id/hash beside World, Blueprint, Scenario, and Objective. A different plan is a different execution even when the factory and operating condition are unchanged.

Unselected plan files are descriptive project inventory and do not invalidate evidence.

## Runtime and planning

Before its plan tick, a tracked lot is scheduled outside factory WIP. At that tick it becomes eligible for the existing physical and Blueprint-owned admission controls. Purchased material appears only at its named receiving boundary and tick. Capacity planning treats both as finite scheduled external supply. Objective demand and service guardrails remain unchanged.

The Production Plan therefore states intent while retaining all existing causal boundaries:

- planned versus actual release;
- capacity versus CONWIP delay;
- external supply versus in-factory WIP;
- product delivery versus Objective contract demand;
- authored plan versus measured result.

## Human and Agent surfaces

CLI is the structured surface for text-only Agents: schema discovery, explicit selection, validation, planning, simulation, observation, and retained evidence all expose the plan id/hash.

Studio is the spatial and human-facing projection. It shows the selected plan beside the other effective inputs and uses the same project-qualified selection query. A future editor may author plan JSON through a guarded form, but the engine must never fabricate plan content merely because a page opened.

## Memory-fab north star

The first migrated plan preserves the twelve six-second wafer starts and twelve eight-substrate deliveries currently exercised by Run `101-simulate`. It provides the stable control plan for the initial identity migration.

Alternative tail/cadence plans will be authored as separate files and evaluated against the same Scenario and Objective. The current `back-end-wip-next-step` Investigation owns the hypothesis and judgment; the plan contract only makes that intervention explicit and reproducible.

## Verification

Implementation must prove strict schema rejection, selection/hash separation, runtime release behavior, capacity accounting, CLI/Studio parity, Benchmark-lock drift, immutable Run identity, and Investigation continuation on both example projects.
