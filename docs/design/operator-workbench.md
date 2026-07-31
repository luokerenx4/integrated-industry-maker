# Shared operator workbench

Status: V19 exact-target Design Program routing and observation fallback over shared decision status, Objective-owned Resource and physical-location score/tradeoff evidence, hash-compatible tracked-lot loss attribution with exact material-shortage supply states and source-lot service chronology, direct-current and verified-commissioned Design evidence authority, evidence-backed bounded-loss and Candidate Investigation dispositions, Objective-authoritative diagnostic boundary, Core-owned next action, resumable Candidate-cycle Investigation phases, AI-native CLI projection, Studio task-oriented project root, and browser-Agent proof implemented.

Related: [[docs/design/studio-debugger]], [[docs/design/experiment-workbench]], [[docs/design/observation-led-design]], [[docs/design/operation-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/blueprint-optimization]], [[docs/design/fab-loss-attribution]], [[docs/design/documentation-system]], [[docs/ARCHITECTURE]], [[docs/CLI]], [[plans/human-ai-workbench]], [[plans/operator-interaction-refinement]].

## Scope

The operator workbench is the shared, renderer-independent projection through which a human or Coding Agent establishes project context before taking industrial action. It answers which project inputs are selected, which hashes identify them, whether the Blueprint is statically ready, what the prioritized problems are, what project-local evidence exists, and which operations may be attempted.

It is not an evaluator, a second analysis engine, an Agent runtime, browser state, or a simplified industrial model. It invokes existing Core compilation, production analysis, and capacity planning and projects their results into one serializable contract.

## Authoritative flow

```text
project-local files + explicit ProjectSelection
  → loadFactoryProject()
  → compileFactoryProject()
  → analyzeProduction() + planProductionCapacity()
  → runs + Benchmarks + Candidate Change Sets + Design Programs
  → buildProjectWorkbenchSnapshot()
  → inm inspect / Studio project overview API
```

`ProjectWorkbenchSnapshot` is owned by Core. CLI and Studio may format or progressively disclose it, but they may not recompute status, rewrite diagnostic severity, choose a different next action, infer different operation availability, or maintain a browser-only copy as authority.

Opening a snapshot is read-only. It does not create cache directories, runs, Benchmark results, locks, review receipts, or candidate applications. It loads Candidate manifests and existing project-local review receipts but does not evaluate their patches. Explicit Candidate review remains the operation that runs the locked evaluator and records evidence.

`inm session <path>` is the one-command entry into that same authority. After converging on a source-current managed Studio, it reads the exact Studio overview snapshot and navigates to `nextAction.studioRoute`; its human and JSON projections preserve the complete next-action identity instead of selecting a CLI-local or browser-local landing page. Session entry never executes the action. `--investigation ID` instead enters that Investigation's exact phase-aware Design Session, while explicit Experiment targeting remains a separate mutually exclusive target because only that form may start a reconnectable locked evaluation.

## Snapshot contract

The V19 snapshot contains:

