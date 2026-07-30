# `inm` CLI

Run locally with `bun run inm`, or link `packages/inm-cli/src/bin.ts` as `inm`.

## Machine contract

Use `inm help --json` to discover every public command, argument/default, effect, output section, and exit code. Use `inm schema --json` to list authored project artifact kinds and `inm schema <kind> --json` to emit their current strict JSON Schema Draft 7 projection.

Every successful `--json` command writes exactly one V2 envelope to stdout with `command`, resolved `context`, `data`, `diagnostics`, `artifacts`, exact-argv `nextActions`, and `execution`. Ordinary commands use `execution: null`; Benchmark, Candidate preview/apply, and Design run/continuation close the same Core lifecycle identity projected by Studio. Every failed `--json` command writes no stdout and one versioned error envelope to stderr with a stable code, structured issues, retryability, relevant current hashes, and any long-operation execution state. Dense commands return the `summary` section by default; request one advertised section with `--section NAME --json`, or the complete result with `--section all --json`.

`--progress ndjson` emits compact V2 records `{ type, command, execution, progress }` on stderr; success remains the one final JSON value on stdout. `SIGINT`/`SIGTERM` requests cooperative cancellation at a safe Core boundary—between sequential cases or by terminating an outstanding parallel case wave—and exits `130` with `operation.cancelled`, the same operation id, and no partial result or Design artifact. A second signal terminates immediately.

The full contract and section semantics are defined in [[docs/design/agent-cli-contract]].

## Commands

### `inm workspace init <workspace-dir> [--name NAME] [--json]`

Creates an engine workspace with an `inm-workspace.json` manifest and empty `projects/` directory.

### `inm project create <workspace-dir> <project-id> [--name NAME] [--json]`

Creates a fully self-contained project from the starter factory. Every resource, device, runtime contract, blueprint, scenario, objective, and fixture is physically copied into the new project. The first project becomes the workspace default.

### `inm project list <workspace-dir> [--json]`

Lists immediate project directories and marks the default. A project directory id must match the required `id` in its `inm.json`.

### `inm project default <workspace-dir> <project-id> [--json]`

Changes the workspace default project. It does not move, merge, or share project contents.

### `inm validate <project-or-workspace-dir> [--project ID]`

Runs schema validation, immutable world and finite resource-node resolution, extractor binding/range checks, production-mode/resource/physical-port/shared-buffer/job-capacity checks, setup-group/changeover/initial-equipment-state checks, inspection/rework/disposition and fixed quality-excursion checks, per-region geometry/rotation checks, independent instance port-filter validation, exact connection Resource-allowlist checks, explicit sorter Device ownership/stage/position/rotation/range checks, explicit cardinal transport-path and shared-cell resolution, local/inter-zone station topology and carrier compatibility checks, regional power-grid compilation, and project compilation. `--json` returns structured errors with exact paths and codes.

### `inm inspect <project-or-workspace-dir> [--project ID]`

Builds the shared [[docs/design/operator-workbench]] snapshot for the effective World, Blueprint, Scenario, and Objective. Human output is a compact orientation view: exact input hashes, normalized delivery contracts, Objective WIP scope, compatible-run score/tradeoff and inventory evidence, separate capacity/flow/evidence/review status, the one shared next action, topology/catalog/evidence counts, prioritized diagnostics, and available/conditional operations with their effects. `--json` defaults to a bounded orientation summary. Sections expose `next-action`, `objective`, `diagnostics`, `losses`, `dispositions`, `catalog`, `runs`, `experiments`, `candidates`, and `operations`; `--section next-action --json` and the envelope's sole `nextActions` item are the exact Core action, `--section objective --json` returns the exact score components plus Resource and physical-location WIP contributors, while `--section all --json` returns the complete V13 `ProjectWorkbenchSnapshot`. Inspection is read-only and an invalid explicit selection never falls back to a project default.

When a completed tracked-lot run exactly matches the current selection-scoped execution identity, inspection ranks the complete measured fab loss chain ahead of generic structural warnings while leaving capacity blockers first. Unselected catalog additions do not discard that authority. `inm inspect` also distinguishes direct-current Design evidence from verified commissioned lineage: the latter preserves an applied Candidate's exact Design Run/review chain but cannot impersonate current operating evidence or create a bounded loss disposition. `--section losses --json` returns delivery-portfolio, release/admission, tracked-lot queue congestion, active productive-equipment input starvation, batching, setup, maintenance/qualification, tooling, facility, failure, power, transport blocking, Q-time, and verified yield/quality buckets with exact run identity and subjects. Delivery evidence retains contract shortfall, overflow, and value separately. Release/admission emits ordered lot contributors with planned/actual/due timing, priority, release order, exact buffer/Resource/controller cause split, current controller state, service protection, release Device, and tracked Route; the contributor totals must conserve evaluator-owned blocked lot-ticks. V8 reconstructs every completed target lot's process-input and transport-dispatch queue intervals from immutable events, groups them by exact Device or connection, Route step, Process, Resource, lot, and segment, and rejects any profile whose contributors do not conserve the evaluator-owned queue total. It also retains V7's exact input-starvation model: observed material-shortage intervals are intersected with between-job opportunities, ranked by Device/Process, and exposed with exact Resource, Buffer, required/resident quantity, immediate connection/source, endpoint status, in-flight quantity, and observed supply state. Warm-up, completed-campaign drain, separately measured unavailability, and normally sparse exception tools remain outside the ranked signal. Maintenance/qualification emits ordered Device contributors whose service, qualification, input-wait, and crew-wait components independently conserve evaluator totals; each row carries trigger/cause counts, per-phase consumable quantities, drift exposure, and observed service-provider subjects. Power interruption emits conserved per-Device contributors with the exact grid, optional sorter connection/stage, shortage/restoration counts, Device peak deficit, and grid energy envelope. Necessary lot transit remains mean cycle-time context; only positive blocked item-time produces `transport-blocking`, with ordered connection/Resource/flow/capacity contributors and an exact line-contention/endpoint-capacity/endpoint-power/endpoint-failure partition. Human `inspect` prints the same release, queue, material-shortage, maintenance, power, transport, and quality evidence that machine JSON and Studio receive. Workbench V13 may put exact still-visible contributors under hash-current bounded deferral after exhaustive rejected direct-current Design evidence; `--section dispositions --json` exposes each authority, counts, decision bases, and automatic invalidation boundary separately from the physical loss profile. It also exposes normalized Design Program focus so Agents choose the same matching missing Program as Studio. These are overlapping prioritization signals, not additive lost-output claims. See [[docs/design/fab-loss-attribution]].

