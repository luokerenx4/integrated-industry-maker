# Immutable Design Run continuation

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/agent-cli-contract]], [[docs/design/experiment-workbench]], and [[docs/CLI]].

## Outcome

When a Design Run spends its bounded Candidate budget while retaining searchable frontier nodes, a human or Agent can continue that exact frontier into a new content-addressed run. The continuation reuses the verified evidence prefix, preserves branch-local proposal history, evaluates only new candidates through the unchanged locked Benchmark, and leaves the source run immutable.

## Context

Memory-fab Design Run `59dca3faf587091dacb20f28bfb4b5020fd5b6d4ce4af718f335bb0b92383562` ends at `7/7` with both `candidate-7` and `candidate-6` searchable. The next scheduler node is explicit, but the only public operation starts again from the seed and deterministically reproduces the same seven candidates. Raising `--max-candidates` is also forbidden above the Program's bound.

The manifest already contains the seed evaluation, every parent-relative patch and evaluation, node-exhaustion order, and exact frontier transitions. Core can therefore reconstruct live Blueprint and lineage-local history for retained nodes without replaying old simulations. The absent contract is immutable continuation lineage and a shared operation across CLI and Studio.

## Scope

### In scope

- Replace the pre-alpha Design Run manifest with a V2 contract that explicitly distinguishes an initial run from a direct immutable continuation.
- Verify the source run against the current engine, Program, Benchmark, seed, and promotion base before continuation.
- Rebuild retained node Blueprints and branch-local histories from the source seed and exact patches, rejecting any hash or frontier mismatch.
- Treat the Program Candidate budget as a per-invocation bound; report cumulative evaluated/maximum counts in the continued artifact.
- Add matching CLI and Studio operations, progress, reopening, ranking, and next-action evidence.
- Continue the real greenfield memory-fab frontier beyond candidate 7 and record what the optimizer discovers next.

### Out of scope

- Mutating a completed Design Run or storing a mutable search session.
- Continuing a frontier-exhausted, stale, incompatible, or tampered run.
- Persisting compiled simulations or trusting old candidate metrics without manifest verification.
- Automatically running without an explicit additional Candidate budget.
- Compatibility aliases or migration support for V1 Design Runs.

## Acceptance

- [x] Initial and continued V2 manifests have deterministic, validated continuation identity and cumulative budgets.
- [x] Core reconstructs exact retained Blueprints and histories, then evaluates only newly budgeted candidates.
- [x] Invalid, stale, frontier-exhausted, and prefix-divergent source runs fail with stable errors before new evidence is written.
- [x] CLI and Studio expose the same explicit continue operation, direct source hash, added budget, progress, and resulting frontier.
- [x] A real memory-fab continuation advances beyond candidate 7 without changing the locked Benchmark or evaluator inputs.
- [x] Core, CLI, Studio, documentation, project fixtures, and full regression pass.

## Work

- [x] Audit manifest sufficiency, replay state, budget semantics, and public operation boundaries.
- [x] Implement and verify V2 manifest lineage plus Core frontier reconstruction/continuation.
- [x] Project continuation through CLI, Studio server, and the human workbench.
- [x] Generate real memory-fab evidence and update current design documentation.
- [ ] Run the full completion audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-23 — The source manifest contains enough information to reconstruct retained node Blueprints: begin from the current exact seed, apply each recorded patch to its replay-selected parent, restore the promotion-base revision, and verify every candidate hash before advancing the recorded frontier.
- 2026-07-23 — Continuation creates a new complete immutable artifact with a direct source hash and copied evidence prefix. It never edits the source artifact and does not introduce a mutable checkpoint format.
- 2026-07-23 — `budget.maxCandidates` becomes the maximum new Candidate evaluations for one invocation. A continued manifest reports the cumulative maximum and evaluated counts so iteration ids remain stable and globally ordered inside its complete history.
- 2026-07-23 — This pre-alpha change uses a strict V2 manifest rather than optional V1 compatibility. Existing local V1 Design Runs will be moved out recoverably and regenerated from current source.
- 2026-07-23 — Loading a continued artifact validates its direct source recursively and requires exact iteration/exhaustion prefixes plus matching Program, Benchmark, seed, promotion-base, and driver identities. Continuation execution separately reconstructs and compiles every retained Blueprint before any new evidence can be written.
- 2026-07-23 — Real initial V2 run `c5b24a97747c7d52fd9a748ffd8b99349cbf108217b0a1a3cee96f59204cb4c2` reproduces candidate 7 at score `-242.199221` with candidate 6 still searchable. Direct continuation `d02580bc840c4eca68ba3c83acb77993a35805df4009f021fb73fb316102d500` retires candidate 6, evaluates candidate 8 from candidate 7, and preserves candidate 7 after the 10-card CONWIP proposal regresses the leader by `-9.960213`.
- 2026-07-23 — Old local V1 Design Runs were moved recoverably to `/Users/ame/.Trash/inm-design-runs-v1-before-continuation`; the active project now contains only regenerated V2 evidence.
- 2026-07-23 — The CPU-heavy memory-fab simulation suites contend and can exceed their independent timeouts when Bun runs them concurrently. The repository regression command now fixes `--max-concurrency=1`, making the full deterministic suite reliable instead of changing the production timeouts or weakening coverage.

## Verification

- `bunx tsc -p packages/inm-core/tsconfig.json --noEmit`
- `bun test packages/inm-core/src/design-program.test.ts -t 'Design continuation rejects'` — replay divergence rejected before a new artifact.
- `bun test packages/inm-core/src/design-program.test.ts -t 'a synthesis-seeded Design Program'` — immutable source/prefix, deterministic continuation, new-only simulations, stale/unavailable/lineage rejection.
- `bun test packages/inm-cli/src/commands.test.ts -t 'public Design Program workflow'` — public `--continue`, NDJSON provenance, next-action discovery, and human output.
- `bun test packages/inm-studio/src/server.test.ts -t 'Studio exposes the same memory-fab Design Program'` — streamed continuation, source immutability, and candidate-8 evidence.
- Real CLI V2 initial and continuation commands produced `c5b24a97747c…` and `d02580bc840c…` with one additional candidate simulation and an unchanged source artifact.
- Browser QA at `/memory-fab/designs/greenfield-memory-fab` reopened the V2 source, invoked `CONTINUE · +1 CANDIDATE`, streamed shared Core progress, selected the deterministic continuation, and rendered its direct provenance and candidate-8 decision evidence.
- `bun run docs:check` — 539 repository double-links and paths passed.
- `bun run typecheck` — Core, CLI, Studio, and both example projects passed.
- `bun run test` — 191 tests, 1,713 assertions, and all 8 Ironworks public fixtures passed with zero failures.

## Progress log

- 2026-07-23 — Activated after the first repaired greenfield run ended with two searchable nodes but no operation capable of consuming the next scheduler state.
- 2026-07-23 — Core, CLI, and Studio continuation paths implemented; real memory-fab evidence advances through rejected candidate 8 without mutating the source run.
- 2026-07-23 — CLI and Studio parity, deterministic replay, browser interaction, documentation, type checking, and the serialized full regression suite passed the acceptance audit.

## Completion

Complete this section only when status becomes `completed`. Summarize what shipped, identify any intentionally deferred follow-up as a separately indexed plan, and link the final commit or pull request when available.
