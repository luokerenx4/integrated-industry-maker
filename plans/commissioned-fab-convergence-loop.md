# Converge the commissioned memory fab on its remaining production losses

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/delivery-contracts]], [[docs/design/experiment-workbench]], and [[docs/design/coding-agent-optimization]].

## Outcome

The exact commissioned memory factory iteratively reduces its measured queue, yield, batch, Q-time, and remaining commercial-delivery losses through the shared Design → Candidate → review → apply boundary, while preserving the now-fulfilled performance and automotive contracts and every zero-regression Benchmark case.

## Context

The cycle began from run `056-simulate`: 12 performance, 6 automotive, and 14 commercial devices, `+112` portfolio net value, 48.9 seconds mean queue time, and active productive-equipment starvation ranked first. Current run `057-simulate` retains both fulfilled high-value contracts, delivers 22 commercial devices, raises portfolio net value to `+144`, reduces mean queue time to 39.2 seconds, and moves the bottleneck from shared lithography to etch. The factory is still not globally converged: 10 commercial devices remain short, 6 lots rework and 2 scrap after the additional capacity exposes all 12 lots to inspection, so verified yield is now the honest next constraint.

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

- [x] One immutable compatible run and Fab Loss Profile establish a before/after reduction in at least one currently ranked physical loss without hiding another contract or case regression.
- [x] The accepted factory reduces the 18-device commercial shortfall or increases completed tracked lots while keeping performance `12/12`, automotive `6/6`, portfolio net value at least `+112`, and capacity `READY`.
- [x] A bounded commissioned Design run records the causal proposal and unchanged five-case zero-regression evidence; only a reviewed `KEEP` Candidate may update the Blueprint.
- [x] CLI and Studio reopen the same current run, loss chain, Design provenance, Candidate receipt, and next action after restart.
- [x] Focused tests, executable memory-fab fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [x] Resolve the stale/proposed experiment queue and capture a clean current decision boundary before new Design work.
- [x] Replace the misleading combined queue/starvation and completion-derived yield ranking with exact congestion, active-input, and inspected-lot evidence.
- [x] Select or add one bounded TypeScript intervention for the highest actionable loss and evaluate it through `commissioned-dram-fab`.
- [x] Review/apply only a non-regressing winner, regenerate current evidence, and compare delivery, WIP, lots, energy, and loss-chain movement.
- [x] Add and evaluate one exact capacity/flow intervention that increases completed lots or reduces the commercial shortfall in the ordinary production window.
- [x] Update durable design documentation and both human/AI projections.
- [x] Run the completion audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-23 — Product-mix dispatch is commissioned and no longer the primary measured loss. The next plan starts from exact Blueprint `cd691f041d1b2d76330a689f5d764b4ce964e6811789f6e47c3b15c5e142f68c`, not from the former greenfield base.
- 2026-07-23 — Commercial overproduction was replaced by a high-value mixed portfolio, but commercial demand remains 18 devices short; `delivery-portfolio` therefore remains evidence rather than disappearing after the first improvement.
- 2026-07-23 — Furnace sleep is retained as a reviewable rejected hypothesis: saving energy is not an accepted optimization when delivery value and WIP make the locked total score worse.
- 2026-07-23 — `rework-1` worked one eight-second exception job and was correctly empty for the other 232 seconds. Raw wait alone therefore cannot identify the actionable starved tool; active utilization weighting points to `burn-in-1`, while queue congestion independently points to the `79.75%` utilized lithography bottleneck.
- 2026-07-23 — The old 50% “good yield” was `6 completed / 12 released`, not an inspected-lot quality rate. Current verified first-pass yield is `5/6 = 83.33%`; unfinished WIP remains flow evidence.
- 2026-07-23 — Fab Loss Profile V3 therefore separates `input-starvation`, `queue-congestion`, and inspected-lot `yield-quality`; project-local proposals also skip an already-installed policy instead of spending a Candidate budget on a semantic no-op.
- 2026-07-23 — Wider 9/6 and 10/7 CONWIP loops regress four locked cases. Rapid furnace fallback improves the aggregate by `+0.692621` but remains a branch because the lithography-interruption case regresses `-5.823963`.
- 2026-07-23 — Inspection EDD is a small zero-regression resilience winner: ordinary and quality cases are unchanged, lithography interruption improves `+1.464874`, and facility interruption improves `+0.075000`. It is worth commissioning, but unchanged ordinary metrics mean it does not satisfy the plan's throughput/shortfall acceptance by itself.
- 2026-07-23 — A generic parallel clone cannot be routed in the occupied cleanroom. The existing Core specialization primitive proves a better physical intervention: separate layer-two lithography at `(15, 9)`, reroute furnace input and etch output, and preserve explicit sorter/belt ownership.
- 2026-07-23 — Layer-two specialization improves ordinary delivery but initially regresses `facility-interruption` by `-55.582687`; Design correctly retains it as a branch rather than accepting aggregate gain. A third utility plant at `(30, 22)` restores spatial vacuum/exhaust resilience, while superficially similar placements at `x = 34` still leave the case weak.
- 2026-07-23 — The repaired leader reduces commercial shortfall `18 → 10`, delivered portfolio `32 → 40`, mean queue `48.9 s → 39.2 s`, mean cycle `114.0 s → 102.9 s`, and batch wait `38.6 s → 21.0 s`; performance and automotive remain fulfilled and net value rises `+112 → +144`.
- 2026-07-23 — More flow reaches inspection, exposing the next constraint instead of hiding it: current V3 primary loss is verified yield (`5/12` first-pass, 6 reworked, 2 scrapped), followed by active input starvation, Q-time, etch-context queue congestion, and batch formation.
- 2026-07-23 — `dispatch:probe-highest-priority` was incorrectly annotated as an input-starvation intervention even though it changes delivery selection and Q-time exposure. Its causal targets are now `delivery-portfolio` and `q-time`, and end-to-end Design fixtures follow the resulting deterministic frontier order.
- 2026-07-23 — Five obsolete local Design Run artifacts used superseded Blueprint or loss-profile contracts and prevented Studio from opening the otherwise valid Design program. They were removed from the live project state rather than kept behind compatibility behavior; four compatible immutable runs remain visible.

