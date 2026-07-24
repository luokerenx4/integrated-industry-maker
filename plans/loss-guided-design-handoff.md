# Connect measured fab loss to the shared Design loop

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/design/operation-workbench]], [[docs/design/agent-cli-contract]], and [[docs/design/fab-loss-attribution]].

## Outcome

When a compatible memory-fab run exposes a prioritized industrial loss, the shared Workbench identifies the current Blueprint's project-local Design Program and gives humans and Coding Agents one identical, route-backed, exact-argv handoff into the bounded locked-Benchmark design loop.

## Context

Compatible run `074-simulate` ranks productive-equipment input starvation first and exposes eight ordered Device contributors. Project-local Program `commissioned-dram-fab` already seeds from the exact live `generated-dram-fab` Blueprint, uses that Blueprint as its locked Benchmark promotion target, and supplies the measured loss chain to its TypeScript proposal provider.

The shared `ProjectWorkbenchSnapshot` does not currently discover Design Programs, count them, describe a Design operation, or target one from `nextAction`. A human can notice the separate Studio `DESIGN` navigation item and an Agent can independently discover `inm design`, but Core does not connect the measured loss to either path. That is a human/AI parity and industrial-actionability gap rather than a missing optimizer.

## Scope

### In scope

- Replace the Workbench snapshot contract with a strict version that includes deterministic project-local Design Program summaries and current-selection alignment.
- Advertise the bounded `design.run` artifact-creating capability with honest availability, write set, and locked-input guards.
- Prefer one aligned, locked authored-Blueprint Design Program as the safe read-only handoff after compatible measured-loss evidence and before a generic diagnostic-only action.
- Project the exact same target, CLI argv, route, counts, and operation availability through `inm inspect` and Studio.
- Execute the aligned memory-fab Program against the current commissioned Blueprint and let its unchanged locked Benchmark decide whether any proposal may become a Candidate.

### Out of scope

- Automatically starting a Design Run merely by opening Overview.
- Inferring capabilities by parsing project-strategy TypeScript or claiming that a Program will eliminate a named loss before evaluation.
- Changing World, Scenario, Objective, Benchmark inputs, current-best regression budgets, or outcome guardrails.
- Adding shared Design Programs, compatibility readers, or browser-owned recommendation state.

## Acceptance

- [x] Core read-only discovery deterministically reports all project Design Programs and marks alignment only when an authored seed and locked Benchmark promotion target both equal the effective Blueprint.
- [x] With current compatible loss evidence and no higher-priority blocker/review, Workbench recommends the aligned Program brief using an exact `inm design ... --program ... --json` argv and project-qualified Studio route.
- [x] CLI and Studio consume the same Core target and operation descriptor; neither recomputes alignment or recommendation priority.
- [x] Missing, synthesis-seeded, unlocked, or differently targeted Programs remain visible but cannot be recommended as current-factory optimization authority.
- [x] The current memory-fab Design Run records complete locked-case evidence; only an accepted zero-current-best-regression leader may cross the existing Design → Candidate → review → apply boundary.
- [x] Documentation, focused/full tests, project validation, browser verification, Git, and remote verification pass.

## Work

- [x] Define the Workbench V5 Design summary, alignment rule, operation, and target contract.
- [x] Implement Core discovery/recommendation and exact CLI projection.
- [x] Wire Studio Overview recommendation into the existing route-backed Design workbench.
- [x] Run and inspect the current commissioned memory-fab Design Program; promote/review/apply only if every existing gate permits it.
- [x] Update durable design documentation, tests, current evidence, and final verification.

## Findings and decisions

