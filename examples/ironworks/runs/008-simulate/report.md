# INM Run 008-simulate

- Decision: **BASELINE**
- Blueprint: `xray-cracking-factory`
- Score: **373.334**
- Result hash: `e5a4633af920745aa5fd30e77f8e21feba5477a0957974b56f9be2c8ae7cba20`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 39.000
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s
- Lot service: 100.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot
- Equipment setup: 0 changeovers · 0.000 s work
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
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "energy": -0.75302875,
  "occupiedArea": -20.400000000000002,
  "onTimeDelivery": 10,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 390,
  "wip": -0.41258333333333336
}
```
