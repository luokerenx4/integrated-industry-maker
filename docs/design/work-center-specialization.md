# Work-center specialization

## Why it is a Blueprint operation

A shared work center and two dedicated tools are different physical factories, not two scheduler modes. A shared semiconductor bay owns one capacity envelope and one setup state across several qualified operations. Specialization purchases another project-local Device, narrows the qualifications on both instances, and gives each material route its own explicit transport and power consequences.

INM therefore represents specialization as ordinary Blueprint code. The simulator contains no equipment-pool shortcut and does not infer routing from matching Resource types. Cost, occupied area, idle and active power, initial setup, transport distance, congestion, failure scope, and per-Device utilization all follow from the authored topology.

## Deterministic topology transform

`specializeSharedWorkCenterCandidates()` extracts one `(Process, mode)` qualification from a Device with `recipes`:

1. copy the same project-local Device asset into a new stable instance;
2. leave the other qualifications on the original Device and remove an invalid multi-group campaign policy from each singleton;
3. partition every adjacent connection by the selected operation's exact input and output Resource bindings;
4. retarget a whole lane or split its Resource allowlist when the old lane was mixed;
5. search legal positions and rotations inside the same industrial region;
6. compare ground and elevated routes, preserving explicit belt cells instead of crossing equipment implicitly;
7. rebuild one loader and one unloader Device owned by every resulting physical connection;
8. schema-compile the complete candidate and rank valid layouts by unique transport cells, route length, placement distance, and stable coordinates.

The function returns complete Blueprints plus RFC 6902 patches. `specializeSharedWorkCenter()` is the single-best convenience form used by the built-in heuristic research agent. Returning ranked candidates matters because a locally shortest first tool placement may block the best second specialization; a project search can carry several physical alternatives into the locked multi-case evaluator.

`parallelizeWorkCenter()` handles a different capital decision: adding a complete parallel single-operation work center. The added branch may copy the original equipment/Process or select another project-local asset and qualified Process with compatible physical ports. It inserts a project-local two-input/two-output dispatcher, routes every upstream lane through that finite buffer, fans work into both tools, independently reconnects every disposition output, and rebuilds explicit sorter ownership. The returned RFC 6902 patch exactly replays the returned Blueprint. There is still no logical equipment pool: both tools, the dispatcher, all belt cells, every sorter, build cost, area, power, maintenance state, qualification, and queue are ordinary authored entities.

## Physical invariants

- The source must be a shared work center with at least two explicitly qualified operations.
- The extracted operation keeps its exact Process, mode, Resource-to-port bindings, priorities, and Device policy except for a now-invalid setup campaign.
- Resource lanes are never widened by compatible wildcard buffers.
- A route may merge onto a target port's final belt cell only when the compiled belt directions agree; silent belt divergence remains invalid.
- Elevated interior cells may cross ground transport, but both endpoints land at level zero and their sorter Device positions remain two-dimensional.
- The candidate must compile against the fixed World and Scenario. This rejects specialization that would invalidate an evaluator-owned initial setup or failure reference.
- No asset is shared between projects and no new catalog entry is synthesized. Every copy uses an asset already contained in that project.

## Memory-fab evidence

The memory-fab search starts from `blueprints/tool-search-seed.blueprint.json`, which contains the previously kept dispatch, inspection, and rapid-anneal choices while retaining shared lithography and etch tools. `bun run memory-fab:research-tools` extracts the layer-2 qualifications, carries several lithography placements into the etch search, and evaluates each complete topology across four fixed cases.

Ground-only greedy routing improved aggregate performance but created a long detour and failed the per-case gate. Adding the already physical elevated-routing degree of freedom produced a compact dedicated layer-2 line. Together with the subsequently selected drift-aware maintenance policy, the kept Blueprint raises the current locked aggregate score from `-0.522450` to `28.110498`, improves every case by at least `18.031765`, and remains under the Objective's build-cost and occupied-area constraints.

The next search compares seven equipment architectures. A second deep-inspection bay plus dispatcher adds `22,600` in equipment and exceeds the immutable `140,000` limit at a total of `156,260`. The project now also contains a `6,500` rapid optical metrology cell, qualified only for the four-second standard screen; the `22,000` deep bay remains qualified for both standard optical and eight-second deep electrical inspection. This exact matrix prevents the cheap cell from executing deep inspection merely because both assets share the `inspection` category.

The earlier heterogeneous metrology search established a structural constraint that remains useful: deep+rapid totals `140,760` and exceeds the fixed `140,000` build-cost limit, while rapid-only loses latent-electrical detection coverage. Its old numeric ranking predates equipment drift and is retained only as historical evidence. Re-run `bun run memory-fab:research-metrology` before adopting any metrology topology under the current physics. Physical throughput improvement is insufficient unless qualification coverage, the whole operating envelope, equipment condition, and capital constraints improve together.

See [[docs/design/work-center-dispatch]], [[docs/design/equipment-changeover]], [[docs/design/blueprint-optimization]], [[docs/design/logistics]], and [[examples/memory-fab/AUTORESEARCH]].
