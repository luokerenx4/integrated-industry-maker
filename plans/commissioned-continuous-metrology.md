# Commission continuous deep metrology in the memory fab

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/quality-flow]], [[docs/design/usage-based-maintenance]], [[docs/design/blueprint-optimization]], [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

The commissioned memory fab can explicitly choose a project-local continuous deep-metrology Device that trades a small capital and energy premium for a qualification interval covering the complete twelve-lot campaign plus its bounded rework return, then prove through the locked Benchmark and hard industrial outcome guardrails that the selection reduces Q-time contamination, scrap, and terminal completion loss without weakening inspection coverage or any accepted case.

## Context

Compatible run `068-simulate` ranks verified yield/quality as its primary loss. In the mixed-quality case, eight of twelve lots complete first-pass, four enter rework, and four are scrapped. Event-backed attribution separates two mechanisms:

- authored layer-two etch excursions introduce critical-dimension, particle-contamination, and latent-electrical defects; the current selective rework repairs critical dimension only;
- two lots exceed the final-inspection Route Q-time while `inspection-1` is in asset-limit service and metrology qualification, introducing particle contamination that the same selective rework cannot remove.

The current deep inspection bay has a five-job physical maintenance limit, while one campaign performs twelve initial inspections plus bounded re-inspection. Policy-only probes show that opportunistic maintenance after four jobs does not improve the mixed case, while a planned four-job stop regresses terminal completion, first-pass yield, and scrap in locked cases and is rejected by the absolute guardrails.

A read-only dual-deep topology proves that inspection continuity is causal: it removes every Q-time violation, raises steady-production first-pass yield from `11/12 → 12/12`, raises mixed completion from `8 → 10`, and reduces mixed scrap from `4 → 2`. It is not commissionable because explicit equipment and routing exceed the Objective by `22,590` build cost and `2` occupied-area units. The missing design option is therefore a single continuous deep-metrology asset, not an evaluator change or universally repairing rework.

## Scope

### In scope

- Add one project-local Device asset dedicated to the existing deep final-pattern inspection Process.
- Give the asset an explicit long qualification interval that covers the bounded campaign and rework return, balanced by higher active/idle power and a build cost that fits only as a deliberate replacement of the incumbent bay.
- Provide a coherent project-local visual/material definition and expose the asset automatically through the existing Catalog, Blueprint, analysis, CLI, and Studio projections.
- Replace the stale commissioned-yield probe with a bounded TypeScript search against the current locked Benchmark, exact outcome guardrails, and incumbent Blueprint.
- Add an integrated Design proposal that changes only the Blueprint asset selection and its coupled lot-release control; Worlds, Scenarios, Processes, Routes, Objective, and guardrail thresholds remain fixed.
- Relock only because the project Device catalog gains a new option, record that baseline physics and outcomes remain unchanged, then promote, review, and apply only an accepted Candidate.
- Generate a new compatible immutable run and compare exact yield, Q-time, completion, scrap, maintenance, energy, cost, and loss-attribution evidence.

### Out of scope

- Making particle or latent-electrical defects repairable, changing fixed excursions, weakening deep-inspection coverage, or treating undetected defects as yield.
- Editing Objective weights, capital/area limits, Scenario workload, Route Q-time limits, Benchmark outcome thresholds, or case regression budgets to make the Device win.
- Altering the incumbent inspection asset in place; the baseline and old option must retain their current physics.
- Adding a second inspection line that violates capital or area constraints.
- Shared assets, migrations, compatibility aliases, or non-TypeScript repository scripts.

## Acceptance

- [x] The new asset is self-contained in `examples/memory-fab`, is physically and economically distinct from the incumbent bay, and passes strict project validation.
- [x] The bounded TypeScript research report evaluates the exact current Blueprint through `greenfield-dram-design`, including all six hard outcome guardrails and all five locked cases.
- [x] A Design proposal can select the asset through an exact Blueprint patch, and only an immutable reviewed `KEEP` Candidate updates `generated-dram-fab`.
- [x] The accepted candidate removes final-inspection maintenance Q-time contamination in the mixed case, reduces scrap or increases completed lots, preserves zero quality escapes, completes every release, remains capacity READY, and satisfies all 30 absolute case thresholds.
- [x] CLI diagnostics and Studio Factory/Catalog/Design surfaces expose the same selected asset, maintenance contract, candidate evidence, and compatible after run without special-case presentation logic.
- [x] Relevant focused tests, memory-fab validation/analysis/benchmark/test commands, full repository regression, and browser acceptance pass.

## Work

- [x] Audit current yield contributors and falsify policy-only and unconstrained duplicate-capacity alternatives.
- [x] Author the continuous deep-metrology asset and its project-local presentation contract.
- [x] Rewrite the commissioned-yield research around prepared Benchmark evaluation and exact outcome evidence.
- [x] Add the Blueprint-only Design intervention, relock the Device-catalog change, and prove baseline invariance.
- [x] Run Design, promote/review/apply only a gate-passing winner, and write a compatible after run.
- [x] Update durable design evidence, verify CLI/Studio parity and full regression, then complete the acceptance audit.

## Findings and decisions

- 2026-07-24 — `068-simulate` attributes the mixed-case quality loss to three authored etch-excursion lots and two final-inspection Q-time lots; existing rework repairs only critical-dimension defects.
- 2026-07-24 — Opportunistic inspection maintenance after four jobs leaves the mixed case at eight completions, four scraps, and two Q-time violations. A planned four-job stop improves one case but violates six absolute thresholds across steady, quality-excursion, and lithography-interruption cases.
- 2026-07-24 — Two independently routed deep inspection bays eliminate Q-time violations and improve physical outcomes in all five cases, but cost `252,590 > 230,000` and occupy `352 > 350`; those results are diagnostic evidence, not a candidate.
- 2026-07-24 — The selected route adds a new optional asset instead of changing the incumbent asset. Benchmark relocking must therefore show identical baseline outcomes before evaluating the candidate selection.
- 2026-07-24 — A two-times prototype removed Q-time but regressed the steady score because the commissioned `9/6` release controller admitted WIP earlier after the bottleneck disappeared. Joint search found that a `7/4` CONWIP window with a thirty-second starvation escape converts the added capacity into terminal output without case regression; the lowest tested gate-passing equipment point is `9/4` inspection speed at `750,000` active and `100,000` idle milliwatts.
- 2026-07-24 — Relocking changes only the Device-catalog hash to `cd99afc26ff08af7d68acc44617d30b717f5a0635d468a8d9e858ba99fb35067`; exact baseline and incumbent result objects remain unchanged.
- 2026-07-24 — Design Run `6ff818e82198f11bd8588d977544533a33a95684dd148dd352ed86bfea8038b5` promotes reviewed Candidate `continuous-deep-metrology` with four Blueprint patch operations and all six industrial guardrails passing.
- 2026-07-24 — Compatible run `069-simulate` removes every Q-time violation, completes ten lots, raises first-pass completion to nine, reduces scrap to two, preserves zero escapes and complete release, fulfills the portfolio at `1.26`, and records portfolio net value `210`.
- 2026-07-24 — Adding the asset intentionally makes older Run evidence catalog-incompatible. Core, CLI, and Studio tests now prove those Runs cannot retain current diagnostic authority.

## Verification

- `bun run memory-fab:research-yield`
- `bun run inm validate examples/memory-fab`
- `bun run inm plan examples/memory-fab`
- `bun run inm analyze examples/memory-fab`
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design`
- `bun run inm test examples/memory-fab`
- `bun run docs:check`
- `bun run typecheck`
- `bun test --max-concurrency=1 packages/inm-core`
- `bun test --max-concurrency=1 packages/inm-cli packages/inm-studio`
- `bun run inm test examples/ironworks`
- In-app Browser: Factory device inspector, project Catalog, Design Run, verified Candidate, current `069-simulate` evidence, and browser error log all passed; zero console errors.

## Progress log

- 2026-07-24 — Plan created and activated from the compatible `068-simulate` loss profile plus current-Benchmark intervention probes.
- 2026-07-24 — Project asset, prepared-Benchmark research, Design proposal, reviewed Candidate, and compatible Run completed.
- 2026-07-24 — Human and Agent projections, strict historical-evidence invalidation, durable documentation, and full regression completed.

## Completion

Completed on 2026-07-24. The current factory now owns continuous deep metrology as an explicit costed Device choice rather than an evaluator shortcut. The accepted joint asset/admission intervention removes final-inspection Q-time contamination and exposes the next measured loss chain without weakening any locked case or physical outcome floor.
