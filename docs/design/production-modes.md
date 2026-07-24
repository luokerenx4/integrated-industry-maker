# Production modes and exact jobs

Status: treatment-aware, in-situ-quality-aware, and sustained-starvation adaptive-cadence modes with physical auxiliary-input ports and setup-sensitive equipment implemented through engine version `inm-sim/0.81.0`.

Related: [[docs/PROJECT_FORMAT]], [[docs/design/material-contracts]], [[docs/design/material-treatment]], [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/power]], [[docs/design/simulation-runtime]], [[docs/design/blueprint-optimization]], [[docs/CLI]].

## Scope

This subsystem owns Device-declared production modes, blueprint mode selection, compilation of a Process into one physical job, mode-aware static analysis and optimization, and exact runtime enforcement. It models choices such as standard, accelerated, and productive operation without engine-global upgrades or hidden multipliers.

## Authoring contract

Every production-capable Device asset has a non-empty `production.modes` array. Every blueprint `recipe` or `recipes` entry has a required `mode` id. There is no default, alias, migration, or fallback because INM is in early development and the selected mode is part of the industrial design.

A mode declares:

- `inputCycles`: how many Process input batches one job consumes;
- `outputCycles`: how many Process output batches one job produces;
- `durationMultiplier`: an exact positive rational applied after Device base speed;
- `powerMultiplier`: an exact positive rational applied to Device base consumption;
- `minimumInputTreatmentLevel`: the minimum grade accepted for every Process input;
- `auxiliaryInputs`: project Resource quantities consumed once per job through named physical input ports.
- `preventsDefects`: exact fixed Scenario excursion defect classes prevented while this mode executes the challenged Process.

Modes belong to the Device asset because they describe what that machine can do. Processes remain project-local material transformations and do not know which machines or operating regimes execute them.

`preventsDefects` is capability, not a hidden yield multiplier. The fixed Scenario excursion remains evaluator-owned and visible; runtime records the authored, prevented, and applied defect sets. Cost, power, time, auxiliary inputs, equipment qualification, and Blueprint selection price the capability through the ordinary industrial model. See [[docs/design/quality-flow]].

## Compilation

For Process `P`, Device `D`, and selected mode `M`, the compiler creates one immutable plan:

```text
job inputs  = P.inputs × M.inputCycles + M.auxiliaryInputs
job outputs = P.outputs × M.outputCycles
job time    = ceil(P.duration × D.speed.denominator / D.speed.numerator
                   × M.durationMultiplier.numerator / M.durationMultiplier.denominator)
job power   = ceil(D.basePower × M.powerMultiplier.numerator / M.powerMultiplier.denominator)
```

Amounts for the same `(buffer, Resource)` are aggregated after physical ports resolve to their backing buffers. One mode may declare each auxiliary Resource once. Auxiliary inputs must reference a project Resource, a declared production input port, and a Resource admitted by the asset, buffer, and port contracts. If an auxiliary Resource is also a Process input, both declarations must use the same port. A complete job—including the sum of all Resources sharing one buffer—must fit; the compiler does not split one job into fractional cycles.

Each qualified operation retains its complete mode definition, exact duration, exact active power, priority, and buffer-bound quantities. A dedicated Device has one plan; a shared work center has an ordered plan list. Grid rated load uses the largest qualified productive or changeover power envelope because only one non-preemptive operation can run at a time.

Process `setupGroup` and Device `production.changeover` are orthogonal to production modes. A mode still defines productive batch arithmetic; changing to another setup group creates a separate non-productive job with its own duration and power. See [[docs/design/equipment-changeover]].

## Runtime authority

The TypeScript Device program receives the compiled mode and job fields in `context.process`. It may wait for inputs or output space, but a returned `start` action must exactly match the compiled operation id, duration, consumed quantities, produced quantities, and power. The host rejects any difference before mutating inventory or allocating power.

This boundary keeps runtime scripts useful for local scheduling while preventing them from silently inventing productivity, deleting auxiliary costs, under-reporting power, or bypassing physical buffers. Integer jobs also make failure, WIP, backpressure, and replay state unambiguous.

## Downstream-starvation recovery

A Device with exactly two `recipes` for the same Process may declare `policy.cadenceControl.kind: downstream-starvation-recovery`. The policy names the normal mode, recovery mode, one exact outbound physical Connection, a positive `recoverBelowItems` boundary, and a required positive `minimumStarvationTicks` debounce. Both plans must compile to identical material inputs, outputs, lot transfers, terminations, and output profiles; the Process must have one unambiguous output Resource carried alone by the named Connection. `recipeDispatch`, setup campaigns, and batch formation are intentionally exclusive with this policy.

Selection occurs only before a new non-preemptive job. Destination coverage is the exact output Resource already resident in the Connection's destination buffer plus local or station cargo already in flight to that same Device and buffer. The runtime records when continuous below-boundary coverage begins; any healthy observation resets that interval. Recovery is eligible only after the interval reaches `minimumStarvationTicks`, so a brief ordinary handoff gap remains on the normal mode while persistent starvation selects recovery. Ordinary readiness, output capacity, tooling, utilities, maintenance, and power still decide whether the selected job can physically start.

## Analysis, planning, and synthesis

