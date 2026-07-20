# `inm` CLI

Run locally with `bun run inm`, or link `packages/inm-cli/src/bin.ts` as `inm`.

## Commands

### `inm workspace init <workspace-dir> [--name NAME] [--json]`

Creates an engine workspace with an `inm-workspace.json` manifest and empty `projects/` directory.

### `inm project create <workspace-dir> <project-id> [--name NAME] [--json]`

Creates a fully self-contained project from the starter factory. Every resource, device, runtime contract, blueprint, scenario, objective, and fixture is physically copied into the new project. The first project becomes the workspace default.

### `inm project list <workspace-dir> [--json]`

Lists immediate project directories and marks the default. A project directory id must match the required `id` in its `inm.json`.

### `inm project default <workspace-dir> <project-id> [--json]`

Changes the workspace default project. It does not move, merge, or share project contents.

### `inm validate <project-or-workspace-dir> [--project ID]`

Runs schema validation, reference resolution, geometry/rotation checks, port validation, logistics-stage resolution, power-grid compilation, and project compilation. `--json` returns structured errors with exact paths and codes.

### `inm inspect <project-or-workspace-dir> [--project ID]`

Prints project topology, asset catalogs, capability counts, selected benchmark, content hashes, and completed runs.

### `inm analyze <project-or-workspace-dir> [--project ID]`

Compiles Process-bound Device cycle rates, per-resource nominal production/consumption balance, boundary supply/demand, connection throughput limits, and isolated power-grid headroom without running a simulation. Diagnostics expose material deficits, unconsumed surplus, insufficient input/output logistics, disconnected consumers, and undersupplied grids. `--json` is designed to be consumed directly by optimization agents.

### `inm simulate <project-or-workspace-dir> [--project ID]`

Runs the deterministic discrete-event simulator and writes or reuses an immutable run artifact.

```bash
inm simulate examples/ironworks \
  --blueprint main \
  --scenario baseline \
  --objective default \
  --seed 42 \
  --until-tick 120000 \
  --max-events 1000000 \
  --json
```

The response includes artifact path, cache status, run key, result hash, every metric, score breakdown, and final score.

### `inm test <project-or-workspace-dir> [--project ID]`

Runs every `tests/*.fixture.json`, including a duplicate run determinism check. Metric assertions support `min`, `max`, and `equals`; event assertions support presence/absence.

### `inm runs <project-or-workspace-dir> [--project ID]`

Lists only completed immutable runs. Partial or interrupted directories without a completed manifest are ignored.

### `inm research <project-or-workspace-dir> [--project ID]`

```bash
inm research examples/ironworks --iterations 5 --seed 42
```

Each iteration proposes a restricted JSON Patch, compiles and simulates a candidate, compares its score, and writes a `KEEP` or `REVERT` artifact. A KEEP atomically updates the selected blueprint with a revision hash. Built-in strategies consume material, logistics, and power diagnostics; every later iteration also receives earlier strategy keys, hypotheses, decisions, and score deltas so it can avoid repeating a reverted experiment.

Use an external model or agent without binding INM to a provider:

```bash
inm research examples/ironworks \
  --iterations 5 \
  --agent-command 'my-agent --format inm-proposal'
```

The command receives `ResearchInput` JSON on stdin—including static production analysis and current-invocation experiment history—and must print:

```json
{
  "strategy": "capacity:smelter-1",
  "hypothesis": "Add a second smelter",
  "expectedEffect": "Reduce smelting saturation",
  "patch": [{ "op": "add", "path": "/devices/-", "value": {} }]
}
```

### `inm studio <project-or-workspace-dir> [--project ID] [--port N] [--no-open]`

Launches the local read-only 3D runtime debugger. `/` is a project launcher; choosing a project navigates to the stable `/<project-id>` route, so refresh, browser history, and copied links retain project identity. There is no project switcher inside the runtime sidebar—return to the launcher to open another project.

The project header opens a read-only project catalog modeled after an editor asset browser. It separates Device and Resource packages from the project's Process definitions, previews their visual identity, and exposes tags, capabilities, geometry, ports, buffers, runtime entry, units, transformations, cycle times, transport limits, content hashes, and current instance counts. Every data and file request is namespaced under `/api/projects/<project-id>/...` and confined to that project root.

The adjacent Analysis view recompiles the currently selected run blueprint and presents nominal material balance, warning diagnostics, loader/line/unloader pipelines, end-to-end throughput and latency, plus generation, rated demand, membership, and headroom for each isolated power grid.

Studio can replay semantic events, scrub time, change speed, inspect status and metrics, and refresh when project files change. It cannot create, move, rotate, connect, or delete blueprint entities.

## Selection and output

Every runtime command accepts either a direct project directory or a workspace directory. A workspace uses its default project unless `--project ID` is passed; `--project` is rejected for an already-direct project path. `validate`, `inspect`, `simulate`, and `research` accept `--blueprint`, `--scenario`, and `--objective`. Headless commands use exit code `0` for success, `1` for validation/runtime/test failure, and `2` for invalid CLI usage. Use `--json` for AI and shell automation.
