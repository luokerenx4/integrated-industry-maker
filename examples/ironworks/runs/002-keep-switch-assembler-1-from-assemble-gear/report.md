# INM Run 002-keep-switch-assembler-1-from-assemble-gear

- Decision: **KEEP**
- Score: **41.290**
- Result hash: `3b5dc5bee1d109a6e9d67824dc05deffbc2e0fd7fc9b922771a7cbeffc41ef11`
- Bottleneck: smelter-1
- Throughput/min: 8.000
- Target rate: 12.000 gear/min (66.7% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 1 GAP
- Belt utilization: 1.8%
- Average blocked belt items: 0.000
- Peak belt items: 5
- Powered transport energy: 1152.900 J
- High-speed carrier missions: 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.000 / 80.000 | 41.3% | 0 | 66 iron-ore |
| coal-assembly-to-splitter | 14.500 / 240.000 | 6.0% | 0 | 29 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| station-to-assembler | 12.000 / 240.000 | 5.0% | 0 | 24 iron-plate |
| coal-splitter-to-assembler | 8.000 / 240.000 | 3.3% | 0 | 16 coal |
| gear-to-output | 8.000 / 240.000 | 3.3% | 0 | 16 gear |
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
| station-supply | 0.000 | 12.000 / 12.000 | 300.000 | 32.340 | 20.340 |

## Score breakdown

```json
{
  "blocked": -2.138333333333333,
  "buildCost": -13.42,
  "constraintPenalty": 0,
  "energy": -2.5192240000000004,
  "occupiedArea": -22,
  "onTimeDelivery": 6.666666666666666,
  "throughput": 80,
  "wip": -5.299183333333334
}
```
