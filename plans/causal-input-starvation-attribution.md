# Causal input-starvation attribution

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/material-contracts]], [[docs/design/logistics]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]]

## Outcome

Turn productive-equipment input starvation from an unexplained inter-job time bucket into exact, interval-backed evidence that identifies the missing Resource and input Buffer, its immediate physical supply path, and the directly observed state preventing that path from satisfying the Device, with one shared projection for humans and Agents.

## Context

Current V6 loss attribution correctly removes maintenance, changeover, failure, output blocking, batch/campaign hold, tooling, utility, sleep, and power intervals from repeated productive opportunity. What remains is still labeled `inter-job-input-gap` from timing alone. Contributors contain no Resources, Buffers, connections, or upstream Devices, so the top memory-fab signal tells an operator where time accumulated but not what industrial relationship should be changed.

The runtime already owns exact Device buffers, selected Process inputs, physical connections, in-flight cargo, endpoint Device state, and deterministic evaluation boundaries. This plan records the immediate state that the runtime can prove. It will not recursively rewrite an upstream wait into a speculative graph-wide root cause, and it will not treat normal material transit as recoverable loss without an observed shortage interval.

## Scope

### In scope

- Record material-input shortage interval changes for productive Process Devices with exact required, available, and missing quantities.
- Resolve each missing Resource to the exact target Buffer and every immediate authored local supply connection, including source Device, source Buffer, source inventory, in-flight quantity, source Device status, and the directly observed supply state.
- Partition ranked inter-job input-gap time by exact shortage Resource and immediate supply state while preserving the existing opportunity and unavailability boundaries.
- Carry strict current evidence through Fab Loss, Design proposal context, immutable runs, CLI JSON/human output, Workbench, and Studio.
- Refresh the memory-fab engine evidence and use the new attribution to choose the next bounded intervention family.

### Out of scope

- Recursive or counterfactual graph-root attribution.
- Treating reusable tooling, facility utilities, maintenance inputs, campaign holds, power, or output capacity as material starvation.
- Adding implicit connections, shared assets, or a compatibility layer for older evidence contracts.
- Automatically promoting a factory change before the locked Benchmark proves it.

## Acceptance

- [x] Every ranked material-starvation contributor names one or more exact Resource/Buffer shortages and its interval totals reconcile with the contributor's event-backed starvation time.
- [x] Each shortage interval reports only directly observable supply state and immediate authored connection/upstream subjects; missing or ambiguous topology remains explicit rather than guessed.
- [x] CLI JSON, CLI human output, Studio, Workbench diagnostics, and Design proposal context consume the same strict current Core structure without prose parsing.
- [x] Simulator and loss-analysis tests prove interval opening, cause changes, restoration, multi-input shortages, in-flight supply, and exact time conservation.
- [x] A current compatible memory-fab Run and current Design authority replace incompatible evidence, and full repository tests plus browser checks pass.

## Work

- [x] Audit the existing waiting-input status, unavailability exclusions, Process readiness, buffer contracts, physical connections, and Fab Loss projection.
- [x] Define the strict shortage and immediate-supply-state contract in Core types and design documentation.
- [x] Emit deterministic shortage interval changes from runtime Process evaluation and test exact event semantics.
- [x] Attribute only overlap with ranked inter-job opportunity gaps, conserve time, and expose exact contributors.
- [x] Update Design API, Workbench, CLI, Studio, schemas, fixtures, and project-local TypeScript contracts.
- [x] Regenerate current memory-fab Run and Design evidence, then audit every acceptance item.

## Findings and decisions

