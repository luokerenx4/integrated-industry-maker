# INM Run 005-simulate

- Decision: **BASELINE**
- Blueprint: `stacked-cargo`
- Score: **245.090**
- Result hash: `136ea146593a33e8dc81aaebb4dfbd03f15568281983918970a0303b55d5d894`
- Bottleneck: none
- Throughput/min: 240.000
- Tracked lots: 0 / 0 / 0 completed / released / scheduled · 0 scrapped
- Release flow: 0.000 s planned interval · 0.000 s actual interval · 0.000 s mean delay · 0 pending
- Release control: open-loop · peak 0 active lots · 0 control-blocked / 0.000 lot-s · 0 capacity-blocked / 0.000 lot-s · 0 service openings
- Lot service: 100.0% on time · mean cycle 0.000 s · p95 0.000 s · mean tardiness 0.000 s
- Quality flow: 0.0% good yield · 0.0% first-pass · 0 inspections · 0 rework cycles · 0 scrap dispositions · 0 escapes
- Batch processing: 0 jobs · 0 lots · 0.000 lots/job · 0.000 s mean device wait/lot
- Equipment setup: 0 changeovers · 0.000 s work
- Target rate: 240.000 iron-ore/min (100.0% attained)
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

- **extraction** `iron-ore`: iron-ore extraction is short by 240.000/min; add 1 extractor(s)

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
