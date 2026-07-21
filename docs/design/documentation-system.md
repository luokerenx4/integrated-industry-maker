# Design documentation system

Status: active, pre-alpha.

## Purpose

INM is being built as a long-running industrial-engine project rather than a one-off application. Design decisions must remain discoverable while the implementation evolves. `AGENTS.md` is the routing index; files in `docs/design/` are the subsystem-level source of design intent.

The high-level architecture remains in [[docs/ARCHITECTURE]]. File schemas and command contracts remain in [[docs/PROJECT_FORMAT]] and [[docs/CLI]]. Design documents explain invariants, ownership, trade-offs, and how those public contracts are implemented.

## Link convention

Use wiki-style links for design routing:

```text
[[docs/design/material-contracts]]
[[docs/PROJECT_FORMAT]]
```

Paths are repository-root relative and omit `.md`. An optional display label or heading is allowed, for example `[[docs/design/logistics#Local cargo|local cargo]]`.

`bun run docs:check` scans Markdown files and fails on any unresolved double-link. The command is part of `bun run test`.

## Document ownership

Each design document must contain:

- scope and explicit non-goals;
- authoritative code and data locations;
- invariants that compilation or runtime must enforce;
- file → compile → runtime → analysis/Studio flow;
- verification commands and important tests;
- a checklist for changes to that subsystem;
- known gaps when the design is intentionally incomplete.

Avoid copying complete schemas or CLI help into design documents. Link to the canonical reference and describe the semantics that make those fields necessary.

## Update protocol

A code change requires a document update when it changes a domain concept, invariant, public JSON field, compiler diagnostic, runtime event, optimizer decision, CLI/JSON output, or Studio interpretation. Mechanical refactors that preserve all contracts may omit a design edit.

When a design is replaced:

1. update the existing document to describe the new model;
2. delete obsolete statements rather than preserving a historical compatibility section;
3. migrate current examples and immutable runs;
4. add or update executable evidence;
5. keep `AGENTS.md` pointing only to active documents.

Git history is the archive. Active documents describe only the current intended system.

## Review checklist

- Does every affected subsystem have an indexed design document?
- Do the described invariants match the current types, schema, compiler, and simulator?
- Can an engineer find the relevant tests and CLI commands from the document?
- Are examples and run hashes generated from the current model?
- Does `bun run docs:check` pass?
