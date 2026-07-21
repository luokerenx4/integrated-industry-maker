# INM Run 005-simulate

- Decision: **BASELINE**
- Score: **245.090**
- Result hash: `4782364c096c59dfb00f2c41963e9f4f8fc99e2105210df9f195e1a90afa19ce`
- Bottleneck: none
- Throughput/min: 240.000
- Target rate: 240.000 iron-ore/min (100.0% attained)
- Capacity plan: 1 GAP
- Belt utilization: 10.0%
- Average blocked belt items: 0.000
- Peak belt items: 8
- Powered transport energy: 3.750 J
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

## Score breakdown

```json
{
  "blocked": 0,
  "buildCost": -1.205,
  "constraintPenalty": 0,
  "energy": -0.0000375,
  "occupiedArea": -3.2,
  "onTimeDelivery": 10,
  "throughput": 240,
  "wip": -0.505
}
```
