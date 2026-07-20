# INM project format

## Layout

```text
factory/
  inm.json
  materials/<id>.json
  devices/<id>.json
  recipes/<id>.json
  blueprints/<id>.blueprint.json
  scenarios/<id>.scenario.json
  objectives/<id>.objective.json
  tests/<name>.fixture.json
  runs/<sequence>-<label>/
  .inm/cache/
```

Identifiers use lowercase kebab-case. Source definitions are strict: unknown properties are errors rather than silently ignored typos.

## Manifest

```json
{
  "version": 1,
  "name": "My Factory",
  "defaultBlueprint": "main",
  "defaultScenario": "baseline",
  "defaultObjective": "default"
}
```

## Material

A Material flows and never occupies a fixed blueprint footprint. `visual` is optional and has no logical meaning.

```json
{
  "type": "material",
  "id": "iron-ore",
  "name": "Iron Ore",
  "visual": { "shape": "sphere", "color": "#75665b" },
  "properties": { "stackSize": 100 }
}
```

## Device

A Device has a 2D footprint, typed ports, exactly one behavior, optional power/cost metadata, and optional visuals. Supported behaviors are `source`, `sink`, `processor`, `storage`, `transport`, and `power`.

```json
{
  "type": "device",
  "id": "smelter",
  "name": "Smelter",
  "geometry": {
    "footprint": { "width": 2, "height": 2 },
    "rotatable": true,
    "ports": [
      { "id": "input", "direction": "input", "kind": "material", "side": "west", "offset": 0 },
      { "id": "output", "direction": "output", "kind": "material", "side": "east", "offset": 0 }
    ]
  },
  "behavior": {
    "kind": "processor",
    "supportedRecipes": ["iron-plate"],
    "inputCapacity": 8,
    "outputCapacity": 8
  },
  "simulation": { "powerConsumptionMilliWatts": 180000 },
  "economics": { "buildCost": 1200 },
  "visual": { "shape": "box", "height": 1.8, "color": "#e26437", "label": "S" }
}
```

## Recipe

```json
{
  "id": "iron-plate",
  "name": "Smelt Iron Plate",
  "durationTicks": 4000,
  "inputs": [{ "material": "iron-ore", "count": 2 }],
  "outputs": [{ "material": "iron-plate", "count": 1 }]
}
```

## Blueprint

Blueprint coordinates and collisions are 2D. Rotations are `0`, `90`, `180`, or `270`. Connections must run from an output port to a compatible input port and reference a Device asset with `transport` behavior.

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
      "config": { "recipe": "iron-plate" }
    }
  ],
  "connections": [],
  "policies": { "dispatch": "round-robin" }
}
```

## Scenario and objective

```json
{
  "id": "baseline",
  "name": "Baseline Production",
  "durationTicks": 120000,
  "initialInventories": {},
  "failures": [{ "device": "smelter-1", "atTick": 40000, "durationTicks": 15000 }]
}
```

```json
{
  "id": "default",
  "name": "Maximize Gear Throughput",
  "targetMaterial": "gear",
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

The complete, executable format is demonstrated in [`examples/ironworks`](../examples/ironworks).
