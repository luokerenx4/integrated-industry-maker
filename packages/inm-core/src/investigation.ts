import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { listRuns } from "./artifacts";
import { loadBlueprintBenchmark } from "./benchmark";
import {
  listCandidateChangeSets,
  loadCandidateChangeSet,
  writeCandidateChangeSet,
  type CandidateChangeSet,
  type CandidateInvestigationSourceEvidence,
  type CandidatePatch,
  type CandidateSource,
} from "./candidate-change-set";
import {
  inspectCandidateDecision,
  loadCandidateReviewReceipt,
  type CandidateDecisionState,
} from "./candidate-review";
import { projectEvidenceHashes } from "./execution-identity";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import { createJsonPatch } from "./blueprint-comparison";
import { productionPlanSchema } from "./schema";
import type { JsonPatchOperation } from "./artifacts";
import type { ProductionPlan } from "./types";
import {
  openProjectWorkbenchSnapshot,
  openRunProjectWorkbenchSnapshot,
  type ProjectWorkbenchSnapshot,
  type WorkbenchInvestigationDiagnosticDisposition,
  type WorkbenchDiagnostic,
  type WorkbenchNextAction,
  type WorkbenchSubjectReference,
} from "./workbench";
import { compileFactoryProject } from "./compiler";
import { atomicWriteJson, hashValue, pathExists, readJson, stableStringify } from "./utils";
import {
  compareFactoryRuns,
  compareProductionPlanSemantics,
  factoryRunComparisonEvidenceHash,
  inspectFactoryRunComparison,
  RunComparisonError,
  type FactoryRunComparison,
  type ProductionPlanSemanticChange,
} from "./run-comparison";

const idSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "must use lowercase kebab-case");
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const subjectSchema = z.object({
  kind: z.enum(["project", "region", "resource", "process", "device", "connection", "network", "route", "capacity-gap"]),
  id: z.string().min(1),
}).strict();
const selectionSchema = z.object({
  world: idSchema,
  blueprint: idSchema,
  productionPlan: idSchema.optional(),
  scenario: idSchema,
  objective: idSchema,
}).strict();
const evidenceHashesSchema = z.object({
  engineVersion: z.string().min(1),
  executionHash: hashSchema,
  worldHash: hashSchema,
  blueprintHash: hashSchema,
  productionPlanHash: hashSchema.optional(),
  scenarioHash: hashSchema,
  objectiveHash: hashSchema,
}).strict();
const jsonPatchOperationSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  path: z.string(),
  value: z.unknown().optional(),
}).strict();
const productionPlanRevisionSourceSchema = z.object({
  kind: z.literal("investigation-hypothesis"),
  project: idSchema,
  investigation: idSchema,
  manifestHash: hashSchema,
  hypothesisEntry: idSchema,
  hypothesisEntryHash: hashSchema,
  statement: z.string().min(1),
  expectedEffect: z.string().min(1),
  evidence: z.array(idSchema),
  control: z.object({
    source: z.enum(["investigation-creation", "factory-observation", "run-comparison"]),
    anchorId: idSchema,
    runId: z.string().min(1),
    resultHash: hashSchema,
    seed: z.number().int(),
    selection: selectionSchema,
    hashes: evidenceHashesSchema,
  }).strict(),
}).strict();
export const productionPlanRevisionSchema = z.object({
  version: z.literal(1),
  id: idSchema,
  project: idSchema,
  source: productionPlanRevisionSourceSchema,
  base: z.object({
    id: idSchema,
    hash: hashSchema,
    productionPlan: productionPlanSchema,
  }).strict(),
  result: z.object({
    id: idSchema,
    hash: hashSchema,
    productionPlan: productionPlanSchema,
  }).strict(),
  patch: z.array(jsonPatchOperationSchema).min(1),
  revisionHash: hashSchema,
}).strict();
export type ProductionPlanRevision = z.infer<typeof productionPlanRevisionSchema>;

export interface InspectedProductionPlanRevision {
  revision: ProductionPlanRevision;
  path: string;
  sourceEvidence: CandidateInvestigationSourceEvidence;
  changes: ProductionPlanSemanticChange[];
}

export interface CreateInvestigationProductionPlanRevisionInput {
  investigation: string;
  hypothesisEntry: string;
  productionPlan: ProductionPlan;
}

const operatingRunAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("operating-run"),
  runId: z.string().min(1),
  resultHash: hashSchema,
}).strict();

const diagnosticAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("diagnostic"),
  diagnosticId: z.string().min(1),
  causalHash: hashSchema.optional(),
  code: z.string().min(1),
  severity: z.enum(["blocking", "warning", "info"]),
  priority: z.number().int(),
  message: z.string().min(1),
  summary: z.string().min(1),
  subjects: z.array(subjectSchema).min(1),
  runId: z.string().min(1),
  loss: z.object({
    bucket: idSchema,
    contributorId: z.string().min(1).nullable(),
  }).strict().nullable(),
}).strict();

const designLineageAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("design-lineage"),
  programId: idSchema,
  runId: hashSchema,
  candidateId: idSchema,
  benchmark: idSchema,
  sourceBlueprintHash: hashSchema,
  baseBlueprintHash: hashSchema,
  appliedBlueprintHash: hashSchema,
  proposalHash: hashSchema,
  reviewResultHash: hashSchema,
}).strict();

const candidateReviewAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("candidate-review"),
  candidateId: idSchema,
  benchmark: idSchema,
  proposalHash: hashSchema,
  reviewResultHash: hashSchema,
  verdict: z.enum(["KEEP", "DISCARD", "UNCHANGED"]),
  currentCandidateHash: hashSchema,
  proposedCandidateHash: hashSchema,
}).strict();

const factoryObservationAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("factory-observation"),
  selection: selectionSchema,
  hashes: evidenceHashesSchema,
  runId: z.string().min(1),
  resultHash: hashSchema,
  sourceLotServices: z.array(z.object({
    analysisHash: hashSchema,
    device: idSchema,
    inputBuffer: idSchema,
    inputResource: idSchema,
  }).strict()).optional(),
  diagnostic: diagnosticAnchorSchema.omit({
    id: true,
    kind: true,
    runId: true,
  }),
}).strict();

const runComparisonSideSchema = z.object({
  runId: z.string().min(1),
  resultHash: hashSchema,
  blueprintHash: hashSchema,
  productionPlanHash: hashSchema.optional(),
}).strict();

const runComparisonInterventionSchema = z.object({
  kind: z.enum(["blueprint", "production-plan"]),
  from: z.object({ id: idSchema, hash: hashSchema }).strict(),
  to: z.object({ id: idSchema, hash: hashSchema }).strict(),
}).strict();

const runComparisonAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("run-comparison"),
  from: runComparisonSideSchema,
  to: runComparisonSideSchema,
  comparisonHash: hashSchema,
  intervention: runComparisonInterventionSchema.optional(),
  selection: selectionSchema,
  hashes: evidenceHashesSchema,
  diagnostic: diagnosticAnchorSchema.omit({
    id: true,
    kind: true,
    runId: true,
  }),
}).strict();

export const investigationEvidenceAnchorSchema = z.discriminatedUnion("kind", [
  operatingRunAnchorSchema,
  diagnosticAnchorSchema,
  designLineageAnchorSchema,
  candidateReviewAnchorSchema,
  factoryObservationAnchorSchema,
  runComparisonAnchorSchema,
]);
export type InvestigationEvidenceAnchor = z.infer<typeof investigationEvidenceAnchorSchema>;

const recordedNextActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  actionLabel: z.string().min(1),
  effect: z.enum(["read-only", "creates-artifact", "mutates-project"]),
  studioRoute: z.string().min(1),
}).strict();

export const industrialInvestigationManifestSchema = z.object({
  version: z.literal(1),
  id: idSchema,
  name: z.string().min(1),
  question: z.string().min(1),
  authority: z.literal("human-or-agent"),
  project: idSchema,
  selection: selectionSchema,
  hashes: evidenceHashesSchema,
  anchors: z.array(investigationEvidenceAnchorSchema).min(2).max(3),
  initialNextAction: recordedNextActionSchema,
  manifestHash: hashSchema,
}).strict();
export type IndustrialInvestigationManifest = z.infer<typeof industrialInvestigationManifestSchema>;

const entryBaseSchema = z.object({
  version: z.literal(1),
  investigation: idSchema,
  id: idSchema,
  sequence: z.number().int().positive(),
  author: z.enum(["human", "agent"]),
  statement: z.string().min(1),
  evidence: z.array(idSchema),
  introducedAnchors: z.array(z.discriminatedUnion("kind", [
    candidateReviewAnchorSchema,
    factoryObservationAnchorSchema,
    runComparisonAnchorSchema,
  ])).max(1),
  previousEntryHash: hashSchema.nullable(),
});

const investigationDecisionTargetSchema = z.object({
  kind: z.literal("diagnostic"),
  anchorId: idSchema,
}).strict();

export const industrialInvestigationEntrySchema = z.discriminatedUnion("kind", [
  entryBaseSchema.extend({
    kind: z.literal("observation"),
    entryHash: hashSchema,
  }).strict(),
  entryBaseSchema.extend({
    kind: z.literal("hypothesis"),
    intervention: z.enum(["blueprint", "production-plan"]).optional(),
    expectedEffect: z.string().min(1),
    entryHash: hashSchema,
  }).strict(),
  entryBaseSchema.extend({
    kind: z.literal("decision"),
    disposition: z.enum(["keep", "revise", "defer", "discard"]),
    target: investigationDecisionTargetSchema.optional(),
    entryHash: hashSchema,
  }).strict(),
]);
export type IndustrialInvestigationEntry = z.infer<typeof industrialInvestigationEntrySchema>;
export type InvestigationIntroducedEvidenceInput =
  | {
    id: string;
    kind: "candidate-review";
    candidateId: string;
  }
  | {
    id: string;
    kind: "factory-observation";
  }
  | {
    id: string;
    kind: "run-comparison";
    fromRunId: string;
    toRunId: string;
  };
type EntryInputCommon = {
  id: string;
  author: "human" | "agent";
  statement: string;
  evidence?: string[];
  introduceEvidence?: InvestigationIntroducedEvidenceInput;
};
export type IndustrialInvestigationEntryInput =
  | EntryInputCommon & { kind: "observation" }
  | EntryInputCommon & {
      kind: "hypothesis";
      intervention: "blueprint" | "production-plan";
      expectedEffect: string;
    }
  | EntryInputCommon & {
      kind: "decision";
      disposition: "keep" | "revise" | "defer" | "discard";
      target?: z.infer<typeof investigationDecisionTargetSchema>;
    };

export type InvestigationAnchorState = "current" | "historical" | "missing" | "invalid";

export interface InspectedInvestigationAnchor {
  anchor: InvestigationEvidenceAnchor;
  state: InvestigationAnchorState;
  message: string;
  navigation: {
    argv: string[];
    studioRoute: string;
  };
}

export interface IndustrialInvestigationInspection {
  manifest: IndustrialInvestigationManifest;
  manifestHash: string;
  context: Pick<ProjectWorkbenchSnapshot, "project" | "selection" | "hashes">;
  entries: IndustrialInvestigationEntry[];
  state: InvestigationAnchorState;
  anchors: InspectedInvestigationAnchor[];
  handoff: IndustrialInvestigationHandoff;
  currentNextAction: WorkbenchNextAction;
}

export type IndustrialInvestigationPhase =
  | "repair-evidence"
  | "observe-current-factory"
  | "form-hypothesis"
  | "author-candidate"
  | "review-candidate"
  | "simulate-candidate"
  | "compare-candidate"
  | "decide-candidate"
  | "author-production-plan"
  | "simulate-production-plan"
  | "compare-production-plan"
  | "resume-project";

export interface InvestigationCandidateCycleCandidate {
  id: string;
  name: string;
  benchmark: string;
  proposalHash: string;
  decisionState: CandidateDecisionState;
  verdict: "KEEP" | "DISCARD" | "UNCHANGED" | null;
  reviewResultHash: string | null;
  trial: null | {
    runId: string;
    resultHash: string;
    parentRunId: string;
  };
  comparison: null | {
    anchorId: string;
    comparisonHash: string;
  };
  disposition: null | {
    entryId: string;
    entryHash: string;
    sequence: number;
    author: "human" | "agent";
    disposition: "keep" | "revise" | "defer" | "discard";
    reviewAnchorId: string;
  };
  error: null | { code: string; message: string };
}

export interface InvestigationCandidateCycle {
  hypothesisEntryId: string;
  hypothesisEntryHash: string;
  state:
    | "not-authored"
    | "review-required"
    | "trial-required"
    | "comparison-required"
    | "decision-required"
    | "completed"
    | "ambiguous"
    | "invalid";
  activeCandidateId: string | null;
  candidates: InvestigationCandidateCycleCandidate[];
}

export interface IndustrialInvestigationHandoff {
  phase: IndustrialInvestigationPhase;
  sourceEntry: null | Pick<
    IndustrialInvestigationEntry,
    "id" | "sequence" | "kind" | "entryHash"
  >;
  evidenceIds: string[];
  authorship: null | {
    kind: "investigation-entry";
    entryKind: "observation" | "hypothesis";
    requiredFields: Array<"entry-id" | "author" | "statement" | "intervention" | "expected-effect">;
  } | {
    kind: "candidate";
    hypothesisEntryId: string;
    hypothesisEntryHash: string;
    requiredFields: Array<"candidate-id" | "candidate-name" | "benchmark" | "patch-file">;
  } | {
    kind: "production-plan";
    hypothesisEntryId: string;
    hypothesisEntryHash: string;
    requiredFields: Array<"production-plan-id" | "production-plan-file">;
  };
  productionPlanRevision: null | {
    id: string;
    revisionHash: string;
    path: string;
    base: { id: string; hash: string };
    result: { id: string; hash: string };
    controlRunId: string;
    controlSeed: number;
    selection: {
      world: string;
      blueprint: string;
      productionPlan?: string;
      scenario: string;
      objective: string;
    };
    interventionRunId: string | null;
  };
  candidateCycle: InvestigationCandidateCycle | null;
  nextAction: WorkbenchNextAction;
}

export interface IndustrialInvestigationSummary {
  id: string;
  name: string;
  question: string;
  entryCount: number;
  lastEntry: null | Pick<IndustrialInvestigationEntry, "id" | "sequence" | "kind" | "author" | "statement">;
}

export type InvestigationHypothesisCandidateSource = Extract<
  CandidateSource,
  { kind: "investigation-hypothesis" }
>;

export interface CreateInvestigationCandidateInput {
  id: string;
  name: string;
  benchmark: string;
  investigation: string;
  hypothesisEntry: string;
  patch: CandidatePatch;
}

export class IndustrialInvestigationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "IndustrialInvestigationError";
  }
}

function investigationDir(projectDir: string, investigationId: string): string {
  if (!idSchema.safeParse(investigationId).success) {
    throw new IndustrialInvestigationError("investigation.invalid-id", "Investigation id must use lowercase kebab-case");
  }
  return join(resolve(projectDir), "investigations", investigationId);
}

function manifestPath(projectDir: string, investigationId: string): string {
  return join(investigationDir(projectDir, investigationId), "manifest.json");
}

