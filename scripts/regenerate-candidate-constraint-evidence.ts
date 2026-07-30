import { readdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  atomicWriteJson,
  evaluateObjectiveConstraints,
  hashValue,
  readJson,
  type Objective,
} from "../packages/inm-core/src";

type JsonRecord = Record<string, any>;

const projectDir = resolve(process.argv[2] ?? "examples/memory-fab");
const receiptRoot = join(projectDir, "candidate-reviews");
const investigationRoot = join(projectDir, "investigations");

async function directories(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function files(path: string, suffix: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(path, entry.name))
    .sort();
}

const benchmarkCases = new Map<string, Map<string, { objective: Objective; durationTicks: number }>>();

async function casesForBenchmark(benchmarkId: string): Promise<Map<string, { objective: Objective; durationTicks: number }>> {
  const cached = benchmarkCases.get(benchmarkId);
  if (cached) return cached;
  const benchmark = await readJson(join(projectDir, "benchmarks", `${benchmarkId}.benchmark.json`)) as JsonRecord;
  const result = new Map<string, { objective: Objective; durationTicks: number }>();
  for (const item of benchmark.cases as JsonRecord[]) {
    const [objective, scenario] = await Promise.all([
      readJson(join(projectDir, "objectives", `${item.objective}.objective.json`)) as Promise<Objective>,
      readJson(join(projectDir, "scenarios", `${item.scenario}.scenario.json`)) as Promise<{ durationTicks: number }>,
    ]);
    result.set(item.id, { objective, durationTicks: scenario.durationTicks });
  }
  benchmarkCases.set(benchmarkId, result);
  return result;
}

function attachConstraints(snapshot: JsonRecord, objective: Objective, durationTicks: number): void {
  const minimumContracts = (objective.deliveryContracts ?? []).filter((contract) => contract.minimumFulfillment !== undefined);
  if (minimumContracts.length) throw new Error(
    `Cannot reconstruct per-contract fulfillment for Objective '${objective.id}' from a compact historical metric snapshot`,
  );
  snapshot.objectiveConstraints = evaluateObjectiveConstraints(objective, {
    totalBuildCost: snapshot.totalBuildCost,
    occupiedArea: snapshot.occupiedArea,
    targetProduction: snapshot.throughputPerMinute * durationTicks / 60_000,
    contractFulfillment: {},
  });
}

function replaceReviewResultHashes(value: unknown, hashes: Map<string, string>): boolean {
  if (!value || typeof value !== "object") return false;
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = replaceReviewResultHashes(item, hashes) || changed;
    return changed;
  }
  const record = value as JsonRecord;
  if (typeof record.reviewResultHash === "string" && hashes.has(record.reviewResultHash)) {
    record.reviewResultHash = hashes.get(record.reviewResultHash);
    changed = true;
  }
  for (const child of Object.values(record)) changed = replaceReviewResultHashes(child, hashes) || changed;
  return changed;
}

function replaceProposalHashes(value: unknown, hashes: Map<string, string>): boolean {
  if (!value || typeof value !== "object") return false;
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = replaceProposalHashes(item, hashes) || changed;
    return changed;
  }
  const record = value as JsonRecord;
  if (typeof record.proposalHash === "string" && hashes.has(record.proposalHash)) {
    record.proposalHash = hashes.get(record.proposalHash);
    changed = true;
  }
  for (const child of Object.values(record)) changed = replaceProposalHashes(child, hashes) || changed;
  return changed;
}

const receipts: Array<{ path: string; value: JsonRecord }> = [];
for (const candidate of await directories(receiptRoot)) {
  for (const path of await files(join(receiptRoot, candidate), ".review.json")) {
    receipts.push({ path, value: await readJson(path) as JsonRecord });
  }
}

