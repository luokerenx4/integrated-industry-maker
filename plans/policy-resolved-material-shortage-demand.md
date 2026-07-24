# Resolve material shortage demand through the authored scheduling policy

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/simulation-runtime]], [[docs/design/batch-processing]], [[docs/design/fab-loss-attribution]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], [[docs/design/agent-cli-contract]]

## Outcome

Every material-starvation interval identifies the exact Process and input quantity that the authored scheduling policy would next admit, so humans and Agents investigate the real resumption condition rather than a different qualified recipe that runtime will never start at that boundary.

## Context

V7 correctly records exact Resource, Buffer, physical path, and immediate supply state, but the commissioned memory-fab exposed a scheduler/diagnostic mismatch. `furnace-1` completed twelve single-lot `rapid-anneal-dielectric-stack` jobs under its zero-wait batch-formation policy. During every empty inter-job interval, however, `selectBatchFormationProcessPlan()` falls through to the authored first plan when no fallback is currently ready. The resulting shortage events say the furnace is missing three lots for `batch-anneal-dielectric-stack`, even though the arrival of one lot makes the zero-wait rapid fallback the exact next executable plan.

The mismatch does not alter production output, but it corrupts the decision evidence now used to choose project-local interventions. Before changing deposition cadence, furnace policy, or transport, the engine must make the shortage Process/quantity agree with the policy-resolved next action.

## Scope

### In scope

- Resolve the diagnostic Process plan through the same batch-formation, cadence, recipe-dispatch, setup-campaign, and readiness policy boundary used for execution.
- For zero-wait batch formation, retain the preferred complete batch when it is ready and otherwise identify the fixed-size fallback even when its input is currently absent.
- Preserve explicit batch holds, independent unavailability, complete fixed-size Process physics, and deterministic interval changes.
- Keep Core events, Fab Loss, Design proposal context, immutable runs, CLI, Workbench, and Studio on one strict current contract.
- Rebuild current memory-fab evidence and only then decide the next physical intervention family.

### Out of scope

- Treating a rapid fallback as a fractional batch or resizing either Process.
- Guessing which unqualified or policy-excluded recipe an optimizer might prefer.
- Changing the commissioned Blueprint, evaluator, Benchmark gates, Process durations, or production outcome merely to reduce a diagnostic score.
- Recursive upstream root-cause inference or compatibility support for older evidence.

## Acceptance

- [x] With no furnace input, a zero-wait policy reports the single-lot rapid fallback and `required: 1`; with a complete preferred batch, runtime still starts the three-lot batch Process.
- [x] The Process named by each starvation interval is the same Process that becomes executable when exactly the reported missing material arrives under unchanged policy and state.
- [x] Positive batch holds and every independent-unavailability exclusion remain separate from material starvation, with exact interval conservation.
- [x] CLI JSON, human CLI, Studio, Workbench, and Design consume the same corrected Core evidence without local reinterpretation.
- [x] Current immutable memory-fab Run and Design authority replace incompatible evidence; public/full tests and browser verification pass without changing the locked industrial outcome.

## Work

- [x] Audit current furnace starts, batch policy, causal shortage events, and scheduler selection.
- [x] Define and test policy-resolved diagnostic-plan selection for zero-wait and held batch formation.
- [x] Apply the strict scheduler fix and update durable design documentation and shared projections.
- [x] Regenerate current Runs, Benchmark locks, and Design authority, then audit the corrected loss chain.
- [x] Complete public CLI, full-suite, browser, Git, and remote verification.

## Findings and decisions

