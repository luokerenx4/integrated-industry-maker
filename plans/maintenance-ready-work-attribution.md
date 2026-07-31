# Maintenance ready-work attribution

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/usage-based-maintenance]], [[docs/design/simulation-runtime]], [[docs/design/observation-led-design]], and [[docs/design/operator-workbench]].

## Outcome

Maintenance remains fully conserved physical workload, while humans and Agents can distinguish service that overlaps an exactly ready production operation from service performed inside a genuine idle or post-production window; only the measured overlap is ranked as recoverable maintenance loss.

## Context

Run `110-candidate-trial-run-105-normal-particle-suppress` currently ranks `124,000` maintenance, qualification, and provider-wait device-ticks as one loss even though the leading `lithography-1` contributor does not displace ready work. Its first `13,000`-tick cycle runs from tick `37,000` to `50,000`; the next complete input arrives only at `59,023`. Its second cycle begins after the twelfth and final layer-one job finishes at `105,023`.

The resulting Design handoff encouraged a `6 → 7 jobs` cadence reduction. Current immutable Design Run `7aa9b6deda434851a4802b6f47251b53cfd7688a711a0862958bcc024ebca32e` correctly rejected that change because it crossed the asset drift boundary and reduced on-time service in every locked case. The deeper problem is attribution: necessary maintenance workload is context, not automatically recoverable production loss.

INM already applies this distinction to ordinary transport time and boundary input wait. Maintenance needs the same event-backed opportunity boundary. This is a pre-alpha model correction; no compatibility reader or old-run reinterpretation is required.

## Scope

### In scope

- Track exact intervals in which a maintained Device is occupied by service, qualification, or their provider wait while at least one complete qualified Process operation is physically ready.
- Preserve total service, qualification, consumable wait, crew wait, causes, triggers, providers, consumables, drift, and non-overlap time as context.
- Rank the maintenance bucket by ready-work overlap rather than raw service workload, with deterministic per-Device conservation.
- Project identical evidence through Core, CLI, Studio Analysis, Observation, Design provider context, and Workbench.
- Regenerate a compatible memory-fab operating Run and prove the next shared handoff follows measured recoverable work rather than reopening harmless maintenance.

### Out of scope

- Changing maintenance thresholds, duration, qualification, drift, crews, consumables, provider radius, or the commissioned Blueprint.
- Claiming a counterfactual completion-time saving beyond the exact ready-work overlap.
- Predictive maintenance, stochastic reliability, RL, automatic policy search, or automatic Candidate application.
- Reinterpreting historical Run or Design artifacts under the new metric.

## Acceptance

- [x] Runtime evidence starts and closes a maintenance ready-work interval only when an exact qualified Process plan has all physical inputs, output capacity, tooling, and utility capacity while maintenance owns the Device.
- [x] Maintenance attribution conserves `readyWorkOverlapTicks + idleWindowTicks = total service/qualification/wait ticks` per Device and factory-wide, while retaining the existing phase and provider conservation.
- [x] CLI and Studio expose the same overlap, idle-window, phase, cause, provider, consumable, and drift evidence without turning it into an automatic recommendation.
- [x] A current compatible memory-fab Run proves whether any maintained Device has recoverable overlap; Workbench and Observation select the next honest task from that evidence.
- [x] Focused runtime/attribution/public-surface tests, project validation, full `bun run test`, immutable replay, and browser acceptance pass.

## Work

- [x] Audit Run 110 maintenance chronology and identify the workload-versus-loss attribution error.
- [x] Add runtime ready-work interval state, events, metrics, and exact tests.
- [x] Change fab-loss ranking and update CLI/Studio/Observation/Design parity.
- [x] Regenerate current evidence and inspect the resulting factory and Workbench handoff.
- [x] Complete verification and archive the plan.

## Findings and decisions

- 2026-07-31 — `lithography-1` completes six continuous jobs through tick `37,000`, services and qualifies through `50,000`, then remains without a complete input until tick `59,023`. The first cycle has zero ready-work overlap.
- 2026-07-31 — The second `lithography-1` cycle starts at tick `105,023` after its twelfth and final layer-one job. No later layer-one input or job exists in the operating window, so the cycle is post-production workload rather than production displacement.
- 2026-07-31 — Raw service duration must remain visible because it consumes energy, kits, provider crews, and equipment life. The corrected loss score will use only exact ready-work overlap and will name the remainder `idleWindowTicks`; it will not erase physical work or claim that every overlap tick is a guaranteed delivery improvement.
- 2026-07-31 — Run 110's `124,000`-tick headline double-counted qualification inside both maintenance and qualification totals. The corrected physical phase workload is `94,000` ticks: `64,000` service plus `30,000` qualification, with provider crew accounting kept disjoint by phase.
- 2026-07-31 — Current Run `112-simulate` conserves `23,143` ready-work overlap ticks plus `70,857` idle/post-production ticks into the `94,000`-tick workload. `etch-1` leads with `17,000` overlap ticks against the exact `etch-cell-layer-1/qualified` plan; `lithography-1` has zero overlap.
- 2026-07-31 — Provider `maintenance-service-1` records `64,000` service crew-ticks and `30,000` qualification crew-ticks with a peak allocation of `2/2`; qualification is no longer counted again as service.
- 2026-07-31 — The five-case `greenfield-dram-design` Benchmark still accepts the commissioned Blueprint and passes all seven outcome guardrails. This evidence correction therefore does not authorize a factory intervention.
- 2026-07-31 — With harmless maintenance removed from the top of the recoverable-loss queue, the shared Workbench returns to direct observation of current furnace input starvation. Historical `lithography-maintenance-convergence` evidence remains target-mismatched and invalid under provider API V9 rather than being silently repurposed.

## Verification

- `bun run typecheck` — passed across Core, CLI, Studio, and both example asset packages.
- `bun run test` — passed `354` Core/CLI/Studio tests with `4309` assertions, then passed all eight Ironworks project cases.
- `bun run inm test examples/memory-fab` — passed both project-local memory-fab cases.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json` — accepted across five locked cases; all seven outcome guardrails passed.
- Current immutable evidence — Run `112-simulate`, engine `inm-sim/0.93.1`, result `e431a41f9560f7d9f1a925d6b088a93696e4d11bc55bfe4431ffa41deba3622b`; current-engine replay coverage passed inside `bun run test`.
- Browser acceptance — Analysis, Factory overview, and `etch-1` focus loaded without console or alert errors and exposed the same `94.0 / 23.1 / 70.9` workload, overlap, and idle-window evidence.

## Progress log

- 2026-07-31 — Plan created from the exhausted Run 110 maintenance frontier after exact event chronology contradicted the raw loss interpretation.
- 2026-07-31 — Added exact ready-work interval events, phase-aware runtime conservation, provider crew separation, and V9 loss attribution across Core.
- 2026-07-31 — Projected the same evidence through CLI, Studio, Observation, Workbench, Design provider context, and current immutable Run 112.
- 2026-07-31 — Relocked both example Benchmark suites, rejected pre-contract evidence as invalid, completed browser and full-suite verification, and archived the plan.

## Completion

Completed on 2026-07-31. Maintenance remains visible as physical work, but only exact overlap with complete ready production plans enters the recoverable-loss ranking. The memory-fab remains accepted, and the next shared task is again grounded in current furnace input-starvation evidence.
