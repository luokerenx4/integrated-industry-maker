# Agent-facing CLI contract

Status: V4 summary-first human/Agent parity with resumable Investigation Candidate-cycle identity and explicit diagnostic disposition implemented.

Related: [[docs/CLI]], [[docs/design/development-operations]], [[docs/design/operator-workbench]], [[docs/design/coding-agent-optimization]], [[docs/design/experiment-workbench]], [[docs/PROJECT_FORMAT]], [[plans/human-ai-workbench]].

## Purpose

`inm` is the high-bandwidth operating surface for a Coding Agent. It exposes the same Core project, analysis, planning, simulation, Benchmark, Candidate, and persistent Investigation semantics as Studio without requiring canvas interpretation, prose scraping, hidden browser state, or source-code inspection.

The contract is a presentation protocol, not a second industrial API. Commands call existing Core loaders and operations, then select and envelope their results. Project files and immutable run artifacts remain authoritative.

## Versioned envelopes

Every successful `--json` invocation writes exactly one JSON value to stdout:

```json
{
  "schemaVersion": 2,
  "ok": true,
  "command": "inspect",
  "context": { "scope": "project", "project": {}, "selection": {}, "hashes": {} },
  "data": {},
  "diagnostics": [],
  "artifacts": [],
  "nextActions": [],
  "execution": null
}
```

Project-selection commands include the resolved project identity, effective World/Blueprint/Production Plan/Scenario/Objective, and all compiled input hashes. Workspace/global commands expose their honest smaller context. Project-wide Benchmark and Candidate results retain their case or proposal hashes in `data` because they can span a selection or compare several selections.

Every failed `--json` invocation writes no stdout and exactly one error envelope to stderr:

```json
{
  "schemaVersion": 2,
  "ok": false,
  "command": "candidate",
  "context": { "scope": "global" },
  "error": {
    "code": "candidate.stale-base",
    "message": "...",
    "retryable": false,
    "issues": [],
    "hashes": { "expectedBaseHash": "...", "currentCandidateHash": "..." }
  },
  "execution": null
}
```

Error codes and structured issue paths are stable machine contracts. Display messages may improve. Exit `0` means success, `1` means an operation/validation/test failure, `2` means invalid CLI usage, and `130` means an operator cancelled a cooperative long operation. JSON stdout is reserved for the result.

Every V2 envelope has `execution`. Ordinary bounded commands use `null`. Benchmark evaluation, Candidate preview/apply, Design run, and Design continuation use the same Core `OperationExecutionState` as Studio: one id, exact subject, project, running/terminal status, timestamps, cancellation request, duration, latest Core progress, progress-event count, completion artifacts, and error. The CLI creates this identity locally and does not require a Studio server. The execution handle is operational state; the completed Core result, Candidate receipt, Blueprint, or immutable Design Run remains industrial authority.

Strict Design Run reopen is one such contract: obsolete evidence returns `design.invalid-run` and never becomes rankable, continuable, or promotable. Studio consumes the same project-qualified API code/message. Its visual projection may keep the copied hash selected and explain that it is historical, but it does not reinterpret or suppress the strict machine failure and does not describe the read as though an effectful Design operation failed.

