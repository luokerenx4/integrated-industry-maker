# Commission the accepted memory-fab release control

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/design-programs]], [[docs/design/wip-release-control]], [[docs/design/coding-agent-optimization]]

## Outcome

Commission the exact zero-regression `dispatch:conwip-9-6-edd` Design leader into the current memory fab through the shared Candidate boundary, then regenerate and inspect one compatible production run so humans and Agents see the same new operating state and remaining industrial loss chain.

## Context

Immutable continuation `c60062ee6a88707a3ae7610d06f6231fddc04781d2c4aaa3c7110e5e0d294f63` exhausted the current commissioned Design frontier after five evaluated candidates. Its iteration 2 changes only the Blueprint-owned lot-release controller from `8/5 EDD` to `9/6 EDD`, improves the leader aggregate by `+1.232673`, and passes the zero-regression guardrail in all five locked Benchmark cases. The next wider `10/7 EDD` alternative improves aggregate score but regresses `quality-excursion` by `-0.230799`, so it remains non-promotable evidence rather than a production change.

The accepted leader is still only immutable Design evidence. Until it is promoted, reviewed, explicitly applied, and followed by a compatible simulation, the factory shown to operators continues to run the older `8/5 EDD` policy.

## Scope

### In scope

- Promote the exact accepted leader as a project-local Candidate with immutable Design provenance.
- Preview and apply only the reviewed `KEEP` patch against the pinned current Blueprint hash.
- Generate one compatible production run and re-rank the resulting memory-fab loss chain.
- Verify CLI and Studio expose the same commissioned policy, current run, evidence state, and next industrial decision.
- Update durable design documentation when the commissioning result changes the current memory-fab truth.

### Out of scope

- Relaxing the five locked Benchmark cases or the current-best zero-regression guardrail.
- Commissioning the `10/7 EDD` branch or inventing a repair for its quality-excursion regression.
- Adding equipment, changing process recipes, or modifying evaluator physics in the same Candidate.
- Preserving compatibility with pre-alpha Blueprint revisions or stale Design promotion bases.

## Acceptance

- [x] `commissioned-release-control` preserves the two-operation promotion patch, receives an immutable `KEEP` review against all five locked cases, and applies only when the reviewed hashes match.
- [x] The current Blueprint contains `9/6 EDD`, validates, remains capacity-ready, and produces a compatible deterministic production run.
- [x] CLI and restarted Studio agree on the current Blueprint/run identities, applied Candidate provenance, controller settings, loss chain, and honest next action.
- [x] Focused Candidate/Design checks, full TypeScript and documentation checks, and the complete serial regression suite pass.

## Work

- [x] Audit the exhausted continuation, exact accepted patch, per-case deltas, and rejected wider-control boundary.
- [x] Promote, preview, and apply the accepted leader through the public Candidate workflow.
- [x] Simulate the commissioned Blueprint and inspect its human/Agent loss projections.
- [x] Update durable design truth and any fixtures exposed by the new current Blueprint/run.
- [x] Run focused, full, and visual acceptance; archive the plan with exact evidence.

## Findings and decisions

- 2026-07-24 — Iteration 2 changes only `/policies/lotRelease`: `8/5 EDD` becomes `9/6 EDD`, with `maximumReleaseDelayTicks` unchanged at 18,000.
- 2026-07-24 — The five leader-relative deltas are `+0.863614` steady production, `+0.417884` mixed quality, `+1.937604` quality excursion, `+1.635813` lithography interruption, and `+1.418305` facility interruption.
- 2026-07-24 — The later `10/7 EDD` branch is intentionally excluded from commissioning because its `quality-excursion` delta is `-0.230799` under the zero-regression policy.
- 2026-07-24 — Candidate `commissioned-release-control` and receipt `9ccae6b3df3178e9c2794ca06cb5270f6662a42d89b7d1bee02d5bc1bfe8e2e1` applied exact Blueprint `0bc0ef35709a69a92426608cdcdc6350cb109dc88f3caaad48f7e4f3f46a25e3`.
- 2026-07-24 — Compatible run `068-simulate` preserves all contract fulfillment, improves its mixed-quality score `+0.417884`, mean queue `16.53 → 15.57` seconds, and mean release delay `7.13 → 4.07` seconds. First-pass completion moves `9/12 → 8/12`; current-best zero regression is a case-score contract, not an implicit per-metric floor.
- 2026-07-24 — The exact compatible run is checked in as the default human/Agent operating record; other Run and Design Run caches remain disposable local search evidence.

## Verification

- `bun run inm candidate examples/memory-fab --candidate commissioned-release-control --json` — immutable proposal `9ccae6b3df31…` re-evaluated `KEEP` at `+118.759321` versus the locked baseline.
- `bun run inm candidate examples/memory-fab --candidate commissioned-release-control --apply --json` — exact reviewed hash applied Blueprint `0bc0ef35709a…`; the consumed base no longer authorizes another apply.
- `bun run inm validate examples/memory-fab --json` — valid, 62 Devices, 17 connections, exact commissioned Blueprint hash.
- `bun run inm plan examples/memory-fab --json` — capacity READY with zero gaps for all three contracts.
- `bun run inm simulate examples/memory-fab --json` — wrote deterministic compatible run `068-simulate`, result `639676d07336…`, score `-158.927522`, and 56 delivered devices.
- CLI human and JSON inspection — agree on `068-simulate`, `9/6 EDD`, three control-blocked lots, the five-bucket loss chain, two exact quality origins, and the read-only yield investigation action.
- Restarted Studio browser acceptance — shows Blueprint `0bc0ef3570`, evidence `068-simulate`, `maximum 9 / reopen 6 / 18000 ms / EDD`, Candidate `VERIFIED`, Design `COMMISSIONING COMPLETE`, and `3 VALID · 7 EXCLUDED`.
- `bun run test` — documentation and all TypeScript projects passed; 212 package tests with 1,806 assertions and all eight Ironworks project tests passed.
- `bun run docs:check` — all 639 documentation double-links resolve.
- `git diff --check` — passed.

## Progress log

- 2026-07-24 — Plan created and activated from immutable continuation evidence.
- 2026-07-24 — Candidate promotion, exact guarded apply, compatible run regeneration, durable documentation, current fixtures, Studio acceptance, and the complete serial suite passed; plan completed.

## Completion

The exact accepted `9/6 EDD` leader is now the commissioned memory-fab controller. Its immutable Design source, two-operation Candidate, `KEEP` receipt, applied Blueprint, and compatible `068-simulate` record reconstruct one shared human/Agent operating state. The controller lowers queue and release delay while preserving every case score and product contract; the newly explicit first-pass-yield trade continues as [[plans/explicit-industrial-outcome-guardrails]] rather than being hidden inside this completed commissioning plan.
