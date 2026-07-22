import { join, resolve } from "node:path";
import { z } from "zod";
import { loadBlueprintBenchmark } from "./benchmark";
import {
  CandidateChangeSetError,
  loadCandidateChangeSet,
  type CandidateChangeSetPreview,
} from "./candidate-change-set";
import { atomicWriteJson, hashValue, pathExists, readJson, stableStringify } from "./utils";

const id = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);

const candidateReviewReceiptSchema = z.object({
  version: z.literal(1),
  candidate: id,
  benchmark: id,
  proposalHash: hash,
  currentCandidateHash: hash,
  proposedCandidateHash: hash,
  verdict: z.enum(["KEEP", "DISCARD", "UNCHANGED"]),
  scoreDelta: z.number(),
  resultHash: hash,
  result: z.object({
    benchmark: id,
    verdict: z.enum(["KEEP", "DISCARD", "UNCHANGED"]),
    scoreDelta: z.number(),
  }).passthrough(),
}).strict();

export type CandidateReviewReceipt = z.infer<typeof candidateReviewReceiptSchema>;
export type CandidateDecisionState = "proposed" | "reviewed-keep" | "reviewed-discard" | "reviewed-unchanged" | "verified" | "stale";

export interface CandidateDecision {
  state: CandidateDecisionState;
  proposalHash: string;
  currentCandidateHash: string;
  proposedCandidateHash?: string;
  verdict?: "KEEP" | "DISCARD" | "UNCHANGED";
  resultHash?: string;
  preview?: CandidateChangeSetPreview;
}

function reviewPath(projectDir: string, candidateId: string, proposalHash: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(candidateId)) throw new CandidateChangeSetError("candidate.invalid-id", "Candidate id must use lowercase kebab-case");
  if (!/^[0-9a-f]{64}$/.test(proposalHash)) throw new CandidateChangeSetError("candidate.invalid-review", "Candidate proposal hash must be a SHA-256 value");
  return join(resolve(projectDir), "candidate-reviews", candidateId, `${proposalHash}.review.json`);
}

function parseReceipt(value: unknown, candidateId: string, proposalHash: string): CandidateReviewReceipt {
  const parsed = candidateReviewReceiptSchema.safeParse(value);
  if (!parsed.success) throw new CandidateChangeSetError(
    "candidate.invalid-review-receipt",
    `Invalid review receipt for Candidate '${candidateId}': ${parsed.error.issues.map((issue) => `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
  );
  const receipt = parsed.data;
  if (receipt.candidate !== candidateId || receipt.proposalHash !== proposalHash) throw new CandidateChangeSetError(
    "candidate.review-receipt-mismatch",
    `Review receipt identity does not match Candidate '${candidateId}' and proposal '${proposalHash}'`,
  );
  if (receipt.result.benchmark !== receipt.benchmark || receipt.result.verdict !== receipt.verdict
    || receipt.result.scoreDelta !== receipt.scoreDelta || hashValue(receipt.result) !== receipt.resultHash) throw new CandidateChangeSetError(
    "candidate.review-receipt-mismatch",
    `Review receipt evidence does not match its recorded Candidate decision`,
  );
  return receipt;
}

export async function loadCandidateReviewReceipt(projectDir: string, candidateId: string, proposalHash: string): Promise<CandidateReviewReceipt | null> {
  const path = reviewPath(projectDir, candidateId, proposalHash);
  if (!await pathExists(path)) return null;
  return parseReceipt(await readJson(path), candidateId, proposalHash);
}

export async function recordCandidateReview(
  projectDir: string,
  preview: CandidateChangeSetPreview,
): Promise<{ receipt: CandidateReviewReceipt; path: string; created: boolean }> {
  const receipt = candidateReviewReceiptSchema.parse({
    version: 1,
    candidate: preview.candidate.id,
    benchmark: preview.candidate.benchmark,
    proposalHash: preview.proposalHash,
    currentCandidateHash: preview.currentCandidateHash,
    proposedCandidateHash: preview.proposedCandidateHash,
    verdict: preview.result.verdict,
    scoreDelta: preview.result.scoreDelta,
    resultHash: hashValue(preview.result),
    result: preview.result,
  });
  const path = reviewPath(projectDir, preview.candidate.id, preview.proposalHash);
  const existing = await loadCandidateReviewReceipt(projectDir, preview.candidate.id, preview.proposalHash);
  if (existing) {
    if (stableStringify(existing) !== stableStringify(receipt)) throw new CandidateChangeSetError(
      "candidate.review-receipt-conflict",
      `Review receipt for Candidate '${preview.candidate.id}' conflicts with the deterministic evaluator result`,
    );
    return { receipt: existing, path, created: false };
  }
  await atomicWriteJson(path, receipt);
  return { receipt, path, created: true };
}

export async function inspectCandidateDecision(projectDir: string, candidateId: string): Promise<CandidateDecision> {
  const candidate = await loadCandidateChangeSet(projectDir, candidateId);
  const benchmark = await loadBlueprintBenchmark(projectDir, candidate.benchmark);
  const currentCandidateHash = hashValue(await readJson(join(resolve(projectDir), "blueprints", `${benchmark.candidateBlueprint}.blueprint.json`)));
  const proposalHash = hashValue(candidate);
  const receipt = await loadCandidateReviewReceipt(projectDir, candidateId, proposalHash);
  if (!receipt) return {
    state: currentCandidateHash === candidate.baseCandidateHash ? "proposed" : "stale",
    proposalHash,
    currentCandidateHash,
  };
  if (receipt.benchmark !== candidate.benchmark || receipt.currentCandidateHash !== candidate.baseCandidateHash) throw new CandidateChangeSetError(
    "candidate.review-receipt-mismatch",
    `Review receipt for Candidate '${candidateId}' does not match its Benchmark or pinned base hash`,
  );
  const preview: CandidateChangeSetPreview = {
    candidate,
    proposalHash: receipt.proposalHash,
    currentCandidateHash: receipt.currentCandidateHash,
    proposedCandidateHash: receipt.proposedCandidateHash,
    result: receipt.result as unknown as CandidateChangeSetPreview["result"],
  };
  if (currentCandidateHash === receipt.proposedCandidateHash && receipt.verdict === "KEEP") return {
    state: "verified",
    proposalHash,
    currentCandidateHash,
    proposedCandidateHash: receipt.proposedCandidateHash,
    verdict: receipt.verdict,
    resultHash: receipt.resultHash,
    preview,
  };
  if (currentCandidateHash !== candidate.baseCandidateHash) return {
    state: "stale",
    proposalHash,
    currentCandidateHash,
    proposedCandidateHash: receipt.proposedCandidateHash,
    verdict: receipt.verdict,
    resultHash: receipt.resultHash,
    preview,
  };
  return {
    state: `reviewed-${receipt.verdict.toLowerCase()}` as CandidateDecisionState,
    proposalHash,
    currentCandidateHash,
    proposedCandidateHash: receipt.proposedCandidateHash,
    verdict: receipt.verdict,
    resultHash: receipt.resultHash,
    preview,
  };
}
