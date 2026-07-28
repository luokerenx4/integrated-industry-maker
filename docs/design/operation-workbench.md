# Shared industrial operation result

Status: V1 Core industrial result contract and shared V1 CLI/Studio execution lifecycle implemented.

Related: [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/design/simulation-runtime]], [[docs/CLI]], [[plans/human-ai-workbench]].

## Scope

An industrial operation is one named invocation of existing Core behavior with an explicit project context, effect, result, and verification path. It prevents CLI and Studio from independently assembling validation, analysis, capacity, simulation, Benchmark, or Candidate semantics.

The V1 named operations are `validate`, `analyze`, `plan`, `simulate`, `benchmark.evaluate`, `candidate.preview`, and `candidate.apply`. Inspection remains the read-only workbench snapshot. Synthesis retains its dedicated authoring result until its required output-id input receives the same operation form. Workbench may advertise the existing `design.run` capability, but its availability is evidence-aware: a missing current result permits a fresh bounded run, while promotable, continuable, or exhausted current evidence makes the descriptor conditional and routes operators to the exact immutable authority. Long-running Design continues to own its richer deterministic progress and immutable-run contract rather than pretending to return this shorter result type.

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

Candidate operations deliberately do not compile the pre-patch base as their operation context. A generative Candidate may pin a schema-valid empty commissioning site whose Scenario references only become satisfiable after the exact patch. Preview first verifies the raw base hash, then applies, schema-validates, compiles, and evaluates the proposed Blueprint; its context hash is that proposed industrial state. Apply repeats the evaluation and reports the post-write compiled state. Invalid proposed factories still fail before a receipt or Blueprint write, so this ordering does not create a permissive path.

Refresh and a new process reconstruct industrial evidence from project files. Read-only results can be deterministically invoked again; simulation results reopen from the immutable run; Candidate decisions reopen from the receipt plus current Blueprint hash. An exact reviewed KEEP Blueprint is `verified`; a moved Blueprint that matches neither reviewed base nor proposal is `stale`.

Long-running execution has a separate, explicitly non-authoritative Core-owned operation handle. Benchmark, Candidate preview/apply, Design run, and Design continuation share one subject/status/progress/artifact/error contract across CLI and Studio. Studio returns a project-qualified operation id immediately and persists its ignored `.inm/operations/<id>/` store as `state.json`, `progress.json`, and, after successful completion, `result.json`. CLI creates the same kind of identity in-process and projects it into progress, success, and failure envelopes without requiring a Studio server. Page navigation and client disconnect only stop Studio observation; they do not cancel industrial work.

Host scheduling is operational rather than industrial authority. CLI `auto` may evaluate one/two-case work sequentially on its own event loop. Studio always requests responsive background scheduling: one/two cases use one isolated Worker and larger sets use bounded parallel Workers. Cold baseline and fresh Candidate waves share that operation-owned executor. Studio `DELETE` or CLI `SIGINT`/`SIGTERM` is the explicit cancellation boundary. Core checks it between sequential cases or terminates an outstanding isolated/parallel Worker wave so no partial Design Run is written.

Core owns the point of no return. If it observes cancellation before the artifact/write boundary, execution terminates as `cancelled`. If a cancellation request arrives after Core has committed and returned a complete result, completion and its artifacts win; the handle may retain `cancelRequestedAt`, but an outer registry may not relabel committed industrial work as cancelled.

`state.json` is the only list index. It contains the shared lifecycle state, latest bounded progress projection, created order, and an explicit `resultAvailable` bit, but never the progress log or result. `progress.json` retains at most 256 progress events for one exact reconnect. Completion first atomically writes `result.json`, then atomically publishes completed state with `resultAvailable: true`; list readers see only the last committed state. Exact reads compose all three files and reject an incomplete dense record.

The registry retains sixteen newest terminal operations per project plus any live operations. Pruning removes the complete operation directory. A Studio restart marks previously running committed state `interrupted`; it never invents a result or resumes from incomplete process memory. Root-level combined pre-release snapshots are deleted instead of migrated or dual-read. Immutable Design Runs and Candidate review receipts remain the evidence authority. The registry is execution/recovery state and may be pruned without changing the factory.

## Projections

CLI `validate`, `analyze`, `plan`, `simulate`, `benchmark`, and `candidate` commands call the named Core operation. Their versioned JSON envelope retains scoped output while `data.operation` carries the shared metadata without duplicating the dense payload.

Studio exposes project-qualified POST operations at `/api/projects/<project-id>/operations/{validate,analyze,plan,simulate}`. The Overview states effect, selection scope, guards, and an exact equivalent CLI command before execution. The result dialog exposes context/hashes, duration, diagnostics, artifacts, actual writes, verification, and CLI reproduction.

Benchmark, Candidate preview/apply, Design run, and Design continuation start from their domain routes and return `OperationExecutionStartResponse`. `GET /api/projects/<project-id>/operations` reads only the lightweight bounded `state.json` records; complete results and progress logs are fetched from `GET .../operations/<operation-id>` after selecting one exact identity. `DELETE` requests cancellation. Experiments and Design display the operation id and recover the newest exact subject after reopening their stable route. The list bytes and parse work therefore scale with retained operation count, not historical result size.

Experiment routes are lightweight direct surfaces. They use the project index plus `/experiments`, Candidate/review, and retained-operation endpoints, and they do not require the full Factory event payload, Overview snapshot, or observation brief merely to render one locked evaluation. The full operator workbench is loaded only after the user closes or leaves that surface. This routing difference changes presentation cost only; the Benchmark executor, operation identity, progress, result, and Candidate authority remain the shared Core contracts described above.

CLI V2 success/error envelopes always carry `execution`; ordinary commands use `null`. Long-operation NDJSON carries the same evolving state and id on every Core progress event. Completion records exact artifacts, duration, and event count. Cooperative cancellation returns exit `130`, `operation.cancelled`, no success value on stdout, and no partial immutable evidence.

## Source of truth

- Industrial result contract and executors: `packages/inm-core/src/operation.ts`
- Cross-surface execution lifecycle: `packages/inm-core/src/operation-execution.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio HTTP projection: `packages/inm-studio/src/server.ts`
- Studio execution registry and browser client: `packages/inm-studio/src/operation-registry.ts`, `packages/inm-studio/src/studio-operation-client.ts`
- Studio operation/result UI: `packages/inm-studio/src/main.tsx`

## Verification

Tests must prove a common serializable result shape, read-only empty write sets, simulation artifact creation/cache reuse, deterministic Candidate review receipts, commissioning from a schema-valid non-compiling base, proposed-state operation context, receipt-required apply, post-write hash verification, CLI metadata projection, and Studio endpoint parity. Registry tests prove active-subject deduplication, state-only listing despite unreadable dense files, durable-result-before-completed-state publication, retained progress/result recovery, explicit cancellation, restart interruption, whole-directory retention, and strict removal of combined pre-release snapshots. Candidate mutation scope and stale replay remain covered on temporary project copies. Browser QA must run mutating review/apply controls only on temporary project copies.

## Known next gaps

- Move synthesis behind the same typed input/result protocol.
