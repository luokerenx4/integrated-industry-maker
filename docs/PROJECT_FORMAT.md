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
  benchmarks/<id>.benchmark.json
  AUTORESEARCH.md
  scenarios/<id>.scenario.json
  objectives/<id>.objective.json
  tests/<name>.fixture.json
  runs/<sequence>-<label>/
  .inm/cache/
```

The project manifest has a required kebab-case `id` matching its containing directory in a workspace and selects `defaultWorld`, `defaultBlueprint`, `defaultScenario`, and `defaultObjective`. Resources and devices are the two asset classes. Every concrete asset is a self-contained directory package. Its directory name must equal its asset id, `asset.json` is the stable index, and every referenced path must remain inside that directory. Fields are strict: unknown properties are errors.

A project can include an empty blueprint (`devices`, `connections`, and `logisticsNetworks` are empty arrays) as the source for `inm synthesize`. Synthesis reads only this project tree: its Objective determines the required rate and delivery region, its Processes define material transformations, its regional Resource nodes constrain extraction over Scenario time, and its Device packages supply all processors, junctions, transport tiers, stations, carriers, consumers, and power generation. The spatial optimizer jointly selects region-qualified Process rates, finite raw-source rates, and directed inter-region Resource flows before physical placement. Required items/min then propagate through the explicit junction graph; transport tiers are selected only from this project's Device packages by evaluating each `planTransport()` contract and the Resource stack limit. The generated result is another ordinary `blueprints/<id>.blueprint.json`; it receives no implicit engine-global assets or special runtime behavior.

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

An identity-preserving WIP Resource adds `"tracking": { "kind": "lot", "family": "dram-wafer" }`. Every route-stage Resource for the same physical lot uses the same family. Tracked Resources must be discrete and must be transformed one-for-one by Processes; their ids, priorities, due dates, locations, and elapsed-state clocks survive Resource changes. See [[docs/design/lot-tracking]].

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
    "inputPorts": ["input"],
    "outputPorts": ["output"],
    "modes": [{
      "id": "standard", "name": "Standard",
      "inputCycles": 1, "outputCycles": 1,
      "durationMultiplier": { "numerator": 1, "denominator": 1 },
      "powerMultiplier": { "numerator": 1, "denominator": 1 },
      "minimumInputTreatmentLevel": 0,
      "auxiliaryInputs": []
    }],
    "changeover": { "durationTicks": 3000, "powerMilliWatts": 120000 }
  },
  "runtime": { "apiVersion": 1, "entry": "runtime.ts" },
  "power": { "idleMilliWatts": 10000, "activeMilliWatts": 180000 },
  "economics": { "buildCost": 1200 },
  "files": { "visual": "visual.json" }
}
```

Unlike the old single-behavior model, a Device declares descriptive capabilities and any number of ports and buffers. A process Device declares compatible Process categories, an exact rational speed multiplier, the physical `inputPorts`/`outputPorts` a recipe may configure, and at least one production mode. Optional `production.changeover` declares the fixed duration and total active power of changing between Process setup groups. There is no implicit mode or compatibility fallback. Asset buffer `accepts` values are maximum capabilities. A blueprint instance may narrow an internal buffer with `bufferFilters` and independently narrow one physical ingress/egress with `portFilters`; an empty list closes that object. The selected recipe maps every Resource to a physical port and unused production ports carry nothing. Shared recipe buffers receive deterministic per-Resource capacity partitions so one material cannot starve another. Extractor output is narrowed to the Resource type of its bound deposits. The Device TypeScript program still owns the final local decision inside the compiled job contract.

A treatment Device uses capability `treat`, three distinct material-input/material-output/agent buffers, and explicit modes:

```json
"treatment": {
  "inputBuffer": "material-input",
  "outputBuffer": "material-output",
  "agentBuffer": "agent-input",
  "modes": [{
    "id": "mk2", "name": "Level 2 coating", "level": 2,
    "durationTicks": 250, "itemCount": 4,
    "agent": { "resource": "proliferator", "count": 1 }
  }]
}
```

The treatment Resource remains the same; only the lot level changes. Production mode `minimumInputTreatmentLevel` gates Process inputs. See [[docs/design/material-treatment]] for compilation, dispatch, and runtime invariants.

A transport junction is a placed Device with the `transport-junction` capability, an internal buffer, and multiple input/output ports. Its blueprint policy can select deterministic merge/split behavior without hiding topology in runtime code:

```json
"policy": {
  "dispatch": "shortage-first",
  "inputPriority": "input-west",
  "outputPriority": "output-east",
  "filter": { "resource": "coal", "outputPort": "output-north" }
}
```

`dispatch` is exactly one of `fifo`, `round-robin`, or `shortage-first`. FIFO uses stable ids; round-robin rotates successful departures; shortage-first ranks destination resident-plus-inbound inventory in units of its configured Process input batch, fuel/Objective unit, or buffer capacity and uses Objective dependency depth as its next tie-break. Priorities name real ports and override automatic ordering. Filters name a project Resource plus a real output port, so the compiler rejects stale or impossible routing contracts. A filtered Resource uses only the filtered output; other Resources use the remaining outputs.

