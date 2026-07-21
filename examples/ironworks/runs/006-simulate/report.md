# INM Run 006-simulate

- Decision: **BASELINE**
- Score: **126.681**
- Result hash: `6dabe1b770cf765e6e2692b46b37fdf4db930cc32b0869b2407e3f085be5c1df`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 19.000
- Target rate: 24.000 gear/min (79.2% attained)
- Capacity plan: READY
- Belt utilization: 5.9%
- Average blocked belt items: 0.000
- Peak belt items: 14
- Powered transport energy: 1104.000 J
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-merge-to-synth-iron-ore-split-2 | 105.000 / 240.000 | 43.8% | 0 | 210 iron-ore |
| synth-iron-ore-synth-iron-ore-split-2-to-synth-iron-ore-split | 67.000 / 240.000 | 27.9% | 0 | 134 iron-ore |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-iron-ore-merge | 54.500 / 240.000 | 22.7% | 0 | 109 iron-ore |
| synth-iron-ore-synth-iron-ore-extractor-2-to-synth-iron-ore-merge | 54.500 / 240.000 | 22.7% | 0 | 109 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-2-to-synth-iron-plate-station-supply | 40.000 / 240.000 | 16.7% | 0 | 80 iron-plate |
| synth-iron-ore-synth-iron-ore-split-2-to-synth-smelt-iron-1 | 33.000 / 240.000 | 13.8% | 0 | 66 iron-ore |
| synth-iron-plate-synth-iron-plate-station-demand-to-synth-forge-gear-pair-1 | 32.500 / 240.000 | 13.5% | 0 | 65 iron-plate |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-3 | 32.000 / 240.000 | 13.3% | 0 | 64 iron-ore |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-2 | 31.000 / 240.000 | 12.9% | 0 | 62 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-merge-2 | 27.000 / 240.000 | 11.3% | 0 | 54 iron-plate |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 19.000 / 240.000 | 7.9% | 0 | 38 gear |
| synth-coal-synth-coal-extractor-1-to-synth-forge-gear-pair-1 | 14.000 / 240.000 | 5.8% | 0 | 28 coal |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 13.500 / 240.000 | 5.6% | 0 | 27 iron-plate |
| synth-iron-plate-synth-smelt-iron-3-to-synth-iron-plate-merge-2 | 13.500 / 240.000 | 5.6% | 0 | 27 iron-plate |

## Score breakdown

```json
{
  "blocked": -1.5,
  "buildCost": -16.715,
  "constraintPenalty": 0,
  "energy": -2.7256760000000004,
  "occupiedArea": -43.400000000000006,
  "onTimeDelivery": 7.916666666666666,
  "throughput": 190,
  "wip": -6.895408333333333
}
```