### `inm observe <project-or-workspace-dir> [--project ID] [selection] [--run ID] [--json]`

Builds the shared [[docs/design/observation-led-design]] brief for the exact World, Blueprint, Scenario, Objective, hashes, and optional immutable run. With no `--run`, Core selects the newest exact hash-compatible matching run. An explicit unknown, incompatible, or different-selection run fails instead of silently substituting evidence.

The brief identifies the leading active Workbench diagnostic and returns stable run-qualified Studio routes for the complete Factory replay, relevant Device/Connection or Catalog subjects, and the matching Analysis evidence. A compatible run may simultaneously carry the separate dominant Objective tradeoff even while a loss diagnostic remains active, so a human or Agent can deliberately pursue the authored Objective instead of having that intent hidden by automatic priority. WIP tradeoffs use the exact leading Device-Buffer or connection-stage locations when available. WIP accounting is explicitly not relabeled as causal fab loss, and the observer must distinguish necessary inventory from a falsifiable avoidable exposure. The brief also returns the statements a human or reasoning Agent must make before authoring an intervention: visible behavior, relationship to structured evidence when present, a falsifiable hypothesis, the smallest exact change, and expected quantitative/visual guards.

Observation is read-only and never captures screenshots, creates a run, authors a proposal, or claims that pixels were understood. A browser-capable Agent opens the returned routes directly; a CLI-only Agent may use Playwright, MCP, or an equivalent screenshot-capable browser. When no compatible run exists, status is `needs-run` and the exact next action is simulation rather than fabricated runtime interpretation.

### `inm investigate <project-or-workspace-dir> [--project ID] [--investigation ID [--create | --entry ID]] [--json]`

Lists, creates, reopens, or appends to a persistent project-local [[docs/design/industrial-investigations]] record. Creating requires `--investigation`, `--name`, and `--question`; Core freezes the exact current selection/hashes, compatible operating Run, Run-backed Workbench diagnostic, and verified commissioned Design/Candidate lineage when present. It fails rather than inventing evidence when that current boundary is unavailable.

Appending requires an explicit `--author human|agent`, `--kind observation|hypothesis|decision`, `--statement`, and entry id. A hypothesis additionally requires `--expected-effect`; a decision requires `--disposition keep|revise|defer|discard`. `--evidence` is a comma-separated list of available anchor ids. `--attach-candidate <id> --anchor-id <id>` may introduce one exact reviewed Candidate anchor; Core resolves the Benchmark, proposal/review hashes, verdict, and current/proposed Blueprint hashes. An observation may instead use `--capture-observation <anchor-id>` to introduce the exact current selection/hashes, compatible Run/result, and Run-backed diagnostic, or `--capture-comparison <anchor-id> --from-run <id> --to-run <id>` to retain one exact recomputable immutable Run comparison and its TO operating context. The three modes are mutually exclusive, the new anchor is automatically cited by the same entry, and none accepts caller-authored generated identity. Entries are separate immutable files in a verified hash chain and cannot rewrite prior reasoning.

```bash
inm investigate examples/memory-fab \
  --investigation inspection-starvation-next-step \
  --create \
  --name "Inspection starvation next step" \
  --question "Which physically distinct intervention should be tested next?"

inm investigate examples/memory-fab \
  --investigation inspection-starvation-next-step \
  --entry metrology-low-power-standby \
  --kind hypothesis \
  --author agent \
  --statement "Use long empty intervals as qualified low-power standby windows." \
  --expected-effect "Reduce energy without weakening delivery, quality, Q-time, or starvation." \
  --evidence operating-run,diagnostic,design-lineage

inm investigate examples/memory-fab \
  --investigation inspection-starvation-next-step \
  --entry metrology-standby-rejected \
  --kind decision \
  --author agent \
  --statement "Discard: the energy benefit is dominated by service regressions." \
  --disposition discard \
  --attach-candidate metrology-low-power-standby \
  --anchor-id metrology-standby-review \
  --evidence diagnostic,design-lineage,metrology-standby-review
```

Continue the same inquiry from the exact current factory after a revision or decision:

