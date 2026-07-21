# INM Run 001-keep-add-wind-turbine-support-near-generat

- Decision: **KEEP**
- Score: **8.707**
- Result hash: `84585eec5f0c29a1234d6edc3e93a2cc1c96e2a69166e602ff43fb4008aa048a`
- Bottleneck: smelter-1
- Throughput/min: 5.000
- Target rate: 12.000 gear/min (41.7% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 2 GAPS
- Belt utilization: 1.8%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 1149.150 J
- High-speed carrier missions: 0
- Carrier missions / completed returns: 5 / 4
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **reserve** `iron-ore`: iron-ore reserve is short by 6.000 items over the scenario

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 33.000 / 80.000 | 41.3% | 0 | 66 iron-ore |
| coal-assembly-to-splitter | 15.500 / 240.000 | 6.5% | 0 | 31 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| station-to-assembler | 10.500 / 240.000 | 4.4% | 0 | 21 iron-plate |
| coal-splitter-to-assembler | 9.000 / 240.000 | 3.8% | 0 | 18 coal |
| gear-to-output | 5.000 / 240.000 | 2.1% | 0 | 10 gear |
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
  "blocked": -2.105,
  "buildCost": -13.42,
  "constraintPenalty": 0,
  "energy": -2.4255675,
  "occupiedArea": -22,
  "onTimeDelivery": 4.166666666666667,
  "throughput": 50,
  "wip": -5.5094
}
```
