# Evidence-backed bounded loss disposition

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/design/fab-loss-attribution]], [[docs/design/agent-cli-contract]], and [[docs/design/studio-debugger]].

## Outcome

When current immutable Design evidence proves that every eligible intervention in one exact causal loss target improves the physical metric but is rejected by the current locked industrial objective, the shared Workbench preserves that route as bounded deferred evidence and advances humans and Agents to the next ranked actionable diagnostic instead of indefinitely recommending the same exhausted portfolio.

## Context

The current memory-fab run ranks `device:inspection-1:material-input-shortage.starvationTicks` first. Focused V8 Design Run `26972cba3dccdc953c0b0845ac33d12143ef7b3ce6dddf427cba40386d1e0e4d` evaluates six distinct project-local interventions. Every Candidate reduces the exact contributor from the same measured `59,584` ticks; all six are rejected by locked score, case, or hard-outcome authority; the seed remains unchanged; and the only frontier node is exhausted.

Workbench currently treats any exhausted aligned Program as universal authority for the first warning. It therefore keeps telling both the human and Agent to expand the inspection portfolio even though the current evidence says the bounded route has negative marginal value. The second ranked issue, verified yield and quality loss, never becomes the handoff.

A disposition must not claim that the physical loss disappeared or can never matter. It is a hash-current decision about one exact contributor, metric, Program, Benchmark, and observed value. It must vanish automatically when those inputs or the diagnostic evidence change.

## Scope

### In scope

- Derive one strict bounded-deferred disposition from a current exhausted immutable Design Run only when every evaluated Candidate shares and improves one exact causal target, every Candidate is rejected, the seed remains leader, and the frontier is fully exhausted.
- Bind applicability to the current Program/Benchmark identity, driver selection and hashes, current compatible-run bucket/contributor/metric, and exact before value.
- Preserve disposition evidence in the shared Workbench contract while leaving the underlying diagnostic and physical loss visible.
- Exclude dispositioned diagnostics from the active next-action queue and choose a Program whose current evidence actually addresses the selected loss, with a missing aligned Program as the generic fallback.
- Project identical evidence through CLI JSON/human output and Studio, including a route back to the source Design Run.
- Advance the checked-in memory-fab next action from inspection starvation to `fab-loss.yield-quality`.

### Out of scope

- Marking the physical loss solved, deleting its diagnostic, or weakening its score.
- A manual ignore/snooze flag, timestamps, mutable acknowledgement state, or compatibility migration.
- Treating a mixed-target, non-causal, partially improved, accepted, branched, continuable, historical, invalid, or changed-input run as a disposition.
- Automatically running the next Design Program or mutating the Blueprint.
- Solving the yield-quality intervention itself; that will be a separately indexed follow-up.

## Acceptance

- [x] Core derives a disposition only from exact current immutable evidence satisfying every strict causal, rejection, unchanged-seed, and exhaustion condition.
- [x] Any driver hash/selection, current contributor value, Program/Benchmark identity, target, decision, improvement, frontier, or currentness mismatch removes the disposition.
- [x] The physical input-starvation diagnostic remains visible, but it is labeled bounded deferred and does not remain the next action.
- [x] Memory-fab next action advances to a missing aligned Program for `fab-loss.yield-quality`, with exact CLI argv and Studio route shared unchanged.
- [x] CLI summary/full/human output and Studio show the same source Program/Run, exact target/value, attempt counts, decision bases, and invalidation boundary.
- [x] Core, CLI, Studio, documentation, project fixtures, browser acceptance, and full repository regression pass without changing industrial hashes.

## Work

- [x] Audit current diagnostic, Design evidence, and next-action selection boundaries.
- [x] Define and derive the strict Workbench loss-disposition contract.
- [x] Make next-action Program selection diagnostic-aware and skip only exactly dispositioned diagnostics.
- [x] Update CLI and Studio projections plus focused regression tests.
- [x] Update lasting design documentation and the memory-fab handoff narrative.
- [x] Run strict mismatch tests, full regression, browser acceptance, and completion audit.

## Findings and decisions

- 2026-07-25 — The current Workbench chooses the highest evidence-state aligned Program globally, so focused input-starvation exhaustion is incorrectly reused as authority for unrelated later warnings.
- 2026-07-25 — The current loss profile exposes the same contributor id and `starvationTicks: 59,584` value recorded as `before` in all six focused iterations. This supplies an exact observed-value applicability guard rather than a bucket-name heuristic.
- 2026-07-25 — The Design manifest driver pins engine plus resource/process/route/device catalogs, World, Blueprint, Scenario, and Objective hashes. Disposition applicability will require exact equality with the effective Workbench selection and hashes.
- 2026-07-25 — `bounded-deferred` means “do not spend the next decision on this exact target under unchanged authority,” not “the loss is gone” or “no future portfolio may revisit it.”
- 2026-07-25 — Design normalizes the authored seed revision before driver compilation. Applicability therefore binds the current authored Blueprint hash through the seed source and promotion base, binds the normalized seed hash as the driver Blueprint hash, and requires every other driver hash to equal the current project hash.
- 2026-07-25 — Program selection is diagnostic-aware: a current authority wins only for a loss its immutable iterations addressed; a missing aligned Program remains the fallback for a different loss.

## Verification

- `bun test packages/inm-core/src/workbench.test.ts --max-concurrency=1` — 9 tests and 77 assertions passed, including exact current derivation, diagnostic-aware progression, and Program/Benchmark/selection/hash/value/target/decision/improvement/frontier mismatch expiry.
- Focused public CLI regression — `public inspect gives Agents and humans the same bounded loss disposition and yield handoff` passed with exact summary, `dispositions` section, human evidence, and next-action parity.
- Browser acceptance at `/memory-fab` — recommendation opens `commissioned-dram-fab`, the bounded evidence route opens exact Run `c7fbffa6…`, active diagnostics begin at `fab-loss.yield-quality`, rank-one input starvation remains visible and labeled, and console errors are empty.
- `bun run test` — documentation links and all TypeScript projects passed; 242 Core/CLI/Studio tests with 2,047 assertions passed; all eight Ironworks project scenarios passed.
- `git diff -- examples` is empty, so no World, Blueprint, Scenario, Objective, catalog, run, Design, Benchmark, or other industrial fixture input changed.

## Progress log

- 2026-07-25 — Plan activated after current CLI evidence and strict focused Design manifest audit.
- 2026-07-25 — Core V8 contract, CLI `dispositions` section, human output, Studio bounded-evidence panel, active-queue filtering, loss-chain label, strict mismatch tests, and lasting documentation implemented.
- 2026-07-25 — Browser acceptance confirmed yield-quality recommendation, exact disposition evidence, active queue beginning at yield-quality, still-visible rank-one input-starvation bucket, source-run route, next-Program route, and zero console errors.
- 2026-07-25 — Full repository regression passed: 242 tests, 2,047 assertions, and eight Ironworks project scenarios.

## Completion

Completed. The shared V8 Workbench now preserves the exhausted inspection target as exact automatically expiring decision evidence, keeps its physical loss visible, and advances both human and Agent handoffs to verified yield and quality without mutating any industrial input.
