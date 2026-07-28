# Causal setup/changeover design handoff

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/equipment-changeover]], [[docs/design/setup-campaign-control]], [[docs/design/operator-workbench]], [[docs/design/observation-led-design]], and [[docs/design/design-programs]].

## Outcome

Turn the commissioned memory fab's rank-seven `setup-campaign` signal into an exact human/Agent design task: separate one-time commissioning setup from recurring production changeovers and voluntary campaign holds, preserve the target Process and work at every transition, then evaluate one deliberately authored burn-in sequencing intervention against the unchanged five-case industrial authority.

## Context

After six higher-ranked losses receive compatible bounded dispositions, Workbench advances to `setup-campaign` in run `090-simulate`. The bucket reports five changeovers and 21,000 equipment-ticks, has no contributors, and names only `burn-in-1`.

The five completed transitions are not one mechanism:

- `lithography-l2` performs a 4,000-tick `null → photo-mask-l2` commissioning setup.
- `etch-l2` performs a 3,000-tick `null → etch-recipe-l2` commissioning setup.
- `burn-in-1` performs a 3,000-tick `null → reliability-screen` commissioning setup.
- `burn-in-1` performs an 8,000-tick `reliability-screen → commercial-screen` production changeover.
- `burn-in-1` performs a 3,000-tick `commercial-screen → reliability-screen` production changeover.

Thus 10,000/21,000 ticks are one-time physical commissioning, 11,000 are recurring sequencing work, and zero are campaign holds. The current bucket cannot say which transition is recoverable, which Process triggered it, or what work was waiting. The current shared handoff therefore points at a broad Program before a defensible intervention target exists.

The simulator already selects one exact Process plan before starting setup and emits start/finish/cancellation boundaries. It currently discards that Process identity from both active job state and events, while the loss projection discards the transition events entirely.

INM is pre-alpha. This plan replaces the aggregate-only contract directly and adds no compatibility path.

## Scope

### In scope

- Recover the selected target Process and ready tracked-lot identities from ordered immutable changeover/campaign and productive-start authority where such identities exist.
- Produce deterministic transition contributors for commissioning setup, recurring production changeover, and campaign hold whose work ticks exactly conserve the bucket total.
- Preserve Device, `from → to` groups, target Process, timing, power, release cause, Resources, lots, Route/step, and current policy where applicable.
- Project identical contributor evidence through CLI, Studio, Observation, Workbench, and project-local Design provider context.
- Author one focused Design Program that targets the exact 8,000-tick burn-in `reliability-screen → commercial-screen` transition and evaluates one explicit sequencing/campaign intervention against the unchanged five-case Benchmark.
- Preserve either a promotion-safe Candidate or an exact bounded rejection; do not treat unavoidable commissioning work as an instruction to optimize recurring dispatch.

### Out of scope

- Editing benchmark-owned transition duration or power.
- Automatic schedule generation, RL, black-box sequencing search, or Scenario workload changes.
- Removing commissioning setup from physical execution or Objective energy/cost accounting.
- Simultaneously optimizing the remaining transport-blocking bucket.
- Applying a Candidate without separate reviewed promotion authority.

## Acceptance

- [x] Setup contributors deterministically partition all 21,000 setup/campaign ticks and classify exactly 10,000 commissioning, 11,000 recurring changeover, and zero campaign-hold ticks.
- [x] Every changeover contributor binds an exact Device, transition, target Process, duration, power, and any available Resource/lot/Route context.
- [x] CLI and Studio expose the same ordered transition evidence; Observation focuses the exact burn-in Device before disposition.
- [x] A focused Program consumes the 8,000-tick `reliability-screen → commercial-screen` contributor rather than the aggregate Device total.
- [x] One written sequencing hypothesis is evaluated against the unchanged locked five-case Benchmark without incidental commissioned-Blueprint mutation.
- [x] After the bounded decision, Workbench and Observation advance to the next still-compatible realized loss rather than reopening setup or a nominal warning.
- [x] Focused tests, full tests, public CLI checks, real browser observation, commit, and push pass.

## Work

- [x] Audit the current Workbench handoff, setup metrics, exact transition events, Blueprint policy, provider candidates, and public surfaces.
- [x] Recover target Process authority from the immutable event sequence and implement conserved transition/campaign attribution.
- [x] Extend CLI, Studio, runtime provider types, and focused attribution tests.
- [x] Observe burn-in sequencing and evaluate one explicit focused Candidate.
- [x] Update durable design docs, complete all gates, commit, and push.

## Findings and decisions

