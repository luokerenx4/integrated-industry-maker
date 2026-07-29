# INM Run 093-simulate

- Decision: **BASELINE**
- Blueprint: `generated-dram-fab`
- Score: **30.884**
- Result hash: `271291ee264f0685996949362662418854d09642eb0c3479f849cde41ab5f3d1`
- Bottleneck: burn-in-1
- Throughput/min: 22.000
- Delivery portfolio: 176.0% demand attainment · 88.000 / 50.000 valued / demanded · 38.000 above demand · 86.000 net value/min
  - Contract `commercial-order`: 52.000 / 32.000 `commercial-dram-device` · 162.5% · 104.000 net value
  - Contract `performance-order`: 24.000 / 12.000 `performance-dram-device` · 200.0% · 120.000 net value
  - Contract `automotive-order`: 12.000 / 6.000 `automotive-dram-device` · 200.0% · 120.000 net value
- Tracked lots: 12 / 12 / 12 completed / released / scheduled · 0 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 9.057 s actual interval · 14.312 s mean / 63.623 s maximum delay · 0 pending
- Release control: conwip · max WIP 6 · reopen at 5 · earliest-due-date · peak 6 active lots · 6 control-blocked / 171.738 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 100.0% on time · mean cycle 61.779 s · p95 75.456 s · mean tardiness 0.000 s
- Quality flow: 100.0% good yield · 83.3% first-pass · 1/3 authored excursion defects prevented · 14 inspections · 2 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 96 / 96 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 5 changeovers · 21.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 27.834 average scored WIP / 124.730 total inventory · 59.000 peak WIP / 180.000 peak total
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.1%
- Average blocked belt items: 0.242
- Peak belt items: 10
- Powered transport energy: 4357.675 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 0 / 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 552076 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| probe-to-packaging | 24.000 / 240.000 | 10.0% | 46800 | 27000 | 14000 | 5800 | 0 | 96 known-good-dram-die |
| packaging-to-burn-in | 24.000 / 240.000 | 10.0% | 0 | 0 | 0 | 0 | 0 | 96 packaged-dram-device |
| substrate-receiving-to-packaging | 24.000 / 240.000 | 10.0% | 0 | 0 | 0 | 0 | 0 | 96 dram-package-substrate |
| commercial-to-customer | 13.000 / 240.000 | 5.4% | 0 | 0 | 0 | 0 | 0 | 52 commercial-dram-device |
| performance-to-customer | 6.000 / 240.000 | 2.5% | 11200 | 6000 | 1300 | 3900 | 0 | 24 performance-dram-device |
| automotive-to-customer | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 automotive-dram-device |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 etched-cell-l1-lot |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 dram-wafer-lot |
| inspection-to-probe | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 qualified-dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 patterned-cell-l1-lot |
| lithography-to-etch-lithography-l2 | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 patterned-cell-l2-lot |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 blank-dram-wafer-lot |
| inspection-to-rework | 0.500 / 240.000 | 0.2% | 0 | 0 | 0 | 0 | 0 | 2 rework-required-dram-wafer-lot |
| rework-to-inspection | 0.500 / 240.000 | 0.2% | 0 | 0 | 0 | 0 | 0 | 2 dram-wafer-lot |
| inspection-to-scrap | 0.000 / 240.000 | 0.0% | 0 | 0 | 0 | 0 | 0 | — |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Objective inventory accounting

