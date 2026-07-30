# INM Run 003-keep-duplicate-processor-smelter-1-as-smel

- Decision: **KEEP**
- Blueprint: `main`
- Score: **90.275**
- Result hash: `0df9791c84b2475fa05e452eb051e167bdb28a164fc17e42769b88277a5e4c94`
- Bottleneck: smelter-1
- Throughput/min: 13.000
- Delivery portfolio: 108.3% demand attainment · 26.000 / 24.000 valued / demanded · 2.000 above demand · 0.000 net value/min
  - Contract `primary`: 26.000 / 24.000 `gear` · 108.3% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean / 0.000 s maximum delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 108.3% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 12.174 average scored WIP / 55.254 total inventory · 20.000 peak WIP / 71.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 12.000 gear/min
- Capacity delivery targets: 12.000 gear/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 3.0%
- Average blocked belt items: 0.000
- Peak belt items: 7
- Powered transport energy: 1720.500 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ore-to-smelter | 45.000 / 80.000 | 56.3% | 0 | 0 | 0 | 0 | 0 | 90 iron-ore |
| ore-to-smelter-smelter-1-split-original | 22.500 / 80.000 | 28.1% | 0 | 0 | 0 | 0 | 0 | 45 iron-ore |
| ore-to-smelter-smelter-1-split-parallel | 22.500 / 80.000 | 28.1% | 0 | 0 | 0 | 0 | 0 | 45 iron-ore |
| station-to-assembler | 19.500 / 240.000 | 8.1% | 0 | 0 | 0 | 0 | 0 | 39 iron-plate |
| coal-assembly-to-splitter | 17.000 / 240.000 | 7.1% | 0 | 0 | 0 | 0 | 0 | 34 coal |
| gear-to-output | 13.000 / 240.000 | 5.4% | 0 | 0 | 0 | 0 | 0 | 26 gear |
| plate-to-station | 11.000 / 240.000 | 4.6% | 0 | 0 | 0 | 0 | 0 | 22 iron-plate |
| plate-to-station-smelter-1-parallel | 11.000 / 240.000 | 4.6% | 0 | 0 | 0 | 0 | 0 | 22 iron-plate |
| coal-splitter-to-assembler | 10.500 / 240.000 | 4.4% | 0 | 0 | 0 | 0 | 0 | 21 coal |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 0 | 0 | 0 | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 0 | 0 | 0 | 0 | 5 coal |

## Grid storage

| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |
| --- | ---: | ---: | ---: | ---: |
| grid-forge-zone-generator-1 | 0.000 | 3.600 / 3.600 | 3.600 | 0.000 |

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| station-demand | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| station-supply | 0.000 | 12.000 / 12.000 | 300.000 | 23.300 | 11.300 |

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| iron-plate | WIP | 12.174 | 20.000 | 5.000 |
| coal | excluded | 35.728 | 41.000 | 37.000 |
| iron-ore | excluded | 7.108 | 10.000 | 2.000 |
| gear | excluded | 0.244 | 2.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Average inventory | Peak inventory | Final inventory |
| --- | --- | --- | --- | ---: | ---: | ---: |
| station-transit:inter-zone-main:inter-zone-main%3Airon-plate%3Astation-supply-%3Estation-demand:iron-plate | iron-plate | station-transit | inter-zone-main.inter-zone-main:iron-plate:station-supply->station-demand | 4.271 | 12.000 | 5.000 |
| buffer:station-supply:storage:iron-plate | iron-plate | buffer | station-supply.storage | 4.088 | 12.000 | 0.000 |
| buffer:assembler-1:input-primary:iron-plate | iron-plate | buffer | assembler-1.input-primary | 1.480 | 8.000 | 0.000 |
| in-process:assembler-1:forge-gear-pair:iron-plate | iron-plate | in-process | assembler-1.forge-gear-pair | 1.300 | 3.000 | 0.000 |
| buffer:station-demand:storage:iron-plate | iron-plate | buffer | station-demand.storage | 0.482 | 11.000 | 0.000 |
| local-transit:station-to-assembler:belt:iron-plate | iron-plate | local-transit | station-to-assembler.belt | 0.098 | 2.000 | 0.000 |
| local-transit:station-to-assembler:loading:iron-plate | iron-plate | local-transit | station-to-assembler.loading | 0.081 | 1.000 | 0.000 |
| local-transit:station-to-assembler:unloading:iron-plate | iron-plate | local-transit | station-to-assembler.unloading | 0.081 | 1.000 | 0.000 |
| local-transit:plate-to-station-smelter-1-parallel:belt:iron-plate | iron-plate | local-transit | plate-to-station-smelter-1-parallel.belt | 0.055 | 1.000 | 0.000 |
| local-transit:plate-to-station:belt:iron-plate | iron-plate | local-transit | plate-to-station.belt | 0.055 | 1.000 | 0.000 |
| local-transit:plate-to-station-smelter-1-parallel:loading:iron-plate | iron-plate | local-transit | plate-to-station-smelter-1-parallel.loading | 0.046 | 1.000 | 0.000 |
| local-transit:plate-to-station-smelter-1-parallel:unloading:iron-plate | iron-plate | local-transit | plate-to-station-smelter-1-parallel.unloading | 0.046 | 1.000 | 0.000 |
| local-transit:plate-to-station:loading:iron-plate | iron-plate | local-transit | plate-to-station.loading | 0.046 | 1.000 | 0.000 |
| local-transit:plate-to-station:unloading:iron-plate | iron-plate | local-transit | plate-to-station.unloading | 0.046 | 1.000 | 0.000 |

Location averages and final quantities conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Score breakdown

```json
{
  "blocked": -1.0946666666666667,
  "buildCost": -14.625,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -2.621512,
  "occupiedArea": -31,
  "onTimeDelivery": 10.833333333333332,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 130,
  "wip": -1.2174333333333334
}
```
