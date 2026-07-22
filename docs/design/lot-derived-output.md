# Lot-derived output and wafer Probe yield

Status: deterministic lot-dependent output profiles, runtime metrics, and the DRAM wafer-Probe optimization benchmark are implemented in `inm-sim/0.68.0`.

Related: [[docs/design/quality-flow]], [[docs/design/industrial-boundaries]], [[docs/design/delivery-contracts]], [[docs/design/lot-tracking]], [[docs/design/coding-agent-optimization]], [[docs/design/simulation-runtime]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Why output quantity belongs to the terminating lot

Inspection answers whether an identity-preserving work lot follows pass, rework, or scrap. It does not necessarily determine how many usable fungible units that lot creates. At wafer Probe, one qualified wafer lot can complete successfully while producing fewer known-good dies because its latent electrical state changes the measured die yield.

INM keeps these questions separate. `Process.quality` owns identity-preserving disposition. A lot-terminating Process may additionally own ordered `lotOutputProfiles` that convert the incoming lot state into an exact fungible output count. The Blueprint selects qualified equipment and Process programs; it cannot edit the fixed yield table.

## Process contract

```json
{
  "id": "probe-sort-dram-standard",
  "inputs": [{ "resource": "qualified-dram-wafer-lot", "count": 1 }],
  "outputs": [{ "resource": "known-good-dram-die", "count": 8 }],
  "lotTermination": { "terminal": "complete" },
  "lotOutputProfiles": [
    {
      "id": "latent-electrical-yield",
      "defectsAny": ["latent-electrical"],
      "outputCounts": { "known-good-dram-die": 3 }
    }
  ]
}
```

`outputs` remains the nominal engineering and capacity-planning contract. Every profile declares the complete same Resource key set, including explicit zeroes, and may redistribute or reduce units but never exceed the total nominal count. Profile ids and defect names are unique. Profiles require a Process that consumes exactly one tracked lot and explicitly terminates it.

At physical job start the simulator combines the selected incoming lot's existing defects with any queue-time defects assessed for that route step. The first authored profile whose `defectsAny` intersects that set wins; otherwise the nominal output applies. The selected counts are held on the active job, reserve real destination capacity, and become the only outputs on successful completion. Later equipment-breakdown behavior follows the ordinary active-job invariant.

Production-mode `outputCycles` scales nominal and profiled counts together. Static analysis and target-rate capacity planning deliberately use nominal output because they solve the installed engineering envelope. Locked event simulation is authoritative for realized output under fixed Scenario lots.

## Metrics and events

Every completed profiled job emits `lot.output-profile` with the lot id, Process, selected profile (`nominal` for fallback), nominal output, and actual output. `FactoryMetrics.lotOutputFlow` aggregates:

- jobs, nominal units, actual units, lost units, and output realization ratio;
- nominal, actual, and per-Resource shortfall maps;
- the same totals and selected-profile counts per Process.

CLI simulation, run reports, benchmark case output, Blueprint comparison, and Studio expose the same evaluator-owned measurements. Lost units are the non-negative total-unit difference; per-Resource shortfalls remain separate so a profile that changes output grade does not double-count total loss.

## Memory-fab optimization proof

The memory-fab route now ends at explicit wafer Probe and die sort:

```text
qualified tracked wafer lot
  → standard or adaptive Probe
  → actual known-good bare dies
  → one die + one substrate per package
  → final test / speed bin
  → commercial, performance, and automotive contracts
```

The fixed synthetic standard program produces three known-good dies from a lot carrying `latent-electrical`; the adaptive program produces seven with the same eight-die nominal envelope. The locked `yield-research` benchmark differs by exactly one Blueprint Process id and uses early, named latent-defect lots so the five-minute cases measure realized output rather than simulation-window timing. The kept edit raises aggregate score by `17.053080`, improves realization from `79.2%` to `95.8%` in the heavier excursion case, and creates another sellable product batch.

Delivery demand remains a floor. Recovered dies may become above-demand memory and continue earning their declared product value; the engine does not cap a scarce-memory factory at its contract quota.

All timings, die counts, and defect responses are synthetic test parameters rather than a proprietary probe algorithm. The structural sequence follows public descriptions from [Micron](https://www.micron.com/content/dam/micron/educatorhub/intro-to-memory-packaging/micron-intro-to-memory-packaging-presentation.pdf) and [Samsung](https://semiconductor.samsung.com/support/tools-resources/fabrication-process/eight-essential-semiconductor-fabrication-processes-part-8-eds-electrical-die-sorting-for-the-perfect-chips/): wafer-level electrical sorting precedes packaging of passing dies and downstream final test.

## Verification

```bash
bun run inm validate examples/memory-fab --blueprint yield-recovery
bun run inm simulate examples/memory-fab --blueprint yield-recovery --scenario yield-excursion
bun run inm benchmark examples/memory-fab --benchmark yield-research
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "wafer-probe yield program|identity-preserving wafer lots"
```

