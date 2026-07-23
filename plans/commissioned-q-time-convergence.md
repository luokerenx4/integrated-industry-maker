# Converge commissioned memory-fab Q-time

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/product-routes]], [[docs/design/batch-processing]], [[docs/design/quality-flow]], [[docs/design/usage-based-maintenance]], [[docs/design/design-programs]], and [[docs/design/experiment-workbench]].

## Outcome

Humans and Agents can identify the exact step, Device, lot count, and waiting mechanism behind Route Q-time loss, and the commissioned memory factory reduces those violations through causal batch-flow or maintenance-capacity interventions without surrendering its accepted quality, delivery, capacity, or locked-case gains.

## Context

Current immutable run `058-simulate` makes Route Q-time the highest ranked signal after the dedicated etch quality cell removes the preceding yield constraint. Five lots violate a Q-time contract in six step visits, but the public Fab Loss Profile currently exposes only the Route aggregate. Studio's Factory projection already shows three anneal and three final-inspection violations; an Agent should not need browser access or raw NDJSON parsing to recover the same causal split.

The immutable events show two different industrial mechanisms:

- `dram-lot-07`, `dram-lot-08`, and `dram-lot-11` wait 40.8, 33.8, and 29.0 seconds for `batch-anneal-dielectric-stack` against a 20-second contract. The three-lot furnace delays early arrivals until a complete companion batch exists.
- `dram-lot-11`, `dram-lot-10`, and `dram-lot-09` wait 38.3, 40.3, and 42.3 seconds for `inspect-final-pattern-deep` against a 35-second contract. Mandatory inspection service finishes at tick 182100, but its qualification waits until tick 205600 while the shared one-crew provider performs opportunistic lithography and etch service/qualification.

A release-policy tweak, faster transport, larger buffer, or relaxed Q-time threshold is not evidence that either mechanism was repaired. The next cycle must expose the causal split first and evaluate physical batch flexibility, service dispatch/capacity, or another directly measured intervention under the unchanged five-case contract.

## Scope

### In scope

- Add generic step-level Q-time contributors and their Device/lot/wait evidence to the shared Core Fab Loss Profile.
- Project the same structured contributors through CLI, Studio, compatible-run diagnostics, and Design driver evidence.
- Use project-local TypeScript research to compare bounded anneal batch-flexibility and maintenance service-priority/capacity interventions from exact Blueprint `9af27defc6f17385e8d242c272de40878a84d4405a10ebe165076fc9560121b5`.
- Preserve commercial `27/32`, performance `12/12`, automotive `6/6`, portfolio net value at least `+164`, completed and first-pass lots, first-pass yield, rework no worse than 5 cycles, equipment-drift defects no worse than 2, zero quality escapes, and capacity `READY`. Report scrap dispositions explicitly, but do not use a lower unfinished-WIP disposition count as a causal quality guard.
- Promote and apply only a reviewed Candidate that has zero current-best regression in all five locked cases.

### Out of scope

- Relaxing evaluator-owned Q-time contracts, defect excursions, demand, Objective weights, or current-best guardrails.
- Calling generic queue, release, transport, or buffer changes a Q-time intervention without step-level before/after evidence.
- Replacing the physical three-lot furnace with hidden fractional capacity or making maintenance/qualification instantaneous.
- Shared project assets, backward-compatibility adapters, or migration aliases.

## Acceptance

- [x] CLI and Studio expose identical structured Q-time contributors for immutable before run `058-simulate` and current after run `059-simulate`, including their physical subjects.
- [x] Immutable before/after evidence reduces Route Q-time violations through one or both identified mechanisms without weakening the fixed contracts.
- [x] The accepted factory preserves the commissioned delivery, quality, capacity, and value floors and has zero regression in every locked case.
- [x] A bounded commissioned Design run records the intervention, step-level driver evidence, and exact five-case decision; only a reviewed `KEEP` Candidate may update the Blueprint.
- [ ] Focused tests, project fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [x] Extend Core Q-time attribution from one Route aggregate to ordered step/Device contributors without duplicating simulator authority.
- [x] Add CLI, Studio, diagnostics, and immutable Design projections with human/AI parity tests.
- [x] Build a project-local TypeScript sweep for bounded batch-flexibility and maintenance service interventions.
- [x] Evaluate, review, and apply only a non-regressing winner; regenerate the immutable current run.
- [ ] Update durable design documentation and run the completion audit.

## Findings and decisions

