# Human and AI workbench

- Status: `completed`
- Updated: `2026-07-22`
- Related design: [[docs/design/operator-workbench]], [[docs/design/operation-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/design/blueprint-optimization]], [[docs/design/coding-agent-optimization]], [[docs/CLI]], [[docs/PROJECT_FORMAT]]

## Outcome

Give a human and a Coding Agent two task-appropriate projections of the same industrial operating surface. After selecting a project, either operator must be able to establish context, find the highest-value problem, inspect the evidence, execute or preview an allowed operation, and verify its result without learning a second model or relying on hidden state.

Studio should optimize for orientation, comparison, spatial understanding, and deliberate review. The `inm` CLI should optimize for discoverability, typed and token-efficient data, composition, and exact automation. Core remains the authority for both.

## Product thesis

Industrial complexity does not disappear for a human or an AI. INM therefore should not maintain a simplified human model beside a privileged machine model. It should expose one explicit domain through different interaction shapes:

```text
project files + Core compile/analyze/plan/simulate/evaluate operations
                              │
                 shared workbench projection
          context · diagnostics · hashes · actions · evidence
                    ╱                         ╲
          Studio for humans          inm CLI for Coding Agents
      progressive + spatial          structured + composable
```

Capability parity does not mean interaction parity. A Coding Agent should not scrape a canvas or a wall of text when a narrow JSON result exists. A human should not need to read raw JSON or memorize flags to understand a bottleneck. Browser-capable Agents may use Studio, but the semantic DOM must expose the same facts without requiring visual inference from the canvas.

## Current baseline

| Area | Existing strength | Product gap |
| --- | --- | --- |
| Project context | Project launcher, stable project routes, `inm inspect`, project-local assets | Studio opens directly into a dense 3D debugger; CLI project context is ad hoc and does not describe available operations |
| Industrial diagnosis | Core analysis/capacity planning, Studio Analysis modal, detailed run metrics | Diagnostics are spread across large outputs and panels; there is no prioritized task view or stable diagnostic deep link |
| Assets and schemas | Project-local Catalog modal and validated file formats | Humans cannot deep-link/search across all asset relationships; Agents cannot ask the CLI for artifact schemas or compact authoring guidance |
| Experiments | Shared Benchmark evaluator and stable experiment routes | This is the strongest vertical slice, but its context/action/result pattern is not reused by the rest of the product |
| Safe authoring | Candidate preview, proposal/base hashes, exact patch, guarded apply | The safety model is candidate-specific instead of a common description of mutating operations |
| AI operation | Most CLI commands support `--json`; errors have some stable codes | Success payloads vary by command, generic errors lack stable codes, help is human text only, and large results cannot be scoped |
| Human operation | Studio can inspect, replay, evaluate, and apply a reviewed KEEP candidate | Main navigation is organized around technical views rather than operator tasks; most operations still require leaving Studio for a remembered CLI command |
| Browser Agents | Experiment dialog has accessible names, stable routes, and semantic results | Main project state is canvas-heavy, Catalog/Analysis are ephemeral, and important objects/diagnostics lack stable DOM/deep-link identities |

## Operator questions

Both surfaces must answer the same questions from shared data:

1. Which project, World, Blueprint, Scenario, and Objective am I operating on, and what are their hashes?
2. What is the requested industrial outcome and is the current Blueprint statically ready for it?
3. What are the highest-priority capacity, material, logistics, power, quality, maintenance, or contract problems?
4. Which project-local assets, runs, experiments, and candidate proposals are available?
5. What evidence supports each diagnosis and which factory object or contract does it concern?
6. Which operations are currently available, which files could they write, and which preconditions protect them?
7. After an operation, what changed, what was produced, and what must be verified next?

## Scope

### In scope

