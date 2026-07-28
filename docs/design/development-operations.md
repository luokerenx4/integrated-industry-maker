# Development operations

Status: managed lifecycle, bounded feedback loops, reconnectable Studio work, and cooperative CLI execution implemented.

Related: [[docs/design/studio-debugger]], [[docs/design/agent-cli-contract]], [[docs/design/operator-workbench]], [[docs/CLI]], [[plans/low-friction-development-operations]], and [[plans/revocable-device-program-context]].

## Purpose

INM development should spend operator attention on industrial modeling, evidence, and design judgment. Process ownership, port selection, stale bundles, and choosing an appropriate verification boundary are infrastructure concerns and must be explicit, inspectable, and cheap.

This contract automates execution and diagnosis, not factory-design judgment. A human or Agent still chooses hypotheses and interventions from layout and simulation evidence.

## Studio lifecycle

The public managed lifecycle owns four operations: start, status, restart, and stop. Each operation is scoped by an explicit project or workspace root plus optional workspace project selection. The port is normally discovered from that target's ignored lifecycle state and live health; `--port` is a strict diagnostic or override, not a value an operator must remember. The foreground `serve` primitive remains explicitly port-scoped and defaults to `4176`.

The server exposes a bounded health record containing a protocol identity, engine version, process id, resolved input root, project selection, deterministic runtime-source hash, start time, and URL. The source hash covers package/lock identity and non-test Core, CLI, and Studio runtime source; it is process identity, not project-content identity. Portless discovery enumerates only the selected root's `.inm/studio/<port>/state.json` records, then checks their live health identity. A single live target instance is selected wherever it is running. Multiple live instances of the same target are an explicit ambiguity rather than an arbitrary choice.

When the target is not running, portless start and restart first reuse a free previously recorded project port, otherwise select `4176` when free, and otherwise select the first free port in the bounded `4176`–`4199` range. They never displace an occupant. An explicit `--port` requests exactly that port and never falls back. Start then applies the same ownership rules to the selected port:

- the same healthy, source-current INM Studio is reused idempotently;
- a same-root stale Studio is replaced automatically only when project-local lifecycle state exactly verifies its PID and running source hash;
- a same-root stale foreground or otherwise unverifiable Studio is reported as an exact blocker and is never killed;
- a healthy INM Studio for another root is reported as an exact conflict;
- an unknown HTTP or TCP service is reported as unowned and is never killed;
- an unused selected port receives a managed Studio process and a bounded startup health check.

Portless `status`, `restart`, and `stop` rediscover the target, so routine operation carries no port memory. JSON and human output report the selected port plus whether it was `explicit`, `managed`, `default`, or `fallback`. `status` also computes the expected hash from the calling checkout and reports source as `current`, `stale`, or `not-running` alongside the expected and running hashes.

Restart and stop mutate only when state and health agree on root, project, PID, running source hash, deterministic service label, log path, and manager path. They must not convert “a PID exists,” “a state file exists,” or “a port is occupied” into ownership. A mismatched or incomplete state record is treated as unmanaged; another root and an unknown HTTP or TCP service are never stopped. Logs and state live below the selected root's ignored `.inm/` directory. The direct server remains available as the explicit foreground `serve` operation for test harnesses and interactive debugging.

On macOS, managed execution uses the user's service manager so the server does not inherit a transient terminal or Agent tool session. Other platforms may use a detached process backend, but must preserve the same health and non-destructive ownership rules.

## Feedback boundaries

The repository has two named confidence boundaries:

- the fast boundary covers documentation links, repository TypeScript contracts, and short package unit tests chosen for daily iteration;
- the checkpoint boundary remains the full `bun run test`, including serialized package integration tests and the public example fixture suite.

A fast pass is not described as release or merge proof. Full checks run at intentional checkpoints, not after every edit. Targeted subsystem tests remain the preferred first response while changing one known surface.

Locked Benchmark execution also removes deterministic duplicate work without hiding design decisions. Fixed baseline simulations may be reused only through the exact cache contract in [[docs/design/experiment-workbench]]; candidate simulations and every acceptance decision remain fresh.

