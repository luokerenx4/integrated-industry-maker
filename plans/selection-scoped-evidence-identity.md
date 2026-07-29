# Selection-scoped evidence identity

- Status: `active`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Outcome

Let a self-contained project add unused assets, Processes, and other design options without invalidating unrelated Run, Benchmark, Design, and Candidate evidence, while still invalidating evidence whenever any definition reachable by the exact selected factory changes.

## Context

Adding two unused small-batch screening Processes to memory-fab changed `processCatalogHash`. Qualifying them on an already placed Device asset also changed `deviceCatalogHash`. The commissioned Blueprint continued to bind the same two eight-device Processes and Run `094-simulate` reproduced Run `093-simulate` exactly, yet all unrelated loss-focused Design authority became stale and Workbench sent the operator back through already bounded investigations.

Today `compileFactoryProject` hashes every loaded Resource, Process, Route, and Device asset package. Those catalog-wide hashes are useful project inventory identity, but they are too broad as execution compatibility authority. Industrial projects are expected to accumulate project-local alternatives before a Blueprint selects them.

## Scope

### In scope

- Define an explicit execution/evidence identity for the exact selected Blueprint, Scenario, Objective, World, and their reachable project-local definitions.
- Keep full-catalog identity available for project discovery and asset-library refresh without using unrelated entries as simulation-equivalence authority.
- Apply the execution identity consistently to Run compatibility, Benchmark locks/cache, Design authority/continuation, Candidate review/apply, CLI, Studio, and operation context.
- Prove that an unused option remains compatible and that every referenced semantic or runtime change becomes incompatible.
- Migrate current example evidence under the pre-alpha no-compatibility policy.

### Out of scope

- Reusing evidence across engine versions, selected Blueprint changes, or changes to any reachable Process, Device runtime, Resource, Route, Scenario, World, or Objective.
- Treating numerical replay equality as a substitute for exact input identity.
- Sharing asset libraries across projects.

## Acceptance

- [ ] Adding an unreferenced project-local Process or Device asset does not change the selected factory's execution identity or stale its current evidence.
- [ ] Selecting that option, changing a referenced definition/runtime, or changing world/blueprint/scenario/objective invalidates the exact evidence chain.
- [ ] A locked Benchmark may evaluate a Candidate that selects a newly added option while its unchanged baseline remains lock-valid.
- [ ] Workbench, CLI, Studio, Run replay, Design continuation, and Candidate apply agree on current/stale authority.
- [ ] Memory-fab can retain the small-batch option portfolio without forcing unrelated focused Design Programs back into the active queue.
- [ ] Full repository and both example-project regression suites pass.

## Work

- [ ] Write compatibility tests that separate full catalog inventory from the selected execution closure.
- [ ] Define and implement one canonical selection-scoped identity projection in Core.
- [ ] Route Benchmark, Run, Design, Candidate, operation, CLI, and Studio compatibility through that identity.
- [ ] Migrate schemas, fixtures, locked examples, and durable design documentation together.
- [ ] Rebuild current memory-fab evidence once, verify the Workbench queue, and complete the regression audit.

## Findings and decisions

- 2026-07-29 — `compileFactoryProject` currently constructs all four `*CatalogHash` values from every loaded catalog entry. Benchmark locks and operation identity consume the same `ProjectHashes` object, so unused option authoring invalidates all downstream authority.
- 2026-07-29 — Merely filtering Process ids is insufficient when an existing placed Device asset is edited to qualify the new Process: an execution projection must distinguish selected Device semantics/runtime from unselected qualifications, or optional equipment must live in a separate asset package.
- 2026-07-29 — Full catalog hashes remain useful descriptive/source-refresh identity. The plan will introduce or clearly separate execution authority rather than silently changing the meaning of a field named `CatalogHash`.
- 2026-07-29 — This is a strictness refinement, not relaxed verification: the reachable closure must include Device runtime code and every selected physical/operating contract, not only JSON recipe ids.

## Verification

- Pending.

## Progress log

- 2026-07-29 — Plan created from the catalog-staleness fallout observed while completing [[plans/back-end-screening-batch-portfolio]].
- 2026-07-29 — Initial audit located the shared authority boundary in `compileFactoryProject`, `ProjectHashes`, Benchmark locks/cache, Design briefs, operation contexts, and Workbench compatibility.
- 2026-07-29 — Paused at the user's direction while [[plans/frictionless-industrial-design-cycle]] removes daily lifecycle and experiment-feedback friction. No implementation had started, so the audited boundary remains the exact continuation point.
- 2026-07-29 — Reactivated after the operating-loop plan completed; continue from the existing Core authority audit and compatibility tests.

## Completion

Pending.
