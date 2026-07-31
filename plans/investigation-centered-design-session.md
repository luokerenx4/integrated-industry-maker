# Investigation-centered design session

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]], [[docs/design/operation-workbench]], and [[docs/design/agent-cli-contract]].

## Outcome

Make one project-local Investigation the resumable operating surface for an entire human/Agent factory-design cycle: current observation, authored hypothesis, Candidate creation, locked review, immutable trial, exact Run comparison, and explicit disposition. Reopening the Investigation must identify the exact completed evidence and the one next phase without reconstructing progress from chat history, filenames, or browser state.

## Context

The current V7 Investigation handoff understands observation, hypothesis, Blueprint/Production-Plan authoring, and the complete Production Plan continuation. Its Blueprint Candidate branch stops after `author-candidate`: it does not discover a Candidate already sourced from that hypothesis, its immutable review receipt, Candidate-bound TRIAL Run, captured Run comparison, or exact decision. Studio also lacks Investigation-local Candidate authoring and trial execution, so operators bounce between pages and manually remember which evidence still needs to be retained.

The completed incumbent Burn-in campaign demonstrates the desired full chain and the current defect. Entries `0015` through `0018`, Candidate `incumbent-five-performance-seven-commercial`, and Run `109` preserve all evidence, but reopening the Investigation after its discard returns only a generic project action. The system should expose that completed cycle as accumulated knowledge and invite a new current observation, not forget the cycle or repeat an already completed phase.

## Scope

### In scope

- Add a Core-owned Candidate-cycle projection to Investigation inspection that strictly matches source hypothesis, proposal/review identity, immutable TRIAL parentage, Run comparison, and disposition.
- Extend phase-aware handoff through Candidate authoring, review, trial, comparison, and explicit decision, then return a completed cycle to current-factory observation.
- Add Investigation-local Studio controls for creating an explicit RFC 6902 Candidate and running a reviewed Candidate as a reconnectable immutable TRIAL operation.
- Preserve exact CLI equivalents and stable project-qualified Studio routes for every phase.
- Prove the existing memory-fab Burn-in chain reopens as completed accumulated evidence and that an isolated fresh Investigation advances through the same states.

### Out of scope

- Generating a patch, hypothesis, disposition, or replacement Candidate automatically.
- Applying a Candidate from the Investigation page, bypassing locked review, or turning score into commissioning authority.
- Merging Production Plan and Blueprint Candidate semantics.
- Adding compatibility aliases for earlier pre-release handoff shapes.

## Acceptance

- [x] Core inspection exposes every Candidate sourced from the active hypothesis with exact review, TRIAL, comparison, and decision identities; ambiguous or broken evidence fails closed.
- [x] `handoff.phase` advances deterministically through `author-candidate`, `review-candidate`, `simulate-candidate`, `compare-candidate`, and `decide-candidate`, then requires a new current observation after a retained non-revise decision.
- [x] CLI and Studio project the same phase, next action, source entry, evidence ids, and Candidate-cycle identity without either surface inventing progress.
- [x] A human can author an explicit Candidate and launch its reviewed TRIAL from the Investigation page; an Agent can perform the exact same steps through `inm investigate` and `inm candidate`.
- [x] The current memory-fab Burn-in Investigation visibly retains its completed negative cycle and does not recommend recreating or applying the discarded Candidate.
- [x] Focused, cross-surface, browser, documentation, and full repository verification pass before commit and push.

## Work

- [x] Specify and implement strict Candidate-cycle resolution in Core Investigation inspection.
- [x] Extend Workbench target phases, CLI text/JSON, session routing, and tests.
- [x] Add Studio Candidate authoring, review/trial continuation, and reconnectable operation support.
- [x] Project the retained memory-fab cycle and exercise the next current-observation handoff.
- [x] Complete documentation, visual verification, full tests, archive, commit, and push.

## Findings and decisions

- 2026-07-31 — V7 loses Candidate continuation immediately after a Blueprint hypothesis: `buildIndustrialInvestigationHandoff()` only checks the last entry kind and never inspects Candidates or TRIAL Runs. Completed Candidate evidence can therefore collapse to generic `resume-project`, while an unappended reviewed Candidate can still look like missing authoring work.
- 2026-07-31 — Candidate lifecycle authority already exists in immutable artifacts: the Candidate source pins the Investigation hypothesis; the review receipt pins proposal/base/proposed/result identities; a TRIAL manifest pins Candidate proposal/review plus exact parent Run; a Run-comparison anchor pins the exact control/trial pair; a decision can cite the exact review anchor. The new session projection must join these identities, not create another receipt.
- 2026-07-31 — The first Studio patch-editor example targeted `/revision`, outside the restricted Candidate surface. Browser QA caught the failure before publication; the editor now starts empty and presents an allowed Device path only as a placeholder, preserving explicit human/Agent authorship.
- 2026-07-31 — Real memory-fab inspection can exceed the old 15-second Session HTTP request window under serialized checkpoint load even though managed startup is healthy. Session requests now have a separate 30-second bounded window, while recovery and startup ownership windows remain unchanged.

## Verification

- `bun run docs:check`
- `bun run typecheck`
- `bun test packages/inm-core/src/investigation.test.ts`
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'public investigate preserves'`
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts --test-name-pattern 'one command enters the exact phase-aware Investigation'`
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern 'Studio exposes one project-local Investigation'`
- `bun test packages/inm-studio/src/operation-registry.test.ts`
- `bun run inm investigate examples/memory-fab --investigation source-lot-back-end-service --json`
- Browser: completed memory-fab Candidate ledger, next-current-observation handoff, 1280px and 650px layouts, and zero console warnings/errors.
- Browser temporary project: explicit Candidate authoring advanced `author-candidate → review-candidate`; exact reviewed TRIAL advanced `simulate-candidate → compare-candidate`; zero console warnings/errors.
- `bun run test` — 353 package tests / 3910 assertions plus all eight Ironworks fixtures passed.

## Progress log

- 2026-07-31 — Plan opened from the completed incumbent Burn-in service campaign and the observed Candidate-continuation gap.
- 2026-07-31 — Core, CLI, Studio, and operation-registry projections implemented and proven against the progressive memory-fab evidence chain.
- 2026-07-31 — README replaced with a concise observation-led product entry, memory-fab quick start, self-contained project model, and routed documentation map.
- 2026-07-31 — Browser QA completed the human Candidate creation/TRIAL path, caught and removed an invalid default patch, and retained the formal memory-fab Investigation at port 4177.

## Completion

Completed on 2026-07-31. One Investigation now preserves and resumes the full Blueprint Candidate evidence cycle without inventing an intervention or decision, and README presents that human/Agent product model without the obsolete autonomous-optimizer framing.
