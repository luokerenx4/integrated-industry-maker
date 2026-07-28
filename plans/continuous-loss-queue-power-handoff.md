# Continuous realized-loss queue and power handoff

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/operator-workbench]], [[docs/design/observation-led-design]], [[docs/design/fab-capacity-planning]], [[docs/design/power]], and [[docs/design/design-programs]].

## Outcome

Keep the memory-fab work queue on exact compatible-run evidence after any number of bounded decisions, then turn the next `power-interruption` signal into a conserved Device/grid/transport-endpoint design task and one locked-case decision instead of falling through to a contradictory nominal warning.

## Context

Run `090-simulate` has eight non-zero measured buckets, but `FabLossProfile.chain` and Workbench diagnostics arbitrarily retain only the first five. Once those five receive current bounded dispositions, the shared next action falls back to `blank-dram-wafer-lot nominal demand exceeds production`, even though target-rate planning for the same hashes explicitly credits twelve Scenario-scheduled lots and reports zero gaps / READY.

The next omitted measured bucket is `power-interruption`: 552,076 unpowered Device-ticks. Its current bucket has no contributors and only names the largest Device. Metrics show all non-zero time on the 600 W shipping grid, including 327,554 ticks on the substrate lane endpoints and 219,772 on Probe/customer transport endpoints. That grid records a 7 W peak deficit, 149,450 mJ unserved energy, and 21,225 mJ required storage, while the main cleanroom grid is fully served.

The simulator already owns per-Device unpowered totals, power shortage/restoration events, transport endpoint bindings, and grid energy envelopes. The loss projection discards the causal grouping before CLI, Studio, Observation, Workbench, and Design provider context.

INM is pre-alpha. This plan removes the arbitrary queue limit and replaces incomplete diagnostics directly; it adds no compatibility path.

## Scope

### In scope

- Expose every non-zero realized loss bucket in deterministic rank order through `chain`, Workbench diagnostics, Observation, CLI, and Studio rather than a fixed top five.
- Treat `Scenario.lotReleases` and `Scenario.materialDeliveries` as declared boundary supply in nominal production analysis so evaluator-owned input is not mislabeled as an absent producer.
- Add deterministic per-Device power-interruption contributors whose totals conserve `FactoryMetrics.unpoweredTime`, retaining grid, endpoint/connection, shortage/restoration counts, demand shortfall, and grid energy evidence.
- Author one focused project-local Design Program that consumes the exact leading shipping-grid contributor and evaluates one explicit bounded power-supply intervention against the unchanged five-case Benchmark.
- Preserve either a promotion-safe Candidate or an exact bounded rejection; do not infer that unpowered idle infrastructure is commercially worth eliminating.

### Out of scope

- Automatic generator placement, learned power dispatch, renewable forecasting, electricity-market optimization, or editing Scenario supply.
- Redefining Objective capacity planning from nominal installed-rate analysis.
- Simultaneously optimizing setup campaigns or the already measured transport-blocking bucket.
- Applying a power Candidate without separate reviewed promotion authority.

## Acceptance

- [x] After five current dispositions, Workbench and Observation select rank-six `power-interruption`; after its bounded decision they advance to rank seven rather than a nominal Scenario-input warning.
- [x] Power contributors deterministically conserve every non-zero unpowered Device-tick and bind the exact grid plus any transport connection/stage.
- [x] CLI and Studio expose the same Device, grid, endpoint, time, shortage/restoration, demand deficit, and grid energy evidence.
- [x] Scenario-scheduled blank wafers and package substrates are marked as boundary supplied and emit no nominal missing-production warning.
- [x] One written human/Agent power hypothesis is evaluated against the unchanged locked five-case Benchmark without incidental commissioned-Blueprint mutation.
- [x] Focused tests, full tests, public CLI checks, real browser observation, commit, and push pass.

## Work

- [x] Audit the post-disposition next action, full realized loss profile, nominal analysis, capacity plan, power metrics/events, and current visual/Agent surfaces.
- [x] Remove the realized-loss queue truncation and repair declared external-supply classification.
- [x] Implement exact power-interruption attribution and cross-surface projection.
- [x] Observe the shipping grid and evaluate one explicit focused Candidate.
- [x] Update durable design docs, complete all gates, commit, and push.

## Findings and decisions

