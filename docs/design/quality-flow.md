# Identity-preserving quality flow

Status: deterministic authored process excursions, mode-level in-situ prevention, latent lot defects, inline inspection, selective rework, terminal scrap, quality metrics, and Blueprint benchmarking implemented through engine version `inm-sim/0.78.0`.

Related: [[docs/design/lot-tracking]], [[docs/design/lot-derived-output]], [[docs/design/material-contracts]], [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why quality is not another inventory count

A wafer lot can be physically present and still carry a latent process defect. That defect is not a separate fungible Resource and it does not disappear when the lot crosses a belt. Inspection reveals a disposition; rework may remove only specific defect classes; an unrepaired lot may be scrapped or escape downstream.

This mirrors the industrial role of inline inspection and yield management. KLA describes patterned-wafer inspection as feedback on fab processes and explicitly distinguishes defect-free, reworkable, and scrap categories. INM models that scheduling structure without claiming to reproduce a proprietary DRAM recipe or measurement algorithm.

## Fixed benchmark physics

Quality behavior belongs to fixed project inputs:

- `Scenario.qualityExcursions` names a Process, lot, and latent defect classes. An excursion is applied exactly once when that lot first completes that Process.
- `Device.production.modes[].preventsDefects` names exact fixed-excursion defect classes that the selected physical operating mode prevents while it executes that same challenged Process.
- `Process.quality.kind: inspection` declares detected defect classes, pass output, rework output, optional scrap output, and a rework-cycle limit.
- `Process.quality.kind: rework` declares the defect classes one successful cycle repairs.
- a Device with capability `discard` is a terminal material sink that marks tracked lots scrapped and never counts target delivery.
- Objective weights may penalize quality escapes and completed rework cycles.

No random draw occurs inside the simulator. The Scenario already owns the fixed workload, so named excursions make every candidate Blueprint replay the same quality challenge. This keeps benchmark scores comparable and makes an event-level result independently auditable.

The Blueprint remains the editable program. It may select standard or deep inspection recipes, duplicate inspection/rework equipment, alter topology and buffers, change lot dispatch, rebalance power, or buy an explicitly costed preventive equipment mode. It cannot edit which fixed lots experience excursions, what each inspector detects, or what a rework recipe repairs. Renaming or replacing the Process does not count as prevention: the Scenario challenge remains Process-scoped, and a valid intervention must execute that same Process.

When a challenged job completes, the immutable `lot.quality-excursion` event retains `authoredDefects` and partitions them into `preventedDefects` and residual `defects`. The excursion id is marked applied even when every defect is prevented, so replay cannot silently retry or erase the authored challenge.

## Runtime lifecycle

Every tracked `WorkLot` carries:

- sorted latent `defects`;
- applied excursion ids;
- inspection pass/reject/scrap counts;
- completed rework cycles.

Ordinary Process and transport operations preserve this state with the lot identity. On inspection start, the host selects one exact resident lot using the Device's normal `lotDispatch` policy and resolves the one physical output that fits its current quality state:

```text
no detected defect                         → declared pass Resource
detected defect, below rework-cycle limit → reject Resource
detected defect, limit reached            → scrap Resource
```

The disposition is held on the non-preemptive active job. Power interruption pauses it; equipment breakdown scraps the held lot under the existing active-job invariant. On successful completion the same lot identity arrives in exactly one output buffer and `lot.inspected` records the decision.

A rework job removes only its declared repairable defect classes and increments `reworkCycles`. Remaining defects stay latent. The lot can loop through physical transport and inspection again. A `discard` Device removes a queued scrap-disposition lot from its input buffer, marks it terminally scrapped, and emits `lot.scrapped` with reason `quality-rejection`.

## Compile-time invariants

An inspection Process must transform exactly one tracked lot input into one declared tracked pass output per job. Reject and scrap Resources must be distinct, exist in the same tracking family, and have explicit Blueprint output bindings. A configured rework limit requires a scrap Resource. The compiler also rejects duplicate excursion ids, unknown lots or Processes, duplicate defect classes, an excursion outside the lot family, and a Process that no placed Device is qualified to execute.

Pass, reject, and scrap are alternative outputs, not coproducts. Nominal production planning follows the declared pass path; event simulation is authoritative for actual yield loss and rework load.

Inspection disposition is also distinct from lot-derived quantity. A lot may pass inline inspection, retain an undetected latent defect, and later produce fewer fungible units at its terminating Probe Process. That Process uses fixed `lotOutputProfiles`; see [[docs/design/lot-derived-output]].

## Metrics and scoring

`FactoryMetrics.qualityFlow` reports:

- inspected lots and total inspections;
- pass, reject, and scrap dispositions;
- reworked lots and total rework cycles;
- defect-free and first-pass target completions;
- active latent defects and completed quality escapes;
- good yield and first-pass yield over released target-family lots.
- authored excursions and defect instances, prevented/applied instances, affected lots, and per-Device mode/class evidence.

Good yield counts defect-free target completions divided by releases. First-pass yield further requires zero rework cycles. A completed target lot with remaining latent defects is an escape: it still consumed real factory capacity and reached the delivery boundary, but `weights.qualityEscapes` can make that result unacceptable. `weights.rework` prices recovery effort independently from its natural cycle-time, WIP, energy, and capacity cost.

`inm simulate`, reports, `inm compare`, locked benchmarks, and Studio show the quality outcomes. `inm analyze` emits the selected inspection/rework envelopes and warns when a fixed Scenario defect class is not detectable by any selected inspection operation.

## Memory-fab evidence

The fixed memory-fab Scenario introduces three synthetic excursions after final etch:

- a critical-dimension defect that the rework recipe repairs;
- particle contamination that remains after one rework and is then scrapped;
- a latent electrical defect that standard optical inspection does not detect.

The baseline's standard inspection therefore delivers eleven of twelve lots, reworks two, scraps one, and records one quality escape. Changing one Blueprint recipe id to deep inspection detects the latent electrical defect. It produces fewer and later lots and scraps one more lot, but eliminates the escape; the locked Objective decides whether that quality improvement outweighs the throughput and service loss.

The commissioned factory demonstrates why inspection cannot be optimized in isolation. Historical run `057-simulate` recorded 12 inspected lots, 5 first-pass completions, 6 reworked lots, 2 scraps, and 8 equipment-drift defect instances. Immutable events attribute 6 of those instances to `etch-1` after its sixth job. Moving only its preventive-maintenance threshold earlier reduced drift but also delayed enough production to fail the locked cases. The accepted system line therefore added a routed layer-two etch bay, bounded preventive maintenance, and deep final-pattern inspection before later admission-control commissioning exposed final inspection itself as the next physical bottleneck.

Compatible run `068-simulate` recorded eight first-pass lots, four reworked lots, four scraps, and no escape. Two of those scraps originated from the fixed authored layer-two etch excursions; two more came from particle contamination introduced when returning lots exceeded the final-inspection Q-time during mandatory metrology service and qualification. A duplicate deep-inspection line removed that mechanism but exceeded both the capital and area constraints. The accepted alternative is the distinct project-local `continuous-deep-metrology-cell`: its longer physical qualification interval covers the complete initial and bounded re-inspection campaign, while its higher purchase and energy costs remain ordinary Objective inputs.

Candidate `continuous-deep-metrology` couples that asset replacement to `7/4 EDD` lot release rather than treating equipment capacity and admission as independent knobs. Its locked five-case review passes all six absolute outcome guardrails and every current-best case score. Compatible run `070-simulate` records nine first-pass lots, three reworked lots, two scraps, zero escapes, and zero Q-time violations. Both remaining scraps trace only to the fixed authored etch excursion: critical dimension is repaired on one lot, while particle contamination and latent electrical defects persist on two. These are separate facts: immutable simulation explains the physical defect provenance and disposition, while the Benchmark decides whether their combined delivery, timing, quality, power, facility, cost, and area consequences are acceptable.

The project catalog now makes the next physical choice explicit. `recover-final-pattern-advanced` repairs both critical dimension and particle contamination but never latent electrical damage, and only `advanced-pattern-recovery-cell` qualifies that Process. Selecting it with bounded `6/3 EDD` admission completes the particle-contaminated lot and leaves only the latent-electrical lot scrapped, raising good yield to `11/12` without escapes or Q-time violations. That local quality gain is not commissioning authority: Design Run `648dbe35b34b2fbe11a70766a73070f8cf55512da3e58cebdb0125e9db43dfc7` records four positive current-best case deltas but a `-0.429259` lithography-interruption delta. It retains the technology as a Pareto branch, creates no Candidate, and leaves the selected recovery line unchanged.

The commissioned `closed-loop-plasma-etch-bay` closes the remaining prevention gap without changing the challenged `etch-cell-layer-2` Process. Its `closed-loop-control` mode prevents only `latent-electrical`; critical-dimension and particle-contamination excursions remain applied and flow through the existing inspection/recovery system. The selected tool costs 50 more than the ordinary etch bay, draws 282 W during the mode instead of 280 W, and saves standby power. Against the exact current-best Blueprint, all five locked cases are non-regressing; the three challenged cases prevent one, two, and one defect instances and recover the same number of otherwise scrapped lots. Candidate `closed-loop-layer-two-etch` is the reviewed commissioning authority.

Compatible run `074-simulate` is the original closed-loop commissioned after state. It completes all twelve lots, delivers 96 devices, records ten first-pass and two reworked lots, and has zero scrap or quality escapes. The fixed Scenario still visibly authors three defect instances: the selected mode prevents the latent-electrical instance on `dram-lot-11`, while critical-dimension and particle-contamination remain applied to their original lots and are repaired by the existing recovery path. The resulting loss chain therefore ranks productive-equipment input starvation first and residual verified yield second instead of claiming that the authored challenge disappeared.

The same asset now advertises a distinct `particle-suppression` option. It preserves the challenged Process and cycle time, draws `13/10` of base active power, and prevents both particle contamination and latent electrical damage; it intentionally does not prevent critical-dimension defects. Project-local TypeScript research evaluates this and several stronger power/time envelopes against the current five-case factory. The least-costed option improves the weighted mean by `0.178083` and mixed-quality by `1.560012`, reducing that case from two rework cycles to one, but regresses steady production by `0.007050`, systematic quality by `0.159521`, lithography interruption by `1.541477`, and facility interruption by `0.005875`.

Design Run `5942a72740b993ddb9ff3324440b0d6130a0b16d0ff054e0b53605115e0268d9` therefore retains the exact one-operation switch only as an exhausted Pareto branch. It creates no Candidate and leaves `closed-loop-control` selected. Compatible run `081-simulate` refreshes catalog identity without claiming commissioning: it repeats the current 12/12 completion, 11 on-time lots, ten first-pass lots, two rework cycles, zero scrap/escape, and exact `3 authored / 1 prevented / 2 applied` quality record.

These values are synthetic test parameters. Their purpose is to make inspection coverage, rework capability, yield, and escape risk executable optimization dimensions.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Tests prove fixed excursion application, mode-level authored/prevented/applied partitioning, identity preservation, pass/rework/scrap branching, selective repair, terminal discard, escaped-defect scoring, compiler rejection, and the standard-versus-deep inspection optimization path.
