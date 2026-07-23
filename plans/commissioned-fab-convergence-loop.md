# Converge the commissioned memory fab on its remaining production losses

- Status: `proposed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/delivery-contracts]], [[docs/design/experiment-workbench]], and [[docs/design/coding-agent-optimization]].

## Outcome

The exact commissioned memory factory iteratively reduces its measured queue, yield, batch, Q-time, and remaining commercial-delivery losses through the shared Design → Candidate → review → apply boundary, while preserving the now-fulfilled performance and automotive contracts and every zero-regression Benchmark case.

## Context

Portfolio-aware burn-in dispatch fixed the highest-value product-mix error without adding equipment: current run `055-simulate` delivers all 12 performance and all 6 automotive devices and earns `+112` portfolio net value. The factory is still not converged. It completes 6 of 12 tracked lots, delivers only 14 of 32 demanded commercial devices, and ranks queue/input starvation first at signal `0.5434`, with 48.9 seconds average tracked-lot queue time and 1420.1 productive-device input-wait seconds. Yield-quality, batch formation, and two Q-time violations follow in the realized loss chain.

The existing stable-furnace-sleep proposal is useful negative evidence. It saves energy and electricity cost, but under `inm-sim/0.75.0` it reduces delivery value per minute, raises WIP, and loses `1.518292` score, so the locked Benchmark correctly returns `DISCARD`. The next cycle must optimize the whole commissioned factory outcome rather than revive a locally attractive obsolete intervention.

## Scope

### In scope

- Diagnose the exact current run's productive-device waits, tracked-lot queues, batch tails, rework/yield events, and commercial shortfall.
- Extend the project-local TypeScript proposal portfolio only where measured evidence lacks a credible intervention.
- Run bounded authored-seed Design cycles from the exact live `generated-dram-fab` hash.
- Preserve performance and automotive contract completion, portfolio net value, capacity readiness, and zero current-best case regression.
- Keep CLI and Studio projections identical for diagnosis, search evidence, Candidate state, and next action.

### Out of scope

- Weakening Objective demand/value, Benchmark locks, current-best guardrails, or failure scenarios.
- Rebuilding from the greenfield synthesis seed.
- Treating lower energy, lower local wait, or higher aggregate throughput as sufficient when delivery mix or a locked operating case regresses.
- Adding a shared asset library or cross-project intervention catalog.

## Acceptance

- [ ] One immutable compatible run and Fab Loss Profile establish a before/after reduction in at least one currently ranked physical loss without hiding another contract or case regression.
- [ ] The accepted factory reduces the 18-device commercial shortfall or increases completed tracked lots while keeping performance `12/12`, automotive `6/6`, portfolio net value at least `+112`, and capacity `READY`.
- [ ] A bounded commissioned Design run records the causal proposal and unchanged five-case zero-regression evidence; only a reviewed `KEEP` Candidate may update the Blueprint.
- [ ] CLI and Studio reopen the same current run, loss chain, Design provenance, Candidate receipt, and next action after restart.
- [ ] Focused tests, executable memory-fab fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [ ] Resolve the stale/proposed experiment queue and capture a clean current decision boundary before new Design work.
- [ ] Attribute `rework-1` and other productive input waits to upstream material, qualification, batch, or dispatch causes using exact run evidence.
- [ ] Select or add one bounded TypeScript intervention for the highest actionable loss and evaluate it through `commissioned-dram-fab`.
- [ ] Review/apply only a non-regressing winner, regenerate current evidence, and compare delivery, WIP, lots, energy, and loss-chain movement.
- [ ] Update durable design documentation and both human/AI projections.
- [ ] Run the completion audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-23 — Product-mix dispatch is commissioned and no longer the primary measured loss. The next plan starts from exact Blueprint `cd691f041d1b2d76330a689f5d764b4ce964e6811789f6e47c3b15c5e142f68c`, not from the former greenfield base.
- 2026-07-23 — Commercial overproduction was replaced by a high-value mixed portfolio, but commercial demand remains 18 devices short; `delivery-portfolio` therefore remains evidence rather than disappearing after the first improvement.
- 2026-07-23 — Furnace sleep is retained as a reviewable rejected hypothesis: saving energy is not an accepted optimization when delivery value and WIP make the locked total score worse.

## Verification

- Pending.

## Progress log

- 2026-07-23 — Proposed from the completion audit of [[plans/portfolio-aware-commissioned-optimization]] and current run `055-simulate`.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
