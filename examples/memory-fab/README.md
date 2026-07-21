# Re-entrant DRAM memory fab

This self-contained INM project is the industrial north-star example. A wafer lot passes lithography → etch → deposition, then returns to the same lithography and etch work centers before delivery. It demonstrates shared equipment qualification, deterministic WIP dispatch, physical transport, finite buffers, power, cycle time, and a file-edit/CLI-evaluate optimization loop.

The model is deliberately a process-flow abstraction, not a claim to encode a proprietary DRAM recipe. Timing and capacity values are synthetic benchmark parameters.

Start with `bun run inm analyze examples/memory-fab`, `bun run inm simulate examples/memory-fab`, or `bun run inm studio examples/memory-fab --port 4176`.
