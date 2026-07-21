# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The fixed benchmark compares it with `baseline.blueprint.json` under the same three-minute DRAM production window.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` controls which ready lot runs next. The initial `authored-order` policy tends to release early-layer WIP before completing re-entrant lots. Test hypotheses by editing priorities, dispatch policies, qualified tool copies, buffers, routes, or power inside the candidate Blueprint only.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`.
