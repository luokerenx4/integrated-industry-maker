# Converge commissioned lithography drift with planned maintenance

- Status: `proposed`
- Updated: `2026-07-23`
- Related design: [[docs/design/usage-based-maintenance]], [[docs/design/quality-flow]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Blueprint authors can distinguish opportunistic idle-window maintenance from a planned stop that must occur before the next production job, humans and Agents can inspect which boundary caused each service cycle, and the commissioned memory fab uses that control or another explicit physical intervention to remove `lithography-1` drift without surrendering its accepted delivery, terminal lot disposition, Q-time, capacity, or locked-case gains.

## Context

Current immutable run `059-simulate` makes verified yield and quality the highest ranked loss. The shared Fab Loss Profile attributes two defect instances on two lot jobs to `lithography-1`. Its asset begins critical-dimension drift after six completed jobs but does not reach the physical maintenance limit until eight.

The current Blueprint authors `preventiveMaintenance.minimumJobs: 6`. That field only makes maintenance eligible during an idle window; it does not stop a ready seventh job. The event stream therefore records:

- six normal layer-one jobs through tick `37000`;
- drifted `dram-lot-07` from tick `37000` to `44500`, with `jobsSinceMaintenance: 6`;
- drifted `dram-lot-08` from tick `44500` to `52000`, with `jobsSinceMaintenance: 7`;
- maintenance starting only at tick `52000`, after the physical eight-job limit is reached.

A read-only sweep of `minimumJobs` off, 3, 4, 5, and 6 leaves `driftedJobs = 2` and `driftDefects = 2` in every case. Threshold 4 performs an additional maintenance cycle and improves score through a later scheduling effect, but it still cannot protect the two exposed lots. The missing concept is planned production gating, not another opportunistic threshold value.

## Scope

### In scope

- Replace the ambiguous Blueprint `minimumJobs` and `minimumQualificationTicks` fields with explicit opportunistic thresholds and optional planned mandatory boundaries. INM is pre-alpha; migrate current artifacts, tests, scripts, schemas, and projections directly without aliases or compatibility readers.
- Define compiler ordering rules between opportunistic, planned, and immutable asset limits.
- Make the simulator prevent the next production start at an authored planned boundary while preserving physical service, qualification, crew, consumable, power, failure, and retry semantics.
- Distinguish opportunistic, planned-boundary, and asset-limit maintenance in events, metrics, CLI, Studio, immutable runs, Design evidence, and human/AI diagnostics.
- Add project-local TypeScript research against exact Blueprint `d67991771b844fb1f6f0b953e7afe8870ceb1efb69a01727f654c597a3444392`. Sweep planned lithography boundaries first; if downtime merely relocates the loss, evaluate explicit layer-one equipment or service capacity rather than weakening drift physics.
- Preserve commercial `38/32`, performance `12/12`, automotive `6/6`, portfolio net value at least `+196`, all twelve lots terminal, at least eight completed and eight first-pass completed, first-pass yield at least `2/3`, no more than four rework cycles or scrap dispositions, zero quality escapes, Route Q-time no worse than two visits, and capacity `READY`.
- Promote and apply only a reviewed Candidate with zero current-best regression in all five locked cases.

### Out of scope

- Editing asset drift thresholds, maintenance duration, qualification work, fixed excursions, defect repairability, demand, Objective weights, or evaluator gates to make a Candidate win.
- Treating extra maintenance as free scheduler work or silently prioritizing it ahead of every other Device.
- Probabilistic condition monitoring, spare-part repair, technician travel, or proprietary lithography process physics.
- Shared assets, backward-compatibility aliases, migrations, or legacy field readers.

## Acceptance

- [ ] Blueprint policy names and validation clearly separate opportunistic eligibility from a planned stop; all repository examples use only the new active format.
- [ ] At a planned job or qualification-age boundary, the next ready production job cannot start until physical service and qualification complete; earlier idle windows may still perform the same work opportunistically.
- [ ] Events and metrics distinguish planned-boundary, asset-limit, and opportunistic cycles, and CLI and Studio project the same structured evidence for humans and Agents.
- [ ] Project-local TypeScript research and a bounded commissioned Design run reduce `lithography-1` drift `2 → 0` while satisfying every commissioned floor and every locked case.
- [ ] Only an immutable reviewed `KEEP` Candidate updates the Blueprint; the after run becomes the new compatible workbench evidence.
- [ ] Focused tests, migrated fixtures, documentation checks, type checking, full regression, and browser verification pass.

## Work

- [ ] Replace the preventive-maintenance policy contract and migrate every authored Blueprint, script, schema, analysis projection, and test.
- [ ] Implement planned production gating with distinct event and metric attribution.
- [ ] Project the new control and evidence through CLI, Studio, Design, and documentation with human/AI parity tests.
- [ ] Build the commissioned TypeScript sweep and evaluate planned boundaries plus any necessary explicit capacity alternative under the five-case gate.
- [ ] Review/apply only a non-regressing winner, regenerate current evidence, and complete the acceptance audit.

## Findings and decisions

- 2026-07-23 — `minimumJobs` currently means “maintenance becomes eligible when production is otherwise idle,” not “stop after this many jobs.” The name hides a material industrial distinction.
- 2026-07-23 — In run `059-simulate`, continuous ready WIP carries `lithography-1` through both drifted jobs before service begins at its immutable eight-job limit.
- 2026-07-23 — A threshold-only probe across off/3/4/5/6 proves the current control cannot remove either drifted job. Additional opportunistic work is therefore not evidence of preventive protection.
- 2026-07-23 — The current four scrap dispositions are not interchangeable with the two drift defects: fixed Scenario excursions also contribute critical-dimension, particle, and latent-electrical defects. Acceptance must retain exact drift, first-pass, rework, scrap, escape, and terminal-WIP evidence instead of claiming every scrap is lithography-caused.

## Verification

- Read-only current-state probe:
  - no policy: 2 drifted jobs, 2 drift defects, 1 maintenance cycle;
  - opportunistic threshold 3: 2 drifted jobs, 2 drift defects, 2 maintenance cycles;
  - threshold 4: 2 drifted jobs, 2 drift defects, 2 maintenance cycles;
  - thresholds 5 and 6: 2 drifted jobs, 2 drift defects, 1 maintenance cycle.
- Implementation verification pending.

## Progress log

- 2026-07-23 — Proposed from the compatible `059-simulate` Fab Loss Profile and exact maintenance/process-drift events while [[plans/commissioned-q-time-convergence]] remains active for manual visual acceptance.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
