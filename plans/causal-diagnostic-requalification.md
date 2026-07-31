# Causal diagnostic requalification

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/fab-loss-attribution]], [[docs/design/industrial-investigations]], [[docs/design/operator-workbench]], and [[docs/design/observation-led-design]].

## Outcome

Let an exact Investigation decision remain useful after an unrelated engine or immutable-Run identity change only when the current compatible Run independently reproduces the same canonical causal diagnostic facts under the same selected factory sources; expose that authority as explicit requalification rather than pretending the historical Run itself is current.

## Context

Run `112-simulate` reproduces Run 110's leading `furnace-1` input-starvation contributor, subjects, total signal, supply-state partition, Blueprint, Production Plan, Scenario, World, and Objective. The intervening V9 change corrected maintenance attribution and provider accounting, but the global engine/execution identity change expired the exact Run 110 furnace `defer` decision. Workbench therefore asks a human or Agent to repeat the same observation even though the causal furnace evidence did not change.

The append-only Investigation files have not disappeared, but their queue authority is bound more coarsely than the conclusion they support. Automatic reuse based only on diagnostic prose or contributor id would be unsafe: equal totals can hide a changed physical partition. The current Run must recompute and match a canonical hash of the complete bucket facts, and any selected factory-source change must still invalidate the old judgment.

This is a pre-alpha evidence-contract correction. Existing anchors without the new fact hash remain exact history and receive no inferred authority or compatibility migration.

## Scope

### In scope

- Define one deterministic causal evidence hash for each compatible-Run fab-loss diagnostic from exact bucket facts rather than Run id, rank prose, or presentation labels.
- Capture that hash in newly authored diagnostic and factory-observation evidence.
- Requalify a targeted Investigation decision only when the current compatible Run matches its causal hash, code, subjects, loss target, project selection, and selected World/Blueprint/Production Plan/Scenario/Objective hashes.
- Keep the historical observed Run/result distinct from the current requalifying Run/result across Core, CLI, Studio, and Workbench.
- Capture Run 112 in the existing furnace Investigation, record the bounded conclusion against the new contract, and prove the shared queue advances without claiming furnace starvation vanished.

### Out of scope

- Reinterpreting old anchors that never recorded a causal evidence hash.
- Reusing Candidate, Design, Run-comparison, Objective, capacity, or static-analysis decisions through this boundary.
- Treating equal prose, score, total duration, or contributor id as sufficient requalification.
- Weakening current compatible-Run requirements or automatically authoring a new factory hypothesis.

## Acceptance

- [x] Every compatible-Run fab-loss diagnostic carries a stable causal evidence hash that changes when any exact bucket fact changes and remains stable across Run id or ranking-prose changes.
- [x] A diagnostic-target Investigation decision reports `current` for its exact observed Run and `requalified` only when a different current Run reproduces the same causal facts and selected factory-source hashes.
- [x] Engine/execution-only changes may requalify; Blueprint, Production Plan, Scenario, World, Objective, diagnostic fact, subject, or leading-contributor changes expire the decision.
- [x] CLI and Studio expose both the historical observed Run and current requalifying Run without rewriting either artifact or hiding the still-measured loss from Analysis.
- [x] The Run 112 furnace Investigation records a new hash-bearing observation and explicit decision; Workbench advances to the next honest factory task.
- [x] Focused tests, project validation, full `bun run test`, immutable replay, and browser acceptance pass.

## Work

- [x] Reproduce the Run 110 → Run 112 memory evaporation and identify global Run/execution identity as the over-broad binding.
- [x] Add canonical fab-loss diagnostic fact hashing and capture it in new Investigation anchors.
- [x] Add strict requalification projection and current/requalified public evidence.
- [x] Continue the existing furnace Investigation on Run 112 and verify the next shared handoff.
- [x] Complete documentation, fixtures, full verification, plan audit, commit, and push.

## Findings and decisions