- A shared Core workbench projection for project identity, selection, hashes, readiness, prioritized diagnostics, catalogs, runs, experiments, candidates, and available operations.
- A consistent machine-readable CLI contract, command discovery, artifact-schema discovery, scoped output, stable errors, and exact next-action descriptions.
- A task-oriented Studio project overview, stable sub-routes, navigable diagnostics, operation/result surfaces, and CLI reproduction for every operation.
- Shared preview/execute/result semantics for validation, analysis, capacity planning, simulation, Benchmark evaluation, and Candidate Change Set review/application.
- Accessible semantic HTML and stable identities so a browser-capable Agent can operate important workflows without interpreting the 3D canvas.
- Cross-surface parity tests against temporary Ironworks and memory-fab projects.

### Out of scope

- An embedded LLM, chat panel, prompt orchestration, model credentials, or a separate autonomous Agent runtime.
- A second AI-only API, database, evaluator, optimizer, or hidden project state.
- A free-form graphical Blueprint editor or arbitrary filesystem editor in Studio.
- Automatic mutation without an explicit operation, visible write set, and required confirmation/hash guards.
- Shared workspace assets; every project remains self-contained.
- Remote execution, multi-user collaboration, MCP, or a hosted control plane. Those may later project the same Core contract instead of creating a new one.

## Design constraints

- Core owns industrial semantics and produces serializable projection types. CLI and Studio only select, format, and invoke them.
- Project selection remains a launcher/root-route decision. No project switcher is added inside the project workbench.
- Reading a route, opening a modal, inspecting a diagnostic, or previewing an action never writes project state.
- Every mutating industrial operation declares its write set and preconditions before execution. Blueprint mutations use exact input hashes and produce an auditable result.
- Long or dense results support summary-first projection and explicit detail sections; neither surface silently drops failing gates or diagnostics.
- Stable ids and error/diagnostic codes are contracts. Display prose may differ between Studio and CLI.
- No backward-compatibility layer is required during pre-alpha. Replace inconsistent output contracts directly and update examples/tests together.

## Acceptance

- [x] Core produces one serializable project workbench snapshot used by both `inm` and Studio; parity tests prove identical selection, hashes, readiness, diagnostic codes, and operation ids.
- [x] A Coding Agent can discover commands and project artifact schemas without reading CLI source, and every machine-readable success/error follows one versioned envelope.
- [x] A Coding Agent can request a compact overview or one detailed section without receiving the complete analysis payload.
- [x] The Studio project root presents objective, readiness, priority issues, recent evidence, and available tasks before requiring the 3D factory view.
- [x] Catalog, Analysis, Factory, Runs, Experiments, Candidates, and individual diagnostics/objects have stable project-qualified routes or route-backed dialogs.
- [x] Every Studio operation states whether it is read-only or mutating, shows the effective selection, exposes an equivalent copyable `inm` command, and renders the shared result.
- [x] Simulation and evaluation operations expose progress/failure state and link their immutable result or reviewed proposal without inventing browser-only history.
- [x] Mutating operation tests prove preview purity, exact write scope, stale-input rejection, deliberate confirmation, and post-operation verification.
- [x] A browser-only operator can complete the memory-fab review loop using named controls and textual evidence without interacting with the canvas.
- [x] A CLI-only operator can complete the equivalent loop from discovery through verification using JSON output and stable exit/error codes.
- [x] `bun run test` and documented browser QA pass with no checked-in project mutation.

## Work

### Slice 1 — shared project orientation

- [x] Add a design document for the shared operator workbench and define the authoritative Core projection types.
- [x] Extract project summary, current selection, hashes, static readiness, prioritized diagnostics, catalog/run/experiment/candidate summaries, and operation descriptors into Core.
- [x] Give each diagnostic a stable code, severity, subject reference, evidence summary, and supported navigation/action references.
- [x] Make `inm inspect --json` and a project-qualified Studio endpoint consume the same snapshot.
- [x] Add parity tests for Ironworks, memory-fab, empty runs, and invalid selections.

### Slice 2 — AI-native CLI contract

