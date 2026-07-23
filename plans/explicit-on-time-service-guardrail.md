# Protect on-time lot service in commissioned memory-fab optimization

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/coding-agent-optimization]], [[docs/design/lot-tracking]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

The locked memory-fab Design contract treats on-time lot completion as an explicit non-negotiable industrial outcome beside completion, quality, scrap, contract fulfillment, and release. Humans and Agents see the same five-case service floors and exact failure evidence, so a score-improving policy cannot win only by withholding WIP and moving completed lots past their due dates.

## Context

The commissioned Blueprint completes `10/12` mixed-quality lots, all ten on time, with mean tardiness zero. A four-job preventive-maintenance policy on `inspection-1` improves every current-best case score and passes all six existing absolute guardrails. It nevertheless:

- performs three additional maintenance and qualification cycles in the mixed case;
- leaves completion, yield, scrap, rework, escapes, and delivery value unchanged;
- raises energy `390.708 → 394.548 MJ`;
- raises mean cycle `66.766 → 70.758 s` and queue `10.274 → 14.266 s`;
- moves `dram-lot-09` and `dram-lot-12` late, reducing on-time service `10/12 → 8/12`;
- wins only because lower time-averaged WIP contributes about `+7.068` score and outweighs the explicit service, energy, cycle, and tardiness penalties.

That trade is legal under the Objective weights, but the robust Benchmark already distinguishes economic score from hard industrial outcomes. `onTimeLots` is a supported typed guardrail metric; the memory-fab simply has not authored it. This is an authority gap, not a simulator or maintenance bug.

## Scope

### In scope

- Add one `onTimeLots` minimum guardrail to `greenfield-dram-design` with case-specific floors equal to the current commissioned service envelope: steady `12`, mixed `10`, quality excursion `8`, lithography interruption `7`, and facility interruption `9`.
- Relock the Benchmark contract without changing World, Scenario, Objective, catalogs, Blueprint, evaluator, or physical Run evidence.
- Re-run the TypeScript yield research so planned/opportunistic four-job inspection maintenance is rejected by exact service evidence even though aggregate and per-case scores improve.
- Prove the advanced-recovery branch still passes the service floor and remains blocked only by its existing lithography-interruption current-best score regression.
- Generate a current immutable Design result under the seven-guardrail contract and expose the same `7/7`, 35-threshold boundary through CLI and Studio.
- Update focused/full regression and durable design documentation.

### Out of scope

- Changing Objective weights, due dates, Scenario releases/failures/excursions, Process or Device physics, current Blueprint policies, or current Run `070-simulate`.
- Declaring every KPI a hard constraint or replacing the aggregate economic Objective with lexicographic optimization.
- Commissioning a maintenance or recovery Candidate that does not pass both the absolute outcome contract and current-best Design boundary.
- Migrating historical pre-alpha Candidate receipts or Design Runs; immutable evidence retains the contract under which it was created.
- Shared assets, compatibility aliases, migrations, or non-TypeScript repository scripts.

## Acceptance

- [x] The Benchmark owns seven ordered guardrails and 35 explicit case thresholds, including the five authored on-time floors.
- [x] Current `generated-dram-fab` passes every service floor and all existing outcomes without changing its Blueprint hash or compatible Run result.
- [x] Four-job inspection maintenance remains score-positive but is rejected with exact failed `onTimeLots` cases in TypeScript research and Core evidence; CLI and Studio expose the same locked guardrail and thresholds.
- [x] Advanced recovery passes all seven absolute outcomes and remains non-promotable only because `lithography-interruption` regresses against the current-best score boundary.
- [x] A current Design Run, CLI summary/full JSON, and Studio result cards expose the same service contract and decision.
- [x] Focused tests, memory-fab commands, documentation/type checks, full repository regression, and browser acceptance pass.

## Work

- [x] Audit the suspicious maintenance variants across events, score breakdown, WIP, energy, cycle, queue, tardiness, and exact late lots.
- [x] Author and relock the on-time service guardrail.
- [x] Update TypeScript research and focused contract/CLI tests.
- [x] Re-evaluate the current Blueprint, maintenance variants, and advanced-recovery branch through Benchmark and Design.
- [x] Update durable evidence, verify human/AI parity and full regression, then complete the acceptance audit.

## Findings and decisions

- 2026-07-24 — The current five-case on-time envelope is `12 / 10 / 8 / 7 / 9`; every count uses all Scenario-scheduled tracked lots as its denominator, so delayed admission cannot manufacture service.
- 2026-07-24 — Planned and opportunistic four-job inspection maintenance are physically identical in steady, mixed, and facility cases. They add service work, consume more energy, lengthen queue/cycle time, and never improve quality or completion.
- 2026-07-24 — The mixed maintenance score gain `+3.548481` decomposes primarily into lower average-WIP penalty, which improves by about `+7.068`; on-time service loses `3.333`, with smaller energy, cycle, and tardiness losses. The evaluator is applying the authored weights correctly.
- 2026-07-24 — An absolute `onTimeLots` floor is the correct boundary because the project author, not a proposal provider or score heuristic, owns whether scheduled due-date service may regress.
- 2026-07-24 — The previously evaluated advanced-recovery branch already satisfies the proposed floors `12 / 10 / 9 / 7 / 9`; the new guardrail therefore targets the authority gap without manufacturing its existing rejection.
- 2026-07-24 — Relocked contract `28cd57cf25ec01ad98a827a562d009ded14530ecb928131d895c1d44614d3b83` contains seven ordered guardrails and 35 thresholds. Current Blueprint `b62ff5ab7587e1519011b0397513efc865ed8e0d3ba2739c9cb3619312e30438` passes `7/7` with the exact authored service envelope.
- 2026-07-24 — Current-Benchmark TypeScript research now derives guardrail/threshold counts from the locked manifest. Planned four-job inspection service is `REJECT` despite aggregate `+3.581209`; opportunistic service is `REJECT` despite `+3.205115`. Both fail only the explicit on-time outcome.
- 2026-07-24 — Design Run `aa57c783fd4781721ff249d118150020d3dfdad34f384da5ac4ec64a1106b4c8` evaluates advanced recovery under the new contract, passes all seven absolute outcomes, retains it as a Pareto branch, and keeps the seed leader because `lithography-interruption` remains `-0.429259`.

## Verification

- `bun run memory-fab:relock-benchmarks --json`
- `bun run memory-fab:research-yield`
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --candidate generated-dram-fab --json`
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 1 --progress off --json`
- `bun test packages/inm-core/src/benchmark-outcome-guardrails.test.ts --test-name-pattern "memory-fab on-time service"`
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "current memory-fab Benchmark exposes"`
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "CLI-only operator discovers"`
- `bun run inm validate examples/memory-fab`
- `bun run inm plan examples/memory-fab`
- `bun run inm analyze examples/memory-fab`
- `bun run inm test examples/memory-fab`
- `bun run test` — `219 pass`, `0 fail`; the trailing Ironworks project suite also passed.
- Browser acceptance — Experiment workbench exposed `7 ABSOLUTE`, `35 case thresholds`, `7/7 PASSED`, and exact `12 / 10 / 8 / 7 / 9` service floors; Design Run `aa57c783fd47` exposed the exploratory `BRANCH` and exact `-0.429259` blocker; no warning or error logs.

## Progress log

- 2026-07-24 — Plan created from the post-recovery research audit after a score-positive maintenance policy exposed unguarded due-date service loss.
- 2026-07-24 — On-time service contract authored and relocked; current Blueprint, maintenance variants, and advanced recovery re-evaluated through the shared Benchmark and Design authority.
- 2026-07-24 — CLI, Studio, focused tests, memory-fab operations, full repository regression, and browser acceptance all confirmed one shared seven-guardrail contract.

## Completion

The memory-fab now protects its commissioned due-date service explicitly. The current Blueprint and compatible Run remain byte-for-byte unchanged, while score-positive inspection maintenance is rejected by exact late-lot evidence and advanced recovery remains an honest non-promotable Pareto branch under the same contract.
