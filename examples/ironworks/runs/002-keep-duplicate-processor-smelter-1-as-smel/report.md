# INM Run 002-keep-duplicate-processor-smelter-1-as-smel

- Decision: **KEEP**
- Score: **104.981**
- Result hash: `275fe2a165030e19f4085f1dfddb83f5fec648cdfbb78a3803728ca18635458c`
- Bottleneck: smelter-1
- Throughput/min: 14.000
- Belt utilization: 2.6%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 363.000 J
- Feasible: yes

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 45.000 / 240.000 | 18.8% | 0 | 90 iron-ore |
| ore-to-smelter-smelter-1-split-original | 22.500 / 240.000 | 9.4% | 0 | 45 iron-ore |
| ore-to-smelter-smelter-1-split-parallel | 22.500 / 240.000 | 9.4% | 0 | 45 iron-ore |
| station-to-assembler | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| coal-assembly-to-splitter | 17.500 / 240.000 | 7.3% | 0 | 35 coal |
| gear-to-output | 14.000 / 240.000 | 5.8% | 0 | 28 gear |
| coal-splitter-to-assembler | 11.000 / 240.000 | 4.6% | 0 | 22 coal |
| plate-to-station | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| plate-to-station-smelter-1-parallel | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Score breakdown

```json
{
  "blocked": -0.8606666666666667,
  "buildCost": -13.565,
  "constraintPenalty": 0,
  "energy": -2.24263,
  "occupiedArea": -23.8,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -4.550816666666667
}
```
