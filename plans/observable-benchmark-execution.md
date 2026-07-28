# Observable Benchmark execution

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/development-operations]], [[docs/design/experiment-workbench]], [[docs/design/agent-cli-contract]].

## Outcome

Make every long Benchmark and Candidate evaluation visibly advance case by case in CLI and Studio, while producing enough timing evidence to choose the next simulator optimization without weakening or automating industrial design judgment.

## Context

[[plans/low-friction-development-operations]] removed process/port friction and exact duplicate baseline simulations. A repeated one-case memory-fab Benchmark fell from 3.50 to 1.83 seconds, and several full-suite guardrail cases improved similarly. Fresh Candidate work and large Design searches remain intrinsically expensive, while standalone Benchmark UI still shows an indeterminate loading state despite Core already exposing case progress events.

## Scope

### In scope

- One Core-owned Benchmark progress stream with cache reuse, case identity, phase, and completed/planned work.
- Equivalent human/NDJSON CLI and streamed Studio projections.
- Per-phase and per-case timing evidence sufficient to locate compilation, simulation, comparison, or serialization cost.
- Cancellation/error behavior that preserves read-only evaluation and never invents a partial verdict.

### Out of scope

- RL, autonomous factory design, hidden Candidate acceptance, or approximation of locked cases.
- Changing Objective formulas, Benchmark gates, or industrial simulation semantics.
- Caching Candidate results or decisions.

## Acceptance

- [x] A human or Agent can identify the exact running case and completed/planned work from CLI or Studio.
- [x] Cached baseline work is labeled as reuse while fresh Candidate work remains explicit.
- [x] Interrupting or failing a stream produces no verdict, Blueprint mutation, or immutable result.
- [x] Profiling evidence identifies and documents the next performance intervention.

## Work

- [x] Specify the shared progress/timing contract and operation boundary.
- [x] Add CLI human/NDJSON projection and public discovery.
- [x] Stream the same events to the Studio Experiment workbench.
- [x] Measure representative one- and five-case memory-fab programs.
- [x] Complete cross-surface and interruption verification.

## Findings and decisions

- 2026-07-28 — Core already emits deterministic baseline/candidate case phases; the missing work is operation/transport/projection parity plus timing, not a second evaluator.
- 2026-07-28 — Progress is operational evidence only: sequence, elapsed time, cache reuse, and cancellation state must never enter immutable Benchmark results or their hashes.
- 2026-07-28 — Studio and CLI will project the same Core event contract. Studio uses NDJSON so the browser can render each case before the final verdict; CLI reserves stdout for the final JSON result and writes machine progress to stderr.
- 2026-07-28 — Clean-copy memory-fab profiling measured one-case cold/warm operation time at 3293/1653 ms and five-case cold/warm time at 11086/6731 ms. In the five-case warm run, compilation used 254 ms, cache reads 3 ms, comparison 13 ms, and fresh Candidate simulation 6407 ms: approximately 96% of case time is the simulator, so more cache or serialization work is not the next intervention.
- 2026-07-28 — The next performance plan is [[plans/simulator-hot-path-performance]]: measure event-family cost before choosing hot-path changes or isolated case concurrency.

## Verification

- `bun run check:fast` — documentation, all TypeScript projects, and short unit suite passed.
- `bun test packages/inm-core/src/operation.test.ts` — progress ordering, timing/cache fields, result parity, and abort-without-Candidate-or-mutation passed.
- `bun test packages/inm-studio/src/server.test.ts` — Benchmark and Candidate NDJSON plus existing Studio contracts passed.
- Public five-case `inm benchmark ... --progress ndjson --json` — 20 ordered Core events on stderr and one final JSON result on stdout.
- Browser QA at `http://localhost:4176/memory-fab/experiments/dispatch-research` — live exact case rendered, KEEP completed, CANCEL returned to a runnable no-result state, and console warnings/errors were empty.
- `bun run test` — 251 package tests / 2150 assertions and all 8 ironworks fixtures passed.

## Progress log

- 2026-07-28 — Proposed from the completed lifecycle and baseline-reuse work.
- 2026-07-28 — Activated after tracing the existing case events through Core, CLI, Studio routes, and the Experiment workbench.
- 2026-07-28 — Implemented Core progress V2, CLI human/NDJSON projection, Studio streaming/cancellation, operational timing, and direct Core/API/public-binary coverage.
- 2026-07-28 — Browser QA ran the real five-case `dispatch-research` workbench: baseline reuse advanced into Candidate case 1, final KEEP rendered, cancellation removed the partial run without a verdict, and console warning/error output remained empty.

## Completion

Completed on 2026-07-28. Benchmark and Candidate execution now expose one exact, cancel-safe operational stream to humans and Agents without changing immutable industrial evidence. The measured remaining cost is isolated to [[plans/simulator-hot-path-performance]].