- 2026-07-25 — Run `084-simulate` records twelve `rapid-anneal-dielectric-stack` starts and zero batch-anneal starts at `furnace-1`.
- 2026-07-25 — The same Run attributes all `42.456` inter-job shortage seconds to `batch-anneal-dielectric-stack` with `required: 3`, although one arriving lot immediately selects the rapid fallback. Resource, Buffer, route, and upstream state are exact; Process intent and missing quantity are not.
- 2026-07-25 — The defect is the zero-wait branch `fallback ?? selectProcessPlan(device)`: `fallback` only searches currently ready alternatives, while the second expression returns the authored preferred plan when every input is absent.
- 2026-07-25 — This is an evidence-integrity prerequisite, not a factory improvement. The locked industrial outcome should remain unchanged; only the event-backed diagnosis and hashes should move.
- 2026-07-25 — Zero-wait batch formation now resolves an unavailable preferred Process to the compatible fixed-size fallback even before fallback material is resident. The positive-wait branch is unchanged and still owns explicit formation holds.
- 2026-07-25 — Focused runtime tests prove the empty furnace reports `rapid-anneal-dielectric-stack` with `required: 1`, while an unchanged zero-wait policy still selects `batch-anneal-dielectric-stack` after three lots accumulate.
- 2026-07-25 — Current Run `085-simulate` preserves the commissioned outcome exactly: score `40.83351093666666`, 87 delivered devices, portfolio value `342`, build cost `229950`, and unchanged cadence metrics. Its result hash is `dca003d06e31aeb1bef8fb0d1264a0b258e2f69671489fbbade4bb54ba0d64cc`.
- 2026-07-25 — The corrected furnace contributor still conserves `42.456` shortage seconds, but every state now names `rapid-anneal-dielectric-stack` and one missing `dielectric-stack-lot`; Resource, Buffer, connection, source, and observed-state partitions are otherwise unchanged.
- 2026-07-25 — Current Design authority `2fc7517b47e2900bed8b5a7cdc8db8cad01809b45290fc30c4c79e9b5394686b` evaluates the same four eligible candidates, retains the unchanged seed, and closes `frontier-exhausted`. The evidence correction does not manufacture a new intervention or promotion.

## Verification

- `bun run docs:check` — 806 documentation double-links resolve.
- Focused Core scheduler and loss tests — zero-wait fallback, preferred complete batch, shortage interval conservation, and shared projections pass.
- `bun run memory-fab:relock-benchmarks` — eight Benchmark locks; the five-case greenfield contract remains `28cd57cf25ec01ad98a827a562d009ded14530ecb928131d895c1d44614d3b83`.
- `bun run ironworks:relock-benchmarks` — five Benchmark locks.
- `bun run runs:regenerate` — nine Ironworks immutable Runs.
- `bun run inm validate examples/memory-fab --json`
- `bun run inm analyze examples/memory-fab --section summary --json`
- `bun run inm simulate examples/memory-fab --section summary --json` — creates and then reuses `085-simulate`.
- `bun run inm inspect examples/memory-fab --section losses --json` — furnace evidence reports `rapid-anneal-dielectric-stack`, `required: 1`, and `42,456` conserved shortage ticks.
- `bun run inm test examples/memory-fab` — both project scenarios pass.
- `bun run inm design examples/memory-fab --program commissioned-dram-fab --run --max-candidates 7 --progress off --section summary --json` — current exhausted authority `2fc7517b47e2900bed8b5a7cdc8db8cad01809b45290fc30c4c79e9b5394686b`.
- `bun run test` — 238 package tests pass with 2,007 expectations, followed by all eight Ironworks project tests.
- Browser verification at `http://localhost:4176`: launcher, Workbench, exact Design deep link, and Factory replay load; Studio renders `rapid-anneal-dielectric-stack` and `0/1`; Factory exposes input-starved/restored events; browser logs contain no warning or error.

## Progress log

- 2026-07-25 — Plan activated before attempting another deposition/furnace intervention because current V7 evidence names a Process that the authored zero-wait policy does not next admit.
- 2026-07-25 — Scheduler fix, strict runtime assertions, and batch/runtime design invariants implemented under `inm-sim/0.84.0`.
- 2026-07-25 — Relocked thirteen Benchmarks, regenerated nine Ironworks Runs, created memory-fab Run `085-simulate`, and rebuilt strict Design authority.
- 2026-07-25 — Completed public CLI, full repository, immutable-evidence, and browser verification with the commissioned industrial result unchanged.

## Completion

Material-starvation evidence now names the fixed Process and quantity that the authored scheduling policy will actually admit next. The current memory fab no longer tells either an operator or an Agent that its zero-wait furnace needs a three-lot batch when one arriving lot resumes the rapid fallback. The correction is shared across Core, CLI, Workbench, Studio, immutable Run, and Design evidence, while the locked factory outcome and commissioning boundary remain unchanged. A subsequent plan may now investigate the exact one-lot deposition-to-furnace handoff without building on false batch demand.
