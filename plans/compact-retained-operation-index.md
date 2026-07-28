# Compact retained operation index

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/operation-workbench]], [[docs/design/development-operations]], and [[plans/low-friction-experiment-loop]].

## Outcome

Let Studio list and reconnect retained operations from bounded lightweight lifecycle records without reading every dense Benchmark, Candidate, or Design result.

## Context

The current `.inm/operations/<id>.json` snapshot combines lifecycle state, progress history, and the complete industrial result. The memory-fab retained set occupies roughly `9–13MB`; individual Benchmark snapshots are about `360KB` and Design snapshots approach `2MB`. Listing recent operations reads and parses every complete snapshot only to discard `progressLog` and `result`.

The current live cost is measurable but secondary: listing sixteen summaries takes roughly `18–25ms`, below the synchronous simulation stall addressed by [[plans/responsive-studio-experiment-execution]]. The coupling will scale with denser evidence and should be removed before operation retention or result density grows.

## Acceptance

- [x] Lifecycle listing reads bounded summary/state records without deserializing dense results.
- [x] Exact operation reads still recover progress history and complete results after restart.
- [x] Atomic completion never exposes a summary that claims an unavailable result.
- [x] Retention removes every component of an expired operation.
- [x] Existing pre-release combined snapshots are removed rather than supported through a compatibility path.
- [x] Memory-fab retained-list bytes, parse time, reconnect behavior, and full verification are recorded.

## Work

- [x] Design the state/progress/result persistence boundary.
- [x] Replace the combined snapshot format and remove its read/write path.
- [x] Verify active polling, completion, interruption, restart, and pruning.
- [x] Complete real memory-fab and repository verification.

## Findings and decisions

- 2026-07-29 — Registered separately because measured retained-list parsing is not the primary experiment interaction stall.
- 2026-07-29 — The current memory-fab directory contains `19` combined snapshots occupying `5,136KB`; the public list response is only `19,428` bytes, yet listing reads every dense file and takes `34.8ms` cold and `10.1–14.7ms` warm.
- 2026-07-29 — Each operation will own one directory containing `state.json`, `progress.json`, and, only after successful completion, `result.json`. Listing reads `state.json` only. Completion writes the dense result before atomically publishing a state with `resultAvailable: true`.
- 2026-07-29 — Root-level pre-release combined JSON snapshots are deleted when the strict store is opened. They are rebuildable operational recovery state, not industrial evidence, and no migration or dual-read path will be retained.
- 2026-07-29 — Runtime list projection uses only the last durably committed summary. Exact polling may expose newer in-process progress, but terminal `resultAvailable` cannot become visible until both the dense result and completed state have committed.
- 2026-07-29 — Sixteen fresh one-case memory-fab operations occupy `24,609` state bytes, `47,894` progress bytes, and `834,719` result bytes. The `19,681`-byte list response contains no progress log or result field.
- 2026-07-29 — New-format warm list latency is `2.761–5.218ms`; a fresh Studio process lists all sixteen in `3.948ms` and reopens one exact `34,122`-byte operation in `2.007ms` with all `4/4` progress events and the complete `DISCARD` result.
- 2026-07-29 — A seventeenth real operation prunes the oldest complete directory, leaving exactly sixteen current completed/result-available entries.
- 2026-07-29 — Full verification exposed a transient timeout in a Core operation test that copied local `runs/` and `.inm/` only to delete them. Temporary project creation now excludes those rebuildable directories at the copy boundary; five focused reruns complete in `0.40–0.58s`.

## Verification

- Focused registry suite — `8` tests and `26` expectations pass, including state-only listing with deliberately invalid dense files, completion publication order, strict legacy deletion, restart interruption, cancellation, and whole-directory retention.
- Focused Studio API suite — `13` tests and `1,315` expectations pass.
- `bun run check:fast` — documentation, every TypeScript project, and `34` tests with `202` expectations pass.
- Real memory-fab evidence: `/tmp/inm-operation-new-records.json`, `/tmp/inm-operation-list-before.json`, `/tmp/inm-operation-list-after.json`, `/tmp/inm-operation-list-after-restart.json`, and `/tmp/inm-operation-exact-after-restart.json`.
- Browser QA — a fresh tab after Studio restart reopens the newest retained experiment with `EVALUATED · ISOLATED WORKER`, `2/2` case evaluations, complete `DISCARD` evidence, and no visible error.
- `bun run test` — documentation, all TypeScript projects, `296` tests with `3,666` expectations, and all `8` Ironworks project fixtures pass.

## Completion

Completed. Studio operation discovery now scales with sixteen lightweight committed state records rather than retained industrial result size, while exact reconnect, explicit cancellation, restart interruption, atomic result publication, and whole-operation retention remain intact.
