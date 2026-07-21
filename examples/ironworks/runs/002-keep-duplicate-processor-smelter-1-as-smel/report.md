# INM Run 002-keep-duplicate-processor-smelter-1-as-smel

- Decision: **KEEP**
- Score: **98.455**
- Result hash: `a546180467cdd4cd7d97b74108d1d0b952cc2ae4771557a932e8ee4d1dc51182`
- Bottleneck: smelter-1
- Throughput/min: 14.000
- Target rate: 12.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 2.3%
- Average blocked belt items: 0.000
- Peak belt items: 7
- Powered transport energy: 381.000 J
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 45.000 / 240.000 | 18.8% | 0 | 90 iron-ore |
| ore-to-smelter-smelter-1-split-original | 22.500 / 240.000 | 9.4% | 0 | 45 iron-ore |
| ore-to-smelter-smelter-1-split-parallel | 22.500 / 240.000 | 9.4% | 0 | 45 iron-ore |
| station-to-assembler | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| coal-assembly-to-splitter | 20.000 / 240.000 | 8.3% | 0 | 40 coal |
| coal-splitter-to-assembler | 17.500 / 240.000 | 7.3% | 0 | 35 coal |
| gear-to-output | 14.000 / 240.000 | 5.8% | 0 | 28 gear |
| plate-to-station | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| plate-to-station-smelter-1-parallel | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Score breakdown

```json
{
  "blocked": -0.426,
  "buildCost": -13.745,
  "constraintPenalty": 0,
  "energy": -2.24281,
  "occupiedArea": -31,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -4.131316666666667
}
```
