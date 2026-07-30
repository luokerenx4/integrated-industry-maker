# Industrial investigations

Status: V7 phase-aware Investigation Design Session over continuous factory-observation, source-pinned Candidate/Production-Plan authoring, and one-variable immutable Run-comparison checkpoints in Core, `inm`, Studio, and the memory-fab north-star fixture.

Related: [[docs/design/observation-led-design]], [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/design/experiment-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]], [[docs/design/project-boundaries]], [[docs/design/production-plans]], [[docs/design/source-lot-product-lineage]], [[plans/persistent-industrial-investigation-workspace]], [[plans/evidence-backed-metrology-standby-investigation]], [[plans/continuous-investigation-evidence]], [[plans/persistent-run-comparison-evidence]], and [[plans/production-plan-run-comparison-loop]].

## Purpose

An Investigation is the project-local reasoning record that connects exact industrial evidence to human or Agent judgment over time.

Operating Runs prove what the simulator observed. Design Runs prove what one bounded proposal portfolio evaluated. Candidate receipts prove what was reviewed and commissioned. An Investigation records why those artifacts were being examined together, which visible or typed fact motivated the inquiry, what hypothesis a human or reasoning Agent formed, and what decision should be resumed later.

It is not an optimizer, experiment runner, dense evidence cache, or substitute for a Run. It never claims that a hypothesis is true merely because it was written down.

## Storage boundary

Each Investigation is self-contained inside its owning project:

```text
investigations/
  <investigation-id>/
    manifest.json
    entries/
      0001-<entry-id>.entry.json
      0002-<entry-id>.entry.json
```

The manifest is created once and pins the question plus exact initial evidence anchors. Entries are append-only. One entry may introduce at most one Core-resolved Candidate-review, factory-observation, or Run-comparison anchor; that compact anchor becomes part of the entry's hashed content and is available to that entry and all later entries. An existing manifest or entry is never silently overwritten; revision occurs through another explicit entry.

Neither the workspace nor `.inm` owns Investigation data. Investigation files may be committed, copied with the project, and inspected without browser state or chat history. They reference immutable artifact identities rather than copying dense event, metric, Benchmark, or Candidate payloads.

## Authority and identity

Creation begins from the exact compiled project selection and shared Workbench snapshot. V1 requires one current compatible operating Run and one current diagnostic. The manifest pins:

- project id;
- World, Blueprint, Production Plan, Scenario, and Objective ids;
- selection-scoped engine, execution, Blueprint, World, Production Plan, Scenario, and Objective hashes;
- operating Run id and result hash;
- diagnostic id, code, summary, priority, subjects, loss bucket, and leading contributor when available;
- the Core-owned next action at creation;
- an exact commissioned Design/Candidate lineage when that next action is backed by one.

Inspection resolves each compact anchor against current authoritative project artifacts. An anchor is:

- `current` when every pinned identity still agrees;
- `historical` when the artifact remains valid but current selection, diagnostic, or authority moved;
- `missing` when its referenced artifact is absent;
- `invalid` when the referenced artifact exists but fails strict loading or identity verification.

The projection fails closed. It never substitutes a similarly named Run, diagnostic, Program, Candidate, Device, or connection.

A Candidate-review anchor pins the Candidate id, locked Benchmark, proposal hash, review-result hash, verdict, and reviewed current/proposed Blueprint hashes. It is `current` only while the strict receipt and authored proposal still reproduce those identities against the current candidate Blueprint. Replacing the proposal or moving the Blueprint makes the valid old review `historical`; deleting it makes the anchor `missing`; receipt or identity corruption makes it `invalid`.

A factory-observation anchor is one indivisible operating checkpoint. It pins the effective World/Blueprint/Production Plan/Scenario/Objective selection, all selection-scoped execution hashes, one compatible Run id/result hash, and the selected Run-backed diagnostic's exact code, severity, priority, prose, subjects, and loss contributor. Core derives every field from the current Workbench; callers provide only the new anchor id. It is current only while the exact selected execution, Run, and deterministic diagnostic still agree. After another factory revision it remains valid history rather than being rewritten.

