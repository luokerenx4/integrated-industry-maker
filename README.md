# Integrated Industry Maker

**INM is a shared workbench for humans and AI Agents to design, simulate,
inspect, and improve industrial production systems.**

> A factory is a folder. Blueprints are programs. Scenarios are tests.
> Objectives are benchmarks. Runs are evidence.

[Quick start](#quick-start) · [How it works](#how-factory-improvement-works) ·
[Memory-fab example](examples/memory-fab/README.md) ·
[CLI reference](docs/CLI.md) · [Project format](docs/PROJECT_FORMAT.md) ·
[Architecture](docs/ARCHITECTURE.md)

INM gives people a visual Studio and gives Agents a typed `inm` CLI. Both
surfaces use the same Core model, evidence identities, and recommended next
action. An Agent may also operate Studio through a browser; the interface is a
view of the same project, not a separate source of truth.

![INM Studio showing the re-entrant DRAM memory fab and its current run evidence](docs/assets/inm-studio-memory-fab.jpg)

INM does **not** ask an opaque optimizer to decide what makes a factory good.
The engine compiles, simulates, attributes losses, and compares bounded
alternatives. A human or reasoning Agent owns the hypothesis, trade-offs, and
final decision.

> [!IMPORTANT]
> INM is pre-alpha. Domain correctness takes priority over backward
> compatibility, so obsolete formats are replaced rather than maintained.

## Quick start

Prerequisite: [Bun](https://bun.sh/).

```bash
git clone https://github.com/luokerenx4/integrated-industry-maker.git
cd integrated-industry-maker
bun install
bun run inm session examples/memory-fab
```

`inm session` starts or reconnects to the project-local Studio, chooses a safe
port, and opens the current Core-owned work item. Ordinary use does not require
manual port management.

### A short CLI tour

```bash
# Validate and compile the selected factory.
bun run inm validate examples/memory-fab

# Read the current project status and recommended next action.
bun run inm inspect examples/memory-fab --json

# Inspect causal physical-loss evidence.
bun run inm inspect examples/memory-fab --section losses --json

# Reopen one completed evidence-backed design inquiry.
bun run inm investigate examples/memory-fab \
  --investigation run-105-layer-two-quality \
  --json

# Open that same inquiry in Studio.
bun run inm session examples/memory-fab \
  --investigation run-105-layer-two-quality
```

Use `--json` when another program or Agent consumes the result. JSON envelopes
include the exact selection, content hashes, artifacts, diagnostics, effects,
and next actions; consumers never need to scrape terminal prose. See the
[CLI reference](docs/CLI.md) and
[Agent CLI contract](docs/design/agent-cli-contract.md) for the full contract.

## Choose an entry point

| If you want to… | Start here |
| --- | --- |
| Explore a factory visually | Run `bun run inm session examples/memory-fab` and read the [Studio guide](docs/design/studio-debugger.md) |
| Operate INM as an Agent or script | Read the [CLI reference](docs/CLI.md) and [Agent CLI contract](docs/design/agent-cli-contract.md) |
| Build a self-contained factory project | Start with the [project format](docs/PROJECT_FORMAT.md) and [project boundaries](docs/design/project-boundaries.md) |
| Understand the intended design method | Read [observation-led design](docs/design/observation-led-design.md) and [Industrial Investigations](docs/design/industrial-investigations.md) |
| Understand or change the engine | Read the [architecture](docs/ARCHITECTURE.md), then the [contributor guide](AGENTS.md) |

## What exists today

The engine currently models:

- project-local Resources, Devices, Processes, modes, buffers, ports, and
  editable TypeScript Device runtimes;
- multi-zone layouts, belts, explicit sorters, carrier fleets, power topology,
  and facility utilities;
- named lots, fixed batches, re-entrant work, setup, maintenance, release
  control, dispatch, inspection, rework, scrap, and product lineage;
- Production Plans, delivery contracts, Objectives, WIP accounting, locked
  Benchmarks, and hash-pinned Candidates;
- immutable Runs, causal diagnostics, loss attribution, comparisons,
  Investigations, and 3D replay.

The detailed, current contracts live in the [documentation map](#documentation).

## How factory improvement works

INM uses an observation-led design loop:

1. Select an exact factory, Scenario, Objective, and Production Plan.
2. Run or reopen deterministic simulation evidence.
3. Inspect loss attribution, spatial flow, material state, and lot chronology.
4. Record an observation and a falsifiable hypothesis.
5. Author one Blueprint Candidate or Production Plan revision.
6. Review it against a locked Benchmark and freeze an exact trial Run.
7. Compare the evidence, then explicitly keep, revise, defer, or discard.

An [Industrial Investigation](docs/design/industrial-investigations.md) keeps
that reasoning chain append-only and bound to exact hashes. The
[Operator Workbench](docs/design/operator-workbench.md) projects its current
status and next action consistently into Studio and the CLI. The governing
method is described in
[Observation-led design](docs/design/observation-led-design.md); bounded
multi-case proposal evaluation is described in
[Design Programs](docs/design/design-programs.md).

## North star: a re-entrant DRAM fab

The [memory-fab example](examples/memory-fab/README.md) is INM's primary product
and engineering target. A modern memory fab forces the model to handle
re-entrant routes, shared work centers, quality excursions, maintenance,
utilities, WIP, service commitments, and source-lot evidence instead of
optimizing a toy linear recipe.

The smaller [Ironworks example](examples/ironworks/README.md) is a faster,
more readable fixture for learning the project format and validating engine
changes.

## Projects are self-contained

One engine workspace may discover several projects, but there is no shared asset
catalog, inheritance, or cross-project fallback. Reusing an asset means copying
its complete directory; each copy then evolves and hashes independently.

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
  design-programs/
  candidates/
  investigations/
  runs/
  tests/
```

Read [Project format](docs/PROJECT_FORMAT.md) for the on-disk schemas and
[Project and asset boundaries](docs/design/project-boundaries.md) for the design
invariants.

## Documentation

### Use and extend INM

- [CLI reference](docs/CLI.md) — commands, options, output, and examples.
- [Project format](docs/PROJECT_FORMAT.md) — workspaces, manifests, assets, and
  schemas.
- [Studio visual debugger](docs/design/studio-debugger.md) — project routes,
  asset catalog, analysis, and 3D replay.
- [Development operations](docs/design/development-operations.md) — Studio
  lifecycle, ports, retained operations, and local debugging.
- [Architecture](docs/ARCHITECTURE.md) — package boundaries and the
  compile/simulate/evaluate pipeline.

### Design and evidence

- [Observation-led design](docs/design/observation-led-design.md) — human/Agent
  design authority and the required closed loop.
- [Industrial Investigations](docs/design/industrial-investigations.md) —
  persistent questions, evidence anchors, hypotheses, and decisions.
- [Design Programs](docs/design/design-programs.md) — bounded, project-authored
  proposal and evaluation instruments.
- [Operator Workbench](docs/design/operator-workbench.md) — shared orientation,
  diagnostics, operations, and next actions.
- [Coding Agent benchmarks](docs/design/coding-agent-optimization.md) — locked
  operating envelopes, guardrails, and keep/discard evidence.
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
- [Logistics](docs/design/logistics.md), [power](docs/design/power.md), and
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

Start with [AGENTS.md](AGENTS.md) before making a substantial change.
Repository-wide work is indexed in [PLANS.md](PLANS.md), with detailed records
under [`plans/`](plans/). The workflow and document ownership rules live in
[Documentation system](docs/design/documentation-system.md).
