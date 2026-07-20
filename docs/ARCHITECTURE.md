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
→ immutable World region, coordinate, and finite resource-node resolution
→ rotation and footprint normalization
→ region identity, world coordinates, per-region bounds, resource-node range, and overlap validation
→ Process category, speed, port, buffer, resource-contract, and device-config validation
→ region-local power-distributor topology, coverage, and isolated-grid compilation
→ loader/line/unloader logistics-stage resolution, throughput, and integer travel time
→ planetary/interstellar topology, supply/demand matching, carrier compatibility, world-distance route time, and finite fleet compilation
→ canonical CompiledFactoryProject
```

The compiler rejects mismatched asset-directory identifiers; missing indexed files; unknown regions, resource nodes, resources, device assets, device instances, buffers, and ports; duplicate identifiers; invalid asset-owned configuration; invalid rotations; out-of-bounds deposits or devices; extractor nodes of mixed type, wrong region, unsupported resource, or excessive range; same-region overlapping footprints; cross-region physical links; cross-region planetary logistics; single-region interstellar logistics; logistics assets used in unsupported stages; incompatible resource contracts; and input/output direction errors.

World and blueprint are intentionally separate compilation inputs. A World owns geography and finite deposits and receives an independent `worldHash`; a blueprint owns only machinery, bindings, connections, station fleets, and dispatch policies. Research patches can rewrite the latter but cannot create ore, enlarge a planet, move a vein, or otherwise mutate benchmark input.

Each resource connection is a compiled logistics pipeline with three explicit stages: loader, line, and unloader. Each stage references a transport-capable Device asset whose declared roles determine where it may be used. Its `planTransport()` hook computes stage capacity and duration. The compiler sums stage latency and derives a dispatch interval from the slowest stage, so a sorter can bottleneck a belt independently of line length. Logistics equipment remains a Device capability rather than becoming a shared asset class.

Longer-range logistics is declarative. A station-capable Device exposes a project-local internal buffer, supported network kinds, and a fixed number of resource slots. A blueprint groups station instances into `planetary` or `interstellar` networks, assigns a finite fleet of compatible carrier Devices, and marks each station/resource slot as `supply`, `demand`, or `storage`. Planetary routes are restricted to one region; interstellar routes are restricted to different regions. Region coordinates plus device-local coordinates produce deterministic integer route distance, which is passed into the carrier's TypeScript `planTransport()` hook. At runtime carriers are shared reusable capacity: a route reserves one fleet member, removes a bounded batch from the supply station, emits departure/arrival events, occupies the carrier for its compiled travel time, and deposits into demand storage without exceeding buffer capacity. Failures and regional power availability gate new dispatches; already-departed cargo remains an explicit in-flight entity.

Power is spatial, dynamic, and region-local rather than factory-global. A power-capable Device may declare distributor connection and consumer coverage ranges plus either renewable or fuel generation. Nearby distributors in the same region form deterministic connected components; distributors on different worlds never join even when their local coordinates overlap. Every covered Device is assigned to the nearest component in its own region, and each resulting grid owns rated generation, currently active generation, rated demand, active demand, and an energy ledger. Renewable output exists continuously while its Device is healthy. Fuel output exists only while the generator runs a host-validated burn job; a Resource's integer fuel energy divided by the generator's integer output determines the deterministic duration. Fuel loading/spending are semantic events and consumption is retained in metrics. A consuming Device outside all same-region coverage remains a valid blueprint entity but is explicitly unpowered at runtime and in static diagnostics.

## Asset and program boundary

Every Resource or Device is a directory package rooted at `assets/resources/<id>` or `assets/devices/<id>`. `asset.json` is the self-description index; presentation lives in `visual.json`; Device execution lives in `runtime.ts`. All indexed paths are relative and confined to the package. Catalog hashes cover the complete directory, including scripts, textures, and models.

The old `behavior.kind` execution switch does not exist. Processes are not shared assets or an engine-global Recipe database: each project owns `processes/*.process.json`, and their hashes participate in run identity. A Device may declare supported Process categories, an exact rational speed multiplier, input/output buffer bindings, semantic capabilities, and any number of named buffers and ports. Its `DeviceProgram` owns the final local throughput decision and returns one of five declarative decisions:

```text
start    consume N resource streams now, produce M streams after a duration
extract  reserve a bound finite resource node and emit its resource after a duration
generate consume one compiled fuel unit and provide rated grid output for its burn duration
consume  remove delivered resources from local buffers
wait     expose input/output/idle wait state
none     take no local action
```

The injection interface is uniform even though each device's implementation and configuration are private. For a Process-bound Device, the compiler injects a resolved, buffer-bound Process plan into the frozen local context. Programs see that plan and local buffers, not mutable factory state. The host validates actions and remains the only authority allowed to write buffers, schedule events, allocate power, or update metrics. Transport-capable programs additionally implement `planTransport()`. Its stage is one of `loader`, `line`, `unloader`, or `carrier`; carrier assets also declare whether they support planetary, interstellar, or both network kinds.

`inm analyze` compiles nominal extraction/cycles per minute, finite node inventory and estimated depletion, material production/consumption balance including fuel burn rates, boundary demand, connection rate limits, station routes, estimated shared-carrier load, unmatched station slots, unfed generators, disconnected consumers, and per-grid rated power headroom without running the event simulator. This analysis is also included in every Research Agent input, giving an optimizer explicit industrial semantics rather than requiring it to reverse-engineer Device scripts.

Device programs are trusted local project code, not a security sandbox. They must be synchronous and deterministic; clocks, network access, ambient process state, and unseeded randomness are outside the runtime contract.

## Runtime and determinism

Time is integer milliseconds. Production rates are integer counts per integer duration. The simulator uses a binary heap ordered by:

```text
tick → priority → insertion sequence
```

The engine does not depend on wall-clock time, frame rate, `Math.random()`, object insertion accidents, browser state, or Three.js. Asset programs share this determinism requirement. `SeededRandom` provides the deterministic randomness seam for stochastic scenario extensions. Explicit failures are scheduled events.

All runtime writes pass through `mutateFactoryState()`. Buffers are addressed by `(device, buffer, resource)`; resource nodes account separately for remaining, in-flight reservation, and completed extraction; jobs carry their declared outputs until completion; local transports and station-fleet transports carry source and destination buffer identities. A failed extraction job releases its reservation. Device scripts and simulator subsystems do not own independent mutable stores. WIP and congestion include both local links and station routes; station infrastructure power is charged continuously while available.

Each result is keyed by engine version, all catalog and input hashes, seed, duration, and event limit. `resultHash` covers the run key, ordered event stream, final state, and metrics.

## Evaluation

Evaluation exposes quantities, throughput, completed orders, on-time delivery, energy, build cost, occupied area, per-machine utilization, idle/waiting/blocked time, average WIP, transport congestion, bottleneck, infeasibility, score breakdown, and final score.

Hard constraints produce a visible infeasibility reason and penalty. Soft weights remain explicit in the objective file and their individual contributions are written to `metrics.json`; the final score is never a black box.

## Research boundary

Research proposals use RFC 6902-style `add`, `remove`, and `replace` operations. Permission validation accepts only paths rooted at:

```text
/devices
/connections
/logisticsNetworks
/policies
```

The built-in research agent turns static diagnostic codes into bounded strategies: add process capacity for material deficits, replace a bottleneck local-logistics stage when a faster project-local Device exists, expand an undersized station fleet, extend or reinforce power for disconnected/deficit grids, insert storage for measured output blocking, or duplicate a measured high-utilization processor. `ResearchInput.history` records strategy keys, KEEP/REVERT decisions, and score deltas from earlier iterations in the same invocation so a rejected experiment is not immediately repeated. External agents receive the same diagnostic and history contract.

Resource assets, Device assets and their scripts, Scenarios, Objectives, region definitions, simulator code, evaluator code, and score definition cannot be patched. A proposal is applied to a copy, schema-validated, compiled, simulated, and evaluated before the score comparison.

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

`FactorySceneModel` contains plain serializable data only—no Three.js objects, React elements, cameras, renderer materials, or geometry. Event replay projects Device status plus local and station resource transit independently of rendering.

Studio lays world regions side-by-side for inspection, then maps each region's local `x → world.x`, local `y → world.z`, and visual height to `world.y`. Each region retains an independent floor, label, bounds, collision space, deposit inventory, and power topology; dashed station routes bridge region floors. Deposit geometry shrinks as `resource.extracted` events replay. The root UI first presents the engine's projects; opening one establishes `/<project-id>` as the browser route and sole project context. The runtime page can select baseline, KEEP, and REVERT runs, open the project's Device/Resource asset browser, play/pause/reset, scrub time, change speed, inspect semantic events, and highlight bottlenecks. It never writes a blueprint or world.

The local server bundles the UI into `.inm/cache`, reads project/run files directly, and refreshes after source changes. Project index, runtime data, and asset files use `/api/projects/<project-id>/...`; every asset URL is project-qualified and root-confined. It requires neither a database nor a cloud service.
