# Project-local Design Programs

Status: strict authored or synthesized seed, loss-guided bounded proposal search over a locked Benchmark, immutable content-addressed Design Run V2 evidence and continuation, hash-addressed reopening, and exact Candidate promotion implemented.

Related: [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]], [[docs/design/project-boundaries]], [[docs/PROJECT_FORMAT]], [[docs/CLI]], [[plans/memory-fab-design-loop]], and [[plans/immutable-design-run-continuation]].

## Product boundary

A Design Program coordinates industrial design without becoming another evaluator. It declares whether its working seed comes from an authored Blueprint or project-local synthesis, which locked multi-case Benchmark owns acceptance and the mutable promotion target, which Benchmark case supplies proposal evidence, which current-best operating-case regressions the search may trade, how many non-promotable Pareto alternatives it may retain, which decision families an Agent may consider, and the maximum number of candidates it may evaluate.

The current flow is:

```text
design-programs/<id>.design.json
  → strict load + cross-contract validation
  → authored Blueprint or deterministic project-local synthesis
  → normalize working seed onto the Benchmark candidate revision lineage
  → read-only driver-case compile / analysis / capacity brief
  → select one deterministic frontier node
  → branch-local driver simulation / metrics hash / fab-loss profile / history
  → bounded heuristic RFC 6902 proposals
  → when that node has no eligible proposal, retain its Pareto evidence, retire only
    its scheduler entry, and continue the next searchable node without spending budget
  → in-memory candidate Blueprint
  → locked multi-case Benchmark evaluation
  → KEEP as leader only when every fixed-baseline gate passes, aggregate score improves,
    and the authored current-best case guardrail passes
  → otherwise BRANCH only when fixed gates pass, the parent improves, the case vector
    is non-dominated, and bounded frontier pruning retains it
  → content-addressed design-runs/<program>/<result-hash>/
```

The program does not own World, asset, Process, Product Route, Scenario, Objective, Benchmark, or evaluator values. It refers only to project-local ids. There is no workspace-level strategy catalog or shared Design Program.

## Authored contract

`design-programs/<id>.design.json` contains:

- matching kebab-case `id`, name, and description;
- one locked Benchmark id;
- one strict seed union: `{ "kind": "blueprint", "blueprint": "<id>" }` or `{ "kind": "synthesis", "inputBlueprint": "<id>" }`;
- one driver case belonging to that Benchmark;
- one required current-best guardrail: unrestricted tradeoffs, one uniform non-negative case-regression budget, or an exact budget for every Benchmark case;
- one required `frontier.maximumAlternativeBranches` bound from zero through eight; the single leader is separate from this bound;
- either the Core `heuristic` provider or one project-relative TypeScript `project-strategy` entry, plus a unique allowlist of decision families;
- a positive `budget.maxCandidates`, capped at 100.

Decision families are stable industrial mutation scopes implemented by the shared research strategies: power, storage, generation, local logistics, station fleet/charge/high-speed control, buffering, local/station dispatch, recipe selection, generic or plan-derived capacity, qualified toolset expansion, work-center specialization, preventive maintenance, batch formation, setup campaigns, and placed facility capacity/resilience. Runtime `--max-candidates` selects the new Candidate budget for one initial or continuation invocation; it may be smaller than the authored per-invocation bound but never larger.

A synthesis seed loads the declared input Blueprint and invokes the same deterministic project-local synthesis boundary as `inm synthesize`, without writing an intermediate file. The generated industrial fields become the in-memory working seed, while its `revision` is set to the current hash of the Benchmark candidate Blueprint. This keeps provenance, evaluated content, and optimistic-concurrency target separate and makes the final best design reproducible as one ordinary restricted Candidate patch.

A `project-strategy` provider implements API V5 and receives only a deeply frozen, data-only copy of the selected node's Blueprint, driver metrics, Core-derived fab-loss profile or `null`, production analysis, target-rate capacity plan, iteration number, branch identity/role/depth/current leader, exact proposal-time `promotionBoundary`, and that node's lineage-local proposal history. A sibling's attempts are never presented as though they were evaluated from this Blueprint. Each history entry preserves the earlier proposal's Core-validated `addressedLoss` or `addressedCase` alongside strategy, hypothesis, `KEEP`/`BRANCH`/`REVERT` result, and parent-relative score evidence.

