# Cadence-control evidence parity

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/production-modes]], [[docs/design/coding-agent-optimization]], [[docs/design/design-programs]], [[docs/design/experiment-workbench]]

## Outcome

Every locked Benchmark and immutable Design result preserves the exact authored downstream-starvation cadence policy and its measured normal/recovery job split per case, with the same causal evidence visible to CLI Agents and Studio operators.

## Context

Ordinary simulation already emits deterministic `FactoryMetrics.cadenceControl` evidence and exposes it through CLI and Studio Run views. `BlueprintMetricSnapshot` currently drops that evidence when projecting a simulation into a locked Benchmark, so a Benchmark or Design result can show a score change without proving whether the candidate's control policy activated, stayed dormant, or selected recovery continuously. The memory-fab's current adaptive ALD branch therefore cannot be interpreted honestly from its locked evidence alone.

This is an early strict-format project. Existing immutable Design artifacts that do not satisfy the new evidence contract must be excluded and regenerated; no migration, optional fallback, or legacy alias will be added.

## Scope

### In scope

- Preserve a deterministic, required cadence-control device map in every `BlueprintMetricSnapshot`.
- Validate the required map when loading immutable Design evidence.
- Expose baseline/candidate activation counts and policy boundary in human Benchmark CLI output and Studio Experiment results.
- Expose the selected Design result's seed/leader cadence evidence and per-iteration candidate activation evidence in Studio.
- Regenerate current memory-fab Design evidence under the strict contract when the serialized result changes.

### Out of scope

- Adding another control policy or changing cadence-control simulation semantics.
- Generalizing all future controllers behind a speculative common evidence abstraction.
- Adding compatibility parsing or migrating pre-contract Design artifacts.
- Changing Benchmark acceptance gates or treating activation count as a score.

## Acceptance

- [x] Every Benchmark case contains required baseline and candidate `cadenceControl.devices` records with authored policy fields plus measured `normalJobs` and `recoveryJobs`; an uncontrolled Blueprint emits an empty map.
- [x] Immutable Design loading rejects evidence whose seed or successful iteration Benchmark evaluation lacks the strict cadence-control metric contract.
- [x] Benchmark machine JSON, human CLI, Studio Experiment, and Studio Design expose the same per-case device activation evidence without re-simulating or reinterpreting it.
- [x] A real memory-fab locked Benchmark and current Design result prove that the adaptive ALD policy's recovery activation is inspectable across Agent and human surfaces.
- [x] Focused tests and `bun run test` pass, and browser verification covers the Experiment and Design projections.

## Work

- [x] Audit the ordinary simulation metric, Benchmark snapshot boundary, Design artifact embedding, CLI rendering, and Studio projections.
- [x] Add the strict Core snapshot and immutable Design validation contract with focused tests.
- [x] Add shared human CLI and Studio Experiment/Design projections with parity tests.
- [x] Regenerate and inspect current memory-fab evidence through the public CLI loop.
- [x] Run full automated and browser verification, then complete the acceptance audit.

## Findings and decisions

- 2026-07-24 — The evaluator already owns the complete deterministic policy-and-count record; Benchmark must preserve that record rather than derive activation from score or event summaries.
- 2026-07-24 — Cadence evidence belongs in the per-case metric snapshot, not `BlueprintMetricDelta`: device identity and policy configuration are categorical, while the measured counts can be compared directly by consumers.
- 2026-07-24 — The field is required with `devices: {}` for no configured control. Optional absence would make new and stale evidence indistinguishable and violate the pre-alpha strict-format rule.
- 2026-07-24 — Design Run manifest V3 is the only active format. V2 siblings remain visible as invalid evidence but cannot be ranked, reopened, continued, or promoted.
- 2026-07-24 — Current memory-fab V3 run `f22de3ca17b6ab6824e69ed684e987f74c502277f7fbeb4dba1da10be5a7ea21` records `5 qualified / 7 agile-pulse` jobs in the first three locked cases and `8 / 4` in both interruption cases. The candidate remains an honest `BRANCH` because steady production regresses.

## Verification

- `bun run inm validate examples/memory-fab` — current 62-Device, 17-Connection factory is valid.
- `bun run inm analyze examples/memory-fab --json` — public read-only analysis completed against Blueprint `6ed24bc31d81…`.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --section cases --json` — every locked case exposes required empty baseline/candidate cadence maps for the current uncontrolled leader.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 1 --progress human` — created V3 result `f22de3ca17b6…`; human output reports all five exact adaptive activation splits.
- Focused Core, Design, CLI, and Studio cadence tests — 4 passed, 0 failed.
- `bun run docs:check` — 745 double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, and both example asset packages pass.
- `bun run test` — 233 tests passed with 1,949 assertions, followed by all 8 Ironworks fixtures.
- Browser — the locked Greenfield Experiment completed with a rendered result and no console warnings/errors; the exact V3 Design deep link displayed the uncontrolled final leader and expanded `deposition-1` candidate evidence (`5 NORMAL · 7 RECOVERY`, `qualified / agile-pulse`, boundary `1`, exact downstream Connection) with no console warnings/errors.

## Progress log

- 2026-07-24 — Plan created and the cross-surface evidence loss was traced to `BlueprintMetricSnapshot`.
- 2026-07-24 — Core, CLI, Studio, strict V3 validation, focused tests, and one real current memory-fab evidence artifact are implemented.
- 2026-07-24 — Full regression and browser acceptance passed; plan completed.

## Completion

Shipped in commit `689227c` (`feat: preserve cadence control evidence`). Benchmark snapshots now retain evaluator-owned cadence policy and activation counts, Design Run V3 fails closed on missing evidence, CLI and Studio project the same record, and the memory-fab has one current continuable V3 result. No required follow-up from this plan is deferred.
