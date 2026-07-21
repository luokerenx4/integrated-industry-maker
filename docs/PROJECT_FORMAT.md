# INM workspace, project, and asset format

## Workspace layout

```text
engine/
  inm-workspace.json
  projects/
    factory-a/
    factory-b/
```

`inm-workspace.json` only describes how the engine discovers and selects projects:

```json
{
  "version": 1,
  "name": "My factories",
  "projectsDirectory": "projects",
  "defaultProject": "factory-a"
}
```

Projects are immediate, real directories; symbolic-link projects are rejected. Each directory name must equal the required project `id` in its `inm.json`. A workspace owns no assets and participates in no asset resolution.

Projects are intentionally isolated and self-contained. There is no global catalog, shared asset directory, inheritance, fallback, or cross-project reference. Reuse means copying the complete asset directory into the target project; the copies then evolve and hash independently.

## Project layout

```text
factory/
  inm.json
  assets/
    runtime-api.ts
    resources/
      <resource-id>/
        asset.json
        visual.json
        ... referenced files
    devices/
      <device-id>/
        asset.json
        visual.json
        runtime.ts
        ... private implementation files
  processes/<id>.process.json
  worlds/<id>.world.json
  blueprints/<id>.blueprint.json
  scenarios/<id>.scenario.json
  objectives/<id>.objective.json
  tests/<name>.fixture.json
  runs/<sequence>-<label>/
  .inm/cache/
```

The project manifest has a required kebab-case `id` matching its containing directory in a workspace and selects `defaultWorld`, `defaultBlueprint`, `defaultScenario`, and `defaultObjective`. Resources and devices are the two asset classes. Every concrete asset is a self-contained directory package. Its directory name must equal its asset id, `asset.json` is the stable index, and every referenced path must remain inside that directory. Fields are strict: unknown properties are errors.

Splitting presentation and execution from identity is intentional. Catalog tools can inspect `asset.json` without executing code, artists can replace files named by `visual.json`, and device authors can edit `runtime.ts` without turning the blueprint into a script container. The hash of an asset covers every file in its package.

## Resource asset

`assets/resources/iron-ore/asset.json`:

```json
{
  "assetVersion": 1,
  "type": "resource",
  "id": "iron-ore",
  "name": "Iron Ore",
  "description": "Unrefined iron-bearing rock.",
  "tags": ["raw", "solid", "metal"],
  "unit": { "kind": "discrete", "symbol": "unit", "precision": 0 },
  "transport": { "stackSize": 100 },
  "files": { "visual": "visual.json" }
}
```

`visual.json` supplies all presentation fields independently of simulation:

```json
{
  "shape": "sphere",
  "texture": null,
  "color": "#75665b",
  "icon": null
}
```

A Resource asset describes a kind of flow. Runtime quantities are `(resource id, integer count)` values held in named device buffers or in transit. `unit.kind: continuous` and non-zero precision reserve the file contract for continuous resources; the current engine executes integer quantities only.

A combustible Resource declares how much energy one unit contains. The value is an integer number of millijoules and is consumed only through a fuel generator's compiled generation job:

```json
"fuel": { "energyMilliJoules": 70000000 }
```

## Device asset

`assets/devices/smelter/asset.json`:

```json
{
  "assetVersion": 1,
  "type": "device",
  "id": "smelter",
  "name": "Smelter",
  "description": "A configurable thermal processor.",
  "tags": ["thermal", "processing"],
  "capabilities": ["process"],
  "geometry": {
    "footprint": { "width": 2, "height": 2 },
    "rotatable": true,
    "ports": [
      { "id": "input", "direction": "input", "kind": "resource", "side": "west", "offset": 0, "buffer": "input" },
      { "id": "output", "direction": "output", "kind": "resource", "side": "east", "offset": 0, "buffer": "output" }
    ]
  },
  "buffers": [
    { "id": "input", "role": "input", "capacity": 8, "accepts": ["iron-ore"] },
    { "id": "output", "role": "output", "capacity": 8, "accepts": ["iron-plate"] }
  ],
  "production": {
    "categories": ["smelting"],
    "speed": { "numerator": 1, "denominator": 1 },
    "inputBuffers": ["input"],
    "outputBuffers": ["output"]
  },
  "runtime": { "apiVersion": 1, "entry": "runtime.ts" },
  "power": { "consumptionMilliWatts": 180000 },
  "economics": { "buildCost": 1200 },
  "files": { "visual": "visual.json" }
}
```

