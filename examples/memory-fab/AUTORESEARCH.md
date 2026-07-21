# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The locked benchmark compares it with `baseline.blueprint.json` across four evaluator-owned operating conditions: excursion-free production, mixed repair/scrap/escape work, a systematic quality excursion, and a timed lithography interruption. Case inputs are immutable; only the candidate Blueprint may change.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses an identity-preserving wafer lot within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power.

After final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The immutable baseline uses standard inspection, authored operation order, and FIFO lots.

The checked-in candidate contains two kept hypotheses: earliest-due-date operation and lot dispatch on both re-entrant work centers, followed by deep inspection. Due-date dispatch improves every case, especially recovery after the lithography interruption, while deliberately paying more changeover work. Deep inspection catches latent electrical defects, consumes more inspection/rework time, and converts otherwise escaped lots into terminal scrap; the current Objective values that containment above maximum shipment count. Continue from this candidate rather than resetting it.

Coding Agents may next test `minimize-changeover`, tool duplication, parallel inspection, buffers, routes, or power by editing the candidate Blueprint only. Yield, first-pass yield, quality escapes, rework, scrap, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm analyze examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`. The aggregate score must improve, and no individual operating condition may regress by more than the declared gate. Record every attempt in the ignored project-local `results.tsv` so failed hypotheses remain useful.