A Run-comparison anchor is a compact, recomputable bridge between two immutable operating checkpoints. It pins the exact FROM and TO Run/result/Blueprint/Production-Plan identities, the typed controlled intervention and FROM/TO artifact ids/hashes, TO selection and execution hashes, deterministic comparison hash, and TO Run-backed diagnostic. The comparison hash commits the intervention-specific semantic patch, evaluator and capacity evidence, fab-loss changes, unchanged guardrails, and verdict while excluding local filesystem roots and presentation-only navigation. Core derives it only from `compareFactoryRuns`; callers provide an anchor id plus FROM/TO Run ids, never hashes, deltas, intervention kind, or a verdict. Inspection reopens both immutable Runs, verifies their strict exactly-one-variable compatibility and identities, recomputes the comparison and TO diagnostic, and fails closed on absent or corrupted evidence. The anchor is current only while its TO Run is the exact current selected factory; a rejected alternative remains exact history and may be followed by a Core-resolved current factory checkpoint.

A reviewed Investigation-sourced Candidate may supply that rejected alternative through an immutable `TRIAL` Run instead of a temporary editable Blueprint. Its manifest binds the Candidate proposal and review result/verdict to the source operating Run while its frozen Blueprint and patch preserve the actual intervention. A comparison to the parent can therefore become a historical Run-comparison anchor even when the Candidate is `DISCARD` and cannot be applied. The following decision may cite both that comparison and the exact Candidate-review anchor; neither artifact becomes current factory authority.

Investigation-level currentness follows the newest factory-observation or Run-comparison checkpoint, or the creation-time operating Run/diagnostic when no checkpoint exists. Earlier valid anchors may naturally become historical without making a newer exact inquiry historical. Any missing or invalid anchor still degrades the whole chain, because accumulated knowledge cannot silently discard broken evidence.

## Reasoning entries

Each entry has one stable kebab-case id, a positive sequence matching its filename, an author kind of `human` or `agent`, a non-empty statement, and zero or more evidence ids available at that sequence. Available evidence is the manifest anchor set plus anchors introduced by the current or preceding entries. The caller names a reviewed Candidate and new anchor id; Core resolves every pinned identity rather than accepting hashes or a verdict from CLI or Studio.

V1 entry kinds are:

- `observation`: a visible or typed fact noticed by the author;
- `hypothesis`: a falsifiable industrial proposal, explicit `blueprint` or `production-plan` controlled intervention, and its expected measured or visual effect;
- `decision`: an explicit `keep`, `revise`, `defer`, or `discard` judgment and rationale.

The engine validates references and order but does not assess the truth or quality of prose. Only an observation entry may introduce a factory-observation or Run-comparison checkpoint. Adding an entry creates a project artifact; it does not edit a Blueprint, run a simulation, evaluate a Benchmark, or commission a Candidate.

## Hypothesis intervention handoff

A hypothesis must name its intervention kind; Core and both authoring surfaces never infer it from prose. A `blueprint` hypothesis may source one exact Candidate through owning project, Investigation id and manifest hash, plus hypothesis entry id and entry hash. Core resolves that chain before creation, inspection, review, or apply. The Candidate's hypothesis and expected effect must exactly equal the pinned entry; a missing, corrupt, cross-project, non-hypothesis, text-mismatched, or `production-plan` source fails closed.

Source currentness comes from the newest factory-observation or Run-comparison anchor directly cited by that hypothesis. A factory observation projects its exact checkpoint. A Run comparison projects its TO selection, hashes, Run, result, diagnostic, anchor id, and explicit `run-comparison` source after both sides and the deterministic comparison identity re-verify. A hypothesis without such a citation deliberately falls back to the Investigation's creation context. Because the entry hash commits its previous-entry hash, this context remains transitively bound to the complete append-only chain without duplicating generated hashes in the Candidate file.

