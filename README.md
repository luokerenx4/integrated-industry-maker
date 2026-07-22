# Integrated Industry Maker

**INM** is an AI-native industrial production designer, deterministic simulator, and automated blueprint optimizer.

It represents a production system as a folder of immutable world definitions, finite resource deposits, scheduled purchased-material arrivals, inspectable asset packages, declarative industrial processes, JSON blueprints, and device-local TypeScript programs. A world can span multiple industrial zones, each with its own factory floor, deposits, distance-aware sorter arms, explicitly routed multi-level transport cells, and power topology. One physical work center may qualify several operations, retain setup state, spend powered changeovers, reserve finite reusable tooling from a nearby provider, and dispatch identity-preserving, due-dated WIP across a re-entrant route. Named lots arrive on a fixed Scenario schedule, remain outside factory WIP until physical and optional Blueprint CONWIP admission succeed, and expose planned/actual cadence, causal delay, WIP-card state, and replenishment waves. Tracked units can form fixed equipment batches while preserving every lot identity and measuring formation wait. Lots may also carry latent defects through inspection, selective rework, terminal scrap, or downstream quality escape. A Process can explicitly terminate a tracked work order while creating fungible downstream products, so one wafer lot can become several packaged devices without corrupting lot identity or product throughput. Objectives may freeze several value-weighted customer contracts, treat demand as a service floor, price shortfall, retain value for above-demand output, and let an editable Blueprint schedule shared equipment against marginal portfolio value. The complete system can be validated, statically balanced across extraction, materials, shared-capacity equipment and belt paths, shortage-aware junction policies, station-owned inter-zone carrier fleets, and regional power grids, compiled, simulated, benchmarked, modified with restricted JSON Patch experiments, and replayed in a read-only 3D debugger.

Material preparation is physical factory state. Treatment Devices consume project-local agents to raise exact cargo lots to a declared level; belts and station carriers preserve that level, higher production modes require it at their inputs, and synthesis builds the treatment equipment, agent production, logistics, and power together. There is no hidden “productivity bonus” consumption inside a machine.

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

# Or give a Coding Agent one Blueprint file and a locked three-case score
bun run inm benchmark examples/ironworks --benchmark autoresearch

# Or optimize WIP dispatch in a re-entrant DRAM memory-fab route
bun run inm analyze examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research

# Or synthesize a complete factory from a blank blueprint and the Objective
bun run inm synthesize examples/ironworks --blueprint blank --scenario cold-start --output synthesized

# Choose a project, inspect its local assets, and replay experiments in 3D
bun run inm studio examples/ironworks
```

The bundled experiment demonstrates the complete loop:

```text
000 dual-input recipe baseline    score 16.232
001 efficient gear-pair recipe    score 43.831  KEEP
002 smelter + routed branches     score 97.292  KEEP
003 switch arbitration to FIFO    score 97.292  REVERT
```

The default world and blueprint form an executable two-zone example. A TypeScript-driven mining machine in Forge Industrial Zone binds three finite iron veins, reserves and extracts their inventory, then feeds smelting through a three-cell sorter span and a shorter explicit belt before an inter-zone station; the sorter's runtime converts that reach into lower trips/min. A carrier based at that supply station moves batched iron plate to Assembly Industrial Zone, delivers after the loaded leg, then remains unavailable until its empty return completes. There, a recipe-configured assembler consumes iron plate and coal through two independently bound input buffers. A placed splitter sends locally mined coal toward both generation and the secondary recipe input. Its shortage-first factory policy compares downstream resident plus inbound stock in recipe/fuel batch units and uses target dependency depth to break ties, while explicit port priorities can still override automation. The inter-zone network applies the same signal when several routes compete for the supply station's finite home fleet and traces station inventory through the outgoing belt to the assembler's two-plate input batch. A renewable generator supports the expanded line. Forge Industrial Zone also places an initially empty project-local accumulator: interval surplus charges it, deficits discharge it, and exhausted power pauses active material jobs without losing inputs or completed work. The 12 gear/min Objective expands through the active recipes into an executable capacity plan. Physical links, powered loader/unloader endpoints, accumulators, and power grids are zone-local, while an inter-zone station network must cross zones.

## CLI

```text
inm workspace init <workspace-dir>
inm project create <workspace-dir> <project-id>
inm project list <workspace-dir>
inm project default <workspace-dir> <project-id>
inm validate|inspect|analyze|plan|compare|benchmark|synthesize|simulate|test|runs|research <project-or-workspace-dir> [--project ID]
inm analyze <project-or-workspace-dir> [--project ID]
inm studio <project-or-workspace-dir> [--project ID]
```

Every headless command supports explicit exit codes; inspection, validation, comparison, locked benchmarking, simulation, tests, runs, and research support `--json` where machine-readable output matters. See [CLI reference](docs/CLI.md).

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
  benchmarks/*.benchmark.json
  AUTORESEARCH.md           # optional project-local Coding Agent program
  tests/*.fixture.json
  runs/<immutable-run>/
  .inm/cache/               # disposable
```

There is deliberately no shared-asset lookup or inheritance layer. To reuse an asset, copy its directory into another project; from that point onward the two copies have independent contents and hashes.

