# Setup campaign control

Status: Blueprint-authored minimum-ready-lot setup campaigns with maximum-hold service protection, deterministic timeout wakeups, causal events, metrics, Studio projection, and memory-fab parameter research implemented through engine version `inm-sim/0.55.0`.

Related: [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/lot-tracking]], [[docs/design/wip-release-control]], [[docs/design/coding-agent-optimization]], [[docs/design/simulation-runtime]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why campaign formation is separate from dispatch

An urgency rule chooses the best ready wafer lot now. A campaign rule decides whether changing the physical equipment state now is worth fragmenting a mask or recipe run. Those are different control questions. A semiconductor work center may keep its current setup while the next recipe family accumulates WIP, but an unbounded wait can starve hot lots and destroy delivery service.

INM keeps the physical setup group and directed transition-specific changeover duration/power in benchmark-owned Process and Device assets. The candidate Blueprint owns only the operating rule:

```json
"policy": {
  "recipeDispatch": "earliest-due-date",
  "lotDispatch": "earliest-due-date",
  "setupCampaign": {
    "minimumReadyLots": 3,
    "maximumHoldTicks": 12000
  }
}
```

The compiler accepts this policy only on a changeover-capable shared work center with at least two qualified setup groups. Every qualified operation must preserve tracked lot identity, because `minimumReadyLots` counts exact resident lot ids rather than fungible inventory.

## Runtime semantics

Campaign control is evaluated only while equipment is idle:

1. If a ready operation matches the current setup group, it extends that campaign without a changeover.
2. When only another setup group is ready and has fewer than `minimumReadyLots`, the engine records a held target and exact deadline.
3. Work in the current setup group may continue while that target remains held; its original deadline is not reset.
4. The target changeover is released as soon as its resident WIP reaches the threshold, or after `maximumHoldTicks`, whichever comes first.
5. A zero maximum hold disables waiting while retaining the same explicit policy shape.

The timeout is an event-queue boundary, not a polling approximation. A factory with no intervening arrivals wakes at the exact deadline. The target WIP remains in its physical buffers, accumulates ordinary queue time, and is never invisibly reserved or consumed before the eventual powered changeover.

`device.campaign-held` records source/target setup, current ready lots, threshold, and deadline. `device.campaign-released` records held time and causal release `minimum-ready-lots` or `maximum-hold`. `FactoryState.devices[*].setup.campaign` makes an active hold inspectable in an intermediate state. `FactoryMetrics.equipmentSetups` aggregates holds, hold ticks, and both release causes for CLI, immutable reports, comparisons, benchmarks, and Studio.

## Memory-fab research evidence

`bun run memory-fab:research-campaign` searches campaign scope, lot threshold, and hold duration against the same four locked cases as the candidate Blueprint. Optional `--maximum-wip`, `--reopen-at-wip`, and `--release-dispatch` cross campaign control with a fixed CONWIP setting without editing project files.

The first open-loop sweep evaluated 120 policies. Its best active campaign held etch for one second, preserved two total changeovers, and scored `30.864889`, below the `30.986131` incumbent. A focused CONWIP `10/4/fifo` sweep found a stronger aggregate `32.949405`, but steady production remained `2.636681` points below the locked baseline and failed the two-point case gate. A less aggressive CONWIP `11/6/fifo` campaign stayed inside the case gate but scored `30.806472`, also below the incumbent. The checked-in candidate therefore keeps campaign control disabled.

This negative result is useful: setup fragmentation is not repaired by idle holding alone in the current one-tool topology. The next physical hypotheses are parallel tool capacity, setup-group-specialized equipment, and cleaning/maintenance calendars. Campaign control remains a first-class Blueprint dimension for those layouts.

The separate greenfield Design Program later reaches a different local context after release, maintenance, and facility repair. Its `3 / 12000` lithography campaign is aggregate-profitable but violates only the locked `lithography-interruption` case by `-0.054667` relative to the current leader. `strategies/research/campaign-repair.ts` reloads that immutable leader and the five-case Benchmark. A focused `minimumReadyLots: 3` sweep over hold thresholds from zero through three seconds finds every positive hold still regresses the interruption case; `3 / 0` alone is promotable. The resulting no-wait repair changes none of the first four leader case scores and improves `facility-interruption` by `+1.707292`, so the unchanged evaluator promotes it. The evidence does not imply that zero hold reduced setup work—it proves that preserving the explicit campaign shape without voluntary waiting is the robust policy at this frontier point.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm analyze examples/memory-fab --blueprint experiment
bun run memory-fab:research-campaign
bun run memory-fab:research-campaign -- --maximum-wip 10 --reopen-at-wip 4 --release-dispatch fifo
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run inm design examples/memory-fab --program greenfield-dram-fab --run --max-candidates 4 --json
bun examples/memory-fab/strategies/research/campaign-repair.ts --program greenfield-dram-fab --run-id 1628f3a52f31ff6d670f3e844315fa73d5232d8000a7b09c09974aa47f832263
```
