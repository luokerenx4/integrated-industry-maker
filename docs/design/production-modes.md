# Production modes and exact jobs

Status: treatment-aware, in-situ-quality-aware, downstream-coverage, and tracked-input-queue adaptive-cadence modes with physical auxiliary-input ports and setup-sensitive equipment implemented through engine version `inm-sim/0.86.0`.

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

## Downstream-coverage recovery

A Device with exactly two `recipes` for the same Process may declare `policy.cadenceControl.kind: downstream-coverage-recovery`. The policy names the normal mode, recovery mode, one exact outbound physical Connection, a positive `recoverBelowItems` boundary, and a required positive `minimumCoverageDeficitTicks` debounce. Both plans must compile to identical material inputs, outputs, lot transfers, terminations, and output profiles; the Process must have one unambiguous output Resource carried alone by the named Connection. `recipeDispatch`, setup campaigns, and batch formation are intentionally exclusive with this policy.

Selection occurs only before a new non-preemptive job. Destination coverage is the exact output Resource already resident in the Connection's destination buffer plus local or station cargo already in flight to that same Device and buffer. The runtime records when continuous below-boundary coverage begins; any healthy observation resets that interval. Recovery is eligible only after the interval reaches `minimumCoverageDeficitTicks`, so a brief ordinary handoff gap remains on the normal mode while sustained coverage pressure selects recovery. Ordinary readiness, output capacity, tooling, utilities, maintenance, and power still decide whether the selected job can physically start.

Coverage deficit is deliberately predictive and must not be interpreted as downstream material starvation. The downstream Device may still be processing while its next input coverage is below the boundary, and a finite campaign can leave the timer open after the last useful job. Actual material-input shortage is emitted only when an eligible productive Device lacks the exact policy-resolved inputs inside an event-backed opportunity interval; see [[docs/design/fab-loss-attribution]].

## Tracked input-queue recovery

`policy.cadenceControl.kind: input-queue-recovery` uses the same two-mode, identical-material, non-preemptive contract but names one exact tracked input Resource, a positive resident-lot boundary, and a positive oldest-wait boundary. The compiler requires that Resource on the controlled Process input and bounds `recoverAtItems` by its backing buffer capacity.

At each selection boundary, only route-eligible identities currently resident in that exact input buffer count. Their wait age is `currentTick - statusSinceTick` only while evaluator-owned lot state is `queued`. Recovery is selected only when both `recoverAtItems` and `minimumQueueTicks` are met. In-flight lots, downstream coverage, and inferred future demand do not enter this trigger. This makes local queue pressure distinct from downstream-coverage prediction and from event-backed input starvation.

## Analysis, planning, and synthesis

Static recipe alternatives enumerate every compatible `(Device instance, Process, mode)` tuple. Their displayed inputs/outputs are effective job quantities, including auxiliary Resources and required treatment level; their rates use compiled duration and their power uses the mode multiplier. See [[docs/design/material-treatment]] for graded lot availability and physical treatment infrastructure.

Material solvers treat every `(Process, Device asset, mode)` tuple as a separate production candidate. Raw-resource minimization therefore may select a productive mode only when its larger output batch and auxiliary cost improve the whole balanced system. The second optimization phase includes mode-aware installed power. Capacity planning groups configured machines by Process, asset, and mode, and sizes job rate, local/station transport, extraction, reserves, and regional power from the same effective quantities.

Synthesis writes `recipe.mode` into the generated blueprint, routes auxiliary Resources to their declared ports, and builds the complete treatment/agent chain for a grade-requiring mode. Research alternatives include the mode in strategy identity, but the bounded heuristic omits grade-requiring bare switches until it can propose the full infrastructure bundle.

## Observability

`inm analyze`, `inm plan`, and `inm synthesize` identify the selected mode and show effective jobs/rates, mode power, and declared prevention capability. Production `device.start` and `device.finish` events record the exact selected mode. Simulation metrics preserve the authored discriminated control boundary and count normal jobs, recovery jobs, and recovery activations for every controlled Device. Downstream coverage additionally records deficit episodes/time; input-queue control records its input Resource, resident boundary, and oldest-wait boundary. CLI and Studio expose the same union without event-log reconstruction. Studio also exposes prevention capability in the project-local asset catalog/recipe alternatives and measured prevention in the selected Device inspector and performance panel.

The descriptive Device catalog hash includes every authored mode. Execution evidence includes only effective modes on selected operations, so editing or selecting a commissioned mode invalidates prior run identity while adding an unused option does not. Immutable runs record the compiled Blueprint and engine version used for replay.