```bash
inm investigate examples/memory-fab \
  --investigation inspection-starvation-next-step \
  --entry post-standby-constraint-boundary \
  --kind observation \
  --author agent \
  --statement "The next revision must recover the observed capital deficit and preserve interruption service." \
  --capture-observation post-standby-factory \
  --evidence metrology-standby-review,metrology-low-power-standby-sourced-review \
  --json
```

Flagless project mode lists Investigations. Supplying `--investigation` reopens one and resolves every evidence anchor as `current`, `historical`, `missing`, or `invalid`. Valid old evidence may remain historical while the newest factory-observation or Run-comparison checkpoint makes the ongoing Investigation current; any missing or invalid anchor still degrades the chain. A hypothesis-sourced Candidate reports whether it inherited the creation context or a directly cited checkpoint, including context kind, exact anchor, and Run identity. JSON defaults to `summary`; `anchors`, `entries`, and `all` are explicit sections. The envelope's sole next action is the current Core Workbench handoff, while each anchor retains its exact evidence route and argv. The command never authors a Blueprint, starts a simulation, or chooses an industrial decision.

`validate`, `analyze`, `plan`, `simulate`, `benchmark`, and `candidate` invoke the named Core [[docs/design/operation-workbench]] operations. Their JSON envelope keeps the requested summary/detail section in `data.result` and places shared industrial-result metadata in `data.operation`: effect, duration, exact context/hashes, diagnostics, artifacts, actual write set, and recommended verification. Long evaluations additionally use top-level `execution` for transient lifecycle identity; dense industrial data is not duplicated into it.

### `inm analyze <project-or-workspace-dir> [--project ID]`

Compiles Device Process/mode jobs and exact Resource-to-port bindings, reusable tooling, full-job facility-utility demands and spatial provider coverage, setup groups and changeover envelopes, selected inspection coverage/rework capability, required input treatment levels, configured treatment Device/agent rates, effective physical-port contracts, backing-buffer contracts and recipe partitions, compatible alternatives, the globally balanced target graph, extraction/deposit lifetime, renewable/fuel generation, accumulator envelopes, configured material and simultaneous-rated power envelopes, local and station logistics limits, each connection's authored Resource allowlist, dispatch policy/coverage, per-stage distance/duration/capacity, endpoint power assignment, and regional grid headroom without running a simulation. The configured envelopes are explicitly `descriptive-only`: their differences are not Objective demand, realized loss, or recommendation authority. Use `inm plan` for target-rate adequacy and a compatible Run for realized flow and power. Storage remains separate from generation because it moves finite energy across time. Sequence-dependent effective capacity, facility contention, and realized yield remain simulation-owned. Structural diagnostics retain exact industrial entities and `--json` is designed for optimization agents.

### `inm plan <project-or-workspace-dir> [--project ID]`

Treats the Objective's primary target and every delivery contract as an industrial specification. The planner solves the complete product portfolio and all configured Process/mode jobs as one material-balance system, crediting fixed coproduct ratios once and minimizing finite raw demand before installed continuous machine capacity. It reports every contract target, the selected mode mix and required jobs/min, configured versus required machine counts, treatment item/agent rates and Device gaps, and a qualification-aware toolset allocation that prevents several operations from each claiming the same physical work center's full clock. Raw Process/auxiliary and generator-fuel demand is compared with extraction plus Scenario-scheduled tracked-lot and purchased-material supply; the full-horizon balance also includes finite reserves. The plan continues through every input/output connection envelope, shared station carrier counts, rated regional generation headroom, and Scenario-integrated generated/demanded/unserved/curtailed energy plus storage capacity/rates. A rated-ready but temporally deficient grid is a power gap. The explicit gap list is deterministic JSON input for research agents as well as a human CLI review surface. Setup, maintenance, failures, utility/tooling contention, release blocking, and queue policy remain simulation-owned.

```bash
inm plan examples/ironworks --json
```

### `inm compare <project-or-workspace-dir> (--from-blueprint ID --to-blueprint ID [selection] [--seed N] | --from-run ID --to-run ID) [--project ID]`

Compares two named Blueprint files as one controlled experiment. Both files are compiled against the same selected Resource, Process, and Device catalogs, World, Scenario, Objective, and deterministic seed; the command rejects a changed benchmark input instead of blending it into the Blueprint result.

Human output groups stable-id changes by Device, local connection, logistics network, factory policy, and Blueprint metadata. It also prints an exact replayable RFC 6902 file patch, both capacity-plan states, and objective score, throughput, attainment, lot cycle/service, good/first-pass yield, quality escapes, rework, changeover/setup work, consumed/stored/unserved/curtailed energy, unpowered time, cost, area, and congestion deltas. `--json` returns the complete controlled-evaluation contract.

```bash
inm compare examples/ironworks \
  --from-blueprint synthesized \
  --to-blueprint scaled-factory \
  --world scaled \
  --scenario cold-start \
  --objective scaled-production \
  --seed 42
```

The command is strictly read-only: it never edits a Blueprint and never creates or reuses a run artifact. Use `inm simulate` to persist a chosen candidate. The two Blueprints must both execute successfully under the selected Scenario; a failure names the side that could not be evaluated. The detailed invariant is in [[docs/design/blueprint-comparison]].

Run mode instead reopens two exact completed Runs without simulating. It verifies each saved Blueprint/execution/result identity, requires equal non-Blueprint context, and reports the persisted semantic/spatial patch, score/cost/area/movement and delivery/quality deltas, capacity and Objective guards, fab-loss score/leader changes, and stable Studio/Factory routes. `--section summary|changes|evaluation|losses|all --json` selects one machine-readable projection; human output carries the same industrial facts. Run mode rejects selection and seed overrides because those would describe a fresh evaluation rather than the saved executions.