- project id, display name, and resolved project root;
- the effective World, Blueprint, Production Plan, Scenario, and Objective ids/names plus complete input hashes;
- normalized primary or portfolio delivery contracts plus the Objective's exact WIP Resource scope;
- separate capacity, flow-risk, matching-evidence, and Candidate-review status facets;
- topology, project-local catalog, run, experiment, and candidate counts;
- compact Resource, Process, Product Route, and Device asset summaries;
- immutable run evidence with selection, engine compatibility, decision, score, and result hash;
- locked Benchmark summaries and Candidate summaries with cheap `proposed`, reviewed-verdict, `verified`, or `stale` decisions reconstructed from hashes and immutable review receipts without running their evaluators, plus the newest exact human/Agent Investigation disposition when its cited review identity still matches;
- project-local Design Program summaries with their seed, locked Benchmark promotion target, bounded policy, explicit alignment result against the effective Blueprint, and valid/invalid/historical/commissioned/direct-current Design evidence state;
- prioritized diagnostics and operation descriptors.
- optional compatible-run tracked-lot loss attribution with exact run identity, outcome, primary signal, ranked chain, named buckets, ordered quality-origin, material-shortage Resource/Buffer/immediate-path-state, positive transport-blocking connection with immediate-cause evidence, and Q-time step/Device contributors, and interpretation caveat;
- zero or more `bounded-deferred` loss dispositions, each binding one still-visible diagnostic to an exact current contributor/metric/value, Program/Benchmark/Design Run authority, compatible observed run, attempt/improvement/rejection counts, decision bases, and explicit invalidation boundary;
- zero or more current Investigation diagnostic dispositions, each binding an explicit decision target to an exact compatible Run/result, diagnostic, leading loss contributor, source Investigation entry, queue effect, and automatic invalidation boundary;
- optional compatible-run Objective inventory accounting with average/peak total inventory, scored WIP, excluded inventory, per-Resource averages/peaks/final quantities/inclusion state, and ranked conserved Device-Buffer, local-transport-stage, or station-route locations;
- optional compatible-run Objective evidence with an exactly reconciled score breakdown, deterministic component roles/ranking, the dominant negative component, and WIP weight plus per-Resource score contributions and shares;
- exactly one shared next action with stable identity, reason, effect, confirmation requirement, exact CLI argv, project-qualified Studio route, and typed target.

Every array is emitted in deterministic id order where its source is not already ordered. Snapshot `version` identifies this projection contract; INM is still pre-alpha, so changing it means replacing both consumers and tests in the same change rather than adding compatibility readers.

## Diagnostic contract

Workbench diagnostics normalize three existing evidence sources:

- every target-rate capacity gap becomes `capacity.<kind>`, severity `blocking`, priority `100`;
- every non-zero bucket from an exactly hash-compatible tracked-lot run becomes `fab-loss.<bucket>` in realized rank order with descending priority from `90`, retaining the run id and industrial subjects;
- structural production-analysis diagnostics become `analysis.<code>`, retaining their `warning` or `info` severity at priorities `60` and `20`.

Each diagnostic carries a deterministic id, stable namespaced code, one or more typed subject references, display message, evidence source/summary, and operation ids that can reveal more evidence. Diagnostics sort by descending priority, then code and id. The code and typed subjects are the cross-surface contract; prose may improve when the underlying analysis improves.

Capacity, realized-loss, and structural analysis diagnostics may intentionally overlap. A capacity gap answers whether the Objective is provisioned, a compatible run measures what happened, and a structural analysis warning identifies a disconnected or physically undersized authored path. `status.capacity` and `status.flow` therefore remain separate: `capacity ready` may coexist with realized or structural `flow at-risk` without presenting the project as unqualified `READY`. Studio may group related evidence but must not silently discard any authoritative source.

Configured operation-rate and rated-power rows remain available in dense Analysis as explicitly `descriptive-only` envelopes. Their material difference gives each configured operation on a shared Device an equal nominal share; their power difference assumes simultaneous rated load. Neither envelope is Objective demand, a realized loss, or recommendation authority. They therefore emit no material deficit/surplus or rated power-deficit Workbench diagnostics. Objective-scaled material and power gaps belong to `planProductionCapacity()`; observed power interruption and material shortage belong to a compatible simulation Run. See [[docs/design/fab-capacity-planning]] and [[docs/design/fab-loss-attribution]] for the strict authority boundaries.

## Operation descriptors

An operation descriptor advertises one Core capability without executing it. It contains a stable id, effect, selection behavior, confirmation requirement, declared write-set pattern, guards, and availability:

- `available` means it can be invoked with ordinary required arguments;
- `conditional` means a capability exists but its selected artifact must still satisfy listed guards;
- `unavailable` means the project contains no applicable artifact or prerequisite.

