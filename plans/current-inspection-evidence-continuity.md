# Current inspection evidence continuity

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/observation-led-design]], [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/inventory-accounting]], and [[docs/design/coding-agent-optimization]].

## Outcome

Carry the commissioned memory fab's inspection-supply reasoning across the equivalent-unit WIP contract change, commission the only current promotion-safe intervention through independent review, and leave exact post-commission evidence that prevents the same six hypotheses from being rediscovered.

## Context

Current immutable Run `097-simulate` still ranks productive-equipment input starvation first. `inspection-1` accounts for `59.584 s` of exact eligible material-shortage opportunity while processing only `20.7%` of the Scenario and waiting for input for `190.216 s` overall. Its normal input is one `dram-wafer-lot` from `etch-l2` over `etch-to-inspection`; rejected lots may return conditionally from `rework-1`.

The focused `inspection-supply-path` Program already contains six physically qualified etch-control and wafer-handoff interventions. Four older Runs remain readable as historical `frontier-exhausted` evidence, while four malformed pre-current artifacts remain invalid. None is current because the engine, Program, driver hashes, and Objective WIP semantics changed. The Workbench therefore correctly reports current evidence as `missing`, but the prior conclusion is still useful hypothesis history rather than a reason to rediscover the same six ideas manually.

This plan treats history as a replay agenda, not authority. It re-evaluates the existing portfolio under `inm-sim/0.90.0` and device-equivalent WIP, preserves the exact old-to-current lineage in immutable Design, Candidate-review, and operating-Run evidence, and adds no new hypothesis when the replay itself produces a guarded improvement.

## Scope

### In scope

- Observe the exact Run `097-simulate` inspection work cell, ordinary etch supply path, and conditional rework return.
- Re-run all existing focused Program proposals against the current five locked cases and equivalent-unit Objective.
- Compare current loss reduction, equivalent WIP, raw WIP, delivery, quality, energy, capital, and every current-best case.
- Promote only a replay leader that survives the complete current-best and hard-outcome contract, then independently review it before applying.
- Re-run the same bounded portfolio from the commissioned Blueprint so the unchanged optimized seed becomes current exhausted authority.
- Retain the resulting Design, Candidate-review, operating-Run, CLI, and Studio handoff.

### Out of scope

- Treating historical scores as current authority or adding a compatibility reader.
- Repeating already rejected etch cadence, lot dispatch, or shared-cell transport variants under a new name.
- Adding inspection capacity to solve an input shortage.
- Weakening current-best, hard outcome, quality-prevention, capital, or capacity gates.
- Automatically commissioning a score winner without human/Agent review.

## Acceptance

- [x] Run `097-simulate` observation records the exact inspection shortage partition and visible physical path.
- [x] Every existing focused proposal is re-evaluated under the current engine, Objective, Benchmark, Blueprint, and driver identity.
- [x] Current immutable Design evidence explicitly distinguishes current decisions from historical hypothesis lineage.
- [x] The only replay leader reaches the Blueprint solely through immutable promotion, an independent KEEP review, and hash-pinned apply; no new hypothesis is added because current evidence already supplies a safe intervention.
- [x] CLI, Studio, Workbench, immutable evidence, and plan findings agree on the current frontier and next action.
- [x] Targeted tests, project validation, replay, and the full repository checkpoint pass before completion.

## Work

