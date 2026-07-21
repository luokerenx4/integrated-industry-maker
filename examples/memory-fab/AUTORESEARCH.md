# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The locked benchmark compares it with `baseline.blueprint.json` across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption. Case inputs are immutable; only the candidate Blueprint may change.

Twelve named wafer lots become available six seconds apart. Before each Scenario-owned `releaseTick` a lot is scheduled outside the fab; admission into `lot-release` is capacity-gated and records actual release delay. Planned starts, due dates, quality excursions, and failures are fixed test workload, so a candidate cannot improve its score by deleting or postponing work. A candidate may add `policies.lotRelease` as explicit CONWIP code: `maximumWip` is the hard card count, `reopenAtWip` controls replenishment-wave hysteresis, optional `maximumReleaseDelayTicks` protects admission service without exceeding the cap, and `dispatch` chooses among eligible identities.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses identity-preserving wafer lots within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power. Optional `policy.setupCampaign` may hold that switch until `minimumReadyLots` are resident, with `maximumHoldTicks` as the starvation guard.

Between deposition and the second lithography pass, the baseline furnace requires three dielectric-stack lots before one fixed twelve-second anneal job may start. The same three lot identities leave together, and the evaluator owns actual lots/job plus pre-start batch queue wait. A six-second single-lot rapid-anneal Process is qualified on the same physical furnace, so batch policy is a visible Blueprint recipe choice instead of scheduler magic.

After final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The immutable baseline uses fixed-batch anneal, standard inspection, authored operation order, FIFO lots, and open-loop admission.

The checked-in candidate contains three kept hypotheses: earliest-due-date operation and lot dispatch on both re-entrant work centers, deep inspection, and single-lot rapid anneal. Deep inspection catches latent electrical defects and converts otherwise escaped lots into terminal scrap. Rapid anneal removes the baseline's three-lot formation gate but spends more furnace time per lot. Under scheduled arrivals the combined candidate accepts a small excursion-free score regression inside the declared per-case gate in exchange for stronger mixed-quality, excursion, and interruption results; the aggregate locked score remains the authority. Continue from this candidate rather than resetting it.

The TypeScript command `bun run memory-fab:research-release` sweeps CONWIP maximum/reopen/dispatch settings in memory against this incumbent without editing either Blueprint. Add `--joint` to cross a selected release range with lithography and etch recipe/lot dispatch, and `--maximum-delay <ticks>` to test the service guard. The initial 225-policy and focused joint sweeps found settings that improved aggregate score through lower WIP and completed-lot cycle time, but the best active setting raised steady-production setup changes from two to six and lost one on-time lot. Service protection did not repair that locked per-case regression.

`bun run memory-fab:research-campaign` independently searches setup-campaign scope, minimum resident lots, and maximum hold. Its first 120-policy open-loop sweep found no aggregate improvement. Crossing campaigns with CONWIP `10/4/fifo` raised aggregate score to `32.949405` but missed the locked case gate; the gentler `11/6/fifo` combination stayed inside the case gate but scored below the incumbent. These negative results are intentional evidence, so the checked-in candidate uses neither CONWIP nor setup campaigns until another physical layout or equipment change satisfies both conditions.

Coding Agents may next test tool duplication, setup-group-specialized tools, parallel inspection, furnace duplication, buffers, routes, power, `policies.lotRelease`, or `policy.setupCampaign` by editing the candidate Blueprint only. Scheduled/released/pending lots, release interval/delay, peak WIP, controller/capacity blocked lot-time, yield, quality escapes, rework, scrap, batch jobs, lots per batch, batch wait, campaign holds, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm analyze examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
bun run memory-fab:research-release -- --min-cap 10 --max-cap 12
bun run memory-fab:research-release -- --joint --min-cap 10 --max-cap 10 --min-reopen 3 --max-reopen 7 --release-dispatch fifo
bun run memory-fab:research-campaign
bun run memory-fab:research-campaign -- --maximum-wip 10 --reopen-at-wip 4 --release-dispatch fifo
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`. The aggregate score must improve, and no individual operating condition may regress by more than the declared gate. Record every attempt in the ignored project-local `results.tsv` so failed hypotheses remain useful.
