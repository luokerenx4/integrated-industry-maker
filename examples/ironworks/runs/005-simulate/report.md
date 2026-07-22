# INM Run 005-simulate

- Decision: **BASELINE**
- Blueprint: `stacked-cargo`
- Score: **245.090**
- Result hash: `8f6866d29e8e52c2441a39f3330cc2b868b25e366f667ab799ce7d8fb60dfd1d`
- Bottleneck: none
- Throughput/min: 240.000
- Delivery portfolio: 100.0% demand attainment · 8.000 / 8.000 valued / demanded · 0.000 above demand · 0.000 net value/min
  - Contract `primary`: 8.000 / 8.000 `iron-ore` · 100.0% · 0.000 net value
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 100.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Lot-derived output: 0 / 0 actual / nominal units · 100.0% realization · 0 lost
- Route Q-time: 0 violations across 0 lots · 0.000 s maximum overrun
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot
- Equipment setup: 0 changeovers · 0.000 s work · 0 campaign holds / 0.000 s (0 lot-ready / 0 timeout)
- Primary target rate: 240.000 iron-ore/min
- Capacity delivery targets: 240.000 iron-ore/min
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 1 GAP
- Belt utilization: 10.0%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 7.000 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 0 / 0
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **extraction** `iron-ore`: iron-ore supply is short by 240.000/min after 0.000/min scheduled external supply; add 1 extractor(s)

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| stacked-link | 240.000 / 1920.000 | 12.5% | 0 | 8 iron-ore |

## Grid storage

No configured accumulators.

## Station carrier energy

No configured logistics stations.

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -1.205,
  "changeovers": 0,
  "constraintPenalty": 0,
  "cycleTime": 0,
  "deliveryValue": 0,
  "energy": -0.00007000000000000001,
  "occupiedArea": -3.2,
  "onTimeDelivery": 10,
  "qualityEscapes": 0,
  "rework": 0,
  "tardiness": 0,
  "throughput": 240,
  "wip": -0.505
}
```
