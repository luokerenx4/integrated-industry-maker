# Development operations

Status: managed lifecycle, bounded feedback loops, reconnectable Studio work, and cooperative CLI execution implemented.

Related: [[docs/design/studio-debugger]], [[docs/design/agent-cli-contract]], [[docs/design/operator-workbench]], [[docs/CLI]], [[plans/low-friction-development-operations]], and [[plans/revocable-device-program-context]].

## Purpose

INM development should spend operator attention on industrial modeling, evidence, and design judgment. Process ownership, port selection, stale bundles, and choosing an appropriate verification boundary are infrastructure concerns and must be explicit, inspectable, and cheap.

This contract automates execution and diagnosis, not factory-design judgment. A human or Agent still chooses hypotheses and interventions from layout and simulation evidence.

## Studio lifecycle

The public managed lifecycle owns four operations: start, status, restart, and stop. Each operation is scoped by an explicit project or workspace root plus optional workspace project selection. The port is normally discovered from that target's ignored lifecycle state and live health; `--port` is a strict diagnostic or override, not a value an operator must remember. The foreground `serve` primitive remains explicitly port-scoped and defaults to `4176`.

The server exposes a bounded health record containing a protocol identity, engine version, server process id, manager process id when managed, resolved input root, project selection, deterministic server and manager runtime-source hashes, supervisor phase/attempt/failure/retry state, start time, and URL. The expected source hash covers package/lock identity and non-test Core, CLI, and Studio runtime source; it is process identity, not project-content identity. The server hash identifies the replaceable child generation. The manager hash identifies the supervisor code loaded when that stable process started. A service is `current` only when both equal the calling checkout; this prevents a newly replaced child from falsely presenting an old port/lifecycle manager as current. `degraded` means the verified manager remains alive but the attempted source failed preflight or child startup; `recovering` means one bounded start/adoption is in progress. Portless discovery enumerates only the selected root's `.inm/studio/<port>/state.json` records, then checks their live health or exact live manager identity. A single live target instance is selected wherever it is running or waiting for a valid edit. Multiple live instances of the same target are an explicit ambiguity rather than an arbitrary choice.

When the target is not running, portless start and restart first reuse a free previously recorded project port, otherwise select `4176` when free, and otherwise select the first free port in the bounded `4176`–`4199` range. They never displace an occupant. An explicit `--port` requests exactly that port and never falls back. Start then applies the same ownership rules to the selected port:

- the same healthy INM Studio is reused idempotently only when both server and manager source are current;
- a same-root stale server or manager is replaced automatically only when project-local lifecycle state exactly verifies its manager PID and both running hashes;
- a same-root stale foreground or otherwise unverifiable Studio is reported as an exact blocker and is never killed;
- a healthy INM Studio for another root is reported as an exact conflict;
- an unknown HTTP or TCP service is reported as unowned and is never killed;
- an unused selected port receives a managed Studio process and a bounded startup health check.

Portless `status`, `restart`, and `stop` rediscover the target, so routine operation carries no port memory. JSON and human output report the selected port plus whether it was `explicit`, `managed`, `default`, or `fallback`. `status` also computes the expected hash from the calling checkout and reports source as `current`, `stale`, `degraded`, `recovering`, or `not-running` alongside the expected, serving, manager, attempted, and failure identities.

Restart and stop mutate only when state and health agree on root, project, manager PID, running server and manager hashes, deterministic service label, log path, and manager path. They must not convert “a PID exists,” “a state file exists,” or “a port is occupied” into ownership. A mismatched or incomplete state record is treated as unmanaged; another root and an unknown HTTP or TCP service are never stopped. Logs and state live below the selected root's ignored `.inm/` directory. Each fresh manager moves the prior log to `studio.previous.log` and writes newline-delimited lifecycle records with timestamps, component, event, generation, PIDs, hashes, and restart reason to the new `studio.log`; managed server startup is one `server-ready` record instead of a repeated foreground banner. The direct server remains available as the explicit foreground `serve` operation for test harnesses and interactive debugging.

Managed execution has one stable supervisor and one replaceable server child. The supervisor watches the exact files that define the runtime source hash and performs serialized two-phase adoption. It first bundles both server and browser entries in memory while the last healthy child keeps serving. Source changes observed during an adoption are collapsed into one subsequent reconciliation rather than starting concurrent handoffs; a prepared revision that is no longer latest is skipped before the serving child is touched. A failed preflight records the exact attempted hash, phase, bounded compile message, generation, retry trigger, and timestamp; the manager stays alive, the old child and port remain available, Studio shows a source-adoption notice, and the same failed hash is not retried in a busy loop. The next distinct source hash retries automatically; an explicit `start` or `session` sends one immediate retry request. Only a successful preflight terminates the old child and starts one replacement on the same port. If that child still fails before exact health readiness, the manager records `degraded` and waits for another source change instead of exiting.

Manager-only ownership is a short renewable lease, not a PID assertion. The supervisor rewrites a project-local heartbeat once per second; lifecycle discovery trusts a state file without matching HTTP health for at most five seconds. A stale state whose PID has been reused by an unrelated process is ignored and can be cleaned up without signaling that process.

After a successful child handoff, `status` may honestly report `server current / manager stale` because a running process cannot load new supervisor code into itself; the next default `start` or `session` safely replaces the verified complete service and converges both identities. The child reports both identities and the live supervisor state in health, and an attached browser receives the server hash in its WebSocket readiness message so it reloads its HTML and bundle after reconnecting to a replacement. A later unrelated exit from an already healthy current child remains fatal and visible rather than entering an unbounded crash-restart loop.

On macOS, the user's service manager owns the supervisor so it does not inherit a transient terminal or Agent tool session. Other platforms may use a detached supervisor backend, but must preserve the same health and non-destructive ownership rules.

