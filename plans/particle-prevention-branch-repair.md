# Repair the particle-prevention branch

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/quality-flow]], [[docs/design/production-modes]], [[docs/design/equipment-energy-states]], [[docs/design/work-center-dispatch]], and [[docs/design/design-programs]].

## Outcome

Determine whether the retained particle-suppression Pareto branch can become a promotion-safe memory-fab operating design by pairing its local quality gain with explicit equipment standby and downstream lot-identity controls. The bounded search conclusively rejected those local repairs, traced the service regression to Probe identity inversion, and found a separate terminal-screening bottleneck that could be commissioned safely before any future particle-control work.

## Context

Design Run `5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9` retains `particle-suppression` as an exhausted alternative. The mode reduces mixed-quality rework from two cycles to one and improves aggregate score by `0.178083`, but its `13/10` active-power envelope regresses excursion-free and facility cases by energy alone. In lithography interruption, removing one rework return changes downstream identity order: on-time completion falls from nine lots to eight and the case regresses `1.541477`.

The current provider cannot repair that alternative because it has no case-targeted proposal for this exact branch. The next step is not to weaken the uniform guardrail or re-run release-window families; it is to test whether explicit physical standby and local lot dispatch can pay the energy and service debts created by the otherwise useful prevention mode.

## Scope

### In scope

- Search project-local TypeScript combinations of particle suppression, a real closed-loop etch sleep/wake envelope, bounded `idleEnergy` thresholds, exact `lotDispatch` changes on `etch-l2` and `rework-1`, and the downstream equipment timing exposed by a causal trace.
- Compare all five locked cases, seven absolute outcome guardrails, current-best score deltas, energy, rework, on-time completion, tardiness, cycle time, and WIP.
- Add only the smallest researched asset/Blueprint controls to the project proposal provider, including a branch-specific repair proposal when justified.
- Continue Design from a fresh current-contract run, then promote/review/apply only a non-empty uniform-zero-regression leader.
- Keep Catalog, CLI, Studio, immutable evidence, and compatible runs synchronized for humans and Agents.

### Out of scope

- Scenario-specific lot ids, defect foreknowledge, automatic activation from evaluator excursions, random yield, or hidden energy credits.
- Editing the Scenario, Objective, Benchmark cases, thresholds, current-best guardrail, or evaluator.
- Repeating release-window, service-age, global EDD, or adaptive-cadence sweeps already bounded by current evidence.

## Acceptance

- [x] Every tested repair is an ordinary project-local asset/Blueprint contract with exact patch and five-case evidence.
- [x] A proposed repair explains separately how it addresses energy-only and identity-order regressions.
- [x] Only a capacity-ready, hard-outcome-passing, aggregate-positive, zero-current-best-regression leader may create a Candidate.
- [x] CLI and Studio expose the same branch, repair patch, activation evidence, case deltas, and commissioning decision.
- [x] Documentation, TypeScript, focused/full tests, project fixtures, browser verification, Git, and remote verification pass.

## Work

- [x] Audit the retained branch and separate energy-only from identity-order blockers.
- [x] Build and run the bounded TypeScript branch-repair sweep.
- [x] Add only researched project catalog/provider controls and execute immutable Design.
- [x] Commission a qualifying winner or preserve exact exhausted blocker evidence.
- [x] Complete human/AI parity, regression, plan audit, commit, and push.

## Findings and decisions

- 2026-07-25 — Steady production and facility interruption have unchanged timing, WIP, rework, and delivery under particle suppression; their `-0.007050` and `-0.005875` deltas are exactly incremental active energy.
- 2026-07-25 — Lithography interruption improves cycle-time and rework components but loses one on-time completion, making local identity order the leading repair target rather than more process capacity.
- 2026-07-25 — The selected asset has no sleep envelope. Research may inject one in memory, but the catalog changes only if a bounded threshold proves useful; sleep remains Blueprint-selected and pays explicit wake time/power.
- 2026-07-25 — The 18-variant local sweep found no promotable particle repair. Dispatch changes on `etch-l2` and `rework-1` were inert; a 45-second sleep threshold nearly repaid energy but retained the lithography service regression, while shorter thresholds failed absolute outcomes.
- 2026-07-25 — The causal trace located the identity inversion at the single Probe rather than etch or rework. Particle prevention lets `dram-lot-08` occupy `probe-1` from tick `164756` to `172756`, delaying `dram-lot-07` until tick `180756` and reducing on-time lots from nine to eight even though total tardiness falls from `31468` to `19224` ticks.
- 2026-07-25 — A `4/5` Probe cycle crosses that service threshold but moves WIP into known-good die and packaged devices. The next bounded search identified `burn-in-1` as the terminal constraint.
- 2026-07-25 — A physically explicit `5/8` final-screen duration at `8/5` active power is the smallest zero-regression terminal intervention. It improves all five current-best cases by `+12.076913`, `+12.076912`, `+12.076900`, `+12.077010`, and `+10.839555`; `3/5` and `1/2` variants fail because their larger peak draw contends with the fab power envelope.
- 2026-07-25 — The terminal intervention is an independent winner, not a disguised repair of particle suppression. Rerunning the original branch after commissioning it still leaves particle suppression non-promotable (`+0.178080` aggregate, `-1.541488` limiting case), so the particle branch remains uncommissioned and no speculative etch sleep mode was added to the catalog.

## Verification

- `bun run memory-fab:research-particle-branch-repair`
- `bun run memory-fab:trace-particle-branch`
- `bun run memory-fab:research-particle-probe-repair`
- `bun run memory-fab:research-particle-backend-repair`
- `bun run memory-fab:relock-benchmarks`
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 7 --progress off --json`
- Design Run `339f3d9f9aaac02d5b8884f7bae6062e4238cd3e94e89318558ccb5d9a6fa513` selected `candidate-3`; Candidate review `13d5f06aa3c5df68bfd42c903a38670706a9291c3907d46f23556446cf41505e` kept the two exact mode patches under all seven outcome guardrails.
- Candidate `candidate-3` applied Blueprint `dc9909a63f85966cf52c5b5080159b8e74395080020ae0f79e090ff5a8d006f1`; compatible Run `082-simulate` produced 87 devices, portfolio net value `342`, and score `40.83351093666666`.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts`
- `bun run typecheck`
- `bun run inm test examples/memory-fab --json`
- `bun run test` — 235 tests passed, 0 failed; Ironworks project fixtures also passed.
- `git diff --check`
- Studio project selection, cold project reload, `/api/projects/memory-fab/data`, and `/api/projects/memory-fab/overview` were verified against the running local server.

## Progress log

- 2026-07-25 — Plan activated from current run `081-simulate` and the exact iteration-2 particle branch evidence.
- 2026-07-25 — Bounded local repair, Probe timing, and terminal-screening research completed. The exact `5/8` terminal screening mode was added to the project-local catalog and proposal provider.
- 2026-07-25 — Immutable Design, Candidate review/apply, compatible simulation, benchmark relock, shared human/Agent evidence, and regression verification completed.

## Completion

The particle-prevention branch is now causally and experimentally bounded: its local quality benefit still cannot pass the exact five-case current-best boundary. The independent `agile-screening-5-8` terminal intervention was commissioned because it is capacity-ready, passes every hard outcome, and improves every locked case. Future particle work must address the Probe service-order inversion explicitly; it must not infer that more etch/rework dispatch or speculative sleep tuning repairs the branch.
