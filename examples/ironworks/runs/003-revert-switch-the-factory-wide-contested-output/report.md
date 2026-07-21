# INM Run 003-revert-switch-the-factory-wide-contested-output

- Decision: **REVERT**
- Score: **96.482**
- Result hash: `bde3d8b3070f8f6be5089dd015e480eaec0e1cc23e860027625b530981994602`
- Bottleneck: smelter-1
- Throughput/min: 14.000
- Target rate: 12.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 3.1%
- Average blocked belt items: 0.000
- Peak belt items: 6
- Powered transport energy: 1727.250 J
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
| station-to-assembler | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| coal-assembly-to-splitter | 17.500 / 240.000 | 7.3% | 0 | 35 coal |
| gear-to-output | 14.000 / 240.000 | 5.8% | 0 | 28 gear |
| coal-splitter-to-assembler | 11.000 / 240.000 | 4.6% | 0 | 22 coal |
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
  "blocked": -0.894,
  "buildCost": -14.625,
  "constraintPenalty": 0,
  "energy": -2.2768924999999998,
  "occupiedArea": -31,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -4.72245
}
```
