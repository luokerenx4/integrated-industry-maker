# Shared experiment workbench

Status: V1 shared evaluation, V2 project-local change-set application, V3 persistent decision loop, V4 immutable Design continuation, V5 commissioned Design provenance, V6 Objective score causality, and V7 control activation causality implemented.

Related: [[docs/design/coding-agent-optimization]], [[docs/design/blueprint-comparison]], [[docs/design/operation-workbench]], [[docs/design/studio-debugger]], [[docs/design/simulation-runtime]], [[docs/CLI]].

## Product boundary

INM is AI-first and human-legible. Industrial complexity remains explicit; different operators receive different projections of the same experiment rather than separate simplified models.

- Coding Agents normally use `inm benchmark --json` for high-bandwidth structured evaluation.
- Humans use Studio to understand the fixed workload, gates, per-case consequences, and Blueprint change set.
- Browser-capable Agents may operate the same semantic DOM when spatial or user-facing verification matters.

Capability parity does not require interaction parity. A model should not scrape hundreds of visible metrics when the CLI can return typed JSON, and a human should not have to read raw JSON to inspect a layout or causal regression.

## One authoritative protocol

`evaluateBlueprintBenchmark()` remains the only evaluator. The named `benchmark.evaluate`, `candidate.preview`, and `candidate.apply` Core operations wrap that evaluator with the shared effect/context/hash/artifact/write-set result contract. Both CLI and Studio receive the same `BlueprintBenchmarkResult`: hashes, weighted scores, cases, evaluator-owned Objective breakdowns and component deltas, capacity readiness, ordered hard-outcome evidence, gate reasons, exact RFC 6902 patch, semantic changes, and KEEP/DISCARD/UNCHANGED verdict.

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
2. inspect baseline/candidate, cases, seeds, weights, score gates, and project-authored hard industrial outcomes;
3. explicitly execute the locked evaluator;
4. inspect aggregate verdict, gate failures, per-case capacity/throughput/contracts, progressively disclosed baseline/candidate Objective components and exact deltas, exact baseline/candidate/threshold outcome evidence, and semantic Blueprint changes;
5. reproduce the exact operation with `inm benchmark <project> --benchmark <id> --json`.

It deliberately does not edit Blueprint JSON or turn KEEP into a Git mutation. A later authoring phase may expose exact Blueprint patches, but any UI edit must remain an ordinary project-local file change that the CLI can validate and evaluate.

## V2 — candidate review and guarded application

The next milestone closes the authoring loop without hiding industrial or filesystem state:

1. An Agent authors a project-local `candidates/<id>.candidate.json` change set. It names one locked Benchmark, records a hypothesis, pins the current candidate Blueprint hash, and contains an exact RFC 6902 patch.
2. Core loads and validates that artifact, applies it in memory, then compiles the complete proposed Blueprint against every locked case and evaluates it through the same Benchmark gates. The pinned base may be a schema-valid but uncommissioned site whose future Scenario references do not compile until the patch is present. Explicit review records one deterministic immutable receipt; project orientation itself remains read-only.
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

## V4 — immutable Design continuation

Long-running industrial design must survive a bounded search invocation without turning into mutable browser state. When a completed Design Run stops at its Candidate budget while retaining searchable frontier nodes, both operators receive the same explicit continuation capability:

- an Agent reopens the hash through `inm design --run-id <hash> --json`, discovers the exact `design.continue:<hash>` argv, and invokes `--continue --max-candidates N`;
- a human selects the same result in Studio, sees direct source provenance and the next searchable node, chooses the additional budget, and presses `CONTINUE`;
- a browser-capable Agent may use that same labeled button and inspect the same streamed evidence.

Both surfaces call `continueDesignRun()`. Core verifies the source artifact and current Program/Benchmark/seed/promotion identities, reconstructs retained Blueprints and lineage-local proposal histories from exact patches, and creates a new content-addressed V3 result containing the full verified prefix plus new evidence. It never edits the source, never stores a mutable checkpoint, and never reruns source seed or Candidate cases. Studio's `POST /api/projects/<project>/designs/<program>/runs/<hash>/continue` and the CLI NDJSON channel expose the same progress union, cumulative/additional budget, exhaustion order, decisions, and result hash.

The human view deliberately distinguishes “new run” from “continue exact frontier.” Ranking rows identify direct lineage, selected results show reused/additional counts, and the continuation control exists only for a verified `budget-exhausted` result with a non-empty search queue. A rejected new Candidate is still a successful continuation result: the product preserves the learned counterexample instead of presenting search as guaranteed improvement.

## V5 — commissioned Design provenance

Promotion, review, and apply form one authority chain rather than three unrelated screens:

```text
immutable Design Run best
  → Candidate source + exact base patch
  → immutable KEEP receipt
  → hash-identical commissioned Blueprint
```

The Candidate file retains the Design Program, result hash, and best-Blueprint hash. Its receipt retains proposal/base/proposed hashes and complete locked evaluation; neither depends on browser storage or the ignored Design Run cache. Studio shows that source identity beside the Candidate and offers a Design deep link only when the exact run artifact is locally available. The CLI exposes the same source and verified decision through project inspection.

