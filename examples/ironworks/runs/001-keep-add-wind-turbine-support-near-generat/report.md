# INM Run 001-keep-add-wind-turbine-support-near-generat

- Decision: **KEEP**
- Blueprint: `main`
- Score: **8.707**
- Result hash: `ac7bbea1af7adad289d70400bc4b6499ac60950d1d179d5cc30eda3138f83095`
- Bottleneck: smelter-1
- Throughput/min: 5.000
- Delivery portfolio: 41.7% demand attainment · 10.000 / 24.000 valued / demanded · 0.000 above demand · 0.000 net value/min
  - Contract `primary`: 10.000 / 24.000 `gear` · 41.7% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 41.7% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Primary target rate: 12.000 gear/min
- Capacity delivery targets: 12.000 gear/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 2 GAPS
- Belt utilization: 1.8%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 1149.150 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **reserve** `iron-ore`: iron-ore Scenario supply is short by 6.000 items after 0.000 scheduled external supply

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.000 / 80.000 | 41.3% | 0 | 66 iron-ore |
| coal-assembly-to-splitter | 15.500 / 240.000 | 6.5% | 0 | 31 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| station-to-assembler | 10.500 / 240.000 | 4.4% | 0 | 21 iron-plate |
| coal-splitter-to-assembler | 9.000 / 240.000 | 3.8% | 0 | 18 coal |
| gear-to-output | 5.000 / 240.000 | 2.1% | 0 | 10 gear |
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

## Score breakdown

```json
{
  "blocked": -2.105,
  "buildCost": -13.42,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "energy": -2.4255675,
  "occupiedArea": -22,
  "onTimeDelivery": 4.166666666666667,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 50,
  "wip": -5.5094
}
```
