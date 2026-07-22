# Agent-facing CLI contract

Status: V1 implemented.

Related: [[docs/CLI]], [[docs/design/operator-workbench]], [[docs/design/coding-agent-optimization]], [[docs/design/experiment-workbench]], [[docs/PROJECT_FORMAT]], [[plans/human-ai-workbench]].

## Purpose

`inm` is the high-bandwidth operating surface for a Coding Agent. It exposes the same Core project, analysis, planning, simulation, Benchmark, and Candidate semantics as Studio without requiring canvas interpretation, prose scraping, hidden browser state, or source-code inspection.

The contract is a presentation protocol, not a second industrial API. Commands call existing Core loaders and operations, then select and envelope their results. Project files and immutable run artifacts remain authoritative.

## Versioned envelopes

Every successful `--json` invocation writes exactly one JSON value to stdout:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "inspect",
  "context": { "scope": "project", "project": {}, "selection": {}, "hashes": {} },
  "data": {},
  "diagnostics": [],
  "artifacts": [],
  "nextActions": []
}
```

Project-selection commands include the resolved project identity, effective World/Blueprint/Scenario/Objective, and all compiled input hashes. Workspace/global commands expose their honest smaller context. Project-wide Benchmark and Candidate results retain their case or proposal hashes in `data` because they can span a selection or compare several selections.

Every failed `--json` invocation writes no stdout and exactly one error envelope to stderr:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "candidate",
  "context": { "scope": "global" },
  "error": {
    "code": "candidate.stale-base",
    "message": "...",
    "retryable": false,
    "issues": [],
    "hashes": { "expectedBaseHash": "...", "currentCandidateHash": "..." }
  }
}
```

Error codes and structured issue paths are stable machine contracts. Display messages may improve. Exit `0` means success, `1` means an operation/validation/test failure, and `2` means invalid CLI usage. JSON stdout is reserved for the result.

Long-running Design execution has one explicit secondary channel. `inm design --run --progress ndjson --json` writes compact versioned progress envelopes to stderr and exactly one ordinary success envelope to stdout at completion. Each progress record is `{ "schemaVersion": 1, "type": "progress", "command": "design", "progress": ... }`; the nested value is the same Core `DesignRunProgress` projected by Studio. The stream is ordered and deterministic, contains no timestamps, and reports actual named phases and completed/planned simulation work rather than a wall-clock estimate. `--progress human` formats the same events for a terminal, while `--progress off` disables the channel. No other stderr text may be mixed into NDJSON mode.

INM is pre-alpha. An envelope/schema version change replaces commands, documentation, and public-binary tests together; it does not add legacy output aliases.

## Discovery

`inm help --json` returns every public command with:

- stable command id and usage;
- arguments, types, requirement state, defaults, and choices;
- read/write or mode-dependent effect;
- JSON support and selectable output sections;
- success, failure, and usage exit codes.

`inm schema --json` lists every authored project artifact kind. `inm schema <kind> --json` returns a deterministic JSON Schema Draft 7 projection of the authoritative strict Zod schema. This includes workspace/project manifests, World, Blueprint, Scenario, Objective, Resource/Device assets and visuals, Process, Product Route, Benchmark, Candidate Change Set, and Design Program.

The generated schema is authoring/discovery material. Core still performs path confinement, cross-reference resolution, geometry, runtime, and other semantic compilation checks that JSON Schema alone cannot express.

## Summary-first sections

Dense JSON commands default to `{ "section": "summary", "result": ... }`. An Agent requests one advertised section with `--section <name> --json` or the complete Core result with `--section all --json`. A section is a projection of one already-computed result; it never invokes a smaller or divergent evaluator.

Current sectioned commands are `inspect`, `analyze`, `plan`, `compare`, `benchmark`, `candidate`, `design`, `synthesize`, `simulate`, and `research`. `inm help --json` is the authority for each command's section names. `--section` without `--json`, and unknown sections, fail with stable CLI codes.

Diagnostics required to understand a summary remain in the envelope's `diagnostics` field even when the selected result section is compact. `artifacts` names produced/reused paths and immutability. For `inspect`, `nextActions` contains exactly the Core-owned `ProjectWorkbenchSnapshot.nextAction`, including its exact argv, effect, confirmation requirement, Studio route, and typed target; `--section next-action --json` returns the same object in `data.result`. Other commands may return operation-specific follow-ups. An Agent never has to parse prose or shell-escape a synthesized command string.

## Source of truth

- Envelope types and builders: `packages/inm-cli/src/contract.ts`
- Command capability descriptors: `packages/inm-cli/src/capabilities.ts`
- JSON Schema projection: `packages/inm-core/src/artifact-schema.ts`
- Command result sections, progress projection, and formatting: `packages/inm-cli/src/commands.ts`
- Public parsing and exit behavior: `packages/inm-cli/src/bin.ts`

## Verification

Tests invoke the public TypeScript binary and capture its real stdout, stderr, and exit code. They prove machine help, every advertised artifact schema, compact/default/all sections, exact Core snapshot parity through `inspect --section all`, stable success/error envelopes, deliberate Candidate mutation, stale replay rejection, no extra stdout logging, and exact NDJSON parity with Core Design progress.

```bash
bun test packages/inm-core/src/artifact-schema.test.ts packages/inm-cli/src/commands.test.ts
bun run typecheck
```

## Change checklist

- Add a capability descriptor whenever a public command or argument changes.
- Add a schema kind whenever a new authored project artifact becomes part of the format.
- Keep default summaries bounded and put dense arrays behind named sections.
- Preserve one result value on stdout in JSON mode.
- Put opt-in incremental evidence on stderr as versioned NDJSON and keep it free of prose.
- Return exact argv arrays, not shell command strings, for next actions.
- Exercise success and failure through the public binary, not only an imported command function.
