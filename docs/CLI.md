# `inm` CLI

Run locally with `bun run inm`, or link `packages/inm-cli/src/bin.ts` as `inm`.

## Machine contract

Use `inm help --json` to discover every public command, argument/default, effect, output section, and exit code. Use `inm schema --json` to list authored project artifact kinds and `inm schema <kind> --json` to emit their current strict JSON Schema Draft 7 projection.

Every successful `--json` command writes exactly one versioned envelope to stdout with `command`, resolved `context`, `data`, `diagnostics`, `artifacts`, and exact-argv `nextActions`. Every failed `--json` command writes no stdout and one versioned error envelope to stderr with a stable code, structured issues, retryability, and any relevant current hashes. Dense commands return the `summary` section by default; request one advertised section with `--section NAME --json`, or the complete result with `--section all --json`.

The full contract and section semantics are defined in [[docs/design/agent-cli-contract]].

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

Runs schema validation, immutable world and finite resource-node resolution, extractor binding/range checks, production-mode/resource/physical-port/shared-buffer/job-capacity checks, setup-group/changeover/initial-equipment-state checks, inspection/rework/disposition and fixed quality-excursion checks, per-region geometry/rotation checks, independent instance port-filter validation, exact connection Resource-allowlist checks, explicit sorter Device ownership/stage/position/rotation/range checks, explicit cardinal transport-path and shared-cell resolution, local/inter-zone station topology and carrier compatibility checks, regional power-grid compilation, and project compilation. `--json` returns structured errors with exact paths and codes.

### `inm inspect <project-or-workspace-dir> [--project ID]`

Builds the shared [[docs/design/operator-workbench]] snapshot for the effective World, Blueprint, Scenario, and Objective. Human output is a compact orientation view: exact input hashes, normalized delivery contracts, separate capacity/flow/evidence/review status, the one shared next action, topology/catalog/evidence counts, prioritized diagnostics, and available/conditional operations with their effects. `--json` defaults to a bounded orientation summary. Sections expose `next-action`, `diagnostics`, `catalog`, `runs`, `experiments`, `candidates`, and `operations`; `--section next-action --json` and the envelope's sole `nextActions` item are the exact Core action, while `--section all --json` returns the complete V2 `ProjectWorkbenchSnapshot`. Inspection is read-only and an invalid explicit selection never falls back to a project default.

`validate`, `analyze`, `plan`, `simulate`, `benchmark`, and `candidate` invoke the named Core [[docs/design/operation-workbench]] operations. Their JSON envelope keeps the requested summary/detail section in `data.result` and places shared operation metadata in `data.operation`: effect, duration, exact context/hashes, diagnostics, artifacts, actual write set, and recommended verification. Dense operation data is not duplicated merely to expose metadata.

### `inm analyze <project-or-workspace-dir> [--project ID]`

Compiles Device Process/mode jobs and exact Resource-to-port bindings, reusable tooling, full-job facility-utility demands and spatial provider coverage, setup groups and changeover envelopes, selected inspection coverage/rework capability, required input treatment levels, configured treatment Device/agent rates, effective physical-port contracts, backing-buffer contracts and recipe partitions, compatible alternatives, the globally balanced target graph, extraction/deposit lifetime, renewable/fuel generation, accumulator envelopes, material/fuel balance, local and station logistics limits, each connection's authored Resource allowlist, dispatch policy/coverage, per-stage distance/duration/capacity, endpoint power assignment, and regional grid headroom without running a simulation. Storage remains separate from generation because it moves finite energy across time. Sequence-dependent effective capacity, facility contention, and realized yield remain simulation-owned. Diagnostics warn when a fixed Scenario defect is not detected by any selected inspection. Diagnostics retain exact industrial entities and `--json` is designed for optimization agents.

### `inm plan <project-or-workspace-dir> [--project ID]`

