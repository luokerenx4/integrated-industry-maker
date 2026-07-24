# INM Run 006-simulate

- Decision: **BASELINE**
- Blueprint: `scaled-factory`
- Score: **129.731**
- Result hash: `db87314c10e4e6c35c16209a231e9e7d0bb1f6d474c0806a975af17894293a40`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 20.000
- Delivery portfolio: 83.3% demand attainment · 40.000 / 48.000 valued / demanded · 0.000 above demand · 0.000 net value/min
  - Contract `primary`: 40.000 / 48.000 `gear` · 83.3% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 83.3% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 16.224 average scored WIP / 92.742 total inventory · 26.000 peak WIP / 130.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 24.000 gear/min
- Capacity delivery targets: 24.000 gear/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 2.9%
- Average blocked belt items: 0.133
- Peak belt items: 16
- Powered transport energy: 2517.375 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: 32 coal@2 + 40 iron-plate@2
- Treatment agents consumed: 18 proliferator
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-iron-ore-split | 59.500 / 240.000 | 24.8% | 0 | 119 iron-ore |
| synth-coal-synth-coal-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 24.000 / 120.000 | 20.0% | 0 | 48 coal |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 20.000 / 120.000 | 16.7% | 16000 | 40 gear |
| synth-coal-synth-coal-extractor-1-to-synth-coal-split | 39.000 / 240.000 | 16.3% | 0 | 78 coal |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-1 | 29.500 / 240.000 | 12.3% | 0 | 59 iron-ore |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-2 | 29.500 / 240.000 | 12.3% | 0 | 59 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-forge-zone-station-supply-1 | 28.000 / 240.000 | 11.7% | 0 | 56 iron-plate |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 14.000 / 120.000 | 11.7% | 0 | 28 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 14.000 / 120.000 | 11.7% | 0 | 28 iron-plate |
| synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 21.500 / 240.000 | 9.0% | 0 | 43 iron-plate |
| synth-proliferator-synth-make-proliferator-1-to-synth-proliferator-split | 21.000 / 240.000 | 8.8% | 0 | 42 proliferator |
| synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 19.000 / 240.000 | 7.9% | 0 | 38 iron-plate |
| synth-coal-synth-coal-split-to-synth-make-proliferator-1 | 11.000 / 240.000 | 4.6% | 0 | 22 coal |
| synth-coal-synth-coal-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 9.500 / 240.000 | 4.0% | 0 | 19 coal |
| synth-proliferator-synth-proliferator-split-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 9.000 / 240.000 | 3.8% | 0 | 18 proliferator |
| synth-proliferator-synth-proliferator-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 8.000 / 240.000 | 3.3% | 0 | 16 proliferator |

## Grid storage

No configured accumulators.

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| synth-iron-plate-assembly-zone-station-demand-1 | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| synth-iron-plate-forge-zone-station-supply-1 | 0.000 | 9.961 / 12.000 | 300.000 | 21.161 | 11.200 |

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| iron-plate | WIP | 16.224 | 26.000 | 23.000 |
| coal | excluded | 39.997 | 63.000 | 61.000 |
| proliferator | excluded | 33.254 | 40.000 | 38.000 |
| iron-ore | excluded | 2.708 | 4.000 | 4.000 |
| gear | excluded | 0.558 | 4.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

## Score breakdown

```json
{
  "blocked": -3.2441666666666666,
  "buildCost": -18.685,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -2.85101315,
  "occupiedArea": -52.2,
  "onTimeDelivery": 8.333333333333334,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 200,
  "wip": -1.622375
}
```
