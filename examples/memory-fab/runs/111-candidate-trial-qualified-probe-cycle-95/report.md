# INM Run 111-candidate-trial-qualified-probe-cycle-95

- Decision: **TRIAL**
- Candidate: `qualified-probe-cycle-95`
- Candidate proposal: `1a72349dd8ebfd7d55db6db8eef8d8d625ac25721f1a8b1c8f66d047aee6b381`
- Locked review: **KEEP** · `2430f02e1eeedc905da699df2a70e1c3a5c89676749f0c580c8c94cbe6935cbd`
- Blueprint: `generated-dram-fab`
- Score: **-3.389**
- Result hash: `4f7f3ae7d0cd3da9a5280deb3be60c483b1f80a89d6920f7b3e314df1f97345b`
- Bottleneck: burn-in-1
- Throughput/min: 19.500
- Delivery portfolio: 156.0% demand attainment · 78.000 / 50.000 valued / demanded · 28.000 above demand · 86.500 net value/min
  - Contract `commercial-order`: 38.000 / 32.000 `commercial-dram-device` · 118.8% · 76.000 net value
  - Contract `performance-order`: 26.000 / 12.000 `performance-dram-device` · 216.7% · 130.000 net value
  - Contract `automotive-order`: 14.000 / 6.000 `automotive-dram-device` · 233.3% · 140.000 net value
- Tracked lots: 12 / 12 / 12 completed / released / scheduled · 0 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 8.705 s actual interval · 12.856 s mean / 59.756 s maximum delay · 0 pending
- Release control: conwip · max WIP 6 · reopen at 5 · earliest-due-date · peak 6 active lots · 6 control-blocked / 154.270 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 100.0% on time · mean cycle 58.921 s · p95 68.556 s · mean tardiness 0.000 s
- Quality flow: 100.0% good yield · 91.7% first-pass · 2/3 authored excursion defects prevented · 13 inspections · 1 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 96 / 96 actual / nominal units · 100.0% realization · 0 lost
- Source-lot lineage: 12 source lots · 96 created · 78 delivered · 0 discarded · 18 final WIP · 0 commingled jobs
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 5 changeovers · 21.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 52.290 average / 88.000 peak `dram-device-equivalent` · 31.668 average / 59.000 peak raw WIP items · 128.594 average / 181.000 peak total raw items
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 1.8%
- Average blocked belt items: 1.095
- Peak belt items: 7
- Powered transport energy: 4520.291 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 0 / 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 592444 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| probe-to-packaging | 24.000 / 240.000 | 10.0% | 111600 | 70600 | 11500 | 29500 | 0 | 96 known-good-dram-die |
| packaging-to-burn-in | 24.000 / 240.000 | 10.0% | 300 | 0 | 0 | 300 | 0 | 96 packaged-dram-device |
| substrate-receiving-to-packaging | 24.000 / 240.000 | 10.0% | 0 | 0 | 0 | 0 | 0 | 96 dram-package-substrate |
| commercial-to-customer | 9.500 / 240.000 | 4.0% | 800 | 0 | 400 | 400 | 0 | 38 commercial-dram-device |
| performance-to-customer | 6.500 / 240.000 | 2.7% | 149984 | 98384 | 6400 | 45200 | 0 | 26 performance-dram-device |
| automotive-to-customer | 3.500 / 240.000 | 1.5% | 0 | 0 | 0 | 0 | 0 | 14 automotive-dram-device |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 etched-cell-l1-lot |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 dram-wafer-lot |
| inspection-to-probe | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 qualified-dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 patterned-cell-l1-lot |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 blank-dram-wafer-lot |
| lithography-to-etch-lithography-l2 | 3.000 / 480.000 | 0.6% | 0 | 0 | 0 | 0 | 0 | 12 patterned-cell-l2-lot |
| inspection-to-rework | 0.250 / 240.000 | 0.1% | 0 | 0 | 0 | 0 | 0 | 1 rework-required-dram-wafer-lot |
| rework-to-inspection | 0.250 / 240.000 | 0.1% | 0 | 0 | 0 | 0 | 0 | 1 dram-wafer-lot |
| inspection-to-scrap | 0.000 / 240.000 | 0.0% | 0 | 0 | 0 | 0 | 0 | — |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Objective inventory accounting