Each port binds to exactly one named buffer. Input ports cannot bind to output-only buffers, output ports cannot bind to input-only buffers, and buffer resource contracts are compiler-checked. An `internal` buffer may be bound to both directions, which is useful for storage and cross-docking devices.

Power consumption and generation use integer milliwatts. Every Device declares an idle baseline and an active total. `activeMilliWatts` includes the idle baseline; the two values are never added together, and idle may not exceed active. A connected healthy Device receives idle power before it may wait, process, extract, treat, or move cargo. Renewable generation is continuously available while its Device is healthy:

A Blueprint selects one grid-allocation policy for the whole factory:

```json
"policies": {
  "dispatch": "shortage-first",
  "powerAllocation": "proportional",
  "lotRelease": {
    "kind": "conwip",
    "maximumWip": 11,
    "reopenAtWip": 6,
    "maximumReleaseDelayTicks": 24000,
    "dispatch": "earliest-due-date"
  }
}
```

`lotRelease` is optional. Omission means open-loop admission after the fixed Scenario release tick and physical boundary check. `conwip` counts every released, non-completed, non-scrapped tracked lot factory-wide. It admits while open until `maximumWip`, closes, and normally reopens when active WIP falls to or below `reopenAtWip`; the reopen threshold must be non-negative and strictly below the positive maximum. Optional `maximumReleaseDelayTicks` adds a service guard: once an eligible lot reaches that admission delay, a closed controller may reopen as soon as one hard-cap slot exists. It never exceeds `maximumWip`. Eligible lots use `fifo`, `earliest-due-date`, or `highest-priority` dispatch with deterministic planned-tick/id ties. This policy is candidate Blueprint code; it cannot change Scenario arrivals or due dates. See [[docs/design/wip-release-control]].

`proportional` gives every healthy connected consumer the same integer parts-per-million satisfaction, calculated from available power divided by requested power. Production, extraction, treatment, and explicit sorter loading/unloading advance at that fraction of nominal speed; belt travel does not consume power and keeps its nominal speed. `priority-load-shedding` instead serves complete Device envelopes in priority order and pauses rejected work exactly.

In `priority-load-shedding` mode, a Blueprint instance may declare a hard load-shedding rank independently from its asset:

```json
"policy": { "powerPriority": 10 }
```

`powerPriority` is a non-negative integer. Higher values receive both standby and active power before lower values; stable Device id resolves equal values, and omission means zero. A high-priority active job reserves its complete envelope, so lower-priority always-on infrastructure can be shed. This policy applies equally to processors, extractors, junctions, stations, and explicit sorter endpoint Devices. It has no allocation effect in `proportional` mode.

```json
"power": {
  "idleMilliWatts": 0,
  "activeMilliWatts": 0,
  "generation": { "kind": "renewable", "outputMilliWatts": 600000 },
  "distribution": { "connectionRange": 20, "coverageRange": 20 }
}
```

A thermal generator instead names an input buffer and accepted fuel Resources:

```json
"power": {
  "idleMilliWatts": 0,
  "activeMilliWatts": 0,
  "generation": {
    "kind": "fuel",
    "outputMilliWatts": 1000000,
    "fuelBuffer": "fuel",
    "fuels": ["coal"]
  },
  "distribution": { "connectionRange": 20, "coverageRange": 20 }
}
```

An accumulator declares physical energy capacity and independent charge/discharge limits. It must be a power-capable distributor and cannot also generate:

```json
"power": {
  "idleMilliWatts": 0,
  "activeMilliWatts": 0,
  "distribution": { "connectionRange": 20, "coverageRange": 20 },
  "storage": {
    "capacityMilliJoules": 3600000,
    "chargeMilliWatts": 400000,
    "dischargeMilliWatts": 400000
  }
}
```

The compiler converts fuel energy and rated output into an exact burn duration. The Device program receives this immutable plan and returns `generate`; the host consumes one delivered fuel unit, records it in metrics, and adds rated generation only while that job is active. Distributors within each other's connection range form an isolated power grid. A Device within a distributor's coverage range joins the nearest grid. Rated demand greater than grid generation, unfed fuel generators, and powered Devices outside every grid are reported by `inm analyze`; accumulator discharge is intentionally excluded from steady-state headroom because it shifts finite energy rather than creating it. Runtime power allocation and energy accounting are isolated per grid. Surplus generation charges storage, deficits discharge it, and an exhausted grid pauses active production/extraction jobs with their inputs and remaining work intact until power returns. Loader and unloader assets use the same spatial rule at their physical endpoint cells.

Station and carrier Devices remain ordinary project-local Device assets with explicit industrial roles. A station adds the `station` capability and binds all network slots to one internal buffer:

```json
{
  "capabilities": ["store", "station"],
  "buffers": [{ "id": "storage", "role": "internal", "capacity": 200, "accepts": ["*"] }],
  "logisticsStation": {
    "networkKinds": ["local"],
    "buffer": "storage",
    "slots": 4,
    "energyCapacityMilliJoules": 3000000,
    "maximumChargeMilliWatts": 200000
  }
}
```

A reusable carrier declares the `carrier` logistics role and its supported network kinds:

```json
{
  "capabilities": ["transport"],
  "logistics": {
    "roles": ["carrier"],
    "carrierKinds": ["local"],
    "missionEnergy": {
      "baseMilliJoules": 100000,
      "milliJoulesPerDistance": 5000
    },
    "highSpeedMission": {
      "durationMultiplier": { "numerator": 1, "denominator": 2 },
      "energyMultiplier": { "numerator": 4, "denominator": 3 }
    }
  }
}
```

Its `planTransport()` result defines per-trip batch capacity and standard one-way travel time. A complete mission uses one loaded outbound leg and one empty return leg. `missionEnergy` defines the complete round-trip energy removed from the source station at departure. An optional `highSpeedMission` declares a strictly shorter duration multiplier and strictly higher energy multiplier. The carrier is not placed as a blueprint Device instance; each station entry owns an explicit finite count of that asset and its build cost.

Every station instance explicitly chooses its operating policy; omission is invalid:

```json
"policy": {
  "stationChargeMilliWatts": 200000,
  "highSpeedTransport": { "enabled": true, "minimumDistance": 80 }
}
```

High-speed transport represents an expedited line-haul service—priority loading, express routing, or dedicated vehicles—not a separate fantasy resource. The source station selects the mode for routes at or beyond `minimumDistance`, pays the complete high-speed mission energy, and retains the same cargo and fleet contracts.

## Explicit local transport paths

Every physical connection includes the exact ordered grid cells occupied by its line:

```json
{
  "id": "ore-to-smelter",
  "from": { "device": "ore-miner", "port": "output" },
  "to": { "device": "smelter", "port": "input" },
  "resources": ["iron-ore"],
  "path": [
    { "x": 4, "y": 10 },
    { "x": 5, "y": 10, "level": 1 },
    { "x": 6, "y": 10, "level": 1 },
    { "x": 7, "y": 10 }
  ],
  "logistics": {
    "loader": { "device": "ore-to-smelter-loader" },
    "line": { "deviceAsset": "conveyor" },
    "unloader": { "device": "ore-to-smelter-unloader" }
  }
}
```

The loader and unloader are ordinary, explicit Blueprint Device instances. A sorter Device carries its physical ownership and reach, for example:

```json
{
  "id": "ore-to-smelter-loader",
  "asset": "sorter",
  "region": "forge-zone",
  "position": { "x": 4, "y": 10 },
  "rotation": 0,
  "transportEndpoint": { "connection": "ore-to-smelter", "stage": "loader", "distance": 3 },
  "policy": { "powerPriority": 10 }
}
```

Every endpoint Device must be referenced by exactly one matching connection stage. Its region, first/last belt-cell position, cargo-flow rotation, asset role, and distance are compile-time invariants. Sorter attachments may overlap their owned belt endpoint because they are mounted infrastructure rather than an additional floor tile; they still have independent identity, asset tier, cost, power-grid membership, utilization, selection, and replay state. The line remains connection-owned because its ordered path is the physical belt instance.

`resources` is required and non-empty. It is the exact material allowlist for the lane, not a derived endpoint intersection: every entry must name a project Resource accepted by both compiled machine-port buffers, duplicates are invalid, and runtime dispatch may not move an unlisted Resource. A list such as `["iron-ore", "coal"]` deliberately permits a mixed-material lane; `["iron-ore"]` keeps a dedicated lane explicit even if both ports use wildcard buffers. Changing transport intent therefore appears in the same Blueprint diff as path, tier, span, or stack edits.

The first and last cells must be level-0 cells exactly the loader and unloader Devices' `transportEndpoint.distance` grid cells outward from the named ports. Consecutive cells must share a cardinal edge and may change by at most one `level`, representing a ramp along that step. Omitted `level` is ground level 0. Paths cannot leave region bounds, repeat the same `(x, y, level)`, cross placed machines, or cover finite resource nodes on the ground. Same-coordinate cells at different levels are distinct, making explicit crossings possible without free overlap. Line travel time grows with path length, while a belt's nominal items-per-time rate remains constant with length.

Each compiled belt cell has one output direction and one item slot. Multiple connections may reuse cells only when they agree on that downstream direction, so branches may merge into a shared belt but cannot silently diverge without a placed transport junction. Every item moves through loading, exact belt-cell positions, and unloading. Occupied downstream cells stop movement, the blockage propagates upstream one cell at a time, and simultaneous merge contenders use deterministic round-robin arbitration. Shared cells are charged once in build cost and occupied area rather than once per logical connection.

