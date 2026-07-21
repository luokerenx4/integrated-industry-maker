# INM Run 007-simulate

- Decision: **BASELINE**
- Score: **119.744**
- Result hash: `b4a40260d8c9b42d22a855215dd413017923f5c5e8eac86020d995346ff9b314`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 13.000
- Target rate: 10.000 plastic/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 3.6%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 168.600 J
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

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -4.635,
  "constraintPenalty": 0,
  "energy": -0.699306,
  "occupiedArea": -14.600000000000001,
  "onTimeDelivery": 10,
  "throughput": 130,
  "wip": -0.32183333333333336
}
```
