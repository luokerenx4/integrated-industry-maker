# Exact loss Program handoff

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/fab-loss-attribution]], [[docs/design/industrial-investigations]], and [[docs/design/observation-led-design]].

## Outcome

Make every loss-focused Design Program name the exact measured contributor and metric it is qualified to change, so the current Run 110 furnace input-starvation diagnostic opens a run-qualified Investigation instead of an unrelated inspection or broad proposal Program.

## Context

Run 110 is the current compatible operating record after layer-two particle-control commissioning. Its leading physical loss is `device:furnace-1:material-input-shortage.starvationTicks`, but Workbench recommends `inspection-supply-path` because Design Program focus currently matches only the broad `input-starvation` bucket. The Program's proposal provider is qualified for `device:inspection-1`, so this handoff would exhaust or mislead before any industrial reasoning begins.

The repository already retains a historical furnace recovery decision. That prior evidence remains useful context, but it does not prove that the current contributor, opportunity window, or Blueprint state has the same cause. The next intervention must begin from current observation and retain a distinct human/Agent hypothesis.

## Scope

### In scope

- Replace bucket-only loss Program focus with one exact loss, contributor, metric, and direction identity.
- Require focused proposal evidence to match that Program identity.
- Use exact current evidence when Workbench aligns a diagnostic, Program, immutable Design Run, and next action.
- Migrate the self-contained memory-fab Programs and public CLI/Studio projections to the strict contract.
- Create a furnace-specific Investigation from Run 110, inspect typed and spatial evidence, and record the resulting hypothesis or bounded defer decision.

### Out of scope

- Autonomous factory design, RL, unbounded proposal search, or automatic hypothesis creation.
- Hiding the physical `input-starvation` bucket after a historical intervention.
- Changing furnace supply behavior before current typed and spatial observation supports a concrete intervention.
- Compatibility aliases or migrations for pre-release Program manifests.

## Acceptance

- [x] A loss-focused Program cannot validate without one exact contributor, metric, and direction target, and a proposal cannot claim a different target.
- [x] Workbench recommends or reopens a loss-focused Program only when the current compatible attribution contains its exact target.
- [x] CLI and Studio expose the same exact Program target; when no exact Program matches, Run 110 opens the run-qualified observation path instead of a broad or unrelated Program.
- [x] Run 110 has an Investigation entry recording typed evidence, spatial observation, a human/Agent hypothesis or bounded defer decision, and the expected measurable/visual effect of any proposed change.
- [x] Project fixtures, schemas, design documents, focused tests, and full `bun run test` verify the strict contract.

## Work

- [x] Confirm the Run 110 contributor and reproduce the bucket-only inspection Program mismatch.
- [x] Define and implement the strict exact-target Program focus and proposal validation.
- [x] Migrate memory-fab Program manifests/providers and align Workbench selection plus observation fallback.
- [x] Create the Run 110 furnace Investigation and complete typed plus spatial observation before any intervention or defer decision.
- [x] Exercise CLI/Studio parity, update durable docs and fixtures, and complete the verification audit.

## Findings and decisions

- 2026-07-31 — Run 110 ranks `device:furnace-1:material-input-shortage.starvationTicks` first, while Workbench routes the same bucket to `inspection-supply-path`; loss bucket equality is therefore insufficient Program applicability evidence.
- 2026-07-31 — Historical furnace recovery evidence is accumulated context, not authority for the current state. The new Investigation will reference it but must observe Run 110 independently.
- 2026-07-31 — Because INM is pre-alpha, the loss-focused Program shape will be replaced directly instead of retaining a bucket-only compatibility branch.
- 2026-07-31 — Run 110 spatial evidence rules out a local transport or furnace-capacity intervention: the four-cell line delivered all 12 items at 1.3% utilization with zero blocking, endpoint-capacity, power, or failure loss; furnace utilization is 30%, deposition utilization is 32.1%, and the installed deposition recovery controller already activated three times. With no physically distinct qualified proposal, Workbench must hand off to observation rather than inventing a furnace Program.

## Verification

- `bun test packages/inm-core/src/workbench.test.ts packages/inm-core/src/design-program.test.ts` — pass.
- `bun test packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts` — 37 pass after aligning the current Investigation disposition fixture.
- `bun run check:fast` — documentation, five TypeScript projects, and 41 short tests pass.
- `bun run test` — 354 package tests / 3931 assertions and all eight Ironworks fixtures pass. An earlier full run had one transient Studio lifecycle convergence failure; the isolated test and the complete rerun both passed.
- `bun run inm validate examples/memory-fab` — current project compiles with Blueprint `1e1211d6be36`.
- `bun run inm inspect examples/memory-fab --json` — Workbench V19 suppresses the exact deferred furnace diagnostic and routes the next action to run-qualified Probe queue observation.
- `bun run inm investigate examples/memory-fab --investigation run-110-furnace-supply --json` — the project-local Investigation reopens successfully.
- Studio browser observation verified Run 110 factory, furnace/deposition state, the exact local belt evidence, and the Investigation route before the defer decision.

## Progress log

- 2026-07-31 — Plan created and mismatch reproduced from the current Workbench snapshot.
- 2026-07-31 — Replaced bucket-only Program focus with strict exact target identity across Core, CLI, Studio, project manifests, and immutable evidence classification.
- 2026-07-31 — Retained a current Run 110 furnace Investigation defer decision after typed and spatial evidence ruled out a distinct local intervention; Workbench now advances to Probe-owned queue congestion.
- 2026-07-31 — Completed focused, fast, full, CLI, and browser verification.

## Completion

Completed. Loss-focused Programs can no longer inherit authority from a broad bucket match, and the current factory queue advances through exact evidence rather than an unrelated proposal portfolio.
