# INM Run 003-keep-duplicate-processor-smelter-1-as-smel

- Decision: **KEEP**
- Blueprint: `main`
- Score: **90.405**
- Result hash: `061adfbce97d30a8498c25e6361b1c12b709d55f3f364001ce726858e2edfad0`
- Bottleneck: smelter-1
- Throughput/min: 13.000
- Delivery portfolio: 108.3% demand attainment · 26.000 / 24.000 valued / demanded · 2.000 above demand · 0.000 net value/min
  - Contract `primary`: 26.000 / 24.000 `gear` · 108.3% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 108.3% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 10.874 average scored WIP / 50.588 total inventory · 18.000 peak WIP / 64.000 peak total
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

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 45.000 / 80.000 | 56.3% | 0 | 90 iron-ore |
| ore-to-smelter-smelter-1-split-original | 22.500 / 80.000 | 28.1% | 0 | 45 iron-ore |
| ore-to-smelter-smelter-1-split-parallel | 22.500 / 80.000 | 28.1% | 0 | 45 iron-ore |
| station-to-assembler | 19.500 / 240.000 | 8.1% | 0 | 39 iron-plate |
| coal-assembly-to-splitter | 17.000 / 240.000 | 7.1% | 0 | 34 coal |
| gear-to-output | 13.000 / 240.000 | 5.4% | 0 | 26 gear |
| plate-to-station | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| plate-to-station-smelter-1-parallel | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| coal-splitter-to-assembler | 10.500 / 240.000 | 4.4% | 0 | 21 coal |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

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
| iron-plate | WIP | 10.874 | 18.000 | 5.000 |
| coal | excluded | 35.295 | 40.000 | 37.000 |
| iron-ore | excluded | 4.175 | 6.000 | 2.000 |
| gear | excluded | 0.244 | 2.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

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
  "wip": -1.0874333333333333
}
```
