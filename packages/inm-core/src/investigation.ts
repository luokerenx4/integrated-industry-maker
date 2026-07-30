import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { listRuns } from "./artifacts";
import { loadBlueprintBenchmark } from "./benchmark";
import {
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
} from "./candidate-review";
import { projectEvidenceHashes } from "./execution-identity";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import {
  openProjectWorkbenchSnapshot,
  openRunProjectWorkbenchSnapshot,
  type ProjectWorkbenchSnapshot,
  type WorkbenchDiagnostic,
  type WorkbenchNextAction,
  type WorkbenchSubjectReference,
} from "./workbench";
import { compileFactoryProject } from "./compiler";
import { atomicWriteJson, hashValue, pathExists, readJson, stableStringify } from "./utils";
import {
  compareFactoryRuns,
  factoryRunComparisonEvidenceHash,
  RunComparisonError,
  type FactoryRunComparison,
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
  scenario: idSchema,
  objective: idSchema,
}).strict();
const evidenceHashesSchema = z.object({
  engineVersion: z.string().min(1),
  executionHash: hashSchema,
  worldHash: hashSchema,
  blueprintHash: hashSchema,
  scenarioHash: hashSchema,
  objectiveHash: hashSchema,
}).strict();

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
}).strict();

const runComparisonAnchorSchema = z.object({
  id: idSchema,
  kind: z.literal("run-comparison"),
  from: runComparisonSideSchema,
  to: runComparisonSideSchema,
  comparisonHash: hashSchema,
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

export const industrialInvestigationEntrySchema = z.discriminatedUnion("kind", [
  entryBaseSchema.extend({
    kind: z.literal("observation"),
    entryHash: hashSchema,
  }).strict(),
  entryBaseSchema.extend({
    kind: z.literal("hypothesis"),
    expectedEffect: z.string().min(1),
    entryHash: hashSchema,
  }).strict(),
  entryBaseSchema.extend({
    kind: z.literal("decision"),
    disposition: z.enum(["keep", "revise", "defer", "discard"]),
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
  | EntryInputCommon & { kind: "hypothesis"; expectedEffect: string }
  | EntryInputCommon & { kind: "decision"; disposition: "keep" | "revise" | "defer" | "discard" };

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
  | "resume-project";

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
    requiredFields: Array<"entry-id" | "author" | "statement" | "expected-effect">;
  } | {
    kind: "candidate";
    hypothesisEntryId: string;
    hypothesisEntryHash: string;
    requiredFields: Array<"candidate-id" | "candidate-name" | "benchmark" | "patch-file">;
  };
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
    if (entry.investigation !== investigationId
      || entry.sequence !== expectedSequence
      || file !== expectedFile
      || entry.previousEntryHash !== previousEntryHash
      || hashValue(entryHashInput(withoutHash)) !== entryHash
      || new Set(introducedIds).size !== introducedIds.length
      || introducedIds.some((anchorId) => anchorIds.has(anchorId))
      || entry.evidence.some((anchorId) => !availableAnchorIds.has(anchorId))
      || new Set(entry.evidence).size !== entry.evidence.length) {
      throw new IndustrialInvestigationError(
        "investigation.invalid-entry-chain",
        `Investigation entry '${file}' does not match its identity, evidence anchors, or append-only chain`,
      );
    }
    entries.push(entry);
    for (const anchorId of introducedIds) anchorIds.add(anchorId);
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
    && comparison.to.run.id === anchor.to.runId
    && comparison.to.run.resultHash === anchor.to.resultHash
    && comparison.to.hashes.blueprintHash === anchor.to.blueprintHash
    && stableStringify(comparison.to.selection) === stableStringify(anchor.selection)
    && stableStringify(comparison.to.hashes) === stableStringify(anchor.hashes)
    && factoryRunComparisonEvidenceHash(comparison) === anchor.comparisonHash;
}

function sameRunComparisonDiagnostic(
  anchor: z.infer<typeof runComparisonAnchorSchema>,
  snapshot: ProjectWorkbenchSnapshot,
): boolean {
  const diagnostic = snapshot.diagnostics.find((item) =>
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
  expected?: { hypothesis: string; expectedEffect?: string },
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
  if (expected && (
    expected.hypothesis.trim() !== entry.statement
    || expected.expectedEffect?.trim() !== entry.expectedEffect
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
    ? { ...common, kind: input.kind, expectedEffect: input.expectedEffect.trim() }
    : input.kind === "decision"
      ? { ...common, kind: input.kind, disposition: input.disposition }
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
        scenario: snapshot.selection.scenario.id,
        objective: snapshot.selection.objective.id,
      },
      hashes: projectEvidenceHashes(snapshot.hashes),
      runId: run.id,
      resultHash: run.resultHash,
      diagnostic: {
        diagnosticId: diagnostic.id,
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
      },
      to: {
        runId: comparison.to.run.id,
        resultHash: comparison.to.run.resultHash,
        blueprintHash: comparison.to.hashes.blueprintHash,
      },
      comparisonHash: factoryRunComparisonEvidenceHash(comparison),
      selection: { ...comparison.to.selection },
      hashes: { ...comparison.to.hashes },
      diagnostic: {
        diagnosticId: diagnostic.id,
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
  snapshot: ProjectWorkbenchSnapshot,
): boolean {
  return selection.world === snapshot.selection.world.id
    && selection.blueprint === snapshot.selection.blueprint.id
    && selection.scenario === snapshot.selection.scenario.id
    && selection.objective === snapshot.selection.objective.id;
}

function sameRecordedHashes(
  hashes: IndustrialInvestigationManifest["hashes"],
  snapshot: ProjectWorkbenchSnapshot,
): boolean {
  return stableStringify(hashes) === stableStringify(projectEvidenceHashes(snapshot.hashes));
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
  try {
    comparison = await compareFactoryRuns(
      projectDir,
      anchor.from.runId,
      anchor.to.runId,
    );
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
  let toSnapshot: ProjectWorkbenchSnapshot;
  try {
    toSnapshot = await openRunProjectWorkbenchSnapshot(projectDir, anchor.to.runId);
  } catch (error) {
    return {
      anchor,
      state: "invalid",
      message: `Run comparison '${anchor.id}' TO context cannot be reproduced: ${error instanceof Error ? error.message : String(error)}`,
      navigation,
    };
  }
  if (!sameRunComparisonDiagnostic(anchor, toSnapshot)) return {
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
  const handoff = buildIndustrialInvestigationHandoff({
    projectDir,
    manifest,
    entries,
    anchors,
    state,
    projectNextAction: snapshot.nextAction,
  });
  return {
    manifest,
    manifestHash: manifest.manifestHash,
    entries,
    state,
    anchors,
    handoff,
    currentNextAction: handoff.nextAction,
  };
}

function buildIndustrialInvestigationHandoff(input: {
  projectDir: string;
  manifest: IndustrialInvestigationManifest;
  entries: IndustrialInvestigationEntry[];
  anchors: InspectedInvestigationAnchor[];
  state: InvestigationAnchorState;
  projectNextAction: WorkbenchNextAction;
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
  const route = `/${input.manifest.project}/investigations/${input.manifest.id}#investigation-authoring`;
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
  ): WorkbenchNextAction => ({
    id: `investigation.${phase}:${input.manifest.id}:${latest?.entryHash.slice(0, 12) ?? input.manifest.manifestHash.slice(0, 12)}`,
    tone: phase === "repair-evidence" ? "blocking" : phase === "observe-current-factory" ? "evidence" : "attention",
    title,
    reason,
    actionLabel,
    effect: "read-only",
    requiresConfirmation: false,
    argv: inspectArgv,
    studioRoute: route,
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
        requiredFields: ["entry-id", "author", "statement", "expected-effect"],
      },
      nextAction,
    };
  }

  if (latest.kind === "hypothesis") {
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
      nextAction,
    };
  }

  return {
    phase: "resume-project",
    sourceEntry,
    evidenceIds,
    authorship: null,
    nextAction: input.projectNextAction,
  };
}

export async function listIndustrialInvestigations(
  projectDir: string,
): Promise<IndustrialInvestigationSummary[]> {
  const directory = join(resolve(projectDir), "investigations");
  let ids: string[];
  try {
    ids = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && idSchema.safeParse(entry.name).success)
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
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
