# INM Run 002-keep-switch-assembler-1-from-assemble-gear

- Decision: **KEEP**
- Blueprint: `main`
- Score: **35.231**
- Result hash: `33a992621255d4b62b00af63a96f460ee3dadf7becf83bc4503e93a3687a922f`
- Bottleneck: smelter-1
- Throughput/min: 7.000
- Delivery portfolio: 58.3% demand attainment · 14.000 / 24.000 valued / demanded · 0.000 above demand · 0.000 net value/min
  - Contract `primary`: 14.000 / 24.000 `gear` · 58.3% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean / 0.000 s maximum delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 58.3% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 6.079 average scored WIP / 57.220 total inventory · 10.000 peak WIP / 69.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 12.000 gear/min
- Capacity delivery targets: 12.000 gear/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 1 GAP
- Belt utilization: 1.7%
- Average blocked belt items: 0.000
- Peak belt items: 3
- Powered transport energy: 1147.650 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1

## Measured transport flows

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.000 / 80.000 | 41.3% | 0 | 0 | 0 | 0 | 0 | 66 iron-ore |
| coal-assembly-to-splitter | 14.000 / 240.000 | 5.8% | 0 | 0 | 0 | 0 | 0 | 28 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 0 | 0 | 0 | 0 | 28 iron-plate |
| station-to-assembler | 10.500 / 240.000 | 4.4% | 0 | 0 | 0 | 0 | 0 | 21 iron-plate |
| coal-splitter-to-assembler | 7.500 / 240.000 | 3.1% | 0 | 0 | 0 | 0 | 0 | 15 coal |
| gear-to-output | 7.000 / 240.000 | 2.9% | 0 | 0 | 0 | 0 | 0 | 14 gear |
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
| iron-plate | WIP | 6.079 | 10.000 | 8.000 |
| coal | excluded | 35.717 | 41.000 | 39.000 |
| iron-ore | excluded | 15.293 | 18.000 | 16.000 |
| gear | excluded | 0.131 | 2.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Average inventory | Peak inventory | Final inventory |
| --- | --- | --- | --- | ---: | ---: | ---: |
| station-transit:inter-zone-main:inter-zone-main%3Airon-plate%3Astation-supply-%3Estation-demand:iron-plate | iron-plate | station-transit | inter-zone-main.inter-zone-main:iron-plate:station-supply->station-demand | 2.486 | 6.000 | 6.000 |
| buffer:station-supply:storage:iron-plate | iron-plate | buffer | station-supply.storage | 2.172 | 6.000 | 1.000 |
| in-process:assembler-1:forge-gear-pair:iron-plate | iron-plate | in-process | assembler-1.forge-gear-pair | 0.700 | 3.000 | 0.000 |
| buffer:assembler-1:input-primary:iron-plate | iron-plate | buffer | assembler-1.input-primary | 0.287 | 3.000 | 0.000 |
| buffer:station-demand:storage:iron-plate | iron-plate | buffer | station-demand.storage | 0.100 | 5.000 | 0.000 |
| local-transit:plate-to-station:belt:iron-plate | iron-plate | local-transit | plate-to-station.belt | 0.072 | 1.000 | 0.000 |
| local-transit:plate-to-station:loading:iron-plate | iron-plate | local-transit | plate-to-station.loading | 0.060 | 1.000 | 0.000 |
| local-transit:plate-to-station:unloading:iron-plate | iron-plate | local-transit | plate-to-station.unloading | 0.060 | 1.000 | 1.000 |
| local-transit:station-to-assembler:belt:iron-plate | iron-plate | local-transit | station-to-assembler.belt | 0.052 | 2.000 | 0.000 |
| local-transit:station-to-assembler:loading:iron-plate | iron-plate | local-transit | station-to-assembler.loading | 0.044 | 1.000 | 0.000 |
| local-transit:station-to-assembler:unloading:iron-plate | iron-plate | local-transit | station-to-assembler.unloading | 0.044 | 1.000 | 0.000 |

Location averages and final quantities conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Score breakdown

```json
{
  "blocked": -2.155,
  "buildCost": -13.42,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -2.4199825,
  "occupiedArea": -22,
  "onTimeDelivery": 5.833333333333334,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 70,
  "wip": -0.60785
}
```
