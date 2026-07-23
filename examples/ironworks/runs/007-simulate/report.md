# INM Run 007-simulate

- Decision: **BASELINE**
- Blueprint: `chemical-factory`
- Score: **122.737**
- Result hash: `16b3fadf47b127fefe781c79f2a82c89c98e0ce0a3deb651c25eac977459e12c`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 13.000
- Delivery portfolio: 130.0% demand attainment · 26.000 / 20.000 valued / demanded · 6.000 above demand · 0.000 net value/min
  - Contract `primary`: 26.000 / 20.000 `plastic` · 130.0% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 130.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 10.000 plastic/min
- Capacity delivery targets: 10.000 plastic/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 3.6%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 606.450 J
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
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -0.7060035000000001,
  "occupiedArea": -14.600000000000001,
  "onTimeDelivery": 13,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 130,
  "wip": -0.32183333333333336
}
```
