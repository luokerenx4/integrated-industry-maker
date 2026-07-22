# Project-local Design Programs

Status: strict authored or synthesized seed, loss-guided bounded proposal search over a locked Benchmark, immutable content-addressed design-run evidence, hash-addressed reopening, and exact Candidate promotion implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]], [[docs/design/project-boundaries]], [[docs/PROJECT_FORMAT]], [[docs/CLI]], [[plans/memory-fab-design-loop]].

## Product boundary

A Design Program coordinates industrial design without becoming another evaluator. It declares whether its working seed comes from an authored Blueprint or project-local synthesis, which locked multi-case Benchmark owns acceptance and the mutable promotion target, which Benchmark case supplies proposal evidence, which decision families an Agent may consider, and the maximum number of candidates it may evaluate.

The V1 flow is:

```text
design-programs/<id>.design.json
  → strict load + cross-contract validation
  → authored Blueprint or deterministic project-local synthesis
  → normalize working seed onto the Benchmark candidate revision lineage
  → read-only driver-case compile / analysis / capacity brief
  → deterministic driver simulation / metrics hash / fab-loss profile
  → bounded heuristic RFC 6902 proposals
  → in-memory candidate Blueprint
  → locked multi-case Benchmark evaluation
  → KEEP only when every gate passes and score improves over the current best
  → content-addressed design-runs/<program>/<result-hash>/
```

The program does not own World, asset, Process, Product Route, Scenario, Objective, Benchmark, or evaluator values. It refers only to project-local ids. There is no workspace-level strategy catalog or shared Design Program.

## Authored contract

`design-programs/<id>.design.json` contains:

- matching kebab-case `id`, name, and description;
- one locked Benchmark id;
- one strict seed union: `{ "kind": "blueprint", "blueprint": "<id>" }` or `{ "kind": "synthesis", "inputBlueprint": "<id>" }`;
- one driver case belonging to that Benchmark;
- either the Core `heuristic` provider or one project-relative TypeScript `project-strategy` entry, plus a unique allowlist of decision families;
- a positive `budget.maxCandidates`, capped at 100.

Decision families are stable industrial mutation scopes implemented by the shared research strategies: power, storage, generation, local logistics, station fleet/charge/high-speed control, buffering, local/station dispatch, recipe selection, generic or plan-derived capacity, qualified toolset expansion, work-center specialization, preventive maintenance, batch formation, and setup campaigns. Runtime `--max-candidates` may lower the authored budget but never raise it.

A synthesis seed loads the declared input Blueprint and invokes the same deterministic project-local synthesis boundary as `inm synthesize`, without writing an intermediate file. The generated industrial fields become the in-memory working seed, while its `revision` is set to the current hash of the Benchmark candidate Blueprint. This keeps provenance, evaluated content, and optimistic-concurrency target separate and makes the final best design reproducible as one ordinary restricted Candidate patch.

A `project-strategy` provider implements API V3 and receives only a deeply frozen, data-only copy of the current Blueprint, driver metrics, Core-derived fab-loss profile or `null`, production analysis, target-rate capacity plan, iteration number, and proposal history. Each history entry preserves the earlier proposal's Core-validated `addressedLoss` alongside strategy, hypothesis, decision, and score evidence, allowing a bounded strategy to diversify attempted targets without rewriting the current observation. Its synchronous `propose()` returns one named strategy, hypothesis, optional expected effect, measured `addressedLoss`, and restricted Blueprint patch, or `null` when exhausted. When Core observes a non-empty loss chain, the target is required and must name a bucket in that chain; a project strategy cannot fabricate or replace measured evidence. Core invokes the provider twice for the same input and rejects nondeterminism. The strategy prefix must belong to the Program's declared decision families, and the ordinary patch validator, compiler, complete locked Benchmark, and KEEP gates remain authoritative. The Design Program hash covers its JSON manifest plus proposal-provider source and, for a synthesis seed, project synthesis strategy source. Editing either strategy makes prior runs stale rather than silently changing their meaning.

The memory-fab Program uses `strategies/integrated-dram-proposals.ts`. It annotates a researched discrete portfolio with eligible loss buckets, counts prior attempts per recorded target, and ranks the least-attempted current target before chain position and authored order. This makes a six-candidate run move from release control into preventive maintenance, batch formation, and setup campaigns when those losses remain observed rather than spending its budget on adjacent CONWIP values. A candidate is useful evidence even when the complete Benchmark rejects it: the thirty-second furnace fallback lowers batch wait in the driver but is retained as a REJECT because lithography-interruption robustness regresses. Focused exhaustive research tools remain beside it under `strategies/research/`; they discover candidate policies, but only the declared provider participates in the shared bounded Design run and immutable evidence contract.

