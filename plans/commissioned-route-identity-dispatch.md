# Converge commissioned route identity dispatch

- Status: `completed`
- Updated: `2026-07-24`
- Related design: [[docs/design/work-center-dispatch]], [[docs/design/lot-tracking]], [[docs/design/design-programs]], [[docs/design/operator-workbench]], and [[docs/design/coding-agent-optimization]].

## Outcome

Determine and commission, only when the locked industrial contract proves it, a deterministic lot-identity dispatch policy for the exact commissioned memory fab that improves wafer-lot service or Objective score without changing equipment physics, evaluator inputs, or any current-best operating case; keep project guidance, CLI evidence, and Studio evidence aligned with the resulting factory.

## Context

Compatible run `079-simulate` completes all twelve lots and overfulfills the product portfolio, but one lot finishes twelve ticks late and the realized chain still ranks input starvation, yield, queueing, maintenance, and release admission. Release control is now an identity-safe `6/5 EDD` loop with no service-age override, while six commissioned front-end and rework Devices still choose ready lot identities by FIFO.

Design Run `e7d569b5e824259ec51beef79b22957e611146444fefc4e5c80eb58ce70ec87d` was continuable after rejecting three release-window variants and one inspection-maintenance variant. Adding a researched proposal changes the Program hash by design, so that run becomes historical rather than being continued under different proposal semantics. Before expanding equipment or changing process time, the project tests whether existing physical capacity is sequencing the wrong wafer identities.

The project-local `AUTORESEARCH.md` still calls the superseded `9/6 EDD + 18 s` controller current. That stale claim is unsafe for a CLI-only Agent and must be corrected in the same human/AI evidence loop.

## Scope

### In scope

- Add a project-local TypeScript research sweep over bounded per-Device `lotDispatch` changes on the exact commissioned Blueprint.
- Compare each variant with the locked five-case Benchmark, absolute outcome guardrails, current-best zero-regression boundary, Objective component causality, lot service, and measured loss chain.
- Add one deterministic Design proposal only if research identifies a credible bounded policy; otherwise continue the current run to immutable exhaustion without inventing a candidate.
- Promote, review, apply, and simulate only a non-empty promotion-safe leader through the existing Candidate boundary.
- Correct current-project guidance and expose the same policy and decision through CLI and Studio.

### Out of scope

- Changing Process durations, Device assets, Scenario lots/due dates/failures, Objective weights, Benchmark thresholds, or evaluator code to make dispatch appear useful.
- Treating finite-campaign idle time as recoverable output.
- Adding a learned, stochastic, or browser-owned dispatch policy.
- Preserving compatibility for superseded Blueprint fields or evidence.

## Acceptance

- [x] Every tested dispatch variant is an exact Blueprint-only policy patch evaluated against all five locked cases and all seven hard outcome guardrails.
- [x] A retained leader improves aggregate score, passes capacity, does not regress any current-best case, and has a non-empty exact patch; otherwise current immutable evidence explicitly records exhaustion.
- [x] The current Blueprint and compatible run change only through Candidate review/apply when a leader exists.
- [x] `AUTORESEARCH.md`, durable design documentation, CLI, and Studio agree on the current `6/5 EDD` release controller and the route-identity dispatch decision.
- [x] TypeScript, focused tests, project tests, full repository tests, browser acceptance, Git, and remote verification pass.

## Work

- [x] Build the bounded current-factory dispatch research sweep and classify exact case outcomes.
- [x] Integrate only a researched applicable proposal and run the current Design frontier.
- [x] Commission a guarded leader or preserve exact exhausted evidence; generate a compatible run only if the factory changes.
- [x] Synchronize project guidance, design documentation, CLI/Studio evidence, and tests.
- [x] Complete the acceptance audit, commit, and push.

## Findings and decisions

- 2026-07-24 — Residual furnace input gap was already proven to be necessary finite-campaign service headroom under the current physical route; this plan tests identity sequencing rather than another wait-time or release-window sweep.
- 2026-07-24 — `lotDispatch` changes only which ready identities an already selected operation consumes. Shared-operation `recipeDispatch`, release admission, equipment physics, and locked inputs remain separate authorities.
- 2026-07-24 — Twelve non-empty variants were evaluated beside the unchanged incumbent. Only `lithography-l2: earliest-due-date` is promotion-safe: aggregate `+0.007619`, facility interruption `+0.053333`, and exactly zero delta in the other four current-best cases.
- 2026-07-24 — Wider EDD is not a safe default. Layer-one lithography, the paired lithography set, the complete front end, and all-route EDD regress lithography interruption by `-1.643644`; oldest-release and highest-priority are exact no-ops in this workload.
- 2026-07-24 — Design Run `c0d09455644c712e60daa78dceded85e39cd7587d3c09019003558497499a56a` retained the one-operation leader. Candidate `lithography-l2-edd` and review `639e2552beb8344d3e2e55eba3612265a3b2bb08b2c9738ded86bd323f284b12` applied exact Blueprint hash `967aa232816e20e936e6e3e16d63114f52971574e825185f19aa36c9394e0a07`.
- 2026-07-24 — Compatible `080-simulate` remains honest about the ordinary production window: all twelve lots complete, eleven are on time, mixed-quality score is `28.756599`, and the measured loss chain is unchanged. The proven improvement belongs to the locked facility-interruption case.

## Verification

- `bun run memory-fab:research-route-dispatch` — unique promotable `lithography-l2-earliest-due-date`; every variant evaluated across five locked cases.
- `bun test packages/inm-core/src/design-proposal-provider.test.ts` — 13 pass.
- `bun run inm test examples/memory-fab --json` — success.
- `bun run test` — documentation links, all TypeScript packages and example assets, 234 tests / 1,960 assertions, and Ironworks fixtures pass.
- CLI — Design Run `c0d09455644c`, Candidate preview/apply, and compatible Run `080-simulate` verified through public commands.
- Studio — project selector, `/memory-fab`, selected Design Run, and `/memory-fab/factory/devices/lithography-l2` load without console warnings or errors; the run reports `COMMISSIONING COMPLETE` and the Device inspector reports `authored-order / earliest-due-date`.
- Git — committed on `main`, pushed to `origin/main`, and local/remote heads verified equal.

## Progress log

- 2026-07-24 — Plan created from run `079-simulate`, current Design continuation evidence, FIFO policy audit, and stale project-local Agent guidance.
- 2026-07-24 — Added the bounded TypeScript sweep and a deterministic provider proposal; focused tests preserve the earlier adaptive-cadence priority and prove the new post-cadence route proposal.
- 2026-07-24 — Promoted, reviewed, applied, relocked, and simulated the one-field leader; updated project-local and durable documentation.
- 2026-07-24 — Completed CLI, Studio, project, and full repository acceptance.

## Completion

The commissioned memory fab now uses EDD only where the locked industrial evidence proves it: on the independently qualified layer-two lithography bay. Humans and Agents see the same applied policy, immutable decision chain, current compatible run, and fresh-loop handoff after commissioning.
