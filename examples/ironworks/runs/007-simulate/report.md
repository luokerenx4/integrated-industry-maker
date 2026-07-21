# INM Run 007-simulate

- Decision: **BASELINE**
- Score: **120.162**
- Result hash: `9dba1beb54f4079dc6c15d939e487bfea94232c836e38c47eb4d8fa8ca37c29e`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 13.000
- Target rate: 10.000 plastic/min (100.0% attained)
- Capacity plan: READY
- Belt utilization: 3.5%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 169.000 J
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-crude-oil-synth-crude-oil-extractor-1-to-synth-refine-crude-1 | 29.500 / 240.000 | 12.3% | 0 | 59 crude-oil |
| synth-refined-oil-synth-refine-crude-1-to-synth-make-plastic-1 | 28.000 / 240.000 | 11.7% | 0 | 56 refined-oil |
| synth-hydrogen-synth-refine-crude-1-to-synth-make-plastic-1 | 14.000 / 240.000 | 5.8% | 0 | 28 hydrogen |
| synth-plastic-synth-make-plastic-1-to-synth-plastic-sink | 13.000 / 240.000 | 5.4% | 0 | 26 plastic |

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -4.625,
  "constraintPenalty": 0,
  "energy": -0.7003900000000001,
  "occupiedArea": -14.200000000000001,
  "onTimeDelivery": 10,
  "throughput": 130,
  "wip": -0.31266666666666665
}
```
