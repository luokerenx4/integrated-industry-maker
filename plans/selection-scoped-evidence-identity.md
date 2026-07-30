# Selection-scoped evidence identity

- Status: `completed`
- Updated: `2026-07-30`
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

- [x] Adding an unreferenced project-local Process or Device asset does not change the selected factory's execution identity or stale its current evidence.
- [x] Selecting that option, changing a referenced definition/runtime, or changing world/blueprint/scenario/objective invalidates the exact evidence chain.
- [x] A locked Benchmark may evaluate a Candidate that selects a newly added option while its unchanged baseline remains lock-valid.
- [x] Workbench, CLI, Studio, Run replay, Design continuation, and Candidate apply agree on current/stale authority.
- [x] Memory-fab can retain the small-batch option portfolio without forcing unrelated focused Design Programs back into the active queue.
- [x] Full repository and both example-project regression suites pass.

## Work

- [x] Write compatibility tests that separate full catalog inventory from the selected execution closure.
- [x] Define and implement one canonical selection-scoped identity projection in Core.
- [x] Route Benchmark, Run, Design, Candidate, operation, CLI, and Studio compatibility through that identity.
- [x] Migrate schemas, fixtures, locked examples, and durable design documentation together.
- [x] Rebuild current memory-fab evidence once, verify the Workbench queue, and complete the regression audit.

## Findings and decisions

- 2026-07-29 — `compileFactoryProject` currently constructs all four `*CatalogHash` values from every loaded catalog entry. Benchmark locks and operation identity consume the same `ProjectHashes` object, so unused option authoring invalidates all downstream authority.
- 2026-07-29 — Merely filtering Process ids is insufficient when an existing placed Device asset is edited to qualify the new Process: an execution projection must distinguish selected Device semantics/runtime from unselected qualifications, or optional equipment must live in a separate asset package.
- 2026-07-29 — Full catalog hashes remain useful descriptive/source-refresh identity. The plan will introduce or clearly separate execution authority rather than silently changing the meaning of a field named `CatalogHash`.
- 2026-07-29 — This is a strictness refinement, not relaxed verification: the reachable closure must include Device runtime code and every selected physical/operating contract, not only JSON recipe ids.
- 2026-07-30 — Keep catalog-wide hashes as descriptive project inventory. Persisted execution authority uses a separate `executionHash` plus the selected World, Blueprint, Scenario, and Objective hashes; result/cache identities must exclude catalog-wide hashes.
- 2026-07-30 — Blueprint `revision` is optimistic-concurrency lineage rather than simulator behavior. It remains in `blueprintHash` but is excluded from the execution closure, allowing a Design seed normalized onto the promotion lineage to retain the same physical execution identity.
- 2026-07-30 — Device execution identity is projected from placed/transport/fleet uses, selected Process and mode plans, effective ports/buffers, relevant changeovers, physical service/power/economic contracts, and non-presentation runtime package content. Unselected Device qualifications and visual files remain catalog inventory only.
- 2026-07-30 — Benchmark locks persist the unchanged baseline's exact evidence hashes rather than whole catalog inventory. Candidate compilation remains free to select a newly authored option; that Candidate receives its own different execution identity and is still judged through the complete locked case suite.
- 2026-07-30 — Example-run regeneration is append-only and result-addressed. It reuses an already published exact result and assigns new sequence ids only to genuinely new evidence, retaining older engine records instead of replacing history.

## Verification

- `bun run test` — 312 tests and 3522 assertions pass across Core, CLI, and Studio; documentation links, all TypeScript projects, and the Ironworks project contract also pass.
- `bun run inm test examples/memory-fab` — bounded batch formation and re-entrant inspection/rework/scrap fixtures pass.
- `bun run inm test examples/ironworks` — all eight project fixtures pass.
- `bun run runs:regenerate` twice — first publication appends nine `inm-sim/0.89.0` runs beside twelve historical runs; the second reports zero additions and nine exact result reuses.
- `bun run inm inspect examples/memory-fab --section all --json` — Run `096-simulate` is compatible under execution hash `ba0719035bfa7cbdfd914f435280d0219b83c93714c5fc5dda87969352418d2c`; eight exact loss dispositions remain current, and the shared next action returns to exhausted Objective authority `back-end-wip-convergence` Run `6a178e5e8c80d4dbcb40dbf81a8cfe27ef29159d2cdcde390740231009c80a14`.
- Selection identity tests prove unused Process qualification, an unplaced Device, and selected-Device presentation change catalog hashes without changing execution identity; selecting the Process, changing its selected runtime, or changing Scenario changes execution identity.

## Progress log

- 2026-07-29 — Plan created from the catalog-staleness fallout observed while completing [[plans/back-end-screening-batch-portfolio]].
- 2026-07-29 — Initial audit located the shared authority boundary in `compileFactoryProject`, `ProjectHashes`, Benchmark locks/cache, Design briefs, operation contexts, and Workbench compatibility.
- 2026-07-29 — Paused at the user's direction while [[plans/frictionless-industrial-design-cycle]] removes daily lifecycle and experiment-feedback friction. No implementation had started, so the audited boundary remains the exact continuation point.
- 2026-07-29 — Reactivated after the operating-loop plan completed; continue from the existing Core authority audit and compatibility tests.
- 2026-07-30 — Added failing-then-passing Core tests proving unused Process/Device options change catalog inventory without changing execution identity, while selection, Device runtime, and Scenario changes invalidate it. Began routing Benchmark, Run, Design, Workbench, CLI, and Studio authority through the new projection.
- 2026-07-30 — Migrated all locked example Benchmarks to `inm-sim/0.89.0`, published current memory-fab Run `096-simulate`, and rebuilt the complete focused Design evidence chain. The final queue-convergence Run `3a053b523cb53b2dbcf2bf0ba375d23c8383452f3cb2db93da0a128829d090c6` restores the eighth bounded loss disposition.
- 2026-07-30 — Verified that the retained small-batch Process portfolio no longer owns unrelated inspection evidence, while the Workbench naturally advances from eight bounded realized losses to current Objective WIP evidence. Completed repository and example regression.

## Completion

INM now separates complete project inventory identity from exact selected execution authority. Unused self-contained design options and presentation can accumulate without evaporating unrelated Run, Benchmark, Design, Candidate, CLI, or Studio conclusions; every selected semantic or runtime change still invalidates the exact evidence chain. The memory-fab retains its small-batch portfolio, current operating evidence, eight bounded loss conclusions, and Objective handoff under the new contract.
