# Add explicit adaptive cadence mode control

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/production-modes]], [[docs/design/work-center-dispatch]], [[docs/design/simulation-runtime]], and [[docs/PROJECT_FORMAT]].

## Outcome

A Device may explicitly switch between two qualified modes of the same production Process when its declared downstream lane is about to starve, while humans and Agents can inspect the exact control contract, selected modes, measured use, and locked memory-fab decision through the same Blueprint, metrics, CLI, and Studio surfaces.

## Context

The current model supports multiple Recipes per Device and multiple qualified production modes, but `recipeDispatch` ranks them statically. The commissioned memory fab therefore has only two coarse choices for ALD deposition: remain permanently qualified and leave recoverable input gaps at the batch furnace, or remain permanently `agile-pulse` and pay its power and steady/facility regressions even when downstream coverage is healthy.

That is not merely a proposal-portfolio gap. Industrial equipment commonly changes cadence in response to a bounded downstream condition while preserving the same material transformation. The control must be explicit, deterministic, non-preemptive, strictly validated, and observable by production mode; an opaque optimizer-only heuristic would make the factory harder for both people and Agents to trust.

## Scope

### In scope

- Add one strict Blueprint policy for downstream-starvation recovery between a normal and recovery mode of the same Process.
- Validate identical material work, an exact physical downstream Connection, an unambiguous output Resource, a positive coverage threshold, and the absence of conflicting static Recipe dispatch.
- Select the recovery mode only when resident plus in-flight downstream coverage is below the declared threshold, without interrupting active work.
- Add production mode to Device job events and shared cadence-control metrics.
- Expose the contract and measured normal/recovery job counts through CLI and Studio.
- Evaluate bounded ALD thresholds against the exact commissioned memory-fab Blueprint and locked five-case Benchmark; commission only through the guarded Candidate lifecycle.

### Out of scope

- General PLC scripting, arbitrary expressions, predictive control, feedback gains, or cross-Device orchestration.
- Changing modes during an active job.
- Inventing implicit Connections, Resources, buffers, or control targets.
- Weakening locked Benchmark cases, outcome guardrails, current-best regression limits, or Candidate review/apply boundaries.
- Preserving compatibility with pre-alpha Runs or Design artifacts whose engine or project hashes no longer match.

## Acceptance

- [x] Invalid or ambiguous cadence policies fail compilation with actionable diagnostics; a valid policy deterministically chooses exactly one normal or recovery Process plan from downstream resident plus in-flight coverage.
- [x] Production `device.start` and `device.finish` events identify the selected mode, and shared metrics count normal/recovery jobs per controlled Device.
- [x] CLI and Studio expose the same authored policy and measured mode use without requiring event-log reconstruction.
- [x] The commissioned memory fab evaluates a bounded ALD cadence-control sweep against the locked five-case Benchmark and changes only if a non-empty guarded Candidate is reviewed and applied.
- [x] Project validation, public inspect/plan/analyze/simulate/test loops, focused tests, full tests, browser verification, documentation, Git, and remote verification pass.

## Work

- [x] Audit existing Recipe/mode dispatch, ALD-to-furnace physical evidence, runtime coverage helpers, and production-mode observability.
- [x] Define and compile the strict cadence-control contract with negative and deterministic runtime tests.
- [x] Add mode-specific events, cadence metrics, CLI output, Studio inspection, and durable design documentation.
- [x] Add a TypeScript memory-fab research sweep and project-local Design proposal, then evaluate the locked frontier.
- [x] Regenerate only current compatible evidence required by changed semantics, complete public/full/browser verification, and audit acceptance.
- [x] Commit, push, and record final remote evidence.

## Findings and decisions

