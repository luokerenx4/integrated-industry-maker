# Integrated Industry Maker

Integrated Industry Maker (**INM**) is an AI-native workbench for designing,
simulating, observing, and improving industrial production systems.

INM treats a factory as an executable, self-contained project:

> A factory is a folder. Blueprints are programs. Scenarios are tests.
> Objectives are benchmarks. Runs are evidence.

Humans can explore a factory in Studio. Coding Agents can use the typed `inm`
CLI, or operate the same Studio when a browser is available. Both surfaces read
the same Core model, evidence identities, and next-action state.

The project deliberately does **not** assume that an opaque optimizer can decide
what makes an industrial design good. INM makes the system observable and the
design loop reproducible; a human or reasoning Agent still owns hypotheses,
trade-offs, and decisions.

INM is pre-alpha. Domain correctness takes priority over backward
compatibility: obsolete formats are replaced rather than maintained.

## Try the memory fab

The bundled re-entrant DRAM factory is INM's north-star example. It exercises
shared equipment, product routes, lots and batches, setup campaigns, maintenance,
quality and rework, WIP release, facility utilities, power, logistics, customer
contracts, and source-lot evidence.

Install [Bun](https://bun.sh/), then:

```bash
git clone https://github.com/luokerenx4/integrated-industry-maker.git
cd integrated-industry-maker
bun install

# Start or reconnect to the managed Studio.
bun run inm session examples/memory-fab
```

The session command repairs or reuses the project-local Studio process, chooses
its port, and opens the current Core-owned work item. You do not need to manage
port numbers during ordinary development.

Useful browser-free entry points:

```bash
# Validate the selected project.
bun run inm validate examples/memory-fab

# Inspect the current factory and its causal loss evidence.
bun run inm inspect examples/memory-fab --section losses --json

# Reopen one persistent industrial inquiry.
bun run inm investigate examples/memory-fab \
  --investigation source-lot-back-end-service \
  --json

# Enter that same Investigation in Studio.
bun run inm session examples/memory-fab \
  --investigation source-lot-back-end-service
```

Use `--json` for Agent-facing output. The envelope preserves project selection,
hashes, artifacts, diagnostics, effects, and exact next actions rather than
requiring an Agent to scrape prose. See the complete
[CLI reference](docs/CLI.md) and [Agent CLI contract](docs/design/agent-cli-contract.md).

## The design loop

INM's intended workflow is observation-led:

1. Select an exact factory, Scenario, Objective, and production plan.
2. Run or reopen deterministic simulation evidence.
3. Inspect loss attribution, layout, material state, and source-lot chronology.
4. Record an observation and a falsifiable hypothesis in an Investigation.
5. Author a Blueprint Candidate or production-plan revision.
6. Review it against a locked Benchmark and run an exact factory trial.
7. Compare the retained Runs, then explicitly keep, revise, defer, or discard.

An Investigation persists this reasoning chain. It binds observations,
hypotheses, Candidate reviews, trial Runs, comparisons, and decisions to exact
content hashes, so useful conclusions survive beyond one chat or browser
session.

Read [Observation-led design](docs/design/observation-led-design.md),
[Industrial Investigations](docs/design/industrial-investigations.md), and the
[Operator Workbench](docs/design/operator-workbench.md) for the product model.

## What the engine models

INM currently provides:

- project-local Resource and Device asset packages with visuals and typed
  TypeScript runtime programs;
- explicit Processes, product routes, production modes, buffers, ports, and
  physical transport paths;
- multi-zone factories with finite deposits, station-owned carrier fleets,
  regional power topology, and facility utilities;
- named lots, fixed equipment batches, re-entrant routes, setup campaigns,
  maintenance, quality excursions, inspection, rework, scrap, and product
  lineage;
- production plans, due-dated demand contracts, WIP release control, Objectives,
  locked Benchmarks, and hash-pinned Candidate changes;
- deterministic discrete-event Runs, causal diagnostics, immutable comparisons,
  and a read-only 3D replay/debugger;
- one shared human/Agent workbench with persistent, evidence-backed next actions.

The [architecture overview](docs/ARCHITECTURE.md) describes package boundaries
and the compile/simulate/evaluate pipeline. More focused references include:

- [Factory capacity planning](docs/design/fab-capacity-planning.md)
- [Fab loss attribution](docs/design/fab-loss-attribution.md)
- [Source-lot product lineage](docs/design/source-lot-product-lineage.md)
- [Simulation runtime](docs/design/simulation-runtime.md)
- [Logistics](docs/design/logistics.md) and [power](docs/design/power.md)
- [Studio debugger](docs/design/studio-debugger.md)

## Project model

One engine workspace may contain many projects, but it owns no shared asset
catalog:

```text
my-engine/
  inm-workspace.json
  projects/
    memory-fab/
    refinery/
```

Every project is self-contained:

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
means copying its complete directory into the other project; the copies then
evolve and hash independently. See the [project format](docs/PROJECT_FORMAT.md),
[project boundaries](docs/design/project-boundaries.md), the
[memory-fab example](examples/memory-fab), and the smaller
[Ironworks example](examples/ironworks).

## Studio and operations

For routine use:

```bash
bun run inm session examples/memory-fab
```

For explicit lifecycle control:

```bash
bun run inm studio status examples/memory-fab
bun run inm studio start examples/memory-fab
bun run inm studio restart examples/memory-fab
bun run inm studio stop examples/memory-fab
```

Managed Studio keeps a stable supervisor, adopts source changes, reconnects
long-running work, and refuses to terminate an unverified or foreign listener.
See [Development operations](docs/design/development-operations.md) when
debugging startup, ports, source adoption, or retained operations.

## Development

```bash
# Fast daily feedback.
bun run check:fast

# Full checkpoint validation.
bun run test
```

Repository-wide plans live in [PLANS.md](PLANS.md), with detailed active and
archived plans under [`plans/`](plans/). Contributor conventions and the design
document index live in [AGENTS.md](AGENTS.md).
