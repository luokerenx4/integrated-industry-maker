# Loss-guided Design decisions

- Status: `active`
- Updated: `2026-07-23`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/blueprint-optimization]], [[docs/design/agent-cli-contract]], and [[docs/design/experiment-workbench]].

## Outcome

Every memory-fab Design iteration derives a deterministic loss profile from its exact driver simulation, gives that evidence to the project-owned proposal strategy, records which measured loss the proposal claims to address, and exposes the same loss-to-decision chain to humans in Studio and Agents through the CLI.

## Context

INM already ranks fab losses for a hash-compatible persisted simulation run, and Design Programs already execute a fresh deterministic driver simulation before asking for each proposal. These two loops are disconnected: the proposal provider receives raw metrics but not the shared loss model, the memory-fab provider emits a fixed candidate sequence regardless of measured conditions, and the immutable Design Run does not preserve the evidence that motivated a proposal.

The driver simulation is iteration-local evidence, not a persisted compatible run. Reusing loss analysis therefore requires a source-neutral profile rather than inventing a run identity. A project proposal may claim a measured target, but Core must derive and validate the available loss buckets so project code cannot fabricate the observation it is responding to.

## Scope

### In scope

- Separate reusable fab-loss profile calculation from persisted-run attribution without weakening compatible-run semantics.
- Supply the frozen loss profile to project proposal providers and require a loss target when tracked-route evidence exists.
- Record the driver metrics identity, ranked loss chain, and proposal target in immutable Design Run evidence and progress events.
- Make the memory-fab provider rank unused candidates by the current loss chain rather than fixed file order alone.
- Project the same evidence and decision relationship through CLI and Studio.

### Out of scope

- Claiming that overlapping bucket scores are calibrated counterfactual output losses.
- Letting an LLM or project strategy calculate or replace Core-owned loss evidence.
- Automatically applying an accepted Candidate or bypassing review.
- Adding new fab physics solely to manufacture a proposal for every possible loss bucket.

## Acceptance

- [ ] Each Design iteration records a hash of its driver metrics and a source-neutral loss profile derived from those exact metrics; no fake immutable run identity is created.
- [ ] A project proposal receives the same frozen profile, names an observed loss bucket it addresses, and is rejected when the claim is absent or not present in the profile.
- [ ] Memory-fab selects the first valid unused candidate matched to ranked measured losses, with a deterministic fallback only when no tracked-route profile exists.
- [ ] CLI progress/JSON and Studio show the primary loss chain and the proposal's targeted loss with consistent terminology.
- [ ] Existing compatible-run workbench attribution remains hash-pinned and unchanged in meaning.
- [ ] Focused Core/provider/UI tests, documentation checks, memory-fab fixtures, a real Design run, and the complete repository suite pass.

## Work

- [x] Audit persisted fab-loss attribution, Design driver execution, proposal input, immutable evidence, and memory-fab candidate selection.
- [x] Define the source-neutral profile and loss-target contract without conflating driver evidence with a persisted run.
- [x] Implement Core profile reuse, provider validation, immutable recording, and progress projection.
- [x] Make the memory-fab strategy loss-guided and update its project-local runtime types.
- [x] Add CLI and Studio human projections while retaining complete machine-readable evidence.
- [x] Update design/reference documentation and tests.
- [ ] Run focused, project, full-suite, and real-run verification; audit every acceptance item.

## Findings and decisions

- 2026-07-23 — Workbench attribution and Design driver evidence have different provenance. The shared object is a source-neutral loss profile; only Workbench attribution may add a compatible persisted run identity.
- 2026-07-23 — Core owns metric-to-loss derivation. A project strategy may select an observed bucket as its intended target, but cannot supply or modify the available evidence.
- 2026-07-23 — The target is a testable proposal rationale, not a causal guarantee. KEEP/REJECT benchmark evidence still decides whether the intervention worked.
- 2026-07-23 — The authored `experiment` driver's primary loss is queue starvation, while the synthesized greenfield driver's primary loss is Route Q-time. The same CONWIP candidate therefore records a different measured target at each starting state rather than carrying one hard-coded rationale.
- 2026-07-23 — Project proposal-provider API V2 replaces V1. There is no compatibility adapter; providers must consume `fabLoss` and return an observed `addressedLoss` whenever the chain is non-empty.

## Verification

- `bun run typecheck` — Core, CLI, Studio, and both project-local TypeScript asset surfaces pass.
- `bun run docs:check` — 487 repository double-links resolve.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — deterministic loss-guided selection plus missing/fabricated target rejection pass.
- `bun test packages/inm-core/src/design-program.test.ts --test-name-pattern '^a synthesis-seeded'` — the 43-second complete greenfield Design/Candidate proof passes with exact driver metrics identity and source-neutral loss evidence.
- Focused public CLI and Studio streaming tests pass with queue-starvation diagnosis/target parity.
- Full repository, project fixture, real-run, and browser verification pending.

## Progress log

- 2026-07-23 — Plan created and activated after auditing the existing loss attribution, Design proposal, and immutable run boundaries.
- 2026-07-23 — Core evidence, provider API V2, memory-fab loss matching, immutable manifests/progress, CLI/Studio projections, focused tests, and design documentation implemented; full regression and runtime QA remain.

## Completion

Pending.
