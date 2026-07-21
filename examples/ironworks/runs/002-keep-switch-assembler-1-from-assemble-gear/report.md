# INM Run 002-keep-switch-assembler-1-from-assemble-gear

- Decision: **KEEP**
- Score: **30.404**
- Result hash: `33bfde495c74870ba50b8379d1fc281b3e4d4f00884d194bcbc4ca538ceaba48`
- Bottleneck: smelter-1
- Throughput/min: 7.000
- Target rate: 12.000 gear/min (58.3% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 1 GAP
- Belt utilization: 1.7%
- Average blocked belt items: 0.000
- Peak belt items: 3
- Powered transport energy: 1147.650 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.000 / 80.000 | 41.3% | 0 | 66 iron-ore |
| coal-assembly-to-splitter | 14.000 / 240.000 | 5.8% | 0 | 28 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| station-to-assembler | 10.500 / 240.000 | 4.4% | 0 | 21 iron-plate |
| coal-splitter-to-assembler | 7.500 / 240.000 | 3.1% | 0 | 15 coal |
| gear-to-output | 7.000 / 240.000 | 2.9% | 0 | 14 gear |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Grid storage

| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |
| --- | ---: | ---: | ---: | ---: |
| grid-forge-zone-generator-1 | 0.000 | 3.600 / 3.600 | 3.600 | 0.000 |

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| station-demand | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| station-supply | 0.000 | 12.000 / 12.000 | 300.000 | 23.300 | 11.300 |

## Score breakdown

```json
{
  "blocked": -2.155,
  "buildCost": -13.42,
  "constraintPenalty": 0,
  "energy": -2.4199825,
  "occupiedArea": -22,
  "onTimeDelivery": 5.833333333333334,
  "throughput": 70,
  "wip": -5.434141666666667
}
```
