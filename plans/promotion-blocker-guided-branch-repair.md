# Promotion-blocker-guided branch repair

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/blueprint-optimization]], and [[docs/design/agent-cli-contract]].

## Outcome

When Design selects a retained alternative, humans and proposal Agents receive the exact locked operating-case boundary preventing that branch from becoming leader, and the memory-fab strategy can propose and verify an explicit facility-resilience repair against that boundary.

## Context

The completed greenfield run retains `candidate-6` because it improves aggregate score and four of five locked cases relative to leader `candidate-5`. Its sole promotion blocker is `facility-interruption`, which regresses by `3.906879` under the Program's zero-regression guardrail. Core already has the leader and both evaluation vectors when it selects the branch, but project proposal-provider API V4 receives only the selected Blueprint's mixed-quality driver metrics and branch identity. The Agent therefore cannot distinguish an ordinary loss intervention from a repair needed for promotion.

The project already models powered, costed `fab-utility-plant` Devices, finite vacuum/exhaust capacity, provider interruption, and deterministic failover. The memory-fab proposal portfolio does not expose that existing Blueprint control. A second plant is therefore a defensible industrial intervention to evaluate, not new asset physics invented for the search.

## Scope

### In scope

- Define one immutable promotion-boundary projection from the selected node to the current leader, including aggregate delta, every locked case delta, allowed regression, pass/fail, limiting case, and exact violations.
- Give project proposal providers that boundary before proposal generation and require an alternative repair proposal to name one current violating case.
- Record the proposal-time boundary and declared case target in Design progress and immutable iteration evidence.
- Add a project-local facility-redundancy intervention using the existing utility-plant asset and ordinary Blueprint patch semantics.
- Show the same repair target and blocker evidence in CLI and Studio, then exercise the continuation on the real greenfield branch.

### Out of scope

- Changing Benchmark cases, guardrail budgets, facility asset physics, or Scenario failures.
- Letting an Agent edit evaluator-owned operating cases or claim promotion without locked evaluation.
- Generic causal inference that automatically invents arbitrary topology repairs for every case id.
- Continuing a completed run in place; each Design run remains immutable and independently reproducible.

## Acceptance

- [x] Core derives the proposal-time promotion boundary solely from immutable locked evaluations and validates it during run replay.
- [x] Project provider API V5 receives a frozen exact boundary; an alternative with violations must name one current violating `addressedCase` and cannot fabricate a case id.
- [x] Leader proposals remain ordinary loss-guided optimization and do not falsely claim a repair target.
- [x] Memory-fab can propose a second powered, costed facility plant from a blocked alternative without changing assets or Scenario inputs.
- [x] CLI progress/final output and Studio expose the same selected branch, blocker, addressed case, and resulting leader/branch decision.
- [x] A real greenfield run evaluates the facility repair and records whether it promotes, remains non-dominated, or is rejected under the unchanged five-case contract.
- [x] Core, CLI, Studio, project fixtures, documentation checks, and full regression pass.

## Work

- [x] Audit the retained branch score vector, proposal context, existing intervention portfolio, and facility asset semantics.
- [x] Define the promotion-boundary and addressed-case contracts plus immutable validation rules.
- [x] Implement Core execution, provider API V5, and project-local facility repair.
- [x] Project and test the repair context in CLI and Studio.
- [x] Generate real Design evidence, run full regression, and audit acceptance.

## Findings and decisions

- 2026-07-23 — `candidate-6` beats `candidate-5` by `+0.692761`, `+1.037899`, `+2.237933`, and `+11.106254` in the first four cases, but loses `facility-interruption` by `3.906879`; this is one exact repair boundary rather than a general aggregate-score problem.
- 2026-07-23 — Driver loss and promotion blocker answer different questions. The mixed-quality loss chain explains the selected Blueprint's ordinary operating loss; leader-relative locked-case evidence explains why that Blueprint may not be promoted.
- 2026-07-23 — Facility resilience can be expressed with existing project truth: an additional placed `fab-utility-plant` participates in cost, power, coverage, capacity, failure, and failover like every other Device.
- 2026-07-23 — Driver loss and case repair remain separate provider claims. A leader with measured losses names `addressedLoss`; an alternative with guardrail violations names one exact `addressedCase`, and Core rejects missing or fabricated targets before compilation.
- 2026-07-23 — The real repair promotes at iteration 4. Relative to `candidate-2`, repaired `candidate-4` gains `9.963355` aggregate score, and its limiting steady-production case still gains `8.238977`; the unchanged facility interruption no longer violates the zero-regression guardrail.
- 2026-07-23 — Successful repair exposes a separate scheduler gap: the non-dominated parent remains first in the queue after exhausting its only eligible repair, which currently stops the whole run at 4/7 candidates even though the new leader has unused proposals. This belongs to [[plans/frontier-node-exhaustion-scheduling]], not this repair contract.

## Verification

- `bun test packages/inm-core/src/design-proposal-provider.test.ts` passes four provider tests and 18 assertions, including frozen blocker targeting plus missing/fabricated loss and case rejection.
- `bun test packages/inm-core/src/design-program.test.ts` passes three tests and 63 assertions, including deterministic double execution, exact proposal-boundary replay, tamper rejection, and Candidate handoff.
- `bun test packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts` passes 16 tests and 297 assertions over Agent JSON/progress and Studio server parity.
- Real result `3326f97aa2a3be26bfaa7ebc7a092db403112cbb5cd561f2c6d0b1ff752b359c` promotes `candidate-4` from blocked alternative `candidate-3` through `facility:utility-n-plus-one` and records `addressedCase: facility-interruption`.
- Reopening that result through human CLI shows the exact before/after boundary. Manual in-app Studio verification shows the same repair target, blocker, green leader, retained gold alternative, Candidate handoff, and no visible errors.
- `bun run test` passes 188 tests and 1,628 assertions across Core, CLI, Studio, documentation, type checking, and Ironworks public project fixtures.
- `bun run inm test examples/memory-fab` passes the bounded batch-formation and re-entrant DRAM scenarios.
- `bun run docs:check`, `bun run typecheck`, and `git diff --check` pass.

## Progress log

- 2026-07-23 — Activated after the first retained greenfield alternative exposed an exact facility-interruption blocker that proposal API V4 could not see or target.
- 2026-07-23 — Implemented API V5 proposal boundaries and case targets, promoted the real N+1 facility repair, and verified matching CLI/Studio evidence before full regression.
- 2026-07-23 — Passed full repository and public memory-fab regression; all acceptance items are evidenced and the node-local exhaustion follow-up is separately indexed.

## Completion

Implemented in commit `d4358ea` (`feat: guide Design branch repair`). Design proposal API V5 now gives project strategies an immutable leader-relative promotion boundary, validates explicit case-repair targets, records the evidence in Design runs, and exposes it consistently through CLI and Studio. The memory-fab portfolio uses that contract to evaluate an ordinary powered and costed N+1 utility plant, promoting the repaired branch under the unchanged five-case benchmark.

The successful repair also proved that retained frontier membership and continued search eligibility are separate states. That scheduler follow-up is independently indexed as [[plans/frontier-node-exhaustion-scheduling]].