- [x] Define one versioned JSON success envelope carrying command, project/selection context, input hashes, data, diagnostics, artifacts, and next actions.
- [x] Define one versioned error envelope with a stable code, message, structured issues, retryability, and relevant current hashes.
- [x] Add machine-readable command discovery, including arguments, defaults, read/write classification, exit behavior, and output sections.
- [x] Add machine-readable schema discovery for project manifests, Worlds, Blueprints, Scenarios, Objectives, Device/Resource assets, Processes, Benchmarks, and Candidates.
- [x] Add summary/detail selection to dense inspection, analysis, planning, simulation, Benchmark, and Candidate results without maintaining separate evaluators.
- [x] Keep stdout valid machine data in JSON mode and send progress/logging to stderr.
- [x] Add CLI contract snapshots and tests that invoke the public binary rather than only command functions.

### Slice 3 — human project overview and navigation

- [x] Make `/<project>` a task-oriented overview rather than requiring the 3D debugger as the first interpretation surface.
- [x] Add stable project-qualified navigation for Overview, Factory, Runs, Experiments, and route-backed Catalog/Analysis dialogs while retaining launcher-only project selection.
- [x] Present the current selection/hashes, Objective and delivery contracts, capacity readiness, priority diagnostics, latest run, open proposals, and available operations with progressive disclosure.
- [x] Make diagnostic cards navigate to exact analysis sections, assets, devices, connections, contracts, or experiment cases where applicable.
- [x] Add search/filtering to dense catalogs and diagnostics, preserving project-local ownership and explicit type/category boundaries.
- [x] Move the current 3D debugger and replay into the Factory route without weakening selection, inspection, or timeline behavior.
- [x] Make empty/loading/error/stale states explain the next valid action rather than presenting a blank or generic failure surface.

### Slice 4 — shared operation loop

- [x] Project validation, nominal analysis, capacity planning, simulation, Benchmark evaluation, and Candidate preview call named shared Core operations and return one operation-result model.
- [x] Studio can launch the appropriate read-only operations, display progress and results, and copy the exact equivalent CLI command.
- [x] Simulation writes only its declared immutable run artifact and refreshes Runs/Factory views from that artifact.
- [x] Candidate application keeps the existing two-step hash-pinned guard and becomes the reference implementation for any later Blueprint mutation.
- [x] Operation results expose input hashes, duration, diagnostics, generated artifacts, write set, and recommended verification without hidden reruns.
- [x] A refreshed browser and a new CLI process can reconstruct the result from project files; browser memory is never authoritative.

### Slice 5 — browser-Agent and end-to-end proof

- [x] Give important controls, diagnostics, assets, actions, result sections, and factory objects stable accessible names/test ids derived from domain ids.
- [x] Ensure every essential fact shown visually also has a textual semantic representation; the canvas remains optional for operation.
- [x] Add route/reload/history tests across Overview, Catalog, Analysis, Factory object inspection, Runs, Experiments, and Candidates.
- [x] Add a temporary-project human-flow test: select memory-fab → identify energy opportunity → open candidate → preview → deliberately apply → re-evaluate → inspect resulting evidence.
- [x] Add the equivalent CLI-flow test starting from machine-readable discovery and compact project inspection.
- [x] Perform actual browser QA at desktop and narrow viewport sizes and record the evidence here.

### Completion audit

- [x] Update [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/CLI]], and any affected schema/design documents to describe only the shipped model.
- [x] Remove superseded Studio/CLI projections and output shapes rather than preserving compatibility aliases.
- [x] Verify every acceptance item against tests or recorded manual evidence.
- [x] Move this plan to Completed in [[PLANS]] only when no unchecked work remains.

## Findings and decisions

