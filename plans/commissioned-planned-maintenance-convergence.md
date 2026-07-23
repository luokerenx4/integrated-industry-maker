# Converge commissioned lithography drift with planned maintenance

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/usage-based-maintenance]], [[docs/design/quality-flow]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Blueprint authors can distinguish opportunistic idle-window maintenance from a planned stop that must occur before the next production job, humans and Agents can inspect which boundary caused each service cycle, and the commissioned memory fab uses that control or another explicit physical intervention to remove `lithography-1` drift without surrendering its accepted delivery, terminal lot disposition, Q-time, capacity, or locked-case gains.

## Context

Compatible immutable run `061-simulate` made verified yield and quality the highest ranked loss. It was the visual-catalog-compatible replay of accepted run `059-simulate` with identical industrial behavior. The shared Fab Loss Profile attributed two defect instances on two lot jobs to `lithography-1`. Its asset begins critical-dimension drift after six completed jobs but does not reach the physical maintenance limit until eight.

The former Blueprint authored `preventiveMaintenance.minimumJobs: 6`. That field only made maintenance eligible during an idle window; it did not stop a ready seventh job. The event stream therefore recorded:

- six normal layer-one jobs through tick `37000`;
- drifted `dram-lot-07` from tick `37000` to `44500`, with `jobsSinceMaintenance: 6`;
- drifted `dram-lot-08` from tick `44500` to `52000`, with `jobsSinceMaintenance: 7`;
- maintenance starting only at tick `52000`, after the physical eight-job limit is reached.

A read-only sweep of the former threshold off, 3, 4, 5, and 6 left `driftedJobs = 2` and `driftDefects = 2` in every case. Threshold 4 performed an additional maintenance cycle and improved score through a later scheduling effect, but it still could not protect the two exposed lots. The missing concept was planned production gating, not another opportunistic threshold value.

## Scope

### In scope

- Replace the ambiguous Blueprint `minimumJobs` and `minimumQualificationTicks` fields with explicit opportunistic thresholds and optional planned mandatory boundaries. INM is pre-alpha; migrate current artifacts, tests, scripts, schemas, and projections directly without aliases or compatibility readers.
- Define compiler ordering rules between opportunistic, planned, and immutable asset limits.
- Make the simulator prevent the next production start at an authored planned boundary while preserving physical service, qualification, crew, consumable, power, failure, and retry semantics.
- Distinguish opportunistic, planned-boundary, and asset-limit maintenance in events, metrics, CLI, Studio, immutable runs, Design evidence, and human/AI diagnostics.
- Add project-local TypeScript research against the exact post-migration incumbent Blueprint `ac66ddd0db3cca7d0b2c79c06187cbe38d2ab9f09e6f2d93395ecd4458898105`. Sweep planned lithography boundaries first; if downtime merely relocates the loss, evaluate explicit layer-one equipment or service capacity rather than weakening drift physics.
- Preserve commercial `38/32`, performance `12/12`, automotive `6/6`, portfolio net value at least `+196`, all twelve lots terminal, at least eight completed and eight first-pass completed, first-pass yield at least `2/3`, no more than four rework cycles or scrap dispositions, zero quality escapes, Route Q-time no worse than two visits, and capacity `READY`.
- Promote and apply only a reviewed Candidate with zero current-best regression in all five locked cases.

### Out of scope

- Editing asset drift thresholds, maintenance duration, qualification work, fixed excursions, defect repairability, demand, Objective weights, or evaluator gates to make a Candidate win.
- Treating extra maintenance as free scheduler work or silently prioritizing it ahead of every other Device.
- Probabilistic condition monitoring, spare-part repair, technician travel, or proprietary lithography process physics.
- Shared assets, backward-compatibility aliases, migrations, or legacy field readers.

## Acceptance

- [x] Blueprint policy names and validation clearly separate opportunistic eligibility from a planned stop; all active repository examples use only the new strict format.
- [x] At a planned job or qualification-age boundary, the next ready production job cannot start until physical service and qualification complete; earlier idle windows may still perform the same work opportunistically.
- [x] Events and metrics distinguish planned-boundary, asset-limit, and opportunistic cycles, and CLI and Studio project the same structured evidence for humans and Agents.
- [x] Project-local TypeScript research and a bounded commissioned Design run reduce `lithography-1` drift `2 → 0` while satisfying every commissioned floor and every locked case.
- [x] Only an immutable reviewed `KEEP` Candidate updates the Blueprint; the after run becomes the new compatible workbench evidence.
- [x] Focused tests, migrated fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [x] Replace the preventive-maintenance policy contract and migrate every authored Blueprint, script, schema, analysis projection, and test.
- [x] Implement planned production gating with distinct event and metric attribution.
- [x] Project the new control and evidence through CLI, Studio, Design, and documentation with human/AI parity tests.
- [x] Build the commissioned TypeScript sweep and evaluate planned boundaries plus any necessary explicit capacity alternative under the five-case gate.
- [x] Review/apply only a non-regressing winner, regenerate current evidence, and complete the acceptance audit.

## Findings and decisions

- 2026-07-23 — `minimumJobs` currently means “maintenance becomes eligible when production is otherwise idle,” not “stop after this many jobs.” The name hides a material industrial distinction.
- 2026-07-23 — In run `059-simulate`, continuous ready WIP carries `lithography-1` through both drifted jobs before service begins at its immutable eight-job limit.
- 2026-07-23 — A threshold-only probe across off/3/4/5/6 proves the current control cannot remove either drifted job. Additional opportunistic work is therefore not evidence of preventive protection.
- 2026-07-23 — The current four scrap dispositions are not interchangeable with the two drift defects: fixed Scenario excursions also contribute critical-dimension, particle, and latent-electrical defects. Acceptance must retain exact drift, first-pass, rework, scrap, escape, and terminal-WIP evidence instead of claiming every scrap is lithography-caused.
- 2026-07-23 — The strict Blueprint contract is now `preventiveMaintenance.opportunistic` plus optional `preventiveMaintenance.planned`. Each block owns job-count and/or qualification-age boundaries. Every boundary precedes the physical asset limit, and an opportunistic boundary on the same axis must precede its planned boundary. No alias or legacy reader exists.
- 2026-07-23 — Runtime precedence is physical asset limit, planned boundary, then opportunistic window. Asset-limit work remains a precondition of the next ready production start; a planned boundary is an authored stop and wakes an idle Device when due; opportunistic work still needs an idle or held production window.
- 2026-07-23 — Existing runs, Design Runs, experiments, and review receipts remain immutable evidence under their recorded engine versions. They are not active-format examples and are not reinterpreted by `inm-sim/0.76.0`; current Blueprints, Candidates, benchmarks, scripts, fixtures, and new evidence were migrated directly.
- 2026-07-23 — The bounded TypeScript sweep rejects four jobs (one locked-case regression), five jobs (aggregate and case regression), and seven jobs (one residual drift defect). Six jobs improves all five cases by `+3.641`, `+4.627`, `+13.845`, `+3.706`, and `+2.454`, for aggregate `+6.677993`.
- 2026-07-23 — Design Run `83f7355c1122bfb704c14d59cb693ed46251b8cd19b36dbedba77afd38c124e8` records the six-job winner. Immutable Candidate `planned-lithography-maintenance` and review proposal `165714663627742c4e413d673e23b0b14c521ca89551cbed7ce0b62470300b18` are `KEEP`; apply moved Blueprint `ac66ddd0db3cca7d0b2c79c06187cbe38d2ab9f09e6f2d93395ecd4458898105 → f4d8d4900067931ca81454498badbc3050041e2eb7a87f2decf3e1e67a600612`.
- 2026-07-23 — Browser acceptance exposed that Studio selected the newest unrelated run when no run was explicitly requested. Studio now defaults only to the latest engine- and hash-compatible run for the project's current selection; an operator can still explicitly open any compatible historical run.

## Verification

- Read-only current-state probe:
  - no policy: 2 drifted jobs, 2 drift defects, 1 maintenance cycle;
  - opportunistic threshold 3: 2 drifted jobs, 2 drift defects, 2 maintenance cycles;
  - threshold 4: 2 drifted jobs, 2 drift defects, 2 maintenance cycles;
  - thresholds 5 and 6: 2 drifted jobs, 2 drift defects, 1 maintenance cycle.
- Focused compiler/runtime test passes 57 assertions, including job-count gating, qualification-age wake/gating, strict boundary ordering, and independent cause metrics.
- Design Run `83f7355c1122bfb704c14d59cb693ed46251b8cd19b36dbedba77afd38c124e8`: five locked cases capacity READY, no case regression, aggregate `+6.677993` over the commissioned incumbent.
- Compatible run `065-simulate`: 38 commercial / 12 performance / 6 automotive delivered, portfolio net value `196`, nine completed and nine first-pass completed wafer lots, three terminal scrap dispositions, one Q-time visit, zero quality escapes, zero drift defects, and 2 asset-limit / 2 planned-boundary / 6 opportunistic maintenance completions.
- `bun run docs:check`: 609 double-links resolve.
- `bun run typecheck`: all Core, CLI, Studio, Ironworks asset, and memory-fab asset TypeScript projects pass.
- `bun test --max-concurrency=1 packages/inm-core packages/inm-cli packages/inm-studio`: 206 tests and 1766 assertions pass.
- `bun run inm test examples/ironworks`: all eight checked-in project scenarios pass.
- `bun run inm test examples/memory-fab`: all locked memory-fab benchmarks pass.
- Browser acceptance at `/memory-fab/factory/devices/lithography-1`: `PLANNED STOP · BEFORE JOB 7`, device evidence `0 asset / 2 planned / 0 opportunistic`, factory evidence `2 / 2 / 6`, and no console errors.

## Progress log

- 2026-07-23 — Proposed from the compatible `059-simulate` Fab Loss Profile and exact maintenance/process-drift events while [[plans/commissioned-q-time-convergence]] remains active for manual visual acceptance.
- 2026-07-23 — Activated without closing the Q-time Plan: its implementation and regression evidence are complete, while this independent domain change can proceed before the remaining manual Studio visual check.
- 2026-07-23 — Memory-fab visual-profile assets changed only the Device catalog hash; compatible run `061-simulate` reproduces the accepted behavior and is now the active maintenance evidence.
- 2026-07-23 — Implemented the strict contract, runtime gating, cause attribution, compiler rules, CLI/Studio projections, TypeScript research, and direct active-artifact migration under engine `inm-sim/0.76.0`.
- 2026-07-23 — Promoted, reviewed, and applied `planned-lithography-maintenance`; generated compatible run `065-simulate` as the new workbench evidence.
- 2026-07-23 — Completed repository regression and browser acceptance, including a Studio fix that keeps default factory replay aligned with the current hash-compatible project selection.

## Completion

Shipped a strict three-way maintenance model—opportunistic windows, authored planned stops, and immutable asset limits—through compiler, simulator, events, metrics, CLI, Studio, Design evidence, documentation, and all active artifacts. The commissioned lithography bay now stops before job seven, completes physical service and qualification, removes its measured drift defects, and improves every locked case without surrendering capacity or accepted delivery and quality floors. The winning Design Run, reviewed Candidate, compatible run, full regression, and browser evidence close the plan. No follow-up is intentionally deferred from this outcome.
