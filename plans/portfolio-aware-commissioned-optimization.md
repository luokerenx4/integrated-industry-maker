# Optimize the commissioned fab for its delivery portfolio

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/delivery-contracts]], [[docs/design/coding-agent-optimization]], [[docs/design/experiment-workbench]], and [[docs/CLI]].

## Outcome

The shared loss model identifies a value-weighted delivery-portfolio mismatch instead of hiding it inside generic input starvation, and a dedicated Design Program starts from the exact commissioned memory factory, uses the existing contract-value burn-in policy as its first measured intervention, repairs any evidenced current-best blocker without weakening the unchanged five-case Benchmark, and commissions only a reviewed non-regressing improvement through the ordinary Candidate boundary. Humans and Agents see the same diagnosis, immutable evidence, and post-apply state.

## Context

The first commissioned `generated-dram-fab` is capacity-ready and produces 48 devices in `production-window`, but all 48 are commercial grade. Commercial demand is exceeded by 16 while performance demand is short by 12 and automotive demand by 6, leaving portfolio net value at `-48` even though aggregate item fulfillment reports `96%`.

The physical `burn-in-1` rack already qualifies both `screen-commercial-dram` and `screen-performance-mix`. Its `authored-order` dispatch always selects the shorter commercial screen; the existing `contract-value` policy is evaluator-owned and chooses against the Objective's remaining demand, value, and shortfall penalties. A read-only in-memory five-case evaluation of that one policy change returns `KEEP`, improves aggregate fixed-baseline delta from `+37.971590` to `+61.993080`, and remains capacity-ready in every case. In `production-window` it delivers all 12 performance and all 6 automotive devices, raises portfolio net value to `+112`, and improves score from `-234.727395` to `-206.465363`.

The current loss profile does not name this mismatch. It adds passive customer/scrap Sink waiting time to equipment starvation, points the top queue subject at `automotive-customer`, and has no delivery-contract bucket. The existing synthesis-seeded greenfield Program is also the wrong continuation boundary after commissioning: a new optimization must start from the live reviewed Blueprint rather than rebuilding an older greenfield seed and merely comparing it with the original locked baseline.

## Scope

### In scope

- Add a deterministic delivery-portfolio loss bucket with exact per-contract shortfall/overflow/value evidence.
- Keep passive consumers out of the equipment-starvation subject/evidence used for industrial diagnosis.
- Project the new loss identically through Core, CLI, Studio, Design evidence, and the project-local TypeScript proposal API.
- Add a commissioned-factory Design Program whose authored seed and promotion target are the same exact current `generated-dram-fab`.
- Add one bounded `dispatch:burn-in-contract-value` intervention, retain its exact current-best blocker when it branches, and make any follow-up repair address that evidence rather than weakening the Benchmark/current-best guardrail.
- Promote, review, apply, simulate, and re-benchmark the accepted result through public operations.

### Out of scope

- Changing demand, contract values, Objective weights, Process output dispositions, or locked scenarios.
- Adding burn-in equipment or inventing a proprietary semiconductor binning model.
- Folding remaining front-end queue, Q-time, batch, or yield work into the product-mix intervention.
- Compatibility behavior for Design Runs whose seed or promotion target changed.

## Acceptance

- [x] Compatible-run and Design profiles expose delivery-portfolio shortfall with exact evidence; queue-starvation no longer attributes passive customer Sink wait as equipment loss.
- [x] A project-local commissioned Design Program pins its seed and promotion base to the same current factory hash and proposes the contract-value policy against the observed delivery loss.
- [x] The commissioned search preserves the one-policy Candidate's exact current-best blocker, reaches a positive aggregate Candidate with zero current-best per-case regression through an evidence-linked repair, and review/apply writes exactly the reviewed best hash.
- [x] The commissioned production window delivers performance and automotive demand in full, raises portfolio net value, remains capacity READY, and retains unchanged five-case `KEEP`.
- [x] CLI and Studio reconstruct the same loss, Design source, Candidate receipt, verified current state, and honest next action after restart.
- [x] Design docs, project fixtures, focused Core/CLI/Studio tests, type checking, documentation checks, and full regression pass.

## Work

- [x] Audit the commissioned run, final-test Process choices, Objective portfolio, current loss ranking, and one-policy counterfactual.
- [x] Implement portfolio-aware, productive-equipment loss attribution and cross-surface tests.
- [x] Add the commissioned Design Program and bounded project-local dispatch intervention.
- [x] Run Design → promote → review → apply through public operations and preserve project-local evidence.
- [x] Exercise the improved factory, update durable documentation, and verify browser/CLI parity.
- [x] Run the completion audit and archive the plan; commit and push are the final handoff for this completed change set.

## Findings and decisions