- 2026-07-28 — `FabLossProfile.buckets` contains eight non-zero signals, while `chain` and Workbench diagnostics hard-code `slice(0, 5)`. The nominal-warning handoff is therefore a queue projection bug, not evidence exhaustion.
- 2026-07-28 — Capacity planning credits 12 blank-wafer lots at 3/min and 96 package substrates at 24/min over the four-minute Scenario; both raw rows have positive Scenario balance and zero supply deficit.
- 2026-07-28 — `analyzeProduction()` defines `boundarySupply` as an empty Set, so its existing `hasBoundarySupply` suppression contract is dead for every project.
- 2026-07-28 — All 552,076 unpowered ticks occur on the shipping grid. The main cleanroom grid has zero deficit/unserved energy; shipping has 7,000 mW peak deficit, 149,450 mJ unserved, and a 21,225 mJ exact storage envelope.
- 2026-07-28 — The smallest currently authored Blueprint-only intervention is one additional project-local wind turbine joined to the shipping grid. Its build/area cost and all five operating cases remain authoritative; local unpowered-time removal alone cannot justify promotion.
- 2026-07-28 — Design Run `e631ffcff717634c98122f858c866da6e67a9fbbd31bab30a9f2f60d38cec0cd` reduces the leading sorter endpoint from 163,777 unpowered ticks to zero, but increases total build cost from 229,950 to 231,350 and therefore violates the unchanged 230,000 hard limit in all five cases.
- 2026-07-28 — Continuation `efdf2963a73292a245dc9c562f1e6642785b7dfeec10bbf258aa5e6d6fce6227` proves the one-intervention frontier exhausted. Workbench preserves that rejection as automatically invalidating evidence and advances to rank-seven `setup-campaign`.
- 2026-07-28 — Two concurrent full-test processes were the immediate cause of the apparent 5-second simulation timeouts. After explicitly terminating both duplicate process trees and retaining one Studio service plus one serial verifier, the same focused simulations returned to 1–3 seconds and the full gate passed. Service lifecycle remains product work, not operator folklore.

## Verification

- `bun run check:fast` — 928 documentation links, all TypeScript packages/examples, and 19 short tests pass.
- `bun run test` — 263 serial Core/CLI/Studio tests pass with 2,227 expectations, followed by all eight Ironworks project checks.
- Focused Core, CLI, and Studio Design tests — the synthesis frontier, public Design workflow, bounded dispositions, and streaming Design endpoint pass independently.
- `bun run inm validate examples/memory-fab --json` — project validation passes.
- `bun run inm analyze examples/memory-fab --json` — Scenario-scheduled blank wafers and package substrates are boundary supplied and no false missing-production diagnostic is emitted for either.
- `bun run inm inspect examples/memory-fab --section dispositions --json` — six bounded dispositions include the exact power target and `163777 → 0` rejected result.
- `bun run inm inspect examples/memory-fab --section next-action --json` — the shared queue advances to `fab-loss.setup-campaign` through the aligned commissioned Design brief.
- Real Studio browser on managed port `4176` — Overview renders all eight realized buckets, six bounded dispositions, the rank-seven handoff, and seven power contributors; Design Run `efdf2963a732...` renders the exact reduction and locked rejection; browser console contains no errors.
- `git diff --exit-code -- examples/memory-fab/blueprints/generated-dram-fab.blueprint.json` — empty.

## Progress log

- 2026-07-28 — Plan created after the fifth bounded loss exposed both the five-item truncation and the contradictory nominal external-supply warning.
- 2026-07-28 — Removed fixed-length loss projection, restored Scenario boundary supply, and carried conserved power interruption contributors through Core, CLI, Studio, Observation, Workbench, and provider context.
- 2026-07-28 — Observed the shipping grid, evaluated the smallest explicit generation increment, preserved its hard-cost rejection, and advanced the shared work queue.
- 2026-07-28 — Cleared duplicate verifier processes, completed the single-process full gate, and left one managed Studio service running on port `4176`.

## Completion

The memory-fab work queue now retains every measured non-zero loss rather than silently stopping after five, and static analysis no longer invents missing producers for Scenario-owned material arrivals. Power interruption is a conserved design handoff: humans and Agents see the exact Device, shipping grid, transport endpoint, shortage history, demand deficit, and grid energy envelope on every surface.

The deliberate second-turbine hypothesis proves the leading 163,777-tick interruption is removable, but also proves why it must not be commissioned: its 231,350 build cost violates the unchanged 230,000 authority in every locked case. The commissioned Blueprint remains untouched, the bounded result is immutable, and the next shared design question is the measured rank-seven setup/campaign loss.