The three operation effects are `read-only`, `creates-artifact`, and `mutates-blueprint`. `simulate` declares an immutable `runs/<generated>/` artifact. `synthesize` declares a new Blueprint path. `design.run` declares a content-addressed `design-runs/<program>/<result-hash>/` artifact and the locked-Benchmark, current-Program-hash, bounded-budget, and immutable-result guards. It is unavailable without a locked Program, available when an aligned Program has no current evidence, and conditional when current evidence is promotable, continuable, or exhausted. The conditional reason tells the operator to review the exact leader, continue the exact frontier, or change the exhausted intervention portfolio instead of presenting an identical deterministic run as new work. Its existing streaming Design executor remains separate from the shorter named-operation result protocol. Candidate review declares `candidate-reviews/<candidate>/<proposal-hash>.review.json`; Candidate application declares its candidate Blueprint path pattern, explicit confirmation, immutable review receipt, reviewed/base/proposed hashes, KEEP verdict, and post-write hash guards. A matching Investigation `revise`, `defer`, or `discard` disposition makes application unavailable in project orientation even when the historical Benchmark verdict is KEEP; explicit Candidate CLI validation remains separate, so reasoning evidence guides the Workbench without mutating the receipt. A descriptor never grants permission to bypass the command's runtime validation. Studio disables unavailable operation actions and routes conditional Design actions to their current authority instead of inventing a client-side escape from this Core state.

## CLI and Studio projections

For tracked-lot queue congestion, CLI and Studio consume the same ordered V8 contributors: exact Device or connection, Route step, Process, Resource, lots, segment count, tick total, share, and maximum interval. Contributors must conserve the evaluator-owned completed-lot total; global utilization context cannot become queue ownership. For input starvation, both surfaces consume the same ordered contributors, Resources, Buffers, exact quantity gaps, immediate authored connection/source subjects, and conserved supply-state intervals. Neither infers a recursive root cause or converts ordinary in-flight material into a lane-capacity recommendation. For transport, both consume the same ordered contributors, dominant mechanism, total blocked item-time, and four immediate-cause shares. Neither converts endpoint service or power evidence into a line-speed recommendation. Studio also exposes the same per-cause metrics in the selected Factory connection inspector. Workbench V19 may additionally project a bounded Design disposition or explicit current Investigation decision over one exact contributor; neither projection removes or rescales the underlying physical bucket.

Immutable Run comparison is the cross-surface bridge between two Workbench moments. Core owns both exact Run identities, compatibility rejection, semantic/spatial change, evaluator and capacity snapshots, full fab-loss sides, delta/leader transitions, and stable navigation. CLI human/JSON and Studio project this object without replaying simulation or ranking the next intervention. Unchanged delivery, quality, capacity, and Objective constraints stay visible beside score improvements. Historical Factory observation recompiles the Run's frozen Blueprint and validates its result/execution identity, so a copied changed-subject route remains evidence rather than a current-source reconstruction.

## Objective tradeoff handoff

After capacity blockers, Candidate review, missing or incompatible run evidence, and every still-active diagnostic have been handled, the next action advances to the compatible Run's dominant negative Objective component. This is a different evidence class from realized fab loss. A score component says what the selected Objective valued or penalized; it does not prove that the entire measured quantity is avoidable or identify a physical cause.

Core orders the complete score breakdown by absolute contribution with canonical component order as the tie-breaker, separately selects the most negative component, and reconciles every component to `finalScore`. For WIP it joins the exact Objective weight with conserved inventory accounting and emits Resource and physical-location contributors. If an aligned Design Program declares the same Objective component and every declared WIP location exists in the compatible Run, the shared next action opens that Program; current promotable, continuable, or exhausted authority reopens its exact immutable Run. Otherwise the handoff remains the generic observation action. The current memory-fab route therefore opens `back-end-wip-convergence` for the burn-in package-input and packaging die-input exposure without converting descriptive accounting into automatic design authority.

This handoff occurs only after active physical and structural evidence. It neither creates a ninth fab-loss bucket nor prescribes an intervention. `inm observe` then binds the exact Run, Factory replay, and leading Resource catalog views so a human or reasoning Agent can separate necessary inventory from a falsifiable avoidable exposure.

