# Closed-loop WIP release control

Status: Blueprint-authored factory CONWIP, high/low-watermark and maximum-delay service replenishment, eligible-lot arbitration, causal blocking metrics, and memory-fab joint policy research implemented through engine version `inm-sim/0.54.0`.

Related: [[docs/design/lot-release-scheduling]], [[docs/design/lot-tracking]], [[docs/design/work-center-dispatch]], [[docs/design/batch-processing]], [[docs/design/coding-agent-optimization]], [[docs/design/simulation-runtime]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Boundary: arrivals are not decisions

`Scenario.lotReleases` owns when each named lot becomes available. A candidate may not edit that workload. `Blueprint.policies.lotRelease` owns the operating decision to admit eligible work into the fab. This separation is the same one used by a locked coding benchmark: test inputs remain fixed while the program under test changes.

Omitting `lotRelease` selects open-loop admission. Every eligible lot enters as soon as its physical release buffer and Resource quota can accept it.

A Blueprint may instead select a closed-loop controller:

```json
"policies": {
  "dispatch": "shortage-first",
  "powerAllocation": "priority-load-shedding",
  "lotRelease": {
    "kind": "conwip",
    "maximumWip": 11,
    "reopenAtWip": 6,
    "maximumReleaseDelayTicks": 24000,
    "dispatch": "earliest-due-date"
  }
}
```

Active WIP is every released tracked lot that is not completed or scrapped, across the whole Blueprint. Scheduled external lots do not consume cards. `maximumWip` is a hard admission ceiling. `reopenAtWip` must be smaller and introduces deterministic hysteresis:

1. an open controller admits eligible lots until active WIP reaches `maximumWip`;
2. the controller closes and withholds every later eligible lot;
3. it opens again only after active WIP falls to or below `reopenAtWip`;
4. one settle cycle refills all currently available cards, forming a replenishment wave.

Setting `reopenAtWip` to `maximumWip - 1` produces one-for-one replenishment. A lower threshold produces larger waves. That distinction matters in a fab: aggressive one-for-one control can lower inventory while destroying furnace batches or forcing extra mask/recipe changeovers.

Optional `maximumReleaseDelayTicks` adds a service guard. If the controller is closed, at least one hard-cap card is free, and any eligible lot has waited this long since its Scenario release tick, the controller opens before the low watermark. It still cannot exceed `maximumWip`; while eligible demand remains overdue, the result is one-for-one service replenishment.

## Deterministic arbitration

When fewer cards than eligible lots exist, `dispatch` chooses the released identities:

- `fifo`: planned release tick, then stable lot id;
- `earliest-due-date`: due tick, then FIFO;
- `highest-priority`: authored Scenario priority, then FIFO.

The controller never changes planned release, priority, due date, defect workload, or lot identity. It only decides which eligible identity consumes the next available card.

## Causal blocking and evaluation

Physical admission is checked before policy admission. A lot therefore records one current cause: `buffer-capacity`, `resource-capacity`, or `conwip-limit`. Cause transitions accrue separate lot-ticks and emit `lot.release-blocked`. Controller state emits `lot.release-control-opened` with cause `reopen-threshold` or `maximum-release-delay`, plus `lot.release-control-closed`; `lot.released` records the controller kind and active WIP immediately before admission.

`releaseFlow` exposes the configured controller, maximum/reopen/service thresholds, dispatch rule, service-triggered opening count, peak active lots, capacity-blocked lots/ticks, and controller-blocked lots/ticks alongside planned/actual cadence and delay. CLI simulation, comparison, benchmark output, run reports, and Studio use the same measurements.

On-time delivery still divides by all Scenario-scheduled target lots. Withholding work can reduce internal queue time and average WIP, but it cannot hide unfinished demand from the score.

## Memory-fab research loop

`bun run memory-fab:research-release` evaluates an in-memory grid of maximum WIP, reopen threshold, service delay, and dispatch policy against the four fixed memory-fab cases. `--joint` also crosses lithography/etch recipe and lot dispatch. It compares each setting with the checked-in candidate as the incumbent and applies the benchmark's aggregate-improvement and per-case-regression gates. It does not edit the Blueprint or benchmark.

The first 225-policy sweep established a useful robust negative result. Several strict caps raised aggregate score by lowering average WIP and completed-lot cycle time, but their later release waves increased tardiness and often sequence-dependent lithography/etch changeovers. The strongest aggregate setting violated the locked per-case regression gate, while settings inside that gate did not improve the incumbent aggregate.

A follow-up joint sweep crossed the best active CONWIP range with lithography and etch recipe/lot dispatch. It showed the loss was not a tie-break artifact: the best active policy reduced WIP and cycle time in disrupted cases, but in steady production it increased setup changes from two to six and lost one on-time lot. Service-guard thresholds recovered admission responsiveness but still missed the locked per-case gate. No active controller satisfied both keep conditions, so the checked-in candidate remains open-loop. The controller is still engine code and a first-class search dimension; a future equipment/layout or campaign-control change can make a previously rejected threshold robustly optimal.

## Current boundary

The policy is factory-wide and deterministic. It does not yet support per-family cards, route-stage caps, time-varying thresholds, order cancellation, probabilistic arrival forecasts, or learned release code. Those extensions should preserve the Scenario/Blueprint boundary and evaluator-owned denominator.

## Verification

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm simulate examples/memory-fab --blueprint experiment
bun run memory-fab:research-release -- --min-cap 10 --max-cap 12
bun run memory-fab:research-release -- --joint --min-cap 10 --max-cap 10 --min-reopen 3 --max-reopen 7 --release-dispatch fifo
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```
