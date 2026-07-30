# Investigation Design Session handoff

- Status: `completed`
- Updated: `2026-07-30`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/observation-led-design]], [[docs/design/agent-cli-contract]], [[docs/design/development-operations]], and [[docs/design/experiment-workbench]].

## Outcome

Turn the existing append-only Industrial Investigation into one phase-aware human/Agent Design Session: after exact evidence is retained, Core must explain whether the next owned step is to repair evidence, observe, form a hypothesis, author a Candidate, or resume the shared project queue, while CLI and Studio preserve that same identity and never invent the industrial judgment.

## Context

The memory-fab chain already retains immutable Run comparison `100-simulate → 101-simulate` as Investigation entry `0021`. It proves the compact inspection/rework cell improved score, capital, area, movement, and one second of inspection starvation without weakening delivery or quality.

The Investigation is current, but `inspectIndustrialInvestigation()` currently copies the global Workbench next action. Because the latest Blueprint revision made all five focused Design Runs historical, that copied handoff says only “open Inspection Supply Path Convergence.” It does not acknowledge that the append-only chain has reached a current observation, that the next subjective act is a new or explicit deferred hypothesis, or which exact entry and evidence anchors should be cited.

The missing concept is not another mutable session artifact. The Investigation already owns the durable question, evidence identities, authorship, and hash chain. It needs a deterministic reasoning-phase projection and a portless session entry.

## Scope

### In scope

- Derive one strict Investigation reasoning phase from anchor health/currentness and the latest append-only entry.
- Bind each handoff to the exact source entry and available evidence-anchor ids rather than reconstructing context from prose.
- Make a current observation lead to explicit human/Agent hypothesis authorship; make a hypothesis lead to caller-authored Candidate work; never generate either.
- Let `inm session <path> --investigation <id>` enter the exact source-current Investigation route and return the same Core handoff without requiring a port.
- Use the handoff to select the Studio entry form and explain required authorship while leaving every field unsubmitted.
- Prove the contract against the checked-in `inspection-starvation-next-step` chain.

### Out of scope

- Automatic hypothesis, patch, layout, disposition, or Candidate generation.
- Replacing the shared project Workbench next action or the existing Experiment session target.
- Treating historical Design scores as current authority or silently rerunning a Design Program.
- Creating a second Design Session store, mutable draft artifact, shared asset library, or compatibility alias.
- Choosing the next physical memory-fab intervention in Core.

## Acceptance

- [x] Broken or stale operating evidence yields an explicit repair/observe phase; current evidence never silently cites a stale checkpoint.
- [x] A latest current observation yields a typed `form-hypothesis` handoff pinned to its entry hash and exact available evidence ids.
- [x] A latest current hypothesis yields a typed `author-candidate` handoff pinned to that hypothesis without fabricating a Candidate id, name, Benchmark, or patch.
- [x] Other completed reasoning states return to the shared current project action without losing the Investigation identity.
- [x] `inm investigate`, `inm session --investigation`, and Studio render the same phase, source entry, evidence ids, route, and read/write boundary.
- [x] The real memory-fab entry `0021` opens as a hypothesis-authoring session citing `compact-cell-run-comparison`; no action is auto-submitted.
- [x] Core, CLI, Studio, lifecycle, browser, fast, and full repository verification pass.

## Work

