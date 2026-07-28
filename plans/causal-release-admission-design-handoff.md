# Causal release-admission design handoff

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/lot-release-scheduling]], [[docs/design/wip-release-control]], [[docs/design/operator-workbench]], and [[docs/design/design-programs]].

## Outcome

Turn the commissioned memory fab's current release-admission signal into an exact human/Agent design task: identify every delayed lot, conserve its physical and controller-owned admission wait, expose its planned/due/priority/release order and release boundary, and evaluate one deliberately authored one-card CONWIP intervention against the unchanged five-case industrial authority.

## Context

After four higher-ranked loss paths receive current bounded dispositions, Workbench advances to `release-admission` in compatible run `090-simulate`. The aggregate signal reports six control-blocked lots and 171.738 lot-seconds, but its contributor list is empty and its only subject is a project-family placeholder. Observation can open the factory and a diagnostic card, but cannot focus the `lot-release` Device, the tracked Route, or the exact lot identities.

The final state already contains exact per-lot cause time, while public release events preserve planned and actual admission, controller state, service protection, and active WIP. Scenario authority owns due date and priority. The current loss projection discards this evidence before it reaches CLI, Studio, Observation, or a proposal provider.

The aligned broad Design Program has no valid current run and mixes release policy with unrelated factory interventions. A focused Program must consume one exact release contributor rather than treating all controller-blocked time as an instruction to increase WIP.

INM is pre-alpha. This plan replaces the incomplete projection directly and adds no compatibility path.

## Scope

### In scope

- Add deterministic per-lot release-admission contributors whose cause components conserve evaluator-owned capacity and CONWIP blocked ticks.
- Preserve Scenario-owned planned tick, due tick, priority, Resource, release boundary, and Route beside event-owned actual release order, delay, active WIP, and service protection.
- Make Observation focus the release Device and tracked Route, with identical contributor evidence in CLI, Studio, and Design provider context.
- Author one project-local focused Design Program that tests `6/5 EDD` against the smallest one-card `7/6 EDD` intervention without changing arrivals, due dates, priorities, or service guardrails.
- Preserve either a promotion-safe Candidate or an exact bounded rejection; never infer that lower admission wait alone is a better factory.

### Out of scope

- Learned release policies, RL, arrival forecasting, per-family kanban, cancellation, or editing Scenario workload.
- Automatically applying a release-control Candidate.
- Reopening current inspection, yield, queue, or maintenance dispositions.
- Treating intentional CONWIP waiting as intrinsically wasteful independent of WIP, delivery, setup, quality, and locked cases.

## Acceptance

- [x] The release-admission bucket contains deterministic ordered lot contributors whose reason components exactly conserve all evaluator-owned release-blocked ticks.
- [x] `inm observe ... --run 090-simulate` opens stable run-qualified views for the exact release boundary and tracked Route before disposition, and advances after the bounded Design decision.
- [x] CLI and Studio expose identical lot identity, planned/actual/due timing, priority, release order, cause split, controller state, and service-protection evidence.
- [x] One written human/Agent hypothesis changes only the current CONWIP card thresholds and is evaluated against the unchanged locked five-case Benchmark.
- [x] Focused tests, full tests, public CLI checks, real browser observation, and zero incidental commissioned-Blueprint mutation pass.

## Work

- [x] Audit the current loss bucket, release events/state, controller policy, prior release research, Workbench handoff, and public surfaces.
- [x] Implement exact per-lot release-admission attribution and conservation.
- [x] Extend Observation, CLI, Studio, runtime provider types, and focused tests.
- [x] Observe the release boundary and evaluate one explicit one-card Candidate.
- [x] Update durable design docs, complete all gates, commit, and push.

## Findings and decisions

