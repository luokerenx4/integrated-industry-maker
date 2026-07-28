# Responsive Studio experiment execution

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/development-operations]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]], [[plans/parallel-benchmark-case-execution]], and [[plans/reusable-benchmark-worker-pool]].

## Outcome

Keep Studio HTTP, polling, navigation, and cancellation responsive while every locked Benchmark simulation executes outside the server event loop, without imposing Worker startup on the ordinary CLI small-case path or changing any industrial result.

## Context

The current execution policy equates “fewer than three cases” with “safe to run inline.” That is a reasonable CLI wall-time tradeoff but a wrong Studio scheduling decision. A warm memory-fab `equipment-energy-research` operation completes in roughly `0.37–0.48s`, yet one concurrent Studio request stalls for `255–286ms` because its single candidate simulation runs synchronously on the HTTP event loop. The UI therefore feels frozen even though the operation is short.

Five-case work already uses isolated Workers in parallel. The missing abstraction is not another optimization algorithm; it is a host policy that distinguishes sequential foreground execution from responsive background execution. Studio needs one isolated Worker for one or two cases and the existing bounded parallel pool for three or more. Cold baseline evaluation must use the same boundary rather than freezing the first run before candidate work begins.

## Scope

### In scope

- An explicit responsive-background case-execution request resolved to one isolated Worker for one or two cases and bounded parallel Workers for larger sets.
- One reusable executor shared across uncached baseline and candidate waves in an evaluation or Design operation.
- Cold baseline cache misses evaluated outside the Studio event loop.
- Studio Benchmark, Candidate preview/apply, Design run, and Design continuation selecting responsive-background execution.
- Exact progress metadata distinguishing `sequential`, `isolated`, and `parallel` execution.
- Cancellation, failure reset, worker reuse, trace identity, manifest ordering, immutable evidence, and CLI defaults preserved.
- Immediate before/after memory-fab event-loop latency and operation-wall measurements.

### Out of scope

- Changing Benchmark cases, scores, acceptance, simulation rules, or memory-fab industrial authority.
- A global or cross-operation Worker pool.
- Moving ordinary CLI one/two-case work to a Worker by default.
- Splitting retained operation summaries from dense results; tracked separately by [[plans/compact-retained-operation-index]].
- Backward compatibility with the pre-release two-mode execution metadata.

## Acceptance

- [x] `background` resolves to `isolated ×1` for one/two cases and bounded `parallel` for three or more; CLI `auto` retains foreground sequential small-case execution.
- [x] Uncached baseline and candidate simulations use the same operation-owned executor and the second wave reports Worker reuse.
- [x] Studio selects background execution for Benchmark, Candidate preview/apply, Design run, and continuation.
- [x] A warm one-case memory-fab Studio experiment no longer produces the recorded 255–286ms HTTP request stall.
- [x] The one-case and five-case Benchmark results, complete traces, hashes, verdicts, ticks, and progress order remain exact.
- [x] Cooperative cancellation writes no partial Candidate review, Blueprint, or Design artifact.
- [x] CLI, Studio, documentation, focused tests, browser QA, and full repository verification pass.

## Work

- [x] Measure the current CLI and Studio single/five-case boundaries.
- [x] Identify inline single-case simulation as the primary UI stall.
- [x] Add isolated/background execution semantics and reusable baseline execution.
- [x] Route every Studio evaluation surface through responsive background policy.
- [x] Prove event-loop responsiveness and exact industrial parity.
- [x] Complete browser/full verification, commit, and push.

## Findings and decisions

