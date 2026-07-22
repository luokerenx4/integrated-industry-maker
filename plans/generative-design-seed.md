# Generative Design seed

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/design/agent-cli-contract]], and [[docs/design/experiment-workbench]].

## Outcome

One project-local Design Program can start from a minimal Blueprint, invoke the project's deterministic synthesis strategy, evaluate and improve the generated memory fab against a locked multi-condition Benchmark, preserve immutable source and result identities, and hand the best accepted design to the ordinary Candidate review/apply lifecycle from either CLI or Studio.

## Context

Memory-fab already owns a tracked-route synthesis strategy and a bounded project-specific Design proposal provider, but they are separate public operations. A human or Agent must run `synthesize`, write or select its output, then construct a Design Program whose seed is forced to equal the Benchmark candidate Blueprint. That glue hides the real build-to-optimize lifecycle and makes the current tuned `experiment` Blueprint an unsafe target for greenfield generation.

The generated design, the authored synthesis input, and the mutable Benchmark candidate are different identities. The run must preserve all three: source provenance explains how the factory was built, the normalized in-memory seed is what was evaluated, and the Benchmark candidate hash is the optimistic-concurrency base for Candidate promotion.

## Scope

### In scope

- Replace the single `seedBlueprint` field with a strict authored-Blueprint or synthesis-seed union; no compatibility alias or migration path.
- Resolve synthesis without writing an intermediate Blueprint and include project strategy source in Design Program identity.
- Normalize a generated seed onto the Benchmark candidate's revision lineage so one restricted Candidate patch can reproduce the exact best Blueprint.
- Give greenfield memory-fab construction its own candidate Blueprint and locked multi-condition Benchmark instead of overwriting the tuned `experiment` path.
- Expose source, synthesis, promotion-base, evaluation, and best-result identities consistently in Core, CLI, Studio, schemas, examples, and docs.

### Out of scope

- Selecting or applying a Candidate without explicit review.
- Replacing project-owned proposal strategies with an external optimizer or LLM protocol.
- Automatically making the generated target the project's default Blueprint.
- Sharing synthesis strategies or assets between projects.

## Acceptance

- [x] A strict synthesis-seeded Design Program expands `greenfield` in memory only, compiles a complete re-entrant DRAM fab, and evaluates it across the locked five-case Benchmark before any proposal is accepted.
- [x] The immutable run records the declared seed source, source Blueprint hash, synthesis method/source hash, normalized seed hash/evaluation, and separate promotion-base Blueprint/hash.
- [x] A generated accepted seed or later improvement can be promoted as one exact hash-pinned Candidate against the unchanged generative target, while stale target, strategy, Program, Benchmark, or engine identities are rejected.
- [x] CLI and Studio distinguish “generated from” from “will update”, expose the same machine-readable contract, and require the existing Candidate preview/review/apply boundary.
- [x] The tuned `experiment` Blueprint remains byte-identical throughout generative run and promotion; the generated target changes only after explicit Candidate apply.
- [x] Focused tests, public CLI/Studio tests, documentation/schema checks, the complete suite, and a real memory-fab build → optimize → Candidate proof pass.

## Work

- [x] Audit seed, Benchmark candidate, normalized evaluation Blueprint, and Candidate promotion identities.
- [x] Implement the strict seed union and one read-only seed resolver shared by brief and execution.
- [x] Extend immutable Design Run evidence and exact promotion replay around a separate promotion base.
- [x] Add the self-contained memory-fab generative target, locked Benchmark, and synthesis-seeded Program.
- [x] Update CLI, Studio, JSON Schema, examples, and design/reference documentation.
- [x] Verify determinism, non-mutation, staleness guards, Candidate preview/apply, browser behavior, and the full repository suite.
- [x] Complete the final acceptance audit, record evidence, and move this plan to completed.

## Findings and decisions