The public JSON Schema is discoverable as `inm schema design-program --json`. Unknown fields and the removed `seedBlueprint` form are rejected. Loading a brief additionally rejects an unlocked Benchmark, a driver case outside the Benchmark, missing seed inputs, synthesis failure or nondeterminism, and ordinary project compilation failure.

## Design brief

`buildDesignProgramBrief()` is read-only. It resolves and compiles the working seed under the exact driver World, Scenario, and Objective declared by the locked case, then returns:

- program and Benchmark hashes/contracts;
- declared seed source, source Blueprint hash, normalized working-seed hash, and synthesis method/entry/content hash/summary when present;
- separate Benchmark candidate Blueprint and current promotion-base hash;
- exact driver selection and all project input hashes;
- target-rate capacity state and gaps by kind;
- warning/info counts;
- declarative versus opaque Device counts;
- region, connection, tracked-Route, and power-grid topology counts.

It does not simulate, propose, create a run directory, edit a Blueprint, or create Candidate review evidence. The brief exists so both an Agent and Studio can establish the same bounded task before choosing an effectful operation.

## Bounded robust search

`runDesignProgram()` uses the driver case only to construct proposal input: the current best Blueprint's static analysis, capacity plan, deterministic driver metrics, Core-derived fab-loss profile, and invocation-local proposal history. Every history entry carries the exact `addressedLoss` already validated and stored for that iteration, whether its candidate was kept or rejected; a rejected attempt still consumed search budget and remains useful diversification evidence. Every iteration hashes the complete metrics object and records that hash with its source-neutral profile. This evidence is invocation-local and carries no fake persisted-run identity. Every proposal remains a restricted RFC 6902 patch under Blueprint-owned devices, connections, logistics networks, or policies.

The driver score never decides acceptance. Core evaluates each in-memory Blueprint through the complete locked Benchmark. A proposal advances the current best only when the Benchmark accepts every aggregate, per-case regression, and optional capacity gate and its aggregate candidate score strictly exceeds the previous best. Invalid Blueprint proposals are recorded as rejected evidence rather than partially written. Exhausted allowed strategy families end the run honestly.

Every valid iteration owns one `decisionEvidence` object for that exact second comparison boundary. `aggregate` records previous-best score, candidate score, and delta; ordered `cases` record the same three values per locked case; `limitingCase` names the first minimum-delta case in Benchmark order. `basis` is `benchmark-gate` when the ordinary evaluation is not accepted, `current-best-improvement` when all gates pass and the aggregate delta is strictly positive, or `no-current-best-improvement` otherwise. Only the gate basis copies evaluator-owned `gateReasons`; Design does not synthesize a competing acceptance explanation. Benchmark case `scoreDelta` retains its existing fixed-baseline meaning. Invalid patches have an error and no fabricated decision evidence.

Before seed evaluation, Core prepares the locked Benchmark baseline once per case: it validates every fixed input hash, compiles the baseline, simulates it with the locked seed, and retains only invocation-local compiled/evaluated evidence. Seed and proposal evaluation reuse that exact baseline side while compiling and simulating every candidate side normally. This changes physical work from `2 × cases × (candidates + 1)` simulations to `cases × (candidates + 2)` without persisting a cache, sharing candidate state, or changing logical `totalSimulationTicks`, scores, gates, decisions, or result identity.

The same call emits a versioned deterministic `DesignRunProgress` union through an optional callback: run start; baseline/seed/candidate case start and completion; proposal diagnosis with driver evidence; proposal identity and addressed loss; candidate decision with the same current-best evidence; and immutable result completion. Events contain sequence and actual completed/planned simulation work but no timestamps. They are operational evidence and are excluded from the Design Run manifest/hash. The contract is provider-independent: heuristic and project-local TypeScript proposal sources cross the same phases.

The current best never overwrites the seed source or promotion target. Program execution writes only immutable design evidence.

## Immutable design-run artifact

The deterministic result hash addresses:

```text
design-runs/<program-id>/<result-hash>/
  manifest.json
  best.blueprint.json
```

The manifest contains engine, project, program and Benchmark identities/hashes; declared seed source and source hash; synthesis provenance; normalized seed hash and evaluation; promotion-base Blueprint/hash; exact driver brief; effective budget; every iteration's driver metrics hash and source-neutral loss profile; every proposal strategy/family/hypothesis/addressed loss/patch/hash; validation error or full multi-case evaluation plus current-best decision evidence; KEEP/REJECT decision; best iteration/Blueprint hash/score/verdict/promotion-patch size; and stop reason. It deliberately has no creation timestamp, fake run identity, or absolute artifact path in its hashed content. Reopening replays the seed-to-KEEP evaluation lineage and rejects any decision evidence whose previous-best, case values, limiting case, basis, gate reasons, or final best diverge.

