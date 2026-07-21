# Integrated Industry Maker

**INM** is an AI-native industrial production designer, deterministic simulator, and automated blueprint optimizer.

It represents a production system as a folder of immutable world definitions, finite resource deposits, inspectable asset packages, declarative industrial processes, JSON blueprints, and device-local TypeScript programs. A world can span multiple sites, planets, or orbital regions, each with its own factory floor, deposits, explicitly routed multi-level transport cells, and power topology. The complete system can be validated, statically balanced across extraction, materials, shared-capacity belt paths, junction policies, shared-fleet station networks, and regional power grids, compiled, simulated, benchmarked, modified with restricted JSON Patch experiments, and replayed in a read-only 3D debugger.

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

# Or synthesize a complete factory from a blank blueprint and the Objective
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output synthesized

# Choose a project, inspect its local assets, and replay experiments in 3D
bun run inm studio examples/ironworks
```

The bundled experiment demonstrates the complete loop:

```text
000 dual-input recipe baseline    score 22.991
001 efficient gear-pair recipe    score 44.558  KEEP
002 smelter + routed branches     score 104.981 KEEP
003 switch arbitration to FIFO    score 104.981 REVERT
```

The default world and blueprint form an executable two-planet example. A TypeScript-driven mining machine on Forge World binds three finite iron veins, reserves and extracts their inventory, then feeds smelting and an interstellar station; a reusable logistics vessel carries batched iron plate across world coordinates. On Assembly World, a recipe-configured assembler consumes iron plate and coal through two independently bound input buffers. A placed splitter sends locally mined coal toward both generation and the secondary recipe input, while a renewable generator supports the expanded line. The 12 gear/min Objective expands through the active recipes into an executable capacity plan. On the baseline it finds one missing smelter, six missing iron ore over the two-minute Scenario, and 122 W of planned Forge World power deficit. The research loop first selects the efficient gear-pair recipe, which removes the immutable reserve gap, then follows the recomputed plan by adding a routed smelter and local wind support; that second KEEP makes the target plan fully provisioned. Physical links, powered loader/unloader endpoints, and power grids are region-local, while an interstellar station network must cross regions. The heuristic can edit blueprint recipes, machinery, and logistics but cannot manufacture deposits or alter world geometry.

## CLI

```text
inm workspace init <workspace-dir>
inm project create <workspace-dir> <project-id>
inm project list <workspace-dir>
inm project default <workspace-dir> <project-id>
inm validate|inspect|analyze|plan|synthesize|simulate|test|runs|research <project-or-workspace-dir> [--project ID]
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
  worlds/*.world.json
  blueprints/*.blueprint.json
  scenarios/*.scenario.json
  objectives/*.objective.json
  tests/*.fixture.json
  runs/<immutable-run>/
  .inm/cache/               # disposable
```

There is deliberately no shared-asset lookup or inheritance layer. To reuse an asset, copy its directory into another project; from that point onward the two copies have independent contents and hashes.

- A **resource asset** is a self-described kind of flow with units, transport properties, optional fuel energy, and presentation files.
- A **device asset** owns geometry, multiple named buffers and ports, presentation files, and a private TypeScript throughput program.
- Device scripts are black boxes to the factory: they inspect only their frozen local context and return host-validated actions.
- A **process** declares a visible material transformation, category, and base cycle time; a blueprint binds it to a compatible Device.
- A **world** declares regions, world coordinates, build bounds, and finite resource nodes; optimization cannot edit it.
- A **blueprint** places Devices into world regions, narrows each instance's accepted Resources, binds configurable multi-input/multi-output recipes and extractors, routes local connections through explicit grid cells, and declares planetary or interstellar station networks with finite carrier fleets. `inm synthesize` can construct that complete graph from an empty blueprint, the Objective rate, and only the project's own assets.
- A **scenario** fixes initial state, failures, duration, and test conditions.
- An **objective** defines hard constraints and a transparent weighted score.

See [project format](docs/PROJECT_FORMAT.md) and the complete [Ironworks example](examples/ironworks).

## Architecture

```text
Project files
  → strict schema validation
  → process/resource/device compatibility and nominal-rate analysis
  → world resource-node, region, geometry, extraction, port, staged-logistics, station-network, and regional power-grid compilation
  → canonical factory project + content hashes
  → objective target-rate capacity plan
  → deterministic discrete-event simulation
  → semantic event stream + final state
  → metrics, bottleneck, and score breakdown
  → restricted JSON Patch proposal
  → KEEP / REVERT immutable experiment
  → read-only 3D replay
```

The simulator is independent of React and Three.js. Runtime state has one reducer-owned mutation path; asset scripts cannot mutate it directly. The Objective's required items/min and explicit `targetRegion` delivery boundary are first compiled into a machine, raw-material, transport, station-fleet, regional-power, and finite-reserve plan. Only target-Resource consumption in that region counts as delivered. A deterministic two-stage material-balance solver considers all compatible project-local Processes together: it minimizes finite raw-resource demand first and installed process/logistics capacity second. Every cycle credits all declared outputs, so the plan can select alternative recipes, consume coproducts, and solve recycle loops such as refinery hydrogen feeding X-ray cracking without flattening the network into a recursive tree. Synthesis extends the same balance to `(Resource, region)` nodes with finite regional extraction bounds and explicit inter-region shipment variables. The target Process remains at the delivery region, while upstream Processes can move to raw-material regions; the optimizer therefore decides whether to ship raw inputs or lower-volume intermediates before placing anything. The synthesis pass turns that spatial process mix into a physical blueprint: it sizes and places processors/extractors/junction trees/stations/power, binds every input and output to a physical buffer, drains otherwise-unused coproducts into a project-local consumer, and propagates planned items/min through every merge/split edge. Process cycles and physical port throughput jointly determine machine count. When a Resource flow exceeds the fastest project-local lane, synthesis creates additional real production/consumption endpoints, explicit per-producer split and per-consumer merge trees, independent local lanes, and parallel station pairs instead of reusing a port or inventing an over-capacity trunk. Equal-rate lanes are globally paired to reduce crossings. Each physical connection then selects the lowest weighted-cost project-local loader/line/unloader combination whose runtime `planTransport()` contract and Resource stack limit meet that flow, before the global router chooses collision-free ground or raised belt paths. Low-rate links stay cheap while high-rate links automatically adopt faster or stacked tiers. Local belts carry explicit cargo stacks: loader/line/unloader assets and each Resource jointly limit items per stack, while one stack still occupies one physical belt cell. Power synthesis then treats every consuming Device and powered loader/unloader endpoint as a spatial target, inserts a deterministic connected chain of renewable distributors until all targets are covered, and adds connected capacity Devices until rated regional demand is met. Events are the shared debugging protocol for CLI output, fixtures, evaluation, research diagnosis, and 3D replay. Every physical connection also produces deterministic runtime telemetry—Resource mix, delivered rate versus stack-aware capacity, utilization, in-flight inventory, and blocked item-ticks—which the optimizer can turn into a targeted project-local speed/stack logistics tier upgrade. Studio opens on a project launcher, gives every project a stable `/<project-id>` URL, and exposes that project's self-contained Device, Resource, and Process catalog plus target plan and compiled material, logistics, power, and diagnostic analysis. Studio reads completed run artifacts but never creates one merely by viewing a project; simulation history is written only by explicit CLI/research workflows. Visual files cannot affect simulation.

Read [architecture](docs/ARCHITECTURE.md) for the system overview. Subsystem design is tracked under [`docs/design/`](docs/design/) and indexed for contributors in [`AGENTS.md`](AGENTS.md); code changes update the corresponding design document in the same commit.

## Development

```bash
bun run typecheck
bun test
```

The suite covers isolated multi-project workspaces, immutable world hashing, global and spatial target-rate process-mix optimization, cyclic recipe networks, raw/intermediate/finished-goods shipment choice, machine/extraction/transport/fleet/power/reserve planning, coproduct-aware demand credit and multi-output logistics, finite resource conservation and depletion, extractor range/region contracts, fuel energy and time-bounded generation, asset package loading and hashing, TypeScript runtime contracts, exact recipe-to-buffer bindings, instance-level Resource filters across belts, stations, extraction, fuel, and initial inventory, multi-input/multi-output scripts, deterministic replay, multi-region geometry and optimizer path isolation, region-local physical links and connected synthesized power coverage, planned-rate propagation through junction trees, automatic over-capacity parallel lanes and station pairs, single-use physical ports, synthesis-time logistics-tier selection, stack-aware cargo movement and Resource/stage limits, powered transport endpoint shortage/recovery and energy, per-connection flow/resource/blockage telemetry, measured logistics-tier optimization, planetary/interstellar routing invariants, batched station routing, finite shared fleets, fleet optimization, spatial power shortage, blocking, device failure/recovery, visual independence, research permissions, KEEP/REVERT, immutable run replay, and renderer-independent scene projection.
