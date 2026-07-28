# Causal queue Design handoff

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], and [[docs/design/studio-debugger]].

## Outcome

Make the current memory-fab queue handoff execution-equivalent for humans and Agents: the shared next action must open and run a focused Program whose provider accepts only the exact leading `etch-1 / etch-cell-layer-1` contributor, proposes physically relevant front-end interventions, and proves their before/after `queueTicks` under the unchanged locked Benchmark.

## Context

Workbench V10 correctly removes the two current bounded-deferred diagnostics from the active queue and identifies `queue-congestion` at `device:etch-1 + route:dram-front-end`. Its argv and Studio route still open broad Program `commissioned-dram-fab`.

A clean one-candidate execution of that exact argv does not continue the advertised queue investigation. The broad provider receives the unfiltered physical loss chain rather than Workbench decision state, proposes `maintenance:inspection-jobs-4` against already bounded `yield-quality`, supplies no exact loss target, and rejects it on the locked gate. Separate legacy provider coverage can also force `queue-congestion` while proposing `burn-in-1` terminal screening, even though that Device owns no tracked-wafer queue interval.

The current handoff is therefore presentation-correct but execution-wrong. Adding more ranking heuristics to the broad provider would entangle unrelated physical and decision projections. A dedicated project-local queue Program gives this exact industrial question the same bounded authority already used for inspection supply and layer-two quality.

## Scope

### In scope

- Author a focused queue-convergence Design Program seeded from `generated-dram-fab`.
- Bind its provider to the exact current queue contributor id, mechanism, Device, Route, step, Process, Resource, and positive `queueTicks`.
- Add or reuse physically explicit layer-one etch cycle, dispatch, release, or capacity options; every proposal must carry `addressedLossTarget`.
- Use the unchanged five-case Benchmark and zero current-best regression boundary to accept, reject, or exhaust the frontier honestly.
- Route Core Workbench, CLI, and Studio to the focused Program and its immutable evidence.
- Keep the broad commissioned Program broad; do not inject ephemeral Workbench dispositions into its physical driver profile.

### Out of scope

- Treating observed wait as guaranteed recoverable throughput.
- Reopening the two bounded inspection and yield decisions without an invalidation-boundary change.
- Changing the existing Run `089-simulate` or queue score formula merely to make a Candidate look effective.
- Adding compatibility readers for superseded pre-alpha contracts.
- Optimizing unrelated Probe, burn-in, delivery-portfolio, or maintenance losses inside this focused Program.

## Acceptance

- [x] The shared next action routes to one focused Program and the exact current queue target on both human and machine surfaces.
- [x] Every evaluated Candidate improves `device:etch-1:process-queue-wait:dram-front-end:etch-cell-layer-1:etch-cell-layer-1.queueTicks` or is rejected before it can claim causal queue evidence.
- [x] The locked Benchmark records a promotion-safe improvement or a complete bounded negative frontier without changing the seed implicitly.
- [x] CLI and Studio expose identical target, before/after evidence, decision basis, frontier state, and guarded Candidate availability.
- [x] Project validation, documentation, browser acceptance, and complete repository regression pass.

## Work

