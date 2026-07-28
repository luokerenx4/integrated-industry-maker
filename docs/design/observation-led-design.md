# Observation-led industrial design

Status: V1 observation brief and shared visual handoff in progress.

Related: [[docs/design/operator-workbench]], [[docs/design/experiment-workbench]], [[docs/design/design-programs]], [[docs/design/coding-agent-optimization]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]], and [[plans/observation-led-design-harness]].

## Product position

INM is a Harness for industrial reasoning, not an autonomous factory optimizer. Industrial design remains subjective because the model contains physical layout, operating policy, product mix, process capability, reliability, quality, logistics, energy, commercial objectives, and future project-local factors that cannot be collapsed into one timeless reward function.

The design authority is therefore a human or a reasoning Agent. That authority must be able to see the factory, interpret structured and spatial evidence, state a hypothesis, author a deliberate intervention, and decide whether the evaluated result is industrially desirable.

RL, black-box search, and automatic layout generation are not the product design loop. Deterministic computation remains essential for compilation, simulation, capacity analysis, loss attribution, locked multi-case evaluation, exact comparison, and ranking explicitly bounded alternatives. Those mechanisms supply evidence; they do not own the hypothesis or commissioning judgment.

## Required closed loop

Every substantive factory-design intervention follows this loop:

```text
orient exact project state
  → observe compatible run data and the spatial Factory replay
  → state a concrete industrial hypothesis
  → author an exact Blueprint/Candidate intervention
  → simulate and evaluate through the locked Benchmark
  → compare quantitative and visual before/after evidence
  → human or Agent decides KEEP, revise, defer, or discard
```

The observation step is not decoration or final visual QA. It occurs before proposal authoring and again when the evaluated change may alter spatial flow, congestion, device behavior, or operator interpretation.

Structured and visual evidence are complementary:

- CLI JSON is authoritative for exact selection, hashes, metrics, loss contributors, Benchmark cases, patches, and artifacts.
- Studio is authoritative for the human-legible spatial projection of that same project and immutable run.
- A browser-capable Agent may use Studio's semantic routes and controls directly.
- A CLI-only Agent may open the returned Studio routes through Playwright, MCP, or another screenshot-capable browser. The Harness does not require one browser vendor.
- A human may use Studio while an Agent authors and evaluates the corresponding project-local TypeScript or JSON change. Both must remain bound to the same hashes and run.

## Observation brief

Core owns one deterministic `FactoryObservationBrief`. It is read-only and contains:

- exact project identity, effective World/Blueprint/Scenario/Objective, and project hashes;
- observation readiness and one selected compatible immutable run with result hash, score, and decision;
- the leading shared Workbench diagnostic and its typed subjects;
- a stable run-qualified Factory overview;
- stable focused Factory or Catalog views for relevant Device, Connection, Resource, Process, or Route subjects;
- the corresponding Analysis evidence route;
- a compact checklist that requires spatial interpretation, a written hypothesis, an expected measured effect, and an explicit next action.

`inm observe` and Studio consume the same Core object. The CLI command does not take screenshots and Core does not claim that pixels were understood. It gives an Agent an exact visual task that a browser tool can execute. Studio renders the same task beside the replay so a human can perform it without translating raw JSON.

When no compatible run exists, the brief is `needs-run`. It still identifies the exact selection and Factory overview, but it must direct the operator to simulate before drawing behavior conclusions. Static layout observation is allowed; runtime claims are not.

Run-qualified Factory URLs use `?run=<immutable-run-id>`. Direct open, reload, history, focused object navigation, and run selection must preserve that identity. A URL that silently changes evidence is not an observation contract.

## Design handoff

Completing an observation means the human or Agent can state all of the following:

1. which exact Blueprint and immutable run were observed;
2. what spatial or operating behavior was visible, including the relevant Device/Connection subjects;
3. how that behavior relates—or does not relate—to the structured leading diagnostic;
4. one falsifiable hypothesis and the smallest exact intervention that tests it;
5. which metrics, locked cases, and visual behavior must improve or remain unchanged.

V1 returns this handoff contract but does not persist a subjective observation receipt or require one in every Candidate file. That boundary is deliberate: the first shared brief should be exercised in real design work before an on-disk record format is frozen. Until a receipt contract is introduced, repository workflow and plan evidence must name the observed run and views.

## Relationship to Design Programs

Project-local Design Programs are bounded proposal and evaluation instruments. Their deterministic providers can encode a researched intervention portfolio, prevent repeated attempts, and compare candidates against locked cases. They are not autonomous designers and their `KEEP` result is not commissioning authority.

Before extending or invoking a Design Program for substantive factory changes, a contributor must use the observation brief, inspect the relevant Factory evidence, and state the human/Agent-authored hypothesis that justifies the bounded portfolio. A Program may calculate and rank explicit alternatives; it may not be presented as an RL agent, a general factory generator, or a replacement for observation and judgment.

Candidate review and apply remain separate guarded steps. No observation, proposal provider, score improvement, or visual impression may bypass exact patch review, Benchmark gates, hash checks, or explicit apply.

## Verification

The contract is complete only when tests and real use prove:

- Core/CLI/Studio return the same observation identity and routes;
- an explicit incompatible run is rejected rather than silently substituted;
- no-run projects request simulation without fabricating runtime evidence;
- Factory run identity survives reload, focus changes, history, and the run picker;
- the checked-in project is unchanged by observation;
- a real browser can open the memory-fab overview and a focused evidence view without console errors.
