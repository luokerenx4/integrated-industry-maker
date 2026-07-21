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

Runs schema validation, immutable world and finite resource-node resolution, extractor binding/range checks, production-mode/resource/buffer/job-capacity checks, per-region geometry/rotation checks, port validation, explicit cardinal transport-path and shared-cell resolution, planetary/interstellar station topology and carrier compatibility checks, regional power-grid compilation, and project compilation. `--json` returns structured errors with exact paths and codes.

### `inm inspect <project-or-workspace-dir> [--project ID]`

Prints the selected world, finite deposits, project topology, region kinds/world coordinates/bounds, asset catalogs, capability counts, selected benchmark, content hashes, and completed runs.

### `inm analyze <project-or-workspace-dir> [--project ID]`

Compiles selected Device Process/mode jobs and their Resource-to-buffer bindings, effective batch quantities, duration and active power, every Device instance's final buffer capacity, accepted Resource contract, and optional per-Resource quota, every compatible Process/mode alternative, a globally balanced per-target production graph and raw-material bill, extractor rates, finite deposit inventory and estimated depletion, Process-bound job rates, renewable and fuel generation rates, per-resource nominal production/consumption balance including mode auxiliary inputs and fuel demand, boundary demand, local connection cargo-stack/item throughput/path/shared-cell limits, spatial loader/unloader power assignment, region-to-region station routes with source/destination slot capacities, supply reserve, demand target, demand/supply priority, effective throughput and estimated carrier load, and region-qualified power-grid headroom without running a simulation. The production graph can include coproduct credit and cyclic recycle recipes. Diagnostics expose deposits that are unmined or expected to deplete during the scenario, material deficits, unconsumed surplus, insufficient input/output logistics, unmatched station supply/demand, undersized shared fleets, unfed fuel generators, disconnected Devices or transport endpoints, and undersupplied grids. `--json` is designed to be consumed directly by optimization agents.

### `inm plan <project-or-workspace-dir> [--project ID]`

Treats the Objective's required target rate as an industrial specification. The planner solves all configured Process/mode jobs as one material-balance system, minimizing finite raw demand before installed continuous machine capacity. It reports the selected mode mix and required jobs/min, configured versus required machine counts, raw Process/auxiliary and generator-fuel demand, extractor capacity, finite-reserve lifetime over the Scenario, every input/output connection envelope, shared station carrier counts, and mode-aware regional generation headroom. Its explicit gap list is deterministic JSON input for research agents as well as a human CLI review surface.

```bash
inm plan examples/ironworks --json
```

### `inm synthesize <project-or-workspace-dir> [--project ID] [--output ID]`

Creates a new complete blueprint from the selected Objective rather than editing the input blueprint. The deterministic synthesizer considers every compatible project-local Process and Device, solves a globally raw-efficient continuous process mix (including alternatives, coproducts, and recycle loops), then expands it across `(Resource, region)` balances. Regional raw variables are capped by the selected Scenario's finite reserve lifetime; inter-region variables are costed by world-coordinate distance. The final Process and boundary consumer are anchored to the Objective's required `targetRegion` while upstream Processes may move, so the solver explicitly chooses which intermediate crosses each planetary boundary. It then sizes machine and extractor counts, binds multi-input/multi-output recipes and finite deposits, inserts direct rate-matched flows or arbitrary-size merge/split junction trees and cross-region station fleets, and propagates required items/min across every local edge. For each connection it evaluates all compatible project-local loader/line/unloader combinations through their TypeScript `planTransport()` hooks and Resource stack limits, selecting the lowest weighted-cost pipeline that meets the flow. After belt routing, every powered Device and loader/unloader endpoint becomes a spatial power target. The synthesizer inserts connected renewable distributor chains until all targets are covered, then adds connected generation capacity until rated regional demand is met. It compiles the result, runs the target-rate capacity plan, and performs a cold-start simulation before atomically writing `blueprints/<output>.blueprint.json`. Existing files are never overwritten.

```bash
inm synthesize examples/ironworks \
  --blueprint blank \
  --scenario cold-start \
  --output synthesized
```