function manifestHashInput(manifest: Omit<IndustrialInvestigationManifest, "manifestHash">): unknown {
  return manifest;
}

function entryHashInput(entry: Omit<IndustrialInvestigationEntry, "entryHash">): unknown {
  return entry;
}

function parseManifest(value: unknown, investigationId: string): IndustrialInvestigationManifest {
  const parsed = industrialInvestigationManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new IndustrialInvestigationError(
      "investigation.invalid",
      `Invalid Investigation '${investigationId}': ${parsed.error.issues.map((issue) =>
        `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
    );
  }
  const manifest = parsed.data;
  if (manifest.id !== investigationId) {
    throw new IndustrialInvestigationError(
      "investigation.id-mismatch",
      `Investigation id '${manifest.id}' must match directory '${investigationId}'`,
    );
  }
  const { manifestHash, ...withoutHash } = manifest;
  if (hashValue(manifestHashInput(withoutHash)) !== manifestHash) {
    throw new IndustrialInvestigationError(
      "investigation.hash-mismatch",
      `Investigation '${investigationId}' manifest hash does not match its content`,
    );
  }
  const anchorIds = manifest.anchors.map((anchor) => anchor.id);
  const anchorKinds = manifest.anchors.map((anchor) => anchor.kind);
  if (new Set(anchorIds).size !== anchorIds.length
    || !anchorKinds.includes("operating-run")
    || !anchorKinds.includes("diagnostic")) {
    throw new IndustrialInvestigationError(
      "investigation.invalid-anchors",
      `Investigation '${investigationId}' must contain unique operating-run and diagnostic anchors`,
    );
  }
  return manifest;
}

export async function loadIndustrialInvestigationManifest(
  projectDir: string,
  investigationId: string,
): Promise<IndustrialInvestigationManifest> {
  return parseManifest(await readJson(manifestPath(projectDir, investigationId)), investigationId);
}

