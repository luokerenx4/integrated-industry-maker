# Studio visual debugger

Status: project launcher, stable project routes, asset catalog, industrial analysis, direct factory-object inspection, and immutable run replay implemented.

Related: [[docs/design/project-boundaries]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/simulation-runtime]], [[docs/CLI]].

## Scope

Studio is a read-only debugger for compiled industrial systems and completed runs. It is not a Blueprint editor, simulator authority, or project switcher embedded in a runtime sidebar.

## Navigation

The root route presents available projects. Selecting one establishes `/<project-id>` as the sole project context. The back button returns to the launcher. Every data and asset request is namespaced under `/api/projects/<project-id>/...` and confined to that project root.

## Project-local catalog

The Catalog modal follows an editor/RPG-Maker-style asset browser. It separates Device packages, Resource packages, and Process definitions and exposes their visual identity, capabilities, geometry, ports, buffer maxima, production modes and input-grade requirements, treatment modes/agents, runtime entry, transformations, transport properties, power generation/storage/distribution envelopes, content hashes, and current instance/fleet counts.

## Industrial analysis

The Analysis modal recompiles the selected run Blueprint and shows:

- target-rate Process/extraction/power/fleet plan and gaps;
- finite deposits and depletion;
- material balance and dependency graph;
- configured Process/mode jobs, input treatment requirements, treatment Device/agent capacity, and mode-aware alternatives;
- every Device instance's effective buffer capacity and accepted Resources;
- local pipeline Resource allowlists, effective dispatch policy, per-Resource destination coverage profiles, stages, measured Resource mix, capacity, utilization, blockage, and power;
- station routes/fleet load, effective network policy, authored priority tier, downstream coverage batch, and Objective depth;
- regional rated generation/demand/members/headroom, accumulator capacity/rates, and selected-run generated, requested, unserved, stored, and contiguous-deficit energy;
- compiler/static diagnostics.

## 3D replay

Regions are independent labeled floors arranged side by side. Local `(x, y)` maps to world `(x, z)`, while height maps to world `y`. Devices, deposits, powered endpoint arms, belt cells/levels, grade-badged cargo stacks, and station routes come from renderer-independent compiled/replay data. Labels show Device identity, status, selected Process, accepted materials, and treatment mode where configured. Events drive state; opening or scrubbing never runs a hidden simulation.

## Factory-object inspection

Devices and physical belt cells are direct selection targets in the 3D scene. Selection is project-scoped, toggles on a second click, clears on empty-space click or Escape, and is discarded when navigating to another project. A selected object receives an explicit scene highlight while its DOM inspector remains usable independently of the canvas.

The Device inspector joins compiled and measured semantics in one local view:

- runtime status, current job progress, and completed-run utilization;
- asset identity, region, position, footprint, build cost, and active power;
- selected Process/mode with exact input/output batches, buffers, duration, and nominal rate;
- extraction, generation, or accumulator plan when present;
- effective buffer acceptance and per-Resource quotas;
- regional power-grid membership, generation, rated load, headroom, and storage envelope;
- incoming/outgoing local connections and Device-scoped diagnostics.

The connection inspector exposes source/target navigation, the exact authored Resource allowlist, effective dispatch policy, each Resource's target kind/coverage unit/Objective depth, physical path/level, explicit loader/line/unloader distances, dispatch and travel clocks, stack limit, live cargo at the selected replay tick, stage assets and power state, measured stage utilization, delivered Resource mix, average in-flight inventory, and blockage. Sorter beams extend from the Device to the actual configured belt endpoint, while each real belt cell owns a transparent picking volume matching its grid occupancy, so selection does not depend on a visually thin line's raycast tolerance.

Inspectors are navigation and debugging surfaces only. They contain no Blueprint mutation controls and do not change simulation or run state.

## Source of truth

- Renderer-independent projection: `packages/inm-core/src/frontend.ts`
- Project/run data server: `packages/inm-studio/src/server.ts`
- React/Three UI: `packages/inm-studio/src/main.tsx`
- Project-scoped selection state: `packages/inm-studio/src/selection.ts`
- Styling: `packages/inm-studio/src/styles.css`

## Verification

```bash
bun test packages/inm-studio
bun run inm studio examples/ironworks --port 4178 --no-open
```

Browser QA should verify `/`, `/<project-id>`, Catalog, Analysis, run selection, timeline controls, direct Device/belt-cell selection, Device-to-connection and connection-to-Device navigation, replay-tick telemetry, buffer contracts, responsive inspector layout, and console errors. Merely confirming that the HTTP server responds does not prove the UI.

## Change checklist

- Keep Studio read-only with respect to Blueprint and run history.
- Add new industrial semantics to compiled/analysis data before rendering them.
- Preserve stable project URLs and project-qualified asset requests.
- Test empty projects/runs and avoid writing a baseline on view.
- Validate visual changes in an actual browser.

## Known next gaps

- Better dense-factory camera defaults and layer visibility controls.
- Blueprint diff overlays between KEEP and REVERT runs.
- Resource-node and station-route scoped inspectors.