Lifecycle tests deliberately use the detached backend so they exercise the same ownership protocol without registering persistent user services. Their child environment also supplies a bounded `INM_STUDIO_IDLE_EXIT_MS` lease. Every HTTP or WebSocket interaction renews it; if the test runner is forcibly interrupted before `finally` cleanup—or while a test has intentionally removed or corrupted lifecycle state—the abandoned test server exits independently. Normal managed Studio does not set this variable and remains persistent.

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

`inm session <path> --experiment <id>` is the ordinary bridge into that model. It composes safe source-current lifecycle repair, port discovery, authored Experiment validation, and the direct lightweight route. With `--run`, it starts the same Studio-owned Benchmark operation and returns the operation id and polling URL immediately; it does not hold the terminal open for evaluation. Human output may open the route, while `--no-open --json` gives an Agent the identical lifecycle, route, and operation identity. This is coordination convenience, not a second evaluator: `inm benchmark` remains the independent browser-free synchronous path.

Cancellation is explicit and cooperative. The registry records the request and aborts the running evaluator. Sequential work checks the signal between exact locked cases; an isolated or parallel Worker wave terminates the complete operation-owned set and rejects without partial evidence, including when cancellation arrives during Worker startup. A cancelled Design writes no partial immutable run. Once Core has crossed its atomic write/artifact boundary and returned completion, that result wins even if the request raced with completion; the registry retains the late `cancelRequestedAt` but does not invent a cancelled state around committed work. A server restart cannot recover process memory, so an unfinished persisted snapshot becomes `interrupted` with an exact error while any already completed immutable evidence remains independently reopenable.

Operational recovery state lives below ignored `.inm/operations/<id>/`. `state.json` is the lightweight committed list index, `progress.json` retains the bounded reconnect log, and completed work publishes dense `result.json` before state advertises its availability. Listing never parses progress or results; exact polling composes them. Retention is limited to sixteen terminal operation directories per project and removes every component together. Combined pre-release snapshot files are deleted rather than migrated. These records are recovery aids, not factory evidence and not a substitute for immutable Runs, Design Runs, or Candidate review receipts.

Experiment and Design project refreshes are detach/reconnect events, not operation resets. After refreshing authored catalogs or immutable evidence, each workbench immediately selects and follows the newest retained operation for its exact subject. A fast completion, source adoption, or evidence publication therefore cannot clear visible progress or a completed result merely because `refreshRevision` changed.

Experiment and Design deep links are operational surfaces rather than Factory replays. A fresh project-qualified route loads the small project index, its Benchmark or Design Program catalog, exact Candidate/evidence data, and retained-operation records it actually uses. It does not fetch the multi-megabyte event replay or construct the complete Overview and observation brief behind a modal. Closing either focused surface crosses back to the full project workbench and loads those heavier projections then. Project file watches refresh whichever surface is active instead of silently hydrating the unrelated one.

Project evidence refresh is publication-qualified. Filesystem events inside one Run or Design Run are coalesced onto that artifact's final manifest; Candidate decisions use the final review receipt. A bounded completion probe covers filesystems that report only creation of the new evidence directory. The server publishes a project-qualified WebSocket event only after Core can reopen the complete evidence. Ignored operation/cache files and partial or interrupted artifact directories are silent. An open page reloads only its own project and surface, and an explicit refresh revision invalidates the internal Design or Candidate evidence loader even when its route id did not change. A Factory deep link preserves its exact requested Run while that Run becomes readable. Workspace-manifest and project-directory changes carry a separate index-only event and synchronize the set of project-local watchers.

CLI Benchmark, Candidate preview/apply, Design run, and Design continuation do not depend on Studio persistence, but they use the same execution state and Core cancellation boundary. Human progress prints the operation id first. NDJSON progress repeats that id with timing/cache state, and the final success or failure envelope closes it. One `SIGINT`/`SIGTERM` requests cooperative cancellation and returns `130`; a second signal terminates immediately. This keeps terminal and headless Agent use honest without inventing resumability after the CLI process itself exits.

## Source of truth

- Lifecycle controller: `packages/inm-cli/src/studio-lifecycle.ts`
- Public parsing and discovery: `packages/inm-cli/src/bin.ts`, `packages/inm-cli/src/capabilities.ts`
- One-command Experiment entry: `packages/inm-cli/src/studio-lifecycle.ts`
- Health endpoint and foreground server: `packages/inm-studio/src/server.ts`
- Managed source supervisor: `packages/inm-studio/src/supervisor.ts`
- Evidence publication and watch protocol: `packages/inm-studio/src/evidence-watch.ts`, `packages/inm-studio/src/watch-protocol.ts`
- Long-operation registry: `packages/inm-studio/src/operation-registry.ts`
- Repository scripts: `package.json`, `scripts/check-fast.ts`

## Verification

Lifecycle tests must prove successful startup, source-current same-root reuse, automatic same-port server adoption, preflight failure with the last healthy child preserved, manager survival, bounded degraded status, no identical-hash busy loop, explicit retry, next-edit recovery, honest stale-manager status, verified whole-service convergence on the next default start/session, structured lifecycle logs, restart, stop, project-local port rediscovery, bounded fallback selection, ambiguity and exhaustion errors, tampered-state refusal, different-root conflict, and unknown-port conflict without terminating any foreign listener. Watch tests must prove strict readiness identity, complete evidence publication, partial-write silence, exact Run reopening, and refresh-stable Experiment/Design operation recovery. Tests use temporary projects and ports rather than the developer's active Studio.

The final manual check runs the actual managed backend, queries health/status, restarts onto current source, and leaves the memory-fab Studio available at its expected URL.
