# Industrial investigations

Status: V1 persistent project-local investigation contract implemented in Core, `inm`, Studio, and the memory-fab north-star fixture.

Related: [[docs/design/observation-led-design]], [[docs/design/operator-workbench]], [[docs/design/design-programs]], [[docs/design/experiment-workbench]], [[docs/design/agent-cli-contract]], [[docs/design/studio-debugger]], [[docs/design/project-boundaries]], and [[plans/persistent-industrial-investigation-workspace]].

## Purpose

An Investigation is the project-local reasoning record that connects exact industrial evidence to human or Agent judgment over time.

Operating Runs prove what the simulator observed. Design Runs prove what one bounded proposal portfolio evaluated. Candidate receipts prove what was reviewed and commissioned. An Investigation records why those artifacts were being examined together, which visible or typed fact motivated the inquiry, what hypothesis a human or reasoning Agent formed, and what decision should be resumed later.

It is not an optimizer, experiment runner, dense evidence cache, or substitute for a Run. It never claims that a hypothesis is true merely because it was written down.

## Storage boundary

Each Investigation is self-contained inside its owning project:

```text
investigations/
  <investigation-id>/
    manifest.json
    entries/
      0001-<entry-id>.entry.json
      0002-<entry-id>.entry.json
```

The manifest is created once and pins the question plus exact initial evidence anchors. Entries are append-only. An existing manifest or entry is never silently overwritten; revision occurs through another explicit entry.

Neither the workspace nor `.inm` owns Investigation data. Investigation files may be committed, copied with the project, and inspected without browser state or chat history. They reference immutable artifact identities rather than copying dense event, metric, Benchmark, or Candidate payloads.

## Authority and identity

Creation begins from the exact compiled project selection and shared Workbench snapshot. V1 requires one current compatible operating Run and one current diagnostic. The manifest pins:

- project id;
- World, Blueprint, Scenario, and Objective ids;
- selection-scoped engine, execution, Blueprint, World, Scenario, and Objective hashes;
- operating Run id and result hash;
- diagnostic id, code, summary, priority, subjects, loss bucket, and leading contributor when available;
- the Core-owned next action at creation;
- an exact commissioned Design/Candidate lineage when that next action is backed by one.

Inspection resolves each compact anchor against current authoritative project artifacts. An anchor is:

- `current` when every pinned identity still agrees;
- `historical` when the artifact remains valid but current selection, diagnostic, or authority moved;
- `missing` when its referenced artifact is absent;
- `invalid` when the referenced artifact exists but fails strict loading or identity verification.

The projection fails closed. It never substitutes a similarly named Run, diagnostic, Program, Candidate, Device, or connection.

## Reasoning entries

Each entry has one stable kebab-case id, a positive sequence matching its filename, an author kind of `human` or `agent`, a non-empty statement, and zero or more ids from the manifest evidence-anchor set.

V1 entry kinds are:

- `observation`: a visible or typed fact noticed by the author;
- `hypothesis`: a falsifiable industrial proposal plus its expected measured or visual effect;
- `decision`: an explicit `keep`, `revise`, `defer`, or `discard` judgment and rationale.

The engine validates references and order but does not assess the truth or quality of prose. Adding an entry creates a project artifact; it does not edit a Blueprint, run a simulation, evaluate a Benchmark, or commission a Candidate.

## Human and Agent surfaces

`inm investigate` and Studio project the same Core inspection result. Both show the question, pinned target, currentness of every anchor, ordered reasoning entries, and exact existing routes/argv for referenced evidence.

CLI is the primary structured surface for text-only Agents. Studio is the primary spatial surface for humans and browser-capable Agents. Studio may provide forms for explicit entry creation, but it cannot manufacture an observation, hypothesis, or decision on the user's behalf.

The stable Studio routes are `/<project>/investigations` and `/<project>/investigations/<id>`. The project-qualified API lists or creates at `GET|POST /api/projects/<project>/investigations`, inspects at `GET /api/projects/<project>/investigations/<id>`, and appends at `POST /api/projects/<project>/investigations/<id>/entries`. The Studio workbench shows the current Core handoff, every anchor's exact evidence navigation, the ordered hash chain, explicit author/kind inputs, and required hypothesis or decision fields. Opening the route is read-only; only an explicit submitted create/append form writes Investigation data.

## Memory-fab north star

The first checked-in Investigation resumes the current inspection starvation inquiry. Its operating anchor is compatible Run `098-simulate`; its accumulated design anchor is commissioned Run `966127dd542de0b1…`, Candidate `inspection-supply-path-966127dd`, and that Candidate's verified KEEP receipt.

Its first observation binds the focused replay to typed evidence: `inspection-1` accumulated 190.2 seconds of input wait at 20.7% utilization; `etch-to-inspection` delivered 12 lots at 1.3% utilization with zero blocked item-ticks; and upstream `etch-l2` itself waited 164.0 seconds for input. That evidence contradicts another local line-capacity, buffer-capacity, or parallel-etch guess. The next physically distinct hypothesis is therefore a qualified low-power standby state for the continuous deep-metrology cell after a ten-second empty interval. Its expected effect requires lower energy/electricity across every locked case without weakening completion, on-time service, first-pass yield, zero escapes, final-inspection Q-time, or the existing starvation target. It is a recorded hypothesis, not a commissioned result.
