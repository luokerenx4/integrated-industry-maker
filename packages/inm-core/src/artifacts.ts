import { mkdir, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Blueprint, CompiledFactoryProject, FactoryEvent, SimulationResult } from "./types";
import { atomicWrite, atomicWriteJson, hashValue, pathExists, stableStringify } from "./utils";
import { planProductionCapacity } from "./capacity-plan";

export interface RunArtifactOptions {
  label: string;
  seed: number;
  blueprint?: Blueprint;
  hypothesis?: string;
  patch?: JsonPatchOperation[];
  decision?: "BASELINE" | "KEEP" | "REVERT";
  parentRun?: string;
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

export interface RunManifest {
  version: 1;
  status: "completed";
  createdAt: string;
  runKey: string;
  resultHash: string;
  engineVersion: string;
  hashes: CompiledFactoryProject["hashes"];
  seed: number;
  decision: "BASELINE" | "KEEP" | "REVERT";
  parentRun?: string;
}

export interface RunSummary {
  name: string;
  path: string;
  manifest: RunManifest;
  score: number;
}

function safeLabel(label: string): string { return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "run"; }

export async function listRuns(projectDir: string): Promise<RunSummary[]> {
  const runsDir = join(projectDir, "runs");
  if (!(await pathExists(runsDir))) return [];
  const names = (await readdir(runsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const runs: RunSummary[] = [];
  for (const name of names) {
    try {
      const manifest = JSON.parse(await readFile(join(runsDir, name, "manifest.json"), "utf8")) as RunManifest;
      const metrics = JSON.parse(await readFile(join(runsDir, name, "metrics.json"), "utf8")) as { finalScore: number };
      if (manifest.status === "completed") runs.push({ name, path: join(runsDir, name), manifest, score: metrics.finalScore });
    } catch { /* Incomplete directories are ignored and reported by inspect. */ }
  }
  return runs;
}

export async function findCachedRun(projectDir: string, runKey: string): Promise<RunSummary | undefined> {
  return (await listRuns(projectDir)).find((run) => run.manifest.runKey === runKey && run.manifest.decision !== "REVERT");
}

export async function writeRunArtifact(project: CompiledFactoryProject, result: SimulationResult, options: RunArtifactOptions): Promise<RunSummary> {
  const runs = await listRuns(project.rootDir);
  const number = runs.reduce((max, run) => Math.max(max, Number.parseInt(run.name.slice(0, 3), 10) || 0), -1) + 1;
  const name = `${String(number).padStart(3, "0")}-${safeLabel(options.label)}`;
  const runDir = join(project.rootDir, "runs", name);
  if (await pathExists(runDir)) throw new Error(`Run artifact already exists and is immutable: ${runDir}`);
  await mkdir(join(project.rootDir, "runs"), { recursive: true });
  await mkdir(runDir, { recursive: false });
  const blueprint = options.blueprint ?? project.blueprint;
  await atomicWriteJson(join(runDir, "blueprint.json"), blueprint);
  await atomicWriteJson(join(runDir, "metrics.json"), result.metrics);
  await atomicWriteJson(join(runDir, "final-state.json"), result.state);
  await atomicWrite(join(runDir, "events.ndjson"), `${result.events.map((event) => stableStringify(event)).join("\n")}\n`);
  if (options.hypothesis) await atomicWrite(join(runDir, "hypothesis.md"), `${options.hypothesis.trim()}\n`);
  if (options.patch) await atomicWriteJson(join(runDir, "patch.json"), options.patch);
  const transportRows = Object.entries(result.metrics.transportFlows).sort(([, a], [, b]) => b.utilization - a.utilization || b.blockedItemTicks - a.blockedItemTicks).map(([connection, flow]) => {
    const resources = Object.entries(flow.deliveredByResource).map(([resource, count]) => `${count} ${resource}`).join(" + ") || "—";
    return `| ${connection} | ${flow.deliveredItemsPerMinute.toFixed(3)} / ${flow.capacityItemsPerMinute.toFixed(3)} | ${(flow.utilization * 100).toFixed(1)}% | ${flow.blockedItemTicks} | ${resources} |`;
  });
  const capacityPlan = planProductionCapacity(project);
  const report = [
    `# INM Run ${name}`, "", `- Decision: **${options.decision ?? "BASELINE"}**`,
    `- Score: **${result.metrics.finalScore.toFixed(3)}**`, `- Result hash: \`${result.resultHash}\``,
    `- Bottleneck: ${result.metrics.bottleneckEntity ?? "none"}`, `- Throughput/min: ${result.metrics.throughputPerMinute.toFixed(3)}`,
    `- Target rate: ${capacityPlan.targetRatePerMinute.toFixed(3)} ${capacityPlan.targetResource}/min (${(result.metrics.onTimeDelivery * 100).toFixed(1)}% attained)`,
    `- Capacity plan: ${capacityPlan.ready ? "READY" : `${capacityPlan.gaps.length} GAP${capacityPlan.gaps.length === 1 ? "" : "S"}`}`,
    `- Belt utilization: ${(result.metrics.beltCellUtilization * 100).toFixed(1)}%`, `- Average blocked belt items: ${result.metrics.averageBlockedBeltItems.toFixed(3)}`, `- Peak belt items: ${result.metrics.peakBeltItems}`,
    `- Powered transport energy: ${(result.metrics.transportEnergyConsumedMilliJoules / 1_000).toFixed(3)} J`,
    result.metrics.infeasibleReason ? `- Infeasible: ${result.metrics.infeasibleReason}` : "- Feasible: yes", "", "## Capacity-plan gaps", "",
    ...(capacityPlan.gaps.length ? capacityPlan.gaps.map((gap) => `- **${gap.kind}** \`${gap.entity}\`: ${gap.message}`) : ["- None; the selected blueprint provisions the complete target-rate plan."]),
    "", "## Measured transport flows", "",
    "| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |",
    "| --- | ---: | ---: | ---: | --- |", ...transportRows, "", "## Score breakdown", "",
    "```json", stableStringify(result.metrics.scoreBreakdown, 2), "```", "",
  ].join("\n");
  await atomicWrite(join(runDir, "report.md"), report);
  const manifest: RunManifest = {
    version: 1, status: "completed", createdAt: new Date().toISOString(), runKey: result.runKey,
    resultHash: result.resultHash, engineVersion: project.hashes.engineVersion, hashes: project.hashes,
    seed: options.seed, decision: options.decision ?? "BASELINE", ...(options.parentRun ? { parentRun: basename(options.parentRun) } : {}),
  };
  await atomicWriteJson(join(runDir, "manifest.json"), manifest);
  return { name, path: runDir, manifest, score: result.metrics.finalScore };
}

export async function verifyRunReplay(project: CompiledFactoryProject, run: RunSummary, result: SimulationResult): Promise<boolean> {
  const stored = JSON.parse(await readFile(join(run.path, "manifest.json"), "utf8")) as RunManifest;
  return stored.resultHash === result.resultHash && stored.runKey === result.runKey && hashValue(project.blueprint) === hashValue(JSON.parse(await readFile(join(run.path, "blueprint.json"), "utf8")));
}
