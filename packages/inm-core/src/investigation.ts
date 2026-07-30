import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { listRuns } from "./artifacts";
import { loadCandidateChangeSet } from "./candidate-change-set";
import {
  inspectCandidateDecision,
  loadCandidateReviewReceipt,
} from "./candidate-review";
import { projectEvidenceHashes } from "./execution-identity";
import { loadFactoryProject, type ProjectSelection } from "./loader";
import {
  openProjectWorkbenchSnapshot,
  type ProjectWorkbenchSnapshot,
  type WorkbenchDiagnostic,
  type WorkbenchNextAction,
  type WorkbenchSubjectReference,
} from "./workbench";
import { compileFactoryProject } from "./compiler";
import { atomicWriteJson, hashValue, pathExists, readJson, stableStringify } from "./utils";

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

export const investigationEvidenceAnchorSchema = z.discriminatedUnion("kind", [
  operatingRunAnchorSchema,
  diagnosticAnchorSchema,
  designLineageAnchorSchema,
  candidateReviewAnchorSchema,
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
  introducedAnchors: z.array(candidateReviewAnchorSchema).max(1),
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
export type InvestigationIntroducedEvidenceInput = {
  id: string;
  kind: "candidate-review";
  candidateId: string;
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
  currentNextAction: WorkbenchNextAction;
}

export interface IndustrialInvestigationSummary {
  id: string;
  name: string;
  question: string;
  entryCount: number;
  lastEntry: null | Pick<IndustrialInvestigationEntry, "id" | "sequence" | "kind" | "author" | "statement">;
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
  const introducedAnchors = input.introduceEvidence
    ? [await resolveIntroducedEvidenceAnchor(projectDir, input.introduceEvidence)]
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
  input: InvestigationIntroducedEvidenceInput,
): Promise<z.infer<typeof candidateReviewAnchorSchema>> {
  if (!idSchema.safeParse(input.id).success || !idSchema.safeParse(input.candidateId).success) {
    throw new IndustrialInvestigationError(
      "investigation.invalid-anchor",
      "Introduced evidence id and Candidate id must use lowercase kebab-case",
    );
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
  return manifest.selection.world === snapshot.selection.world.id
    && manifest.selection.blueprint === snapshot.selection.blueprint.id
    && manifest.selection.scenario === snapshot.selection.scenario.id
    && manifest.selection.objective === snapshot.selection.objective.id;
}

function sameHashes(
  manifest: IndustrialInvestigationManifest,
  snapshot: ProjectWorkbenchSnapshot,
): boolean {
  return stableStringify(manifest.hashes) === stableStringify(projectEvidenceHashes(snapshot.hashes));
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
  return {
    argv: ["inm", "design", projectDir, "--program", anchor.programId, "--run-id", anchor.runId, "--json"],
    studioRoute: `/${encodeURIComponent(projectId)}/designs/${encodeURIComponent(anchor.programId)}/runs/${encodeURIComponent(anchor.runId)}`,
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
  const rank: Record<InvestigationAnchorState, number> = {
    current: 0,
    historical: 1,
    missing: 2,
    invalid: 3,
  };
  const state = [...anchors].sort((left, right) => rank[right.state] - rank[left.state])[0]?.state ?? "invalid";
  return {
    manifest,
    manifestHash: manifest.manifestHash,
    entries,
    state,
    anchors,
    currentNextAction: snapshot.nextAction,
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