- 2026-07-25 — Tooling, utility, maintenance, changeover, failure, output blocking, batch/campaign, sleep, and power already have independent event intervals and remain excluded from material starvation.
- 2026-07-25 — V6 `inter-job-input-gap` derives time from `device.finish → next device.start` and leaves `resources: []`; it cannot support an actionable industrial change.
- 2026-07-25 — The engine can prove only the immediate authored supply relationship and sampled runtime state. Recursive root-cause propagation is intentionally excluded because it would overstate causality.
- 2026-07-25 — Normal in-flight cargo is preserved as a distinct observed supply state. Its presence explains a shortage interval but does not by itself prove that lane capacity is the recoverable cause.
- 2026-07-25 — Older evidence will become invalid under the new strict contract; pre-alpha development does not retain compatibility aliases.
- 2026-07-25 — Runtime V7 now owns deterministic `device.input-starved` and `device.input-restored` events. Each active shortage records exact required, available, and missing quantities plus the target Buffer and every immediate authored supply observation.
- 2026-07-25 — Current memory-fab Run `084-simulate` contains 257,876 explicitly attributed shortage ticks across 1,193,860 repeated productive-opportunity ticks, with 79,000 independently unavailable ticks and zero unattributed eligible ticks.
- 2026-07-25 — The leading contributor is `furnace-1`: `dielectric-stack-lot` at `batch-input`, supplied through `deposition-to-batch-furnace` by `deposition-1`. Its directly observed states include 23,800 ticks of source processing and 8,756 ticks of source waiting for its own input, plus exact in-flight signatures.
- 2026-07-25 — Proposal providers may claim `input-starvation` only by matching one exact observed subject and one exact observed supply state. Generic CONWIP and release-control candidates therefore do not claim this loss; the current commissioned Design frontier remains exhausted without a promotion.
- 2026-07-25 — Current Design authority is `08b1d0003e117735b41a257c77cbf343bf9d01bcfa8ffad271424047d8383cfb`: four of seven candidates evaluated, frontier exhausted, with no candidate improving the locked commissioned Blueprint.

## Verification

- `bun run docs:check` — 799 documentation links pass.
- `bun run inm validate examples/memory-fab --json`
- `bun run inm analyze examples/memory-fab --section summary --json`
- `bun run inm simulate examples/memory-fab --section summary --json` — reuses current immutable Run `084-simulate`, engine `inm-sim/0.83.0`, result hash `671c9bf989a17aedf06b39c56e28af4982b1181159459542c561cdc0577e9c87`.
- `bun run inm inspect examples/memory-fab --section losses --json` — reports V7 causal shortage evidence from Run `084-simulate`.
- `bun run inm test examples/memory-fab` — two scenarios pass.
- `bun run test` — 238 package tests pass with 2,003 expectations, followed by all eight Ironworks project tests.
- Browser verification at `http://localhost:4176`: launcher, memory-fab Workbench, current Design deep link, and Factory replay all load; the Workbench and event stream expose the V7 causal evidence; browser logs contain no warning or error.

## Progress log

- 2026-07-25 — Plan created after the current commissioned V6 Design frontier exhausted every eligible generic intervention while input starvation remained the leading signal.
- 2026-07-25 — Added strict Core shortage/supply-state contracts, deterministic runtime events, opportunity-window attribution, exact time conservation, and focused simulator/loss-analysis tests.
- 2026-07-25 — Migrated Design proposal context, Workbench, CLI, Studio, project-local TypeScript strategies, and design documentation to the current-only V7 contract.
- 2026-07-25 — Relocked 13 Benchmarks, regenerated nine Ironworks Runs, generated memory-fab Run `084-simulate`, and rebuilt current commissioned Design authority `08b1d0003e117735b41a257c77cbf343bf9d01bcfa8ffad271424047d8383cfb`.
- 2026-07-25 — Completed public CLI, full repository, immutable-evidence, and browser verification.

## Completion

Material starvation is now a first-class, event-backed industrial fact rather than a timing remainder. Humans and Agents see the same exact missing Resource, target Buffer, immediate physical route, upstream subject, observed supply state, and conserved duration. The commissioned memory-fab evidence now identifies a bounded next intervention surface without pretending that the current generic Design frontier solved it.
