# INM Run 006-simulate

- Decision: **BASELINE**
- Score: **246.527**
- Result hash: `6c7ce0dde28a1a675e05bd73442c4ca5fd501ebbdd39421335e4a82ceffcddf8`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 28.000
- Target rate: 24.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 4.9%
- Average blocked belt items: 0.429
- Peak belt items: 8
- Powered transport energy: 587.900 J
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-iron-ore-split | 59.500 / 240.000 | 24.8% | 0 | 119 iron-ore |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 28.000 / 120.000 | 23.3% | 22400 | 56 gear |
| synth-iron-plate-synth-iron-plate-assembly-world-station-demand-1-to-synth-forge-gear-pair-1 | 22.000 / 120.000 | 18.3% | 29100 | 44 iron-plate |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-1 | 29.500 / 240.000 | 12.3% | 0 | 59 iron-ore |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-2 | 29.500 / 240.000 | 12.3% | 0 | 59 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-forge-world-station-supply-1 | 28.000 / 240.000 | 11.7% | 0 | 56 iron-plate |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 14.000 / 120.000 | 11.7% | 0 | 28 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 14.000 / 120.000 | 11.7% | 0 | 28 iron-plate |
| synth-coal-synth-coal-extractor-1-to-synth-forge-gear-pair-1 | 18.000 / 240.000 | 7.5% | 0 | 36 coal |

## Grid storage

No configured accumulators.

## Score breakdown

```json
{
  "blocked": -1.2666666666666666,
  "buildCost": -13.72,
  "constraintPenalty": 0,
  "energy": -2.4137790000000003,
  "occupiedArea": -23.200000000000003,
  "onTimeDelivery": 10,
  "throughput": 280,
  "wip": -2.873
}
```
