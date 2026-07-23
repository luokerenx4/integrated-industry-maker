# Make dense Factory presentation responsive to inspection scale

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/studio-debugger]] and [[plans/device-pbr-material-migration]].

## Outcome

Dense factories remain understandable at both desktop and narrow viewports: a human can see the whole industrial system, move into a legible work-cell scale, and inspect a Device without presentation-only camera fitting or labels obscuring the physical flow. The same route-backed selection and scene data remain available to Agents.

## Context

The current bounds-aware camera fits the complete commissioned memory fab reliably, but a `390 × 844` viewport reduces individual equipment to very small projected shapes. Selection and the inspector still work, yet discovery becomes harder because full-factory overview and device-scale inspection compete for the same camera policy.

This is a Studio presentation problem. Blueprint positions, footprints, connections, simulation, and renderer-independent scene projection remain authoritative and unchanged.

## Scope

### In scope

- Define explicit overview, work-cell, and selected-object camera/detail levels derived from the compiled scene bounds and current route-backed selection.
- Preserve stable navigation, selection, replay, status, and inspector behavior across desktop and narrow viewports.
- Reduce label and secondary-detail density progressively without hiding physical machines, belts, bottlenecks, or failures.
- Verify representative small and dense projects in desktop and narrow browser comparisons.

### Out of scope

- Blueprint relayout, mobile-native editing, new industrial semantics, shared project assets, or asset-id-specific camera rules.

## Acceptance

- [x] A narrow viewport offers a legible path from whole-factory overview to work-cell and selected-device inspection without changing Blueprint geometry.
- [x] Camera/detail policy is deterministic from scene, viewport, and route-backed selection; no project-specific asset ids or hidden UI-only industrial state are introduced.
- [x] Labels, live state, bottlenecks, belts, and selection remain discoverable at every supported detail level.
- [x] Desktop behavior does not regress, and browser checks plus Studio tests cover both a dense memory fab and Ironworks.

## Work

- [x] Measure the current projected-size and occlusion failure modes at representative viewports.
- [x] Design the route-backed camera/detail-level contract and interaction.
- [x] Implement generic Studio presentation policies and focused tests.
- [x] Perform desktop/narrow comparison and complete the acceptance audit.

## Findings and decisions

- 2026-07-23 — The PBR migration confirmed that asset detail is visible at desktop scale but compressed by whole-factory fitting at `390 × 844`; material fidelity alone cannot solve inspection-scale legibility.
- 2026-07-23 — Presentation scale is a Studio projection of the compiled scene, not Blueprint state. `auto` resolves to overview on a wide scene viewport, work-cell on a narrow one, and selected-object focus whenever the route identifies a valid scene object.
- 2026-07-23 — Explicit overview and work-cell controls may override automatic focus without clearing the route-backed selection. This keeps camera intent independent from the shared human/Agent selection contract.
- 2026-07-23 — Overview reduces identity labels to selected, active, failed, or bottleneck equipment. Work-cell and focus restore all nearby equipment labels; physical geometry and live state beacons remain present at every scale.
- 2026-07-23 — Real `390 × 844` emulation showed that a fixed 24-cell work-cell still over-fitted the horizontal FOV. Work-cell width now follows the live canvas aspect ratio and centers on the generic non-sorter equipment fleet; no asset or project ids participate.

## Verification

- `bun test packages/inm-studio/src/factory-presentation.test.ts` — 5 tests and 9 assertions pass, covering wide/narrow AUTO, Device and connection focus, explicit override, invalid route fallback, and input immutability.
- `bun test --max-concurrency=1 packages/inm-core packages/inm-cli packages/inm-studio` — 205 tests passed; the memory-fab project synthesis test exceeded its 15-second timeout once at 16.77 seconds while both Studio visual-check servers were running.
- `bun test packages/inm-core/src/project-synthesis.test.ts` — the isolated timed-out test passed in 8.94 seconds after releasing those visual-check processes.
- `bun run typecheck`, `bun run docs:check`, `bun run inm test examples/ironworks`, and `git diff --check` pass.
- Browser, memory fab desktop — AUTO overview fits the dense commissioned factory with progressive labels; Device deep link `/memory-fab/factory/devices/burn-in-1` resolves to FOCUS; explicit overview/work-cell changes preserve that URL and inspector; console has no warnings or errors.
- Browser, memory fab `390 × 844` — AUTO resolves to WORK CELL with aspect-aware equipment scale; the same Device deep link resolves to FOCUS; document and inspector widths remain `390/390` and `372/372` with no horizontal overflow or console errors.
- Browser, Ironworks desktop — AUTO overview fits both industrial zones and retains machines, deposits, belts, and the inter-zone route without console warnings or errors.

## Progress log

- 2026-07-23 — Proposed after completing [[plans/device-pbr-material-migration]]; no implementation has started.
- 2026-07-23 — Activated after auditing the current bounds-fit camera, route-backed selection, label layer, and narrow Factory shell.
- 2026-07-23 — Added the pure presentation policy, responsive controls/resolved status, scale-dependent labels, aspect-aware fleet-centroid work-cell, focused tests, and desktop/narrow browser evidence.

## Completion

Completed on 2026-07-23 after every acceptance item was verified.
