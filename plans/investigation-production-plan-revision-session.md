# Investigation-sourced Production Plan revision session

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/production-plans]], [[docs/design/industrial-investigations]], [[docs/design/experiment-workbench]], and [[docs/design/development-operations]].

## Outcome

Let a human or reasoning Agent turn one current Investigation Production Plan hypothesis into a self-contained, source-pinned plan revision, separately selected immutable Run, exact control comparison, and explicit decision without reconstructing hypothesis, base-plan, port, or Run identity by hand.

## Context

The first memory-fab Production Plan experiment proved that plan selection and one-variable Run comparison work, but its middle step was assembled manually. The authored plan file does not itself retain which Investigation hypothesis caused it to exist; after the hypothesis handoff, a human or Agent must remember the control plan, author JSON out of band, invoke simulation separately, locate the resulting Run, and return the comparison to the Investigation.

That is an evidence-continuity gap rather than an optimization-algorithm gap. The system may derive identities, validate an explicitly authored alternative, execute simulation, and reopen exact evidence. It must not invent the schedule change or decide whether measured improvement is industrially acceptable.

Run `102-simulate` also supplies the next bounded north-star question. All twelve lots complete wafer processing, but the fixed back-end finishes only eleven burn-in batches and leaves eight packaged devices at `burn-in-1`. A second Production Plan experiment must preserve all twelve scheduled lots and test an authored release-cadence intervention rather than improving the horizon by deleting production.

## Scope

### In scope

- Add a project-local Production Plan revision receipt that pins the exact Investigation hypothesis, control Run/selection, complete base plan, caller-authored proposed plan, hashes, and derived semantic patch.
- Reject non-current, non-Production-Plan, cross-project, duplicate-id, unchanged, invalid, or identity-mismatched authoring attempts.
- Advance the Investigation handoff from `author-production-plan` to exact simulate and compare phases by discovering only verified revision and immutable Run evidence.
- Expose the same authoring and handoff contract through Core, `inm`, Studio, and project format documentation.
- Provide a structured Studio schedule editor and an Agent-friendly CLI file input; simulation remains an explicit action and decision remains authored.
- Exercise the complete loop with one twelve-lot memory-fab cadence hypothesis, retain its measured result, and keep or discard it explicitly.
- Preserve a single source-current managed Studio entry path; do not create a second operation store or require port knowledge.

### Out of scope

- Automatic schedule generation, parameter search, recommendation, or acceptance.
- Making an authored alternative the project default.
- Treating Objective score as decision authority.
- Replacing the existing project-local operation registry or rewriting foreground diagnostic `studio serve`.
- A generic spreadsheet-style editor for every possible future planning primitive.

## Acceptance

- [x] A Production Plan revision receipt independently re-verifies its Investigation hypothesis, control context, base/result plan hashes, and semantic patch.
- [x] Core rejects every attempt that does not represent one explicit, current Production Plan intervention.
- [x] Investigation handoff progresses through author, simulate, and compare phases without caller-supplied hashes or Run discovery.
- [x] CLI JSON/human output and Studio expose the same revision identity, exact next action, and immutable Run comparison route.
- [x] Studio lets a human edit lot releases and material deliveries explicitly, then create and simulate the selected alternative without changing project defaults.
- [x] The memory-fab trial schedules all twelve lots and records an evidence-backed human/Agent disposition.
- [x] Targeted tests, both public project fixture suites, `bun run check:fast`, full `bun run test`, and browser verification pass.

## Work

- [x] Audit existing lifecycle, Investigation handoff, Production Plan selection, simulation, and comparison boundaries.
- [x] Implement the revision receipt and strict hypothesis/control resolution in Core.
- [x] Project authoring and phase-aware continuation through CLI and Studio.
- [x] Run the twelve-lot memory-fab experiment and append its comparison-backed decision.
- [x] Complete acceptance audit, full verification, plan archive, commit, and push.

## Findings and decisions

- 2026-07-31 — Studio already has source-current portless Session entry and reconnectable Benchmark/Design operations. The missing continuity is the authored industrial action after `author-production-plan`, not another operation registry.
- 2026-07-31 — Run identity proves which plan executed, but a standalone plan file does not prove why it was authored. A separate revision receipt will retain the hypothesis and complete before/after plans without changing hashes of unrelated historical Runs.
- 2026-07-31 — The next memory-fab plan experiment must retain twelve lot releases and twelve substrate deliveries. Removing planned memory is already bounded negative evidence.
- 2026-07-31 — The five-second cadence retained all twelve lots and 96 substrates but regressed score by `0.791667`, raised average WIP by `0.500`, added `4.25s` mean release delay, and left delivered items unchanged at `88`; the Investigation therefore records `DISCARD` and resumes from exact Run `102-simulate`.
- 2026-07-31 — Browser execution exposed that the ordinary simulation endpoint returned a synchronous operation result while the new UI expected a retained operation identity. Studio simulation now uses the same reconnectable operation registry as other long work, and lifecycle startup waits for both managed state and HTTP health to report `current`.

## Verification

- `bun run check:fast` — passed documentation, TypeScript, and 41 short tests.
- `bun run test` — passed 345 tests across 29 files plus all eight Ironworks public fixtures.
- `bun run inm test examples/memory-fab` — passed both public memory-fab fixtures.
- Browser verification — edited one temporary twelve-lot plan, created revision `ddef36faa459db56`, ran it through the retained Studio operation, discovered immutable Run `105-simulate`, and reached the exact `102-simulate → 105-simulate` comparison route; the temporary project and service were removed afterward.
- Canonical memory-fab comparison — Studio rendered exact Run `102-simulate → 104-simulate`, the `REGRESSED` result, unchanged `12/12` scheduled/released lots and `88` delivered items, and an Investigation-preserving return route.

## Progress log

- 2026-07-31 — Plan created and indexed after lifecycle and evidence-continuity audit.
- 2026-07-31 — Added strict project-local revision receipts, phase-aware Core handoff, CLI file authoring, Studio schedule editing, retained simulation execution, and exact comparison return.
- 2026-07-31 — Executed and discarded the twelve-lot five-second cadence trial, retained its immutable Run and comparison, and restored the Investigation to current Run `102-simulate`.
- 2026-07-31 — Completed repository, fixture, browser, lifecycle, and evidence acceptance; archived the plan.

## Completion

The Production Plan intervention loop is now one accumulated Investigation sequence shared by humans and Agents: explicit hypothesis, complete authored revision, immutable simulation, exact comparison, explicit disposition, and a current evidence-backed continuation.
