# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The locked benchmark compares it with `baseline.blueprint.json` across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption. Case inputs are immutable; only the candidate Blueprint may change.

Twelve named wafer lots become available six seconds apart. Before each Scenario-owned `releaseTick` a lot is scheduled outside the fab; admission into `lot-release` is capacity-gated and records actual release delay. Planned starts, due dates, quality excursions, and failures are fixed test workload, so a candidate cannot improve its score by deleting or postponing work. A candidate may add `policies.lotRelease` as explicit CONWIP code: `maximumWip` is the hard card count, `reopenAtWip` controls replenishment-wave hysteresis, optional `maximumReleaseDelayTicks` protects admission service without exceeding the cap, and `dispatch` chooses among eligible identities.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses identity-preserving wafer lots within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power. Each lithography Process also reserves its own finite physical reticle set from the placed `reticle-stocker-1` for the complete job; power loss retains that reservation and equipment failure traps it until recovery. Reticles remain in provider inventory and are never counted as consumed material. The stocker's project-local Device asset bundles one layer-1 and one layer-2 set into every placed instance, so duplicating it in the Blueprint purchases another complete package with real cost, area, power, and service reach; Scenarios cannot inject free reticles. Optional `policy.setupCampaign` may hold that switch until `minimumReadyLots` are resident, with `maximumHoldTicks` as the starvation guard. Route-owned Q-time windows measure the complete delay from step entry to physical job start; transport, batch formation, setup, maintenance, power loss and tool queues consume the same clock, and a late start adds fixed defects before ordinary inspection/rework/scrap disposition.

Between deposition and the second lithography pass, the baseline furnace requires three dielectric-stack lots before one fixed twelve-second anneal job may start. The same three lot identities leave together, and the evaluator owns actual lots/job plus pre-start batch queue wait. A six-second single-lot rapid-anneal Process is qualified on the same physical furnace, so batch policy is a visible Blueprint recipe choice instead of scheduler magic.

After final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The immutable baseline uses fixed-batch anneal, standard inspection, authored operation order, FIFO lots, and open-loop admission.

The checked-in candidate contains six kept hypotheses: earliest-due-date lot dispatch, deep inspection, single-lot rapid anneal, dedicated layer-2 lithography/etch tools, inspection-only opportunistic preventive maintenance, and a second placed fab-utility plant. The physical specialization is an ordinary Blueprint diff: it copies project-local equipment assets, narrows each Device qualification, splits exact Resource lanes, routes a short elevated crossing, and owns separate setup and maintenance state. Equipment assets also own deterministic usage drift. Maintenance is physical factory work followed by a separate equipment-release phase. Lithography, etch, and ALD jobs atomically reserve finite high-vacuum and hazardous-exhaust capacity; the second utility plant is a costed Blueprint expansion that prevents dedicated process tools from merely moving the bottleneck into facilities. The locked aggregate is `-67.484078`, while every workload remains at least `+25.270400` above its baseline. Continue from this candidate rather than resetting it.

The TypeScript commands `bun run memory-fab:research-release` and `bun run memory-fab:research-campaign` search admission and setup control without editing a Blueprint. Their earlier sweeps are retained as historical negative evidence. Because physical specialization and facility capacity change the queueing regime, rerun them against the current candidate before adopting a controller.

`bun run memory-fab:research-tools` starts from the frozen `tool-search-seed` Blueprint, extracts layer-2 qualifications into project-local dedicated tools, jointly ranks position and rotation, compares ground and elevated routes, rebuilds explicit sorter ownership, and evaluates every topology across the locked cases. `--write-best` writes only a strict gate-passing improvement.

`bun run memory-fab:research-maintenance` searches 27 Blueprint timing policies without changing asset physics. Its pre-utility sweep selected lithography off / etch off / inspection 4; rerun it after facility changes rather than treating the historical score as timeless.

`bun run memory-fab:research-metrology` compares seven explicit equipment architectures across capital layouts, equipment-specific maintenance, and lot dispatch. Re-run this search after changing equipment physics; its prior rejection remains historical evidence rather than a timeless result.

Coding Agents may next test utility-plant count/placement, reticle-stocker count/placement, paired same-layer lithography capacity, a second service crew, service-bay placement, qualification-wafer inventory, furnace duplication, buffers, routes, power, `policies.lotRelease`, or `policy.setupCampaign` by editing the candidate Blueprint only. Facility allocations, capacity-unit time, waits, blocks, reusable-tool occupancy, maintenance, quality, cycle time, tardiness, throughput, WIP, energy, cost, and area are evaluator-owned measurements.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm analyze examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run memory-fab:research-release -- --min-cap 10 --max-cap 12
bun run memory-fab:research-release -- --joint --min-cap 10 --max-cap 10 --min-reopen 3 --max-reopen 7 --release-dispatch fifo
bun run memory-fab:research-campaign
bun run memory-fab:research-campaign -- --maximum-wip 10 --reopen-at-wip 4 --release-dispatch fifo
bun run memory-fab:research-tools
bun run memory-fab:research-maintenance
bun run memory-fab:research-metrology
bun run memory-fab:research-qtime
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`. The aggregate score must improve, and no individual operating condition may regress by more than the declared gate. Record every attempt in the ignored project-local `results.tsv` so failed hypotheses remain useful.