- 2026-07-28 — The aggregate 21,000-tick bucket contains 10,000 ticks of one-time `null → group` commissioning and 11,000 ticks of two recurring burn-in group switches. Treating all of it as campaign fragmentation would be a category error.
- 2026-07-28 — `device.changeover-start/finish/cancelled` preserve transition groups but discard the already selected target Process; `device.campaign-held/released` likewise discard the selected target Process and exact ready lot identities.
- 2026-07-28 — The leading recoverable transition is `burn-in-1 reliability-screen → commercial-screen` at 8,000 ticks. `burn-in-1` currently uses `recipeDispatch: contract-value` and no campaign policy.
- 2026-07-28 — Packaged DRAM screening is fungible output work after tracked wafer-lot completion, so the exact contributor may legitimately have Resource and Process context without tracked lot identities. Empty lot context must remain explicit rather than fabricated.
- 2026-07-28 — Changing the event schema would invalidate otherwise compatible immutable Runs. The authoritative event order already records each completed changeover followed by its productive `device.start`; attribution now pairs those boundaries and validates the started Process against the target setup group. A setup group with one compiled Process is the only fallback. This preserves Run identity without weakening the current burn-in target.
- 2026-07-28 — The conserved projection produces five ordered contributors: the `8,000`-tick burn-in `reliability-screen → commercial-screen` production transition leads, followed by `4,000` lithography commissioning and three `3,000` transitions. All `21,000` ticks, five completions, Process/resource context, transition power, and energy are attributed exactly.
- 2026-07-28 — Spatial observation at `/memory-fab/factory/devices/burn-in-1?run=090-simulate` showed one shared 3×3 final-test rack with one packaged-device input, three product outputs, `contract-value / fifo` dispatch, and a directed `3–8` second changeover matrix. The view supported a scheduling hypothesis rather than a layout or transport-distance intervention.
- 2026-07-28 — Focused Candidate `dispatch:burn-in-minimize-changeover` removed the exact `8,000`-tick contributor, but every locked case regressed. Aggregate current-best score fell `61.641258`; the limiting lithography-interruption case fell `62.488768`, led by `-74` delivery value/min despite lower setup work and WIP. The correct decision is bounded rejection, not commissioning.
- 2026-07-28 — Exhausted Design authority `6a7626c73bf85cace72571fcd155c631d600000416841a519829eee5e9b91c12` binds the exact current Run and target. Workbench now carries seven bounded dispositions and advances to connection-level `probe-to-packaging` transport blocking.

## Verification

- `bun test packages/inm-core/src/fab-loss-analysis.test.ts` — 11 passed / 47 expectations, including exact current-run transition ordering and synthetic campaign-release causality.
- `bun run check:fast` — documentation links, all TypeScript surfaces, and the short unit suite passed.
- `bun run inm validate examples/memory-fab` — valid current project.
- `bun run inm design examples/memory-fab --program burn-in-changeover-convergence --run --max-candidates 1 --progress human --json` — five-case Candidate evaluated; target `8000 → 0`, Candidate rejected.
- Continued `197c4310560a…` with one additional bounded budget — provider returned no second hypothesis and produced exhausted authority `6a7626c73bf8…`.
- `bun run inm inspect examples/memory-fab --section summary --json` — exact setup disposition present; next action is `fab-loss.transport-blocking` on `probe-to-packaging`.
- Managed Studio restarted on `4176` as PID `70768`; real browser confirmed Design count `10`, the seven bounded dispositions, five ordered setup contributors, next transport handoff, and the exhausted immutable result page.
- Focused stale-snapshot reruns passed: current Observation handoff, ten-program listing, and immutable inspection-supply Design reproduction.
- `bun run test` — documentation links and all TypeScript projects passed; 265 Core/CLI/Studio tests passed with 2,236 expectations; all eight Ironworks system scenarios passed.

## Progress log

- 2026-07-28 — Plan created after the continuous queue exposed an aggregate setup signal that conflated commissioning and recurring scheduling work.
- 2026-07-28 — Added conserved setup/changeover/campaign contributors and projected them through Core, CLI, Studio, and the project-local provider contract without changing immutable Run hashes.
- 2026-07-28 — Observed the shared final-test rack, authored the one-policy focused Program, preserved the exact five-case rejection, exhausted its frontier, restarted Studio through the managed lifecycle, and verified the handoff advances to transport blocking.
- 2026-07-28 — Completed full repository verification, archived the plan, and prepared the exact implementation and immutable Design evidence for the `main` checkpoint.

## Completion

The setup bucket is now a conserved, causally actionable split: 10,000 commissioning ticks, 11,000 recurring production-changeover ticks, and zero campaign-hold ticks. The exact leading recurring target was the 8,000-tick `burn-in-1 reliability-screen → commercial-screen` transition. A one-policy `minimize-changeover` intervention removed that target but regressed every locked case, so the commissioned Blueprint remains unchanged under an exact bounded rejection. Workbench and Observation now advance to connection-level transport blocking on `probe-to-packaging`.
