# Closed-loop WIP release control

Status: Blueprint-authored factory CONWIP, high/low-watermark replenishment, identity-safe release-service aging, eligible-lot arbitration, causal blocking metrics, and commissioned memory-fab control implemented through engine version `inm-sim/0.81.0`.

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
    "serviceLevelAfterTicks": 24000,
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

Optional `serviceLevelAfterTicks` adds an aging-based service class. Once an eligible lot has waited that long since its Scenario release tick, it receives scarce-card precedence over every younger, ordinary eligible lot. If the controller is closed and at least one hard-cap card is free, the protected lot also opens the controller before the low watermark. The threshold is not an absolute delay promise: a lot can age past it while the hard WIP cap or physical release boundary has no slot. It is the exact point at which the lot becomes protected from younger admission work.

## Deterministic arbitration

When fewer cards than eligible lots exist, the runtime first separates service-protected and ordinary identities. Protected identities consume cards first. `dispatch` then orders identities within each class:

- `fifo`: planned release tick, then stable lot id;
- `earliest-due-date`: due tick, then FIFO;
- `highest-priority`: authored Scenario priority, then FIFO.

The controller never changes planned release, priority, due date, defect workload, or lot identity. A service opening cannot be consumed by a younger unprotected lot while the identity that earned it remains eligible.

## Causal blocking and evaluation

Physical admission is checked before policy admission. A lot therefore records one current cause: `buffer-capacity`, `resource-capacity`, or `conwip-limit`. Cause transitions accrue separate lot-ticks and emit `lot.release-blocked`. Controller state emits `lot.release-control-opened` with cause `reopen-threshold` or `service-level`, plus `lot.release-control-closed`; `lot.released` records the controller kind, whether the identity was service-protected, and active WIP immediately before admission.

`releaseFlow` exposes the configured controller, maximum/reopen thresholds, `serviceLevelAfterTicks`, dispatch rule, service-triggered opening count, service-protected release count, peak active lots, capacity-blocked lots/ticks, and controller-blocked lots/ticks alongside planned/actual cadence and mean/maximum actual delay. CLI simulation, comparison, benchmark output, run reports, and Studio use the same measurements. Human text must call the configured value a service age and keep it visibly separate from actual delay.

On-time delivery still divides by all Scenario-scheduled target lots. Withholding work can reduce internal queue time and average WIP, but it cannot hide unfinished demand from the score.

## Memory-fab research loop

`bun run memory-fab:research-release` evaluates an in-memory grid of maximum WIP, reopen threshold, service delay, and dispatch policy against the four fixed memory-fab cases. `--joint` also crosses lithography/etch recipe and lot dispatch. It compares each setting with the checked-in candidate as the incumbent and applies the benchmark's aggregate-improvement and per-case-regression gates. It does not edit the Blueprint or benchmark.

The first 225-policy sweep established a useful robust negative result. Several strict caps raised aggregate score by lowering average WIP and completed-lot cycle time, but their later release waves increased tardiness and often sequence-dependent lithography/etch changeovers. The strongest aggregate setting violated the locked per-case regression gate, while settings inside that gate did not improve the incumbent aggregate.

A follow-up joint sweep crossed the best active CONWIP range with lithography and etch recipe/lot dispatch. It showed the loss was not a tie-break artifact: the best active policy reduced WIP and cycle time in disrupted cases, but in steady production it increased setup changes from two to six and lost one on-time lot. Service-guard thresholds recovered admission responsiveness but still missed the locked per-case gate. That was a valid result for the earlier factory, not a timeless ban on closed-loop control.

Run `078-simulate` exposed the old identity mismatch: lot 07 earned an 18-second service opening but younger EDD work consumed the cards and left it outside for 64.556 seconds. Re-evaluation under engine `0.81.0` correctly rejected the commissioned `6/3 EDD + 18 s` policy because protected ordering reduced on-time completion to 10 lots in steady production and 7 under the facility interruption, below the unchanged 12/9 hard thresholds.

An exhaustive 3–9-card EDD high/low-watermark search found one release-only setting that preserves both service boundaries: six cards, reopen at five, and no service-age override. Candidate `identity-safe-release-control` removes `serviceLevelAfterTicks` and changes only `reopenAtWip`; immutable review `a6e8489bce16c1f9148cdd07ac6367b43fac8c5df57317abee03dbb1b05148e5` returns `KEEP`, aggregate `+104.763644` versus the locked baseline, and all seven industrial outcome guardrails. The absence of a service age is intentional for this fab: one-for-one EDD replenishment already gives the workload its required service order.

Compatible mixed-quality run `079-simulate` records 12/12 lots complete, 11 on time, 64.556 seconds maximum actual admission delay, six controller-blocked lots / 177.336 lot-seconds, and zero service openings or protected releases. Current Design Run `e7d569b5e824259ec51beef79b22957e611146444fefc4e5c80eb58ce70ec87d` keeps that seed after four exact rejections; it is continuable rather than falsely exhausted.

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
