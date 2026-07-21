# INM Run 001-keep-add-wind-turbine-support-near-generat

- Decision: **KEEP**
- Score: **14.302**
- Result hash: `e3088bb907826b5946dfd8413a90cf7984d2eb8ade2925d8fd1186fe6a635593`
- Bottleneck: smelter-1
- Throughput/min: 5.500
- Target rate: 12.000 gear/min (45.8% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 100%
- Capacity plan: 2 GAPS
- Belt utilization: 1.9%
- Average blocked belt items: 0.000
- Peak belt items: 4
- Powered transport energy: 1155.570 J
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
| coal-assembly-to-splitter | 16.500 / 240.000 | 6.9% | 0 | 33 coal |
| plate-to-station | 14.000 / 240.000 | 5.8% | 0 | 28 iron-plate |
| station-to-assembler | 12.000 / 240.000 | 5.0% | 0 | 24 iron-plate |
| coal-splitter-to-assembler | 10.000 / 240.000 | 4.2% | 0 | 20 coal |
| gear-to-output | 5.500 / 240.000 | 2.3% | 0 | 11 gear |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Grid storage

| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |
| --- | ---: | ---: | ---: | ---: |
| grid-forge-world-generator-1 | 0.000 | 3.600 / 3.600 | 3.600 | 0.000 |

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| station-demand | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| station-supply | 0.000 | 12.000 / 12.000 | 300.000 | 32.340 | 20.340 |

## Score breakdown

```json
{
  "blocked": -1.992,
  "buildCost": -13.42,
  "constraintPenalty": 0,
  "energy": -2.5289807,
  "occupiedArea": -22,
  "onTimeDelivery": 4.583333333333333,
  "throughput": 55,
  "wip": -5.34015
}
```