Each connection owns one loader and one unloader stage instance. Its `planTransport()` capacity limits concurrent items, while the asset's declared power is drawn once whenever that stage is active. A disconnected, underpowered, preempted, or failed loader cannot remove an item from its source buffer; an unavailable unloader holds the item in the final belt cell and propagates backpressure. A sorter interruption during active work freezes that Device's exact remaining stage time and resumes the same transit only after failure recovery or power restoration. `transport.stage-start` / `transport.stage-finish`, power shortage/restoration, per-Device status duration, per-endpoint utilization, and transport-only energy are recorded for run artifacts, optimization, and Studio replay. Simulation additionally records per-connection departures and deliveries by Resource, actual items/min against compiled capacity, average in-flight inventory, blocked item-ticks, and the fraction of in-flight time spent blocked. These measurements distinguish a nominally capable line from one that is saturated, failed, unpowered, or backpressured in its actual topology.

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
      produce: [...process.outputs],
      powerMilliWatts: process.powerMilliWatts
    };
  }
} satisfies DeviceProgram;
```

`assets/runtime-api.ts` is copied with the project, so its device source remains statically checkable without importing an asset contract from another project or shared library. For a production Device, `context.process` includes the selected `mode`, exact `durationTicks`, exact `powerMilliWatts`, and already-scaled buffer quantities. The program is a black box behind one host interface:

- `validateConfig(config)` optionally owns device-specific configuration rules.
- `evaluate(context)` receives only the current tick, instance identity/config, a frozen snapshot of totals and exact material batches, and its compiled Process, treatment, extraction, or fuel-generation plan when one is bound.
- `planTransport(context)` is required for assets declaring `transport`; it receives `loader`, `line`, `unloader`, or `carrier` as the logistics role and returns capacity and duration for that stage or trip.
- A program returns declarative actions. It never receives the mutable global factory state.

Supported decisions are `start`, `treat`, `extract`, `generate`, `consume`, `wait`, and `none`. An `extract` action names one of the instance's compiled resource-node bindings; the host enforces its maximum cycle rate, atomically reserves finite inventory, restores a reservation if the machine fails, and records extraction/depletion only on completion. A `treat` action must match the compiled material/level/agent batch exactly. A `generate` action must match a compiled fuel, output, and burn duration. A `start` action may consume from and produce into any number of named buffers. The host validates every buffer, resource, level, node, count, capacity, duration, and power request before mutating state.

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
  "setupGroup": "iron-reduction",
  "durationTicks": 4000,
  "inputs": [{ "resource": "iron-ore", "count": 2 }],
  "outputs": [{ "resource": "iron-plate", "count": 1 }]
}
```

The filename must match `id`; every resource is compiler-resolved. Inputs and outputs may each contain multiple distinct Resources. Optional `setupGroup` names retained equipment state; switching a setup-sensitive Device to a different group creates a separate powered changeover job. Optional `quality` makes a one-lot Process an inspection or selective rework operation. A blueprint `recipe` selects one Process for a dedicated Device; `recipes` qualifies several Process/mode operations on a shared work center. Every entry explicitly maps each declared Resource to one of the Device's permitted input/output ports. The compiler rejects missing, extra, incompatible, duplicate, or unknown bindings before producing exact buffer-bound plans. Process content has its own catalog hash and therefore invalidates cached runs when changed. See [[docs/design/equipment-changeover]] and [[docs/design/quality-flow]].

An inspection declares a normal pass output in `outputs` plus alternate rework and optional scrap Resources:

```json
{
  "quality": {
    "kind": "inspection",
    "detects": ["critical-dimension", "particle-contamination"],
    "rejectResource": "rework-required-dram-wafer-lot",
    "scrapResource": "scrap-dram-wafer-lot",
    "maxReworkCycles": 1
  }
}
```

The Blueprint recipe must bind pass, reject, and scrap Resources to physical output ports. They are mutually exclusive dispositions, not coproducts. A rework Process uses `quality: { "kind": "rework", "repairs": ["critical-dimension"] }`; other latent defects remain with the lot. A terminal Device asset uses capability `discard` and an ordinary consuming runtime to mark tracked input lots scrapped without counting Objective delivery.

`inm analyze` also enumerates every project-local Process/mode pair compatible with each placed production Device. A deterministic binder preserves existing Resource assignments when possible, assigns new ingredients to distinct compatible buffers, and exposes the resulting recipe object as an optimization candidate. The selected production graph solves one target item as a global material balance over the active jobs, so coproducts, auxiliary inputs, and recycle loops retain their real topology. The CLI and research agent can compare alternatives before simulation while still using simulation and objective score as the final KEEP/REVERT authority.

## World

`worlds/<id>.world.json` declares immutable benchmark input: one or more `industrial-zone` regions plus finite resource nodes. Each industrial zone owns an independent 2D factory floor and has integer network coordinates used for long-range route distance. A resource node names a project Resource, region, cell, and positive initial amount. World contents have their own run hash and are outside the research patch boundary.

```json
{
  "version": 1,
  "id": "main",
  "name": "Twin Industrial Zones",
  "regions": [
    {
      "id": "forge-zone",
      "name": "Forge Industrial Zone",
      "kind": "industrial-zone",
      "coordinates": { "x": 0, "y": 0, "z": 0 },
      "bounds": { "width": 20, "height": 24 }
    },
    {
      "id": "assembly-zone",
      "name": "Assembly Industrial Zone",
      "kind": "industrial-zone",
      "coordinates": { "x": 100, "y": 0, "z": 0 },
      "bounds": { "width": 20, "height": 24 }
    }
  ],
  "resourceNodes": [
    { "id": "iron-vein-1", "region": "forge-zone", "resource": "iron-ore", "position": { "x": 1, "y": 9 }, "amount": 30 }
  ]
}
```

## Blueprint

