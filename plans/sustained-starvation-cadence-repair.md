# Repair adaptive cadence with sustained-starvation control

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/production-modes]], [[docs/design/simulation-runtime]], [[docs/design/design-programs]], and [[docs/PROJECT_FORMAT]].

## Outcome

The commissioned memory fab may use its qualified agile ALD mode only after the exact furnace-bound lane has remained below its authored coverage boundary for a sustained interval, so ordinary steady-state handoff gaps stay on the normal mode while real disruption starvation can still recover; humans and Agents inspect the same control boundary, activation evidence, and locked decision.

## Context

The first explicit `downstream-starvation-recovery` controller improves four of the five locked memory-fab cases and raises weighted score by `0.960757`, but it regresses `steady-production` by `0.331053`. The loss is causal: any momentary zero-coverage observation immediately selects the faster, higher-power recipe, so normal handoff gaps are indistinguishable from persistent disruption.

Design Run `f22de3ca17b6ab6824e69ed684e987f74c502277f7fbeb4dba1da10be5a7ea21` preserves this point as a non-promotable branch with exact cadence counts and score components. The project-local provider has no physically justified repair for its `steady-production` blocker. Repeating the same frontier would therefore fabricate motion rather than improve the factory.

## Scope

### In scope

- Require an explicit positive sustained-starvation interval on every downstream-starvation cadence controller.
- Track the exact time that destination resident-plus-in-flight coverage remains below the authored boundary and select recovery only after that interval elapses.
- Preserve deterministic, job-boundary-only switching and the existing exact Connection/Resource contract.
- Expose the authored interval and measured normal/recovery activation through metrics, Benchmark, Design, CLI, and Studio.
- Sweep bounded interval values in a TypeScript project-local research script, add the best justified repair to the proposal provider, and evaluate it against the locked five-case memory-fab contract.
- Invalidate and regenerate pre-alpha evidence whose engine or project identity changes; do not migrate or alias old artifacts.

### Out of scope

- Predictive control, arbitrary PLC expressions, PID gains, or cross-Device orchestration.
- Changing a mode during an active job.
- Weakening current-best zero-regression limits, absolute industrial outcomes, or Candidate review/apply gates.
- Treating aggregate score improvement as permission to commission a case regression.

## Acceptance

- [x] A cadence controller cannot compile without a positive sustained-starvation interval, and runtime tests prove brief coverage gaps use the normal mode while an otherwise identical persistent gap uses recovery.
- [x] Factory metrics, locked Benchmark/Design evidence, CLI, and Studio expose the same authored interval and measured normal/recovery jobs.
- [x] The memory-fab TypeScript sweep evaluates a bounded interval portfolio against the exact five locked cases and records per-case score components and cadence activation.
- [x] Design either produces a promotion-safe non-empty leader patch or retains an exact bounded blocker; no unchanged or guardrail-violating controller is commissioned.
- [x] Project validation, public inspect/plan/analyze/simulate/test loops, focused tests, full tests, browser verification, documentation, Git, and remote verification pass.

## Work

- [x] Add the strict sustained-starvation contract, runtime state transition, and deterministic tests.
- [x] Extend shared cadence evidence and both operator surfaces.
- [x] Add and run the project-local TypeScript interval sweep, then update the proposal portfolio from measured evidence.
- [x] Regenerate current-format locked evidence and continue or rebuild the commissioned Design frontier.
- [x] Complete public/full/browser verification, documentation, Git, and remote audit.

## Findings and decisions

- 2026-07-24 — Threshold `1` alternates `5` normal / `7` recovery jobs in steady, mixed-quality, and quality-excursion cases, while interruption cases run `8` normal / `4` recovery. The steady regression is `-0.331053`, composed of `-0.376250` WIP, `+0.046667` cycle, and `-0.001470` energy.
- 2026-07-24 — Inventory threshold alone cannot distinguish a healthy transient gap from a disruption. Thresholds `2..6` collapse to always-agile operation, so tuning the existing scalar is exhausted.
- 2026-07-24 — The repair will be an explicit positive `minimumStarvationTicks` policy field. It is a debounce over the same physical lane, not an evaluator heuristic: coverage recovery resets the timer, and a new non-preemptive job may select recovery only after continuous below-boundary time reaches the authored interval.
- 2026-07-24 — INM is pre-alpha. The new field is required, old controller shapes are invalid, and engine/project evidence will be regenerated rather than compatibility-shimmed.
- 2026-07-24 — The bounded `1 ms, 1, 2, 3, 5, 7, 10, 15, 20 s` sweep finds `10 s` is the only promotable point. It improves every current-best case (`+0.000552`, `+0.008330`, `+1.672286`, `+1.561836`, `+0.493040`) and weighted score by `+0.773808`. The higher-scoring `7 s` point remains ineligible because steady production regresses `-0.008408`.
- 2026-07-24 — At `10 s`, steady, mixed-quality, and quality-excursion use `10` normal / `2` recovery jobs; lithography interruption uses `10/2`; facility interruption uses `11/1`. This is a bounded recovery burst rather than an always-fast recipe relabeling.
- 2026-07-24 — Design Run `1d02449c5551babc43ec542cf1cd374add97f1df5c4628eaf784bf670e43989b` retained the `10 s` controller as a non-empty `KEEP` leader; Candidate `commissioned-sustained-starvation-cadence` passed `7/7` hard guardrails and commissioned Blueprint `dea38a4fd312432e153a9de79ddc7de6dc9c44286c08759b0f9f700e446ea71d`.
- 2026-07-24 — Compatible run `078-simulate` records `10` normal / `2` recovery jobs, `2` recovery activations, `8` starvation episodes, and `198.3 s` of below-boundary observation for `deposition-1`. The refreshed run also exposes a real but sub-diagnostic `0.1` blocked item-second on `etch-to-inspection`; shared loss evidence retains it without elevating it to an operator warning.

## Verification

- `bun run typecheck`
- `bun run inm test examples/memory-fab`
- `bun run test` — `233 pass`, `0 fail`, `1960 expect()` calls; documentation, TypeScript, Core, CLI, Studio, and Ironworks project tests all passed.
- Focused Core/CLI/Studio cadence, Benchmark causality, Workbench, candidate review, and project-provider tests passed before the full suite.
- Browser acceptance against a freshly restarted `http://localhost:4176`: launcher discovered the self-contained project; `/memory-fab` loaded current run `078-simulate`; `/memory-fab/factory/devices/deposition-1` displayed `AFTER 10.0S BELOW 1`, `10 QUALIFIED / 2 AGILE-PULSE`, and `2 ACTIVATIONS`; the immutable Design Run reopened with `KEEP` and commissioning evidence; no warning or error console messages were emitted.
- Git and remote verification are recorded by the completion commit.

## Progress log

- 2026-07-24 — Plan activated from the exact retained adaptive-cadence branch and its steady-production promotion blocker.
- 2026-07-24 — Added strict sustained-starvation state, shared evidence, TypeScript interval research, a loss-guided proposal, immutable Design/Candidate review evidence, and the compatible commissioned run.
- 2026-07-24 — Completed full automated and browser acceptance on the freshly restarted Studio server.

## Completion

Completed on 2026-07-24. The commissioned ALD controller now distinguishes brief handoff gaps from sustained downstream starvation, retains ordinary qualified work in steady production, and exposes one exact causal contract to Core, CLI, Studio, Benchmark, and Design.
