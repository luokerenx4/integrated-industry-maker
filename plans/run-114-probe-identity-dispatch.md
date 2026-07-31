# Run 114 Probe identity dispatch

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/fab-loss-attribution]], [[docs/design/observation-led-design]], [[docs/design/work-center-dispatch]], [[docs/design/source-lot-product-lineage]], and [[docs/design/operator-workbench]].

## Outcome

Determine whether one explicit Probe lot-identity dispatch policy can carry Run 114's upstream quality-control time gain into earlier downstream service without repeating the rejected Probe-cycle acceleration, then retain either a promotion-safe Candidate or an exact current negative frontier.

## Context

Current Workbench evidence binds Run `114-candidate-trial-run-112-dimensional-stability` and ranks `probe-1 / probe-sort-dram-standard` as the leading unsuppressed queue contributor: nine lots accumulate `33,932` queue ticks, `43.6%` of all completed-lot queue time. Historical Run 112 accumulated only `21,997` ticks at the same Device.

The increase is not evidence that Probe became slower. Run 114 removes the remaining inspection rework and brings `dram-lot-03` and `dram-lot-05` to Probe earlier, while Probe still runs twelve uninterrupted `8,000`-tick jobs and the complete lot mean cycle remains `59,598.5` ticks. Mean process time falls by about `630` ticks, mean queue time rises by `863` ticks, and mean transport time falls by about `233` ticks. The upstream quality gain is therefore absorbed as earlier waiting before the unchanged back-end service chronology.

The existing `run-110-probe-queue` Investigation already rejects isolated five-percent Probe acceleration: it reduces the exact local queue but shifts the downstream phase, loses ten delivered devices, and raises WIP. That result remains authoritative for cycle acceleration, but it did not test a no-capital identity-order change under Run 114's altered arrival chronology. The current Probe uses earliest-due-date dispatch; FIFO and oldest-release would serve the newly early lots in arrival/release order, while highest-priority is a bounded control for the incumbent due/priority ordering.

## Scope

### In scope

- Bind the exact Run 114 selection, hashes, diagnostic, causal hash, typed chronology, and required Studio views in one new project-local Investigation.
- Compare Run 112 and Run 114 Probe arrivals, starts, completions, and downstream source-lot service to distinguish new mechanism from historical narrative.
- Evaluate the explicit `fifo`, `oldest-release`, and `highest-priority` Probe `lotDispatch` policies against the current factory and unchanged locked Benchmark.
- Require any retained Candidate to improve meaningful cycle, WIP, delivery, or service evidence rather than merely moving queue time between locations or lot identities.
- Preserve an explicit current defer/discard decision when no variant survives the exact target, current-factory, and locked-case boundaries.

### Out of scope

- Repeating Probe cycle acceleration, adding a duplicate Probe, or changing Probe transport/buffer capacity.
- Reopening already bounded Burn-in hardware, batch-size, recipe-campaign, or tray-handoff branches without a new measured mechanism.
- Treating lower aggregate queue ticks as sufficient commissioning authority.
- Automatic policy generation, RL, unbounded parameter search, or backward-compatibility support for pre-alpha evidence.

## Acceptance

- [x] The Investigation records Run 114 typed and spatial observations and explicitly separates the changed arrival chronology from the unchanged Probe service contract.
- [x] A project-local TypeScript experiment reports exact Probe queue, lot chronology, delivery portfolio, WIP, score, quality/service guards, and all locked-case deltas for every bounded policy.
- [x] A human or Agent explicitly keeps, revises, defers, or discards the tested intervention based on current and locked evidence; the result is reopenable from CLI and Studio without chat history.
- [x] Workbench advances from the exact Run 114 Probe diagnostic only through a current Investigation decision, while the physical loss remains visible in Analysis.
- [x] Documentation, project validation, focused/full tests, and browser acceptance all pass.

## Work

- [x] Re-read current Workbench evidence and compare Run 112/114 Probe arrival and service chronology.
- [x] Create the Run 114 Investigation and append the exact spatial observation plus falsifiable dispatch hypothesis.
- [x] Implement and run the bounded TypeScript Probe dispatch experiment.
- [x] Retain a Candidate or append the exact negative decision; align Workbench and durable design documentation.
- [x] Complete CLI, Studio, regression, and completion audit; archive, commit, and push.

