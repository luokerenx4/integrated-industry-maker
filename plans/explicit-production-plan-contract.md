# Explicit production plan contract

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/production-plans]], [[docs/design/lot-release-scheduling]], [[docs/design/fab-capacity-planning]], [[docs/design/delivery-contracts]], [[docs/ARCHITECTURE]], and [[docs/design/industrial-investigations]].

## Outcome

Make planned factory work a project-local, independently selected `ProductionPlan` rather than duplicated Scenario payload, so humans and Agents can author, inspect, compare, and retain exact production intent while Scenarios remain operating conditions and the simulator remains the evidence-producing judge.

## Context

The memory-fab currently copies `lotReleases` and purchased-material `materialDeliveries` into eleven Scenario files. That makes a production cadence look like an environmental disturbance, hides plan identity inside `scenarioHash`, and forces a human or Agent to edit evaluator workload files merely to state a production hypothesis.

Run `101-simulate` exposes why this boundary matters. It starts packaging for `96` devices, completes eleven fixed-eight burn-in batches, delivers `88`, and leaves exactly eight packaged devices at burn-in. Prior tighter-CONWIP and four-device-recipe evidence bounds simple buffer and batch-size answers. The next falsifiable intervention must be able to name an explicit workload/cadence plan without changing failures, tariffs, quality excursions, the Objective, or the factory Blueprint.

This is a pre-release domain correction. The active project format changes directly: Scenario workload fields are removed, existing example workloads are migrated to plans, and no alias or embedded-workload fallback is added. Existing immutable evidence remains listable and readable as historical evidence under its recorded engine identity, but exact operations that require current recompilation reject pre-contract evidence rather than reconstructing an implicit plan. Current authority is re-established under the new execution closure.

## Scope

### In scope

- Add strict project-local `production-plans/<id>.production-plan.json` artifacts owning tracked-lot releases and purchased-material deliveries.
- Require `defaultProductionPlan` in each project manifest and add `productionPlan` to ordinary World/Blueprint/Scenario/Objective selection.
- Remove `lotReleases` and `materialDeliveries` from Scenario and make compilation, capacity planning, production analysis, simulation, and evaluation consume the selected Production Plan.
- Give the selected plan an independent hash and include it in execution identity, immutable Run evidence, Benchmark locks, Investigation anchors, CLI envelopes, and Studio project projections.
- Add public CLI schema/selection/catalog inspection and Studio selection parity without adding an in-project project switcher or automatic plan authoring.
- Migrate both self-contained examples, locked Benchmarks, fixtures, and the memory-fab workload portfolio.
- Create a current memory-fab Run under the new plan identity and append it to `back-end-wip-next-step` so the existing observation and negative evidence remain an accumulated chain.

### Out of scope

- An autonomous production scheduler, RL/search loop, or Core-authored production recommendation.
- Product-order allocation, order cancellation, split/merge genealogy, or a general ERP/MES model.
- Editing Objective demand contracts through a Production Plan.
- Treating a plan as proof that its intended output will be achieved; only simulation and locked evaluation provide operating evidence.
- Compatibility aliases for Scenario-owned lot or material release fields.

## Acceptance

- [x] A project cannot validate without one selected strict Production Plan, and Scenario workload fields fail schema validation.
- [x] Two selections differing only by Production Plan have distinct plan and execution identities while World, Blueprint, Scenario, and Objective identities remain unchanged.
- [x] Capacity planning, runtime release events, WIP, delivery, and guardrails consume the selected plan exactly; changing plan intent cannot silently mutate the factory or evaluator.
- [x] CLI and Studio expose the same effective plan id/hash and let a human or Agent select an explicit plan through the ordinary project selection boundary.
- [x] Memory-fab Benchmarks lock Scenario and Production Plan separately, and current Run evidence resumes the WIP Investigation under the new identity.
- [x] Documentation, TypeScript, focused tests, both project fixtures, and the full repository checkpoint pass.

## Work