| Resource | Scope / factor | Average raw | Peak raw | Final raw | Average equivalent | Peak equivalent | Final equivalent |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| packaged-dram-device | WIP ×1 | 17.814 | 38.000 | 16.000 | 17.814 | 38.000 | 16.000 |
| known-good-dram-die | WIP ×1 | 10.908 | 32.000 | 0.000 | 10.908 | 32.000 | 0.000 |
| qualified-dram-wafer-lot | WIP ×8 | 0.486 | 2.000 | 0.000 | 3.889 | 16.000 | 0.000 |
| annealed-dielectric-stack-lot | WIP ×8 | 0.420 | 2.000 | 0.000 | 3.358 | 16.000 | 0.000 |
| patterned-cell-l1-lot | WIP ×8 | 0.400 | 2.000 | 0.000 | 3.197 | 16.000 | 0.000 |
| etched-cell-l1-lot | WIP ×8 | 0.396 | 2.000 | 0.000 | 3.167 | 16.000 | 0.000 |
| blank-dram-wafer-lot | WIP ×8 | 0.350 | 2.000 | 0.000 | 2.800 | 16.000 | 0.000 |
| dielectric-stack-lot | WIP ×8 | 0.345 | 1.000 | 0.000 | 2.760 | 8.000 | 0.000 |
| patterned-cell-l2-lot | WIP ×8 | 0.277 | 2.000 | 0.000 | 2.218 | 16.000 | 0.000 |
| dram-wafer-lot | WIP ×8 | 0.253 | 2.000 | 0.000 | 2.024 | 16.000 | 0.000 |
| rework-required-dram-wafer-lot | WIP ×8 | 0.020 | 1.000 | 0.000 | 0.157 | 8.000 | 0.000 |
| dram-package-substrate | excluded | 39.619 | 91.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| metrology-calibration-kit | excluded | 16.000 | 16.000 | 16.000 | 0.000 | 0.000 | 0.000 |
| metrology-reference-wafer | excluded | 16.000 | 16.000 | 16.000 | 0.000 | 0.000 | 0.000 |
| tool-qualification-wafer | excluded | 11.059 | 16.000 | 8.000 | 0.000 | 0.000 | 0.000 |
| chamber-clean-kit | excluded | 10.793 | 16.000 | 8.000 | 0.000 | 0.000 | 0.000 |
| performance-dram-device | excluded | 1.198 | 8.000 | 2.000 | 0.000 | 0.000 | 0.000 |
| reticle-mask-set-l1 | excluded | 1.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| reticle-mask-set-l2 | excluded | 1.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| commercial-dram-device | excluded | 0.209 | 8.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| automotive-dram-device | excluded | 0.048 | 2.000 | 0.000 | 0.000 | 0.000 | 0.000 |

