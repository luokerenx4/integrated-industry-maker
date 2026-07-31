# Integrated Industry Maker

**INM is a local workbench for humans and AI Agents to design, simulate,
inspect, and improve industrial production systems together.**

> A factory is a folder. Blueprints are programs. Scenarios are tests.
> Objectives are benchmarks. Runs are evidence.

[Run the memory fab](#run-the-memory-fab) ·
[Learn the model](#the-project-model) ·
[Follow the design loop](#the-design-loop) ·
[Find the right document](#documentation-map) ·
[Contribute](#development)

![INM Studio showing the re-entrant DRAM memory fab and its current run evidence](docs/assets/inm-studio-memory-fab.jpg)

INM treats factory design as an inspectable software workflow. Each project owns
its equipment, resources, processes, layout, operating plan, test conditions,
objectives, and immutable evidence. Studio makes the factory visible; the `inm`
CLI exposes the same typed model to people, scripts, and Agents.

INM is not an autonomous factory generator. The engine can compile, simulate,
attribute losses, and compare bounded alternatives, but a human or reasoning
Agent owns the hypothesis, trade-offs, and commissioning decision. See
[Observation-led design](docs/design/observation-led-design.md) for that
contract.

> [!IMPORTANT]
> INM is pre-alpha. Industrial correctness takes priority over compatibility:
> formats and APIs change directly when the model improves. Studio is currently
> a visual debugger and evidence workbench, not a drag-and-drop factory editor.

## Run the memory fab

Prerequisite: [Bun](https://bun.sh/).

```bash
git clone https://github.com/luokerenx4/integrated-industry-maker.git
cd integrated-industry-maker
bun install
bun run inm session examples/memory-fab
```

`inm session` starts or reconnects to the project-local Studio, finds an
available port, and opens the current work item. It is the shortest path to the
re-entrant DRAM fab and does not require manual process or port management.

The same project is available through the CLI:

```bash
# Compile and validate the selected factory.
bun run inm validate examples/memory-fab

# Read current evidence, diagnostics, and the recommended next action.
bun run inm inspect examples/memory-fab

# Bind the current immutable Run to exact Factory and Analysis views.
bun run inm observe examples/memory-fab

# Return the complete state as a versioned machine-readable envelope.
bun run inm inspect examples/memory-fab --section all --json
```

Use `--json` when a script or Agent consumes the result. The envelope includes
exact selections, content hashes, typed evidence, operation effects, and next
actions; consumers never need to scrape terminal prose. See the
[CLI reference](docs/CLI.md) and
[Agent CLI contract](docs/design/agent-cli-contract.md).

### Choose an entry point

| You want to… | Start here |
| --- | --- |
| Explore the current factory visually | `bun run inm session examples/memory-fab` and the [Studio guide](docs/design/studio-debugger.md) |
| Operate INM from an Agent or script | `bun run inm inspect examples/memory-fab --json` and the [Agent CLI contract](docs/design/agent-cli-contract.md) |
| Learn with a smaller project | [Ironworks](examples/ironworks/README.md) |
| Create a self-contained factory | [Project format](docs/PROJECT_FORMAT.md) and [project boundaries](docs/design/project-boundaries.md) |
| Change the engine | [Architecture](docs/ARCHITECTURE.md), then [AGENTS.md](AGENTS.md) |

## The project model

Studio, CLI, and Core are three views of one project:

| Surface | Used for | Source of truth |
| --- | --- | --- |
| **Studio** | Spatial inspection, 3D replay, evidence navigation, and human decisions | Core project and immutable evidence |
| **`inm` CLI** | Agent reasoning, scripting, validation, simulation, and artifact operations | Core project and immutable evidence |
| **Core** | Compilation, deterministic simulation, evaluation, evidence identity, and operation state | Project files |

The main project concepts are deliberately explicit:

| Concept | Meaning | Contract |
| --- | --- | --- |
| **Project** | One self-contained factory and all of its evidence | [Project boundaries](docs/design/project-boundaries.md) |
| **Blueprint** | Physical equipment, connections, layout, and control policy | [Blueprint comparison](docs/design/blueprint-comparison.md) |
| **Production Plan** | Authored lot starts, release intent, and operating commitments | [Production Plans](docs/design/production-plans.md) |
| **Scenario + Objective** | Operating conditions and the value function used to judge results | [Project format](docs/PROJECT_FORMAT.md) |
| **Run** | Immutable, hash-bound simulation evidence | [Simulation runtime](docs/design/simulation-runtime.md) |
| **Investigation** | Persistent observations, hypotheses, evidence anchors, and decisions | [Industrial Investigations](docs/design/industrial-investigations.md) |
| **Candidate** | One exact, reviewable change set against a known Blueprint | [Experiment workbench](docs/design/experiment-workbench.md) |

An Agent may stay in the typed CLI, operate Studio through a browser, or move
between both. None of those paths creates a second factory state.

## The design loop

Factory improvement is observation-led:

1. Select the exact Blueprint, Production Plan, Scenario, and Objective.
2. Run or reopen compatible immutable evidence.
3. Inspect the spatial replay, physical-loss attribution, material state, and
   lot chronology.
4. Record an observation and one falsifiable hypothesis.
5. Author the smallest Candidate or Production Plan change that tests it.
6. Compare the locked before/after evidence and explicitly keep, revise, defer,
   or discard the change.

[Industrial Investigations](docs/design/industrial-investigations.md) preserve
the reasoning chain. [Design Programs](docs/design/design-programs.md) can
evaluate bounded, project-authored alternatives, while the
[Operator Workbench](docs/design/operator-workbench.md) keeps current status
and next action consistent across Studio and the CLI.

## Why the memory fab is the north star

The [re-entrant DRAM memory fab](examples/memory-fab/README.md) is INM's primary
product and engineering target. It forces the model to confront shared work
centers, re-entrant routes, named lots, batch formation, setup, maintenance,
quality excursions, rework, utilities, WIP, due dates, and source-lot lineage.
An abstraction that remains useful here should transfer to simpler factories
without changing its foundations.

Today the engine includes:

- project-local Resource and Device packages, configurable Processes, buffers,
  ports, operating modes, and TypeScript Device runtimes;
- multi-zone layouts, explicit sorters and belts, station fleets, power grids,
  facility utilities, and spatial replay;
- tracked lots, batch and release control, dispatch, setup, maintenance,
  inspection, rework, scrap, quality, and product lineage;
- Production Plans, delivery contracts, Objectives, locked Benchmarks,
  Candidates, immutable Runs, causal diagnostics, and loss attribution.

The memory-fab data is a synthetic industrial model, not a proprietary DRAM
recipe or production claim. [Ironworks](examples/ironworks/README.md) remains
the smaller, faster reference for learning schemas and testing engine changes.

## Projects are self-contained

A workspace may discover many projects, but it owns no shared factory assets.
Every project is a complete directory. Reuse means copying an asset package;
the copies then evolve and hash independently.

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

The exact schemas and discovery rules live in
[Project format](docs/PROJECT_FORMAT.md).

## Documentation map

| Goal | Read in this order |
| --- | --- |
| Use INM | [CLI](docs/CLI.md) → [Studio](docs/design/studio-debugger.md) → [Development operations](docs/design/development-operations.md) |
| Design and review a factory | [Observation-led design](docs/design/observation-led-design.md) → [Industrial Investigations](docs/design/industrial-investigations.md) → [Experiment workbench](docs/design/experiment-workbench.md) |
| Understand simulation evidence | [Simulation runtime](docs/design/simulation-runtime.md) → [Fab loss attribution](docs/design/fab-loss-attribution.md) → [Blueprint comparison](docs/design/blueprint-comparison.md) |
| Understand the industrial model | [Material contracts](docs/design/material-contracts.md) → [Product routes](docs/design/product-routes.md) → [Work-center dispatch](docs/design/work-center-dispatch.md) → [Logistics](docs/design/logistics.md) |
| Contribute to the engine | [Architecture](docs/ARCHITECTURE.md) → [Contributor guide](AGENTS.md) → [Documentation system](docs/design/documentation-system.md) |

The complete subsystem index lives in the
[contributor guide](AGENTS.md#design-map). Active and completed implementation
work is indexed in [PLANS.md](PLANS.md).

## Development

The repository is split into
[`inm-core`](packages/inm-core/),
[`inm-cli`](packages/inm-cli/), and
[`inm-studio`](packages/inm-studio/). Runnable, self-contained projects live
under [`examples/`](examples/).

```bash
# Fast local feedback while iterating.
bun run check:fast

# Full checkpoint: docs, types, package tests, and project fixtures.
bun run test
```

Read [AGENTS.md](AGENTS.md) before a substantial change. Cross-package or
model-level work follows the plan workflow under [`plans/`](plans/); a local
documentation fix does not need its own plan.
