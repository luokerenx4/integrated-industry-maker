# Cadence-control evidence parity

- Status: `active`
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

- [ ] Every Benchmark case contains required baseline and candidate `cadenceControl.devices` records with authored policy fields plus measured `normalJobs` and `recoveryJobs`; an uncontrolled Blueprint emits an empty map.
- [ ] Immutable Design loading rejects evidence whose seed or successful iteration Benchmark evaluation lacks the strict cadence-control metric contract.
- [ ] Benchmark machine JSON, human CLI, Studio Experiment, and Studio Design expose the same per-case device activation evidence without re-simulating or reinterpreting it.
- [ ] A real memory-fab locked Benchmark and current Design result prove that the adaptive ALD policy's recovery activation is inspectable across Agent and human surfaces.
- [ ] Focused tests and `bun run test` pass, and browser verification covers the Experiment and Design projections.

## Work

- [x] Audit the ordinary simulation metric, Benchmark snapshot boundary, Design artifact embedding, CLI rendering, and Studio projections.
- [x] Add the strict Core snapshot and immutable Design validation contract with focused tests.
- [x] Add shared human CLI and Studio Experiment/Design projections with parity tests.
- [x] Regenerate and inspect current memory-fab evidence through the public CLI loop.
- [ ] Run full automated and browser verification, then complete the acceptance audit.

## Findings and decisions

- 2026-07-24 — The evaluator already owns the complete deterministic policy-and-count record; Benchmark must preserve that record rather than derive activation from score or event summaries.
- 2026-07-24 — Cadence evidence belongs in the per-case metric snapshot, not `BlueprintMetricDelta`: device identity and policy configuration are categorical, while the measured counts can be compared directly by consumers.
- 2026-07-24 — The field is required with `devices: {}` for no configured control. Optional absence would make new and stale evidence indistinguishable and violate the pre-alpha strict-format rule.
- 2026-07-24 — Design Run manifest V3 is the only active format. V2 siblings remain visible as invalid evidence but cannot be ranked, reopened, continued, or promoted.
- 2026-07-24 — Current memory-fab V3 run `f22de3ca17b6ab6824e69ed684e987f74c502277f7fbeb4dba1da10be5a7ea21` records `5 qualified / 7 agile-pulse` jobs in the first three locked cases and `8 / 4` in both interruption cases. The candidate remains an honest `BRANCH` because steady production regresses.

## Verification

- Pending.

## Progress log

- 2026-07-24 — Plan created and the cross-surface evidence loss was traced to `BlueprintMetricSnapshot`.
- 2026-07-24 — Core, CLI, Studio, strict V3 validation, focused tests, and one real current memory-fab evidence artifact are implemented.

## Completion

Pending.
