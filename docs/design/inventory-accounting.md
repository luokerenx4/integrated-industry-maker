# Objective-owned inventory accounting

Status: explicit Resource-scoped WIP integration, score semantics, immutable evidence, comparison, CLI, workbench, and Studio projection implemented.

Related: [[docs/design/simulation-runtime]], [[docs/design/lot-tracking]], [[docs/design/industrial-boundaries]], [[docs/design/blueprint-comparison]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], [[docs/PROJECT_FORMAT]], and [[docs/CLI]].

## Why WIP is not total inventory

An industrial factory can simultaneously hold raw purchases, identity-preserving work lots, unfinished fungible product, maintenance consumables, reusable tooling, scrap, and finished goods waiting at a delivery boundary. Summing all of them and labeling the result “WIP” makes a stocking decision look like a cycle-time decision and can dominate an optimization score for the wrong reason.

The role is also Objective-dependent. Ironworks `hydrogen` is an intermediate in the general process graph but a delivered product under the hydrogen Objective. Descriptive Resource tags and graph reachability therefore cannot authoritatively decide whether a Resource is scored as work in process.

## Authored contract

Every Objective declares `wipResources`, an exact duplicate-free list of project Resource ids. The list may be empty. Missing, duplicate, and unknown entries are invalid; there is no inferred default or compatibility reader.

The selected Objective is fixed evaluator input. A Blueprint Candidate cannot edit its WIP scope, and Blueprint comparison and locked Benchmarks already require identical Objective hashes. This prevents an optimizer from improving its score by redefining accounting.

Memory-fab includes every released wafer-stage Resource plus known-good die and packaged devices. It excludes scheduled package substrates, maintenance and qualification consumables, reusable reticles, scrap disposition, and three delivered DRAM grades.

## Runtime integration

At every deterministic measurement boundary, Core groups inventory by Resource across:

- all resident Device buffers;
- local loader, belt, and unloader transit;
- station-network cargo in flight.

Each physical item appears in exactly one of those locations. Moving material therefore does not disappear from inventory and is not counted twice. For every observed Resource, the runtime integrates item-ticks, records peak quantity, and captures final quantity. It separately records total inventory and the sum whose Resource ids occur in `Objective.wipResources`.

`FactoryMetrics.inventoryAccounting` contains:

- average and peak total inventory;
- average and peak scored WIP;
- average excluded inventory;
- deterministic per-Resource `includedInWip`, average, peak, and final quantities.

`FactoryMetrics.averageWip` is the same scoped average retained as the direct score input. `scoreBreakdown.wip` is exactly `-averageWip × Objective.weights.wip`.

This is inventory accounting, not lot-card control. CONWIP still counts released non-terminal tracked lot identities; it neither counts downstream fungible units nor reads the Objective WIP list.

## Shared evidence

Immutable run `metrics.json` owns the complete machine-readable accounting. `report.md` prints the summary and one Resource table. Compare/Benchmark snapshots preserve the complete baseline/candidate tables and exact per-Resource deltas.

`inm simulate` human output lists scored contributors; its bounded JSON summary retains the complete accounting object. `inm inspect` exposes the authored scope even without a run and, when a hash-compatible run exists, projects the same evidence through the V4 workbench. Studio Overview and Factory replay render those values without recomputation.

Total inventory remains visible so excluded raw, support, scrap, and finished stock can be diagnosed. It never silently contributes to the WIP score.

## Source of truth

- Objective type and strict schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Semantic validation: `packages/inm-core/src/compiler.ts`
- Deterministic integration: `packages/inm-core/src/simulator.ts`
- Metrics and score: `packages/inm-core/src/evaluator.ts`
- Immutable report: `packages/inm-core/src/artifacts.ts`
- Comparison evidence: `packages/inm-core/src/blueprint-comparison.ts`
- Shared workbench: `packages/inm-core/src/workbench.ts`
- Human/Agent and Studio projection: `packages/inm-cli/src/commands.ts`, `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove strict Objective validation, resident/in-flight continuity, exact equality between the included per-Resource average sum and `averageWip`, exclusion of project support/raw/finished Resources, score-component reconciliation, comparison deltas, workbench parity, immutable report projection, and deterministic replay.
