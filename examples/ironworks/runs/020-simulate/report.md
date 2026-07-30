# INM Run 008-simulate

- Decision: **BASELINE**
- Blueprint: `xray-cracking-factory`
- Score: **402.482**
- Result hash: `b2b8d6ee11f7e4bf1ae2e2b2f83c0e546586095c2efe3be63923cb4c6683a8e5`
- Bottleneck: synth-refine-crude-1
- Throughput/min: 39.000
- Delivery portfolio: 390.0% demand attainment · 78.000 / 20.000 valued / demanded · 58.000 above demand · 0.000 net value/min
  - Contract `primary`: 78.000 / 20.000 `hydrogen` · 390.0% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean / 0.000 s maximum delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 390.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0/0 authored excursion defects prevented · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 2.648 average scored WIP / 8.743 total inventory · 4.000 peak WIP / 11.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 10.000 hydrogen/min
- Capacity delivery targets: 10.000 hydrogen/min
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

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| synth-hydrogen-synth-xray-crack-oil-1-to-synth-hydrogen-sink | 39.000 / 240.000 | 16.3% | 0 | 0 | 0 | 0 | 0 | 78 hydrogen |
| synth-crude-oil-synth-crude-oil-extractor-1-to-synth-refine-crude-1 | 29.500 / 240.000 | 12.3% | 0 | 0 | 0 | 0 | 0 | 59 crude-oil |
| synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1 | 28.000 / 240.000 | 11.7% | 0 | 0 | 0 | 0 | 0 | 56 refined-oil |
| synth-hydrogen-synth-refine-crude-1-to-synth-xray-crack-oil-1 | 14.000 / 240.000 | 5.8% | 0 | 0 | 0 | 0 | 0 | 28 hydrogen |
| synth-graphite-synth-xray-crack-oil-1-to-synth-graphite-surplus-sink | 13.000 / 240.000 | 5.4% | 0 | 0 | 0 | 0 | 0 | 26 graphite |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| refined-oil | WIP | 2.648 | 4.000 | 2.000 |
| crude-oil | excluded | 3.227 | 4.000 | 4.000 |
| hydrogen | excluded | 2.019 | 4.000 | 4.000 |
| graphite | excluded | 0.849 | 1.000 | 1.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Average inventory | Peak inventory | Final inventory |
| --- | --- | --- | --- | ---: | ---: | ---: |
| in-process:synth-xray-crack-oil-1:xray-crack-oil:refined-oil | refined-oil | in-process | synth-xray-crack-oil-1.xray-crack-oil | 1.808 | 2.000 | 2.000 |
| local-transit:synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1:belt:refined-oil | refined-oil | local-transit | synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1.belt | 0.373 | 2.000 | 0.000 |
| buffer:synth-xray-crack-oil-1:oil-input:refined-oil | refined-oil | buffer | synth-xray-crack-oil-1.oil-input | 0.175 | 2.000 | 0.000 |
| local-transit:synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1:loading:refined-oil | refined-oil | local-transit | synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1.loading | 0.117 | 1.000 | 0.000 |
| local-transit:synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1:unloading:refined-oil | refined-oil | local-transit | synth-refined-oil-synth-refine-crude-1-to-synth-xray-crack-oil-1.unloading | 0.117 | 1.000 | 0.000 |
| buffer:synth-refine-crude-1:liquid-output:refined-oil | refined-oil | buffer | synth-refine-crude-1.liquid-output | 0.058 | 1.000 | 0.000 |

Location averages and final quantities conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -5.1,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "electricityCost": 0,
  "energy": -0.75302875,
  "occupiedArea": -20.400000000000002,
  "onTimeDelivery": 39,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 390,
  "wip": -0.26483333333333337
}
```
