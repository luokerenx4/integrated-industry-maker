# Evaluate advanced pattern recovery in the memory fab

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/quality-flow]], [[docs/design/blueprint-optimization]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

The memory-fab design space contains an explicit project-local advanced pattern-recovery technology that can repair critical-dimension and particle-contamination defects at a visible capital, energy, cycle-time, maintenance, and qualification cost while leaving latent electrical damage terminal. Locked research and Design evidence show that it is a useful Pareto alternative but not a promotable replacement for the commissioned factory: four cases improve, while `lithography-interruption` regresses by `0.429259` against the zero-regression current-best boundary. The option remains in the project catalog, no Candidate is created, and the live Blueprint remains byte-identical.

## Context

Compatible run `069-simulate` removes every Route Q-time defect and isolates the remaining mixed-case quality loss. Three fixed layer-two etch excursions enter deep inspection:

- `dram-lot-03` carries critical-dimension error, is repaired by the existing pattern-rework Process, and completes;
- `dram-lot-08` carries particle contamination, enters the same Process, remains defective, and is scrapped;
- `dram-lot-11` carries latent electrical damage, enters the same Process, remains defective, and is scrapped.

The current Blueprint cannot improve that outcome. `dram-front-end` allows only `rework-final-pattern`, and its evaluator-owned quality contract repairs only critical dimension. Device speed, maintenance policy, release policy, dispatch, or extra copies cannot change defect recoverability.

The missing industrial abstraction is a competing recovery technology. It must not repair latent electrical damage, which remains a probe/yield and terminal-disposition concern. It may combine selective particle removal with localized final-pattern correction, but its additional equipment and service burden must be explicit.

## Scope

### In scope

- Add one project-local advanced recovery Process that accepts the existing rework-required lot, returns the existing DRAM wafer lot, repairs critical dimension plus particle contamination, and explicitly leaves latent electrical defects untouched.
- Add the Process as a legal alternative operation at the existing `final-pattern-rework` Route step without changing any transition, Q-time contract, excursion, workload, or terminal rule.
- Add one self-contained Device package qualified only for the advanced Process, with project-local TypeScript runtime, distinct PBR presentation, higher active power, lower standby power, higher build cost, and explicit maintenance/qualification contracts.
- Extend the prepared-Benchmark TypeScript research to compare incumbent recovery, advanced recovery, and any coupled admission/dispatch refinement required by the new physical bottleneck.
- Relock Process, Device, and Route catalog hashes only after proving exact baseline and incumbent result invariance when the new option is not selected.
- Add a bounded Design proposal that changes only Blueprint-owned Device asset/recipe/policy fields and promote only if it becomes the gate-passing leader.
- Generate one catalog-compatible Run and update CLI, Studio, durable design evidence, and current tests without implying that an unpromoted option is installed.

### Out of scope

- Repairing latent electrical defects, suppressing or renaming fixed excursions, bypassing deep inspection, treating undetected defects as good yield, or increasing the inspection rework-cycle limit.
- Changing Objective weights, capital/area ceilings, Scenario timing, Route transitions/Q-time, Benchmark guardrails, or current-best regression budgets.
- Editing the existing recovery Process or Device in place; historical options retain their current physics.
- Adding defect-aware hidden dispatch or reading lot defects inside a Device runtime. The selected Process contract is ordinary declarative project data.
- Shared assets, compatibility aliases, migrations, or non-TypeScript repository scripts.

## Acceptance

- [x] The optional Process, Route operation, and Device are strict project-local artifacts and the incumbent Blueprint has byte-identical simulation outcomes before and after catalog relocking.
- [x] The new recovery technology repairs critical dimension and particle contamination, never latent electrical damage, and its physical/economic trade is visible to validate, analyze, plan, Benchmark, CLI, and Studio.
- [x] Bounded TypeScript research evaluates all five current locked cases, six outcome guardrails, 30 thresholds, capacity readiness, and current-best case regression.
- [x] Only a restricted immutable Design proposal and reviewed leader may update `generated-dram-fab`; this branch did not qualify, so no Candidate or Blueprint mutation exists.
- [x] The evaluated branch improves mixed completion and scrap without Q-time violations, escapes, pending release, capacity, cost, or area failures; its fixed lithography-interruption regression remains authoritative.
- [x] Compatible Run `070-simulate` and the shared human/AI surfaces expose the unchanged commissioned process plus the optional recovery Process, Device, maintenance contract, and Design decision evidence.
- [x] Relevant focused tests, memory-fab commands, documentation checks, TypeScript checks, full repository regression, and browser acceptance pass.

## Work

- [x] Audit the current persistent-defect chains and prove they are outside existing Blueprint authority.
- [x] Author and validate the optional Process, Route operation, Device package, and presentation contract.
- [x] Extend current-Benchmark TypeScript research and determine whether a gate-passing operating point exists.
- [x] Relock catalog hashes with exact incumbent invariance, then add the bounded Design proposal.
- [x] Run Design, retain the non-promotable branch without creating a Candidate, and generate compatible current evidence.
- [x] Update durable design evidence, verify CLI/Studio parity and full regression, then complete the acceptance audit.

## Findings and decisions

- 2026-07-24 — `069-simulate` has one quality-origin contributor: three fixed `etch-cell-layer-2` excursion lots, one repaired and two persistent to scrap.
- 2026-07-24 — The current Route admits only `rework-final-pattern`; its immutable Process contract repairs critical dimension only. No current Blueprint edit can change the two persistent outcomes.
- 2026-07-24 — The next intervention expands the project-authored option catalog while retaining fixed evaluator authority. Baseline invariance before selection is therefore mandatory.
- 2026-07-24 — Advanced recovery may repair particle contamination but not latent electrical damage. This preserves a meaningful terminal quality boundary instead of turning rework into universal yield recovery.
- 2026-07-24 — The first `12 s / 60 W idle / 450 W active / 10,150` prototype improved mixed completion `10 → 11` and scrap `2 → 1`, but regressed steady, mixed, lithography-interruption, and facility-interruption current-best scores. It is rejected rather than commissioned.
- 2026-07-24 — An equal-cycle `8 s / 20 W idle / 350 W active / 10,100` prototype restores positive steady and facility scores but still regresses mixed `-0.589462` and lithography-interruption `-0.450072`; recovered WIP reaches the downstream line too late to create value.
- 2026-07-24 — A `4 s / 20 W idle / 500 W active / 10,100` recovery cell with `6/3` CONWIP improves mixed completion `10 → 11`, scrap `2 → 1`, and cycle `66.8 → 64.5 s`, but remains rejected by quality-excursion `-0.468222` and facility-interruption `-0.406375`. The quality blocker coincides with an unsupported five-job maintenance threshold during the six-rework stress wave.
- 2026-07-24 — Giving the advanced cell an explicit ten-job / 360-second service envelope removes that artificial stress-wave failure. Research across 27 bounded variants finds `advanced-pattern-recovery + 6/3 EDD + 18 s escape` as the closest option: aggregate `+0.477292`, case deltas `+0.256224 / +0.686771 / +0.698773 / -0.429259 / +0.742991`, all six outcome guardrails pass, and capacity remains READY.
- 2026-07-24 — Design Run `648dbe35b34b2fbe11a70766a73070f8cf55512da3e58cebdb0125e9db43dfc7` retains that option as a Pareto branch but keeps the seed as leader because `lithography-interruption` exceeds its zero-regression budget. The branch therefore produces no Candidate and does not change `generated-dram-fab`.
- 2026-07-24 — Catalog-compatible Run `070-simulate` has the same Blueprint, metrics, events, and final state bytes as `069-simulate`. Only project/catalog identity and Result hash change; the current Result is `13867cd1f657c59ed758c04d7b085acd9837e0ac76139621518f48390fa0a9c3`.

## Verification

- `bun run inm validate examples/memory-fab`
- `bun run inm plan examples/memory-fab`
- `bun run inm analyze examples/memory-fab`
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design`
- `bun run inm test examples/memory-fab`
- `bun run memory-fab:research-yield`
- `bun test packages/inm-core/src/inm-core.test.ts packages/inm-core/src/design-proposal-provider.test.ts packages/inm-core/src/workbench.test.ts`
- `bun run docs:check`
- `bun run typecheck`
- `bun test packages/inm-core`
- `bun test packages/inm-cli packages/inm-studio`
- `bun test examples/ironworks`
- In-app Browser: Factory, Catalog, and immutable Design Run projections passed with zero browser errors.
- `metrics.json`, `events.ndjson`, `final-state.json`, and `blueprint.json` are byte-identical between `069-simulate` and `070-simulate`.

## Progress log

- 2026-07-24 — Plan created and activated from the current compatible defect-origin chain and Route/Process authority audit.
- 2026-07-24 — Optional recovery physics, self-contained Device presentation, current-Benchmark TypeScript research, and bounded proposal completed.
- 2026-07-24 — Design preserved the option as a non-promotable Pareto branch; compatible incumbent evidence was regenerated without changing the commissioned factory.

## Completion

Completed with an explicit negative commissioning decision. Advanced pattern recovery is now a truthful project-local option, but the live factory remains on selective pattern rework until a future intervention repairs its measured lithography-interruption blocker without weakening the locked contract.
