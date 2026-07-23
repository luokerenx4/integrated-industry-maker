import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { lockBlueprintBenchmark } from "../../../packages/inm-core/src/index";

interface BenchmarkIdentity {
  id: string;
}

const projectDir = resolve(import.meta.dir, "..");
const benchmarkDir = join(projectDir, "benchmarks");
const benchmarkFiles = (await readdir(benchmarkDir))
  .filter((file) => file.endsWith(".benchmark.json"))
  .sort();

const locked: Array<{ id: string; cases: number; contractHash: string }> = [];
for (const file of benchmarkFiles) {
  const identity = JSON.parse(await readFile(join(benchmarkDir, file), "utf8")) as BenchmarkIdentity;
  const benchmark = await lockBlueprintBenchmark(projectDir, identity.id);
  locked.push({
    id: benchmark.id,
    cases: benchmark.cases.length,
    contractHash: benchmark.lock!.contractHash,
  });
}

process.stdout.write(`${JSON.stringify({ project: "ironworks", locked }, null, 2)}\n`);