- 2026-07-22 — The existing Benchmark/Candidate workbench is the reference vertical slice: one evaluator, stable route, structured CLI result, readable Studio projection, exact patch, guarded mutation, and reproducible completion audit.
- 2026-07-22 — Studio already has substantial industrial detail, but the project root is organized as a 3D debugger with dense secondary panels. The first human improvement is task orientation and progressive disclosure, not adding more metrics.
- 2026-07-22 — Most CLI commands already emit JSON, but their top-level shapes and error contracts are command-specific. The first AI improvement is discoverable, versioned, scoped contracts rather than natural-language assistance.
- 2026-07-22 — Catalog and Analysis should remain editor-style dialogs where useful, as requested, but their open state and selected subject must become addressable by stable routes.
- 2026-07-22 — CLI is the preferred high-bandwidth AI surface; browser operation is a supported semantic projection and verification path, not a requirement for headless Agents.
- 2026-07-22 — No embedded model runtime is needed for this plan. AI-first means making domain operations legible and safely composable by an Agent, not putting an AI-themed UI inside the product.
- 2026-07-22 — Project orientation is selection-scoped rather than run-scoped. Studio's richer Factory data may select an immutable run, but the shared Overview compiles the explicitly selected current project inputs just like `inm inspect`.
- 2026-07-22 — Candidate preview/application are advertised as `conditional`, not `available`: discovering a Candidate does not prove its base hash, Benchmark lock, or KEEP gate still holds.
- 2026-07-22 — Snapshot construction lists Candidate manifests but never evaluates them. Project orientation must remain cheap and read-only; guarded evaluation belongs to the explicit Candidate operation.

## Verification

- Planning baseline: `bun run docs:check`.
- Slice 1: `bun test packages/inm-core/src/workbench.test.ts packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts` — 11 passed, 0 failed, including exact CLI/Core and Studio/Core parity.
- Slice 1: `bun run typecheck` — passed for Core, CLI, Studio, and both example TypeScript asset catalogs.
- Slice 1 full gate: `bun run test` — 159 passed, 0 failed, 1144 assertions; all Ironworks fixture scenarios passed.
- Slice 2 package gate: `bun test packages/inm-core packages/inm-cli packages/inm-studio` — 165 passed, 0 failed, 1347 assertions; public-binary tests covered versioned success/error envelopes, machine help, all 14 artifact schemas, output sections, Candidate apply/stale replay, and exact CLI/Core snapshot parity.
- Slice 2: `bun run typecheck` and `bun run docs:check` passed; six direct CLI smoke invocations produced one parseable envelope with empty stderr.
- Slice 2 full gate: `bun run test` — documentation and type checks passed, 165 package tests passed with 1347 assertions, and all eight Ironworks public CLI fixtures passed.
- Slice 3 focused gate: `bun run typecheck`, Studio server/selection tests, documentation links, and diff checks passed; stable deep-link HTTP fallbacks cover Overview, Factory objects, Runs, Catalog assets, Analysis diagnostics, Experiments, and Candidates.
- Slice 3 full gate: `bun run test` — documentation and type checks passed, 165 package tests passed with 1356 assertions, and all eight Ironworks public CLI fixtures passed.
- Slice 3 browser QA: memory-fab Overview, Catalog asset/search, focused Analysis diagnostic/search, Factory Device inspector, Runs, reload, and back/forward restored exact routes; a fresh browser session reported zero console errors.
- Slice 4 focused gate: named Core operation, public CLI, Studio server/selection, and type tests passed. Operation tests cover read-only purity, immutable run creation/cache reuse, Benchmark evaluation, Candidate preview, CLI metadata, and Studio projection.
- Slice 4 browser QA: memory-fab Validate and Plan controls completed through the shared endpoint; result dialogs exposed textual outcome, selection/hash, empty write set, verification, exact CLI, and zero fresh console errors. Simulation mutation was covered only on a temporary project.
- Slice 4 full gate: `bun run test` — documentation and type checks passed, 169 package tests passed with 1388 assertions, and all eight Ironworks public CLI fixtures passed.
- Slice 5 route/semantic gate: `routes.test.ts` covers encoded Overview, Catalog asset, focused Analysis diagnostic, Factory Device/connection, Runs, Experiment, Candidate, malformed, reload, back, and forward reconstruction; domain-derived test ids cover projects, views, diagnostics, assets, operations/results, runs, factory inspectors, experiments/cases, Candidates, and the two mutation controls.
- Slice 5 CLI flow: public `inm help --json` discovery → scoped Candidate inspection → preview → guarded apply → locked Benchmark verification → stale replay rejection passed on a temporary memory-fab copy.
- Slice 5 browser flow: a temporary memory-fab copy completed Overview opportunity identification → stable Candidate route → KEEP preview → ARM → CONFIRM → current-candidate locked re-evaluation → KEEP case evidence. Only `equipment-energy-sleep.blueprint.json` changed outside the disposable Studio cache, and the fresh console had zero errors.
- Slice 5 responsive QA: desktop 1280 px and narrow 390 × 844 px Overview retained all six semantic navigation controls with no body overflow; the narrow Catalog dialog fit 390 px and retained the selected Thermal Batch Furnace textual detail. The viewport override was reset afterward.
- Completion full gate: `bun run test` — documentation and type checks passed, 172 package tests passed with 1410 assertions across eight files, and all eight Ironworks public CLI fixtures passed. Git reported no checked-in example mutation.
- Per-slice contract checks: `bun test packages/inm-core packages/inm-cli packages/inm-studio`.
- Public CLI checks must invoke `bun run inm ... --json` against both examples and parse stdout as exactly one valid JSON value.
- Full completion gate: `bun run test`.
- Browser QA must cover direct routes, reload/back-forward behavior, semantic controls, console errors, compact viewport behavior, and zero writes from read-only views.
- Mutation QA must operate only on temporary project copies and compare the before/after filesystem write set.

