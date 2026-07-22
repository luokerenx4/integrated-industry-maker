# Coding Agent Blueprint optimization

Status: locked multi-case Blueprint benchmarks and a file-native Coding Agent loop are implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/blueprint-comparison]], [[docs/design/work-center-dispatch]], [[docs/design/work-center-specialization]], [[docs/design/reusable-production-tooling]], [[docs/design/usage-based-maintenance]], [[docs/design/equipment-energy-states]], [[docs/design/electricity-tariffs]], [[docs/design/lot-release-scheduling]], [[docs/design/wip-release-control]], [[docs/design/batch-processing]], [[docs/design/quality-flow]], [[docs/design/lot-derived-output]], [[docs/design/simulation-runtime]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

## Product model

INM treats industrial optimization as code optimization:

```text
fixed industrial catalogs + World + Scenarios + Objective + evaluator
  versus
one editable Blueprint JSON file
  → compile
  → simulate a locked case suite
  → aggregate one benchmark score
  → enforce per-case regression and capacity gates
  → KEEP / DISCARD
```

This follows the useful separation in Karpathy's [`autoresearch`](https://github.com/karpathy/autoresearch): a human-authored program tells an agent how to work, one reviewable file is editable, and the preparation/evaluation harness stays fixed. Its fixed wall-clock training budget becomes a fixed set of deterministic Scenario ticks in INM. Its validation metric becomes the Objective score, evaluated across several operating conditions rather than one happy-path run.

The analogy is structural, not cosmetic:

| `autoresearch` | INM |
| --- | --- |
| `program.md` | project-local `AUTORESEARCH.md` |
| editable `train.py` | one `blueprints/<candidate>.blueprint.json` |
| fixed `prepare.py` and evaluator | locked assets, Processes, World, Scenarios, Objective, compiler, simulator, evaluator |
| fixed training time | fixed case list, duration ticks, seeds, and weights |
| `val_bpb` | weighted Objective score |
| keep/discard commit | `KEEP` / `DISCARD` / `UNCHANGED` verdict |

## Why a DSP-like physical model matters

The optimization file is valuable only when it describes real industrial choices. INM uses a broad industrial grammar: placed machines, explicit belts and sorter Devices, finite station fleets, power networks, independently laid-out industrial zones, and Blueprint deployment. Inter-zone distance represents the combined difficulty of line-haul travel, site boundaries, loading, and dispatch—not astronomical scale. The benchmark therefore scores topology and operation together rather than optimizing an abstract recipe spreadsheet.

INM is not a game-data clone. Project-local assets and TypeScript runtimes define the actual equipment, rates, economics, and material contracts. This lets a project approximate DSP tiers or model real equipment without changing the engine.

## Locked benchmark contract

`benchmarks/<id>.benchmark.json` selects:

- one immutable baseline Blueprint;
- one editable candidate Blueprint;
- one or more weighted cases, each fixing World, Scenario, Objective, seed, and Scenario duration;
- acceptance thresholds for aggregate improvement, worst allowed case regression, and optional target-rate capacity readiness.

`inm benchmark --lock` compiles every baseline case and writes its engine, catalog, World, Blueprint, Scenario, and Objective hashes plus a hash of the benchmark contract. Normal evaluation refuses to run when any fixed input or the case contract has drifted. The candidate Blueprint content is deliberately excluded from the lock.

The command is read-only unless `--lock` is explicitly supplied. It creates no run artifact and does not mutate either Blueprint. Human output ends with stable, grep-friendly fields:

```text
baseline_score: 12.622661
benchmark_score: 12.622661
score_delta: +0.000000
worst_case_baseline_score: 4.100000
worst_case_benchmark_score: 4.100000
minimum_case_score_delta: +0.000000
patch_operations: 0
semantic_changes: 0
verdict: UNCHANGED
```

JSON output contains every case score, capacity state and gap, aggregate score, acceptance reasons, exact Blueprint patch, and semantic changes.

## Robustness as an industrial requirement

A single Scenario rewards brittle layouts. A benchmark case suite represents an operating envelope: ordinary production, due-dated WIP, a timed equipment outage, intermittent regional power, demand variation, depleted feedstock, or another project-specific disturbance. Aggregate improvement is insufficient when a safety-critical case regresses beyond its configured allowance. Identity-preserving lots make dispatch edits measurable through on-time service, cycle/queue time, and tardiness without giving the Coding Agent access to the fixed evaluator. This is the first bridge from a factory-game optimizer toward real production engineering: the Blueprint is evaluated as a control/design program under several declared conditions.

The bundled Ironworks program keeps the candidate initially byte-equivalent to its baseline and evaluates 720,000 deterministic ticks across normal production, a smelter outage, and variable regional wind. Blueprint-authored `policies.powerAllocation`, per-Device `policy.powerPriority`, station charging/high-speed policies, generation, and storage are part of the editable control program. The focused `power-priority` benchmark locks hard allocation under a 240 kW grid cap and proves that exactly three priority edits protect an assembler plus its explicit loader/unloader. The `power-satisfaction` benchmark keeps proportional allocation and proves that adding an ordinary renewable Device improves shared satisfaction and delivery without editing the harness. The `station-energy` benchmark begins with source charging below the carrier mission demand and accepts the one-policy repair that restores the station route. The `high-speed-transport` benchmark limits route batch size and accepts expedited line haul only when its shorter turnaround outweighs its extra energy. The Coding Agent instructions are in `examples/ironworks/AUTORESEARCH.md`.

The bundled [[examples/memory-fab]] program applies the same loop to a re-entrant DRAM route. Wafer lots revisit lithography and etch stages, pass through a fixed three-lot thermal batch, acquire deterministic process excursions, then branch through inline inspection, selective rework, terminal scrap, or delivery. Layer-specific finite reticle sets are reserved for complete lithography jobs and remain trapped by failed equipment until recovery. Each placed stocker purchases an asset-bundled reticle package, so a Coding Agent can add costed tooling capacity by duplicating an ordinary Blueprint Device instead of editing the fixed Scenario. Lithography, etch, and ALD also contend for finite high-vacuum and hazardous-exhaust capacity from placed facility plants. Mask/recipe setup groups, inspection coverage, repair capability, excursion workload, alternative batch/rapid anneal Processes, reusable tooling, facility utilities, usage-based equipment limits and degradation curves, physical maintenance followed by consumable- and skill-bound equipment qualification, and per-step Q-time windows are fixed benchmark physics; Process selection, equipment count, topology, tooling and utility-provider count/placement, lot dispatch, preventive-maintenance timing, optional setup campaigns, and optional CONWIP release control remain Blueprint code. Four locked cases cover excursion-free flow, mixed quality work, a systematic excursion, and a timed lithography interruption. The checked-in candidate combines due-date-aware lot dispatch, deep inspection, rapid single-lot anneal, dedicated layer-2 lithography/etch equipment joined by an explicit elevated lane, inspection-only idle-window preventive maintenance, and a second utility plant. The plant is retained because dedicated tools without expanded facilities merely relocate the bottleneck. TypeScript searches retain these changes only because all four cases clear the same gate. The locked score decides the coupled yield, Q-time, power, tooling, utility-capacity, service, qualification, crew, consumable, and capital trades instead of hiding them in scheduler or evaluator code.

Its focused `product-mix-research` benchmark is one minimal proof of the loop. Baseline and candidate differ by one Blueprint value on the final-test rack: `authored-order` becomes `contract-value`. The focused `yield-research` benchmark is the second: one Probe recipe id changes from the standard program to the adaptive program while locked early latent-defect lots determine realized known-good die output. It improves the two-case aggregate by `32.800937`; the heavier excursion raises output realization from `79.2%` to `95.8%` and creates another sellable batch. `batch-formation-research` freezes an eleven-lot tail and lets one Blueprint qualify both fixed-batch and rapid anneal plus a bounded preference policy; the candidate keeps three full loads, drains the residual two lots after timeout, and increases delivered memory from 40 to 56 devices. `changeover-specialization-research` freezes a directional cleanup-pressure schedule. Its shared-tool baseline spends 97 seconds on seven transitions; the candidate Blueprint buys dedicated layer-2 tools, explicit lanes, and required facility capacity, spends 21 seconds on five commissioning/forward transitions, raises delivered devices from 24 to 56, and improves the locked score by `+51.243435`. `calendar-maintenance-research` freezes two six-lot release waves around equipment qualification expiry. One Blueprint policy moves `lithography-1` service into the idle gap; the 130-second window keeps all twelve lots on time, lowers mean cycle time from 97.4 to 90.9 seconds, remains capacity READY, and improves score by `+3.853927`. The locked Objective defines commercial, performance, and automotive demand floors, unit value, and shortfall penalties. Above-demand memory remains valuable. The larger `dispatch-research` benchmark shows that the same contracts can judge coupled equipment, routing, quality, maintenance, utility, and control changes.

`equipment-energy-research` is the focused standby-control proof. It freezes two production waves, a time-of-use tariff, and a regional peak-demand rate. Asset physics fixes furnace sleep draw and wake work; a TypeScript search may change only the Blueprint sleep threshold. The kept 30-second policy sleeps twice, wakes once, saves energy across 196 sleeping seconds, remains capacity READY with all twelve lots on time, lowers total electricity cost from `0.268831` to `0.265350`, and improves the locked score by `+0.994000`.

## Source of truth

- Benchmark schema, locking, evaluation, and aggregation: `packages/inm-core/src/benchmark.ts`
- Controlled single-case comparison: `packages/inm-core/src/blueprint-comparison.ts`
- CLI rendering: `packages/inm-cli/src/commands.ts`
- Example fixed harness: `examples/ironworks/benchmarks/autoresearch.benchmark.json`
- Example Agent program: `examples/ironworks/AUTORESEARCH.md`
- Memory-fab harness and program: `examples/memory-fab/benchmarks/dispatch-research.benchmark.json`, `examples/memory-fab/benchmarks/batch-formation-research.benchmark.json`, `examples/memory-fab/benchmarks/changeover-specialization-research.benchmark.json`, `examples/memory-fab/benchmarks/calendar-maintenance-research.benchmark.json`, `examples/memory-fab/benchmarks/equipment-energy-research.benchmark.json`, `examples/memory-fab/AUTORESEARCH.md`

## Verification

```bash
bun run inm benchmark examples/ironworks --benchmark autoresearch
bun run inm benchmark examples/ironworks --benchmark autoresearch --json
bun run inm benchmark examples/ironworks --benchmark power-priority
bun run inm benchmark examples/ironworks --benchmark power-satisfaction
bun run inm benchmark examples/ironworks --benchmark station-energy
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run inm benchmark examples/memory-fab --benchmark product-mix-research
bun run inm benchmark examples/memory-fab --benchmark yield-research
bun run inm benchmark examples/memory-fab --benchmark calendar-maintenance-research
bun run inm benchmark examples/memory-fab --benchmark equipment-energy-research
bun run memory-fab:research-energy
bun run memory-fab:research-calendar
bun run memory-fab:research-tools
bun run memory-fab:research-metrology
```

Tests must prove unchanged-baseline scoring, fixed tick accounting, lock drift rejection, and explicit relocking. Broader engine changes that alter any locked content require a reviewed `--lock` update.