Treats the Objective's primary target and every delivery contract as an industrial specification. The planner solves the complete product portfolio and all configured Process/mode jobs as one material-balance system, crediting fixed coproduct ratios once and minimizing finite raw demand before installed continuous machine capacity. It reports every contract target, the selected mode mix and required jobs/min, configured versus required machine counts, treatment item/agent rates and Device gaps, and a qualification-aware toolset allocation that prevents several operations from each claiming the same physical work center's full clock. Raw Process/auxiliary and generator-fuel demand is compared with extraction plus Scenario-scheduled tracked-lot and purchased-material supply; the full-horizon balance also includes finite reserves. The plan continues through every input/output connection envelope, shared station carrier counts, rated regional generation headroom, and Scenario-integrated generated/demanded/unserved/curtailed energy plus storage capacity/rates. A rated-ready but temporally deficient grid is a power gap. The explicit gap list is deterministic JSON input for research agents as well as a human CLI review surface. Setup, maintenance, failures, utility/tooling contention, release blocking, and queue policy remain simulation-owned.

```bash
inm plan examples/ironworks --json
```

### `inm compare <project-or-workspace-dir> --from-blueprint ID --to-blueprint ID [--project ID] [--seed N]`

Compares two named Blueprint files as one controlled experiment. Both files are compiled against the same selected Resource, Process, and Device catalogs, World, Scenario, Objective, and deterministic seed; the command rejects a changed benchmark input instead of blending it into the Blueprint result.

Human output groups stable-id changes by Device, local connection, logistics network, factory policy, and Blueprint metadata. It also prints an exact replayable RFC 6902 file patch, both capacity-plan states, and objective score, throughput, attainment, lot cycle/service, good/first-pass yield, quality escapes, rework, changeover/setup work, consumed/stored/unserved/curtailed energy, unpowered time, cost, area, and congestion deltas. `--json` returns the complete controlled-evaluation contract.

```bash
inm compare examples/ironworks \
  --from-blueprint synthesized \
  --to-blueprint scaled-factory \
  --world scaled \
  --scenario cold-start \
  --objective scaled-production \
  --seed 42
```

The command is strictly read-only: it never edits a Blueprint and never creates or reuses a run artifact. Use `inm simulate` to persist a chosen candidate. The two Blueprints must both execute successfully under the selected Scenario; a failure names the side that could not be evaluated. The detailed invariant is in [[docs/design/blueprint-comparison]].

### `inm benchmark <project-or-workspace-dir> [--project ID] [--benchmark ID] [--lock] [--json]`

Evaluates one editable candidate Blueprint against an immutable baseline over a weighted suite of fixed industrial cases. Each case declares its World, Scenario, Objective, deterministic seed, duration, and weight. The aggregate candidate score is the weighted mean of ordinary Objective scores; acceptance can additionally forbid per-case regression and require every candidate capacity plan to be READY.

```bash
inm benchmark examples/ironworks --benchmark autoresearch
```

Human output contains each case weight, baseline/candidate score, quality/lot/setup telemetry, and capacity state followed by stable `baseline_score`, `benchmark_score`, `score_delta`, `worst_case_baseline_score`, `worst_case_benchmark_score`, `minimum_case_score_delta`, `patch_operations`, `semantic_changes`, and `verdict` lines suitable for a Coding Agent loop. `--json` returns the exact patch, semantic changes, every case result, aggregate and worst-case scores, the minimum individual-case delta, and every gate reason. Normal evaluation is read-only and writes no run artifact. A valid `DISCARD` or `UNCHANGED` experiment still exits successfully so an Agent can record it; invalid files, lock drift, or failed simulation return a non-zero error.

`--lock` is the only mutating mode. It compiles every baseline case and records the benchmark contract hash plus engine, catalog, World, baseline Blueprint, Scenario, and Objective hashes. It must be invoked deliberately after reviewing a harness change. Evaluation refuses an unlocked benchmark or any fixed-input drift; candidate Blueprint content is never part of the lock. See [[docs/design/coding-agent-optimization]].

### `inm candidate <project-or-workspace-dir> [--project ID] --candidate ID [--apply] [--json]`

Loads `candidates/<id>.candidate.json`, verifies its pinned candidate-Blueprint hash, applies its restricted RFC 6902 patch in memory, and evaluates the proposed Blueprint through the proposal's locked Benchmark. Review is the default and creates or reuses one immutable `candidate-reviews/<candidate>/<proposal-hash>.review.json` evidence artifact; it never writes the Blueprint.

