# Project and asset boundaries

Status: implemented.

Related: [[docs/ARCHITECTURE]], [[docs/PROJECT_FORMAT]], [[docs/design/studio-debugger]].

## Scope

This document owns workspace discovery, project identity, file confinement, project-local catalogs, and asset package lifecycle. It does not own industrial execution semantics inside a selected project.

## Core model

- A factory is a directory containing `inm.json` and every input needed to compile it.
- An engine workspace contains many project directories and a selected default project.
- A workspace has no Resource, Device, Process, Blueprint, World, Scenario, Objective, or run catalog of its own.
- Reuse is explicit copying. Two copied assets immediately become independent packages with independent hashes.
- Device appearance is also project-owned: each package selects its procedural profile or names its own texture/model file. Whole-factory presentation may name a project-root-confined environment image and floor palette from `inm.json`. Studio provides rendering capabilities but never an implicit shared asset catalog.
- `inm <command> <path> [--project id]` resolves exactly one project before any domain loading begins.
- Studio chooses the project at entry and uses `/<project-id>` as the stable project context. Runtime UI never switches projects from a sidebar.

## Source of truth

- Workspace/project discovery: `packages/inm-core/src/workspace.ts`
- Project loading and root confinement: `packages/inm-core/src/loader.ts`
- Manifest schemas: `packages/inm-core/src/schema.ts`
- CLI project commands and selection: `packages/inm-cli/src/`
- Studio project-scoped APIs: `packages/inm-studio/src/server.ts`
- Complete example: `examples/ironworks/`

## Invariants

1. Project manifest id equals the directory id presented by a workspace.
2. Project discovery scans one configured directory level and rejects symlink project entries.
3. Indexed asset files are relative paths confined beneath their package directory.
4. Studio file URLs include a project id and cannot traverse outside that project root.
5. Catalog hashes cover project-local Device/Resource package contents, including TypeScript runtime and package presentation files. Project-level environment imagery is validated and confined presentation metadata but does not alter industrial catalog or Blueprint identity.
6. No loader walks upward, consults another project, or falls back to an engine-global asset.
7. Creating a project copies a complete starter, including its local runtime API.

## Change flow

Any new project-owned artifact requires schema/loading, hashing, CLI selection, workspace isolation tests, Studio API confinement, and documentation updates. Any proposal for shared assets contradicts the current model; implement copying or an explicit future packaging workflow instead.

## Verification

```bash
bun run inm project list <workspace>
bun run inm validate <workspace> --project <id>
bun test packages/inm-cli/src/commands.test.ts
bun test packages/inm-studio/src/server.test.ts
```

The workspace test must prove that changing one project does not alter another project's catalogs or hashes.
