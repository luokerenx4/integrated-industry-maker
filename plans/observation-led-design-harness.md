# Observation-led design Harness

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/observation-led-design]], [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]], [[docs/design/design-programs]], and [[docs/design/agent-cli-contract]].

## Outcome

Make visual factory observation an explicit, reproducible step in INM's human/Agent design loop: both surfaces bind the same exact Blueprint, Scenario, hashes, compatible simulation run, leading evidence, and stable Studio views before a human or Agent authors a hypothesis and evaluates a deliberate change.

## Context

INM already exposes typed diagnostics through CLI and a spatial replay through Studio, but those are separate capabilities rather than one Harness contract. A Coding Agent can proceed from structured loss data without ever seeing the factory, while a browser user can view a run whose identity disappears from the URL after reload. The current deterministic Design Program can enumerate and compare bounded proposals, but its existence must not imply that an optimizer owns subjective industrial design.

The product authority is a human or reasoning Agent. Computation may compile, simulate, measure, compare, and rank explicitly bounded alternatives; it must not replace the observer's spatial interpretation, hypothesis, or commissioning judgment. Browser-capable Agents use the semantic Studio surface directly. CLI-only Agents may open the returned stable routes through Playwright, MCP, or an equivalent screenshot-capable browser.

## Scope

### In scope

- A durable repository rule that industrial design is observation-led and human/Agent-authored rather than RL- or black-box-optimizer-owned.
- One Core-owned observation brief binding exact selection hashes, a compatible immutable run, the leading diagnostic, stable visual targets, and the required design handoff.
- A public `inm observe` command and a Studio Factory projection of that same brief.
- Run-qualified Factory URLs that survive direct open, reload, object focus, history, and run selection.
- Memory-fab CLI, API, and real-browser proof of the first complete observe → interpret → author/evaluate handoff boundary.

### Out of scope

- Automatic screenshots inside Core or assumptions about one browser/MCP vendor.
- Image-understanding inference, RL training, autonomous layout generation, or automatic Blueprint application.
- A persisted subjective observation receipt or mandatory Candidate schema reference; that can be planned after the first brief is used in real design work.
- Replacing the deterministic simulator, locked Benchmark evaluator, Candidate review guards, or useful bounded comparison tools.

## Acceptance

- [x] `AGENTS.md` and durable design documentation require observe → hypothesize → author → simulate/Benchmark → compare → decide, name the human/Agent as design authority, and prohibit treating black-box search as the product design loop.
- [x] Core returns one deterministic observation brief for an exact project selection and optional compatible run, including stable overview/focus/evidence routes and an explicit subjective handoff checklist.
- [x] `inm observe <path> [selection] [--run ID] --json` exposes that brief in the standard CLI envelope and machine help without writing project state.
- [x] Studio Factory renders the same brief, preserves the selected run in its URL across reload/object focus/history/run changes, and remains usable without a run by clearly requesting simulation evidence.
- [x] Focused Core/CLI/Studio route/server tests, the full suite, and a real memory-fab browser check prove parity, stable navigation, and zero incidental project mutation.

## Work

- [x] Audit the current Design Program, shared workbench, CLI contract, Factory routing, and browser replay boundary.
- [x] Define and document the observation-led design authority and first observation-brief contract.
- [x] Implement the Core brief and public `inm observe` projection with tests.
- [x] Project the brief in Factory and make run-qualified Factory navigation stable.
- [x] Exercise the memory-fab observation loop through CLI, API, and browser; complete docs and the full verification gate.
- [x] Commit and push the completed checkpoint.

## Findings and decisions

- 2026-07-28 — Typed loss evidence and spatial replay already exist, but there is no shared observation task tying them to one exact run and design hypothesis.
- 2026-07-28 — Factory object paths are stable, but the selected immutable run is browser state only; a reload silently returns to the newest default-compatible run.
- 2026-07-28 — V1 will make observation executable and reproducible without pretending that Core can prove a person or Agent genuinely understood an image. A persisted observation receipt is intentionally deferred until this brief has informed real design work.
- 2026-07-28 — Existing Design Programs remain bounded proposal/evaluation instruments. They are not autonomous design authority and may not bypass visual observation, authored hypotheses, locked evaluation, or human/Agent commissioning judgment.
- 2026-07-28 — Browser dogfood exposed same-engine but hash-incompatible historical runs in the Factory picker. Factory now lists only exact selection/hash-compatible runs; Runs keeps historical evidence visible but disables opening it as the current Factory.

## Verification

- `bun run docs:check` — 908 documentation double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, and both example TypeScript asset packages pass.
- `bun test packages/inm-core/src/observation.test.ts packages/inm-studio/src/routes.test.ts` — exact compatible/no-run briefs and run-qualified route parsing pass.
- `bun test packages/inm-cli/src/commands.test.ts --test-name-pattern 'public observe'` — public machine/human projection, help discovery, exact routes, and read purity pass.
- `bun test packages/inm-studio/src/server.test.ts --test-name-pattern 'defaults to current compatible evidence|opening a project without runs'` — exact-run filtering, API parity, and no-run read purity pass.
- `bun run inm validate examples/memory-fab --json`, `bun run inm analyze examples/memory-fab --json`, and `bun run inm observe examples/memory-fab --run 090-simulate --json` pass.
- Real in-app-browser QA opened `090-simulate`, followed the required `inspection-1` focus, reloaded the direct route, retained the exact run and inspector, showed only the compatible run in the picker, and recorded zero console warnings/errors.
- `bun run test` — documentation, type checking, Core/CLI/Studio tests, and all eight Ironworks public fixtures pass.

## Progress log

- 2026-07-28 — Plan created and registered after auditing the automatic Design flow, shared workbench, CLI capability schema, Studio Factory data loading, and route behavior.
- 2026-07-28 — Added the durable observation-led authority, deterministic Core brief, public `inm observe`, Studio observation panel, and stable run-qualified Factory routes.
- 2026-07-28 — Browser dogfood proved `090-simulate` overview and `inspection-1` focus, caught and removed incompatible historical runs from the active picker, and completed the full verification gate.

## Completion

Completed on 2026-07-28. INM now treats multimodal factory observation as a first-class Harness step shared by humans and Agents, while preserving explicit subjective design authority and exact evaluation guards. Persisted subjective observation receipts remain intentionally deferred until this brief has informed real design iterations.