The two proposal targets remain intentionally distinct. `addressedLoss` names one bucket in the selected Blueprint's current driver-case loss chain. `addressedCase` names one current leader-relative guardrail violation from `promotionBoundary`. A leader with a measured loss chain must use the former. An alternative with case blockers must use the latter and may omit a loss target rather than falsely claiming that resilience work repairs an unrelated driver loss. Missing, fabricated, observed-but-unselected, and non-blocking targets are rejected before candidate compilation. Core invokes the synchronous provider twice for the same frozen input and rejects nondeterminism. The strategy prefix must belong to the Program's declared decision families, and the ordinary patch validator, compiler, complete locked Benchmark, and leader-promotion gates remain authoritative. The Design Program hash covers its JSON manifest plus proposal-provider source and, for a synthesis seed, project synthesis strategy source. Editing either strategy makes prior runs stale rather than silently changing their meaning.

The memory-fab Program uses `strategies/integrated-dram-proposals.ts`. For a promotion-ready leader it annotates a researched discrete portfolio with eligible loss buckets, counts prior attempts per recorded target, and ranks the least-attempted current target before chain position and authored order. For a blocked alternative it first searches the separately annotated case-repair portfolio. Its first two real repairs are ordinary N+1 facility capacity for `facility-interruption` and an exact no-wait refinement of an existing lithography campaign for `lithography-interruption`. Focused project-local TypeScript research tools remain beside the provider under `strategies/research/`; they reload immutable evidence and discover bounded candidate policies, but only the declared provider participates in the shared Design run and immutable evidence contract.

The current-best guardrail is a separate Program policy, not a second Benchmark. `{ "kind": "unrestricted" }` deliberately permits aggregate improvement to trade operating cases. `uniform` declares one `maximumCaseScoreRegression` for every current-best case; zero is strict Pareto preservation. `case-specific` maps `maximumCaseScoreRegression` to every locked case id exactly, rejecting missing and unknown cases. The complete policy participates in the Program hash. Both memory-fab Programs declare uniform zero regression so no later KEEP weakens steady production, quality excursion, equipment interruption, or fab-utility interruption relative to the preceding best.

The public JSON Schema is discoverable as `inm schema design-program --json`. Unknown fields, an omitted guardrail or frontier policy, and the removed `seedBlueprint` form are rejected. Loading a brief additionally rejects an unlocked Benchmark, a driver case outside the Benchmark, a case-specific guardrail that does not exactly cover the Benchmark, missing seed inputs, synthesis failure or nondeterminism, and ordinary project compilation failure.

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

`runDesignProgram()` begins with one immutable `seed` node and one promotable leader. Every evaluated candidate is the deterministic `candidate-N` child of the selected node. Frontier membership, leader authority, and scheduler eligibility are independent state: a node can remain a non-dominated leader or alternative while its lineage-local proposal portfolio is exhausted. Selection uses only the searchable queue: a newly retained alternative is explored next, a rejected parent rotates to the back, and after promotion all searchable alternatives precede the new leader. Before proposal generation, Core compares the selected node with the current leader under the Program guardrail and constructs an immutable `promotionBoundary`: selected/leader identities, promotability, aggregate delta, every ordered locked-case score/delta/budget/pass result, limiting case, and exact violations. The driver case separately constructs ordinary operational evidence only from that selected node's Blueprint, static analysis, capacity plan, deterministic metrics, Core-derived fab-loss profile, and lineage-local history.

When the deterministic provider has no eligible proposal, Core records a separate `proposal-exhausted` event with the node/role/depth, candidate iteration it preceded, before/after search order, cumulative exhausted set, and exact next node. It then retires only that node from scheduling. This attempt is not a Candidate, creates no fabricated REJECT iteration, runs no locked cases, and consumes none of the global candidate-evaluation budget. Search ends as `frontier-exhausted` only when no retained node remains searchable; otherwise it ends as `budget-exhausted` after exactly the requested evaluations. A rejected or invalid actual proposal still consumes the global candidate budget and remains in the history of the Blueprint from which it was tried. Every iteration hashes the complete metrics object and records that hash with its source-neutral profile. This evidence is invocation-local and carries no fake persisted-run identity. Every proposal remains a restricted RFC 6902 patch under Blueprint-owned devices, connections, logistics networks, or policies.

