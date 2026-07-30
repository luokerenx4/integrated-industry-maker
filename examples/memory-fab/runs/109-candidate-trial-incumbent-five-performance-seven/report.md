# INM Run 109-candidate-trial-incumbent-five-performance-seven

- Decision: **TRIAL**
- Candidate: `incumbent-five-performance-seven-commercial`
- Candidate proposal: `adf8e8c7f5d75921584bc8c5f4c92ae30b61dd2c2dea2153552c93fb2dd5e763`
- Locked review: **KEEP** · `320ad510ada4d407c453cc689c48ef592048e1080a939aae8349d84a0f89a1fd`
- Blueprint: `generated-dram-fab`
- Score: **-5.549**
- Result hash: `fecbe4692476682d010e07116e53afb376a127b4fd33f942194ec3260772bfe5`
- Bottleneck: burn-in-1
- Throughput/min: 24.000
- Delivery portfolio: 192.0% demand attainment · 96.000 / 50.000 valued / demanded · 46.000 above demand · 83.000 net value/min
  - Contract `commercial-order`: 66.000 / 32.000 `commercial-dram-device` · 206.3% · 132.000 net value
  - Contract `performance-order`: 20.000 / 12.000 `performance-dram-device` · 166.7% · 100.000 net value
  - Contract `automotive-order`: 10.000 / 6.000 `automotive-dram-device` · 166.7% · 100.000 net value
- Tracked lots: 12 / 12 / 12 completed / released / scheduled · 0 scrapped in family `dram-wafer`
- Release flow: 6.000 s planned interval · 8.911 s actual interval · 13.511 s mean / 62.023 s maximum delay · 0 pending
- Release control: conwip · max WIP 6 · reopen at 5 · earliest-due-date · peak 6 active lots · 6 control-blocked / 162.138 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings / 0 protected releases
- Lot service: 100.0% on time · mean cycle 60.432 s · p95 78.023 s · mean tardiness 0.000 s
- Quality flow: 100.0% good yield · 83.3% first-pass · 1/3 authored excursion defects prevented · 14 inspections · 2 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 96 / 96 actual / nominal units · 100.0% realization · 0 lost
- Source-lot lineage: 12 source lots · 96 created · 96 delivered · 0 discarded · 0 final WIP · 0 commingled jobs
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot · 0 formation holds / 0.000 s (0 full-batch / 0 timeout)
- Equipment setup: 4 changeovers · 18.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Finite recipe campaigns: 1 Devices · 1 complete · 12 completed jobs
- Equipment energy states: 0 sleeps · 0 wakeups · 0.000 equipment-s sleeping · 0.000 equipment-s waking
- Inventory accounting: 51.361 average / 88.000 peak `dram-device-equivalent` · 30.210 average / 64.000 peak raw WIP items · 127.565 average / 180.000 peak total raw items
- Electricity cost: 0.000000 currency · 0.000000 energy · 0.000000 peak demand
- Primary target rate: 8.000 commercial-dram-device/min
- Capacity delivery targets: 8.000 commercial-dram-device/min + 3.000 performance-dram-device/min + 1.500 automotive-dram-device/min
- Power allocation: priority-load-shedding
- Minimum grid satisfaction: 100%
- Capacity plan: READY
- Belt utilization: 2.1%
- Average blocked belt items: 1.434
- Peak belt items: 7
- Powered transport energy: 4560.376 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 0 / 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 677086 device-ticks
- Feasible: yes

## Capacity-plan gaps

- None; the selected blueprint provisions the complete target-rate plan.

## Measured transport flows

