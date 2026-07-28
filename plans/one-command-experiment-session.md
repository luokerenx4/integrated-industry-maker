# One-command experiment session

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/operation-workbench]], [[docs/design/agent-cli-contract]], and [[docs/design/studio-debugger]].

## Outcome

Let a human or Agent enter one exact project-local Experiment session without managing Studio source freshness, ports, navigation, or a blocking evaluation process: one command ensures the current managed Studio, resolves the direct lightweight Experiment route, optionally starts the reconnectable Benchmark operation, and returns the same URL and operation identity in human and JSON forms.

## Context

Earlier work removed the dense Factory/Overview hydration from direct Experiment routes and made managed Studio safely discoverable. The remaining routine still spans several commands and mental states: inspect or guess the service, repair stale source, remember the selected port, navigate to a project-qualified Experiment route, and then start work from the browser.

Current measurements show that these coordination steps dominate the perceived friction rather than the focused evaluator:

- source-stale port 4176 was safely repaired by `studio start` in `0.31s`;
- `equipment-energy-research` was accepted by Studio in `22ms` and completed in `574ms`;
- the full repository checkpoint takes about `177.5s`, while the daily fast boundary takes about `12.6s`.

The product should expose the already-correct lifecycle and reconnectable operation model as one ordinary entry point instead of requiring an operator to compose them manually.

## Scope

### In scope

- A TypeScript `inm session <path> --experiment ID` command that resolves a project, ensures one source-current managed Studio without port memory, and targets the exact direct Experiment route.
- Optional `--run` execution that returns immediately with the Studio-owned reconnectable operation identity instead of blocking the CLI on locked evaluation.
- Human and JSON output with project, Studio lifecycle/source, route, operation polling URL, and exact next actions.
- CLI discovery, lifecycle/session tests, documentation, real memory-fab timing, browser verification, commit, and push.

### Out of scope

- Caching Candidate outcomes, changing Benchmark or simulator semantics, or automating factory-design judgment.
- Replacing the standalone CLI Benchmark command, which remains the browser-free synchronous evaluation surface.
- Adding generic arbitrary routes, Design execution, production supervision, or unsafe termination of unknown listeners in this slice.

## Acceptance

- [x] One command reaches the exact Experiment route with a source-current Studio regardless of whether the service was absent, current, or verifiably stale.
- [x] `--run` returns a reconnectable operation id and polling URL without waiting for the Experiment result; Studio and CLI session views identify the same operation.
- [x] Port fallback, ownership safety, direct lightweight routing, and standalone CLI evaluation contracts remain unchanged.
- [x] Fast, targeted, full, real memory-fab, and browser verification pass.

## Work

- [x] Measure the current lifecycle and focused Experiment boundary.
- [x] Add the shared session command and machine-readable contract.
- [x] Add tests, discovery, documentation, and exact recovery guidance.
- [x] Run real memory-fab and browser verification, complete the plan, commit, and push.

## Findings and decisions

- 2026-07-29 — Focused simulation is not the first remaining bottleneck: warm `equipment-energy-research` completes in about `0.57s`. The product gap is coordination latency and ambiguity before the evaluator starts.
- 2026-07-29 — The session command will reuse Studio's existing retained operation registry. It must not invent a second background-job model or claim that a synchronous CLI process is reconnectable.
- 2026-07-29 — The first public session target is an authored Experiment. Design Programs already have more stateful run/continue/promote semantics and will remain a separate later decision.
- 2026-07-29 — `session --run` is industrially read-only: it creates ignored reconnect state but no Benchmark lock, Candidate receipt, Blueprint mutation, or immutable factory evidence. Its exact operation result remains owned by Studio's existing registry.
- 2026-07-29 — JSON mode deliberately carries the initial operation snapshot and polling URL. An Agent that wants no server or browser continues to use synchronous `inm benchmark`; no fake CLI resumability was introduced.

## Verification

- `bun run check:fast` — documentation, all TypeScript projects, and 35 short tests passed in `13.1s`.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts` — 12 passed, including one-command start/run/reconnect, stale replacement, fallback ports, ownership refusal, and abandoned-test cleanup.
- Real stale memory-fab session:
  - `inm session examples/memory-fab --experiment equipment-energy-research --run --no-open --json` returned in `0.37s`;
  - source was repaired to current on managed port `4176`;
  - operation `ms5a6fuo-e60…` completed independently in `627ms`, with four progress events and one exact baseline-cache hit.
- Browser direct-route QA — `/memory-fab/experiments/equipment-energy-research` recovered the same operation short id, completed state, and `DISCARD` result; no Overview/fab-loss surface or alert was present.
- `bun run test` — 299 tests / 3230 assertions passed in `164.43s`; all eight public Ironworks fixtures passed.

## Progress log

- 2026-07-29 — Plan created after measuring source repair, Studio acceptance, focused completion, and repository feedback boundaries.
- 2026-07-29 — Public command, human/JSON contract, tests, documentation, real stale-source repair, retained operation recovery, and browser QA completed.

## Completion

`inm session` now compresses the ordinary human/Agent Experiment entry into one command: source-current managed Studio, port discovery, exact lightweight route, optional non-blocking retained run, and a shared operation identity. The synchronous browser-free Benchmark path remains unchanged.