Every Device instance belongs to exactly one region from the selected world. Rotations are `0`, `90`, `180`, or `270`; bounds and collisions are checked within that region. Physical connections run from an output port to an input port in the same region, reference explicit loader and unloader Device instances, and select one line Device asset for the routed belt cells. Extractors must explicitly bind reachable, same-region nodes supported by their asset.

Blueprint files are independently named candidate programs. `inm compare` can transform one complete file into another with an exact RFC 6902 patch while also reporting changes by stable entity id. Array positions are patch mechanics; Device, connection, and logistics-network ids are the semantic identity used in explanations. Comparison fixes catalogs, World, Scenario, Objective, and seed so its metric delta belongs to the Blueprint edit alone. See [[docs/design/blueprint-comparison]].

```json
{
  "version": 1,
  "devices": [
    {
      "id": "ore-source-1",
      "asset": "mining-machine",
      "region": "forge-zone",
      "position": { "x": 2, "y": 10 },
      "rotation": 0,
      "resourceNodes": ["iron-vein-1"]
    },
    {
      "id": "smelter-1",
      "asset": "smelter",
      "region": "forge-zone",
      "position": { "x": 10, "y": 10 },
      "rotation": 0,
      "recipe": {
        "process": "smelt-iron",
        "mode": "standard",
        "inputs": { "iron-ore": "input" },
        "outputs": { "iron-plate": "output" }
      }
    },
    {
      "id": "ore-to-smelter-loader",
      "asset": "sorter",
      "region": "forge-zone",
      "position": { "x": 4, "y": 10 },
      "rotation": 0,
      "transportEndpoint": { "connection": "ore-to-smelter", "stage": "loader", "distance": 1 }
    },
    {
      "id": "ore-to-smelter-unloader",
      "asset": "sorter",
      "region": "forge-zone",
      "position": { "x": 9, "y": 10 },
      "rotation": 0,
      "transportEndpoint": { "connection": "ore-to-smelter", "stage": "unloader", "distance": 1 }
    }
  ],
  "connections": [
    {
      "id": "ore-to-smelter",
      "from": { "device": "ore-source-1", "port": "output" },
      "to": { "device": "smelter-1", "port": "input" },
      "resources": ["iron-ore"],
      "path": [{ "x": 4, "y": 10 }, { "x": 5, "y": 10 }, { "x": 6, "y": 10 }, { "x": 7, "y": 10 }, { "x": 8, "y": 10 }, { "x": 9, "y": 10 }],
      "logistics": {
        "loader": { "device": "ore-to-smelter-loader" },
        "line": { "deviceAsset": "conveyor" },
        "unloader": { "device": "ore-to-smelter-unloader" }
      }
    }
  ],
  "logisticsNetworks": [],
  "policies": { "dispatch": "shortage-first" }
}
```

`recipe.process` and required `recipe.mode` are engine-visible industrial semantics. `recipe.inputs` and `recipe.outputs` are exact Resource-to-port contracts, so two instances of one generic assembler may select different Processes, modes, and physical material assignments. For `iron-plate + coal → gear`, each input can use an independent port even if both ports share one internal buffer. Auxiliary mode inputs name a Device port and join the same physical job; if an auxiliary Resource is also a Process input, both quantities must use that port and are aggregated. `config` remains optional device-owned data for specialized machines and is passed to the asset's `validateConfig()` hook.

A re-entrant work center uses `recipes` instead of `recipe`:

```json
{
  "id": "lithography-1",
  "asset": "lithography-bay",
  "region": "cleanroom",
  "position": { "x": 8, "y": 12 },
  "rotation": 0,
  "recipes": [
    {
      "process": "pattern-cell-layer-1",
      "mode": "qualified",
      "priority": 1,
      "inputs": { "blank-dram-wafer-lot": "release-input" },
      "outputs": { "patterned-cell-l1-lot": "pattern-output" }
    },
    {
      "process": "pattern-cell-layer-2",
      "mode": "qualified",
      "priority": 10,
      "inputs": { "dielectric-stack-lot": "reentrant-input" },
      "outputs": { "patterned-cell-l2-lot": "pattern-output" }
    }
  ],
  "policy": {
    "recipeDispatch": "earliest-due-date",
    "lotDispatch": "earliest-due-date",
    "setupCampaign": { "minimumReadyLots": 3, "maximumHoldTicks": 12000 }
  }
}
```

`recipe` and `recipes` are mutually exclusive. `recipeDispatch` accepts static operation rules (`authored-order`, `shortest-cycle`, `highest-priority`, `minimize-changeover`) and tracked-WIP rules (`oldest-lot`, `earliest-due-date`, `highest-lot-priority`); omission means `authored-order`. `minimize-changeover` prefers ready work in the Device's current setup group. `lotDispatch` is `fifo`, `oldest-release`, `earliest-due-date`, or `highest-priority` and chooses the exact identity set within the winning operation. Optional `setupCampaign` retains the current setup while a different target group accumulates `minimumReadyLots`, but releases the held changeover after `maximumHoldTicks`; it is valid only on a changeover-capable work center whose qualified operations preserve tracked lots across at least two setup groups. Dispatch considers only operations whose complete input batch is resident and whose output batch fits, never preempts an active job, and resolves ties deterministically. An equal multi-lot tracked input/output count is one fixed identity-preserving batch; see [[docs/design/batch-processing]]. Per-operation rates in `inm analyze` are exclusive maxima because qualified operations share one Device capacity envelope. See [[docs/design/work-center-dispatch]], [[docs/design/lot-tracking]], [[docs/design/equipment-changeover]], and [[docs/design/setup-campaign-control]].

