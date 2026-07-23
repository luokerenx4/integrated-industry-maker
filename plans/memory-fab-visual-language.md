# Establish a memory-fab visual language

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/project-boundaries]], [[docs/design/studio-debugger]], and [[docs/PROJECT_FORMAT]].

## Outcome

The memory-fab Factory replay reads as a semiconductor facility rather than a field of colored placeholder blocks: humans can distinguish major equipment families by silhouette, dense layouts remain legible, and every project-specific visual choice remains inside the self-contained project assets.

## Context

The current Factory surface already provides stable navigation, replay, object selection, physical belts, live status, and an accepted industrial control-room palette. Its asset format, however, offers only `box`, `cylinder`, `sphere`, and `plane`; nearly every memory-fab process tool therefore becomes the same rounded cuboid with a different color. Always-visible billboard labels compensate for weak silhouettes and create overlap in the dense commissioned layout. The floor communicates a simulation grid, but not a cleanroom organized around process bays and service infrastructure.

This is a representation problem, not a request to put visual identity into simulation semantics. Core continues to own renderer-independent geometry and asset loading. Studio may supply a generic procedural equipment-profile library, while each project-local `visual.json` explicitly chooses its own profile, material identity, label, texture, or model. No shared project asset library is introduced.

## Scope

### In scope

- Replace primitive-only Device appearance with a small generic set of procedural industrial profiles suitable for process enclosures, chamber tools, vertical furnaces, metrology stations, racks, packaging cells, storage/service stations, and utility vessels.
- Let project-local Device visuals select those profiles explicitly; migrate current examples directly to the new active format without compatibility aliases.
- Improve dense-factory composition through cleanroom floor treatment, restrained service detail, camera framing, label hierarchy, selection, bottleneck, progress, and live-state feedback.
- Preserve GLTF and texture overrides for fully bespoke project-local assets.
- Verify the Factory at desktop and narrow viewport sizes without changing simulation hashes or industrial behavior.

### Out of scope

- A shared cross-project asset library, remote asset marketplace, or implicit lookup by memory-fab asset id.
- Photorealism, people, architectural walkthroughs, or manually modeled versions of every machine.
- Blueprint layout optimization, simulation semantics, production KPIs, or hiding industrial evidence to obtain a cleaner screenshot.
- Backward-compatible visual aliases or migration readers during pre-alpha.

## Acceptance

- [x] Lithography, etch, deposition, furnace, inspection/metrology, probe/test, packaging, service/storage, and utility assets are distinguishable in an unlabeled wide view.
- [x] Project-local visual files select the appearance; Studio contains no memory-fab asset-id switch and other projects retain a coherent generic rendering.
- [x] Labels are readable without dominating the scene, and selected, bottleneck, processing, maintenance/failure, and progress states remain apparent.
- [x] The default camera and cleanroom floor frame the full commissioned factory with less dead space and visual overlap at desktop and narrow viewport sizes.
- [x] Core/Studio tests, project fixtures, documentation checks, type checking, full regression, and manual browser comparison pass.

## Work

- [x] Define the active project-local Device visual profile contract and document its renderer-independent boundary.
- [x] Build procedural Studio bodies and migrate memory-fab Device visuals to intentional equipment profiles.
- [x] Refine cleanroom floor, lighting, camera framing, labels, and state/selection treatments.
- [x] Add schema/loader/Studio tests and verify generic fallback behavior on Ironworks.
- [x] Perform desktop and narrow browser comparison, record evidence, and complete the acceptance audit.

## Findings and decisions

- 2026-07-23 — The current scene's industrial palette and replay behavior are already useful; weak semantic silhouettes and label congestion are the primary visual gaps.
- 2026-07-23 — Project self-containment rules out selecting appearance from a shared memory-fab catalog. A generic renderer profile is code capability, while the profile choice and any model/texture remain owned by each asset package.
- 2026-07-23 — The first phase will favor procedural profiles over a fleet of external models so state coloring, selection, footprint scaling, and deterministic project fixtures remain cheap and consistent.
- 2026-07-23 — The Device `shape` contract remains the explicit asset-selected field and now includes generic industrial profiles. Keeping one field avoids a primitive/profile precedence rule or a legacy alias.
- 2026-07-23 — Asset presentation files are included in the Device catalog hash by project-boundary design. All eight Benchmarks were deliberately relocked from catalog `fd8ece2d…` to `83dc6c7d…`; historical runs remain immutable while compatible runs `061-simulate` and `062-simulate` carry the new catalog.

## Verification

- User-supplied baseline screenshot recorded in the task conversation on 2026-07-23.
- `bun run inm validate examples/memory-fab --json` — valid, 62 Devices, 17 connections, unchanged Blueprint `d679917…`, new visual Device catalog `83dc6c7d…`.
- `bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern 'visual metadata'` — the industrial profile change leaves events, state, and metrics identical.
- `bun run memory-fab:relock-benchmarks` — all eight project-local Benchmarks relocked; only `deviceCatalogHash` changed.
- `bun run inm simulate examples/memory-fab --json` — compatible run `061-simulate`, result `e2521ac2…`.
- Energy selection simulation — compatible run `062-simulate`, result `6978e920…`.
- Focused Core/CLI evidence — 26 tests, 333 assertions, zero failures.
- `bun run docs:check` — 597 repository double-links resolve.
- `bun run inm validate examples/ironworks --json` — the unchanged primitive-profile project remains valid with 29 Devices.
- Browser comparison at `1256 × 1200` and `640 × 800` — procedural silhouettes, responsive camera, reduced idle telemetry, cleanroom floor, timeline, and navigation render without console warnings/errors.
- `bun run test` — 198 tests, 1,786 assertions, all Ironworks fixtures, type checking, documentation checks, and Studio tests pass with zero failures.

## Progress log

- 2026-07-23 — Activated after the user accepted the completed Q-time Factory view and identified equipment appearance and shape as the next visual opportunity.
- 2026-07-23 — Implemented the first procedural profile set and migrated memory-fab assets without any project-id switch in Studio.
- 2026-07-23 — Added responsive bounds-based camera framing, cleanroom surface treatment, fill lighting, compact label hierarchy, and physical status beacons; desktop and narrow browser checks pass.
- 2026-07-23 — Relocked visual-catalog-dependent Benchmarks and generated compatible default/energy evidence without changing either Blueprint or industrial behavior.
- 2026-07-23 — Completed the full repository regression and the acceptance audit; moved the plan to `completed`.

## Completion

Shipped thirteen generic asset-selected industrial profiles plus a turbine profile, migrated the self-contained memory-fab Device visuals, and refined the Factory's cleanroom floor, bounds-aware camera, lighting, label hierarchy, status beacons, selection, and progress presentation. Studio contains no memory-fab asset-id appearance switch, and primitive Ironworks assets remain valid. All asset-dependent Benchmarks were deliberately relocked, compatible runs `061-simulate` and `062-simulate` were generated, and the full regression plus desktop/narrow browser comparison passed. Higher-fidelity project-local GLTF art or architectural layer controls are intentionally not folded into this completed first phase.