Unlike the old single-behavior model, a Device declares a list of descriptive capabilities and any number of ports and buffers. A process Device declares compatible Process categories, an exact rational speed multiplier, and the set of physical input/output buffers that a recipe may configure. Asset-level `accepts` values are maximum capabilities; the selected blueprint recipe narrows each listed buffer to the Resources actually bound there. Unused recipe buffers accept nothing. An extractor declares supported resources, mining radius, output buffer, and its maximum integer cycle rate. The device's TypeScript program still owns the final local decision.

A transport junction is a placed Device with the `transport-junction` capability, an internal buffer, and multiple input/output ports. Its blueprint policy can select deterministic merge/split behavior without hiding topology in runtime code:

```json
"policy": {
  "dispatch": "round-robin",
  "inputPriority": "input-west",
  "outputPriority": "output-east",
  "filter": { "resource": "coal", "outputPort": "output-north" }
}
```

Priorities name real ports and filters name a project Resource plus a real output port, so the compiler rejects stale or impossible routing contracts. A filtered Resource uses only the filtered output; other Resources use the remaining outputs.

Each port binds to exactly one named buffer. Input ports cannot bind to output-only buffers, output ports cannot bind to input-only buffers, and buffer resource contracts are compiler-checked. An `internal` buffer may be bound to both directions, which is useful for storage and cross-docking devices.

Power consumption and generation use integer milliwatts. Renewable generation is continuously available while its Device is healthy:

```json
"power": {
  "consumptionMilliWatts": 0,
  "generation": { "kind": "renewable", "outputMilliWatts": 600000 },
  "distribution": { "connectionRange": 20, "coverageRange": 20 }
}
```

A thermal generator instead names an input buffer and accepted fuel Resources:

```json
"power": {
  "consumptionMilliWatts": 0,
  "generation": {
    "kind": "fuel",
    "outputMilliWatts": 1000000,
    "fuelBuffer": "fuel",
    "fuels": ["coal"]
  },
  "distribution": { "connectionRange": 20, "coverageRange": 20 }
}
```

The compiler converts fuel energy and rated output into an exact burn duration. The Device program receives this immutable plan and returns `generate`; the host consumes one delivered fuel unit, records it in metrics, and adds rated generation only while that job is active. Distributors within each other's connection range form an isolated power grid. A Device within a distributor's coverage range joins the nearest grid. Rated demand greater than grid generation, unfed fuel generators, and powered Devices outside every grid are reported by `inm analyze`; runtime power allocation and energy accounting are also isolated per grid. Loader and unloader assets use the same rule at their physical endpoint cells, so they are spatial grid consumers rather than free connection metadata.

Station and carrier Devices remain ordinary project-local Device assets with explicit industrial roles. A station adds the `station` capability and binds all network slots to one internal buffer:

```json
{
  "capabilities": ["store", "station"],
  "buffers": [{ "id": "storage", "role": "internal", "capacity": 200, "accepts": ["*"] }],
  "logisticsStation": {
    "networkKinds": ["planetary"],
    "buffer": "storage",
    "slots": 4
  }
}
```

A reusable carrier declares the `carrier` logistics role and its supported network kinds:

```json
{
  "capabilities": ["transport"],
  "logistics": {
    "roles": ["carrier"],
    "carrierKinds": ["planetary"]
  }
}
```

Its `planTransport()` result defines per-trip batch capacity and occupied travel time. The carrier is not placed as a blueprint Device instance; a station network owns a finite count of that asset and its build cost.

## Explicit local transport paths

Every physical connection includes the exact ordered grid cells occupied by its line:

```json
{
  "id": "ore-to-smelter",
  "from": { "device": "ore-miner", "port": "output" },
  "to": { "device": "smelter", "port": "input" },
  "path": [
    { "x": 4, "y": 10 },
    { "x": 5, "y": 10 },
    { "x": 6, "y": 10 }
  ],
  "logistics": {
    "loader": { "deviceAsset": "sorter" },
    "line": { "deviceAsset": "conveyor" },
    "unloader": { "deviceAsset": "sorter" }
  }
}
```

The first and last cells must be the exterior cells of the named ports. Consecutive cells must share a cardinal edge; paths cannot leave region bounds, repeat themselves, cross placed Devices, or cover finite resource nodes. Line travel time grows with path length, while a belt's nominal items-per-time rate remains constant with length.

Each compiled belt cell has one output direction and one item slot. Multiple connections may reuse cells only when they agree on that downstream direction, so branches may merge into a shared belt but cannot silently diverge without a placed transport junction. Every item moves through loading, exact belt-cell positions, and unloading. Occupied downstream cells stop movement, the blockage propagates upstream one cell at a time, and simultaneous merge contenders use deterministic round-robin arbitration. Shared cells are charged once in build cost and occupied area rather than once per logical connection.

Each connection owns one loader and one unloader stage instance. Its `planTransport()` capacity limits concurrent items, while the asset's declared power is drawn once whenever that stage is active. A disconnected or underpowered loader cannot remove an item from its source buffer; an underpowered unloader holds the item in the final belt cell and propagates backpressure. Shortage/restoration events, per-endpoint utilization, and transport-only energy are recorded for CLI, run artifacts, optimization, and Studio replay. Simulation additionally records per-connection departures and deliveries by Resource, actual items/min against compiled capacity, average in-flight inventory, blocked item-ticks, and the fraction of in-flight time spent blocked. These measurements distinguish a nominally capable line from one that is saturated or backpressured in its actual topology.

A line asset's `planTransport()` capacity must equal the requested path distance: capacity is the number of physical one-item slots, while `durationTicks / distance` is the movement clock of each slot. Belt tiers change that duration; they do not manufacture hidden in-flight capacity outside the routed cells.

## Device TypeScript program

Every Device package has a TypeScript entry conforming to `DeviceProgram`:

```ts
import type { DeviceProgram } from "../../runtime-api";

export default {
  apiVersion: 1,
  evaluate(context) {
    const process = context.process;
    if (!process) return { kind: "wait", reason: "idle" };
    if (!process.inputs.every((input) =>
      (context.buffers[input.buffer]?.[input.resource] ?? 0) >= input.count
    )) {
      return { kind: "wait", reason: "input" };
    }
    return {
      kind: "start",
      operation: process.id,
      durationTicks: process.durationTicks,
      consume: [...process.inputs],
      produce: [...process.outputs]
    };
  }
} satisfies DeviceProgram;
```

`assets/runtime-api.ts` is copied with the project, so its device source remains statically checkable without importing an asset contract from another project or shared library. The program is a black box behind one host interface:

- `validateConfig(config)` optionally owns device-specific configuration rules.
- `evaluate(context)` receives only the current tick, instance identity/config, a frozen snapshot of that device's buffers, and its compiled Process, extraction, or fuel-generation plan when one is bound.
- `planTransport(context)` is required for assets declaring `transport`; it receives `loader`, `line`, `unloader`, or `carrier` as the logistics role and returns capacity and duration for that stage or trip.
- A program returns declarative actions. It never receives the mutable global factory state.

Supported decisions are `start`, `extract`, `generate`, `consume`, `wait`, and `none`. An `extract` action names one of the instance's compiled resource-node bindings; the host enforces its maximum cycle rate, atomically reserves finite inventory, restores a reservation if the machine fails, and records extraction/depletion only on completion. A `generate` action must exactly match a compiled fuel, output, and burn duration. A `start` action may consume from and produce into any number of named buffers. The host validates every buffer, resource, node, count, capacity, duration, and power request before mutating state.