Non-recipe Devices can configure ingress/egress independently:

```json
"portFilters": {
  "input-west": ["iron-ore"],
  "input-south": ["coal"],
  "output-east": ["gear"]
}
```

A port filter may only narrow its backing buffer. Connections are validated against the compiled port contract rather than the broader internal buffer contract.

A treatment Device instance instead selects its required mode with `"treatment": { "mode": "mk2" }`. Its `bufferFilters` should narrow wildcard material buffers to the intended Resource and its agent buffer to the declared agent. Synthesis always writes these exact filters.

Every connection requires a non-empty exact `resources` allowlist. When several Resources share one connection under shortage-first dispatch, the same coverage comparison selects which Resource enters the loader. `policies.dispatch` is the factory default; a source Device's `policy.dispatch` overrides it for local lanes and a logistics network's `dispatch` overrides it when routes compete for one source station's home fleet. There is no compatibility alias or implicit migration for older policy values.

Every Device instance—not only a recipe machine—may configure accepted Resources without editing its asset package:

```json
{
  "id": "gear-storage",
  "asset": "buffer",
  "region": "assembly-zone",
  "position": { "x": 12, "y": 8 },
  "rotation": 0,
  "bufferFilters": { "storage": ["gear"] }
}
```

Filters are strict narrowing contracts: they cannot add a Resource excluded by the asset. The compiler applies them to physical connection compatibility, recipe bindings, extractor output, fuel selection, station slots, Scenario initial inventory, and runtime belt dispatch. Each connection then narrows its two effective endpoint contracts again through required `resources`. Synthesis writes exact filters for extractors, junction trees, boundary consumers, surplus consumers, and station pairs plus a one-Resource allowlist on every generated lane, so generated blueprints do not rely on wildcard routing.

A transport Device declares the stages it can fill. A sorter must declare its physical reach, for example `"logistics": { "roles": ["loader", "unloader"], "endpointRange": { "minimum": 1, "maximum": 3 } }`; a line uses only `"roles": ["line"]`. Its TypeScript `planTransport(context)` returns `{ capacity, durationTicks, stackCapacity? }`, and `context.distance` is the selected sorter span for endpoints or routed-cell count for a line. Capacity counts concurrent cargo entities, while `stackCapacity` (default 1) caps the number of Resource items carried by each entity. A blueprint connection may set `"stackSize": 4`; omitting it selects the maximum supported by all three stages and the Resource asset's `transport.stackSize`. The compiler rejects impossible explicit requests. One belt cell still contains at most one cargo entity, so stacking raises item throughput without bypassing cell occupancy, shared-lane arbitration, or backpressure. Static analysis reports each stage's distance/cargo/stack contract, per-Resource end-to-end items/min, and the complete stage chain. Projects may carry several speed/reach/stack tiers as independent local Device assets; research compares the combined items/min envelope and can replace every tied limiting stage while preserving the connection path and explicit endpoint distances.

`logisticsNetworks` is required even when empty. A populated network declares at least two station instances, and every station explicitly declares its compatible home fleet; count zero is valid for a station that does not originate traffic. A `local` network may route only between stations in the same region. An `inter-zone` network must include at least two regions and routes only between different regions:

```json
"logisticsNetworks": [
  {
    "id": "inter-zone-main",
    "kind": "inter-zone",
    "dispatch": "shortage-first",
    "stations": [
      {
        "device": "station-supply",
        "fleet": { "deviceAsset": "line-haul-carrier", "count": 4 },
        "slots": [
          { "resource": "iron-plate", "mode": "supply", "capacity": 200, "minimumBatch": 3, "priority": 2, "supplyReserve": 40 }
        ]
      },
      {
        "device": "station-demand",
        "fleet": { "deviceAsset": "line-haul-carrier", "count": 0 },
        "slots": [
          { "resource": "iron-plate", "mode": "demand", "capacity": 120, "minimumBatch": 3, "priority": 10, "demandTarget": 90 }
        ]
      }
    ]
  }
]
```

`capacity` is required and allocates an independent quantity limit for that Resource in the station's backing buffer. A station may appear in several networks, but a repeated Resource must keep the same capacity; unique Resources across all networks consume the asset's finite slot count, and their capacities may not sum beyond the backing buffer's total capacity. The compiler narrows the station buffer to exactly those Resources.

