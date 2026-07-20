# Integrated Industry Maker

**INM** is an AI-native industrial production designer, deterministic simulator, and automated blueprint optimizer.

It represents a production cell as a folder of inspectable asset packages, declarative industrial processes, JSON blueprints, and device-local TypeScript programs. The same two-dimensional blueprint can be validated, statically balanced across materials, logistics, and isolated power grids, compiled, simulated, benchmarked, modified with restricted JSON Patch experiments, and replayed in a read-only 3D debugger.

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
000 baseline            score 65.918
001 parallel smelter    score 135.838  KEEP
002 third smelter       score 134.154  REVERT
003 parallel assembler  score 133.980  REVERT
```

The heuristic reads the static iron-plate deficit, proposes an RFC 6902 patch that adds a nearby parallel smelter and connections, validates and compiles the candidate, re-runs the exact benchmark, then keeps only the improvement. Later iterations receive prior KEEP/REVERT outcomes and switch targets instead of replaying the same failed experiment.

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
  blueprints/*.blueprint.json
  scenarios/*.scenario.json
  objectives/*.objective.json
  tests/*.fixture.json
  runs/<immutable-run>/
  .inm/cache/               # disposable
```

There is deliberately no shared-asset lookup or inheritance layer. To reuse an asset, copy its directory into another project; from that point onward the two copies have independent contents and hashes.

- A **resource asset** is a self-described kind of flow with units, transport properties, and presentation files.
- A **device asset** owns geometry, multiple named buffers and ports, presentation files, and a private TypeScript throughput program.
- Device scripts are black boxes to the factory: they inspect only their frozen local context and return host-validated actions.
- A **process** declares a visible material transformation, category, and base cycle time; a blueprint binds it to a compatible Device.
- A **blueprint** is a two-dimensional device arrangement and connection graph.
- A **scenario** fixes initial state, failures, duration, and test conditions.
- An **objective** defines hard constraints and a transparent weighted score.

See [project format](docs/PROJECT_FORMAT.md) and the complete [Ironworks example](examples/ironworks).

## Architecture

```text
Project files
  → strict schema validation
  → process/resource/device compatibility and nominal-rate analysis
  → reference, geometry, port, staged-logistics, and power-grid compilation
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

The suite covers isolated multi-project workspaces, asset package loading and hashing, TypeScript runtime contracts, multi-input/multi-output scripts, deterministic replay, geometry and reference failures, port/buffer contracts, power shortage, blocking, transport latency, device failure/recovery, visual independence, research permissions, KEEP/REVERT, immutable run replay, and renderer-independent scene projection.
