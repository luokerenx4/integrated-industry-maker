# Make dense Factory presentation responsive to inspection scale

- Status: `proposed`
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

- [ ] A narrow viewport offers a legible path from whole-factory overview to work-cell and selected-device inspection without changing Blueprint geometry.
- [ ] Camera/detail policy is deterministic from scene, viewport, and route-backed selection; no project-specific asset ids or hidden UI-only industrial state are introduced.
- [ ] Labels, live state, bottlenecks, belts, and selection remain discoverable at every supported detail level.
- [ ] Desktop behavior does not regress, and browser checks plus Studio tests cover both a dense memory fab and Ironworks.

## Work

- [ ] Measure the current projected-size and occlusion failure modes at representative viewports.
- [ ] Design the route-backed camera/detail-level contract and interaction.
- [ ] Implement generic Studio presentation policies and focused tests.
- [ ] Perform desktop/narrow comparison and complete the acceptance audit.

## Findings and decisions

- 2026-07-23 — The PBR migration confirmed that asset detail is visible at desktop scale but compressed by whole-factory fitting at `390 × 844`; material fidelity alone cannot solve inspection-scale legibility.

## Verification

- Pending.

## Progress log

- 2026-07-23 — Proposed after completing [[plans/device-pbr-material-migration]]; no implementation has started.

## Completion

Complete only after every acceptance item is verified.
