# Investigation-sourced Candidate cycle

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]], [[docs/design/observation-led-design]], and [[docs/design/agent-cli-contract]].

## Outcome

Carry one exact Investigation hypothesis into an authored Candidate, run its existing locked/current-factory review, and return the immutable result to the same Investigation for an explicit human or Agent decision without reconstructing provenance or copying hashes by hand.

## Context

Investigations already preserve exact operating, diagnostic, commissioned-Design, and reviewed-Candidate evidence. Candidate review already produces immutable locked-Benchmark and current-factory evidence. The gap is the middle of the ordinary design loop:

- a Candidate can name an immutable Design Run as its source, but cannot name the exact Investigation hypothesis that motivated it;
- an Agent must currently hand-author the Candidate file and manually preserve that relationship in prose;
- after Studio review, a human must navigate back and retype Candidate and anchor ids before the result can enter the Investigation hash chain.

The components exist, but the product still makes the operator reconstruct `hypothesis → proposal → review → decision`. This plan joins those identities without turning prose into authority or making INM choose a design.

## Scope

### In scope

- Add a strict Candidate source variant that pins one project-local Investigation manifest and one exact hypothesis entry by content identity.
- Add one Core creation boundary that resolves that hypothesis, derives its hypothesis/expected-effect text and current Benchmark candidate hash, validates a caller-authored RFC 6902 patch, and writes one new self-contained Candidate.
- Expose Agent-friendly Candidate creation through `inm investigate` with structured JSON output and an exact review next action.
- Project the same source identity and currentness in Candidate inspection/review through CLI and Studio.
- Preserve Investigation context through the Studio Candidate route; after a recorded review, return to a prefilled but still explicit Investigation decision form that attaches the exact receipt.
- Exercise the complete loop on a real memory-fab hypothesis and retain its result whether the decision is keep, revise, defer, or discard.

### Out of scope

- Automatic hypothesis generation, patch generation, layout generation, RL, black-box search, or automatic disposition.
- A general visual Blueprint or arbitrary JSON-patch editor.
- Applying a KEEP Candidate without the existing explicit guarded confirmation.
- Compatibility readers or migrations for pre-release Candidate files.

## Acceptance

- [x] A newly authored Candidate can prove the exact Investigation manifest, hypothesis entry, author, statement, expected effect, and pinned hashes that motivated it.
- [x] Missing, corrupt, cross-project, non-hypothesis, or identity-mismatched source evidence fails closed before review or Candidate creation.
- [x] A CLI-only Agent can create, inspect, review, and append the resulting decision without copying generated hashes or inventing evidence ids.
- [x] A human or browser-capable Agent can follow the source link, run/reconnect to the same Candidate review, and return to a prefilled explicit decision form in Studio.
- [x] Review still produces only immutable evidence; disposition and KEEP application remain separate explicit actions owned by a human or reasoning Agent.
- [x] Core, CLI, API, Studio, schema, temporary-project mutation tests, a real memory-fab cycle, visual verification, and the full checkpoint pass.

## Work

- [x] Define and test exact Investigation-hypothesis Candidate provenance and resolution in Core.
- [x] Add the Candidate creation operation and `inm investigate` machine/human projection.
- [x] Carry source/return context through Candidate review APIs, routes, and Studio controls.
- [x] Prefill but never auto-submit the append-only Investigation decision with exact Candidate-review evidence.
- [x] Run one observation-led memory-fab Candidate cycle and record its evidence and decision.
- [x] Update lasting design/CLI contracts, complete visual and full verification, then audit every acceptance item.

## Findings and decisions

- 2026-07-30 — Candidate review evidence is already authoritative and reconnectable; this plan composes existing boundaries instead of creating a second evaluator or operation store.
- 2026-07-30 — Candidate creation may accept a caller-authored patch, but Core owns source resolution, base-hash derivation, schema validation, and the project-local write. This keeps Agents productive without treating their proposed edit as trusted evidence.
- 2026-07-30 — Human/Agent capability parity does not require an arbitrary patch editor in Studio. CLI is the high-bandwidth authoring surface; Studio must preserve provenance, review, spatial inspection, and explicit judgment.
- 2026-07-30 — Returning from review may prefill candidate, evidence anchor, and suggested disposition from the recorded verdict, but it must not author the decision statement or submit it automatically.
- 2026-07-30 — Studio must resolve whether the exact receipt is already present before offering a return action. Recorded evidence renders a completed state, and a manually reopened return URL suppresses duplicate Candidate/anchor prefill.

## Verification

- `bun run typecheck`
- `bun test packages/inm-core/src/investigation.test.ts packages/inm-cli/src/commands.test.ts --test-name-pattern "public investigate|Investigation hypothesis"`
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern "Studio exposes one project-local Investigation"`
- `bun run inm candidate examples/memory-fab --candidate metrology-low-power-standby-sourced --review --json`
- `bun run inm investigate examples/memory-fab --investigation inspection-starvation-next-step --entry discard-sourced-metrology-standby ... --attach-candidate metrology-low-power-standby-sourced --json`
- Browser QA at `/memory-fab/experiments/greenfield-dram-design/candidates/metrology-low-power-standby-sourced` proved the exact current hypothesis source, retained DISCARD evidence, explicit return path, already-recorded completion state, non-conflicting reopened return form, and zero console errors.
- `bun run test`

## Progress log

- 2026-07-30 — Plan created after resilient Studio source adoption reached a green, pushed checkpoint. Existing Investigation and Candidate surfaces were audited; the missing contract is exact hypothesis provenance plus a low-friction return path, not another optimizer.
- 2026-07-30 — Core gained the strict source union and creation boundary; CLI gained patch-file authoring and generated review/decision handoffs; Studio gained exact source, return, prefill, and duplicate-evidence states.
- 2026-07-30 — Real Candidate `metrology-low-power-standby-sourced` completed 15 locked/current/proposed case evaluations in about two seconds and reproduced `DISCARD`: a small energy benefit was dominated by constraint penalties in every case and facility-interruption on-time lots fell from nine to seven. Entry `discard-sourced-metrology-standby` retained the exact receipt as `metrology-low-power-standby-sourced-review`.
- 2026-07-30 — Lasting Investigation, Experiment, and Agent CLI contracts were updated; focused, visual, real-project, and full repository verification passed.

## Completion

Complete when one real memory-fab hypothesis can move through exact Candidate authoring, retained review, and explicit Investigation disposition with the same evidence identity through CLI and Studio, and no operator must reconstruct generated hashes from chat or transient browser state.