- 2026-07-23 — `burn-in-1` already owns both final-test recipes. The missing high-value output is an authored dispatch choice, not a capacity, asset, logistics, or quality-model gap.
- 2026-07-23 — Aggregate item fulfillment (`48/50 = 96%`) is insufficient product-mix evidence because Resources are not interchangeable. The profile must retain contract-level shortfall even when low-value overflow nearly balances total demand.
- 2026-07-23 — Above-demand output remains economically valid and is not itself scored as waste. The new bucket ranks unmet contract shares and reports overflow as context; the Objective's existing value/penalty calculation remains the only economic authority.
- 2026-07-23 — A current-factory optimization needs an authored seed equal to the promotion target. Reusing the greenfield synthesis seed after commissioning could accept a fixed-baseline improvement that still regresses the live factory.
- 2026-07-23 — Read-only counterfactual evidence: contract-value dispatch produces 14 commercial, 12 performance, and 6 automotive devices; portfolio net value `+112`; production-window score `-206.465363`; locked five-case candidate score `-218.177731`, delta `+61.993080`, all capacity-ready.
- 2026-07-23 — The public commissioned Design run correctly retained the one-policy intervention as a `BRANCH`, not a promotable `KEEP`: `lithography-interruption` scored `-280.927657` against the current leader's `-278.998967`, a `-1.928690` current-best regression. The earlier `KEEP` result compared only with the original fixed baseline and therefore was not sufficient promotion evidence. The current-best guardrail remains unchanged; the next intervention must explain and repair this exact case.
- 2026-07-23 — Compact current/candidate attribution isolated the regression to WIP. Under the late lithography window, authored dispatch completed three twelve-second commercial screens (24 devices), while greedy contract-value dispatch completed one thirty-second reliability screen (8 devices). Both portfolios had the same `-112` net value, but the latter retained more packaged inventory and lost `1.928750` WIP score; lot flow, delivery-value score, changeovers, quality, and front-end timing were otherwise equal.
- 2026-07-23 — `contract-value` already compared one-job marginal value per process tick, so weakening the guardrail or adding unrelated equipment would not repair the cause. The policy now evaluates the total contract contribution that each ready recipe can physically complete in the remaining contract window, including the current setup transition, then breaks equal window value by earlier first delivery and marginal value rate. Material readiness still gates the immediate job. This selects three short commercial screens in the constrained interruption window but retains the high-value reliability mix when the normal window can complete it.

## Verification

- Read-only in-memory counterfactual completed before implementation; no project file or run artifact was changed.
- Public one-candidate commissioned Design run result `e093fa8cea84bea3d1f380fd8b9dafc3bcbd05be2a0df61e6294acb5f047923e` retained `dispatch:burn-in-contract-value` as a non-promotable branch because of its exact `lithography-interruption` current-best regression.
- Focused Core regression proves deadline-aware contract dispatch starts `screen-commercial-dram` at tick `196400` in the interruption case and delivers the same 24 devices with `-112` net value.
- Read-only five-case evaluation after the scheduler repair: steady, mixed-quality, and quality-excursion each improve `+27.858563`; lithography-interruption is exactly `0`; facility-interruption improves `+23.675748`; weighted current-best delta is `+23.281223`.
- Engine `inm-sim/0.75.0` commissioned Design Run `65decebc8e3bae0a45b283cc1ddab697d0f9ae83839cbdcb2629434692e8195a` accepted iteration 1 with one promotion operation, candidate score `-218.917998`, and `+61.252813` fixed-baseline delta.
- Public Candidate `portfolio-aware-dram-dispatch` reviewed `KEEP` and applied exact Blueprint hash `cd691f041d1b2d76330a689f5d764b4ce964e6811789f6e47c3b15c5e142f68c`.
- Current immutable run `055-simulate` result `453bb4292253b581064e3fe5a46c7461cf450ac0deac7b53cc8b7037e6800e4d` reports 14 commercial, 12 performance, and 6 automotive devices, `+112` portfolio net value, and score `-206.868833`.
- `bun run test`: documentation links and TypeScript checks passed; 193 Core/CLI/Studio tests passed with 0 failures; all eight Ironworks executable fixtures passed.
- `bun run inm test examples/memory-fab`: both executable memory-fab fixtures passed.
- Public `inm validate` and `inm plan` on `generated-dram-fab` returned Blueprint hash `cd691f041d1b2d76330a689f5d764b4ce964e6811789f6e47c3b15c5e142f68c`, valid compilation, and capacity `READY` with zero gaps.
- Public `inm benchmark --benchmark greenfield-dram-design` returned five-case `KEEP`, score `-218.917998`, and fixed-baseline delta `+61.252813`.
- Browser restart and route reconstruction verified current run `055-simulate`, productive-equipment V2 loss evidence, the live proposed furnace review as the honest next action, and commissioned Design result `65decebc8e3b` linked to the verified Candidate and exact current Blueprint.

## Progress log

- 2026-07-23 — Activated from measured `053-simulate` evidence after the initial greenfield factory was commissioned.
- 2026-07-23 — Replaced the assumed one-step promotion route with blocker-guided repair after the real current-best Design guardrail rejected immediate promotion.
- 2026-07-23 — Advanced deterministic simulation to `inm-sim/0.75.0`, re-locked all 13 repository Benchmarks, and commissioned the reviewed one-field dispatch improvement through Candidate rather than writing the Blueprint from Design.
- 2026-07-23 — Completed public CLI, Studio browser, focused, and full-regression verification; archived the plan and opened [[plans/commissioned-fab-convergence-loop]] for the remaining measured production losses.

## Completion

Shipped Fab Loss Profile V2 delivery-contract evidence, productive-equipment starvation attribution, finite contract-window dispatch semantics, the exact-live-factory `commissioned-dram-fab` Design Program, and a reviewed one-field Candidate that improves the five-case memory-fab score without a current-best case regression. CLI and Studio now reopen the same diagnosis and commissioning state after restart. Remaining queue, yield, batch, Q-time, and commercial-volume work is intentionally tracked by [[plans/commissioned-fab-convergence-loop]].
