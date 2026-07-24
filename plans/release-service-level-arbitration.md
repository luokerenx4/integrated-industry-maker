# Make release service protection identity-safe

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/wip-release-control]], [[docs/design/lot-release-scheduling]], [[docs/design/simulation-runtime]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]]

## Outcome

Make a configured release-service age protect the exact overdue lot identities that earned it, while exposing the configured age, protected releases, and actual admission delay consistently to humans and Coding Agents.

## Context

Current CONWIP policy calls its optional threshold `maximumReleaseDelayTicks`. The threshold cannot be an absolute maximum while the hard WIP cap or physical boundary has no free slot, and the runtime currently uses any overdue lot only to open the controller. Normal EDD or priority arbitration can then give that newly available card to a younger lot.

Compatible memory-fab run `078-simulate` demonstrates the mismatch. `dram-lot-07` becomes eligible at tick 36,000 and triggers an 18-second service opening, but younger EDD lots consume subsequent cards first; lot 07 is released at tick 100,556 after 64,556 ticks of delay. The event is therefore service evidence for one identity and admission evidence for another.

This is pre-alpha domain work. The old field and event cause will be replaced, not aliased.

## Scope

### In scope

- Replace the misleading Blueprint threshold with `serviceLevelAfterTicks`.
- Give service-eligible lots precedence over younger eligible lots whenever cards are scarce, while preserving configured dispatch inside the protected class.
- Record whether each release consumed service protection and aggregate protected-release evidence.
- Distinguish configured service age from mean and actual maximum admission delay in CLI, reports, comparisons, Studio, and JSON types.
- Migrate current project inputs, project-local TypeScript research, locked Benchmarks, and compatible immutable runs to the new engine identity.

### Out of scope

- Promising an absolute admission-delay bound while the hard WIP cap or physical boundary is full.
- Adding per-family cards, order cancellation, dynamic thresholds, or learned release code.
- Changing Scenario arrivals, due dates, priorities, or the locked industrial guardrails to make a candidate pass.
- Preserving old Blueprint or runtime-event compatibility.

## Acceptance

- [x] A lot at or beyond `serviceLevelAfterTicks` cannot lose a scarce card to a younger unprotected lot; configured dispatch remains deterministic within protected and ordinary classes.
- [x] Events and metrics identify service-protected releases, and actual maximum delay remains distinct from the configured service age.
- [x] CLI, reports, comparisons, Studio, and machine JSON expose the same release-service evidence without calling the threshold a maximum delay.
- [x] Current memory-fab Blueprint, proposal/research TypeScript, locked five-case Benchmark, Design authority, and immutable compatible run use the new engine contract honestly.
- [x] Core, CLI, Studio, project fixtures, documentation links, and full repository checks pass.

## Work

- [x] Reconstruct the current memory-fab release sequence and locate the identity mismatch.
- [x] Define the strict replacement contract and register this plan.
- [x] Implement schema, runtime arbitration, event, evaluator, and comparison evidence.
- [x] Update CLI, Studio, reports, docs, fixtures, and project-local TypeScript.
- [x] Regenerate locked Benchmark and immutable run/design evidence under the new engine identity.
- [x] Exercise the public human/AI loop and complete the acceptance audit.

## Findings and decisions

- 2026-07-24 — In run `078-simulate`, the 18-second threshold opens service at tick 60,556, but EDD releases `dram-lot-11`; lot 07 remains outside until tick 100,556. A service trigger without identity-safe consumption is not a coherent service policy.
- 2026-07-24 — `serviceLevelAfterTicks` describes an aging threshold rather than an impossible absolute maximum under a hard WIP cap.
- 2026-07-24 — Protected status is a first arbitration class. Existing `fifo`, `earliest-due-date`, or `highest-priority` remains the tie-break contract within that class.
- 2026-07-24 — Actual mean/maximum release delay remains workload evidence; it must not be conflated with the configured service age.
- 2026-07-24 — Corrected `6/3 EDD + 18 s` fails the existing on-time guardrail in steady and facility-interruption cases. Sweeping 18–90-second ages and wider 7–9-card controls does not restore both boundaries.
- 2026-07-24 — Exhaustive EDD high/low-watermark research finds `6/5 EDD` without a service age as the only 3–9-card control that meets steady 12-lot and facility-interruption 9-lot on-time thresholds. The exact locked evaluation returns `KEEP`, `+104.763644`, and all seven outcome guardrails.

## Verification

- `bun run test` — passed: 233 package tests, 1,963 assertions, and all eight Ironworks project tests.
- `bun run inm test examples/memory-fab` — passed both bounded-batch and re-entrant DRAM project tests.
- `bun test --max-concurrency=1 packages/inm-cli/src/commands.test.ts -t 'CLI-only operator'` — passed the complete inspect, immutable review, apply, verify, and stale-replay loop.
- `bun run inm validate examples/memory-fab --json` — passed against applied Blueprint `c4177e82f758` under `inm-sim/0.81.0`.
- Browser acceptance against the restarted `http://localhost:4176` server — project selection opened `/memory-fab`, Factory exposed run `079-simulate` with actual `14.8 / 64.6 s` mean/maximum delay, `— / 0` service age/openings, and `0` service-protected releases; the current Design evidence route opened without console warnings or errors.

## Progress log

- 2026-07-24 — Plan created after reconstructing the current run's release events and Scenario due-date order.
- 2026-07-24 — Locked all memory-fab Benchmarks under engine `0.81.0`; rejected the old commissioned controller and prepared Candidate `identity-safe-release-control` from the promotion-safe research result.
- 2026-07-24 — Immutable review `a6e8489bce16c1f9148cdd07ac6367b43fac8c5df57317abee03dbb1b05148e5` applied only `reopenAtWip: 5` and service-age removal after a 7/7 `KEEP` review.
- 2026-07-24 — Compatible run `079-simulate` and Design Run `e7d569b5e824259ec51beef79b22957e611146444fefc4e5c80eb58ce70ec87d` now anchor current operating and search authority; four broader interventions were rejected and the seed remains best.
- 2026-07-24 — Regenerated all Ironworks Benchmark locks and nine checked-in demonstration runs under `inm-sim/0.81.0`; every run replays to its recorded result hash.
- 2026-07-24 — Exercised launcher, project Overview, Factory metrics, and current Design evidence through the public Studio server with no browser console warnings or errors.

## Completion

Completed on 2026-07-24. Release service is now an identity-safe arbitration class rather than a misleading global maximum-delay promise, and the commissioned memory fab retains hard on-time service with a promotion-safe `6/5 EDD` controller that does not need service aging.