- [x] Inspect current typed loss evidence, spatial inspection state, and historical Design currentness.
- [x] Create and index the active continuity plan.
- [x] Execute the existing focused Design portfolio and compare every current Candidate.
- [x] Inspect the resulting frontier and decide whether a distinct intervention is warranted.
- [x] Promote, independently review, and apply the unique safe existing intervention without weakening evidence gates.
- [x] Create a compatible operating Run and rebuild the post-commission exhausted Design authority from the optimized seed.
- [x] Rebuild shared evidence, verify all surfaces, complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-30 — Run `097-simulate`, result `9ac909d8e7db…`, ranks `inspection-1` first. The exact eligible shortage remains `59.584 s`; the complete input-wait counter is `190.216 s`, so only the event-backed opportunity window is causal authority.
- 2026-07-30 — Factory focus shows one continuous deep-metrology cell at `20.7%` utilization, one ordinary `etch-l2 → inspection-1` lane rated `3.0 lots/min`, and one conditional `rework-1 → inspection-1` return rated `0.5 lots/min`. The inspection recipe itself can perform `16.87 jobs/min`; adding another inspection cell would not address the observed supply boundary.
- 2026-07-30 — Four prior focused Runs are valid historical evidence with `frontier-exhausted` outcomes; none is current after the engine, Program/driver, and Objective identity changes. Four other artifacts fail strict Candidate-evidence validation and remain excluded.
- 2026-07-30 — Historical evidence will seed the replay order but never bypass current simulation. This preserves accumulated reasoning without pretending that a changed score contract leaves old decisions authoritative.
- 2026-07-30 — The proposal provider now composes every intervention over the current lineage instead of accepting only the pristine seed shape. Current Design Run `966127dd542d…` therefore evaluates all six retained hypotheses. The one-tick `closed-loop-fast-4-5` recovery controller is the sole promotable leader: it improves aggregate current-best score by `+0.308377`, improves every one of the five locked cases, and reduces the exact inspection shortage by `1.000 s` without changing delivery, quality, capital, area, throughput, or rework.
- 2026-07-30 — Delayed recovery variants worsen the exact shortage by `0.333 s`; always-fast variants improve the shortage but regress the quality-excursion case; dual vacuum handoff improves shortage by `1.750 s` but violates the capital constraint in every case. A smaller number in one causal metric never overrides whole-factory authority.
- 2026-07-30 — Candidate `inspection-supply-path-966127dd` and review receipt `18c8ebc89825…` preserve the Agent decision boundary. Independent review returns `KEEP`; applying its three exact operations installs a normal/recovery recipe pair and downstream-coverage controller on `etch-l2`.
- 2026-07-30 — Compatible Run `098-simulate`, result `7bcc176c6e6a…`, proves the controller is physical rather than declarative: four recovery activations execute eight recovery jobs. Delivery and throughput remain `88` and `22/min`; equivalent WIP falls `49.457167 → 49.290500`, score improves `-1.550407 → -1.270658`, and the exact inspection shortage falls `59.584 → 58.584 s`. Raw WIP rises slightly `27.834429 → 27.988596`, which remains visible and separate from Objective-owned equivalent accounting.
- 2026-07-30 — Applying a Candidate necessarily makes its source Design Run historical. Workbench briefly showed `0 current / 6 historical` and asked to restart the same investigation. Post-commission Run `6f1f260672f1…` closes that identity boundary explicitly: the optimized seed remains leader, the installed one-tick proposal has zero causal delta, the other five remain rejected, and current evidence is `exhausted`. This is correct authority today, but the need to rerun solely to reconnect a verified applied Candidate is retained as a product-experience gap.

## Verification

- `bun run inm validate examples/memory-fab --json` — passed after Candidate apply.
- `bun run inm simulate examples/memory-fab --json` — created compatible immutable Run `098-simulate`.
- `bun run inm inspect examples/memory-fab --section losses --json` — conserved `58,584` inspection shortage ticks with exact Resource, Buffer, connection, source Device, in-flight, and source-state partitions.
- `bun run inm design examples/memory-fab --program inspection-supply-path --run --max-candidates 7 --progress off --json` — created current exhausted Run `6f1f260672f1…`, six Candidates evaluated, unchanged optimized seed retained.
- `bun run check:fast` — documentation, TypeScript, and the short checkpoint passed.
- Targeted Design, Workbench, CLI, observation, outcome-guardrail, Core simulation, and Studio tests passed while updating the current immutable fixtures.
- `bun run test` — `313` tests and `3,956` assertions passed across Core, CLI, and Studio; all eight Ironworks project tests passed.
- Studio `/memory-fab/factory/devices/etch-l2?run=098-simulate` — visually verified the installed controller, `4` normal / `8` recovery jobs, and `4` recovery activations against Run `098-simulate`.
- Studio `/memory-fab/designs/inspection-supply-path/runs/6f1f260672f1…` — visually verified `1 current / 5 historical / 4 excluded`, current `frontier-exhausted` authority, and the six explicit decisions.

## Progress log

- 2026-07-30 — Plan created from exact Run `097-simulate` CLI observation, loss inspection, focused Program evidence inventory, and Studio inspection-device focus.
- 2026-07-30 — Replayed all retained hypotheses, commissioned the unique guarded leader through Candidate review, simulated Run `098-simulate`, and closed the optimized seed's current frontier.
- 2026-07-30 — Reconciled every current fixture, passed the full repository checkpoint, and visually confirmed both physical controller activation and Design authority in Studio.

## Completion

Completed with the optimized-seed frontier, Candidate decision lineage, compatible operating Run, and shared next action retained as current evidence. The verified intervention is commissioned, the bounded portfolio is exhausted, and the remaining evidence-lineage experience gap is explicit rather than silently rediscovered.
