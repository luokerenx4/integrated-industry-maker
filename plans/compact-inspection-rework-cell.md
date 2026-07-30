# Compact inspection-rework cell

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/observation-led-design]], [[docs/design/industrial-investigations]], [[docs/design/logistics]], [[docs/design/fab-loss-attribution]], and [[docs/design/coding-agent-optimization]].

## Outcome

Determine whether co-locating the existing `rework-1` cell with `inspection-1` can shorten the exact conditional inspection/rework loop, recover physical area and capital, and reduce the current inspection input-starvation exposure without weakening delivery, quality, capacity, or any locked current-factory case.

## Context

Immutable Run `100-simulate` remains the exact current memory-fab operating record for Blueprint `6b8b0ce24a75…`. Input starvation ranks first: `inspection-1` accounts for `57.984 s` of explicit repeated-opportunity shortage while running at only `20.7%` utilization.

The accumulated Investigation already excludes six focused etch/transport strategies, two metrology standby substitutions, and an upstream lithography-to-etch handoff that was commissioned. More aggressive `closed-loop-fast-3-4` etch operation regressed locked cases. A vacuum upgrade for the ordinary inspection main line cannot be isolated because `etch-to-inspection` and `rework-to-inspection` share the same physical destination cell; upgrading both lanes exceeded the capital cap.

The remaining layout itself exposes a physically distinct hypothesis. `inspection-1` occupies `(17,20)` while `rework-1` occupies `(27,20)`. Rejected lots travel seven ordinary belt cells to rework, then recovered lots take a twenty-one-cell detour back to the shared inspection unloader. Only two of twelve lots use the conditional loop, but `5.067 s` of return transit overlaps the leading inspection shortage and the long paths consume capital and area even when idle.

## Scope

### In scope

- Reopen exact typed and spatial Run `100-simulate` evidence for `inspection-1`, `etch-l2`, and both rework-loop connections.
- Move only the existing rework Device and the endpoints/paths of `inspection-to-rework` and `rework-to-inspection`.
- Preserve every Device asset, Process, policy, buffer, Resource filter, main `etch-to-inspection` lane, and factory output contract.
- Source one exact Candidate from the existing `inspection-starvation-next-step` Investigation and decide it through the locked five-case review.
- Apply and regenerate current operating evidence only if the Candidate is a strict KEEP.

### Out of scope

- Re-running or renaming the already bounded etch-mode, vacuum-handoff, and metrology-standby hypotheses.
- Adding inspection or rework capacity.
- Weakening the `230000` capital cap, current-best case guards, hard outcomes, or Objective constraints.
- Treating recovered floor area or aggregate score alone as authority to commission.
- Adding compatibility behavior for superseded project evidence.

## Acceptance

- [x] The Investigation records the exact Run `100-simulate` spatial observation and one falsifiable compact-cell hypothesis without rewriting prior entries.
- [x] The Candidate changes only `rework-1`, the rework-loop endpoints required by the new position, and the two conditional loop paths; the main inspection lane and all industrial contracts remain byte-equivalent.
- [x] The locked review plus commissioned Run report exact before/after loop travel, build cost, area, inspection starvation, WIP, score, delivery, quality, on-time service, capacity, and every current-factory case.
- [x] KEEP requires reduced conditional-loop travel and inspection starvation, capacity READY, every Objective constraint and hard outcome passing, and no current-factory case regression; otherwise the Blueprint remains unchanged and the Investigation records revise, defer, or discard.
- [x] CLI, Studio replay, immutable artifacts, the Investigation chain, and this plan agree on the final disposition.
- [x] Project validation, targeted checks, replay where applicable, and the full repository checkpoint pass before completion.

## Work

- [x] Inspect current typed evidence, retained hypothesis history, capital boundary, and the exact Factory geometry.
- [x] Append the compact-cell hypothesis to the current Investigation and create its exact Candidate patch.
- [x] Complete the locked/current/proposed review and append an explicit Agent disposition.
- [x] Apply only a strict KEEP, generate a compatible Run, and compare typed plus spatial before/after evidence.
- [x] Reconcile fixtures and public surfaces, run the full checkpoint, complete the acceptance audit, and prepare the verified checkpoint.

## Findings and decisions