Necessary transit is context; blocked item-time is partitioned by its immediate physical cause.

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Line contention | Endpoint capacity | Endpoint power | Endpoint failure | Delivered resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| probe-to-packaging | 24.000 / 240.000 | 10.0% | 193500 | 125800 | 48000 | 19700 | 0 | 96 known-good-dram-die |
| packaging-to-burn-in | 24.000 / 240.000 | 10.0% | 2300 | 0 | 200 | 2100 | 0 | 96 packaged-dram-device |
| substrate-receiving-to-packaging | 24.000 / 240.000 | 10.0% | 0 | 0 | 0 | 0 | 0 | 96 dram-package-substrate |
| commercial-to-customer | 16.500 / 240.000 | 6.9% | 800 | 0 | 400 | 400 | 0 | 66 commercial-dram-device |
| performance-to-customer | 5.000 / 240.000 | 2.1% | 147452 | 96252 | 6600 | 44600 | 0 | 20 performance-dram-device |
| batch-furnace-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 annealed-dielectric-stack-lot |
| deposition-to-batch-furnace | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 dielectric-stack-lot |
| etch-to-deposition | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 etched-cell-l1-lot |
| etch-to-inspection | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 dram-wafer-lot |
| inspection-to-probe | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 qualified-dram-wafer-lot |
| lithography-to-etch | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 patterned-cell-l1-lot |
| release-to-lithography | 3.000 / 240.000 | 1.3% | 0 | 0 | 0 | 0 | 0 | 12 blank-dram-wafer-lot |
| automotive-to-customer | 2.500 / 240.000 | 1.0% | 0 | 0 | 0 | 0 | 0 | 10 automotive-dram-device |
| lithography-to-etch-lithography-l2 | 3.000 / 480.000 | 0.6% | 0 | 0 | 0 | 0 | 0 | 12 patterned-cell-l2-lot |
| inspection-to-rework | 0.500 / 240.000 | 0.2% | 0 | 0 | 0 | 0 | 0 | 2 rework-required-dram-wafer-lot |
| rework-to-inspection | 0.500 / 240.000 | 0.2% | 0 | 0 | 0 | 0 | 0 | 2 dram-wafer-lot |
| inspection-to-scrap | 0.000 / 240.000 | 0.0% | 0 | 0 | 0 | 0 | 0 | — |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Objective inventory accounting

| Resource | Scope / factor | Average raw | Peak raw | Final raw | Average equivalent | Peak equivalent | Final equivalent |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| packaged-dram-device | WIP ×1 | 16.866 | 41.000 | 0.000 | 16.866 | 41.000 | 0.000 |
| known-good-dram-die | WIP ×1 | 10.322 | 30.000 | 0.000 | 10.322 | 30.000 | 0.000 |
| qualified-dram-wafer-lot | WIP ×8 | 0.525 | 3.000 | 0.000 | 4.201 | 24.000 | 0.000 |
| annealed-dielectric-stack-lot | WIP ×8 | 0.418 | 2.000 | 0.000 | 3.345 | 16.000 | 0.000 |
| etched-cell-l1-lot | WIP ×8 | 0.396 | 2.000 | 0.000 | 3.167 | 16.000 | 0.000 |
| patterned-cell-l1-lot | WIP ×8 | 0.395 | 2.000 | 0.000 | 3.157 | 16.000 | 0.000 |
| blank-dram-wafer-lot | WIP ×8 | 0.350 | 2.000 | 0.000 | 2.800 | 16.000 | 0.000 |
| dielectric-stack-lot | WIP ×8 | 0.345 | 1.000 | 0.000 | 2.760 | 8.000 | 0.000 |
| patterned-cell-l2-lot | WIP ×8 | 0.277 | 2.000 | 0.000 | 2.218 | 16.000 | 0.000 |
| dram-wafer-lot | WIP ×8 | 0.277 | 2.000 | 0.000 | 2.212 | 16.000 | 0.000 |
| rework-required-dram-wafer-lot | WIP ×8 | 0.039 | 1.000 | 0.000 | 0.313 | 8.000 | 0.000 |
| dram-package-substrate | excluded | 39.900 | 92.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| metrology-calibration-kit | excluded | 16.000 | 16.000 | 16.000 | 0.000 | 0.000 | 0.000 |
| metrology-reference-wafer | excluded | 16.000 | 16.000 | 16.000 | 0.000 | 0.000 | 0.000 |
| tool-qualification-wafer | excluded | 11.087 | 16.000 | 8.000 | 0.000 | 0.000 | 0.000 |
| chamber-clean-kit | excluded | 10.820 | 16.000 | 8.000 | 0.000 | 0.000 | 0.000 |
| performance-dram-device | excluded | 1.108 | 8.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| reticle-mask-set-l1 | excluded | 1.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| reticle-mask-set-l2 | excluded | 1.000 | 1.000 | 1.000 | 0.000 | 0.000 | 0.000 |
| commercial-dram-device | excluded | 0.405 | 8.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| automotive-dram-device | excluded | 0.034 | 2.000 | 0.000 | 0.000 | 0.000 | 0.000 |

