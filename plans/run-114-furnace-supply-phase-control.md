# Run 114 furnace supply phase control

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/design-programs]], and [[docs/design/operator-workbench]].

## Outcome

Carry Run 114's exact furnace input-starvation evidence through one current Investigation and a bounded test of upstream layer-one phase control, then either retain a promotion-safe intervention or preserve an explicit current defer without replaying the already exhausted furnace, transport, ALD-threshold, or etch-queue branches.

## Context

Run `114-candidate-trial-run-112-dimensional-stability` is the first current factory after commissioning explicit layer-two dimensional-stability control. Workbench ranks `furnace-1` input starvation first: nine of ten active flow Devices accumulate `240.782 s` of explicit shortage inside `1157.455 s` of repeated opportunity. The furnace contributor remains `38.856 s`; its direct deposition line delivers all twelve dielectric-stack lots at low utilization with no blocking, so another furnace, faster belt, larger local buffer, or another ALD recovery-threshold sweep is unsupported.

The earlier `run-110-furnace-supply` Investigation requalified that same local boundary through Run 112. Run 114 changes selected Blueprint identity and upstream quality timing, so the old disposition cannot decide the current diagnostic automatically. Existing layer-one etch cycle and input-queue experiments also form a negative frontier for their original queue target. The only untested industrial question is narrower: whether an already explicit etch process-control envelope can improve the phase of material arriving at ALD enough to reduce the exact furnace shortage under the current five-case authority, without treating lower etch queue time or aggregate score as proof.

## Scope

### In scope

- Bind the exact Run 114 selection, hashes, diagnostic, spatial observations, and prior negative boundaries in a current Investigation.
- Measure a small authored set of physically explicit layer-one etch phase-control variants against the exact furnace contributor and unchanged locked Benchmark.
- If one variant survives exact loss, industrial outcome, and current-best case guards, author a focused Program/Candidate and complete the human/Agent review loop; otherwise record a bounded current defer.
- Keep CLI, Studio, project evidence, docs, and Workbench next action consistent.

### Out of scope

- Repeating local furnace capacity, belt speed, buffer capacity, or ALD recovery-threshold searches.
- Reinterpreting the exhausted `front-end-queue-convergence` Program as furnace evidence.
- Autonomous search, RL, inferred layout generation, or weakening locked outcome/current-best guards.
- Backward-compatible readers or migrations for pre-alpha artifacts.

## Acceptance

- [x] One append-only Investigation records what is visible in Run 114, the exact physical hypothesis, inherited negative evidence, and an explicit KEEP, revise, defer, or discard decision.
- [x] Every evaluated phase-control variant reports the exact `furnace-1:material-input-shortage` before/after value beside delivery, WIP, quality, service, energy, and five-case decision evidence.
- [x] A Candidate is retained only if its furnace improvement is causal and promotion-safe; otherwise the current diagnostic is honestly dispositioned and remains inspectable.
- [x] CLI and Studio open the same current evidence and next action, and full repository/project verification passes.

## Work

- [x] Reproduce Run 114's Workbench handoff and audit the Run 110/112 furnace, ALD cadence, transport, and etch-queue evidence boundaries.
- [x] Create the current Investigation and record the exact observation and falsifiable upstream phase-control hypothesis.
- [x] Implement a project-local TypeScript research harness and evaluate the bounded variants against the locked Benchmark.
- [x] Author and evaluate a focused Program/Candidate only if the research survives the required guards; otherwise append the supported defer decision.
- [x] Update durable design/project evidence, verify CLI and Studio parity, run the complete regression boundary, archive, commit, and push.

## Findings and decisions

- 2026-07-31 — Run 114 reproduces the exact `38.856 s` furnace shortage partition from Run 112: `22.733 s` while `deposition-1` is processing, `6.223 s` while it is waiting for input, and the remainder while material is in local transport. The direct line is not blocked.
- 2026-07-31 — The existing ALD controller already uses `agile-pulse-fast` after a five-second downstream coverage deficit; its threshold family and local transport alternatives are historical negative evidence, not fresh candidates.
- 2026-07-31 — Existing etch modes and queue-control variants may be reused as bounded physical test instruments, but their previous queue reduction is neither sufficient nor transferable evidence for the current furnace target.
- 2026-07-31 — Spatial review confirms that furnace-1 and deposition-1 are separated by only the direct four-cell line; Studio reports 12/12 deliveries, 1.3% stage utilization, zero blocked item-ticks, 30.0% furnace utilization, and 32.1% deposition utilization. The current hypothesis therefore controls etch output phase rather than adding transport or downstream equipment.
- 2026-07-31 — The new downstream-coverage family is not promotable: `10 s` and `5 s` recover no furnace-shortage ticks; `1 s` recovers `1,000` ticks but adds `2.837567` driver-case WIP equivalent and reaches a `-2.916394` current-best case delta. The historical input-queue control also recovers `1,000` ticks but reaches `-0.000099` in lithography interruption. No Candidate is justified.
- 2026-07-31 — Entry `defer-run-114-layer-one-phase-control` targets the current observation anchor. Workbench now advances to Run 114 Probe queue congestion instead of hiding the furnace loss or reopening a mismatched Program.

## Verification

- `bun run inm inspect examples/memory-fab --section next-action --json` — Run 114 exact furnace observation handoff reproduced.
- `bun run inm observe examples/memory-fab --run 114-candidate-trial-run-112-dimensional-stability --json` — compatible selection, exact hashes, required Factory/focus/Analysis routes, and current diagnostic captured.
- `bun examples/memory-fab/strategies/research/furnace-supply-phase-control.ts` — six bounded variants evaluated across all five locked cases with exact furnace partition and current-best deltas.
- Studio Factory overview, `furnace-1`, `deposition-to-batch-furnace`, and `deposition-1` focus — exact Run 114 identity, 12/12 line flow, zero blocking, 30.0%/32.1% utilization, and installed cadence controller verified without console errors.
- `bun run check:fast` — documentation, all package TypeScript checks, and 41 focused tests pass.
- `bun run inm validate examples/memory-fab --json` — valid with zero diagnostics.
- `bun run inm analyze examples/memory-fab --json` — current analysis succeeds.
- `bun run inm test examples/memory-fab --json` — both project scenarios pass.
- `bun run test` — 357 package tests / 4,316 assertions and all eight Ironworks project scenarios pass.

## Progress log

- 2026-07-31 — Plan created after current evidence and historical intervention boundaries were audited.
- 2026-07-31 — Investigation `run-114-furnace-supply-phase-control` now retains Run 114 observation `run-114-furnace-factory` and falsifiable Blueprint hypothesis `layer-one-output-phase-control`.
- 2026-07-31 — Bounded phase-control research completed; the current targeted defer is retained and shared Workbench advances to Probe queue observation.
- 2026-07-31 — CLI/Studio parity, project validation, focused checks, and the complete repository regression boundary passed; plan archived.

## Completion

Completed with a current bounded negative frontier. No Candidate or Blueprint mutation was manufactured from a non-promotable result. Run 114 retains exact furnace evidence and an explicit targeted defer, while the shared Workbench advances to Probe queue observation. The reproducible TypeScript study, append-only Investigation, durable design documentation, and updated public-surface fixtures preserve the decision for the next human or Agent session.