`inm inspect --json` emits a compact summary inside the versioned CLI envelope. Its bounded `designPrograms` projection includes exact focus, alignment, evidence state, authority run id, exact authority commissioning identity when present, authority-addressed `{ loss, target }` identities, and current/commissioned/historical/invalid counts without embedding dense run histories. The summary also includes complete Design and Investigation dispositions plus compatible Objective evidence. `inm inspect --section next-action --json` returns the exact Core next-action object, `--section objective --json` returns the exact score/tradeoff evidence, `--section losses --json` returns compatible-run attribution, and `--section dispositions --json` returns `{ design, investigations }`. `--section all --json` places the exact Core snapshot in `data.result`; the envelope's `nextActions` contains that same one object. Human `inm inspect` renders effective selection/hashes, Objective, the four explicit status facets, Objective score/WIP contributors, aligned Design evidence state/authority, both disposition classes and invalidation boundaries, the shared next action, topology/catalog/evidence counts, the primary realized loss/chain and any measured quality-origin, input-gap, positive transport-blocking, and Q-time contributor rows even when those buckets are not rank one, highest-priority diagnostics, and operation effects. Studio renders the same structured contributor, Objective tradeoff, and disposition evidence. Dense analysis remains in `inm analyze` and `inm plan`. See [[docs/design/agent-cli-contract]].

Studio exposes the same snapshot at:

```text
GET /api/projects/<project-id>/overview
GET /api/projects/<project-id>/overview?world=<id>&blueprint=<id>&scenario=<id>&objective=<id>
```

Explicit query selection never falls back when invalid. The endpoint is project-qualified, accepts only GET, and creates no run or cache state. The task-oriented project root consumes this contract for selection, readiness, diagnostics, evidence, loss attribution, and operation descriptors. When Factory selects a run, Studio requests Overview with that run's exact selection so spatial replay and workbench conclusions cannot drift apart.

The observation-led design projection is a separate read-only view over that snapshot:

```text
GET /api/projects/<project-id>/observation?world=<id>&blueprint=<id>&scenario=<id>&objective=<id>&run=<id>
```

Core builds the same `FactoryObservationBrief` returned by `inm observe`. Studio renders it beside the Factory replay, while stable `?run=<id>` Factory URLs preserve evidence identity through direct open, reload, focused Device/Connection navigation, history, and the run picker. The brief adds no new diagnosis or optimizer authority; it binds current Workbench evidence to the spatial observation required before a human/Agent-authored design intervention.

An [[docs/design/industrial-investigations]] manifest persists one exact Workbench inquiry beyond a transient snapshot. Creation copies only compact identities from the snapshot; it does not copy dense metrics or reinterpret the next action. Reopen recomputes currentness against authoritative Runs, diagnostics, and commissioned Design/Candidate lineage, while preserving the original question and append-only human/Agent record. Workbench V19 resolves a source Candidate's newest decision only when its cited review anchor matches every current review identity; non-keep dispositions remove that Candidate from pending/apply orientation without rewriting either artifact. It also resolves an explicitly targeted diagnostic decision only while project, selection, execution, Run/result, diagnostic, bucket, and leading contributor all remain exact. `defer`/`discard` suppress that exact queue item, `revise` returns to the source Investigation, and `keep` remains context. Investigation inspection separately projects the newest Blueprint hypothesis's exact Candidate, review, TRIAL, retained comparison, and disposition chain, so its design session resumes one deterministic phase without using transient browser state. `inm investigate` and Studio consume that same Core inspection result and current `ProjectWorkbenchSnapshot.nextAction`.

### Shared next action

Core derives one visible and machine-readable next action from existing workbench facts so operators do not assign equal weight to every panel. This is an operating projection, not a new industrial conclusion. It selects, in order, the first blocking capacity diagnostic, an exact reviewed KEEP awaiting confirmation, a new current Candidate proposal awaiting review, missing or incompatible immutable factory evidence for the exact effective selection, the current Design authority or aligned Program brief for the first active compatible-run loss, the first remaining structural flow warning, the latest matching factory run, or shared analysis. Before loss selection, exact current Investigation `defer`/`discard` decisions remove only their targeted diagnostic; `revise` routes to the owning Investigation. A reviewed non-KEEP verdict is resolved evidence, and a stale Candidate is historical evidence; both remain visible in the catalog and status counts but neither can permanently displace work on the current factory.

