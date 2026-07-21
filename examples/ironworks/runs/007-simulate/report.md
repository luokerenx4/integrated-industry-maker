# INM Run 007-simulate

- Decision: **BASELINE**
- Score: **119.737**
- Result hash: `e4ae37e0050161ef21c35e87f74488b78723c110823fbb64bbef1493cfc824ac`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 13.000
- Target rate: 10.000 plastic/min (100.0% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 3.6%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 606.450 J
- High-speed carrier missions: 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-crude-oil-synth-crude-oil-extractor-1-to-synth-refine-crude-1 | 29.500 / 240.000 | 12.3% | 0 | 59 crude-oil |
| synth-refined-oil-synth-refine-crude-1-to-synth-make-plastic-1 | 28.000 / 240.000 | 11.7% | 0 | 56 refined-oil |
| synth-hydrogen-synth-refine-crude-1-to-synth-make-plastic-1 | 13.500 / 240.000 | 5.6% | 0 | 27 hydrogen |
| synth-plastic-synth-make-plastic-1-to-synth-plastic-sink | 13.000 / 240.000 | 5.4% | 0 | 26 plastic |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -4.635,
  "constraintPenalty": 0,
  "energy": -0.7060035000000001,
  "occupiedArea": -14.600000000000001,
  "onTimeDelivery": 10,
  "throughput": 130,
  "wip": -0.32183333333333336
}
```
