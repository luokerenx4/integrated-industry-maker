# Shared experiment workbench

Status: V1 shared evaluation, V2 project-local change-set application, and V3 persistent decision loop implemented.

Related: [[docs/design/coding-agent-optimization]], [[docs/design/blueprint-comparison]], [[docs/design/operation-workbench]], [[docs/design/studio-debugger]], [[docs/design/simulation-runtime]], [[docs/CLI]].

## Product boundary

INM is AI-first and human-legible. Industrial complexity remains explicit; different operators receive different projections of the same experiment rather than separate simplified models.

- Coding Agents normally use `inm benchmark --json` for high-bandwidth structured evaluation.
- Humans use Studio to understand the fixed workload, gates, per-case consequences, and Blueprint change set.
- Browser-capable Agents may operate the same semantic DOM when spatial or user-facing verification matters.

Capability parity does not require interaction parity. A model should not scrape hundreds of visible metrics when the CLI can return typed JSON, and a human should not have to read raw JSON to inspect a layout or causal regression.

## One authoritative protocol

`evaluateBlueprintBenchmark()` remains the only evaluator. The named `benchmark.evaluate`, `candidate.preview`, and `candidate.apply` Core operations wrap that evaluator with the shared effect/context/hash/artifact/write-set result contract. Both CLI and Studio receive the same `BlueprintBenchmarkResult`: hashes, weighted scores, cases, capacity readiness, gate reasons, exact RFC 6902 patch, semantic changes, and KEEP/DISCARD/UNCHANGED verdict.

`listBlueprintBenchmarks()` discovers project-local `benchmarks/*.benchmark.json` files in stable id order and projects their immutable case and acceptance contracts. Studio does not invent sessions or copy Benchmark state into browser storage.

Studio exposes project-qualified endpoints:

```text
GET  /api/projects/<project>/experiments
POST /api/projects/<project>/experiments/<benchmark>/run
GET  /api/projects/<project>/experiments/<benchmark>/candidates/<candidate>/review
POST /api/projects/<project>/experiments/<benchmark>/candidates/<candidate>/{preview,apply}
```

Benchmark evaluation is an explicit user action and is read-only: it writes no Blueprint, lock, run artifact, result table, or Git state. Candidate review is a separate explicit operation that writes only its immutable decision receipt. Lock mutation remains the explicit CLI `--lock` workflow.

## Stable navigation and accessible operation

The project remains the root context. `/<project>/experiments/<benchmark>` is a stable, reloadable, shareable view. Closing the workbench returns to `/<project>`; browser history restores both states.

The workbench uses a native dialog role, named buttons, ordinary buttons for experiment selection, stable test ids for programmatic execution, structured case rows, and textual verdict/diff output. The 3D canvas is not required to operate or understand a Benchmark.

## V1 — shared evaluation

The first vertical slice supports:

1. enumerate and select fixed project experiments;
2. inspect baseline/candidate, cases, seeds, weights, and acceptance gates;
3. explicitly execute the locked evaluator;
4. inspect aggregate verdict, gate failures, per-case capacity/throughput/contracts, and semantic Blueprint changes;
5. reproduce the exact operation with `inm benchmark <project> --benchmark <id> --json`.

It deliberately does not edit Blueprint JSON or turn KEEP into a Git mutation. A later authoring phase may expose exact Blueprint patches, but any UI edit must remain an ordinary project-local file change that the CLI can validate and evaluate.

## V2 — candidate review and guarded application

The next milestone closes the authoring loop without hiding industrial or filesystem state:

1. An Agent authors a project-local `candidates/<id>.candidate.json` change set. It names one locked Benchmark, records a hypothesis, pins the current candidate Blueprint hash, and contains an exact RFC 6902 patch.
2. Core loads and validates that artifact, applies it in memory, compiles it against every locked case, and evaluates the proposed Blueprint through the same Benchmark gates. Explicit review records one deterministic immutable receipt; project orientation itself remains read-only.
3. CLI exposes the structured preview and an explicit apply operation. Studio projects the same candidate, patch, semantic diff, cases, and verdict for a human reviewer.
4. Apply is allowed only for `KEEP`. It repeats evaluation, requires the reviewed proposal, base Blueprint, and proposed Blueprint hashes to match, then atomically replaces only the Benchmark's candidate Blueprint file.
5. The proposal and review receipt remain as project history. If the current Blueprint equals the reviewed proposed hash it is `verified`; a later unrelated edit makes the proposal `stale`. The consumed base cannot be applied twice or silently target a later Blueprint.

## V3 — persistent shared decision phase

Candidate state is reconstructed without browser storage and without evaluating during orientation:

```text
proposed
  → reviewed-keep → verified
  → reviewed-discard / reviewed-unchanged
  → stale when the current Blueprint matches neither reviewed base nor proposal
```

`candidate-reviews/<candidate>/<proposal-hash>.review.json` records the exact proposal/base/proposed hashes, locked verdict, score delta, complete Benchmark result, and result hash. Review is idempotent for identical evaluator output and rejects a conflicting receipt. Apply requires the current `reviewed-keep` state and explicit confirmation, re-evaluates every guard, writes the Blueprint atomically, then proves that the file hash equals the reviewed proposed hash. Core exposes this phase through the shared workbench; CLI and Studio load the same recorded review after a process or page reload.

The proposal does not own worlds, assets, scenarios, objectives, locks, evaluator weights, or Git. It may edit only Blueprint-owned `/devices`, `/connections`, `/logisticsNetworks`, and `/policies`; revision lineage is written by Core. Studio never accepts an arbitrary server path.

### Active implementation plan

- [x] Shared read-only Benchmark catalog and evaluator.
- [x] Candidate change-set schema, catalog, preview evaluator, and optimistic apply guard in Core.
- [x] `inm candidate` machine-readable preview and explicit `--apply` workflow.
- [x] Studio candidate selection, stable review deep link, exact patch inspection, and KEEP-only confirmation.
- [x] Immutable review receipt, reload-safe decision phase, and post-write verification.
- [x] Core, CLI, API, and browser tests against `examples/memory-fab`.

### V2 acceptance

- Review returns the same verdict and metrics through Core, CLI, and Studio and creates or reuses exactly one immutable receipt without changing the Blueprint.
- A stale base hash, changed proposal hash, non-KEEP verdict, invalid patch root, or compilation failure prevents application with a stable error code.
- Applying a reviewed KEEP result changes exactly one candidate Blueprint atomically and leaves the Benchmark contract, baseline, assets, scenarios, objectives, and Git untouched.
- The applied Blueprint validates, the proposal becomes visibly `verified`, and a second apply is rejected because the decision is no longer `reviewed-keep`.

## Verification

```bash
bun test packages/inm-studio/src/server.test.ts
bun run inm benchmark examples/memory-fab --benchmark equipment-energy-research --json
bun run inm candidate examples/memory-fab --candidate stable-furnace-sleep --json
bun run inm studio examples/memory-fab --port 4176 --no-open
```

Tests must prove catalog ordering, project isolation, stable deep-link HTML fallback, method/error codes, evaluator parity, immutable receipt reuse, and absence of run/incidental Blueprint writes. Browser QA must use the domain-derived accessible ids to open a direct Candidate URL on a temporary project, review it, verify the visible verdict and case/diff content, deliberately arm and confirm an accepted write, observe the verified hash state across reload, navigate between experiments, and inspect console errors.
