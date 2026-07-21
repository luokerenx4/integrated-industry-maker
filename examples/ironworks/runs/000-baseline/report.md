# INM Run 000-baseline

- Decision: **BASELINE**
- Blueprint: `main`
- Score: **5.138**
- Result hash: `e4cc6139913c81ab18f3b5d2e428ff63a2bd62f247b2430f702cf9b511eef4b7`
- Bottleneck: smelter-1
- Throughput/min: 4.500
- Tracked lots: 0 / 0 completed · 0 scrapped
- Lot service: 37.5% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Equipment setup: 0 changeovers · 0.000 s work
- Target rate: 12.000 gear/min (37.5% attained)
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
- **reserve** `iron-ore`: iron-ore reserve is short by 6.000 items over the scenario
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

## Score breakdown

```json
{
  "blocked": -2.0474833333333335,
  "buildCost": -12.72,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "energy": -2.27679672,
  "occupiedArea": -21.200000000000003,
  "onTimeDelivery": 3.75,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 45,
  "wip": -5.368016666666667
}
```
