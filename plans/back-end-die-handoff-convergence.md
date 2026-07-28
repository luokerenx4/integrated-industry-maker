# Back-end die handoff convergence

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/logistics]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/observation-led-design]], and [[docs/design/operator-workbench]].

## Outcome

Turn the current `probe-to-packaging` transport-blocking signal into a focused, project-local, locked Design decision using physically explicit die-handling equipment, then either commission a zero-regression improvement or retain exact bounded evidence and advance the shared work queue.

## Context

Compatible Run `090-simulate` ranks transport blocking eighth after six higher-ranked losses were bounded by rejected focused Designs and setup changeover was separately exhausted. The leading connection moved `96` known-good dies at only `10%` nominal line utilization, yet accumulated `46,800` blocked item-ticks: `27,000` line contention, `14,000` endpoint service capacity, `5,800` endpoint power, and no endpoint failure.

Observation of the exact run-qualified Factory view showed a two-cell ground route between adjacent Probe and packaging cells. Both explicit endpoints move only one die per `250 ms`, so eight-die Probe bursts occupy both belt cells while packaging consumes dies one at a time. The visual congestion and the Core cause partition agree that the smallest credible intervention is endpoint batch handling, optionally with explicit power priority; a faster passive belt alone would not address the dominant mechanism.

The current Workbench can identify this loss but falls back to broad `commissioned-dram-fab`. That Program has no `transport-blocking` proposal and does not permit the `logistics` decision family. The missing product capability is therefore a focused project-local transport intervention portfolio, not another optimizer or a weaker Benchmark.

## Scope

### In scope

- Add a self-contained project-local die-tray endpoint asset with explicit stack, cycle, power, cost, and visual contracts.
- Add a focused `transport-blocking` Design Program and deterministic TypeScript proposal portfolio for the exact `probe-to-packaging` contributor.
- Evaluate endpoint batch handling and a bounded endpoint-power-priority variant across the unchanged five-case Benchmark.
- Preserve the exact contributor/cause partition and require every Candidate to reduce the targeted `blockedItemTicks`.
- Project the resulting Program, run authority, and next action identically through CLI and Studio.
- Observe the strongest evaluated layout in Factory before making the KEEP, defer, or discard judgment.

### Out of scope

- Weakening Objective limits, current-best zero-regression policy, or locked operating cases.
- Changing generic transport semantics, adding implicit logistics, or treating ordinary necessary transit as loss.
- Automatically redesigning factory layout or applying a Candidate that lacks exact promotion authority.
- Reopening the already bounded higher-ranked losses in the same change.

## Acceptance

- [x] Workbench selects a focused aligned transport Program for the exact current diagnostic instead of the broad fallback.
- [x] Every evaluated Candidate names `connection:probe-to-packaging:transport-line-contention.blockedItemTicks`, changes only explicit Blueprint logistics/power state, and either reduces that value or fails visibly.
- [x] The unchanged locked Benchmark yields an immutable Design decision; only a zero-regression leader may become and apply through an exact Candidate.
- [x] CLI and Studio expose the same Program, progress, causal delta, authority, and next action.
- [x] Before/after Factory observation, focused tests, full verification, commit, and push pass.

## Work

