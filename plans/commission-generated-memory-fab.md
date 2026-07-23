# Commission the generated memory fab

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], [[docs/design/blueprint-optimization]], [[docs/design/operator-workbench]], and [[docs/CLI]].

## Outcome

The accepted greenfield DRAM Design leader becomes an ordinary, self-contained, runnable project Blueprint through the exact Candidate review/apply boundary. A human or Agent can trace the commissioned factory back to immutable Design evidence, validate and capacity-plan it, simulate its production window, and see the same current handoff state in Studio and CLI.

## Context

The latest immutable continuation `d02580bc840c4eca68ba3c83acb77993a35805df4009f021fb73fb316102d500` retains candidate 7 as an accepted leader after candidate 8 regressed. Its best Blueprint is complete, capacity-ready, and robustly evaluated across five locked cases, but Design is intentionally evidence-only. The independent promotion target `blueprints/generated-dram-fab.blueprint.json` therefore remains an empty commissioning site and cannot compile against `production-window` until the accepted leader is promoted, reviewed, and explicitly applied.

This separation is correct, but the north-star build loop is not complete until ordinary project commands and the human workbench operate on the resulting factory rather than only on an in-memory Design seed or ignored run artifact.

## Scope

### In scope

- Promote the exact current Design leader into a project-local Candidate Change Set.
- Review it through the unchanged locked five-case Benchmark and apply only a hash-identical `KEEP` result.
- Preserve enough project-local provenance for CLI and Studio to reconstruct the commissioned Blueprint and Candidate state after process restart.
- Exercise the public `validate`, `plan`, `simulate`, and Benchmark loop on the materialized factory.
- Repair any human/Agent handoff or documentation gap exposed by commissioning.

### Out of scope

- Bypassing Candidate review by copying `best.blueprint.json` directly.
- Rewriting the synthesis strategy or weakening Benchmark/current-best gates.
- Treating the checked-in Design Run cache as the mutable factory source of truth.
- Compatibility behavior for the previous empty promotion target.

## Acceptance

- [x] Promotion creates an exact Candidate from the current empty target to the immutable accepted leader, without changing either source run.
- [x] Candidate review returns `KEEP`; apply re-evaluates it and writes exactly the reviewed proposed Blueprint hash.
- [x] The commissioned `generated-dram-fab` validates, is target-rate capacity READY, simulates `production-window`, and passes the unchanged five-case Benchmark.
- [x] CLI and Studio reconstruct the same verified Candidate/provenance state and expose honest next actions after commissioning.
- [x] Documentation explains the evidence-to-commissioning lifecycle and no longer implies that the empty target is already runnable.
- [x] Project fixtures, focused Core/CLI/Studio coverage, type checking, documentation checks, and full regression pass.

## Work

- [x] Audit the current Design leader, promotion target, Benchmark lock, and public handoff boundary.
- [x] Promote, review, and apply the accepted Design through public commands.
- [x] Repair and verify project-local provenance plus human/Agent projections.
- [x] Exercise the commissioned factory and update durable design documentation.
- [x] Run the completion audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-23 — `generated-dram-fab` is intentionally an empty independent promotion target, not a stale synthesis output. Running ordinary project commands against it before Candidate apply correctly fails because Scenario-owned releases and excursions reference equipment that has not been commissioned yet.
- 2026-07-23 — The Design artifact must cross the existing Candidate boundary. Directly copying its best Blueprint would erase reviewed base/proposed hashes and give humans and Agents a privileged path that the product explicitly forbids.
- 2026-07-23 — A greenfield Candidate's schema-valid base can be intentionally uncommissioned and therefore fail Scenario compilation. Candidate preview/apply now verifies the base hash, applies and schema-validates the exact patch, compiles the proposed Blueprint, and evaluates the Benchmark against that proposed operation context.
- 2026-07-23 — Design Run `d02580bc840c4eca68ba3c83acb77993a35805df4009f021fb73fb316102d500` promoted as `commissioned-greenfield-dram-fab`: proposal `a8345e35c82d2894a5b023f319bbc96fd6d8c729a6bbbfbccf00641ed1b5461e`, empty-base `28192fe068a455bcbca606c2b5c2832034b584bdb39ddb5a6cd615fc159021aa`, 74 patch operations, reviewed/applied Blueprint `2511191a2ddb542dce3d551ef539e278825a53362576d093cb1ff9381a8c9356`.
- 2026-07-23 — The unchanged five-case review returned `KEEP` at `+37.97159045039683`; every case improved and remained capacity-ready. The reviewed Candidate, immutable review receipt, and commissioned Blueprint are project-local checked-in authority even when the ignored Design Run cache is absent.
- 2026-07-23 — The commissioned `generated-dram-fab` is now the project default so ordinary CLI and Studio entry points open the north-star factory. `baseline` remains an explicit locked benchmark reference rather than the operator default.