Network `dispatch` accepts `fifo`, `round-robin`, or `shortage-first`; when omitted it inherits `policies.dispatch`. `supplyReserve` is valid only on `supply` and prevents carriers from taking the retained inventory; local output belts may still consume it. `demandTarget` is valid only on `demand` and stops remote replenishment when resident plus all already-inbound cargo reaches the target; local input belts may continue toward `capacity`. `priority` is a non-negative integer. A source station's finite home fleet always serves higher demand priority first, then higher supply priority. Within an equal explicit tier, FIFO uses stable route ids, round-robin advances after every departure, and shortage-first ranks destination coverage and Objective depth before deterministic cursor ties. `storage` slots cannot declare dispatch fields. Defaults are priority `0`, supply reserve `0`, demand target equal to `capacity`, and inherited dispatch policy.

For shortage-first, station inventory is measured in real downstream units. The compiler recursively follows same-Resource connections from the demand station's backing buffer through same-buffer junctions and pass-through storage, deduplicates converged leaves, and sums their exact Process input batches, fuel/Objective units, or terminal-buffer capacity as one coverage round. Resident inventory plus both belt and carrier inbound cargo is divided by that value. If the station has no local downstream contract for the Resource, its `demandTarget` is the fallback coverage unit. An explicit demand or supply priority always ranks above this automatic signal.

The compiler matches supply and demand slots for the same Resource, validates region topology, each station's carrier kind, slot and batch capacity, then builds deterministic station-to-station routes. Route distance is the Manhattan distance between region world coordinates plus each station's local position; the carrier runtime turns that distance into one-way duration and raw cargo capacity. Effective route batch capacity is the minimum of carrier capacity, supply capacity after reserve, and demand target, and static fleet planning divides it by the complete outbound-plus-return cycle. `storage` slots participate in inventory but neither advertise nor request a route. At runtime a departure reserves one carrier from the supply station's home fleet. Cargo reaches demand storage after the loaded outbound leg, but the carrier stays busy through its empty return and becomes dispatchable only after `logistics.return`. All routes originating at that station compete for the same declared fleet within the network. Destination free space counts both total buffer occupancy and the Resource slot's resident plus in-flight quantity, including cargo arriving by local belt. Station failures or unavailable same-region power block new departures, while already-departed cargo and returning carriers remain explicit state. Fleet assets, cargo in flight, return missions, persistent station power, WIP, and congestion all participate in evaluation.

