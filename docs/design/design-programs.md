# Project-local Design Programs

Status: strict Design Program, read-only design brief, bounded heuristic or project-local TypeScript proposal search over a locked Benchmark, immutable content-addressed design-run evidence, hash-addressed reopening, and exact Candidate promotion implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]], [[docs/design/project-boundaries]], [[docs/PROJECT_FORMAT]], [[docs/CLI]], [[plans/memory-fab-design-loop]].

## Product boundary

A Design Program coordinates industrial design without becoming another evaluator. It declares which existing candidate Blueprint is the seed, which locked multi-case Benchmark owns acceptance, which Benchmark case supplies proposal evidence, which built-in decision families an Agent may consider, and the maximum number of candidates it may evaluate.

The V1 flow is:

```text
design-programs/<id>.design.json
  → strict load + cross-contract validation
  → read-only driver-case compile / analysis / capacity brief
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
- one existing seed Blueprint, which in V1 must be the Benchmark candidate Blueprint;
- one driver case belonging to that Benchmark;
- either the Core `heuristic` provider or one project-relative TypeScript `project-strategy` entry, plus a unique allowlist of decision families;
- a positive `budget.maxCandidates`, capped at 100.

Decision families are stable industrial mutation scopes implemented by the shared research strategies: power, storage, generation, local logistics, station fleet/charge/high-speed control, buffering, local/station dispatch, recipe selection, generic or plan-derived capacity, qualified toolset expansion, and work-center specialization. Runtime `--max-candidates` may lower the authored budget but never raise it.

A `project-strategy` provider receives only a deeply frozen, data-only copy of the current Blueprint, driver metrics, production analysis, target-rate capacity plan, iteration number, and proposal history. Its synchronous `propose()` returns one named strategy, hypothesis, optional expected effect, and restricted Blueprint patch, or `null` when exhausted. Core invokes it twice for the same input and rejects nondeterminism. The strategy prefix must belong to the Program's declared decision families, and the ordinary patch validator, compiler, complete locked Benchmark, and KEEP gates remain authoritative. The Design Program hash covers both its JSON manifest and provider source, so edited strategy code makes prior runs stale rather than silently changing their meaning.

The memory-fab Program uses `strategies/integrated-dram-proposals.ts`. Focused exhaustive research tools remain beside it under `strategies/research/`; they can discover candidate policies, but only the declared provider participates in the shared bounded Design run and immutable evidence contract.

The public JSON Schema is discoverable as `inm schema design-program --json`. Unknown fields are rejected. Loading a brief additionally rejects an unlocked Benchmark, a driver case outside the Benchmark, a seed different from the Benchmark candidate, or ordinary project compilation failure.

## Design brief

`buildDesignProgramBrief()` is read-only. It compiles the seed under the exact driver World, Scenario, Objective, and seed declared by the locked case, then returns:

- program and Benchmark hashes/contracts;
- exact driver selection and all project input hashes;
- target-rate capacity state and gaps by kind;
- warning/info counts;
- declarative versus opaque Device counts;
- region, connection, tracked-Route, and power-grid topology counts.

It does not simulate, propose, create a run directory, edit a Blueprint, or create Candidate review evidence. The brief exists so both an Agent and Studio can establish the same bounded task before choosing an effectful operation.

## Bounded robust search

`runDesignProgram()` uses the driver case only to construct proposal input: the current best Blueprint's static analysis, capacity plan, deterministic driver metrics, and invocation-local proposal history. Every proposal remains a restricted RFC 6902 patch under Blueprint-owned devices, connections, logistics networks, or policies.

The driver score never decides acceptance. Core evaluates each in-memory Blueprint through the complete locked Benchmark. A proposal advances the current best only when the Benchmark accepts every aggregate, per-case regression, and optional capacity gate and its aggregate candidate score strictly exceeds the previous best. Invalid Blueprint proposals are recorded as rejected evidence rather than partially written. Exhausted allowed strategy families end the run honestly.

The current best never overwrites the seed. Program execution writes only immutable design evidence.

## Immutable design-run artifact

The deterministic result hash addresses:

```text
design-runs/<program-id>/<result-hash>/
  manifest.json
  best.blueprint.json