## Verification

- Candidate receipt: all five locked cases capacity-ready; score deltas `+40.689506`, `+40.402277`, `+40.279650`, `+20.123824`, and `+43.623950`; aggregate `+37.971590`.
- Applied Blueprint hash: `2511191a2ddb542dce3d551ef539e278825a53362576d093cb1ff9381a8c9356`, identical to the immutable Design leader and reviewed proposed hash.
- Focused greenfield Core, CLI, and Studio promotion → preview → apply coverage passed while the promotion target was reset to an empty commissioning site.
- `bun run inm validate examples/memory-fab --json`: valid, 57 Devices, 16 connections, exact commissioned hash.
- `bun run inm plan examples/memory-fab --json`: target-rate capacity `READY`, zero gaps.
- `bun run inm simulate examples/memory-fab --json`: immutable `053-simulate`, score `-234.727395`, throughput `12/min`, portfolio fulfillment `96%`.
- `bun run inm benchmark examples/memory-fab --benchmark greenfield-dram-design --json`: `KEEP`, aggregate `+37.971590`, 2,400,000 simulated ticks.
- `bun run inm inspect examples/memory-fab --section candidates --json`: commissioned Candidate reconstructed as `verified` / `KEEP` with matching current/proposed hash after process restart.
- Browser QA: Candidate shows exact Design source and verified receipt; source navigation resolves to `d02580bc840c`; selected run shows `COMMISSIONING COMPLETE`, `CURRENT PROMOTION TARGET`, matching Candidate handoff, zero Continue/Promote controls, and no visible alert.
- `bun run docs:check`: 545 double-links resolve.
- `bun run typecheck`: Core, CLI, Studio, Ironworks assets, and memory-fab assets pass.
- `bun run test`: 191 tests, 1,737 assertions, 0 failures, followed by all eight Ironworks public project fixtures.

## Progress log

- 2026-07-23 — Activated after immutable continuation completed the bounded search but the accepted generated factory remained evidence-only.
- 2026-07-23 — Promoted the accepted continuation leader, repaired proposed-context Candidate evaluation, recorded a five-case `KEEP` receipt, atomically applied the reviewed hash, and made the commissioned factory the project default.
- 2026-07-23 — Verified the public industrial loop, restart-safe CLI state, honest post-commission Studio projection, full TypeScript/document checks, and complete serial regression.

## Completion

Commit `37bd73b` commissioned the accepted greenfield Design leader as the self-contained default memory factory through the exact Candidate review/apply boundary. It preserves checked-in Design provenance and immutable five-case review evidence, compiles greenfield proposals only after their complete patch is present, reconstructs the verified state through CLI and Studio, and replaces stale post-apply Design actions with an explicit commissioned state. The public factory validates, plans READY, simulates, and retains its locked Benchmark improvement. No commissioning follow-up remains inside this plan; future measured factory optimization must be scoped as a separately indexed plan.
