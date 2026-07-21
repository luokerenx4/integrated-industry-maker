# INM Run 005-simulate

- Decision: **BASELINE**
- Score: **245.090**
- Result hash: `919f0d10d82c0d69dcf8e9dac9e67b293088d1083c3d1cb3240949179d54c2bc`
- Bottleneck: none
- Throughput/min: 240.000
- Target rate: 240.000 iron-ore/min (100.0% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 1 GAP
- Belt utilization: 10.0%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 7.000 J
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
  "constraintPenalty": 0,
  "energy": -0.00007000000000000001,
  "occupiedArea": -3.2,
  "onTimeDelivery": 10,
  "throughput": 240,
  "wip": -0.505
}
```
