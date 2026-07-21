# INM Run 008-simulate

- Decision: **BASELINE**
- Score: **373.342**
- Result hash: `6b36634bea185fc38c1971fbbbf086cfd83030a9f3092f8f0ef6c273cee85ecb`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 39.000
- Target rate: 10.000 hydrogen/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 3.1%
- Average blocked belt items: 0.000
- Peak belt items: 5
- Powered transport energy: 248.500 J
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

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -5.1,
  "constraintPenalty": 0,
  "energy": -0.7451850000000001,
  "occupiedArea": -20.400000000000002,
  "onTimeDelivery": 10,
  "throughput": 390,
  "wip": -0.41258333333333336
}
```