async function listEntryFiles(projectDir: string, investigationId: string): Promise<string[]> {
  const directory = join(investigationDir(projectDir, investigationId), "entries");
  try {
    return (await readdir(directory))
      .filter((file) => /^\d{4}-[a-z0-9][a-z0-9-]*\.entry\.json$/.test(file))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function listIndustrialInvestigationEntries(
  projectDir: string,
  investigationId: string,
): Promise<IndustrialInvestigationEntry[]> {
  const manifest = await loadIndustrialInvestigationManifest(projectDir, investigationId);
  const files = await listEntryFiles(projectDir, investigationId);
  const entries: IndustrialInvestigationEntry[] = [];
  const anchorIds = new Set<string>(manifest.anchors.map((anchor) => anchor.id));
  const anchorsById = new Map<string, InvestigationEvidenceAnchor>(
    manifest.anchors.map((anchor) => [anchor.id, anchor]),
  );
  let previousEntryHash: string | null = null;
  for (const [index, file] of files.entries()) {
    const parsed = industrialInvestigationEntrySchema.safeParse(
      await readJson(join(investigationDir(projectDir, investigationId), "entries", file)),
    );
    if (!parsed.success) {
      throw new IndustrialInvestigationError(
        "investigation.invalid-entry",
        `Invalid Investigation entry '${file}': ${parsed.error.issues.map((issue) =>
          `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
      );
    }
    const entry = parsed.data;
    const expectedSequence = index + 1;
    const expectedFile = `${String(expectedSequence).padStart(4, "0")}-${entry.id}.entry.json`;
    const { entryHash, ...withoutHash } = entry;
    const introducedIds = entry.introducedAnchors.map((anchor) => anchor.id);
    const availableAnchorIds = new Set([...anchorIds, ...introducedIds]);
    const targetedAnchor = entry.kind === "decision" && entry.target
      ? entry.introducedAnchors.find((anchor) => anchor.id === entry.target!.anchorId)
        ?? anchorsById.get(entry.target.anchorId)
      : null;
    const invalidDecisionTarget = entry.kind === "decision" && entry.target
      ? !entry.evidence.includes(entry.target.anchorId)
        || !targetedAnchor
        || (targetedAnchor.kind !== "diagnostic"
          && targetedAnchor.kind !== "factory-observation"
          && targetedAnchor.kind !== "run-comparison")
      : false;
    if (entry.investigation !== investigationId
      || entry.sequence !== expectedSequence
      || file !== expectedFile
      || entry.previousEntryHash !== previousEntryHash
      || hashValue(entryHashInput(withoutHash)) !== entryHash
      || new Set(introducedIds).size !== introducedIds.length
      || introducedIds.some((anchorId) => anchorIds.has(anchorId))
      || entry.evidence.some((anchorId) => !availableAnchorIds.has(anchorId))
      || new Set(entry.evidence).size !== entry.evidence.length
      || invalidDecisionTarget) {
      throw new IndustrialInvestigationError(
        "investigation.invalid-entry-chain",
        `Investigation entry '${file}' does not match its identity, evidence anchors, or append-only chain`,
      );
    }
    entries.push(entry);
    for (const anchor of entry.introducedAnchors) {
      anchorIds.add(anchor.id);
      anchorsById.set(anchor.id, anchor);
    }
    previousEntryHash = entry.entryHash;
  }
  return entries;
}

function hypothesisOperatingContext(
  manifest: IndustrialInvestigationManifest,
  entries: IndustrialInvestigationEntry[],
  hypothesis: Extract<IndustrialInvestigationEntry, { kind: "hypothesis" }>,
): CandidateInvestigationSourceEvidence["operatingContext"] {
  const checkpoint = entries
    .filter((entry) => entry.sequence <= hypothesis.sequence)
    .flatMap((entry) => entry.introducedAnchors)
    .reverse()
    .find((anchor) =>
      (anchor.kind === "factory-observation" || anchor.kind === "run-comparison")
      && hypothesis.evidence.includes(anchor.id));
  if (checkpoint?.kind === "factory-observation") {
    return {
      source: "factory-observation",
      anchorId: checkpoint.id,
      selection: { ...checkpoint.selection },
      hashes: { ...checkpoint.hashes },
      run: { id: checkpoint.runId, resultHash: checkpoint.resultHash },
      diagnostic: {
        id: checkpoint.diagnostic.diagnosticId,
        code: checkpoint.diagnostic.code,
      },
    };
  }
  if (checkpoint?.kind === "run-comparison") {
    return {
      source: "run-comparison",
      anchorId: checkpoint.id,
      selection: { ...checkpoint.selection },
      hashes: { ...checkpoint.hashes },
      run: { id: checkpoint.to.runId, resultHash: checkpoint.to.resultHash },
      diagnostic: {
        id: checkpoint.diagnostic.diagnosticId,
        code: checkpoint.diagnostic.code,
      },
    };
  }
  const operating = manifest.anchors.find((anchor) => anchor.kind === "operating-run")!;
  const diagnostic = manifest.anchors.find((anchor) => anchor.kind === "diagnostic")!;
  return {
    source: "investigation-creation",
    anchorId: operating.id,
    selection: { ...manifest.selection },
    hashes: { ...manifest.hashes },
    run: { id: operating.runId, resultHash: operating.resultHash },
    diagnostic: { id: diagnostic.diagnosticId, code: diagnostic.code },
  };
}

function sameRunComparisonEvidence(
  anchor: z.infer<typeof runComparisonAnchorSchema>,
  comparison: FactoryRunComparison,
): boolean {
  return comparison.from.run.id === anchor.from.runId
    && comparison.from.run.resultHash === anchor.from.resultHash
    && comparison.from.hashes.blueprintHash === anchor.from.blueprintHash
    && (anchor.from.productionPlanHash === undefined
      || comparison.from.hashes.productionPlanHash === anchor.from.productionPlanHash)
    && comparison.to.run.id === anchor.to.runId
    && comparison.to.run.resultHash === anchor.to.resultHash
    && comparison.to.hashes.blueprintHash === anchor.to.blueprintHash
    && (anchor.to.productionPlanHash === undefined
      || comparison.to.hashes.productionPlanHash === anchor.to.productionPlanHash)
    && (anchor.intervention === undefined
      || stableStringify(comparison.intervention) === stableStringify(anchor.intervention))
    && stableStringify(comparison.to.selection) === stableStringify(anchor.selection)
    && stableStringify(comparison.to.hashes) === stableStringify(anchor.hashes);
}

function sameRunComparisonDiagnostic(
  anchor: z.infer<typeof runComparisonAnchorSchema>,
  diagnostics: readonly WorkbenchDiagnostic[],
): boolean {
  const diagnostic = diagnostics.find((item) =>
    item.id === anchor.diagnostic.diagnosticId);
  return diagnostic?.evidence.runId === anchor.to.runId
    && diagnostic.code === anchor.diagnostic.code
    && diagnostic.message === anchor.diagnostic.message
    && diagnostic.evidence.summary === anchor.diagnostic.summary
    && stableStringify(diagnostic.subjects) === stableStringify(anchor.diagnostic.subjects);
}

export async function resolveIndustrialInvestigationHypothesisSource(
  projectDir: string,
  source: InvestigationHypothesisCandidateSource,
  expected?: {
    hypothesis?: string;
    expectedEffect?: string;
    intervention?: "blueprint" | "production-plan";
  },
): Promise<CandidateInvestigationSourceEvidence> {
  const manifest = await loadIndustrialInvestigationManifest(projectDir, source.investigation);
  if (manifest.project !== source.project) {
    throw new IndustrialInvestigationError(
      "investigation.project-mismatch",
      `Investigation '${source.investigation}' belongs to project '${manifest.project}', not '${source.project}'`,
    );
  }
  if (manifest.manifestHash !== source.manifestHash) {
    throw new IndustrialInvestigationError(
      "investigation.source-manifest-mismatch",
      `Investigation '${source.investigation}' no longer matches Candidate manifest hash '${source.manifestHash}'`,
    );
  }
  const entries = await listIndustrialInvestigationEntries(projectDir, source.investigation);
  const entry = entries.find((item) => item.id === source.entry);
  if (!entry) {
    throw new IndustrialInvestigationError(
      "investigation.source-entry-missing",
      `Investigation '${source.investigation}' has no entry '${source.entry}'`,
    );
  }
  if (entry.entryHash !== source.entryHash) {
    throw new IndustrialInvestigationError(
      "investigation.source-entry-mismatch",
      `Investigation entry '${source.entry}' no longer matches Candidate entry hash '${source.entryHash}'`,
    );
  }
  if (entry.kind !== "hypothesis") {
    throw new IndustrialInvestigationError(
      "investigation.source-not-hypothesis",
      `Investigation entry '${source.entry}' is '${entry.kind}', not a hypothesis`,
    );
  }
  const expectedIntervention = expected?.intervention ?? "blueprint";
  if ((entry.intervention ?? "blueprint") !== expectedIntervention) {
    throw new IndustrialInvestigationError(
      expectedIntervention === "blueprint"
        ? "investigation.source-not-blueprint-hypothesis"
        : "investigation.source-not-production-plan-hypothesis",
      `Investigation hypothesis '${source.entry}' controls a ${(entry.intervention ?? "blueprint") === "blueprint" ? "Blueprint" : "Production Plan"}, not a ${expectedIntervention === "blueprint" ? "Blueprint" : "Production Plan"} intervention`,
    );
  }
  if (expected && (
    (expected.hypothesis !== undefined && expected.hypothesis.trim() !== entry.statement)
    || (expected.expectedEffect !== undefined && expected.expectedEffect.trim() !== entry.expectedEffect)
  )) {
    throw new IndustrialInvestigationError(
      "investigation.source-text-mismatch",
      `Candidate hypothesis text must exactly match Investigation entry '${source.entry}'`,
    );
  }
  const operatingContext = hypothesisOperatingContext(manifest, entries, entry);
  const project = compileFactoryProject(await loadFactoryProject(projectDir, operatingContext.selection));
  if (project.manifest.id !== manifest.project) {
    throw new IndustrialInvestigationError(
      "investigation.project-mismatch",
      `Investigation '${source.investigation}' belongs to project '${manifest.project}', not '${project.manifest.id}'`,
    );
  }
  const currentHashes = projectEvidenceHashes(project.hashes);
  let state: CandidateInvestigationSourceEvidence["state"] =
    stableStringify(currentHashes) === stableStringify(operatingContext.hashes)
      ? "current"
      : "historical";
  if (operatingContext.source === "factory-observation") {
    const checkpoint = entries
      .flatMap((item) => item.introducedAnchors)
      .find((anchor) => anchor.id === operatingContext.anchorId);
    if (!checkpoint || checkpoint.kind !== "factory-observation") {
      throw new IndustrialInvestigationError(
        "investigation.source-context-missing",
        `Investigation hypothesis '${entry.id}' references unavailable factory observation '${operatingContext.anchorId}'`,
      );
    }
    const runPath = join(resolve(projectDir), "runs", checkpoint.runId);
    const run = (await listRuns(projectDir)).find((item) => item.name === checkpoint.runId);
    if (!run || run.manifest.resultHash !== checkpoint.resultHash) {
      const unavailable = await pathExists(runPath) ? "invalid" : "missing";
      throw new IndustrialInvestigationError(
        "investigation.source-context-unavailable",
        `Investigation hypothesis '${entry.id}' factory observation '${checkpoint.id}' is ${unavailable}`,
      );
    }
  }
  if (operatingContext.source === "run-comparison") {
    const checkpoint = entries
      .flatMap((item) => item.introducedAnchors)
      .find((anchor) => anchor.id === operatingContext.anchorId);
    if (!checkpoint || checkpoint.kind !== "run-comparison") {
      throw new IndustrialInvestigationError(
        "investigation.source-context-missing",
        `Investigation hypothesis '${entry.id}' references unavailable Run comparison '${operatingContext.anchorId}'`,
      );
    }
    try {
      const comparison = await compareFactoryRuns(
        projectDir,
        checkpoint.from.runId,
        checkpoint.to.runId,
      );
      if (!sameRunComparisonEvidence(checkpoint, comparison)) {
        throw new IndustrialInvestigationError(
          "investigation.source-context-unavailable",
          `Investigation hypothesis '${entry.id}' Run comparison '${checkpoint.id}' is invalid`,
        );
      }
    } catch (error) {
      if (error instanceof IndustrialInvestigationError) throw error;
      throw new IndustrialInvestigationError(
        "investigation.source-context-unavailable",
        `Investigation hypothesis '${entry.id}' Run comparison '${checkpoint.id}' cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    kind: "investigation-hypothesis",
    state,
    project: manifest.project,
    investigation: manifest.id,
    investigationName: manifest.name,
    question: manifest.question,
    manifestHash: manifest.manifestHash,
    entry: entry.id,
    entryHash: entry.entryHash,
    sequence: entry.sequence,
    author: entry.author,
    statement: entry.statement,
    expectedEffect: entry.expectedEffect,
    evidence: [...entry.evidence],
    operatingContext,
    navigation: {
      argv: ["inm", "investigate", projectDir, "--investigation", manifest.id, "--json"],
      studioRoute: `/${encodeURIComponent(manifest.project)}/investigations/${encodeURIComponent(manifest.id)}`,
    },
  };
}

export async function createInvestigationCandidate(
  projectDir: string,
  input: CreateInvestigationCandidateInput,
): Promise<{
  candidate: CandidateChangeSet;
  sourceEvidence: CandidateInvestigationSourceEvidence;
  path: string;
}> {
  const manifest = await loadIndustrialInvestigationManifest(projectDir, input.investigation);
  const entries = await listIndustrialInvestigationEntries(projectDir, input.investigation);
  const hypothesis = entries.find((entry) => entry.id === input.hypothesisEntry);
  if (!hypothesis) {
    throw new IndustrialInvestigationError(
      "investigation.source-entry-missing",
      `Investigation '${input.investigation}' has no entry '${input.hypothesisEntry}'`,
    );
  }
  if (hypothesis.kind !== "hypothesis") {
    throw new IndustrialInvestigationError(
      "investigation.source-not-hypothesis",
      `Investigation entry '${input.hypothesisEntry}' is '${hypothesis.kind}', not a hypothesis`,
    );
  }
  if (hypothesis.intervention === "production-plan") {
    throw new IndustrialInvestigationError(
      "investigation.source-not-blueprint-hypothesis",
      `Investigation entry '${input.hypothesisEntry}' controls a Production Plan and cannot source a Blueprint Candidate`,
    );
  }
  const source: InvestigationHypothesisCandidateSource = {
    kind: "investigation-hypothesis",
    project: manifest.project,
    investigation: manifest.id,
    manifestHash: manifest.manifestHash,
    entry: hypothesis.id,
    entryHash: hypothesis.entryHash,
  };
  const sourceEvidence = await resolveIndustrialInvestigationHypothesisSource(projectDir, source, {
    hypothesis: hypothesis.statement,
    expectedEffect: hypothesis.expectedEffect,
    intervention: "blueprint",
  });
  const benchmark = await loadBlueprintBenchmark(projectDir, input.benchmark);
  const firstCase = benchmark.cases[0];
  if (!firstCase) {
    throw new IndustrialInvestigationError(
      "investigation.candidate-benchmark-empty",
      `Benchmark '${input.benchmark}' has no cases`,
    );
  }
  const loaded = await loadFactoryProject(projectDir, {
    world: firstCase.world,
    blueprint: benchmark.candidateBlueprint,
    scenario: firstCase.scenario,
    objective: firstCase.objective,
  });
  if (loaded.manifest.id !== manifest.project) {
    throw new IndustrialInvestigationError(
      "investigation.project-mismatch",
      `Benchmark '${benchmark.id}' belongs to project '${loaded.manifest.id}', not Investigation project '${manifest.project}'`,
    );
  }
  const candidate: CandidateChangeSet = {
    version: 1,
    id: input.id,
    name: input.name.trim(),
    benchmark: benchmark.id,
    hypothesis: hypothesis.statement,
    expectedEffect: hypothesis.expectedEffect,
    source,
    baseCandidateHash: hashValue(loaded.blueprint),
    patch: input.patch,
  };
  const path = await writeCandidateChangeSet(projectDir, candidate);
  return { candidate, sourceEvidence, path };
}

function productionPlanRevisionDirectory(projectDir: string): string {
  return join(resolve(projectDir), "production-plan-revisions");
}

function productionPlanRevisionPath(projectDir: string, revisionId: string): string {
  if (!idSchema.safeParse(revisionId).success) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.invalid-id",
      "Production Plan revision id must use lowercase kebab-case",
    );
  }
  return join(productionPlanRevisionDirectory(projectDir), `${revisionId}.revision.json`);
}

function productionPlanPath(projectDir: string, productionPlanId: string): string {
  if (!idSchema.safeParse(productionPlanId).success) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.invalid-plan-id",
      "Production Plan id must use lowercase kebab-case",
    );
  }
  return join(resolve(projectDir), "production-plans", `${productionPlanId}.production-plan.json`);
}

function productionPlanRevisionHashInput(
  revision: Omit<ProductionPlanRevision, "revisionHash">,
): unknown {
  return revision;
}

async function loadProductionPlanRevision(
  projectDir: string,
  revisionId: string,
): Promise<{ revision: ProductionPlanRevision; path: string }> {
  const path = productionPlanRevisionPath(projectDir, revisionId);
  const parsed = productionPlanRevisionSchema.safeParse(await readJson(path));
  if (!parsed.success) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.invalid",
      `Invalid Production Plan revision '${revisionId}': ${parsed.error.issues.map((issue) =>
        `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
    );
  }
  const revision = parsed.data;
  const { revisionHash, ...withoutHash } = revision;
  if (revision.id !== revisionId
    || revision.result.id !== revisionId
    || revision.result.productionPlan.id !== revisionId
    || hashValue(productionPlanRevisionHashInput(withoutHash)) !== revisionHash) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.identity-mismatch",
      `Production Plan revision '${revisionId}' does not match its filename, plan id, or revision hash`,
    );
  }
  return { revision, path };
}

function revisionSourceReference(revision: ProductionPlanRevision): InvestigationHypothesisCandidateSource {
  return {
    kind: "investigation-hypothesis",
    project: revision.source.project,
    investigation: revision.source.investigation,
    manifestHash: revision.source.manifestHash,
    entry: revision.source.hypothesisEntry,
    entryHash: revision.source.hypothesisEntryHash,
  };
}

export async function inspectProductionPlanRevision(
  projectDir: string,
  revisionId: string,
): Promise<InspectedProductionPlanRevision> {
  const { revision, path } = await loadProductionPlanRevision(projectDir, revisionId);
  const sourceEvidence = await resolveIndustrialInvestigationHypothesisSource(
    projectDir,
    revisionSourceReference(revision),
    {
      hypothesis: revision.source.statement,
      expectedEffect: revision.source.expectedEffect,
      intervention: "production-plan",
    },
  );
  const expectedSource = {
    kind: "investigation-hypothesis" as const,
    project: sourceEvidence.project,
    investigation: sourceEvidence.investigation,
    manifestHash: sourceEvidence.manifestHash,
    hypothesisEntry: sourceEvidence.entry,
    hypothesisEntryHash: sourceEvidence.entryHash,
    statement: sourceEvidence.statement,
    expectedEffect: sourceEvidence.expectedEffect,
    evidence: sourceEvidence.evidence,
    control: {
      source: sourceEvidence.operatingContext.source,
      anchorId: sourceEvidence.operatingContext.anchorId,
      runId: sourceEvidence.operatingContext.run.id,
      resultHash: sourceEvidence.operatingContext.run.resultHash,
      seed: revision.source.control.seed,
      selection: sourceEvidence.operatingContext.selection,
      hashes: sourceEvidence.operatingContext.hashes,
    },
  };
  if (stableStringify(revision.source) !== stableStringify(expectedSource)) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.source-mismatch",
      `Production Plan revision '${revisionId}' no longer matches its exact Investigation hypothesis and control context`,
    );
  }
  const controlRun = (await listRuns(projectDir)).find((run) =>
    run.name === revision.source.control.runId);
  if (!controlRun
    || controlRun.manifest.resultHash !== revision.source.control.resultHash
    || controlRun.manifest.seed !== revision.source.control.seed
    || stableStringify(controlRun.manifest.selection) !== stableStringify(revision.source.control.selection)
    || stableStringify(controlRun.manifest.hashes) !== stableStringify(revision.source.control.hashes)) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.control-run-invalid",
      `Production Plan revision '${revisionId}' cannot re-verify control Run '${revision.source.control.runId}'`,
    );
  }
  if (hashValue(revision.base.productionPlan) !== revision.base.hash
    || revision.base.id !== revision.base.productionPlan.id
    || hashValue(revision.result.productionPlan) !== revision.result.hash) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.plan-hash-mismatch",
      `Production Plan revision '${revisionId}' does not reproduce its retained base/result plan hashes`,
    );
  }
  const expectedPatch = createJsonPatch(
    revision.base.productionPlan,
    revision.result.productionPlan,
  );
  if (stableStringify(expectedPatch) !== stableStringify(revision.patch)) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.patch-mismatch",
      `Production Plan revision '${revisionId}' patch does not reproduce its retained plan change`,
    );
  }
  let currentPlan: ProductionPlan;
  try {
    currentPlan = productionPlanSchema.parse(
      await readJson(productionPlanPath(projectDir, revision.result.id)),
    ) as ProductionPlan;
  } catch (error) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.result-unavailable",
      `Production Plan revision '${revisionId}' result file is unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (hashValue(currentPlan) !== revision.result.hash) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.result-modified",
      `Production Plan '${revision.result.id}' no longer matches revision '${revisionId}'`,
    );
  }
  const loaded = await loadFactoryProject(projectDir, {
    ...revision.source.control.selection,
    productionPlan: revision.base.id,
  });
  compileFactoryProject({ ...loaded, productionPlan: revision.result.productionPlan });
  return {
    revision,
    path,
    sourceEvidence,
    changes: compareProductionPlanSemantics(
      revision.base.productionPlan,
      revision.result.productionPlan,
    ),
  };
}

async function matchingProductionPlanRevision(
  projectDir: string,
  investigationId: string,
  hypothesisEntryId: string,
  hypothesisEntryHash: string,
): Promise<InspectedProductionPlanRevision | null> {
  let files: string[];
  try {
    files = (await readdir(productionPlanRevisionDirectory(projectDir)))
      .filter((file) => /^[a-z0-9][a-z0-9-]*\.revision\.json$/.test(file))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let matched: string | null = null;
  for (const file of files) {
    const id = file.slice(0, -".revision.json".length);
    const value = await readJson(productionPlanRevisionPath(projectDir, id));
    const source = value && typeof value === "object"
      ? (value as { source?: Partial<ProductionPlanRevision["source"]> }).source
      : undefined;
    if (source?.investigation !== investigationId
      || source.hypothesisEntry !== hypothesisEntryId
      || source.hypothesisEntryHash !== hypothesisEntryHash) continue;
    if (matched) {
      throw new IndustrialInvestigationError(
        "production-plan-revision.multiple-results",
        `Investigation hypothesis '${hypothesisEntryId}' has multiple Production Plan revisions '${matched}' and '${id}'`,
      );
    }
    matched = id;
  }
  return matched ? inspectProductionPlanRevision(projectDir, matched) : null;
}

export async function productionPlanRevisionDraft(
  projectDir: string,
  investigationId: string,
): Promise<{
  investigation: string;
  hypothesisEntry: string;
  hypothesisEntryHash: string;
  statement: string;
  expectedEffect: string;
  controlRunId: string;
  controlSeed: number;
  baseProductionPlanHash: string;
  productionPlan: ProductionPlan;
}> {
  const manifest = await loadIndustrialInvestigationManifest(projectDir, investigationId);
  const entries = await listIndustrialInvestigationEntries(projectDir, investigationId);
  const hypothesis = entries.at(-1);
  if (!hypothesis || hypothesis.kind !== "hypothesis" || hypothesis.intervention !== "production-plan") {
    throw new IndustrialInvestigationError(
      "production-plan-revision.no-current-hypothesis",
      `Investigation '${investigationId}' does not end at a Production Plan hypothesis`,
    );
  }
  const sourceEvidence = await resolveIndustrialInvestigationHypothesisSource(projectDir, {
    kind: "investigation-hypothesis",
    project: manifest.project,
    investigation: manifest.id,
    manifestHash: manifest.manifestHash,
    entry: hypothesis.id,
    entryHash: hypothesis.entryHash,
  }, {
    hypothesis: hypothesis.statement,
    expectedEffect: hypothesis.expectedEffect,
    intervention: "production-plan",
  });
  if (sourceEvidence.state !== "current") {
    throw new IndustrialInvestigationError(
      "production-plan-revision.historical-source",
      `Investigation hypothesis '${hypothesis.id}' is historical; capture the current factory before authoring a plan`,
    );
  }
  const controlRun = (await listRuns(projectDir)).find((run) =>
    run.name === sourceEvidence.operatingContext.run.id);
  if (!controlRun || controlRun.manifest.resultHash !== sourceEvidence.operatingContext.run.resultHash) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.control-run-invalid",
      `Investigation hypothesis '${hypothesis.id}' cannot re-verify its control Run`,
    );
  }
  const loaded = await loadFactoryProject(projectDir, sourceEvidence.operatingContext.selection);
  return {
    investigation: manifest.id,
    hypothesisEntry: hypothesis.id,
    hypothesisEntryHash: hypothesis.entryHash,
    statement: hypothesis.statement,
    expectedEffect: hypothesis.expectedEffect,
    controlRunId: controlRun.name,
    controlSeed: controlRun.manifest.seed,
    baseProductionPlanHash: hashValue(loaded.productionPlan),
    productionPlan: structuredClone(loaded.productionPlan),
  };
}

export async function createInvestigationProductionPlanRevision(
  projectDir: string,
  input: CreateInvestigationProductionPlanRevisionInput,
): Promise<InspectedProductionPlanRevision> {
  const draft = await productionPlanRevisionDraft(projectDir, input.investigation);
  if (input.hypothesisEntry !== draft.hypothesisEntry) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.hypothesis-mismatch",
      `Production Plan revision must answer current hypothesis '${draft.hypothesisEntry}', not '${input.hypothesisEntry}'`,
    );
  }
  const proposed = productionPlanSchema.parse(input.productionPlan) as ProductionPlan;
  if (proposed.id === draft.productionPlan.id) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.base-id-reused",
      `Production Plan revision must use a new id instead of replacing control plan '${draft.productionPlan.id}'`,
    );
  }
  const planPath = productionPlanPath(projectDir, proposed.id);
  const revisionPath = productionPlanRevisionPath(projectDir, proposed.id);
  if (await pathExists(planPath) || await pathExists(revisionPath)) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.already-exists",
      `Production Plan or revision '${proposed.id}' already exists`,
    );
  }
  const semanticChanges = compareProductionPlanSemantics(draft.productionPlan, proposed);
  if (!semanticChanges.some((change) => change.kind !== "production-plan")) {
    throw new IndustrialInvestigationError(
      "production-plan-revision.no-schedule-change",
      "A Production Plan revision must change at least one lot release or material delivery, not only id/name metadata",
    );
  }
  const manifest = await loadIndustrialInvestigationManifest(projectDir, input.investigation);
  const entries = await listIndustrialInvestigationEntries(projectDir, input.investigation);
  const hypothesis = entries.at(-1)! as Extract<IndustrialInvestigationEntry, { kind: "hypothesis" }>;
  const sourceEvidence = await resolveIndustrialInvestigationHypothesisSource(projectDir, {
    kind: "investigation-hypothesis",
    project: manifest.project,
    investigation: manifest.id,
    manifestHash: manifest.manifestHash,
    entry: hypothesis.id,
    entryHash: hypothesis.entryHash,
  }, {
    hypothesis: hypothesis.statement,
    expectedEffect: hypothesis.expectedEffect,
    intervention: "production-plan",
  });
  const controlRun = (await listRuns(projectDir)).find((run) => run.name === draft.controlRunId)!;
  const loaded = await loadFactoryProject(projectDir, sourceEvidence.operatingContext.selection);
  compileFactoryProject({ ...loaded, productionPlan: proposed });
  const withoutHash: Omit<ProductionPlanRevision, "revisionHash"> = {
    version: 1,
    id: proposed.id,
    project: manifest.project,
    source: {
      kind: "investigation-hypothesis",
      project: manifest.project,
      investigation: manifest.id,
      manifestHash: manifest.manifestHash,
      hypothesisEntry: hypothesis.id,
      hypothesisEntryHash: hypothesis.entryHash,
      statement: hypothesis.statement,
      expectedEffect: hypothesis.expectedEffect,
      evidence: [...hypothesis.evidence],
      control: {
        source: sourceEvidence.operatingContext.source,
        anchorId: sourceEvidence.operatingContext.anchorId,
        runId: controlRun.name,
        resultHash: controlRun.manifest.resultHash,
        seed: controlRun.manifest.seed,
        selection: { ...controlRun.manifest.selection },
        hashes: { ...controlRun.manifest.hashes },
      },
    },
    base: {
      id: loaded.productionPlan.id,
      hash: hashValue(loaded.productionPlan),
      productionPlan: structuredClone(loaded.productionPlan),
    },
    result: {
      id: proposed.id,
      hash: hashValue(proposed),
      productionPlan: structuredClone(proposed),
    },
    patch: createJsonPatch(loaded.productionPlan, proposed) as JsonPatchOperation[],
  };
  const revision: ProductionPlanRevision = {
    ...withoutHash,
    revisionHash: hashValue(productionPlanRevisionHashInput(withoutHash)),
  };
  try {
    await atomicWriteJson(planPath, proposed);
    await atomicWriteJson(revisionPath, revision);
  } catch (error) {
    await Promise.all([
      rm(planPath, { force: true }),
      rm(revisionPath, { force: true }),
    ]);
    throw error;
  }
  return inspectProductionPlanRevision(projectDir, revision.id);
}

