# Integrated Industry Maker

**INM is a shared workbench for humans and AI Agents to design, simulate,
inspect, and improve industrial production systems.**

It treats a factory as an executable, self-contained project:

> A factory is a folder. Blueprints are programs. Scenarios are tests.
> Objectives are benchmarks. Runs are evidence.

Humans work through the visual Studio. Agents can use the typed `inm` CLI, use
Studio through a browser, or move between both. Every surface reads the same
Core model, evidence identities, and recommended next action.

INM does not ask an opaque optimizer to decide what makes a factory good.
Deterministic tools compile, simulate, attribute losses, and compare bounded
alternatives; a human or reasoning Agent owns the hypotheses, trade-offs, and
final decisions.

> [!IMPORTANT]
> INM is pre-alpha. Domain correctness takes priority over backward
> compatibility, so obsolete formats are replaced rather than maintained.

## Quick start

[Install Bun](https://bun.sh/), clone the repository, and enter the bundled
memory factory:

```bash
git clone https://github.com/luokerenx4/integrated-industry-maker.git
cd integrated-industry-maker
bun install
bun run inm session examples/memory-fab
```

`inm session` starts or reconnects to the project-local Studio, selects a safe
port, and opens the current Core-owned work item. Ordinary use should not
require manual port management.

Prefer the CLI? These commands provide a useful first tour:

```bash
# Validate and compile the selected factory.
bun run inm validate examples/memory-fab

# Inspect the current causal loss evidence.
bun run inm inspect examples/memory-fab --section losses --json

# Reopen one persistent industrial inquiry.
bun run inm investigate examples/memory-fab \
  --investigation source-lot-back-end-service \
  --json

# Open that same inquiry in Studio.
bun run inm session examples/memory-fab \
  --investigation source-lot-back-end-service
```

Use `--json` when another program or Agent will consume the result. INM's JSON
envelopes preserve the exact project selection, content hashes, artifacts,
diagnostics, effects, and next actions; consumers do not need to scrape terminal
prose.

## Choose your entry point

| If you want to… | Start here |
| --- | --- |
| Explore the factory visually | `bun run inm session examples/memory-fab` |
| Drive INM as an Agent or script | [CLI reference](docs/CLI.md) and [Agent CLI contract](docs/design/agent-cli-contract.md) |
| Understand the engine | [Architecture](docs/ARCHITECTURE.md) |
| Build a self-contained factory project | [Project format](docs/PROJECT_FORMAT.md) |
| Follow the intended design method | [Observation-led design](docs/design/observation-led-design.md) |
| Contribute to INM | [Contributor guide](AGENTS.md) and [active plans](PLANS.md) |

## North star: a re-entrant DRAM fab

The [memory-fab example](examples/memory-fab) is INM's primary product and
engineering target. A modern memory fab forces the model to deal with the hard
parts of industrial design instead of optimizing a toy linear recipe.

The example exercises re-entrant product routes, shared work centers, named lots
and fixed batches, setup campaigns, maintenance, quality and rework, WIP release,
facility utilities, power, physical and inter-zone logistics, customer
contracts, and source-lot evidence.

The smaller [Ironworks example](examples/ironworks) remains useful as a fast,
readable fixture for learning the project format and validating engine changes.

## How factory improvement works

INM's design loop is observation-led:

1. Select an exact factory, Scenario, Objective, and Production Plan.
2. Run or reopen deterministic simulation evidence.
3. Inspect loss attribution, layout, material state, and lot chronology.
4. Record an observation and a falsifiable hypothesis in an Investigation.
5. Author a Blueprint Candidate or Production Plan revision.
6. Review it against a locked Benchmark and run an exact factory trial.
7. Compare the retained Runs, then explicitly keep, revise, defer, or discard.

An [Industrial Investigation](docs/design/industrial-investigations.md) retains
that reasoning chain. Observations, hypotheses, Candidate reviews, trial Runs,
comparisons, and decisions stay bound to exact content hashes, so useful
conclusions survive beyond one browser session or chat.

The [Operator Workbench](docs/design/operator-workbench.md) projects the same
current state and next action into both Studio and the CLI.

## What the engine models today

| Area | Current model |
| --- | --- |
| Factory program | Project-local Resources, Devices, Processes, product routes, production modes, buffers, ports, and editable TypeScript Device runtimes |
| Physical plant | Multi-zone layouts, finite deposits, belts, explicit sorters and junctions, station-owned carrier fleets, power topology, and facility utilities |
| Production control | Named lots, fixed batches, re-entrant work, setup campaigns, maintenance, release control, dispatch, inspection, rework, scrap, and lineage |
| Commercial intent | Production Plans, due-dated delivery contracts, Objectives, WIP accounting, locked Benchmarks, and hash-pinned Candidates |
| Evidence | Deterministic discrete-event Runs, causal diagnostics, loss attribution, immutable comparisons, Investigations, and 3D replay |
| Human/Agent parity | One Core-owned workbench, stable deep links, typed CLI output, and persistent evidence-backed next actions |

This is an active model rather than a compatibility promise. The linked design
documents below are the durable source of current invariants.

## A project owns everything it needs

One engine workspace may discover several projects, but it owns no shared asset
catalog:

```text
my-engine/
  inm-workspace.json
  projects/
    memory-fab/
    refinery/
```

Each factory is independently executable and hashable:

```text
my-factory/
  inm.json
  assets/
    resources/<id>/
    devices/<id>/
  processes/
  product-routes/
  worlds/
  blueprints/
  production-plans/
  scenarios/
  objectives/
  benchmarks/
  candidates/
  investigations/
  runs/
  tests/
```

There is no cross-project lookup, inheritance, or fallback. Reusing an asset
means copying its complete directory into another project; the two copies then
evolve and hash independently. The full contract lives in
[Project and asset boundaries](docs/design/project-boundaries.md).

## Documentation map

### Use and extend INM

- [CLI reference](docs/CLI.md) — commands, options, output, and examples.
- [Project format](docs/PROJECT_FORMAT.md) — workspaces, manifests, assets, and
  on-disk schemas.
- [Development operations](docs/design/development-operations.md) — Studio
  lifecycle, ports, retained operations, and local debugging.
- [Studio visual debugger](docs/design/studio-debugger.md) — project routes,
  asset catalog, analysis, and 3D replay.
- [Architecture](docs/ARCHITECTURE.md) — package boundaries and the
  compile/simulate/evaluate pipeline.

### Design and evidence

- [Observation-led design](docs/design/observation-led-design.md) — human/Agent
  design authority and the required closed loop.
- [Industrial Investigations](docs/design/industrial-investigations.md) —
  persistent questions, evidence anchors, hypotheses, and decisions.
- [Operator Workbench](docs/design/operator-workbench.md) — shared orientation,
  diagnostics, operations, and next actions.
- [Blueprint comparison](docs/design/blueprint-comparison.md) — controlled
  before/after experiments.
- [Fab loss attribution](docs/design/fab-loss-attribution.md) — compatible-Run
  loss ranking and workbench priority.
- [Source-lot product lineage](docs/design/source-lot-product-lineage.md) —
  ancestry and physical-state evidence.
- [Simulation runtime](docs/design/simulation-runtime.md) — deterministic state,
  events, failures, metrics, and immutable Runs.

### Industrial model

- [Material contracts](docs/design/material-contracts.md) and
  [product routes](docs/design/product-routes.md)
- [Work-center dispatch](docs/design/work-center-dispatch.md) and
  [fab capacity planning](docs/design/fab-capacity-planning.md)
- [Lot tracking](docs/design/lot-tracking.md),
  [batch processing](docs/design/batch-processing.md), and
  [quality flow](docs/design/quality-flow.md)
- [Production Plans](docs/design/production-plans.md) and
  [WIP release control](docs/design/wip-release-control.md)
- [Logistics](docs/design/logistics.md),
  [power](docs/design/power.md), and
  [facility utilities](docs/design/fab-facility-utilities.md)

The complete subsystem index is maintained in the
[contributor guide](AGENTS.md#design-map).

## Development

```bash
# Fast local feedback while iterating.
bun run check:fast

# Full checkpoint: docs, types, package tests, and project fixtures.
bun run test
```

Repository-wide work is tracked in [PLANS.md](PLANS.md), with detailed active
and archived records under [`plans/`](plans/). The plan workflow and
documentation ownership rules are defined in
[Documentation system](docs/design/documentation-system.md).