A Program is aligned only when its Benchmark is locked, its seed is an authored Blueprint equal to the effective Blueprint, and that Benchmark's candidate/promotion target is the same Blueprint. Synthesis seeds, unlocked Benchmarks, and different seed or promotion targets remain visible with exact non-alignment reasons but cannot become current-factory recommendation authority.

For an aligned Program, Core classifies strict valid Design Runs against the exact current engine, project, Program id/hash, Benchmark id/contract hash, declared seed source, source Blueprint hash, normalized seed Blueprint hash, and promotion base. An exact match is direct current evidence. A changed seed/driver/promotion base may instead become commissioned authority only through one unique verified Candidate chain: source Program/result/best hash, Candidate base, immutable KEEP receipt, reviewed proposed hash, and current Benchmark candidate Blueprint must all agree, while the non-Blueprint driver selection, engine, World, Scenario, and Objective remain exact. All other mismatch makes a valid run historical; a strict-load failure remains quarantined invalid evidence. Among direct current evidence, a valid continuation supersedes its source, then deterministic authority prefers a promotable leaf, a continuable leaf, or an exhausted leaf. Direct current evidence outranks commissioned lineage; commissioned lineage is used only when no direct current Run exists. Evaluated budget, score, and stable id are tie-breaks inside one class. Filesystem timestamps and result-hash order never imply recency.

When several Programs align with the same current Blueprint, Program choice is diagnostic- and contributor-aware. For the selected loss, only a Program whose `focus.loss`, exact contributor, and metric match the compatible bucket's leading contributor is eligible. Its current authority must expose the same exact addressed target; continuable and commissioned evidence precede exhausted evidence, while a missing exact-target Program remains runnable. Broad Programs and focused Programs for a different contributor remain visible and manually runnable but cannot hijack the diagnostic. If no exact Program qualifies, Workbench opens the run-qualified Factory observation path so a human/Agent can record an Investigation and decide whether a genuinely new Program is warranted. The ordering never merges Program portfolios or treats one Program's run as another's evidence.

No current evidence opens the read-only Program brief with exact `inm design ... --program ... --json` argv. A promotable, continuable, or exhausted authority instead opens the exact immutable result with `--run-id <hash> --json`, a typed `design-run` target, and a project-qualified `/designs/<program>/runs/<hash>` route. Exhausted evidence explicitly moves the engineering boundary to the project-local intervention portfolio; orientation never starts a Design Run on page load or claims that another unchanged invocation is productive.

An exhausted authority becomes `bounded-deferred` only under a stricter gate than ordinary currentness. The exact current compatible bucket must contain the same contributor and metric at the same before value; every evaluated Candidate must share and improve that target, complete locked evaluation, and be rejected; the seed must remain the unchanged zero-patch leader; the single-node frontier and scheduler must be fully exhausted; and the Program, Benchmark, driver selection, driver hashes, source/promotion Blueprint hashes, observed run, diagnostic, and target must all remain current. The disposition labels a decision boundary, not a solved loss. A change to any binding removes it automatically. The diagnostic and ranked bucket stay visible, while only that exact diagnostic leaves the active work queue.

For the current memory fab, broad `commissioned-dram-fab`, focused `inspection-supply-path`, and loss-focused `layer-two-particle-control` all align with `generated-dram-fab`. Current `inm-sim/0.89.0` Inspection Run `9176fce45993e96f001db91d61a00fc47578de731a3de4a148fea2ca5422291c` records six interventions that all reduce `device:inspection-1:material-input-shortage.starvationTicks` from `59,584` ticks, yet five lose current-best score and the vacuum handoff fails the locked Benchmark gate. Workbench labels that exact target bounded deferred and advances the active queue to `yield-quality`; earlier inspection runs remain historical.