## Findings and decisions

- 2026-07-31 — Run 114 binds diagnostic `fab-loss.queue-congestion:device:probe-1+route:dram-front-end:fc4f8e82c4` with causal hash `49752e2b3c3277abf1e4dc44624436b5d22bb287f74cb35a6ae4c52971e877a7`; nine lots contribute `33,932` queue ticks and the maximum segment is `22,000` ticks.
- 2026-07-31 — Run 112 and Run 114 both complete all twelve Probe jobs in `96,000` processing ticks with zero Probe blocked-output time and identical mean lot cycle `59,598.5` ticks. Run 114's no-rework control reduces mean process and transport time but converts the entire gain into additional queue.
- 2026-07-31 — Run 114 brings `dram-lot-03` to Probe at tick `60,023` instead of `70,379` and `dram-lot-05` at `72,356` instead of `73,935`, but earliest-due-date still starts lots `04`, `05`, then `03` at ticks `66,023`, `74,023`, and `82,023`. This altered arrival-with-unchanged-service chronology is physically different from the discarded `19/20` cycle branch.
- 2026-07-31 — Studio confirms Probe, Packaging, and Burn-in are a direct local chain. Probe runs `40.0%` with `144.0 s` input wait and no blocked/power/failure loss; Packaging runs `60.0%`; Burn-in is the `68.3%` bottleneck and leaves `[dram-lot-07]` as eight final packaged WIP units.
- 2026-07-31 — FIFO, oldest-release, and highest-priority all change the first busy-wave identity order and reduce maximum Probe wait `22,000 → 9,667` ticks, but conserve the exact `33,932` Probe total. They advance `dram-lot-03` while correspondingly delaying `04/05`; every aggregate and per-case score and industrial metric remains unchanged.
- 2026-07-31 — No Candidate is authored. Decision `defer-local-probe-identity-dispatch` classifies the result as wait redistribution, combines it with the retained local-cycle negative boundary, and advances Workbench to `release-admission-convergence` without erasing the physical queue.

## Verification

- `bun run docs:check` — `1451` documentation double-links resolve.
- `bun run inm validate examples/memory-fab --json` — project validation returns `ok: true` with no diagnostics.
- `bun run inm test examples/memory-fab --json` — both project tests pass with deterministic result hashes.
- `bun run memory-fab:research-probe-dispatch` — all four bounded policies execute across five locked cases; a second run is byte-identical to the first.
- `bun run inm investigate examples/memory-fab --investigation run-114-probe-identity-dispatch --section all --json` — the four-entry chain, three current anchors, current defer decision, and release-admission handoff are present.
- `bun run inm inspect examples/memory-fab --section next-action --json` and `--section losses --json` — Workbench opens `release-admission-convergence` while the `33,932`-tick physical Probe queue remains visible.
- Focused Core/CLI Workbench regressions — `5` passed, `0` failed after updating the expected current project handoff.
- `bun run test` — typecheck, `357` package tests across `30` files, and all `8` Ironworks project tests pass; `0` failures.
- Studio browser acceptance — Run 114 Factory exposes the typed Probe/Packaging/Burn-in chronology and the Investigation route shows all four immutable entries, the current `DEFER`, exact source hash, and Release Admission next action without visible errors.

## Progress log

- 2026-07-31 — Plan activated from the exact Run 114 Workbench observation fallback after the bounded furnace decision.
- 2026-07-31 — Typed chronology, Studio views, Investigation entries, bounded TypeScript experiment, and current defer decision completed.
- 2026-07-31 — Core and CLI current-project assertions advanced from Probe observation to Release Admission; full validation, deterministic research, browser acceptance, and repository regression completed.

## Completion

Run 114's larger Probe queue is now explained as an earlier-arrival chronology produced by the commissioned no-rework control, not slower local equipment. Explicit FIFO, oldest-release, and highest-priority dispatch reduce maximum lot wait but conserve the exact local and route queue and every current/locked industrial outcome. No Candidate was created; the append-only current `defer` preserves this negative frontier and advances shared human/Agent work to `release-admission-convergence`.
