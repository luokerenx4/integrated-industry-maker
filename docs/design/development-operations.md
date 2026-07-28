# Development operations

Status: managed lifecycle, bounded feedback loops, observable evaluation, and single-pass Design driver evidence implemented.

Related: [[docs/design/studio-debugger]], [[docs/design/agent-cli-contract]], [[docs/design/operator-workbench]], [[docs/CLI]], [[plans/low-friction-development-operations]].

## Purpose

INM development should spend operator attention on industrial modeling, evidence, and design judgment. Process ownership, port selection, stale bundles, and choosing an appropriate verification boundary are infrastructure concerns and must be explicit, inspectable, and cheap.

This contract automates execution and diagnosis, not factory-design judgment. A human or Agent still chooses hypotheses and interventions from layout and simulation evidence.

## Studio lifecycle

The public lifecycle owns four operations: start, status, restart, and stop. Each operation is scoped by an explicit project or workspace root and port. The server exposes a bounded health record containing a protocol identity, engine version, process id, resolved input root, project selection, start time, and URL.

Start probes the requested port before creating a process:

- the same healthy INM Studio is reused idempotently;
- a healthy INM Studio for another root is reported as an exact conflict;
- an unknown HTTP or TCP service is reported as unowned and is never killed;
- an unused port receives a managed Studio process and a bounded startup health check.

Restart and stop act only on lifecycle state whose root and port match the request. They must not convert “a PID exists” or “a port is occupied” into ownership. Logs and state live below the selected root's ignored `.inm/` directory. The direct server remains available as an explicit foreground `serve` operation for test harnesses and interactive debugging.

On macOS, managed execution uses the user's service manager so the server does not inherit a transient terminal or Agent tool session. Other platforms may use a detached process backend, but must preserve the same health and non-destructive ownership rules.

## Feedback boundaries

The repository has two named confidence boundaries:

- the fast boundary covers documentation links, repository TypeScript contracts, and short package unit tests chosen for daily iteration;
- the checkpoint boundary remains the full `bun run test`, including serialized package integration tests and the public example fixture suite.

A fast pass is not described as release or merge proof. Full checks run at intentional checkpoints, not after every edit. Targeted subsystem tests remain the preferred first response while changing one known surface.

Locked Benchmark execution also removes deterministic duplicate work without hiding design decisions. Fixed baseline simulations may be reused only through the exact cache contract in [[docs/design/experiment-workbench]]; candidate simulations and every acceptance decision remain fresh.

Design execution likewise avoids duplicate work without caching Candidate decisions. Each fresh locked driver-case simulation supplies both the compact Benchmark score and the ephemeral event trace used for causal loss evidence. CLI and Studio report case evaluations, cache reuse, and timing; they never label a reused baseline as a fresh simulation. Historical continuation may explicitly replay a driver trace when the source artifact cannot retain runtime events.

## Source of truth

- Lifecycle controller: `packages/inm-cli/src/studio-lifecycle.ts`
- Public parsing and discovery: `packages/inm-cli/src/bin.ts`, `packages/inm-cli/src/capabilities.ts`
- Health endpoint and foreground server: `packages/inm-studio/src/server.ts`
- Repository scripts: `package.json`, `scripts/check-fast.ts`

## Verification

Lifecycle tests must prove successful startup, same-root reuse, explicit status, restart, stop, stale state recovery, different-root conflict, and unknown-port conflict without terminating the foreign listener. Tests use temporary projects and ports rather than the developer's active Studio.

The final manual check runs the actual managed backend, queries health/status, restarts onto current source, and leaves the memory-fab Studio available at its expected URL.
