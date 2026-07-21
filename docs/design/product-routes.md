# Product routes

Status: explicit project-local product-route state machines implemented in `inm-sim/0.57.0`.

Related: [[docs/design/lot-tracking]], [[docs/design/work-center-dispatch]], [[docs/design/quality-flow]], [[docs/design/coding-agent-optimization]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Boundary

A Resource name describes the physical state currently carried by a lot. It is not permission to perform arbitrary work. A Route declares the evaluator-owned process sequence for one tracked product family. The Blueprint may place equipment, qualify Route-listed alternatives, and choose dispatch policies, but cannot invent, omit, or reorder process steps.

Routes live inside each self-contained project as `routes/<id>.route.json`. Every tracked Resource names exactly one Route. A Scenario may release a tracked lot only through that Route's entry Resource.

## State machine

Each Route has one entry step and one or more named steps. A step declares:

- one or more qualified Process ids;
- every tracked Resource that those Processes can actually output;
- either the next step or a `complete` / `scrap` terminal for each output.

This is a graph rather than a flat list. The memory-fab Route uses a final-inspection rejection transition into rework, then returns to final inspection. Batch anneal and rapid anneal are alternative operations at the same step. Pass and scrap are terminal transitions.

The compiler rejects unknown or duplicated operations, missing output transitions, input Resources that cannot enter a step, unreachable steps, unknown next steps, family/Route mismatches, Routes without a complete terminal, tracked Processes not owned by a Route step, and intermediate-Resource Scenario releases.

## Runtime

Every WorkLot records its Route id, current step, visit counts, completed transition count, re-entrant transition count, and terminal disposition. Process readiness counts only identities whose current step allows that exact Process. A physically present but out-of-sequence lot therefore leaves the Device waiting for eligible input instead of being silently transformed.

Successful production resolves the actual tracked output, advances the same lot identities through the declared transition, and emits `lot.route-advanced`. Inspection rework and scrap decisions use the actual disposition Resource. Delivery is legal only after a `complete` terminal; discard is legal only after a `scrap` terminal.

`metrics.routeFlow` reports scheduled, complete, scrap and active lots, total transitions, re-entrant transitions, and visits/active lots per step. CLI simulation and Studio surface these evaluator-owned values.

## DRAM abstraction

The checked-in `dram-front-end` Route intentionally models a small synthetic front-end slice, not a proprietary memory recipe. Its important industrial properties are explicit sequencing, qualified tool alternatives, batch versus single-lot thermal work, shared-tool re-entry, inspection branching, selective rework, and terminal disposition. The same state-machine shape can scale to hundreds of repeated mask, deposition, etch, implant, clean, metrology, and thermal steps without encoding sequence in ad-hoc Resource naming alone.
