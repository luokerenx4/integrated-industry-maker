# INM architecture

## Design principles

> INM is pre-alpha. Domain correctness wins over backward compatibility.

> When a model changes, migrate the current examples and tests, delete the superseded format and implementation, and do not add compatibility loaders, aliases, deprecation periods, or automatic migrations unless the project explicitly leaves pre-alpha.

> A factory is a folder.

> An engine workspace contains many factories, but owns no factory assets.

> Every project is fully self-contained. Reuse across projects is explicit copying, never shared lookup, inheritance, or cross-project references.

> A Resource is a packaged, self-described kind of flow.

> A Device is a packaged black box with geometry, buffers, ports, visuals, and an editable TypeScript program.

> A Process is project-local industrial source code: explicit inputs, outputs, category, and base cycle time.

> Resource and Device are the two asset classes. Every asset owns a directory.

> A blueprint is a two-dimensional arrangement and connection graph of devices.

> Assets define the laws of the world. Blueprints define the factory program.

> Scenarios are tests. Objectives are benchmarks. The simulator is the runtime.

> Events are the debugging protocol. The 3D Studio is a read-only visual debugger.

> AI improves the factory by editing blueprint files, not by manipulating the 3D scene.

> The Research Agent is an automated factory programmer.

## Package boundaries

The first product keeps only three packages:

- `@inm/core` owns schemas, loading, compilation, runtime state, deterministic simulation, evaluation, run artifacts, research, and renderer-independent scene projection.
- `@inm/cli` is the sole human and agent-facing command surface: `inm`.
- `@inm/studio` serves a local, read-only React Three Fiber replay UI.

These are concrete boundaries rather than a collection of placeholder packages. A future solver, distributed runner, or device library can split out only when it has an independent lifecycle.

## Workspace boundary

`inm-workspace.json` stores only the projects directory and selected default project. Project discovery scans one directory level, rejects symlink entries, and requires each project manifest id to match its directory. Runtime commands resolve exactly one project before loading any factory data.

All asset paths are then resolved and confined beneath that selected project root. Studio also qualifies file requests with the project id. No loader walks upward into the workspace, falls back to another project, or consults a shared catalog. Creating a project copies the complete starter tree, including its local TypeScript runtime contract, so later edits and content hashes cannot leak between projects.

## Compile pipeline

Raw blueprints never execute directly:

```text
JSON
→ strict Zod schema
→ asset-package file resolution and content hashing
→ Process catalog resolution and content hashing
→ TypeScript DeviceProgram injection
→ catalog reference resolution
→ rotation and footprint normalization
→ bounds and overlap validation
→ Process category, speed, port, buffer, resource-contract, and device-config validation
→ transport-program resolution and integer travel time
→ canonical CompiledFactoryProject
```

The compiler rejects mismatched asset-directory identifiers; missing indexed files; unknown resources, device assets, device instances, buffers, and ports; duplicate identifiers; invalid asset-owned configuration; invalid rotations; out-of-bounds or overlapping footprints; non-transport connection assets; incompatible resource contracts; and input/output direction errors.

The chosen transport representation is a logical edge that references a transport-capable Device asset. The transport asset's `planTransport()` hook computes connection capacity and duration. Transport remains a Device capability rather than becoming a third asset class.

## Asset and program boundary

Every Resource or Device is a directory package rooted at `assets/resources/<id>` or `assets/devices/<id>`. `asset.json` is the self-description index; presentation lives in `visual.json`; Device execution lives in `runtime.ts`. All indexed paths are relative and confined to the package. Catalog hashes cover the complete directory, including scripts, textures, and models.

The old `behavior.kind` execution switch does not exist. Processes are not shared assets or an engine-global Recipe database: each project owns `processes/*.process.json`, and their hashes participate in run identity. A Device may declare supported Process categories, an exact rational speed multiplier, input/output buffer bindings, semantic capabilities, and any number of named buffers and ports. Its `DeviceProgram` owns the final local throughput decision and returns one of four declarative decisions:

```text
start    consume N resource streams now, produce M streams after a duration
consume  remove delivered resources from local buffers
wait     expose input/output/idle wait state
none     take no local action
```

