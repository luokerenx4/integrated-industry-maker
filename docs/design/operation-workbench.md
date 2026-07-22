# Shared industrial operation result

Status: V1 Core operation contract, CLI projection, Studio execution/result dialog, immutable simulation artifacts, and guarded Candidate application implemented.

Related: [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/design/simulation-runtime]], [[docs/CLI]], [[plans/human-ai-workbench]].

## Scope

An industrial operation is one named invocation of existing Core behavior with an explicit project context, effect, result, and verification path. It prevents CLI and Studio from independently assembling validation, analysis, capacity, simulation, Benchmark, or Candidate semantics.

The V1 named operations are `validate`, `analyze`, `plan`, `simulate`, `benchmark.evaluate`, `candidate.preview`, and `candidate.apply`. Inspection remains the read-only workbench snapshot. Synthesis retains its dedicated authoring result until its required output-id input receives the same operation form.

## Result contract

Every completed operation returns `ProjectOperationResult<T>` with:

- contract version, stable operation id, effect, completion status, and measured duration;
- exact project identity, effective World/Blueprint/Scenario/Objective selection, and all input hashes;
- operation-owned diagnostics;
- generated or mutated artifacts;
- the actual write set, which is empty for read-only work and for a cache-hit simulation;
- recommended verification steps;
- one typed operation-specific data payload.

The descriptor in [[docs/design/operator-workbench]] advertises availability and possible writes before invocation. The operation result records actual writes after invocation. A descriptor is not execution history, and a browser result dialog is not authority.

## Effects and persistence

- Validation, nominal analysis, capacity planning, and Benchmark evaluation are read-only.
- Simulation creates or reuses exactly one immutable `runs/<id>/` artifact. A cache hit reports an empty actual write set.
- Candidate review evaluates the exact proposal and creates or reuses one deterministic immutable `candidate-reviews/<candidate>/<proposal-hash>.review.json` artifact containing the locked verdict, hashes, and result evidence.
- Candidate application requires that project-local receipt, re-evaluates the proposal, checks the reviewed proposal/base/proposed hashes and KEEP verdict, atomically writes only the declared candidate Blueprint, and verifies the resulting file against the recorded proposed hash.

Refresh and a new process reconstruct evidence from project files. Read-only results can be deterministically invoked again; simulation results reopen from the immutable run; Candidate decisions reopen from the receipt plus current Blueprint hash. An exact reviewed KEEP Blueprint is `verified`; a moved Blueprint that matches neither reviewed base nor proposal is `stale`.

## Projections

CLI `validate`, `analyze`, `plan`, `simulate`, `benchmark`, and `candidate` commands call the named Core operation. Their versioned JSON envelope retains scoped output while `data.operation` carries the shared metadata without duplicating the dense payload.

Studio exposes project-qualified POST operations at `/api/projects/<project-id>/operations/{validate,analyze,plan,simulate}`. The Overview states effect, selection scope, guards, and an exact equivalent CLI command before execution. The result dialog exposes context/hashes, duration, diagnostics, artifacts, actual writes, verification, and CLI reproduction. Existing Benchmark and Candidate routes also invoke the shared Core operations while retaining their richer review presentation.

## Source of truth

- Operation contract and executors: `packages/inm-core/src/operation.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio HTTP projection: `packages/inm-studio/src/server.ts`
- Studio operation/result UI: `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove a common serializable result shape, read-only empty write sets, simulation artifact creation/cache reuse, deterministic Candidate review receipts, receipt-required apply, post-write hash verification, CLI metadata projection, and Studio endpoint parity. Candidate mutation scope and stale replay remain covered on temporary project copies. Browser QA must run mutating review/apply controls only on temporary project copies.

## Known next gaps

- Move synthesis behind the same typed input/result protocol.
- Add persisted operation-result routes only if a new artifact owns them; do not invent browser-only history.