| Resource | Scope | Average inventory | Peak inventory | Final inventory |
| --- | --- | ---: | ---: | ---: |
| packaged-dram-device | WIP | 15.153 | 34.000 | 8.000 |
| known-good-dram-die | WIP | 9.593 | 28.000 | 0.000 |
| qualified-dram-wafer-lot | WIP | 0.507 | 2.000 | 0.000 |
| annealed-dielectric-stack-lot | WIP | 0.411 | 2.000 | 0.000 |
| etched-cell-l1-lot | WIP | 0.396 | 2.000 | 0.000 |
| patterned-cell-l1-lot | WIP | 0.395 | 2.000 | 0.000 |
| patterned-cell-l2-lot | WIP | 0.357 | 2.000 | 0.000 |
| blank-dram-wafer-lot | WIP | 0.350 | 2.000 | 0.000 |
| dielectric-stack-lot | WIP | 0.345 | 1.000 | 0.000 |
| dram-wafer-lot | WIP | 0.285 | 2.000 | 0.000 |
| rework-required-dram-wafer-lot | WIP | 0.043 | 1.000 | 0.000 |
| dram-package-substrate | excluded | 40.029 | 93.000 | 0.000 |
| metrology-calibration-kit | excluded | 16.000 | 16.000 | 16.000 |
| metrology-reference-wafer | excluded | 16.000 | 16.000 | 16.000 |
| tool-qualification-wafer | excluded | 11.127 | 16.000 | 8.000 |
| chamber-clean-kit | excluded | 10.860 | 16.000 | 8.000 |
| reticle-mask-set-l1 | excluded | 1.000 | 1.000 | 1.000 |
| reticle-mask-set-l2 | excluded | 1.000 | 1.000 | 1.000 |
| commercial-dram-device | excluded | 0.542 | 8.000 | 0.000 |
| performance-dram-device | excluded | 0.281 | 4.000 | 0.000 |
| automotive-dram-device | excluded | 0.056 | 2.000 | 0.000 |

Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Average inventory | Peak inventory | Final inventory |
| --- | --- | --- | --- | ---: | ---: | ---: |
| buffer:burn-in-1:package-input:packaged-dram-device | packaged-dram-device | buffer | burn-in-1.package-input | 9.781 | 28.000 | 8.000 |
| buffer:packaging-1:die-input:known-good-dram-die | known-good-dram-die | buffer | packaging-1.die-input | 7.966 | 25.000 | 0.000 |
| in-process:burn-in-1:screen-performance-mix:packaged-dram-device | packaged-dram-device | in-process | burn-in-1.screen-performance-mix | 3.750 | 8.000 | 0.000 |
| in-process:burn-in-1:screen-commercial-dram:packaged-dram-device | packaged-dram-device | in-process | burn-in-1.screen-commercial-dram | 1.250 | 8.000 | 0.000 |
| in-process:packaging-1:package-known-good-dram:known-good-dram-die | known-good-dram-die | in-process | packaging-1.package-known-good-dram | 0.600 | 1.000 | 0.000 |
| buffer:probe-1:die-output:known-good-dram-die | known-good-dram-die | buffer | probe-1.die-output | 0.483 | 7.000 | 0.000 |
| in-process:probe-1:probe-sort-dram-standard:qualified-dram-wafer-lot | qualified-dram-wafer-lot | in-process | probe-1.probe-sort-dram-standard | 0.400 | 1.000 | 0.000 |
| in-process:deposition-1:deposit-dielectric-stack:etched-cell-l1-lot | etched-cell-l1-lot | in-process | deposition-1.deposit-dielectric-stack | 0.321 | 1.000 | 0.000 |
| in-process:furnace-1:rapid-anneal-dielectric-stack:dielectric-stack-lot | dielectric-stack-lot | in-process | furnace-1.rapid-anneal-dielectric-stack | 0.300 | 1.000 | 0.000 |
| in-process:lithography-1:pattern-cell-layer-1:blank-dram-wafer-lot | blank-dram-wafer-lot | in-process | lithography-1.pattern-cell-layer-1 | 0.300 | 1.000 | 0.000 |
| in-process:lithography-l2:pattern-cell-layer-2:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | in-process | lithography-l2.pattern-cell-layer-2 | 0.300 | 1.000 | 0.000 |
| in-process:etch-1:etch-cell-layer-1:patterned-cell-l1-lot | patterned-cell-l1-lot | in-process | etch-1.etch-cell-layer-1 | 0.250 | 1.000 | 0.000 |
| in-process:etch-l2:etch-cell-layer-2:patterned-cell-l2-lot | patterned-cell-l2-lot | in-process | etch-l2.etch-cell-layer-2 | 0.250 | 1.000 | 0.000 |
| local-transit:probe-to-packaging:belt:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.belt | 0.233 | 2.000 | 0.000 |
| in-process:inspection-1:inspect-final-pattern-deep:dram-wafer-lot | dram-wafer-lot | in-process | inspection-1.inspect-final-pattern-deep | 0.207 | 1.000 | 0.000 |
| local-transit:probe-to-packaging:unloading:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.unloading | 0.169 | 1.000 | 0.000 |
| local-transit:packaging-to-burn-in:belt:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.belt | 0.160 | 1.000 | 0.000 |
| local-transit:probe-to-packaging:loading:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.loading | 0.142 | 1.000 | 0.000 |
| local-transit:packaging-to-burn-in:unloading:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.unloading | 0.107 | 1.000 | 0.000 |
| local-transit:packaging-to-burn-in:loading:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.loading | 0.104 | 1.000 | 0.000 |
| buffer:etch-1:pattern-input:patterned-cell-l1-lot | patterned-cell-l1-lot | buffer | etch-1.pattern-input | 0.090 | 1.000 | 0.000 |
| buffer:probe-1:wafer-input:qualified-dram-wafer-lot | qualified-dram-wafer-lot | buffer | probe-1.wafer-input | 0.072 | 1.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:belt:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.belt | 0.055 | 1.000 | 0.000 |
| buffer:etch-l2:pattern-input:patterned-cell-l2-lot | patterned-cell-l2-lot | buffer | etch-l2.pattern-input | 0.047 | 1.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:belt:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.belt | 0.035 | 1.000 | 0.000 |
| in-process:rework-1:recover-final-pattern-advanced:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | in-process | rework-1.recover-final-pattern-advanced | 0.033 | 1.000 | 0.000 |
| buffer:lithography-l2:reentrant-input:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | buffer | lithography-l2.reentrant-input | 0.031 | 1.000 | 0.000 |
| local-transit:lithography-to-etch:belt:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.belt | 0.030 | 1.000 | 0.000 |
| buffer:deposition-1:etch-input:etched-cell-l1-lot | etched-cell-l1-lot | buffer | deposition-1.etch-input | 0.025 | 1.000 | 0.000 |
| local-transit:etch-to-deposition:belt:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.belt | 0.025 | 1.000 | 0.000 |
| local-transit:release-to-lithography:belt:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.belt | 0.025 | 1.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:belt:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.belt | 0.020 | 1.000 | 0.000 |
| local-transit:etch-to-inspection:belt:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.belt | 0.020 | 1.000 | 0.000 |
| local-transit:rework-to-inspection:belt:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.belt | 0.018 | 1.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:loading:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.loading | 0.013 | 1.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:unloading:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:loading:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.loading | 0.013 | 1.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:unloading:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:etch-to-deposition:loading:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.loading | 0.013 | 1.000 | 0.000 |
| local-transit:etch-to-deposition:unloading:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:etch-to-inspection:loading:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.loading | 0.013 | 1.000 | 0.000 |
| local-transit:etch-to-inspection:unloading:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:inspection-to-probe:loading:qualified-dram-wafer-lot | qualified-dram-wafer-lot | local-transit | inspection-to-probe.loading | 0.013 | 1.000 | 0.000 |
| local-transit:inspection-to-probe:unloading:qualified-dram-wafer-lot | qualified-dram-wafer-lot | local-transit | inspection-to-probe.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:loading:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.loading | 0.013 | 1.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:unloading:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:lithography-to-etch:loading:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.loading | 0.013 | 1.000 | 0.000 |
| local-transit:lithography-to-etch:unloading:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.unloading | 0.013 | 1.000 | 0.000 |
| local-transit:release-to-lithography:loading:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.loading | 0.013 | 1.000 | 0.000 |
| local-transit:release-to-lithography:unloading:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.unloading | 0.013 | 1.000 | 0.000 |
| buffer:inspection-1:wafer-input:dram-wafer-lot | dram-wafer-lot | buffer | inspection-1.wafer-input | 0.011 | 1.000 | 0.000 |
| local-transit:inspection-to-probe:belt:qualified-dram-wafer-lot | qualified-dram-wafer-lot | local-transit | inspection-to-probe.belt | 0.010 | 1.000 | 0.000 |
| local-transit:inspection-to-rework:belt:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.belt | 0.006 | 1.000 | 0.000 |
| local-transit:inspection-to-rework:loading:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.loading | 0.002 | 1.000 | 0.000 |
| local-transit:inspection-to-rework:unloading:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.unloading | 0.002 | 1.000 | 0.000 |
| local-transit:rework-to-inspection:loading:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.loading | 0.002 | 1.000 | 0.000 |
| local-transit:rework-to-inspection:unloading:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.unloading | 0.002 | 1.000 | 0.000 |

Location averages and final quantities conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.4975,
  "changeovers": -2.5,
  "constraintPenalty": 0,
  "cycleTime": -2.0593083333333335,
  "deliveryValue": 86,
  "electricityCost": 0,
  "energy": -2.057848325,
  "occupiedArea": -14.25,
  "onTimeDelivery": 20,
  "qualityEscapes": 0,
  "rework": -1,
  "tardiness": 0,
  "throughput": 0,
  "wip": -41.75164375
}
```
