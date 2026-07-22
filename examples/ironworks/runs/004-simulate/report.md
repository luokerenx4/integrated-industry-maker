# INM Run 004-simulate

- Decision: **BASELINE**
- Blueprint: `synthesized`
- Score: **52.511**
- Result hash: `8ea476607320378c35df18336d6698ca2cf83669f634258638e95c8f32209547`
- Bottleneck: synth-smelt-iron-1
- Throughput/min: 12.000
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 100.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Target rate: 12.000 gear/min (100.0% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.8%
- Average blocked belt items: 0.080
- Peak belt items: 15
- Powered transport energy: 1698.000 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
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
| synth-iron-plate-synth-smelt-iron-1-to-synth-iron-plate-forge-zone-station-supply-1 | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| synth-iron-plate-synth-iron-plate-assembly-zone-station-demand-1-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 11.000 / 240.000 | 4.6% | 0 | 22 iron-plate |
| synth-iron-plate-synth-iron-plate-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 10.000 / 240.000 | 4.2% | 0 | 20 iron-plate |
| synth-coal-synth-coal-split-to-synth-make-proliferator-1 | 9.500 / 240.000 | 4.0% | 0 | 19 coal |
| synth-coal-synth-coal-synth-forge-gear-pair-1-coater-1-to-synth-forge-gear-pair-1 | 7.000 / 240.000 | 2.9% | 0 | 14 coal |
| synth-proliferator-synth-proliferator-split-to-synth-coal-synth-forge-gear-pair-1-coater-1 | 6.500 / 240.000 | 2.7% | 0 | 13 proliferator |
| synth-proliferator-synth-proliferator-split-to-synth-iron-plate-synth-forge-gear-pair-1-coater-1 | 6.500 / 240.000 | 2.7% | 0 | 13 proliferator |

## Grid storage

No configured accumulators.

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| synth-iron-plate-assembly-zone-station-demand-1 | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| synth-iron-plate-forge-zone-station-supply-1 | 0.000 | 10.330 / 12.000 | 300.000 | 21.830 | 11.500 |

## Score breakdown

```json
{
  "blocked": -2.305,
  "buildCost": -17.275,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "energy": -2.4908099999999997,
  "occupiedArea": -47.800000000000004,
  "onTimeDelivery": 10,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 120,
  "wip": -7.618291666666668
}
```
