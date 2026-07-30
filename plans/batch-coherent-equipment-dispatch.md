# Batch-coherent equipment dispatch

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/logistics]], [[docs/design/batch-processing]], [[docs/design/source-lot-product-lineage]], [[docs/design/simulation-runtime]], [[docs/design/industrial-investigations]], and [[docs/design/observation-led-design]].

## Outcome

Let a human or Agent explicitly route one complete downstream Process input batch to one parallel equipment input before local dispatch rotates, then use that generic industrial policy to revise and re-evaluate the exact memory-fab parallel Burn-in hypothesis without changing demand, recipes, operating conditions, or commissioning authority.

## Context

Reviewed Candidate `parallel-burn-in-overflow` added one qualified rack and physically complete lanes, but its junction used item-level `round-robin`. The two rack inputs each require eight `packaged-dram-device` units per job, while the lane moves one unit per departure. Rotation after every departure therefore sent four units to each rack, reduced delivery from `88` to `64`, and left eight distinct four-device source-lot tails.

This is not evidence that parallel Burn-in capacity is intrinsically harmful. It is evidence that the engine currently lacks an explicit local dispatch contract between per-item transport and fixed-batch equipment. The existing compiler already derives each connection Resource's exact downstream coverage unit from the target Process input count; the revised policy should reuse that authored industrial fact rather than add a memory-fab-only batch size or infer one in a Device script.

## Scope

### In scope

- Add one explicit local dispatch policy that begins a route only when the source and destination can commit a complete downstream coverage unit, keeps the same connection and Resource selected across its physical departures, and rotates only after that unit is committed in resident plus inbound material.
- Keep Process batch size, target buffer capacity, treatment level, source-lot lineage, real sorter/belt timing, failures, power, backpressure, priorities, and deterministic tie-breaking authoritative.
- Separate local batch-coherent dispatch from station fleet routing; station `fifo`, `round-robin`, and `shortage-first` retain their current meanings.
- Expose the authored/effective policy and compiled coverage unit through analysis, immutable Run evidence, CLI, and Studio without adding hidden optimizer authority.
- Capture the current factory checkpoint, author a new Investigation hypothesis, create a revised one-rack Candidate, run locked review and an immutable `TRIAL`, compare against Run `105-simulate`, inspect spatial and lineage evidence, and record an explicit disposition.

### Out of scope

- Resizing an eight-device screening Process, creating partial batches, changing the twelve-lot Production Plan, relaxing the capital constraint, adding free buffers or customer sinks, automatic layout/search/RL, or applying a Candidate without a separate justified KEEP.
- Batch-coherent station-carrier routing, reusable carrier identity, or overlapping equipment load/process/unload phases.
- Treating higher delivery as sufficient commissioning evidence when build cost, interruption service, quality, or another locked case regresses.

## Acceptance

- [x] An authored local batch-coherent policy cannot split one committed downstream coverage unit across sibling connections, starts no partial commitment when a full unit is unavailable, and remains deterministic across stack sizes, backpressure, power interruption, and endpoint failure.
- [x] Compile-time validation rejects a batch-coherent fan-out whose selected Resource does not terminate in a Process input or whose destination cannot hold its complete coverage unit.
- [x] Existing `fifo`, `round-robin`, `shortage-first`, and station-network behavior remain exact; analysis, Run evidence, CLI, and Studio expose the new policy and coverage contract consistently.
- [x] A revised Investigation-sourced memory-fab Candidate preserves the one-rack physical topology and unchanged operating selection, and exact locked/trial evidence determines whether complete-batch routing restores delivery without hiding its capital and service trade.
- [x] Project validation, memory-fab fixtures, focused transport tests, replay checks, visual inspection, and the full repository checkpoint pass before commit and push.

## Work

