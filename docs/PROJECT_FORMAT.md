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
  blueprints/<id>.blueprint.json
  scenarios/<id>.scenario.json
  objectives/<id>.objective.json
  tests/<name>.fixture.json
  runs/<sequence>-<label>/
  .inm/cache/
```

The project manifest has a required kebab-case `id` matching its containing directory in a workspace. Resources and devices are the two asset classes. Every concrete asset is a self-contained directory package. Its directory name must equal its asset id, `asset.json` is the stable index, and every referenced path must remain inside that directory. Fields are strict: unknown properties are errors.

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
    "inputBuffer": "input",
    "outputBuffer": "output"
  },
  "runtime": { "apiVersion": 1, "entry": "runtime.ts" },
  "power": { "consumptionMilliWatts": 180000, "productionMilliWatts": 0 },
  "economics": { "buildCost": 1200 },
  "files": { "visual": "visual.json" }
}
```

Unlike the old single-behavior model, a Device declares a list of descriptive capabilities and any number of ports and buffers. A production-capable Device may additionally declare compatible Process categories, an exact rational speed multiplier, and the buffers used to bind Process inputs and outputs. The device's TypeScript program still owns the final local decision.

Each port binds to exactly one named buffer. Input ports cannot bind to output-only buffers, output ports cannot bind to input-only buffers, and buffer resource contracts are compiler-checked. An `internal` buffer may be bound to both directions, which is useful for storage and cross-docking devices.

Power consumption and production use integer milliwatts. A generator or distribution pole also declares spatial grid semantics:

```json
"power": {
  "consumptionMilliWatts": 0,
  "productionMilliWatts": 1000000,
  "distribution": { "connectionRange": 20, "coverageRange": 20 }
}
```

Distributors within each other's connection range form an isolated power grid. A Device within a distributor's coverage range joins the nearest grid. Rated demand greater than grid generation and powered Devices outside every grid are reported by `inm analyze`; runtime power allocation and energy accounting are also isolated per grid.

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
- `evaluate(context)` receives only the current tick, instance identity/config, a frozen snapshot of that device's buffers, and its compiled Process plan when one is bound.
- `planTransport(context)` is required for assets declaring `transport`; it receives `loader`, `line`, or `unloader` as the stage and returns capacity and duration for that stage.
- A program returns declarative actions. It never receives the mutable global factory state.

Supported decisions are `start`, `consume`, `wait`, and `none`. A `start` action may consume from and produce into any number of named buffers, so multi-input/multi-output equipment does not need a standardized internal recipe representation. The host validates every buffer, resource, count, capacity, duration, and power request before mutating state.

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

The filename must match `id`; every resource is compiler-resolved. The blueprint binds a Process to a Device, and the compiler checks the Device category, input/output buffer contracts, and exact speed ratio before producing a buffer-bound plan. Process content has its own catalog hash and therefore invalidates cached runs when changed.

## Blueprint

Blueprint coordinates and collisions are 2D. Rotations are `0`, `90`, `180`, or `270`. Connections run from an output port to an input port and explicitly select loader, line, and unloader Device assets.

```json
{
  "version": 1,
  "bounds": { "width": 32, "height": 32 },
  "devices": [
    {
      "id": "ore-source-1",
      "asset": "ore-source",
      "position": { "x": 2, "y": 10 },
      "rotation": 0
    },
    {
      "id": "smelter-1",
      "asset": "smelter",
      "position": { "x": 10, "y": 10 },
      "rotation": 0,
      "process": "smelt-iron"
    }
  ],
  "connections": [
    {
      "id": "ore-to-smelter",
      "from": { "device": "ore-source-1", "port": "output" },
      "to": { "device": "smelter-1", "port": "input" },
      "logistics": {
        "loader": { "deviceAsset": "sorter" },
        "line": { "deviceAsset": "conveyor" },
        "unloader": { "deviceAsset": "sorter" }
      }
    }
  ],
  "policies": { "dispatch": "round-robin" }
}
```

`process` is engine-visible industrial semantics. `config` remains optional device-owned data for specialized machines and is passed to that asset's `validateConfig()` hook.

A transport Device declares the stages it can fill, for example `"logistics": { "roles": ["loader", "unloader"] }` for a sorter and `"roles": ["line"]` for a belt. Each stage contributes its own capacity, duration, and build cost. Static analysis reports the resulting end-to-end items/min and complete stage chain.

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
  "name": "Maximize Gear Throughput",
  "targetResource": "gear",
  "constraints": { "maxBuildCost": 10000, "maxOccupiedArea": 36, "minProduction": 5 },
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

The complete executable format is demonstrated in [`examples/ironworks`](../examples/ironworks).