An identical program, locked inputs, seed, decision allowlist, candidate budget, and deterministic engine reproduce the same result hash. Re-execution verifies and reuses the existing artifact; conflicting content under the same result id is an error. `manifest.json` is written last so an interrupted directory is not mistaken for a completed result.

## CLI projection

`inm design <project>` lists project-local programs. `--program <id>` returns the read-only brief, completed run summaries, and an exact argv next action. `--run` is the explicit artifact-creating mode; `--max-candidates` can only narrow the manifest budget. Human progress names the observed loss chain, selected target, current-best decision basis, and limiting case on stderr; `--progress ndjson` exposes the complete Core evidence records to an Agent while preserving one final JSON stdout envelope. Human run/reopen output repeats that loss-to-decision relationship and concise reason. `--run-id <result-hash>` verifies and reopens one immutable result. JSON sections are `summary`, `static`, `iterations`, `best`, `runs`, and `all`, and a successful execution or reopen reports one immutable `design-run` artifact.

`--run-id <hash> --promote <candidate-id>` is the only Design-to-Candidate transition. Core first verifies the run's content hash, best-Blueprint hash, engine, current Program and Benchmark contract, and unchanged promotion-base Blueprint/hash. The best must be accepted and differ from that base. It is collapsed into one restricted patch from the current Benchmark candidate, checked against the recorded patch size, replayed to the exact immutable best hash, and written as an ordinary `candidates/<id>.candidate.json` with a `design-run` source record. A generated seed may therefore be promoted without a later winning proposal when synthesis itself is accepted and changes the target; an unchanged authored seed still has no patch. Promotion does not evaluate or apply the Candidate; the existing Candidate preview/review/apply lifecycle retains those authorities.

CLI uses the same Core program/brief/run objects and does not rebuild proposal or evaluation semantics.

Studio exposes a route-backed `/<project>/designs/<program>[/runs/<result-hash>]` control room. It loads the same Core summaries, brief, immutable runs, and promotion operation through project-qualified APIs. Its Design POST supports an `application/x-ndjson` response whose progress and final-result records are produced inside the same Core invocation; structured failures terminate the stream as typed error records. A human sees the actual baseline/seed/candidate case, live loss diagnosis, targeted proposal, and completed/planned simulations while running, followed by the locked contract, industrial readiness, score-ranked immutable result, every observed loss → addressed target → KEEP/REJECT effect, and Candidate handoff guard. Refresh, copied links, back/forward, and narrow-screen use reconstruct from the route and project artifacts rather than browser-only state.

## Source of truth

- Manifest, catalog, and brief: `packages/inm-core/src/design-program.ts`
- Execution and immutable artifact: `packages/inm-core/src/design-run.ts`
- Restricted built-in proposal strategies: `packages/inm-core/src/research.ts`
- Project-local provider boundary: `packages/inm-core/src/design-proposal-provider.ts`
- Robust evaluator: `packages/inm-core/src/benchmark.ts`
- Invocation-local baseline evaluation: `packages/inm-core/src/benchmark.ts` and `packages/inm-core/src/blueprint-comparison.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio projection: `packages/inm-studio/src/design-workbench.tsx` and `packages/inm-studio/src/server.ts`

## Verification

Tests must prove strict schema closure, filename identity, lock/seed/driver cross-contract validation, synthesis determinism and provenance, read purity, explicit decision-family confinement, Core-owned loss derivation, exact driver metrics hashing, missing/fabricated loss-target rejection, budget enforcement, locked multi-case evaluation, exact current-best aggregate/case evidence and limiting-case ordering, one baseline simulation per case, deterministic ordered progress, unchanged deterministic result hash, artifact reuse, content/hash/decision-lineage verification on reopen, exact promotion replay, stale promotion-base rejection, and byte-identical source/target/tuned Blueprint contents before Candidate apply. Public CLI tests must execute the real binary and prove list/brief/run/reopen effects, NDJSON loss/decision evidence, and artifact projection. Studio tests must consume the same streamed evidence and structured failure record.

## Known next gaps

- Memory-fab has honest proposal coverage for release/queue/Q-time, maintenance/yield, batch formation, setup campaigning, and selected dispatch/power controls, but not every facility, transport, or quality loss. Exhaustion is intentional until those intervention families have defensible Blueprint controls.
