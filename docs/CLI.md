# `inm` CLI

Run locally with `bun run inm`, or link `packages/inm-cli/src/bin.ts` as `inm`.

## Commands

### `inm init <dir> [--force] [--json]`

Creates a complete offline project containing materials, devices, recipes, a deliberately suboptimal blueprint, scenarios, objective, and fixture.

### `inm validate <project-dir>`

Runs schema validation, reference resolution, geometry/rotation checks, port validation, transport resolution, and compilation. `--json` returns structured errors with exact paths and codes.

### `inm inspect <project-dir>`

Prints project topology, catalogs, behavior counts, selected benchmark, content hashes, and completed runs.

### `inm simulate <project-dir>`

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

### `inm test <project-dir>`

Runs every `tests/*.fixture.json`, including a duplicate run determinism check. Metric assertions support `min`, `max`, and `equals`; event assertions support presence/absence.

### `inm runs <project-dir>`

Lists only completed immutable runs. Partial or interrupted directories without a completed manifest are ignored.

### `inm research <project-dir>`

```bash
inm research examples/ironworks --iterations 5 --seed 42
```

Each iteration proposes a restricted JSON Patch, compiles and simulates a candidate, compares its score, and writes a `KEEP` or `REVERT` artifact. A KEEP atomically updates the selected blueprint with a revision hash.

Use an external model or agent without binding INM to a provider:

```bash
inm research examples/ironworks \
  --iterations 5 \
  --agent-command 'my-agent --format inm-proposal'
```

The command receives `ResearchInput` JSON on stdin and must print:

```json
{
  "hypothesis": "Add a second smelter",
  "expectedEffect": "Reduce smelting saturation",
  "patch": [{ "op": "add", "path": "/devices/-", "value": {} }]
}
```

### `inm studio <project-dir> [--port N] [--no-open]`

Launches the local read-only 3D runtime debugger. Studio can switch run artifacts, replay semantic events, scrub time, change speed, inspect status and metrics, and refresh when project files change. It cannot create, move, rotate, connect, or delete blueprint entities.

## Selection and output

`validate`, `inspect`, `simulate`, and `research` accept `--blueprint`, `--scenario`, and `--objective`. Headless commands use exit code `0` for success, `1` for validation/runtime/test failure, and `2` for invalid CLI usage. Use `--json` for AI and shell automation.