Static recipe alternatives enumerate every compatible `(Device instance, Process, mode)` tuple. Their displayed inputs/outputs are effective job quantities, including auxiliary Resources and required treatment level; their rates use compiled duration and their power uses the mode multiplier. See [[docs/design/material-treatment]] for graded lot availability and physical treatment infrastructure.

Material solvers treat every `(Process, Device asset, mode)` tuple as a separate production candidate. Raw-resource minimization therefore may select a productive mode only when its larger output batch and auxiliary cost improve the whole balanced system. The second optimization phase includes mode-aware installed power. Capacity planning groups configured machines by Process, asset, and mode, and sizes job rate, local/station transport, extraction, reserves, and regional power from the same effective quantities.

Synthesis writes `recipe.mode` into the generated blueprint, routes auxiliary Resources to their declared ports, and builds the complete treatment/agent chain for a grade-requiring mode. Research alternatives include the mode in strategy identity, but the bounded heuristic omits grade-requiring bare switches until it can propose the full infrastructure bundle.

## Observability

`inm analyze`, `inm plan`, and `inm synthesize` identify the selected mode and show effective jobs/rates, mode power, and declared prevention capability. Production `device.start` and `device.finish` events record the exact selected mode. Simulation metrics preserve the authored inventory/time boundary and count normal jobs, recovery jobs, recovery activations, starvation episodes, and total observed starvation time for every controlled Device. CLI and Studio expose this same record without requiring event-log reconstruction. Studio also exposes prevention capability in the project-local asset catalog/recipe alternatives and measured prevention in the selected Device inspector and performance panel.

Engine hashes include asset and blueprint content, so changing a mode or selection invalidates prior run identity. Immutable runs record the compiled blueprint and engine version used for replay.

## Option catalog versus commissioned operation

A project-local mode may be a real qualified option without being the selected operating regime. The memory-fab ALD bay exposes `qualified` and `agile-pulse`; the latter runs the same deposition Process at `4/5` duration and `5/4` active power. Adding the mode changes the Device catalog hash but does not silently change the commissioned Blueprint, which continues to select `qualified`.

The commissioned Design provider may propose either the exact always-agile mode switch or an explicit one-item downstream recovery controller when current compatible evidence ranks `input-starvation`. Inventory-only research first found `recoverBelowItems: 1` alternated `5` normal / `7` recovery jobs but improved four cases while regressing steady production by `0.331053`; larger inventory boundaries collapsed to always-agile behavior.

The current bounded time sweep keeps that one-item boundary and tests `1 ms, 1, 2, 3, 5, 7, 10, 15, 20 s`. Ten seconds is the only promotion-safe point: it changes steady/mixed/quality operation to `10/2`, lithography interruption to `10/2`, and facility interruption to `11/1`; all five current-best deltas are non-negative and weighted score improves by `0.773808`. Seven seconds scores higher in aggregate but still regresses steady production by `0.008408`, so it remains ineligible. The project provider proposes the measured ten-second contract and Design retains authority to accept, branch, or reject it before Candidate commissioning.

This separation is intentional. Asset catalogs describe physically available choices; Blueprints declare operation; Benchmark and Design evidence decide whether a choice is robust enough to commission. Every locked per-case metric snapshot preserves a required `cadenceControl.devices` map containing the exact inventory/time policy boundary, measured normal/recovery jobs, recovery activations, starvation episodes, and starvation time; an uncontrolled Blueprint emits `devices: {}`. Immutable Design Run V3 requires this record in its seed and every successful Candidate evaluation. Humans and Agents therefore inspect the same mode, exact patch, activation split, observed trigger pressure, power trade, case deltas, and branch decision instead of treating an unselected option as an upgrade or inferring activation from score.

## Source of truth

- Types/schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Job arithmetic: `packages/inm-core/src/production-mode.ts`
- Compilation: `packages/inm-core/src/compiler.ts`
- Runtime enforcement: `packages/inm-core/src/simulator.ts`
- Analysis and binding: `packages/inm-core/src/production-analysis.ts`
- Capacity and synthesis: `packages/inm-core/src/capacity-plan.ts`, `packages/inm-core/src/synthesis.ts`
- Research candidates: `packages/inm-core/src/research.ts`
- CLI and Studio: `packages/inm-cli/src/commands.ts`, `packages/inm-studio/src/main.tsx`

## Verification

Tests must cover an unknown mode, duplicate prevention declarations, an auxiliary Resource rejected by an instance filter, a job that exceeds physical buffer capacity, exact compiled arithmetic, runtime authored/prevented/applied partitioning, power enforcement, mode-aware analysis, and synthesis choosing a mode through the material objective.

```bash
bun run inm validate examples/ironworks
bun run inm analyze examples/ironworks
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output scratch
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "production mode|productive mode|factory synthesis"
```

## Change checklist

- Keep asset schema, blueprint schema, project-local runtime API, compiler context, and Device scripts aligned.
- Apply mode quantities to material balance, buffers, transport, reserves, power, metrics, and optimizer costs together.
- Never hide auxiliary consumption or choose a mode outside the blueprint/compiler contract.
- Preserve integer complete-job semantics and exact host validation.
- Update CLI, Studio, examples, immutable runs, and this document in the same change.
