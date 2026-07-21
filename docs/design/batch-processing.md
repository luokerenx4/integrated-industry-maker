# Identity-preserving batch processing

Status: fixed-size tracked-lot batches, full-batch start gating, per-job identity conservation, batch wait metrics, CLI/run/Studio observability, and Blueprint-selectable batch alternatives implemented through engine version `inm-sim/0.51.0`.

Related: [[docs/design/lot-tracking]], [[docs/design/material-contracts]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why a batch is industrial state

Many industrial tools do not process one unit whenever one unit arrives. A furnace, autoclave, kiln, wash chamber, or heat-treatment cell may wait for a carrier-sized group, occupy one shared capacity envelope for a fixed job, and release the complete group together. That wait is not logistics delay: it is a production-policy consequence at the equipment queue.

INM represents the first executable form of that constraint directly in a tracked Process. If one job consumes three Resources from a lot family and produces three Resources in the same family, the compiler and runtime treat it as one three-lot identity-preserving job. No hidden scheduler setting invents or resizes the batch.

## Compile-time contract

A fixed tracked-lot batch uses ordinary Process amounts:

```json
{
  "inputs": [{ "resource": "dielectric-stack-lot", "count": 3 }],
  "outputs": [{ "resource": "annealed-dielectric-stack-lot", "count": 3 }],
  "durationTicks": 12000
}
```

Both Resources declare the same lot family. Their effective input and output quantities must be equal after production-mode multipliers, and the bound input/output buffers must each fit one complete job. The normal recipe, port, filter, and connection checks remain authoritative.

Static analysis reports the required identity count and job duration. Nominal device rate remains jobs/minute; material rate multiplies jobs/minute by the Process amount.

## Runtime invariant

A batch operation is ready only when the complete input count is resident and the complete output count fits. When it starts, `policy.lotDispatch` deterministically selects exactly that many lot identities from the winning operation's input queue. The identities become one non-preemptive active job, share its processing interval, preserve their independent defect/due-date/history state, and are transformed into the output Resource together.

The event invariant is:

```text
one device.start
  lotIds.length = declared tracked input count
  → one fixed processing interval
  → the same lot ids queued at the declared output stage
```

An equipment failure applies the existing active-job disposition to every held lot. Partial completion and invisible fungible substitution are not allowed.

## Evaluation and debugging

`FactoryMetrics.batchFlow` includes only operations whose expected tracked-lot count is greater than one. It reports operation count, started jobs, held lots, actual average and maximum lots/job, and mean pre-start equipment-queue wait per lot. That wait includes both formation and equipment contention; it does not pretend to isolate a hidden causal component. Per-operation keys use `device:process:mode`.

The CLI simulation summary, locked benchmark case comparison, immutable run report, Blueprint comparison snapshot, and Studio Performance panel expose the same values. This makes the principal trade visible: a larger batch may offer better job-level capacity while making early arrivals wait for companions.

## Blueprint optimization surface

Batching is currently selected by Process binding. The memory-fab furnace qualifies two project-local Processes on the same physical Device:

- fixed batch anneal: three lots in, three lots out, twelve seconds/job;
- rapid anneal: one lot in, one lot out, six seconds/job.

The immutable baseline selects fixed batch anneal. The candidate Blueprint selects rapid anneal. The locked four-condition benchmark therefore evaluates formation delay, tool occupancy, downstream service, quality work, changeovers, energy, cost, and area together. It does not reward a batch size in isolation.

## Current boundary

The implemented contract is deliberately fixed and full-batch only. There is no authored minimum/maximum range, timeout release, partial batch, incompatible-product grouping rule, carrier identity, chamber slot model, overlapping load/process/unload phase, or dynamic lot release yet. Those should be added as explicit industrial state when a benchmark requires them, not inferred inside Device scripts.

## Verification

```bash
bun run inm validate examples/memory-fab
bun run inm analyze examples/memory-fab
bun run inm simulate examples/memory-fab --blueprint baseline
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run inm test examples/memory-fab
```