- 2026-07-24 — `074-simulate` provides current, hash-compatible evidence with chain `input-starvation → yield-quality → transport-blocking → queue-congestion → maintenance-qualification`; its primary signal alone is prioritization evidence, not proof that widening release or adding equipment will improve the Objective.
- 2026-07-24 — `commissioned-dram-fab` is the only current-factory authority: its authored seed is `generated-dram-fab`, and locked Benchmark `greenfield-dram-design` also names `generated-dram-fab` as the candidate/promotion target. Greenfield synthesis and the separate `experiment` Program remain visible but are not aligned.
- 2026-07-24 — The recommendation opens the read-only Program brief first. Starting a bounded Design Run continues to be an explicit artifact-creating action exposed by that brief.
- 2026-07-24 — Workbench V5 discovers three Programs and marks only `commissioned-dram-fab` aligned. Core owns the exact `design.inspect` target, `inm design ... --program commissioned-dram-fab --json` argv, `/memory-fab/designs/commissioned-dram-fab` route, and `design.run` effect/guard contract; CLI and Studio only project them.
- 2026-07-24 — Design Run `260d04b0c76047e4d0ddd3b4175fdb6f6480836ec54c87569a1d51c382f164fd` evaluated four of seven allowed proposals and stopped `frontier-exhausted`. All four were rejected: wider `9/6 EDD` and `10/7 EDD` release loops failed absolute on-time service and lost aggregate score; `8/5 EDD` passed the fixed Benchmark gate but regressed every current-best case; four-job inspection maintenance gained `+0.521585` aggregate but still failed mixed-quality and facility on-time floors. The seed remains leader with zero promotion operations, so no Candidate/review/apply action is valid.
- 2026-07-24 — Studio operation buttons now honor Core `unavailable` state. A project without a locked Design Program cannot click through and dereference a missing Program; CLI templates also select only an aligned or otherwise locked Program.

## Verification

- Focused Core Workbench tests: `bun test packages/inm-core/src/workbench.test.ts` — passed.
- Public CLI inspect parity: exact Workbench V5 Design summaries, target, argv, and envelope next action verified.
- Focused Studio route/parity tests — passed.
- Browser: project launcher → `/memory-fab` and Overview → aligned Design Program both reconstructed from stable routes; cold restart plus repeated project-open checks produced no page, network, or runtime error.
- `bun run docs:check` — 713 double-links passed.
- `bun run typecheck` — Core, CLI, Studio, Ironworks assets, and memory-fab assets passed.
- `bun run test` — 223 tests, 1875 assertions, all Studio/CLI/Core suites and all Ironworks project fixtures passed.
- `bun run inm validate examples/memory-fab --json` — passed with zero validation diagnostics.
- `bun run inm analyze examples/memory-fab --section summary --json` — passed and projected the current 62-Device, 17-link memory fab.
- `bun run inm test examples/memory-fab` — both bounded-batch and re-entrant DRAM-route fixtures passed.
- `bun run inm inspect examples/memory-fab --section next-action --json` — exact Core `design.inspect` target and envelope parity passed.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --section summary --json` — locked authored seed and exact creates-artifact next action passed.
- Final cold-built Studio browser: launcher, `/memory-fab`, `DESIGN 3`, shared loss recommendation, `/memory-fab/designs/commissioned-dram-fab`, locked Program, current immutable run, and new-run control rendered with zero runtime/network errors.
- Feature commit `2cc8244bd51b338ede25056527a3e0edafb959d8` was pushed to `origin/main`; `git ls-remote` returned the exact same hash.

## Progress log

- 2026-07-24 — Plan activated from a clean `main` after comparing current Workbench loss evidence, Design Program manifests, and existing CLI/Studio discovery paths.
- 2026-07-24 — Implemented the shared Core contract, projected it through CLI and Studio, executed the unchanged locked Program, and retained its four guarded rejections as immutable local Design evidence rather than manufacturing a Candidate.

## Completion

Workbench V5 now connects compatible physical loss evidence to the exact locked Design Program that owns the effective commissioned Blueprint. Humans receive one route-backed Design control room; Agents receive the same typed target and argv; opening either remains read-only, while an explicit run retains the existing immutable locked-case contract. The current memory-fab search produced four useful rejections and correctly stopped without a promotable Candidate. Full repository, project, browser, Git, and remote evidence passed on 2026-07-24.
