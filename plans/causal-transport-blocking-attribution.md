# Separate transport blocking by physical cause

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/simulation-runtime]], [[docs/design/logistics]], [[docs/design/operator-workbench]], and [[docs/design/design-programs]].

## Outcome

When material stalls inside a local transport connection, humans and Agents can distinguish line-cell contention, endpoint service saturation, endpoint power interruption, and endpoint failure from one deterministic metric and loss contract, so a downstream or infrastructure constraint is not mislabeled as a faster-belt opportunity.

## Context

Compatible Run `082-simulate` follows commissioning of the agile terminal-screening mode. It delivers `96` known-good dies through `probe-to-packaging` at `24/240 items/min`, yet the current V5 loss profile calls all `67900` blocked item-ticks “physical lane blocking” and reports a `43.456%` blocked fraction. The event stream shows several different immediate causes: the unloader is busy, the shipping grid cannot power it, and occupied cells propagate the resulting queue upstream. `performance-to-customer` has the same ambiguity.

The simulator already retains `BeltTransit.blockedBy`, but evaluator metrics collapse every cause into `connectionBlockedArea`. CLI and Studio therefore cannot tell whether an operator should change the line, the endpoint, or its power allocation. The loss score remains an investigation signal, but its current contributor label is too coarse to support an industrial decision.

## Scope

### In scope

- Add a strict typed cause to every blocked local-belt transit and integrate per-connection item-time for line contention, endpoint capacity, endpoint power, and endpoint failure.
- Require the complete cause partition in `FactoryMetrics.transportFlows`; total blocked item-time remains the exact sum.
- Upgrade fab-loss transport contributors so mechanism, subjects, summary, and evidence name the measured cause instead of treating every positive total as line capacity.
- Project the same ordered cause evidence through immutable Runs, Design driver evidence, CLI, Workbench, and Studio.
- Refresh engine/project evidence and the memory-fab compatible run without changing the commissioned Blueprint.

### Out of scope

- Changing belt, sorter, power, buffer, packaging, or screening physics in this plan.
- Automatically proposing or commissioning a transport, endpoint, or power intervention.
- Reinterpreting necessary transit time as recoverable loss or weakening Benchmark/Candidate gates.
- Reading old metrics through aliases or compatibility defaults.

## Acceptance

- [x] Every blocked local transit has one explicit physical cause, and per-cause item-ticks sum exactly to the existing total.
- [x] `probe-to-packaging` no longer appears as undifferentiated physical-lane blocking; its contributor exposes the measured endpoint, power, and propagated line shares.
- [x] CLI and Studio use the same V6 contributor mechanisms, subjects, totals, ordering, and plain-language decision boundary.
- [x] Design proposal input receives the same source-neutral V6 profile and cannot infer a line-capacity intervention from endpoint/power evidence.
- [x] Types, runtime/replay, artifacts, memory-fab fixtures, focused/full tests, browser verification, documentation, Git, and remote verification pass.

## Work

- [x] Implement the typed runtime state and exact metrics partition with deterministic tests.
- [x] Upgrade fab-loss attribution and Design evidence to V6 with causal contributor tests.
- [x] Update CLI, Studio, reports, durable design docs, and current project evidence.
- [x] Verify the shared human/AI workflow, complete the plan audit, commit, and push.

## Findings and decisions

- 2026-07-25 — The preceding furnace input-starvation family is already experimentally bounded by [[plans/post-cadence-commissioned-convergence]]; repeating batch-wait or cadence sweeps would not be a new intervention.
- 2026-07-25 — `probe-to-packaging` uses only `10%` of its nominal delivered-item rate. Its event stream contains endpoint-capacity, endpoint-power, and upstream cell waits, so the aggregate blocked fraction is not evidence that the conveyor rate is undersized.
- 2026-07-25 — This plan records immediate physical cause. A cell wait propagated from a downstream endpoint remains `line-contention` at that transit; a later graph-level root-cause propagation model would require a separate explicit contract.

## Verification

- `bun run memory-fab:relock-benchmarks` — all eight locked memory-fab Benchmark contracts regenerated for `inm-sim/0.82.0`.
- `bun run ironworks:relock-benchmarks` — all five locked Ironworks Benchmark contracts regenerated.
- `bun run runs:regenerate` — all nine checked-in Ironworks demonstration Runs regenerated and exact replay hashes restored.
- `bun run inm validate examples/memory-fab --json`, `bun run inm analyze examples/memory-fab --section summary --json`, `bun run inm simulate examples/memory-fab --section summary --json`, and `bun run inm inspect examples/memory-fab --section losses --json` — shared public validation, simulation, and loss projections pass.
- `bun run test` — documentation links, all TypeScript projects, `237` tests with `1974` assertions, and all eight Ironworks project scenarios pass.
- Browser verification at `/`, `/memory-fab`, and `/memory-fab/factory/connections/probe-to-packaging` — project opening, Overview evidence, Factory deep-link restoration, and the exact `41100 / 22000 / 4800 / 0` cause partition render successfully.

## Progress log

- 2026-07-25 — Plan activated from compatible Run `082-simulate` and its ambiguous post-screening transport signal.
- 2026-07-25 — Runtime state, blocking events, and per-connection metrics now require the exact cause/stage partition; focused tests cover line contention, endpoint capacity, endpoint power, endpoint failure, and exact total conservation.
- 2026-07-25 — Fab-loss and project proposal-provider contracts advanced to V6; CLI, Run reports, Studio overview, and Factory connection inspection consume the same causal totals.
- 2026-07-25 — Engine `inm-sim/0.82.0` relocked all eight memory-fab Benchmarks and produced compatible Run `083-simulate` without changing the commissioned Blueprint. `probe-to-packaging` partitions `67.9` blocked item-s into `41.1` line, `22.0` unloader capacity, `4.8` unloader power, and `0.0` failure.
- 2026-07-25 — Strict V6 loading intentionally invalidates all `27` older Design artifacts rather than treating V5 evidence as historical authority. Humans and Agents both receive `0 valid / 27 invalid` until a new explicit Design run is created.
- 2026-07-25 — Full repository verification and browser inspection passed; Studio project opening no longer imports the Node-only Core entrypoint because the shared causal helper is exposed through a browser-safe package subpath.

## Completion

Fab-loss V6 now treats local backpressure as a conserved causal partition rather than one generic belt-speed signal. Every blocked transit carries its immediate cause and physical stage, immutable metrics and reports preserve the same totals, and CLI, Workbench, Studio, and project proposal providers all consume the same source-neutral evidence. The unchanged commissioned memory fab now proves that most `probe-to-packaging` blocking is a mixture of propagated line occupancy, busy unloader service, and unloader power interruption—not evidence for an undifferentiated faster conveyor. Strict pre-alpha loading rejects all V5 Design evidence without a compatibility path, while Run `083-simulate` supplies current operating authority.
