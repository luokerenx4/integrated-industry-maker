# Equipment energy states

Status: explicit hot standby, low-power sleep, physical wake work, failure interruption, metrics, replay, Studio, and locked Blueprint optimization implemented through `inm-sim/0.73.0`.

Related: [[docs/design/power]], [[docs/design/simulation-runtime]], [[docs/design/coding-agent-optimization]], [[docs/design/usage-based-maintenance]], [[docs/PROJECT_FORMAT]], [[examples/memory-fab]].

## Ownership boundary

The Device asset owns immutable equipment physics. Its normal `idleMilliWatts` is hot standby. Optional `power.sleep` declares the lower sleep draw plus fixed wake duration and total wake power. The compiler requires sleep draw below hot standby and wake power at least as high as hot standby.

The Blueprint owns only operating policy:

```json
{
  "power": {
    "idleMilliWatts": 30000,
    "activeMilliWatts": 280000,
    "sleep": {
      "idleMilliWatts": 3000,
      "wakeDurationTicks": 4000,
      "wakePowerMilliWatts": 120000
    }
  }
}
```

```json
"policy": { "idleEnergy": { "sleepAfterTicks": 30000 } }
```

Only production equipment may author this policy, and only when its asset supports sleep. Omission means always-hot standby. This is an early-format contract with no migration or compatibility alias.

## Runtime semantics

An awake, healthy, inactive Device enters sleep at the exact continuous-idle boundary. Sleeping demand replaces normal standby demand in proportional and priority allocation. The engine does not wake speculatively: qualified production must be physically ready, or completed maintenance must be waiting for qualification.

Wake is a real non-material equipment job. It occupies the Device, requests the asset-owned wake envelope, checkpoints under power shortage, and must finish before production or qualification can start. A breakdown cancels wake; recovery leaves the equipment asleep, so the full wake contract is paid again when work is ready. Maintenance, changeover, production, and qualification completion restart the idle clock.

Events are `device.sleep`, `device.wake-start`, `device.wake-finish`, and `device.wake-cancelled`. Metrics report sleeps, wakeups, sleeping ticks, wake ticks, and per-Device counters. CLI comparison, immutable reports, Studio replay, the inspector, and the asset catalog all consume the same state.

## DRAM optimization proof

The memory-fab thermal furnace owns a 3 W sleep state and a four-second, 120 W wake. `equipment-energy-research` freezes two six-lot waves and uses an energy-valuing DRAM Objective. Baseline and candidate differ by one Blueprint field: a 30-second furnace sleep threshold. The candidate sleeps twice, wakes once, spends 196 seconds asleep, preserves capacity readiness and all twelve on-time lots, and passes the locked score gate. `bun run memory-fab:research-energy` evaluates the off state and eight thresholds in memory; `--write-best` writes only a strict gate-passing winner.

## Source of truth

- Schema and contracts: `packages/inm-core/src/types.ts`, `packages/inm-core/src/schema.ts`, `packages/inm-core/src/compiler.ts`
- Scheduling and mutation: `packages/inm-core/src/simulator.ts`, `packages/inm-core/src/state.ts`
- Metrics and comparison: `packages/inm-core/src/evaluator.ts`, `packages/inm-core/src/blueprint-comparison.ts`
- Public surfaces: `packages/inm-cli/src/commands.ts`, `packages/inm-studio/src/main.tsx`

## Verification

```bash
bun test packages/inm-core/src/inm-core.test.ts --test-name-pattern "sleep|energy work"
bun run memory-fab:research-energy
bun run inm benchmark examples/memory-fab --benchmark equipment-energy-research
```

Tests must cover exact sleep/wake boundaries, energy reduction, wake delay, failure cancellation/retry, invalid asset/policy contracts, one-change benchmark shape, replay, and surface serialization.
