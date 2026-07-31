# Integrated Industry Maker

**INM is a local workbench where humans and AI Agents design, simulate, inspect,
and improve industrial production systems together.**

> A factory is a folder. Blueprints are programs. Scenarios are tests.
> Objectives are benchmarks. Runs are evidence.

[Try the memory fab](#quick-start) ·
[Understand the workflow](#how-inm-works) ·
[Use the CLI](docs/CLI.md) ·
[Create a project](docs/PROJECT_FORMAT.md) ·
[Read the architecture](docs/ARCHITECTURE.md)

INM turns factory design into an inspectable software workflow. A project owns
its equipment, resources, processes, layout, operating plan, test scenarios,
objectives, and immutable simulation evidence. Studio makes that system visible;
the `inm` CLI exposes the same model to people, scripts, and Agents.

![INM Studio showing the re-entrant DRAM memory fab and its current run evidence](docs/assets/inm-studio-memory-fab.jpg)

INM is not an autonomous factory generator. Core can compile a design, simulate
it, attribute losses, and compare explicitly bounded alternatives. A human or
reasoning Agent still owns the hypothesis, trade-offs, and commissioning
decision. That contract is described in
[Observation-led design](docs/design/observation-led-design.md).

> [!IMPORTANT]
> INM is pre-alpha. The model and file formats change directly when the
> industrial abstraction improves; backward compatibility is not maintained yet.

## Quick start

Prerequisite: [Bun](https://bun.sh/).

```bash
git clone https://github.com/luokerenx4/integrated-industry-maker.git
cd integrated-industry-maker
bun install
bun run inm session examples/memory-fab
```

`inm session` starts or reconnects to the project-local Studio, chooses an
available port, and opens the current work item. It is the simplest way to
explore the re-entrant DRAM fab without managing development processes by hand.
See [Development operations](docs/design/development-operations.md) when you
need to diagnose or control Studio explicitly.

Prefer the terminal? These commands exercise the same project and Core model:

```bash
# Check that every asset, process, layout, and selection compiles.
bun run inm validate examples/memory-fab

# Read the current evidence, diagnostics, and recommended next action.
bun run inm inspect examples/memory-fab

# Return the same state as a versioned machine-readable envelope.
bun run inm inspect examples/memory-fab --section all --json
```

Use `--json` for programmatic or Agent consumption. The envelope carries exact
selection and artifact identities, typed evidence, operation effects, and next
actions; consumers do not need to scrape terminal prose. The
[CLI reference](docs/CLI.md) lists every command, while the
[Agent CLI contract](docs/design/agent-cli-contract.md) defines the current
machine-facing behavior.

## Two interfaces, one factory

| Surface | Best for | Contract |
| --- | --- | --- |
| **Studio** | Spatial inspection, 3D replay, evidence navigation, and human decisions | [Studio visual debugger](docs/design/studio-debugger.md) |
| **`inm` CLI** | Agent reasoning, scripting, validation, simulation, and exact artifact operations | [CLI reference](docs/CLI.md) |
| **Core** | Compilation, deterministic simulation, evaluation, evidence identity, and operation state | [Architecture](docs/ARCHITECTURE.md) |

Studio and the CLI are projections of the same Core state. An Agent can use the
typed CLI, operate Studio through a browser, or move between both without
creating a second source of truth.

## How INM works

The normal improvement loop is intentionally explicit:

1. Select an exact factory, operating Scenario, Objective, and Production Plan.
2. Run or reopen deterministic evidence.
3. Inspect the factory replay, physical-loss attribution, material state, and
   lot chronology.
4. Record an observation and one falsifiable design hypothesis.
5. Author the smallest Blueprint Candidate or Production Plan change that tests
   it.
6. Compare the result across the locked operating envelope, then explicitly
   keep, revise, defer, or discard it.

[Industrial Investigations](docs/design/industrial-investigations.md) preserve
that reasoning chain against exact hashes. [Design Programs](docs/design/design-programs.md)
can evaluate bounded, project-authored alternatives, but they do not replace
human or Agent design judgment. The
[Operator Workbench](docs/design/operator-workbench.md) keeps the current status
and next action consistent across Studio and the CLI.

## Why the memory fab is the north star

The [re-entrant DRAM memory fab](examples/memory-fab/README.md) is the primary
product and engineering target. It forces the model to confront shared work
centers, re-entrant routes, named lots, batch formation, setup, maintenance,
quality excursions, rework, utilities, WIP, due dates, and source-lot lineage.
An abstraction that remains useful here should transfer to simpler factories
without changing its foundations.

The smaller [Ironworks project](examples/ironworks/README.md) is the readable,
fast-running reference for learning the file format and testing engine changes.

Today the engine includes:

- project-local Resource and Device packages, configurable Processes, buffers,
  ports, operating modes, and TypeScript Device runtimes;
- multi-zone layouts, explicit sorters and belts, station fleets, power grids,
  facility utilities, and spatial replay;
- tracked lots, batch and release control, dispatch, setup, maintenance,
  inspection, rework, scrap, quality, and product lineage;
- Production Plans, delivery contracts, Objectives, locked Benchmarks,
  Candidates, immutable Runs, causal diagnostics, and loss attribution.

These are industrial abstractions and synthetic benchmarks, not proprietary
DRAM recipes or production claims.

## Projects are self-contained

One workspace may discover many projects, but it owns no shared factory assets.
Every project is a complete directory with its own equipment, resources,
strategies, and evidence. Reuse means copying an asset package into another
project; the two copies then evolve and hash independently.

```text
my-factory/
  inm.json
  assets/{resources,devices}/
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

Start with [Project format](docs/PROJECT_FORMAT.md) for the on-disk schemas and
[Project boundaries](docs/design/project-boundaries.md) for the ownership
rules.

## Documentation paths

| Goal | Read in this order |
| --- | --- |
| **Use INM** | [CLI](docs/CLI.md) → [Studio](docs/design/studio-debugger.md) → [Project format](docs/PROJECT_FORMAT.md) |
| **Design and review a factory** | [Observation-led design](docs/design/observation-led-design.md) → [Industrial Investigations](docs/design/industrial-investigations.md) → [Experiment workbench](docs/design/experiment-workbench.md) |
| **Understand the evidence** | [Simulation runtime](docs/design/simulation-runtime.md) → [Fab loss attribution](docs/design/fab-loss-attribution.md) → [Blueprint comparison](docs/design/blueprint-comparison.md) |
| **Understand the industrial model** | [Material contracts](docs/design/material-contracts.md) → [Product routes](docs/design/product-routes.md) → [Work-center dispatch](docs/design/work-center-dispatch.md) → [Logistics](docs/design/logistics.md) |
| **Change the engine** | [Architecture](docs/ARCHITECTURE.md) → [Contributor guide](AGENTS.md) → [Documentation system](docs/design/documentation-system.md) |

The complete subsystem map lives in the
[contributor guide](AGENTS.md#design-map). Active and completed implementation
work is indexed in [PLANS.md](PLANS.md).

## Development

```bash
# Fast local feedback while iterating.
bun run check:fast

# Full checkpoint: docs, types, package tests, and project fixtures.
bun run test
```

Read [AGENTS.md](AGENTS.md) before a substantial change. Cross-package or
model-level work follows the plan workflow under [`plans/`](plans/); local
documentation fixes do not need their own repository plan.
