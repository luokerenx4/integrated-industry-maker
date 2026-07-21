# INM Run 000-baseline

- Decision: **BASELINE**
- Score: **22.991**
- Result hash: `5e7eec423ab4b35167f7f2ac465cc286aadbaad263ed8d153a5679ead365fb16`
- Bottleneck: smelter-1
- Throughput/min: 6.000
- Target rate: 12.000 gear/min (50.0% attained)
- Capacity plan: 3 GAPS
- Belt utilization: 2.1%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 195.500 J
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **reserve** `iron-ore`: iron-ore reserve is short by 6.000 items over the scenario
- **power** `forge-world`: forge-world needs 122.000 W additional generation

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.500 / 240.000 | 14.0% | 0 | 67 iron-ore |
| coal-assembly-to-splitter | 16.500 / 240.000 | 6.9% | 0 | 33 coal |
| plate-to-station | 14.500 / 240.000 | 6.0% | 0 | 29 iron-plate |
| station-to-assembler | 12.000 / 240.000 | 5.0% | 0 | 24 iron-plate |
| coal-splitter-to-assembler | 10.000 / 240.000 | 4.2% | 0 | 20 coal |
| gear-to-output | 6.000 / 240.000 | 2.5% | 0 | 12 gear |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Score breakdown

```json
{
  "blocked": -1.982,
  "buildCost": -11.83,
  "constraintPenalty": 0,
  "energy": -2.059255,
  "occupiedArea": -20.8,
  "onTimeDelivery": 5,
  "throughput": 60,
  "wip": -5.3373333333333335
}
```