## Progress log

- 2026-07-22 — Audited current CLI commands, Studio navigation/analysis/catalog/replay, shared experiment/candidate workbench, memory-fab program, and existing design boundaries.
- 2026-07-22 — Plan created and registered as the active product-interface program. Slice 1 is the next implementation target.
- 2026-07-22 — Slice 1 implemented: one Core project workbench snapshot now powers `inm inspect` and the project-qualified Studio Overview API with full-structure parity tests. Slice 2 is next.
- 2026-07-22 — Slice 2 implemented: all JSON commands now use one versioned success/error contract, public machine help advertises effects/defaults/sections/exit codes, all authored project artifact schemas are discoverable, and dense results are summary-first with explicit sections. Slice 3 is next.
- 2026-07-22 — Slice 3 implemented: Studio now opens on a shared task-oriented Overview, preserves every major workbench/asset/diagnostic/Factory-object context in stable project routes, filters dense Catalog/Analysis evidence, and keeps 3D replay in the dedicated Factory route. Slice 4 is next.
- 2026-07-22 — Slice 4 implemented: named Core operations now drive CLI and Studio validation/analysis/plan/simulation/Benchmark/Candidate work, report one effect/context/hash/artifact/write-set/result contract, and preserve immutable-run and hash-pinned Candidate guarantees. Slice 5 is next.
- 2026-07-22 — Slice 5 implemented: domain-derived semantic ids, pure stable-route reconstruction tests, a complete temporary-project browser Candidate review/apply/re-evaluate loop, an equivalent public-CLI flow, and desktop/narrow browser QA prove that the canvas is optional for essential operation. Completion audit is next.
- 2026-07-22 — Completion audit passed: all acceptance items have test or browser evidence, shipped design documents describe the final contracts, superseded runtime projections are removed, the full gate is green, and this plan moved to Completed.

## Completion

Completed on 2026-07-22. The shipped system now gives humans and Coding Agents task-appropriate projections of the same project context, diagnostics, operations, evidence, and hash-guarded mutation protocol.