- [x] Reproduce the advertised-argv mismatch in an isolated project copy.
- [x] Measure a bounded set of physically explicit layer-one queue interventions.
- [x] Implement the focused Program/provider/catalog options and exact-target tests.
- [x] Execute and preserve immutable current Design evidence; update Workbench, CLI, Studio, and durable docs.
- [x] Complete browser and repository verification, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-25 — Isolated execution of `inm design <project> --program commissioned-dram-fab --run --max-candidates 1 --json` produced Run `139d8b8c1ec8101cf608826c850d7add0231ea7d70a95ae6cb666a37f03c7c5e`: first proposal `maintenance:inspection-jobs-4`, addressed loss `yield-quality`, no exact target, `REJECT`. The Workbench handoff had advertised queue convergence at `etch-1`.
- 2026-07-25 — Workbench dispositions are a decision projection and must not rewrite evaluator-owned physical loss. The execution fix will be a focused project-local Program, not a hidden filtered profile passed only by one surface.
- 2026-07-25 — Queue causality must be proven with the contributor's exact `queueTicks`; matching any subject anywhere in the bucket is insufficient because the current bucket contains six different upstream locations.
- 2026-07-25 — Always-fast layer-one modes reduce the driver target from `21500` to `19500`, `17500`, `16500`, or `14836` ticks. Every envelope improves aggregate score because facility interruption benefits, but every one regresses an ordinary current-best case and therefore fails the focused Program's uniform-zero policy.
- 2026-07-25 — Explicit `input-queue-recovery` was added as a discriminated cadence policy. It counts only route-eligible tracked identities resident at the exact input and selects recovery only when both resident-count and oldest queued-state age cross authored boundaries. The commissioned queue never has two simultaneously resident lots, so research uses the physically observed one-lot boundary.
- 2026-07-25 — Adaptive four-fifths recovery after five seconds reduces the target to `20500`, but changed lot timing loses facility-interruption on-time service. A five-percent endpoint-cycle optimization reduces it to `20500` and improves aggregate score `+1.180958`, but steady production regresses `-0.075417`; combining it with CONWIP `6/4` reaches `18500` but regresses quality excursion. Lowering the admission ceiling to five can erase the queue but withholds on-time work and is not an equipment improvement.
- 2026-07-25 — Focused Run `5f7484028f8c9fe7906ad5b16e6cf7e191e85c3dfa7a99ea91b16b307c39ac09` exhausts four exact-target Candidates: all improve `queueTicks`; two reject on locked on-time service and two on uniform-zero current-best case guardrails. The seed remains unchanged and no Candidate is promotable.
- 2026-07-25 — Adding catalogued queue modes exposed a separate authority defect: structurally valid old and new Design Runs shared Program/Benchmark identity, and result-hash ordering selected the old driver catalog. `DesignRunSummary` and Workbench currentness now bind driver selection plus every driver hash, making the old inspection/yield runs historical and selecting catalog-current Runs `9ede1fd47e7006179f29e5ca9434762d7fa098c81139d15340626ee4faf0d269` and `eee125da8b3184e8042e64ac1f06a9d23e068731ec9df97a4907db679881cefb`.

## Verification

- Isolated clean-project Design audit — mismatch reproduced without modifying repository evidence.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "exact tracked-lot input queue age"` — input-queue selection, deterministic activation, exact target reduction, and invalid contracts pass.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts --test-name-pattern "front-end queue|upstream tracked-lot queue"` — focused exact-target sequence and broad-provider causal exclusion pass.
- Catalog-current immutable evidence — Run `090-simulate`; inspection `9ede1fd47e700`; yield `eee125da8b31`; queue `5f7484028f8c`.
- `bun test packages/inm-core/src/workbench.test.ts --test-name-pattern "shared handoff to the focused layer-one queue Program"` — missing queue evidence routes exact CLI argv and Studio route to `front-end-queue-convergence`.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "same bounded inspection, queue, and yield dispositions"` — machine section and human projection agree on all three current dispositions.
- `bun run test` — 246 package tests and all eight Ironworks project fixtures pass after documentation and TypeScript checks.
- Browser acceptance — `/memory-fab/factory` renders Run `090-simulate` without console errors; Overview exposes queue loss and the next maintenance diagnostic; focused Run `5f7484028f8c` exposes the exact contributor and `frontier-exhausted`.

## Progress log

- 2026-07-25 — Plan activated from the first corrected queue next action.
- 2026-07-25 — Research, explicit input-queue control, focused provider, catalog modes, immutable negative frontier, and driver-hash authority repair completed.
- 2026-07-28 — Removed the superseded budget-exhausted scratch Run, completed the full repository and browser acceptance loops, and closed the plan for publication.

## Completion

Completed with a bounded negative queue frontier. The commissioned Blueprint remains unchanged; shared human and Agent surfaces preserve the exact rejected evidence and advance to maintenance qualification.