The injection interface is uniform even though each device's implementation and configuration are private. For a Process-bound Device, the compiler injects a resolved, buffer-bound Process plan into the frozen local context. Programs see that plan and local buffers, not mutable factory state. The host validates actions and remains the only authority allowed to write buffers, schedule events, allocate power, or update metrics. Transport-capable programs additionally implement `planTransport()`.

`inm analyze` compiles nominal cycles/min, material production/consumption balance, boundary supply/demand, and connection rate limits without running the event simulator. This analysis is also included in every Research Agent input, giving an optimizer explicit industrial semantics rather than requiring it to reverse-engineer Device scripts.

Device programs are trusted local project code, not a security sandbox. They must be synchronous and deterministic; clocks, network access, ambient process state, and unseeded randomness are outside the runtime contract.

## Runtime and determinism

Time is integer milliseconds. Production rates are integer counts per integer duration. The simulator uses a binary heap ordered by:

```text
tick → priority → insertion sequence
```

The engine does not depend on wall-clock time, frame rate, `Math.random()`, object insertion accidents, browser state, or Three.js. Asset programs share this determinism requirement. `SeededRandom` provides the deterministic randomness seam for stochastic scenario extensions. Explicit failures are scheduled events.

All runtime writes pass through `mutateFactoryState()`. Buffers are addressed by `(device, buffer, resource)`; jobs carry their declared outputs until completion; transports carry source and destination buffer identities. Device scripts and simulator subsystems do not own independent mutable stores.

Each result is keyed by engine version, all catalog and input hashes, seed, duration, and event limit. `resultHash` covers the run key, ordered event stream, final state, and metrics.

## Evaluation

Evaluation exposes quantities, throughput, completed orders, on-time delivery, energy, build cost, occupied area, per-machine utilization, idle/waiting/blocked time, average WIP, transport congestion, bottleneck, infeasibility, score breakdown, and final score.

Hard constraints produce a visible infeasibility reason and penalty. Soft weights remain explicit in the objective file and their individual contributions are written to `metrics.json`; the final score is never a black box.

## Research boundary

Research proposals use RFC 6902-style `add`, `remove`, and `replace` operations. Permission validation accepts only paths rooted at:

```text
/devices
/connections
/policies
```

Resource assets, Device assets and their scripts, Scenarios, Objectives, bounds, simulator code, evaluator code, and score definition cannot be patched. A proposal is applied to a copy, schema-validated, compiled, simulated, and evaluated before the score comparison.

The built-in deterministic heuristic duplicates a highly utilized processor, finds a non-overlapping position, and mirrors its incoming/outgoing topology. `ExternalCommandResearchAgent` accepts vendor-neutral JSON over stdin, and `ProviderResearchAgent` supplies an optional LLM provider seam.

## Run reliability

Every completed run is immutable and contains:

```text
manifest.json
hypothesis.md       # research runs
patch.json          # research runs
blueprint.json
metrics.json
final-state.json
events.ndjson
report.md
```

Files are written to a temporary file, flushed, and atomically renamed. `manifest.json` is written last, so discovery ignores interrupted partial directories. `.inm/cache` is derived and disposable. Blueprint revision hashes protect research writes from silent identity loss.

## Scene projection and Studio

`FactorySceneModel` contains plain serializable data only—no Three.js objects, React elements, cameras, renderer materials, or geometry. Event replay projects Device status and resource transit independently of rendering.

Studio maps `blueprint.x → world.x`, `blueprint.y → world.z`, and visual height to `world.y`. Two-dimensional footprints remain the only collision and layout truth. The root UI first presents the engine's projects; opening one establishes `/<project-id>` as the browser route and sole project context. The runtime page can select baseline, KEEP, and REVERT runs, open the project's Device/Resource asset browser, play/pause/reset, scrub time, change speed, inspect semantic events, and highlight bottlenecks. It never writes a blueprint.

The local server bundles the UI into `.inm/cache`, reads project/run files directly, and refreshes after source changes. Project index, runtime data, and asset files use `/api/projects/<project-id>/...`; every asset URL is project-qualified and root-confined. It requires neither a database nor a cloud service.
