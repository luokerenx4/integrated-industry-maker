# INM contributor guide

INM is a pre-alpha industrial engine. Domain correctness and a coherent model take priority over backward compatibility. When a model changes, update the active format, examples, tests, CLI output, Studio projection, and the linked design document in the same change; remove superseded behavior instead of adding migrations or aliases.

Use TypeScript for repository scripts and Device runtimes. Keep projects self-contained: a workspace owns project discovery only, never shared assets.

## Design map

Read the relevant linked document before changing a subsystem:

- Documentation ownership and update protocol: [[docs/design/documentation-system]]
- System principles and package boundaries: [[docs/ARCHITECTURE]]
- Workspace, project, and self-contained asset boundaries: [[docs/design/project-boundaries]]
- Resources, configurable recipes, ports, buffers, and instance filters: [[docs/design/material-contracts]]
- Treated material lots, treatment Devices/agents, grade-aware dispatch, and synthesis: [[docs/design/material-treatment]]
- Standard, accelerated, and productive job semantics: [[docs/design/production-modes]]
- Multi-operation equipment qualification, re-entrant routes, and ready-WIP dispatch: [[docs/design/work-center-dispatch]]
- Identity-preserving WIP lots, due dates, and cycle-time evaluation: [[docs/design/lot-tracking]]
- Scheduled lot availability, fab admission, cadence, and release-delay evaluation: [[docs/design/lot-release-scheduling]]
- Blueprint CONWIP, release waves, WIP cards, and causal admission blocking: [[docs/design/wip-release-control]]
- Fixed-size tracked-lot batches, formation wait, and Blueprint recipe alternatives: [[docs/design/batch-processing]]
- Sequence-dependent setup groups, powered changeovers, and setup-aware dispatch: [[docs/design/equipment-changeover]]
- Finite reusable tools, spatial providers, whole-job reservation, and failure trapping: [[docs/design/reusable-production-tooling]]
- Latent lot defects, inline inspection, selective rework, scrap, yield, and quality escapes: [[docs/design/quality-flow]]
- Physical belts, sorters, junctions, stacking, and station fleets: [[docs/design/logistics]]
- Spatial grids, coverage, generation, fuel, and synthesis: [[docs/design/power]]
- Deterministic state, events, failures, metrics, and immutable runs: [[docs/design/simulation-runtime]]
- Blueprint synthesis, capacity planning, research, and the file/CLI/evaluate loop: [[docs/design/blueprint-optimization]]
- Locked multi-case benchmarks and the Coding Agent keep/discard loop: [[docs/design/coding-agent-optimization]]
- Exact Blueprint patches, semantic changes, and controlled before/after evaluation: [[docs/design/blueprint-comparison]]
- Project launcher, stable routes, asset catalog, analysis, and 3D replay: [[docs/design/studio-debugger]]
- Canonical on-disk schemas and examples: [[docs/PROJECT_FORMAT]]
- Command behavior and machine-readable output: [[docs/CLI]]

## Required change loop

1. Read the relevant design document(s) above and identify the current invariant being changed.
2. Edit source files and project-local TypeScript/JSON artifacts.
3. Update every affected design document in the same change. If the concept has no document, create one under `docs/design/` and add its double-link entry here.
4. Exercise the public loop: `inm validate`, `inm analyze` or `inm plan`, then `inm simulate`/`inm test` as appropriate.
5. Run `bun run test`; it includes double-link validation, type checking, code tests, Studio tests, and project fixtures.
6. If engine semantics or hashes changed, regenerate the checked-in immutable runs and verify replay before committing.
7. If a locked Coding Agent benchmark input or contract changed, review and regenerate its `--lock`, then prove the unchanged candidate and a known improvement path.

Tests prove executable behavior; design documents explain why the behavior exists and which invariants future changes must preserve. Neither substitutes for the other.
