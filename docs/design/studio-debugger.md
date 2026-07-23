# Studio visual debugger

Status: task-oriented project Overview, stable workbench/experiment/candidate/object routes, shared Benchmark and candidate-review workbench, searchable asset catalog and diagnostics, direct factory-object inspection, and immutable run replay implemented.

Related: [[docs/design/project-boundaries]], [[docs/design/operator-workbench]], [[docs/design/operation-workbench]], [[docs/design/experiment-workbench]], [[docs/design/material-treatment]], [[docs/design/production-modes]], [[docs/design/lot-tracking]], [[docs/design/equipment-changeover]], [[docs/design/quality-flow]], [[docs/design/simulation-runtime]], [[docs/CLI]], [[plans/operator-interaction-refinement]].

## Scope

Studio is a debugger for compiled industrial systems and completed runs plus an explicit projection of the shared locked Benchmark evaluator. Its only authoring operation is guarded application of a reviewed project-local Candidate Change Set to that Benchmark's candidate Blueprint. It is not a free-form Blueprint editor, an independent simulator authority, or a project switcher embedded in a runtime sidebar.

## Navigation

The root route presents available projects. Selecting one establishes `/<project-id>` as the sole project context and opens its task-oriented Overview. Stable project-qualified routes cover `factory`, `runs`, `catalog`, `analysis`, and `experiments`; catalog assets, diagnostics, Factory devices/connections, Benchmarks, and Candidate Change Sets retain their subject identity in the URL. Primary navigation uses real stable destinations while preserving client-side transitions. Catalog, Analysis, and Experiments are route-backed surfaces over the underlying view: browser back/reload reconstruct them, while their close button or Escape replaces the surface with its recorded same-project origin (or the project Overview after a direct deep link). Switching primary destinations replaces an open surface instead of leaving it immediately behind in history. Clearing a Factory object by toggle, empty-scene click, inspector close, or Escape also clears its object URL. The back button returns to the launcher; there is no in-project project switcher. Every data, experiment, candidate, and asset request is namespaced under `/api/projects/<project-id>/...` and confined to that project root.

## Project orientation API

`GET /api/projects/<project-id>/overview` returns the exact Core [[docs/design/operator-workbench]] snapshot used by `inm inspect --json`. Optional World, Blueprint, Scenario, and Objective query selectors are explicit and never fall back when invalid. The endpoint is read-only and does not select a run, execute a Benchmark, preview a Candidate, or create Studio state. The project Overview renders its selection and hashes, Objective/contracts, target-rate readiness, prioritized diagnostics, recent immutable evidence, proposals, and operation descriptors. The richer `/data` endpoint separately supplies Factory replay data and its selected immutable run.

The Overview first presents one deterministic operator recommendation derived only from the shared snapshot, followed by compact effective-selection context, the active issue and Candidate queues, delivery contracts, and recent immutable evidence. Advanced operation cards are collapsed by default so capability inventory does not compete with the next decision. When expanded they project the shared [[docs/design/operation-workbench]] contract: before invocation they state effect, selection scope, guards, and exact CLI reproduction. Copy controls acknowledge success or failure. Validation, analysis, planning, and simulation run through project-qualified operation endpoints; progress/failure and completed results are textual dialogs, and the result labels the actual write set rather than the descriptor's possible writes. Simulation refreshes Overview/Runs/Factory from its immutable artifact. Benchmark and Candidate routes invoke the same Core operation layer while retaining their richer comparison and guarded-review workbenches.

## Experiment workbench

The workbench lists project-local locked Benchmarks and Candidate Change Sets, displays fixed cases and acceptance gates, and uses the same Core preview as `inm candidate --json`. It presents the hypothesis, authored patch, reviewed hashes, aggregate verdict, per-case score/capacity/throughput/service, gate reasons, and semantic Blueprint changes. Opening the page never runs a hidden simulation. Evaluation is read-only. A KEEP proposal exposes a two-step arm/confirm control; confirm re-evaluates, verifies both reviewed hashes, atomically writes only the candidate Blueprint, and leaves the proposal stale. Studio never changes locks, fixed inputs, assets, runs, or Git.