- 2026-07-23 — The current six violations are not one queue problem: anneal waits for batch companions, while final inspection waits behind mandatory service plus qualification crew contention.
- 2026-07-23 — Inspection qualification is blocked for 23.5 seconds after service while the same single physical crew performs opportunistic `lithography-l2` and `etch-l2` work. This makes provider dispatch or capacity a causal candidate, not a generic inspection-speed guess.
- 2026-07-23 — Step-level Factory metrics already exist, but the Fab Loss Profile and CLI reduce them to Route totals. Closing that human/AI evidence gap precedes optimization.
- 2026-07-23 — Fab Loss Profile V4 now derives ordered Q-time contributors from authoritative run events without changing simulation metrics or the immutable `058-simulate` result hash. The current split is three `furnace-1` batch-companion visits with `43.6` total overrun seconds and three `inspection-1` maintenance/qualification visits with `15.9` total overrun seconds.
- 2026-07-23 — A 23-variant project-local TypeScript sweep found that zero-wait rapid fallback plus a physical dual-crew service bay improves every locked case by at least `20.182194`, reduces mixed-quality Q-time `6 → 2`, raises completed lots `6 → 8`, first-pass completions `5 → 8`, first-pass yield `0.417 → 0.667`, reduces rework `5 → 4`, preserves two drift defects and zero escapes, and raises portfolio value `+164 → +196`.
- 2026-07-23 — Absolute scrap count is not a causal guard across unequal terminal WIP: the incumbent ends with only 7/12 lots terminal (`6` complete + `1` scrap), while the leading intervention terminally dispositions all 12 (`8` complete + `4` scrap) under the unchanged fixed excursions and unchanged drift count. Quality acceptance therefore retains first-pass, rework, drift, and escape evidence and reports scrap, rather than rewarding bad lots for remaining unfinished.
- 2026-07-23 — Giving pending qualification blanket scheduler priority was tested and rejected: it reduced one visit but changed the production trajectory to two final-inspection waits averaging `127.5` seconds and increased scrap. The simulator change was removed; explicit Blueprint capacity remains the candidate.
- 2026-07-23 — The commissioned Q-time proposal now requires the already commissioned independent layer-two lithography, etch, and N+2 utility assets. This prevents the specialized four-operation patch from displacing the generic bounded-batch proposal in greenfield search.
- 2026-07-23 — Reviewed Candidate `furnace-flex-dual-service` applies four exact operations from Blueprint `9af27defc6f17385e8d242c272de40878a84d4405a10ebe165076fc9560121b5` to `d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392`.
- 2026-07-23 — Current run `059-simulate` removes every anneal batch-companion violation and reduces total Q-time `6 → 2`. Its remaining final-inspection contributor is intentionally retained: two visits accumulate `83.6` overrun seconds while all twelve lots reach terminal disposition.

## Verification

- `bun run memory-fab:research-commissioned-qtime --json` — 23 variants against immutable `058-simulate`; the selected zero-wait flexible furnace plus dual crew improves all five cases by `+23.263267`, `+21.800953`, `+20.182194`, `+25.611828`, and `+21.151069`.
- `bun run inm validate examples/memory-fab --json` — valid, 62 Devices, 17 connections, Blueprint `d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392`.
- `bun run inm plan examples/memory-fab --json` — capacity `READY`, zero gaps.
- `bun run inm simulate examples/memory-fab --json` — current run `059-simulate`, result `d75e181c9994e1e5a405317204de1bf3d20eaabc5110854feb2a75094b3de128`.
- `bun run docs:check` — 583 double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, Ironworks assets, and memory-fab assets pass.
- `bun run test` — 198 tests, 1,786 assertions, all Ironworks fixtures, zero failures.
- Studio server `/api/projects/memory-fab/overview` — current `059-simulate`, primary `yield-quality`, one structured final-inspection Q-time contributor.
- Manual browser refresh and visual check remain pending because automated reload was rejected by the in-app browser URL security policy.

## Progress log

- 2026-07-23 — Proposed from the completion audit of [[plans/commissioned-yield-convergence]] against immutable run `058-simulate`.
- 2026-07-23 — Activated against exact current Blueprint `9af27defc6f17385e8d242c272de40878a84d4405a10ebe165076fc9560121b5`; the first implementation boundary is generic step-level Q-time evidence shared by compatible-run and Design projections.
- 2026-07-23 — Implemented and verified Core V4 contributors plus matching machine/human CLI and Studio projections; focused Core/CLI/Studio tests, type checking, and 583 documentation links pass.
- 2026-07-23 — Added `memory-fab:research-commissioned-qtime`; the bounded five-case sweep rejected faster-flow variants that failed causal quality floors and selected the zero-wait flexible furnace plus dual-crew service capacity for guarded Design evaluation.
- 2026-07-23 — Pinned the research script to immutable before run `058-simulate`, recorded Design Run `899f244bdc608c26db883d9093abdfebeedbae9364e4b01f60e9e638fcfdfb35`, reviewed and applied Candidate `furnace-flex-dual-service`, and generated current run `059-simulate`.
- 2026-07-23 — Relocked all eight memory-fab Benchmarks after the new project-local Device asset changed the catalog hash, generated compatible energy run `060-simulate`, and completed the repository-wide regression.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
