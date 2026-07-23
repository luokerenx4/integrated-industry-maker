# Shared operator workbench

Status: V3 shared decision status, hash-compatible tracked-lot loss attribution, Core-owned next action, persistent Candidate phase, AI-native CLI projection, Studio task-oriented project root, and browser-Agent proof implemented.

Related: [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/blueprint-optimization]], [[docs/design/fab-loss-attribution]], [[docs/design/documentation-system]], [[docs/ARCHITECTURE]], [[docs/CLI]], [[plans/human-ai-workbench]], [[plans/operator-interaction-refinement]].

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

`ProjectWorkbenchSnapshot` is owned by Core. CLI and Studio may format or progressively disclose it, but they may not recompute status, rewrite diagnostic severity, choose a different next action, infer different operation availability, or maintain a browser-only copy as authority.

Opening a snapshot is read-only. It does not create cache directories, runs, Benchmark results, locks, review receipts, or candidate applications. It loads Candidate manifests and existing project-local review receipts but does not evaluate their patches. Explicit Candidate review remains the operation that runs the locked evaluator and records evidence.

## Snapshot contract

The V3 snapshot contains:

- project id, display name, and resolved project root;
- the effective World, Blueprint, Scenario, and Objective ids/names plus complete input hashes;
- normalized primary or portfolio delivery contracts;
- separate capacity, flow-risk, matching-evidence, and Candidate-review status facets;
- topology, project-local catalog, run, experiment, and candidate counts;
- compact Resource, Process, Product Route, and Device asset summaries;
- immutable run evidence with selection, engine compatibility, decision, score, and result hash;
- locked Benchmark summaries and Candidate summaries with cheap `proposed`, reviewed-verdict, `verified`, or `stale` decisions reconstructed from hashes and immutable review receipts without running their evaluators;
- prioritized diagnostics and operation descriptors.
- optional compatible-run tracked-lot loss attribution with exact run identity, outcome, primary signal, ranked chain, named buckets, and interpretation caveat;
- exactly one shared next action with stable identity, reason, effect, confirmation requirement, exact CLI argv, project-qualified Studio route, and typed target.

Every array is emitted in deterministic id order where its source is not already ordered. Snapshot `version` identifies this projection contract; INM is still pre-alpha, so changing it means replacing both consumers and tests in the same change rather than adding compatibility readers.

## Diagnostic contract

Workbench diagnostics normalize three existing evidence sources:

- every target-rate capacity gap becomes `capacity.<kind>`, severity `blocking`, priority `100`;
- the top five non-zero buckets from an exactly hash-compatible tracked-lot run become `fab-loss.<bucket>`, priorities `90` through `86`, retaining the run id and industrial subjects;
- production-analysis diagnostics become `analysis.<code>`, retaining their `warning` or `info` severity at priorities `60` and `20`.

Each diagnostic carries a deterministic id, stable namespaced code, one or more typed subject references, display message, evidence source/summary, and operation ids that can reveal more evidence. Diagnostics sort by descending priority, then code and id. The code and typed subjects are the cross-surface contract; prose may improve when the underlying analysis improves.

Capacity, realized-loss, and analysis diagnostics may intentionally overlap. A capacity gap answers whether the Objective is provisioned, a compatible run measures what happened, and an analysis warning describes nominal configured flow risk. `status.capacity` and `status.flow` therefore remain separate: `capacity ready` may coexist with `flow at-risk` without presenting the project as unqualified `READY`. Studio may group related evidence but must not silently discard any source. See [[docs/design/fab-loss-attribution]] for the strict compatibility and non-additivity boundaries.

## Operation descriptors

An operation descriptor advertises one Core capability without executing it. It contains a stable id, effect, selection behavior, confirmation requirement, declared write-set pattern, guards, and availability:

- `available` means it can be invoked with ordinary required arguments;
- `conditional` means a capability exists but its selected artifact must still satisfy listed guards;
- `unavailable` means the project contains no applicable artifact or prerequisite.

