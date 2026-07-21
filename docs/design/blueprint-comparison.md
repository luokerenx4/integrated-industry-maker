# Blueprint comparison and controlled evaluation

Status: exact patching, industrial semantic diff, capacity comparison, and deterministic before/after evaluation implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/simulation-runtime]], [[docs/ARCHITECTURE]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

## Purpose

A factory edit needs two answers: what changed, and whether that change improved the selected industrial objective. Text diff answers neither reliably because Blueprint arrays can move and one recipe-mode edit changes rate, material, power, and downstream capacity at once.

`inm compare` treats two complete Blueprint files as a controlled experiment. It compiles, plans, simulates, and scores both while holding every benchmark input constant. The result is suitable for a human review or the next coding-agent iteration.

## Comparison invariant

The only allowed independent variable is the Blueprint. Before evaluation, both compiled projects must have identical hashes for:

- Resource catalog;
- Process catalog;
- Device catalog, including TypeScript runtimes and visuals;
- World and finite deposits;
- Scenario and initial/failure conditions;
- Objective, constraints, and weights.

Both simulations use the same non-negative integer seed. A mismatch is an error rather than an annotated delta because the result would no longer isolate the Blueprint. Each Blueprint must compile and execute under the selected Scenario; runtime failure identifies the failing Blueprint label.

## Result contract

One comparison contains five coordinated views:

1. `patch` is a deterministic RFC 6902 `add`/`remove`/`replace` sequence that exactly transforms the complete source Blueprint into the complete candidate Blueprint. It is a general file transformation and is not limited by the narrower Research patch permission boundary.
2. `changes` compares stable ids and groups additions, removals, and field changes under `device`, `connection`, `logistics-network`, `policy`, or `metadata`. Field paths such as `recipe.mode` are independent of an entity's array position.
3. `from.capacityPlan` and `to.capacityPlan` expose target-rate readiness and exact industrial gaps before simulation.
4. Both metric snapshots come from the ordinary deterministic simulator and evaluator. The delta is always `to - from` for score, throughput, attainment, consumed energy, stored/charged/discharged energy, unpowered Device time, transport energy, build cost, area, WIP, belt blockage/utilization, and congestion.
5. `verdict` is `IMPROVED`, `REGRESSED`, or `UNCHANGED` from the Objective score delta with a fixed numerical tolerance. Individual metric signs are not interpreted independently because their value depends on Objective weights and hard constraints.

Patch generation walks object keys in lexical order and arrays in index order. Applying the patch to the source and comparing canonical serialization with the candidate is a required test invariant.

## Read-only boundary

Comparison never writes either Blueprint, never updates a revision, and never creates, caches, or reuses a run artifact. It performs an ephemeral pair of evaluations. A user explicitly persists evidence with `inm simulate`, or enters the KEEP/REVERT artifact workflow with `inm research`.

This separation prevents exploratory comparisons from polluting immutable experiment history and makes filesystem mutation visible at the command boundary.

## Source of truth

- Patch application, semantic changes, benchmark checks, planning, simulation, and deltas: `packages/inm-core/src/blueprint-comparison.ts`
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
```

Tests must prove exact patch replay, stable-id semantic classification, deterministic equal-seed deltas, capacity-plan visibility, changed-benchmark rejection, seed validation, and the absence of run artifacts or Blueprint writes.

## Change checklist

When comparison semantics change:

1. update the result types and both human/JSON output together;
2. preserve exact patch replay and deterministic ordering;
3. preserve the equal-benchmark and equal-seed invariant;
4. update this document, [[docs/CLI]], and affected architecture/format text;
5. exercise both a small single-field edit and a structurally different Blueprint through the public CLI.