- [x] Bind and observe the exact compatible run, spatial connection, and Core cause evidence.
- [x] Author the project-local die handler, focused Program, and bounded TypeScript proposals.
- [x] Run and inspect the locked Design; promote/review/apply only if the leader is eligible.
- [x] Regenerate compatible operating evidence when the Blueprint changes, then verify Workbench/CLI/Studio parity.
- [x] Complete all gates, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-28 — `090-simulate` and Blueprint `35ef45f0eb…` are the observation authority. The route is only two belt cells, carries `24/min` against `240/min` nominal capacity, but is `35.83%` blocked because burst occupancy propagates from single-die endpoints; this is not a line-rate utilization problem.
- 2026-07-28 — The intervention will batch known-good dies at the explicit loader/unloader boundary. It will not reuse the wafer-specific vacuum handler merely because that asset happens to be faster.
- 2026-07-28 — Endpoint power priority is a separate bounded alternative because `5,800` blocked item-ticks are power-caused; the five locked cases must expose any displaced load elsewhere.
- 2026-07-28 — Adding an unused project asset correctly changed the strict Device-catalog identity and made `090-simulate` plus the prior Design authorities historical. Catalog-current Run `091-simulate` reproduced the exact transport profile. This refresh also exposed that `inspection-supply-path` still declared broad focus despite owning only the exact input-starvation frontier; the Program now declares its actual loss focus directly.
- 2026-07-28 — The first two-Candidate study falsified unprioritized tray handling: higher endpoint draw at priority zero amplified the target from `46,800` to `790,800` blocked item-ticks. Tray handling plus priority eight reduced it to zero but regressed current-best scores by about `0.002` through explicit capital and energy cost. The failed tray-only alternative remains immutable historical research but was removed from the current bounded portfolio; it is not a credible design to repeat.
- 2026-07-28 — Final authority `f380b7f17083…` retains one credible prioritized tray Candidate. It reduces the exact target to zero but fails the uniform zero-regression current-best policy in all five cases, so no Candidate is promoted or applied.
- 2026-07-28 — Before/after Factory replay confirms the semantic evidence spatially: stack capacity rises from one to four, endpoint priority from zero to eight, and blocked item-time falls to zero while delivered quantity and cycle outcome remain unchanged.
- 2026-07-28 — Workbench records eight current bounded dispositions and advances from the exhausted realized-loss chain to `analysis.material-deficit:resource:dielectric-stack-lot`, whose nominal demand exceeds production by `1.786/min`.
- 2026-07-29 — [[plans/objective-authoritative-analysis-boundary]] later proved that value is an equal-share configured-operation envelope rather than Objective demand and retired it from the active diagnostic queue.

## Verification

- `bun run inm observe examples/memory-fab --json` — bound compatible Run `090-simulate`, result `63159773a096…`, and the exact transport diagnostic.
- Studio route `/memory-fab/factory/connections/probe-to-packaging?run=090-simulate` — observed the adjacent two-cell route, `stack×1` endpoints, simultaneous occupied cells during replay, and the exact `27,000 / 14,000 / 5,800 / 0` cause partition.
- `bun run inm simulate examples/memory-fab --json` — created catalog-current Run `091-simulate`, result `0597667589a3…`, with the same exact physical loss profile.
- Initial two-Candidate Design Run `34bb06917b79…` — unprioritized tray handling worsened target `+744,000`; prioritized tray handling improved it `-46,800` to zero but failed the uniform current-best guardrail by roughly `0.002` score.
- Final Design authority `f380b7f17083275669bf571a89a1c675a4bf11f88fd61b7528fcadbcc80b62ad` — one credible Candidate, exact target `46,800 → 0`, five small current-best regressions, `frontier-exhausted`, no promotion patch.
- Candidate Factory replay — stack `×4`, endpoint priority `8`, capacity `960/min`, `0` line/capacity/power/failure blocked item-ticks, same `96` delivered dies and `24/min` realized flow.
- `bun test packages/inm-core/src/design-program.test.ts packages/inm-core/src/workbench.test.ts --max-concurrency=1` — passed.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts --test-name-pattern "focused back-end handoff"` — passed.
- `bun test packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts --max-concurrency=1` — passed.
- `bun run check:fast` — documentation, TypeScript, and short unit suite passed in `12.6s`.
- `bun run test` — `266` tests, `2249` assertions, `0` failures in `836.55s`, followed by all eight public Ironworks fixtures passing.
- Studio route `/memory-fab/designs/back-end-die-handoff/runs/f380b7f17083275669bf571a89a1c675a4bf11f88fd61b7528fcadbcc80b62ad` — selected exact exhausted result, rendered causal target `46800 → 0`, rejected score drivers, current Run `091-simulate`, eight dispositions, and material-deficit next action.

## Progress log

- 2026-07-28 — Plan created from the current shared Workbench handoff and run-qualified visual observation.

## Completion

Added explicit project-local four-position die handling and a focused locked Design Program. The unprioritized exploratory variant exposed a severe power interaction and was removed from the repeatable portfolio. The only retained prioritized variant eliminated the target blockage but was honestly rejected on small explicit capital/energy regressions. No authored Blueprint changed; the immutable decision is shared by CLI and Studio, and the work queue advances to upstream material balance.