- 2026-07-30 — Run `100-simulate` partitions `inspection-1` shortage into `38.640 s` while `etch-l2` processes, `10.344 s` while it waits for input, and `9.000 s` while the main wafer is in transit. The main four-cell lane carries twelve lots at `1.3%` utilization with zero blocked item-ticks, so this plan does not mislabel capacity or congestion as the problem.
- 2026-07-30 — Spatial inspection confirms `etch-l2` at `(15,15)`, `inspection-1` at `(17,20)`, and `rework-1` at `(27,20)`. The conditional outbound path has seven cells and the return path has twenty-one; both use ordinary conveyor/sorter assets.
- 2026-07-30 — The initial proximity-only layout kept the return path's existing approach and shared destination cell, moved `rework-1` to `(22,20)`, shortened `inspection-to-rework` to two cells, and proposed truncating `rework-to-inspection` to eleven cells. It predicted fifteen fewer paid belt cells, but had not yet respected the rework asset's explicit port geometry.
- 2026-07-30 — Candidate `compact-inspection-rework-cell` fails physical compilation before simulation: its proposed north-side return loader is not one cell from the asset's explicit east `recovered-output`. Investigation entry `0017` records REVISE instead of deleting or rewriting the failed idea.
- 2026-07-30 — Revised Investigation hypothesis `0018` preserves the qualified rework cell's west-input/east-output orientation. Its legal return path begins at `(25,21)` and uses sixteen cells, so the exact loop becomes `7 + 21 → 2 + 16` cells and `3.8 → 2.8 s`, recovering ten cells rather than the initially hypothesized fifteen.
- 2026-07-30 — Strict Candidate review `fd0ad9e29292…` returns KEEP. Every current-factory score improves by `+0.438903` to `+0.505000`; occupied area falls `269 → 259`, build cost `229940 → 229840`, capacity remains READY, and every Objective constraint, hard outcome, delivery, quality, scrap, escape, and on-time guard passes.
- 2026-07-30 — The review's tradeoffs remain explicit. The quality-excursion case adds `0.045933` WIP-equivalent while still improving score by `+0.438903`; mixed-quality P95 cycle time shifts `73.856 → 78.023 s` while mean cycle, delivery, and on-time completion remain unchanged. Investigation entry `0019` records the Agent KEEP as physical-economy and conditional-loop authority, not as an unmeasured claim that the leading shortage is solved.
- 2026-07-30 — Immutable Run `101-simulate` proves the causal target after commissioning. `inspection-1` starvation falls `57.984 → 56.984 s` and factory-wide attributed input starvation falls `245.026 → 244.026 s`. The removed second is exactly the main-source-waiting/rework-return-transit overlap; `38.640 s` of etch source processing and `9.000 s` of ordinary main-line transit remain unchanged.
- 2026-07-30 — Run `101-simulate` score improves `-0.306590 → 0.198410`, mean lot movement falls `8.433 → 8.267 s`, delivery remains `88`, all `12/12` lots complete on time, good yield remains `100%` with two repaired lots, and scrap and escapes remain zero.
- 2026-07-30 — Studio replay confirms `rework-1` at `(22,20)`, `inspection-to-rework` at two cells / `700 ms`, `rework-to-inspection` at sixteen cells / `2100 ms`, and the unchanged `etch-to-inspection` main line at four cells / `900 ms`.

## Verification

- `bun run inm observe examples/memory-fab --run 100-simulate --json`
- Studio Run `100-simulate` overview plus focused `inspection-1`, `etch-l2`, `etch-to-inspection`, and `rework-1` views.
- Failed compile of `compact-inspection-rework-cell` — exact `rework-1.recovered-output` path-start violation retained as Investigation REVISE.
- `bun run inm candidate examples/memory-fab --candidate compact-inspection-rework-cell-east-port --review --progress human --json`
- `bun run inm candidate examples/memory-fab --candidate compact-inspection-rework-cell-east-port --apply --progress human --json`
- `bun run inm validate examples/memory-fab --json`
- `bun run inm analyze examples/memory-fab --json`
- `bun run inm plan examples/memory-fab --json`
- `bun run inm simulate examples/memory-fab --json` — retained Run `101-simulate`, result `d0a140643718…`.
- `bun run inm observe examples/memory-fab --json`
- `bun run inm inspect examples/memory-fab --section losses --json`
- Studio Run `101-simulate` overview plus focused rework Device, both rework-loop Connections, and unchanged main inspection Connection.
- `bun test packages/inm-cli/src/commands.test.ts -t 'public inspect gives Agents and humans the same current loss contributors'` — `1` focused test / `30` assertions passed.
- `bun test packages/inm-core/src/benchmark-outcome-guardrails.test.ts -t 'memory-fab advanced recovery exposes exact Objective score causality'` — `1` focused test / `10` assertions passed.
- `bun test packages/inm-core/src/design-program.test.ts -t 'inspection supply Design closes one exact causal frontier without changing the commissioned Blueprint'` — `1` focused test / `16` assertions passed.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts -t 'one command enters the authoritative shared project next action without route knowledge'` — `1` focused test / `5` assertions passed.
- `bun run test` — documentation and all TypeScript projects passed; `327` package tests / `4153` assertions and all `8` public Ironworks fixtures passed.

## Progress log

- 2026-07-30 — Plan created from exact Run `100-simulate`, the fifteen-entry Investigation history, the closed six-strategy inspection frontier, current Blueprint geometry, and direct Factory observation.
- 2026-07-30 — Investigation entries `0016–0020` preserve the initial hypothesis, port-geometry REVISE, corrected hypothesis, exact KEEP review decision, and current Run `101-simulate` operating checkpoint.
- 2026-07-30 — Applied `compact-inspection-rework-cell-east-port`, retained Run `101-simulate`, and completed typed plus spatial before/after observation.
- 2026-07-30 — Reconciled current-factory and historical-causality fixtures, then completed the full repository checkpoint.

## Completion

Completed on 2026-07-30. The legal east-port layout co-locates rework with inspection, removes ten paid belt cells, lowers build cost and occupied area, improves all five locked current-factory cases, and removes one exact second of inspection starvation without changing delivery or quality. The failed proximity-only hypothesis remains append-only REVISE evidence; immutable Run `101-simulate` is the commissioned operating checkpoint.
