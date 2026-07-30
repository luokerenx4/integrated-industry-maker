# Continuous Investigation evidence

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/experiment-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Let one project-local Investigation survive a successful factory revision by appending an exact current-factory evidence checkpoint, preserving the old Run and conclusions as history while giving subsequent observations, hypotheses, Candidates, and decisions a new hash-pinned operating context.

## Context

The current memory-fab Investigation can carry one hypothesis through Candidate review and explicit disposition. Its creation manifest permanently pins Run `098-simulate`, the corresponding diagnostic, and the selected execution hashes. That is correct historical identity, but the Investigation cannot introduce a later operating Run or diagnostic.

Consequently, the first commissioned Blueprint change makes every creation-time operating anchor historical and every later hypothesis still derives currentness from the original manifest hashes. The reasoning log can grow, but its machine evidence context cannot. A system intended to accumulate industrial knowledge must treat old valid evidence as history rather than corruption and let a new observation explicitly pin the revised factory without rewriting earlier files.

## Scope

### In scope

- Add one append-only factory-observation checkpoint that Core resolves from the exact current compatible Run, diagnostic, project selection, and execution hashes.
- Inspect every checkpoint independently as `current`, `historical`, `missing`, or `invalid`; retain old valid anchors without allowing them to make a newer exact checkpoint historical.
- Resolve a hypothesis and its sourced Candidate against the newest factory-observation checkpoint it cites, falling back to the creation context only when no checkpoint is cited.
- Expose checkpoint creation, identity, currentness, evidence navigation, and hypothesis context through CLI and Studio.
- Append one real memory-fab checkpoint after the retained metrology decision, preserving the actionable capital/service boundary beside the current operating evidence.

### Out of scope

- Automatically writing observation or hypothesis prose.
- Automatically choosing, generating, reviewing, or applying a Candidate.
- Rewriting old manifest or entry files, merging separate questions, or adding compatibility readers for the pre-alpha format.
- Changing simulation physics, Objective limits, the memory-fab Blueprint, or the existing metrology decision.

## Acceptance

- [x] An Investigation can append a Core-owned factory-observation checkpoint without caller-authored hashes, diagnostic payloads, or result identity.
- [x] After a Blueprint and compatible Run change, old exact anchors remain historical while the new checkpoint and Investigation are current; missing or corrupt evidence still fails closed.
- [x] A hypothesis citing the checkpoint produces Candidate source evidence whose currentness and operating context come from that checkpoint rather than the creation manifest.
- [x] CLI and Studio expose the same checkpoint creation action, exact identity, currentness, navigation, and append-only reasoning chain.
- [x] The checked-in memory-fab Investigation records the current capital/service boundary against an exact factory checkpoint without changing the Blueprint or review disposition.
- [x] Focused Core/CLI/Studio tests, the public memory-fab loop, visual verification, and `bun run test` pass.

## Work

- [x] Audit the current Investigation/Candidate/Run identity chain and identify the first post-commission continuity break.
- [x] Define factory-observation checkpoint identity, inspection, aggregate currentness, and hypothesis-context resolution in Core.
- [x] Add explicit CLI and Studio checkpoint capture with focused tests.
- [x] Append and inspect one real memory-fab checkpoint; update lasting design and CLI contracts.
- [x] Complete visual, public-loop, and full verification; audit every acceptance item.

## Findings and decisions

- 2026-07-30 — Candidate review continuity is already exact. The missing boundary is the next compatible operating observation after the factory changes, not another proposal or evaluation store.
- 2026-07-30 — Historical is an expected lifecycle state for valid old evidence. Investigation-level currentness must follow the newest operating checkpoint while any missing or invalid anchor still degrades the chain.
- 2026-07-30 — One factory-observation checkpoint will own selection hashes, Run identity, and the selected diagnostic snapshot as one causal context. Splitting them into separately introduced anchors would permit partial or mismatched epochs.
- 2026-07-30 — Candidate source resolution validates the checkpoint's direct compiled hashes and Run identity without reopening the full Workbench. Full diagnostic projection remains Investigation-inspection authority; crossing that boundary recursively reopened Candidates and the Investigation.

## Verification

- `bun run check:fast` — passed documentation links, every package/project TypeScript check, and the short test suite.
- Focused Core, CLI, and Studio Investigation tests — passed the revision, checkpoint capture, hypothesis inheritance, tamper, public-command, and HTTP flows.
- `bun run inm validate examples/memory-fab --json` — passed.
- `bun run inm investigate examples/memory-fab --investigation inspection-starvation-next-step --section all --json` — returned five append-only entries and a current `post-standby-factory` checkpoint.
- `bun run inm candidate examples/memory-fab --candidate metrology-low-power-standby-sourced --json --progress off` — retained exact Investigation source context and current operating Run `098-simulate`.
- Browser verification at `/memory-fab/investigations/inspection-starvation-next-step` and `/memory-fab/experiments/greenfield-dram-design/candidates/metrology-low-power-standby-sourced` — checkpoint, boundary statement, capture action, and Candidate operating context rendered without source/evaluation errors.
- `bun run test` — passed 325 tests, 3,638 assertions, and all eight Ironworks end-to-end fixtures.

## Progress log

- 2026-07-30 — Plan created after proving that current hypotheses remain tied to the creation manifest even when the reasoning log continues after a factory revision.
- 2026-07-30 — Added strict Core-owned factory-observation checkpoints, shared CLI/Studio capture and inspection, exact hypothesis/Candidate context inheritance, and a real current memory-fab capital/service boundary.

## Completion

Completed on 2026-07-30. One Investigation now moves from its original operating evidence to a newer exact factory state without rewriting history, and a later hypothesis/Candidate demonstrably inherits that newer context across Core, CLI, Studio, and the checked-in memory-fab fixture.
