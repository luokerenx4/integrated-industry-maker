# Causal maintenance design handoff

- Status: `completed`
- Updated: `2026-07-28`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/usage-based-maintenance]], [[docs/design/operator-workbench]], and [[docs/design/design-programs]].

## Outcome

Turn the commissioned memory fab's next active maintenance/qualification signal into an exact human/Agent design task: observation skips already bounded losses, identifies the equipment and service path that owns maintenance time, and supports one deliberate locked-case maintenance intervention or a precise evidence-backed decision not to change the factory.

## Context

Run `090-simulate` ranks input starvation, yield/quality, and queue congestion first, but all three have current bounded dispositions proving that every tried improvement was rejected by the locked industrial authority. Workbench therefore advances its shared next action to `maintenance-qualification`.

The first Observation Harness implementation ignores those dispositions and chooses the first raw compatible-run diagnostic, reopening inspection starvation instead of the active queue. Maintenance evidence is also aggregate-only: it reports eight services, eight qualifications, and 124 seconds but no ordered Device contributor, component-time split, trigger/cause mix, consumables, or service-provider subjects. A human or Agent cannot tell whether to change lithography cadence, etch opportunism, provider capacity, or nothing at all.

INM is pre-alpha. This plan replaces the incomplete observation and loss projection directly; it adds no compatibility path.

## Scope

### In scope

- Make the observation brief select the Workbench's current diagnostic target after bounded dispositions and other higher-authority handoffs.
- Add exact ordered maintenance/qualification contributors per Device with conserved service, qualification, consumable-wait, and crew-wait time plus trigger/cause counts.
- Include the relevant maintenance and qualification service-provider Devices as visual subjects.
- Project the same contributor evidence through CLI, Studio Analysis, Factory observation links, and Design provider context.
- Observe the current lithography/service path, state a manual hypothesis, and evaluate the smallest explicit maintenance policy Candidate against the unchanged five-case Benchmark.

### Out of scope

- Predictive-maintenance ML, RL scheduling, stochastic lifetime calibration, or claims about real commercial fab maintenance cadence.
- Automatic application of a maintenance Candidate.
- Reopening the three current bounded loss frontiers without changed evidence.
- A general recursive causal graph beyond the exact simulator-owned maintenance metrics and provider bindings.

## Acceptance

- [x] Before maintenance is dispositioned, `inm observe ... --run 090-simulate` targets `maintenance-qualification` and returns stable views for the leading equipment and its service provider; after the exact Design disposition, it advances to `release-admission` instead of reopening a bounded diagnostic.
- [x] The maintenance bucket contains deterministic ordered Device contributors whose component sums exactly conserve all evaluator-owned maintenance/qualification/wait ticks.
- [x] CLI and Studio expose identical contributor identity, timing split, trigger/cause counts, consumables, and subjects without deriving a recommendation.
- [x] One written human/Agent hypothesis is evaluated as an exact Candidate against the unchanged locked five-case Benchmark; the result is preserved as a precise bounded decision because it fails the industrial authority.
- [x] Focused tests, full tests, public CLI checks, real browser observation, and zero incidental checked-in project mutation pass.

## Work

- [x] Audit the current observation target, bounded dispositions, maintenance metrics, policy controls, provider state, and existing project research.
- [x] Implement disposition-aware observation target selection and causal maintenance contributors.
- [x] Extend CLI/Studio presentation and tests around the exact memory-fab evidence.
- [x] Observe lithography/service behavior and evaluate one deliberate project-local maintenance Candidate.
- [x] Update durable design docs, complete the full gate, commit, and push.

## Findings and decisions

