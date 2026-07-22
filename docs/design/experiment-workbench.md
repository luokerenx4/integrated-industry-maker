# Shared experiment workbench

Status: shared Core experiment catalog, CLI/Studio evaluator parity, stable Studio deep links, explicit read-only browser execution, case/gate/result projection, and semantic Blueprint diff implemented.

Related: [[docs/design/coding-agent-optimization]], [[docs/design/blueprint-comparison]], [[docs/design/studio-debugger]], [[docs/design/simulation-runtime]], [[docs/CLI]].

## Product boundary

INM is AI-first and human-legible. Industrial complexity remains explicit; different operators receive different projections of the same experiment rather than separate simplified models.

- Coding Agents normally use `inm benchmark --json` for high-bandwidth structured evaluation.
- Humans use Studio to understand the fixed workload, gates, per-case consequences, and Blueprint change set.
- Browser-capable Agents may operate the same semantic DOM when spatial or user-facing verification matters.

Capability parity does not require interaction parity. A model should not scrape hundreds of visible metrics when the CLI can return typed JSON, and a human should not have to read raw JSON to inspect a layout or causal regression.

## One authoritative protocol

`evaluateBlueprintBenchmark()` remains the only evaluator. Both CLI and Studio receive the same `BlueprintBenchmarkResult`: hashes, weighted scores, cases, capacity readiness, gate reasons, exact RFC 6902 patch, semantic changes, and KEEP/DISCARD/UNCHANGED verdict.

`listBlueprintBenchmarks()` discovers project-local `benchmarks/*.benchmark.json` files in stable id order and projects their immutable case and acceptance contracts. Studio does not invent sessions or copy Benchmark state into browser storage.

Studio exposes project-qualified endpoints:

```text
GET  /api/projects/<project>/experiments
POST /api/projects/<project>/experiments/<benchmark>/run
```

Evaluation is an explicit user action and is read-only: it writes no Blueprint, lock, run artifact, result table, or Git state. Lock mutation remains the explicit CLI `--lock` workflow.

## Stable navigation and accessible operation

The project remains the root context. `/<project>/experiments/<benchmark>` is a stable, reloadable, shareable view. Closing the workbench returns to `/<project>`; browser history restores both states.

The workbench uses a native dialog role, named buttons, ordinary buttons for experiment selection, stable test ids for programmatic execution, structured case rows, and textual verdict/diff output. The 3D canvas is not required to operate or understand a Benchmark.

## V1 scope

The first vertical slice supports:

1. enumerate and select fixed project experiments;
2. inspect baseline/candidate, cases, seeds, weights, and acceptance gates;
3. explicitly execute the locked evaluator;
4. inspect aggregate verdict, gate failures, per-case capacity/throughput/contracts, and semantic Blueprint changes;
5. reproduce the exact operation with `inm benchmark <project> --benchmark <id> --json`.

It deliberately does not edit Blueprint JSON or turn KEEP into a Git mutation. A later authoring phase may expose exact Blueprint patches, but any UI edit must remain an ordinary project-local file change that the CLI can validate and evaluate.

## Verification

```bash
bun test packages/inm-studio/src/server.test.ts
bun run inm benchmark examples/memory-fab --benchmark equipment-energy-research --json
bun run inm studio examples/memory-fab --port 4176 --no-open
```

Tests must prove catalog ordering, project isolation, stable deep-link HTML fallback, method/error codes, evaluator parity, and absence of run/Blueprint writes. Browser QA must open a direct experiment URL, run it, verify the visible verdict and case/diff content, navigate between experiments, close back to the project, and inspect console errors.
