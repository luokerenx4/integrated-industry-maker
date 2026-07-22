import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { evaluateBlueprintBenchmark, loadBlueprintBenchmark, type BlueprintBenchmarkResult } from "./benchmark";
import { applyResearchPatch, validateResearchPatch } from "./research";
import { blueprintSchema } from "./schema";
import { loadFactoryProject } from "./loader";
import type { Blueprint } from "./types";
import { atomicWriteJson, hashValue, pathExists, readJson } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const patchOperationSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  path: z.string().min(1),
  value: z.unknown().optional(),
}).strict().superRefine((operation, context) => {
  if (operation.op !== "remove" && !("value" in operation)) context.addIssue({ code: "custom", message: `${operation.op} requires value`, path: ["value"] });
});

export const candidateChangeSetSchema = z.object({
  version: z.literal(1),
  id,
  name: z.string().min(1),
  benchmark: id,
  hypothesis: z.string().min(1),
  expectedEffect: z.string().min(1).optional(),
  source: z.object({
    kind: z.literal("design-run"),
    program: id,
    resultHash: hash,
    blueprintHash: hash,
  }).strict().optional(),
  baseCandidateHash: hash,
  patch: z.array(patchOperationSchema).min(1),
}).strict();

export type CandidateChangeSet = z.infer<typeof candidateChangeSetSchema>;

export interface CandidateChangeSetSummary extends CandidateChangeSet {}

export interface CandidateChangeSetPreview {
  candidate: CandidateChangeSet;
  proposalHash: string;
  currentCandidateHash: string;
  proposedCandidateHash: string;
  result: BlueprintBenchmarkResult;
}

export interface AppliedCandidateChangeSet extends CandidateChangeSetPreview {
  applied: true;
  blueprintPath: string;
}

export class CandidateChangeSetError extends Error {
  constructor(public readonly code: string, message: string, public readonly hashes: Record<string, string> = {}) {
    super(message);
    this.name = "CandidateChangeSetError";
  }
}

function candidatePath(projectDir: string, candidateId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(candidateId)) throw new CandidateChangeSetError("candidate.invalid-id", "Candidate id must use lowercase kebab-case");
  return join(resolve(projectDir), "candidates", `${candidateId}.candidate.json`);
}

