# INM Run 002-keep-duplicate-processor-smelter-1-as-smel

- Decision: **KEEP**
- Score: **97.292**
- Result hash: `7be16ebc165e1db5da9a2b348fc959acd24b715f949919b5628ab9a02feffdff`
- Bottleneck: smelter-1
- Throughput/min: 14.000
- Target rate: 12.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 3.2%
- Average blocked belt items: 0.000
- Peak belt items: 7
- Powered transport energy: 561.000 J
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
| station-to-assembler | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| coal-assembly-to-splitter | 20.000 / 240.000 | 8.3% | 0 | 40 coal |
| coal-splitter-to-assembler | 17.500 / 240.000 | 7.3% | 0 | 35 coal |
| gear-to-output | 14.000 / 240.000 | 5.8% | 0 | 28 gear |
| plate-to-station | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| plate-to-station-smelter-1-parallel | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Grid storage

| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |
| --- | ---: | ---: | ---: | ---: |
| grid-forge-world-generator-1 | 0.000 | 3.600 / 3.600 | 3.600 | 0.000 |

## Score breakdown

```json
{
  "blocked": -0.44266666666666665,
  "buildCost": -14.745,
  "constraintPenalty": 0,
  "energy": -2.24461,
  "occupiedArea": -31,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -4.275916666666666
}
```