function recordedNextAction(action: WorkbenchNextAction): z.infer<typeof recordedNextActionSchema> {
  return {
    id: action.id,
    title: action.title,
    reason: action.reason,
    actionLabel: action.actionLabel,
    effect: action.effect,
    studioRoute: action.studioRoute,
  };
}

function selectedDiagnostic(snapshot: ProjectWorkbenchSnapshot): WorkbenchDiagnostic | null {
  const diagnosticId = "diagnosticId" in snapshot.nextAction.target
    ? snapshot.nextAction.target.diagnosticId
    : null;
  return (diagnosticId
    ? snapshot.diagnostics.find((diagnostic) => diagnostic.id === diagnosticId)
    : null)
    ?? snapshot.diagnostics.find((diagnostic) => diagnostic.evidence.source === "compatible-run")
    ?? null;
}

function designLineageAnchor(snapshot: ProjectWorkbenchSnapshot): z.infer<typeof designLineageAnchorSchema> | null {
  if (snapshot.nextAction.target.kind !== "design-run"
    || snapshot.nextAction.target.phase !== "commissioned") return null;
  const target = snapshot.nextAction.target;
  const program = snapshot.designPrograms.find((item) => item.id === target.programId);
  const run = program?.evidence.runs.find((item) => item.id === target.runId);
  const commissioning = run?.currentness.commissioning;
  if (!commissioning) return null;
  return {
    id: "design-lineage",
    kind: "design-lineage",
    programId: commissioning.program,
    runId: commissioning.runId,
    candidateId: commissioning.candidateId,
    benchmark: commissioning.benchmark,
    sourceBlueprintHash: commissioning.sourceBlueprintHash,
    baseBlueprintHash: commissioning.baseBlueprintHash,
    appliedBlueprintHash: commissioning.appliedBlueprintHash,
    proposalHash: commissioning.proposalHash,
    reviewResultHash: commissioning.reviewResultHash,
  };
}

export async function createIndustrialInvestigation(
  projectDir: string,
  investigationId: string,
  input: { name: string; question: string; selection?: ProjectSelection },
): Promise<{ manifest: IndustrialInvestigationManifest; path: string }> {
  if (!idSchema.safeParse(investigationId).success) {
    throw new IndustrialInvestigationError("investigation.invalid-id", "Investigation id must use lowercase kebab-case");
  }
  const path = manifestPath(projectDir, investigationId);
  if (await pathExists(path)) {
    throw new IndustrialInvestigationError(
      "investigation.exists",
      `Investigation '${investigationId}' already exists`,
    );
  }
  const snapshot = await openProjectWorkbenchSnapshot(projectDir, input.selection);
  const diagnostic = selectedDiagnostic(snapshot);
  const runId = snapshot.status.evidence.state === "current"
    ? snapshot.status.evidence.runId
    : null;
  const run = runId ? snapshot.runs.find((item) => item.id === runId) ?? null : null;
  if (!run || !diagnostic || diagnostic.evidence.source !== "compatible-run"
    || diagnostic.evidence.runId !== run.id) {
    throw new IndustrialInvestigationError(
      "investigation.no-current-diagnostic",
      `Creating an Investigation requires one current compatible operating Run and Run-backed diagnostic`,
    );
  }
  const bucketId = diagnostic.code.startsWith("fab-loss.")
    ? diagnostic.code.slice("fab-loss.".length)
    : null;
  const bucket = bucketId
    ? snapshot.lossAttribution?.buckets.find((item) => item.id === bucketId) ?? null
    : null;
  const anchors: InvestigationEvidenceAnchor[] = [
    {
      id: "operating-run",
      kind: "operating-run",
      runId: run.id,
      resultHash: run.resultHash,
    },
    {
      id: "diagnostic",
      kind: "diagnostic",
      diagnosticId: diagnostic.id,
      ...(diagnostic.evidence.causalHash ? { causalHash: diagnostic.evidence.causalHash } : {}),
      code: diagnostic.code,
      severity: diagnostic.severity,
      priority: diagnostic.priority,
      message: diagnostic.message,
      summary: diagnostic.evidence.summary,
      subjects: diagnostic.subjects.map((subject) => ({ ...subject })),
      runId: run.id,
      loss: bucket ? {
        bucket: bucket.id,
        contributorId: bucket.contributors[0]?.id ?? null,
      } : null,
    },
  ];
  const lineage = designLineageAnchor(snapshot);
  if (lineage) anchors.push(lineage);
  const withoutHash = {
    version: 1 as const,
    id: investigationId,
    name: input.name.trim(),
    question: input.question.trim(),
    authority: "human-or-agent" as const,
    project: snapshot.project.id,
    selection: {
      world: snapshot.selection.world.id,
      blueprint: snapshot.selection.blueprint.id,
      productionPlan: snapshot.selection.productionPlan.id,
      scenario: snapshot.selection.scenario.id,
      objective: snapshot.selection.objective.id,
    },
    hashes: projectEvidenceHashes(snapshot.hashes),
    anchors,
    initialNextAction: recordedNextAction(snapshot.nextAction),
  };
  const manifest = parseManifest({
    ...withoutHash,
    manifestHash: hashValue(manifestHashInput(withoutHash)),
  }, investigationId);
  await atomicWriteJson(path, manifest);
  return { manifest, path };
}

export async function appendIndustrialInvestigationEntry(
  projectDir: string,
  investigationId: string,
  input: IndustrialInvestigationEntryInput,
): Promise<{ entry: IndustrialInvestigationEntry; path: string }> {
  if (!idSchema.safeParse(input.id).success) {
    throw new IndustrialInvestigationError("investigation.invalid-entry-id", "Investigation entry id must use lowercase kebab-case");
  }
  const manifest = await loadIndustrialInvestigationManifest(projectDir, investigationId);
  const entries = await listIndustrialInvestigationEntries(projectDir, investigationId);
  if (entries.some((entry) => entry.id === input.id)) {
    throw new IndustrialInvestigationError(
      "investigation.entry-exists",
      `Investigation entry '${input.id}' already exists`,
    );
  }
  if ((input.introduceEvidence?.kind === "factory-observation"
    || input.introduceEvidence?.kind === "run-comparison")
    && input.kind !== "observation") {
    throw new IndustrialInvestigationError(
      "investigation.observation-entry-required",
      "Factory-observation and Run-comparison evidence can only be introduced by an observation entry",
    );
  }
  const introducedAnchors = input.introduceEvidence
    ? [await resolveIntroducedEvidenceAnchor(projectDir, manifest, input.introduceEvidence)]
    : [];
  const evidence = input.evidence ?? [];
  const anchorIds = new Set<string>([
    ...manifest.anchors.map((anchor) => anchor.id),
    ...entries.flatMap((entry) => entry.introducedAnchors.map((anchor) => anchor.id)),
  ]);
  if (introducedAnchors.some((anchor) => anchorIds.has(anchor.id))) {
    throw new IndustrialInvestigationError(
      "investigation.anchor-exists",
      `Investigation evidence anchor '${introducedAnchors[0]!.id}' already exists`,
    );
  }
  const availableAnchorIds = new Set([...anchorIds, ...introducedAnchors.map((anchor) => anchor.id)]);
  if (evidence.some((anchorId) => !availableAnchorIds.has(anchorId)) || new Set(evidence).size !== evidence.length) {
    throw new IndustrialInvestigationError(
      "investigation.unknown-evidence",
      `Investigation entry references an unknown or duplicate evidence anchor`,
    );
  }
  if (input.kind === "decision" && input.target) {
    const availableAnchors = [
      ...manifest.anchors,
      ...entries.flatMap((entry) => entry.introducedAnchors),
      ...introducedAnchors,
    ];
    const targetAnchor = availableAnchors.find((anchor) => anchor.id === input.target!.anchorId);
    if (!evidence.includes(input.target.anchorId)
      || !targetAnchor
      || (targetAnchor.kind !== "diagnostic"
        && targetAnchor.kind !== "factory-observation"
        && targetAnchor.kind !== "run-comparison")) {
      throw new IndustrialInvestigationError(
        "investigation.invalid-decision-target",
        `Diagnostic decision target '${input.target.anchorId}' must be one cited diagnostic, factory-observation, or Run-comparison evidence anchor available at this sequence`,
      );
    }
  }
  const sequence = entries.length + 1;
  const common = {
    version: 1 as const,
    investigation: investigationId,
    id: input.id,
    sequence,
    author: input.author,
    statement: input.statement.trim(),
    evidence,
    introducedAnchors,
    previousEntryHash: entries.at(-1)?.entryHash ?? null,
  };
  const withoutHash = input.kind === "hypothesis"
    ? {
        ...common,
        kind: input.kind,
        intervention: input.intervention,
        expectedEffect: input.expectedEffect.trim(),
      }
    : input.kind === "decision"
      ? {
          ...common,
          kind: input.kind,
          disposition: input.disposition,
          ...(input.target ? { target: { ...input.target } } : {}),
        }
      : { ...common, kind: input.kind };
  const parsed = industrialInvestigationEntrySchema.safeParse({
    ...withoutHash,
    entryHash: hashValue(entryHashInput(withoutHash)),
  });
  if (!parsed.success) {
    throw new IndustrialInvestigationError(
      "investigation.invalid-entry",
      `Invalid Investigation entry: ${parsed.error.issues.map((issue) =>
        `${issue.path.join("/") || "root"} ${issue.message}`).join("; ")}`,
    );
  }
  const entry = parsed.data;
  const path = join(
    investigationDir(projectDir, investigationId),
    "entries",
    `${String(sequence).padStart(4, "0")}-${entry.id}.entry.json`,
  );
  if (await pathExists(path)) {
    throw new IndustrialInvestigationError(
      "investigation.entry-exists",
      `Investigation entry path '${path}' already exists`,
    );
  }
  await atomicWriteJson(path, entry);
  return { entry, path };
}

async function resolveIntroducedEvidenceAnchor(
  projectDir: string,
  manifest: IndustrialInvestigationManifest,
  input: InvestigationIntroducedEvidenceInput,
): Promise<
  z.infer<typeof candidateReviewAnchorSchema>
  | z.infer<typeof factoryObservationAnchorSchema>
  | z.infer<typeof runComparisonAnchorSchema>
