# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The fixed benchmark compares it with `baseline.blueprint.json` under the same four-minute DRAM quality-production window.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses an identity-preserving wafer lot within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power.

After final etch, fixed named process excursions create repairable, terminal, and latent-undetected defects. The selected inspection Process determines detection coverage and pass/rework/scrap disposition; rework repairs only its declared defect class. The baseline uses standard inspection, authored operation order, and FIFO lots. Replacing `inspect-final-pattern-standard` with `inspect-final-pattern-deep` in the candidate catches the latent electrical defect but consumes more inspection time and scraps another lot. Coding Agents may also test due-date dispatch, `minimize-changeover`, tool duplication, parallel inspection, buffers, routes, or power by editing the candidate Blueprint only. Yield, first-pass yield, quality escapes, rework, scrap, cycle time, tardiness, changeovers, throughput, WIP, energy, cost, and area are evaluator-owned measurements.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm analyze examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`.
