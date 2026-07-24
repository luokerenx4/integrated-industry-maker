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
  selection: { world: string; blueprint: string; scenario: string; objective: string };
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
  return (await listRuns(projectDir)).find((run) => run.manifest.selection.blueprint
    && run.manifest.runKey === runKey && run.manifest.decision !== "REVERT");
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
  const storageRows = Object.entries(result.metrics.energyStorage).filter(([, storage]) => storage.capacityMilliJoules > 0)
    .map(([grid, storage]) => `| ${grid} | ${(storage.initialMilliJoules / 1e6).toFixed(3)} | ${(storage.storedMilliJoules / 1e6).toFixed(3)} / ${(storage.capacityMilliJoules / 1e6).toFixed(3)} | ${(storage.chargedMilliJoules / 1e6).toFixed(3)} | ${(storage.dischargedMilliJoules / 1e6).toFixed(3)} |`);
  const stationEnergyRows = Object.entries(result.metrics.stationEnergy)
    .map(([device, energy]) => `| ${device} | ${(energy.initialMilliJoules / 1e6).toFixed(3)} | ${(energy.storedMilliJoules / 1e6).toFixed(3)} / ${(energy.capacityMilliJoules / 1e6).toFixed(3)} | ${(energy.configuredChargeMilliWatts / 1000).toFixed(3)} | ${(energy.chargedMilliJoules / 1e6).toFixed(3)} | ${(energy.spentMilliJoules / 1e6).toFixed(3)} |`);
  const inventoryRows = Object.entries(result.metrics.inventoryAccounting.resources)
    .filter(([, accounting]) => accounting.averageInventory > 0 || accounting.peakInventory > 0 || accounting.finalInventory > 0)
    .sort(([, left], [, right]) => Number(right.includedInWip) - Number(left.includedInWip)
      || right.averageInventory - left.averageInventory)
    .map(([resource, accounting]) => `| ${resource} | ${accounting.includedInWip ? "WIP" : "excluded"} | ${accounting.averageInventory.toFixed(3)} | ${accounting.peakInventory.toFixed(3)} | ${accounting.finalInventory.toFixed(3)} |`);
  const totalUnpoweredTicks = Object.values(result.metrics.unpoweredTime).reduce((sum, ticks) => sum + ticks, 0);
  const treatedMaterials = Object.entries(result.metrics.materialTreatment.treated)
    .flatMap(([resource, levels]) => Object.entries(levels).map(([level, count]) => `${count} ${resource}@${level}`));
  const treatmentAgents = Object.entries(result.metrics.materialTreatment.agentsConsumed)
    .map(([resource, count]) => `${count} ${resource}`);
  const routeQueueTime = Object.values(result.metrics.routeFlow).reduce((summary, route) => ({
    violations: summary.violations + route.queueTimeViolations,
    violatedLots: summary.violatedLots + route.violatedLots,
    maximumOverrunTicks: Math.max(summary.maximumOverrunTicks, ...Object.values(route.steps).map((step) => Math.max(0, step.maximumQueueTicks - (step.queueTimeMaximumTicks ?? step.maximumQueueTicks)))),
  }), { violations: 0, violatedLots: 0, maximumOverrunTicks: 0 });
  const capacityPlan = planProductionCapacity(project);
  const report = [
    `# INM Run ${name}`, "", `- Decision: **${options.decision ?? "BASELINE"}**`,
    `- Blueprint: \`${project.selection.blueprint}\``,
    `- Score: **${result.metrics.finalScore.toFixed(3)}**`, `- Result hash: \`${result.resultHash}\``,
    `- Bottleneck: ${result.metrics.bottleneckEntity ?? "none"}`, `- Throughput/min: ${result.metrics.throughputPerMinute.toFixed(3)}`,
    `- Delivery portfolio: ${(result.metrics.deliveryPortfolio.fulfillment * 100).toFixed(1)}% demand attainment · ${result.metrics.deliveryPortfolio.valued.toFixed(3)} / ${result.metrics.deliveryPortfolio.demanded.toFixed(3)} valued / demanded · ${result.metrics.deliveryPortfolio.overflow.toFixed(3)} above demand · ${result.metrics.deliveryPortfolio.netValuePerMinute.toFixed(3)} net value/min`,
    ...Object.entries(result.metrics.deliveryPortfolio.contracts).map(([id, contract]) => `  - Contract \`${id}\`: ${contract.delivered.toFixed(3)} / ${contract.demand.toFixed(3)} \`${contract.resource}\` · ${(contract.fulfillment * 100).toFixed(1)}% · ${contract.netValue.toFixed(3)} net value`),
    `- Tracked lots: ${result.metrics.lotFlow.completed} / ${result.metrics.lotFlow.released} / ${result.metrics.lotFlow.scheduled} completed / released / scheduled · ${result.metrics.lotFlow.scrapped} scrapped${result.metrics.lotFlow.family ? ` in family \`${result.metrics.lotFlow.family}\`` : ""}`,
    `- Release flow: ${(result.metrics.releaseFlow.meanPlannedIntervalTicks / 1000).toFixed(3)} s planned interval · ${(result.metrics.releaseFlow.meanActualIntervalTicks / 1000).toFixed(3)} s actual interval · ${(result.metrics.releaseFlow.meanReleaseDelayTicks / 1000).toFixed(3)} s mean delay · ${result.metrics.releaseFlow.pending} pending`,
    `- Release control: ${result.metrics.releaseFlow.control}${result.metrics.releaseFlow.maximumWip === null ? "" : ` · max WIP ${result.metrics.releaseFlow.maximumWip} · reopen at ${result.metrics.releaseFlow.reopenAtWip} · ${result.metrics.releaseFlow.dispatch}${result.metrics.releaseFlow.maximumReleaseDelayPolicyTicks === null ? "" : ` · max delay ${(result.metrics.releaseFlow.maximumReleaseDelayPolicyTicks / 1000).toFixed(3)} s`}`} · peak ${result.metrics.releaseFlow.peakActiveLots} active lots · ${result.metrics.releaseFlow.controlBlockedLots} control-blocked / ${(result.metrics.releaseFlow.controlBlockedTicks / 1000).toFixed(3)} lot-s · ${result.metrics.releaseFlow.capacityBlockedLots} capacity-blocked / ${(result.metrics.releaseFlow.capacityBlockedTicks / 1000).toFixed(3)} lot-s · ${result.metrics.releaseFlow.serviceLevelOpenings} service openings`,
    `- Lot service: ${(result.metrics.onTimeDelivery * 100).toFixed(1)}% on time · mean cycle ${(result.metrics.lotFlow.meanCycleTimeTicks / 1000).toFixed(3)} s · p95 ${(result.metrics.lotFlow.p95CycleTimeTicks / 1000).toFixed(3)} s · mean tardiness ${(result.metrics.lotFlow.meanTardinessTicks / 1000).toFixed(3)} s`,
    `- Quality flow: ${(result.metrics.qualityFlow.goodYield * 100).toFixed(1)}% good yield · ${(result.metrics.qualityFlow.firstPassYield * 100).toFixed(1)}% first-pass · ${result.metrics.qualityFlow.totalInspections} inspections · ${result.metrics.qualityFlow.totalReworkCycles} rework cycles · ${result.metrics.qualityFlow.scrapDispositions} scrap dispositions · ${result.metrics.qualityFlow.escapedDefects} escapes`,
    `- Lot-derived output: ${result.metrics.lotOutputFlow.actualUnits} / ${result.metrics.lotOutputFlow.nominalUnits} actual / nominal units · ${(result.metrics.lotOutputFlow.outputRatio * 100).toFixed(1)}% realization · ${result.metrics.lotOutputFlow.lostUnits} lost`,
    `- Route Q-time: ${routeQueueTime.violations} violations across ${routeQueueTime.violatedLots} lots · ${(routeQueueTime.maximumOverrunTicks / 1000).toFixed(3)} s maximum overrun`,
    `- Batch processing: ${result.metrics.batchFlow.jobs} jobs · ${result.metrics.batchFlow.lots} lots · ${result.metrics.batchFlow.averageLotsPerJob.toFixed(3)} lots/job · ${(result.metrics.batchFlow.meanQueueWaitTicksPerLot / 1000).toFixed(3)} s mean device wait/lot · ${result.metrics.batchFlow.formationHolds} formation holds / ${(result.metrics.batchFlow.formationHoldTicks / 1000).toFixed(3)} s (${result.metrics.batchFlow.preferredReleases} full-batch / ${result.metrics.batchFlow.timeoutReleases} timeout)`,
    `- Equipment setup: ${result.metrics.equipmentSetups.totalChangeovers} changeovers · ${(result.metrics.equipmentSetups.totalSetupTicks / 1000).toFixed(3)} s work · ${result.metrics.equipmentSetups.totalCampaignHolds} campaign holds / ${(result.metrics.equipmentSetups.totalCampaignHoldTicks / 1000).toFixed(3)} s (${result.metrics.equipmentSetups.campaignMinimumLotReleases} lot-ready / ${result.metrics.equipmentSetups.campaignMaximumHoldReleases} timeout)`,
    `- Equipment energy states: ${result.metrics.equipmentEnergyManagement.totalSleeps} sleeps · ${result.metrics.equipmentEnergyManagement.totalWakeups} wakeups · ${(result.metrics.equipmentEnergyManagement.totalSleepingTicks / 1000).toFixed(3)} equipment-s sleeping · ${(result.metrics.equipmentEnergyManagement.totalWakeTicks / 1000).toFixed(3)} equipment-s waking`,
    `- Inventory accounting: ${result.metrics.inventoryAccounting.averageWip.toFixed(3)} average scored WIP / ${result.metrics.inventoryAccounting.averageTotalInventory.toFixed(3)} total inventory · ${result.metrics.inventoryAccounting.peakWip.toFixed(3)} peak WIP / ${result.metrics.inventoryAccounting.peakTotalInventory.toFixed(3)} peak total`,
    `- Electricity cost: ${(result.metrics.electricityCosts.totalMicroCurrency / 1e6).toFixed(6)} currency · ${(result.metrics.electricityCosts.energyChargeMicroCurrency / 1e6).toFixed(6)} energy · ${(result.metrics.electricityCosts.demandChargeMicroCurrency / 1e6).toFixed(6)} peak demand`,
    `- Primary target rate: ${capacityPlan.targetRatePerMinute.toFixed(3)} ${capacityPlan.targetResource}/min`,
    `- Capacity delivery targets: ${capacityPlan.deliveryTargets.map((target) => `${target.ratePerMinute.toFixed(3)} ${target.resource}/min`).join(" + ")}`,
    `- Power allocation: ${project.blueprint.policies.powerAllocation}`,
    `- Minimum grid satisfaction: ${Math.min(1_000_000, ...Object.values(result.metrics.powerGrids).map((grid) => grid.minimumSatisfactionPpm)) / 10_000}%`,
    `- Capacity plan: ${capacityPlan.ready ? "READY" : `${capacityPlan.gaps.length} GAP${capacityPlan.gaps.length === 1 ? "" : "S"}`}`,
    `- Belt utilization: ${(result.metrics.beltCellUtilization * 100).toFixed(1)}%`, `- Average blocked belt items: ${result.metrics.averageBlockedBeltItems.toFixed(3)}`, `- Peak belt items: ${result.metrics.peakBeltItems}`,
    `- Powered transport energy: ${(result.metrics.transportEnergyConsumedMilliJoules / 1_000).toFixed(3)} J`,
    `- High-speed carrier missions: ${result.metrics.highSpeedMissions}`,
    `- Carrier missions / completed returns: ${result.metrics.carrierMissions} / ${result.metrics.carrierReturns}`,
    `- Material treated: ${treatedMaterials.join(" + ") || "none"}`,
    `- Treatment agents consumed: ${treatmentAgents.join(" + ") || "none"}`,
    `- Aggregate unpowered time: ${totalUnpoweredTicks} device-ticks`,
    result.metrics.infeasibleReason ? `- Infeasible: ${result.metrics.infeasibleReason}` : "- Feasible: yes", "", "## Capacity-plan gaps", "",
    ...(capacityPlan.gaps.length ? capacityPlan.gaps.map((gap) => `- **${gap.kind}** \`${gap.entity}\`: ${gap.message}`) : ["- None; the selected blueprint provisions the complete target-rate plan."]),
    "", "## Measured transport flows", "",
    "| Connection | Delivered / capacity (items/min) | Utilization | Blocked item-ticks | Delivered resources |",
    "| --- | ---: | ---: | ---: | --- |", ...transportRows, "", "## Grid storage", "",
    ...(storageRows.length ? [
      "| Grid | Initial (MJ) | Final / capacity (MJ) | Charged (MJ) | Discharged (MJ) |",
      "| --- | ---: | ---: | ---: | ---: |", ...storageRows,
    ] : ["No configured accumulators."]), "", "## Station carrier energy", "",
    ...(stationEnergyRows.length ? [
      "| Station | Initial (MJ) | Final / capacity (MJ) | Charge cap (W) | Charged (MJ) | Missions (MJ) |",
      "| --- | ---: | ---: | ---: | ---: | ---: |", ...stationEnergyRows,
    ] : ["No configured logistics stations."]), "", "## Objective inventory accounting", "",
    "| Resource | Scope | Average inventory | Peak inventory | Final inventory |",
    "| --- | --- | ---: | ---: | ---: |",
    ...inventoryRows,
    "", "Only Resources explicitly declared by the selected Objective as `WIP` contribute to the WIP score component.",
    "", "## Score breakdown", "",
    "```json", stableStringify(result.metrics.scoreBreakdown, 2), "```", "",
  ].join("\n");
  await atomicWrite(join(runDir, "report.md"), report);
  const manifest: RunManifest = {
    version: 1, status: "completed", createdAt: new Date().toISOString(), runKey: result.runKey,
    resultHash: result.resultHash, engineVersion: project.hashes.engineVersion, hashes: project.hashes,
    selection: { ...project.selection },
    seed: options.seed, decision: options.decision ?? "BASELINE", ...(options.parentRun ? { parentRun: basename(options.parentRun) } : {}),
  };
  await atomicWriteJson(join(runDir, "manifest.json"), manifest);
  return { name, path: runDir, manifest, score: result.metrics.finalScore };
}

export async function verifyRunReplay(project: CompiledFactoryProject, run: RunSummary, result: SimulationResult): Promise<boolean> {
  const stored = JSON.parse(await readFile(join(run.path, "manifest.json"), "utf8")) as RunManifest;
  return stored.resultHash === result.resultHash && stored.runKey === result.runKey && hashValue(project.blueprint) === hashValue(JSON.parse(await readFile(join(run.path, "blueprint.json"), "utf8")));
}