- 2026-07-24 — `recipeDispatch` currently ranks ready plans by authored order, duration, priority, setup, commercial value, or lot urgency; it has no downstream-dependent mode semantics.
- 2026-07-24 — `deposition-1` has one exact physical lane, `deposition-to-batch-furnace`, carrying `dielectric-stack-lot` into the furnace batch buffer. Its project-owned ALD asset already qualifies `qualified` at `1x` time/power and `agile-pulse` at `0.8x` time/`1.25x` power for identical material work.
- 2026-07-24 — The prior always-agile Candidate improved aggregate score but regressed steady and facility cases, so bounded starvation recovery is a materially different intervention rather than a relabeling of rejected evidence.
- 2026-07-24 — Coverage will mean items already resident in the declared destination buffer plus local or station transit explicitly destined for that same Device, buffer, and Resource; this matches existing shortage accounting and prevents duplicate recovery work.
- 2026-07-24 — The initial contract intentionally supports exactly two same-Process Recipes with identical material jobs and one unambiguous output Resource. Broader recipe choice remains owned by `recipeDispatch`.
- 2026-07-24 — The compiler rejects ambiguous outputs, mismatched material work, conflicting dispatch controls, nonexistent or incompatible downstream lanes, duplicate modes, and thresholds beyond destination capacity. Runtime selection is deterministic and non-preemptive.
- 2026-07-24 — Threshold `1` is the only swept controller that alternates in the mixed-quality case: `5` normal jobs and `7` recovery jobs. It improves the locked weighted score by `+0.960757`, but steady production regresses `-0.331053`; thresholds `2..6` collapse to always-agile behavior.
- 2026-07-24 — Final Design Run `0366b5e297454410088735df711d954c90386281ed6faf3b3453e03ef3ab12e9` retains the adaptive point as a non-promotable `BRANCH`. The live Blueprint remains on its qualified deposition mode and the exact frontier remains continuable.
- 2026-07-24 — Engine `inm-sim/0.79.0` intentionally invalidates pre-alpha evidence. Both projects' locked Benchmarks and checked-in Ironworks demonstration Runs were regenerated rather than compatibility-shimmed.

## Verification

- `bun run inm validate examples/memory-fab --json` — valid Blueprint; 62 Devices and 17 physical Connections.
- `bun run inm analyze examples/memory-fab --json --section summary` and `bun run inm plan examples/memory-fab --json` — public analysis succeeds; capacity remains READY with zero plan gaps.
- `bun run inm simulate examples/memory-fab --json --section summary` — immutable `076-simulate`, score `28.748269`, result hash `4d7bb0caa58c136c62c956d8594234d0b033592de98a0e5a8d55a29f71f99042`.
- `bun run inm inspect examples/memory-fab --json --section next-action` — current Design authority is `0366b5e29745…`, state `continuable`, with exact Studio deep link and read-only review action.
- `bun run inm test examples/memory-fab` — both project tests pass.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts --max-concurrency=1` — 12 pass.
- `bun test packages/inm-cli/src/commands.test.ts -t "continuable memory-fab Design authority|adaptive cadence policy use" --max-concurrency=1` — 2 pass.
- `bun run test` — documentation and typecheck pass; 232 package tests / 1924 expectations pass; all eight Ironworks project tests pass.
- Studio browser verification — `/` project selection, `/memory-fab`, `/memory-fab/factory`, and the exact `0366b5e29745…` Design route load without console errors; Overview selects current Run `076-simulate`, Factory renders the replay, and Design exposes the adaptive `BRANCH` plus Continue control.
- `git diff --check` — clean.

## Progress log

- 2026-07-24 — Plan activated after the current commissioned Design frontier exhausted its static intervention portfolio.
- 2026-07-24 — Domain audit confirmed the missing control boundary and the need for mode-specific event and metric observability.
- 2026-07-24 — Core, CLI, Studio, TypeScript research, locked evidence, and strict pre-alpha regeneration completed under engine `inm-sim/0.79.0`.
- 2026-07-24 — Full public, package, project, and browser loops passed; the guarded negative industrial result was preserved instead of silently mutating the factory.

## Completion

Explicit adaptive cadence is now one shared industrial contract rather than an optimizer-only heuristic. A Device can switch between two qualified modes only at job boundaries based on one exact downstream lane's resident plus in-flight coverage; events and metrics make every choice inspectable. The commissioned memory-fab sweep proves the controller is useful but not promotion-safe under the zero-regression frontier, so the current Blueprint remains unchanged while the retained branch and exact blocker remain available to both CLI Agents and Studio operators.