- 2026-07-28 — Workbench correctly advances past three bounded dispositions to maintenance, while Observation V1 incorrectly selects the first raw compatible diagnostic.
- 2026-07-28 — Current maintenance time is fully service-owned rather than wait-owned: 94,000 service ticks + 30,000 qualification ticks, with zero consumable/crew wait and zero cancellations.
- 2026-07-28 — Lithography generations are the leading contributors: `lithography-1` and `lithography-l2` each consume 26,000 service + 8,000 qualification ticks; etch generations each consume 21,000 + 7,000.
- 2026-07-28 — The single dual-crew provider completes all 16 assignments with peak 2/2 crews and zero wait, so adding provider capacity is not supported by current evidence.
- 2026-07-28 — `lithography-1` alone uses planned-boundary maintenance after six jobs; the other three maintained tools use opportunistic cadence. The authored hypothesis therefore tested the smallest lithography cadence refinement rather than fabricating a crew bottleneck.
- 2026-07-28 — Extending the planned boundary to seven jobs halves the exact lithography maintenance contributor from 34,000 to 17,000 ticks, but regresses all five locked cases, lowers aggregate score by 3.342370, loses 9.907084 in the lithography-interruption case, creates one drift defect, and introduces 6,023 crew-wait ticks elsewhere. The Candidate is correctly rejected.
- 2026-07-28 — The bounded maintenance disposition advances Workbench and Observation to `release-admission`; local loss reduction is evidence, not authority to promote a factory change.
- 2026-07-28 — Browser verification first exposed a stale Studio process. The owned service was identified and restarted through `inm studio restart` on the same port instead of creating another unmanaged process; the refreshed UI then projected the current four dispositions and causal contributor panel.

## Verification

- `bun run check:fast` — documentation links, all TypeScript packages/examples, and the short unit gate pass.
- `bun test packages/inm-core/src/observation.test.ts packages/inm-core/src/workbench.test.ts` — 12 pass, 0 fail.
- `bun test packages/inm-cli/src/commands.test.ts -t 'public observe|public inspect gives Agents and humans the same current loss contributors|public inspect gives Agents and humans the same bounded'` — 3 pass, 0 fail.
- `bun test packages/inm-core/src/design-program.test.ts packages/inm-cli/src/commands.test.ts packages/inm-studio/src/server.test.ts -t 'memory-fab exposes|inspection supply Design|public Design Program workflow|Studio exposes'` — 4 pass, 0 fail, including the long deterministic inspection frontier replay.
- `bun run inm validate examples/memory-fab --json` — project validation passes.
- `bun run inm observe examples/memory-fab --run 090-simulate --json` and `bun run inm inspect examples/memory-fab --run 090-simulate` — shared post-disposition target is `fab-loss.release-admission`; maintenance contributors and provider paths remain available.
- `bun run inm design examples/memory-fab --program lithography-maintenance-convergence --run --max-candidates 2 --json` — immutable Design run `630b46d261c21a6c31a39d1d0ea345eebdc73d2100224e64fb01eac2fd27dde2` records one improved local target and one locked-benchmark rejection.
- Real Studio browser on the managed `4176` service — Overview, maintenance contributor panel, lithography Device, maintenance provider, and immutable Design result render without console errors.
- `git diff -- examples/memory-fab/blueprints/generated-dram-fab.blueprint.json` — empty; no Candidate or observation operation mutated the commissioned Blueprint.

## Progress log

- 2026-07-28 — Plan created and registered after observing the conflict between the raw loss ranking and current Workbench authority.
- 2026-07-28 — Added exact per-Device maintenance/qualification contributors, conservation checks, consumable ownership, service-provider subjects, and CLI/Studio parity.
- 2026-07-28 — Made Observation follow current Workbench authority before and after a loss disposition.
- 2026-07-28 — Ran the focused lithography cadence Program against the unchanged five-case Benchmark and retained its rejection as immutable evidence.
- 2026-07-28 — Verified the current surfaces in a real browser and completed the repository gates.

## Completion

The maintenance signal is now an executable design handoff rather than an aggregate number. Humans and Agents can see which Device owns each service, qualification, wait, consumable, trigger, cause, and provider path; one authored cadence hypothesis was tested through the same locked authority and rejected for precise global regressions despite its local maintenance gain. The shared queue now advances to release admission without mutating the commissioned factory.
