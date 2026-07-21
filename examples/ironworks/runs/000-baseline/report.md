# INM Run 000-baseline

- Decision: **BASELINE**
- Score: **5.278**
- Result hash: `4c0deadc15310b68689c20b45f6d8a7293cf59da99efdc75100625260529335d`
- Bottleneck: smelter-1
- Throughput/min: 4.500
- Target rate: 12.000 gear/min (37.5% attained)
- Power allocation: proportional
- Minimum grid satisfaction: 77.6699%
- Capacity plan: 3 GAPS
- Belt utilization: 1.6%
- Average blocked belt items: 0.000
- Peak belt items: 3
- Powered transport energy: 1066.395 J
- Material treated: none
- Treatment agents consumed: none
- Aggregate unpowered time: 0 device-ticks
- Feasible: yes

## Capacity-plan gaps

- **process** `smelt-iron`: smelt-iron needs 2 smelter but configures 1; add 1
- **reserve** `iron-ore`: iron-ore reserve is short by 6.000 items over the scenario
- **power** `forge-world`: forge-world needs 422.000 W additional rated generation

## Measured transport flows

| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |
| --- | ---: | ---: | ---: | --- |
| ore-to-smelter | 28.000 / 80.000 | 35.0% | 0 | 56 iron-ore |
| coal-assembly-to-splitter | 15.000 / 240.000 | 6.3% | 0 | 30 coal |
| plate-to-station | 11.500 / 240.000 | 4.8% | 0 | 23 iron-plate |
| station-to-assembler | 9.500 / 240.000 | 4.0% | 0 | 19 iron-plate |
| coal-splitter-to-assembler | 8.500 / 240.000 | 3.5% | 0 | 17 coal |
| gear-to-output | 4.500 / 240.000 | 1.9% | 0 | 9 gear |
| coal-forge-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |
| coal-splitter-to-generator | 2.500 / 240.000 | 1.0% | 0 | 5 coal |

## Grid storage

| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |
| --- | ---: | ---: | ---: | ---: |
| grid-forge-world-generator-1 | 0.000 | 0.355 / 3.600 | 0.631 | 0.276 |

## Station carrier energy

| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |
| --- | ---: | ---: | ---: | ---: | ---: |
| station-demand | 0.000 | 12.000 / 12.000 | 300.000 | 12.000 | 0.000 |
| station-supply | 0.000 | 12.000 / 12.000 | 300.000 | 27.820 | 15.820 |

## Score breakdown

```json
{
  "blocked": -2.05255,
  "buildCost": -12.72,
  "constraintPenalty": 0,
  "energy": -2.27907859,
  "occupiedArea": -21.200000000000003,
  "onTimeDelivery": 3.75,
  "throughput": 45,
  "wip": -5.2206125000000005
}
```
