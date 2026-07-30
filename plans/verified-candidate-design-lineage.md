# Verified Candidate Design lineage

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/design-programs]], [[docs/design/experiment-workbench]], [[docs/design/operator-workbench]], and [[docs/design/coding-agent-optimization]].

## Outcome

Let an immutable Design Run remain authoritative as commissioned design lineage when one exact project-local Candidate, KEEP review receipt, and current Blueprint prove that its leader was applied, so humans and Agents can continue from accumulated evidence instead of mechanically recreating the same Design Run after every accepted change.

## Context

The Candidate contract already records its source Program, Design result hash, and best Blueprint hash. The immutable review receipt records the proposal, base, proposed Blueprint, complete locked evaluation, and result hash. `inspectCandidateDecision()` returns `verified` only while the Benchmark candidate Blueprint still equals the reviewed proposed hash.

Design evidence classification currently ignores that chain. Applying an accepted Candidate changes the Program seed, driver execution identity, and promotion base, so its source Design Run becomes strictly historical and Workbench reports `missing` until the same bounded portfolio is rerun from the commissioned Blueprint. Studio also has a separate component-local commissioning check, creating inconsistent identity semantics across Core, CLI, and UI.

The correct model must preserve both facts: the old seed is not direct current evidence, while the exact verified apply chain proves that its accepted leader is the current factory. This commissioned lineage may guide the next human/Agent decision and suppress duplicate promotion or mechanical evidence recreation; it must not fabricate a compatible operating Run, current driver metrics, or a bounded loss disposition.

## Scope

### In scope

- Define one Core-owned commissioned-lineage identity from Design Run, Candidate source, immutable KEEP receipt, and current Benchmark candidate Blueprint.
- Distinguish direct current, commissioned, historical, and invalid Design evidence without rewriting old artifacts.
- Make Workbench next action, CLI Design inspection, and Studio Design workbench project the same authority and exact Candidate handoff.
- Prove the chain breaks on any mismatched Program, Design result, best Blueprint, Benchmark, base, proposed/current Blueprint, verdict, or review state.
- Verify the behavior against the real memory-fab inspection Candidate without requiring its post-commission replay Run.

### Out of scope

- Treating commissioned lineage as a compatible operating Run or current driver measurement.
- Inferring that a non-exhausted portfolio became exhausted during apply.
- Automatically proposing, reviewing, or commissioning another factory change.
- Compatibility readers, migrations, aliases, or synthetic upgrade of malformed pre-alpha evidence.

## Acceptance

- [x] After removing only the redundant post-commission Design replay, `inspection-supply-path` has one commissioned authority sourced from Candidate `inspection-supply-path-966127dd`; Workbench does not report the Program as missing or recommend recreating the same evidence.
- [x] Core, CLI, and Studio expose the same commissioned state, source Run, Candidate id, reviewed hashes, and read-only next action.
- [x] Commissioned lineage never produces a current loss disposition or compatible operating evidence and fails closed when any identity link changes.
- [x] Targeted tests, real memory-fab CLI/Studio inspection, project validation, and the full repository checkpoint pass.

## Work

- [x] Inspect the existing Design, Candidate, review, apply, Workbench, CLI, and Studio identity boundaries.
- [x] Create and index this plan before implementation.
- [x] Add strict commissioned-lineage resolution and evidence classification in Core.
- [x] Replace CLI- and Studio-local inference with the shared Core projection.
- [x] Remove the redundant post-commission Design replay from the memory-fab evidence set and update fixtures/documentation.
- [x] Complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-30 — Candidate V1 and review-receipt V2 already contain every persistent hash needed for an exact commissioning chain; adding another mutable session record would duplicate authority.
- 2026-07-30 — “Direct current” and “commissioned” must remain distinct. Commissioned evidence may own design lineage and next-action continuity, but current fab loss and Objective authority still require a compatible immutable operating Run.
- 2026-07-30 — The post-commission Design Run `6f1f260672f1…` exists only to reconnect identity after apply. It is the acceptance fixture to remove once source Run `966127dd542d…` becomes commissioned authority.
- 2026-07-30 — Direct-current evidence always outranks commissioned lineage. A commissioned source must itself have produced a non-empty KEEP promotion and match one unique verified Candidate chain; changed source/program/Benchmark/base/proposal/review/current Blueprint or non-Blueprint execution identity fails closed to historical.
- 2026-07-30 — Commissioned lineage is intentionally read-only. It suppresses duplicate new-run, continuation, and promotion operations, links to the exact Candidate, and cannot create current operating measurements or bounded loss disposition.

## Verification

- `bun run check:fast` — documentation links, TypeScript, and short unit suite passed.
- `bun run test` — all `315` repository tests and all eight Ironworks project tests passed.
- `bun test packages/inm-core/src/workbench.test.ts --test-name-pattern 'verified Candidate keeps'` — exact real-project lineage and proposal-identity invalidation passed.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'public Design Program workflow|current WIP and Design evidence'` — shared summary, exact Run inspection, and Candidate-only read action passed.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern 'verified commissioned'` — Studio API returned the same authority and read-only action.
- `bun run inm validate examples/memory-fab --json` — current commissioned Blueprint validated with no diagnostics.
- `bun run inm design examples/memory-fab --program inspection-supply-path --json` — reported Run `966127dd542d…` as `0 current / 1 commissioned / 4 historical / 4 invalid`, with Candidate `inspection-supply-path-966127dd` and receipt `1dc38090f122…`.
- Studio `/memory-fab/designs/inspection-supply-path/runs/966127dd542d…` — visually confirmed the same counts, disabled new-run control, exact verified Candidate panel, and no continuation or promotion actions.

## Progress log

- 2026-07-30 — Plan created after tracing the current cross-surface identity split and the exact memory-fab Candidate/review chain.
- 2026-07-30 — Core V13, CLI, and Studio now share one verified commissioned-lineage projection. The redundant `6f1f260672f1…` replay was removed and the full acceptance audit passed.

## Completion

Completed on 2026-07-30. Commissioned lineage is one Core invariant across Workbench, CLI, and Studio; the redundant replay is absent; and all executable and visual checkpoints pass.