```bash
inm candidate examples/memory-fab --candidate stable-furnace-sleep --json
```

The JSON result includes the proposal and its canonical hash, current and proposed Blueprint hashes, exact patch, semantic changes, fixed-case metrics, gates, verdict, review artifact, and actual write set. `--apply` is an explicit write operation: Core requires the recorded `reviewed-keep` decision, repeats evaluation, verifies the same proposal/base/proposed hashes, atomically replaces only the Benchmark candidate Blueprint, and checks the written file against the reviewed proposed hash. The resulting decision is `verified`; a subsequent unrelated Blueprint edit makes it `stale`. `DISCARD`, `UNCHANGED`, missing-review, stale, changed, invalid, or cross-Benchmark proposals are never written. See [[docs/design/experiment-workbench]].

### `inm synthesize <project-or-workspace-dir> [--project ID] [--output ID]`

Creates a new complete blueprint from the selected Objective rather than editing the input blueprint. The deterministic synthesizer considers every compatible project-local Process and Device, solves a globally raw-efficient continuous process mix (including alternatives, coproducts, and recycle loops), then expands it across `(Resource, region)` balances. Regional raw variables are capped by the selected Scenario's finite reserve lifetime; inter-region variables are costed by world-coordinate distance. The final Process and boundary consumer are anchored to the Objective's required `targetRegion` while upstream Processes may move, so the solver explicitly chooses which intermediate crosses each local boundary. It then sizes machine and extractor counts, binds multi-input/multi-output recipes and finite deposits, inserts direct rate-matched flows or arbitrary-size merge/split junction trees and cross-region station fleets, and propagates required items/min across every local edge. Generated home fleets are sized against complete outbound-plus-return cycles, and minimum station batches prevent underfilled carriers from consuming that capacity. Every generated local edge receives its planned Resource as an exact one-item allowlist, while both the factory and generated station networks select shortage-first dispatch. For each connection it evaluates all compatible project-local loader/line/unloader combinations and every supported endpoint-span pair through their TypeScript `planTransport()` hooks and Resource stack limits, selecting the lowest weighted-cost span, route, and pipeline that meets the flow. After belt routing, every powered Device and loader/unloader endpoint becomes a spatial power target. The synthesizer builds coverage, integrates the selected Scenario curve against constant design load, enumerates project-local generator/storage counts, selects the lowest-build-cost empty-cold-start bundle with zero unserved energy, and places it as one connected regional component. It then compiles the result, runs the target-rate capacity plan, and performs a cold-start simulation before atomically writing `blueprints/<output>.blueprint.json`. Existing files are never overwritten.

```bash
inm synthesize examples/ironworks \
  --blueprint blank \
  --scenario cold-start \
  --output synthesized
```

Human output includes the optimized cycles/min, every selected cross-region Resource flow, each local connection's required/capacity items/min, cargo stack, selected logistics tiers and endpoint spans, and each region's capacity-versus-coverage distributor count. Rates above the best project-local single-lane capacity are realized as multiple processor/extractor/consumer ports, explicit junction branches, local belt lanes, and—when needed—parallel station pairs; the command never reports one over-capacity connection as successful. Use `--json` to receive the same industrial plan. The verification run intentionally clears initial buffers, initial storage energy, and failures tied to the input Blueprint; later commands can select any compatible Scenario.

### `inm simulate <project-or-workspace-dir> [--project ID]`

Runs the deterministic discrete-event simulator and writes or reuses an immutable run artifact. The manifest records the exact Blueprint, World, Scenario, Objective and Route-catalog identity, so Studio and replay tools can distinguish candidate runs from baseline runs without guessing from content. Human-readable output begins with every delivery contract's demand, delivered and valued quantity, above-demand output, demand attainment, and net value, then includes tracked-lot completion/on-time service, Route transitions/re-entry, per-step mean/maximum/window Q-time and violations, mean/p95 cycle time, queue/process/transport time and tardiness; good and first-pass yield, inspection/rework/scrap/escape outcomes; nominal/actual/lost lot-derived output from terminating processes such as wafer Probe; equipment changeover count/current groups/setup work; treated quantities by `Resource@level`; physical belt utilization; transport energy; storage; per-grid power; and measured connection flows. JSON metrics retain the complete delivery portfolio, every lot/Route/quality-flow/lot-output aggregate, setup and treatment ledgers, full power/storage ledgers, per-Device status time, and capacity-normalized sorter utilization. Active production/changeover/extraction/treatment/inspection/rework jobs pause at a power boundary; equipment failure cancels a changeover without consuming queued WIP, while explicit loader/unloader work freezes its exact remaining time across a sorter failure.

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

