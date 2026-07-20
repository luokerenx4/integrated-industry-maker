# INM project and asset format

## Project layout

```text
factory/
  inm.json
  assets/
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
  blueprints/<id>.blueprint.json
  scenarios/<id>.scenario.json
  objectives/<id>.objective.json
  tests/<name>.fixture.json
  runs/<sequence>-<label>/
  .inm/cache/
```

Resources and devices are the two asset classes. Every concrete asset is a self-contained directory package. Its directory name must equal its asset id, `asset.json` is the stable index, and every referenced path must remain inside that directory. Fields are strict: unknown properties are errors.

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

A Resource asset describes a kind of flow. Runtime quantities are `(resource id, integer count)` values held in named device buffers or in transit. `unit.kind: continuous` and non-zero precision reserve the file contract for continuous resources; engine 0.2 executes integer quantities only.

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
  "runtime": { "apiVersion": 1, "entry": "runtime.ts" },
  "power": { "consumptionMilliWatts": 180000, "productionMilliWatts": 0 },
  "economics": { "buildCost": 1200 },
  "files": { "visual": "visual.json" }
}
```

Unlike the old single-behavior model, a Device declares a list of descriptive capabilities and any number of ports and buffers. Capabilities are semantic hints for inspection, evaluation, and optimization; they do not implement throughput. The device's TypeScript program does.

Each port binds to exactly one named buffer. Input ports cannot bind to output-only buffers, output ports cannot bind to input-only buffers, and buffer resource contracts are compiler-checked. An `internal` buffer may be bound to both directions, which is useful for storage and cross-docking devices.

## Device TypeScript program

Every Device package has a TypeScript entry conforming to `DeviceProgram`:

```ts
import type { DeviceProgram } from "@inm/core";

export default {
  apiVersion: 1,

  validateConfig(config) {
    return config.operation === "iron-plate"
      ? []
      : ["operation must be 'iron-plate'"];
  },

  evaluate(context) {
    if ((context.buffers.input?.["iron-ore"] ?? 0) < 2) {
      return { kind: "wait", reason: "input" };
    }
    return {
      kind: "start",
      operation: "iron-plate",
      durationTicks: 4000,
      consume: [{ buffer: "input", resource: "iron-ore", count: 2 }],
      produce: [{ buffer: "output", resource: "iron-plate", count: 1 }]
    };
  }
} satisfies DeviceProgram;
```

The program is a black box behind one host interface:

- `validateConfig(config)` optionally owns device-specific configuration rules.
- `evaluate(context)` receives only the current tick, instance identity/config, and a frozen snapshot of that device's buffers.
- `planTransport(context)` is required for assets declaring `transport`; it returns capacity and transit duration for a compiled connection.
- A program returns declarative actions. It never receives the mutable global factory state.

Supported decisions are `start`, `consume`, `wait`, and `none`. A `start` action may consume from and produce into any number of named buffers, so multi-input/multi-output equipment does not need a standardized internal recipe representation. The host validates every buffer, resource, count, capacity, duration, and power request before mutating state.

Programs must be synchronous and deterministic. They are local trusted project code—not a security sandbox—and therefore should not use clocks, network calls, ambient process state, or unseeded randomness. Repeated simulations and immutable run hashes detect nondeterministic results.

## Blueprint

Blueprint coordinates and collisions are 2D. Rotations are `0`, `90`, `180`, or `270`. Connections run from an output port to an input port and reference a transport-capable Device asset.

```json
{
  "version": 1,
  "bounds": { "width": 32, "height": 32 },
  "devices": [
    {
      "id": "smelter-1",
      "asset": "smelter",
      "position": { "x": 10, "y": 10 },
      "rotation": 0,
      "config": { "operation": "iron-plate" }
    }
  ],
  "connections": [],
  "policies": { "dispatch": "round-robin" }
}
```

`config` is intentionally device-owned data. The compiler passes it to that asset's `validateConfig()` hook.

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
