# Fab facility utilities

Status: project-local, spatial, finite shared facility capacity with atomic full-job reservation, failure release, metrics, CLI, Studio, and DRAM benchmark coverage implemented in `inm-sim/0.63.0`.

Semiconductor equipment does not run on material flow and electricity alone. Vacuum headers, abatement and exhaust systems, process-gas infrastructure, ultrapure water, cooling water, and clean dry air are shared factory systems. Treating them as belt Resources invents inventory and transport behavior they do not have; hiding them in machine speed removes the capital and layout decision.

A Process therefore owns optional named capacity demands:

```json
"utilities": [
  { "utility": "high-vacuum", "units": 2 },
  { "utility": "hazardous-exhaust", "units": 1 }
]
```

A project-local Device asset with capability `utility` contributes finite placed capacity:

```json
"utilityProvider": {
  "serviceRadius": 35,
  "capacities": [
    { "utility": "high-vacuum", "units": 6 },
    { "utility": "hazardous-exhaust", "units": 2 }
  ]
}
```

Compilation rejects duplicate capacity names and any Process demand without a same-region, in-range provider capable of satisfying that complete individual demand. At runtime the scheduler selects providers for every demanded service before it consumes material. Acquisition is all-or-nothing: a job cannot hold vacuum while waiting for exhaust. Reservations survive client power pauses because the physical job remains in the chamber. Normal completion releases them; equipment breakdown cancels the process and releases utility capacity immediately. This deliberately differs from a reusable reticle trapped in failed equipment until recovery.

Every placed provider is an ordinary Blueprint Device. Its footprint, build cost, connected idle power and service reach make facility count and placement optimizable code. The evaluator reports allocations, completed and cancelled jobs, job-time, capacity-unit time, waits, blocks, per-utility use, provider reservation and peak reservation. Coding Agents can therefore compare adding process tools with adding the facility infrastructure required to use them.

The memory-fab project uses `high-vacuum` for lithography, plasma etch, and ALD, and `hazardous-exhaust` for etch and ALD. Its baseline buys one shared utility plant. The kept specialized Blueprint buys a second plant because dedicated layer-2 tools otherwise move the bottleneck from equipment to fab facilities; the locked benchmark decides whether that capital expansion is worthwhile.

The current utility unit is a project-defined integer capacity slot, not a claim to represent physical pressure, flow, purity, or redundancy. Later project-local models can introduce differentiated headers, load-dependent provider power, storage/ride-through, and provider-failure propagation without converting utilities into material inventories.