- 2026-07-23 — An authored seed, a synthesized working seed, and the Benchmark candidate are separate identities. Conflating them makes provenance incomplete and Candidate optimistic concurrency unsafe.
- 2026-07-23 — Greenfield construction receives a dedicated candidate Blueprint and Benchmark. It must not replace the already tuned `experiment` simply because both use the same baseline and operating cases.
- 2026-07-23 — The working seed and every proposal use the promotion-base hash as their `revision`. Candidate replay can therefore reproduce the immutable best hash exactly without permitting patches outside Blueprint-owned industrial fields.
- 2026-07-23 — Synthesis itself is a valid design advance. An accepted generated seed may be promoted even when no later proposal wins; authored seed-only runs still yield no patch and remain unpromotable.
- 2026-07-23 — The Design Program hash includes both entry path and source text for proposal and synthesis strategies. A source edit makes an old run stale before Candidate creation.
- 2026-07-23 — The generated 56-Device factory is physically and capacity ready but scores exactly like the locked baseline; the first project proposal adds CONWIP/EDD control and improves the five-case aggregate by `+24.190636`, so the shipped proof has a genuine iteration-1 KEEP rather than treating synthesis alone as an improvement.

## Verification

- `bun run docs:check` — 480 repository double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, Ironworks asset, and memory-fab asset TypeScript projects pass.
- `bun test packages/inm-core/src/design-program.test.ts` — 3 tests / 40 assertions prove strict authored/synthesis contracts, deterministic immutable generation, synthesis-strategy staleness, exact 73-operation Candidate replay, KEEP preview/apply, promotion-base staleness, and source/target/tuned Blueprint non-mutation.
- `bun test packages/inm-cli/src/commands.test.ts` — 14 public-binary tests / 200 assertions pass, including generated seed and promotion-base machine projection plus NDJSON Design progress.
- `bun test packages/inm-studio/src/server.test.ts` — 2 server tests / 74 assertions pass, including both memory-fab Design Programs, synthesis provenance, streaming execution, reopening, and guarded promotion.
- `bun run test` — 185 tests / 1568 assertions, 8 Ironworks project fixtures, docs, and all TypeScript projects pass on the final committed tree.
- `bun run inm test examples/memory-fab` — both tracked-route memory-fab fixtures pass.
- `bun run inm design examples/memory-fab --program greenfield-dram-fab --run --max-candidates 1 --progress ndjson --json` — immutable result `645ee9b98dc789cce04c47ce57327ad15dd754262fe7df5cd91dd8c943e86554`; 35 ordered progress events; 15/15 simulations; iteration 1 `dispatch:conwip-9-6-edd` KEEP; score delta `+24.190636`; 73 promotion operations.
- Browser QA at `/<project>/designs/greenfield-dram-fab/runs/<hash>` — desktop and 390 px layouts clearly show `GENERATED FROM greenfield`, `WILL UPDATE generated-dram-fab`, locked evidence, KEEP result, and non-applying Candidate handoff.

## Progress log

- 2026-07-23 — Plan created and activated after auditing the current authored-seed and Candidate promotion contracts.
- 2026-07-23 — Strict seed resolution, immutable provenance, dedicated target/Benchmark, CLI/Studio parity, exact promotion, tests, documentation, and browser QA completed; final commit audit remains.
- 2026-07-23 — Acceptance audited against executable, CLI, Studio, browser, and immutable-run evidence; implementation committed as `732b854` and the plan completed.

## Completion

Shipped in `732b854` (`feat: generate Design Program seeds`). Memory-fab now has two explicit lifecycles: `integrated-dram-fab` continues optimizing the tuned `experiment`, while `greenfield-dram-fab` synthesizes from the empty `greenfield`, improves the generated factory through the locked five-case envelope, and hands an accepted exact result to Candidate review against the independent `generated-dram-fab` target. Core, CLI, Studio, schemas, examples, tests, and design documentation share the same source/working-seed/promotion-base contract. No work from this bounded outcome is deferred.
