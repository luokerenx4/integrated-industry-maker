# Integrated Industry Maker

**INM** is an AI-native industrial production designer, deterministic simulator, and automated blueprint optimizer.

It represents a production system as a folder of immutable world definitions, finite resource deposits, inspectable asset packages, declarative industrial processes, JSON blueprints, and device-local TypeScript programs. A world can span multiple sites, planets, or orbital regions, each with its own two-dimensional factory floor, deposits, explicitly routed transport cells, and power topology. The complete system can be validated, statically balanced across extraction, materials, shared-capacity belt paths, junction policies, shared-fleet station networks, and regional power grids, compiled, simulated, benchmarked, modified with restricted JSON Patch experiments, and replayed in a read-only 3D debugger.

> A factory is a folder. Blueprints are programs. Scenarios are tests. Objectives are benchmarks.

INM is currently pre-alpha. File formats and APIs intentionally make clean breaking changes while the domain model is being established; obsolete formats are removed rather than carried through compatibility layers.

## See the closed loop

Requires [Bun](https://bun.sh/).

```bash
bun install

# Validate and simulate the deliberately suboptimal Ironworks baseline
bun run inm validate examples/ironworks
bun run inm analyze examples/ironworks
bun run inm simulate examples/ironworks --scenario baseline --seed 42

# Let the deterministic research agent improve the blueprint
bun run inm research examples/ironworks --iterations 3 --seed 42

# Choose a project, inspect its local assets, and replay experiments in 3D
bun run inm studio examples/ironworks
```

The bundled experiment demonstrates the complete loop:

```text
000 dual-input recipe baseline    score 27.991
001 smelter + routed branches     score 70.331  KEEP
002 switch arbitration to FIFO    score 70.331  REVERT
003 add station carrier           score 69.663  REVERT
```

The default world and blueprint form an executable two-planet example. A TypeScript-driven mining machine on Forge World binds three finite iron veins, reserves and extracts their inventory, then feeds smelting and an interstellar station; a reusable logistics vessel carries batched iron plate across world coordinates. On Assembly World, a recipe-configured assembler consumes iron plate and coal through two independently bound input buffers. A placed splitter sends locally mined coal toward both generation and the secondary recipe input, while a renewable generator supports the expanded line. Physical links, powered loader/unloader endpoints, and power grids are region-local, while an interstellar station network must cross regions. The heuristic can edit blueprint recipes, machinery, and logistics but cannot manufacture deposits or alter world geometry. Every candidate is validated against the same world, compiled, simulated, benchmarked, and kept only when it improves the objective.

## CLI

```text
inm workspace init <workspace-dir>
inm project create <workspace-dir> <project-id>
inm project list <workspace-dir>
inm project default <workspace-dir> <project-id>
inm validate|inspect|simulate|test|runs|research <project-or-workspace-dir> [--project ID]
inm analyze <project-or-workspace-dir> [--project ID]
inm studio <project-or-workspace-dir> [--project ID]
```

Every headless command supports explicit exit codes; inspection, validation, simulation, tests, runs, and research support `--json` where machine-readable output matters. See [CLI reference](docs/CLI.md).

## Workspace and project model

One engine workspace discovers and selects any number of projects:

```text
my-engine/
  inm-workspace.json
  projects/
    ironworks/
    refinery/
```

The workspace has no asset catalog. Each project is a fully self-contained factory with its own asset packages, runtime API, blueprints, scenarios, objectives, tests, runs, and cache:

```text
my-factory/
  inm.json
  assets/
    runtime-api.ts
    resources/<id>/
      asset.json
      visual.json
    devices/<id>/
      asset.json
      visual.json
      runtime.ts
  processes/*.process.json
  worlds/*.world.json
  blueprints/*.blueprint.json
  scenarios/*.scenario.json
  objectives/*.objective.json
  tests/*.fixture.json
  runs/<immutable-run>/
  .inm/cache/               # disposable
```

There is deliberately no shared-asset lookup or inheritance layer. To reuse an asset, copy its directory into another project; from that point onward the two copies have independent contents and hashes.

- A **resource asset** is a self-described kind of flow with units, transport properties, optional fuel energy, and presentation files.
- A **device asset** owns geometry, multiple named buffers and ports, presentation files, and a private TypeScript throughput program.
- Device scripts are black boxes to the factory: they inspect only their frozen local context and return host-validated actions.
- A **process** declares a visible material transformation, category, and base cycle time; a blueprint binds it to a compatible Device.
- A **world** declares regions, world coordinates, build bounds, and finite resource nodes; optimization cannot edit it.
- A **blueprint** places Devices into world regions, binds extractors to reachable resource nodes, routes local connections through explicit grid cells, and declares planetary or interstellar station networks with finite carrier fleets.
- A **scenario** fixes initial state, failures, duration, and test conditions.
- An **objective** defines hard constraints and a transparent weighted score.

See [project format](docs/PROJECT_FORMAT.md) and the complete [Ironworks example](examples/ironworks).

## Architecture

```text
Project files
  → strict schema validation
  → process/resource/device compatibility and nominal-rate analysis
  → world resource-node, region, geometry, extraction, port, staged-logistics, station-network, and regional power-grid compilation
  → canonical factory project + content hashes
  → deterministic discrete-event simulation
  → semantic event stream + final state
  → metrics, bottleneck, and score breakdown
  → restricted JSON Patch proposal
  → KEEP / REVERT immutable experiment
  → read-only 3D replay
```

The simulator is independent of React and Three.js. Runtime state has one reducer-owned mutation path; asset scripts cannot mutate it directly. Events are the shared debugging protocol for CLI output, fixtures, evaluation, research diagnosis, and 3D replay. Studio opens on a project launcher, gives every project a stable `/<project-id>` URL, and exposes that project's self-contained Device, Resource, and Process catalog plus compiled material, logistics, power, and diagnostic analysis. Visual files cannot affect simulation.

Read [architecture](docs/ARCHITECTURE.md) for determinism, reliability, research permissions, and package boundaries.

## Development

```bash
bun run typecheck
bun test
```

The suite covers isolated multi-project workspaces, immutable world hashing, finite resource conservation and depletion, extractor range/region contracts, fuel energy and time-bounded generation, asset package loading and hashing, TypeScript runtime contracts, exact recipe-to-buffer bindings, multi-input/multi-output scripts, deterministic replay, multi-region geometry and optimizer path isolation, region-local physical links and power grids, powered transport endpoint shortage/recovery and energy, planetary/interstellar routing invariants, batched station routing, finite shared fleets, fleet optimization, spatial power shortage, blocking, device failure/recovery, visual independence, research permissions, KEEP/REVERT, immutable run replay, and renderer-independent scene projection.
