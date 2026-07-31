# Investigation diagnostic disposition

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/operator-workbench]], [[docs/design/observation-led-design]], and [[docs/design/agent-cli-contract]].

## Outcome

Let one explicit human/Agent Investigation decision disposition the exact current diagnostic it cites, so a verified `defer` or `discard` advances the shared Workbench queue instead of repeatedly reopening a physically bounded branch; any changed Run, execution identity, or diagnostic automatically restores that branch.

## Context

Run `105-simulate` still ranks inspection input starvation first and Workbench recommends the aligned `inspection-supply-path` Program. The historical `inspection-starvation-next-step` Investigation already explains why another inspection intervention was deferred, but its final checkpoint belongs to engine `0.90.0` and its Run `100 → 101` comparison no longer verifies under engine `0.92.0`. The strict `repair-evidence` result is correct: prose from an invalid historical chain must not suppress current work.

The missing contract is a way to make a new, current, explicitly targeted decision authoritative outside the Candidate-only disposition path. A decision currently names evidence but not which evidence subject it disposes, so Workbench cannot safely infer whether `defer` applies to a diagnostic, Candidate, comparison, or broader question.

## Scope

### In scope

- Add an optional explicit diagnostic target to an Investigation decision.
- Require the target to name one cited diagnostic-bearing evidence anchor available at that sequence.
- Resolve only decisions whose exact selection, execution hashes, Run/result, diagnostic prose, subjects, and loss contributor still match the current Workbench snapshot.
- Project current diagnostic dispositions through Core, CLI, and Studio.
- Suppress `defer`/`discard` diagnostics from the active Workbench queue; route `revise` back to the owning Investigation; retain `keep` as visible evidence without suppressing the diagnostic.
- Re-establish the current inspection boundary against Run `105` and prove the next action advances to the next undispositioned current physical loss.

### Out of scope

- Treating historical or invalid evidence as current.
- Inferring a decision target from prose or from arbitrary cited evidence.
- Rewriting old append-only Investigation entries or weakening their hashes.
- Automatically choosing an industrial disposition from score or diagnostic rank.

## Acceptance

- [x] Decision authoring validates one explicit diagnostic evidence target identically in Core, CLI, and Studio.
- [x] Workbench projects exact current Investigation dispositions and invalidates them on changed identity.
- [x] CLI and Studio show why a diagnostic left or re-entered the active queue.
- [x] A new Run-105 checkpoint records the inspection defer boundary and advances shared next action to the next undispositioned current physical loss.
- [x] Documentation and full repository verification agree with the final contract.

## Work

- [x] Audit the stale Workbench handoff and historical Investigation identity.
- [x] Implement targeted decision schema, validation, and currentness resolution.
- [x] Integrate Workbench next-action, CLI, and Studio projections.
- [x] Create the current memory-fab checkpoint and explicit diagnostic disposition.
- [x] Verify invalidation, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-31 — The old inspection defer is not reusable authority: its comparison anchor is invalid under the current engine. Strict identity remains non-negotiable.
- 2026-07-31 — Evidence citation alone is intentionally insufficient. Candidate decisions often cite factory observations while deciding only a Candidate; inferring a diagnostic disposition from those citations would silently broaden the author's judgment.
- 2026-07-31 — `defer` and `discard` remove a still-measured diagnostic from the active queue only while exact currentness holds. `revise` keeps the problem active but hands it back to the named Investigation. `keep` remains visible context and does not claim the measured loss is resolved.
- 2026-07-31 — The original assumption that one new inspection defer would reveal Objective WIP was false. All seven other historical Design dispositions also lost authority under the current execution identity. Exact evidence correctly advances Run `105` to `yield-quality` / `layer-two-particle-control`; each remaining physical branch must be requalified before Objective WIP may own the shared next action.

## Verification

- `bun run docs:check` — `1396` documentation links resolve.
- `bun run typecheck` — Core, CLI, Studio, and both example asset projects pass.
- `bun test --max-concurrency=1 packages/inm-core packages/inm-cli packages/inm-studio` — `353` pass, `0` fail.
- Final targeted rerun after conflict/supersession hardening: `bun test packages/inm-core/src/investigation.test.ts packages/inm-core/src/workbench.test.ts packages/inm-core/src/observation.test.ts` — `22` pass, `0` fail.
- `bun run inm test examples/ironworks` — all `8` project fixtures pass.
- `bun run inm validate examples/memory-fab` — current `62`-Device, `17`-connection project compiles.
- `bun run inm inspect examples/memory-fab --section dispositions --json` — projects one current Run-105 `defer` with `queueEffect: suppressed`; the exact next action is `layer-two-particle-control` for `fab-loss.yield-quality`.

## Progress log

- 2026-07-31 — Plan opened from the mismatch between current Workbench guidance and the invalid-but-informative historical inspection boundary.
- 2026-07-31 — Added explicit diagnostic targets, exact currentness resolution, shared CLI/Studio projections, and checked-in Run-105 inspection evidence. The authoritative queue now advances to the current quality branch without erasing the measured inspection loss.
- 2026-07-31 — Full repository verification passed. Follow-up current-loss requalification is recorded separately in [[plans/run-105-loss-requalification]] rather than left as unchecked work here.

## Completion

Completed. Core, CLI, and Studio now share one exact Investigation diagnostic-decision contract; the checked-in memory-fab decision is current, automatically expiring, and advances only to the next evidence-qualified physical branch.