Only Resources explicitly declared by the selected Objective contribute to the WIP score; each uses its Objective-owned equivalent-unit factor.

### Physical WIP locations

| Location ID | Resource | Kind | Physical location | Factor | Average raw | Peak raw | Final raw | Average equivalent | Peak equivalent | Final equivalent |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| buffer:burn-in-1:package-input:packaged-dram-device | packaged-dram-device | buffer | burn-in-1.package-input | ×1 | 11.522 | 32.000 | 0.000 | 11.522 | 32.000 | 0.000 |
| buffer:packaging-1:die-input:known-good-dram-die | known-good-dram-die | buffer | packaging-1.die-input | ×1 | 4.376 | 23.000 | 0.000 | 4.376 | 23.000 | 0.000 |
| buffer:probe-1:die-output:known-good-dram-die | known-good-dram-die | buffer | probe-1.die-output | ×1 | 4.073 | 21.000 | 0.000 | 4.073 | 21.000 | 0.000 |
| in-process:probe-1:probe-sort-dram-standard:qualified-dram-wafer-lot | qualified-dram-wafer-lot | in-process | probe-1.probe-sort-dram-standard | ×8 | 0.400 | 1.000 | 0.000 | 3.200 | 8.000 | 0.000 |
| in-process:burn-in-1:screen-performance-mix:packaged-dram-device | packaged-dram-device | in-process | burn-in-1.screen-performance-mix | ×1 | 3.125 | 8.000 | 0.000 | 3.125 | 8.000 | 0.000 |
| in-process:deposition-1:deposit-dielectric-stack:etched-cell-l1-lot | etched-cell-l1-lot | in-process | deposition-1.deposit-dielectric-stack | ×8 | 0.321 | 1.000 | 0.000 | 2.567 | 8.000 | 0.000 |
| in-process:furnace-1:rapid-anneal-dielectric-stack:dielectric-stack-lot | dielectric-stack-lot | in-process | furnace-1.rapid-anneal-dielectric-stack | ×8 | 0.300 | 1.000 | 0.000 | 2.400 | 8.000 | 0.000 |
| in-process:lithography-1:pattern-cell-layer-1:blank-dram-wafer-lot | blank-dram-wafer-lot | in-process | lithography-1.pattern-cell-layer-1 | ×8 | 0.300 | 1.000 | 0.000 | 2.400 | 8.000 | 0.000 |
| in-process:lithography-l2:pattern-cell-layer-2:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | in-process | lithography-l2.pattern-cell-layer-2 | ×8 | 0.300 | 1.000 | 0.000 | 2.400 | 8.000 | 0.000 |
| in-process:etch-1:etch-cell-layer-1:patterned-cell-l1-lot | patterned-cell-l1-lot | in-process | etch-1.etch-cell-layer-1 | ×8 | 0.250 | 1.000 | 0.000 | 2.000 | 8.000 | 0.000 |
| in-process:burn-in-1:screen-commercial-dram:packaged-dram-device | packaged-dram-device | in-process | burn-in-1.screen-commercial-dram | ×1 | 1.750 | 8.000 | 0.000 | 1.750 | 8.000 | 0.000 |
| in-process:etch-l2:etch-cell-layer-2:patterned-cell-l2-lot | patterned-cell-l2-lot | in-process | etch-l2.etch-cell-layer-2 | ×8 | 0.217 | 1.000 | 0.000 | 1.733 | 8.000 | 0.000 |
| in-process:inspection-1:inspect-final-pattern-deep:dram-wafer-lot | dram-wafer-lot | in-process | inspection-1.inspect-final-pattern-deep | ×8 | 0.207 | 1.000 | 0.000 | 1.659 | 8.000 | 0.000 |
| buffer:probe-1:wafer-input:qualified-dram-wafer-lot | qualified-dram-wafer-lot | buffer | probe-1.wafer-input | ×8 | 0.090 | 2.000 | 0.000 | 0.721 | 16.000 | 0.000 |
| buffer:etch-1:pattern-input:patterned-cell-l1-lot | patterned-cell-l1-lot | buffer | etch-1.pattern-input | ×8 | 0.090 | 1.000 | 0.000 | 0.717 | 8.000 | 0.000 |
| local-transit:probe-to-packaging:belt:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.belt | ×1 | 0.640 | 2.000 | 0.000 | 0.640 | 2.000 | 0.000 |
| in-process:packaging-1:package-known-good-dram:known-good-dram-die | known-good-dram-die | in-process | packaging-1.package-known-good-dram | ×1 | 0.600 | 1.000 | 0.000 | 0.600 | 1.000 | 0.000 |
| local-transit:batch-furnace-to-lithography:belt:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | local-transit | batch-furnace-to-lithography.belt | ×8 | 0.055 | 1.000 | 0.000 | 0.440 | 8.000 | 0.000 |
| local-transit:probe-to-packaging:loading:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.loading | ×1 | 0.347 | 1.000 | 0.000 | 0.347 | 1.000 | 0.000 |
| buffer:lithography-l2:reentrant-input:annealed-dielectric-stack-lot | annealed-dielectric-stack-lot | buffer | lithography-l2.reentrant-input | ×8 | 0.038 | 1.000 | 0.000 | 0.305 | 8.000 | 0.000 |
| local-transit:probe-to-packaging:unloading:known-good-dram-die | known-good-dram-die | local-transit | probe-to-packaging.unloading | ×1 | 0.287 | 1.000 | 0.000 | 0.287 | 1.000 | 0.000 |
| in-process:rework-1:recover-final-pattern-advanced:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | in-process | rework-1.recover-final-pattern-advanced | ×8 | 0.033 | 1.000 | 0.000 | 0.267 | 8.000 | 0.000 |
| buffer:etch-l2:pattern-input:patterned-cell-l2-lot | patterned-cell-l2-lot | buffer | etch-l2.pattern-input | ×8 | 0.031 | 1.000 | 0.000 | 0.244 | 8.000 | 0.000 |
| local-transit:lithography-to-etch:belt:patterned-cell-l1-lot | patterned-cell-l1-lot | local-transit | lithography-to-etch.belt | ×8 | 0.030 | 1.000 | 0.000 | 0.240 | 8.000 | 0.000 |
| buffer:deposition-1:etch-input:etched-cell-l1-lot | etched-cell-l1-lot | buffer | deposition-1.etch-input | ×8 | 0.025 | 1.000 | 0.000 | 0.200 | 8.000 | 0.000 |
| local-transit:etch-to-deposition:belt:etched-cell-l1-lot | etched-cell-l1-lot | local-transit | etch-to-deposition.belt | ×8 | 0.025 | 1.000 | 0.000 | 0.200 | 8.000 | 0.000 |
| local-transit:release-to-lithography:belt:blank-dram-wafer-lot | blank-dram-wafer-lot | local-transit | release-to-lithography.belt | ×8 | 0.025 | 1.000 | 0.000 | 0.200 | 8.000 | 0.000 |
| local-transit:packaging-to-burn-in:belt:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.belt | ×1 | 0.170 | 2.000 | 0.000 | 0.170 | 2.000 | 0.000 |
| local-transit:deposition-to-batch-furnace:belt:dielectric-stack-lot | dielectric-stack-lot | local-transit | deposition-to-batch-furnace.belt | ×8 | 0.020 | 1.000 | 0.000 | 0.160 | 8.000 | 0.000 |
| local-transit:etch-to-inspection:belt:dram-wafer-lot | dram-wafer-lot | local-transit | etch-to-inspection.belt | ×8 | 0.020 | 1.000 | 0.000 | 0.160 | 8.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:belt:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.belt | ×8 | 0.018 | 1.000 | 0.000 | 0.140 | 8.000 | 0.000 |
| local-transit:packaging-to-burn-in:loading:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.loading | ×1 | 0.128 | 1.000 | 0.000 | 0.128 | 1.000 | 0.000 |
| local-transit:rework-to-inspection:belt:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.belt | ×8 | 0.013 | 1.000 | 0.000 | 0.107 | 8.000 | 0.000 |
| local-transit:packaging-to-burn-in:unloading:packaged-dram-device | packaged-dram-device | local-transit | packaging-to-burn-in.unloading | ×1 | 0.102 | 1.000 | 0.000 | 0.102 | 1.000 | 0.000 |
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
| buffer:packaging-1:package-output:packaged-dram-device | packaged-dram-device | buffer | packaging-1.package-output | ×1 | 0.070 | 4.000 | 0.000 | 0.070 | 4.000 | 0.000 |
| buffer:inspection-1:wafer-input:dram-wafer-lot | dram-wafer-lot | buffer | inspection-1.wafer-input | ×8 | 0.007 | 1.000 | 0.000 | 0.053 | 8.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:loading:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.loading | ×8 | 0.006 | 1.000 | 0.000 | 0.050 | 8.000 | 0.000 |
| local-transit:lithography-to-etch-lithography-l2:unloading:patterned-cell-l2-lot | patterned-cell-l2-lot | local-transit | lithography-to-etch-lithography-l2.unloading | ×8 | 0.006 | 1.000 | 0.000 | 0.050 | 8.000 | 0.000 |
| local-transit:inspection-to-rework:loading:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.loading | ×8 | 0.002 | 1.000 | 0.000 | 0.017 | 8.000 | 0.000 |
| local-transit:inspection-to-rework:unloading:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.unloading | ×8 | 0.002 | 1.000 | 0.000 | 0.017 | 8.000 | 0.000 |
| local-transit:rework-to-inspection:loading:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.loading | ×8 | 0.002 | 1.000 | 0.000 | 0.017 | 8.000 | 0.000 |
| local-transit:rework-to-inspection:unloading:dram-wafer-lot | dram-wafer-lot | local-transit | rework-to-inspection.unloading | ×8 | 0.002 | 1.000 | 0.000 | 0.017 | 8.000 | 0.000 |
| local-transit:inspection-to-rework:belt:rework-required-dram-wafer-lot | rework-required-dram-wafer-lot | local-transit | inspection-to-rework.belt | ×8 | 0.002 | 1.000 | 0.000 | 0.013 | 8.000 | 0.000 |

Raw and equivalent location averages and final quantities both conserve to Objective WIP. Per-location peaks are exact but not additive because locations can peak at different times.

## Source-lot product lineage

No source-lot-bearing product remains in physical WIP at the final boundary.

A commingled job retains its complete source-lot set; this report never invents per-unit ancestry inside a mixed batch.

## Finite recipe campaigns

| Device | Completed jobs | Current authored position | Completed at tick |
| --- | ---: | --- | ---: |
| burn-in-1 | 12 | complete | 228873 |

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -11.492,
  "changeovers": -2,
  "constraintPenalty": 0,
  "cycleTime": -2.0143944444444446,
  "deliveryValue": 83,
  "electricityCost": 0,
  "energy": -2.0509430775000004,
  "occupiedArea": -12.950000000000001,
  "onTimeDelivery": 20,
  "qualityEscapes": 0,
  "rework": -1,
  "tardiness": 0,
  "throughput": 0,
  "wip": -77.0419
}
```