The driver score never decides acceptance. Core evaluates each in-memory Blueprint through the complete locked Benchmark. A proposal advances the leader only when the Benchmark accepts every fixed-baseline aggregate, case-regression, and optional capacity gate; its aggregate candidate score strictly exceeds the current leader; and every leader-relative case delta satisfies the Program guardrail. A non-promoted candidate may instead enter as `BRANCH` only when fixed gates pass, its aggregate improves on its selected parent, and no current frontier node Pareto-dominates its locked per-case vector. Invalid, fixed-gate-failing, parent-regressing, or dominated proposals are `REJECT` evidence.

The frontier always contains one leader plus at most the authored number of alternatives. A newly retained node prunes any alternative it Pareto-dominates, whether that alternative is searchable or exhausted. If non-dominated alternatives still exceed the bound, Core deterministically retains the highest aggregate score, then the least worst-case regression to the leader, then the lexically smaller node id. A policy-compliant leader promotion may leave the former leader as an alternative when the new leader does not dominate it. Exhaustion never changes dominance or promotion authority: only `leader-promoted` can become `best.blueprint.json` or a Candidate.

Every valid iteration owns both comparison boundaries. `promotionBoundary` is the proposal-time comparison of the selected existing node with the current leader and is the only case-repair input. After the patch is evaluated, `decisionEvidence` compares the new candidate with that leader. Its `aggregate` records previous-best score, candidate score, and delta; ordered `cases` record the same values plus the resolved maximum regression or `null` and a guardrail result per locked case; `limitingCase` names the first minimum-delta case in Benchmark order. `guardrail` records the authored policy kind, overall result, and ordered violating case ids without requiring a consumer to re-evaluate policy. `basis` is `benchmark-gate` when the ordinary evaluation is not accepted, `no-current-best-improvement` when the aggregate delta is not positive, `current-best-case-guardrail` when a positive aggregate violates Program case budgets, or `current-best-improvement` only when all three conditions pass. Only the Benchmark-gate basis copies evaluator-owned `gateReasons`; Design does not synthesize a competing fixed-baseline authority. Benchmark case `scoreDelta` retains its existing fixed-baseline meaning. Invalid patches have an error and no fabricated decision evidence.

With the memory-fab zero-regression policy, greenfield iteration 3 cannot replace the leader despite an aggregate `+7.827836`: `facility-interruption` falls `-3.915879`. It is nevertheless non-dominated and becomes a `BRANCH`. Before iteration 4, Core presents that exact single blocker independently of the alternative's mixed-quality loss chain. The provider declares `addressedCase: facility-interruption` and adds one existing project-local utility plant. The unchanged five-case Benchmark then promotes the repaired child: aggregate leader delta `+9.963355`, facility service recovers, and even the limiting steady-production case remains `+8.238977` above the previous leader. The intervention changes 74 ordinary promotion patch operations in the synthesized factory and leaves evaluator-owned failure timing untouched.

Before candidate 5, the unrepaired parent `candidate-3` has no unused facility repair. Core records its exhaustion and continues `candidate-4` without spending an evaluation. Candidate 5 tests batch formation and is rejected. Candidate 6 applies a `minimumReadyLots: 3` / `maximumHoldTicks: 12000` lithography campaign: it improves aggregate score by `+0.455784`, but remains a non-dominated branch because `lithography-interruption` regresses `-0.054667` under the zero-regression policy.

Before candidate 7, the provider receives that exact blocker and replaces only the existing campaign with `minimumReadyLots: 3` / `maximumHoldTicks: 0`. This is a no-wait escape, not an evaluator exception: it surrenders the earlier ordinary-case campaign gains, leaves the first four case scores equal to `candidate-4`, and improves `facility-interruption` by `+1.707292`. The unchanged Benchmark therefore promotes candidate 7 by `+0.243899` over the leader. V2 Design Run `c5b24a97747c7d52fd9a748ffd8b99349cbf108217b0a1a3cee96f59204cb4c2` ends at `7/7`, score `-242.199221`, seed delta `+37.971590`, with candidate 7 as leader, candidate 6 as a still-searchable alternative, and only candidate 3 exhausted.

Continuing that exact frontier with one new Candidate creates `d02580bc840c4eca68ba3c83acb77993a35805df4009f021fb73fb316102d500`. Core first records candidate 6 as proposal-exhausted, then asks candidate 7 for its next lineage-local proposal. Candidate 8 tests a 10-card CONWIP loop reopening at seven lots. It passes the fixed Benchmark gates but regresses the leader by `-9.960213` overall, including four current-best case violations, so it is rejected as `parent-no-improvement`. Candidate 7 remains leader and candidate 6 remains retained but exhausted. Continuation therefore advances knowledge without pretending that additional search must improve the factory.