## Verification

- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — 8/8 pass, including exact V3 commissioned evidence and no-op proposal suppression.
- `bun test packages/inm-core/src/design-program.test.ts -t "a synthesis-seeded Design Program is deterministic, immutable, and applies only through an exact Candidate"` — 1/1 long-path test passes with V3 frontier evidence, continuation, tamper rejection, and Candidate apply.
- Commissioned Design Run `f5be094038acd5fa5dd172602c1922a4e402e8ef049c8c7b6fd547e48fc0aaa0` — four candidates, five locked cases each, winner `dispatch:inspection-earliest-due-date`, zero case regressions.
- Candidate `inspection-edd-resilience` — immutable `KEEP` receipt `6f55c2a1c8229efcbb90e6d373664b78193ea7e2ead9e7863d5f69e9c3739c6d`, applied exact Blueprint `2f1798e4bc8105f4549407d21e977a761f56133cb168eb3337d64a2078476473`.
- Immutable run `056-simulate` result `1ad5e0e2f925f94c071feb052eaf576b333dbcca86eeca127d81bc37a982ca07`; its ordinary metrics are byte-identical to `055-simulate`, confirming the resilience change did not fabricate a production-window gain.
- Commissioned Design Run `653cb86b65e78a070c75a5247d98913c4ae827ca2cf0ad9de94a88b6643befe1` — specialization BRANCH plus exact N+2 facility repair; final five leader-relative case deltas are all positive.
- Candidate `layer-two-lithography-capacity` — immutable `KEEP` receipt `86aefb102832a22e1fe551aea7e2e88e79558a69c34b4873152cd8a652a8211b`, applied exact Blueprint `969e01284b0d2d74b4f8a032ae2364c40f2023707d77335a258ec3358124e205`.
- Current immutable run `057-simulate` result `24a63cb48dacd25a62bc8a85690502b5b4bb5799817268e7e5b75abf17832dd1` records the commercial, queue, cycle, batch, value, energy, cost, and next-loss evidence above.
- `bun run inm validate examples/memory-fab --json` — valid project, 61 Devices, 17 Connections, exact current Blueprint hash `969e01284b0d2d74b4f8a032ae2364c40f2023707d77335a258ec3358124e205`.
- `bun run inm plan examples/memory-fab --json` — capacity `READY` with zero gaps.
- `bun run inm test examples/memory-fab --json` — both executable project fixtures pass.
- Studio restart at `/memory-fab` reopens run `057-simulate`, the exact V3 loss chain, first-pass yield, contracts, and next action. `/memory-fab/experiments/greenfield-dram-design/runs/653cb86b65e78a070c75a5247d98913c4ae827ca2cf0ad9de94a88b6643befe1` and its `layer-two-lithography-capacity` Candidate deep link reopen the same five-case evidence, immutable receipt, and current-factory state with no browser-console errors.
- `bun run test` — 195/195 Core, CLI, and Studio tests pass after documentation-link and TypeScript checks; all eight Ironworks executable project fixtures also pass.

## Progress log

- 2026-07-23 — Proposed from the completion audit of [[plans/portfolio-aware-commissioned-optimization]] and current run `055-simulate`.
- 2026-07-23 — Activated against exact current Blueprint `cd691f041d1b2d76330a689f5d764b4ce964e6811789f6e47c3b15c5e142f68c`; first action is to close the obsolete furnace-sleep review before selecting new work.
- 2026-07-23 — Public Candidate preview wrote immutable `DISCARD` receipt `432ab0f0b3bef886503fa02df5afa6b80729f7c42b19af6449473cc2c5a0d013`; Workbench now returns to compatible-run evidence with no pending review.
- 2026-07-23 — Commissioned four-candidate Design rejected both wider release loops, retained but exhausted the rapid-furnace branch, and selected inspection EDD as its zero-regression leader.
- 2026-07-23 — Public Candidate review/apply commissioned inspection EDD and regenerated compatible run `056-simulate`; next work remains the ordinary production shortfall rather than declaring convergence from a resilience-only gain.
- 2026-07-23 — Project-local TypeScript specialization plus exact facility branch repair passed all five current-best guardrails; public Candidate review/apply commissioned the physical topology and regenerated run `057-simulate`.
- 2026-07-23 — CLI and restarted Studio were audited against the same current hashes and evidence. The completion audit moved verified yield work into [[plans/commissioned-yield-convergence]] instead of leaving an unchecked tail in this plan.

## Completion

Fab Loss Profile V3 now separates queue congestion, active input starvation, and inspected-lot first-pass yield; commissioned Design suppresses semantic no-ops and preserves exact causal intervention metadata. Two reviewed Candidates commissioned inspection EDD resilience and physical layer-two lithography plus N+2 utilities, reducing commercial shortfall from 18 to 10, mean queue from 48.9 to 39.2 seconds, and mean cycle from 114.0 to 102.9 seconds while keeping both high-value contracts fulfilled and all five guardrail cases positive. The now-visible yield constraint continues in [[plans/commissioned-yield-convergence]]. This record ships in the commit that marks it completed.
