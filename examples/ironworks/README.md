# Ironworks

Ironworks is INM's executable reference factory and research benchmark.

The baseline chain is intentionally under-provisioned:

```text
ore-source → smelter → assembler → material-sink
```

The source can feed two smelters, but the blueprint starts with one. The built-in heuristic detects that bottleneck and adds a parallel smelter plus mirrored input/output connections.

```bash
bun run inm validate examples/ironworks
bun run inm simulate examples/ironworks --seed 42
bun run inm test examples/ironworks
bun run inm research examples/ironworks --iterations 3 --seed 42
bun run inm studio examples/ironworks
```

The checked-in `runs/` directory contains a full demonstration history with a baseline, a KEEP improvement, and REVERT candidates. The canonical `blueprints/main.blueprint.json` remains deliberately suboptimal so a fresh research run can reproduce the improvement.
