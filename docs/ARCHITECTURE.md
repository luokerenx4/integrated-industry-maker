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
→ exact connection Resource allowlist, explicit sorter Device ownership/geometry, and cardinal transport-path validation; shared-cell graph compilation; loader/line/unloader throughput; and integer travel time
→ planetary/interstellar topology, supply/demand matching, carrier compatibility, world-distance route time, and finite fleet compilation
→ canonical CompiledFactoryProject
→ Objective target-rate expansion and capacity-gap plan
```

The compiler rejects mismatched asset-directory identifiers; missing indexed files; unknown regions, resource nodes, resources, device assets, device instances, buffers, and ports; duplicate identifiers; invalid asset-owned configuration; invalid rotations; out-of-bounds deposits or devices; extractor nodes of mixed type, wrong region, unsupported resource, excessive range, or excluded instance filter; same-region overlapping footprints; cross-region physical links; cross-region planetary logistics; single-region interstellar logistics; logistics assets used in unsupported stages; empty, duplicate, unknown, or endpoint-incompatible connection Resource allowlists; incompatible instance buffer filters and resource contracts; and input/output direction errors.

World and blueprint are intentionally separate compilation inputs. A World owns geography and finite deposits and receives an independent `worldHash`; a blueprint owns only machinery, bindings, connections, station fleets, and dispatch policies. Research patches can rewrite the latter but cannot create ore, enlarge a planet, move a vein, or otherwise mutate benchmark input.

Each resource connection is a compiled logistics pipeline with a required exact Resource allowlist, three explicit stages—loader, line, and unloader—and an ordered list of occupied region cells. The compiler validates each authored Resource against both effective endpoint buffers and never expands the list from wildcard compatibility. Endpoint assets declare an allowed physical grid range; the Blueprint selects a required loader and unloader distance, and the first/last belt cells must lie exactly that far outward from their ports. Every line step is cardinal and may ramp by at most one transport level. Device footprints, deposits, bounds, and same-level self-intersections are compile-time obstacles. Cells at the same `(x, y)` on different levels remain independent physical capacity. Each stage references a transport-capable Device asset whose declared roles determine where it may be used. Its `planTransport()` receives the actual endpoint span or line length and computes concurrent cargo capacity, duration, and maximum cargo-stack depth. The compiler sums nominal latency, derives independent loader/line/unloader clocks, intersects every stage's stack limit with each listed Resource's `transport.stackSize`, and assigns one travel clock plus one downstream direction to every physical belt cell.

Local cargo is not represented by an end-to-end delay. Each cargo stack is a stateful entity in `loading`, `belt`, or `unloading`; while on a belt the whole stack owns exactly one concrete cell and carries an integer Resource item count. Movement frees its old cell and claims the next one atomically. An occupied cell or busy unloader holds the stack in place, and item-weighted pressure propagates upstream through the occupied line. Connections can request a smaller `stackSize`, but cannot exceed any stage or Resource contract. Connections can merge by sharing a same-direction suffix, with deterministic round-robin arbitration at contested cells. They cannot diverge from a shared cell without an explicit junction. Build cost and area count every physical cell once. Semantic position, stack count, blocked/unblocked, unload-start, and arrival events expose the same state to replay and Studio. Local dispatch may be FIFO, round-robin, or shortage-first. The latter ranks eligible cargo by destination resident-plus-inbound inventory divided by its exact Process batch, fuel/Objective unit, or buffer capacity, then by compiled Objective dependency depth. Explicit input/output port priorities remain authoritative overrides.

A placed `transport-junction` Device provides explicit merge/split semantics. It draws persistent regional power, exposes real input/output ports around one internal buffer, and can declare input/output priorities plus a Resource filter. The simulator applies those policies while dispatching physical connections; an unpowered junction stops both incoming and outgoing movement.

Longer-range logistics is declarative. A station-capable Device exposes a project-local internal backing buffer, supported network kinds, a fixed number of Resource slots, and a carrier-energy buffer/maximum charging envelope. Each station instance explicitly configures its grid charging request. A blueprint groups station instances into `planetary` or `interstellar` networks, assigns a finite fleet of compatible carrier Devices, and marks each station/Resource slot as `supply`, `demand`, or `storage` with an independent capacity. Slot contracts are combined per station across networks, narrow the compiled buffer, and must fit both the asset slot count and backing-buffer total capacity. Inventory policy may retain a supply reserve for local use, cap remote replenishment at a demand target, and assign competing-route demand/supply priorities. The network then applies FIFO, round-robin, or shortage-first within equal explicit priorities. Shortage-first recursively traces a demand station's outgoing same-Resource, same-buffer pass-through graph to exact Process/fuel/Objective/terminal-buffer contracts, deduplicates converged leaves, sums their batch coverage, counts resident plus local and remote inbound cargo, and uses production critical depth before deterministic cursor ties. Planetary routes are restricted to one region; interstellar routes are restricted to different regions. Region coordinates plus device-local coordinates produce deterministic integer route distance, which is passed into the carrier's TypeScript `planTransport()` hook and carrier mission-energy formula. At runtime carriers are shared reusable capacity: a route spends its complete source-station mission energy, reserves one fleet member and destination Resource quota, removes only inventory above its supply reserve, emits departure/arrival events, occupies the carrier for its compiled travel time, and deposits into demand storage without exceeding its remote target or total/per-Resource capacity. Local belts reserve the same physical quotas but are not stopped by remote policy thresholds. Failures, regional power, and source energy gate new dispatches; already-departed cargo remains an explicit in-flight entity.

Power is spatial, dynamic, and region-local rather than factory-global. A power-capable Device may declare distributor connection and consumer coverage ranges plus renewable generation, fuel generation, or finite storage. Nearby distributors in the same region form deterministic connected components; distributors on different worlds never join even when their local coordinates overlap. Every covered Device is assigned to the nearest component in its own region, and each resulting grid owns rated generation/demand plus storage capacity and charge/discharge limits. Renewable output exists continuously while its Device is healthy. Fuel output exists only during a host-validated burn job. Healthy accumulators charge from interval surplus and discharge into interval deficits in stable Device-id order; full/depleted boundaries are scheduled events. Storage is excluded from steady-state rated generation because it shifts finite energy rather than creating it. A consuming Device outside all same-region coverage remains explicitly unpowered. See [[docs/design/power]].

## Asset and program boundary

Every Resource or Device is a directory package rooted at `assets/resources/<id>` or `assets/devices/<id>`. `asset.json` is the self-description index; presentation lives in `visual.json`; Device execution lives in `runtime.ts`. All indexed paths are relative and confined to the package. Catalog hashes cover the complete directory, including scripts, textures, and models.

The old `behavior.kind` execution switch does not exist. Processes are not shared assets or an engine-global Recipe database: each project owns `processes/*.process.json`, and their hashes participate in run identity. A Device may declare supported Process categories, an exact rational speed multiplier, explicit production or treatment modes, configurable buffer sets, semantic capabilities, and any number of named buffers and ports. Production modes may require a minimum material-treatment level; treatment Devices consume a physical agent and raise exact material lots without changing Resource identity. Asset buffer `accepts` lists are maximum capabilities. Each blueprint Device instance may first narrow them through `bufferFilters`; recipe bindings and extractor deposits narrow the effective contract further. Physical belts, station slots, fuel selection, initial inventory, runtime actions, CLI analysis, and Studio all consume that one compiled contract. Each production instance selects a Process and mode and maps every Process Resource to a permitted buffer. Its `DeviceProgram` owns the final local throughput decision and returns one of seven declarative decisions:

```text
start    consume N resource streams now, produce M streams after a duration
treat    consume one exact material-grade batch and agent, then emit a higher-grade lot
extract  reserve a bound finite resource node and emit its resource after a duration
generate consume one compiled fuel unit and provide rated grid output for its burn duration
consume  remove delivered resources from local buffers
wait     expose input/output/idle wait state
none     take no local action
```

The injection interface is uniform even though each device's implementation and configuration are private. For a Process-bound Device, the compiler injects a resolved, buffer-bound Process plan containing the selected mode, exact job duration, exact active power, and aggregated input/output batches. Programs see that plan and local buffers, not mutable factory state. A `start` decision must reproduce that plan exactly. The host validates actions and remains the only authority allowed to write buffers, schedule events, allocate power, or update metrics. Transport-capable programs additionally implement `planTransport()`. Its stage is one of `loader`, `line`, `unloader`, or `carrier`; carrier assets also declare whether they support planetary, interstellar, or both network kinds.

Treatment-aware jobs use the same host boundary. Programs see exact level batches and a compiled treatment plan; the host validates material identity, source/target levels, agent, duration, and power. Local belts and station cargo preserve that level, and shortage coverage counts only lots eligible for the downstream Process contract. See [[docs/design/material-treatment]].

`inm analyze` compiles selected recipes and Resource-to-physical-port bindings, treatment requirements and Device/agent rates, effective port contracts and backing-buffer partitions, compatible alternatives, a globally balanced production graph, extraction and finite-deposit lifetime, material/fuel balance, grade-aware local and station logistics envelopes, effective dispatch policies and coverage profiles, endpoint power, accumulator capacity/startup energy/charge/discharge limits, and per-grid steady-state headroom without running the event simulator. This analysis is also included in every Research Agent input, giving an optimizer explicit industrial semantics rather than requiring it to reverse-engineer Device scripts.

Device programs are trusted local project code, not a security sandbox. They must be synchronous and deterministic; clocks, network access, ambient process state, and unseeded randomness are outside the runtime contract.

## Runtime and determinism

Time is integer milliseconds. Production rates are integer counts per integer duration. The simulator uses a binary heap ordered by:

```text
tick → priority → insertion sequence
```

The engine does not depend on wall-clock time, frame rate, `Math.random()`, object insertion accidents, browser state, or Three.js. Asset programs share this determinism requirement. `SeededRandom` provides the deterministic randomness seam for stochastic scenario extensions. Explicit failures are scheduled events.

All runtime writes pass through `mutateFactoryState()`. Buffers are addressed by `(device, buffer, resource)`; resource nodes account separately for remaining, reservation, and extraction; jobs carry declared outputs plus worked/remaining powered time; transports retain physical state; storage Devices and grids retain initial/final/charged/discharged energy; stations retain initial/charged/spent/final carrier energy. A failed extraction job releases its reservation. A power-paused job retains its consumed inputs or reservation, invalidates its old completion event, and resumes exactly its remaining time when power returns. Device scripts and simulator subsystems do not own independent mutable stores. WIP, belt pressure, endpoint utilization/energy, storage energy, station carrier energy, unpowered time, and station congestion are measured from runtime state.

Each result is keyed by engine version, all catalog and input hashes, seed, duration, and event limit. `resultHash` covers the run key, ordered event stream, final state, and metrics.

## Evaluation

Evaluation exposes quantities, treated lots and agent consumption, throughput, completed orders, on-time delivery, consumed/fuel/stored/charged/discharged energy, build cost, occupied area, per-machine utilization, idle/waiting/blocked/unpowered time, WIP, belt occupancy/blocking, loader/unloader utilization, per-connection flow, transport-only energy, congestion, bottleneck, infeasibility, score breakdown, and final score.

Before simulation, `planProductionCapacity()` treats `Objective.targetRatePerMinute` as an executable industrial specification and `Objective.targetRegion` as its delivery boundary. Runtime throughput counts target-Resource consumption only in that region. A deterministic two-phase simplex solves all configured Process types as one non-negative material-balance system. Phase one minimizes weighted finite raw-resource extraction; phase two preserves that optimum while minimizing continuous installed Process capacity. This supports converging demand, alternative recipes, multiple outputs, direct and indirect recycle loops, and explicit surplus without pretending the graph is a tree. Blueprint synthesis adds a second formulation whose constraints are keyed by `(Resource, region)`: Process variables are region-qualified, raw-source variables have Scenario-derived reserve caps, and directed transport variables subtract from one regional balance and add to another with world-distance cost. Target-producing Processes are constrained to `targetRegion`, making upstream placement and intermediate shipment the optimized degrees of freedom. The resulting cycle rates size Process Devices and extractors, account for generator fuel, test finite reserves over Scenario time, check every Process input/output connection envelope, derive station fleet demand from route trip capacity, and build a regional power envelope. Every gap retains a stable kind, entity, and explanation. The plan is returned by `inm plan`, rendered in Studio, and injected into every research proposal; after a KEEP it is recomputed from the new compiled blueprint.

`synthesizeFactoryBlueprint()` starts from the same Objective but constructs a blueprint instead of auditing one. It jointly selects compatible project-local Process/Device pairs, regional raw sources, and inter-region Resource flows through the spatial material-balance solve described above. It keeps exact multi-Resource buffer bindings, sizes machine and extractor counts, and keeps the target Process at the delivery region while allowing upstream production to follow deposits. Machine count is constrained by both process cycles/min and the maximum project-local logistics capacity available to each physical recipe port. Objective consumers and inter-region station pairs scale by the same port limit. A flow above one lane's capacity therefore becomes multiple real Device endpoints and independently routed lanes; it never reuses a port or creates a fictional over-capacity trunk. Graph fan-in/fan-out becomes deterministic trees of explicit junction Devices scoped to one producer or consumer, and equal-rate lanes use a global minimum-distance endpoint pairing to avoid gratuitous crossings. Synthesized extractors, junctions, station buffers, and consumers receive exact per-Resource filters. Planned rates are conserved onto every tree edge. Optimized regional flows become finite-fleet station networks, and the capacity planner apportions a route pair's demand across its parallel networks. Each local edge enumerates compatible project-local loader/line/unloader assets and every supported endpoint-span pair, executes their immutable TypeScript transport planners at the actual endpoint and routed distances, applies the Resource stack limit, and chooses the lowest Objective-weighted build/energy cost combination that meets required items/min. Device placement and port assignment are deterministic and reserve port lead-ins. For each material-flow group the router generates alternate span-aware ground and raised paths, then selects a conflict-free set before later Devices occupy those corridors. Power synthesis then enumerates every consuming Device center and powered loader/unloader endpoint cell. It greedily places renewable distributors within coverage, inserts connection-range bridge Devices toward uncovered targets, and adds connected capacity Devices until the region's rated load is met. The compiler therefore receives one connected synthesized grid per active region rather than a non-spatial wattage allowance. The generated blueprint crosses the ordinary compiler, capacity planner, simulator, Objective constraints, and fixture system—there is no separate permissive execution path for generated factories.

When the spatial material solver selects a grade-requiring mode, synthesis also selects a project-local treatment mode, expands proportional agent demand into the material balance, places treatment Devices, writes exact material/agent filters, and routes treated output separately into the consuming Process. Capacity planning sizes this infrastructure and its power before reporting READY.

Hard constraints produce a visible infeasibility reason and penalty. Soft weights remain explicit in the objective file and their individual contributions are written to `metrics.json`; the final score is never a black box.

Blueprint comparison is a controlled evaluation boundary, not a second scoring path. `compareFactoryBlueprints()` requires equal Resource, Process, and Device catalog hashes plus equal World, Scenario, and Objective hashes, then plans and simulates both compiled Blueprints with the same seed. It emits an exact RFC 6902 transformation, stable-id semantic changes, capacity plans, metric snapshots/deltas, and a verdict based only on Objective score. The operation is pure with respect to project files and run history. This makes an edit explainable before it is persisted as an immutable run. See [[docs/design/blueprint-comparison]].

## Research boundary

Research proposals use RFC 6902-style `add`, `remove`, and `replace` operations. Permission validation accepts only paths rooted at:

```text
/devices
/connections
/logisticsNetworks
/policies
```

The built-in research agent turns target-rate gaps, static semantics, diagnostic codes, and measured runtime flow into bounded strategies: switch a Device to a higher-capacity compatible recipe with a complete generated binding object, add the next planned Process Device toward the required count, replace a bottleneck local-logistics stage when either its nominal contract is insufficient or its recorded connection flow is saturated, expand an undersized station fleet, extend or reinforce power for disconnected/deficit grids, insert storage for measured output blocking, or duplicate a measured high-utilization processor. Planned capacity strategy keys include the Process and configured-count transition, so multi-step expansion can continue without repeating an identical experiment. A logistics replacement selects only faster compatible project-local Device assets and reports the measured Resource mix that justified the edit. `ResearchInput.history` records strategy keys, KEEP/REVERT decisions, and score deltas from earlier iterations in the same invocation so a rejected experiment is not immediately repeated. External agents receive the same plan, diagnostics, metrics, and history contract.

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

`FactorySceneModel` contains plain serializable data only—no Three.js objects, React elements, cameras, renderer materials, or geometry. Event replay projects Device status plus local and station resource transit, including exact cargo treatment level, independently of rendering.

Studio lays world regions side-by-side for inspection, then maps each region's local `x → world.x`, local `y → world.z`, and visual height to `world.y`. Each region retains an independent floor, label, bounds, collision space, deposit inventory, and power topology; dashed station routes bridge region floors. Deposit geometry shrinks as `resource.extracted` events replay. The root UI first presents the engine's projects; opening one establishes `/<project-id>` as the browser route and sole project context. The runtime page can select baseline, KEEP, and REVERT runs, open the project's Device/Resource asset browser, play/pause/reset, scrub time, change speed, inspect semantic events, and highlight bottlenecks.

Scene selection addresses stable Device and connection ids, never renderer object identity. Device meshes and every compiled physical belt cell are pickable; selection resolves only against the current project scene and clears across project navigation. The scoped Device inspector joins recipe/mode batches, buffer contracts, extraction/generation/storage, power-grid membership, build/runtime metrics, and connected links. Power analysis and the Catalog expose accumulator capacity/rates and selected-run energy. The scoped connection inspector joins physical path clocks and stack contracts with replay-tick cargo, endpoint power, stage utilization, delivered material mix, and blockage. This is a read-only projection of compiler, analysis, and immutable run data.

The local server bundles the UI into `.inm/cache`, reads project/run files directly, and refreshes after source changes. Project index, runtime data, and asset files use `/api/projects/<project-id>/...`; every asset URL is project-qualified and root-confined. It requires neither a database nor a cloud service.