Current `inm-sim/0.92.0` Run `110-candidate-trial-run-105-normal-particle-suppress` instead leads with `device:furnace-1:material-input-shortage.starvationTicks = 38,856`. Exact focus prevents `inspection-supply-path` from claiming that contributor, and the broad commissioned Program is not an automatic fallback. Investigation `run-110-furnace-supply` records the run-qualified spatial boundary: deposition and furnace share a compact cell; the four-cell line delivered all twelve lots at 1.3% utilization with zero blocking, endpoint-capacity, endpoint-power, or failure loss; furnace and deposition utilization are 30.0% and 32.1%; and the installed five-second recovery controller already activates three times. Its exact `defer` closes only the redundant local transport/capacity branch. The queue advances to Probe-owned queue congestion, which likewise opens observation because the existing queue Program is explicitly qualified for `etch-1`, not `probe-1`.

The next active loss selects `layer-two-particle-control` because its explicit focus names `yield-quality`. Current Run `e23bc8366b5776ece95c2118ce4b080028048b5c5dd4bc7960e30a09aea9926e` reduces the exact origin contributor's `introducedDefectInstances` from `2` to `1` but retains the seed because at least one current-best case regresses.

Rank-three `queue-congestion` then selects focused Program `front-end-queue-convergence`, never the unrelated downstream burn-in rack. Run `3a053b523cb53b2dbcf2bf0ba375d23c8383452f3cb2db93da0a128829d090c6` binds `device:etch-1:process-queue-wait:dram-front-end:etch-cell-layer-1:etch-cell-layer-1.queueTicks`. Four release, input-queue cadence, cycle, and combined Candidates reduce the exact value from `21500` to as little as `18500`; two fail locked on-time service and two fail uniform zero current-best regression. The exhausted seed therefore becomes a third automatically expiring bounded disposition, and the active queue advances to maintenance while all three physical losses remain visible.

Rank-four `maintenance-qualification` selects focused Program `lithography-maintenance-convergence` after its contributor model identifies `lithography-1` plus observed provider `maintenance-service-1`. Run `d45f3aee3f971b689bad074b567646d3ac2f5cf51dc104def9c1dac146752a43` reduces `device:lithography-1:maintenance-qualification.totalTicks` from `34000` to `17000` with one seven-job cadence Candidate. It nevertheless regresses all five current-best cases, introduces one drift defect, and fails locked on-time service, so the exact target becomes a fourth bounded disposition. The active queue advances to `release-admission`; maintenance stays visible in the loss chain and Analysis contributor panel.

Rank-five `release-admission` selects `release-admission-convergence` only after the shared projection identifies `lot:dram-lot-07:release-admission`, release boundary `lot-release`, and Route `dram-front-end`. Run `4db7ed128bdda617f6bafada05042eb6a4286d51ff416db83d1934a0291c7168` changes only the CONWIP window from `6/5` to `7/6`. The Candidate removes the exact `63,623`-tick hold, but all five current-best cases regress and facility-interruption on-time lots fall from nine to eight. The exhausted seed becomes a fifth bounded disposition, and Workbench advances to rank-six `power-interruption`. The release loss remains visible because its controller wait is real; only the already-tested one-card hypothesis leaves the active queue.

Rank-six selects focused Program `shipping-power-convergence` from the exact leading endpoint `substrate-receiving-to-packaging-loader`, connection `substrate-receiving-to-packaging`, distributor Device `shipping-power`, and grid `grid-cleanroom-shipping-power`. Current Run `ad14ddede6941b6d0ecc96460f29e683ba6954301f6fd536b623ce19d9a28596` evaluates one second project-local wind turbine. It reduces the contributor from `163777` unpowered ticks to zero but crosses the Objective's hard build-cost ceiling (`231350 > 230000`), so all five locked cases reject it and the unchanged seed exhausts. The sixth bounded disposition advances the shared queue to rank-seven `setup-campaign`; Production-Plan-scheduled blank wafers and package substrates remain declared boundary supply and no longer reappear as nominal missing-producer warnings.

