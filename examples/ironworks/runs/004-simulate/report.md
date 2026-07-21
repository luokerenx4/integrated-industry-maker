# INM Run 004-simulate

- Decision: **BASELINE**
- Score: **111.332**
- Result hash: `cc01dc184f3f3263a9b5a511e1bbea93c4a51a1894109aa40a1fdc1d24b6d43d`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 14.000
- Target rate: 12.000 gear/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 3.5%
- Average blocked belt items: 0.148
- Peak belt items: 4
- Powered transport energy: 204.500 J
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-smelt-iron-1 | 33.000 / 240.000 | 13.8% | 0 | 66 iron-ore |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 14.000 / 120.000 | 11.7% | 11200 | 28 gear |
| synth-iron-plate-synth-iron-plate-assembly-world-station-demand-1-to-synth-forge-gear-pair-1 | 12.000 / 120.000 | 10.0% | 6600 | 24 iron-plate |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-world-station-supply-1 | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| synth-coal-synth-coal-extractor-1-to-synth-forge-gear-pair-1 | 12.000 / 240.000 | 5.0% | 0 | 24 coal |

## Grid storage

No configured accumulators.

## Score breakdown

```json
{
  "blocked": -2.22,
  "buildCost": -12.27,
  "constraintPenalty": 0,
  "energy": -2.044718,
  "occupiedArea": -18.8,
  "onTimeDelivery": 10,
  "throughput": 140,
  "wip": -3.333141666666667
}
```
