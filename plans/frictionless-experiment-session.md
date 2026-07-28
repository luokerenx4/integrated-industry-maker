# Frictionless experiment session

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/operation-workbench]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Make the ordinary local experiment loop feel proportional to the experiment itself: a direct Experiment route loads only the project-local experiment surface, a focused locked evaluation stays visibly reconnectable, and interrupted lifecycle tests cannot leave indefinite Studio listeners behind.

## Context

The current managed memory-fab Studio is healthy and source-current. `studio status` completes in about `0.09s`, and a warm focused `equipment-energy-research` evaluation completes in about `0.45s`. The remaining interaction cost is structurally elsewhere:

- Opening `/memory-fab/experiments/equipment-energy-research` first requests the complete `3.0 MB` Factory replay payload, a `259 KB` operator snapshot, and a separately rebuilt observation brief before it can mount the Experiment workbench.
- The direct Experiment route renders the complete Overview underneath its modal, including the full loss chain, contributor evidence, WIP tradeoff, work queue, and recent evidence. The browser therefore pays for an unrelated dense DOM even when the operator only wants one experiment.
- A lifecycle test interrupted while intentionally corrupting managed ownership left a detached temporary Studio alive for more than three hours on port `52470`. Its state file was absent, so the safe lifecycle command correctly refused to guess ownership. `finally` cleanup is insufficient for a process designed to survive its starting CLI.

This slice removes those two concrete sources of friction. It does not weaken locked Benchmark authority, make simulation in-process again, cache Candidate outcomes, or automate subjective factory design.

## Scope

### In scope

- Route-aware Studio loading so a direct Experiment route uses the existing lightweight experiment and retained-operation APIs without loading Factory events, Overview evidence, or observation evidence.
- A dedicated lightweight Experiment render path that does not mount the complete Overview behind the workbench.
- Correct transition back to the full project workbench, WebSocket refresh behavior, direct-link title/error behavior, and retained operation recovery.
- An explicit test-only idle lease for detached managed Studio servers so forcibly interrupted lifecycle tests self-terminate.
- Exact measurements, targeted tests, browser verification, full checkpoint verification, commit, push, and a source-current live Studio.

### Out of scope

- Changing simulation semantics, Objective scoring, Benchmark cases, or memory-fab industrial design.
- Hiding legitimate five-case or multi-Candidate computation behind unsafe result caching.
- Killing unknown listeners, weakening PID/source ownership checks, or making production Studio services expire.
- Splitting every Studio surface or the full Factory payload in this first slice.

## Acceptance

- [x] A fresh direct Experiment route does not request or render the full Studio data, Overview, or observation surfaces before becoming usable.
- [x] The focused memory-fab experiment can start, show exact case progress, complete, and reopen its retained result with the same Core authority as CLI.
- [x] Closing the direct Experiment surface loads the ordinary project workbench correctly, and project-file refreshes reload only the active surface.
- [x] Detached lifecycle-test Studios receive a bounded idle lease; a forcibly abandoned test listener terminates without relying on its missing or damaged state file.
- [x] Normal macOS managed Studio remains persistent, discoverable, source-current, and available on its managed port.

## Work

- [x] Reproduce the current direct-route load, operation timing, payload sizes, process table, and orphaned listener.
- [x] Add the lightweight route policy and Experiment catalog state to Studio.
- [x] Add and test the detached test-service idle lease.
- [x] Run the focused and multi-case experiment experience through browser and CLI boundaries.
- [x] Record measurements and decisions, run the full checkpoint, commit, push, and restart the live Studio.

## Findings and decisions

- 2026-07-29 — `inm studio status examples/memory-fab --json` completes in `0.092s`; current managed port `4176` is healthy and source-current. Port discovery is not the present hot path.
- 2026-07-29 — Current endpoint measurements are: project index `277 B / 0.030s`, experiment catalog `7.7 KB / 0.001s`, retained operation index `19.7 KB / 0.002s`, full Studio data `3.0 MB / 0.105s`, Overview `259 KB / 0.470s`, and observation `3.5 KB / 0.808s`. The current client performs the three heavy project requests before showing a direct Experiment route.
- 2026-07-29 — The focused locked evaluation itself completes in `0.45s`, reuses its exact baseline, runs the fresh Candidate in an isolated Worker, and keeps the page responsive. Simulator work is not the first experience intervention for this route.
- 2026-07-29 — The verified temporary listener on `52470` was terminated without touching the healthy `4176` service. Its missing lifecycle state proves the recovery boundary cannot depend exclusively on a test `finally` block.
- 2026-07-29 — A fresh source-current Experiment reload reaches the complete retained workbench in about `260ms`. The rendered route contains `255` elements, one result article, and one dialog; the complete Overview and realized fab-loss chain are absent.
- 2026-07-29 — The five-case `dispatch-research` route remains responsive and exact: five cached baselines complete first, five fresh Candidate cases run with `PARALLEL ×5`, and the final measured Candidate case reports `0.55s` with a `20ms` cold Worker startup.
- 2026-07-29 — Lightweight routing is a presentation/data-loading boundary only. Benchmark execution, reconnectable identity, progress, cancellation, retained results, and Candidate authority remain unchanged.

## Verification

- `bunx tsc -p packages/inm-studio/tsconfig.json --noEmit` and `bunx tsc -p packages/inm-cli/tsconfig.json --noEmit` — passed.
- `bun test packages/inm-studio/src/routes.test.ts packages/inm-cli/src/studio-lifecycle.test.ts` — `17` passed, including a real detached server that self-terminates after its test lease.
- `bun run check:fast` — documentation, all TypeScript projects, and `35` short tests / `209` assertions passed in about `13s`.
- Browser direct-route QA — focused Experiment loaded without Overview evidence, retained result reopened, locked evaluation completed, close returned to `/memory-fab`, and five-case parallel evaluation completed with visible progress.
- `bun run test` — `298` tests / `3211` assertions passed in `163.35s`; all eight public Ironworks fixtures passed.
- Process/lifecycle audit after the full test — only managed memory-fab Studio PID `62532` listens on `4176`; running and expected source hashes match.

## Progress log

- 2026-07-29 — Plan created from a real browser experiment, endpoint timings, and process inspection; the leaked temporary listener was verified and stopped.
- 2026-07-29 — Implemented route-aware loading and the detached test lease, passed targeted and full verification, and left the source-current memory-fab Studio available on its managed port.

## Completion

Shipped a lightweight direct Experiment surface that avoids the unrelated `3.0 MB` Factory replay and dense Overview render, while preserving exact reconnectable Core evaluation. Detached lifecycle-test servers now self-terminate after bounded inactivity, including when test-owned state has been removed or corrupted before cleanup.
