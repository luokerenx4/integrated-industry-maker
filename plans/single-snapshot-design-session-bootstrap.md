# Single-snapshot Design Session bootstrap

- Status: `completed`
- Updated: `2026-07-31`
- Related design: [[docs/design/industrial-investigations]], [[docs/design/operator-workbench]], and [[docs/design/development-operations]].

## Outcome

Open or inspect one exact Investigation/factory Design Session from one authoritative Workbench snapshot per surface request, so humans and Agents wait for industrial evidence once rather than repeatedly rebuilding identical evidence.

## Context

The completed `source-lot-back-end-service` Investigation currently takes about `6.57 s` and `1.47 GB` maximum resident memory to inspect through the CLI. The command first performs a complete Investigation inspection, then opens the same Workbench again only to construct the JSON response context.

Studio project entry separately fetches project data, overview, and observation. Overview and observation each open a complete Workbench even though the observation is a deterministic projection of that same snapshot. This duplicates Run event reads, current evidence classification, source-lot analysis, and Candidate/Design/Investigation projection on the ordinary factory entry path.

## Scope

### In scope

- Carry the exact project/selection/hash context already verified by Investigation inspection in its public result.
- Build Studio overview and observation from one snapshot through one bootstrap request, including an exact immutable Run selection.
- Preserve strict evidence identity, current/historical semantics, CLI JSON, and existing focused read endpoints.
- Measure the before/after command and project-entry request boundary.

### Out of scope

- Time-based or filesystem-watch caches that may serve stale evidence.
- Changing simulation, Objective, Candidate, or Investigation semantics.
- Combining dense Factory replay data with Workbench evidence into one long-lived mutable server object.
- General simulator hot-path work.

## Acceptance

- [x] CLI Investigation inspection constructs its response context without opening a second Workbench.
- [x] Studio obtains overview and observation from one exact snapshot for current and immutable-Run views.
- [x] Focused CLI/Core/Studio tests prove result identity and the full repository remains green.
- [x] Measured memory-fab inspection and project bootstrap cost are recorded.

## Work

- [x] Measure the duplicate CLI and Studio paths.
- [x] Add exact inspected context and remove the second CLI Workbench open.
- [x] Add and consume the single-snapshot Studio bootstrap.
- [x] Update documentation, fixtures, and verification evidence.
- [x] Complete the final performance and identity audit.

## Findings and decisions

- 2026-07-31 — The current CLI inspection is not slow only because the evidence chain is dense: `investigate --json` explicitly calls `inspectIndustrialInvestigation(...)` and then `openProjectWorkbenchSnapshot(...)` again.
- 2026-07-31 — Studio's observation is already a pure `buildFactoryObservationBrief(snapshot, runId)` projection. Returning it beside the overview does not merge authorities; it removes a second reconstruction of the same authority.
- 2026-07-31 — No TTL cache will be introduced. A single request owns one snapshot, so a completed filesystem mutation always causes the next request to rebuild exact evidence.
- 2026-07-31 — CPU profiling showed that removing only the CLI's second top-level open did not improve the `source-lot-back-end-service` inspection: four historical comparison anchors each recomputed a complete comparison and then opened another TO-Run Workbench solely to recover its diagnostic. Run comparison now returns that deterministic diagnostic projection from the already loaded TO evidence.
- 2026-07-31 — One unrelated Studio lifecycle test raced its own managed-state repair under full-suite load. The test now pauses that exact manager while asserting an incomplete-ownership state, resumes it in `finally`, and passed three repeated focused runs plus the complete suite.

## Verification

```bash
bun run typecheck
bun run docs:check
bun test packages/inm-core/src/run-comparison.test.ts
bun test packages/inm-core/src/investigation.test.ts
bun test --test-name-pattern 'public investigate' packages/inm-cli/src/commands.test.ts
bun test packages/inm-studio/src/server.test.ts
bun test --rerun-each 3 --test-name-pattern 'duplicate ownership is incomplete' packages/inm-cli/src/studio-lifecycle.test.ts
bun run test
```

- CLI memory-fab Investigation before/after: about `7.13 s / 1.49 GB` to `2.21 s / 0.78 GB` maximum resident memory, with identical manifest hash, `historical` state, 18 entries, and `observe-current-factory` handoff.
- Studio memory-fab project entry: dense `/data` remained about `0.13 s`; one immutable-Run bootstrap took about `1.06 s` versus `1.92 s` for the former parallel overview/observation pair.
- Full repository: `353` tests passed, `0` failed, `4111` expectations, plus all eight Ironworks fixtures.

## Progress log

- 2026-07-31 — Plan created after the next Burn-in schedule branch was closed by existing evidence and Design Session latency remained the clearest blocker to further industrial work.
- 2026-07-31 — Implemented request-scoped exact reuse, removed historical comparison TO-Workbench reconstruction, fixed the lifecycle test race exposed by full load, and completed full verification.

## Completion

Completed 2026-07-31. CLI Investigation inspection and Studio project entry now build each exact human/Agent evidence projection once per request. Historical comparison diagnostics reuse the same verified TO Run already loaded by comparison, cutting the current memory-fab Investigation wall time by roughly 69% and peak resident memory by roughly 48% without caching or changing any evidence identity.
