# Fab loss profiles and compatible-run attribution

Status: V3 project-aware measured loss ranking separates tracked-lot congestion from active productive-equipment starvation, uses inspected lots rather than unfinished WIP for verified yield, includes value-weighted delivery mismatch, and is projected from both hash-compatible runs and loss-guided Design iterations.

Related: [[docs/design/industrial-boundaries]], [[docs/design/lot-tracking]], [[docs/design/product-routes]], [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/CLI]], [[plans/memory-fab-design-loop]], [[plans/loss-guided-design]].

## Purpose and authority

Nominal production analysis answers whether configured jobs and material contracts can balance. It does not explain why a re-entrant fab lost realized service during one operating window. Once a completed run exactly matches the current engine, catalogs, World, Blueprint, Scenario, Objective, and selection, the workbench may derive a second evidence layer from its recorded `FactoryMetrics`.

`analyzeFabLossProfile()` is a deterministic source-neutral projection of existing evaluator-owned measurements plus the compiled project's Device capabilities. It does not simulate again, change an evaluator score, or claim calibrated semiconductor economics. Every normalization, including active-device utilization weighting, is returned as scalar evidence. `analyzeFabLosses()` adds one hash-compatible persisted-run identity to that profile for Workbench use; the ranking model itself owns no run provenance.

## Compatibility gate

A run is current only when World, Blueprint, Scenario, and Objective ids plus the engine, catalogs, World, Blueprint, Scenario, and Objective hashes all match the compiled project. Selection equality or engine equality alone is insufficient. An older run remains historical evidence but cannot drive current loss attribution or outrank current nominal diagnostics.

## Named buckets

For a run with a tracked lot family, Core ranks non-zero measured signals in these stable buckets:

- delivery portfolio: mean unmet share across evaluator-owned contracts, with exact demanded, delivered, shortfall, above-demand output, gross value, shortage penalty, and net value evidence;
- release and admission: pending scheduled lots plus CONWIP/control and physical-capacity release blocks;
- tracked-lot queue congestion: mean lot queue time as a share of mean cycle time, with process/move time and the measured productive bottleneck context retained separately;
- productive-equipment input starvation: raw input-wait time only for active `extract`, `process`, and `treat` Devices, utilization-weighted for ranking and subject selection so passive Sinks and normally sparse exception equipment cannot dominate merely by being idle;
- batch formation: formation holds, timeout releases, and per-lot batch wait;
- setup and campaign control: powered changeover work and campaign holds;
- maintenance and qualification: service, qualification, consumable wait, crew wait, and cancellation evidence;
- reusable tooling contention and fab facility contention: their independent provider waits, blocks, cancellations, and interruptions;
- equipment failure and power interruption: measured Device status time;
- physical transport: tracked-lot move time plus blocked physical-lane item time;
- Route Q-time: violated lots and step visits;
- verified yield and quality loss: first-pass results over actually inspected unique lots, plus rework, scrap, escapes, and lost lot-derived output; unfinished WIP is not called a quality failure.

Each bucket retains exact scalar evidence and the strongest available Device, connection, Route, or project subject. Queue congestion prefers the evaluator's productive bottleneck; input starvation ranks the largest `waitingInputTicks × utilization` contribution. This prevents the current fab's eight-second rework exception from outranking sustained burn-in underfeeding simply because the rework bay is correctly empty for most of the window. Zero-signal buckets are omitted. Results are deterministically sorted by descending score and stable id; `primary` is the first bucket and `chain` is the first five bucket ids. Delivery overflow is reported as context but is not itself a loss because above-demand product remains valuable under [[docs/design/delivery-contracts]].

## Interpretation boundary

Bucket scores normalize heterogeneous measured delays and counts so an operator or Agent can prioritize investigation. Several signals overlap—for example, a batch hold contributes to queue time, and a power interruption can extend Route Q-time. Scores are therefore not additive units of foregone output, a Shapley decomposition, or proof that changing the top bucket will recover a stated quantity.

The contract always carries this caveat. Product language uses “ranked signal” and “loss chain,” not fabricated percentage causality. A future counterfactual attribution model must be a separate evaluator contract with controlled reruns.

## Workbench projection

