# INM Run 001-keep-switch-assembler-1-from-assemble-gear

- Decision: **KEEP**
- Score: **43.475**
- Result hash: `ac5aa090c606bd4bc00597aa21bf818d5b6fa844d43e981c106f385e86d8a206`
- Bottleneck: smelter-1
- Throughput/min: 8.000
- Target rate: 12.000 gear/min (66.7% attained)
- Capacity plan: 2 GAPS
- Belt utilization: 2.3%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 207.500 J
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **power** `forge-world`: forge-world needs 122.000 W additional generation

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.500 / 240.000 | 14.0% | 0 | 67 iron-ore |
| coal-assembly-to-splitter | 18.500 / 240.000 | 7.7% | 0 | 37 coal |
| plate-to-station | 14.500 / 240.000 | 6.0% | 0 | 29 iron-plate |
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
  "blocked": -1.589,
  "buildCost": -12.73,
  "constraintPenalty": 0,
  "energy": -2.0505750000000003,
  "occupiedArea": -21.6,
  "onTimeDelivery": 6.666666666666666,
  "throughput": 80,
  "wip": -5.222216666666667
}
```
