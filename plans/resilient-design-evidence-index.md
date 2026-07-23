# Keep Design Programs usable beside invalid local evidence

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/design-programs]], [[docs/design/operator-workbench]], and [[docs/CLI]].

## Outcome

Humans and Agents can inspect and run a project-local Design Program even when unrelated historical Design Run directories no longer satisfy the current strict evidence contract; valid immutable runs remain rankable, invalid artifacts are explicitly indexed as excluded evidence, and selecting an invalid run still fails closed.

## Context

The commissioned memory fab now exposes exact yield-origin contributors, but its optimization surface is unavailable. `inm design examples/memory-fab --program commissioned-dram-fab --json` and Studio `/memory-fab/designs/commissioned-dram-fab` both fail on the first ignored historical run whose Candidate evidence predates the current strict contract.

The local evidence directory currently contains one valid and seven invalid commissioned runs, plus two valid and two invalid greenfield runs. `listDesignRuns` loads serially and lets one invalid sibling abort the whole Program. This is neither useful strictness nor compatibility: explicit reopen must reject invalid evidence, but discovery should quarantine it so new evidence can still be created under the current contract.

## Scope

### In scope

- Add one Core-owned Design evidence index that returns valid run summaries and structured invalid-run issues separately.
- Keep `loadDesignRun` strict for direct access, continuation, promotion, and immutable lineage verification.
- Project invalid-evidence counts and exact ids/codes/messages through CLI JSON/human output and Studio without parsing thrown prose.
- Prove that a Design Program can create and index a fresh valid run while invalid sibling directories remain present.

### Out of scope

- Migrating, rewriting, rehashing, or deleting historical Design Runs.
- Treating invalid evidence as compatible, rankable, continuable, or promotable.
- Automatically launching a long Design search from Project Overview.
- Changing the locked Benchmark, proposal provider, current factory, or Candidate acceptance rules.

## Acceptance

- [x] `commissioned-dram-fab` loads with one valid ranked run and seven explicitly excluded invalid runs in the pre-change local evidence set.
- [x] CLI human and JSON output and Studio show the same valid/invalid evidence index while leaving the new-run operation available.
- [x] Directly opening an invalid result hash still returns `design.invalid-run`; invalid evidence never enters ranking, continuation, or promotion.
- [x] A fresh bounded commissioned Design Run can execute, pass strict reload, and appear beside—without being blocked by—the invalid siblings.
- [x] Core, CLI, Studio, docs, browser acceptance, and full repository regression pass without changing checked-in run hashes.

## Work

- [x] Define the shared valid/invalid Design evidence index and strictness boundary in Core.
- [x] Update CLI and Studio APIs/presentation to consume the same structured index.
- [x] Add corrupt-sibling and current memory-fab regression fixtures.
- [x] Update long-lived Design and operator documentation.
- [x] Verify current evidence, run a fresh bounded search, complete browser acceptance, and run the full repository suite.

## Findings and decisions

- 2026-07-24 — Current local commissioned evidence contains one valid run (`83f7355c1122…`) and seven invalid siblings; greenfield evidence contains two valid and two invalid siblings.
- 2026-07-24 — Discovery and authority are separate boundaries: the index may report invalid evidence, but only strict `loadDesignRun` output can authorize ranking, continuation, or promotion.
- 2026-07-24 — Historical evidence is not migrated in pre-alpha. The product must stay operable beside it and explain its exclusion.
- 2026-07-24 — Fresh run `9381da55bb6b…` strictly reopens beside all seven excluded commissioned siblings. Its driver receives the exact two quality-origin contributors, proposes `maintenance:inspection-jobs-4`, and honestly rejects it because the zero-regression guardrail catches a `facility-interruption` regression.
- 2026-07-24 — The same browser route moves from a fatal Program-load error to `2 VALID · 7 EXCLUDED`; the new-run control remains enabled and excluded details are collapsed until requested.

## Verification

- `bun run test` — 212 package tests and 1,806 assertions passed; all checked-in demonstration runs replayed to their recorded result hashes; all eight Ironworks project tests passed.
- `bun run typecheck` — Core, CLI, Studio, and both example TypeScript asset packages passed.
- `bun run docs:check` — all 629 documentation double-links resolve.
- `git diff --check` — passed.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --json` — returns a successful Program brief and exact new-run action with `1` valid and `7` invalid pre-run evidence entries.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --section runs --json` — returns separate structured `runs` and `invalidRuns` arrays with exact ids, codes, paths, and messages.
- Direct open of invalid `1d2a716f1f50…` — exits non-zero with `design.invalid-run`.
- Fresh ignored run `9381da55bb6b…` — executes one current-contract Candidate, strictly reopens, consumes both quality-origin contributors, records the guarded rejection, and increases the authoritative local index to `2` valid while all `7` invalid siblings remain excluded.
- Browser acceptance at `/memory-fab/designs/commissioned-dram-fab` — renders `2 VALID · 7 EXCLUDED`, keeps `NEW RUN · 1 CANDIDATE` enabled, exposes all seven invalid details on demand, and has no Program-load failure.

## Progress log

- 2026-07-24 — Plan activated after both CLI and Studio reproduced `design.invalid-run` while opening the commissioned optimization Program.
- 2026-07-24 — Core index, CLI/Studio parity, strict invalid-open regression, fresh commissioned run, and long-lived documentation are implemented; full-suite completion audit remains.
- 2026-07-24 — Full regression, final-state browser acceptance, docs/type validation, and strict current-memory-fab execution passed; plan completed.

## Completion

Design discovery no longer confuses one invalid sibling with failure of the Program itself. Core owns one valid/invalid evidence index; CLI and Studio project it consistently; invalid artifacts remain visible but non-authoritative; and new strict memory-fab optimization runs can proceed without migrating or deleting historical evidence.
