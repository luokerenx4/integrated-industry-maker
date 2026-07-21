# INM Run 001-keep-switch-assembler-1-from-recipe-assemb

- Decision: **KEEP**
- Score: **47.891**
- Result hash: `d7e5937f70a2f1b19400605dbbd529cc651b3fb414e149acf08ce0ccc921e76d`
- Bottleneck: smelter-1
- Throughput/min: 8.000
- Belt utilization: 2.1%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 191.500 J
- Feasible: yes

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.500 / 240.000 | 14.0% | 0 | 67 iron-ore |
| coal-assembly-to-splitter | 14.500 / 240.000 | 6.0% | 0 | 29 coal |
| plate-to-station | 14.500 / 240.000 | 6.0% | 0 | 29 iron-plate |
| station-to-assembler | 12.000 / 240.000 | 5.0% | 0 | 24 iron-plate |
| coal-splitter-to-assembler | 8.000 / 240.000 | 3.3% | 0 | 16 coal |
| gear-to-output | 8.000 / 240.000 | 3.3% | 0 | 16 gear |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Score breakdown

```json
{
  "blocked": -2.1333333333333333,
  "buildCost": -11.83,
  "constraintPenalty": 0,
  "energy": -2.048915,
  "occupiedArea": -20.8,
  "onTimeDelivery": 10,
  "throughput": 80,
  "wip": -5.296433333333334
}
```
