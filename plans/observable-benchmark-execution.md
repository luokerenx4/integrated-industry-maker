# Observable Benchmark execution

- Status: `proposed`
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

- [ ] A human or Agent can identify the exact running case and completed/planned work from CLI or Studio.
- [ ] Cached baseline work is labeled as reuse while fresh Candidate work remains explicit.
- [ ] Interrupting or failing a stream produces no verdict, Blueprint mutation, or immutable result.
- [ ] Profiling evidence identifies and documents the next performance intervention.

## Work

- [ ] Specify the shared progress/timing contract and operation boundary.
- [ ] Add CLI human/NDJSON projection and public discovery.
- [ ] Stream the same events to the Studio Experiment workbench.
- [ ] Measure representative one- and five-case memory-fab programs.
- [ ] Complete cross-surface and interruption verification.

## Findings and decisions

- 2026-07-28 — Core already emits deterministic baseline/candidate case phases; the missing work is operation/transport/projection parity plus timing, not a second evaluator.

## Verification

- Pending.

## Progress log

- 2026-07-28 — Proposed from the completed lifecycle and baseline-reuse work.

## Completion

Pending.