Execution-current Run `096-simulate` eventually advances the same queue past rank-eight `transport-blocking`. With all eight realized losses bounded and the Objective capacity plan still `READY`, conserved average WIP is `27.834429166666666` and contributes `-41.75164375`; burn-in package input averages `9.781316666666667`, packaging die input averages `7.965816666666667`, active burn-in programs hold `3.75` performance-mix and `1.25` commercial packaged devices, and active packaging holds `0.6` known-good die. Workbench opens exact locations as Device subjects and selects the Objective-focused `back-end-wip-convergence` Program. Current Design continuation `6a178e5e8c80d4dbcb40dbf81a8cfe27ef29159d2cdcde390740231009c80a14` proves its authored batch-size and release-wave candidates can reduce individual WIP locations, but locked service/interruption gates reject them. This is valid bounded design evidence, not permission to auto-apply a lower-WIP policy.

Current Design authority compares driver selection and exact execution hashes, not only Program and Benchmark identity. Changing selected plasma-etch operation or runtime makes old structurally valid evidence historical, while adding an unused qualified mode no longer displaces a current conclusion.

Every target already exists in the snapshot and carries exact CLI argv plus a Studio route. CLI returns the object unchanged and Studio renders it unchanged; neither surface chooses priority locally. Orientation never executes a Benchmark, creates a review receipt, mutates a Blueprint, or claims that a non-matching run proves the selected selection.

All remaining operation descriptors stay available under explicit progressive disclosure with their effect, scope, guards, and exact CLI reproduction. Recommendation identity is domain-derived and exposed semantically for browser-capable operators. The route-backed Design workbench applies the same Core evidence-authority projection: CLI and Studio expose current, commissioned, historical, and invalid evidence plus the same authority/action. Commissioned lineage is read-only and links to its verified Candidate; it cannot enter continuation, repeat promotion, compatible operating evidence, or bounded disposition. Score-only UI ranking cannot revive unrelated historical evidence.

## Source of truth

- Snapshot types, diagnostics, operations, and builder: `packages/inm-core/src/workbench.ts`
- Shared Design currentness, authority, and action projection: `packages/inm-core/src/design-evidence.ts`
- Candidate review receipts and decision reconstruction: `packages/inm-core/src/candidate-review.ts`
- Production evidence: `packages/inm-core/src/production-analysis.ts`
- Capacity evidence: `packages/inm-core/src/capacity-plan.ts`
- Compatible-run fab loss evidence: `packages/inm-core/src/fab-loss-analysis.ts`
- Observation brief: `packages/inm-core/src/observation.ts`
- Immutable Run delta and exact historical Workbench projection: `packages/inm-core/src/run-comparison.ts`, `packages/inm-core/src/workbench.ts`
- CLI projection: `packages/inm-cli/src/commands.ts`
- Studio API projection: `packages/inm-studio/src/server.ts`

## Verification

```bash
bun test packages/inm-core/src/workbench.test.ts
bun test packages/inm-cli/src/commands.test.ts
bun test packages/inm-studio/src/server.test.ts
bun run inm inspect examples/ironworks --section all --json
bun run inm inspect examples/memory-fab --section all --json
```

Tests must prove exact CLI `data.result`/Core and Studio/Core snapshot parity, exact `nextActions[0]`/Core next-action equality, deterministic diagnostic/action identity, strict bounded-disposition applicability and mismatch expiry, physical-diagnostic visibility with active-queue exclusion, diagnostic-aware Program selection, Candidate decision reconstruction across process reloads, memory-fab experiment/candidate discovery, empty-run read purity, and invalid explicit-selection rejection. A successful HTTP response or a visually similar summary is not parity evidence.

## Change checklist

- Add industrial conclusions to Core analysis or capacity planning before projecting them into the snapshot.
- Give every new diagnostic a namespaced code, typed subject, evidence source, priority, and valid operation references.
- Declare effect, write set, guards, and conditional availability for every new operation.
- Keep snapshot construction read-only and deterministic.
- Update CLI, Studio API, this document, and cross-surface parity tests together.

## Known next gaps

- Factory diagnostic overlays should eventually consume typed diagnostic subjects and highlight complete causal paths; they must not become a second prioritizer.