Programs must be synchronous and deterministic. They are local trusted project code—not a security sandbox—and therefore should not use clocks, network calls, ambient process state, or unseeded randomness. Repeated simulations and immutable run hashes detect nondeterministic results.

## Industrial Process

Processes are project-local data, not shared assets. `processes/smelt-iron.process.json`:

```json
{
  "version": 1,
  "id": "smelt-iron",
  "name": "Smelt Iron",
  "description": "Reduce iron ore into iron plate stock.",
  "category": "smelting",
  "tags": ["iron", "primary-processing"],
  "durationTicks": 4000,
  "inputs": [{ "resource": "iron-ore", "count": 2 }],
  "outputs": [{ "resource": "iron-plate", "count": 1 }]
}
```

The filename must match `id`; every resource is compiler-resolved. Inputs and outputs may each contain multiple distinct Resources. The blueprint recipe selects one Process for a Device instance and explicitly maps every declared Resource to one of the Device's permitted input/output buffers. The compiler rejects missing, extra, incompatible, or unknown bindings before producing the exact buffer-bound plan. Process content has its own catalog hash and therefore invalidates cached runs when changed.

`inm analyze` also enumerates every other project-local Process compatible with each placed production Device. A deterministic binder preserves existing Resource assignments when possible, assigns new ingredients to distinct compatible buffers, and exposes the resulting recipe object as an optimization candidate. The selected production graph recursively expands one target item through the active recipes into raw inputs, so the CLI and research agent can compare alternatives before simulation while still using simulation and objective score as the final KEEP/REVERT authority.

## World

`worlds/<id>.world.json` declares immutable benchmark input: one or more regions plus finite resource nodes. A region is a `site`, `planet`, or `orbit`, owns an independent 2D factory floor, and has integer world coordinates used for long-range route distance. A resource node names a project Resource, region, cell, and positive initial amount. World contents have their own run hash and are outside the research patch boundary.

```json
{
  "version": 1,
  "id": "main",
  "name": "Twin Worlds",
  "regions": [
    {
      "id": "forge-world",
      "name": "Forge World",
      "kind": "planet",
      "coordinates": { "x": 0, "y": 0, "z": 0 },
      "bounds": { "width": 20, "height": 24 }
    },
    {
      "id": "assembly-world",
      "name": "Assembly World",
      "kind": "planet",
      "coordinates": { "x": 100, "y": 0, "z": 0 },
      "bounds": { "width": 20, "height": 24 }
    }
  ],
  "resourceNodes": [
    { "id": "iron-vein-1", "region": "forge-world", "resource": "iron-ore", "position": { "x": 1, "y": 9 }, "amount": 30 }
  ]
}
```

## Blueprint

Every Device instance belongs to exactly one region from the selected world. Rotations are `0`, `90`, `180`, or `270`; bounds and collisions are checked within that region. Physical connections run from an output port to an input port in the same region and explicitly select loader, line, and unloader Device assets. Extractors must explicitly bind reachable, same-region nodes supported by their asset.

```json
{
  "version": 1,
  "devices": [
    {
      "id": "ore-source-1",
      "asset": "mining-machine",
      "region": "forge-world",
      "position": { "x": 2, "y": 10 },
      "rotation": 0,
      "resourceNodes": ["iron-vein-1"]
    },
    {
      "id": "smelter-1",
      "asset": "smelter",
      "region": "forge-world",
      "position": { "x": 10, "y": 10 },
      "rotation": 0,
      "recipe": {
        "process": "smelt-iron",
        "inputs": { "iron-ore": "input" },
        "outputs": { "iron-plate": "output" }
      }
    }
  ],
  "connections": [
    {
      "id": "ore-to-smelter",
      "from": { "device": "ore-source-1", "port": "output" },
      "to": { "device": "smelter-1", "port": "input" },
      "path": [{ "x": 4, "y": 10 }, { "x": 5, "y": 10 }, { "x": 6, "y": 10 }, { "x": 7, "y": 10 }, { "x": 8, "y": 10 }, { "x": 9, "y": 10 }],
      "logistics": {
        "loader": { "deviceAsset": "sorter" },
        "line": { "deviceAsset": "conveyor" },
        "unloader": { "deviceAsset": "sorter" }
      }
    }
  ],
  "logisticsNetworks": [],
  "policies": { "dispatch": "round-robin" }
}
```