## Project-local catalog

The route-backed Catalog dialog follows an editor/RPG-Maker-style asset browser. It separates Device packages, Resource packages, Process definitions, and Product Routes, supports text filtering within the selected category, and deep-links the selected asset. It exposes visual identity, capabilities, geometry, physical production ports, buffer maxima, production modes, changeover envelopes, setup groups and input-grade requirements, treatment modes/agents, runtime entry, transformations, transport properties, lot-tracking family, power generation/storage/distribution envelopes, content hashes, and current instance/fleet counts.

## Industrial analysis

The route-backed Analysis dialog recompiles the selected run Blueprint, supports diagnostic filtering and focused diagnostic deep links, and shows:

- target-rate Process/extraction/fleet plan plus rated and Scenario-integrated power/storage gaps;
- finite deposits and depletion;
- material balance and dependency graph;
- configured Process/mode jobs, input treatment requirements, treatment Device/agent capacity, and mode-aware alternatives;
- every Device instance's effective physical-port direction/backing-buffer/material contract plus buffer capacity, accepted Resources, and per-Resource partitions;
- local pipeline Resource allowlists, effective dispatch policy, per-Resource destination coverage profiles, stages, measured Resource mix, capacity, utilization, blockage, and power;
- station routes/fleet load, effective network policy, authored priority tier, downstream coverage batch, and Objective depth;
- regional rated generation/demand/members/headroom, accumulator capacity/rates, and selected-run generated, requested, unserved, stored, and contiguous-deficit energy;
- compiler/static diagnostics.

## 3D replay

Regions are independent labeled cleanroom-style floors arranged side by side. Local `(x, y)` maps to world `(x, z)`, while height maps to world `y`. Machines, explicit selectable sorter Devices and arms, deposits, belt cells/levels, grade-badged cargo stacks, and station routes come from renderer-independent compiled/replay data. A Device's project-local `visual.json` explicitly selects either a primitive or generic procedural industrial profile; Studio never switches on project-specific asset ids. The profiles preserve authoritative footprint and rotation while supplying distinguishable process enclosures, chambers, furnaces, metrology/probe cells, racks, packaging cells, service/storage structures, utility skids, turbines, and bins.

Each procedural Device also owns a strict PBR material: base tint, optional base-color/normal/roughness/metalness/emissive maps, scalar response, normal strength, emissive baseline, and two-axis repeat. Studio samples color maps as sRGB, data maps as linear, and uses repeat wrapping for deterministic procedural UVs. Every map is served from its owning Device package; a copied material is a copied set of files, not a shared library reference. Dynamic process emission, status, selection, progress, and labels remain overlay concerns rather than baked texture content. A project-local GLTF/GLB model replaces the procedural body and retains its embedded materials.

Factory presentation has three deterministic scales over the same compiled geometry: overview fits the complete region bounds, work-cell frames an aspect-aware area around the equipment fleet's centroid, and focus frames the route-selected Device or connection. `AUTO` chooses overview for a scene viewport at least 700 pixels wide, work-cell below it, and focus whenever the route names a valid scene object. Explicit overview/work-cell controls override the automatic camera without clearing selection; the control surface reports both the requested policy and resolved view. Orbit and pan remain available at every scale. This policy is presentation-only and never changes Blueprint positions, footprints, connections, replay, or selection identity.

Subtle floor sections, boundary lines, asymmetric fill lighting, and progressive identity labels establish spatial context. Overview retains labels for selected, bottleneck, or non-idle equipment, while work-cell and focus restore all nearby equipment identities; detailed status, Process, and Resource text still appears only for selected, bottleneck, or non-idle equipment. A physical status beacon, progress surface, selection ring, and bottleneck ring retain runtime evidence at every scale without forcing every Device to carry a permanent telemetry stack. Sorter stage start/finish, power loss/restoration, breakdown, and recovery events drive the attachment's own visible status. Opening or scrubbing never runs a hidden simulation.

