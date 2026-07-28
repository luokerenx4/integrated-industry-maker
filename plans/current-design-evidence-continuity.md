# Current Design evidence continuity

- Status: `completed`
- Updated: `2026-07-29`
- Related design: [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/observation-led-design]], [[docs/design/studio-debugger]]

## Outcome

Keep one exact Design evidence authority from the shared Workbench handoff through the CLI brief and Studio Design control room: current, historical, and invalid runs remain distinct everywhere; every surface recommends the same new-run, reopen, continue, or promote action; and the current memory-fab inspection-supply frontier can be evaluated without an operator guessing whether retained evidence still applies.

## Context

Workbench V12 correctly classifies all pre-`inm-sim/0.87.0` inspection-supply Design Runs as historical, so the current leading `inspection-1` input-starvation diagnostic recommends creating current evidence. The Design CLI brief and Studio control room still expose those same artifacts only as “valid” immutable runs, rank them by score, and always present a new-run control. A valid historical artifact is useful evidence but cannot own current continuation, promotion, loss disposition, or default selection.

This split makes the observation-led loop discontinuous exactly where a human or reasoning Agent needs to decide what to do next. The currentness identity and authority ordering already exist in Core, but only the shared Workbench consumes them.

## Scope

### In scope

- Build one Core-owned Design evidence projection from an exact prepared Program brief and strict run index.
- Expose current/historical/invalid counts, per-run currentness reasons and outcomes, and one authority run consistently to Workbench, CLI, and Studio.
- Make CLI and Studio next actions derive from that shared authority: new run only when current evidence is missing, otherwise reopen, continue, or promote the exact current leaf.
- Keep historical deep links inspectable while preventing their continuation or promotion controls.
- Execute the current `inspection-supply-path` Program under `inm-sim/0.87.0`, inspect its physical and locked-case evidence, and record the resulting factory-design decision or next unmet requirement.

### Out of scope

- Migrating or treating old Design Run schemas or engine results as current.
- Automatically accepting a Design leader or applying a Blueprint without Candidate review.
- Adding RL, black-box search, or a generic autonomous optimizer.
- Changing Benchmark-owned industrial outcome thresholds to make a proposal pass.

## Acceptance

- [x] One Core contract classifies exact Design Run currentness and authority without filesystem-time, UI, or CLI-specific ranking.
- [x] Workbench, CLI brief, and Studio Design API/control room expose identical current, historical, invalid, and authority identities.
- [x] Historical runs remain readable but cannot surface Continue or Promote; current missing/continuable/promotable/exhausted states produce one exact next action.
- [x] Tests cover an engine-mismatch history, a current exhausted leaf, a current continuable leaf, and CLI/Studio parity.
- [x] A current memory-fab inspection-supply Design Run is created and its locked five-case outcome is recorded without weakening the factory contract.
- [x] Fast and full repository verification pass.

## Work

- [x] Audit current evidence identity, CLI brief, Studio ranking, and action boundaries.
- [x] Extract the exact shared Core projection and replace Workbench-local identity assembly.
- [x] Project currentness, authority, and actions through CLI and Studio; remove score-only historical defaulting.
- [x] Run and inspect the current memory-fab Design frontier, then update durable design guidance and fixtures.
- [x] Complete tests, full verification, spatial evidence audit, commit, and push.

## Findings and decisions

- 2026-07-29 — Strict load validity and current industrial authority are different dimensions. A historical run remains readable and hash-verifiable but cannot own continuation, promotion, bounded disposition, or default action.
- 2026-07-29 — Current authority must remain the deterministic leaf ordering already used by Workbench: promotable, then continuable, then exhausted; evaluated budget and score are tie-breaks only within the same outcome, and stable id is final.
- 2026-07-29 — No compatibility reader will be added. Pre-0.87 evidence stays historical and must be replaced by a fresh exact run when its hypothesis remains relevant.
- 2026-07-29 — Current run `159ea491ae78` exhausted all six available inspection-supply hypotheses. Every hypothesis reduced `inspection-1` starvation by 667–2500 ticks, but five regressed a locked current-best case and the dual-handoff candidate failed the Benchmark gate, so no Blueprint changed.
- 2026-07-29 — Repository-backed observation tests now select the diagnostic they intend to project explicitly. Adding a new current Design Run must not silently repoint unrelated spatial-view fixtures.

## Verification

- `bun run check:fast` — passed.
- `bun test packages/inm-core/src/workbench.test.ts packages/inm-core/src/observation.test.ts packages/inm-cli/src/commands.test.ts --test-name-pattern 'current inspection evidence|observation brief|public observe'` — 7 passed.
- `bun run test` — 298 passed; all Ironworks locked examples passed.
- Browser audit on the source-current Studio at port 4176:
  - current `159ea491ae78` was selected as authority and the new-run control read `CURRENT EXHAUSTED`;
  - the three pre-0.87 runs remained readable as historical and exposed neither Continue nor Promote;
  - `/memory-fab/factory/devices/inspection-1?run=092-simulate` loaded the exact replay without an alert.

## Progress log

- 2026-07-29 — Plan created after CLI and Studio were found to flatten three historical inspection-supply runs into an undifferentiated “valid” count while Workbench correctly reported zero current runs.
- 2026-07-29 — Shared Core projection, CLI/Studio parity, current locked evidence, observation handoff, and visual audit completed.

## Completion

Workbench, CLI, Studio, and the memory-fab project now agree on one exact current Design authority. Historical evidence is visibly retained but cannot drive an effectful action, and the exhausted inspection-supply frontier advances the shared handoff to `layer-two-particle-control`.
