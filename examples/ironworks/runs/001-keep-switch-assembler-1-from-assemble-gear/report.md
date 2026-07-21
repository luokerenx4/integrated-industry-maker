# INM Run 001-keep-switch-assembler-1-from-assemble-gear

- Decision: **KEEP**
- Score: **43.831**
- Result hash: `0cae290bd69bdfd911953d8f05b7a6045a0dfe419411fedebedd544d647660a9`
- Bottleneck: smelter-1
- Throughput/min: 8.000
- Target rate: 12.000 gear/min (66.7% attained)
- Capacity plan: 2 GAPS
- Belt utilization: 2.0%
- Average blocked belt items: 0.000
- Peak belt items: 3
- Powered transport energy: 273.200 J
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **power** `forge-world`: forge-world needs 122.000 W additional generation

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.000 / 80.000 | 41.3% | 0 | 66 iron-ore |
| coal-assembly-to-splitter | 18.500 / 240.000 | 7.7% | 0 | 37 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| coal-splitter-to-assembler | 12.000 / 240.000 | 5.0% | 0 | 24 coal |
| station-to-assembler | 12.000 / 240.000 | 5.0% | 0 | 24 iron-plate |
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
  "blocked": -1.599,
  "buildCost": -12.76,
  "constraintPenalty": 0,
  "energy": -2.050542,
  "occupiedArea": -21.200000000000003,
  "onTimeDelivery": 6.666666666666666,
  "throughput": 80,
  "wip": -5.226216666666667
}
```
