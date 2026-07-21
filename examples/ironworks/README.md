# Ironworks

Ironworks is INM's executable reference factory, self-contained project template, asset-package example, and research benchmark. Every resource lives under `assets/resources/<id>/`; every device lives under `assets/devices/<id>/` with an editable, statically checked `runtime.ts` black-box program. `assets/runtime-api.ts` keeps that type contract inside the project.

When `inm project create` reuses Ironworks, it copies this complete project tree. The resulting project owns its assets outright; it never reads or shares this example's asset files.

The baseline chain is intentionally under-provisioned:

```text
finite iron veins → mining-machine → smelter → interstellar logistics → assembler → material-sink
finite coal seam  → mining-machine → local belt → thermal generator → regional power grid
```

Each planet has its own self-contained coal-to-power loop. A startup coal unit boots the grid, after which the powered miner replenishes the thermal generator through an explicitly routed local belt. Coal's resource asset declares 70 MJ per unit, so a 1 kW generator contributes to its regional grid for exactly 70 seconds per burn. The iron miner can feed two smelters while its bound deposits last, but the blueprint starts with one. The built-in heuristic detects that bottleneck, finds collision-free transport paths, and adds a parallel smelter plus routed input/output branches; shared belt cells share real bandwidth. If it needs new local power capacity it chooses the project-local renewable wind turbine rather than inventing an unfueled thermal plant. The local catalog includes basic and higher-tier belt/sorter assets, so a measured saturated connection can be upgraded without importing shared content. It also includes a powered Splitter Device with round-robin, port-priority, merge-priority, and Resource-filter policies.

```bash
bun run inm validate examples/ironworks
bun run inm simulate examples/ironworks --seed 42
bun run inm test examples/ironworks
bun run inm research examples/ironworks --iterations 3 --seed 42
bun run inm studio examples/ironworks
```

The checked-in `runs/` directory contains a full demonstration history with a baseline, a KEEP improvement, and REVERT candidates. The canonical `blueprints/main.blueprint.json` remains deliberately suboptimal so a fresh research run can reproduce the improvement.