```bash
inm compare examples/memory-fab \
  --from-run 100-simulate \
  --to-run 101-simulate
```

### `inm benchmark <project-or-workspace-dir> [--project ID] [--benchmark ID] [--lock] [--json]`

Evaluates one editable candidate Blueprint against an immutable baseline over a weighted suite of fixed industrial cases. Each case declares its World, Scenario, Objective, deterministic seed, duration, and weight. The aggregate candidate score is the weighted mean of ordinary Objective scores; acceptance can additionally forbid per-case regression and require every candidate capacity plan to be READY.

```bash
inm benchmark examples/ironworks --benchmark autoresearch
```

Human output contains each case weight, baseline/candidate score, all evaluator-owned Objective components with their exact deltas, exact failing Objective constraints, quality/lot/setup telemetry, capacity state, and exact baseline-cache hits/misses followed by stable `baseline_score`, `benchmark_score`, `score_delta`, `worst_case_baseline_score`, `worst_case_benchmark_score`, `minimum_case_score_delta`, `patch_operations`, `semantic_changes`, and `verdict` lines suitable for a Coding Agent loop. JSON `summary` and `all` expose the same `baselineCache` counts; `cases` and `all` return baseline/candidate `scoreBreakdown` plus `scoreBreakdownDelta` and complete typed `objectiveConstraints` for each case alongside the exact patch, semantic changes, aggregate and worst-case scores, the minimum individual-case delta, and every gate reason. Every constraint records stable identity, metric/direction/unit, actual, threshold, deficit, and pass state, so the fixed million-point penalty never hides its industrial cause. Normal evaluation is read-only with respect to authored project state and writes no run artifact. It may reuse or populate rebuildable fixed-baseline evidence below ignored `.inm/cache/benchmark-baselines/`. A valid `DISCARD` or `UNCHANGED` experiment still exits successfully so an Agent can record it; invalid files, lock drift, or failed simulation return a non-zero error.

`--lock` is the only mutating mode. It compiles every baseline case and records the benchmark contract hash plus engine, selection-scoped execution, World, baseline Blueprint, Scenario, and Objective hashes. It must be invoked deliberately after reviewing a harness change. Evaluation refuses an unlocked benchmark or any reachable fixed-input drift; unused catalog inventory and candidate Blueprint content are never part of the lock. See [[docs/design/coding-agent-optimization]].

### `inm candidate <project-or-workspace-dir> [--project ID] --candidate ID [--review | --apply] [--json]`

Default mode is a cheap read-only inspection. It reconstructs Candidate state and any exact recorded review from project files without running the Benchmark, emitting progress, or writing an artifact. `--review` is the explicit evaluation mode: it loads `candidates/<id>.candidate.json`, verifies its pinned candidate-Blueprint hash, applies its restricted RFC 6902 patch in memory, evaluates the proposed Blueprint through the locked Benchmark, and creates or reuses one immutable V2 `candidate-reviews/<candidate>/<proposal-hash>.review.json`. The pinned base must parse as a Blueprint but may be an uncommissioned site that does not compile under the future operating Scenario; Core compiles the complete proposed Blueprint after patching and never records an invalid proposal. The review operation context carries the proposed compiled Blueprint hash while `currentCandidateHash` separately pins the base.

```bash
# reopen recorded evidence
inm candidate examples/memory-fab --candidate stable-furnace-sleep --json

# explicitly evaluate and record
inm candidate examples/memory-fab --candidate stable-furnace-sleep --review --json
```

The JSON result deliberately separates two references. `result` is locked baseline-to-proposed compliance and owns the Benchmark verdict. An operational `currentFactory` has `status: evaluated` and contains current-to-proposed aggregate/per-case score, exact Objective-component deltas, complete typed Objective constraints, complete remaining metrics, capacity, and hard outcomes across the same cases. It also owns one `physicalEconomics` ledger with current/proposed/delta totals for equipment and facilities, sorter endpoints, unique transport-line cells, occupied area, and transport-cell count. The ledger reconciles exactly with evaluator-owned build-cost and area metrics; it does not infer money from JSON Patch paths. A greenfield commissioning shell has `status: not-operational`, `verdict: NOT_COMPARABLE`, and an exact reason instead of fabricated incremental numbers. The descriptive current-factory verdict does not auto-accept or auto-reject a design. The compact summary names `lockedBaselineScoreDelta` and retains the ledger, bounded current-factory case drivers, and both sides' constraint evidence; `--section evaluation --json` returns both complete records. Human output prints recovered-versus-spent physical capital beside its exact Objective boundary, followed by the failing current/proposed and locked baseline/proposed boundaries.

Candidate review progress names three case waves—locked baseline, current factory, and proposed factory—so the additional evidence is visible rather than hidden startup time. A non-KEEP recorded review also exposes `revisionBrief` in summary, `all`, and the dedicated `--section revision`: exact locked blockers, current-to-proposed guardrail and case regressions, weighted Objective-component benefits to preserve and costs to remove, authored patch paths, and human/Agent decision ownership. Its next executable action is exact current-factory `inm observe`, not an automatic replacement patch.

