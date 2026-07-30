# Persistent Run comparison evidence

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/blueprint-comparison]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], and [[docs/design/studio-debugger]].

## Outcome

Let a human or Agent retain one exact immutable Run comparison inside an append-only Industrial Investigation, reason and decide against that evidence later, and reopen or re-verify both sides without depending on chat history, browser state, copied prose, or current Blueprint substitution.

## Context

The shared Run comparison contract now explains exact `100-simulate → 101-simulate` semantic, spatial, metric, guardrail, and fab-loss changes through Core, CLI, and Studio. It is deterministic and read-only, but the result currently disappears from the project reasoning chain when the page or terminal closes.

Industrial Investigations already preserve operating Runs, diagnostics, Candidate reviews, factory observations, hypotheses, and decisions as strict compact anchors plus an append-only hash chain. A Run comparison is the missing bridge between “the intervention changed these exact things” and “we retained this interpretation or decision.” Copying the comparison prose into an entry would lose machine-verifiable identity; storing the dense comparison would duplicate Run evidence. The Investigation therefore needs a compact comparison anchor that can be recomputed from the two immutable Runs and that treats the TO Run as the operating context for a cited follow-up hypothesis.

## Scope

### In scope

- Add one strict `run-comparison` Investigation anchor containing exact FROM/TO Run, result, Blueprint, selected execution, diagnostic, and comparison identities.
- Derive the anchor only through Core `compareFactoryRuns`; callers provide an anchor id and two Run ids, never hashes, verdicts, or deltas.
- Recompute the comparison when inspecting an Investigation and classify exact current, historical, missing, or invalid evidence without substituting another Run.
- Let a cited Run-comparison anchor provide the exact TO operating context to a later Investigation hypothesis and Candidate source.
- Add explicit CLI and Studio capture flows plus stable navigation back to the comparison.
- Exercise `100-simulate → 101-simulate` as the north-star fixture.

### Out of scope

- Automatically writing an Investigation when a comparison is opened.
- Generating an interpretation, hypothesis, Candidate patch, or decision from the comparison.
- Copying the dense comparison payload into the Investigation.
- Ranking the next intervention or replacing locked Candidate/Benchmark judgment.
- Keeping compatibility with pre-release Investigation schemas.

## Acceptance

- [x] One explicit entry can introduce an exact Run-comparison anchor; its hash chain commits both immutable sides and the deterministic comparison identity.
- [x] Reopening the Investigation recomputes the comparison, fails closed on absent or corrupted Run evidence, and distinguishes current TO context from valid historical evidence.
- [x] A hypothesis citing the anchor carries the TO Run, selection, hashes, diagnostic, and comparison source into Candidate provenance.
- [x] CLI and Studio expose equivalent capture, inspection, and navigation without auto-submitting human/Agent judgment.
- [x] The real memory-fab `100-simulate → 101-simulate` flow, focused tests, documentation, browser QA, and full repository checkpoint pass.

## Work

- [x] Audit the existing comparison, Investigation anchor, currentness, Candidate-source, CLI, API, and Studio contracts.
- [x] Implement the strict Core comparison identity and Investigation anchor.
- [x] Extend Candidate provenance and public CLI capture/inspection.
- [x] Add Studio comparison-to-Investigation handoff, form controls, and evidence presentation.
- [x] Verify the real memory-fab chain, update lasting contracts, and complete the acceptance audit.

## Findings and decisions

- 2026-07-30 — The anchor must reference and recompute dense Run evidence, not duplicate it. Its comparison hash excludes local filesystem roots and presentation-only navigation while committing semantic/spatial changes, evaluator/capacity evidence, loss transitions, and verdict.
- 2026-07-30 — The TO Run is the comparison's operating checkpoint. A hypothesis that explicitly cites the comparison must inherit TO selection and execution identity rather than silently falling back to Investigation creation context.
- 2026-07-30 — Capturing comparison evidence is explicit authorship and creates one Investigation entry; merely opening the Runs page remains read-only.

## Verification

- `bun test packages/inm-core/src/run-comparison.test.ts packages/inm-core/src/investigation-run-comparison.test.ts`
  - Passed: 3 tests, 36 expectations.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'investigate captures one exact immutable Run comparison|public investigate'`
  - Passed: 2 tests, 49 expectations.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern 'shared immutable Run comparison'`
  - Passed: 1 test, 16 expectations.
- `bun run docs:check`
  - Passed: 1,258 double-links.
- `bun run check:fast`
  - Passed after adding both Run-comparison identity tests to the ordinary fast gate.
- `bun run test`
  - Passed: 335 tests, 4,177 expectations, plus all eight Ironworks scenario fixtures.
- Real memory-fab CLI:
  - Entry `0021-compact-cell-run-comparison-retained` introduced current anchor `compact-cell-run-comparison`.
  - Anchor hash `aa7ccfd4d88d0f10d7b1f6366c45de0b1cec220caa872c317308d10c71fcb846` recomputed from `100-simulate → 101-simulate`.
- Browser QA at `http://127.0.0.1:4176`:
  - The Runs surface rendered the exact `+0.505000` score, `-100` build cost, `-10` area, `-0.167 s` movement, unchanged outcome guardrails, and `etch-1 → probe-1` loss-leader change.
  - `RETAIN IN INVESTIGATION` preserved the exact FROM/TO query.
  - The retained pair reopened as a current anchor and immutable entry 21 without duplicate prefill.
  - An unretained `099-simulate → 100-simulate` pair prefilled the explicit observation fields without writing; browser console contained no warning or error.

## Progress log

- 2026-07-30 — Plan created after exact Run comparison shipped and the remaining reasoning-chain gap was verified against the current Core, CLI, Studio, and Investigation contracts.
- 2026-07-30 — Core added one presentation-independent comparison evidence hash and a strict Run-comparison Investigation anchor with TO-context Candidate provenance.
- 2026-07-30 — CLI and Studio gained explicit comparison capture, stable evidence navigation, comparison-to-Investigation handoff, and no-duplicate retained state.
- 2026-07-30 — The real memory-fab Investigation accumulated the exact compact-cell comparison as entry 21; focused, browser, fast, and full repository verification passed.

## Completion

Completed on 2026-07-30. Exact immutable Run comparisons can now survive terminal/browser sessions as compact, recomputable Investigation evidence and can carry their TO factory identity into later authored hypotheses and Candidates without granting the engine automatic design authority.
