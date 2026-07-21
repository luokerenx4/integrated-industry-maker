# INM Run 001-keep-switch-assembler-1-from-recipe-assemb

- Decision: **KEEP**
- Score: **44.558**
- Result hash: `3cd157d59b929d5759a17da9bb91a0c65aae88570d92b71175798591782aacca`
- Bottleneck: smelter-1
- Throughput/min: 8.000
- Target rate: 12.000 gear/min (66.7% attained)
- Capacity plan: 2 GAPS
- Belt utilization: 2.1%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 191.500 J
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **power** `forge-world`: forge-world needs 122.000 W additional generation

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
  "onTimeDelivery": 6.666666666666666,
  "throughput": 80,
  "wip": -5.296433333333334
}
```
