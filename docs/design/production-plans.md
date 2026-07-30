# Production plans

Status: selected artifact, execution identity, source-pinned Investigation revision session, and exact comparison loop implemented.

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
production-plan-revisions/
  <id>.revision.json
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

Plans are selected alternatives, not mutable promotion targets. Authoring or simulating another plan never changes `defaultProductionPlan`. The durable experiment identity is the plan id/hash inside an immutable Run and an exact Run comparison, not a Candidate apply receipt.

When a current Investigation hypothesis causes a plan to be authored, Core also writes one immutable revision receipt. The receipt owns the exact Investigation manifest and hypothesis entry hashes, authored statement and expected effect, directly cited evidence ids, control Run/result/seed/selection/hashes, complete base and result plans, their hashes, a derived semantic JSON patch, and a receipt hash. The result plan remains an ordinary selectable project artifact; modifying it after authoring invalidates the receipt. Core rejects a historical or non-plan hypothesis, reused base id, duplicate result, metadata-only edit, invalid schedule, or identity mismatch. The receipt explains provenance and continuity; it is not approval and does not make the result plan default.

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

Studio is the spatial and human-facing projection. It shows the selected plan beside the other effective inputs and uses the same project-qualified selection query. For a current plan hypothesis, its structured revision editor begins from the verified complete control plan and lets the author edit lot releases, material deliveries, id, and name. Opening the form writes nothing; only explicit create and simulate actions advance the session. Run comparison labels a positive verdict as score improvement and adds an explicit production-intent warning whenever scheduled, released, completed, on-time, or delivered output falls; green score presentation must not masquerade as plan approval.

An Investigation hypothesis must explicitly declare whether its controlled intervention is `blueprint` or `production-plan`; Core never infers that boundary from prose. A Production Plan hypothesis progresses through `author-production-plan`, `simulate-production-plan`, and `compare-production-plan`, not `author-candidate`, and a Blueprint Candidate cannot source it. Core discovers a continuation Run only when it has the exact control seed, result plan id/hash, unchanged non-plan selection, and a strict one-variable comparison. The author then retains an observation and records `keep`, `revise`, `defer`, or `discard`. Selection is the experiment action; no plan is automatically applied or made default.

## Memory-fab north star

The control `production-window` plan preserves twelve six-second wafer starts and twelve eight-substrate deliveries. Run `102-simulate` completes all twelve lots, packages 96 devices, performs eleven fixed-eight burn-in batches, delivers 88 devices, and leaves eight packaged devices queued at burn-in.

The separately selected `eleven-lot-burn-in-horizon` plan removes only `dram-lot-12` and `substrate-delivery-12`; Run `103-simulate` preserves 88 delivered devices and lowers average WIP by `4.732567` equivalent units, so its Objective score rises by `7.193077`. Exact comparison also shows scheduled, released, completed, and on-time lots each fall from twelve to eleven. The `back-end-wip-next-step` Investigation therefore records `DISCARD`: the apparent improvement horizon-crops real memory production rather than improving the factory. It then captures Run `102-simulate` again as the current twelve-lot checkpoint. This negative result is retained as reusable evidence, while the default plan remains unchanged.

The next source-pinned revision `twelve-lot-five-second-cadence` preserves every lot and all 96 substrates while moving releases `0…66 s` to `0…55 s`. Receipt `409a4a81fb3e…` binds the plan to Investigation hypothesis `compress-twelve-lot-cadence`, control Run `102-simulate`, seed `42`, and complete before/after schedules. Run `104-simulate` still delivers 88 devices and completes the same twelve lots, but average WIP rises `49.1905 → 49.6905`, mean cycle time rises `1.25 s`, accumulated control-blocked release time rises `51 s`, and score falls `0.791667`. The unchanged burn-in/customer tail proves the earlier intent was absorbed by CONWIP admission and queues rather than converted into another burn-in batch. The Investigation records `DISCARD`, restores Run `102-simulate` as current, and retains simple uniform release compression as bounded negative evidence.

## Verification

Implementation must prove strict schema rejection, selection/hash separation, runtime release behavior, capacity accounting, CLI/Studio parity, Benchmark-lock drift, immutable Run identity, exactly-one-variable Run comparison, explicit hypothesis handoff, Candidate rejection for plan hypotheses, and Investigation continuation on both example projects.