`--apply` is an explicit write operation: Core requires the recorded `reviewed-keep` decision, performs one fresh evaluation of both references, verifies the same proposal/base/proposed hashes, atomically replaces only the Benchmark candidate Blueprint, and checks the written file against the reviewed proposed hash. It no longer performs a redundant preview evaluation first. The resulting decision is `verified`; a subsequent unrelated Blueprint edit makes it `stale`. `DISCARD`, `UNCHANGED`, missing-review, stale, changed, invalid, or cross-Benchmark proposals are never written. Pre-V2 receipts are replaced by a fresh explicit review rather than migrated. See [[docs/design/experiment-workbench]].

### `inm design <project-or-workspace-dir> [--project ID] [--program ID] [--run | --run-id HASH [--continue | --promote ID]] [--max-candidates N] [--progress MODE] [--json]`

Lists project-local Design Programs when `--program` is omitted. Selecting a program distinguishes an authored seed from a project-synthesized input, reports synthesis provenance and normalized seed hash, separately names the Benchmark candidate Blueprint/hash it would eventually update, and returns the locked Benchmark, driver case, exact current-best case guardrail, bounded Pareto frontier policy, hashes, allowed decision families, candidate budget, target-rate capacity state, flow diagnostics, declarative/opaque Device counts, topology, and current/historical/invalid local Design evidence without creating simulation or review evidence. Each strict valid run carries exact currentness reasons and outcome; the brief names one deterministic authority and recommends new run only when current evidence is missing, otherwise exact reopen, continuation, or promotion. Invalid sibling artifacts are explicitly excluded from authority; direct open, continuation, and promotion remain strict.

`--run` explicitly executes bounded design search. Before each proposal, Core selects one searchable leader or alternative node. The driver case supplies deterministic metrics, an exact metrics hash, a tracked-fab loss chain, Objective score breakdown, and physical WIP location averages for that Blueprint; the separate `promotionBoundary` supplies exact leader/selected aggregate and per-case deltas, both scores' Objective breakdowns and component deltas, guardrail budgets, limiting case, and violations. Project proposal-provider API V8 receives both objects plus explicit branch identity and only that node's history. A leader proposal may name one observed `addressedLoss` or, in an Objective-focused Program, one exact `addressedObjectiveTarget`; a blocked alternative repair names one current `addressedCase`. Exact loss and Objective targets cause Core to rerun the compiled candidate under the same driver case, store complete driver evidence plus before/after/delta, and reject promotion or branching when the claimed metric does not improve. `KEEP` still requires the complete locked multi-case Benchmark, positive aggregate leader improvement, current-best case guardrail, and any declared causal target. `BRANCH` records a fixed-gate-passing, causally supported, parent-improving, non-dominated alternative that cannot yet replace the leader. When one node has no unused eligible proposal, Core records it as exhausted, retains it as honest frontier evidence, and continues the next searchable node without consuming Candidate budget. `--max-candidates` selects the new Candidate budget for one initial or continuation invocation and cannot exceed the Program's per-invocation bound. Execution never edits the seed or candidate Blueprint and writes or reuses only:

```text
design-runs/<program-id>/<result-hash>/manifest.json
design-runs/<program-id>/<result-hash>/best.blueprint.json
```

Human output starts with the operation id, then reports live continuation provenance, baseline cache reuse, case execution/timing, selected branch, proposal boundary, observed loss chain, addressed loss/Objective/repair target, exact replay when required, node exhaustion, decision basis, current-best delta, and limiting guardrail evidence. `--progress ndjson` emits one compact versioned record per Core event while JSON stdout remains the single final result. Each V5 Core progress value has a deterministic sequence and phase-specific case, proposal, exact loss/Objective target, replay, exhaustion, decision, or result evidence. Progress is operational and does not participate in the immutable result hash.

Within an initial run, Core validates each locked baseline case, reuses an exact content-addressed fixed-baseline evaluation when available, then shares that prepared evidence across the seed and all candidates. A continuation performs the same validation, reuses the source's verified seed and Candidate evaluations, and simulates only newly proposed candidates. The baseline cache identity includes its projection version, engine, Benchmark contract/case/seed, and every locked fixed-input hash; corrupted, absent, drifted, or superseded-shape entries are ignored and rebuilt. Candidate simulations, acceptance gates, metrics, patches, and final hashes are not cached.

`--run-id <result-hash>` verifies and reopens one completed artifact; the program brief's `runs` section returns `{ runs, invalidRuns }`, where only strict valid summaries appear in `runs` and excluded entries retain exact id, Program, path, code, and message. When a valid result is `budget-exhausted` with a searchable frontier, JSON `nextActions` includes an exact continuation argv. `--run-id HASH --continue --max-candidates N` verifies the current engine, project, Program/provider, Benchmark, seed, driver, promotion base, source manifest, copied prefix, reconstructed Blueprint hashes, branch histories, and frontier before creating a new immutable V3 result. Its `continuation` object names the direct source, reused iteration/exhaustion counts, and additional budget; `budget.maximum/evaluated` are cumulative. V3 also requires each stored Benchmark case to carry exact baseline/candidate cadence-control policy and normal/recovery activation counts. Human Benchmark and Design output print the same activation evidence available in JSON. The source run is never changed. Frontier-exhausted, stale, unavailable, malformed, or replay-divergent sources fail before new evidence is written.