Long-running Design execution has one explicit secondary channel. `inm design --run --progress ndjson --json` writes compact versioned progress envelopes to stderr and exactly one ordinary success envelope to stdout at completion. Each V2 record is `{ "schemaVersion": 2, "type": "progress", "command": "design", "execution": ..., "progress": ... }`; every record advances the same execution id and embeds the current shared lifecycle state beside the exact Core `DesignRunProgress` projected by Studio. Case events preserve Benchmark execution mode/concurrency, cache reuse, and operational timing. Proposal diagnosis names the selected branch and carries its exact proposal-time promotion boundary plus driver evidence; proposal completion retains that branch identity and the Core-validated addressed loss or repair case; a continuation-only driver replay is an explicit start/completion phase; node exhaustion identifies the retained node and exact next searchable node without pretending an evaluation occurred; candidate completion carries KEEP/BRANCH/REJECT, leader comparison, parent and candidate nodes, pruning, leader-after, and exact searchable/exhausted state later stored in immutable evidence. The stream is ordered and reports actual named phases plus completed/planned case evaluations rather than calling cache hits or hidden work “simulations.” Case identities, evidence, and work totals are deterministic; host-selected execution mode/concurrency, start/completion interleaving, cache reuse, and elapsed timings are operational and not immutable evidence. `--progress human` starts with the operation id and formats the same execution/cache/timing, branch lineage, promotion blocker, loss chain, target, replay, exhaustion, decision basis, parent/leader deltas, and frontier outcome for a terminal, while `--progress off` disables the channel.

Standalone Benchmark and Candidate evaluation use the same secondary-channel rule. `--progress ndjson --json` emits one `benchmark` or `candidate` progress envelope per Core case event on stderr and reserves stdout for the single final result. `BlueprintBenchmarkProgress` V3 identifies the exact locked case, monotonic sequence, completed/total case evaluations, `sequential`, `isolated`, or bounded-`parallel` execution mode, concurrency, baseline-cache reuse, and operational compilation/cache/evaluation/comparison/Worker timings. Benchmark uses locked-baseline and Candidate phases. Candidate review uses locked-baseline, current-factory, and proposed-factory phases because its incremental comparison requires one additional exact wave. CLI `auto` keeps one/two-case commands sequential; Studio `background` selects isolated execution for those cases and parallel execution for larger sets. Starts and completions remain ordered by the locked manifest; Worker finish order never changes Agent evidence. Timings diagnose runtime cost but are never copied into a Benchmark result, Candidate receipt, Design Run, or content hash. Human mode is the default only for non-JSON evaluation; JSON mode defaults to `off`. `--progress off` remains available for pipelines that want no secondary channel.

`SIGINT` and `SIGTERM` request cancellation through the same `AbortSignal` used by Studio. Sequential execution observes it between exact cases; isolated and parallel execution terminate every outstanding Worker and reject the whole wave. A cancelled Design writes no partial immutable run; a cancelled Candidate Apply does not cross its guarded write boundary. If the request arrives only after Core has atomically committed and returned, the completed result wins rather than being falsely relabelled. JSON/NDJSON mode emits no prose: any earlier progress lines are followed by one compact V2 error envelope with `error.code: operation.cancelled`, the same execution id, terminal `cancelled` status, and no invented completion artifact. A second signal is the explicit immediate-termination escape hatch.

INM is pre-alpha. An envelope/schema version change replaces commands, documentation, and public-binary tests together; it does not add legacy output aliases.

## Discovery

`inm help --json` returns every public command with:

- stable command id and usage;
- arguments, types, requirement state, defaults, and choices;
- read/write or mode-dependent effect;
- JSON support and selectable output sections;
- success, failure, and usage exit codes.

`observe` is the machine-discoverable multimodal handoff. It is read-only, accepts the ordinary exact selection plus an optional compatible immutable run id, and returns one Core-owned `FactoryObservationBrief`: hashes, evidence identity, leading diagnostic, stable run-qualified Studio views, and the required human/Agent hypothesis statements. The CLI deliberately returns visual targets rather than image pixels so browser-capable Agents, Playwright/MCP clients, and humans can use the same Harness contract without binding Core to one browser vendor. See [[docs/design/observation-led-design]].

