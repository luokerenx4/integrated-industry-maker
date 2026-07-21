# Memory-fab autoresearch program

Edit exactly one file: `blueprints/experiment.blueprint.json`. The fixed benchmark compares it with `baseline.blueprint.json` under the same three-minute DRAM production window.

The wafer route revisits `lithography-1` and `etch-1`. Their `recipes` arrays declare qualified operations; `policy.recipeDispatch` chooses among ready route steps while `policy.lotDispatch` chooses an identity-preserving wafer lot within one step. Each route step has a setup group, and switching a shared bay between layer-1 and layer-2 work consumes fixed, evaluator-owned changeover time and power. The baseline uses authored operation order and FIFO lots. Coding Agents can test earliest-due-date, `minimize-changeover`, lot-priority, tool duplication, buffers, routes, or power by editing the candidate Blueprint only. Cycle time, queue time, tardiness, changeovers, throughput, WIP, energy, cost, and area are all evaluator-owned measurements.

Run:

```bash
bun run inm validate examples/memory-fab --blueprint experiment
bun run inm benchmark examples/memory-fab --benchmark dispatch-research
```

Keep an experiment only when the locked benchmark reports `verdict KEEP`.
