# Reusable production tooling

Status: finite provider inventory, spatial coverage, whole-job reservation, failure trapping, metrics, CLI/Studio projection, and memory-fab reticle modeling implemented.

Related: [[docs/design/material-contracts]], [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/usage-based-maintenance]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]].

## Industrial distinction

Production tooling is neither consumed material nor production equipment. A lithography reticle, mold, die, fixture, gauge, or calibrated test adapter is a finite physical asset required to execute a Process, but the successful Process returns the same asset instead of transforming it into output.

INM keeps those three categories separate:

- Process `inputs` are atomically consumed at job start.
- the placed production Device performs and owns the job;
- Process `tooling` is reserved from a placed provider for the complete physical job and then returned.

This prevents reusable assets from appearing as free recipe labels or as falsely consumed bill-of-material quantities.

## Project-local contract

A Process declares exact reusable tooling:

```json
{
  "id": "pattern-cell-layer-1",
  "inputs": [{ "resource": "blank-dram-wafer-lot", "count": 1 }],
  "outputs": [{ "resource": "patterned-cell-l1-lot", "count": 1 }],
  "tooling": [{ "resource": "reticle-mask-set-l1", "count": 1 }]
}
```

Each tooling Resource must be discrete, non-lot-tracked, unique inside `tooling`, and absent from the Process inputs and outputs. It remains a normal self-contained project Resource with its own unit, presentation, and hash.

A provider is a placed Device with finite inventory and local reach:

```json
{
  "capabilities": ["tooling"],
  "buffers": [{
    "id": "reticle-inventory",
    "role": "input",
    "capacity": 4,
    "accepts": ["reticle-mask-set-l1", "reticle-mask-set-l2"]
  }],
  "toolingProvider": {
    "serviceRadius": 16,
    "inventoryBuffer": "reticle-inventory"
  }
}
```

The inventory buffer is input-only so reserved tools cannot be dispatched as ordinary outbound cargo. Compilation resolves providers independently for every placed production Device and Process plan. At least one provider in the same industrial zone must cover the Device, accept every required Resource, and have capacity for the complete tool set. Candidate providers are ordered deterministically by distance and Device id.

The Scenario owns initial physical stock. Adding a provider without stocking it adds storage and coverage, not imaginary tools.

## Runtime semantics

- Material readiness and tooling readiness are measured independently. Resident process inputs may wait for a tool without being consumed.
- Immediately before production inputs are consumed, the runtime selects the first stocked provider and atomically reserves the complete tooling set.
- Reservation uses physical inventory minus all current reservations. Two Devices cannot use one tool concurrently merely because its Resource count remains visible in the provider buffer.
- The reservation begins at production start and remains through the complete power-scaled job. Power loss pauses work but does not return tooling.
- Successful completion returns the reservation and records a completed allocation. Tool Resource inventory never enters produced or consumed material totals.
- A production breakdown cancels the partial job but traps its tooling on the failed Device. Recovery returns it and records a cancelled allocation; another machine must wait in the meantime.
- Provider choice, acquisition, release, blocking, equipment occupancy, tool-unit occupancy, and wait are deterministic events and metrics.

`occupiedTicks` measures elapsed provider-to-equipment occupancy per production job. `unitTicks` multiplies that interval by each reserved count, so two fixtures held for ten seconds produce ten equipment-seconds and twenty tool-unit-seconds. Scenario-cutoff metrics include still-active or failure-trapped reservations.

## Memory-fab application

The synthetic [[examples/memory-fab]] project has distinct layer-1 and layer-2 reticle sets. One reticle stocker contains exactly one of each and covers the nearby lithography bays. Each patterning job reserves its matching set; the timed lithography interruption traps a reticle until recovery. The specialized candidate may run layer-1 and layer-2 lithography concurrently because they require different physical sets, while duplicate equipment for the same layer would contend for the single matching set.

This is intentionally an industrial abstraction rather than a proprietary recipe claim. Future layers may model tool cleaning, lifetime/cycle limits, inspection, refurbishment, transport time, qualification state, or Blueprint-authored initial provisioning. Those should extend the same conserved physical ownership model instead of turning tooling into a scalar speed bonus.

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "reusable production tooling"
bun run inm analyze examples/memory-fab --blueprint experiment
bun run inm simulate examples/memory-fab --blueprint baseline --scenario lithography-interruption
```
