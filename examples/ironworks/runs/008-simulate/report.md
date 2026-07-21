# INM Run 008-simulate

- Decision: **BASELINE**
- Score: **373.334**
- Result hash: `a2ba54277c8494b807ece54335763b773d7a2f7173abab2022fc68fbac7400f5`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 39.000
- Tracked lots: 0 / 0 completed · 0 scrapped
- Lot service: 100.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Target rate: 10.000 hydrogen/min (100.0% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 3.1%
- Average blocked belt items: 0.000
- Peak belt items: 5
- Powered transport energy: 786.375 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 0 / 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-hydrogen-synth-xray-crack-oil-1-to-synth-hydrogen-sink | 39.000 / 240.000 | 16.3% | 0 | 78 hydrogen |
| synth-crude-oil-synth-crude-oil-extractor-1-to-synth-refine-crude-1 | 29.500 / 240.000 | 12.3% | 0 | 59 crude-oil |
| synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1 | 28.000 / 240.000 | 11.7% | 0 | 56 refined-oil |
| synth-hydrogen-synth-refine-crude-1-to-synth-xray-crack-oil-1 | 14.000 / 240.000 | 5.8% | 0 | 28 hydrogen |
| synth-graphite-synth-xray-crack-oil-1-to-synth-graphite-surplus-sink | 13.000 / 240.000 | 5.4% | 0 | 26 graphite |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -5.1,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "energy": -0.75302875,
  "occupiedArea": -20.400000000000002,
  "onTimeDelivery": 10,
  "tardiness": 0,
  "throughput": 390,
  "wip": -0.41258333333333336
}
```