- 2026-07-28 — Run `090-simulate` releases all twelve lots but six identities wait exactly 171,738 controller-owned lot-ticks; physical buffer/resource capacity contributes zero.
- 2026-07-28 — `dram-lot-07` is the leading contributor at 63,623 ticks, followed by lot 08 at 49,623 and lot 09 at 35,623. Current aggregate presentation erases this distribution.
- 2026-07-28 — The current `6/5 EDD` controller is intentional commissioned policy and previously preserved locked on-time service. Release wait is therefore a design trade signal, not proof that more WIP is desirable.
- 2026-07-28 — Existing events plus Scenario declarations are sufficient to reconstruct exact cause intervals, planned/actual admission, deadline, priority, release order, active WIP, boundary Device/buffer, Resource, and tracked Route without adding simulator state or inventing evidence.
- 2026-07-28 — The smallest falsifiable intervention is `7/6 EDD` with no service-age override: add one hard card and keep one-for-one replenishment and EDD unchanged.
- 2026-07-28 — Focused Design Run `1a23962af0674431da235210d017fa8cba39c296ecca06d4f61ff2e5a67ed49d` reduces the leading contributor from 63,623 ticks to zero, proving the patch and attribution are causally connected.
- 2026-07-28 — The same Candidate regresses every locked current-best case by `1.281174` to `4.195055`, lowers aggregate current-best score by `2.488473`, and reduces facility-interruption on-time lots from nine to eight. The `6/5 EDD` seed is therefore retained.
- 2026-07-28 — The exhausted one-card frontier becomes the fifth automatically invalidating bounded disposition. Workbench and Observation advance to the remaining nominal `blank-dram-wafer-lot` material-deficit diagnostic without erasing the intentional controller wait.

## Verification

- `bun run check:fast` — 921 documentation links, all TypeScript packages/examples, and 19 short tests pass.
- `bun run test` — 261 serial Core/CLI/Studio tests pass with 2,212 expectations, followed by all eight Ironworks project checks.
- `bun test packages/inm-core/src/fab-loss-analysis.test.ts packages/inm-core/src/observation.test.ts packages/inm-core/src/workbench.test.ts` — 22 pass, 0 fail.
- `bun test packages/inm-cli/src/commands.test.ts -t 'public inspect summary exposes|public observe binds|public inspect gives Agents and humans the same current loss contributors|public inspect gives Agents and humans the same bounded physical-loss dispositions'` — 4 pass, 0 fail.
- `bun test packages/inm-core/src/design-program.test.ts -t 'memory-fab exposes authored and synthesis-seeded Design Programs with read-only briefs'` — 1 pass, 0 fail.
- `bun test packages/inm-studio/src/server.test.ts -t 'Studio exposes the same memory-fab Design Program, immutable run, and guarded promotion contract'` — 1 pass, 0 fail, including the real Studio Design HTTP surface.
- `bun test packages/inm-cli/src/commands.test.ts -t 'public Design Program workflow discovers, inspects, and executes without mutating its seed Blueprint'` — 1 pass, 0 fail, including locked multi-case execution.
- `bun run inm validate examples/memory-fab --json` — project validation passes.
- `bun run inm inspect examples/memory-fab --section losses --json` — release admission has six ordered contributors, `171738` attributed/controller ticks, and zero unattributed/capacity ticks.
- `bun run inm design examples/memory-fab --program release-admission-convergence --run --max-candidates 2 --progress ndjson --json` — immutable Run `1a23962af0674431da235210d017fa8cba39c296ecca06d4f61ff2e5a67ed49d` records one locally improved and globally rejected Candidate.
- Real Studio browser on the managed `4176` service — Route Catalog deep link, release boundary context, post-run fifth disposition, next action, and eight-program count render; console contains no errors.
- `git diff --exit-code -- examples/memory-fab/blueprints/generated-dram-fab.blueprint.json` — empty.

## Progress log

- 2026-07-28 — Plan created and registered after the active Workbench handoff exposed an aggregate-only release signal and a non-focused Design route.
- 2026-07-28 — Added exact per-lot release contributors with strict aggregate conservation and shared CLI/Studio/Observation subjects.
- 2026-07-28 — Observed the release boundary and tracked Route, then ran the single authored `7/6 EDD` hypothesis against all five locked cases.
- 2026-07-28 — Preserved the rejection as immutable bounded evidence and verified that the shared queue advances without mutating the commissioned Blueprint.

## Completion

Release admission is now an exact design handoff rather than an aggregate controller statistic. Humans and Agents can inspect which lot waited, why, when it was planned and admitted, its due/priority/order state, and the physical boundary and Route involved. The one-card hypothesis proved that the leading wait is removable but also proved why it should remain under the current industrial authority: higher WIP damages every locked case and loses interruption service. The commissioned factory stays unchanged, the decision remains automatically invalidatable evidence, and the shared queue advances.
