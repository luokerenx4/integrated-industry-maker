# Deepen the project-local Factory environment

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/studio-debugger]], [[docs/design/project-boundaries]], and [[docs/PROJECT_FORMAT]].

## Outcome

The memory-fab Factory reads as an open-roof cleanroom exhibit with a tactile project-owned floor and an intentionally framed distant production hall at overview and work-cell scales, without moving or obscuring industrial geometry.

## Context

The completed [[plans/project-local-factory-environment]] established the environment contract, a code-rendered slab, and one generated far-wall asset. Current browser evidence shows that the slab is legible but visually flat, while the far wall collapses into a narrow strip behind the presentation controls—especially when `AUTO` resolves to work-cell scale. The rendering capability exists, but it does not yet create convincing depth.

This follow-up improves the existing boundary instead of inventing another scenery system. Floor material files remain self-contained under the memory-fab project, and all presentation remains irrelevant to compilation and simulation identity.

## Scope

### In scope

- Add a strict project-local PBR material contract to the environment floor.
- Generate and install a subdued, tileable cleanroom epoxy floor material.
- Recompose the existing generated far wall, atmospheric depth, and camera framing so the environment is visible at overview and work-cell scales.
- Preserve generic environment-free rendering and all industrial geometry, replay, and selection behavior.

### Out of scope

- Roofs, rooms, cutaways, collision, people, walk-through navigation, or architectural simulation.
- Shared assets, remote images, project-id appearance switches, or changes to Blueprint and industrial evidence.

## Acceptance

- [x] The memory-fab floor has restrained material depth without reducing grid, belt, cargo, label, or selection legibility.
- [x] The generated distant hall is visibly part of the scene in both overview and work-cell browser views instead of appearing as a clipped decorative strip.
- [x] The floor material is strict, project-confined, documented, and served through the existing project boundary.
- [x] Environment-free projects retain the generic path, presentation remains simulation-invariant, and focused/full verification passes.

## Work

- [x] Generate and import the environment floor material with a project-local TypeScript pipeline.
- [x] Implement the active floor contract and Studio PBR rendering.
- [x] Recompose backdrop, fog, and camera presentation at both scene scales.
- [x] Add contract/rendering coverage, update durable design truth, and complete browser/regression verification.

## Findings and decisions

- 2026-07-24 — The current generated `cleanroom-far-wall.png` is visually suitable; the primary defect is scene composition, not image quality. Preserve it and spend new generated imagery on the currently flat floor.
- 2026-07-24 — The current Studio process predated the Objective schema change and was rejecting `wipResources`; restarting against the current tree restored the Factory before visual comparison.

## Verification

- `bun run memory-fab:environment-material --source examples/memory-fab/assets/environment/cleanroom-floor-source.png` generates and seam-checks the 512px base-color, normal, and roughness maps.
- Focused Core/Schema tests prove strict project confinement and presentation invariance; Studio presentation/server tests pass.
- `bun run inm validate examples/memory-fab --json` remains valid with 62 Devices and 17 connections.
- Browser comparison at the default work-cell view and a temporary `1280 × 800` overview shows a readable floor, back wall, equipment, transport, labels, and evidence sidebar with no console warnings or errors.
- Documentation checks, type checking, 218 unaffected full-suite tests, and all three relocked exact-score tests pass.

## Progress log

- 2026-07-24 — Plan activated after browser evidence showed a readable flat slab and a nearly clipped far-wall plane.
- 2026-07-24 — Generated and installed the floor material, raised the architectural composition, and completed focused plus browser verification.

## Completion

The memory-fab now owns a generated cleanroom epoxy source plus deterministic TypeScript-derived base-color, normal, and roughness maps. The strict project manifest supplies material response and world-space tile size; Studio clones and repeats confined maps across the slab and Region surfaces. A taller far wall and elevated overview/work-cell camera targets establish visible depth while preserving the open-roof exhibit, industrial geometry, interaction, and evidence.
