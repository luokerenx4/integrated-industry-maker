# INM Run 006-simulate

- Decision: **BASELINE**
- Score: **183.964**
- Result hash: `613293b3bc5e71e4989902be08d2539e9f2569f93d34cbd0ca89259da7fcacfd`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 26.000
- Target rate: 24.000 gear/min (100.0% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 3.0%
- Average blocked belt items: 0.173
- Peak belt items: 16
- Powered transport energy: 2545.875 J
- High-speed carrier missions: 0
- Material treated: 36 coal@2 + 40 iron-plate@2
- Treatment agents consumed: 19 proliferator
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| synth-iron-ore-synth-iron-ore-extractor-1-to-synth-iron-ore-split | 59.500 / 240.000 | 24.8% | 0 | 119 iron-ore |
| synth-gear-synth-forge-gear-pair-1-to-synth-gear-sink | 26.000 / 120.000 | 21.7% | 20800 | 52 gear |
| synth-coal-synth-coal-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 26.000 / 120.000 | 21.7% | 0 | 52 coal |
| synth-coal-synth-coal-extractor-1-to-synth-coal-split | 41.000 / 240.000 | 17.1% | 0 | 82 coal |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-1 | 29.500 / 240.000 | 12.3% | 0 | 59 iron-ore |
| synth-iron-ore-synth-iron-ore-split-to-synth-smelt-iron-2 | 29.500 / 240.000 | 12.3% | 0 | 59 iron-ore |
| synth-iron-plate-synth-iron-plate-merge-to-synth-iron-plate-forge-zone-station-supply-1 | 28.000 / 240.000 | 11.7% | 0 | 56 iron-plate |
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-merge | 14.000 / 120.000 | 11.7% | 0 | 28 iron-plate |
| synth-iron-plate-synth-smelt-iron-2-to-synth-iron-plate-merge | 14.000 / 120.000 | 11.7% | 0 | 28 iron-plate |
| synth-proliferator-synth-make-proliferator-1-to-synth-proliferator-split | 21.500 / 240.000 | 9.0% | 0 | 43 proliferator |
| synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 21.000 / 240.000 | 8.8% | 0 | 42 iron-plate |
| synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 20.000 / 240.000 | 8.3% | 0 | 40 iron-plate |
| synth-coal-synth-coal-split-to-synth-make-proliferator-1 | 11.000 / 240.000 | 4.6% | 0 | 22 coal |
| synth-coal-synth-coal-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 10.500 / 240.000 | 4.4% | 0 | 21 coal |
| synth-proliferator-synth-proliferator-split-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 9.000 / 240.000 | 3.8% | 0 | 18 proliferator |
| synth-proliferator-synth-proliferator-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 8.500 / 240.000 | 3.5% | 0 | 17 proliferator |

## Grid storage

No configured accumulators.

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| synth-iron-plate-assembly-zone-station-demand-1 | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| synth-iron-plate-forge-zone-station-supply-1 | 0.000 | 10.303 / 12.000 | 300.000 | 32.703 | 22.400 |

## Score breakdown

```json
{
  "blocked": -3.19,
  "buildCost": -18.685,
  "constraintPenalty": 0,
  "energy": -2.99899675,
  "occupiedArea": -52.2,
  "onTimeDelivery": 10,
  "throughput": 260,
  "wip": -8.961708333333332
}
```
