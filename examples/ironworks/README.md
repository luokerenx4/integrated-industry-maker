# Ironworks

Ironworks is INM's executable reference factory, self-contained project template, asset-package example, and research benchmark. Every resource lives under `assets/resources/<id>/`; every device lives under `assets/devices/<id>/` with an editable, statically checked `runtime.ts` black-box program. `assets/runtime-api.ts` keeps that type contract inside the project.

When `inm project create` reuses Ironworks, it copies this complete project tree. The resulting project owns its assets outright; it never reads or shares this example's asset files.

The baseline chain is intentionally under-provisioned:

```text
finite iron veins → mining-machine → smelter → interstellar logistics → assembler → material-sink
finite coal seam  → mining-machine → local belt → thermal generator → regional power grid ↔ accumulator
```

Each planet has its own self-contained coal-to-power loop. A startup coal unit boots the grid, after which the powered miner replenishes the thermal generator through an explicitly routed local belt. Coal's resource asset declares 70 MJ per unit, so a 1 kW generator contributes to its regional grid for exactly 70 seconds per burn. Forge World places an initially empty project-local accumulator with a 3.6 MJ envelope; measured surplus charges it and later deficits can consume that stored energy. The local catalog also contains renewable generation, multiple belt/sorter tiers, and a powered Splitter Device without importing shared content.

```bash
bun run inm validate examples/ironworks
bun run inm plan examples/ironworks
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output my-factory
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --world scaled --objective scaled-production --output scaled-factory
bun run inm synthesize examples/ironworks --blueprint blank --scenario chemical-cold-start --world chemical --objective plastic-production --output chemical-factory
bun run inm synthesize examples/ironworks --blueprint blank --scenario chemical-cold-start --world chemical --objective hydrogen-production --output xray-cracking-factory
bun run inm simulate examples/ironworks --blueprint stacked-cargo --scenario stacked-cargo --objective stacked-cargo
bun run inm simulate examples/ironworks --seed 42
bun run inm test examples/ironworks
bun run inm research examples/ironworks --iterations 3 --seed 42
bun run inm studio examples/ironworks
```

The checked-in `runs/` directory contains a full demonstration history with a baseline, a KEEP improvement, and REVERT candidates. The canonical `blueprints/main.blueprint.json` remains deliberately suboptimal so a fresh research run can reproduce the improvement. `blueprints/blank.blueprint.json` and the neutral `cold-start` Scenario exercise factory synthesis; the checked-in `synthesized` blueprint is the deterministic result and has its own throughput/area/cost fixture. Its spatial solve keeps gear assembly at `assembly-world`, moves smelting beside the iron deposits on `forge-world`, and ships 18 iron plate/min rather than bulk ore. `scaled-factory` makes the same choice at 36 iron plate/min for its 24 gear/min target, fans two miners into three smelters through a junction tree, merges every plate output, and uses explicit level-1 crossings selected by the global router. `chemical-factory` pumps crude oil into a recipe-configured refinery with independent refined-oil and hydrogen outputs, then routes both coproducts into independently bound chemical-plant inputs. `xray-cracking-factory` goes further: its globally solved mix runs refining and X-ray cracking at 3.333 cycles/min each, feeds 3.333 hydrogen/min back into the cracker, exports 10 hydrogen/min, and drains graphite while using only 6.667 crude oil/min. `stacked-cargo` sends eight iron ore as two four-item cargo stacks through one-cell-wide belts, proving that the project-local Stack Sorter changes real runtime throughput rather than acting as catalog decoration.
