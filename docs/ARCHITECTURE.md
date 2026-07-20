# INM architecture

## Design principles

> A factory is a folder.

> A material is something that flows.

> A device is something that occupies space and transforms, stores, produces, consumes, transports, or otherwise affects materials.

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

## Compile pipeline

Raw blueprints never execute directly:

```text
JSON
→ strict Zod schema
→ catalog reference resolution
→ rotation and footprint normalization
→ bounds and overlap validation
→ recipe compatibility validation
→ port direction/kind validation
→ transport resolution and integer travel time
→ canonical CompiledFactoryProject
```

The compiler rejects unknown materials, device assets, recipes, device instances and ports; duplicate identifiers; unsupported recipes; invalid rotations; out-of-bounds or overlapping footprints; non-transport edge assets; and input/output direction errors.

The chosen transport representation is a logical edge that references a transport Device asset. Material, Device, and Recipe remain the only domain concepts needed: transport is still a Device behavior, not a third asset class.

## Runtime and determinism

Time is integer milliseconds. Production rates are integer counts per integer duration. The simulator uses a binary heap ordered by:

```text
tick → priority → insertion sequence
```

It does not depend on wall-clock time, frame rate, `Math.random()`, object insertion accidents, browser state, or Three.js. `SeededRandom` provides the deterministic randomness seam for stochastic scenario extensions. Explicit failures are scheduled events.

All runtime writes pass through `mutateFactoryState()`. Sources, processors, transports, sinks, storage, failure handling, and power allocation do not own independent mutable stores.

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

Materials, Device assets, Recipes, Scenarios, Objectives, bounds, simulator code, evaluator code, and score definition cannot be patched. A proposal is applied to a copy, schema-validated, compiled, simulated, and evaluated before the score comparison.

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

`FactorySceneModel` contains plain serializable data only—no Three.js objects, React elements, cameras, materials, or geometry. Event replay projects Device status and material transit independently of rendering.

Studio maps `blueprint.x → world.x`, `blueprint.y → world.z`, and visual height to `world.y`. Two-dimensional footprints remain the only collision and layout truth. The UI can select baseline, KEEP, and REVERT runs, play/pause/reset, scrub time, change speed, inspect semantic events, and highlight bottlenecks. It never writes a blueprint.

The local server bundles the UI into `.inm/cache`, reads project/run files directly, and refreshes after source changes. It requires neither a database nor a cloud service.
