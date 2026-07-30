# Blueprint comparison and controlled evaluation

Status: exact patching, industrial semantic diff, capacity comparison, deterministic before/after evaluation, and immutable Run delta explanation implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/simulation-runtime]], [[docs/ARCHITECTURE]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

## Purpose

A factory edit needs two answers: what changed, and whether that change improved the selected industrial objective. Text diff answers neither reliably because Blueprint arrays can move and one recipe-mode edit changes rate, material, power, and downstream capacity at once.

`inm compare` treats two complete Blueprint files as a controlled experiment. It compiles, plans, simulates, and scores both while holding every benchmark input constant. The result is suitable for a human review or the next coding-agent iteration.

The same command has a distinct immutable-evidence mode. `--from-run` and `--to-run` reopen two exact completed Runs, verify their stored identities, and explain what the already-observed intervention changed without replaying simulation. Blueprint mode answers “what would these authored alternatives do under one fresh controlled evaluation?” Run mode answers “what did these two persisted executions prove?” The modes are mutually exclusive and are never silently substituted.

Candidate review reuses the same comparison invariant across every locked Benchmark case. Its immutable baseline-to-proposed result answers compliance; when the Candidate artifact's hash-pinned current Blueprint is operational, its `currentFactory` record compares that Blueprint with the proposed Blueprint and answers the incremental design question. That record also separates equipment/facility, sorter-endpoint, and unique transport-line capital plus occupied area and transport-cell count into one exact physical-economics ledger. Total cost and area reconcile against every evaluator-owned case metric before the result can be published. A non-operational greenfield shell is explicitly not comparable. Neither reference is relabeled or substituted for the other.

## Comparison invariant

The only allowed independent variable is the Blueprint. Before evaluation, both compiled projects must have identical hashes for:

- Resource catalog;
- Process catalog;
- Device catalog, including TypeScript runtimes and visuals;
- World and finite deposits;
- Scenario and initial/failure conditions;
- Objective, constraints, and weights.

Both simulations use the same non-negative integer seed. A mismatch is an error rather than an annotated delta because the result would no longer isolate the Blueprint. Each Blueprint must compile and execute under the selected Scenario; runtime failure identifies the failing Blueprint label.

Immutable Run comparison applies the same non-Blueprint invariant to persisted evidence. Each Run must reproduce its own execution hash by compiling its frozen `blueprint.json` against its selected current project inputs, and its `resultHash` must reproduce from the Run key, ordered events, final state, and metrics. The pair must share engine, World, Scenario, Objective, seed, complete Scenario duration, and every non-Blueprint compiled input. Adjacent timestamps, matching Blueprint ids, or a current editable Blueprint are not compatibility evidence.

## Result contract

One comparison contains five coordinated views:

1. `patch` is a deterministic RFC 6902 `add`/`remove`/`replace` sequence that exactly transforms the complete source Blueprint into the complete candidate Blueprint. It is a general file transformation and is not limited by the narrower Research patch permission boundary.
2. `changes` compares stable ids and groups additions, removals, and field changes under `device`, `connection`, `logistics-network`, `policy`, or `metadata`. Field paths such as `recipe.mode` are independent of an entity's array position.
3. `from.capacityPlan` and `to.capacityPlan` expose target-rate readiness and exact industrial gaps before simulation.
4. Both metric snapshots come from the ordinary deterministic simulator and evaluator. Each snapshot preserves the evaluator-owned ordered `scoreBreakdown`; its fifteen components sum to the reported score. The component delta and every scalar delta are always `to - from`, and the component delta sum must reproduce the score delta within deterministic tolerance. Other scalar deltas cover throughput, attainment, consumed energy, stored/charged/discharged/unserved/curtailed energy, unpowered Device time, transport energy, build cost, area, Objective-scoped WIP, total inventory, complete per-Resource inventory accounting, belt blockage/utilization, and congestion. Every authored Objective constraint is retained as ordered typed evidence with stable id/label, source, closed metric/direction/unit, actual, threshold, non-negative deficit, pass state, and exact delivery-contract identity when applicable. The binary fixed penalty remains an Objective component, but it is never the only explanation for a failed factory; projections must not parse `infeasibleReason` to recover constraint causality. See [[docs/design/inventory-accounting]].
5. `verdict` is `IMPROVED`, `REGRESSED`, or `UNCHANGED` from the Objective score delta with a fixed numerical tolerance. Individual metric signs are not interpreted independently because their value depends on Objective weights and hard constraints.

Patch generation walks object keys in lexical order and arrays in index order. Applying the patch to the source and comparing canonical serialization with the candidate is a required test invariant.

Run comparison adds the complete exact FROM/TO Run, result, execution, and Blueprint identities; the same semantic/spatial changes and replayable patch; persisted metric and capacity snapshots; full fab-loss attribution on both sides; per-bucket score and leading-contributor changes; and stable URLs for both complete factories plus every changed Device or Connection. Zero deltas, unchanged delivery/quality outcomes, capacity state, and Objective constraints remain present so a higher score cannot hide a surrendered industrial guardrail. `verdict` is evidence classification only: neither Core nor either projection chooses the next intervention.

`factoryRunComparisonEvidenceHash()` is the compact persistence identity for this object. It commits every industrial evidence field and the project id while excluding the local project root, display name, and navigation. An explicit Investigation observation can retain that hash plus exact FROM/TO and TO-context identities without copying the dense comparison. Reopening the Investigation recomputes the comparison from both Runs; missing, corrupt, or incompatible evidence fails closed. See [[docs/design/industrial-investigations]].

## Read-only boundary

Comparison never writes either Blueprint, never updates a revision, and never creates a run artifact. Blueprint mode performs an ephemeral pair of evaluations and does not reuse historical Runs. Run mode reads and verifies two existing immutable artifacts and never replays them. A user explicitly persists new evidence with `inm simulate`, or enters the guarded Candidate/Design workflow.

This separation prevents exploratory comparisons from polluting immutable experiment history and makes filesystem mutation visible at the command boundary.

## Source of truth

- Patch application, semantic changes, benchmark checks, planning, simulation, and deltas: `packages/inm-core/src/blueprint-comparison.ts`
- Immutable Run loading, compatibility, loss delta, and navigation: `packages/inm-core/src/run-comparison.ts`
- Public exports: `packages/inm-core/src/index.ts`
- Human and JSON command output: `packages/inm-cli/src/commands.ts`
- Argument selection: `packages/inm-cli/src/bin.ts`

## Verification

```bash
bun run inm compare examples/ironworks \
  --from-blueprint synthesized \
  --to-blueprint scaled-factory \
  --world scaled \
  --scenario cold-start \
  --objective scaled-production \
  --seed 42

bun run inm compare examples/memory-fab \
  --from-run 100-simulate \
  --to-run 101-simulate
```

Tests must prove exact patch replay, stable-id semantic classification, deterministic equal-seed deltas, exact Objective-component reconciliation, capacity-plan visibility, changed-benchmark rejection, seed validation, Run result/execution identity reconstruction, explicit incompatible-evidence rejection, loss-leader transitions, stable changed-subject navigation, and the absence of run artifacts or Blueprint writes.

## Change checklist

When comparison semantics change:

1. update the result types and both human/JSON output together;
2. preserve exact patch replay and deterministic ordering;
3. preserve the equal-benchmark and equal-seed invariant;
4. update this document, [[docs/CLI]], and affected architecture/format text;
5. exercise both a small single-field edit and a structurally different Blueprint through the public CLI;
6. reopen one real immutable Run pair through Core, CLI, Studio API, copied comparison URL, and both historical Factory views.
