# Hand rejected Candidates back to industrial design

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/experiment-workbench]], [[docs/design/coding-agent-optimization]], [[docs/design/observation-led-design]], [[docs/design/agent-cli-contract]], and [[docs/CLI]].

## Outcome

A human or Agent can reopen a recorded Candidate decision without rerunning the Benchmark and receives one exact revision-or-retirement brief that preserves measured benefits, names current-factory regressions and locked blockers, identifies the authored patch surface, and returns to observation before another deliberate proposal.

## Context

The V2 current-factory comparison proves that memory-fab Candidate `back-end-wip-conwip-5-4` reduces WIP in all five cases but loses on-time service in steady production, lithography interruption, and facility interruption. Its public CLI envelope nevertheless returns `nextActions: []`, while project orientation moves to an unrelated yield-quality Program. The operation metadata contains only the generic sentence “revise or retire,” and an Agent must rerun all fifteen Candidate evaluation case waves merely to reopen dense evidence already stored in the immutable receipt.

The missing product concept is not an automatic repair algorithm. It is a deterministic handoff from evaluated counterexample to the next human/Agent design decision. The brief must be derived from evaluator-owned evidence, remain non-authoritative guidance, and never fabricate a revision.

## Scope

### In scope

- Derive a typed revision-or-retirement brief from the exact Candidate, locked result, and current-factory comparison.
- Preserve current-factory guardrail regressions, regressing cases, weighted Objective-component benefits/costs, locked reasons, and patch paths.
- Make recorded Candidate inspection read-only and cheap in CLI; keep re-evaluation an explicit `--review` operation.
- Project the same brief through CLI JSON/human output and Studio.
- Return a rejected Candidate to exact current-factory observation as the next executable step.
- Prove the memory-fab WIP counterexample produces an actionable brief without changing the Blueprint.

### Out of scope

- Automatically authoring a replacement patch or selecting a new policy value.
- Prioritizing every historical rejected Candidate over the project Workbench's current diagnostic queue.
- Persisting subjective human/Agent notes or an observation receipt.
- Compatibility aliases for the previous implicit-review CLI behavior.

## Acceptance

- [x] Core derives one deterministic brief for non-KEEP reviews and no revision brief for KEEP.
- [x] The memory-fab WIP brief names all three on-time guardrail regressions, the lithography-interruption score regression, WIP as a benefit to preserve, on-time delivery as a cost to remove, and both patch paths.
- [x] `inm candidate` reopens a recorded receipt without Benchmark progress or writes; `--review` explicitly evaluates and records.
- [x] CLI and Studio display the same brief and clearly retain human/Agent decision authority.
- [x] A non-KEEP CLI review returns exact `inm observe` argv instead of an empty next-action list.
- [x] Targeted tests and the complete repository boundary pass.

## Work

- [x] Reproduce the memory-fab rejected-Candidate handoff through public CLI and project inspection.
- [x] Add the Core revision brief and receipt reconstruction.
- [x] Split CLI inspection from explicit review and update capability discovery.
- [x] Add Studio revision handoff and cross-surface tests.
- [x] Update design documentation.
- [x] Verify the complete real memory-fab workflow and audit completion.

## Findings and decisions

- 2026-07-29 — Project orientation should not let an arbitrary historical rejection monopolize the global diagnostic queue. The revision handoff belongs to the explicitly selected Candidate surface.
- 2026-07-29 — Revision guidance is a deterministic projection of existing authority, not new industrial authority. It is therefore reconstructed from the receipt rather than included in its evidence hash.
- 2026-07-29 — The first executable step after rejection is exact current-factory observation. Candidate authoring remains a deliberate project-local file edit by a human or Agent.
- 2026-07-29 — Default CLI Candidate inspection now reconstructs a receipt in roughly `0.12s` on the checked-in WIP proposal and has no execution, progress, artifact, or write set. Explicit `--review` owns the expensive fifteen-wave evaluation.
- 2026-07-29 — Apply consumes the recorded KEEP hashes and performs one fresh guarded evaluation. The previous CLI path evaluated once to preview and again inside apply without adding authority.
- 2026-07-29 — Studio presents the revision brief only on the explicitly selected Candidate. Its current-factory link was browser-verified at `/memory-fab/factory`; no console errors were emitted.

## Verification

- `bun run check:fast` — 1109 documentation links, TypeScript, and 35 short tests passed.
- Targeted Core/CLI/Studio tests — 5 tests passed, including KEEP-null guidance, exact memory-fab revision contents, inspect-first CLI, and receipt-only Studio reconstruction.
- `bun run test` — 302 tests / 3271 expectations passed; all eight Ironworks project tests passed.
- Flagless `inm candidate ... --section revision --json` — completed in about `0.12s`, returned `execution: null`, no artifacts, the exact revision brief, and `candidate.observe-current`.
- Explicit `inm candidate ... --review --section revision --json` — 30 progress events completed, reused the immutable receipt, and produced the identical brief.
- Returned `inm observe` argv — reopened compatible Run `092-simulate` and its `/memory-fab/factory?run=092-simulate` visual route.
- Studio browser verification — the same three blockers, one regressing case, weighted preserve/remove components, and patch paths rendered legibly; `OBSERVE CURRENT FACTORY` navigated to `/memory-fab/factory`; no console errors.

## Progress log

- 2026-07-29 — Plan created after public CLI reproduced a complete rejection with no next action and an unnecessary full review rerun.
- 2026-07-29 — Core, inspect-first CLI, explicit review discovery, one-pass apply, Studio projection, targeted tests, and design documentation implemented.
- 2026-07-29 — Complete automated, public CLI, real memory-fab observation, and browser verification passed; acceptance audited and plan completed.

## Completion

Rejected Candidate review is now a reusable industrial counterexample rather than a slow dead end. Humans and Agents cheaply reopen recorded evidence, see exactly what the next hypothesis must preserve and repair, return to the current Factory, and retain full authority to revise or retire the proposal. No replacement policy is fabricated and the global Workbench queue remains independent.
