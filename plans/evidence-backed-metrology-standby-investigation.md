# Evidence-backed metrology standby investigation

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/equipment-energy-states]], [[docs/design/coding-agent-optimization]], [[docs/design/observation-led-design]], and [[docs/design/agent-cli-contract]].

## Outcome

Carry the memory-fab `metrology-low-power-standby` hypothesis from its persisted observation through one exact locked Candidate evaluation and an append-only Investigation decision, so a later human or Agent can recover both the subjective reasoning and the new machine evidence without relying on chat history.

## Context

The first project-local Investigation now preserves Run `098-simulate`, its current inspection-starvation diagnostic, commissioned Candidate lineage, one spatial/typed observation, and the next authored hypothesis. The observation rules out local belt saturation or blocked unloading: `etch-to-inspection` moved twelve lots at only `1.3%` utilization with zero blocked item-ticks, while `inspection-1` and upstream `etch-l2` both spent long intervals waiting for input.

The installed `continuous-deep-metrology-cell` draws `100 W` in hot standby but has no asset-owned low-power state. The existing equipment-energy contract already models physical sleep, wake work, interruption, metrics, replay, and tariff value. An optional low-power variant can therefore test whether ten-second empty intervals are worth exploiting without changing Core simulation semantics.

This investigation also exposes the next persistence gap. Its creation-time anchors are immutable, but a later Candidate review cannot yet introduce a new exact evidence anchor into the append-only reasoning chain. Recording only a prose decision would recreate the memory-evaporation problem at the first real continuation.

The current operations stack is not the blocker: measured `studio status` completes in `0.08s`, identifies stale manager source exactly, and ordinary `inm session` safely repaired the just-committed stale manager to a current supervisor/server pair in `0.46s`. This plan therefore returns to industrial work instead of reopening already completed port/process infrastructure.

## Scope

### In scope

- Extend an Investigation's append-only log so a later entry can introduce one exact project artifact anchor resolved from authoritative Core data, and later entries can reference it without rewriting the manifest or earlier entries.
- Support at least a Candidate review anchor with proposal hash, review result hash, benchmark, verdict, current/proposed Blueprint hashes, and currentness state; preserve compact references rather than dense evaluation payloads.
- Project introduced anchors and their `current`, `historical`, `missing`, or `invalid` status identically through `inm investigate` and Studio.
- Add a project-local optional deep-metrology asset variant with explicit low-power draw and physical wake work, leaving the incumbent asset and current execution identity untouched until a Candidate selects it.
- Author exactly one ten-second-standby Candidate against the current `generated-dram-fab`, evaluate it through the locked five-case `greenfield-dram-design` contract and current-factory comparison, and apply it only if the recorded verdict is `KEEP`.
- Append the exact Candidate evidence and a human/Agent decision to `inspection-starvation-next-step`; if commissioned, create a compatible operating Run and record the new observed energy-state behavior separately.

### Out of scope

- Threshold sweeps, autonomous search, RL, or automatically revising a rejected hypothesis.
- Weakening current-best case limits, capacity readiness, completion, service, yield, scrap, escape, release, WIP, or Q-time authority to obtain an energy win.
- Mutating the incumbent `continuous-deep-metrology-cell` asset before Candidate review.
- Reworking Studio lifecycle, port discovery, process supervision, or full-checkpoint policy without new contradictory measurements.
- Compatibility readers or migration aliases for the just-authored pre-release Investigation format.

## Acceptance

- [x] A post-creation Investigation entry can introduce a hash-pinned Candidate review anchor; tampering, deletion, proposal replacement, or Blueprint movement resolves deterministically without rewriting any previous file.
- [x] CLI and Studio project the same introduced evidence, state, navigation, entry chain, and decision, while neither surface invents or executes the industrial intervention.
- [x] Adding the unselected low-power asset leaves the current selected execution identity and all three existing Investigation anchors current.
- [x] The metrology Candidate changes only `inspection-1` asset/policy, runs all five locked cases plus current-factory comparison, and receives a strict reproducible review receipt.
- [x] The Investigation ends with the exact review evidence and an explicit `discard` decision; the Blueprint remains unchanged.
- [x] Targeted Core/CLI/Studio tests, project validation, real memory-fab evidence inspection, and the full repository checkpoint pass.
- [x] The introduced Candidate-review evidence receives exact Studio visual verification.

## Work

- [x] Define append-only introduced-evidence identity and currentness without weakening the existing entry hash chain.
- [x] Implement Core, CLI, Studio API/UI, schemas, and cross-surface tests for Candidate review anchors.
- [x] Author the optional low-power metrology asset and one exact ten-second Candidate without changing the incumbent execution.
- [x] Evaluate the locked Candidate, make the human/Agent disposition from its exact evidence, and append both evidence and decision to the Investigation.
- [x] Do not apply the `DISCARD` Candidate; preserve the incumbent Blueprint and exact negative evidence.
- [x] Update lasting contracts, complete the full nonvisual verification, and prepare a coherent checkpoint.
- [x] Complete exact Studio visual verification; do not substitute API or route tests for pixels.