- [x] Audit current memory-fab Workbench, Design Program currentness, loss evidence, Investigation chain, Candidate handoff, and existing Session lifecycle.
- [x] Confirm that the missing boundary is phase-aware Investigation continuation rather than another evaluator or session store.
- [x] Implement and test the Core reasoning-phase contract.
- [x] Add explicit Investigation targeting to the managed CLI session and public discovery.
- [x] Project the shared handoff through Studio without auto-authoring.
- [x] Verify the real memory-fab route, update lasting documentation, complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-30 — The managed lifecycle and focused Experiment path are already fast and reconnectable; no new process manager is justified.
- 2026-07-30 — Exact Run comparison, Investigation-sourced Candidate creation, locked review, and explicit decision return are already implemented. A second “Design Session” persistence layer would duplicate authority and make evidence identity worse.
- 2026-07-30 — Current Program `inspection-supply-path` has zero current, five historical, and four invalid Design Runs after the compact-cell Blueprint revision. Replaying its bounded portfolio may later be useful evidence, but it cannot substitute for the subjective reasoning step represented by the latest current Investigation observation.
- 2026-07-30 — Investigation entry `0021` cites the current exact Candidate review, Run `101-simulate` factory observation, and deterministic `100 → 101` comparison. The honest next phase is `form-hypothesis`; Core may select and preserve that phase, but only a human or reasoning Agent may supply the statement and expected effect.
- 2026-07-30 — The phase projection remains separate from navigation. `currentNextAction` opens the exact route read-only; `handoff.authorship` identifies whether an Investigation entry or Candidate is the next artifact and lists required caller fields without placeholder values pretending to be executable argv.
- 2026-07-30 — A new Investigation begins at `observe-current-factory`; a current observation or `revise` decision leads to `form-hypothesis`; a current hypothesis leads to `author-candidate`; keep/defer/discard returns to the shared project action. Historical checkpoints require a new observation, and any missing/invalid anchor fails into `repair-evidence`.
- 2026-07-30 — Studio now selects the handoff-owned form kind and checks only the latest entry's evidence ids. It does not default every historical anchor into a new claim.

## Verification

- `bun test packages/inm-core/src/investigation.test.ts` — 3 tests / 45 assertions pass across current, historical, missing, invalid, observation, hypothesis, Candidate, and completed-decision states.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern "public investigate"` — the machine and human Investigation projections pass with the exact phase/source/evidence handoff.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern "Studio exposes one project-local Investigation"` — API phases advance `observe → hypothesize → author Candidate` without caller-authored identity substitution.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts --test-name-pattern "Investigation Design Session|target modes"` — exact managed Investigation entry and pre-lifecycle target-conflict rejection pass.
- `bun run check:fast` — 1,264 documentation links, all TypeScript projects, and 39 short tests / 262 assertions pass.
- Real `inm session examples/memory-fab --investigation inspection-starvation-next-step --no-open --json` repaired a stale manager on managed port `4176`, returned source `CURRENT`, entry `0021`, phase `form-hypothesis`, and the exact three inherited evidence ids.
- Browser QA on the session URL verified the visible `FORM HYPOTHESIS` handoff, source entry/hash, three checked current evidence ids, unselected historical operating anchor, empty authored fields, selected hypothesis form, visible authoring boundary, and zero console errors.
- `bun run test` — documentation and every TypeScript project passed; `337` Core/CLI/Studio tests / `3,948` assertions and all `8` public Ironworks fixtures passed in `271.68s`.
- Final managed memory-fab lifecycle — one manager/server pair on port `4176`, both source hashes current, supervisor phase `current`.

## Progress log

- 2026-07-30 — Plan created from current CLI/Core artifacts and the complete checked-in memory-fab Investigation chain.
- 2026-07-30 — Implemented Core, CLI, managed Session, Studio, documentation, focused tests, fast gate, real memory-fab session, and browser verification. Full checkpoint and completion audit remain.
- 2026-07-30 — Full checkpoint and requirement-by-requirement acceptance audit passed; plan completed for commit and push.

## Completion

Completed on 2026-07-30. The existing append-only Investigation is now the durable Design Session: Core derives a strict reasoning phase from exact evidence and the latest entry, CLI and Studio preserve its source/evidence/authorship boundary, and one managed `inm session --investigation` command enters it without port knowledge. The current memory-fab chain lands on entry `0021` as an empty explicit hypothesis form; no autonomous design action or duplicate session artifact was introduced.
