# Parallel Benchmark case execution

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], [[docs/design/experiment-workbench]], and [[docs/design/development-operations]].

## Outcome

Reduce the wall time of a real memory-fab Design intervention by evaluating independent locked Benchmark cases concurrently, while preserving exact deterministic case evidence, ordered progress, cancellation, immutable result hashes, and human/Agent parity.

## Context

The completed [[plans/simulator-hot-path-performance]] work removed a redundant deep-freeze traversal and reduced a warm five-case Candidate evaluation by roughly 20–23%. The completed [[plans/single-pass-design-evidence]] work then removed duplicate driver-case simulation and reduced a representative one-Candidate Design from `18.93s` to `15.90s`.

Current profiling still places more than 94% of a warm focused Design invocation in ten fresh case simulations: five for the seed and five for its Candidate. `evaluatePreparedBlueprintBenchmark()` executes those cases sequentially even though each locked case owns its own world, scenario, objective, seed, compiled factory state, deterministic event queue, and result. On the current 16-core development machine, this leaves the dominant operator wait structurally serialized.

The next intervention is isolated case concurrency, not skipped evaluation, Candidate caching, approximate simulation, or autonomous design.

## Scope

### In scope

- A bounded worker-backed execution boundary for independent Benchmark Candidate cases.
- Ordered parent-side aggregation so Benchmark results, hashes, reasons, case ordering, and semantic progress remain deterministic.
- Invocation-local driver-case trace recovery without adding traces to Benchmark or Design artifacts.
- Cooperative cancellation that terminates outstanding case work and writes no partial success or immutable Design result.
- Honest per-case timing and execution-mode evidence shared by Core, CLI, and Studio.
- Real warm one-Candidate memory-fab before/after measurement.

### Out of scope

- Parallel mutation inside one deterministic simulation.
- Approximate or sampled simulation, skipped locked cases, Candidate-result caching, or weakened guardrails.
- Parallel proposal generation, black-box search, RL, or automatic commissioning.
- A distributed worker service or compatibility mode for sequential progress contracts.

## Acceptance

- [x] A five-case memory-fab seed or Candidate evaluation uses a bounded isolated worker set and returns results in manifest case order.
- [x] Sequential and parallel execution produce byte-identical Benchmark results, Design manifests/result hashes, driver-loss evidence, metrics, verdicts, reasons, and immutable artifacts.
- [x] Progress exposes real concurrent case work without nondeterministic authority, and CLI and Studio project the same execution evidence.
- [x] Cancellation terminates outstanding workers, returns `operation.cancelled`, and writes no partial Candidate success or Design artifact.
- [x] A representative warm one-Candidate memory-fab Design is materially faster than the current `16.61s` / `15.752s` fresh-case boundary.
- [x] Focused, fast, browser, and full repository verification pass before completion.

## Work

- [x] Measure the current sequential case distribution and record the exact baseline result identity.
- [x] Add the worker protocol, bounded lifecycle, ordered aggregation, and driver trace return.
- [x] Integrate parallel execution with Benchmark, Design, operation progress, CLI, and Studio without a compatibility alias.
- [x] Prove sequential/parallel/cancellation parity and measure the real memory-fab loop.
- [x] Complete browser QA, full verification, commit, push, and completion audit.

## Findings and decisions