## Option catalog versus commissioned operation

A project-local mode may be a real qualified option without being the selected operating regime. The memory-fab ALD bay exposes `qualified`, `agile-pulse`, and `agile-pulse-fast`. The first recovery option runs the same deposition Process at `4/5` duration and `5/4` active power; the faster qualified pulse sequence runs at `2/3` duration and `3/2` active power. Adding either mode changes descriptive Device catalog inventory but neither silently changes Blueprint operation nor stales unrelated evidence.

The commissioned Design provider may propose either the exact always-agile mode switch or an explicit one-item downstream recovery controller when current compatible evidence ranks `input-starvation`. Inventory-only research first found `recoverBelowItems: 1` alternated `5` normal / `7` recovery jobs but improved four cases while regressing steady production by `0.331053`; larger inventory boundaries collapsed to always-agile behavior.

The first bounded time sweep kept the one-item boundary on `agile-pulse` and found ten seconds promotion-safe, but it did not recover any of the furnace's exact `42.456 s` input-starvation interval. A second physical research grid therefore separates source processing, source input wait, and transport in flight while jointly testing the faster mode at `0`, `2`, `5`, and `10 s` persistence thresholds. Five seconds is the sole zero-regression point that reduces the addressed loss: aggregate current-best score improves `+1.084759`, the limiting facility-interruption case improves `+0.201089`, and furnace shortage falls to `40.456 s`. The commissioned controller runs `9` normal and `3` fast recovery jobs in mixed-quality Run `087-simulate`, activates three times only after the downstream one-item deficit persists for five seconds, and immediately returns to `qualified` when resident-plus-in-flight coverage recovers.

Design Run `206067de7d3566d5793d078f2db05ecbceb3b2ccdd0122ecec70b8b0d5c8a217` records the five-case decision. Candidate `commissioned-furnace-supply-recovery` and review `04a1b22b3d1d952c98394a838bf054e833c4c8273ac7666da2ced6d398016aac` commission exactly three operations: select `agile-pulse-fast` as the two recipes' recovery mode, bind the cadence controller to that same mode, and set `minimumCoverageDeficitTicks` to `5000`.

This separation is intentional. Asset catalogs describe physically available choices; Blueprints declare operation; Benchmark and Design evidence decide whether a choice is robust enough to commission. Every locked per-case metric snapshot preserves a required `cadenceControl.devices` map containing the exact inventory/time policy boundary, measured normal/recovery jobs, recovery activations, coverage-deficit episodes, and coverage-deficit time; an uncontrolled Blueprint emits `devices: {}`. Immutable Design Run V3 requires this record in its seed and every successful Candidate evaluation. Humans and Agents therefore inspect the same mode, exact patch, activation split, observed trigger pressure, power trade, case deltas, and branch decision instead of treating an unselected option as an upgrade or inferring activation from score.

The memory-fab particle-prevention study exercises the same catalog-versus-operation boundary for quality. `closed-loop-plasma-etch-bay` advertises `particle-suppression` at `13/10` active power with unchanged cycle time; it prevents exact `latent-electrical` and `particle-contamination` excursion classes. The commissioned `etch-l2` recipe remains on `closed-loop-control`. Design Run `5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9` retains the one-field switch as a non-promotable Pareto branch because the rework reduction improves mixed quality but changes return-flow timing enough to regress four current-best cases. An available mode is not a global upgrade and an aggregate gain is not commissioning authority.

The final-test rack applies the same rule to terminal throughput. Its project-local catalog exposes `agile-screening-5-8`, which shortens both already-qualified screen programs to `5/8` duration while raising active power to `8/5`. Bounded research rejected faster `3/5` and `1/2` variants because peak-power contention breaks hard outcomes, then showed that the `5/8` envelope improves every current-best case without adding equipment or changing product disposition. Design Run `339f3d9f9aaac02d5b8884f7bae6062e4238cd3e94e89318558ccb5d9a6fa513` selected the two-recipe mode patch; Candidate `candidate-3` and review `13d5f06aa3c5df68bfd42c903a38670706a9291c3907d46f23556446cf41505e` commissioned Blueprint `dc9909a63f85966cf52c5b5080159b8e74395080020ae0f79e090ff5a8d006f1`.

This terminal improvement does not make the particle branch safe. A causal trace shows that preventing `dram-lot-08` rework lets it reach the single Probe first and delay the previously on-time `dram-lot-07`; rerunning the branch against the faster final-test incumbent retains the same limiting-case regression. Physical bottlenecks and lot identity therefore remain causal even when the aggregate factory produces more value.

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