`createInvestigationCandidate()` accepts only a caller-authored RFC 6902 patch and ordinary Candidate name/id, Benchmark id, Investigation id, and hypothesis entry id. Core derives the source identity, prose, and current Benchmark Candidate-Blueprint base hash before validating and writing the new artifact. It does not invent the patch or decide whether the intervention is good.

A `production-plan` hypothesis instead yields an `author-production-plan` handoff with the exact hypothesis entry/hash and required plan id/file fields. `createInvestigationProductionPlanRevision()` accepts only the current hypothesis entry and one complete caller-authored plan. Core derives and writes both the selectable plan and `production-plan-revisions/<id>.revision.json`, which retains the exact control context, complete before/after plans, hashes, and semantic patch. Inspection re-verifies the receipt and result file every time. The author leaves the project default unchanged; Production Plans do not pass through Candidate create/review/apply because selection—not Blueprint mutation—is their experiment boundary.

## Phase-aware Design Session

Inspection derives one `IndustrialInvestigationHandoff` from the verified anchor states and latest append-only entry. This is a projection of the existing Investigation, not another stored session or draft:

- any missing or invalid anchor yields `repair-evidence` and permits no inherited factory claim;
- historical operating context or an empty reasoning log yields `observe-current-factory`;
- a current observation, or an explicit `revise` decision, yields `form-hypothesis`;
- a current `blueprint` hypothesis yields `author-candidate`;
- a current `production-plan` hypothesis without a receipt yields `author-production-plan`;
- a verified receipt without a compatible result Run yields `simulate-production-plan` with the exact result plan, unchanged selection, and control seed;
- a verified receipt with an exact one-variable result Run yields `compare-production-plan` and its control/result route;
- a completed keep, defer, or discard decision resumes the shared project Workbench action.

Every non-project handoff pins the source entry id, sequence, kind, and entry hash plus the exact evidence ids cited by that entry. It separately declares the authorship boundary and required caller fields. Core may select a form and preserve context, but it cannot supply an observation statement, hypothesis, intervention kind, expected effect, Candidate identity, Benchmark choice, patch, or Production Plan content.

`currentNextAction` is the handoff's navigational action, not a command that manufactures the required prose or patch. The `authorship` object is the machine-readable description of the next artifact boundary. This separation keeps route entry read-only while making the subsequent human/Agent responsibility explicit.

## Human and Agent surfaces

`inm investigate` and Studio project the same Core inspection result. Both show the question, pinned target, currentness of every manifest or introduced anchor, ordered reasoning entries, phase, source entry/hash, cited evidence ids, required authorship fields, and exact existing routes/argv for referenced evidence.

CLI is the primary structured surface for text-only Agents. Studio is the primary spatial surface for humans and browser-capable Agents. Studio may provide forms for explicit entry and Production Plan creation, but it cannot manufacture an observation, hypothesis, schedule change, or decision on the user's behalf.

`inm investigate --create-candidate` is the high-bandwidth authoring path. It consumes an Agent- or human-authored JSON patch file and returns the exact `inm candidate --review` next action without requiring generated hashes. After review, CLI exposes an exact return-to-Investigation action; `--attach-candidate` resolves the receipt, derives `<candidate>-review` when no anchor id is supplied, and adds that introduced evidence to the decision automatically. `--capture-observation <anchor-id>` is the post-change continuation boundary: it resolves the current factory checkpoint, adds it to the observation's evidence, and never starts a simulation or accepts a caller-authored hash. `--capture-comparison <anchor-id> --from-run <id> --to-run <id>` retains one already-observed immutable comparison under the same authorship and no-auto-decision boundary. The three evidence-introduction modes are mutually exclusive.

`inm investigate --create-production-plan <id> --hypothesis-entry <entry> --production-plan-file <file>` is the parallel text-only authoring path. It consumes a complete explicit plan, returns both the immutable revision and mutable selectable-plan artifacts, and advances the same Core handoff to exact simulation. Studio `GET|POST /api/projects/<project>/investigations/<id>/production-plan` exposes the verified draft and explicit create action; its structured editor and simulation action use that same receipt. Neither surface changes the default, automatically starts authoring, or chooses a disposition.

