# INM Run 004-simulate

- Decision: **BASELINE**
- Score: **55.938**
- Result hash: `62e110d76cb3ac6a4d62a920e35f3ac688b0d0584f803090b1c0f2f390cbc71c`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 12.000
- Target rate: 12.000 gear/min (100.0% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.9%
- Average blocked belt items: 0.080
- Peak belt items: 15
- Powered transport energy: 1699.200 J
- Material treated: 20 coal@2 + 20 iron-plate@2
- Treatment agents consumed: 10 proliferator
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-smelt-iron-1 | 33.000 / 240.000 | 13.8% | 0 | 66 iron-ore |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 12.000 / 120.000 | 10.0% | 9600 | 24 gear |
| synth-coal-synth-coal-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 10.500 / 120.000 | 8.8% | 0 | 21 coal |
| synth-coal-synth-coal-extractor-1-to-synth-coal-split | 20.000 / 240.000 | 8.3% | 0 | 40 coal |
| synth-proliferator-synth-make-proliferator-1-to-synth-proliferator-split | 17.000 / 240.000 | 7.1% | 0 | 34 proliferator |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-world-station-supply-1 | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| synth-iron-plate-synth-iron-plate-assembly-world-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 10.000 / 240.000 | 4.2% | 0 | 20 iron-plate |
| synth-coal-synth-coal-split-to-synth-make-proliferator-1 | 9.500 / 240.000 | 4.0% | 0 | 19 coal |
| synth-coal-synth-coal-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 7.000 / 240.000 | 2.9% | 0 | 14 coal |
| synth-proliferator-synth-proliferator-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 6.500 / 240.000 | 2.7% | 0 | 13 proliferator |
| synth-proliferator-synth-proliferator-split-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 6.500 / 240.000 | 2.7% | 0 | 13 proliferator |

## Grid storage

No configured accumulators.

## Score breakdown

```json
{
  "blocked": -2.305,
  "buildCost": -15.875,
  "constraintPenalty": 0,
  "energy": -2.152518,
  "occupiedArea": -46.2,
  "onTimeDelivery": 10,
  "throughput": 120,
  "wip": -7.529541666666667
}
```