Each iteration proposes a restricted JSON Patch over blueprint devices, local connections, station networks, or policies; compiles and simulates a candidate; compares its score; and writes a `KEEP` or `REVERT` artifact. A KEEP atomically updates the selected blueprint with a revision hash. Built-in strategies consume the target-rate capacity plan, material/local-logistics/station/power diagnostics, measured per-connection flow, and measured power time envelopes. A missing Process Device is therefore tied to a concrete required machine count, a line near capacity can trigger a project-local transport-tier upgrade, a total-energy shortage can add profiled project-local generators, and a temporally deficient grid with sufficient energy can receive an accumulator bundle sized by bounded re-simulation. Contended multi-route networks can independently cycle their fleet policy without changing unrelated local dispatch. The plan is recomputed after every KEEP, so a recipe edit changes all downstream requirements before the next proposal. Every later iteration also receives earlier strategy keys, hypotheses, decisions, and score deltas so it can avoid repeating a reverted experiment.

When `--blueprint ID` is supplied, KEEP writes that exact candidate file; the project default is never used as an implicit write target.

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

Launches the local Studio workbench. `/` is a project launcher; choosing a project navigates to the task-oriented `/<project-id>` Overview, where selection/hashes, Objective/contracts, readiness, prioritized diagnostics, recent immutable evidence, proposals, and available operations appear before spatial debugging. There is no project switcher inside the workbench—return to the launcher to open another self-contained project.

Stable project-qualified routes cover Overview, Factory, Runs, Experiments, Catalog, and Analysis. Catalog/Analysis are route-backed dialogs, and selected catalog assets, diagnostics, Factory devices, Factory connections, Benchmarks, and Candidates remain addressable across reload, history, and copied links.

The read-only Catalog is modeled after an editor asset browser. It separates Device and Resource packages from Process and Product Route definitions, supports category-scoped text filtering, and exposes geometry, production ports, buffers, modes, runtime, transformations, inspection/rework disposition, transport limits, generation/storage/distribution envelopes, content hashes, and instance counts. Every request is project-qualified and root-confined.

Analysis recompiles the selected run Blueprint and presents target-rate gaps, configured Resource-to-port jobs, effective port and backing-buffer contracts, recipe material partitions, searchable material/logistics/station diagnostics, generator/fuel envelopes, rated generation/load/headroom, accumulator capacity/rates, and selected-run stored energy per grid. Diagnostics on the Overview deep-link to their most specific asset, Device, connection, or focused Analysis evidence.

Factory contains the 3D view and immutable replay timeline. It renders the same event-backed industrial state without making the canvas necessary for project orientation or operation discovery.

Clicking a Device opens a scoped inspector for runtime status, recipe/mode batches, physical port contracts, buffer contracts/quotas, extraction/generation/storage plan, power-grid membership, diagnostics, and connected links. Clicking a belt cell opens its physical connection inspector. Selection and Studio remain read-only.

Studio can replay semantic events, scrub time, change speed, inspect status and metrics, and refresh when project files change. It cannot create, move, rotate, connect, or delete blueprint entities.

## Selection and output

Every runtime command accepts either a direct project directory or a workspace directory. A workspace uses its default project unless `--project ID` is passed; `--project` is rejected for an already-direct project path. `validate`, `inspect`, `analyze`, `plan`, `synthesize`, `simulate`, and `research` accept `--world`, `--blueprint`, `--scenario`, and `--objective`. `compare` accepts the same benchmark selectors but replaces `--blueprint` with required `--from-blueprint` and `--to-blueprint` ids. Headless commands use exit code `0` for success, `1` for validation/runtime/test failure, and `2` for invalid CLI usage. Use `--json` for AI and shell automation, and consult `inm help --json` rather than hard-coding section names or defaults.
