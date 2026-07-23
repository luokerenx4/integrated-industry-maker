# Converge commissioned memory-fab Q-time

- Status: `proposed`
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
- Preserve commercial `27/32`, performance `12/12`, automotive `6/6`, portfolio net value at least `+164`, first-pass completions, rework no worse than 5 cycles, scrap no worse than 1, zero quality escapes, and capacity `READY`.
- Promote and apply only a reviewed Candidate that has zero current-best regression in all five locked cases.

### Out of scope

- Relaxing evaluator-owned Q-time contracts, defect excursions, demand, Objective weights, or current-best guardrails.
- Calling generic queue, release, transport, or buffer changes a Q-time intervention without step-level before/after evidence.
- Replacing the physical three-lot furnace with hidden fractional capacity or making maintenance/qualification instantaneous.
- Shared project assets, backward-compatibility adapters, or migration aliases.

## Acceptance

- [ ] CLI and Studio expose identical structured Q-time contributors for current run `058-simulate`, including the 3 anneal and 3 final-inspection violations and their physical subjects.
- [ ] Immutable before/after evidence reduces Route Q-time violations through one or both identified mechanisms without weakening the fixed contracts.
- [ ] The accepted factory preserves the commissioned delivery, quality, capacity, and value floors and has zero regression in every locked case.
- [ ] A bounded commissioned Design run records the intervention, step-level driver evidence, and exact five-case decision; only a reviewed `KEEP` Candidate may update the Blueprint.
- [ ] Focused tests, project fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [ ] Extend Core Q-time attribution from one Route aggregate to ordered step/Device contributors without duplicating simulator authority.
- [ ] Add CLI, Studio, diagnostics, and immutable Design projections with human/AI parity tests.
- [ ] Build a project-local TypeScript sweep for bounded batch-flexibility and maintenance service interventions.
- [ ] Evaluate, review, and apply only a non-regressing winner; regenerate the immutable current run.
- [ ] Update durable design documentation and run the completion audit.

## Findings and decisions

- 2026-07-23 — The current six violations are not one queue problem: anneal waits for batch companions, while final inspection waits behind mandatory service plus qualification crew contention.
- 2026-07-23 — Inspection qualification is blocked for 23.5 seconds after service while the same single physical crew performs opportunistic `lithography-l2` and `etch-l2` work. This makes provider dispatch or capacity a causal candidate, not a generic inspection-speed guess.
- 2026-07-23 — Step-level Factory metrics already exist, but the Fab Loss Profile and CLI reduce them to Route totals. Closing that human/AI evidence gap precedes optimization.

## Verification

Pending.

## Progress log

- 2026-07-23 — Proposed from the completion audit of [[plans/commissioned-yield-convergence]] against immutable run `058-simulate`.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
