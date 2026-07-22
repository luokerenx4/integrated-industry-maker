# Shared operator workbench

Status: V1 shared project orientation, AI-native CLI projection, Studio task-oriented project root, and shared operation loop implemented; browser-Agent proof remains active work.

Related: [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/blueprint-optimization]], [[docs/design/documentation-system]], [[docs/ARCHITECTURE]], [[docs/CLI]], [[plans/human-ai-workbench]].

## Scope

The operator workbench is the shared, renderer-independent projection through which a human or Coding Agent establishes project context before taking industrial action. It answers which project inputs are selected, which hashes identify them, whether the Blueprint is statically ready, what the prioritized problems are, what project-local evidence exists, and which operations may be attempted.

It is not an evaluator, a second analysis engine, an Agent runtime, browser state, or a simplified industrial model. It invokes existing Core compilation, production analysis, and capacity planning and projects their results into one serializable contract.

## Authoritative flow

```text
project-local files + explicit ProjectSelection
  → loadFactoryProject()
  → compileFactoryProject()
  → analyzeProduction() + planProductionCapacity()
  → runs + Benchmarks + Candidate Change Sets
  → buildProjectWorkbenchSnapshot()
  → inm inspect / Studio project overview API
```

`ProjectWorkbenchSnapshot` is owned by Core. CLI and Studio may format or progressively disclose it, but they may not recompute readiness, rewrite diagnostic severity, infer different operation availability, or maintain a browser-only copy as authority.

Opening a snapshot is read-only. It does not create cache directories, runs, Benchmark results, locks, previews, or candidate applications. It loads Candidate manifests but does not evaluate their patches; a Candidate operation remains conditional until the existing preview/apply guards run.

## Snapshot contract

The V1 snapshot contains:

- project id, display name, and resolved project root;
- the effective World, Blueprint, Scenario, and Objective ids/names plus complete input hashes;
- normalized primary or portfolio delivery contracts;
- target-rate capacity readiness and deterministic gap counts by kind;
- topology, project-local catalog, run, experiment, and candidate counts;
- compact Resource, Process, Product Route, and Device asset summaries;
- immutable run evidence with selection, engine compatibility, decision, score, and result hash;
- locked Benchmark summaries and Candidate summaries without running their evaluators;
- prioritized diagnostics and operation descriptors.

Every array is emitted in deterministic id order where its source is not already ordered. Snapshot `version` identifies this projection contract; INM is still pre-alpha, so changing it means replacing both consumers and tests in the same change rather than adding compatibility readers.

## Diagnostic contract

Workbench diagnostics normalize two existing evidence sources:

- every target-rate capacity gap becomes `capacity.<kind>`, severity `blocking`, priority `100`;
- production-analysis diagnostics become `analysis.<code>`, retaining their `warning` or `info` severity at priorities `60` and `20`.

Each diagnostic carries a deterministic id, stable namespaced code, one or more typed subject references, display message, evidence source/summary, and operation ids that can reveal more evidence. Diagnostics sort by descending priority, then code and id. The code and typed subjects are the cross-surface contract; prose may improve when the underlying analysis improves.

Capacity and analysis diagnostics may intentionally overlap. A capacity gap answers whether the Objective is provisioned, while an analysis warning describes the nominal configured system. Studio may group related evidence but must not silently discard either source.

## Operation descriptors

An operation descriptor advertises one Core capability without executing it. It contains a stable id, effect, selection behavior, confirmation requirement, declared write-set pattern, guards, and availability:

- `available` means it can be invoked with ordinary required arguments;
- `conditional` means a capability exists but its selected artifact must still satisfy listed guards;
- `unavailable` means the project contains no applicable artifact or prerequisite.

The three effects are `read-only`, `creates-artifact`, and `mutates-blueprint`. `simulate` declares an immutable `runs/<generated>/` artifact. `synthesize` declares a new Blueprint path. Candidate application declares its candidate Blueprint path pattern, explicit confirmation, reviewed/base/proposed hashes, and KEEP verdict guards. A descriptor never grants permission to bypass the command's runtime validation.

## CLI and Studio projections

`inm inspect --json` emits a compact summary inside the versioned CLI envelope. `inm inspect --section all --json` places the exact Core snapshot in `data.result`; the envelope separately carries the same effective context, diagnostics, and exact next-action argv arrays. Human `inm inspect` renders a compact orientation view containing effective selection/hashes, Objective, readiness, topology/catalog/evidence counts, highest-priority diagnostics, and operation effects. Dense analysis remains in `inm analyze` and `inm plan`. See [[docs/design/agent-cli-contract]].

Studio exposes the same snapshot at:

```text
GET /api/projects/<project-id>/overview
GET /api/projects/<project-id>/overview?world=<id>&blueprint=<id>&scenario=<id>&objective=<id>
```

Explicit query selection never falls back when invalid. The endpoint is project-qualified, accepts only GET, and creates no run or cache state. The task-oriented project root consumes this contract for selection, readiness, diagnostics, evidence, and operation descriptors. Factory uses its richer replay endpoint because its selected immutable run and event timeline are intentionally run-scoped.

## Source of truth

- Snapshot types, diagnostics, operations, and builder: `packages/inm-core/src/workbench.ts`
- Production evidence: `packages/inm-core/src/production-analysis.ts`
- Capacity evidence: `packages/inm-core/src/capacity-plan.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio API projection: `packages/inm-studio/src/server.ts`

## Verification

```bash
bun test packages/inm-core/src/workbench.test.ts
bun test packages/inm-cli/src/commands.test.ts
bun test packages/inm-studio/src/server.test.ts
bun run inm inspect examples/ironworks --section all --json
bun run inm inspect examples/memory-fab --section all --json
```

Tests must prove exact CLI `data.result`/Core and Studio/Core snapshot parity, deterministic diagnostic/action identity, memory-fab experiment/candidate discovery, empty-run read purity, and invalid explicit-selection rejection. A successful HTTP response or a visually similar summary is not parity evidence.

## Change checklist

- Add industrial conclusions to Core analysis or capacity planning before projecting them into the snapshot.
- Give every new diagnostic a namespaced code, typed subject, evidence source, priority, and valid operation references.
- Declare effect, write set, guards, and conditional availability for every new operation.
- Keep snapshot construction read-only and deterministic.
- Update CLI, Studio API, this document, and cross-surface parity tests together.

## Known next gaps

- Per-Candidate cheap stale/lock status without executing a Benchmark.