`investigate` is the persistent counterpart to that handoff. Flagless project mode lists compact project-local inquiries. Creation freezes one exact compatible operating Run, Run-backed diagnostic, selection/hashes, current Core handoff, and optional commissioned Candidate lineage. Append mode writes one explicit human/Agent observation, falsifiable hypothesis with required `blueprint|production-plan` intervention and expected effect, or keep/revise/defer/discard decision into a strict hash chain. It may name one reviewed Candidate; Core resolves the exact review identities, derives `<candidate>-review` when no anchor id is supplied, and automatically adds the introduced anchor to that entry's evidence. A decision may instead or additionally pass `--target-diagnostic-anchor <anchor-id>`; the anchor is automatically cited, must carry diagnostic evidence at that sequence, and becomes authoritative only while exact current Workbench identity still agrees. An observation may use `--capture-observation <anchor-id>` for the exact current checkpoint, or `--capture-comparison <anchor-id> --from-run <id> --to-run <id>` for one strict recomputable immutable Run comparison whose exact intervention and TO Run become cited context. Core accepts no generated hashes, deltas, intervention inference, diagnostic prose, or verdict. The three introduced-evidence modes are mutually exclusive. Inspection returns the newest Blueprint hypothesis's complete `candidateCycle`: every exact sourced Candidate plus proposal/review, parent-bound TRIAL, retained comparison, and disposition identity. Human output prints the same compact ledger. Ambiguous or broken branches fail closed rather than choosing by score, filename, or recency. Workbench V18 reuses exact Candidate-linked and diagnostic-target decisions; changed evidence identity invalidates either projection automatically.

A `blueprint` hypothesis may use `--create-candidate`, `--hypothesis-entry`, `--benchmark`, `--candidate-name`, and `--patch-file` to create one Candidate while Core derives its prose, source hashes, current base hash, and newest directly cited checkpoint. Inspection then resumes the exact `review-candidate`, `simulate-candidate`, `compare-candidate`, or `decide-candidate` phase. The Agent executes those boundaries with the existing `inm candidate --review`, `inm candidate --run`, `inm compare`, and explicit `inm investigate --entry ... --attach-candidate` commands; it does not need a browser-local session record. A `production-plan` hypothesis is rejected by Candidate creation and instead returns `author-production-plan`. `--create-production-plan`, `--hypothesis-entry`, and `--production-plan-file` consume a complete explicit plan while Core derives a source-pinned revision receipt, control identity, before/after hashes, and semantic patch. Inspection then advances through `simulate-production-plan` and `compare-production-plan` only when the exact result Run exists. `summary`, `anchors`, `entries`, and `all` remain bounded explicit sections. No mode invents a patch or plan, edits a Blueprint, changes the default plan, runs a simulation implicitly, or turns authored prose or score into automatic design authority. See [[docs/design/industrial-investigations]].

Studio lifecycle discovery uses separate `studio.start`, `studio.status`, `studio.restart`, `studio.stop`, and `studio.serve` descriptors. Managed commands omit a default for `port`: without `--port` they discover the exact target's project-local service or allocate a bounded non-destructive fallback; supplying `--port` is strict. Their ordinary versioned envelopes include the selected port and its `explicit`, `managed`, `default`, or `fallback` provenance; expected, serving-server, attempted, and running-manager runtime-source hashes; supervisor phase, generation, bounded failure, and retry state; plus per-process and aggregate `current`, `stale`, `degraded`, `recovering`, or `not-running` state. When several fully verified managers exist for the same target, `targetConvergence` names the observed ports, deterministic selected port, retired ports, and whether read-only status still has pending cleanup. Foreground `serve` intentionally owns the terminal, defaults to `4176`, and has no JSON mode. A same-project stale or degraded managed process may be retried, replaced, restarted, or stopped only when its project-local state verifies the exact live ownership record; an ownership-incomplete duplicate prevents all automatic cleanup. Lifecycle identity and non-destructive port behavior are defined by [[docs/design/development-operations]].