function parseCandidateChangeSet(value: unknown, candidateId: string): CandidateChangeSet {
  const parsed = candidateChangeSetSchema.safeParse(value);
  if (!parsed.success) throw new CandidateChangeSetError(
    "candidate.invalid",
    `Invalid candidate change set '${candidateId}': ${parsed.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
  );
  if (parsed.data.id !== candidateId) throw new CandidateChangeSetError("candidate.id-mismatch", `Candidate id '${parsed.data.id}' must match filename '${candidateId}'`);
  return parsed.data;
}

export async function loadCandidateChangeSet(projectDir: string, candidateId: string): Promise<CandidateChangeSet> {
  return parseCandidateChangeSet(await readJson(candidatePath(projectDir, candidateId)), candidateId);
}

export async function writeCandidateChangeSet(projectDir: string, candidate: CandidateChangeSet): Promise<string> {
  const parsed = parseCandidateChangeSet(candidate, candidate.id);
  validateResearchPatch(parsed.patch);
  const path = candidatePath(projectDir, parsed.id);
  if (await pathExists(path)) throw new CandidateChangeSetError("candidate.exists", `Candidate change set '${parsed.id}' already exists`);
  await atomicWriteJson(path, parsed);
  return path;
}

export async function listCandidateChangeSets(projectDir: string, benchmarkId?: string): Promise<CandidateChangeSetSummary[]> {
  const directory = join(resolve(projectDir), "candidates");
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const ids = files.filter((file) => file.endsWith(".candidate.json"))
    .map((file) => file.slice(0, -".candidate.json".length)).sort();
  const candidates = await Promise.all(ids.map((candidateId) => loadCandidateChangeSet(projectDir, candidateId)));
  return candidates.filter((candidate) => !benchmarkId || candidate.benchmark === benchmarkId);
}

async function prepareCandidateChangeSet(projectDir: string, candidateId: string): Promise<CandidateChangeSetPreview & { proposedBlueprint: Blueprint; blueprintPath: string }> {
  const candidate = await loadCandidateChangeSet(projectDir, candidateId);
  const benchmark = await loadBlueprintBenchmark(projectDir, candidate.benchmark);
  const firstCase = benchmark.cases[0]!;
  const loaded = await loadFactoryProject(projectDir, {
    world: firstCase.world,
    blueprint: benchmark.candidateBlueprint,
    scenario: firstCase.scenario,
    objective: firstCase.objective,
  });
  const currentCandidateHash = hashValue(loaded.blueprint);
  if (candidate.baseCandidateHash !== currentCandidateHash) throw new CandidateChangeSetError(
    "candidate.stale-base",
    `Candidate change set '${candidate.id}' targets ${candidate.baseCandidateHash}, but Blueprint '${benchmark.candidateBlueprint}' is ${currentCandidateHash}`,
    { expectedBaseHash: candidate.baseCandidateHash, currentCandidateHash },
  );
  let patched: Blueprint;
  try { patched = applyResearchPatch(loaded.blueprint, candidate.patch); }
  catch (error) {
    throw new CandidateChangeSetError("candidate.invalid-patch", `Candidate change set '${candidate.id}' has an invalid patch: ${error instanceof Error ? error.message : String(error)}`);
  }
  patched.revision = currentCandidateHash;
  const parsedBlueprint = blueprintSchema.safeParse(patched);
  if (!parsedBlueprint.success) throw new CandidateChangeSetError(
    "candidate.invalid-blueprint",
    `Candidate change set '${candidate.id}' produces an invalid Blueprint: ${parsedBlueprint.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
  );
  const proposedBlueprint = parsedBlueprint.data;
  const proposedCandidateHash = hashValue(proposedBlueprint);
  let result: BlueprintBenchmarkResult;
  try { result = await evaluateBlueprintBenchmark(projectDir, candidate.benchmark, { candidateBlueprint: proposedBlueprint }); }
  catch (error) {
    throw new CandidateChangeSetError("candidate.evaluation-failed", `Candidate change set '${candidate.id}' could not be evaluated: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    candidate,
    proposalHash: hashValue(candidate),
    currentCandidateHash,
    proposedCandidateHash,
    proposedBlueprint,
    result,
    blueprintPath: join(loaded.rootDir, "blueprints", `${benchmark.candidateBlueprint}.blueprint.json`),
  };
}

export async function previewCandidateChangeSet(projectDir: string, candidateId: string): Promise<CandidateChangeSetPreview> {
  const { proposedBlueprint: _, blueprintPath: __, ...preview } = await prepareCandidateChangeSet(projectDir, candidateId);
  return preview;
}

export async function applyCandidateChangeSet(
  projectDir: string,
  candidateId: string,
  reviewed: { proposalHash: string; currentCandidateHash: string; proposedCandidateHash: string },
): Promise<AppliedCandidateChangeSet> {
  const prepared = await prepareCandidateChangeSet(projectDir, candidateId);
  if (reviewed.proposalHash !== prepared.proposalHash) throw new CandidateChangeSetError(
    "candidate.review-proposal-mismatch",
    `Reviewed proposal hash ${reviewed.proposalHash} does not match current proposal hash ${prepared.proposalHash}`,
    { reviewedProposalHash: reviewed.proposalHash, currentProposalHash: prepared.proposalHash },
  );
  if (reviewed.currentCandidateHash !== prepared.currentCandidateHash) throw new CandidateChangeSetError(
    "candidate.review-base-mismatch",
    `Reviewed base hash ${reviewed.currentCandidateHash} does not match current candidate hash ${prepared.currentCandidateHash}`,
    { reviewedBaseHash: reviewed.currentCandidateHash, currentCandidateHash: prepared.currentCandidateHash },
  );
  if (reviewed.proposedCandidateHash !== prepared.proposedCandidateHash) throw new CandidateChangeSetError(
    "candidate.review-proposal-mismatch",
    `Reviewed proposed hash ${reviewed.proposedCandidateHash} does not match evaluated proposed hash ${prepared.proposedCandidateHash}`,
    { reviewedProposedHash: reviewed.proposedCandidateHash, evaluatedProposedHash: prepared.proposedCandidateHash },
  );
  if (prepared.result.verdict !== "KEEP") throw new CandidateChangeSetError(
    "candidate.not-accepted",
    `Candidate change set '${candidateId}' cannot be applied because its locked Benchmark verdict is ${prepared.result.verdict}`,
  );
  const latestBlueprintHash = hashValue(await readJson(prepared.blueprintPath));
  if (latestBlueprintHash !== prepared.currentCandidateHash) throw new CandidateChangeSetError(
    "candidate.write-conflict",
    `Candidate Blueprint changed after evaluation: expected ${prepared.currentCandidateHash}, found ${latestBlueprintHash}`,
    { expectedCandidateHash: prepared.currentCandidateHash, currentCandidateHash: latestBlueprintHash },
  );
  const latestProposal = await loadCandidateChangeSet(projectDir, candidateId);
  if (hashValue(latestProposal) !== hashValue(prepared.candidate)) throw new CandidateChangeSetError(
    "candidate.proposal-conflict",
    `Candidate change set '${candidateId}' changed after evaluation; review it again`,
  );
  await atomicWriteJson(prepared.blueprintPath, prepared.proposedBlueprint);
  const { proposedBlueprint: _, ...result } = prepared;
  return { ...result, applied: true };
}
