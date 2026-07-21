# INM Run 004-simulate

- Decision: **BASELINE**
- Score: **105.936**
- Result hash: `60480a23b7b9474bb3a44de8ddeeef227390381310957ac16eb214c42fdd3d92`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 14.000
- Target rate: 12.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 2.9%
- Average blocked belt items: 0.000
- Peak belt items: 5
- Powered transport energy: 362.000 J
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-iron-ore-split | 45.000 / 240.000 | 18.8% | 0 | 90 iron-ore |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-1 | 22.500 / 240.000 | 9.4% | 0 | 45 iron-ore |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-2 | 22.500 / 240.000 | 9.4% | 0 | 45 iron-ore |
| synth-iron-plate-synth-iron-plate-assembly-world-station-demand-1-to-synth-forge-gear-pair-1 | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-forge-world-station-supply-1 | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 14.000 / 240.000 | 5.8% | 0 | 28 gear |
| synth-coal-synth-coal-extractor-1-to-synth-forge-gear-pair-1 | 11.000 / 240.000 | 4.6% | 0 | 22 coal |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |

## Score breakdown

```json
{
  "blocked": -1.5,
  "buildCost": -13.66,
  "constraintPenalty": 0,
  "energy": -2.23162,
  "occupiedArea": -24,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -2.6720833333333336
}
```
