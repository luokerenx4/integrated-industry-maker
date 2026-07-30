# Persistent industrial investigation workspace

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]], and [[docs/design/studio-debugger]].

## Outcome

Give each self-contained project an explicit, persistent industrial investigation workspace where a human or reasoning Agent can pin one exact operating problem, preserve the evidence and prior Design/Candidate lineage that informed it, append subjective observations, hypotheses, and decisions, and later resume the same inquiry through either `inm` or Studio without reconstructing context from chat memory.

## Context

INM already preserves immutable operating Runs, Design Runs, Candidate proposals, review receipts, and verified commissioned lineage. Those artifacts answer what happened and whether one exact intervention passed its locked gates. They do not preserve the higher-level human/Agent inquiry that connects them: what was observed, which industrial question was being asked, which prior decisions must not be rediscovered, what hypothesis should be tried next, or why the inquiry was deferred.

Plans and chat histories currently carry much of that reasoning. Plans are repository engineering coordination rather than project data, while chat history is not a project-local source of truth. A long-lived factory therefore still loses subjective investigation context even when its machine evidence survives.

The investigation workspace must not become an autonomous optimizer, mutable evidence cache, or duplicate copy of dense Run data. It should retain small exact anchors to authoritative artifacts, report whether those anchors remain current, and keep authored reasoning append-only.

## Scope

### In scope

- Add strict project-local Investigation V1 manifest and entry schemas under `investigations/<id>/`.
- Create an Investigation from one exact current Workbench diagnostic and compatible operating Run, preserving its selection/hashes, leading contributor, Core next action, and any verified Design/Candidate lineage.
- Append explicit `observation`, `hypothesis`, and `decision` entries with stable sequence and evidence-anchor references; never rewrite an earlier entry.
- Inspect anchor currentness against the live project and fail closed when the operating Run, diagnostic, Design lineage, Candidate review, or selected execution identity no longer agrees.
- Expose one bounded Core projection through `inm investigate` and a stable Studio `/project/investigations/<id>` route.
- Check in one real memory-fab investigation that resumes from the commissioned inspection-supply lineage and states the next physically distinct question.

### Out of scope

- Automatically generating a hypothesis, editing a Blueprint, running a Design Program, reviewing a Candidate, or choosing KEEP/DISCARD.
- Copying dense Run, loss profile, Benchmark, Design, or Candidate payloads into the Investigation.
- Shared or cross-project investigation storage.
- Compatibility readers, migrations, aliases, or synthetic upgrade of pre-release formats.

## Acceptance

- [x] A project can create and reopen one exact investigation whose compact manifest survives independently of chat, browser storage, `.inm`, and ignored Run caches.
- [x] Human/Agent reasoning accumulates as immutable ordered entries and every referenced evidence anchor resolves as `current`, `historical`, `missing`, or `invalid` without guesswork.
- [x] CLI and Studio show the same question, target, evidence status, prior commissioned Candidate lineage, entries, and exact next navigation; neither surface performs industrial design automatically.
- [x] The checked-in memory-fab investigation preserves the current inspection starvation question, Run `098-simulate`, commissioned Design Run `966127dd542d…`, Candidate `inspection-supply-path-966127dd`, one observed spatial/typed fact, and one next hypothesis.
- [x] Targeted schema/Core/CLI/Studio tests, project validation, visual inspection, and the full repository checkpoint pass.

## Work

- [x] Audit the existing project, Workbench, operating Run, Design Run, Candidate, receipt, CLI, Studio route, and plan boundaries.
- [x] Create and index this plan and the durable design contract before implementation.
- [x] Implement strict Investigation storage, append-only entries, evidence-anchor creation, and currentness inspection in Core.
- [x] Add `inm investigate` discovery/create/append/inspect behavior and machine-readable help/schema coverage.
- [x] Add Studio API, stable route, project navigation, read/append UI, and cross-surface tests.
- [x] Author the real memory-fab inspection investigation and verify evidence/currentness behavior.
- [x] Complete documentation and the full acceptance audit. Commit and push are recorded in version control rather than used as domain acceptance evidence.

## Findings and decisions

- 2026-07-30 — Immutable Runs and Candidate receipts already own machine evidence; Investigation files must reference their identities rather than embedding or re-evaluating them.
- 2026-07-30 — The shared Workbench diagnostic id already incorporates exact evidence identity. Investigation V1 will pin that id, the compatible operating Run, selection/hashes, and the Core next action rather than inventing a second loss classifier.
- 2026-07-30 — Subjective reasoning needs history rather than last-write-wins fields. The manifest is created once and each observation, hypothesis, or decision is a separately stored immutable entry with an explicit sequence.
- 2026-07-30 — An Investigation is human/Agent authority, not design authority. Its currentness projection may recommend where to look next but cannot mutate the factory or claim an intervention works.
- 2026-07-30 — The persisted initial handoff excludes absolute CLI arguments. Exact CLI navigation is reconstructed against the currently opened project so copying a self-contained project cannot retain the creator's filesystem path.
- 2026-07-30 — The memory-fab replay showed that `etch-to-inspection` moved 12 lots at only 1.3% line utilization with zero blocked item-ticks while both `inspection-1` and upstream `etch-l2` waited for input. The next recorded hypothesis therefore exploits the long empty interval through qualified low-power metrology standby instead of adding local transport or etch capacity.
- 2026-07-30 — Studio's Investigation content must use a scoped content container rather than a nested global `<main>` element; visual verification caught the global grid selector collapsing the evidence sections.

## Verification

- `bun test packages/inm-core/src/investigation.test.ts` — 1 pass; exact anchors, portable manifest, append-only hash chain, current/historical state, and tamper rejection.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'public investigate'` — 1 pass; public create, append, inspect, help, and JSON parity.
- `bun test packages/inm-studio/src/routes.test.ts` — 6 passes; stable project-qualified Investigation paths remain lightweight and reconstructable.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern 'project-local Investigation'` — 1 pass; list/create/read/append HTTP contract and direct browser route.
- `bun run inm investigate examples/memory-fab --investigation inspection-starvation-next-step --section all --json` — the checked-in inquiry reopens with all three anchors `current`, two ordered entries, and the exact commissioned Core handoff.
- Studio visual inspection at `/memory-fab/investigations/inspection-starvation-next-step` — project list, question, current anchors, Core handoff, reasoning log, and append form render as one usable workbench after correcting the nested-main layout collision.
- `bun run check:fast` — documentation, every TypeScript project, and 35 short-suite tests pass.
- `bun run test` — 318 repository tests and 3476 assertions pass, followed by all eight Ironworks project checks.

## Progress log

- 2026-07-30 — Plan created after the first verified commissioned Design lineage proved that machine decisions can survive apply while the encompassing human/Agent inquiry still lacks a project-local home.
- 2026-07-30 — Core, CLI, and Studio now share one strict project-local Investigation contract, and memory-fab carries the first resumable observation-led inquiry.

## Completion

Complete after one strict Investigation contract is shared by Core, CLI, and Studio; memory-fab carries a real resumable inquiry; every evidence anchor fails closed; and all executable and visual checkpoints pass.
