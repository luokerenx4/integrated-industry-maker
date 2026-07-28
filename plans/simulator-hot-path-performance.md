# Simulator hot-path performance

- Status: `proposed`
- Updated: `2026-07-28`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/experiment-workbench]], [[docs/design/development-operations]].

## Outcome

Reduce fresh memory-fab Candidate evaluation time through measured simulator work, while preserving exact deterministic events, metrics, hashes, and locked Benchmark verdicts.

## Context

[[plans/observable-benchmark-execution]] measured a warm five-case `dispatch-research` evaluation at 6731 ms. Candidate simulation consumed 6407 ms while compilation, cache access, and comparison together consumed about 270 ms. The next useful question is therefore which simulator event families and state transitions own that time, followed by whether a local hot-path change or isolated case concurrency has the best risk-adjusted payoff.

## Scope

### In scope

- Development-only profiling that attributes simulator CPU cost without entering authored or immutable evidence.
- Representative one-case and five-case memory-fab workloads.
- A measured hot-path optimization or isolated multi-case execution strategy.
- Exact before/after result, event, metric, and hash parity.

### Out of scope

- Approximate simulation, skipped locked cases, changed tick/event semantics, or Candidate result caching.
- Autonomous factory-design policy.
- Timing fields in immutable results.

## Acceptance

- [ ] Profiling identifies the dominant simulator functions or event families on the current five-case warm workload.
- [ ] One bounded implementation reduces representative warm Candidate evaluation time materially.
- [ ] Determinism, result hashes, metrics, events, and Benchmark verdicts remain exact.
- [ ] Full verification and before/after measurements are recorded.

## Work

- [ ] Establish reproducible profiler and Benchmark fixtures.
- [ ] Attribute wall time and allocation pressure to simulator paths.
- [ ] Choose and implement one bounded intervention.
- [ ] Prove semantic parity and measure the result.

## Findings and decisions

- 2026-07-28 — Begin with simulator attribution; compilation, cache, comparison, and Studio serialization are already bounded below 5% of the warm five-case operation.

## Verification

Pending.

## Progress log

- 2026-07-28 — Proposed from the measured observable Benchmark execution work.

## Completion

Pending.