## Findings and decisions

- 2026-07-30 — Existing equipment sleep/wake physics are sufficient. This intervention should be project-local asset and Blueprint work, not a new Core energy abstraction.
- 2026-07-30 — The optional asset must be added beside the incumbent because mutating the selected asset would invalidate the observation before the proposed intervention reaches Candidate review.
- 2026-07-30 — One authored ten-second threshold is the hypothesis. A parameter sweep would turn a subjective industrial decision into an unasked miniature optimizer and is intentionally excluded.
- 2026-07-30 — Creation-time manifest anchors remain immutable. Later evidence belongs in the existing append-only hash chain so the Investigation gains history without a mutable evidence index.
- 2026-07-30 — Candidate-review anchors are introduced inside one hashed entry. Callers provide only Candidate and anchor ids; Core pins the strict receipt identities and supports same-entry citation.
- 2026-07-30 — The reviewed intervention improved the current-factory energy Objective component by `+0.031858992142857145`, but incurred an approximately one-million-point constraint penalty in every current-factory case and reduced `facility-interruption` on-time lots from nine to seven. Verdict: `DISCARD`.
- 2026-07-30 — The failed Candidate was not applied. The current Blueprint remains `8281c50706c578b823b7d8cc3f5d4f94cef230fefbee210c8a3756a6a9a9563a`; the new optional catalog asset does not alter selection-scoped execution identity.
- 2026-07-30 — During UI verification, source adoption correctly removed a stale child, but a transient TypeScript compile error caused the replacement child and supervisor to exit permanently. Recovery through ordinary `inm session` worked; resilient retry after a failed source adoption belongs to a separate operations plan.

## Verification

- Baseline operations audit: `inm studio status examples/memory-fab --json` completed in `0.08s`, reported server current / manager stale after commit `70305be`; `inm session examples/memory-fab --experiment equipment-energy-research --no-open --json` converged both identities to current in `0.46s` on managed port `4176`.
- Core Investigation test: candidate review anchor is current, then deterministically historical after proposal replacement or Blueprint movement, invalid after receipt tampering, missing after deletion, and protected by the entry hash chain.
- Candidate review: proposal `0a666ec26a4a6e2d6955b6eaa9a5ffb76625fb4e67f26b32e55e6a4e9082869e`, result `816f065fd250ddfe40fba4b65b0821be458cf97223309b3564240912651bf7f0`, verdict `DISCARD`, proposed Blueprint `270521ff24a6a0625431e27a5f564ca2e1b2b81a6208fe2644cf979acdc0e150`.
- Investigation inspection shows all four accumulated anchors current and entry `0003-metrology-standby-rejected` at hash `a6d165f99d4f6c11d5daa03149cd4aa61834d2b9746507570558ab7f1242d82d`.
- Core, CLI, and Studio type checks passed. Targeted regression: 33 tests / 1,406 assertions. Final full checkpoint: 318 tests / 3,485 assertions plus eight Ironworks fixtures.
- Exact Studio visual verification passed on the live `/<project>/investigations/<id>` route. The current DISCARD Candidate card, evidence navigation, immutable decision entry, introduced-anchor label, and append form all render legibly without clipping or overlap.

## Progress log

- 2026-07-30 — Plan created from the first persisted Investigation hypothesis and the discovered inability to attach the later Candidate evidence needed to close it.
- 2026-07-30 — Implemented append-only Candidate-review evidence across Core, CLI, Studio, and schemas; added strict current/historical/missing/invalid coverage.
- 2026-07-30 — Authored and reviewed the self-contained low-power metrology option, recorded the negative five-case/current-factory result, and appended the exact DISCARD decision without mutating the Blueprint.
- 2026-07-30 — Passed fast checks, strict project validation, real four-anchor Investigation inspection, 33 targeted tests, 318 full repository tests, and all eight Ironworks fixtures. Exact visual verification remains the sole active-plan acceptance item.
- 2026-07-30 — Completed live Studio visual verification through the controlled browser. The fourth Candidate-review card, `0003` DISCARD decision, introduced evidence label, and append controls are all visible and coherent; the plan is complete.

## Completion

Complete when the same memory-fab Investigation contains its original observation, the low-power standby hypothesis, an exact later Candidate review anchor, and an explicit evidence-backed disposition; any commissioned Blueprint and operating Run must remain attributable through the guarded Candidate boundary.
