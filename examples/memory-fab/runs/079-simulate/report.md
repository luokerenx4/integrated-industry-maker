# INM Run 079-simulate

- Decision: **BASELINE**
- Blueprint: `generated-dram-fab`
- Score: **28.757**
- Result hash: `28d9624c41f51d47bd98f95be262a197df5139a4c4b0ace52791c471cd06869a`
- Bottleneck: burn-in-1
- Throughput/min: 24.000
- Delivery portfolio: 192.0% demand attainment · 96.000 / 50.000 valued / demanded · 46.000 above demand · 76.000 net value/min
  - Contract `commercial-order`: 72.000 / 32.000 `commercial-dram-device` · 225.0% · 144.000 net value
  - Contract `performance-order`: 16.000 / 12.000 `performance-dram-device` · 133.3% · 80.000 net value
  - Contract `automotive-order`: 8.000 / 6.000 `automotive-dram-device` · 133.3% · 80.000 net value
- Tracked lots: 12 / 12 / 12 completed / released / scheduled · 0 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 9.141 s actual interval · 14.778 s mean / 64.556 s maximum delay · 0 pending
- Release control: conwip · max WIP 6 · reopen at 5 · earliest-due-date · peak 6 active lots · 6 control-blocked / 177.336 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 91.7% on time · mean cycle 62.556 s · p95 77.456 s · mean tardiness 0.001 s
- Quality flow: 100.0% good yield · 83.3% first-pass · 1/3 authored excursion defects prevented · 14 inspections · 2 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 96 / 96 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 4 changeovers · 18.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 21.811 average scored WIP / 118.548 total inventory · 55.000 peak WIP / 172.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.0%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 4443.000 J
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
| packaging-to-burn-in | 24.000 / 240.000 | 10.0% | 0 | 96 packaged-dram-device |
| probe-to-packaging | 24.000 / 240.000 | 10.0% | 0 | 96 known-good-dram-die |
| substrate-receiving-to-packaging | 24.000 / 240.000 | 10.0% | 0 | 96 dram-package-substrate |
| commercial-to-customer | 18.000 / 240.000 | 7.5% | 0 | 72 commercial-dram-device |
| performance-to-customer | 4.000 / 240.000 | 1.7% | 0 | 16 performance-dram-device |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 100 | 12 dram-wafer-lot |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 12 etched-cell-l1-lot |
| inspection-to-probe | 3.000 / 240.000 | 1.3% | 0 | 12 qualified-dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l1-lot |
| lithography-to-etch-lithography-l2 | 3.000 / 240.000 | 1.3% | 0 | 12 patterned-cell-l2-lot |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 12 blank-dram-wafer-lot |
| automotive-to-customer | 2.000 / 240.000 | 0.8% | 0 | 8 automotive-dram-device |
| inspection-to-rework | 0.500 / 240.000 | 0.2% | 0 | 2 rework-required-dram-wafer-lot |
| rework-to-inspection | 0.500 / 240.000 | 0.2% | 0 | 2 dram-wafer-lot |
| inspection-to-scrap | 0.000 / 240.000 | 0.0% | 0 | — |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| packaged-dram-device | WIP | 12.193 | 37.000 | 0.000 |
| known-good-dram-die | WIP | 8.869 | 27.000 | 0.000 |
| patterned-cell-l1-lot | WIP | 0.145 | 2.000 | 0.000 |
| qualified-dram-wafer-lot | WIP | 0.120 | 1.000 | 0.000 |
| annealed-dielectric-stack-lot | WIP | 0.117 | 1.000 | 0.000 |
| patterned-cell-l2-lot | WIP | 0.098 | 1.000 | 0.000 |
| etched-cell-l1-lot | WIP | 0.083 | 1.000 | 0.000 |
| dram-wafer-lot | WIP | 0.081 | 2.000 | 0.000 |
| blank-dram-wafer-lot | WIP | 0.050 | 1.000 | 0.000 |
| dielectric-stack-lot | WIP | 0.045 | 1.000 | 0.000 |
| rework-required-dram-wafer-lot | WIP | 0.010 | 1.000 | 0.000 |
| dram-package-substrate | excluded | 39.802 | 92.000 | 0.000 |
| metrology-calibration-kit | excluded | 16.000 | 16.000 | 16.000 |
| metrology-reference-wafer | excluded | 16.000 | 16.000 | 16.000 |
| tool-qualification-wafer | excluded | 11.151 | 16.000 | 8.000 |
| chamber-clean-kit | excluded | 10.884 | 16.000 | 8.000 |
| reticle-mask-set-l1 | excluded | 1.000 | 1.000 | 1.000 |
| reticle-mask-set-l2 | excluded | 1.000 | 1.000 | 1.000 |
| commercial-dram-device | excluded | 0.777 | 8.000 | 0.000 |
| performance-dram-device | excluded | 0.085 | 4.000 | 0.000 |
| automotive-dram-device | excluded | 0.037 | 2.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.4975,
  "changeovers": -2,
  "constraintPenalty": 0,
  "cycleTime": -2.0852,
  "deliveryValue": 76,
  "electricityCost": 0,
  "energy": -2.027718,
  "occupiedArea": -14.25,
  "onTimeDelivery": 18.333333333333332,
  "qualityEscapes": 0,
  "rework": -1,
  "tardiness": -0.00006666666666666667,
  "throughput": 0,
  "wip": -32.71625
}
```