The stable Studio routes are `/<project>/investigations` and `/<project>/investigations/<id>`. The project-qualified API lists or creates at `GET|POST /api/projects/<project>/investigations`, inspects at `GET /api/projects/<project>/investigations/<id>`, appends at `POST /api/projects/<project>/investigations/<id>/entries`, and drafts/authors plan revisions at `GET|POST /api/projects/<project>/investigations/<id>/production-plan`. `inm session <path> --investigation <id>` repairs or reuses the source-current managed Studio and opens that exact phase-aware route without port knowledge. The Studio workbench uses Core's handoff to select the appropriate form and check only inherited evidence ids. A Run comparison returns to the exact source Investigation when its route carries `investigation=<id>`; the observation form pre-fills but never submits the comparison id or authored statement. Opening any route is read-only; only an explicit submitted create/append/simulate action changes state.

Candidate review shows the resolved Investigation name, exact hypothesis entry, hash, current/historical state, and inherited factory-observation anchor/Run. A recorded review can return to a stable query-qualified Investigation route that preselects decision kind, Candidate id, derived anchor id, and suggested disposition, but leaves author, entry id, and statement unowned and never submits. Once that exact review is already present in the hash chain, both surfaces show a completed state and suppress conflicting duplicate evidence prefill. Studio's observation form can likewise capture the current factory under an authored anchor id; Core fills the evidence payload only after explicit submission.

## Memory-fab north star

The first checked-in Investigation resumes the current inspection starvation inquiry. Its operating anchor is compatible Run `098-simulate`; its accumulated design anchor is commissioned Run `966127dd542de0b1…`, Candidate `inspection-supply-path-966127dd`, and that Candidate's verified KEEP receipt.

Its first observation binds the focused replay to typed evidence: `inspection-1` accumulated 190.2 seconds of input wait at 20.7% utilization; `etch-to-inspection` delivered 12 lots at 1.3% utilization with zero blocked item-ticks; and upstream `etch-l2` itself waited 164.0 seconds for input. That evidence contradicts another local line-capacity, buffer-capacity, or parallel-etch guess. The next physically distinct hypothesis was therefore a qualified low-power standby state for the continuous deep-metrology cell after a ten-second empty interval.

Candidate `metrology-low-power-standby` tested exactly that asset/policy change. Its strict review found a small `+0.031858992142857145` energy-component benefit, but every current-factory case acquired an approximately one-million-point constraint penalty and `facility-interruption` on-time lots fell from nine to seven. The Candidate was not applied. Entry `metrology-standby-rejected` introduces the exact DISCARD review anchor and preserves that negative industrial result beside the original observation.

The V2 end-to-end fixture repeats the proposal as `metrology-low-power-standby-sourced`, now with the exact Investigation-hypothesis identity embedded in the Candidate. Its 15 locked/current/proposed case evaluations complete through the bounded parallel runtime, reproduce the same `DISCARD` evidence, and entry `discard-sourced-metrology-standby` appends the new exact receipt using the derived `metrology-low-power-standby-sourced-review` anchor without copying a hash.

V3 entry `post-standby-constraint-boundary` introduces factory observation `post-standby-factory` from current Run `098-simulate` and its exact inspection-starvation diagnostic. Beside both retained DISCARD reviews it records the reusable design boundary: the incumbent factory is only `50` currency below the `230,000` maximum, both standby proposals add `200` and exceed it by `150`, and the interruption case also loses two on-time lots. Future metrology-energy hypotheses can cite this checkpoint and inherit the current factory identity instead of reopening or overwriting the Investigation's original evidence.

The same chain later commissions the east-port-compliant compact inspection/rework cell and retains immutable Run comparison `100-simulate → 101-simulate` as `compact-cell-run-comparison`. Its deterministic identity proves `+0.505000` score, `-100` build cost, `-10` occupied area, `-0.166667` seconds mean movement, and `-1.000` second inspection starvation while delivery, on-time service, good yield, scrap, and escapes remain unchanged. Entry `compact-cell-run-comparison-retained` explicitly records that the leading loss contributor moved from `etch-1` to `probe-1` as observed context, not an automatic next-intervention choice. A later hypothesis can cite this anchor and inherit exact Run `101-simulate` rather than reconstructing the comparison from prose.

