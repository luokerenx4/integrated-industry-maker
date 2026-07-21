# Material treatment and graded cargo

Status: first-class treatment lots implemented in engine version `inm-sim/0.35.0`.

Related: [[docs/design/material-contracts]], [[docs/design/production-modes]], [[docs/design/logistics]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-optimization]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

## Scope

This subsystem owns material treatment levels, treatment Devices and agents, exact lot state in buffers and transit, treatment-aware production requirements, dispatch, capacity planning, synthesis, metrics, and Studio replay. It models proliferation/coating/quality-like preparation as a physical factory operation instead of a hidden recipe multiplier.

## Identity and lot invariant

Treatment does not create a new Resource id. A material lot is:

```text
(Resource id, treatment level, integer count)
```

The ordinary buffer quantity remains the total for that Resource, while `materialBatches` is the exact level ledger. Their sums must agree after every mutation. Untreated material is level `0`; Scenario inventory is level `0` unless a matching `initialTreatments` entry reclassifies part of it.

Every local belt and station transit carries one exact `treatmentLevel`. Arrival restores that same lot. Merging may aggregate only equal `(Resource, level)` pairs. Treatment level is cargo state, so no connection, station, storage buffer, or wildcard Resource contract may silently erase it.

## Treatment Device contract

A Device with capability `treat` declares three distinct physical buffers: material input, material output, and treatment-agent input. Each mode declares a target `level`, integer `itemCount`, integer `durationTicks`, and one agent Resource/count. A Blueprint instance explicitly selects `treatment.mode`.

The compiler validates buffers, ports, instance filters, complete-job capacity, Resource ids, and the selected mode, then exposes one immutable plan to the local TypeScript runtime. A returned `treat` decision must match that plan exactly. One job consumes an exact lower-level material lot and the declared agent, then produces the same Resource at the selected level. It cannot downgrade material, relabel another Resource, invent partial batches, or omit agent/power cost.

## Production requirements

Every production mode declares `minimumInputTreatmentLevel`. The requirement applies to every Process input, while separately declared auxiliary inputs retain their ordinary contract. Production output starts at level `0`; treatment never propagates through a material transformation unless another physical treatment Device processes that output.

Availability and consumption select only lots at or above the minimum, taking the lowest eligible level first. This preserves scarce higher-grade inventory for jobs that need it. A level-0 job may consume any level, also lowest first.

## Dispatch and capacity

Connection and station shortage profiles carry the downstream minimum level. Coverage counts only resident and inbound lots that satisfy that leaf contract. Dispatch selects the lowest eligible source lot and places its exact level on the transit. Thus a full buffer of untreated plate does not satisfy or block replenishment for a productive assembler waiting for level 2 plate.

Static analysis reports treatment Devices, nominal rates, agent envelopes, and missing material/agent feeds. Capacity planning expands every treated Process input into:

```text
raw input rate → treatment input/output rate
               + proportional treatment-agent demand
               + treatment Device count and power
```

The material solver includes agent demand in the global balance. A mode is not raw-efficient if its treatment-agent production makes the whole system worse.

## Synthesis and research

Blueprint synthesis treats a selected grade requirement as infrastructure, not metadata. It selects a project-local treatment asset/mode, creates enough treatment Devices, assigns exact material and agent filters, manufactures the agent through ordinary project Processes, routes untreated material and agent into each Device, and routes treated output separately to the consuming machine. The generated plan must compile, be capacity-ready, and reach the Objective rate in a cold-start simulation.

The bounded research heuristic does not propose a bare recipe switch whose minimum treatment level is above zero. Such a patch would be structurally valid but operationally unfed. Full treatment-aware research candidates should be infrastructure bundles; until that bounded strategy exists, complete synthesis is the authority for selecting treated modes.

## Observability

`inm analyze` shows required input levels, treatment assets/modes, nominal item and agent rates, and feed diagnostics. `inm plan` shows required versus configured treatment capacity and proportional agent demand. `inm simulate` and immutable reports show treated quantities by `Resource@level` and agents consumed.

Studio exposes treatment asset definitions in the Catalog, compiled treatment plans in Device inspectors, level requirements in recipes and dispatch profiles, treatment capacity in Analysis, and an `@level` badge plus distinct cargo styling during replay. `material.treated` events make the transition inspectable independently of rendering.

## Source of truth

- Types/schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Treatment selection and material expansion: `packages/inm-core/src/material-treatment.ts`
- Compilation/runtime: `packages/inm-core/src/compiler.ts`, `packages/inm-core/src/simulator.ts`, `packages/inm-core/src/state.ts`
- Dispatch: `packages/inm-core/src/dispatch-priority.ts`
- Analysis/capacity/synthesis: `packages/inm-core/src/production-analysis.ts`, `packages/inm-core/src/capacity-plan.ts`, `packages/inm-core/src/synthesis.ts`
- CLI/Studio: `packages/inm-cli/src/commands.ts`, `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove compiler rejection, exact host validation, lot conservation, transit preservation, eligible-only shortage coverage, agent consumption, treatment capacity gaps, and cold-start synthesis of the complete chain.

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "production mode|treated material|factory synthesis"
bun run inm analyze examples/ironworks
bun run inm plan examples/ironworks --blueprint synthesized --scenario cold-start
bun run inm simulate examples/ironworks --blueprint synthesized --scenario cold-start
```

## Change checklist

- Keep total Resource quantities and level lots conserved together.
- Preserve exact levels through every local and station transit.
- Apply requirements consistently to runtime availability, dispatch coverage, analysis, planning, and synthesis.
- Never encode treatment as a hidden auxiliary recipe cost or invisible output multiplier.
- Update project-local runtime types, CLI, Studio, examples, and immutable runs with any contract change.
