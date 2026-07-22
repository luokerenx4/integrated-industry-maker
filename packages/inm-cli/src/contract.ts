import type { CompiledFactoryProject, InmManifest, ProjectHashes, ProjectOperationContext, ProjectWorkbenchSnapshot } from "@inm/core";

export const CLI_SCHEMA_VERSION = 1 as const;

export interface CliProjectIdentity {
  id: string;
  name: string;
  rootDir: string;
}

export type CliContext =
  | { scope: "global" }
  | { scope: "workspace"; workspace: { name: string; rootDir: string; defaultProject: string | null } }
  | {
    scope: "project";
    project: CliProjectIdentity;
    selection?: { world: string; blueprint: string; scenario: string; objective: string };
    hashes?: ProjectHashes;
  };

export interface CliArtifact {
  kind: "workspace" | "project" | "blueprint" | "run" | "benchmark-lock" | "candidate-review";
  id: string;
  path: string;
  immutable: boolean;
}

export interface CliNextAction {
  id: string;
  description?: string;
  title?: string;
  reason?: string;
  actionLabel?: string;
  argv: string[];
  effect: "read-only" | "creates-artifact" | "mutates-project";
  requiresConfirmation?: boolean;
  studioRoute?: string;
  target?: unknown;
}

export interface CliSuccessEnvelope<T = unknown> {
  schemaVersion: typeof CLI_SCHEMA_VERSION;
  ok: true;
  command: string;
  context: CliContext;
  data: T;
  diagnostics: unknown[];
  artifacts: CliArtifact[];
  nextActions: CliNextAction[];
}

export interface CliErrorIssue {
  path?: string;
  code: string;
  message: string;
}

export interface CliErrorEnvelope {
  schemaVersion: typeof CLI_SCHEMA_VERSION;
  ok: false;
  command: string;
  context: CliContext;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    issues: CliErrorIssue[];
    hashes: Record<string, string>;
  };
}

export interface CliSuccessOptions {
  context?: CliContext;
  diagnostics?: unknown[];
  artifacts?: CliArtifact[];
  nextActions?: CliNextAction[];
}

export class CliCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly options: { context?: CliContext; retryable?: boolean; issues?: CliErrorIssue[]; hashes?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "CliCommandError";
  }
}

export function cliSuccess<T>(command: string, data: T, options: CliSuccessOptions = {}): CliSuccessEnvelope<T> {
  return {
    schemaVersion: CLI_SCHEMA_VERSION,
    ok: true,
    command,
    context: options.context ?? { scope: "global" },
    data,
    diagnostics: options.diagnostics ?? [],
    artifacts: options.artifacts ?? [],
    nextActions: options.nextActions ?? [],
  };
}

export function cliError(command: string, code: string, message: string, options: {
  context?: CliContext;
  retryable?: boolean;
  issues?: CliErrorIssue[];
  hashes?: Record<string, string>;
} = {}): CliErrorEnvelope {
  return {
    schemaVersion: CLI_SCHEMA_VERSION,
    ok: false,
    command,
    context: options.context ?? { scope: "global" },
    error: { code, message, retryable: options.retryable ?? false, issues: options.issues ?? [], hashes: options.hashes ?? {} },
  };
}

export function compiledProjectContext(project: CompiledFactoryProject): CliContext {
  return {
    scope: "project",
    project: { id: project.manifest.id, name: project.manifest.name, rootDir: project.rootDir },
    selection: { ...project.selection },
    hashes: { ...project.hashes },
  };
}

export function operationProjectContext(context: ProjectOperationContext): CliContext {
  return {
    scope: "project",
    project: { ...context.project },
    selection: { ...context.selection },
    hashes: { ...context.hashes },
  };
}

export function workbenchContext(snapshot: ProjectWorkbenchSnapshot): CliContext {
  return {
    scope: "project",
    project: { ...snapshot.project },
    selection: {
      world: snapshot.selection.world.id,
      blueprint: snapshot.selection.blueprint.id,
      scenario: snapshot.selection.scenario.id,
      objective: snapshot.selection.objective.id,
    },
    hashes: { ...snapshot.hashes },
  };
}

export function manifestProjectContext(rootDir: string, manifest: InmManifest): CliContext {
  return { scope: "project", project: { id: manifest.id, name: manifest.name, rootDir } };
}

export function workspaceContext(name: string, rootDir: string, defaultProject: string | null): CliContext {
  return { scope: "workspace", workspace: { name, rootDir, defaultProject } };
}