V5 originally projected that state as `form-hypothesis`, sourced from entry `0021` / hash `b1c876c39bfa…`, with only `compact-inspection-rework-cell-east-port-review`, `compact-inspection-rework-cell-factory`, and `compact-cell-run-comparison` selected as inherited evidence. Entry `0022` now closes that inquiry with an explicit `defer`: the remaining `56.984 s` is dominated by ordinary upstream etch processing/cadence, while the only retained shared-cell vacuum handoff would raise build cost from `229840` to `230200` and exceed the fixed capital cap by `200`. The managed Session and Studio therefore project `resume-project` without hiding the still-valid physical diagnostic.

The separate `back-end-wip-next-step` Investigation preserves the human/Agent change of attention without rewriting diagnostic rank. Its Run `102-simulate` observation records `49.1905` average DRAM-device-equivalent WIP, led by `burn-in-1.package-input` at `9.465692` and `packaging-1.die-input` at `6.874125`. The same event evidence shows `96` packaging starts, eleven fixed-eight burn-in batches, `88` delivered devices, and a final eight packaged devices waiting at burn-in. It also cites the historical rejected `back-end-wip-conwip-5-4` review and names the fixed four-device Process portfolio as negative evidence.

Entry `0003` explicitly declares a `production-plan` hypothesis and creates the `author-production-plan` handoff. The separately selected eleven-lot plan becomes Run `103-simulate`; comparison `102-simulate → 103-simulate` proves score `+7.193077`, average WIP `-4.732567`, and unchanged 88 delivered devices, but also one fewer scheduled, released, completed, and on-time lot. Entries `0004` and `0005` retain that exact comparison and explicitly `DISCARD` the plan because it improves the horizon metric by deleting real planned memory production. Entry `0006` then captures Run `102-simulate` again as the current twelve-lot factory. The Investigation is current and ready for another human/Agent hypothesis that preserves planned supply; the higher score never became automatic design authority.

Entries `0007–0010` exercise the V7 revision session without reconstructing identity by hand. Hypothesis `compress-twelve-lot-cadence` authors receipt `409a4a81fb3e…` and complete plan `twelve-lot-five-second-cadence`, preserving all twelve lots and 96 substrates while changing their cadence from six to five seconds. The handoff discovers only exact seed-42 Run `104-simulate` and opens comparison `102 → 104`. That evidence keeps twelve completions and 88 deliveries but adds `0.5` average WIP equivalent, `1.25 s` mean cycle time, `51 s` accumulated CONWIP release blocking, and a `-0.791667` score delta. The explicit decision is `DISCARD`; entry `0010` then re-establishes Run `102-simulate` as the current factory. The accumulated boundary now excludes both deleting planned production and uniformly advancing every release as useful fixes for the fixed burn-in horizon.

The `inm-sim/0.92.0` ancestry contract in [[docs/design/source-lot-product-lineage]] deliberately changes execution identity, so the older `102 → 103` and `102 → 104` comparison anchors become invalid rather than being silently reinterpreted. Their files and decisions remain inspectable history, but a new claim may not inherit that degraded chain. Investigation `source-lot-back-end-service` therefore starts from current Run `105-simulate`. Entry `run-105-source-lot-tail` records that all eight final packaged devices are source set `[dram-lot-08]`: that lot completes Probe last at tick `163879`, reaches burn-in completely by `205173`, waits behind earlier source sets until tick `235623`, and cannot finish another screening cycle inside the remaining `4377` ticks. Hypothesis `parallel-burn-in-overflow` then requests one explicitly costed parallel rack and exact delivery, cost, area, energy, utilization, service, quality, and interruption guards. It does not commission equipment or revive the rejected global cadence and small-batch changes.