- 2026-07-31 — Run 112 retains Blueprint `1e1211d6be36`, the same selected World/Production Plan/Scenario/Objective hashes, the same `furnace-1 → deposition-to-batch-furnace → deposition-1` subjects, `38,856` leading starvation ticks, and the same direct supply-state partition as Run 110. Only engine/execution/result identity changed for the maintenance V9 correction.
- 2026-07-31 — Existing diagnostic ids hash presentation text containing the immutable Run id, so identical physical facts necessarily receive a different id on every new Run. That identity is suitable for a view instance, not for accumulated causal judgment.
- 2026-07-31 — Old anchors store only summary prose and a leading contributor id, which is too weak for automatic requalification. They remain history; Run 112 will seed the first full causal fact hash.
- 2026-07-31 — The canonical hash commits the complete bucket id, score, subjects, evidence, and contributor facts while excluding Run identity, rank prose, bucket/contributor labels, and summaries.
- 2026-07-31 — Requalification preserves the observed historical Run separately from the current independently matching Run. It permits engine/execution changes only after selected factory-source hashes and exact diagnostic facts agree.
- 2026-07-31 — A newer decision for the same diagnostic code supersedes older decisions within one Investigation even when its own evidence later becomes historical; causal hashes establish authority but must not let superseded judgment revive.
- 2026-07-31 — Browser observation of Run 112 confirmed furnace utilization `30.0%`, `38.9s` attributed shortage, a `1.3%` utilized deposition-to-furnace line with zero blocked item-ticks, and upstream deposition utilization `32.1%` with three cadence-control activations. Studio reported no console warnings or errors.

## Verification

- `bun run docs:check` — `1427` documentation double-links resolve.
- `bun run typecheck` — Core, CLI, Studio, Ironworks assets, and memory-fab assets compile.
- `bun test --max-concurrency=1 packages/inm-core/src/workbench.test.ts packages/inm-core/src/investigation.test.ts` — `18` tests and `169` assertions pass, including exact-current/requalified authority and every source/hash/fact invalidation boundary.
- `bun test packages/inm-cli/src/commands.test.ts -t "public inspect gives Agents and humans the same current WIP and Design evidence boundary"` — updated public CLI next-action fixture passes.
- `bun run test` — `355` package tests and `4207` assertions pass; all eight Ironworks fixtures pass.
- `bun run inm test examples/memory-fab` — both memory-fab industrial fixtures pass.
- `bun run inm validate examples/memory-fab` — `generated-dram-fab` compiles at World `6db685b8705d`, Blueprint `1e1211d6be36`, and Production Plan `b6fd2a4e6075`.
- `bun run inm inspect examples/memory-fab --section dispositions --json` — the Run 112 furnace decision is `current`, retains observed/current evidence plus causal hash `529cd629c637`, suppresses only the queue item, and advances to `fab-loss.queue-congestion`.
- Browser acceptance — Studio rendered the V20 current-decision panel, retained furnace loss in the measured chain, led with Probe queue observation, and reported no console warnings/errors. Focused Factory replay confirmed the furnace, connection, and deposition evidence.
- `bun run inm session examples/memory-fab --no-open` — redundant verified managers converged to one source-current managed Studio at `4176`; after test isolation, the same port was restored source-current.

## Progress log

- 2026-07-31 — Plan created from the repeated furnace observation handoff after the maintenance evidence upgrade.
- 2026-07-31 — Added canonical bucket-fact identity, strict exact/requalified Investigation authority, public current-evidence projection, and Workbench V20.
- 2026-07-31 — Appended Run 112 observation and defer decision to `run-110-furnace-supply`; the shared queue advanced to the exact Probe contributor without hiding furnace loss.
- 2026-07-31 — Updated Core, CLI, Studio, design contracts, README navigation, and north-star fixtures; completed full automated and browser verification.

## Completion

Workbench V20 now lets historical human/Agent judgment accumulate across unrelated engine or Run identity changes without weakening industrial evidence. A decision can requalify only when a current compatible Run independently reproduces the complete canonical causal facts under the same selected factory sources; old anchors, changed facts, changed sources, comparison evidence, and superseded decisions all fail closed. Run 112 seeds the first hash-bearing furnace checkpoint and advances current work to the Probe queue contributor. The still-measured furnace loss remains visible in CLI and Studio.