`session` composes that managed lifecycle with an authoritative project target. Without target flags it fetches the exact source-current Studio `ProjectWorkbenchSnapshot` and returns one strict `target: { kind: "project-next-action", nextAction }`; the envelope's sole next action is the same Core-owned id, reason, argv, effect, confirmation boundary, Studio route, and typed target. With `--investigation ID`, it resolves the exact Investigation through that same server and returns `target: { kind: "investigation", investigation, handoff }`, including phase, source entry/hash, evidence ids, Candidate-cycle identities, authorship requirements, and stable authoring route. Entry remains read-only. With `--experiment ID`, the result instead carries `target: { kind: "experiment", experiment }` and opens the authored lightweight deep link. Investigation and Experiment targets are mutually exclusive, and only the explicit Experiment form accepts `--run`; invalid combinations fail before lifecycle mutation. `--no-open --json` is the Agent form. A verified same-project recovery whose supervisor is already attempting the caller's exact source may receive one bounded wait; exact convergence returns normally. Changed ownership/source, an unexpected exit from recovery, and bounded timeout are typed retryable failures. A degraded adoption triggers one explicit supervisor retry and otherwise fails with `session.studio-degraded` plus the exact preflight/startup evidence. Unknown listeners and foreign projects are never waited on or hidden behind a generic refused connection. This does not replace the standalone `benchmark` command or give its local process false resumability.

`inm schema --json` lists every authored project artifact kind. `inm schema <kind> --json` returns a deterministic JSON Schema Draft 7 projection of the authoritative strict Zod schema. This includes workspace/project manifests, World, Blueprint, Production Plan, Scenario, Objective, Resource/Device assets and visuals, Process, Product Route, Benchmark, Candidate Change Set, Design Program, Investigation manifest, and Investigation entry.

The generated schema is authoring/discovery material. Core still performs path confinement, cross-reference resolution, geometry, runtime, and other semantic compilation checks that JSON Schema alone cannot express.

## Summary-first sections

Dense JSON commands default to `{ "section": "summary", "result": ... }`. An Agent requests one advertised section with `--section <name> --json` or the complete Core result with `--section all --json`. A section is a projection of one already-computed result; it never invokes a smaller or divergent evaluator.

Current sectioned commands are `inspect`, `analyze`, `plan`, `compare`, `benchmark`, `candidate`, `design`, `synthesize`, `simulate`, and `research`. `inm help --json` is the authority for each command's section names. `--section` without `--json`, and unknown sections, fail with stable CLI codes.

`compare` advertises two mutually exclusive flag pairs. `--from-blueprint/--to-blueprint` runs a fresh controlled Blueprint evaluation and accepts explicit selection plus seed. `--from-run/--to-run` verifies and explains two immutable executions with exactly one changed Blueprint or Production Plan and rejects fresh-selection flags. Run summary exposes the intervention kind and FROM/TO ids/hashes, semantic change counts, scheduled/released/completed/on-time and delivered/WIP deltas, unchanged guardrails, verdict, and stable Factory/Studio navigation; `changes`, `evaluation`, `losses`, and `all` expose the same Core object at increasing density. Human output carries the same facts and states that score classification is not an automatic industrial decision.

