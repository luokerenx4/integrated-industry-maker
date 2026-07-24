# INM Run 073-simulate

- Decision: **BASELINE**
- Blueprint: `generated-dram-fab`
- Score: **27.748**
- Result hash: `37a8cdfbe2bb8de3c7bd59e7237eaa9f15274473f1af1a3898be1aae160d16db`
- Bottleneck: burn-in-1
- Throughput/min: 22.000
- Delivery portfolio: 176.0% demand attainment · 88.000 / 50.000 valued / demanded · 38.000 above demand · 72.000 net value/min
  - Contract `commercial-order`: 64.000 / 32.000 `commercial-dram-device` · 200.0% · 128.000 net value
  - Contract `performance-order`: 16.000 / 12.000 `performance-dram-device` · 133.3% · 80.000 net value
  - Contract `automotive-order`: 8.000 / 6.000 `automotive-dram-device` · 133.3% · 80.000 net value
- Tracked lots: 11 / 12 / 12 completed / released / scheduled · 1 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 9.269 s actual interval · 15.478 s mean delay · 0 pending
- Release control: conwip · max WIP 6 · reopen at 3 · earliest-due-date · max delay 18.000 s · peak 6 active lots · 6 control-blocked / 185.736 lot-s · 0 capacity-blocked / 0.000 lot-s · 6 service openings
- Lot service: 83.3% on time · mean cycle 64.138 s · p95 81.956 s · mean tardiness 0.128 s
- Quality flow: 91.7% good yield · 75.0% first-pass · 15 inspections · 3 rework cycles · 1 scrap dispositions · 0 escapes
- Lot-derived output: 88 / 88 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 4 changeovers · 18.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 18.336 average scored WIP / 116.940 total inventory · 47.000 peak WIP / 171.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.0%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 4426.500 J
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
| packaging-to-burn-in | 22.000 / 240.000 | 9.2% | 0 | 88 packaged-dram-device |
| probe-to-packaging | 22.000 / 240.000 | 9.2% | 0 | 88 known-good-dram-die |
| commercial-to-customer | 16.000 / 240.000 | 6.7% | 0 | 64 commercial-dram-device |
| performance-to-customer | 4.000 / 240.000 | 1.7% | 0 | 16 performance-dram-device |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 12 etched-cell-l1-lot |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 0 | 12 dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l1-lot |
| lithography-to-etch-lithography-l2 | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l2-lot |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 blank-dram-wafer-lot |
| inspection-to-probe | 2.750 / 240.000 | 1.1% | 0 | 11 qualified-dram-wafer-lot |
| automotive-to-customer | 2.000 / 240.000 | 0.8% | 0 | 8 automotive-dram-device |
| inspection-to-rework | 0.750 / 240.000 | 0.3% | 0 | 3 rework-required-dram-wafer-lot |
| rework-to-inspection | 0.750 / 240.000 | 0.3% | 0 | 3 dram-wafer-lot |
| inspection-to-scrap | 0.250 / 240.000 | 0.1% | 0 | 1 scrap-dram-wafer-lot |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| packaged-dram-device | WIP | 11.488 | 37.000 | 0.000 |
| known-good-dram-die | WIP | 6.056 | 21.000 | 0.000 |
| patterned-cell-l1-lot | WIP | 0.145 | 2.000 | 0.000 |
| qualified-dram-wafer-lot | WIP | 0.122 | 2.000 | 0.000 |
| annealed-dielectric-stack-lot | WIP | 0.122 | 1.000 | 0.000 |
| patterned-cell-l2-lot | WIP | 0.102 | 1.000 | 0.000 |
| etched-cell-l1-lot | WIP | 0.100 | 1.000 | 0.000 |
| dram-wafer-lot | WIP | 0.092 | 2.000 | 0.000 |
| blank-dram-wafer-lot | WIP | 0.050 | 1.000 | 0.000 |
| dielectric-stack-lot | WIP | 0.045 | 1.000 | 0.000 |
| rework-required-dram-wafer-lot | WIP | 0.015 | 1.000 | 0.000 |
| dram-package-substrate | excluded | 41.699 | 93.000 | 8.000 |
| metrology-calibration-kit | excluded | 16.000 | 16.000 | 16.000 |
| metrology-reference-wafer | excluded | 16.000 | 16.000 | 16.000 |
| tool-qualification-wafer | excluded | 11.178 | 16.000 | 8.000 |
| chamber-clean-kit | excluded | 10.912 | 16.000 | 8.000 |
| reticle-mask-set-l1 | excluded | 1.000 | 1.000 | 1.000 |
| reticle-mask-set-l2 | excluded | 1.000 | 1.000 | 1.000 |
| commercial-dram-device | excluded | 0.688 | 8.000 | 0.000 |
| performance-dram-device | excluded | 0.085 | 4.000 | 0.000 |
| automotive-dram-device | excluded | 0.037 | 2.000 | 0.000 |
| scrap-dram-wafer-lot | excluded | 0.004 | 1.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.495000000000001,
  "changeovers": -2,
  "constraintPenalty": 0,
  "cycleTime": -2.1379272727272727,
  "deliveryValue": 72,
  "electricityCost": 0,
  "energy": -2.0233925,
  "occupiedArea": -14.25,
  "onTimeDelivery": 16.666666666666668,
  "qualityEscapes": 0,
  "rework": -1.5,
  "tardiness": -0.008557575757575759,
  "throughput": 0,
  "wip": -27.503425
}
```
