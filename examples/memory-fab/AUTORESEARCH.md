# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The fixed benchmark compares it with `baseline.blueprint.json` under the same three-minute DRAM production window.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses an identity-preserving wafer lot within one step. The baseline uses authored operation order and FIFO lots. Coding Agents can test earliest-due-date, lot-priority, tool duplication, buffers, routes, or power by editing the candidate Blueprint only. Cycle time, queue time, tardiness, throughput, WIP, energy, cost, and area are all evaluator-owned measurements.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`.
