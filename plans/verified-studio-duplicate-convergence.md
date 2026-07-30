# Verified Studio duplicate convergence

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/development-operations]], [[docs/design/agent-cli-contract]], and [[plans/frictionless-industrial-design-cycle]].

## Outcome

Make ordinary portless Studio and Session entry converge multiple fully verified managers for one exact target into one source-current service, so a human or Agent can resume industrial work without learning ports or manually stopping INM-owned duplicates.

## Context

The live memory-fab target currently has two valid INM-managed instances. Port `4176` has a source-current server behind a stale manager, while port `4177` has a fully source-current manager/server pair. The lifecycle can verify both roots, selections, manager identities, source hashes, health records, state paths, and heartbeats, but portless `status`, `start`, and `session` still return `studio.multiple-target-instances` and ask the operator to stop explicit ports.

This is safe information being discarded. The system must preserve strict refusal for foreign listeners, another project, incomplete state, or unverified same-target services, while treating redundant services whose complete ownership is proven as recoverable project-local state.

## Scope

### In scope

- Discover every live manager/server generation for one exact root and project selection.
- Select one deterministic survivor, preferring a fully source-current service over stale or recovering generations.
- Let mutating portless entry (`start`, `restart`, `stop`, and `session`) retire only redundant instances with complete state-plus-health or live-heartbeat ownership.
- Keep explicit `--port` strict and keep read-only `status` diagnostic when mutation has not been authorized.
- Report duplicate convergence in typed lifecycle output and structured supervisor logs.

### Out of scope

- Killing a foreign listener, another project, a foreground Studio, or any incomplete/tampered ownership record.
- Moving a healthy fallback service merely to reclaim port `4176`.
- Changing industrial simulation, immutable Run identity, or factory design.
- Preserving the pre-release multiple-instance ambiguity contract.

## Acceptance

- [x] Portless `start` and `session` turn two fully verified instances into exactly one source-current service without an explicit port.
- [x] The survivor is deterministic and a fully current manager/server pair wins over a stale pair; ordinary work no longer depends on the numeric port.
- [x] Portless `restart` and `stop` operate on the complete verified target set, while explicit `--port` still affects exactly one instance.
- [x] Unverified same-target services, foreign listeners, and other projects remain untouched and return typed actionable errors.
- [x] CLI JSON/human output, design documentation, process tests, the real memory-fab lifecycle, and the full checkpoint prove the new contract.

## Work

- [x] Reproduce the live duplicate-manager failure and record exact ownership/source evidence.
- [x] Refactor target discovery into a typed verified-instance set and deterministic survivor policy.
- [x] Implement safe convergence for mutating portless operations and expose the result.
- [x] Update CLI/design contracts and regression tests.
- [x] Converge the real memory-fab target, verify browser/session entry, and run the full checkpoint.
- [x] Complete the acceptance audit, archive the plan, commit, and push.

## Findings and decisions

- 2026-07-31 — Live portless status fails with `studio.multiple-target-instances`: port `4176` is fully owned but manager-stale (`55842` / child `3481`), while `4177` is fully owned and current (`9252` / child `9254`).
- 2026-07-31 — The correct survivor is the already source-current `4177` pair. Reclaiming the lower/default port would add downtime and preserve port folklore rather than removing it.
- 2026-07-31 — Read-only status may diagnose duplicates, but only a mutating lifecycle command may retire them. Ownership must remain complete for every retired instance.
- 2026-07-31 — The first full checkpoint exposed a collision in the new test's fixed port arithmetic before the tested behavior ran. The test now reserves two operating-system-selected ports; three repeated targeted passes and the repeated complete checkpoint are clean.

## Verification

- Live `bun run inm studio status examples/memory-fab --json` — selected verified port `4177`, reported observed ports `4176, 4177`, and left convergence pending without mutation.
- Live `bun run inm session examples/memory-fab --investigation source-lot-back-end-service --no-open --json` — retired only `4176`, rebuilt the selected stale manager on `4177`, returned both server/manager source identities current, and opened the exact Candidate-authoring route.
- Browser `http://127.0.0.1:4177/memory-fab/investigations/source-lot-back-end-service#investigation-authoring` — rendered Run `105-simulate`, all three current evidence anchors, the source-lot tail observation, hypothesis `0002`, and Candidate authorship requirements with no console warnings or errors.
- `bun test packages/inm-cli/src/studio-lifecycle.test.ts` — `22` tests / `153` assertions passed, including deterministic start/session/restart/stop convergence, structured logging, and ownership-incomplete refusal.
- Three repeated focused convergence runs — `2/2` tests and `26` assertions passed each time with operating-system-selected temporary ports.
- `bun run check:fast` — documentation, all TypeScript projects, and `41` short tests / `285` assertions passed.
- `bun run test` — documentation and all TypeScript projects passed; `347` tests / `3,771` assertions and all `8` Ironworks fixtures passed.

## Progress log

- 2026-07-31 — Plan created from the reproduced live memory-fab lifecycle failure.
- 2026-07-31 — Replaced ambiguity with strict verified-target convergence, repaired the live duplicate, verified the Investigation workbench, and completed the full checkpoint.

## Completion

Completed on 2026-07-31. Portless lifecycle and Session entry now treat several fully owned managers as recoverable state, retain one deterministic source-current service, expose the exact reconciliation, and continue refusing every ownership-incomplete or foreign process. The live memory-fab service is one current manager/server pair on discovered port `4177`.
