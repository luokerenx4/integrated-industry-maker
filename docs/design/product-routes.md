# Product routes

Status: explicit project-local product-route state machines, including terminating conversion operations, implemented in `inm-sim/0.66.0`.

Related: [[docs/design/lot-tracking]], [[docs/design/industrial-boundaries]], [[docs/design/work-center-dispatch]], [[docs/design/quality-flow]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Boundary

A Resource name describes the physical state currently carried by a lot. It is not permission to perform arbitrary work. A Route declares the evaluator-owned process sequence for one tracked product family. The Blueprint may place equipment, qualify Route-listed alternatives, and choose dispatch policies, but cannot invent, omit, or reorder process steps.

Routes live inside each self-contained project as `routes/<id>.route.json`. Every tracked Resource names exactly one Route. A Scenario may release a tracked lot only through that Route's entry Resource.

## State machine

Each Route has one entry step and one or more named steps. A step declares:

- one or more qualified Process ids;
- an optional evaluator-owned Q-time window and deterministic violation defects;
- every tracked Resource that those Processes can actually output;
- either the next step or a `complete` / `scrap` terminal for each tracked output; or no transitions when every operation explicitly terminates the tracked lot.

This is a graph rather than a flat list. The memory-fab Route uses a final-inspection rejection transition into rework, then returns to final inspection. Batch anneal and rapid anneal are alternative operations at the same step. Scrap is a terminal transition, while the pass branch continues into dicing/packaging; that Process explicitly completes the source wafer work order as it creates ordinary packaged devices.

The compiler rejects unknown or duplicated operations, missing output transitions, input Resources that cannot enter a step, unreachable steps, unknown next steps, family/Route mismatches, Routes without a complete terminal, tracked Processes not owned by a Route step, and intermediate-Resource Scenario releases.

## Runtime

Every WorkLot records its Route id, current step, visit counts, completed transition count, re-entrant transition count, and terminal disposition. Process readiness counts only identities whose current step allows that exact Process. A physically present but out-of-sequence lot therefore leaves the Device waiting for eligible input instead of being silently transformed.

Successful identity-preserving production resolves the actual tracked output, advances the same lot identities through the declared transition, and emits `lot.route-advanced`. Successful terminating production emits `lot.route-terminated`, completes or scraps the held ids, and leaves only untracked Process outputs downstream. Inspection rework and scrap decisions use the actual disposition Resource. Delivery is legal only after a `complete` terminal; discard is legal only after a `scrap` terminal.

## Q-time windows

Semiconductor work is often time-constrained between operations. A Route step may add:

```json
"queueTime": {
  "maximumTicks": 20000,
  "violationDefects": ["critical-dimension"]
}
```

The clock starts when the prior Process finishes and the lot enters this step, before output transport begins. It stops only when the next physical Device job actually starts, so transport, batching, setup campaigns, maintenance, power loss, failures, and equipment queues all consume the same process window. The entry-step clock starts at actual factory release. Equality is valid; only a start later than `maximumTicks` violates the contract.

A violation records the exact wait and fixed defect set on the lot before processing. An inspection step includes its own just-triggered Q-time defects when resolving pass/rework/scrap, so an overloaded metrology bay cannot hide behind a pass decision computed before the clock stops. Re-entry receives a fresh clock and visit-scoped violation identity.

`metrics.routeFlow` reports scheduled, complete, scrap and active lots, total transitions, re-entrant transitions, violated lots, and total Q-time violations. Every step exposes visits, starts, mean/maximum queue time, the fixed window, and violations. CLI simulation and Studio surface the same evaluator-owned values.

## DRAM abstraction

The checked-in `dram-front-end` Route intentionally models a small synthetic front-end slice, not a proprietary memory recipe. Its important industrial properties are explicit sequencing, qualified tool alternatives, batch versus single-lot thermal work, shared-tool re-entry, inspection branching, selective rework, terminal disposition, and Q-time loss. Dielectric stacks have a 20-second anneal window, annealed lots have a 45-second return-to-lithography window, and final inspection has a 35-second contamination window. The same state-machine shape can scale to hundreds of repeated mask, deposition, etch, implant, clean, metrology, and thermal steps without encoding sequence in ad-hoc Resource naming alone.
