# Lazy input-starvation evidence

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/work-center-dispatch]], [[plans/structural-input-starvation-evidence]], and [[plans/compiled-local-dispatch-topology]].

## Outcome

Compare an open Device input-starvation interval directly against exact live simulator values and materialize a new immutable shortage/supply evidence tree only when the evidence actually changes.

## Context

[[plans/structural-input-starvation-evidence]] removed JSON serialization and textual signatures, but the runtime still constructs a complete `MaterialInputShortage[]` tree before it can perform that structural comparison. Most repeated evaluations observe the same open starvation interval and discard the newly allocated tree.

The current five-case profile attributes `465` inclusive samples to `setProcessInputStarvation()`. `processInputShortages()` owns `378`, of which `374` sit under native `flatMap`/flatten callbacks; the subsequent equality check costs another `52`.

Shortage topology is immutable within one compiled simulation: Process inputs, incoming connection order, source Device/Buffer, and loader/unloader identities cannot change. Resident eligible quantity, source and endpoint status, matching in-flight quantity, and immediate blocking state remain live. Core can prepare the former once, compare the latter directly with the retained immutable evidence, and invoke the existing materializer only for a new, changed, or restored interval.

## Scope

### In scope

- One simulation-local prepared shortage descriptor per compiled Device Process plan.
- Stable Buffer/Resource order and immediate incoming supply descriptors.
- Allocation-free live comparison against an open same-Process starvation interval.
- Imperative one-pass materialization only when evidence is new or changed.
- Exact multi-input, treatment-level, tracked-lot, in-flight, endpoint-status, blocking-state, event, interval, Evaluation, and Trace behavior.
- Current memory-fab five-case, CLI, Studio, and repository verification.

### Out of scope

- Cached live shortages, mutation epochs, dirty flags, or invalidation graphs.
- Coarser evidence, debounce, polling changes, skipped Device evaluation, or recursive root-cause inference.
- Changing input readiness, Process selection, status, event ordering, or loss attribution.
- Compatibility retention for the superseded allocate-then-compare implementation.

## Acceptance

- [x] An unchanged open interval constructs no new shortage or supply object tree.
- [x] New, changed, and restored intervals preserve exact ordered evidence and close/open semantics.
- [x] Prepared topology contains no live quantity or status and needs no invalidation.
- [x] The measured shortage-evidence boundary and warm five-case runtime materially improve.
- [x] Identical inputs retain exact event counts, Evaluation hashes, complete Simulation Trace hashes, Benchmark results, and Candidate identity.
- [x] Focused, fast, CLI, Studio, and full repository verification pass before completion.

## Work

- [x] Capture the current profile, contract, and repeated warm five-case baseline.
- [x] Prepare immutable shortage/supply topology.
- [x] Implement live comparison and on-change materialization.
- [x] Prove exact interval/evidence identity and re-profile.
- [x] Complete CLI/Studio/full verification, commit, and push.

## Findings and decisions

- 2026-07-29 — `setProcessInputStarvation()` owns `465` inclusive samples in the current `500us` five-case profile; `processInputShortages()` owns `378` and structural comparison `52`.
- 2026-07-29 — The retained `inputStarvations` entry already owns the last immutable event tree. Comparing live primitives against it does not create a second state authority.
- 2026-07-29 — A same-Process topology is immutable for one `runUntil`; exact dynamic comparison therefore needs only available quantity, in-flight quantity, Device/endpoint status, and derived immediate supply state.
- 2026-07-29 — Fifteen warm current-code evaluations average `441.37ms`, median `434.08ms`, range `382.47–535.93ms`.
- 2026-07-29 — Prepared descriptors contain only Process input requirements, stable connection references, and endpoint identities. Every quantity, status, transit blocker, and derived supply state remains a live read.
- 2026-07-29 — The unchanged-interval path compares live primitives directly with the retained event tree. The profile attributes only `11` samples to the materializer, confirming that it is no longer the repeated comparison path.
- 2026-07-29 — Fifteen paired warm evaluations average `397.29ms`, median `391.86ms`, range `374.98–433.77ms`: `9.99%` faster than the `441.37ms` baseline with exact event, Evaluation, and Trace identities.

## Verification

- `/tmp/inm-lazy-input-starvation-evidence.before.json` — fifteen current-code evaluations and exact identity baseline.
- `/tmp/inm-compiled-contract-commitment-sources.after-profile.PsnHbw/five.cpuprofile` — current committed five-case profile.
- `/tmp/inm-lazy-input-starvation-evidence.after.json` — fifteen changed-code evaluations; exact paired event counts, Evaluation hashes, and complete Simulation Trace hashes.
- `/tmp/inm-lazy-input-starvation-evidence.after-profile.jZioCu/five.cpuprofile` — `setProcessInputStarvation()` falls from `465` to `289` inclusive samples (`37.85%`); the on-change materializer owns `11` samples and the superseded `flatMap`/flatten path is absent.
- `bun test packages/inm-core/src/fab-loss-analysis.test.ts --test-name-pattern 'runtime material starvation records multi-input shortages' --timeout 30000` — one focused multi-input/change/restore/attribution test and `29` expectations pass.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'identity-preserving wafer lots|identical inputs and seed' --timeout 30000` — two exact deterministic identity tests and `179` expectations pass.
- `bun run check:fast` — documentation links, TypeScript, `30` tests, and `179` expectations pass.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — five locked cases and `2,400,000` ticks complete with Candidate `35ef45f0…`, `KEEP`, and score delta `117.75790545277778`.
- Studio operation `ms500bkb-33c021cc-37ce-4e56-8b9c-abf0a048d32d` on the source-current server completes `10/10` evaluations and `2,400,000` ticks in `1435.15ms` with the same Candidate, `KEEP`, and score delta.
- `bun run test` — `286` tests, `3681` expectations, and all eight `examples/ironworks` fixtures pass.

## Progress log

- 2026-07-29 — Activated against clean `main` at `002d992` after the latest profile exposed repeated throwaway evidence construction.
- 2026-07-29 — Completed after exact live comparison removed repeated evidence-tree allocation while preserving every deterministic industrial result.

## Completion

The simulator now prepares only immutable shortage topology, compares exact live values directly against the retained starvation event, and allocates a new evidence tree only for a new or changed interval. This reduces the warm five-case evaluation by `9.99%` without weakening the observable contract used by humans, Agents, CLI, or Studio.
