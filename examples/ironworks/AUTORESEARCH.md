# Ironworks autoresearch program

This project turns industrial Blueprint optimization into a Coding Agent task. The editable research program is exactly one file:

```text
blueprints/autoresearch.blueprint.json
```

The fixed harness is `benchmarks/autoresearch.benchmark.json`. It compares that candidate against `blueprints/main.blueprint.json` under normal production, a timed smelter outage, and intermittent regional power. Each case has a fixed World, Scenario, Objective, seed, duration, and weight. Catalogs and every baseline input are content-locked.

## Setup

1. Work on a dedicated branch and start from a clean tree.
2. Read this file, the project-local `README.md`, `benchmarks/autoresearch.benchmark.json`, and the selected Blueprint. Inspect project-local assets, Processes, Worlds, Scenarios, and Objectives as needed; the project does not depend on engine-global documentation or content.
3. Run the unchanged candidate once to establish the baseline:

   ```bash
   bun run inm benchmark examples/ironworks --benchmark autoresearch
   ```

4. Create an untracked `results.tsv` with columns `commit`, `benchmark_score`, `status`, and `description`.

## Experiment loop

Repeat until interrupted:

1. Inspect the current Blueprint, the last benchmark output, capacity gaps, and semantic diff.
2. Form one industrial hypothesis: topology, machine count, recipe/mode, sorter tier/span, belt path, stacking, station fleet/policy, grid `powerAllocation`, Device `powerPriority`, power coverage/storage, or resilience.
3. Edit only `blueprints/autoresearch.blueprint.json`. Do not edit the baseline, benchmark, assets, Processes, Worlds, Scenarios, Objectives, engine, evaluator, or tests.
4. Commit the candidate edit so the experiment has a stable identity.
5. Run:

   ```bash
   bun run inm validate examples/ironworks --blueprint autoresearch
   bun run inm benchmark examples/ironworks --benchmark autoresearch
   ```

6. Read the grep-friendly `benchmark_score`, `score_delta`, and `verdict` lines. `KEEP` means the weighted score cleared the required improvement and no fixed case regressed beyond its gate. `DISCARD` and `UNCHANGED` do not advance the kept Blueprint.
7. Append the experiment to `results.tsv`. Keep the commit only for `KEEP`; otherwise restore the dedicated branch to the last kept commit.
8. Prefer a simpler Blueprint when scores are effectively equal. Review `patch_operations` and `semantic_changes`; do not trade a negligible score gain for gratuitous topology.

The loop is deliberately file-native. The Coding Agent owns the experiment idea and Blueprint edit; INM owns parsing, industrial invariants, fixed-case simulation, scoring, and the keep/discard evidence.

For a minimal power-control exercise, use `benchmarks/power-priority.benchmark.json`. Its candidate starts identical to the stopped baseline. Edit only `blueprints/power-priority-candidate.blueprint.json`; protecting `z-critical-assembler` and both `z-critical-link-*` sorter Devices demonstrates that priorities cover the complete physical line, not just the recipe machine.

For a DSP-style shared-grid exercise, use `benchmarks/power-satisfaction.benchmark.json`. Edit only `blueprints/power-satisfaction-candidate.blueprint.json`; it begins underpowered in `proportional` mode, so adding connected generation improves the satisfaction and speed of the assembler and both explicit sorter stages together.