`--promote <candidate-id>` also requires a run id and cannot be combined with `--continue`. It accepts only an accepted best that differs from its recorded promotion base. It verifies the current Program, Benchmark, engine, and promotion-base identities, then creates one `candidates/<candidate-id>.candidate.json` whose patch replays from that unchanged Benchmark candidate to the exact recorded leading Blueprint hash. It never applies the Candidate; review with `inm candidate <path> --candidate <candidate-id> --review` and apply only through the existing guarded Candidate lifecycle. The returned preview next action declares `creates-artifact` because that review writes immutable evidence.

JSON sections are `summary`, `static`, `iterations`, `frontier`, `best`, `runs`, and `all`. Every valid iteration exposes its selected parent/role/depth, proposal-time boundary, complete driver evidence, one optional loss/Objective/case target, exact target evidence when applicable, proposal/evaluation, post-candidate decision evidence, and frontier outcome. The `frontier` section also includes the ordered zero-budget exhaustion timeline and final node `searchStatus`. Human run, continuation, and reopen output preserve direct lineage, the compact parent → candidate → outcome relationship, exact causal target before/after/delta, and both the before-proposal blocker and after-evaluation promotion decision. Returned `design-run` and promoted `candidate` artifacts are immutable. See [[docs/design/design-programs]].

### `inm synthesize <project-or-workspace-dir> [--project ID] [--output ID]`

Creates a new complete blueprint from the selected Objective rather than editing the input blueprint. When `inm.json` declares `synthesis.strategy`, the command executes that project-local TypeScript strategy twice against the same frozen catalog, Product Route, World, Scenario, Objective, and empty/minimal seed; differing or asynchronous results fail. This path supports identity-preserving, re-entrant factories whose equipment qualification, batches, reusable tooling, facility providers, maintenance, and Scenario boundaries cannot be represented as fungible steady-state flow. Core schema-validates and compiles the returned ordinary Blueprint, runs target-rate capacity planning, and exercises the selected operating Scenario before atomically writing it.

Without a declared strategy, the deterministic synthesizer considers every compatible project-local Process and Device, solves a globally raw-efficient continuous process mix (including alternatives, coproducts, and recycle loops), then expands it across `(Resource, region)` balances. Regional raw variables are capped by the selected Scenario's finite reserve lifetime; inter-region variables are costed by world-coordinate distance. The final Process and boundary consumer are anchored to the Objective's required `targetRegion` while upstream Processes may move, so the solver explicitly chooses which intermediate crosses each local boundary. It then sizes machine and extractor counts, binds multi-input/multi-output recipes and finite deposits, inserts direct rate-matched flows or arbitrary-size merge/split junction trees and cross-region station fleets, and propagates required items/min across every local edge. Generated home fleets are sized against complete outbound-plus-return cycles, and minimum station batches prevent underfilled carriers from consuming that capacity. Every generated local edge receives its planned Resource as an exact one-item allowlist, while both the factory and generated station networks select shortage-first dispatch. For each connection it evaluates all compatible project-local loader/line/unloader combinations and every supported endpoint-span pair through their TypeScript `planTransport()` hooks and Resource stack limits, selecting the lowest weighted-cost span, route, and pipeline that meets the flow. After belt routing, every powered Device and loader/unloader endpoint becomes a spatial power target. The synthesizer builds coverage, integrates the selected Scenario curve against constant design load, enumerates project-local generator/storage counts, selects the lowest-build-cost empty-cold-start bundle with zero unserved energy, and places it as one connected regional component. It then performs a cold-start simulation. Existing files are never overwritten.

```bash
inm synthesize examples/ironworks \
  --blueprint blank \
  --scenario cold-start \
  --output synthesized

inm synthesize examples/memory-fab \
  --blueprint greenfield \
  --scenario production-window \
  --output scratch-dram-fab
```

Human and JSON output identify `fungible-flow` or `project-strategy`, the exact strategy entry/hash when present, target, physical counts, capacity gaps, and measured operating evidence. Generic flow output additionally includes optimized cycles/min, cross-region flows, local lane envelopes, logistics tiers, and power coverage. Its verification clears input-Blueprint state for a cold start. A project strategy instead keeps the selected Scenario intact so named lot releases, purchased-material deliveries, setup, power, and failure contracts exercise the generated topology.

### `inm simulate <project-or-workspace-dir> [--project ID]`

Runs the deterministic discrete-event simulator and writes or reuses an immutable run artifact. The manifest records the exact Blueprint, World, Scenario, Objective and Route-catalog identity, so Studio and replay tools can distinguish candidate runs from baseline runs without guessing from content. Human-readable output begins with every delivery contract's demand, delivered and valued quantity, above-demand output, demand attainment, and net value, then includes Objective-scoped average/peak WIP, total inventory and per-Resource WIP contributors; tracked-lot completion/on-time service, Route transitions/re-entry, per-step mean/maximum/window Q-time and violations, mean/p95 cycle time, queue/process/transport time and tardiness; good and first-pass yield, inspection/rework/scrap/escape outcomes; nominal/actual/lost lot-derived output from terminating processes such as wafer Probe; equipment changeover count/current groups/setup work; treated quantities by `Resource@level`; physical belt utilization; transport energy; storage; per-grid power; and measured connection flows. JSON metrics retain the complete delivery portfolio, complete [[docs/design/inventory-accounting]], every lot/Route/quality-flow/lot-output aggregate, setup and treatment ledgers, full power/storage ledgers, per-Device status time, and capacity-normalized sorter utilization. Active production/changeover/extraction/treatment/inspection/rework jobs pause at a power boundary; equipment failure cancels a changeover without consuming queued WIP, while explicit loader/unloader work freezes its exact remaining time across a sorter failure.