> {
  if (!idSchema.safeParse(input.id).success
    || (input.kind === "candidate-review" && !idSchema.safeParse(input.candidateId).success)) {
    throw new IndustrialInvestigationError(
      "investigation.invalid-anchor",
      "Introduced evidence and Candidate ids must use lowercase kebab-case",
    );
  }
  if (input.kind === "factory-observation") {
    const snapshot = await openProjectWorkbenchSnapshot(projectDir, manifest.selection);
    const diagnostic = selectedDiagnostic(snapshot);
    const runId = snapshot.status.evidence.state === "current"
      ? snapshot.status.evidence.runId
      : null;
    const run = runId ? snapshot.runs.find((item) => item.id === runId) ?? null : null;
    if (!run || !diagnostic || diagnostic.evidence.source !== "compatible-run"
      || diagnostic.evidence.runId !== run.id) {
      throw new IndustrialInvestigationError(
        "investigation.no-current-observation",
        "Capturing factory evidence requires one current compatible operating Run and Run-backed diagnostic",
      );
    }
    const bucketId = diagnostic.code.startsWith("fab-loss.")
      ? diagnostic.code.slice("fab-loss.".length)
      : null;
    const bucket = bucketId
      ? snapshot.lossAttribution?.buckets.find((item) => item.id === bucketId) ?? null
      : null;
    return {
      id: input.id,
      kind: "factory-observation",
      selection: {
        world: snapshot.selection.world.id,
        blueprint: snapshot.selection.blueprint.id,
        productionPlan: snapshot.selection.productionPlan.id,
        scenario: snapshot.selection.scenario.id,
        objective: snapshot.selection.objective.id,
      },
      hashes: projectEvidenceHashes(snapshot.hashes),
      runId: run.id,
      resultHash: run.resultHash,
      ...(snapshot.sourceLotServices.length ? {
        sourceLotServices: snapshot.sourceLotServices.map((analysis) => ({
          analysisHash: analysis.analysisHash,
          device: analysis.query.device,
          inputBuffer: analysis.query.inputBuffer,
          inputResource: analysis.query.inputResource,
        })),
      } : {}),
      diagnostic: {
        diagnosticId: diagnostic.id,
        ...(diagnostic.evidence.causalHash ? { causalHash: diagnostic.evidence.causalHash } : {}),
        code: diagnostic.code,
        severity: diagnostic.severity,
        priority: diagnostic.priority,
        message: diagnostic.message,
        summary: diagnostic.evidence.summary,
        subjects: diagnostic.subjects.map((subject) => ({ ...subject })),
        loss: bucket ? {
          bucket: bucket.id,
          contributorId: bucket.contributors[0]?.id ?? null,
        } : null,
      },
    };
  }
  if (input.kind === "run-comparison") {
    const comparison = await compareFactoryRuns(projectDir, input.fromRunId, input.toRunId);
    const snapshot = await openRunProjectWorkbenchSnapshot(projectDir, input.toRunId);
    const diagnostic = selectedDiagnostic(snapshot);
    if (!diagnostic || diagnostic.evidence.source !== "compatible-run"
      || diagnostic.evidence.runId !== input.toRunId) {
      throw new IndustrialInvestigationError(
        "investigation.no-comparison-diagnostic",
        `Capturing Run comparison evidence requires TO Run '${input.toRunId}' to reproduce one Run-backed diagnostic`,
      );
    }
    const bucketId = diagnostic.code.startsWith("fab-loss.")
      ? diagnostic.code.slice("fab-loss.".length)
      : null;
    const bucket = bucketId
      ? snapshot.lossAttribution?.buckets.find((item) => item.id === bucketId) ?? null
      : null;
    return {
      id: input.id,
      kind: "run-comparison",
      from: {
        runId: comparison.from.run.id,
        resultHash: comparison.from.run.resultHash,
        blueprintHash: comparison.from.hashes.blueprintHash,
        productionPlanHash: comparison.from.hashes.productionPlanHash,
      },
      to: {
        runId: comparison.to.run.id,
        resultHash: comparison.to.run.resultHash,
        blueprintHash: comparison.to.hashes.blueprintHash,
        productionPlanHash: comparison.to.hashes.productionPlanHash,
      },
      comparisonHash: factoryRunComparisonEvidenceHash(comparison),
      intervention: structuredClone(comparison.intervention),
      selection: { ...comparison.to.selection },
      hashes: { ...comparison.to.hashes },
      diagnostic: {
        diagnosticId: diagnostic.id,
        ...(diagnostic.evidence.causalHash ? { causalHash: diagnostic.evidence.causalHash } : {}),
        code: diagnostic.code,
        severity: diagnostic.severity,
        priority: diagnostic.priority,
        message: diagnostic.message,
        summary: diagnostic.evidence.summary,
        subjects: diagnostic.subjects.map((subject) => ({ ...subject })),
        loss: bucket ? {
          bucket: bucket.id,
          contributorId: bucket.contributors[0]?.id ?? null,
        } : null,
      },
    };
  }
  try {
    const candidate = await loadCandidateChangeSet(projectDir, input.candidateId);
    const proposalHash = hashValue(candidate);
    const receipt = await loadCandidateReviewReceipt(projectDir, input.candidateId, proposalHash);
    if (!receipt) {
      throw new IndustrialInvestigationError(
        "investigation.unreviewed-candidate",
        `Candidate '${input.candidateId}' has no exact immutable review receipt`,
      );
    }
    return {
      id: input.id,
      kind: "candidate-review",
      candidateId: receipt.candidate,
      benchmark: receipt.benchmark,
      proposalHash: receipt.proposalHash,
      reviewResultHash: receipt.resultHash,
      verdict: receipt.verdict,
      currentCandidateHash: receipt.currentCandidateHash,
      proposedCandidateHash: receipt.proposedCandidateHash,
    };
  } catch (error) {
    if (error instanceof IndustrialInvestigationError) throw error;
    throw new IndustrialInvestigationError(
      "investigation.candidate-evidence-unavailable",
      `Candidate '${input.candidateId}' cannot supply exact review evidence: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sameSelection(
  manifest: IndustrialInvestigationManifest,
  snapshot: ProjectWorkbenchSnapshot,
): boolean {
  return sameRecordedSelection(manifest.selection, snapshot);
}

function sameHashes(
  manifest: IndustrialInvestigationManifest,
  snapshot: ProjectWorkbenchSnapshot,
): boolean {
  return sameRecordedHashes(manifest.hashes, snapshot);
}

function sameRecordedSelection(
  selection: IndustrialInvestigationManifest["selection"],
  snapshot: Pick<ProjectWorkbenchSnapshot, "selection">,
): boolean {
  return selection.world === snapshot.selection.world.id
    && selection.blueprint === snapshot.selection.blueprint.id
    && selection.productionPlan === snapshot.selection.productionPlan.id
    && selection.scenario === snapshot.selection.scenario.id
    && selection.objective === snapshot.selection.objective.id;
}

function sameRecordedHashes(
  hashes: IndustrialInvestigationManifest["hashes"],
  snapshot: Pick<ProjectWorkbenchSnapshot, "hashes">,
): boolean {
  return stableStringify(hashes) === stableStringify(projectEvidenceHashes(snapshot.hashes));
}

function sameSelectedSourceHashes(
  hashes: IndustrialInvestigationManifest["hashes"],
  snapshot: Pick<ProjectWorkbenchSnapshot, "hashes">,
): boolean {
  const current = projectEvidenceHashes(snapshot.hashes);
  return hashes.worldHash === current.worldHash
    && hashes.blueprintHash === current.blueprintHash
    && hashes.productionPlanHash === current.productionPlanHash
    && hashes.scenarioHash === current.scenarioHash
    && hashes.objectiveHash === current.objectiveHash;
}

type DiagnosticDecisionSnapshot = Pick<
  ProjectWorkbenchSnapshot,
  "project" | "selection" | "hashes" | "status" | "runs" | "diagnostics" | "lossAttribution"
>;

type DiagnosticDecisionCheckpoint = {
  anchorId: string;
  anchorKind: "diagnostic" | "factory-observation" | "run-comparison";
  selection: IndustrialInvestigationManifest["selection"];
  hashes: IndustrialInvestigationManifest["hashes"];
  runId: string;
  resultHash: string;
  diagnostic: Omit<z.infer<typeof diagnosticAnchorSchema>, "id" | "kind" | "runId">;
  comparison?: z.infer<typeof runComparisonAnchorSchema>;
};

function diagnosticDecisionCheckpoint(
  manifest: IndustrialInvestigationManifest,
  anchor: InvestigationEvidenceAnchor,
): DiagnosticDecisionCheckpoint | null {
  if (anchor.kind === "diagnostic") {
    const operatingRun = manifest.anchors.find((item) => item.kind === "operating-run");
    if (!operatingRun || operatingRun.runId !== anchor.runId) return null;
    const { id: _id, kind: _kind, runId: _runId, ...diagnostic } = anchor;
    return {
      anchorId: anchor.id,
      anchorKind: anchor.kind,
      selection: { ...manifest.selection },
      hashes: { ...manifest.hashes },
      runId: operatingRun.runId,
      resultHash: operatingRun.resultHash,
      diagnostic,
    };
  }
  if (anchor.kind === "factory-observation") return {
    anchorId: anchor.id,
    anchorKind: anchor.kind,
    selection: { ...anchor.selection },
    hashes: { ...anchor.hashes },
    runId: anchor.runId,
    resultHash: anchor.resultHash,
    diagnostic: structuredClone(anchor.diagnostic),
  };
  if (anchor.kind === "run-comparison") return {
    anchorId: anchor.id,
    anchorKind: anchor.kind,
    selection: { ...anchor.selection },
    hashes: { ...anchor.hashes },
    runId: anchor.to.runId,
    resultHash: anchor.to.resultHash,
    diagnostic: structuredClone(anchor.diagnostic),
    comparison: anchor,
  };
  return null;
}

function currentDiagnosticLoss(
  checkpoint: DiagnosticDecisionCheckpoint,
  snapshot: DiagnosticDecisionSnapshot,
): { bucket: string; contributorId: string | null } | null {
  const bucketId = checkpoint.diagnostic.code.startsWith("fab-loss.")
    ? checkpoint.diagnostic.code.slice("fab-loss.".length)
    : null;
  if (!bucketId) return null;
  const bucket = snapshot.lossAttribution?.buckets.find((item) => item.id === bucketId);
  return bucket ? {
    bucket: bucket.id,
    contributorId: bucket.contributors[0]?.id ?? null,
  } : null;
}

type DiagnosticDecisionAuthority = {
  state: "current" | "requalified";
  diagnostic: WorkbenchDiagnostic;
  currentRun: {
    id: string;
    resultHash: string;
  };
};

async function resolveDiagnosticDecisionAuthority(
  projectDir: string,
  manifest: IndustrialInvestigationManifest,
  checkpoint: DiagnosticDecisionCheckpoint,
  snapshot: DiagnosticDecisionSnapshot,
): Promise<DiagnosticDecisionAuthority | null> {
  const observedRun = snapshot.runs.find((item) =>
    item.id === checkpoint.runId
    && item.resultHash === checkpoint.resultHash);
  const currentRunId = snapshot.status.evidence.state === "current"
    ? snapshot.status.evidence.runId
    : null;
  const currentRun = currentRunId
    ? snapshot.runs.find((item) => item.id === currentRunId && item.compatible) ?? null
    : null;
  const exactDiagnostic = snapshot.diagnostics.find((item) =>
    item.id === checkpoint.diagnostic.diagnosticId);
  const exact = manifest.project === snapshot.project.id
    && sameRecordedSelection(checkpoint.selection, snapshot)
    && sameRecordedHashes(checkpoint.hashes, snapshot)
    && snapshot.status.evidence.runId === checkpoint.runId
    && Boolean(observedRun?.compatible)
    && exactDiagnostic?.evidence.source === "compatible-run"
    && exactDiagnostic.evidence.runId === checkpoint.runId
    && exactDiagnostic.code === checkpoint.diagnostic.code
    && exactDiagnostic.severity === checkpoint.diagnostic.severity
    && exactDiagnostic.priority === checkpoint.diagnostic.priority
    && exactDiagnostic.message === checkpoint.diagnostic.message
    && exactDiagnostic.evidence.summary === checkpoint.diagnostic.summary
    && exactDiagnostic.evidence.causalHash === checkpoint.diagnostic.causalHash
    && stableStringify(exactDiagnostic.subjects) === stableStringify(checkpoint.diagnostic.subjects)
    && stableStringify(currentDiagnosticLoss(checkpoint, snapshot))
      === stableStringify(checkpoint.diagnostic.loss);
  if (exact && exactDiagnostic && currentRun) {
    if (checkpoint.comparison) {
      try {
        const inspected = await inspectFactoryRunComparison(
          projectDir,
          checkpoint.comparison.from.runId,
          checkpoint.comparison.to.runId,
        );
        if (!sameRunComparisonEvidence(checkpoint.comparison, inspected.comparison)
          || !sameRunComparisonDiagnostic(checkpoint.comparison, inspected.toDiagnostics)) return null;
      } catch {
        return null;
      }
    }
    return {
      state: "current",
      diagnostic: exactDiagnostic,
      currentRun: { id: currentRun.id, resultHash: currentRun.resultHash },
    };
  }
  if (checkpoint.comparison
    || !observedRun
    || !currentRun
    || !checkpoint.diagnostic.causalHash
    || manifest.project !== snapshot.project.id
    || !sameRecordedSelection(checkpoint.selection, snapshot)
    || !sameSelectedSourceHashes(checkpoint.hashes, snapshot)) return null;
  const requalifiedDiagnostic = snapshot.diagnostics.find((item) =>
    item.evidence.source === "compatible-run"
    && item.evidence.runId === currentRun.id
    && item.evidence.causalHash === checkpoint.diagnostic.causalHash
    && item.code === checkpoint.diagnostic.code
    && item.severity === checkpoint.diagnostic.severity
    && stableStringify(item.subjects) === stableStringify(checkpoint.diagnostic.subjects));
  if (!requalifiedDiagnostic
    || stableStringify(currentDiagnosticLoss(checkpoint, snapshot))
      !== stableStringify(checkpoint.diagnostic.loss)) return null;
  return {
    state: "requalified",
    diagnostic: requalifiedDiagnostic,
    currentRun: { id: currentRun.id, resultHash: currentRun.resultHash },
  };
}

async function listInvestigationIds(projectDir: string): Promise<string[]> {
  const directory = join(resolve(projectDir), "investigations");
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && idSchema.safeParse(entry.name).success)
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function resolveCurrentInvestigationDiagnosticDispositions(
  projectDir: string,
  snapshot: DiagnosticDecisionSnapshot,
): Promise<WorkbenchInvestigationDiagnosticDisposition[]> {
  const byInvestigationAndDiagnostic = new Map<
    string,
    Omit<WorkbenchInvestigationDiagnosticDisposition, "queueEffect" | "reason">
  >();
  for (const investigationId of await listInvestigationIds(projectDir)) {
    try {
      const manifest = await loadIndustrialInvestigationManifest(projectDir, investigationId);
      if (manifest.project !== snapshot.project.id) continue;
      const entries = await listIndustrialInvestigationEntries(projectDir, investigationId);
      const anchors = new Map<string, InvestigationEvidenceAnchor>(
        manifest.anchors.map((anchor) => [anchor.id, anchor]),
      );
      for (const entry of entries) {
        for (const anchor of entry.introducedAnchors) anchors.set(anchor.id, anchor);
        if (entry.kind !== "decision" || !entry.target) continue;
        const anchor = anchors.get(entry.target.anchorId);
        if (!anchor || !entry.evidence.includes(anchor.id)) continue;
        const checkpoint = diagnosticDecisionCheckpoint(manifest, anchor);
        if (!checkpoint) continue;
        const decisionKey = `${manifest.id}:${checkpoint.diagnostic.code}`;
        // A later explicit target supersedes the earlier judgment even when
        // its own evidence is no longer current. Historical reasoning must not
        // accidentally revive an older queue decision.
        byInvestigationAndDiagnostic.delete(decisionKey);
        const authority = await resolveDiagnosticDecisionAuthority(
            projectDir,
            manifest,
            checkpoint,
            snapshot,
          );
        if (!authority) continue;
        byInvestigationAndDiagnostic.set(
          decisionKey,
          {
            id: `investigation-diagnostic:${manifest.id}:${entry.id}:${anchor.id}`,
            state: authority.state,
            disposition: entry.disposition,
            target: {
              diagnosticId: authority.diagnostic.id,
              code: checkpoint.diagnostic.code,
              anchorId: checkpoint.anchorId,
              anchorKind: checkpoint.anchorKind,
            },
            source: {
              investigationId: manifest.id,
              investigationName: manifest.name,
              entryId: entry.id,
              entryHash: entry.entryHash,
              sequence: entry.sequence,
              author: entry.author,
              statement: entry.statement,
            },
            observed: {
              runId: checkpoint.runId,
              resultHash: checkpoint.resultHash,
            },
            currentEvidence: {
              runId: authority.currentRun.id,
              resultHash: authority.currentRun.resultHash,
              diagnosticId: authority.diagnostic.id,
              causalHash: authority.diagnostic.evidence.causalHash!,
            },
            invalidation: {
              summary: authority.state === "requalified"
                ? "This historical decision is requalified only while the current compatible Run reproduces the same canonical causal diagnostic facts under the same selected factory sources."
                : "This decision expires when its exact current Run, selected factory sources, canonical causal diagnostic facts, or leading loss contributor changes.",
              bindings: [
                "project",
                "selection",
                "selected-source-hashes",
                "compatible-run",
                "diagnostic",
                "causal-diagnostic-evidence",
                "loss-contributor",
              ],
            },
          },
        );
      }
    } catch {
      // A broken Investigation chain is repair evidence, never authority for
      // changing the current project queue.
    }
  }
  const dispositions = [...byInvestigationAndDiagnostic.values()];
  const dispositionsByDiagnostic = new Map<string, typeof dispositions>();
  for (const item of dispositions) {
    const group = dispositionsByDiagnostic.get(item.target.diagnosticId) ?? [];
    group.push(item);
    dispositionsByDiagnostic.set(item.target.diagnosticId, group);
  }
  return dispositions
    .map((item): WorkbenchInvestigationDiagnosticDisposition => {
      const group = dispositionsByDiagnostic.get(item.target.diagnosticId) ?? [item];
      const queueEffect = group.some((candidate) => candidate.disposition === "revise")
        ? "revisit"
        : group.every((candidate) =>
          candidate.disposition === "defer" || candidate.disposition === "discard")
          ? "suppressed"
          : "none";
      const reason = queueEffect === "suppressed"
        ? `Exact current human/Agent ${item.disposition} decision removes this still-measured diagnostic from the active queue without rewriting its physical evidence.`
        : queueEffect === "revisit"
          ? item.disposition === "revise"
            ? "This exact current human/Agent revise decision keeps the diagnostic active and returns the next action to its Investigation."
            : "A concurrent exact current revise decision keeps this diagnostic active; this decision remains visible but cannot suppress it."
          : "This exact current decision remains visible context but does not remove the diagnostic from the active queue.";
      return { ...item, queueEffect, reason };
    })
    .sort((left, right) =>
      left.target.diagnosticId.localeCompare(right.target.diagnosticId)
      || left.source.investigationId.localeCompare(right.source.investigationId)
      || left.source.sequence - right.source.sequence);
}

function anchorNavigation(
  projectDir: string,
  projectId: string,
  anchor: InvestigationEvidenceAnchor,
): InspectedInvestigationAnchor["navigation"] {
  if (anchor.kind === "operating-run") return {
    argv: ["inm", "observe", projectDir, "--run", anchor.runId, "--json"],
    studioRoute: `/${encodeURIComponent(projectId)}/factory?run=${encodeURIComponent(anchor.runId)}`,
  };
  if (anchor.kind === "diagnostic") return {
    argv: ["inm", "inspect", projectDir, "--section", "diagnostics", "--json"],
    studioRoute: `/${encodeURIComponent(projectId)}/analysis/diagnostics/${encodeURIComponent(anchor.diagnosticId)}`,
  };
  if (anchor.kind === "candidate-review") return {
    argv: ["inm", "candidate", projectDir, "--candidate", anchor.candidateId, "--json"],
      studioRoute: `/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(anchor.benchmark)}/candidates/${encodeURIComponent(anchor.candidateId)}`,
  };
  if (anchor.kind === "factory-observation") return {
    argv: ["inm", "observe", projectDir, "--run", anchor.runId, "--json"],
    studioRoute: `/${encodeURIComponent(projectId)}/factory?run=${encodeURIComponent(anchor.runId)}`,
  };
  if (anchor.kind === "run-comparison") return {
    argv: [
      "inm",
      "compare",
      projectDir,
      "--from-run",
      anchor.from.runId,
      "--to-run",
      anchor.to.runId,
      "--json",
    ],
    studioRoute: `/${encodeURIComponent(projectId)}/runs?from=${encodeURIComponent(anchor.from.runId)}&to=${encodeURIComponent(anchor.to.runId)}`,
  };
  return {
    argv: ["inm", "design", projectDir, "--program", anchor.programId, "--run-id", anchor.runId, "--json"],
    studioRoute: `/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(anchor.programId)}/runs/${encodeURIComponent(anchor.runId)}`,
  };
}

async function inspectRunComparisonAnchor(
  projectDir: string,
  projectId: string,
  anchor: z.infer<typeof runComparisonAnchorSchema>,
  currentSnapshot: ProjectWorkbenchSnapshot,
): Promise<InspectedInvestigationAnchor> {
  const navigation = anchorNavigation(projectDir, projectId, anchor);
  let comparison: FactoryRunComparison;
  let toDiagnostics: WorkbenchDiagnostic[];
  try {
    ({ comparison, toDiagnostics } = await inspectFactoryRunComparison(
      projectDir,
      anchor.from.runId,
      anchor.to.runId,
    ));
  } catch (error) {
    if (error instanceof RunComparisonError && error.code === "run-comparison.unknown-run") {
      const absentRunId = error.details.runId
        ?? [anchor.from.runId, anchor.to.runId].find((runId) =>
          !currentSnapshot.runs.some((run) => run.id === runId))
        ?? anchor.to.runId;
      const runPath = join(resolve(projectDir), "runs", absentRunId);
      const exists = await pathExists(runPath);
      return {
        anchor,
        state: exists ? "invalid" : "missing",
        message: exists
          ? `Run comparison '${anchor.id}' references Run '${absentRunId}', which exists but is not valid completed evidence.`
          : `Run comparison '${anchor.id}' references absent Run '${absentRunId}'.`,
        navigation,
      };
    }
    return {
      anchor,
      state: "invalid",
      message: `Run comparison '${anchor.id}' cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
      navigation,
    };
  }
  if (!sameRunComparisonEvidence(anchor, comparison)) return {
    anchor,
    state: "invalid",
    message: `Run comparison '${anchor.id}' no longer matches its exact FROM, TO, or comparison identity.`,
    navigation,
  };
  if (!sameRunComparisonDiagnostic(anchor, toDiagnostics)) return {
    anchor,
    state: "invalid",
    message: `Run comparison '${anchor.id}' TO diagnostic no longer reproduces its exact evidence identity.`,
    navigation,
  };
  const current = sameRecordedSelection(anchor.selection, currentSnapshot)
    && sameRecordedHashes(anchor.hashes, currentSnapshot)
    && currentSnapshot.status.evidence.state === "current"
    && currentSnapshot.status.evidence.runId === anchor.to.runId;
  return {
    anchor,
    state: current ? "current" : "historical",
    message: current
      ? `Run comparison '${anchor.from.runId} → ${anchor.to.runId}' is exact and its TO Run is the current selected factory (${comparison.verdict}, score ${comparison.delta.score >= 0 ? "+" : ""}${comparison.delta.score.toFixed(3)}).`
      : `Run comparison '${anchor.from.runId} → ${anchor.to.runId}' remains exact history; its TO Run is no longer the current selected factory.`,
    navigation,
  };
}

