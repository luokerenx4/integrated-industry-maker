# Ironworks

Ironworks is INM's executable reference factory, self-contained project template, asset-package example, and research benchmark. Every resource lives under `assets/resources/<id>/`; every device lives under `assets/devices/<id>/` with an editable, statically checked `runtime.ts` black-box program. `assets/runtime-api.ts` keeps that type contract inside the project.

When `inm project create` reuses Ironworks, it copies this complete project tree. The resulting project owns its assets outright; it never reads or shares this example's asset files.

The baseline chain is intentionally under-provisioned:

```text
finite iron veins → mining-machine → smelter → interstellar logistics → assembler → material-sink
```

The miner can feed two smelters while its bound deposits last, but the blueprint starts with one. The built-in heuristic detects that bottleneck and adds a parallel smelter plus mirrored input/output connections without changing the world or its resource inventory.

```bash
bun run inm validate examples/ironworks
bun run inm simulate examples/ironworks --seed 42
bun run inm test examples/ironworks
bun run inm research examples/ironworks --iterations 3 --seed 42
bun run inm studio examples/ironworks
```

The checked-in `runs/` directory contains a full demonstration history with a baseline, a KEEP improvement, and REVERT candidates. The canonical `blueprints/main.blueprint.json` remains deliberately suboptimal so a fresh research run can reproduce the improvement.
