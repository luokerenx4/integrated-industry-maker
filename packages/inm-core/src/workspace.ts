import { readdir } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import type { ZodError } from "zod";
import { manifestSchema, workspaceSchema } from "./schema";
import type { InmManifest, InmWorkspaceManifest, ValidationIssue, WorkspaceProjectSummary } from "./types";
import { InmValidationError } from "./types";
import { pathExists, readJson } from "./utils";

export const WORKSPACE_MANIFEST = "inm-workspace.json";
export const PROJECT_MANIFEST = "inm.json";

function schemaIssues(file: string, error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: `${file}${issue.path.length ? `/${issue.path.join("/")}` : ""}`,
    code: `schema.${issue.code}`,
    message: issue.message,
  }));
}

async function loadProjectManifest(projectDir: string): Promise<InmManifest> {
  const path = join(projectDir, PROJECT_MANIFEST);
  const parsed = manifestSchema.safeParse(await readJson(path));
  if (!parsed.success) throw new InmValidationError(schemaIssues(path, parsed.error));
  return parsed.data;
}

export async function loadWorkspace(workspaceDir: string): Promise<{ rootDir: string; manifest: InmWorkspaceManifest; projectsDir: string }> {
  const rootDir = resolve(workspaceDir); const path = join(rootDir, WORKSPACE_MANIFEST);
  const parsed = workspaceSchema.safeParse(await readJson(path));
  if (!parsed.success) throw new InmValidationError(schemaIssues(path, parsed.error));
  const projectsDir = resolve(rootDir, parsed.data.projectsDirectory);
  if (projectsDir !== rootDir && !projectsDir.startsWith(`${rootDir}${sep}`)) throw new Error(`Workspace projectsDirectory escapes workspace: ${parsed.data.projectsDirectory}`);
  return { rootDir, manifest: parsed.data, projectsDir };
}

export async function listWorkspaceProjects(workspaceDir: string): Promise<WorkspaceProjectSummary[]> {
  const workspace = await loadWorkspace(workspaceDir);
  let entries;
  try { entries = await readdir(workspace.projectsDir, { withFileTypes: true }); }
  catch { throw new Error(`Missing workspace projects directory: ${workspace.projectsDir}`); }
  const projects: WorkspaceProjectSummary[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Workspace project entries must be real directories: ${join(workspace.projectsDir, entry.name)}`);
    const path = join(workspace.projectsDir, entry.name);
    if (!(await pathExists(join(path, PROJECT_MANIFEST)))) throw new Error(`Workspace project '${entry.name}' is missing ${PROJECT_MANIFEST}`);
    const manifest = await loadProjectManifest(path);
    if (manifest.id !== entry.name) throw new InmValidationError([{ path: join(path, `${PROJECT_MANIFEST}/id`), code: "project.directory-id", message: `Project id '${manifest.id}' must match directory '${entry.name}'` }]);
    projects.push({ id: manifest.id, name: manifest.name, path, isDefault: workspace.manifest.defaultProject === manifest.id });
  }
  if (workspace.manifest.defaultProject && !projects.some((project) => project.id === workspace.manifest.defaultProject)) throw new Error(`Workspace default project '${workspace.manifest.defaultProject}' does not exist`);
  return projects;
}

export async function resolveProjectDirectory(inputDir: string, projectId?: string): Promise<string> {
  const root = resolve(inputDir);
  const hasProject = await pathExists(join(root, PROJECT_MANIFEST));
  const hasWorkspace = await pathExists(join(root, WORKSPACE_MANIFEST));
  if (hasProject && hasWorkspace) throw new Error(`Directory cannot be both an INM project and workspace: ${root}`);
  if (hasProject) {
    if (projectId) throw new Error(`--project cannot be used when the input path is already a project: ${root}`);
    return root;
  }
  if (!hasWorkspace) throw new Error(`Not an INM project or workspace: ${root}`);
  const workspace = await loadWorkspace(root);
  const selected = projectId ?? workspace.manifest.defaultProject;
  if (!selected) throw new Error(`Workspace '${workspace.manifest.name}' has no default project; pass --project <id>`);
  const projects = await listWorkspaceProjects(root);
  const project = projects.find((item) => item.id === selected);
  if (!project) throw new Error(`Unknown workspace project '${selected}'. Available: ${projects.map((item) => item.id).join(", ") || "none"}`);
  return project.path;
}

export function defaultWorkspaceName(directory: string): string { return basename(resolve(directory)) || "INM Workspace"; }
