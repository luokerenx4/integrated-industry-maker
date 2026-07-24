# Rank only recoverable physical-transport loss

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/logistics]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Humans and Agents see necessary tracked-lot transit as factual cycle-time context, while only measured physical-lane blocking becomes a ranked fab-loss signal with exact connection-level evidence.

## Context

Compatible memory-fab Run `075-simulate` ranks `transport-blocking` third with score `0.142543` even though all seventeen physical lanes report exactly zero blocked item-ticks. The score comes entirely from dividing the tracked lots' unavoidable `9.0` seconds of transport by their `63.4`-second mean cycle time. Workbench consequently emits a warning against `automotive-to-customer`, and both Studio and CLI present ordinary movement as a recoverable industrial problem.

The stable bucket id already names the intended boundary. Core should retain mean transport time for cycle accounting and operator context, but rank only congestion/backpressure that the physical transport system actually measured. When blocking exists, the shared evidence needs to identify the exact connection and its transported resources instead of leaving an Agent to inspect the raw run.

## Scope

### In scope

- Make `transport-blocking` score depend only on measured physical-lane blocked item time.
- Preserve tracked-lot mean transport time as explicitly non-ranked context.
- Add deterministic connection contributors for every lane with positive blocking, including resource mix, utilization, blocking fraction, flow, and in-flight evidence.
- Project the same contributor model through CLI human output, machine JSON, Studio, Workbench diagnostics, and Design provider input.
- Update current memory-fab chain documentation and prove a genuinely blocked fixture still emits the bucket.

### Out of scope

- Changing transport simulation, authored lane duration, sorter capacity, routing, or Objective cycle-time scoring.
- Claiming that all transit is free or removing mean transport time from lot service accounting.
- Introducing counterfactual travel-time optimization without a controlled alternative-route evaluator.

## Acceptance

- [x] A run with positive tracked-lot transit and zero lane blocking omits `transport-blocking` from the ranked loss chain while retaining mean transit in queue/cycle and transport context.
- [x] A run with physical backpressure emits a non-zero bucket whose ordered contributors identify only positively blocked connections with exact structured evidence.
- [x] CLI and Studio expose matching contributor content, and the current memory-fab no longer warns that `automotive-to-customer` is a transport loss.
- [x] Focused/full tests, public memory-fab validation/inspection, browser verification, documentation, Git, and remote verification pass.

## Work

- [x] Extract and test the recoverable transport-blocking analysis contract in Core.
- [x] Add human/AI contributor projections to CLI and Studio.
- [x] Update durable design documentation and current memory-fab evidence descriptions.
- [x] Run the public loop, full regression, browser parity, and completion audit.

## Findings and decisions

- 2026-07-24 — Run `075-simulate` has `9.0` seconds mean tracked-lot transit, `0` blocked item-ticks across `17` connections, and a false `0.142543` transport score. Unavoidable movement must remain cycle-time evidence but cannot by itself justify an optimization warning.
- 2026-07-24 — The existing `transport-blocking` id remains correct once its formula matches the name; changing the id would add no domain value.
- 2026-07-24 — Fab loss profile V5 adds `physical-lane-blocking` contributors and an explicit `resources` field shared by every contributor. Old V4 Design evidence remains immutable but cannot become current authority; no compatibility reader is added.
- 2026-07-24 — V5 Design Run `0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1` records the corrected driver chain and reproduces the bounded agile-pulse result as a non-promotable `BRANCH`.

## Verification

- `bunx tsc -p packages/inm-core/tsconfig.json --noEmit`
- `bunx tsc -p packages/inm-cli/tsconfig.json --noEmit`
- `bunx tsc -p packages/inm-studio/tsconfig.json --noEmit`
- `bunx tsc -p examples/memory-fab/assets/tsconfig.json --noEmit`
- `bun test packages/inm-core/src/fab-loss-analysis.test.ts --max-concurrency=1` — `4 pass`, including zero-blocking exclusion and positive connection ordering.
- `bun test packages/inm-core/src/workbench.test.ts packages/inm-core/src/design-proposal-provider.test.ts packages/inm-studio/src/server.test.ts --max-concurrency=1` — `22 pass`, `0 fail`.
- `bun run inm validate examples/memory-fab --json` — `62` Devices and `17` connections valid.
- `bun run inm analyze examples/memory-fab --json --section summary` — succeeds.
- `bun run inm plan examples/memory-fab --json --section summary` — `READY`, zero gaps.
- `bun run inm test examples/memory-fab` — both project fixtures pass.
- `bun run inm inspect examples/memory-fab --json --section losses` — profile V5 chain `input-starvation → yield-quality → queue-congestion → maintenance-qualification → release-admission`; no `transport-blocking` bucket.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 1 --progress off --json --section summary` — immutable V5 Run `0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1`, one `BRANCH`, unchanged leader, zero promotion operations.
- Studio `http://localhost:4176/memory-fab` and exact V5 Design deep link — Overview omits transport from the queue/chain, reorders the remaining industrial signals, selects `0ad66…` as authority, and renders the same `BRANCH` result.
- `bun run test` — `228 pass`, `0 fail`, `1897` assertions, followed by all eight Ironworks project scenarios.

## Progress log

- 2026-07-24 — Plan activated from the first false-positive physical-transport diagnostic in compatible Run `075-simulate`.
- 2026-07-24 — Core V5, CLI, Studio, TypeScript provider API, current Workbench evidence, and durable documents now share the recoverable-blocking boundary.
- 2026-07-24 — Full project, Core, CLI, Studio, browser, replay, and Design gates passed; plan completed.

## Completion

Fab loss V5 now preserves necessary lot transit as explicit cycle-time context but creates a ranked transport loss only from measured physical-lane blocking. Positive blocking produces deterministic connection contributors with exact Resource and flow evidence for both CLI and Studio. The current memory fab's zero-blocking lanes no longer fabricate `automotive-to-customer` as an optimization subject; its industrial chain advances directly from yield to queue, maintenance, and release evidence. V5 Design Run `0ad66de96d35b9a126331acb0e8e7cd81c5b4e8becec8345d13c4fd6d65706c1` restores current immutable authority without changing the live Blueprint or ALD branch decision.
