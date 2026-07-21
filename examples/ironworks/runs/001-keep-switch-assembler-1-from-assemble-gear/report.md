# INM Run 001-keep-switch-assembler-1-from-assemble-gear

- Decision: **KEEP**
- Score: **43.220**
- Result hash: `8eda28a6d568c0210ce0c7d1553090c3a9d5c53c5f8056e4d82e8772ab16524d`
- Bottleneck: smelter-1
- Throughput/min: 8.000
- Target rate: 12.000 gear/min (66.7% attained)
- Capacity plan: 2 GAPS
- Belt utilization: 1.8%
- Average blocked belt items: 0.000
- Peak belt items: 5
- Powered transport energy: 257.200 J
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **power** `forge-world`: forge-world needs 122.000 W additional rated generation

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
| grid-forge-world-generator-1 | 0.000 | 3.600 / 3.600 | 3.600 | 0.000 |

## Score breakdown

```json
{
  "blocked": -2.138333333333333,
  "buildCost": -12.76,
  "constraintPenalty": 0,
  "energy": -2.0488820000000003,
  "occupiedArea": -21.200000000000003,
  "onTimeDelivery": 6.666666666666666,
  "throughput": 80,
  "wip": -5.299183333333334
}
```
