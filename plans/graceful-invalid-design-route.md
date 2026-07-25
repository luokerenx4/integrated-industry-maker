# Gracefully isolate invalid Design Run routes

- Status: `completed`
- Updated: `2026-07-25`
- Related design: [[docs/design/design-programs]], [[docs/design/studio-debugger]], and [[docs/design/agent-cli-contract]].

## Outcome

A Studio deep link to obsolete or invalid Design Run evidence preserves its exact route identity and strict error code, but renders a bounded historical-evidence notice beside the still-usable Design Program and valid ranking instead of claiming that a current Design operation failed.

## Context

The memory-fab project and Studio service are healthy, but an already-open route for commissioned Run `fb2f83859df5c22beec4f378ea93ffae4a99756b8ffe3ba94d777cfa975a36d6` now fails the current strict manifest contract. Core correctly excludes it from authority and the CLI rejects direct reopen with `design.invalid-run`. Studio currently stores that selection failure in the same state used by new-run, continuation, and promotion failures, so the page displays `DESIGN OPERATION FAILED` even though no operation was attempted.

INM is pre-alpha and does not migrate obsolete run formats. The repair must preserve strict exclusion, stable deep links, and the valid/invalid evidence index while giving humans the same typed explanation an Agent receives.

## Scope

### In scope

- Keep a selected invalid Design Run error separate from current effectful-operation errors in Studio.
- Render the selected hash, stable error code, explanation of non-authority, and a route-backed way back to current valid evidence.
- Preserve the exact Core/CLI `design.invalid-run` contract and current valid/invalid evidence indexing.
- Add focused regression coverage and browser acceptance for the real memory-fab route.

### Out of scope

- Migrating, rehashing, or treating obsolete Design Runs as valid.
- Automatically deleting project-local evidence or silently redirecting a copied deep link.
- Changing Design ranking, continuation, promotion, Benchmark, Blueprint, or proposal-provider semantics.
- Solving the separate evidence-backed loss-disposition handoff.

## Acceptance

- [x] Opening an invalid memory-fab Design Run route does not render `DESIGN OPERATION FAILED` or hide the current Program/ranking.
- [x] The route renders the requested hash plus the same `design.invalid-run` code and strict message exposed to CLI/HTTP clients.
- [x] The operator can move to the current highest-ranked valid result through a real route transition; no invalid evidence becomes authoritative.
- [x] A genuine new-run, continuation, or promotion failure still uses the operation-failure surface.
- [x] Studio tests, public CLI strict-reopen evidence, browser acceptance, and full repository regression pass.

## Work

- [x] Reproduce the issue against the live memory-fab Studio and identify the state conflation.
- [x] Introduce structured response errors and selected-run issue state in the Design workbench.
- [x] Add historical-selection presentation and focused tests.
- [x] Update lasting Design/Studio documentation.
- [x] Run strict CLI/API checks, browser acceptance, and the full test suite.
- [x] Complete the acceptance audit and move this plan to completed.

## Findings and decisions

- 2026-07-25 — Studio, `/memory-fab`, and Factory all return normally with no console errors; the apparent crash is isolated to obsolete Run `fb2f83859df5…`.
- 2026-07-25 — Core currently indexes three strict valid memory-fab Design Runs and quarantines thirty-five invalid local siblings across all Programs. The existing quarantine boundary is correct and remains unchanged.
- 2026-07-25 — A selected historical failure is navigation state, not evidence that a new Design operation failed. It will receive a separate non-alert presentation while keeping the copied URL intact.
- 2026-07-25 — Structured Studio response errors retain the stable code for genuine operation failures while exposing the unprefixed API message to the historical-selection notice. This prevents the UI repair from weakening machine-visible failures.
- 2026-07-25 — Invalid local artifacts remain present and indexed deliberately. No migration, compatibility alias, deletion, ranking, or automatic redirect was added.

## Verification

- `bun test packages/inm-studio/src/design-workbench.test.ts packages/inm-studio/src/server.test.ts` — 6 tests and 128 assertions passed, including direct `design.invalid-run` API parity and selected-run/operation-error classification.
- `bun run test` — documentation, all TypeScript projects, 240 package tests and 2,024 assertions, all current demonstration-run replays, and all eight Ironworks project cases passed.
- `bun run inm test examples/memory-fab` — both checked-in memory-fab industrial cases passed.
- Direct public binary reopen of `fb2f83859df5…` — exit `1`, zero stdout bytes, and one JSON stderr envelope with `error.code: design.invalid-run` and the exact strict manifest message.
- Browser acceptance on the final rebuilt Studio — the invalid copied route retains its full hash, renders `HISTORICAL RESULT EXCLUDED`, the exact code/message, `2 VALID · 30 EXCLUDED`, no operation-failure alert, and no console warnings/errors.
- Browser route transition — `OPEN CURRENT RESULT` moves to valid Run `206067de7d35…`, renders `SELECTED RESULT`, removes the historical notice, and has no console warnings/errors.
- `git diff --check` — passed.

## Progress log

- 2026-07-25 — Plan activated after live browser reproduction and Core/CLI/Studio boundary audit.
- 2026-07-25 — Structured selection state, focused presentation, API/unit coverage, and lasting documentation implemented.
- 2026-07-25 — Strict CLI evidence, full regression, rebuilt-Studio browser acceptance, and current-result route transition passed; plan completed.

## Completion

Studio no longer makes an obsolete Design Run deep link look like a broken frontend or a failed current operation. Humans retain the copied identity, see the same strict evidence code/message as an Agent, and can move to current valid evidence; Core authority, CLI failure semantics, and effectful Design error handling remain unchanged.