- [x] Audit current Scenario workload ownership, selection identity, release runtime, capacity planning, Benchmark locks, and Run/Investigation evidence.
- [x] Add the Production Plan schema, types, loader, compiler checks, selection, and independent hash.
- [x] Move planning and runtime consumers from Scenario to Production Plan.
- [x] Extend CLI, Studio, Run/Benchmark/Investigation evidence, and artifact schema surfaces.
- [x] Migrate project manifests, Scenario payloads, explicit plan files, Benchmark cases/locks, tests, fixtures, and documentation.
- [x] Re-establish current memory-fab operating evidence and append the exact checkpoint to the WIP Investigation.
- [x] Complete the acceptance audit and full verification, archive the plan, and prepare the commit checkpoint.

## Findings and decisions

- 2026-07-31 — Scenario currently mixes two different authorities: environmental conditions (`durationTicks`, failures, tariffs, initial setup/energy, quality excursions) and planned work (`lotReleases`, `materialDeliveries`). Planned work moves out; environmental conditions stay.
- 2026-07-31 — Objective delivery contracts remain evaluator-owned demand/service economics. A Production Plan declares work availability and purchased supply, not permission to weaken demand.
- 2026-07-31 — `ProductionPlan` is an independent selection dimension and hash, not merely a path embedded in Scenario. This lets one operating condition test several plans without copying the condition and makes evidence mismatch explicit.
- 2026-07-31 — Existing current-engine evidence will become historical after the execution-contract version change. The WIP Investigation will accumulate a new current checkpoint instead of rewriting or deleting Run `101-simulate`.
- 2026-07-31 — Blueprint comparisons require an identical Production Plan as well as identical World, Scenario, Objective, and catalogs; a plan delta cannot be reported as a Blueprint improvement.
- 2026-07-31 — Deterministic project fixtures must select `productionPlan` explicitly. A fixture cannot inherit a changed project default and silently test another workload.
- 2026-07-31 — Pre-contract Runs and Design Runs remain inspectable historical records, but there is no runtime reconstruction or comparison fallback for their removed Scenario workload.

## Verification

- `bun run test` — documentation links, all TypeScript projects, `340` repository tests / `3974` assertions, Studio integration, and all eight Ironworks fixtures passed.
- `bun run check:fast` — documentation, TypeScript, and the 40-test focused checkpoint passed after final fixture and terminology corrections.
- `bun run inm validate examples/memory-fab --json` — the current five-dimensional project selection validated.
- `bun run inm plan examples/memory-fab --json` — `READY`, zero capacity gaps.
- `bun run inm test examples/memory-fab` — the re-entrant flow and explicit `batch-tail` Production Plan fixtures passed.
- `bun run inm test examples/ironworks` — all eight fixtures passed with explicit `productionPlan: baseline`.
- `bun test packages/inm-core/src/fab-loss-analysis.test.ts --max-concurrency=1` — all eleven causal attribution tests passed with Production Plan release authority.
- `git diff --check` — no whitespace errors.
- Browser QA at `http://localhost:4176/memory-fab?productionPlan=production-window` — Overview loaded current Run `102-simulate`; navigation to Factory retained World, Blueprint, Production Plan, Scenario, Objective, and Run in the URL; the 3D factory, delivery panel, and Observation Harness rendered; the Production-Plan-owned release identity label was present.

## Progress log

- 2026-07-31 — Plan created after tracing the eleven duplicated memory-fab workloads through Scenario schema, compilation, capacity planning, runtime release, Objective evaluation, locked Benchmark identity, CLI, Studio, and Investigation evidence.
- 2026-07-31 — Added the strict plan artifact and independent identity across Core, CLI, Studio, Benchmarks, Runs, comparisons, workbench evidence, and Investigations; removed planned work from Scenario without an alias.
- 2026-07-31 — Migrated both projects and every locked Benchmark; generated current Run `102-simulate` for memory-fab and Run `022-simulate` for Ironworks.
- 2026-07-31 — Appended `run-102-explicit-production-plan` to `back-end-wip-next-step`; its exact Production Plan anchor is current and the Investigation now hands off to a new human/Agent hypothesis.
- 2026-07-31 — The north-star fixture audit caught a missing plan selector in `inm test`; the fixture contract was made explicit and both projects passed.
- 2026-07-31 — Completed full automated and browser verification.

## Completion

Completed on 2026-07-31. Planned work is now a first-class, project-local, independently hash-identified input shared by human and Agent surfaces. Scenario is environmental, Production Plan owns releases and purchased supply, old evidence is historical without compatibility replay, and current memory-fab evidence continues the accumulated WIP investigation.
