import { parseArgs } from "node:util";
import {
  compileFactoryProject,
  evaluateFactoryBlueprintWithTrace,
  hashValue,
  loadBlueprintBenchmark,
  loadFactoryProject,
  stableStringify,
} from "../packages/inm-core/src";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    case: { type: "string" },
    "all-cases": { type: "boolean", default: false },
    blueprint: { type: "string" },
    repeat: { type: "string", default: "1" },
    warmup: { type: "string", default: "1" },
  },
});

const [projectDir, benchmarkId] = positionals;
if (!projectDir || !benchmarkId) throw new Error(
  "Usage: bun scripts/profile-benchmark-simulator.ts <project-dir> <benchmark-id>"
  + " [--case <id> | --all-cases] [--blueprint <id>] [--warmup <n>] [--repeat <n>]",
);
if (values.case && values["all-cases"]) throw new Error("Choose either --case or --all-cases");

function positiveInteger(value: string, name: string, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return parsed;
}

const repeat = positiveInteger(values.repeat!, "--repeat");
const warmup = positiveInteger(values.warmup!, "--warmup", true);
const benchmark = await loadBlueprintBenchmark(projectDir, benchmarkId);
const cases = values["all-cases"]
  ? benchmark.cases
  : [values.case
      ? benchmark.cases.find((item) => item.id === values.case)
      : benchmark.cases[0]]
    .filter((item) => item !== undefined);
if (!cases.length) throw new Error(`Benchmark '${benchmarkId}' has no case '${values.case}'`);
const blueprint = values.blueprint ?? benchmark.candidateBlueprint;
const measurements: Array<{
  case: string;
  repeat: number;
  durationMs: number;
  eventCount: number;
  evaluationHash: string;
  traceHash: string;
}> = [];

for (const benchmarkCase of cases) {
  const project = compileFactoryProject(await loadFactoryProject(projectDir, {
    world: benchmarkCase.world,
    scenario: benchmarkCase.scenario,
    objective: benchmarkCase.objective,
    blueprint,
  }));
  for (let index = 0; index < warmup + repeat; index++) {
    const startedAt = performance.now();
    const trace = evaluateFactoryBlueprintWithTrace(project, blueprint, benchmarkCase.seed);
    const durationMs = performance.now() - startedAt;
    if (index < warmup) continue;
    measurements.push({
      case: benchmarkCase.id,
      repeat: index - warmup + 1,
      durationMs,
      eventCount: trace.simulation.events.length,
      evaluationHash: hashValue(trace.evaluation),
      traceHash: hashValue(trace.simulation),
    });
  }
}

process.stdout.write(`${stableStringify({
  version: 1,
  benchmark: benchmark.id,
  blueprint,
  warmup,
  repeat,
  measurements,
})}\n`);
