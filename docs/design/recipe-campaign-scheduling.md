# Finite recipe campaign scheduling

Status: strict Blueprint-owned finite work-center campaigns, deterministic runtime progress, immutable events/metrics, CLI, Observation, and Studio projection implemented in `inm-sim/0.92.0`.

Related: [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/production-plans]], [[docs/design/source-lot-product-lineage]], [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/PROJECT_FORMAT]], and [[docs/CLI]].

## Why a finite campaign is a different control boundary

Open-ended dispatch chooses among whatever work is ready. That is appropriate for continuing operation, but it cannot represent an engineer's falsifiable statement such as “run five performance batches, then seven commercial batches, then stop.” Encoding that intent as priorities, an adaptive optimizer, or prose loses the exact schedule and makes the result hard to reproduce.

A finite recipe campaign is explicit equipment operating intent. A human or reasoning Agent authors the sequence; Core validates and executes it. INM does not generate, reorder, repeat, optimize, or automatically apply campaigns.

It is also distinct from a Production Plan. The Production Plan owns external material and tracked-lot releases, priorities, and due dates. A recipe campaign owns only the order and count of successful jobs on one already-qualified Device. Ordinary material, release, setup, tooling, utility, power, failure, maintenance, output-capacity, lineage, transport, delivery, and Objective physics remain authoritative.

## Blueprint contract

```json
{
  "policy": {
    "recipeCampaign": {
      "steps": [
        {
          "process": "screen-performance-mix",
          "mode": "agile-screening-5-8",
          "jobs": 5
        },
        {
          "process": "screen-commercial-dram",
          "mode": "agile-screening-5-8",
          "jobs": 7
        }
      ]
    }
  }
}
```

`steps` is non-empty. Every `jobs` value is a positive integer, and every `(process, mode)` pair must resolve to exactly one operation already qualified on that Device. Campaign intent therefore cannot silently widen equipment capability.

The policy is mutually exclusive with `recipeDispatch`, `cadenceControl`, `setupCampaign`, and `batchFormation`. Those controls own different, open-ended choices; composing them would create an implicit priority stack whose authority could not be read from the Blueprint.

## Runtime semantics

Runtime exposes only the current step's exact qualified operation to the Device program:

1. If its complete input is absent, output capacity is unavailable, or ordinary physical prerequisites block work, the Device waits. It does not skip to a later step.
2. Setup, maintenance, tooling, utility, power, and failure behavior proceed through their existing state machines.
3. Only a successful production finish increments `jobsCompletedInStep` and `completedJobs`.
4. Cancellation caused by failure or utility interruption does not consume campaign progress; the same step remains current.
5. Reaching the step's job count advances to the next authored step.
6. Reaching the final count records `completedAtTick`. The Device selects no further production work for the rest of the Run.

The policy is deliberately finite. Automatic repetition, fallback dispatch, horizon extension, and “best effort” substitution would change the authored experiment.

## Evidence contract

The event stream emits:

- `device.recipe-campaign-progress` after every successful job;
- `device.recipe-campaign-advanced` at each step boundary;
- `device.recipe-campaign-completed` once at the final boundary.

`FactoryMetrics.recipeCampaigns.devices` retains the authored steps, current step, jobs completed in the step and in total, completion state, and completion tick. It is optional and absent when the Blueprint has no finite campaign, so unrelated immutable Run identities are not rewritten by the new capability.

Run reports, human CLI output, structured simulation output, Studio's Device inspector, and the Factory analysis panel project the same evaluator-owned record. Source-lot service chronology remains a separate derived evidence object: campaign progress answers what the controller completed, while chronology answers when exact material arrived, waited, ran, and reached delivery.

## Memory-fab experiment

Investigation `source-lot-back-end-service` authored one `5R → 7C` campaign on the incumbent Burn-in rack. Trial Run `109-candidate-trial-incumbent-five-performance-seven` completes all twelve jobs at tick `228873`, delivers `96` devices, and clears Run 105's eight-device terminal tail. It also lowers Burn-in setup from `14000` to `11000` ticks and consumes about `1.701 MJ` less energy.

The explicit schedule is nevertheless rejected for the current factory. Gross product value falls `344 → 332`, average Objective-equivalent WIP rises `49.1905 → 51.3613`, and nominal score changes `0.198410 → -5.549238`. The locked historical Benchmark remains `KEEP`, but the separately authoritative current-factory comparison is `REGRESSED` in all five cases. Investigation entry `discard-incumbent-five-seven-campaign` preserves that distinction and discards only this schedule; it does not discard the campaign mechanism or erase the negative result.

## Source of truth

- Public types and schema: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`
- Qualification and policy exclusivity: `packages/inm-core/src/compiler.ts`
- Runtime state and transitions: `packages/inm-core/src/state.ts`, `packages/inm-core/src/simulator.ts`
- Immutable metrics and reports: `packages/inm-core/src/evaluator.ts`, `packages/inm-core/src/artifacts.ts`
- Human/Agent surfaces: `packages/inm-cli/src/commands.ts`, `packages/inm-studio/src/server.ts`, `packages/inm-studio/src/main.tsx`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "finite recipe campaign"
bun test packages/inm-core/src/source-lot-service.test.ts
bun run inm candidate examples/memory-fab --candidate incumbent-five-performance-seven-commercial
bun run inm compare examples/memory-fab --from-run 105-simulate --to-run 109-candidate-trial-incumbent-five-performance-seven --json
bun run test
```
