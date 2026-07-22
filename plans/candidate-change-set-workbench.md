# Candidate change-set workbench

- Status: `completed`
- Updated: `2026-07-22`
- Related design: [[docs/design/experiment-workbench]], [[docs/design/blueprint-comparison]], [[docs/design/coding-agent-optimization]]

## Outcome

Make an experiment candidate a reviewable, reproducible Blueprint proposal that a human or Coding Agent can inspect and apply from either CLI or Studio without manually translating research output into edits.

## Context

The equipment-energy research loop could rank candidate results, but a candidate page was still mostly an evaluation report. The project needed one shared change-set contract so Studio and `inm` could expose the same proposal, semantic diff, completion state, and safe apply behavior.

## Scope

### In scope

- Exact Blueprint patch generation for research candidates.
- Stable candidate proposal hashes and stale-input protection.
- Shared CLI and Studio review/apply behavior.
- A complete candidate detail surface for the memory-fab example.

### Out of scope

- General-purpose source control or arbitrary text patching.
- Automatic application without explicit human or agent intent.
- Redesigning the experiment search algorithm itself.

## Acceptance

- [x] A candidate exposes an exact Blueprint proposal and semantic before/after comparison.
- [x] CLI and Studio consume the same candidate/change-set contract.
- [x] Applying a proposal verifies its expected source state and records completion evidence.
- [x] The memory-fab candidate deep link is usable as an end-to-end review surface.

## Work

- [x] Define and implement the candidate proposal/change-set contract.
- [x] Add proposal hashing, application safety, and completion auditing.
- [x] Add CLI commands and machine-readable output.
- [x] Build the Studio candidate review and apply workflow.
- [x] Update design documents, tests, and the memory-fab project fixture.
- [x] Run the public loop and final completion audit.

## Findings and decisions

- 2026-07-22 — A candidate proposal is a first-class exact Blueprint change set, not a UI-only suggestion.
- 2026-07-22 — Proposal identity is derived from the expected input and patch so both surfaces can detect stale or already-applied work consistently.
- 2026-07-22 — Completion is proven by inspecting the current project state; it is not inferred only from a prior apply command.

## Verification

- `bun run test` — passed with 153 tests, 0 failures, and 1109 assertions.
- Memory-fab experiment and candidate CLI flows — passed.
- Studio candidate detail and apply flow at `/memory-fab/experiments/equipment-energy-research/candidates/stable-furnace-sleep` — manually verified.

## Progress log

- 2026-07-22 — Shared proposal contract, CLI flow, Studio workbench, and completion audit implemented.
- 2026-07-22 — Final repository checks passed and the work was pushed to `main`.

## Completion

The candidate workbench shipped in commits `7b2c184` and `c865ee2`. Experiment candidates now carry exact, inspectable Blueprint proposals with shared CLI/Studio semantics, safe application, and current-state completion auditing.