```bash
inm simulate examples/ironworks \
  --world main \
  --blueprint main \
  --scenario baseline \
  --objective default \
  --seed 42 \
  --until-tick 120000 \
  --max-events 1000000 \
  --json
```

The response includes artifact path, cache status, run key, result hash, every metric, score breakdown, and final score.

### `inm test <project-or-workspace-dir> [--project ID]`

Runs every `tests/*.fixture.json`, including a duplicate run determinism check. Metric assertions support `min`, `max`, and `equals`; event assertions support presence/absence.

### `inm runs <project-or-workspace-dir> [--project ID]`

Lists only completed immutable runs. Partial or interrupted directories without a completed manifest are ignored.

### `inm research <project-or-workspace-dir> [--project ID]`

```bash
inm research examples/ironworks --iterations 5 --seed 42
```

Each iteration proposes a restricted JSON Patch over blueprint devices, local connections, station networks, or policies; compiles and simulates a candidate; compares its score; and writes a `KEEP` or `REVERT` artifact. A KEEP atomically updates the selected blueprint with a revision hash. Built-in strategies consume the target-rate capacity plan, material/local-logistics/station/power diagnostics, measured per-connection flow, and measured power time envelopes. A missing Process Device is therefore tied to a concrete required machine count, a line near capacity can trigger a project-local transport-tier upgrade, a total-energy shortage can add profiled project-local generators, and a temporally deficient grid with sufficient energy can receive an accumulator bundle sized by bounded re-simulation. Contended multi-route networks can independently cycle their fleet policy without changing unrelated local dispatch. The plan is recomputed after every KEEP, so a recipe edit changes all downstream requirements before the next proposal. Every later iteration also receives earlier strategy keys, hypotheses, decisions, and score deltas so it can avoid repeating a reverted experiment.

When `--blueprint ID` is supplied, KEEP writes that exact candidate file; the project default is never used as an implicit write target.

Use an external model or agent without binding INM to a provider:

```bash
inm research examples/ironworks \
  --iterations 5 \
  --agent-command 'my-agent --format inm-proposal'
```

The command receives `ResearchInput` JSON on stdin—including the target-rate capacity plan, static production analysis, measured metrics, and current-invocation experiment history—and must print:

```json
{
  "strategy": "capacity:smelter-1",
  "hypothesis": "Add a second smelter",
  "expectedEffect": "Reduce smelting saturation",
  "patch": [{ "op": "add", "path": "/devices/-", "value": {} }]
}
```

### `inm session <project-or-workspace-dir> [--experiment ID [--run]] [--project ID] [--port N] [--no-open]`

Enters the exact current project work without composing lifecycle, port discovery, Workbench inspection, and navigation commands manually. The command ensures a managed source-current Studio, safely replacing only a verified stale instance, reads that Studio's authoritative `ProjectWorkbenchSnapshot`, and opens its exact shared `nextAction.studioRoute`. Omit `--port` for the ordinary managed/default/fallback discovery policy. A failure-free recovery already verified for this exact project/port/source receives one bounded convergence wait. Changed ownership/source and timeout return typed retryable recovery errors; degraded adoption requests one immediate supervised retry and otherwise returns stable `session.studio-degraded` evidence. Session never waits on or opens a foreign or refused port.

Default human and JSON output return one strict `project-next-action` target with the same id, reason, argv, effect, confirmation boundary, typed target, route, and URL used by Studio. Session entry only navigates; it never executes the recommended action implicitly.

Supplying `--experiment ID` instead selects one authored Experiment and its lightweight project-qualified route. In that explicit mode only, `--run` starts the locked evaluation through Studio's reconnectable operation registry and returns immediately; it does not wait for the Benchmark result. Human output prints the exact operation id and polling URL. JSON uses the same result union with an `experiment` target plus the lifecycle/source record, route, URL, start/reuse state, complete initial operation snapshot, polling URL, and an exact next action. `--run` without `--experiment` is a usage error rejected before lifecycle mutation. `--no-open` is intended for Agents or terminal-only use. Standalone `inm benchmark` remains the browser-free synchronous evaluator and shares the same Core contract without pretending its local process is reconnectable.

```bash
# Human: repair/reuse Studio and enter the shared current project action.
bun run inm session examples/memory-fab

# Human: explicitly open one Experiment and start its reconnectable run.
bun run inm session examples/memory-fab \
  --experiment equipment-energy-research \
  --run

# Agent: receive the URL and retained operation id without opening a browser.
bun run inm session examples/memory-fab \
  --experiment equipment-energy-research \
  --run --no-open --json
```

### `inm studio <start|status|restart|stop|serve> <project-or-workspace-dir> [--project ID] [--port N]`

Manages the local Studio workbench. Omit `--port` for ordinary use: the command discovers the one live service recorded for the exact root/project selection. If none exists, `start` and `restart` reuse a free recorded project port, otherwise choose `4176`, or choose the first free bounded fallback through `4199` when the default is occupied. Supplying `--port` is strict and never silently moves.