- 2026-07-28 — Existing hot-path work already removed redundant Device-context freezing; repeating that plan would optimize a superseded profile.
- 2026-07-28 — Existing single-pass evidence already removed hidden seed, parent, and Candidate driver replay. The remaining warm focused Design spends `15.752s` evaluating ten fresh locked cases while compilation, comparison, and cache reads remain below 6% of wall time.
- 2026-07-28 — `greenfield-dram-design` has five state-isolated cases, and the current host exposes 16 physical/logical cores. Case concurrency is therefore the next structural operator-latency intervention.
- 2026-07-28 — A current forced-sequential `back-end-die-handoff` run took `15.244s` wall. Its ten fresh seed/Candidate cases each took `1.264–1.543s`; immutable result `f928bd8affe8…` was reused.
- 2026-07-28 — Core uses up to the smaller of case count, eight, and available host parallelism minus one. One- and two-case work stays in process. A parallel wave emits starts and completions in manifest order even though worker finish timing is operational.
- 2026-07-28 — A warm five-case public Benchmark took `2.239s` wall with `parallel ×5`. The complete one-Candidate Design took `4.265s`, completed all `15/15` case evaluations, and reproduced immutable result `f928bd8affe8…`.
- 2026-07-28 — Parallel workers return only compact evaluation data plus the one explicitly requested ephemeral driver trace. The parent recompiles and verifies each exact case/Blueprint identity before ordered comparison; traces never enter Benchmark or Design artifacts.
- 2026-07-28 — Browser QA exposed that a 4-second Design can complete between Studio's 250 ms polls and leave an older baseline as the component-local “last case.” The retained operation already owned the complete log, so Studio now reconstructs the latest completed Candidate case from that log on every snapshot/reopen.

## Verification

- Forced-sequential real `back-end-die-handoff` Design — `15.244s` wall; five seed and five Candidate simulations measured `1.264–1.543s` each; immutable result `f928bd8affe8…`.
- Parallel public `greenfield-dram-design` Benchmark — `2.239s` wall; five `parallel ×5` starts and five ordered completions; no error.
- Parallel real `back-end-die-handoff` Design — `4.265s` wall, `15/15` completed case evaluations, immutable result `f928bd8affe8…` reused.
- `bun test packages/inm-core/src/operation.test.ts` — `7` tests / `41` assertions passed in `22.62s`; forced sequential and parallel Benchmark results were stable-JSON identical, driver traces had the same exact hash, progress retained manifest ordering, and cancellation rejected after terminating a five-worker wave.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "public CLI cancellation"` — the public process reached a `parallel ×5` wave, accepted `SIGINT`, returned the same operation id with `operation.cancelled`, exited `130`, and emitted no stdout or artifacts.
- `bun run check:fast` — documentation, all TypeScript projects, and `29` short tests / `175` assertions passed in `12.0s`.
- `bun run test` — `280` tests / `3972` assertions passed across `21` files in `472.91s`; all eight Ironworks CLI fixtures then passed.
- Browser Experiment QA — `greenfield-dram-design` completed `10/10` case evaluations with `PARALLEL ×5`; refresh recovered the same `ms4rqg3b-a24…` operation and exact `1.69s` final-case evidence.
- Browser Design QA — `back-end-die-handoff` completed `15/15`; after the retained-log correction and a source-current Studio restart, refresh recovered operation `ms4rr9fc-3f1…`, immutable result `f928bd8affe8…`, and `LAST CANDIDATE · facility-interruption · simulated · parallel ×5 · 1645 ms`. Browser console had no warning or error.

## Progress log

- 2026-07-28 — Plan created and activated from exact prior profiling plus a current source audit of the sequential `evaluatePreparedBlueprintBenchmark()` loop.
- 2026-07-28 — Implemented bounded case workers, ordered aggregation, explicit execution evidence, driver-trace return, whole-wave cancellation, CLI/Studio projection, focused parity tests, and the real memory-fab timing pass.
- 2026-07-28 — Completed real Studio Experiment/Design browser QA and corrected fast-operation recovery to derive the latest completed case from retained progress rather than poll timing.
- 2026-07-28 — Completed the fast and full repository suites, documentation audit, source-current Studio check, commit, and push.

## Completion

Completed. Independent locked cases now execute through a bounded exact worker set, the shared human/Agent surfaces expose the same operational concurrency evidence, cancellation remains artifact-safe, and the representative one-Candidate memory-fab Design improved from `15.244s` to `4.265s` without changing immutable result `f928bd8affe8…`.