`recipe.process` is engine-visible industrial semantics. `recipe.inputs` and `recipe.outputs` are exact Resource-to-buffer contracts, so two instances of the same generic assembler asset may select different Processes and expose different accepted materials on their ports. For a Process such as `iron-plate + coal → gear`, the two Resources may be mapped to separate buffers and fed by independent physical connections. `config` remains optional device-owned data for specialized machines and is passed to that asset's `validateConfig()` hook.

A transport Device declares the stages it can fill, for example `"logistics": { "roles": ["loader", "unloader"] }` for a sorter and `"roles": ["line"]` for a belt. Each stage contributes its own capacity, duration, and build cost. Static analysis reports the resulting end-to-end items/min and complete stage chain. Projects may carry several speed tiers as independent local Device assets; research can replace only the saturated stage while preserving the connection path and endpoint contracts.

`logisticsNetworks` is required even when empty. A populated network declares a compatible finite fleet and at least two station instances. A `planetary` network may route only between stations in the same region. An `interstellar` network must include at least two regions and routes only between different regions:

```json
"logisticsNetworks": [
  {
    "id": "interstellar-main",
    "kind": "interstellar",
    "fleet": { "deviceAsset": "logistics-vessel", "count": 4 },
    "stations": [
      {
        "device": "station-supply",
        "slots": [
          { "resource": "iron-plate", "mode": "supply", "minimumBatch": 3 }
        ]
      },
      {
        "device": "station-demand",
        "slots": [
          { "resource": "iron-plate", "mode": "demand", "minimumBatch": 3 }
        ]
      }
    ]
  }
]
```

The compiler matches supply and demand slots for the same Resource, validates region topology, carrier kind, and batch capacity, then builds deterministic station-to-station routes. Route distance is the Manhattan distance between region world coordinates plus each station's local position; the carrier runtime turns that distance into trip duration and capacity. `storage` slots participate in inventory but neither advertise nor request a route. At runtime every departure reserves one carrier until arrival; the shared fleet therefore limits all routes in the network together. Destination capacity includes cargo already in flight. Station failures or unavailable same-region power block new departures, while already-departed cargo remains in transit. Fleet assets, in-flight quantities, persistent station power, WIP, and congestion all participate in evaluation.

## Scenario and objective

Initial quantities address device and buffer explicitly:

```json
{
  "id": "baseline",
  "name": "Baseline Production",
  "durationTicks": 120000,
  "initialBuffers": {
    "smelter-1": { "input": { "iron-ore": 4 } }
  },
  "failures": [
    { "device": "smelter-1", "atTick": 40000, "durationTicks": 15000 }
  ]
}
```

```json
{
  "id": "default",
  "name": "Sustain Gear Throughput",
  "targetResource": "gear",
  "targetRatePerMinute": 12,
  "constraints": { "maxBuildCost": 20000, "maxOccupiedArea": 64, "minProduction": 5 },
  "weights": {
    "throughput": 10,
    "onTimeDelivery": 10,
    "energy": 0.01,
    "buildCost": 0.5,
    "occupiedArea": 0.2,
    "wip": 0.1,
    "blocked": 2
  }
}
```

`targetRatePerMinute` is the factory's required steady-state design rate, not an optional display hint. `inm plan` recursively expands that rate through the selected recipes, sizes Process Devices, extraction, local transport, station fleets, regional power, and finite reserve for the selected Scenario duration. Runtime `onTimeDelivery` is the achieved target-Resource rate divided by this design rate, capped at one. `constraints.minProduction` remains a separate hard minimum item count over the complete Scenario.

The complete executable format is demonstrated in [`examples/ironworks`](../examples/ironworks).