Host execution policy is separate from industrial evaluation. CLI `auto` keeps one/two-case work sequential to minimize command wall time and uses bounded parallel Workers for three or more cases. Studio requests responsive `background` execution: one/two cases run through one isolated Worker and larger sets use the bounded parallel pool, so a short synchronous simulation cannot freeze HTTP health, polling, navigation, or cancellation. Uncached baseline cases and fresh Candidate cases use the same operation-owned executor; a Design operation continues reusing that set across seed and every Candidate wave. The set is reset after a failed wave and disposed on completion, cancellation, or failure. Source/project inputs are reloaded and compiled for every exact Worker job.

Each fresh locked driver-case simulation supplies both the compact Benchmark score and the ephemeral event trace used for causal loss evidence. Results and progress are aggregated in locked manifest order regardless of Worker finish order. CLI and Studio report `sequential`, `isolated`, or `parallel` mode, bounded concurrency, case evaluations, baseline cache reuse, cold worker startup, warm worker reuse, and wall timing. They never label a reused runtime as reused industrial evidence or a reused baseline as a fresh simulation. Historical continuation may explicitly replay a driver trace when the source artifact cannot retain runtime events.

Inside one exact simulation, project-local Device evaluation does not clone the complete buffer/material context on every settle pass. Core exposes one recursively lazy read-only view for the synchronous invocation, parses the declarative decision into host-owned data, then revokes every exposed proxy. This removes repeat object-graph copying without weakening state ownership or making the project script a mutable simulator participant.

## Reconnectable long work

Studio Benchmark, Candidate preview, Design run, and Design continuation are server-owned operations rather than response-owned streams. Starting work returns a project-local operation id; closing the modal, navigating, refreshing, or losing a browser connection only detaches the observer. Reopening the same Experiment or Design Program discovers the newest exact-subject operation and resumes progress/result polling.

Cancellation is explicit and cooperative. The registry records the request and aborts the running evaluator. Sequential work checks the signal between exact locked cases; an isolated or parallel Worker wave terminates the complete operation-owned set and rejects without partial evidence, including when cancellation arrives during Worker startup. A cancelled Design writes no partial immutable run. Once Core has crossed its atomic write/artifact boundary and returned completion, that result wins even if the request raced with completion; the registry retains the late `cancelRequestedAt` but does not invent a cancelled state around committed work. A server restart cannot recover process memory, so an unfinished persisted snapshot becomes `interrupted` with an exact error while any already completed immutable evidence remains independently reopenable.

Operational recovery state lives below ignored `.inm/operations/<id>/`. `state.json` is the lightweight committed list index, `progress.json` retains the bounded reconnect log, and completed work publishes dense `result.json` before state advertises its availability. Listing never parses progress or results; exact polling composes them. Retention is limited to sixteen terminal operation directories per project and removes every component together. Combined pre-release snapshot files are deleted rather than migrated. These records are recovery aids, not factory evidence and not a substitute for immutable Runs, Design Runs, or Candidate review receipts.

CLI Benchmark, Candidate preview/apply, Design run, and Design continuation do not depend on Studio persistence, but they use the same execution state and Core cancellation boundary. Human progress prints the operation id first. NDJSON progress repeats that id with timing/cache state, and the final success or failure envelope closes it. One `SIGINT`/`SIGTERM` requests cooperative cancellation and returns `130`; a second signal terminates immediately. This keeps terminal and headless Agent use honest without inventing resumability after the CLI process itself exits.

## Source of truth

- Lifecycle controller: `packages/inm-cli/src/studio-lifecycle.ts`
- Public parsing and discovery: `packages/inm-cli/src/bin.ts`, `packages/inm-cli/src/capabilities.ts`
- Health endpoint and foreground server: `packages/inm-studio/src/server.ts`
- Long-operation registry: `packages/inm-studio/src/operation-registry.ts`
- Repository scripts: `package.json`, `scripts/check-fast.ts`

## Verification

Lifecycle tests must prove successful startup, source-current same-root reuse, explicit current/stale status, verified stale-source replacement, restart, stop, project-local port rediscovery, bounded fallback selection, ambiguity and exhaustion errors, tampered-state refusal, different-root conflict, and unknown-port conflict without terminating any foreign listener. Tests use temporary projects and ports rather than the developer's active Studio.

The final manual check runs the actual managed backend, queries health/status, restarts onto current source, and leaves the memory-fab Studio available at its expected URL.
