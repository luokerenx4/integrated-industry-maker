# Observable design execution

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], [[docs/design/agent-cli-contract]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]]

## Outcome

Make a bounded memory-fab Design Program run an observable shared operation: Core emits one deterministic machine-readable account of baseline preparation, seed evaluation, proposal generation, locked-case evaluation, decision, and artifact completion; CLI and Studio project that same account for Agents and humans; and immutable locked baseline work is evaluated once per case rather than repeated for every candidate.

## Context

The complete memory-fab design loop is now robust but opaque while executing. A one-candidate run blocks for roughly twenty seconds and larger authored budgets scale linearly without telling an operator or Agent which proposal or locked case is active. Studio shows only a generic loading label, while CLI emits nothing before the final envelope.

`evaluateBlueprintBenchmark()` also recompiles and simulates the immutable baseline side of all five locked cases for the seed and every proposal. Those inputs are hash-locked and invariant for the entire Design run, so repeating them adds latency without evidence. Reuse must stay invocation-local and hash-checked; it must never become a stale cross-run cache or weaken the locked evaluator.

## Scope

### In scope

- A Core-owned versioned Design progress event union with deterministic ordering and no timestamps or presentation-only authority.
- Invocation-local preparation of locked baseline case evidence, reused by seed and candidate evaluation after exact contract/hash validation.
- A CLI progress projection suitable for terminal users and an explicit NDJSON mode suitable for Agents while preserving one final JSON success/error envelope.
- A streaming Studio Design endpoint and visible case/iteration progress driven by the same Core events.
- Real memory-fab timing/work-count evidence, deterministic result equivalence, API/CLI tests, and desktop/390 px browser QA.

### Out of scope

- Persistent evaluation caches across commands or engine versions, concurrent candidate evaluation, cancellation/resume, job queues, distributed workers, or background daemons.
- Progress inferred from wall-clock percentages, simulator-internal event counts, or browser-only timers.
- Changes to Benchmark acceptance gates, Objective values, proposal order, or immutable Design Run identity.

## Acceptance

- [x] Core emits ordered, serializable progress for baseline preparation, seed evaluation, proposal, every locked case, candidate decision, and final immutable result; the event contract is identical for heuristic and project-local providers.
- [x] A Design invocation simulates each locked baseline case exactly once, then reuses that hash-validated evidence for the seed and every candidate without changing Benchmark results, KEEP/REJECT decisions, best Blueprint, or result hash.
- [x] `inm design --run` gives a useful human progress account, and an explicit machine mode emits one NDJSON event per Core progress item without contaminating the final JSON envelope.
- [x] Studio consumes a streamed Design response, shows the actual iteration/case/decision state, survives structured execution errors, and reopens the completed hash-addressed run through the existing route.
- [x] Core, public CLI, Studio API, docs, full test gates, and desktop/390 px browser QA pass against the real memory-fab project.

## Work

- [x] Define the progress contract and prepared locked-Benchmark evaluation session in Core.
- [x] Integrate progress and baseline reuse into Design Program execution with deterministic equivalence tests.
- [x] Add human and NDJSON CLI projections plus machine-help documentation and public-binary tests.
- [x] Stream progress through the project-qualified Studio API and render the shared operation state.
- [ ] Update design documentation, verify the real memory-fab loop, complete browser/full-suite audit, commit, and push.

## Findings and decisions

- 2026-07-23 — One candidate currently evaluates the five-case Benchmark twice for the seed and twice again for the proposal: twenty simulations, ten of which repeat the immutable baseline. With `N` candidates, current work is `2 × cases × (N + 1)` simulations; invocation-local reuse reduces it to `cases × (N + 2)` without sharing mutable candidate evidence.
- 2026-07-23 — Progress belongs to Core rather than CLI or React. Presentation surfaces may format or filter events but must not invent execution phases or success state.
- 2026-07-23 — Progress evidence is operational and deliberately excluded from the immutable Design Run hash. The completed manifest remains the replayable decision evidence.
- 2026-07-23 — The prepared baseline is an invocation-local compiled/evaluated object, not a disk cache. `compareFactoryBlueprints()` verifies its Blueprint hash before reuse and still evaluates every candidate normally.
- 2026-07-23 — A real one-candidate public CLI and Studio API run now complete in about 16.5 seconds in focused tests, down from roughly 24 seconds before reuse, while emitting 15 completed simulation units and the same immutable result contract.

## Verification

- `bun run typecheck` — Core, CLI, Studio, and both project TypeScript packages pass.
- `bun test packages/inm-core/src/design-program.test.ts -t "bounded Design Program run"` — two identical one-candidate runs emit identical 35-event sequences, simulate exactly five baseline + five seed + five candidate cases, reproduce one result hash, and leave the seed byte-identical.
- `bun test packages/inm-cli/src/commands.test.ts -t "public Design Program workflow"` — the public binary emits parseable NDJSON progress on stderr and one final JSON/artifact envelope on stdout.
- `bun test packages/inm-studio/src/server.test.ts -t "Studio exposes the same memory-fab Design Program"` — the project API streams progress/result records, returns a structured stream error, reopens the immutable run, and preserves the seed.
- Browser QA at desktop and 390 × 844 — a real Studio-triggered run visibly advances from baseline case 1/5 at 0/15 to candidate case 5/5 at 14/15, then reopens immutable result `843724d…`; the narrow dialog is 390 px, the progress card is 370 px, document scroll width is 390 px, and the console has no warnings/errors.
- `bun run test` — 472 documentation links, all TypeScript packages, 186 Core/CLI/Studio tests with 1,554 expectations, and all eight Ironworks fixtures pass.

## Progress log

- 2026-07-23 — Audited Core Design execution, Benchmark comparison, CLI command behavior, Studio POST handling, and the existing generic loading UI; plan created and indexed.
- 2026-07-23 — Added prepared locked-Benchmark baseline evidence, the Core Design progress union, human/NDJSON CLI projection, streaming Studio API/UI, focused parity tests, and contract documentation.
- 2026-07-23 — Exercised the visible stream twice against the live memory-fab Studio at desktop and 390 px; actual case identity/work counts updated during execution and the completed route/result remained stable.

## Completion

Pending.
