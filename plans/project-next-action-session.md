# Project next-action session

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/development-operations]], [[docs/design/agent-cli-contract]], [[docs/design/operator-workbench]], and [[docs/design/experiment-workbench]].

## Outcome

Let a human or Agent enter the exact current project work from one portless command: `inm session <path>` must establish a source-current managed Studio and open the shared Core Workbench next action, while the explicit `--experiment ID [--run]` form remains the reconnectable locked-evaluation entry.

## Context

The managed lifecycle is no longer the dominant delay. A live audit found a healthy current Studio server behind a stale manager identity; `studio status` reported that distinction in `0.08s`, and an ordinary Experiment session safely replaced the verified manager/server pair and returned a current direct route in `0.68s`.

The remaining entry friction is semantic. `inm session examples/memory-fab --no-open --json` fails usage before consulting the project because `--experiment` is mandatory. A human or Agent must already know one of eight Benchmark ids even when the current Workbench has an exact Run `100-simulate` next action, CLI argv, effect, confirmation boundary, and stable Studio route. The direct Experiment page then presents all eight programs, but it cannot explain why that Experiment is the current industrial task.

The session command should consume the existing shared Workbench authority rather than inventing a browser landing rule. Explicit Experiment execution stays distinct: a generic next action may create evidence or require confirmation, so `--run` cannot mean “execute whatever Core recommends.”

## Scope

### In scope

- Make `--experiment` optional for `inm session`.
- Without it, fetch the source-current Studio's shared Workbench snapshot and enter its exact `nextAction.studioRoute`.
- Return the same next-action id, reason, argv, effect, confirmation boundary, route, and URL to CLI Agents and the browser.
- Preserve explicit Experiment targeting and reconnectable `--run`, but reject `--run` without `--experiment` before starting or changing a service.
- Replace the Experiment-only result shape with one strict project-session target union; no pre-release compatibility alias is required.
- Update CLI discovery, documentation, lifecycle tests, real memory-fab timings, and browser verification.

### Out of scope

- Executing an arbitrary Workbench next action automatically.
- Changing Workbench ranking, industrial simulation semantics, or the current memory-fab Blueprint.
- Adding route guessing, browser-local recency, shared project assets, or unsafe listener termination.

## Acceptance

- [x] `inm session <path>` converges on one source-current Studio and opens the exact shared Workbench next-action route without requiring an Experiment id or port.
- [x] JSON and human output identify one strict session target and preserve exact next-action or Experiment evidence; no browser-only authority is introduced.
- [x] `--experiment ID --run` still returns a reconnectable operation identity, while `--run` without an Experiment fails before lifecycle mutation.
- [x] CLI discovery, public documentation, targeted lifecycle tests, real Run `100-simulate` browser navigation, fast checks, and the full repository checkpoint pass.

## Work

- [x] Audit current manager/server health, no-target failure, direct Experiment UI, and Workbench next-action evidence.
- [x] Implement the strict project/Experiment session target union and argument boundary.
- [x] Update CLI discovery, human/JSON projection, tests, and lasting design documentation.
- [x] Verify the real memory-fab project route and complete the full checkpoint.
- [x] Complete the acceptance audit and prepare the verified change for commit and push.

## Findings and decisions

- 2026-07-30 — Current Studio status took `0.08s` and correctly separated a current server from a stale manager. The explicit session repaired the verified pair in `0.68s` on the same managed port `4176`; process ownership is not the missing mechanism.
- 2026-07-30 — The no-target command currently returns `cli.usage` and never exposes the project. The product still requires prior knowledge of one of eight Experiment ids even though the Workbench already owns the exact current action.
- 2026-07-30 — Generic session entry will only navigate. `--run` remains Experiment-specific because Workbench actions have different effects and confirmation requirements.
- 2026-07-30 — The result contract will use a discriminated `target` union rather than retain an Experiment-only top-level field. This is a pre-release contract correction, not a compatibility migration.
- 2026-07-30 — Default entry now obtains the complete shared next action from the source-current Studio overview API. Its result and envelope projection preserve the same id, title, reason, action label, argv, effect, confirmation boundary, typed target, and route.
- 2026-07-30 — The real memory-fab handoff is `inspection-supply-path`, bound to compatible Run `100-simulate` and diagnostic identity ending `816290a387`; session does not invent a different recency or landing rule.
- 2026-07-30 — Real default entry converged a changed managed service in `1.55s` and reused the final source-current service plus computed Workbench in `1.00s`. Explicit Experiment start returned in `0.09s`; its retained one-case operation completed in `0.59s`.
- 2026-07-30 — The authoritative repository checkpoint remains materially more expensive than ordinary orientation: `327` package tests plus `8` example scenarios took `478.15s`. That measured boundary supports a later explicit quick-trial versus full-checkpoint experience plan.

## Verification

- Baseline `bun run inm studio status examples/memory-fab --json` — `0.08s`; server current, manager stale, managed port `4176`.
- Baseline `bun run inm session examples/memory-fab --experiment equipment-energy-research --no-open --json` — `0.68s`; verified replacement, both source identities current.
- Baseline `bun run inm session examples/memory-fab --no-open --json` — exits with `cli.usage` because `--experiment` is mandatory.
- Baseline browser `/memory-fab/experiments/equipment-energy-research` — loads a lightweight Experiment workbench with eight authored programs but no current-project reason for selecting this one.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts` — `18` tests and `121` assertions pass, including exact overview/session parity, Experiment reconnection, and no-service `--run` rejection.
- `bun run inm session examples/memory-fab --no-open --json` — source-current managed port `4176`; strict `project-next-action`; exact `inspection-supply-path` route; `operation: null`; envelope parity true.
- `bun run inm session examples/memory-fab --experiment equipment-energy-research --run --no-open --json` — reused port `4176` in `0.09s`; returned operation `ms7grs4h-b0562dd1-981d-4124-8baf-a2a63d30ad2a`, which completed in `0.59s`.
- Browser `http://127.0.0.1:4176/memory-fab/designs/inspection-supply-path` — exact route loaded with the focused Inspection Supply Path Convergence contract, five locked operating cases, and its current/historical evidence boundary.
- `bun run check:fast` — documentation links, all TypeScript projects, and `35` short tests pass.
- `bun run test` — `327` package tests, `3882` assertions, and all `8` Ironworks scenarios pass in `478.15s`.

## Progress log

- 2026-07-30 — Plan created from live lifecycle, CLI, and browser evidence.
- 2026-07-30 — Replaced the Experiment-only command/result with strict project-next-action and Experiment targets; updated CLI discovery, public parsing, human/JSON output, and lifecycle coverage.
- 2026-07-30 — Updated the CLI, Agent, Workbench, development-operations, and README contracts; completed real memory-fab CLI, operation, browser, fast, and full-checkpoint verification.

## Completion

Completed on 2026-07-30. One portless command now repairs or reuses the exact managed Studio and enters the Core-owned current project action; explicit Experiment execution remains separately targetable and reconnectable.
