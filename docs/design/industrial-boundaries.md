# Purchased-material and tracked-lot boundaries

Status: scheduled untracked material deliveries, explicit tracked-lot Process termination, multi-product delivery contracts, and contract-aware recipe dispatch are implemented in `inm-sim/0.67.0`.

Related: [[docs/design/material-contracts]], [[docs/design/lot-tracking]], [[docs/design/product-routes]], [[docs/design/fab-capacity-planning]], [[docs/design/simulation-runtime]], [[examples/memory-fab]], [[docs/PROJECT_FORMAT]].

## Why these are separate boundaries

An industrial model has three identities that must not be flattened into one Resource count: purchased material arriving from outside the modeled plant; an identity-preserving work order or wafer lot moving through controlled operations; and fungible sellable units produced when that work order is split, assembled, or otherwise converted.

The DRAM example makes the distinction concrete. Package substrates are purchased inbound material. A wafer lot retains one stable id through front-end processing, inspection, and rework. Dicing and packaging consumes one qualified lot and eight substrates, ends that wafer work order, and creates eight ordinary packaged devices. Alternate final-test programs then create commercial, performance-bin, and automotive-screened products. Customer delivery operates on device counts rather than pretending that one wafer lot is one memory device.

## Scheduled purchased material

`Scenario.materialDeliveries` declares immutable external arrivals of untracked Resources. Every delivery names a stable id, a placed receiving Device and buffer, a Resource, positive count, and planned `releaseTick`. Compilation requires an untracked Resource, a compatible real buffer, and an atomic shipment no larger than that buffer's total and per-Resource capacity.

At runtime a due delivery waits outside the plant until its receiving buffer has room, then enters atomically and emits `material.delivered` with planned/actual time and delay. It is not initial inventory and does not bypass physical outbound transport. Target-rate planning credits the total scheduled quantity as external supply over the Scenario horizon; the receiving-to-process connection must still carry the required rate.

## Explicit lot termination

A Process may declare:

```json
"lotTermination": { "terminal": "complete" }
```

Such a Process must consume exactly one tracked Resource kind and produce no tracked Resource. Ordinary untracked inputs and outputs remain allowed. It cannot also be an inspection or rework Process. Its owning Route step has no Resource transition: successful completion explicitly ends each held source lot as `complete` or `scrap`, emits `lot.route-terminated`, and leaves only the declared fungible outputs in downstream buffers.

This is a conservation boundary, not an implicit sink. The simulator holds the exact lot ids on the active equipment job, includes their final packaging work in process/cycle time, applies failure semantics while they are resident, and only terminates them after the ordinary outputs fit and the physical job completes.

## Product throughput plus work-order service

An Objective may target an untracked finished Resource while declaring `trackedFamily`. Target production, throughput, and regional delivery count the finished Resource. Completion, yield, due-date, cycle-time, tardiness, and WIP terms use Route-terminal lots from the selected family. This keeps the score dimensionally honest: eight DRAM devices contribute eight delivered units, while their source wafer contributes one completed work order.

`deliveryContracts` adds a frozen product portfolio. Every contract owns one fungible Resource, delivery region, demand rate, unit value, shortfall penalty, and optional hard minimum fulfillment. Demand is a service floor: every delivered unit earns product value, units below demand additionally avoid their shortage penalty, and above-demand output remains valuable while being reported separately. The target-rate planner solves all demand floors together, so coproducts from one test program satisfy sibling demands exactly once. See [[docs/design/delivery-contracts]].

A Blueprint work center may select `recipeDispatch: "contract-value"`. The runtime ranks ready recipes by marginal contract value per equipment-time, accounting for product already delivered, buffered, in transit, or committed by active work. Below demand, marginal value includes avoided shortage penalty; above demand it retains product value, so scarce-product equipment does not stop at quota. Because the contracts and value function remain outside the Blueprint, a Coding Agent can optimize the policy without editing its own exam.

## Memory-fab reference contract

The project-local `examples/memory-fab` line is now end-to-end:

```text
scheduled blank wafer lots → re-entrant front end → inspection/rework
scheduled package substrates ───────────────────────┐
qualified wafer lot + 8 substrates → dice/package ─┴→ 8 packaged devices
8 packaged devices → commercial screen ───────────→ 8 commercial devices
8 packaged devices → extended burn-in/speed bin ─→ 2 commercial + 4 performance + 2 automotive devices
three fixed customer contracts → all-delivery product value − shortfall penalty
```

The values are synthetic benchmark parameters, not a proprietary DRAM process recipe. The structural sequence follows Micron's public [Introduction to Memory Packaging](https://www.micron.com/content/dam/micron/educatorhub/intro-to-memory-packaging/micron-intro-to-memory-packaging-presentation.pdf): wafer fabrication, wafer probe/binning, packaging of good die, and final test/burn-in.

## Verification

```bash
bun run inm validate examples/memory-fab
bun run inm plan examples/memory-fab --objective dram-output
bun run inm simulate examples/memory-fab --scenario production-window
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```