Human output includes the optimized cycles/min, every selected cross-region Resource flow, each local connection's required/capacity items/min, cargo stack and selected logistics tiers, and each region's capacity-versus-coverage distributor count. Rates above the best project-local single-lane capacity are realized as multiple processor/extractor/consumer ports, explicit junction branches, local belt lanes, and—when needed—parallel station pairs; the command never reports one over-capacity connection as successful. Use `--json` to receive the same `localLogistics` plan plus selected recipes and regions, spatial raw/process/logistics costs, extraction bindings, planned transports, realized station networks, spatial power network, plan gaps, and measured throughput/area/cost. The verification run intentionally clears scenario buffers and failures tied to the input blueprint; subsequent `validate`, `plan`, `simulate`, and `test` commands can select any scenario compatible with the generated Device ids.

### `inm simulate <project-or-workspace-dir> [--project ID]`

Runs the deterministic discrete-event simulator and writes or reuses an immutable run artifact. Human-readable output includes physical belt utilization, average blocked belt items, peak belt occupancy, transport-endpoint energy, and a measured row for every connection showing delivered/capacity items per minute, utilization, blocked item-ticks, and delivered Resource mix. JSON metrics retain per-cell transport measurements plus per-connection departure/delivery counts by Resource, actual rate, capacity, utilization, average in-flight items, blockage, and loader/unloader utilization.

```bash
inm simulate examples/ironworks \
  --world main \
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

Each iteration proposes a restricted JSON Patch over blueprint devices, local connections, station networks, or policies; compiles and simulates a candidate; compares its score; and writes a `KEEP` or `REVERT` artifact. A KEEP atomically updates the selected blueprint with a revision hash. Built-in strategies consume the target-rate capacity plan, material/local-logistics/station/power diagnostics, and measured per-connection flow. A missing Process Device is therefore tied to a concrete required machine count, while a line operating near its compiled capacity can trigger a project-local sorter/belt tier upgrade even when nominal static analysis alone did not diagnose it. The plan is recomputed after every KEEP, so a recipe edit changes all downstream requirements before the next proposal. Every later iteration also receives earlier strategy keys, hypotheses, decisions, and score deltas so it can avoid repeating a reverted experiment.

Use an external model or agent without binding INM to a provider:

```bash
inm research examples/ironworks \
  --iterations 5 \
  --agent-command 'my-agent --format inm-proposal'
```

The command receives `ResearchInput` JSON on stdin—including the target-rate capacity plan, static production analysis, measured metrics, and current-invocation experiment history—and must print:

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

The adjacent Analysis view recompiles the currently selected run blueprint against the project world and leads with its target-rate plan: required/configured Process/mode Devices, raw extraction and reserve lifetime, regional power, and actionable gaps. It also presents configured jobs with selected mode, effective batches, duration, power and Resource-to-buffer mappings, every instance's compiled buffer filters, the selected production dependency graph, automatically bindable Process/mode alternatives, finite deposits/depletion, nominal material balance, warning diagnostics, loader/line/unloader pipelines and directed belt cells, measured delivery/capacity utilization and Resource mix for each selected-run connection, spatial endpoint power assignment, region-qualified station supply/demand routes and shared-fleet load, plus generator kind, fuel rate, rated generation, rated demand, Device/transport membership, and headroom for each regional power grid. The asset browser lists every Device mode and its auxiliary inputs. The 3D view renders every region as a separate labeled factory floor, labels machines with their recipe and accepted materials, draws powered endpoint arms, places local cargo on its event-reported belt cell, highlights blocked or unpowered transport, shrinks deposits as extraction events replay, and bridges worlds with interstellar routes. Studio is read-only with respect to run history: opening a project never writes a baseline artifact; `inm simulate` or `inm research` must create runs explicitly.

Studio can replay semantic events, scrub time, change speed, inspect status and metrics, and refresh when project files change. It cannot create, move, rotate, connect, or delete blueprint entities.

## Selection and output

Every runtime command accepts either a direct project directory or a workspace directory. A workspace uses its default project unless `--project ID` is passed; `--project` is rejected for an already-direct project path. `validate`, `inspect`, `analyze`, `plan`, `synthesize`, `simulate`, and `research` accept `--world`, `--blueprint`, `--scenario`, and `--objective`. Headless commands use exit code `0` for success, `1` for validation/runtime/test failure, and `2` for invalid CLI usage. Use `--json` for AI and shell automation.