Every placed station must explicitly configure `policy.stationChargeMilliWatts`, from zero through the station asset's `maximumChargeMilliWatts`. Charging is a real regional-grid load and fills the station's independent carrier-energy buffer; it is neither hidden in idle power nor inferred from the fleet. A complete route mission costs `baseMilliJoules + distance × milliJoulesPerDistance` once at source departure. Insufficient stored energy blocks departure until an exact charging boundary, while incoming carriers never draw destination energy. Static route capacity is bounded by station-owned fleet round-trip time and configured source-station charging.

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
  "lotReleases": [
    { "id": "dram-lot-01", "device": "lot-release", "buffer": "storage", "resource": "blank-dram-wafer-lot", "releaseTick": 0, "priority": 10, "dueTick": 90000 }
  ],
  "initialSetups": { "lithography-1": "photo-mask-l1" },
  "qualityExcursions": [
    { "id": "cd-lot-03", "process": "etch-cell-layer-2", "lot": "dram-lot-03", "defects": ["critical-dimension"] }
  ],
  "initialTreatments": [
    { "device": "smelter-1", "buffer": "input", "resource": "iron-ore", "level": 1, "count": 2 }
  ],
  "initialEnergyMilliJoules": {
    "accumulator-1": 1800000,
    "station-supply": 12000000
  },
  "renewableProfiles": [
    {
      "region": "forge-zone",
      "asset": "wind-turbine",
      "periodTicks": 8000,
      "points": [
        { "atTick": 0, "outputPermille": 1000 },
        { "atTick": 4000, "outputPermille": 0 }
      ]
    }
  ],
  "failures": [
    { "device": "smelter-1", "atTick": 40000, "durationTicks": 15000 }
  ]
}
```

`initialEnergyMilliJoules` is keyed by a placed accumulator or logistics-station Device id. Each value must be an integer from zero through that Device's compiled energy capacity. It is part of the Scenario hash and therefore of run identity. Omitted energy buffers start empty.

`renewableProfiles` are periodic, piecewise-constant environmental curves. Each profile applies to every renewable Device in its `region`, optionally narrowed to one Device `asset`; this includes Devices later added to a candidate Blueprint. The first point must start at zero, later `atTick` values are strictly increasing and below `periodTicks`, and integer `outputPermille` is limited to 0–1000 of asset-rated output. Overlapping profiles for one Device are invalid. Omitted matches run at rated output.

Capacity planning integrates these curves against the Objective-derived constant regional design load and configured storage. Synthesis uses the same interval solver to choose a lowest-build-cost project-local generator/storage bundle that starts empty and leaves no energy unserved; its physical Devices are written into the Blueprint. Runtime simulation remains the event-level authority for actual burst timing and Device utilization.

`initialTreatments` reclassifies a subset of matching `initialBuffers` inventory from level 0 to the declared positive level. It cannot create inventory, exceed the matching initial quantity, bypass the compiled buffer contract, or reference an unplaced Device. Omitted inventory is untreated.

`lotReleases` is the only Scenario entry path for tracked Resources. Each lot id is unique and names its release Device/buffer/Resource, required absolute `releaseTick`, optional integer priority, and optional due tick. A scheduled lot exists as identity but occupies no factory buffer or WIP before its release tick. Admission waits when the target buffer or Resource quota is full or when the Blueprint CONWIP controller is closed; actual release time, delay, blocking cause, and controller state are measured. The compiler rejects a tracked Resource in `initialBuffers`, a non-tracked Resource in `lotReleases`, duplicate identities, incompatible buffers, releases outside the Scenario, due dates before release, and buffers unable to hold one lot. See [[docs/design/lot-release-scheduling]] and [[docs/design/wip-release-control]].

`initialSetups` maps setup-sensitive Device ids to qualified Process setup groups at tick zero. An omitted Device starts unconfigured and must perform a first changeover when ready WIP arrives. Scenario setup is fixed benchmark input; a candidate Blueprint cannot edit the physical starting state.

`qualityExcursions` is fixed deterministic benchmark workload. Each unique id names one initial lot, one Process, and one or more latent defect classes. The excursion is applied once when that lot first completes the Process. It is not a random seed or probability: every candidate Blueprint receives the same named quality challenge.

```json
{
  "id": "default",
  "name": "Sustain Gear Throughput",
  "targetResource": "gear",
  "targetRegion": "assembly-zone",
  "targetRatePerMinute": 12,
  "constraints": { "maxBuildCost": 20000, "maxOccupiedArea": 64, "minProduction": 5 },
  "weights": {
    "throughput": 10,
    "onTimeDelivery": 10,
    "energy": 0.01,
    "buildCost": 0.5,
    "occupiedArea": 0.2,
    "wip": 0.1,
    "blocked": 2,
    "cycleTime": 0,
    "tardiness": 0,
    "changeovers": 0,
    "qualityEscapes": 0,
    "rework": 0
  }
}
```

`targetRegion` is the delivery boundary: only target-Resource consumption in that region counts toward the Objective. `targetRatePerMinute` is the factory's required steady-state design rate, not an optional display hint. `inm plan` solves that rate through the selected recipes as a global material balance, then sizes Process Devices, extraction, local transport, station fleets, regional power, and finite reserve for the selected Scenario duration. `inm synthesize` anchors the final Process and boundary consumer in `targetRegion`, then uses the spatial extension to decide where upstream Processes run and which Resource crosses each regional boundary. For an untracked target, runtime `onTimeDelivery` is achieved regional delivery rate divided by design rate, capped at one. For a tracked target family, it is on-time completed lots divided by all Scenario-scheduled lots, so blocked or delayed admission cannot improve service by withholding work. Optional `cycleTime` and `tardiness` weights penalize mean completed-lot minutes; `changeovers` penalizes completed equipment reconfiguration, `qualityEscapes` penalizes target lots delivered with latent defects, and `rework` penalizes completed recovery cycles. `constraints.minProduction` remains a separate hard minimum target delivery count over the complete Scenario.

## Coding Agent benchmark

`benchmarks/<id>.benchmark.json` converts one candidate Blueprint file into a locked optimization program:

```json
{
  "version": 1,
  "id": "autoresearch",
  "name": "Ironworks Autonomous Blueprint Research",
  "baselineBlueprint": "main",
  "candidateBlueprint": "autoresearch",
  "cases": [
    {
      "id": "normal-production",
      "name": "Normal production",
      "world": "main",
      "scenario": "baseline",
      "objective": "default",
      "seed": 42,
      "weight": 1
    }
  ],
  "acceptance": {
    "minimumAggregateScoreDelta": 0.001,
    "maximumCaseScoreRegression": 0,
    "requireCandidateCapacityReady": false
  },
  "lock": {
    "contractHash": "<sha256>",
    "cases": {
      "normal-production": {
        "engineVersion": "inm-sim/0.53.0",
        "resourceCatalogHash": "<sha256>",
        "processCatalogHash": "<sha256>",
        "deviceCatalogHash": "<sha256>",
        "worldHash": "<sha256>",
        "blueprintHash": "<sha256>",
        "scenarioHash": "<sha256>",
        "objectiveHash": "<sha256>"
      }
    }
  }
}
```

Ids use lowercase kebab-case. Cases must have unique ids, non-negative integer seeds, positive weights, and refer to project-local files. Acceptance defaults to positive aggregate improvement with zero allowed per-case regression; capacity readiness is optional because a baseline may intentionally begin with plan gaps.

Evaluation reports the weighted aggregate, the lowest raw baseline/candidate case score, and the minimum individual-case score delta. The latter two are stable outputs for robustness-oriented Coding Agent loops; the acceptance gate still uses the declared aggregate threshold and maximum permitted regression for every case.

The `lock` is written only by an explicit `inm benchmark --lock`. `contractHash` covers every benchmark field except the lock itself, including the candidate filename but not its content. Each case lock captures the complete compiled baseline identity. Normal evaluation rejects missing locks, contract edits, case-set edits, engine changes, and any catalog/World/baseline/Scenario/Objective drift. The candidate Blueprint is the sole variable.

The complete executable format is demonstrated in [`examples/ironworks`](../examples/ironworks); shared work-center qualification and re-entrant flow are demonstrated in [[examples/memory-fab]].
