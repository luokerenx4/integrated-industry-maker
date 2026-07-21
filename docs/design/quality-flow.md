# Identity-preserving quality flow

Status: deterministic process excursions, latent lot defects, inline inspection, selective rework, terminal scrap, quality metrics, and Blueprint benchmarking implemented in engine version `inm-sim/0.50.0`.

Related: [[docs/design/lot-tracking]], [[docs/design/material-contracts]], [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why quality is not another inventory count

A wafer lot can be physically present and still carry a latent process defect. That defect is not a separate fungible Resource and it does not disappear when the lot crosses a belt. Inspection reveals a disposition; rework may remove only specific defect classes; an unrepaired lot may be scrapped or escape downstream.

This mirrors the industrial role of inline inspection and yield management. KLA describes patterned-wafer inspection as feedback on fab processes and explicitly distinguishes defect-free, reworkable, and scrap categories. INM models that scheduling structure without claiming to reproduce a proprietary DRAM recipe or measurement algorithm.

## Fixed benchmark physics

Quality behavior belongs to fixed project inputs:

- `Scenario.qualityExcursions` names a Process, lot, and latent defect classes. An excursion is applied exactly once when that lot first completes that Process.
- `Process.quality.kind: inspection` declares detected defect classes, pass output, rework output, optional scrap output, and a rework-cycle limit.
- `Process.quality.kind: rework` declares the defect classes one successful cycle repairs.
- a Device with capability `discard` is a terminal material sink that marks tracked lots scrapped and never counts target delivery.
- Objective weights may penalize quality escapes and completed rework cycles.

No random draw occurs inside the simulator. The Scenario already owns the fixed workload, so named excursions make every candidate Blueprint replay the same quality challenge. This keeps benchmark scores comparable and makes an event-level result independently auditable.

The Blueprint remains the editable program. It may select standard or deep inspection recipes, duplicate inspection/rework equipment, alter topology and buffers, change lot dispatch, or rebalance power. It cannot edit which fixed lots experience excursions, what each inspector detects, or what a rework recipe repairs.

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

## Metrics and scoring

`FactoryMetrics.qualityFlow` reports:

- inspected lots and total inspections;
- pass, reject, and scrap dispositions;
- reworked lots and total rework cycles;
- defect-free and first-pass target completions;
- active latent defects and completed quality escapes;
- good yield and first-pass yield over released target-family lots.

Good yield counts defect-free target completions divided by releases. First-pass yield further requires zero rework cycles. A completed target lot with remaining latent defects is an escape: it still consumed real factory capacity and reached the delivery boundary, but `weights.qualityEscapes` can make that result unacceptable. `weights.rework` prices recovery effort independently from its natural cycle-time, WIP, energy, and capacity cost.

`inm simulate`, reports, `inm compare`, locked benchmarks, and Studio show the quality outcomes. `inm analyze` emits the selected inspection/rework envelopes and warns when a fixed Scenario defect class is not detectable by any selected inspection operation.

## Memory-fab evidence

The fixed memory-fab Scenario introduces three synthetic excursions after final etch:

- a critical-dimension defect that the rework recipe repairs;
- particle contamination that remains after one rework and is then scrapped;
- a latent electrical defect that standard optical inspection does not detect.

The baseline's standard inspection therefore delivers eleven of twelve lots, reworks two, scraps one, and records one quality escape. Changing one Blueprint recipe id to deep inspection detects the latent electrical defect. It produces fewer and later lots and scraps one more lot, but eliminates the escape; the locked Objective decides whether that quality improvement outweighs the throughput and service loss.

These values are synthetic test parameters. Their purpose is to make inspection coverage, rework capability, yield, and escape risk executable optimization dimensions.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "identity-preserving wafer lots"
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm test examples/memory-fab
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Tests prove fixed excursion application, identity preservation, pass/rework/scrap branching, selective repair, terminal discard, escaped-defect scoring, compiler rejection, and the standard-versus-deep inspection optimization path.