`start` creates a background managed supervisor or idempotently reuses the exact healthy, source-current target. The supervisor keeps the selected URL and port stable while replacing its server child after runtime source changes; connected pages reload their bundle when the replacement reports a new server hash. Adoption first preflights server and browser source in memory while the last healthy child continues serving. A preflight/startup failure preserves the manager, records `degraded` state and the exact attempted hash/failure/retry boundary, avoids retrying the same failed hash in a loop, and retries automatically on the next source change. Calling `start` or `session` while degraded requests one explicit retry. A running supervisor cannot replace its own loaded code, so health carries separate server and manager hashes. `status` reports `current`, `stale`, `degraded`, `recovering`, or `not-running` plus the supervisor generation, attempted source, failure, and retry state; the next default `start` or `session` safely replaces a verified stale manager after a successful child adoption and converges the pair. When an already-running stale target predates or is outside that ownership, replacement still requires ignored project-local lifecycle state to verify its live manager identity; an unverifiable process is reported and never killed. `restart` replaces only that verified service and `stop` releases only that verified service, including a manager waiting without a child. Multiple live instances of one target are reported as an explicit ambiguity. These four operations support `--json`; start and restart accept `--no-open`.

`serve` is the explicit unsupervised foreground primitive for tests and direct debugging, accepts `--no-open`, and defaults to `4176`. Studio exposes `GET /api/health` with its protocol identity, engine version, server PID, optional manager PID, resolved input root, optional workspace project selection, deterministic server and manager runtime-source hashes, live supervisor phase/attempt/failure/retry state, start time, and URL. Managed JSON lifecycle output exposes the same supervisor record, expected hash, both running hashes, and their individual states. A port occupied by another INM root or by an unknown service is never killed merely because it was discovered or requested. Managed state and logs live below the selected root's ignored `.inm/studio/` directory; a fresh manager rotates the prior session to `studio.previous.log`, and the active log uses timestamped newline-delimited lifecycle records. See [[docs/design/development-operations]].

Studio starts Benchmark, Candidate preview, Design run, and Design continuation as reconnectable project-local operations. The start response contains an operation id instead of holding one response stream for the entire simulation set. Experiment and Design routes recover that id after navigation or refresh, display retained Core progress/result state, and cancel only through an explicit operator action. Ignored `.inm/operations/` retains at most sixteen terminal records per project; a Studio restart marks unfinished work interrupted rather than fabricating completion. See [[docs/design/operation-workbench]].

`/` is a project launcher; choosing a project navigates to the task-oriented `/<project-id>` Overview, where selection/hashes, Objective/contracts, readiness, prioritized diagnostics, recent immutable evidence, proposals, and available operations appear before spatial debugging. There is no project switcher inside the workbench—return to the launcher to open another self-contained project.

Stable project-qualified routes cover Overview, Factory, Runs, Design, Experiments, Catalog, and Analysis. Catalog, Analysis, Design, and Experiments are route-backed workbenches; selected catalog assets, diagnostics, Factory devices/connections, Design Programs/runs, Benchmarks, and Candidates remain addressable across reload, history, and copied links. Design shows the same generated-from/current-target contract, bounded Program brief, Core-ranked current authority, historical reasons, proposal effects, promotability gate, and guarded Candidate handoff as `inm design`. A current authority is the default route selection; score cannot make a historical run current, and historical deep links remain readable without Continue/Promote. After apply, a selected run whose best hash is the current target is labeled commissioned and links its matching Candidate instead of exposing stale controls. Experiment review shows a Candidate's exact Design source and links it only while that ignored immutable run artifact is locally present.

The read-only Catalog is modeled after an editor asset browser. It separates Device and Resource packages from Process and Product Route definitions, supports category-scoped text filtering, and exposes geometry, production ports, buffers, modes, runtime, transformations, inspection/rework disposition, transport limits, generation/storage/distribution envelopes, content hashes, and instance counts. Every request is project-qualified and root-confined.

Analysis recompiles the selected run Blueprint and presents target-rate gaps, configured Resource-to-port jobs, effective port and backing-buffer contracts, recipe material partitions, searchable material/logistics/station diagnostics, generator/fuel envelopes, rated generation/load/headroom, accumulator capacity/rates, and selected-run stored energy per grid. Diagnostics on the Overview deep-link to their most specific asset, Device, connection, or focused Analysis evidence.

Factory contains the 3D view and immutable replay timeline. It renders the same event-backed industrial state without making the canvas necessary for project orientation or operation discovery.

Clicking a Device opens a scoped inspector for runtime status, recipe/mode batches, physical port contracts, buffer contracts/quotas, extraction/generation/storage plan, power-grid membership, diagnostics, and connected links. Clicking a belt cell opens its physical connection inspector. Selection and Studio remain read-only.

Studio can replay semantic events, scrub time, change speed, inspect status and metrics, and refresh when project files change. Completed Runs, Design Runs, and Candidate reviews appear after their final Core-readable publication marker; partial evidence and ignored operation/cache writes do not refresh the page. It cannot create, move, rotate, connect, or delete blueprint entities.

## Selection and output

Every runtime command accepts either a direct project directory or a workspace directory. A workspace uses its default project unless `--project ID` is passed; `--project` is rejected for an already-direct project path. `validate`, `inspect`, `analyze`, `plan`, `synthesize`, `simulate`, and `research` accept `--world`, `--blueprint`, `--scenario`, and `--objective`. `compare` accepts the same benchmark selectors but replaces `--blueprint` with required `--from-blueprint` and `--to-blueprint` ids. Headless commands use exit code `0` for success, `1` for validation/runtime/test failure, and `2` for invalid CLI usage. Use `--json` for AI and shell automation, and consult `inm help --json` rather than hard-coding section names or defaults.