The three operation effects are `read-only`, `creates-artifact`, and `mutates-blueprint`. `simulate` declares an immutable `runs/<generated>/` artifact. `synthesize` declares a new Blueprint path. Candidate review declares `candidate-reviews/<candidate>/<proposal-hash>.review.json`; Candidate application declares its candidate Blueprint path pattern, explicit confirmation, immutable review receipt, reviewed/base/proposed hashes, KEEP verdict, and post-write hash guards. A descriptor never grants permission to bypass the command's runtime validation.

## CLI and Studio projections

`inm inspect --json` emits a compact summary inside the versioned CLI envelope. `inm inspect --section next-action --json` returns the exact Core next-action object, `--section losses --json` returns compatible-run attribution, and `inm inspect --section all --json` places the exact Core snapshot in `data.result`; the envelope's `nextActions` contains that same one object. Human `inm inspect` renders effective selection/hashes, Objective, the four explicit status facets, the shared next action, topology/catalog/evidence counts, the primary realized loss/chain when current, highest-priority diagnostics, and operation effects. Dense analysis remains in `inm analyze` and `inm plan`. See [[docs/design/agent-cli-contract]].

Studio exposes the same snapshot at:

```text
GET /api/projects/<project-id>/overview
GET /api/projects/<project-id>/overview?world=<id>&blueprint=<id>&scenario=<id>&objective=<id>
```

Explicit query selection never falls back when invalid. The endpoint is project-qualified, accepts only GET, and creates no run or cache state. The task-oriented project root consumes this contract for selection, readiness, diagnostics, evidence, loss attribution, and operation descriptors. When Factory selects a run, Studio requests Overview with that run's exact selection so spatial replay and workbench conclusions cannot drift apart.

### Shared next action

Core derives one visible and machine-readable next action from existing workbench facts so operators do not assign equal weight to every panel. This is an operating projection, not a new industrial conclusion. It selects, in order, the first blocking capacity diagnostic, an exact reviewed KEEP awaiting confirmation, a new current Candidate proposal awaiting review, missing or incompatible immutable evidence for the exact effective selection, the first flow warning, the latest matching run, or shared analysis. A reviewed non-KEEP verdict is resolved evidence, and a stale Candidate is historical evidence; both remain visible in the catalog and status counts but neither can permanently displace work on the current factory.

Every target already exists in the snapshot and carries exact CLI argv plus a Studio route. CLI returns the object unchanged and Studio renders it unchanged; neither surface chooses priority locally. Orientation never executes a Benchmark, creates a review receipt, mutates a Blueprint, or claims that a non-matching run proves the selected selection.

All remaining operation descriptors stay available under explicit progressive disclosure with their effect, scope, guards, and exact CLI reproduction. Recommendation identity is domain-derived and exposed semantically for browser-capable operators.

## Source of truth

- Snapshot types, diagnostics, operations, and builder: `packages/inm-core/src/workbench.ts`
- Candidate review receipts and decision reconstruction: `packages/inm-core/src/candidate-review.ts`
- Production evidence: `packages/inm-core/src/production-analysis.ts`
- Capacity evidence: `packages/inm-core/src/capacity-plan.ts`
- Compatible-run fab loss evidence: `packages/inm-core/src/fab-loss-analysis.ts`
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

Tests must prove exact CLI `data.result`/Core and Studio/Core snapshot parity, exact `nextActions[0]`/Core next-action equality, deterministic diagnostic/action identity, Candidate decision reconstruction across process reloads, memory-fab experiment/candidate discovery, empty-run read purity, and invalid explicit-selection rejection. A successful HTTP response or a visually similar summary is not parity evidence.

## Change checklist

- Add industrial conclusions to Core analysis or capacity planning before projecting them into the snapshot.
- Give every new diagnostic a namespaced code, typed subject, evidence source, priority, and valid operation references.
- Declare effect, write set, guards, and conditional availability for every new operation.
- Keep snapshot construction read-only and deterministic.
- Update CLI, Studio API, this document, and cross-surface parity tests together.

## Known next gaps

- Factory diagnostic overlays should eventually consume typed diagnostic subjects and highlight complete causal paths; they must not become a second prioritizer.