`ProjectWorkbenchSnapshot` version 3 includes `lossAttribution` or `null`. Compatible-run diagnostics use `fab-loss.<bucket>` codes, priorities 90 down to 86 for the top five, and `compatible-run` evidence with the exact run id. Capacity blockers remain priority 100. This makes realized fab evidence outrank generic nominal warnings only after the compatibility gate passes.

`inm inspect --section losses --json` returns the complete structured attribution. The default summary includes the outcome, primary bucket, chain, and caveat. Studio uses the same object for the Realized Fab Loss Chain panel and deep-links Device, connection, and Route subjects through existing project-qualified surfaces.

## Design iteration projection

A Design Program executes the exact driver case against its current best Blueprint before every proposal. Core hashes those complete driver metrics and derives a source-neutral `FabLossProfile` from them. The immutable iteration records both as `driverEvidence`; it never invents a persisted run id or calls invocation-local evidence “compatible.”

Project proposal-provider API V5 receives a deeply frozen copy of the same profile, explicit selected-branch identity, proposal-time leader comparison, and lineage-local history. For a promotion-ready leader whose ranked `chain` is non-empty, the provider must return `addressedLoss` naming one bucket in that chain. For an alternative with guardrail violations, it instead must return `addressedCase` naming one current promotion blocker and may omit `addressedLoss`; facility resilience must not be mislabeled as a mixed-quality loss intervention. Missing and fabricated targets are rejected before candidate compilation. Historical targets describe attempts made from this Blueprint lineage, including rejected ones; they do not alter the current chain or promotion boundary. Either target is a falsifiable rationale, not proof that its patch will succeed: the complete locked Benchmark and frontier policy still supply KEEP/BRANCH/REJECT authority.

The memory-fab provider annotates ordinary candidates with loss buckets and repair candidates with locked case ids. It chooses a case repair first when the selected alternative is blocked; otherwise it ranks the least-attempted eligible loss before chain position and authored order. It never repeats a strategy, skips a patch whose exact policy is already installed, and stops when it has no matching intervention. One repair adds ordinary powered N+1 fab-utility capacity for `facility-interruption`; a later repair adds spatially independent N+2 capacity only after a dedicated layer-two lithography bay exists. Another recognizes only the exact existing `3 / 12000` lithography campaign and removes voluntary hold for `lithography-interruption`.

On the exact initially commissioned factory, the preceding profile ranked `delivery-portfolio` first because 48 commercial devices included 16 above demand while performance was 12 short and automotive was 6 short, leaving `-48` net value. The bounded `dispatch:burn-in-contract-value` proposal changed only the existing rack policy. V3 then separated burn-in input starvation, lithography-context queue congestion, batch wait, Q-time, and the remaining commercial contract gap; verified first-pass yield was `5/6`, not the old `6/12` completion-derived “good yield.” That evidence led to a physically routed dedicated layer-two lithography bay. Its first evaluation became a branch because one surviving utility plant could not support the expanded vacuum/exhaust load during `facility-interruption`; N+2 utility repair made every locked case improve.

Current compatible run `057-simulate` now delivers 40 devices and leaves 10 commercial units short. Mean queue time falls from 48.9 to 39.2 seconds and etch becomes the bottleneck context. More WIP reaches inspection, so the next honest chain is `yield-quality → input-starvation → q-time → queue-congestion → batch-formation`: 5 of 12 inspected lots pass first inspection, 6 rework, and 2 scrap. The model does not hide that newly exposed quality constraint behind the commercial gain. Locked evaluation, not any annotation, proves whether a child becomes leader. The provider falls back to authored order only when there is no tracked-route profile. CLI progress and immutable JSON, plus Studio live and reopened result views, project the same observed chain, proposal boundary, and selected target history.

## Source of truth

- Ranking model: `packages/inm-core/src/fab-loss-analysis.ts`
- Compatibility and workbench priority: `packages/inm-core/src/workbench.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio projection: `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove exact hash compatibility, no attribution for missing/incompatible or untracked runs, deterministic ordering, stable delivery evidence, separate queue and starvation signals, utilization-weighted exclusion of passive or sparse exception Devices, inspected-lot yield evidence, priority above nominal warnings and below capacity blockers, source-neutral Design evidence with an exact metrics hash, project-provider target validation, and Core/CLI/Studio projection parity.
