# Investigation-sourced Candidate cycle

- Status: `active`
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

- [ ] A newly authored Candidate can prove the exact Investigation manifest, hypothesis entry, author, statement, expected effect, and pinned hashes that motivated it.
- [ ] Missing, corrupt, cross-project, non-hypothesis, or identity-mismatched source evidence fails closed before review or Candidate creation.
- [ ] A CLI-only Agent can create, inspect, review, and append the resulting decision without copying generated hashes or inventing evidence ids.
- [ ] A human or browser-capable Agent can follow the source link, run/reconnect to the same Candidate review, and return to a prefilled explicit decision form in Studio.
- [ ] Review still produces only immutable evidence; disposition and KEEP application remain separate explicit actions owned by a human or reasoning Agent.
- [ ] Core, CLI, API, Studio, schema, temporary-project mutation tests, a real memory-fab cycle, visual verification, and the full checkpoint pass.

## Work

- [ ] Define and test exact Investigation-hypothesis Candidate provenance and resolution in Core.
- [ ] Add the Candidate creation operation and `inm investigate` machine/human projection.
- [ ] Carry source/return context through Candidate review APIs, routes, and Studio controls.
- [ ] Prefill but never auto-submit the append-only Investigation decision with exact Candidate-review evidence.
- [ ] Run one observation-led memory-fab Candidate cycle and record its evidence and decision.
- [ ] Update lasting design/CLI contracts, complete visual and full verification, then audit every acceptance item.

## Findings and decisions

- 2026-07-30 — Candidate review evidence is already authoritative and reconnectable; this plan composes existing boundaries instead of creating a second evaluator or operation store.
- 2026-07-30 — Candidate creation may accept a caller-authored patch, but Core owns source resolution, base-hash derivation, schema validation, and the project-local write. This keeps Agents productive without treating their proposed edit as trusted evidence.
- 2026-07-30 — Human/Agent capability parity does not require an arbitrary patch editor in Studio. CLI is the high-bandwidth authoring surface; Studio must preserve provenance, review, spatial inspection, and explicit judgment.
- 2026-07-30 — Returning from review may prefill candidate, evidence anchor, and suggested disposition from the recorded verdict, but it must not author the decision statement or submit it automatically.

## Verification

- Pending.

## Progress log

- 2026-07-30 — Plan created after resilient Studio source adoption reached a green, pushed checkpoint. Existing Investigation and Candidate surfaces were audited; the missing contract is exact hypothesis provenance plus a low-friction return path, not another optimizer.

## Completion

Complete when one real memory-fab hypothesis can move through exact Candidate authoring, retained review, and explicit Investigation disposition with the same evidence identity through CLI and Studio, and no operator must reconstruct generated hashes from chat or transient browser state.