Diagnostics required to understand a summary remain in the envelope's `diagnostics` field even when the selected result section is compact. `artifacts` names produced/reused paths and immutability. For `inspect`, `nextActions` contains exactly the Core-owned `ProjectWorkbenchSnapshot.nextAction`, including its exact argv, effect, confirmation requirement, Studio route, and typed target; `--section next-action --json` returns the same object in `data.result`. The bounded summary includes the Objective's exact WIP Resource scope, compatible-run inventory accounting when available, every project-local Design Program's current-Blueprint alignment plus its `missing`, `promotable`, `continuable`, `exhausted`, or `not-applicable` evidence state, authority run id, authority-addressed loss buckets, current/historical/invalid counts, and complete current loss dispositions. A compatible measured loss targets either the aligned Program's read-only brief or the exact current Design result. Exact-result argv includes `--run-id <hash> --json`, remains read-only, and never auto-executes the artifact-creating run. The `design.run` operation descriptor separately reports whether a fresh run is available or conditional on reviewing/changing current evidence. `simulate` summary likewise retains the complete `inventoryAccounting` object, while `metrics` remains the complete evaluator result. The compact loss summary retains the complete primary bucket. `--section losses --json` returns every bucket and its ordered contributors: Q-time carries Route/step/Process/lot timing; V7 input starvation carries exact Device/Process/Resource/Buffer/quantity, immediate connection/source, endpoint status, in-flight quantity, and conserved observed supply-state intervals; transport blocking carries connection/Resource/flow/capacity plus its strict immediate-cause partition; and quality carries exact defect-origin outcomes. `--section dispositions --json` separately returns each hash-current `bounded-deferred` record with its diagnostic, exact contributor/metric/value, source Program/Benchmark/Run, observed compatible run, attempt/improvement/rejection counts, decision-basis counts, best measured reduction, and invalidation bindings. The underlying loss remains present in `losses`; disposition is a decision boundary, not a rewritten physical result. Other commands may return operation-specific follow-ups. An Agent never has to parse prose or shell-escape a synthesized command string.

Current versus historical Design evidence binds the complete driver selection and selection-scoped execution hashes. A structurally valid immutable run evaluated under different reachable equipment/runtime physics remains inspectable but cannot become current authority through result-hash ordering. Unselected catalog inventory is descriptive and does not make otherwise exact driver evidence historical.

Benchmark and Candidate summaries retain `outcomeGuardrails: { total, passed, failed, evidence }`. Evidence is ordered by authored guardrail and locked Benchmark case and includes metric, label, direction, baseline/candidate values and pass states, plus the absolute threshold. Candidate summary explicitly names `lockedBaselineScoreDelta` and adds one bounded `currentFactory` projection. `status: evaluated` includes aggregate verdict/delta, ordered per-case current/proposed score, capacity, WIP, on-time lots, leading Objective-component drivers, current/proposed hard outcomes, and each side's complete typed `objectiveConstraints`. It also includes one Core-owned `physicalEconomics` comparison whose current/proposed/delta snapshots separate equipment-and-facility cost, sorter-endpoint cost, unique transport-line cost, occupied area, equipment area, and transport-cell count while reconciling total cost and area with the evaluator. Each constraint has a stable id/label, source, closed metric/direction/unit, actual, threshold, non-negative deficit, pass state, and optional delivery-contract identity. Human Candidate output prints the same recovered-versus-spent ledger and exact build-cost boundary; humans and Agents do not reconstruct capital from raw patch operations. Human Benchmark and Candidate output expands the same exact failing comparison, so `constraintPenalty: -1000000` never requires prose parsing or source inspection. `status: not-operational` instead reports `NOT_COMPARABLE` and the exact reason. Dense remaining metric snapshots stay behind `--section evaluation` and `--section all`, where the fixed `lockedCompliance` and current-factory record stay separate. Summary projection does not recompute either authority.

Candidate is inspect-first. Flagless `inm candidate` reads Candidate state and an existing receipt without starting a CLI execution or emitting progress; `--review` explicitly runs and records evaluation. Investigation-sourced summaries include the resolved manifest/entry identity, author, statement, expected effect, evidence ids, navigation, current/historical state, and exact inherited operating-context anchor/Run/hashes. An invalid source produces no review next action. A reviewed sourced Candidate offers an exact `candidate.simulate` action: `--run` verifies the current receipt, replays the patch only in memory under the source operating selection, and writes/reuses an immutable `TRIAL` Run containing Candidate/review/parent identity without applying the proposal. The Run result exposes `summary`, `artifact`, `metrics`, and `all`, then returns exact Run-comparison argv. The return-to-Investigation action remains explicit, while a non-KEEP result also exposes the deterministic `revisionBrief` and exact current-factory `inm observe` argv. `--apply` requires a recorded KEEP and performs one guard evaluation before its atomic write; it does not pre-run another preview. Inspect, review, trial, and apply are mutually exclusive modes in `inm help --json`.

