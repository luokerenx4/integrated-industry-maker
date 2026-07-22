# Compatible-run fab loss attribution

Status: V1 measured loss ranking for hash-compatible tracked-lot runs is implemented in Core, CLI, and Studio.

Related: [[docs/design/industrial-boundaries]], [[docs/design/lot-tracking]], [[docs/design/product-routes]], [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/CLI]], [[plans/memory-fab-design-loop]].

## Purpose and authority

Nominal production analysis answers whether configured jobs and material contracts can balance. It does not explain why a re-entrant fab lost realized service during one operating window. Once a completed run exactly matches the current engine, catalogs, World, Blueprint, Scenario, Objective, and selection, the workbench may derive a second evidence layer from its recorded `FactoryMetrics`.

`analyzeFabLosses()` is a deterministic projection of existing evaluator-owned measurements. It does not simulate again, invent hidden utilization discounts, change a score, or claim calibrated semiconductor economics.

## Compatibility gate

A run is current only when World, Blueprint, Scenario, and Objective ids plus the engine, catalogs, World, Blueprint, Scenario, and Objective hashes all match the compiled project. Selection equality or engine equality alone is insufficient. An older run remains historical evidence but cannot drive current loss attribution or outrank current nominal diagnostics.

## Named buckets

For a run with a tracked lot family, Core ranks non-zero measured signals in these stable buckets:

- release and admission: pending scheduled lots plus CONWIP/control and physical-capacity release blocks;
- queue and input starvation: tracked-lot queue time plus Device waiting-input time;
- batch formation: formation holds, timeout releases, and per-lot batch wait;
- setup and campaign control: powered changeover work and campaign holds;
- maintenance and qualification: service, qualification, consumable wait, crew wait, and cancellation evidence;
- reusable tooling contention and fab facility contention: their independent provider waits, blocks, cancellations, and interruptions;
- equipment failure and power interruption: measured Device status time;
- physical transport: tracked-lot move time plus blocked physical-lane item time;
- Route Q-time: violated lots and step visits;
- yield and quality loss: good yield, scrap, rework, escapes, and lost lot-derived output.

Each bucket retains exact scalar evidence and the strongest available Device, connection, Route, or project subject. Zero-signal buckets are omitted. Results are deterministically sorted by descending score and stable id; `primary` is the first bucket and `chain` is the first five bucket ids.

## Interpretation boundary

Bucket scores normalize heterogeneous measured delays and counts so an operator or Agent can prioritize investigation. Several signals overlap—for example, a batch hold contributes to queue time, and a power interruption can extend Route Q-time. Scores are therefore not additive units of foregone output, a Shapley decomposition, or proof that changing the top bucket will recover a stated quantity.

The contract always carries this caveat. Product language uses “ranked signal” and “loss chain,” not fabricated percentage causality. A future counterfactual attribution model must be a separate evaluator contract with controlled reruns.

## Workbench projection

`ProjectWorkbenchSnapshot` version 3 includes `lossAttribution` or `null`. Compatible-run diagnostics use `fab-loss.<bucket>` codes, priorities 90 down to 86 for the top five, and `compatible-run` evidence with the exact run id. Capacity blockers remain priority 100. This makes realized fab evidence outrank generic nominal warnings only after the compatibility gate passes.

`inm inspect --section losses --json` returns the complete structured attribution. The default summary includes the outcome, primary bucket, chain, and caveat. Studio uses the same object for the Realized Fab Loss Chain panel and deep-links Device, connection, and Route subjects through existing project-qualified surfaces.

## Source of truth

- Ranking model: `packages/inm-core/src/fab-loss-analysis.ts`
- Compatibility and workbench priority: `packages/inm-core/src/workbench.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio projection: `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove exact hash compatibility, no attribution for missing/incompatible or untracked runs, deterministic ordering, stable primary/chain values for a checked-in tracked-lot fixture, priority above nominal warnings and below capacity blockers, and Core/CLI/Studio projection parity.