After apply, a Design Run whose best hash equals the current promotion target is `commissioned`, not still promotable. Studio suppresses both continuation and repeat-promotion controls, displays the matching Candidate handoff, and keeps the run as immutable evidence. If the target moved to some other hash, Studio labels the base as moved and likewise offers no dishonest operation. Core remains authoritative and rejects either stale action even if another client constructs the request manually.

The same chain now covers iterative optimization of an already commissioned factory. `commissioned-dram-fab` pins one live `generated-dram-fab` hash as both authored seed and promotion base. Its first accepted run promoted Candidate `portfolio-aware-dram-dispatch`; the one-operation receipt proved the unchanged five-case Benchmark before apply wrote the exact reviewed hash. Afterward the Program's next brief naturally points at the new live hash, while the applied Candidate remains verified provenance and the older greenfield commissioning Candidate becomes historical rather than a valid mutation target.

## V6 — Objective score causality

The evaluator remains the only owner of Objective formulas. Core preserves its ordered fifteen-component `scoreBreakdown` in every Benchmark snapshot and computes the exact `candidate - baseline` delta. Design copies the same evidence into every current-best case and proposal-time promotion boundary. CLI exposes the complete machine-readable objects and a compact leading-driver line; Studio uses a native `<details>` table so humans and browser-capable Agents can expand the same baseline, candidate, and delta values without crowding the primary decision surface.

Component sums are runtime-checked against the reported scores and deltas. Pre-alpha cached Design Runs that lack this evidence are intentionally excluded rather than upgraded, while new Design execution remains available. In the current memory-fab advanced-recovery branch this view explains the `lithography-interruption` regression as WIP `-0.531800`, energy `-0.006040`, build cost `-0.005000`, cycle time `+0.072546`, and tardiness `+0.041035`, totaling `-0.429259`.

## V7 — Control activation causality

`BlueprintMetricSnapshot` preserves the evaluator-owned `cadenceControl.devices` map for both sides of every locked case. Each entry carries the exact Process, normal and recovery modes, downstream Connection, recovery boundary, and measured normal/recovery job counts; no configured control is represented by an empty map. CLI JSON and Studio receive this record unchanged. Human Benchmark output prints the same baseline-to-candidate device split, while Experiment case details use a native `<details>` disclosure rather than deriving activation from score.

Immutable Design Run V3 requires the field in the seed and every successful Candidate evaluation. Studio projects the final leader's per-case activation and each iteration's candidate activation from those stored evaluations. Missing V3 evidence fails closed and remains visible only as excluded invalid evidence; there is no V2 compatibility parser or synthetic zero-fill.

### Active implementation plan

- [x] Shared read-only Benchmark catalog and evaluator.
- [x] Candidate change-set schema, catalog, preview evaluator, and optimistic apply guard in Core.
- [x] `inm candidate` machine-readable preview and explicit `--apply` workflow.
- [x] Studio candidate selection, stable review deep link, exact patch inspection, and KEEP-only confirmation.
- [x] Immutable review receipt, reload-safe decision phase, and post-write verification.
- [x] Core, CLI, API, and browser tests against `examples/memory-fab`.
- [x] Exact immutable Design continuation through Core, CLI discovery/NDJSON, Studio API/control, and real memory-fab evidence.
- [x] Greenfield Candidate commissioning, checked-in receipt/provenance, proposed-context compilation, and honest post-apply Studio state.
- [x] Exact-factory commissioned optimization, value-aware burn-in Candidate, five-case review receipt, and verified apply.
- [x] Shared Objective-component causality across Core, CLI, Studio, and project-local Design providers.

### V2 acceptance

- Review returns the same verdict and metrics through Core, CLI, and Studio and creates or reuses exactly one immutable receipt without changing the Blueprint.
- A stale base hash, changed proposal hash, non-KEEP verdict, invalid patch root, or compilation failure prevents application with a stable error code.
- Applying a reviewed KEEP result changes exactly one candidate Blueprint atomically and leaves the Benchmark contract, baseline, assets, scenarios, objectives, and Git untouched.
- The applied Blueprint validates, the proposal becomes visibly `verified`, and a second apply is rejected because the decision is no longer `reviewed-keep`.

## Verification

```bash
bun test packages/inm-studio/src/server.test.ts
bun run inm benchmark examples/memory-fab --benchmark equipment-energy-research --json
bun run inm inspect examples/memory-fab --section candidates --json
bun run inm studio examples/memory-fab --port 4176 --no-open
```

Tests must prove catalog ordering, project isolation, stable deep-link HTML fallback, method/error codes, evaluator parity, proposed-context compilation, immutable receipt reuse, Design continuation prefix/source immutability and new-only simulation work, and absence of incidental Blueprint writes. Browser QA must use domain-derived accessible ids to inspect the verified commissioned Candidate and source identity, follow the locally available Design evidence, observe `COMMISSIONING COMPLETE` without stale continuation/promotion controls, navigate between experiments, and inspect console errors.