async function inspectFactoryObservationAnchor(
  projectDir: string,
  projectId: string,
  anchor: z.infer<typeof factoryObservationAnchorSchema>,
  knownSnapshot?: ProjectWorkbenchSnapshot,
): Promise<InspectedInvestigationAnchor> {
  const navigation = anchorNavigation(projectDir, projectId, anchor);
  const runPath = join(resolve(projectDir), "runs", anchor.runId);
  const run = (await listRuns(projectDir)).find((item) => item.name === anchor.runId);
  if (!run) return {
    anchor,
    state: await pathExists(runPath) ? "invalid" : "missing",
    message: await pathExists(runPath)
      ? `Factory observation Run '${anchor.runId}' exists but cannot be loaded as completed evidence.`
      : `Factory observation Run '${anchor.runId}' is absent.`,
    navigation,
  };
  if (run.manifest.resultHash !== anchor.resultHash) return {
    anchor,
    state: "invalid",
    message: `Factory observation Run '${anchor.runId}' result hash no longer matches the Investigation.`,
    navigation,
  };
  const snapshot = knownSnapshot
    && sameRecordedSelection(anchor.selection, knownSnapshot)
    ? knownSnapshot
    : await openProjectWorkbenchSnapshot(projectDir, anchor.selection);
  const diagnostic = snapshot.diagnostics.find((item) =>
    item.id === anchor.diagnostic.diagnosticId);
  const current = sameRecordedSelection(anchor.selection, snapshot)
    && sameRecordedHashes(anchor.hashes, snapshot)
    && snapshot.status.evidence.state === "current"
    && snapshot.status.evidence.runId === anchor.runId
    && diagnostic?.evidence.runId === anchor.runId
    && diagnostic.code === anchor.diagnostic.code
    && diagnostic.message === anchor.diagnostic.message
    && diagnostic.evidence.summary === anchor.diagnostic.summary
    && stableStringify(diagnostic.subjects) === stableStringify(anchor.diagnostic.subjects);
  return {
    anchor,
    state: current ? "current" : "historical",
    message: current
      ? `Factory observation '${anchor.id}' is current at Run '${anchor.runId}' with diagnostic '${anchor.diagnostic.code}'.`
      : `Factory observation '${anchor.id}' remains exact history but is no longer the current selected Run and diagnostic.`,
    navigation,
  };
}