const reviewResultHashes = new Map<string, string>();
for (const receipt of receipts) {
  const cases = await casesForBenchmark(receipt.value.benchmark);
  for (const item of receipt.value.result.cases as JsonRecord[]) {
    const context = cases.get(item.id);
    if (!context) throw new Error(`Benchmark '${receipt.value.benchmark}' omitted case '${item.id}'`);
    attachConstraints(item.baselineMetrics, context.objective, context.durationTicks);
    attachConstraints(item.candidateMetrics, context.objective, context.durationTicks);
  }
  if (receipt.value.currentFactory.status === "evaluated") {
    for (const item of receipt.value.currentFactory.cases as JsonRecord[]) {
      const context = cases.get(item.id);
      if (!context) throw new Error(`Benchmark '${receipt.value.benchmark}' omitted case '${item.id}'`);
      attachConstraints(item.currentMetrics, context.objective, context.durationTicks);
      attachConstraints(item.proposedMetrics, context.objective, context.durationTicks);
    }
  }
  const previous = receipt.value.resultHash;
  receipt.value.resultHash = hashValue({
    result: receipt.value.result,
    currentFactory: receipt.value.currentFactory,
  });
  reviewResultHashes.set(previous, receipt.value.resultHash);
  await atomicWriteJson(receipt.path, receipt.value);
}

const investigationManifests: Array<{ path: string; value: JsonRecord; previousHash: string }> = [];
const investigationEntries: Array<{ path: string; value: JsonRecord }> = [];
for (const investigation of await directories(investigationRoot)) {
  const manifestPath = join(investigationRoot, investigation, "manifest.json");
  const manifest = await readJson(manifestPath) as JsonRecord;
  for (const anchor of manifest.anchors as JsonRecord[]) {
    if (anchor.kind !== "operating-run") continue;
    const run = await readJson(join(projectDir, "runs", anchor.runId, "manifest.json")) as JsonRecord;
    anchor.resultHash = run.resultHash;
  }
  replaceReviewResultHashes(manifest, reviewResultHashes);
  const previousHash = manifest.manifestHash;
  const { manifestHash: _, ...manifestWithoutHash } = manifest;
  manifest.manifestHash = hashValue(manifestWithoutHash);
  investigationManifests.push({ path: manifestPath, value: manifest, previousHash });
  await atomicWriteJson(manifestPath, manifest);
  for (const path of await files(join(investigationRoot, investigation, "entries"), ".entry.json")) {
    const entry = await readJson(path) as JsonRecord;
    replaceReviewResultHashes(entry, reviewResultHashes);
    investigationEntries.push({ path, value: entry });
  }
}

const manifestHashes = new Map(investigationManifests.map((manifest) => [manifest.previousHash, manifest.value.manifestHash]));
const proposalHashes = new Map<string, string>();
for (const path of await files(join(projectDir, "candidates"), ".candidate.json")) {
  const candidate = await readJson(path) as JsonRecord;
  if (candidate.source?.kind !== "investigation-hypothesis") continue;
  const nextManifestHash = manifestHashes.get(candidate.source.manifestHash);
  if (!nextManifestHash || nextManifestHash === candidate.source.manifestHash) continue;
  const previousProposalHash = hashValue(candidate);
  candidate.source.manifestHash = nextManifestHash;
  const nextProposalHash = hashValue(candidate);
  proposalHashes.set(previousProposalHash, nextProposalHash);
  await atomicWriteJson(path, candidate);
}

for (const receipt of receipts) {
  const nextProposalHash = proposalHashes.get(receipt.value.proposalHash);
  if (!nextProposalHash) continue;
  receipt.value.proposalHash = nextProposalHash;
  const nextPath = join(dirname(receipt.path), `${nextProposalHash}.review.json`);
  await rename(receipt.path, nextPath);
  receipt.path = nextPath;
  await atomicWriteJson(nextPath, receipt.value);
}

const entriesByInvestigation = new Map<string, Array<{ path: string; value: JsonRecord }>>();
for (const entry of investigationEntries) {
  replaceProposalHashes(entry.value, proposalHashes);
  const entries = entriesByInvestigation.get(entry.value.investigation) ?? [];
  entries.push(entry);
  entriesByInvestigation.set(entry.value.investigation, entries);
}
for (const entries of entriesByInvestigation.values()) {
  entries.sort((left, right) => left.value.sequence - right.value.sequence);
  let previousEntryHash: string | null = null;
  for (const entry of entries) {
    entry.value.previousEntryHash = previousEntryHash;
    const { entryHash: _, ...entryWithoutHash } = entry.value;
    entry.value.entryHash = hashValue(entryWithoutHash);
    previousEntryHash = entry.value.entryHash;
    await atomicWriteJson(entry.path, entry.value);
  }
}

process.stdout.write(
  `Regenerated ${receipts.length} Candidate review receipt(s), ${investigationManifests.length} Investigation manifest(s), and ${investigationEntries.length} Investigation entry chain item(s) in ${projectDir}.\n`,
);