The refinement evidence is reproducible without modifying project files:

```bash
bun run inm design examples/memory-fab --program greenfield-dram-fab \
  --run --max-candidates 7 --json
bun run inm design examples/memory-fab --program greenfield-dram-fab \
  --run-id c5b24a97747c7d52fd9a748ffd8b99349cbf108217b0a1a3cee96f59204cb4c2 \
  --continue --max-candidates 1 --json
```

Before seed evaluation, Core prepares the locked Benchmark baseline once per case: it validates every fixed input hash, compiles the baseline, simulates it with the locked seed, and retains only invocation-local compiled/evaluated evidence. Seed and proposal evaluation reuse that exact baseline side while compiling and simulating every candidate side normally. An initial invocation therefore performs `cases × (new candidates + 2)` physical simulations. A continuation verifies and reuses the recorded seed and prior Candidate evaluations, so it performs only `cases × (new candidates + 1)` physical simulations: the current baseline plus new candidates. Neither path persists compiled simulation state, shares candidate state, or changes logical scores, gates, decisions, or result identity.

The same call emits a versioned deterministic `DesignRunProgress` union through an optional callback: run start; baseline/seed/candidate case start and completion; proposal diagnosis with branch, promotion boundary, and driver evidence; proposal identity and addressed loss or case; node-local exhaustion and next searchable node; candidate decision with the same current-best evidence; and immutable result completion. Events contain sequence and actual completed/planned simulation work but no timestamps; the initial plan is the bounded upper limit and the completed event closes it to the work actually performed when exhaustion or invalid proposals skip Candidate simulations. They are operational evidence and are excluded from the Design Run manifest/hash. The contract is provider-independent: heuristic and project-local TypeScript proposal sources cross the same phases.

The current best never overwrites the seed source or promotion target. Program execution writes only immutable design evidence.

## Immutable design-run artifact

The deterministic result hash addresses:

```text
design-runs/<program-id>/<result-hash>/
  manifest.json
  best.blueprint.json
```

The strict V2 manifest contains engine, project, Program hash and copied current-best/frontier policies, Benchmark identity/hash; declared seed source and source hash; synthesis provenance; normalized seed hash and evaluation; promotion-base Blueprint/hash; exact driver brief; cumulative effective budget; optional direct continuation identity; every iteration's selected parent/role/depth, proposal-time promotion boundary, driver evidence, addressed loss/case, proposal, evaluation, leader comparison, parent delta, KEEP/BRANCH/REJECT outcome, pruning and exact search/exhausted state after the decision; the ordered node-exhaustion timeline; final leader, alternatives, node search status and scheduler state; best identity; and stop reason. `continuation` is `null` for an initial run or records `sourceResultHash`, exact reused iteration/exhaustion counts, and the additional Candidate budget. It deliberately has no creation timestamp, fake run identity, or absolute artifact path in its hashed content. Reopening interleaves exhaustion and Candidate evidence to replay the complete deterministic frontier transition, recomputes every proposal-time boundary, and rejects altered exhaustion order/node/next selection, node status, parent selection, case evidence, dominance/pruning evidence, queue order, stop reason, policy, decision, leader, or best.

`continueDesignRun()` accepts only a current, verified `budget-exhausted` source with a non-empty searchable queue. It verifies engine, project, Program/provider, Benchmark, seed, driver, and promotion-base identity before evaluating anything. Starting from the current exact seed, Core applies every recorded parent-relative patch, restores promotion-base revision lineage, compiles each reconstructed Blueprint, and verifies Candidate hashes, frontier transitions, exhaustion evidence, final scheduler state, and branch-local history. The new artifact copies the complete verified prefix, names the source hash, appends only new evidence, and never edits the source. Loading a continuation also requires the source artifact and proves the copied iteration/exhaustion prefix byte-for-byte. Stale, unavailable, frontier-exhausted, malformed, or replay-divergent sources fail before a new artifact is written. INM is pre-alpha, so V1 Design Runs are intentionally unsupported rather than migrated or aliased.

An identical program, locked inputs, seed, decision allowlist, candidate budget, and deterministic engine reproduce the same result hash. Re-execution verifies and reuses the existing artifact; conflicting content under the same result id is an error. `manifest.json` is written last so an interrupted directory is not mistaken for a completed result.

