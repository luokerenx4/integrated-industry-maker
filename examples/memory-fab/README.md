# Re-entrant DRAM memory fab

This self-contained INM project is the industrial north-star example. Twelve named wafer lots carry priority and due dates through lithography → etch → deposition, then return to the same lithography and etch work centers before delivery. Their identities survive processing and physical transport, so the evaluator measures complete cycle, queue, processing, transport, on-time, and tardiness behavior instead of inferring it from fungible inventory.

The model is deliberately a process-flow abstraction, not a claim to encode a proprietary DRAM recipe. Timing and capacity values are synthetic benchmark parameters.

Start with `bun run inm analyze examples/memory-fab`, `bun run inm simulate examples/memory-fab`, or `bun run inm studio examples/memory-fab --port 4176`.