```

The manifest contains engine, project, program and Benchmark identities/hashes; seed evaluation; exact driver brief; effective budget; every proposal strategy/family/hypothesis/patch/hash; validation error or full multi-case evaluation; KEEP/REJECT decision; best iteration/Blueprint hash/score/verdict; and stop reason. It deliberately has no creation timestamp or absolute artifact path in its hashed content.

An identical program, locked inputs, seed, decision allowlist, candidate budget, and deterministic engine reproduce the same result hash. Re-execution verifies and reuses the existing artifact; conflicting content under the same result id is an error. `manifest.json` is written last so an interrupted directory is not mistaken for a completed result.

## CLI projection

`inm design <project>` lists project-local programs. `--program <id>` returns the read-only brief, completed run summaries, and an exact argv next action. `--run` is the explicit artifact-creating mode; `--max-candidates` can only narrow the manifest budget. `--run-id <result-hash>` verifies and reopens one immutable result. JSON sections are `summary`, `static`, `iterations`, `best`, `runs`, and `all`, and a successful execution or reopen reports one immutable `design-run` artifact.

`--run-id <hash> --promote <candidate-id>` is the only Design-to-Candidate transition. Core first verifies the run's content hash, best-Blueprint hash, engine, current Program and Benchmark contract, and unchanged seed hash. A seed-only run cannot be promoted. A leading result is collapsed into one restricted patch from the current seed, replayed to the exact recorded Blueprint hash, and written as an ordinary immutable `candidates/<id>.candidate.json` with a `design-run` source record. Promotion does not evaluate or apply the Candidate; the existing Candidate preview/review/apply lifecycle retains those authorities.

CLI uses the same Core program/brief/run objects and does not rebuild proposal or evaluation semantics.

Studio exposes a route-backed `/<project>/designs/<program>[/runs/<result-hash>]` control room. It loads the same Core summaries, brief, immutable runs, and promotion operation through project-qualified APIs. A human sees the locked contract, seed/driver, bounded budget, industrial readiness, allowed decisions, score-ranked runs, every KEEP/REJECT effect, and the same Candidate handoff guard without reading JSON. Refresh, copied links, back/forward, and narrow-screen use reconstruct from the route and project artifacts rather than browser-only state.

## Source of truth

- Manifest, catalog, and brief: `packages/inm-core/src/design-program.ts`
- Execution and immutable artifact: `packages/inm-core/src/design-run.ts`
- Restricted built-in proposal strategies: `packages/inm-core/src/research.ts`
- Project-local provider boundary: `packages/inm-core/src/design-proposal-provider.ts`
- Robust evaluator: `packages/inm-core/src/benchmark.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio projection: `packages/inm-studio/src/design-workbench.tsx` and `packages/inm-studio/src/server.ts`

## Verification

Tests must prove strict schema closure, filename identity, lock/seed/driver cross-contract validation, read purity, explicit decision-family confinement, budget enforcement, locked multi-case evaluation, deterministic result hash, artifact reuse, content/hash verification on reopen, exact promotion replay, and byte-identical seed Blueprint contents. Public CLI tests must execute the real binary and prove list/brief/run/reopen effects and artifact projection.

## Known next gaps

- Add progress evidence and safe evaluation reuse so larger candidate budgets do not look stalled or repeat unchanged case work.
- Add progress evidence and safe evaluation reuse to project-local providers as well as the built-in heuristic.
- Allow a Design Program to invoke the implemented project-local tracked-route synthesis strategy as its declared seed instead of requiring its seed to equal the Benchmark candidate Blueprint.
- Replace generic driver diagnostics with compatible-run fab loss attribution before making Design Programs the default project recommendation.
