# INM Run 004-simulate

- Decision: **BASELINE**
- Score: **107.609**
- Result hash: `f418cbe07a266c1f456c297bec4fde0e11f3846146677df5608f2aa898e4d277`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 14.000
- Target rate: 12.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 2.9%
- Average blocked belt items: 0.000
- Peak belt items: 4
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
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-station-supply | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| synth-iron-plate-synth-iron-plate-station-demand-to-synth-forge-gear-pair-1 | 22.000 / 240.000 | 9.2% | 0 | 44 iron-plate |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 14.000 / 240.000 | 5.8% | 0 | 28 gear |
| synth-coal-synth-coal-extractor-1-to-synth-forge-gear-pair-1 | 11.000 / 240.000 | 4.6% | 0 | 22 coal |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |

## Score breakdown

```json
{
  "blocked": -1.5,
  "buildCost": -13.62,
  "constraintPenalty": 0,
  "energy": -2.23162,
  "occupiedArea": -22.400000000000002,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -2.639666666666667
}
```
