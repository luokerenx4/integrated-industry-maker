# INM Run 069-simulate

- Decision: **BASELINE**
- Blueprint: `generated-dram-fab`
- Score: **-153.787**
- Result hash: `038517f5a633f8d64a6ccb821d6cbae1e2c7a043d5ed79e2e99b63bb98d63cd0`
- Bottleneck: burn-in-1
- Throughput/min: 15.750
- Delivery portfolio: 126.0% demand attainment · 63.000 / 50.000 valued / demanded · 13.000 above demand · 52.500 net value/min
  - Contract `commercial-order`: 45.000 / 32.000 `commercial-dram-device` · 140.6% · 90.000 net value
  - Contract `performance-order`: 12.000 / 12.000 `performance-dram-device` · 100.0% · 60.000 net value
  - Contract `automotive-order`: 6.000 / 6.000 `automotive-dram-device` · 100.0% · 60.000 net value
- Tracked lots: 10 / 12 / 12 completed / released / scheduled · 2 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 8.541 s actual interval · 10.990 s mean delay · 0 pending
- Release control: conwip · max WIP 7 · reopen at 4 · earliest-due-date · max delay 30.000 s · peak 7 active lots · 5 control-blocked / 131.880 lot-s · 0 capacity-blocked / 0.000 lot-s · 4 service openings
- Lot service: 83.3% on time · mean cycle 66.766 s · p95 81.956 s · mean tardiness 0.000 s
- Quality flow: 83.3% good yield · 75.0% first-pass · 15 inspections · 3 rework cycles · 2 scrap dispositions · 0 escapes
- Lot-derived output: 80 / 80 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 4 changeovers · 18.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 0.9%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 4396.341 J
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
| packaging-to-burn-in | 20.000 / 240.000 | 8.3% | 0 | 80 packaged-dram-device |
| probe-to-packaging | 20.000 / 240.000 | 8.3% | 0 | 80 known-good-dram-die |
| commercial-to-customer | 11.250 / 240.000 | 4.7% | 0 | 45 commercial-dram-device |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 12 etched-cell-l1-lot |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 0 | 12 dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l1-lot |
| lithography-to-etch-lithography-l2 | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l2-lot |
| performance-to-customer | 3.000 / 240.000 | 1.3% | 0 | 12 performance-dram-device |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 blank-dram-wafer-lot |
| inspection-to-probe | 2.500 / 240.000 | 1.0% | 0 | 10 qualified-dram-wafer-lot |
| automotive-to-customer | 1.500 / 240.000 | 0.6% | 0 | 6 automotive-dram-device |
| inspection-to-rework | 0.750 / 240.000 | 0.3% | 0 | 3 rework-required-dram-wafer-lot |
| rework-to-inspection | 0.750 / 240.000 | 0.3% | 0 | 3 dram-wafer-lot |
| inspection-to-scrap | 0.500 / 240.000 | 0.2% | 0 | 2 scrap-dram-wafer-lot |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.490000000000002,
  "changeovers": -2,
  "constraintPenalty": 0,
  "cycleTime": -2.2255333333333334,
  "deliveryValue": 52.5,
  "electricityCost": 0,
  "energy": -1.9535418050000002,
  "occupiedArea": -14.25,
  "onTimeDelivery": 16.666666666666668,
  "qualityEscapes": 0,
  "rework": -1.5,
  "tardiness": 0,
  "throughput": 0,
  "wip": -189.534525
}
```
