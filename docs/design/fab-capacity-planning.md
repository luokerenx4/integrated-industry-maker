# Fab capacity planning

Status: qualification-aware toolset allocation plus Scenario-scheduled tracked-lot and purchased-material supply implemented in `inm-sim/0.66.0`.

Related: [[docs/design/work-center-dispatch]], [[docs/design/lot-release-scheduling]], [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/ARCHITECTURE]], [[docs/PROJECT_FORMAT]], [[docs/CLI]].

## Why this exists

Semiconductor capacity belongs to physical toolsets, not to recipe rows. A lithography bay qualified for two route steps still owns one clock. Summing each operation's exclusive nominal rate would silently reuse that clock and could call an impossible Blueprint READY.

Tracked wafer lots also enter through a Scenario schedule rather than mineral extraction. Treating those fixed releases as missing deposits produces a false raw-material shortage and weakens the benchmark gate exactly where a Coding Agent needs a trustworthy evaluator.

## Qualification-aware allocation

The Objective-derived material balance selects a required rate for each `(Process, mode, region)` operation. The planner converts that rate into required device-ticks per minute. For every `(region, Device asset)` shared by two or more selected operations, it builds a bipartite qualification graph:

- operation nodes demand device-time;
- placed Device nodes each supply 60,000 device-ticks per minute;
- an edge exists only when that physical Device qualifies the exact Process and mode.

A deterministic maximum-flow allocation reports required, allocated, and unallocated device-time for the whole toolset, every operation, and every physical Device. Stable authored ordering resolves equivalent paths. Unallocated time produces a `toolset` capacity gap and a minimum additional qualified-Device count. A Device in another region never contributes.

The ordinary per-Process rows remain useful: they show the exclusive rate, configured qualification count, and obvious missing-operation gaps. They do not override the coupled toolset result. Regional design power counts the minimum concurrent physical work-center count for a flexible toolset instead of charging every qualification as an independent machine.

The target-producing operation is anchored to the Objective's `targetRegion`. When an upstream operation is physically installed in several regions, the non-spatial material demand is divided across those regions in proportion to installed qualified cycle capacity before toolset, transport, and power checks. This preserves real regional machine ownership for already-authored and synthesized factories; the spatial synthesis solver remains responsible for choosing the actual regional production and shipment mix.

## Scheduled external supply

Every matching `Scenario.lotReleases` lot and `Scenario.materialDeliveries` item is evaluator-owned external supply over the selected Scenario horizon. The raw-capacity row exposes:

- configured extraction per minute;
- scheduled lot count and scheduled supply per minute;
- their combined configured supply rate;
- Scenario demand, total supply, and balance.

The planner raises a raw-rate gap only when extraction plus scheduled external supply cannot sustain the target. It raises a Scenario balance gap when finite deposits plus scheduled supply cannot cover the full horizon. Scheduled lots and purchased items are counted at their authored quantity even though actual admission may wait for receiving capacity or Blueprint CONWIP; that temporal behavior belongs to simulation.

## AutoResearch contract

The benchmark freezes World, Scenario, Objective, catalogs, engine version, baseline Blueprint, and case seeds. The candidate Blueprint is the only editable variable. Capacity readiness can therefore be a hard acceptance gate without letting the candidate manufacture work or relax demand.

The built-in research agent reads overloaded toolsets before exclusive per-Process gaps. It duplicates a real placed Device with useful qualifications, preserving the normal cost, area, power, routing, tooling, maintenance, and facility consequences. The locked event simulation and Objective score still decide KEEP or REVERT.

This follows the same experimental separation as [AutoResearch](https://github.com/karpathy/autoresearch): keep the workload and evaluator fixed, edit one implementation artifact, and compare on a stable metric. The industrial capacity formulation is also consistent with semiconductor scheduling literature that models cluster tools as finite shared machines with qualification and re-entry constraints: [cluster-tool capacity planning](https://arxiv.org/abs/1605.00914) and [photolithography scheduling](https://arxiv.org/abs/1708.09488).

## Static boundary

This is a deterministic design-rate feasibility test, not a fab scheduling oracle. It does not add setup/changeover loss, fixed-batch formation, preventive or corrective maintenance, random downtime, utility/tooling contention, release blocking, or dispatch-dependent queue time to device demand. Those mechanisms are explicit in the event simulator and locked benchmarks. Future static margins must remain named, inspectable assumptions rather than hidden utilization discounts.

## Source of truth

- Material and toolset allocation: `packages/inm-core/src/capacity-plan.ts`
- Research proposals: `packages/inm-core/src/research.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio projection: `packages/inm-studio/src/main.tsx`
- DRAM hard-gated benchmark: `examples/memory-fab/benchmarks/dispatch-research.benchmark.json`

## Verification

```bash
bun run inm plan examples/memory-fab --blueprint baseline --scenario steady-production
bun run inm plan examples/memory-fab --blueprint experiment --scenario steady-production
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "fab capacity planning"
```