The `design` summary keeps seed provenance, declared Workbench focus, continuation lineage, and search risk policy machine-visible. `program.seed` declares authored Blueprint versus synthesis input; `program.focus` is normalized to broad, an exact ordered loss list, or an Objective component with optional exact WIP locations; `program.currentBestGuardrail` declares unrestricted, uniform, or exact case-specific leader regression budgets; `program.frontier` bounds non-promotable alternatives. Human output prints the same Focus line and Studio shows it in both Program list and contract. Iteration `promotionBoundary` names the selected-node comparison available before proposal, `evaluation` retains fixed-Benchmark-baseline semantics, `decisionEvidence` names the post-candidate leader comparison, and `frontierEvidence` names the parent, parent delta, outcome, pruning, leader and scheduler state. `addressedLoss`, `addressedObjectiveTarget`, and `addressedCase` are mutually exclusive causal/repair claims. Exact loss and Objective targets retain complete candidate driver evidence plus before/after/delta/improved results. NDJSON V5 emits `loss-target-completed` or `objective-target-completed`; human output labels both exact causal boundaries. A non-improving declaration is machine-visible as `addressed-loss-not-improved` or `addressed-objective-not-improved` and cannot be promoted or branched.

Reopening a `budget-exhausted` result with a searchable node returns an exact `design.continue:<hash>` next action whose argv uses `--run-id <hash> --continue --max-candidates N`. The continued final envelope uses action `continue`, reports cumulative evaluated/maximum counts, direct source identity, and one new immutable artifact. Its NDJSON progress has Core version 5 and makes `previousEvaluated`, `additional`, cumulative `maximum`, and reused source iterations explicit; Agents can therefore prove that seed and old Candidate cases were not replayed. A promotion next action remains independent and appears only for an accepted leader with a non-empty recorded promotion patch. The resulting `candidate.preview:<id>` action is `creates-artifact`, not read-only, because successful review records or reuses an immutable decision receipt before any possible apply. Invalid mode combinations, missing run ids, stale inputs, exhausted frontiers, and replay divergence use stable CLI/Core error codes rather than prose inference.

## Source of truth

- Envelope types and builders: `packages/inm-cli/src/contract.ts`
- Shared lifecycle contract and CLI tracker: `packages/inm-core/src/operation-execution.ts`, `packages/inm-cli/src/execution.ts`
- Command capability descriptors: `packages/inm-cli/src/capabilities.ts`
- JSON Schema projection: `packages/inm-core/src/artifact-schema.ts`
- Command result sections, progress projection, and formatting: `packages/inm-cli/src/commands.ts`
- Public parsing and exit behavior: `packages/inm-cli/src/bin.ts`

## Verification

Tests invoke the public TypeScript binary and capture its real stdout, stderr, signal handling, and exit code. They prove machine help including `--continue`, cancellation exit `130`, and Benchmark/Candidate progress discovery; every advertised artifact schema; compact/default/all sections; exact Core snapshot parity through `inspect --section all`; stable success/error envelopes; deliberate Candidate mutation; stale replay rejection; no partial stdout on cancellation; one retained execution id across NDJSON and the terminal envelope; exact continuation next-action argv; and exact progress parity with Core Design and Benchmark execution.

```bash
bun test packages/inm-core/src/artifact-schema.test.ts packages/inm-cli/src/commands.test.ts
bun run typecheck
```

## Change checklist

- Add a capability descriptor whenever a public command or argument changes.
- Add a schema kind whenever a new authored project artifact becomes part of the format.
- Keep default summaries bounded and put dense arrays behind named sections.
- Preserve one result value on stdout in JSON mode.
- Put opt-in incremental evidence on stderr as versioned NDJSON and keep it free of prose.
- Return exact argv arrays, not shell command strings, for next actions.
- Exercise success and failure through the public binary, not only an imported command function.
