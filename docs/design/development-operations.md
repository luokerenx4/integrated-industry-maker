# Development operations

Status: managed lifecycle, bounded feedback loops, reconnectable Studio work, and cooperative CLI execution implemented.

Related: [[docs/design/studio-debugger]], [[docs/design/agent-cli-contract]], [[docs/design/operator-workbench]], [[docs/CLI]], [[plans/low-friction-development-operations]], and [[plans/revocable-device-program-context]].

## Purpose

INM development should spend operator attention on industrial modeling, evidence, and design judgment. Process ownership, port selection, stale bundles, and choosing an appropriate verification boundary are infrastructure concerns and must be explicit, inspectable, and cheap.

This contract automates execution and diagnosis, not factory-design judgment. A human or Agent still chooses hypotheses and interventions from layout and simulation evidence.

## Studio lifecycle

The public lifecycle owns four operations: start, status, restart, and stop. Each operation is scoped by an explicit project or workspace root and port. The server exposes a bounded health record containing a protocol identity, engine version, process id, resolved input root, project selection, deterministic runtime-source hash, start time, and URL. The source hash covers package/lock identity and non-test Core, CLI, and Studio runtime source; it is process identity, not project-content identity.

Start probes the requested port before creating a process:

- the same healthy, source-current INM Studio is reused idempotently;
- a same-root stale Studio is replaced automatically only when project-local lifecycle state exactly verifies its PID and running source hash;
- a same-root stale foreground or otherwise unverifiable Studio is reported as an exact blocker and is never killed;
- a healthy INM Studio for another root is reported as an exact conflict;
- an unknown HTTP or TCP service is reported as unowned and is never killed;
- an unused port receives a managed Studio process and a bounded startup health check.

`status` computes the expected hash from the calling checkout and reports source as `current`, `stale`, or `not-running` alongside the expected and running hashes. Restart and stop act only on lifecycle state whose root and port match the request. They must not convert “a PID exists” or “a port is occupied” into ownership. Logs and state live below the selected root's ignored `.inm/` directory. The direct server remains available as an explicit foreground `serve` operation for test harnesses and interactive debugging.

On macOS, managed execution uses the user's service manager so the server does not inherit a transient terminal or Agent tool session. Other platforms may use a detached process backend, but must preserve the same health and non-destructive ownership rules.

## Feedback boundaries

The repository has two named confidence boundaries:

- the fast boundary covers documentation links, repository TypeScript contracts, and short package unit tests chosen for daily iteration;
- the checkpoint boundary remains the full `bun run test`, including serialized package integration tests and the public example fixture suite.

A fast pass is not described as release or merge proof. Full checks run at intentional checkpoints, not after every edit. Targeted subsystem tests remain the preferred first response while changing one known surface.

Locked Benchmark execution also removes deterministic duplicate work without hiding design decisions. Fixed baseline simulations may be reused only through the exact cache contract in [[docs/design/experiment-workbench]]; candidate simulations and every acceptance decision remain fresh.

Design execution likewise avoids duplicate work without caching Candidate decisions. Each fresh locked driver-case simulation supplies both the compact Benchmark score and the ephemeral event trace used for causal loss evidence. Three or more independent fresh cases run in bounded isolated workers and are aggregated in locked manifest order; CLI and Studio report the exact execution mode/concurrency, case evaluations, cache reuse, and timing. They never label a reused baseline as a fresh simulation. Historical continuation may explicitly replay a driver trace when the source artifact cannot retain runtime events.

Inside one exact simulation, project-local Device evaluation does not clone the complete buffer/material context on every settle pass. Core exposes one recursively lazy read-only view for the synchronous invocation, parses the declarative decision into host-owned data, then revokes every exposed proxy. This removes repeat object-graph copying without weakening state ownership or making the project script a mutable simulator participant.

## Reconnectable long work

Studio Benchmark, Candidate preview, Design run, and Design continuation are server-owned operations rather than response-owned streams. Starting work returns a project-local operation id; closing the modal, navigating, refreshing, or losing a browser connection only detaches the observer. Reopening the same Experiment or Design Program discovers the newest exact-subject operation and resumes progress/result polling.

Cancellation is explicit and cooperative. The registry records the request and aborts the running evaluator. Sequential work checks the signal between exact locked cases; a parallel wave terminates its outstanding isolated workers and rejects without partial evidence. A cancelled Design writes no partial immutable run. Once Core has crossed its atomic write/artifact boundary and returned completion, that result wins even if the request raced with completion; the registry retains the late `cancelRequestedAt` but does not invent a cancelled state around committed work. A server restart cannot recover process memory, so an unfinished persisted snapshot becomes `interrupted` with an exact error while any already completed immutable evidence remains independently reopenable.

Operational snapshots live below ignored `.inm/operations/`, retain a bounded progress log and result, and are limited to sixteen terminal records per project. They are recovery aids, not factory evidence and not a substitute for immutable Runs, Design Runs, or Candidate review receipts.

CLI Benchmark, Candidate preview/apply, Design run, and Design continuation do not depend on Studio persistence, but they use the same execution state and Core cancellation boundary. Human progress prints the operation id first. NDJSON progress repeats that id with timing/cache state, and the final success or failure envelope closes it. One `SIGINT`/`SIGTERM` requests cooperative cancellation and returns `130`; a second signal terminates immediately. This keeps terminal and headless Agent use honest without inventing resumability after the CLI process itself exits.

## Source of truth

- Lifecycle controller: `packages/inm-cli/src/studio-lifecycle.ts`
- Public parsing and discovery: `packages/inm-cli/src/bin.ts`, `packages/inm-cli/src/capabilities.ts`
- Health endpoint and foreground server: `packages/inm-studio/src/server.ts`
- Long-operation registry: `packages/inm-studio/src/operation-registry.ts`
- Repository scripts: `package.json`, `scripts/check-fast.ts`

## Verification

Lifecycle tests must prove successful startup, source-current same-root reuse, explicit current/stale status, verified stale-source replacement, restart, stop, different-root conflict, and unknown-port conflict without terminating the foreign listener. Tests use temporary projects and ports rather than the developer's active Studio.

The final manual check runs the actual managed backend, queries health/status, restarts onto current source, and leaves the memory-fab Studio available at its expected URL.