## CLI projection

`inm design <project>` lists project-local programs. `--program <id>` returns the read-only brief, including the exact current-best and frontier policies, completed run summaries, and an exact argv next action. `--run` is the explicit initial artifact-creating mode. `--run-id <hash> --continue --max-candidates N` explicitly creates a new immutable continuation; the reopened source exposes that argv as a machine-readable next action only when its frontier is eligible. `--max-candidates` is the new budget for either invocation and remains bounded by the Program. Human progress names continuation provenance, selected branch, observed loss chain, target, leader decision basis, parent delta, frontier outcome, node-local exhaustion, next searchable node, and limiting or violated case on stderr; `--progress ndjson` exposes the complete Core evidence records to an Agent while preserving one final JSON stdout envelope. Human run/reopen output repeats direct source identity, reused/additional counts, branch lineage, promotion boundary, searchable/exhausted counts, and the exhaustion timeline. `--run-id <result-hash>` verifies and reopens one immutable result. The `frontier` JSON section includes the final scheduler and exhaustion records. JSON sections are `summary`, `static`, `iterations`, `frontier`, `best`, `runs`, and `all`, and a successful execution, continuation, or reopen reports one immutable `design-run` artifact.

`--run-id <hash> --promote <candidate-id>` is the only Design-to-Candidate transition. Core first verifies the run's content hash, best-Blueprint hash, engine, current Program and Benchmark contract, and unchanged promotion-base Blueprint/hash. The best must be accepted and differ from that base. It is collapsed into one restricted patch from the current Benchmark candidate, checked against the recorded patch size, replayed to the exact immutable best hash, and written as an ordinary `candidates/<id>.candidate.json` with a `design-run` source record. A generated seed may therefore be promoted without a later winning proposal when synthesis itself is accepted and changes the target; an unchanged authored seed still has no patch. Promotion does not evaluate or apply the Candidate; the existing Candidate preview/review/apply lifecycle retains those authorities.

CLI uses the same Core program/brief/run objects and does not rebuild proposal or evaluation semantics.

Studio exposes a route-backed `/<project>/designs/<program>[/runs/<result-hash>]` control room. It loads the same Core summaries, brief, immutable runs, continuation lineage, and promotion operation through project-qualified APIs. Both initial and `POST .../runs/<hash>/continue` operations support an `application/x-ndjson` response whose progress and final-result records are produced inside the same Core invocation; structured failures terminate the stream as typed error records. A human sees the authored current-best/frontier policies, selected branch during live diagnosis, and completed/planned simulations, followed by leader and explicitly non-promotable alternative cards labeled searchable or exhausted, an ordered exhaustion ledger, exact iteration lineage/pruning, score-ranked immutable results, direct continuation provenance, an explicit additional-budget button for eligible frontiers, and the leader-only Candidate handoff guard. Refresh, copied links, back/forward, and narrow-screen use reconstruct from the route and project artifacts rather than browser-only state.

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

Tests must prove strict schema closure, all three guardrail forms, exact case-specific coverage, filename identity, lock/seed/driver cross-contract validation, synthesis determinism and provenance, read purity, explicit decision-family confinement, Core-owned loss derivation, exact driver metrics hashing, missing/fabricated loss-target rejection, per-invocation budget enforcement, locked multi-case evaluation, exact current-best aggregate/case/budget evidence and guardrail violation ordering, one baseline simulation per case, deterministic ordered progress, unchanged deterministic result hash, artifact reuse, content/hash/policy/decision-lineage verification on reopen, exact continuation-prefix and Blueprint/history reconstruction, no old seed/Candidate simulation during continuation, stable stale/unavailable/diverged rejection before write, exact promotion replay, stale promotion-base rejection, and byte-identical source/target/tuned Blueprint contents before Candidate apply. Public CLI tests must execute the real binary and prove list/brief/run/continue/reopen effects, NDJSON loss/decision/lineage evidence, and artifact projection. Studio tests must consume the same streamed evidence and structured failure record.

## Known next gaps

- Memory-fab now has one honest facility-resilience repair in addition to release/queue/Q-time, maintenance/yield, batch formation, setup campaigning, and selected dispatch/power controls, but not every transport or quality intervention.
- Exhaustion is intentionally final for one node within one immutable run. Core does not reactivate it when later leader changes would produce a different promotion boundary; a future search policy may add explicit, bounded reactivation if real factory evidence shows it is useful.