Only Resources explicitly declared by the selected Objective contribute to the WIP score; each uses its Objective-owned equivalent-unit factor.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Factor | Average raw | Peak raw | Final raw | Average equivalent | Peak equivalent | Final equivalent |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| buffer:burn-in-1:package-input:packaged-dram-device | packaged-dram-device | buffer | burn-in-1.package-input | ×1 | 12.296 | 29.000 | 16.000 | 12.296 | 29.000 | 16.000 |
| buffer:packaging-1:die-input:known-good-dram-die | known-good-dram-die | buffer | packaging-1.die-input | ×1 | 7.573 | 29.000 | 0.000 | 7.573 | 29.000 | 0.000 |
| in-process:burn-in-1:screen-performance-mix:packaged-dram-device | packaged-dram-device | in-process | burn-in-1.screen-performance-mix | ×1 | 4.375 | 8.000 | 0.000 | 4.375 | 8.000 | 0.000 |
| in-process:probe-1:probe-sort-dram-standard:qualified-dram-wafer-lot | qualified-dram-wafer-lot | in-process | probe-1.probe-sort-dram-standard | ×8 | 0.380 | 1.000 | 0.000 | 3.040 | 8.000 | 0.000 |
| in-process:deposition-1:deposit-dielectric-stack:etched-cell-l1-lot | etched-cell-l1-lot | in-process | deposition-1.deposit-dielectric-stack | ×8 | 0.321 | 1.000 | 0.000 | 2.567 | 8.000 | 0.000 |
| in-process:furnace-1:rapid-anneal-dielectric-stack:dielectric-stack-lot | dielectric-stack-lot | in-process | furnace-1.rapid-anneal-dielectric-stack | ×8 | 0.300 | 1.000 | 0.000 | 2.400 | 8.000 | 0.000 |
| in-process:lithography-1:pattern-cell-layer-1:blank-dram-wafer-lot | blank-dram-wafer-lot | in-process | lithography-1.pattern-cell-layer-1 | ×8 | 0.300 | 1.000 | 0.000 | 2.400 | 8.000 | 0.000 |
| in-process:lithography-l2:pattern-cell-layer-2:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | in-process | lithography-l2.pattern-cell-layer-2 | ×8 | 0.300 | 1.000 | 0.000 | 2.400 | 8.000 | 0.000 |
| in-process:etch-1:etch-cell-layer-1:patterned-cell-l1-lot | patterned-cell-l1-lot | in-process | etch-1.etch-cell-layer-1 | ×8 | 0.250 | 1.000 | 0.000 | 2.000 | 8.000 | 0.000 |
| buffer:probe-1:die-output:known-good-dram-die | known-good-dram-die | buffer | probe-1.die-output | ×1 | 1.967 | 24.000 | 0.000 | 1.967 | 24.000 | 0.000 |
| in-process:etch-l2:etch-cell-layer-2:patterned-cell-l2-lot | patterned-cell-l2-lot | in-process | etch-l2.etch-cell-layer-2 | ×8 | 0.217 | 1.000 | 0.000 | 1.733 | 8.000 | 0.000 |
| in-process:inspection-1:inspect-final-pattern-deep:dram-wafer-lot | dram-wafer-lot | in-process | inspection-1.inspect-final-pattern-deep | ×8 | 0.193 | 1.000 | 0.000 | 1.541 | 8.000 | 0.000 |
| buffer:etch-1:pattern-input:patterned-cell-l1-lot | patterned-cell-l1-lot | buffer | etch-1.pattern-input | ×8 | 0.095 | 2.000 | 0.000 | 0.757 | 16.000 | 0.000 |
| in-process:burn-in-1:screen-commercial-dram:packaged-dram-device | packaged-dram-device | in-process | burn-in-1.screen-commercial-dram | ×1 | 0.750 | 8.000 | 0.000 | 0.750 | 8.000 | 0.000 |
| in-process:packaging-1:package-known-good-dram:known-good-dram-die | known-good-dram-die | in-process | packaging-1.package-known-good-dram | ×1 | 0.600 | 1.000 | 0.000 | 0.600 | 1.000 | 0.000 |
| buffer:probe-1:wafer-input:qualified-dram-wafer-lot | qualified-dram-wafer-lot | buffer | probe-1.wafer-input | ×8 | 0.071 | 1.000 | 0.000 | 0.569 | 8.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:belt:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.belt | ×8 | 0.055 | 1.000 | 0.000 | 0.440 | 8.000 | 0.000 |
| local-transit:probe-to-packaging:belt:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.belt | ×1 | 0.411 | 2.000 | 0.000 | 0.411 | 2.000 | 0.000 |
| buffer:lithography-l2:reentrant-input:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | buffer | lithography-l2.reentrant-input | ×8 | 0.040 | 1.000 | 0.000 | 0.318 | 8.000 | 0.000 |
| buffer:etch-l2:pattern-input:patterned-cell-l2-lot | patterned-cell-l2-lot | buffer | etch-l2.pattern-input | ×8 | 0.031 | 1.000 | 0.000 | 0.244 | 8.000 | 0.000 |
| local-transit:lithography-to-etch:belt:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.belt | ×8 | 0.030 | 1.000 | 0.000 | 0.240 | 8.000 | 0.000 |
| local-transit:probe-to-packaging:loading:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.loading | ×1 | 0.234 | 1.000 | 0.000 | 0.234 | 1.000 | 0.000 |
| buffer:deposition-1:etch-input:etched-cell-l1-lot | etched-cell-l1-lot | buffer | deposition-1.etch-input | ×8 | 0.025 | 1.000 | 0.000 | 0.200 | 8.000 | 0.000 |
| local-transit:etch-to-deposition:belt:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.belt | ×8 | 0.025 | 1.000 | 0.000 | 0.200 | 8.000 | 0.000 |
| local-transit:release-to-lithography:belt:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.belt | ×8 | 0.025 | 1.000 | 0.000 | 0.200 | 8.000 | 0.000 |
| local-transit:packaging-to-burn-in:belt:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.belt | ×1 | 0.161 | 1.000 | 0.000 | 0.161 | 1.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:belt:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.belt | ×8 | 0.020 | 1.000 | 0.000 | 0.160 | 8.000 | 0.000 |
| local-transit:etch-to-inspection:belt:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.belt | ×8 | 0.020 | 1.000 | 0.000 | 0.160 | 8.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:belt:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.belt | ×8 | 0.018 | 1.000 | 0.000 | 0.140 | 8.000 | 0.000 |
| in-process:rework-1:recover-final-pattern-advanced:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | in-process | rework-1.recover-final-pattern-advanced | ×8 | 0.017 | 1.000 | 0.000 | 0.133 | 8.000 | 0.000 |
| local-transit:probe-to-packaging:unloading:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.unloading | ×1 | 0.123 | 1.000 | 0.000 | 0.123 | 1.000 | 0.000 |
| local-transit:packaging-to-burn-in:unloading:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.unloading | ×1 | 0.117 | 1.000 | 0.000 | 0.117 | 1.000 | 0.000 |
| local-transit:packaging-to-burn-in:loading:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.loading | ×1 | 0.115 | 1.000 | 0.000 | 0.115 | 1.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:loading:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:unloading:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:loading:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:unloading:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:etch-to-deposition:loading:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:etch-to-deposition:unloading:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:etch-to-inspection:loading:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:etch-to-inspection:unloading:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:inspection-to-probe:loading:qualified-dram-wafer-lot | qualified-dram-wafer-lot | local-transit | inspection-to-probe.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:inspection-to-probe:unloading:qualified-dram-wafer-lot | qualified-dram-wafer-lot | local-transit | inspection-to-probe.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:lithography-to-etch:loading:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:lithography-to-etch:unloading:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:release-to-lithography:loading:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.loading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:release-to-lithography:unloading:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.unloading | ×8 | 0.013 | 1.000 | 0.000 | 0.100 | 8.000 | 0.000 |
| local-transit:inspection-to-probe:belt:qualified-dram-wafer-lot | qualified-dram-wafer-lot | local-transit | inspection-to-probe.belt | ×8 | 0.010 | 1.000 | 0.000 | 0.080 | 8.000 | 0.000 |
| local-transit:rework-to-inspection:belt:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.belt | ×8 | 0.007 | 1.000 | 0.000 | 0.053 | 8.000 | 0.000 |
| buffer:inspection-1:wafer-input:dram-wafer-lot | dram-wafer-lot | buffer | inspection-1.wafer-input | ×8 | 0.007 | 1.000 | 0.000 | 0.053 | 8.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:loading:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.loading | ×8 | 0.006 | 1.000 | 0.000 | 0.050 | 8.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:unloading:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.unloading | ×8 | 0.006 | 1.000 | 0.000 | 0.050 | 8.000 | 0.000 |
| local-transit:inspection-to-rework:loading:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.loading | ×8 | 0.001 | 1.000 | 0.000 | 0.008 | 8.000 | 0.000 |
| local-transit:inspection-to-rework:unloading:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.unloading | ×8 | 0.001 | 1.000 | 0.000 | 0.008 | 8.000 | 0.000 |
| local-transit:rework-to-inspection:loading:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.loading | ×8 | 0.001 | 1.000 | 0.000 | 0.008 | 8.000 | 0.000 |
| local-transit:rework-to-inspection:unloading:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.unloading | ×8 | 0.001 | 1.000 | 0.000 | 0.008 | 8.000 | 0.000 |
| local-transit:inspection-to-rework:belt:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.belt | ×8 | 0.001 | 1.000 | 0.000 | 0.007 | 8.000 | 0.000 |

Raw and equivalent location averages and final quantities both conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Source-lot product lineage

| Exact source-lot set | Resource | Kind | Physical location | Final units |
| --- | --- | --- | --- | ---: |
| dram-lot-07 | packaged-dram-device | buffer | burn-in-1.package-input | 8 |
| dram-lot-08 | packaged-dram-device | buffer | burn-in-1.package-input | 8 |
| dram-lot-09 | performance-dram-device | local-transit | performance-to-customer.belt | 1 |
| dram-lot-09 | performance-dram-device | local-transit | performance-to-customer.unloading | 1 |

A commingled job retains its complete source-lot set; this report never invents per-unit ancestry inside a mixed batch.

## Finite recipe campaigns

No Device uses a finite authored recipe campaign.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.492,
  "changeovers": -2.5,
  "constraintPenalty": 0,
  "cycleTime": -1.9640222222222221,
  "deliveryValue": 86.5,
  "electricityCost": 0,
  "energy": -2.0478704909999816,
  "occupiedArea": -12.950000000000001,
  "onTimeDelivery": 20,
  "qualityEscapes": 0,
  "rework": -0.5,
  "tardiness": 0,
  "throughput": 0,
  "wip": -78.4355
}
```
