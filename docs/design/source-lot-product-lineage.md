# Source-lot product lineage

Status: explicit opt-in source-lot ancestry, conserved runtime state, immutable evidence, CLI, Observation, and Studio projection implemented in `inm-sim/0.92.0`.

Related: [[docs/design/lot-derived-output]], [[docs/design/lot-tracking]], [[docs/design/inventory-accounting]], [[docs/design/simulation-runtime]], [[docs/design/industrial-investigations]], [[docs/PROJECT_FORMAT]], and [[docs/CLI]].

## Why fungible product still needs causal ancestry

A tracked wafer lot may intentionally end at Probe while creating discrete known-good dies. Those dies are fungible for routing and batching: they do not retain a Route position, due date, CONWIP card, quality-disposition authority, or individual serial number. Losing every connection to the source wafer, however, makes downstream evidence anonymous. A human or reasoning Agent can see eight packaged devices at burn-in but cannot tell whether they came from the latest wafer, an older delayed wafer, or a mixed batch.

Source-lot product lineage preserves that one causal fact without extending tracked-lot semantics past their authored boundary. It is evidence for observation and hypothesis formation, never automatic dispatch or optimization authority.

## Explicit Resource contract

A discrete Resource opts in with:

```json
{
  "id": "known-good-dram-die",
  "name": "Known-good DRAM die",
  "kind": "discrete",
  "lineage": { "kind": "source-lot" }
}
```

The contract is strict and has no compatibility inference. A lineage-bearing Resource:

- must be discrete;
- must not also be an identity-preserving tracked-lot Resource;
- must not be generator fuel;
- must be created by a lot-complete terminating Process, or by a downstream Process that consumes another valid lineage-bearing Resource;
- may not enter from World extraction, Scenario initial buffers, Production Plan material deliveries, or initial treatment inventory.

Compiler reachability starts only at an exact `lotTermination: { "terminal": "complete" }` output and advances through consuming downstream Processes to a fixed point. A producer cycle cannot establish provenance for itself. Unsupported anonymous supply fails compilation instead of acquiring an invented source id at runtime.

## Physical state contract

Every physical lineage-bearing quantity carries one or more batches:

```ts
interface SourceLotLineageBatch {
  sourceLotIds: string[];
  count: number;
  treatmentLevel: number;
}
```

`sourceLotIds` is non-empty, unique, and sorted. `count` is a positive integer. The sum of batch counts must exactly equal the corresponding Resource quantity at every resident Buffer, active material job, local transit, and station transit location. Lineage may not appear on a Resource that did not opt in.

Buffer mutation, job loading, departure, arrival, treatment, completion, failure, discard, and delivery move quantity and ancestry atomically through `mutateFactoryState()`. Removal selects exact treatment-qualified batches in deterministic resident order. No second shadow quantity ledger is allowed.

When a complete tracked lot creates a lineage-bearing output, its exact lot id seeds the output batch. A downstream job retains all exact input batches while active. Every lineage-bearing output from that job receives the sorted union of its input source-lot ids:

```text
lot-07 input + lot-08 input
  → output source set [lot-07, lot-08]
```

The union is deliberately conservative. Once a job commingles sources, INM does not invent which output unit came from which input unit. Treatment preserves the exact source set. A Process may change physical item count, so lineage conservation means no physical quantity loses or invents ancestry at a state transition; it does not claim one-to-one mass conservation across an authored transformation.

## Events and immutable metrics

`source-lot.created` records the exact lot-complete boundary. `source-lot.discarded` records terminal loss. Lineage-bearing `device.start`, `device.finish`, `resource.consumed`, and transit events carry their exact source batches. These fields make the event stream independently auditable and let replay preserve the same final state.

`FactoryMetrics.sourceLotLineage` contains:

- the complete observed source-lot id set;
- created, produced, delivered, discarded, and final-WIP totals;
- the number of downstream jobs that consumed a multi-lot source set;
- per exact source set, Resource-qualified created, produced, delivered, and discarded quantities;
- final physical locations across Buffer, active job, local transit phase, and station transit.

Created and delivered totals are useful boundary measures. Produced counts every successful lineage-bearing transformation and therefore intentionally counts the same ancestry at several process stages; it is not a conservation total.

Run reports and human CLI output summarize the exact final locations. JSON simulation, Workbench, and Observation retain the complete evaluator-owned object qualified by immutable Run id. Studio Factory exposes the same summary globally and the selected Device's exact final source-lot WIP. Neither surface reconstructs lineage from labels or Route lots.

`analyzeSourceLotServices()` is the separate deterministic chronology projection for questions that need time rather than only terminal ownership. For every qualified lineage-bearing Device input it joins the immutable event stream, evaluator metrics, and terminal state into:

- source creation plus first, full-batch, and last input arrival;
- exact Process/mode service start and finish plus queue time after full-batch readiness;
- first/last customer delivery and delivered units;
- terminal physical WIP plus unserved age at the Run boundary;
- the work center's ordered Process and changeover timeline, setup total, last finish, and remaining horizon.

The analysis payload owns an `analysisHash` and exact Run/result identity. Workbench V17 and Observation V5 retain the object, Observation identity includes its hash, `inm inspect --section source-lot-service --json` exposes it directly, and Studio renders that same object. It is derived evidence rather than a new Run artifact: changing the derivation changes the analysis hash without mutating the immutable source Run or its result hash.

## Memory-fab evidence

Run `105-simulate` is the first `inm-sim/0.92.0` immutable operating record with source-lot product lineage. All twelve wafer lots create `96` known-good dies; eleven source sets deliver `88` devices; nothing is discarded or commingled. The final eight `packaged-dram-device` units at `burn-in-1.package-input` all carry exact source set `[dram-lot-08]`.

The Burn-in service analysis `93b87b1949de…` makes the ordering reusable evidence. `dram-lot-08` is the last lot to complete Probe at tick `163879`, its eighth packaged device reaches burn-in at tick `205173`, and burn-in remains occupied by earlier source sets until lot-07 finishes at tick `235623`. The four-minute horizon then has only `4377` ticks left. Across the complete work-center timeline, eleven jobs follow `RRRCCCCCRRR`, with three changeovers and `14000` setup ticks. This disproves an anonymous “twelfth lot owns the tail” story and supplies a bounded service-capacity hypothesis; it does not by itself authorize adding equipment or choosing a schedule.

## Source of truth

- Resource schema and public types: `packages/inm-core/src/schema.ts`, `packages/inm-core/src/types.ts`
- Provenance compilation: `packages/inm-core/src/compiler.ts`
- Atomic physical mutation: `packages/inm-core/src/state.ts`
- Runtime transfer and audits: `packages/inm-core/src/simulator.ts`
- Immutable aggregation: `packages/inm-core/src/evaluator.ts`
- Derived service chronology: `packages/inm-core/src/source-lot-service.ts`
- Reports and observation surfaces: `packages/inm-core/src/artifacts.ts`, `packages/inm-core/src/observation.ts`, `packages/inm-core/src/workbench.ts`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "source-lot product lineage"
bun test packages/inm-core/src/source-lot-service.test.ts
bun run inm validate examples/memory-fab --json
bun run inm inspect examples/memory-fab --section source-lot-service --json
bun run inm simulate examples/memory-fab --seed 42 --json --section summary
bun run test
```