The Performance panel exposes tracked-lot completion, on-time service, mean/p95 cycle time, queue/process/transport decomposition, tardiness, equipment changeovers, and setup work when the Objective target belongs to a lot family. These values come only from the selected immutable run.

## Factory-object inspection

Devices and physical belt cells are direct selection targets in the 3D scene. Selection is project-scoped, toggles on a second click, clears on empty-space click or Escape, and is discarded when navigating to another project. A selected object receives an explicit scene highlight while its DOM inspector remains usable independently of the canvas.

The Device inspector joins compiled and measured semantics in one local view:

- runtime status, current job progress, and completed-run utilization;
- asset identity, region, position, footprint, build cost, and active power;
- selected Process/mode with exact input/output batches, physical port bindings, backing buffers, duration, nominal rate, setup group, and selected-run final setup/changeover totals;
- extraction, generation, or accumulator plan when present;
- effective physical-port acceptance plus buffer acceptance and per-Resource quotas;
- regional power-grid membership, generation, rated load, headroom, and storage envelope;
- incoming/outgoing local connections and Device-scoped diagnostics.

The connection inspector exposes source/target navigation, the exact authored Resource allowlist, effective dispatch policy, each Resource's target kind/coverage unit/Objective depth, physical path/level, explicit loader/line/unloader distances and endpoint Device ids, dispatch and travel clocks, stack limit, live cargo at the selected replay tick, stage assets and power state, measured stage utilization, delivered Resource mix, average in-flight inventory, and blockage. Sorter arms extend from the machine port to the explicit Device anchored at the configured belt endpoint. Both the sorter Device and each real belt cell have picking geometry, so selection does not depend on a visually thin line's raycast tolerance.

Inspectors are navigation and debugging surfaces only. They contain no Blueprint mutation controls and do not change simulation or run state.

## Source of truth

- Renderer-independent projection: `packages/inm-core/src/frontend.ts`
- Shared project orientation projection: `packages/inm-core/src/workbench.ts`
- Project/run data server: `packages/inm-studio/src/server.ts`
- React/Three UI: `packages/inm-studio/src/main.tsx`
- Factory presentation policy: `packages/inm-studio/src/factory-presentation.ts`
- Project-scoped selection state: `packages/inm-studio/src/selection.ts`
- Styling: `packages/inm-studio/src/styles.css`

## Verification

```bash
bun test packages/inm-studio
bun run inm studio examples/ironworks --port 4178 --no-open
```

Browser QA should verify `/`, the project Overview, direct/reloaded/back-forward `factory`, `runs`, `catalog`, `analysis`, experiment and Candidate routes, diagnostic/asset/factory-object deep links, proposal preview/verdict/patch, two-step write confirmation without triggering it on checked-in examples, catalog/diagnostic filtering, run selection, timeline controls, direct Device/belt-cell selection, Device-to-connection and connection-to-Device navigation, replay-tick telemetry, physical port contracts, buffer partitions, responsive inspector layout, and console errors. API tests on a temporary project must cover actual apply, stale rejection, and no preview writes. Merely confirming that the HTTP server responds does not prove the UI.

## Change checklist

- Keep Studio read-only with respect to Blueprint, Benchmark locks, and run history.
- Add new industrial semantics to compiled/analysis data before rendering them.
- Keep equipment profiles generic and asset-selected; never infer project appearance from an asset id.
- Preserve stable project URLs and project-qualified asset requests.
- Test empty projects/runs and avoid writing a baseline on view.
- Validate visual changes in an actual browser.

## Known next gaps

- Layer visibility controls for unusually dense multi-region factories.
- Blueprint diff overlays between KEEP and REVERT runs.
- Resource-node and station-route scoped inspectors.
