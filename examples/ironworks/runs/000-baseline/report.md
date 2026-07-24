# INM Run 000-baseline

- Decision: **BASELINE**
- Blueprint: `main`
- Score: **9.968**
- Result hash: `d3659d06256b954395a6795ef8121ab1094789dd1e525ec69e854f6817896cf3`
- Bottleneck: smelter-1
- Throughput/min: 4.500
- Delivery portfolio: 37.5% demand attainment · 9.000 / 24.000 valued / demanded · 0.000 above demand · 0.000 net value/min
  - Contract `primary`: 9.000 / 24.000 `gear` · 37.5% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean / 0.000 s maximum delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 37.5% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 5.382 average scored WIP / 53.680 total inventory · 9.000 peak WIP / 64.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 12.000 gear/min
- Capacity delivery targets: 12.000 gear/min
- Power allocation: proportional
- Minimum grid satisfaction: 77.6699%
- Capacity plan: 3 GAPS
- Belt utilization: 1.6%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 1088.696 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **reserve** `iron-ore`: iron-ore Scenario supply is short by 6.000 items after 0.000 scheduled external supply
- **power** `forge-zone`: forge-zone needs 422.000 W additional rated generation

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 30.000 / 80.000 | 37.5% | 0 | 60 iron-ore |
| coal-assembly-to-splitter | 15.000 / 240.000 | 6.3% | 0 | 30 coal |
| plate-to-station | 12.500 / 240.000 | 5.2% | 0 | 25 iron-plate |
| station-to-assembler | 9.000 / 240.000 | 3.8% | 0 | 18 iron-plate |
| coal-splitter-to-assembler | 8.500 / 240.000 | 3.5% | 0 | 17 coal |
| gear-to-output | 4.500 / 240.000 | 1.9% | 0 | 9 gear |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Grid storage

| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |
| --- | ---: | ---: | ---: | ---: |
| grid-forge-zone-generator-1 | 0.000 | 0.582 / 3.600 | 2.718 | 2.136 |

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| station-demand | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| station-supply | 0.000 | 10.895 / 12.000 | 300.000 | 22.195 | 11.300 |

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| iron-plate | WIP | 5.382 | 9.000 | 7.000 |
| coal | excluded | 35.331 | 40.000 | 39.000 |
| iron-ore | excluded | 12.892 | 16.000 | 16.000 |
| gear | excluded | 0.075 | 1.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

## Score breakdown

```json
{
  "blocked": -2.0474833333333335,
  "buildCost": -12.72,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -2.27679672,
  "occupiedArea": -21.200000000000003,
  "onTimeDelivery": 3.75,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 45,
  "wip": -0.5382141666666667
}
```