- A **resource asset** is a self-described kind of flow with units, transport properties, optional fuel energy or identity-preserving lot family, and presentation files.
- A **device asset** owns geometry, multiple named buffers and ports, production or treatment modes, presentation files, and a private TypeScript throughput program.
- Device scripts are black boxes to the factory: they inspect only their frozen local context and return host-validated actions.
- A **process** declares a visible material transformation, category, base cycle time, optional reusable tooling and setup group, optional inspection/rework behavior, and an optional tracked-lot termination boundary whose actual fungible output may be derived from incoming lot quality; a blueprint binds it to a compatible Device.
- A **world** declares regions, world coordinates, build bounds, and finite resource nodes; optimization cannot edit it.
- A **blueprint** places Devices into world regions, narrows each instance's accepted Resources, binds configurable multi-input/multi-output recipes and extractors, gives every local connection an exact Resource allowlist and explicit grid path, and declares local or inter-zone station networks with finite carrier fleets. `inm synthesize` can construct that complete graph from an empty blueprint, the Objective rate, and only the project's own assets.
- A **scenario** fixes initial fungible inventory, scheduled purchased-material deliveries, named WIP lots with priorities/due dates, deterministic process excursions, failures, duration, and test conditions.
- An **objective** defines hard constraints and a transparent weighted score including optional cycle-time, tardiness, changeover, rework, and quality-escape terms.
- An **objective** may define one primary synthesis target plus an immutable multi-product delivery portfolio. Each contract owns a demand floor, unit value, shortfall penalty, and an optional fulfillment gate; above-demand output remains visible and valuable.
- A **benchmark** locks a baseline and several weighted World/Scenario/Objective/seed cases while leaving exactly one candidate Blueprint editable. Its aggregate score and per-case gates provide the keep/discard authority for a Coding Agent.

See [project format](docs/PROJECT_FORMAT.md), the complete [Ironworks example](examples/ironworks), and the re-entrant [DRAM memory-fab example](examples/memory-fab).

## Architecture

The capacity plan treats flexible equipment as finite qualified toolsets: all Objective delivery contracts are solved in one material balance, and required device-time is allocated across exact Process/mode qualifications instead of lending one work center's full clock to every route step. Scenario-scheduled tracked lots are fixed external supply, while actual release blocking, setup, maintenance, utilities, failures, and queueing remain event-simulation concerns.

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

The simulator is independent of React and Three.js. Runtime state has one reducer-owned mutation path; asset scripts cannot mutate it directly. The Objective's required items/min and explicit `targetRegion` delivery boundary are first compiled into a machine, raw-material, transport, station-fleet, regional-power, and finite-reserve plan. Only target-Resource consumption in that region counts as delivered. A deterministic two-stage material-balance solver considers all compatible project-local Processes together: it minimizes finite raw-resource demand first and installed process/logistics capacity second. Every cycle credits all declared outputs, so the plan can select alternative recipes, consume coproducts, and solve recycle loops such as refinery hydrogen feeding X-ray cracking without flattening the network into a recursive tree. Synthesis extends the same balance to `(Resource, region)` nodes with finite regional extraction bounds and explicit inter-region shipment variables. The target Process remains at the delivery region, while upstream Processes can move to raw-material regions; the optimizer therefore decides whether to ship raw inputs or lower-volume intermediates before placing anything. The synthesis pass turns that spatial process mix into a physical blueprint: it sizes and places processors/extractors/junction trees/stations/power, binds every input and output to a physical buffer, drains otherwise-unused coproducts into a project-local consumer, and propagates planned items/min through every merge/split edge. Process cycles and physical port throughput jointly determine machine count. When a Resource flow exceeds the fastest project-local lane, synthesis creates additional real production/consumption endpoints, explicit per-producer split and per-consumer merge trees, independent local lanes, and parallel station pairs instead of reusing a port or inventing an over-capacity trunk. Equal-rate lanes are globally paired to reduce crossings. Every local edge writes its planned Resource as an exact allowlist, so a wildcard station or buffer cannot silently leak another material onto that lane. Each physical connection then selects the lowest weighted-cost project-local loader/line/unloader combination whose runtime `planTransport()` contract and Resource stack limit meet that flow, before the global router chooses collision-free ground or raised belt paths. Low-rate links stay cheap while high-rate links automatically adopt faster or stacked tiers. Local belts carry explicit cargo stacks: loader/line/unloader assets and each listed Resource jointly limit items per stack, while one stack still occupies one physical belt cell. Power synthesis then treats every consuming Device and powered loader/unloader endpoint as a spatial target, inserts a deterministic connected chain of renewable distributors until all targets are covered, and adds connected capacity Devices until rated regional demand is met. Events are the shared debugging protocol for CLI output, fixtures, evaluation, research diagnosis, and 3D replay. Every physical connection also produces deterministic runtime telemetry—authored allowlist, measured Resource mix, delivered rate versus stack-aware capacity, utilization, in-flight inventory, and blocked item-ticks—which the optimizer can turn into a targeted project-local speed/stack logistics tier upgrade. Studio opens on a project launcher, gives every project a stable `/<project-id>` URL, and exposes that project's self-contained Device, Resource, and Process catalog plus target plan and compiled material, logistics, power, and diagnostic analysis. Studio reads completed run artifacts but never creates one merely by viewing a project; simulation history is written only by explicit CLI/research workflows. Visual files cannot affect simulation.

Read [architecture](docs/ARCHITECTURE.md) for the system overview. Subsystem design is tracked under [`docs/design/`](docs/design/) and indexed for contributors in [`AGENTS.md`](AGENTS.md); code changes update the corresponding design document in the same commit.

## Development

```bash
bun run typecheck
bun test
```

The suite covers isolated projects, global/spatial production optimization, cyclic and multi-input recipes, graded material treatment and agent chains, finite resources, explicit sorter spans and physical/station logistics, fuel generation, deterministic accumulator charging/discharging, exact depletion boundaries, hot-standby sleep and physical wake work, power-paused job resumption, typed asset runtimes, immutable replay, CLI evaluation, and renderer-independent Studio projection.
