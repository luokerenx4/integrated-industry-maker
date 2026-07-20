# Integrated Industry Maker

**INM** is an AI-native industrial production designer, deterministic simulator, and automated blueprint optimizer.

It represents a production cell as a folder of inspectable JSON files. The same two-dimensional blueprint can be validated, compiled, simulated, benchmarked, modified with restricted JSON Patch experiments, and replayed in a read-only 3D debugger.

> A factory is a folder. Blueprints are programs. Scenarios are tests. Objectives are benchmarks.

## See the closed loop

Requires [Bun](https://bun.sh/).

```bash
bun install

# Validate and simulate the deliberately suboptimal Ironworks baseline
bun run inm validate examples/ironworks
bun run inm simulate examples/ironworks --scenario baseline --seed 42

# Let the deterministic research agent improve the blueprint
bun run inm research examples/ironworks --iterations 3 --seed 42

# Replay baseline, KEEP, and REVERT experiments in 3D
bun run inm studio examples/ironworks
```

The bundled experiment demonstrates the complete loop:

```text
000 baseline            score 71.069
001 parallel smelter    score 135.923  KEEP
002 output buffer       score 130.340  REVERT
003 third smelter       score 134.294  REVERT
```

The heuristic identifies the saturated smelter, proposes an RFC 6902 patch that adds a parallel device and connections, validates and compiles the candidate, re-runs the exact benchmark, then keeps only the improvement.

## CLI

```text
inm init <dir>
inm validate <project-dir>
inm inspect <project-dir>
inm simulate <project-dir> [--blueprint ID] [--scenario ID] [--objective ID] [--seed N]
inm test <project-dir>
inm runs <project-dir>
inm research <project-dir> [--iterations N] [--agent-command COMMAND]
inm studio <project-dir>
```

Every headless command supports explicit exit codes; inspection, validation, simulation, tests, runs, and research support `--json` where machine-readable output matters. See [CLI reference](docs/CLI.md).

## Project model

An INM project contains only source files and immutable experiment artifacts:

```text
my-factory/
  inm.json
  materials/*.json
  devices/*.json
  recipes/*.json
  blueprints/*.blueprint.json
  scenarios/*.scenario.json
  objectives/*.objective.json
  tests/*.fixture.json
  runs/<immutable-run>/
  .inm/cache/               # disposable
```

- A **material** is something that flows.
- A **device** occupies space and produces, transforms, stores, consumes, transports, or affects materials.
- A **recipe** is a reusable conversion law, not a spatial asset.
- A **blueprint** is a two-dimensional device arrangement and connection graph.
- A **scenario** fixes initial state, failures, duration, and test conditions.
- An **objective** defines hard constraints and a transparent weighted score.

See [project format](docs/PROJECT_FORMAT.md) and the complete [Ironworks example](examples/ironworks).

## Architecture

```text
Project files
  → strict schema validation
  → reference, geometry, port, and transport compilation
  → canonical factory project + content hashes
  → deterministic discrete-event simulation
  → semantic event stream + final state
  → metrics, bottleneck, and score breakdown
  → restricted JSON Patch proposal
  → KEEP / REVERT immutable experiment
  → read-only 3D replay
```

The simulator is independent of React and Three.js. Runtime state has one reducer-owned mutation path. Events are the shared debugging protocol for CLI output, fixtures, evaluation, research diagnosis, and 3D replay. Visual metadata is optional and cannot affect simulation.

Read [architecture](docs/ARCHITECTURE.md) for determinism, reliability, research permissions, and package boundaries.

## Development

```bash
bun run typecheck
bun test
```

The suite covers deterministic replay, seeded randomness, geometry and reference failures, incompatible ports, missing materials/devices/recipes, unsupported recipes, power shortage, blocking, transport latency, device failure/recovery, visual independence, research permissions, KEEP/REVERT, immutable run replay, project initialization, and renderer-independent scene projection.
