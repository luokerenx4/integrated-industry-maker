# Coding Agent Blueprint optimization

Status: locked multi-case Blueprint benchmarks and a file-native Coding Agent loop are implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/blueprint-comparison]], [[docs/design/simulation-runtime]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

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

The optimization file is valuable only when it describes real industrial choices. Dyson Sphere Program's public product description emphasizes grid-snapped buildings, conveyor transport into processing facilities, interplanetary/interstellar automation, and reusable factory blueprints. INM uses the same broad industrial grammar: placed machines, explicit belts and sorter Devices, finite station fleets, power networks, planets/orbits/sites, and Blueprint deployment. The benchmark therefore scores topology and operation together rather than optimizing an abstract recipe spreadsheet.

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
patch_operations: 0
semantic_changes: 0
verdict: UNCHANGED
```

JSON output contains every case score, capacity state and gap, aggregate score, acceptance reasons, exact Blueprint patch, and semantic changes.

## Robustness as an industrial requirement

A single Scenario rewards brittle layouts. A benchmark case suite represents an operating envelope: ordinary production, a timed equipment outage, intermittent regional power, demand variation, depleted feedstock, or another project-specific disturbance. Aggregate improvement is insufficient when a safety-critical case regresses beyond its configured allowance. This is the first bridge from a factory-game optimizer toward real production engineering: the Blueprint is evaluated as a control/design program under several declared conditions.

The bundled Ironworks program keeps the candidate initially byte-equivalent to its baseline and evaluates 720,000 deterministic ticks across normal production, a smelter outage, and variable regional wind. Blueprint-authored `policies.powerAllocation`, per-Device `policy.powerPriority`, station `policy.stationChargeMilliWatts`, generation, and storage are part of the editable control program. The focused `power-priority` benchmark locks hard allocation under a 240 kW grid cap and proves that exactly three priority edits protect an assembler plus its explicit loader/unloader. The `power-satisfaction` benchmark keeps proportional allocation and proves that adding an ordinary renewable Device improves shared satisfaction and delivery without editing the harness. The `station-energy` benchmark begins with source charging below the carrier mission demand and accepts the one-policy repair that restores the station route. The Coding Agent instructions are in `examples/ironworks/AUTORESEARCH.md`.

## Source of truth

- Benchmark schema, locking, evaluation, and aggregation: `packages/inm-core/src/benchmark.ts`
- Controlled single-case comparison: `packages/inm-core/src/blueprint-comparison.ts`
- CLI rendering: `packages/inm-cli/src/commands.ts`
- Example fixed harness: `examples/ironworks/benchmarks/autoresearch.benchmark.json`
- Example Agent program: `examples/ironworks/AUTORESEARCH.md`

## Verification

```bash
bun run inm benchmark examples/ironworks --benchmark autoresearch
bun run inm benchmark examples/ironworks --benchmark autoresearch --json
bun run inm benchmark examples/ironworks --benchmark power-priority
bun run inm benchmark examples/ironworks --benchmark power-satisfaction
bun run inm benchmark examples/ironworks --benchmark station-energy
```

Tests must prove unchanged-baseline scoring, fixed tick accounting, lock drift rejection, and explicit relocking. Broader engine changes that alter any locked content require a reviewed `--lock` update.
