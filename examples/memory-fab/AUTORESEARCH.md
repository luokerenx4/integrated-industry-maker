# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The locked benchmark compares it with `baseline.blueprint.json` across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption. Case inputs are immutable; only the candidate Blueprint may change.

Twelve named wafer lots become available six seconds apart. Before each Scenario-owned `releaseTick` a lot is scheduled outside the fab; admission into `lot-release` is capacity-gated and records actual release delay. Planned starts, due dates, quality excursions, and failures are fixed test workload, so a candidate cannot improve its score by deleting or postponing work. A candidate may add `policies.lotRelease` as explicit CONWIP code: `maximumWip` is the hard card count, `reopenAtWip` controls replenishment-wave hysteresis, optional `maximumReleaseDelayTicks` protects admission service without exceeding the cap, and `dispatch` chooses among eligible identities.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses identity-preserving wafer lots within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power. Optional `policy.setupCampaign` may hold that switch until `minimumReadyLots` are resident, with `maximumHoldTicks` as the starvation guard. Route-owned Q-time windows measure the complete delay from step entry to physical job start; transport, batch formation, setup, maintenance, power loss and tool queues consume the same clock, and a late start adds fixed defects before ordinary inspection/rework/scrap disposition.

Between deposition and the second lithography pass, the baseline furnace requires three dielectric-stack lots before one fixed twelve-second anneal job may start. The same three lot identities leave together, and the evaluator owns actual lots/job plus pre-start batch queue wait. A six-second single-lot rapid-anneal Process is qualified on the same physical furnace, so batch policy is a visible Blueprint recipe choice instead of scheduler magic.

After final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The immutable baseline uses fixed-batch anneal, standard inspection, authored operation order, FIFO lots, and open-loop admission.

The checked-in candidate contains five kept hypotheses: earliest-due-date lot dispatch, deep inspection, single-lot rapid anneal, dedicated layer-2 lithography/etch tools, and opportunistic preventive maintenance. The physical specialization is an ordinary Blueprint diff: it copies project-local equipment assets, narrows each Device qualification, splits exact Resource lanes, routes a short elevated crossing, and owns separate setup and maintenance state. The assets require lithography and etch maintenance no later than eight completed jobs and inspection maintenance no later than five. Once Q-time became evaluator-owned physics, a fresh 27-policy sweep selected lithography maintenance after seven jobs, inspection after three, and mandatory-only etch maintenance. Across the locked envelope the candidate raises aggregate score from `16.967452` to `31.765837` (`+14.798384`), and every case improves; the minimum case delta is `+12.529236`. Continue from this candidate rather than resetting it.

The TypeScript commands `bun run memory-fab:research-release` and `bun run memory-fab:research-campaign` search admission and setup control without editing a Blueprint. Their earlier shared-tool sweeps are retained as historical negative evidence: stronger WIP scores missed the case gate, and campaigns did not beat that incumbent robustly. Because physical specialization changes the queueing regime, rerun them against the current candidate before adopting a controller. The checked-in candidate still uses neither CONWIP nor setup campaigns.

`bun run memory-fab:research-tools` starts from the frozen `tool-search-seed` Blueprint, extracts layer-2 qualifications into project-local dedicated tools, jointly ranks position and rotation, compares ground and elevated routes, rebuilds explicit sorter ownership, and evaluates every topology across the locked cases. `--write-best` writes only a strict gate-passing improvement. This search produced the current specialized candidate.

`bun run memory-fab:research-maintenance` searches 27 Blueprint timing policies without changing asset physics. Q-time changed its optimum: the previous 7/7/4 lithography/etch/inspection policy scores `30.467190`, while the new 7/off/3 policy scores `31.765837` (`+1.298647`) and clears every case gate. Against mandatory-only maintenance at `30.855063`, the selected policy adds `+0.910774`.

`bun run memory-fab:research-metrology` authors a complete second deep-inspection topology with a finite project-local dispatcher, independent lanes and explicit sorters, then jointly searches shared/dedicated lithography and etch capital allocation plus inspection maintenance and dispatch. The extra tool clears final-inspection Q-time loss, but the incumbent layout costs `156260` against the fixed `140000` limit. The best budget-feasible parallel layout scores `23.078411`, below the incumbent `31.765837`, and fails the interruption gate. This is retained negative evidence; the checked-in candidate does not buy the second bay.

Coding Agents may next test a different project-local metrology equipment class, furnace duplication, maintenance-aware tool counts, buffers, routes, power, `policies.lotRelease`, or `policy.setupCampaign` by editing the candidate Blueprint only. Scheduled/released/pending lots, release interval/delay, peak WIP, controller/capacity blocked lot-time, yield, quality escapes, rework, scrap, batch jobs, lots per batch, batch wait, campaign holds, mandatory/opportunistic/cancelled maintenance, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.

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