async function inspectAnchor(
  projectDir: string,
  manifest: IndustrialInvestigationManifest,
  snapshot: ProjectWorkbenchSnapshot,
  anchor: InvestigationEvidenceAnchor,
): Promise<InspectedInvestigationAnchor> {
  const navigation = anchorNavigation(projectDir, manifest.project, anchor);
  const selectedIdentityCurrent = sameSelection(manifest, snapshot) && sameHashes(manifest, snapshot);
  if (anchor.kind === "factory-observation") {
    return inspectFactoryObservationAnchor(projectDir, manifest.project, anchor, snapshot);
  }
  if (anchor.kind === "run-comparison") {
    return inspectRunComparisonAnchor(projectDir, manifest.project, anchor, snapshot);
  }
  if (anchor.kind === "operating-run") {
    const runPath = join(resolve(projectDir), "runs", anchor.runId);
    const run = (await listRuns(projectDir)).find((item) => item.name === anchor.runId);
    if (!run) return {
      anchor,
      state: await pathExists(runPath) ? "invalid" : "missing",
      message: await pathExists(runPath)
        ? `Operating Run '${anchor.runId}' exists but cannot be loaded as completed evidence.`
        : `Operating Run '${anchor.runId}' is absent.`,
      navigation,
    };
    const exact = run.manifest.resultHash === anchor.resultHash;
    if (!exact) return {
      anchor,
      state: "invalid",
      message: `Operating Run '${anchor.runId}' result hash no longer matches the Investigation.`,
      navigation,
    };
    const current = selectedIdentityCurrent
      && snapshot.status.evidence.state === "current"
      && snapshot.status.evidence.runId === anchor.runId;
    return {
      anchor,
      state: current ? "current" : "historical",
      message: current
        ? `Operating Run '${anchor.runId}' is current for the exact selected execution.`
        : `Operating Run '${anchor.runId}' remains valid but is not current for the exact selected execution.`,
      navigation,
    };
  }
  if (anchor.kind === "diagnostic") {
    const operating = manifest.anchors.find((item) => item.kind === "operating-run")!;
    const run = (await listRuns(projectDir)).find((item) => item.name === operating.runId);
    if (!run) return {
      anchor,
      state: await pathExists(join(resolve(projectDir), "runs", operating.runId)) ? "invalid" : "missing",
      message: `Diagnostic '${anchor.diagnosticId}' cannot be resolved because its operating Run is unavailable.`,
      navigation,
    };
    const diagnostic = snapshot.diagnostics.find((item) => item.id === anchor.diagnosticId);
    const current = selectedIdentityCurrent
      && diagnostic?.evidence.runId === anchor.runId
      && diagnostic.code === anchor.code
      && diagnostic.message === anchor.message
      && diagnostic.evidence.summary === anchor.summary
      && stableStringify(diagnostic.subjects) === stableStringify(anchor.subjects);
    return {
      anchor,
      state: current ? "current" : "historical",
      message: current
        ? `Diagnostic '${anchor.code}' is still current with the same subjects and evidence.`
        : `Diagnostic '${anchor.code}' remains recorded but no longer matches the current Workbench evidence.`,
      navigation,
    };
  }
  if (anchor.kind === "candidate-review") {
    try {
      const candidate = await loadCandidateChangeSet(projectDir, anchor.candidateId);
      const candidateProposalHash = hashValue(candidate);
      const receipt = await loadCandidateReviewReceipt(
        projectDir,
        anchor.candidateId,
        anchor.proposalHash,
      );
      if (!receipt) return {
        anchor,
        state: "missing",
        message: `Candidate review '${anchor.candidateId}' / '${anchor.proposalHash.slice(0, 12)}' is absent.`,
        navigation,
      };
      const exact = receipt.benchmark === anchor.benchmark
        && receipt.proposalHash === anchor.proposalHash
        && receipt.resultHash === anchor.reviewResultHash
        && receipt.verdict === anchor.verdict
        && receipt.currentCandidateHash === anchor.currentCandidateHash
        && receipt.proposedCandidateHash === anchor.proposedCandidateHash;
      if (!exact) return {
        anchor,
        state: "invalid",
        message: `Candidate review '${anchor.candidateId}' no longer matches the Investigation anchor.`,
        navigation,
      };
      if (candidateProposalHash !== anchor.proposalHash) return {
        anchor,
        state: "historical",
        message: `Candidate review '${anchor.candidateId}' remains valid but the project now authors a different proposal under that id.`,
        navigation,
      };
      const decision = await inspectCandidateDecision(projectDir, anchor.candidateId);
      const current = decision.proposalHash === anchor.proposalHash
        && decision.resultHash === anchor.reviewResultHash
        && decision.state !== "stale";
      return {
        anchor,
        state: current ? "current" : "historical",
        message: current
          ? `Candidate '${anchor.candidateId}' still resolves to the exact ${anchor.verdict} review evidence.`
          : `Candidate '${anchor.candidateId}' review remains valid but its Blueprint decision state is historical.`,
        navigation,
      };
    } catch (error) {
      return {
        anchor,
        state: await pathExists(join(resolve(projectDir), "candidates", `${anchor.candidateId}.candidate.json`))
          ? "invalid"
          : "missing",
        message: `Candidate review '${anchor.candidateId}' cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
        navigation,
      };
    }
  }
  const program = snapshot.designPrograms.find((item) => item.id === anchor.programId);
  if (!program) return {
    anchor,
    state: "missing",
    message: `Design Program '${anchor.programId}' is absent.`,
    navigation,
  };
  const run = program.evidence.runs.find((item) => item.id === anchor.runId);
  if (!run) {
    const runPath = join(resolve(projectDir), "design-runs", anchor.programId, anchor.runId);
    return {
      anchor,
      state: await pathExists(runPath) ? "invalid" : "missing",
      message: await pathExists(runPath)
        ? `Design Run '${anchor.runId}' exists but is excluded as invalid evidence.`
        : `Design Run '${anchor.runId}' is absent.`,
      navigation,
    };
  }
  const commissioning = run.currentness.commissioning;
  const current = selectedIdentityCurrent
    && run.currentness.state === "commissioned"
    && commissioning
    && stableStringify({
      programId: commissioning.program,
      runId: commissioning.runId,
      candidateId: commissioning.candidateId,
      benchmark: commissioning.benchmark,
      sourceBlueprintHash: commissioning.sourceBlueprintHash,
      baseBlueprintHash: commissioning.baseBlueprintHash,
      appliedBlueprintHash: commissioning.appliedBlueprintHash,
      proposalHash: commissioning.proposalHash,
      reviewResultHash: commissioning.reviewResultHash,
    }) === stableStringify({
      programId: anchor.programId,
      runId: anchor.runId,
      candidateId: anchor.candidateId,
      benchmark: anchor.benchmark,
      sourceBlueprintHash: anchor.sourceBlueprintHash,
      baseBlueprintHash: anchor.baseBlueprintHash,
      appliedBlueprintHash: anchor.appliedBlueprintHash,
      proposalHash: anchor.proposalHash,
      reviewResultHash: anchor.reviewResultHash,
    });
  return {
    anchor,
    state: current ? "current" : "historical",
    message: current
      ? `Candidate '${anchor.candidateId}' still verifies the exact commissioned Design lineage.`
      : `The Design Run remains valid but its exact commissioned Candidate lineage is no longer current.`,
    navigation,
  };
}

export async function inspectIndustrialInvestigation(
  projectDir: string,
  investigationId: string,
): Promise<IndustrialInvestigationInspection> {
  const manifest = await loadIndustrialInvestigationManifest(projectDir, investigationId);
  const project = compileFactoryProject(await loadFactoryProject(projectDir, manifest.selection));
  if (project.manifest.id !== manifest.project) {
    throw new IndustrialInvestigationError(
      "investigation.project-mismatch",
      `Investigation '${investigationId}' belongs to project '${manifest.project}', not '${project.manifest.id}'`,
    );
  }
  const [entries, snapshot] = await Promise.all([
    listIndustrialInvestigationEntries(projectDir, investigationId),
    openProjectWorkbenchSnapshot(projectDir, manifest.selection),
  ]);
  const evidenceAnchors = [
    ...manifest.anchors,
    ...entries.flatMap((entry) => entry.introducedAnchors),
  ];
  const anchors = await Promise.all(evidenceAnchors.map((anchor) =>
    inspectAnchor(projectDir, manifest, snapshot, anchor)));
  const broken = anchors.find((item) => item.state === "invalid")
    ?? anchors.find((item) => item.state === "missing");
  const latestCheckpoint = entries
    .flatMap((entry) => entry.introducedAnchors)
    .reverse()
    .find((anchor) =>
      anchor.kind === "factory-observation" || anchor.kind === "run-comparison");
  const latestOperatingState = latestCheckpoint
    ? anchors.find((item) => item.anchor.id === latestCheckpoint.id)?.state
    : manifest.anchors
      .filter((anchor) => anchor.kind === "operating-run" || anchor.kind === "diagnostic")
      .every((anchor) => anchors.find((item) => item.anchor.id === anchor.id)?.state === "current")
      ? "current"
      : "historical";
  const state: InvestigationAnchorState = broken?.state ?? latestOperatingState ?? "invalid";
  const latestEntry = entries.at(-1);
  const productionPlanContinuation = latestEntry?.kind === "hypothesis"
    && latestEntry.intervention === "production-plan"
    ? await resolveProductionPlanContinuation(projectDir, manifest, latestEntry)
    : null;
  const candidateCycle = latestEntry?.kind === "hypothesis"
    && latestEntry.intervention === "production-plan"
    ? null
    : await resolveInvestigationCandidateCycle(projectDir, manifest, entries, anchors);
  const handoff = buildIndustrialInvestigationHandoff({
    projectDir,
    manifest,
    entries,
    anchors,
    state,
    projectNextAction: snapshot.nextAction,
    productionPlanContinuation,
    candidateCycle,
  });
  return {
    manifest,
    manifestHash: manifest.manifestHash,
    context: {
      project: { ...snapshot.project },
      selection: structuredClone(snapshot.selection),
      hashes: { ...snapshot.hashes },
    },
    entries,
    state,
    anchors,
    handoff,
    currentNextAction: handoff.nextAction,
  };
}

interface ProductionPlanContinuation {
  inspected: InspectedProductionPlanRevision | null;
  interventionRunId: string | null;
}

function matchingReviewAnchor(
  entries: readonly IndustrialInvestigationEntry[],
  candidateId: string,
  decision: Awaited<ReturnType<typeof inspectCandidateDecision>>,
): Extract<InvestigationEvidenceAnchor, { kind: "candidate-review" }> | null {
  if (!decision.proposedCandidateHash || !decision.resultHash || !decision.verdict) return null;
  return entries.flatMap((entry) => entry.introducedAnchors)
    .filter((anchor): anchor is Extract<InvestigationEvidenceAnchor, { kind: "candidate-review" }> =>
      anchor.kind === "candidate-review")
    .find((anchor) =>
      anchor.candidateId === candidateId
      && anchor.proposalHash === decision.proposalHash
      && (anchor.currentCandidateHash === decision.currentCandidateHash
        || (decision.state === "verified"
          && anchor.proposedCandidateHash === decision.currentCandidateHash))
      && anchor.proposedCandidateHash === decision.proposedCandidateHash
      && anchor.reviewResultHash === decision.resultHash
      && anchor.verdict === decision.verdict) ?? null;
}

async function resolveInvestigationCandidateCycle(
  projectDir: string,
  manifest: IndustrialInvestigationManifest,
  entries: IndustrialInvestigationEntry[],
  inspectedAnchors: InspectedInvestigationAnchor[],
): Promise<InvestigationCandidateCycle | null> {
  const hypothesis = [...entries].reverse().find((entry): entry is Extract<
    IndustrialInvestigationEntry,
    { kind: "hypothesis" }
  > => entry.kind === "hypothesis" && entry.intervention === "blueprint");
  if (!hypothesis) return null;
  const candidates = (await listCandidateChangeSets(projectDir)).filter((candidate) =>
    candidate.source?.kind === "investigation-hypothesis"
    && candidate.source.project === manifest.project
    && candidate.source.investigation === manifest.id
    && candidate.source.manifestHash === manifest.manifestHash
    && candidate.source.entry === hypothesis.id
    && candidate.source.entryHash === hypothesis.entryHash);
  if (!candidates.length) return {
    hypothesisEntryId: hypothesis.id,
    hypothesisEntryHash: hypothesis.entryHash,
    state: "not-authored",
    activeCandidateId: null,
    candidates: [],
  };

  const runs = await listRuns(projectDir);
  const projected = await Promise.all(candidates.map(async (candidate): Promise<InvestigationCandidateCycleCandidate> => {
    let decision: Awaited<ReturnType<typeof inspectCandidateDecision>>;
    try {
      decision = await inspectCandidateDecision(projectDir, candidate.id);
    } catch (error) {
      return {
        id: candidate.id,
        name: candidate.name,
        benchmark: candidate.benchmark,
        proposalHash: hashValue(candidate),
        decisionState: "invalid",
        verdict: null,
        reviewResultHash: null,
        trial: null,
        comparison: null,
        disposition: null,
        error: {
          code: error instanceof IndustrialInvestigationError
            ? error.code
            : error && typeof error === "object" && "code" in error && typeof error.code === "string"
              ? error.code
            : "investigation.candidate-invalid",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    const reviewAnchor = matchingReviewAnchor(entries, candidate.id, decision);
    const dispositionEntry = reviewAnchor
      ? [...entries].reverse().find((entry) =>
        entry.kind === "decision" && entry.evidence.includes(reviewAnchor.id))
      : undefined;
    const exactTrials = decision.resultHash && decision.verdict && decision.sourceEvidence
      ? runs.filter((run) =>
        run.manifest.decision === "TRIAL"
        && run.manifest.parentRun === decision.sourceEvidence!.operatingContext.run.id
        && run.manifest.candidate?.id === candidate.id
        && run.manifest.candidate.proposalHash === decision.proposalHash
        && run.manifest.candidate.reviewResultHash === decision.resultHash
        && run.manifest.candidate.reviewVerdict === decision.verdict)
      : [];
    let error: InvestigationCandidateCycleCandidate["error"] = decision.error
      ? { ...decision.error }
      : null;
    if (exactTrials.length > 1) error = {
      code: "investigation.ambiguous-candidate-trial",
      message: `Candidate '${candidate.id}' has ${exactTrials.length} exact TRIAL Runs; the Investigation cannot choose one by filename recency.`,
    };
    const trialRun = exactTrials.length === 1 ? exactTrials[0]! : null;
    let comparison: InvestigationCandidateCycleCandidate["comparison"] = null;
    if (trialRun?.manifest.parentRun) {
      const anchor = entries.flatMap((entry) => entry.introducedAnchors)
        .filter((item): item is Extract<InvestigationEvidenceAnchor, { kind: "run-comparison" }> =>
          item.kind === "run-comparison")
        .find((item) =>
          item.from.runId === trialRun.manifest.parentRun
          && item.from.resultHash === decision.sourceEvidence?.operatingContext.run.resultHash
          && item.to.runId === trialRun.name
          && item.to.resultHash === trialRun.manifest.resultHash);
      const inspected = anchor
        ? inspectedAnchors.find((item) => item.anchor.id === anchor.id)
        : null;
      if (anchor && inspected
        && inspected.state !== "missing"
        && inspected.state !== "invalid") {
        comparison = {
          anchorId: anchor.id,
          comparisonHash: anchor.comparisonHash,
        };
      }
    }
    return {
      id: candidate.id,
      name: candidate.name,
      benchmark: candidate.benchmark,
      proposalHash: decision.proposalHash,
      decisionState: decision.state,
      verdict: decision.verdict ?? null,
      reviewResultHash: decision.resultHash ?? null,
      trial: trialRun?.manifest.parentRun ? {
        runId: trialRun.name,
        resultHash: trialRun.manifest.resultHash,
        parentRunId: trialRun.manifest.parentRun,
      } : null,
      comparison,
      disposition: dispositionEntry?.kind === "decision" && reviewAnchor ? {
        entryId: dispositionEntry.id,
        entryHash: dispositionEntry.entryHash,
        sequence: dispositionEntry.sequence,
        author: dispositionEntry.author,
        disposition: dispositionEntry.disposition,
        reviewAnchorId: reviewAnchor.id,
      } : null,
      error,
    };
  }));
  projected.sort((left, right) => left.id.localeCompare(right.id));
  const unresolved = projected.filter((candidate) => !candidate.disposition);
  if (unresolved.length > 1) return {
    hypothesisEntryId: hypothesis.id,
    hypothesisEntryHash: hypothesis.entryHash,
    state: "ambiguous",
    activeCandidateId: null,
    candidates: projected,
  };
  const active = unresolved[0] ?? [...projected].sort((left, right) =>
    (right.disposition?.sequence ?? -1) - (left.disposition?.sequence ?? -1)
      || left.id.localeCompare(right.id))[0]!;
  const state: InvestigationCandidateCycle["state"] = active.error
    || active.decisionState === "invalid"
    || active.decisionState === "stale"
    ? "invalid"
    : active.disposition
      ? "completed"
      : active.decisionState === "proposed"
        ? "review-required"
        : active.decisionState === "verified"
          ? "decision-required"
          : !active.trial
            ? "trial-required"
            : !active.comparison
              ? "comparison-required"
              : "decision-required";
  return {
    hypothesisEntryId: hypothesis.id,
    hypothesisEntryHash: hypothesis.entryHash,
    state,
    activeCandidateId: active.id,
    candidates: projected,
  };
}

async function resolveProductionPlanContinuation(
  projectDir: string,
  manifest: IndustrialInvestigationManifest,
  hypothesis: Extract<IndustrialInvestigationEntry, { kind: "hypothesis" }>,
): Promise<ProductionPlanContinuation> {
  const inspected = await matchingProductionPlanRevision(
    projectDir,
    manifest.id,
    hypothesis.id,
    hypothesis.entryHash,
  );
  if (!inspected) return { inspected: null, interventionRunId: null };
  const { revision } = inspected;
  const runs = await listRuns(projectDir);
  for (const run of [...runs].reverse()) {
    if (run.manifest.seed !== revision.source.control.seed
      || run.manifest.selection.productionPlan !== revision.result.id
      || run.manifest.hashes.productionPlanHash !== revision.result.hash) continue;
    try {
      const comparison = await compareFactoryRuns(
        projectDir,
        revision.source.control.runId,
        run.name,
      );
      if (comparison.intervention.kind === "production-plan"
        && comparison.intervention.from.id === revision.base.id
        && comparison.intervention.from.hash === revision.base.hash
        && comparison.intervention.to.id === revision.result.id
        && comparison.intervention.to.hash === revision.result.hash) {
        return { inspected, interventionRunId: run.name };
      }
    } catch {
      // A Run is continuation evidence only after the strict comparison reopens it.
    }
  }
  return { inspected, interventionRunId: null };
}

function buildIndustrialInvestigationHandoff(input: {
  projectDir: string;
  manifest: IndustrialInvestigationManifest;
  entries: IndustrialInvestigationEntry[];
  anchors: InspectedInvestigationAnchor[];
  state: InvestigationAnchorState;
  projectNextAction: WorkbenchNextAction;
  productionPlanContinuation: ProductionPlanContinuation | null;
  candidateCycle: InvestigationCandidateCycle | null;
}): IndustrialInvestigationHandoff {
  const latest = input.entries.at(-1) ?? null;
  const sourceEntry = latest
    ? {
      id: latest.id,
      sequence: latest.sequence,
      kind: latest.kind,
      entryHash: latest.entryHash,
    }
    : null;
  const evidenceIds = latest?.evidence.length
    ? [...latest.evidence]
    : input.anchors
      .filter((item) => item.state === "current")
      .map((item) => item.anchor.id);
  const investigationRoute = `/${input.manifest.project}/investigations/${input.manifest.id}`;
  const route = `${investigationRoute}#investigation-authoring`;
  const inspectArgv = [
    "inm",
    "investigate",
    resolve(input.projectDir),
    "--investigation",
    input.manifest.id,
    "--json",
  ];
  const action = (
    phase: Exclude<IndustrialInvestigationPhase, "resume-project">,
    title: string,
    reason: string,
    actionLabel: string,
    options: {
      argv?: string[];
      studioRoute?: string;
      effect?: WorkbenchNextAction["effect"];
    } = {},
  ): WorkbenchNextAction => ({
    id: `investigation.${phase}:${input.manifest.id}:${latest?.entryHash.slice(0, 12) ?? input.manifest.manifestHash.slice(0, 12)}`,
    tone: phase === "repair-evidence" ? "blocking" : phase === "observe-current-factory" ? "evidence" : "attention",
    title,
    reason,
    actionLabel,
    effect: options.effect ?? "read-only",
    requiresConfirmation: false,
    argv: options.argv ?? inspectArgv,
    studioRoute: options.studioRoute ?? route,
    target: {
      kind: "investigation",
      investigationId: input.manifest.id,
      phase,
      sourceEntryId: latest?.id ?? null,
    },
  });

  if (input.state === "missing" || input.state === "invalid") {
    const failed = input.anchors.filter((item) =>
      item.state === "missing" || item.state === "invalid");
    const nextAction = action(
      "repair-evidence",
      "Repair this Investigation's evidence before continuing",
      `${failed.map((item) => item.anchor.id).join(", ") || "Pinned evidence"} is ${input.state}. The append-only chain remains visible, but no new factory claim should inherit a broken identity.`,
      "REVIEW EVIDENCE",
    );
    return {
      phase: "repair-evidence",
      sourceEntry,
      evidenceIds,
      authorship: null,
      productionPlanRevision: null,
      candidateCycle: input.candidateCycle,
      nextAction,
    };
  }

  const awaitingCandidateDecision = input.candidateCycle?.state === "decision-required"
    && input.candidateCycle.activeCandidateId
    ? input.candidateCycle.candidates.find((candidate) =>
      candidate.id === input.candidateCycle!.activeCandidateId) ?? null
    : null;
  if (awaitingCandidateDecision) {
    const suggestedDisposition = awaitingCandidateDecision.verdict === "KEEP"
      ? "keep"
      : awaitingCandidateDecision.verdict === "DISCARD"
        ? "discard"
        : "revise";
    const nextAction = action(
      "decide-candidate",
      `Record the industrial disposition for Candidate '${awaitingCandidateDecision.id}'`,
      `The exact review${awaitingCandidateDecision.trial ? `, TRIAL '${awaitingCandidateDecision.trial.runId}', and retained comparison` : ""} now answers hypothesis '${input.candidateCycle!.hypothesisEntryId}'. A human or reasoning Agent must decide KEEP, revise, defer, or discard; a new hypothesis would otherwise abandon unresolved evidence.`,
      "RECORD EXPLICIT DECISION",
      {
        studioRoute: `${investigationRoute}?candidate=${encodeURIComponent(awaitingCandidateDecision.id)}&disposition=${suggestedDisposition}#investigation-authoring`,
      },
    );
    return {
      phase: "decide-candidate",
      sourceEntry,
      evidenceIds,
      authorship: null,
      productionPlanRevision: null,
      candidateCycle: input.candidateCycle,
      nextAction,
    };
  }

  if (input.state === "historical" || !latest) {
    const nextAction = action(
      "observe-current-factory",
      latest
        ? "Capture the current factory before extending this Investigation"
        : "Begin with one exact factory observation",
      latest
        ? `The newest operating checkpoint is exact history, not the current selected factory. Append an authored observation with a new Core-resolved factory checkpoint before forming another hypothesis.`
        : `This Investigation has exact creation evidence but no authored reasoning entry. Begin with one visible or typed observation; Core can bind the current factory without accepting caller-authored hashes.`,
      "AUTHOR OBSERVATION",
    );
    return {
      phase: "observe-current-factory",
      sourceEntry,
      evidenceIds,
      authorship: {
        kind: "investigation-entry",
        entryKind: "observation",
        requiredFields: ["entry-id", "author", "statement"],
      },
      productionPlanRevision: null,
      candidateCycle: input.candidateCycle,
      nextAction,
    };
  }

  const completedCandidate = input.candidateCycle?.state === "completed"
    && input.candidateCycle.activeCandidateId
    ? input.candidateCycle.candidates.find((candidate) =>
      candidate.id === input.candidateCycle!.activeCandidateId
      && candidate.disposition?.entryId === latest.id) ?? null
    : null;
  if (latest.kind === "decision"
    && completedCandidate?.disposition
    && (completedCandidate.disposition.disposition === "discard"
      || completedCandidate.disposition.disposition === "defer")) {
    const nextAction = action(
      "observe-current-factory",
      `Candidate '${completedCandidate.id}' is ${completedCandidate.disposition.disposition}; observe the current factory before continuing`,
      `Entry '${latest.id}' closes the exact Candidate cycle through review${completedCandidate.trial ? `, TRIAL '${completedCandidate.trial.runId}', and comparison` : ""}. Preserve that conclusion and bind the next hypothesis to a fresh current factory checkpoint instead of reopening the retired proposal.`,
      "AUTHOR CURRENT OBSERVATION",
    );
    return {
      phase: "observe-current-factory",
      sourceEntry,
      evidenceIds,
      authorship: {
        kind: "investigation-entry",
        entryKind: "observation",
        requiredFields: ["entry-id", "author", "statement"],
      },
      productionPlanRevision: null,
      candidateCycle: input.candidateCycle,
      nextAction,
    };
  }

  if (latest.kind === "observation" || (latest.kind === "decision" && latest.disposition === "revise")) {
    const nextAction = action(
      "form-hypothesis",
      `Form the next industrial hypothesis from entry ${String(latest.sequence).padStart(4, "0")}`,
      `Entry '${latest.id}' is the latest authored ${latest.kind} under current evidence. A human or reasoning Agent must state one falsifiable intervention and expected measured or visual effect; INM will preserve the cited identities but will not invent the design.`,
      "FORM HYPOTHESIS",
    );
    return {
      phase: "form-hypothesis",
      sourceEntry,
      evidenceIds,
      authorship: {
        kind: "investigation-entry",
        entryKind: "hypothesis",
        requiredFields: ["entry-id", "author", "statement", "intervention", "expected-effect"],
      },
      productionPlanRevision: null,
      candidateCycle: input.candidateCycle,
      nextAction,
    };
  }

  if (latest.kind === "hypothesis") {
    if (latest.intervention === "production-plan") {
      const continuation = input.productionPlanContinuation;
      const inspected = continuation?.inspected ?? null;
      const revisionSummary = inspected ? {
        id: inspected.revision.id,
        revisionHash: inspected.revision.revisionHash,
        path: inspected.path,
        base: {
          id: inspected.revision.base.id,
          hash: inspected.revision.base.hash,
        },
        result: {
          id: inspected.revision.result.id,
          hash: inspected.revision.result.hash,
        },
        controlRunId: inspected.revision.source.control.runId,
        controlSeed: inspected.revision.source.control.seed,
        selection: { ...inspected.revision.source.control.selection },
        interventionRunId: continuation?.interventionRunId ?? null,
      } : null;
      if (inspected && continuation?.interventionRunId) {
        const comparisonRoute = `/${encodeURIComponent(input.manifest.project)}/runs?from=${encodeURIComponent(inspected.revision.source.control.runId)}&to=${encodeURIComponent(continuation.interventionRunId)}&investigation=${encodeURIComponent(input.manifest.id)}`;
        const nextAction = action(
          "compare-production-plan",
          `Compare Production Plan '${inspected.revision.result.id}' with its exact control`,
          `Run '${continuation.interventionRunId}' re-verifies revision ${inspected.revision.revisionHash.slice(0, 12)} against control Run '${inspected.revision.source.control.runId}'. Inspect the quantitative and visual tradeoffs, then append an authored observation and decision.`,
          "REVIEW EXACT COMPARISON",
          {
            argv: [
              "inm",
              "compare",
              resolve(input.projectDir),
              "--from-run",
              inspected.revision.source.control.runId,
              "--to-run",
              continuation.interventionRunId,
              "--json",
            ],
            studioRoute: comparisonRoute,
          },
        );
        return {
          phase: "compare-production-plan",
          sourceEntry,
          evidenceIds,
          authorship: null,
          productionPlanRevision: revisionSummary,
          candidateCycle: input.candidateCycle,
          nextAction,
        };
      }
      if (inspected) {
        const selection = inspected.revision.source.control.selection;
        const simulationArgv = [
          "inm",
          "simulate",
          resolve(input.projectDir),
          "--world",
          selection.world,
          "--blueprint",
          selection.blueprint,
          "--production-plan",
          inspected.revision.result.id,
          "--scenario",
          selection.scenario,
          "--objective",
          selection.objective,
          "--seed",
          String(inspected.revision.source.control.seed),
          "--json",
        ];
        const nextAction = action(
          "simulate-production-plan",
          `Simulate Production Plan '${inspected.revision.result.id}'`,
          `Revision ${inspected.revision.revisionHash.slice(0, 12)} exactly answers hypothesis '${latest.id}' and preserves control Run '${inspected.revision.source.control.runId}'. Execute the separately selected plan; INM will discover only a complete comparable immutable Run.`,
          "RUN AUTHORED PLAN",
          {
            argv: simulationArgv,
            studioRoute: `${investigationRoute}#production-plan-session`,
            effect: "creates-artifact",
          },
        );
        return {
          phase: "simulate-production-plan",
          sourceEntry,
          evidenceIds,
          authorship: null,
          productionPlanRevision: revisionSummary,
          candidateCycle: input.candidateCycle,
          nextAction,
        };
      }
      const nextAction = action(
        "author-production-plan",
        `Author a Production Plan for hypothesis ${String(latest.sequence).padStart(4, "0")}`,
        `Hypothesis '${latest.id}' is current and pinned by ${latest.entryHash.slice(0, 12)}. Author one new self-contained Production Plan revision; Core will retain the exact hypothesis, control Run, complete before/after plans, hashes, and derived patch without replacing the project default.`,
        "AUTHOR PRODUCTION PLAN",
      );
      return {
        phase: "author-production-plan",
        sourceEntry,
        evidenceIds,
        authorship: {
          kind: "production-plan",
          hypothesisEntryId: latest.id,
          hypothesisEntryHash: latest.entryHash,
          requiredFields: ["production-plan-id", "production-plan-file"],
        },
        productionPlanRevision: null,
        candidateCycle: input.candidateCycle,
        nextAction,
      };
    }
    const cycle = input.candidateCycle;
    const activeCandidate = cycle?.activeCandidateId
      ? cycle.candidates.find((candidate) => candidate.id === cycle.activeCandidateId) ?? null
      : null;
    if (cycle?.state === "ambiguous") {
      const nextAction = action(
        "review-candidate",
        `Choose one Candidate branch for hypothesis ${String(latest.sequence).padStart(4, "0")}`,
        `${cycle.candidates.length} unresolved Candidates cite the same exact hypothesis. INM will not choose among authored alternatives by filename or score; review and explicitly disposition one branch before continuing.`,
        "REVIEW CANDIDATE ALTERNATIVES",
      );
      return {
        phase: "review-candidate",
        sourceEntry,
        evidenceIds,
        authorship: null,
        productionPlanRevision: null,
        candidateCycle: cycle,
        nextAction,
      };
    }
    if (cycle?.state === "invalid" && activeCandidate) {
      const nextAction = action(
        "repair-evidence",
        `Repair Candidate '${activeCandidate.id}' before continuing`,
        activeCandidate.error?.message
          ?? `Candidate '${activeCandidate.id}' is ${activeCandidate.decisionState}; its exact review or TRIAL identity cannot continue this Investigation.`,
        "REVIEW CANDIDATE EVIDENCE",
        {
          studioRoute: `/${encodeURIComponent(input.manifest.project)}/experiments/${encodeURIComponent(activeCandidate.benchmark)}/candidates/${encodeURIComponent(activeCandidate.id)}`,
        },
      );
      return {
        phase: "repair-evidence",
        sourceEntry,
        evidenceIds,
        authorship: null,
        productionPlanRevision: null,
        candidateCycle: cycle,
        nextAction,
      };
    }
    if (cycle?.state === "review-required" && activeCandidate) {
      const nextAction = action(
        "review-candidate",
        `Review Candidate '${activeCandidate.id}' against locked evidence`,
        `Candidate '${activeCandidate.id}' exactly cites hypothesis '${latest.id}', but has no immutable review receipt. Evaluate its locked Benchmark and current-factory effect before trial or disposition.`,
        "REVIEW CANDIDATE",
        {
          argv: [
            "inm", "candidate", resolve(input.projectDir),
            "--candidate", activeCandidate.id, "--review", "--json",
          ],
          studioRoute: `/${encodeURIComponent(input.manifest.project)}/experiments/${encodeURIComponent(activeCandidate.benchmark)}/candidates/${encodeURIComponent(activeCandidate.id)}`,
          effect: "creates-artifact",
        },
      );
      return {
        phase: "review-candidate",
        sourceEntry,
        evidenceIds,
        authorship: null,
        productionPlanRevision: null,
        candidateCycle: cycle,
        nextAction,
      };
    }
    if (cycle?.state === "trial-required" && activeCandidate) {
      const nextAction = action(
        "simulate-candidate",
        `Run reviewed Candidate '${activeCandidate.id}' without applying it`,
        `Review ${activeCandidate.reviewResultHash?.slice(0, 12)} is immutable. Freeze the proposed Blueprint as one TRIAL Run under the hypothesis's exact operating selection; this creates evidence, not current factory authority.`,
        "RUN CANDIDATE TRIAL",
        {
          argv: [
            "inm", "candidate", resolve(input.projectDir),
            "--candidate", activeCandidate.id, "--run", "--seed", "42", "--json",
          ],
          studioRoute: `${investigationRoute}#candidate-session`,
          effect: "creates-artifact",
        },
      );
      return {
        phase: "simulate-candidate",
        sourceEntry,
        evidenceIds,
        authorship: null,
        productionPlanRevision: null,
        candidateCycle: cycle,
        nextAction,
      };
    }
    if (cycle?.state === "comparison-required" && activeCandidate?.trial) {
      const nextAction = action(
        "compare-candidate",
        `Compare Candidate TRIAL '${activeCandidate.trial.runId}' with its exact source`,
        `The reviewed Candidate has an immutable TRIAL, but this Investigation has not retained the exact control/TRIAL comparison. Inspect quantitative and spatial tradeoffs before recording a disposition.`,
        "REVIEW EXACT COMPARISON",
        {
          argv: [
            "inm", "compare", resolve(input.projectDir),
            "--from-run", activeCandidate.trial.parentRunId,
            "--to-run", activeCandidate.trial.runId,
            "--json",
          ],
          studioRoute: `/${encodeURIComponent(input.manifest.project)}/runs?from=${encodeURIComponent(activeCandidate.trial.parentRunId)}&to=${encodeURIComponent(activeCandidate.trial.runId)}&investigation=${encodeURIComponent(input.manifest.id)}`,
        },
      );
      return {
        phase: "compare-candidate",
        sourceEntry,
        evidenceIds,
        authorship: null,
        productionPlanRevision: null,
        candidateCycle: cycle,
        nextAction,
      };
    }
    if (cycle?.state === "decision-required" && activeCandidate) {
      const suggestedDisposition = activeCandidate.verdict === "KEEP"
        ? "keep"
        : activeCandidate.verdict === "DISCARD"
          ? "discard"
          : "revise";
      const nextAction = action(
        "decide-candidate",
        `Record the industrial disposition for Candidate '${activeCandidate.id}'`,
        `Review${activeCandidate.trial ? `, TRIAL '${activeCandidate.trial.runId}', and exact comparison` : ""} evidence is retained. A human or reasoning Agent must now decide KEEP, revise, defer, or discard; INM will not derive judgment from score.`,
        "RECORD EXPLICIT DECISION",
        {
          studioRoute: `${investigationRoute}?candidate=${encodeURIComponent(activeCandidate.id)}&disposition=${suggestedDisposition}#investigation-authoring`,
        },
      );
      return {
        phase: "decide-candidate",
        sourceEntry,
        evidenceIds,
        authorship: null,
        productionPlanRevision: null,
        candidateCycle: cycle,
        nextAction,
      };
    }
    const nextAction = action(
      "author-candidate",
      `Author a Candidate for hypothesis ${String(latest.sequence).padStart(4, "0")}`,
      `Hypothesis '${latest.id}' is current and pinned by ${latest.entryHash.slice(0, 12)}. Supply a Candidate id, name, locked Benchmark, and caller-authored RFC 6902 patch; Core will derive the exact source and base identities.`,
      "AUTHOR CANDIDATE",
    );
    return {
      phase: "author-candidate",
      sourceEntry,
      evidenceIds,
      authorship: {
        kind: "candidate",
        hypothesisEntryId: latest.id,
        hypothesisEntryHash: latest.entryHash,
        requiredFields: ["candidate-id", "candidate-name", "benchmark", "patch-file"],
      },
      productionPlanRevision: null,
      candidateCycle: input.candidateCycle,
      nextAction,
    };
  }

  return {
    phase: "resume-project",
    sourceEntry,
    evidenceIds,
    authorship: null,
    productionPlanRevision: null,
    candidateCycle: input.candidateCycle,
    nextAction: input.projectNextAction,
  };
}

export async function listIndustrialInvestigations(
  projectDir: string,
): Promise<IndustrialInvestigationSummary[]> {
  const ids = await listInvestigationIds(projectDir);
  return Promise.all(ids.map(async (investigationId) => {
    const manifest = await loadIndustrialInvestigationManifest(projectDir, investigationId);
    const entries = await listIndustrialInvestigationEntries(projectDir, investigationId);
    const last = entries.at(-1);
    return {
      id: manifest.id,
      name: manifest.name,
      question: manifest.question,
      entryCount: entries.length,
      lastEntry: last ? {
        id: last.id,
        sequence: last.sequence,
        kind: last.kind,
        author: last.author,
        statement: last.statement,
      } : null,
    };
  }));
}
