# INM Run 006-simulate

- Decision: **BASELINE**
- Score: **138.337**
- Result hash: `60868e83dddb6c84c245f684bfa32a22cd8e486540a265744fb38f04cd64af88`
- Bottleneck: synth-smelt-iron-2
- Throughput/min: 20.000
- Target rate: 24.000 gear/min (83.3% attained)
- Capacity plan: READY
- Belt utilization: 4.6%
- Average blocked belt items: 0.000
- Peak belt items: 10
- Powered transport energy: 847.980 J
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-2-to-synth-iron-ore-split-2 | 55.500 / 240.000 | 23.1% | 0 | 111 iron-ore |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-iron-ore-split | 55.000 / 240.000 | 22.9% | 0 | 110 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-2-to-synth-iron-plate-forge-world-station-supply-1 | 40.500 / 240.000 | 16.9% | 0 | 81 iron-plate |
| synth-iron-ore-lane-1-synth-iron-ore-split-to-synth-smelt-iron-1 | 33.000 / 240.000 | 13.8% | 0 | 66 iron-ore |
| synth-iron-ore-synth-iron-ore-merge-to-synth-smelt-iron-2 | 33.000 / 240.000 | 13.8% | 0 | 66 iron-ore |
| synth-iron-plate-synth-iron-plate-assembly-world-station-demand-1-to-synth-forge-gear-pair-1 | 33.000 / 240.000 | 13.8% | 0 | 66 iron-plate |
| synth-iron-ore-lane-4-synth-iron-ore-split-2-to-synth-smelt-iron-3 | 32.000 / 240.000 | 13.3% | 0 | 64 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-merge-2 | 27.500 / 240.000 | 11.5% | 0 | 55 iron-plate |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 20.000 / 240.000 | 8.3% | 0 | 40 gear |
| synth-iron-ore-lane-3-synth-iron-ore-split-2-to-synth-iron-ore-merge | 19.000 / 240.000 | 7.9% | 0 | 38 iron-ore |
| synth-iron-ore-lane-2-synth-iron-ore-split-to-synth-iron-ore-merge | 18.000 / 240.000 | 7.5% | 0 | 36 iron-ore |
| synth-coal-synth-coal-extractor-1-to-synth-forge-gear-pair-1 | 14.000 / 240.000 | 5.8% | 0 | 28 coal |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| synth-iron-plate-synth-smelt-iron-3-to-synth-iron-plate-merge-2 | 13.500 / 240.000 | 5.6% | 0 | 27 iron-plate |

## Score breakdown

```json
{
  "blocked": -1.4391666666666667,
  "buildCost": -16.69,
  "constraintPenalty": 0,
  "energy": -2.7392928000000003,
  "occupiedArea": -42.400000000000006,
  "onTimeDelivery": 8.333333333333334,
  "throughput": 200,
  "wip": -6.728208333333334
}
```
