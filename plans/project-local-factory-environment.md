# Add a project-local Factory environment layer

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/project-boundaries]], [[docs/design/studio-debugger]], and [[docs/PROJECT_FORMAT]].

## Outcome

The memory-fab Factory reads as an open-roof cleanroom exhibit with an authored floor, perimeter architecture, and a coherent distant industrial backdrop, while every environment choice remains explicit, project-local, inspectable by Agents, and irrelevant to industrial execution.

## Context

The completed [[plans/memory-fab-visual-language]] and [[plans/device-pbr-material-migration]] gave equipment distinct silhouettes and self-contained materials. The surrounding scene is still a hard-coded dark plane, grid, and fog, so the commissioned factory floats in an empty simulation space. Studio has no project-level contract for an environment image or floor palette.

This is a presentation boundary, not a new building simulator. The first environment remains deliberately roofless so the full factory is readable from the existing inspection camera. A later architectural pass may add roofs, cutaways, rooms, and visibility controls without being smuggled into this plan.

## Scope

### In scope

- Add a strict optional project-manifest environment contract for floor palette, grid/section markings, slab margin, and one project-local distant backdrop image.
- Resolve and serve the backdrop only from the owning project, with no shared asset lookup or project-id switch in Studio.
- Render a larger cleanroom slab, functional aisle/edge markings, low perimeter architecture, service columns, and a fog-integrated far wall behind the authoritative Factory geometry.
- Generate and inspect one text-free, people-free memory-fab backdrop asset and store it under the project.
- Preserve responsive overview, work-cell, and focus presentation and verify both memory-fab and an environment-free project.

### Out of scope

- Roofs, interior-room occlusion, architectural collision, walk-through navigation, people, or evacuation modelling.
- Moving authored industrial geometry, changing Blueprint hashes, or using scenery to hide operational evidence.
- Shared environment libraries, remote image URLs, implicit appearance selected by project id, or compatibility readers.
- Photorealistic digital-twin claims; the generated view is an illustrative semiconductor cleanroom backdrop.

## Acceptance

- [x] `inm.json` can explicitly describe a confined, project-local Factory environment and `inm schema manifest --json` exposes the same strict contract.
- [x] Memory-fab renders a legible cleanroom slab, functional zoning, open-roof perimeter structure, and generated distant equipment/wall scenery without obscuring machines, belts, labels, or selection.
- [x] Environment-free projects retain the current generic Factory behavior, and presentation metadata leaves compiled simulation events, state, metrics, and Blueprint identity unchanged.
- [x] Desktop and narrow Factory views, Core/Studio tests, type checking, project validation, documentation checks, and full regression pass.

## Work

- [x] Define and document the project-local environment contract and confinement rules.
- [x] Generate, inspect, and install the memory-fab distant cleanroom asset.
- [x] Implement floor, architectural, backdrop, lighting, fog, and responsive-detail rendering.
- [x] Add contract, server, rendering, and invariance coverage.
- [x] Perform browser comparison and complete the acceptance audit.

## Findings and decisions

- 2026-07-23 — Equipment PBR maps belong to Device packages, while the requested far wall and slab describe the whole project; they therefore need a separate project-level presentation boundary.
- 2026-07-23 — The backdrop will be an actual plane inside the 3D scene so camera, fog, occlusion, and responsive composition remain coherent; it will not be a CSS page background.
- 2026-07-23 — Floor lanes and boundary markings remain code-rendered from manifest colors because they communicate authored geometry. The generated raster is reserved for non-authoritative distant visual richness.
- 2026-07-23 — Project-level environment imagery is validated and confined but deliberately excluded from industrial catalog and Blueprint hashes, so changing scenery cannot invalidate immutable production evidence.
- 2026-07-23 — The first environment uses a 1983×793 generated elevation. Its small baked floor apron is placed behind the real rear aisle and reads as distance rather than interactive ground.

## Verification

- `bun run inm validate examples/memory-fab --json` — valid, 62 Devices and 17 connections; Blueprint remains `f4d8d490…` and all industrial catalog hashes remain current.
- `bun run inm validate examples/ironworks --json` — the environment-free project remains valid and Studio projects `environment: null`.
- Focused Core tests — public manifest JSON Schema exposes the strict environment contract, missing project-local backdrop files fail loading, and presentation changes leave events, state, and metrics identical.
- Studio server test — environment-free data preserves the generic rendering path and current compatible evidence selection.
- Browser comparison at the 1280×720 desktop viewport — overview and explicit work-cell views render the cleanroom far wall, extended slab, rear aisle, perimeter structure, machines, belts, labels, selection affordance, and telemetry without console warnings or errors. The pure presentation suite verifies `AUTO` resolves to work-cell scale at a narrow viewport.
- `bun run docs:check` — 615 repository double-links resolve.
- `bun run test` — 209 tests, 1,778 assertions, type checking, documentation checks, Core/CLI/Studio suites, immutable replay, all memory-fab Design/Benchmark paths, and 8 Ironworks industrial fixtures pass with zero failures.

## Progress log

- 2026-07-23 — Plan activated after the user requested floor and distant-scene rendering for the open-roof memory-fab exhibit.
- 2026-07-23 — Added the public project-level contract, generated and installed the far-wall asset, and implemented Studio's slab, aisle, curbs, service columns, and scene-integrated backdrop.
- 2026-07-23 — Verified overview/work-cell browser presentation, environment-free fallback, strict file confinement, industrial invariance, and the full repository regression.

## Completion

Shipped a strict optional `presentation.environment` contract, a self-contained generated memory-fab cleanroom elevation, and a generic Studio environment renderer with an extended epoxy slab, functional rear aisle, project-authored grid palette, open-roof perimeter curbs, illuminated service columns, and a fog-aware far wall. The environment has no project-id switch and does not change authored industrial geometry, Blueprint/catalog identity, simulation, or immutable evidence. Roofs, room occlusion, and architectural cutaways remain a future independent layer.
