# INM Run 068-simulate

- Decision: **BASELINE**
- Blueprint: `generated-dram-fab`
- Score: **-158.928**
- Result hash: `639676d0733685c0b58a60516abb7137df9a2a01576e6d9a996451a9b8abb6f6`
- Bottleneck: burn-in-1
- Throughput/min: 14.000
- Delivery portfolio: 112.0% demand attainment · 56.000 / 50.000 valued / demanded · 6.000 above demand · 49.000 net value/min
  - Contract `commercial-order`: 38.000 / 32.000 `commercial-dram-device` · 118.8% · 76.000 net value
  - Contract `performance-order`: 12.000 / 12.000 `performance-dram-device` · 100.0% · 60.000 net value
  - Contract `automotive-order`: 6.000 / 6.000 `automotive-dram-device` · 100.0% · 60.000 net value
- Tracked lots: 8 / 12 / 12 completed / released / scheduled · 4 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 7.491 s actual interval · 4.071 s mean delay · 0 pending
- Release control: conwip · max WIP 9 · reopen at 6 · earliest-due-date · max delay 18.000 s · peak 9 active lots · 3 control-blocked / 48.850 lot-s · 0 capacity-blocked / 0.000 lot-s · 3 service openings
- Lot service: 50.0% on time · mean cycle 74.969 s · p95 93.500 s · mean tardiness 4.850 s
- Quality flow: 66.7% good yield · 66.7% first-pass · 16 inspections · 4 rework cycles · 4 scrap dispositions · 0 escapes
- Lot-derived output: 64 / 64 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 2 violations across 2 lots · 49.300 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 4 changeovers · 18.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 0.8%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 4368.000 J
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
| substrate-receiving-to-packaging | 24.000 / 240.000 | 10.0% | 0 | 96 dram-package-substrate |
| packaging-to-burn-in | 16.000 / 240.000 | 6.7% | 0 | 64 packaged-dram-device |
| probe-to-packaging | 16.000 / 240.000 | 6.7% | 0 | 64 known-good-dram-die |
| commercial-to-customer | 9.500 / 240.000 | 4.0% | 0 | 38 commercial-dram-device |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 12 etched-cell-l1-lot |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 0 | 12 dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l1-lot |
| lithography-to-etch-lithography-l2 | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l2-lot |
| performance-to-customer | 3.000 / 240.000 | 1.3% | 0 | 12 performance-dram-device |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 blank-dram-wafer-lot |
| inspection-to-probe | 2.000 / 240.000 | 0.8% | 0 | 8 qualified-dram-wafer-lot |
| automotive-to-customer | 1.500 / 240.000 | 0.6% | 0 | 6 automotive-dram-device |
| inspection-to-rework | 1.000 / 240.000 | 0.4% | 0 | 4 rework-required-dram-wafer-lot |
| inspection-to-scrap | 1.000 / 240.000 | 0.4% | 0 | 4 scrap-dram-wafer-lot |
| rework-to-inspection | 1.000 / 240.000 | 0.4% | 0 | 4 dram-wafer-lot |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.4525,
  "changeovers": -2,
  "constraintPenalty": 0,
  "cycleTime": -2.4989583333333334,
  "deliveryValue": 49,
  "electricityCost": 0,
  "energy": -1.84023,
  "occupiedArea": -14.25,
  "onTimeDelivery": 10,
  "qualityEscapes": 0,
  "rework": -2,
  "tardiness": -0.3233333333333333,
  "throughput": 0,
  "wip": -183.5625
}
```
