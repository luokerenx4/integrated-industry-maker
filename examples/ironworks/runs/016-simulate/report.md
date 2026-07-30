# INM Run 004-simulate

- Decision: **BASELINE**
- Blueprint: `synthesized`
- Score: **59.271**
- Result hash: `cf49e15489dc16f5da3e2c48ec14dff4eb141a0f00ce0bc45c8e9f82211764a2`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 12.000
- Delivery portfolio: 100.0% demand attainment · 24.000 / 24.000 valued / demanded · 0.000 above demand · 0.000 net value/min
  - Contract `primary`: 24.000 / 24.000 `gear` · 100.0% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean / 0.000 s maximum delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 100.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 8.579 average scored WIP / 79.113 total inventory · 16.000 peak WIP / 98.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 12.000 gear/min
- Capacity delivery targets: 12.000 gear/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.8%
- Average blocked belt items: 0.080
- Peak belt items: 15
- Powered transport energy: 1698.000 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: 20 coal@2 + 20 iron-plate@2
- Treatment agents consumed: 10 proliferator
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-smelt-iron-1 | 33.000 / 240.000 | 13.8% | 0 | 0 | 0 | 0 | 0 | 66 iron-ore |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 12.000 / 120.000 | 10.0% | 9600 | 3000 | 6600 | 0 | 0 | 24 gear |
| synth-coal-synth-coal-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 10.500 / 120.000 | 8.8% | 0 | 0 | 0 | 0 | 0 | 21 coal |
| synth-coal-synth-coal-extractor-1-to-synth-coal-split | 20.000 / 240.000 | 8.3% | 0 | 0 | 0 | 0 | 0 | 40 coal |
| synth-proliferator-synth-make-proliferator-1-to-synth-proliferator-split | 17.000 / 240.000 | 7.1% | 0 | 0 | 0 | 0 | 0 | 34 proliferator |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1 | 14.000 / 240.000 | 5.8% | 0 | 0 | 0 | 0 | 0 | 28 iron-plate |
| synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 11.000 / 240.000 | 4.6% | 0 | 0 | 0 | 0 | 0 | 22 iron-plate |
| synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 10.000 / 240.000 | 4.2% | 0 | 0 | 0 | 0 | 0 | 20 iron-plate |
| synth-coal-synth-coal-split-to-synth-make-proliferator-1 | 9.500 / 240.000 | 4.0% | 0 | 0 | 0 | 0 | 0 | 19 coal |
| synth-coal-synth-coal-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 7.000 / 240.000 | 2.9% | 0 | 0 | 0 | 0 | 0 | 14 coal |
| synth-proliferator-synth-proliferator-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 6.500 / 240.000 | 2.7% | 0 | 0 | 0 | 0 | 0 | 13 proliferator |
| synth-proliferator-synth-proliferator-split-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 6.500 / 240.000 | 2.7% | 0 | 0 | 0 | 0 | 0 | 13 proliferator |

## Grid storage

No configured accumulators.

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| synth-iron-plate-assembly-zone-station-demand-1 | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| synth-iron-plate-forge-zone-station-supply-1 | 0.000 | 10.330 / 12.000 | 300.000 | 21.830 | 11.500 |

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| iron-plate | WIP | 8.579 | 16.000 | 11.000 |
| proliferator | excluded | 33.236 | 40.000 | 38.000 |
| coal | excluded | 21.681 | 29.000 | 22.000 |
| iron-ore | excluded | 15.282 | 18.000 | 16.000 |
| gear | excluded | 0.335 | 4.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Average inventory | Peak inventory | Final inventory |
| --- | --- | --- | --- | ---: | ---: | ---: |
| buffer:synth-iron-plate-forge-zone-station-supply-1:storage:iron-plate | iron-plate | buffer | synth-iron-plate-forge-zone-station-supply-1.storage | 2.400 | 6.000 | 0.000 |
| station-transit:synth-iron-plate-forge-zone-to-assembly-zone-lane-1:synth-iron-plate-forge-zone-to-assembly-zone-lane-1%3Airon-plate%3Asynth-iron-plate-forge-zone-station-supply-1-%3Esynth-iron-plate-assembly-zone-station-demand-1:iron-plate | iron-plate | station-transit | synth-iron-plate-forge-zone-to-assembly-zone-lane-1.synth-iron-plate-forge-zone-to-assembly-zone-lane-1:iron-plate:synth-iron-plate-forge-zone-station-supply-1->synth-iron-plate-assembly-zone-station-demand-1 | 2.342 | 6.000 | 6.000 |
| buffer:synth-forge-gear-pair-1:input-primary:iron-plate | iron-plate | buffer | synth-forge-gear-pair-1.input-primary | 1.133 | 7.000 | 2.000 |
| buffer:synth-iron-plate-synth-forge-gear-pair-1-coater-1:material-input:iron-plate | iron-plate | buffer | synth-iron-plate-synth-forge-gear-pair-1-coater-1.material-input | 0.629 | 3.000 | 2.000 |
| in-process:synth-forge-gear-pair-1:forge-gear-pair:iron-plate | iron-plate | in-process | synth-forge-gear-pair-1.forge-gear-pair | 0.600 | 3.000 | 0.000 |
| local-transit:synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1:belt:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1.belt | 0.500 | 6.000 | 0.000 |
| local-transit:synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1:belt:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1.belt | 0.293 | 6.000 | 0.000 |
| local-transit:synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1:belt:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1.belt | 0.145 | 1.000 | 1.000 |
| buffer:synth-iron-plate-assembly-zone-station-demand-1:storage:iron-plate | iron-plate | buffer | synth-iron-plate-assembly-zone-station-demand-1.storage | 0.106 | 5.000 | 0.000 |
| buffer:synth-iron-plate-synth-forge-gear-pair-1-coater-1:material-output:iron-plate | iron-plate | buffer | synth-iron-plate-synth-forge-gear-pair-1-coater-1.material-output | 0.096 | 3.000 | 0.000 |
| local-transit:synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1:loading:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1.loading | 0.060 | 1.000 | 0.000 |
| local-transit:synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1:unloading:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1.unloading | 0.058 | 1.000 | 0.000 |
| local-transit:synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1:loading:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1.loading | 0.046 | 1.000 | 0.000 |
| local-transit:synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1:unloading:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1.unloading | 0.046 | 1.000 | 0.000 |
| in-process:synth-iron-plate-synth-forge-gear-pair-1-coater-1:mk2:iron-plate | iron-plate | in-process | synth-iron-plate-synth-forge-gear-pair-1-coater-1.mk2 | 0.042 | 4.000 | 0.000 |
| local-transit:synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1:loading:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1.loading | 0.042 | 1.000 | 0.000 |
| local-transit:synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1:unloading:iron-plate | iron-plate | local-transit | synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1.unloading | 0.042 | 1.000 | 0.000 |

Location averages and final quantities conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Score breakdown

```json
{
  "blocked": -2.305,
  "buildCost": -17.275,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -2.4908099999999997,
  "occupiedArea": -47.800000000000004,
  "onTimeDelivery": 10,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 120,
  "wip": -0.8579166666666668
}
```