- 2026-07-29 — Three warm CLI `equipment-energy-research` runs take `0.56–0.60s` wall and `489.57–512.41ms` operation time; three `greenfield-dram-design` runs take `1.35–1.37s` wall and `1099.88–1165.11ms` operation time.
- 2026-07-29 — Studio reports the same work at `469.08ms` for one case and `1228.10ms` for five cases. First progress arrives in `48–70ms`; 250ms polling is not the primary delay.
- 2026-07-29 — Five repeated one-case Studio operations produce a maximum concurrent request latency of `255.29–286.01ms`, while ordinary request p95 remains below `0.57ms`. The synchronous candidate simulation is the long event-loop task.
- 2026-07-29 — Retained memory-fab operations currently occupy `9–13MB`; listing 16 summaries parses the dense snapshots in `18–25ms`. This is real lifecycle/result coupling but not the dominant run-time stall, so it is indexed separately.
- 2026-07-29 — The background request is a host scheduling policy, not a new industrial evaluator. It resolves to `isolated ×1` below three cases and the existing bounded `parallel` set otherwise; CLI `auto` remains unchanged.
- 2026-07-29 — Baseline preparation now shares the operation-owned executor with Candidate/seed waves. A cold one-case live operation reports cold baseline Worker startup followed by warm Candidate reuse; cache hits still avoid baseline simulation entirely.
- 2026-07-29 — A direct old-source worktree at `605d9f9` reproduces warm one-case health stalls of `302.50–372.38ms`. Current live Studio reduces the identical five-run maximum to `1.05–6.70ms`, with p95 below `3.46ms`.
- 2026-07-29 — Isolation raises warm one-case operation wall time from roughly `0.39–0.46s` to `0.52–0.59s`; the new Worker itself starts in `17–19ms`. This bounded cost is accepted to remove the server/UI long task, while the CLI retains the faster inline choice.

## Verification

- Before measurements: `/tmp/inm-experiment-latency.pSpmkK`.
- Old-source live boundary (`605d9f9`, detached port `4276`) — five warm single-case operations reproduce `302.50–372.38ms` maximum health latency.
- Current live warm boundary — five operations complete in `516.20–586.95ms` operation time with `1.05–6.70ms` maximum health latency and `isolated ×1` progress.
- Current cold temporary-project boundary — baseline miss plus Candidate completes in `1012.20ms`; maximum health latency is `15.19ms`, p95 `0.73ms`, baseline reports cold Worker and Candidate reports warm reuse.
- Exact one-case parity — CLI sequential and Studio isolated results both hash to `2605fc8b76be90009097e52cec709ae5cbaf9c16217e7dc80dff18a3863cba39`, verdict `DISCARD`, over `720,000` ticks.
- Exact five-case parity — CLI and Studio parallel results both hash to `31c8437f9b5701253e287a69a6db161696ca73b16d695decfb54a37b48aa900d`, verdict `KEEP`, over `2,400,000` ticks.
- Focused Core execution suite — `11` tests and `72` expectations pass, including cold baseline/candidate trace parity, exact progress order, cancellation, failure reset, and isolated reuse.
- Focused Studio API — one-case Experiment/preview reports `isolated ×1`; five-case Design reports bounded `parallel`; both integration tests pass with `883` total expectations.
- `bun run check:fast` — `31` tests and `187` expectations pass after documentation and all TypeScript projects.
- Browser QA — the live Experiment Workbench starts, advances, completes, retains, and reopens the one-case operation with `ISOLATED WORKER`, cold-start timing, exact verdict, and no visible error.
- `bun run test` — documentation, all TypeScript projects, `293` tests with `3,807` expectations, and all `8` Ironworks project fixtures pass.

## Progress log

- 2026-07-29 — Activated after completing project-discovered Studio lifecycle and measuring the next operator-visible experiment bottleneck.
- 2026-07-29 — Added responsive background scheduling, operation-owned cold-baseline reuse, Studio-wide routing, exact progress projection, and framework documentation.
- 2026-07-29 — Proved the old/new event-loop boundary, cold and warm behavior, one/five-case industrial parity, and focused API/cancellation behavior.
- 2026-07-29 — Browser QA and full repository verification passed; cancellation was tightened between deferred manifest-ordered baseline completions.

## Completion

Completed. Studio now keeps its HTTP/UI event loop responsive by running every locked simulation through an operation-owned isolated or bounded-parallel Worker boundary, while CLI small-case evaluation retains its lower-overhead sequential path and industrial evidence remains exact.