- [x] Reopen the rejected Candidate, Run `106`, dispatch runtime, logistics/batch contracts, and current Investigation handoff.
- [x] Capture the exact current factory as the next append-only Investigation checkpoint and author the revised Blueprint hypothesis.
- [x] Define strict local policy types/schema/compiler validation and deterministic runtime commitment semantics.
- [x] Add analysis/CLI/Studio projection and focused nominal/interruption/backpressure tests.
- [x] Author, review, simulate, compare, and visually inspect the revised memory-fab Candidate.
- [x] Append the quantitative and spatial decision to the Investigation.
- [x] Complete verification, archive this plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Current local `round-robin` advances the source cursor after every successful physical departure. On the Burn-in junction's one-item stacks, that semantic necessarily creates two four-device tails from each eight-device source batch.
- 2026-07-31 — `connectionDispatchProfiles` already compiles the exact target Process input count as `coverageUnit`. Batch coherence will reuse this value and the normal resident-plus-inbound ledger; it will not introduce a caller-authored duplicate batch-size field.
- 2026-07-31 — The new contract belongs to local physical dispatch. Station routes already own explicit carrier batches, minimum batches, fleet arbitration, and demand targets, so accepting this local policy on a station network would conflate two different industrial mechanisms.
- 2026-07-31 — A complete commitment must be available at the source and fit at the destination before its first departure. Once begun, the source holds the connection/Resource choice through sorter, belt, power, failure, and backpressure delays instead of silently diverting the remainder.
- 2026-07-31 — Observation entry `post-overflow-current-factory` reestablishes exact Run `105-simulate` as the editable-factory authority after the rejected trial. Hypothesis entry `batch-coherent-burn-in-overflow` is pinned by entry hash `5b180853cd09` and preserves the rejected comparison/review as cited historical evidence.
- 2026-07-31 — Candidate `batch-coherent-burn-in-overflow` reuses the exact 19-operation physical topology patch and changes only the dispatcher policy from `round-robin` to `batch-coherent`; Core compiled it from current base hash `16ca367007ed` under the same locked Benchmark.
- 2026-07-31 — Locked review proposal `df8fdd6d0280` remains `DISCARD`: delivery stays `64`, build cost is `245,310` against the `230,000` limit, and area is `319`. Immutable trial Run `107-candidate-trial-batch-coherent-burn-in-overflow` retains result hash `e9c615495570` and exact parent Run `105-simulate`.
- 2026-07-31 — Run `107` proves the routing contract while rejecting the physical Candidate. Source-lot commingling falls from `4` to `0`; all `32` units sent to `burn-in-overflow-1` arrive as four complete eight-device batches, with no sibling four-device tails. Delivery still regresses from `88` to `64`.
- 2026-07-31 — The revised trial exposes a second causal blocker instead of hiding it: `burn-in-overflow-1` starts no screening jobs, requires `35 → 384 W`, and shares `grid-cleanroom-shipping-power`, whose `600 W` generation faces `1,038 W` rated demand (`-438 W` headroom). The rack ends with four complete input batches and no output.
- 2026-07-31 — Investigation entries `batch-coherent-overflow-trial` and `batch-coherent-overflow-revise` therefore retain the dispatch policy as correct industrial semantics but disposition the topology `revise`: a future Candidate must explicitly cost both active screening power and the existing `15,310` capital deficit.
- 2026-07-31 — Studio visual inspection independently showed `batch-coherent · packaged-dram-device · process · 8/batch`, `32 departed / 32 delivered` on the overflow connection, four `8×` source-lot WIP records at the rack, `NO POWER`, and the exact grid deficit. Browser warning/error logs were empty.

## Verification

- `bun run inm validate examples/memory-fab --json` — passed; current Blueprint `16ca367007ed`, Production Plan `b6fd2a4e6075`, Scenario `25435a822236`, and Objective `f1c94e68e05d` compile together.
- `bun run inm test examples/memory-fab --json` — passed `2/2` project fixtures.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'batch-coherent local dispatch'` — passed `1/1`, `9` assertions.
- `bun run check:fast` — passed `1,347` documentation links, all TypeScript projects, and `41` short-suite tests.
- Studio visual replay of Run `107` — connection and equipment inspectors showed the exact batch, WIP, power, and grid evidence; warning/error logs were empty.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts --test-name-pattern 'portless Studio lifecycle deterministically converges every fully verified target instance'` — passed five consecutive lifecycle repetitions after moving test listeners outside macOS's `49152–65535` ephemeral client-port range.
- `bun run test` — passed `350/350` repository tests and all `8` Ironworks project fixtures.

## Progress log

- 2026-07-31 — Plan created from the retained `DISCARD`/`revise` evidence in Candidate `parallel-burn-in-overflow` and immutable Run `106`.
- 2026-07-31 — Added a strict source-local policy type instead of admitting batch coherence to station-network dispatch, then proved two-item equipment batches depart `east,east,north,north` across a mid-commit sorter failure while a one-item source starts no partial commitment.
- 2026-07-31 — Reviewed and ran the revised Candidate as immutable trial Run `107`, compared it to current Run `105`, inspected the exact connection and equipment state in Studio, and appended the rejected-but-informative result to the continuing Investigation.
- 2026-07-31 — Full verification exposed a test-only lifecycle race: dynamically reserved listeners were drawn from macOS's ephemeral client-port range and could be reused by the long suite between repeated Studio starts. Non-ephemeral test-port scanning removed the false operational failure and passed five focused repetitions plus the complete repository checkpoint.

## Completion

Completed. The generic source-local dispatch contract, exact rejected memory-fab trial, continuing Investigation decision, human/Agent projections, and verification evidence are retained together. The editable factory remains Run `105`; the next industrial question is the explicitly costed power-and-capital boundary for usable parallel Burn-in capacity.
